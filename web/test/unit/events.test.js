import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { start } from './helpers.js';

const ev = (o = {}) => ({ event_id: randomUUID(), type: 'product_viewed', ts: new Date().toISOString(), session_id: randomUUID(), product_id: 'FS-0001', ...o });
const post = (ctx, body, type = 'application/json') => fetch(`${ctx.base}/api/events`, { method: 'POST', headers: { 'Content-Type': type }, body: JSON.stringify(body) });

test('un lot valide est stocké, même envoyé en text/plain comme le fait sendBeacon', async (t) => {
  const ctx = await start(); t.after(ctx.stop);
  const e = ev();
  const r = await post(ctx, { events: [e] }, 'text/plain;charset=UTF-8');
  assert.equal(r.status, 202);
  assert.deepEqual(await r.json(), { ok: true, accepted: 1, duplicates: 0, rejected: 0 });
  const lines = readFileSync(join(ctx.dir, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].event_id, e.event_id);
  assert.ok(lines[0].received_at);
});

test('un lot renvoyé est dédupliqué par event_id', async (t) => {
  const ctx = await start(); t.after(ctx.stop);
  const body = { events: [ev(), ev()] };
  await post(ctx, body);
  const r = await (await post(ctx, body)).json();
  assert.deepEqual([r.accepted, r.duplicates], [0, 2]);
});

test('événements invalides rejetés avec 400', async (t) => {
  const ctx = await start(); t.after(ctx.stop);
  for (const bad of [
    { events: [] },
    { events: [ev({ type: 'hack' })] },
    { events: [ev({ ts: 'hier' })] },
    { events: [ev({ product_id: 'FS-9999' })] },
    { events: [{ ...ev(), email: 'a@b.c' }] },
    { nope: 1 },
  ]) assert.equal((await post(ctx, bad)).status, 400, JSON.stringify(bad).slice(0, 60));
  const r = await fetch(`${ctx.base}/api/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{pas du json' });
  assert.equal(r.status, 400);
});

test('le store relit son fichier au redémarrage (pas de doublon après restart)', async (t) => {
  const ctx = await start(); t.after(ctx.stop);
  const body = { events: [ev()] };
  await post(ctx, body);
  const { EventStore } = await import('../../src/events.js');
  const again = new EventStore(join(ctx.dir, 'events.jsonl'));
  assert.equal(again.add(body).duplicates, 1);
});

test('un produit inconnu n\'écarte que son événement et ne bloque pas un renvoi', async (t) => {
  const ctx = await start(); t.after(ctx.stop);
  const good = ev(), bad = ev({ product_id: 'FS-9999' });
  const r = await (await post(ctx, { events: [good, bad] })).json();
  assert.deepEqual([r.accepted, r.rejected], [1, 1]);
  const again = await (await post(ctx, { events: [good] })).json();
  assert.equal(again.duplicates, 1);
});

test('un doublon dans le même lot n\'est écrit qu\'une fois', async (t) => {
  const ctx = await start(); t.after(ctx.stop);
  const e = ev();
  const r = await (await post(ctx, { events: [e, e] })).json();
  assert.deepEqual([r.accepted, r.duplicates], [1, 1]);
});
