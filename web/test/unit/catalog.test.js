import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadCatalog, queryCatalog } from '../../src/catalog.js';

const products = loadCatalog(fileURLToPath(new URL('../../data/flowshopper_catalog.csv', import.meta.url)));

test('le catalogue contient 896 produits aux champs typés', () => {
  assert.equal(products.length, 896);
  assert.equal(typeof products[0].price_bells, 'number');
  assert.match(products[0].id, /^FS-\d{4}$/);
  assert.equal(new Set(products.map((p) => p.id)).size, 896);
});

test('filtre par catégorie et par texte, insensible à la casse', () => {
  const pets = queryCatalog(products, { category: 'pet', limit: 100 });
  assert.equal(pets.total, 30);
  assert.ok(pets.items.every((p) => p.category === 'Pet'));
  assert.ok(queryCatalog(products, { q: 'BAGUETTE' }).total >= 1);
});

test('pagination bornée et entrées invalides tolérées', () => {
  assert.equal(queryCatalog(products, { limit: 100000 }).items.length, 100);
  assert.equal(queryCatalog(products, { limit: 'abc', offset: '-5' }).offset, 0);
  assert.equal(queryCatalog(products, { q: 'zzzz-introuvable' }).total, 0);
});
