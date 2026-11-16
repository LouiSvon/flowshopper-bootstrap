import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

/** Schéma d'un événement. Aucune donnée personnelle : session_id est un identifiant aléatoire anonyme. */
export const eventSchema = {
  $id: 'https://flowshopper.local/schemas/event.json',
  type: 'object',
  required: ['event_id', 'type', 'ts', 'session_id'],
  additionalProperties: false,
  properties: {
    event_id: { type: 'string', format: 'uuid' },
    type: { enum: ['product_viewed', 'add_to_cart', 'remove_from_cart', 'checkout_started'] },
    ts: { type: 'string', format: 'date-time' },
    session_id: { type: 'string', format: 'uuid' },
    product_id: { type: 'string', pattern: '^FS-[0-9]{4}$' },
    props: { type: 'object', maxProperties: 10 },
  },
};

export const batchSchema = {
  type: 'object',
  required: ['events'],
  additionalProperties: false,
  properties: { events: { type: 'array', minItems: 1, maxItems: 100, items: eventSchema } },
};

const ajv = new Ajv2020({ allErrors: false });
addFormats(ajv);
const validateBatch = ajv.compile(batchSchema);

/** Stockage JSON Lines, idempotent : un event_id déjà reçu est ignoré (le client peut renvoyer un lot). */
export class EventStore {
  constructor(file) {
    this.file = file;
    this.seen = new Set();
    mkdirSync(dirname(file), { recursive: true });
    if (existsSync(file)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line) continue;
        try {
          this.seen.add(JSON.parse(line).event_id);
        } catch {
          /* ligne tronquée : ignorée */
        }
      }
    }
  }

  add(body, knownProductIds) {
    if (!validateBatch(body)) {
      const e = validateBatch.errors[0];
      return { ok: false, error: `${e.instancePath || '/'} ${e.message}` };
    }
    const fresh = [];
    for (const ev of body.events) {
      if (ev.product_id && knownProductIds && !knownProductIds.has(ev.product_id)) {
        return { ok: false, error: `unknown product_id ${ev.product_id}` };
      }
      if (this.seen.has(ev.event_id)) continue;
      this.seen.add(ev.event_id);
      fresh.push(ev);
    }
    if (fresh.length) {
      const received_at = new Date().toISOString();
      appendFileSync(this.file, fresh.map((e) => JSON.stringify({ ...e, received_at })).join('\n') + '\n');
    }
    return { ok: true, accepted: fresh.length, duplicates: body.events.length - fresh.length };
  }
}
