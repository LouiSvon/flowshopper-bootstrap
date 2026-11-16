import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createCheckoutSession } from '../../src/payments.js';
import { start, signedWebhook, paidEvent } from './helpers.js';

const json = (ctx, path, body) => fetch(`${ctx.base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const webhook = (ctx, { payload, header }) => fetch(`${ctx.base}/webhooks/stripe`, { method: 'POST', headers: { 'stripe-signature': header, 'Content-Type': 'application/json' }, body: payload });

async function subscribe(ctx, orderId) {
  const ws = new WebSocket(`${ctx.base.replace('http', 'ws')}/ws?order=${orderId}`);
  const msgs = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d)));
  await once(ws, 'open');
  while (!msgs.length) await new Promise((r) => setTimeout(r, 10)); // attend le message "subscribed"
  return { ws, msgs };
}

const waitFor = async (fn) => { for (let i = 0; i < 100; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 20)); } throw new Error('timeout'); };

test('checkout refuse sans clé Stripe configurée', async (t) => {
  const ctx = await start(); t.after(ctx.stop);
  const r = await json(ctx, '/api/checkout', { items: [{ product_id: 'FS-0001', quantity: 1 }] });
  assert.equal(r.status, 503);
});

test('checkout refuse une clé qui n\'est pas une clé de test', async (t) => {
  const ctx = await start({ stripeSecretKey: 'sk_live_xxx' }); t.after(ctx.stop);
  const r = await json(ctx, '/api/checkout', { items: [{ product_id: 'FS-0001', quantity: 1 }] });
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /non-test/);
});

test('création de commande : prix serveur, validations', async (t) => {
  const ctx = await start(); t.after(ctx.stop);
  const p = ctx.products[0];
  const o = ctx.orders.create([{ product_id: p.id, quantity: 3, unit_price_bells: 1 }], new Map(ctx.products.map((x) => [x.id, x])));
  assert.equal(o.total_bells, p.price_bells * 3); // le prix envoyé par le client est ignoré
  assert.equal(o.status, 'pending');
  const byId = new Map(ctx.products.map((x) => [x.id, x]));
  for (const bad of [[], null, [{ product_id: 'FS-9999', quantity: 1 }], [{ product_id: p.id, quantity: 0 }], [{ product_id: p.id, quantity: 1.5 }], [{ product_id: p.id, quantity: 999 }]])
    assert.throws(() => ctx.orders.create(bad, byId), (e) => e.status >= 400);
});

test('webhook signé : confirme la commande et la diffuse en direct à deux pages ouvertes', async (t) => {
  const ctx = await start(); t.after(ctx.stop);
  const byId = new Map(ctx.products.map((x) => [x.id, x]));
  const order = ctx.orders.create([{ product_id: 'FS-0001', quantity: 1 }], byId);
  const a = await subscribe(ctx, order.id), b = await subscribe(ctx, order.id);
  const other = await subscribe(ctx, 'autre-commande');
  assert.equal((await webhook(ctx, signedWebhook(paidEvent(order.id)))).status, 200);
  await waitFor(() => a.msgs.length === 2 && b.msgs.length === 2);
  assert.deepEqual(a.msgs[1], { type: 'order.confirmed', order_id: order.id, status: 'paid', paid_at: ctx.orders.get(order.id).paid_at });
  assert.equal(ctx.orders.get(order.id).status, 'paid');
  assert.equal(other.msgs.length, 1, 'une autre commande ne reçoit rien');
  [a, b, other].forEach((c) => c.ws.close());
});

test('webhook : mauvaise signature, mauvais secret et corps altéré rejetés, commande inchangée', async (t) => {
  const ctx = await start(); t.after(ctx.stop);
  const order = ctx.orders.create([{ product_id: 'FS-0001', quantity: 1 }], new Map(ctx.products.map((x) => [x.id, x])));
  const good = signedWebhook(paidEvent(order.id));
  assert.equal((await webhook(ctx, { payload: good.payload, header: 't=1,v1=deadbeef' })).status, 400);
  assert.equal((await webhook(ctx, signedWebhook(paidEvent(order.id), 'whsec_autre'))).status, 400);
  assert.equal((await webhook(ctx, { payload: good.payload.replace('paid', 'pAid'), header: good.header })).status, 400);
  assert.equal((await fetch(`${ctx.base}/webhooks/stripe`, { method: 'POST', body: good.payload })).status, 400);
  assert.equal(ctx.orders.get(order.id).status, 'pending');
});

test('webhook : idempotent, et ignore un paiement non abouti', async (t) => {
  const ctx = await start(); t.after(ctx.stop);
  const order = ctx.orders.create([{ product_id: 'FS-0001', quantity: 1 }], new Map(ctx.products.map((x) => [x.id, x])));
  await webhook(ctx, signedWebhook(paidEvent(order.id, 'evt_unpaid', 'unpaid')));
  assert.equal(ctx.orders.get(order.id).status, 'pending');
  await webhook(ctx, signedWebhook(paidEvent(order.id, 'evt_a')));
  const paidAt = ctx.orders.get(order.id).paid_at;
  assert.equal((await webhook(ctx, signedWebhook(paidEvent(order.id, 'evt_a')))).status, 200);
  await webhook(ctx, signedWebhook(paidEvent(order.id, 'evt_b')));
  assert.equal(ctx.orders.get(order.id).paid_at, paidAt);
  const r = await fetch(`${ctx.base}/api/orders/${order.id}`);
  assert.equal((await r.json()).status, 'paid');
  assert.equal((await fetch(`${ctx.base}/api/orders/inconnu`)).status, 404);
});

test('webhook sans secret configuré : 503', async (t) => {
  const ctx = await start({ webhookSecret: undefined }); t.after(ctx.stop);
  assert.equal((await webhook(ctx, signedWebhook(paidEvent('x')))).status, 503);
});

test('upgrade WebSocket invalide refusé', async (t) => {
  const ctx = await start(); t.after(ctx.stop);
  const ws = new WebSocket(`${ctx.base.replace('http', 'ws')}/ws`);
  const [err] = await once(ws, 'error');
  assert.ok(err);
});

test('API catalogue et fiche produit', async (t) => {
  const ctx = await start(); t.after(ctx.stop);
  const list = await (await fetch(`${ctx.base}/api/catalog?limit=5`)).json();
  assert.equal(list.items.length, 5);
  assert.ok(list.categories.includes('Food'));
  assert.equal((await fetch(`${ctx.base}/api/catalog/FS-0001`)).status, 200);
  assert.equal((await fetch(`${ctx.base}/api/catalog/nope`)).status, 404);
});

test('session Stripe : montants issus de la commande, order_id en métadonnée, URLs de retour', async () => {
  let sent;
  const stripe = { checkout: { sessions: { create: async (p) => { sent = p; return { url: 'https://checkout.stripe.test/x' }; } } } };
  const order = { id: 'o-1', items: [{ name: 'Baguette', unit_price_bells: 173, quantity: 2 }] };
  const s = await createCheckoutSession(stripe, order, 'http://localhost:3000');
  assert.equal(s.url, 'https://checkout.stripe.test/x');
  assert.equal(sent.mode, 'payment');
  assert.equal(sent.metadata.order_id, 'o-1');
  assert.deepEqual(sent.line_items[0], { quantity: 2, price_data: { currency: 'eur', unit_amount: 173, product_data: { name: 'Baguette' } } });
  assert.match(sent.success_url, /order\.html\?id=o-1$/);
});
