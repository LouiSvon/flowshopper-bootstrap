import { randomUUID } from 'node:crypto';

/** Prix en "bells" ; en mode test Stripe, 1 bell = 1 centime d'euro (décision documentée dans docs/decisions.md). */
export const BELLS_TO_CENTS = 1;

const MAX_ORDERS = 10000; // borne mémoire : les commandes ne sont pas persistées (voir docs/decisions.md D11)

export class OrderStore {
  constructor() {
    this.orders = new Map();
    this.processedEvents = new Set();
  }

  /** Les prix viennent du catalogue serveur, jamais du client. */
  create(lines, catalogById) {
    if (this.orders.size >= MAX_ORDERS) throw httpError(503, 'too many orders in memory');
    if (!Array.isArray(lines) || lines.length === 0 || lines.length > 50) throw httpError(400, 'cart must contain 1 to 50 lines');
    const items = lines.map((l) => {
      const p = catalogById.get(l?.product_id);
      const qty = Number(l?.quantity);
      if (!p) throw httpError(400, `unknown product ${l?.product_id}`);
      if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw httpError(400, 'quantity must be an integer between 1 and 20');
      if (p.stock !== null && qty > p.stock) throw httpError(409, `not enough stock for ${p.id}`);
      return { product_id: p.id, name: p.name, unit_price_bells: p.price_bells, quantity: qty };
    });
    const total_bells = items.reduce((s, i) => s + i.unit_price_bells * i.quantity, 0);
    const order = { id: randomUUID(), status: 'pending', items, total_bells, created_at: new Date().toISOString() };
    this.orders.set(order.id, order);
    return order;
  }

  get(id) {
    return this.orders.get(id);
  }

  delete(id) {
    this.orders.delete(id);
  }

  /** Idempotent : Stripe peut livrer plusieurs fois le même événement. */
  markPaid(orderId, stripeEventId) {
    const order = this.orders.get(orderId);
    if (!order) return { changed: false, order: undefined, unknown: true }; // événement NON consommé : Stripe relivrera
    if (this.processedEvents.has(stripeEventId)) return { changed: false, order };
    this.processedEvents.add(stripeEventId);
    if (order.status === 'paid') return { changed: false, order };
    order.status = 'paid';
    order.paid_at = new Date().toISOString();
    return { changed: true, order };
  }
}

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

export async function createCheckoutSession(stripe, order, baseUrl) {
  return stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: order.items.map((i) => ({
      quantity: i.quantity,
      price_data: { currency: 'eur', unit_amount: i.unit_price_bells * BELLS_TO_CENTS, product_data: { name: i.name } },
    })),
    metadata: { order_id: order.id },
    client_reference_id: order.id,
    success_url: `${baseUrl}/order.html?id=${order.id}`,
    cancel_url: `${baseUrl}/?cancelled=1`,
  });
}
