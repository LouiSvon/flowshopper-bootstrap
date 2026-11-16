import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import Stripe from 'stripe';
import { createApp } from '../../src/app.js';

export const SECRET = 'whsec_test_secret';

export async function start(opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fs-test-'));
  const ctx = createApp({ eventsFile: join(dir, 'events.jsonl'), webhookSecret: SECRET, stripeSecretKey: undefined, ...opts });
  ctx.server.listen(0);
  await once(ctx.server, 'listening');
  ctx.base = `http://127.0.0.1:${ctx.server.address().port}`;
  ctx.dir = dir;
  ctx.stop = async () => { ctx.realtime.close(); ctx.server.close(); };
  return ctx;
}

export function signedWebhook(payloadObj, secret = SECRET) {
  const payload = JSON.stringify(payloadObj);
  const header = new Stripe('sk_test_unused').webhooks.generateTestHeaderString({ payload, secret });
  return { payload, header };
}

export const paidEvent = (orderId, id = 'evt_1', status = 'paid') => ({
  id, object: 'event', type: 'checkout.session.completed',
  data: { object: { object: 'checkout.session', payment_status: status, metadata: { order_id: orderId } } },
});
