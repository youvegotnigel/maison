import { api, money } from './api.js';

interface User {
  id: number;
  email: string;
  name: string;
  role: 'buyer' | 'seller';
}

interface Product {
  id: number;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  effectiveCents: number;
  onSale: boolean;
  inStock: boolean;
  stock: number;
  image: string | null;
  sellerName: string | null;
}

interface CartLine {
  itemId: number;
  productId: number;
  name: string;
  image: string | null;
  unitCents: number;
  quantity: number;
  lineCents: number;
  stock: number;
}

interface DisplayCart {
  cartId?: number;
  items: CartLine[];
  count: number;
  subtotalCents: number;
}

interface OrderItem {
  name: string;
  quantity: number;
  unitCents: number;
}

interface Order {
  id: number;
  reference: string;
  status: string;
  totalCents: number;
  createdAt: string;
  items: OrderItem[];
}

interface AppState {
  user: User | null;
  cart: DisplayCart;
  categories: string[];
}

declare global {
  interface Window {
    __MAISON__: AppState;
    __navAbort?: AbortController;
    __logout: () => Promise<void>;
  }
}

// ============================================================
//  Maison SPA — vanilla JS, hash-routed.
//  Automation-first: every interactive element carries a
//  stable data-testid. App state is also mirrored on
//  window.__MAISON__ for test introspection.
// ============================================================

const state: AppState = {
  user: null,
  cart: { items: [], count: 0, subtotalCents: 0 },
  categories: [],
};
window.__MAISON__ = state;

const app = document.getElementById('app')!;
const el = (html: string): Element => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild!;
};
const escMap: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, c => escMap[c]);

// ---------- Toast / alert ----------
function flash(message: string, type = 'success'): void {
  const host = document.getElementById('flash')!;
  host.innerHTML = `<div class="alert alert--${type}" role="status" data-testid="flash-${type}">${esc(message)}</div>`;
  setTimeout(() => { if (host.firstChild) host.innerHTML = ''; }, 4000);
}

// ---------- Session ----------
async function refreshSession(): Promise<void> {
  try { const r = await api.me() as { user: User }; state.user = r.user; }
  catch { state.user = null; }
}
async function refreshCart(): Promise<void> {
  if (!state.user || state.user.role !== 'buyer') { state.cart = { items: [], count: 0, subtotalCents: 0 }; renderHeader(); return; }
  try { const r = await api.getCart() as { cart: DisplayCart }; state.cart = r.cart; } catch { /* ignore */ }
  renderHeader();
}

// ============================================================
//  Header
// ============================================================
function renderHeader(): void {
  const header = document.getElementById('masthead')!;
  const u = state.user;
  const cartCount = state.cart.count || 0;
  header.innerHTML = `
    <div class="container">
      <div class="brand" data-testid="brand">MAISON<small>MAISON DE LUXE</small></div>
      <button class="nav-toggle" data-testid="nav-toggle" aria-controls="primary-nav" aria-expanded="false" aria-label="Open navigation">
        <span></span><span></span><span></span>
      </button>
      <nav class="nav" id="primary-nav" data-testid="nav-mobile-menu" aria-label="Primary">
        <a href="#/" data-testid="nav-shop">Shop</a>
        ${u && u.role === 'seller' ? `<a href="#/seller" data-testid="nav-seller">Atelier</a>` : ''}
        ${u && u.role === 'buyer' ? `<a href="#/orders" data-testid="nav-orders" class="hide-sm">Orders</a>` : ''}
        ${u && u.role === 'buyer' ? `
          <a href="#/cart" class="cart-pill" data-testid="nav-cart" aria-label="Cart, ${cartCount} items">
            Cart <span class="cart-count" data-testid="cart-count">${cartCount}</span>
          </a>` : ''}
        ${u
          ? `<span class="tiny" data-testid="current-user" data-role="${esc(u.role)}">${esc(u.name)}</span>
             <a href="#" data-testid="logout-link">Logout</a>`
          : `<a href="#/login" data-testid="nav-login">Sign In</a>`}
      </nav>
    </div>`;
  header.querySelector<HTMLElement>('[data-testid="brand"]')!.onclick = () => { location.hash = '#/'; };

  const toggle = header.querySelector<HTMLElement>('[data-testid="nav-toggle"]')!;
  const nav = header.querySelector<HTMLElement>('[data-testid="nav-mobile-menu"]')!;

  function closeNav(): void {
    nav.classList.remove('nav--open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open navigation');
  }

  toggle.onclick = () => {
    const isOpen = nav.classList.toggle('nav--open');
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  };

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeNav);
  });

  if (window.__navAbort) window.__navAbort.abort();
  window.__navAbort = new AbortController();
  const { signal } = window.__navAbort;

  document.addEventListener('click', (e) => {
    if (nav.classList.contains('nav--open') && !nav.contains(e.target as Node) && !toggle.contains(e.target as Node)) closeNav();
  }, { signal });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('nav--open')) closeNav();
  }, { signal });

  const logoutLink = header.querySelector<HTMLElement>('[data-testid="logout-link"]');
  if (logoutLink) logoutLink.onclick = (e) => { e.preventDefault(); window.__logout(); };
}

window.__logout = async (): Promise<void> => {
  try { await api.logout(); } catch { /* ignore */ }
  state.user = null;
  state.cart = { items: [], count: 0, subtotalCents: 0 };
  renderHeader();
  flash('You have been signed out.');
  if (location.hash !== '#/') {
    location.hash = '#/';
  } else {
    router();
  }
};

// ============================================================
//  Pages
// ============================================================
function priceBlock(p: Product): string {
  if (p.onSale) {
    return `<span class="price-now" data-testid="price">${money(p.effectiveCents)}</span>
            <span class="price-was" data-testid="price-was">${money(p.priceCents)}</span>`;
  }
  return `<span class="price-now" data-testid="price">${money(p.priceCents)}</span>`;
}

function productCard(p: Product): string {
  return `
    <article class="card reveal" data-testid="product-card" data-product-id="${p.id}" data-name="${esc(p.name)}">
      <a href="#/product/${p.id}" class="card__media" aria-label="${esc(p.name)}">
        <img src="${p.image}" alt="${esc(p.name)}" loading="lazy" />
        ${p.onSale ? `<span class="badge" data-testid="sale-badge">Sale</span>` : ''}
        ${!p.inStock ? `<span class="badge badge--out" data-testid="soldout-badge">Sold Out</span>` : ''}
      </a>
      <div class="card__body">
        <span class="card__cat">${esc(p.category)}</span>
        <a href="#/product/${p.id}"><h3 class="card__name" data-testid="product-name">${esc(p.name)}</h3></a>
        <div class="card__price">${priceBlock(p)}</div>
      </div>
    </article>`;
}

async function pageShop(): Promise<void> {
  const params = parseQuery();
  app.innerHTML = `
    <section class="section reveal">
      <div class="hero" style="padding-top:40px">
        <p class="eyebrow">The Maison Collection</p>
        <h1>Quiet luxury, <em>considered</em> craft.</h1>
        <p>A curated atelier of leather, timepieces, and rare materials. Each piece numbered, each detail deliberate.</p>
      </div>
      <div class="hairline"></div>
      <form class="toolbar" data-testid="catalogue-toolbar">
        <input type="search" data-testid="search-input" placeholder="Search the collection…" value="${esc(params.q || '')}" aria-label="Search products" />
        <select data-testid="filter-category" aria-label="Filter by category">
          <option value="">All categories</option>
          ${state.categories.map(c => `<option value="${esc(c)}" ${params.category===c?'selected':''}>${esc(c)}</option>`).join('')}
        </select>
        <select data-testid="sort-select" aria-label="Sort products">
          <option value="">Newest</option>
          <option value="price_asc" ${params.sort==='price_asc'?'selected':''}>Price: Low to High</option>
          <option value="price_desc" ${params.sort==='price_desc'?'selected':''}>Price: High to Low</option>
          <option value="name" ${params.sort==='name'?'selected':''}>Name</option>
        </select>
        <button class="btn btn--sm" data-testid="search-submit" type="button">Apply</button>
      </form>
      <div id="catalogue" class="grid" data-testid="catalogue" aria-live="polite"></div>
    </section>`;

  const search = app.querySelector<HTMLInputElement>('[data-testid="search-input"]')!;
  const cat = app.querySelector<HTMLSelectElement>('[data-testid="filter-category"]')!;
  const sort = app.querySelector<HTMLSelectElement>('[data-testid="sort-select"]')!;
  const apply = () => {
    const q = new URLSearchParams();
    if (search.value) q.set('q', search.value);
    if (cat.value) q.set('category', cat.value);
    if (sort.value) q.set('sort', sort.value);
    location.hash = '#/?' + q.toString();
  };
  app.querySelector<HTMLElement>('[data-testid="search-submit"]')!.onclick = apply;
  search.addEventListener('keydown', e => { if (e.key === 'Enter') apply(); });
  cat.onchange = apply; sort.onchange = apply;

  const grid = document.getElementById('catalogue')!;
  grid.innerHTML = `<p class="muted" data-testid="loading">Loading the collection…</p>`;
  try {
    const r = await api.products({ q: params.q, category: params.category, sort: params.sort }) as { products: Product[] };
    if (!r.products.length) {
      grid.innerHTML = `<div class="empty" data-testid="no-results"><h3>Nothing found</h3><p>Try a different search or category.</p></div>`;
      return;
    }
    grid.innerHTML = r.products.map(productCard).join('');
    grid.style.animationDelay = '0';
  } catch (e) {
    grid.innerHTML = `<div class="empty" data-testid="error"><h3>Unable to load</h3><p>${esc((e as Error).message)}</p></div>`;
  }
}

async function pageProduct(id: string): Promise<void> {
  app.innerHTML = `<section class="section"><p class="muted" data-testid="loading">Loading…</p></section>`;
  let p: Product;
  try { const r = await api.product(id) as { product: Product }; p = r.product; }
  catch (e) {
    app.innerHTML = `<section class="section"><div class="empty" data-testid="error"><h3>Not found</h3><p>${esc((e as Error).message)}</p><a class="btn btn--ghost btn--sm" href="#/">Back to shop</a></div></section>`;
    return;
  }
  const isBuyer = state.user && state.user.role === 'buyer';
  app.innerHTML = `
    <section class="section reveal" data-testid="product-detail" data-product-id="${p.id}">
      <a href="#/" class="tiny" data-testid="back-link">&larr; Back to collection</a>
      <div class="pdp" style="margin-top:24px">
        <div class="pdp__media"><img src="${p.image}" alt="${esc(p.name)}" data-testid="product-image" /></div>
        <div>
          <span class="card__cat">${esc(p.category)}</span>
          <h1 data-testid="detail-name">${esc(p.name)}</h1>
          <div class="card__price">${priceBlock(p)}</div>
          <p class="desc" data-testid="detail-description">${esc(p.description)}</p>
          <p class="tiny" data-testid="stock-state">${p.inStock ? `In stock — ${p.stock} available` : 'Currently sold out'}</p>
          <p class="tiny">Sold by ${esc(p.sellerName || 'Maison')}</p>
          <div class="row" style="margin-top:28px">
            ${p.inStock ? `
              <div class="qty" data-testid="qty-control">
                <button type="button" data-testid="qty-decr" aria-label="Decrease quantity">&minus;</button>
                <input type="number" data-testid="qty-input" value="1" min="1" max="${p.stock}" aria-label="Quantity" />
                <button type="button" data-testid="qty-incr" aria-label="Increase quantity">+</button>
              </div>` : ''}
            ${p.inStock
              ? `<button class="btn btn--solid" data-testid="add-to-cart">Add to Cart</button>`
              : `<button class="btn" disabled data-testid="add-to-cart-disabled">Sold Out</button>`}
          </div>
          ${!isBuyer ? `<p class="tiny" data-testid="buyer-hint" style="margin-top:18px">Sign in as a buyer to purchase.</p>` : ''}
        </div>
      </div>
    </section>`;

  if (p.inStock) {
    const input = app.querySelector<HTMLInputElement>('[data-testid="qty-input"]')!;
    app.querySelector<HTMLElement>('[data-testid="qty-decr"]')!.onclick = () => {
      input.value = String(Math.max(1, (+input.value || 1) - 1));
    };
    app.querySelector<HTMLElement>('[data-testid="qty-incr"]')!.onclick = () => {
      input.value = String(Math.min(p.stock, (+input.value || 1) + 1));
    };
    app.querySelector<HTMLElement>('[data-testid="add-to-cart"]')!.onclick = async (e) => {
      if (!isBuyer) { flash('Please sign in as a buyer to add items.', 'error'); location.hash = '#/login'; return; }
      const btn = e.currentTarget as HTMLButtonElement; btn.disabled = true;
      try {
        await api.addToCart(p.id, +input.value || 1);
        await refreshCart();
        flash(`${p.name} added to your cart.`);
      } catch (err) {
        flash((err as Error).message, 'error');
      } finally { btn.disabled = false; }
    };
  }
}

async function pageLogin(): Promise<void> {
  app.innerHTML = `
    <section class="section reveal">
      <div class="page-head"><p class="tiny">Welcome back</p><h1>Sign In</h1></div>
      <form class="form" data-testid="login-form">
        <div id="login-alert"></div>
        <div class="field">
          <label for="login-email">Email</label>
          <input id="login-email" type="email" data-testid="login-email" autocomplete="email" required />
        </div>
        <div class="field">
          <label for="login-password">Password</label>
          <input id="login-password" type="password" data-testid="login-password" autocomplete="current-password" required />
        </div>
        <button class="btn btn--solid btn--block" data-testid="login-submit" type="submit">Sign In</button>
        <p class="muted" style="margin-top:20px;font-size:0.88rem">
          New here? <a href="#/register" data-testid="goto-register" style="color:var(--gold)">Create an account</a>
        </p>
        <p class="tiny" style="margin-top:24px" data-testid="demo-hint">
          Demo: buyer@maison.test / seller@maison.test — password Password123!
        </p>
      </form>
    </section>`;
  const form = app.querySelector<HTMLFormElement>('[data-testid="login-form"]')!;
  form.addEventListener('submit', e => e.preventDefault());
  form.querySelector<HTMLElement>('[data-testid="login-submit"]')!.onclick = async () => {
    const email = form.querySelector<HTMLInputElement>('[data-testid="login-email"]')!.value.trim();
    const password = form.querySelector<HTMLInputElement>('[data-testid="login-password"]')!.value;
    const alert = document.getElementById('login-alert')!;
    alert.innerHTML = '';
    try {
      const r = await api.login({ email, password }) as { user: User };
      state.user = r.user;
      renderHeader();
      await refreshCart();
      flash(`Welcome, ${r.user.name}.`);
      location.hash = r.user.role === 'seller' ? '#/seller' : '#/';
    } catch (e) {
      alert.innerHTML = `<div class="alert alert--error" data-testid="login-error" role="alert">${esc((e as Error).message)}</div>`;
    }
  };
}

async function pageRegister(): Promise<void> {
  let role = 'buyer';
  app.innerHTML = `
    <section class="section reveal">
      <div class="page-head"><p class="tiny">Join the Maison</p><h1>Create Account</h1></div>
      <form class="form" data-testid="register-form">
        <div id="register-alert"></div>
        <div class="field">
          <label>I want to</label>
          <div class="role-toggle" data-testid="role-toggle">
            <button type="button" data-testid="role-buyer" data-role="buyer" aria-pressed="true">Shop as Buyer</button>
            <button type="button" data-testid="role-seller" data-role="seller" aria-pressed="false">Sell as Atelier</button>
          </div>
        </div>
        <div class="field"><label for="reg-name">Full name</label><input id="reg-name" data-testid="register-name" required /></div>
        <div class="field"><label for="reg-email">Email</label><input id="reg-email" type="email" data-testid="register-email" autocomplete="email" required /></div>
        <div class="field"><label for="reg-password">Password</label><input id="reg-password" type="password" data-testid="register-password" autocomplete="new-password" required />
          <p class="tiny" style="margin-top:6px">At least 8 characters, including a letter and a number.</p></div>
        <button class="btn btn--solid btn--block" data-testid="register-submit" type="submit">Create Account</button>
        <p class="muted" style="margin-top:20px;font-size:0.88rem">Already have an account? <a href="#/login" data-testid="goto-login" style="color:var(--gold)">Sign in</a></p>
      </form>
    </section>`;
  const form = app.querySelector<HTMLFormElement>('[data-testid="register-form"]')!;
  form.addEventListener('submit', e => e.preventDefault());
  const bBuyer = form.querySelector<HTMLElement>('[data-testid="role-buyer"]')!;
  const bSeller = form.querySelector<HTMLElement>('[data-testid="role-seller"]')!;
  const setRole = (r: string): void => {
    role = r;
    bBuyer.setAttribute('aria-pressed', String(r === 'buyer'));
    bSeller.setAttribute('aria-pressed', String(r === 'seller'));
  };
  bBuyer.onclick = () => setRole('buyer');
  bSeller.onclick = () => setRole('seller');
  form.querySelector<HTMLElement>('[data-testid="register-submit"]')!.onclick = async () => {
    const name = form.querySelector<HTMLInputElement>('[data-testid="register-name"]')!.value.trim();
    const email = form.querySelector<HTMLInputElement>('[data-testid="register-email"]')!.value.trim();
    const password = form.querySelector<HTMLInputElement>('[data-testid="register-password"]')!.value;
    const alert = document.getElementById('register-alert')!;
    alert.innerHTML = '';
    try {
      const r = await api.register({ name, email, password, role }) as { user: User };
      state.user = r.user;
      renderHeader();
      await refreshCart();
      flash(`Welcome to Maison, ${r.user.name}.`);
      location.hash = r.user.role === 'seller' ? '#/seller' : '#/';
    } catch (e) {
      alert.innerHTML = `<div class="alert alert--error" data-testid="register-error" role="alert">${esc((e as Error).message)}</div>`;
    }
  };
}

async function pageCart(): Promise<void> {
  if (!state.user || state.user.role !== 'buyer') { location.hash = '#/login'; return; }
  await refreshCart();
  const c = state.cart;
  app.innerHTML = `
    <section class="section reveal">
      <div class="page-head"><p class="tiny">Your selection</p><h1>Shopping Cart</h1></div>
      ${c.items.length === 0
        ? `<div class="empty" data-testid="cart-empty"><h3>Your cart is empty</h3><p>Discover the collection.</p><a class="btn btn--ghost btn--sm" href="#/" style="margin-top:16px">Browse the shop</a></div>`
        : `<div class="cart-layout">
            <div data-testid="cart-lines">
              ${c.items.map(line => `
                <div class="cart-line" data-testid="cart-line" data-product-id="${line.productId}">
                  <img src="${line.image}" alt="${esc(line.name)}" />
                  <div><strong data-testid="line-name">${esc(line.name)}</strong><br><span class="tiny">${money(line.unitCents)} each</span></div>
                  <span class="muted" data-testid="line-qty">Qty ${line.quantity}</span>
                  <span class="price-now" data-testid="line-total">${money(line.lineCents)}</span>
                  <button class="btn btn--ghost btn--sm" data-testid="remove-item" data-item-id="${line.itemId}" aria-label="Remove ${esc(line.name)}">Remove</button>
                </div>`).join('')}
            </div>
            <aside class="cart-summary" data-testid="cart-summary">
              <div class="spread"><span class="muted">Subtotal</span><span data-testid="summary-subtotal">${money(c.subtotalCents)}</span></div>
              <div class="spread"><span class="muted">Shipping</span><span>Complimentary</span></div>
              <div class="spread total"><span>Total</span><span data-testid="summary-total">${money(c.subtotalCents)}</span></div>
              <button class="btn btn--solid btn--block" data-testid="checkout-button" style="margin-top:22px">Proceed to Checkout</button>
              <button class="btn btn--ghost btn--block btn--sm" data-testid="clear-cart" style="margin-top:10px">Empty Cart</button>
            </aside>
          </div>`}
    </section>`;
  if (c.items.length) {
    app.querySelectorAll<HTMLElement>('[data-testid="remove-item"]').forEach(btn => {
      btn.onclick = async () => { await api.removeCartItem(+(btn.dataset.itemId ?? '0')); await refreshCart(); pageCart(); };
    });
    app.querySelector<HTMLElement>('[data-testid="clear-cart"]')!.onclick = async () => { await api.clearCart(); await refreshCart(); pageCart(); flash('Cart emptied.'); };
    app.querySelector<HTMLElement>('[data-testid="checkout-button"]')!.onclick = () => { location.hash = '#/checkout'; };
  }
}

async function pageCheckout(): Promise<void> {
  if (!state.user || state.user.role !== 'buyer') { location.hash = '#/login'; return; }
  await refreshCart();
  if (!state.cart.items.length) { location.hash = '#/cart'; return; }
  const c = state.cart;
  app.innerHTML = `
    <section class="section reveal">
      <div class="page-head"><p class="tiny">Final details</p><h1>Checkout</h1></div>
      <div class="cart-layout">
        <form class="form" data-testid="checkout-form" style="max-width:none">
          <div id="checkout-alert"></div>
          <h3 style="margin-bottom:18px">Shipping</h3>
          <div class="field"><label for="ship-name">Full name</label><input id="ship-name" data-testid="ship-name" value="${esc(state.user!.name)}" required /></div>
          <div class="field"><label for="ship-address">Address</label><input id="ship-address" data-testid="ship-address" required /></div>
          <div class="row" style="gap:16px">
            <div class="field" style="flex:1"><label for="ship-city">City</label><input id="ship-city" data-testid="ship-city" required /></div>
            <div class="field" style="flex:1"><label for="ship-postal">Postal code</label><input id="ship-postal" data-testid="ship-postal" required /></div>
          </div>
          <h3 style="margin:14px 0 18px">Payment</h3>
          <p class="tiny" data-testid="payment-note" style="margin-bottom:16px">This is a demo. No real payment is processed — a mock card is used.</p>
          <div class="field"><label for="card">Card number (mock)</label><input id="card" data-testid="card-number" value="4242 4242 4242 4242" /></div>
          <button class="btn btn--solid btn--block" data-testid="place-order" type="submit">Place Order &mdash; ${money(c.subtotalCents)}</button>
        </form>
        <aside class="cart-summary" data-testid="checkout-summary">
          <p class="tiny" style="margin-bottom:14px">Order summary</p>
          ${c.items.map(l => `<div class="spread"><span class="muted">${esc(l.name)} ×${l.quantity}</span><span>${money(l.lineCents)}</span></div>`).join('')}
          <div class="spread total"><span>Total</span><span data-testid="checkout-total">${money(c.subtotalCents)}</span></div>
        </aside>
      </div>
    </section>`;
  app.querySelector<HTMLFormElement>('[data-testid="checkout-form"]')!.addEventListener('submit', e => e.preventDefault());
  app.querySelector<HTMLElement>('[data-testid="place-order"]')!.onclick = async (e) => {
    const btn = e.currentTarget as HTMLButtonElement; btn.disabled = true;
    const alert = document.getElementById('checkout-alert')!; alert.innerHTML = '';
    const shipping = {
      name: app.querySelector<HTMLInputElement>('[data-testid="ship-name"]')!.value.trim(),
      address: app.querySelector<HTMLInputElement>('[data-testid="ship-address"]')!.value.trim(),
      city: app.querySelector<HTMLInputElement>('[data-testid="ship-city"]')!.value.trim(),
      postalCode: app.querySelector<HTMLInputElement>('[data-testid="ship-postal"]')!.value.trim(),
    };
    try {
      const r = await api.checkout({ shipping, payment: { method: 'mock-card', token: 'demo' } }) as { order: Order };
      await refreshCart();
      sessionStorage.setItem('lastOrder', JSON.stringify(r.order));
      location.hash = '#/confirmation/' + r.order.reference;
    } catch (err) {
      alert.innerHTML = `<div class="alert alert--error" data-testid="checkout-error" role="alert">${esc((err as Error).message)}</div>`;
      btn.disabled = false;
    }
  };
}

async function pageConfirmation(ref: string): Promise<void> {
  let order: Order | null;
  try { const r = await api.order(ref) as { order: Order }; order = r.order; }
  catch {
    const cached = sessionStorage.getItem('lastOrder');
    order = cached ? JSON.parse(cached) as Order : null;
  }
  if (!order) { app.innerHTML = `<section class="section"><div class="empty"><h3>Order not found</h3></div></section>`; return; }
  app.innerHTML = `
    <section class="section reveal" data-testid="order-confirmation">
      <div class="empty" style="padding-top:40px">
        <p class="tiny" style="color:var(--gold)">Thank you</p>
        <h1 style="font-size:3rem;margin:10px 0">Order Confirmed</h1>
        <p class="muted">Your order reference is</p>
        <p style="font-family:var(--serif);font-size:2rem;color:var(--gold);margin:10px 0" data-testid="order-reference">${esc(order.reference)}</p>
        <div class="cart-summary" style="max-width:440px;margin:30px auto;text-align:left">
          ${order.items.map(i => `<div class="spread"><span class="muted">${esc(i.name)} ×${i.quantity}</span><span>${money(i.unitCents * i.quantity)}</span></div>`).join('')}
          <div class="spread total"><span>Total</span><span data-testid="confirmation-total">${money(order.totalCents)}</span></div>
        </div>
        <a class="btn btn--ghost btn--sm" href="#/orders" data-testid="view-orders">View My Orders</a>
        <a class="btn btn--sm" href="#/" style="margin-left:10px">Continue Shopping</a>
      </div>
    </section>`;
}

async function pageOrders(): Promise<void> {
  if (!state.user || state.user.role !== 'buyer') { location.hash = '#/login'; return; }
  app.innerHTML = `<section class="section"><p class="muted" data-testid="loading">Loading orders…</p></section>`;
  const r = await api.orders() as { orders: Order[] };
  app.innerHTML = `
    <section class="section reveal">
      <div class="page-head"><p class="tiny">History</p><h1>My Orders</h1></div>
      ${r.orders.length === 0
        ? `<div class="empty" data-testid="orders-empty"><h3>No orders yet</h3></div>`
        : `<div data-testid="orders-list">${r.orders.map(o => `
            <div class="cart-line" data-testid="order-row" data-reference="${esc(o.reference)}" style="grid-template-columns:1fr auto auto">
              <div><strong>${esc(o.reference)}</strong><br><span class="tiny">${o.items.length} item(s) · ${esc(o.createdAt)}</span></div>
              <span class="tiny" style="color:var(--gold)">${esc(o.status)}</span>
              <span class="price-now">${money(o.totalCents)}</span>
            </div>`).join('')}</div>`}
    </section>`;
}

// ---------- Seller dashboard ----------
async function pageSeller(): Promise<void> {
  if (!state.user || state.user.role !== 'seller') { location.hash = '#/login'; return; }
  app.innerHTML = `
    <section class="section reveal">
      <div class="page-head"><p class="tiny">Your Atelier</p><h1>Seller Dashboard</h1></div>
      <div class="dash-grid">
        <div>
          <h3 style="margin-bottom:18px">New Listing</h3>
          <form class="form" data-testid="new-product-form" style="max-width:none">
            <div id="seller-alert"></div>
            <div class="field"><label for="np-name">Name</label><input id="np-name" data-testid="np-name" required /></div>
            <div class="field"><label for="np-desc">Description</label><textarea id="np-desc" data-testid="np-description"></textarea></div>
            <div class="field"><label for="np-cat">Category</label><input id="np-cat" data-testid="np-category" value="Atelier" /></div>
            <div class="row" style="gap:16px">
              <div class="field" style="flex:1"><label for="np-price">Price (USD)</label><input id="np-price" type="number" step="0.01" min="0" data-testid="np-price" required /></div>
              <div class="field" style="flex:1"><label for="np-stock">Stock</label><input id="np-stock" type="number" min="0" data-testid="np-stock" value="1" /></div>
            </div>
            <button class="btn btn--solid btn--block" data-testid="np-submit" type="submit">Publish Listing</button>
          </form>
        </div>
        <div>
          <h3 style="margin-bottom:18px">Your Listings</h3>
          <div id="my-listings" data-testid="my-listings" aria-live="polite"></div>
        </div>
      </div>
    </section>`;

  app.querySelector<HTMLFormElement>('[data-testid="new-product-form"]')!.addEventListener('submit', e => e.preventDefault());
  app.querySelector<HTMLElement>('[data-testid="np-submit"]')!.onclick = async () => {
    const alert = document.getElementById('seller-alert')!; alert.innerHTML = '';
    const priceCents = Math.round(parseFloat(app.querySelector<HTMLInputElement>('[data-testid="np-price"]')!.value || '0') * 100);
    const payload = {
      name: app.querySelector<HTMLInputElement>('[data-testid="np-name"]')!.value.trim(),
      description: app.querySelector<HTMLTextAreaElement>('[data-testid="np-description"]')!.value.trim(),
      category: app.querySelector<HTMLInputElement>('[data-testid="np-category"]')!.value.trim() || 'Atelier',
      priceCents,
      stock: parseInt(app.querySelector<HTMLInputElement>('[data-testid="np-stock"]')!.value || '0', 10),
    };
    try {
      await api.createProduct(payload);
      flash('Listing published.');
      app.querySelector<HTMLFormElement>('[data-testid="new-product-form"]')!.reset();
      loadMyListings();
    } catch (e) {
      alert.innerHTML = `<div class="alert alert--error" data-testid="seller-error" role="alert">${esc((e as Error).message)}</div>`;
    }
  };

  loadMyListings();
}

async function loadMyListings(): Promise<void> {
  const host = document.getElementById('my-listings');
  if (!host) return;
  const r = await api.myProducts() as { products: Product[] };
  if (!r.products.length) { host.innerHTML = `<p class="muted" data-testid="no-listings">No listings yet.</p>`; return; }
  host.innerHTML = r.products.map(p => `
    <div class="listing" data-testid="listing-row" data-product-id="${p.id}">
      <img src="${p.image}" alt="${esc(p.name)}" />
      <div>
        <strong data-testid="listing-name">${esc(p.name)}</strong><br>
        <span class="tiny" data-testid="listing-price">${money(p.effectiveCents)}${p.onSale ? ` (was ${money(p.priceCents)})` : ''} · stock ${p.stock}</span>
      </div>
      <div class="acts">
        <button class="btn btn--ghost btn--sm" data-testid="edit-price" data-id="${p.id}" data-price="${p.priceCents}">Price</button>
        <button class="btn btn--ghost btn--sm" data-testid="edit-discount" data-id="${p.id}">Discount</button>
        <button class="btn btn--ghost btn--sm" data-testid="edit-stock" data-id="${p.id}" data-stock="${p.stock}">Stock</button>
      </div>
    </div>`).join('');

  host.querySelectorAll<HTMLElement>('[data-testid="edit-price"]').forEach(b => b.onclick = () => openPriceModal(+(b.dataset.id ?? '0'), +(b.dataset.price ?? '0')));
  host.querySelectorAll<HTMLElement>('[data-testid="edit-discount"]').forEach(b => b.onclick = () => openDiscountModal(+(b.dataset.id ?? '0')));
  host.querySelectorAll<HTMLElement>('[data-testid="edit-stock"]').forEach(b => b.onclick = () => openStockModal(+(b.dataset.id ?? '0'), +(b.dataset.stock ?? '0')));
}

// ---------- Seller modals ----------
function showModal(inner: string): HTMLElement {
  const backdrop = el(`<div class="modal-backdrop" data-testid="modal"><div class="modal" role="dialog" aria-modal="true">${inner}</div></div>`) as HTMLElement;
  backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
  document.body.appendChild(backdrop);
  return backdrop;
}
function openPriceModal(id: number, currentCents: number): void {
  const m = showModal(`
    <h3>Update Price</h3><p class="muted" style="margin-bottom:18px">Set a new price for this piece.</p>
    <div class="field"><label for="mp">Price (USD)</label><input id="mp" type="number" step="0.01" min="0" data-testid="modal-price" value="${(currentCents/100).toFixed(2)}" /></div>
    <div class="row"><button class="btn btn--solid" data-testid="modal-price-save">Save</button><button class="btn btn--ghost" data-testid="modal-cancel">Cancel</button></div>`);
  m.querySelector<HTMLElement>('[data-testid="modal-cancel"]')!.onclick = () => m.remove();
  m.querySelector<HTMLElement>('[data-testid="modal-price-save"]')!.onclick = async () => {
    const priceCents = Math.round(parseFloat(m.querySelector<HTMLInputElement>('[data-testid="modal-price"]')!.value || '0') * 100);
    try { await api.updateProduct(id, { priceCents }); m.remove(); flash('Price updated.'); loadMyListings(); }
    catch (e) { flash((e as Error).message, 'error'); }
  };
}
function openStockModal(id: number, currentStock: number): void {
  const m = showModal(`
    <h3>Update Stock</h3><p class="muted" style="margin-bottom:18px">Adjust available inventory.</p>
    <div class="field"><label for="ms">Stock</label><input id="ms" type="number" min="0" data-testid="modal-stock" value="${currentStock}" /></div>
    <div class="row"><button class="btn btn--solid" data-testid="modal-stock-save">Save</button><button class="btn btn--ghost" data-testid="modal-cancel">Cancel</button></div>`);
  m.querySelector<HTMLElement>('[data-testid="modal-cancel"]')!.onclick = () => m.remove();
  m.querySelector<HTMLElement>('[data-testid="modal-stock-save"]')!.onclick = async () => {
    const stock = parseInt(m.querySelector<HTMLInputElement>('[data-testid="modal-stock"]')!.value || '0', 10);
    try { await api.updateProduct(id, { stock }); m.remove(); flash('Stock updated.'); loadMyListings(); }
    catch (e) { flash((e as Error).message, 'error'); }
  };
}
function openDiscountModal(id: number): void {
  const m = showModal(`
    <h3>Manage Discount</h3><p class="muted" style="margin-bottom:18px">Apply or remove a discount.</p>
    <div class="field"><label for="md-type">Type</label>
      <select id="md-type" data-testid="modal-discount-type"><option value="percentage">Percentage (%)</option><option value="fixed">Fixed amount (USD)</option></select></div>
    <div class="field"><label for="md-val">Value</label><input id="md-val" type="number" min="0" data-testid="modal-discount-value" value="10" /></div>
    <div class="row">
      <button class="btn btn--solid" data-testid="modal-discount-save">Apply</button>
      <button class="btn btn--ghost" data-testid="modal-discount-remove">Remove</button>
      <button class="btn btn--ghost" data-testid="modal-cancel">Cancel</button>
    </div>`);
  m.querySelector<HTMLElement>('[data-testid="modal-cancel"]')!.onclick = () => m.remove();
  m.querySelector<HTMLElement>('[data-testid="modal-discount-save"]')!.onclick = async () => {
    const type = m.querySelector<HTMLSelectElement>('[data-testid="modal-discount-type"]')!.value;
    let value = parseInt(m.querySelector<HTMLInputElement>('[data-testid="modal-discount-value"]')!.value || '0', 10);
    if (type === 'fixed') value = Math.round(parseFloat(m.querySelector<HTMLInputElement>('[data-testid="modal-discount-value"]')!.value || '0') * 100);
    try { await api.setDiscount(id, { type, value }); m.remove(); flash('Discount applied.'); loadMyListings(); }
    catch (e) { flash((e as Error).message, 'error'); }
  };
  m.querySelector<HTMLElement>('[data-testid="modal-discount-remove"]')!.onclick = async () => {
    try { await api.removeDiscount(id); m.remove(); flash('Discount removed.'); loadMyListings(); }
    catch (e) { flash((e as Error).message, 'error'); }
  };
}

// ============================================================
//  Router
// ============================================================
function parseQuery(): Record<string, string> {
  const hash = location.hash.slice(1);
  const qi = hash.indexOf('?');
  if (qi === -1) return {};
  return Object.fromEntries(new URLSearchParams(hash.slice(qi + 1)));
}

async function router(): Promise<void> {
  const raw = location.hash.slice(1) || '/';
  const path = raw.split('?')[0];
  const parts = path.split('/').filter(Boolean);
  window.scrollTo(0, 0);

  document.querySelectorAll('.nav a').forEach(a => a.classList.remove('active'));

  if (parts.length === 0) return pageShop();
  switch (parts[0]) {
    case 'product': return pageProduct(parts[1]);
    case 'login': return pageLogin();
    case 'register': return pageRegister();
    case 'cart': return pageCart();
    case 'checkout': return pageCheckout();
    case 'confirmation': return pageConfirmation(parts[1]);
    case 'orders': return pageOrders();
    case 'seller': return pageSeller();
    default: return pageShop();
  }
}

// ============================================================
//  Boot
// ============================================================
async function boot(): Promise<void> {
  renderHeader();
  try { const r = await api.categories() as { categories: string[] }; state.categories = r.categories; } catch { /* ignore */ }
  await refreshSession();
  renderHeader();
  await refreshCart();
  window.addEventListener('hashchange', router);
  await router();
  document.body.setAttribute('data-app-ready', 'true');
}
boot();
