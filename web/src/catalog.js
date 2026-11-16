import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';

const NUMERIC = ['price_bells', 'unit_price_bells', 'stock'];

export function loadCatalog(path) {
  const rows = parse(readFileSync(path, 'utf8'), { columns: true, skip_empty_lines: true });
  return rows.map((r) => {
    const p = { ...r };
    for (const k of NUMERIC) p[k] = r[k] === '' ? null : Number(r[k]);
    return p;
  });
}

/** Filtre + pagination. `limit` borné à 100 pour ne jamais renvoyer tout le catalogue d'un coup. */
export function queryCatalog(products, { q = '', category = '', limit = 24, offset = 0 } = {}) {
  const needle = String(q).trim().toLowerCase();
  const cat = String(category).trim().toLowerCase();
  const filtered = products.filter(
    (p) =>
      (!cat || p.category.toLowerCase() === cat) &&
      (!needle || p.name.toLowerCase().includes(needle) || p.brand.toLowerCase().includes(needle)),
  );
  const lim = Math.min(Math.max(Number.parseInt(limit, 10) || 24, 1), 100);
  const off = Math.max(Number.parseInt(offset, 10) || 0, 0);
  return { total: filtered.length, limit: lim, offset: off, items: filtered.slice(off, off + lim) };
}
