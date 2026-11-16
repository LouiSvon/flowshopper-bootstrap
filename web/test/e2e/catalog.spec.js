import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, existsSync } from 'node:fs';
const EVENTS_FILE = './data/e2e-events.jsonl'; // même valeur que playwright.config.js

const readEvents = () => (existsSync(EVENTS_FILE) ? readFileSync(EVENTS_FILE, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []);

test('le catalogue s\'affiche sur un écran de téléphone, sans défilement horizontal', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Flowshopper', level: 1 })).toBeVisible();
  await expect(page.locator('#products > li')).toHaveCount(24);
  await expect(page.locator('#status')).toContainText('896 products found');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  expect(page.viewportSize().width).toBeLessThan(500);
});

test('la recherche filtre et "Show more" charge la suite', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Category').selectOption('Pet');
  await expect(page.locator('#status')).toContainText('30 products found, 24 shown');
  await page.getByRole('button', { name: 'Show more products' }).click();
  await expect(page.locator('#products > li')).toHaveCount(30);
  await expect(page.getByRole('button', { name: 'Show more products' })).toBeHidden();
});

test('voir un produit puis fermer la page enregistre quand même l\'événement', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^View / }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const session = await page.evaluate(() => sessionStorage.getItem('fs_session'));
  await page.close({ runBeforeUnload: true }); // fermeture immédiate : avant le flush périodique de 5 s
  await expect.poll(() => readEvents().some((e) => e.session_id === session && e.type === 'product_viewed' && /^FS-\d{4}$/.test(e.product_id)), { timeout: 5000 }).toBe(true);
});

test('accessibilité (axe) : catalogue et fiche produit ouverte', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#products > li')).toHaveCount(24);
  let r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations, JSON.stringify(r.violations.map((v) => [v.id, v.nodes.length]))).toEqual([]);
  await page.getByRole('button', { name: /^View / }).first().click();
  r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations, JSON.stringify(r.violations.map((v) => [v.id, v.nodes.length]))).toEqual([]);
});
