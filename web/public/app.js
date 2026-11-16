import { track, flush } from './tracker.js';

const $ = (id) => document.getElementById(id);
const state = { offset: 0, total: 0, cart: new Map(), current: null };
const PAGE = 24;

const productsEl = $('products');
const statusEl = $('status');

async function load(reset) {
  if (reset) { state.offset = 0; productsEl.replaceChildren(); }
  const params = new URLSearchParams({ q: $('q').value, category: $('category').value, limit: PAGE, offset: state.offset });
  statusEl.textContent = 'Loading...';
  try {
    const r = await fetch(`/api/catalog?${params}`);
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    if ($('category').options.length === 1) for (const c of data.categories) $('category').add(new Option(c, c));
    state.total = data.total;
    for (const p of data.items) productsEl.append(card(p));
    state.offset += data.items.length;
    $('more').hidden = state.offset >= state.total;
    statusEl.textContent = `${state.total} products found, ${state.offset} shown.`;
  } catch {
    statusEl.textContent = 'The catalog could not be loaded. Please try again.';
  }
}

function card(p) {
  const li = document.createElement('li');
  li.className = 'card';
  const h = document.createElement('h2'); h.textContent = p.name;
  const meta = document.createElement('p'); meta.className = 'meta'; meta.textContent = `${p.brand} - ${p.category} / ${p.subcategory}`;
  const price = document.createElement('p'); price.textContent = `${p.price_bells} bells`;
  const view = document.createElement('button'); view.type = 'button'; view.textContent = 'View'; view.setAttribute('aria-label', `View ${p.name}`);
  view.addEventListener('click', () => openDetail(p));
  li.append(h, meta, price, view);
  return li;
}

function openDetail(p) {
  state.current = p;
  $('detail-title').textContent = p.name;
  $('detail-body').textContent = p.description;
  $('detail-price').textContent = p.price_bells;
  $('detail').showModal();
  track('product_viewed', p.id);
}

function addToCart(p) {
  state.cart.set(p.id, { product: p, quantity: (state.cart.get(p.id)?.quantity ?? 0) + 1 });
  track('add_to_cart', p.id);
  renderCart();
}

function renderCart() {
  const ul = $('cart-lines'); ul.replaceChildren();
  let total = 0;
  for (const { product, quantity } of state.cart.values()) {
    total += product.price_bells * quantity;
    const li = document.createElement('li'); li.textContent = `${quantity} x ${product.name}`; ul.append(li);
  }
  $('cart-total').textContent = total;
  $('checkout').disabled = state.cart.size === 0;
}

async function checkout() {
  const msg = $('checkout-msg');
  msg.textContent = 'Preparing your payment...';
  track('checkout_started');
  flush();
  try {
    const items = [...state.cart.values()].map(({ product, quantity }) => ({ product_id: product.id, quantity }));
    const r = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    location.assign(data.checkout_url);
  } catch (e) {
    msg.textContent = `Payment unavailable: ${e.message}`;
  }
}

$('detail-add').addEventListener('click', () => { addToCart(state.current); $('detail').close(); });
$('detail-close').addEventListener('click', () => $('detail').close());
$('more').addEventListener('click', () => load(false));
$('checkout').addEventListener('click', checkout);
$('filters').addEventListener('submit', (e) => e.preventDefault());
let timer;
$('q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => load(true), 250); });
$('category').addEventListener('change', () => load(true));
load(true);
