import express from 'express';
import Stripe from 'stripe';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadCatalog, queryCatalog } from './catalog.js';
import { EventStore } from './events.js';
import { OrderStore, createCheckoutSession, httpError } from './payments.js';
import { attachRealtime } from './realtime.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Fabrique l'application. Tout est injectable (chemins, clés) pour que les tests n'aient aucun état global.
 * Les secrets Stripe viennent de l'environnement, jamais du code.
 */
export function createApp({
  catalogPath = join(here, '../data/flowshopper_catalog.csv'),
  eventsFile = process.env.EVENTS_FILE || join(here, '../data/events.jsonl'),
  stripeSecretKey = process.env.STRIPE_SECRET_KEY,
  webhookSecret = process.env.STRIPE_WEBHOOK_SECRET,
  baseUrl = process.env.BASE_URL || 'http://localhost:3000',
} = {}) {
  const products = loadCatalog(catalogPath);
  const byId = new Map(products.map((p) => [p.id, p]));
  const categories = [...new Set(products.map((p) => p.category))].sort();
  const events = new EventStore(eventsFile);
  const orders = new OrderStore();
  const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
  // Instance utilisée uniquement pour vérifier les signatures (aucun appel réseau, aucune clé API requise).
  const verifier = new Stripe(stripeSecretKey || 'sk_test_unused');

  const app = express();
  app.disable('x-powered-by');
  const server = createServer(app);
  const realtime = attachRealtime(server);

  // IMPORTANT : le webhook lit le corps BRUT (la signature porte sur les octets exacts), avant express.json().
  app.post('/webhooks/stripe', express.raw({ type: '*/*', limit: '256kb' }), (req, res) => {
    if (!webhookSecret) return res.status(503).json({ error: 'webhook secret not configured' });
    let event;
    try {
      event = verifier.webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
    } catch {
      return res.status(400).json({ error: 'invalid signature' });
    }
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      if (session.payment_status === 'paid') {
        const { changed, order, unknown } = orders.markPaid(session.metadata?.order_id, event.id);
        if (unknown) {
          console.error(`webhook ${event.id}: unknown order ${session.metadata?.order_id}`);
          return res.status(404).json({ error: 'unknown order' });
        }
        if (changed) realtime.publish(order.id, { type: 'order.confirmed', order_id: order.id, status: 'paid', paid_at: order.paid_at });
      }
    }
    res.json({ received: true });
  });

  // sendBeacon envoie un Blob ; on accepte donc le JSON quel que soit le Content-Type déclaré.
  app.use(express.json({ type: () => true, limit: '256kb' }));

  app.get('/api/catalog', (req, res) => res.json({ categories, ...queryCatalog(products, req.query) }));

  app.get('/api/catalog/:id', (req, res) => {
    const p = byId.get(req.params.id);
    return p ? res.json(p) : res.status(404).json({ error: 'product not found' });
  });

  app.post('/api/events', (req, res) => {
    const r = events.add(req.body, new Set(byId.keys()));
    return r.ok ? res.status(202).json(r) : res.status(400).json({ error: r.error });
  });

  app.post('/api/checkout', async (req, res, next) => {
    try {
      if (!stripe) throw httpError(503, 'payments not configured (set STRIPE_SECRET_KEY, test mode only)');
      if (!stripeSecretKey.startsWith('sk_test_')) throw httpError(503, 'refusing to run with a non-test Stripe key');
      const order = orders.create(req.body?.items, byId);
      let session;
      try {
        session = await createCheckoutSession(stripe, order, baseUrl);
      } catch (e) {
        orders.delete(order.id); // pas de commande orpheline si Stripe échoue
        throw e;
      }
      res.status(201).json({ order_id: order.id, checkout_url: session.url });
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/orders/:id', (req, res) => {
    const o = orders.get(req.params.id);
    return o ? res.json(o) : res.status(404).json({ error: 'order not found' });
  });

  app.use(express.static(join(here, '../public')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status && err.status < 600 ? err.status : err.type === 'entity.parse.failed' ? 400 : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'internal error' : err.message });
  });

  return { app, server, orders, events, realtime, products };
}
