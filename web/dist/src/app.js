import { api, money } from './api.js';
// ============================================================
//  Maison SPA — vanilla JS, hash-routed.
//  Automation-first: every interactive element carries a
//  stable data-testid. App state is also mirrored on
//  window.__MAISON__ for test introspection.
// ============================================================
const state = {
    user: null,
    cart: { items: [], count: 0, subtotalCents: 0 },
    categories: [],
};
window.__MAISON__ = state;
const app = document.getElementById('app');
const el = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
};
const escMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => escMap[c]);
// ---------- Toast / alert ----------
function flash(message, type = 'success') {
    const host = document.getElementById('flash');
    host.innerHTML = `<div class="alert alert--${type}" role="status" data-testid="flash-${type}">${esc(message)}</div>`;
    setTimeout(() => { if (host.firstChild)
        host.innerHTML = ''; }, 4000);
}
// ---------- Session ----------
async function refreshSession() {
    try {
        const r = await api.me();
        state.user = r.user;
    }
    catch {
        state.user = null;
    }
}
async function refreshCart() {
    if (!state.user || state.user.role !== 'buyer') {
        state.cart = { items: [], count: 0, subtotalCents: 0 };
        renderHeader();
        return;
    }
    try {
        const r = await api.getCart();
        state.cart = r.cart;
    }
    catch { /* ignore */ }
    renderHeader();
}
// ============================================================
//  Header
// ============================================================
function renderHeader() {
    const header = document.getElementById('masthead');
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
    header.querySelector('[data-testid="brand"]').onclick = () => { location.hash = '#/'; };
    const toggle = header.querySelector('[data-testid="nav-toggle"]');
    const nav = header.querySelector('[data-testid="nav-mobile-menu"]');
    function closeNav() {
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
    if (window.__navAbort)
        window.__navAbort.abort();
    window.__navAbort = new AbortController();
    const { signal } = window.__navAbort;
    document.addEventListener('click', (e) => {
        if (nav.classList.contains('nav--open') && !nav.contains(e.target) && !toggle.contains(e.target))
            closeNav();
    }, { signal });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && nav.classList.contains('nav--open'))
            closeNav();
    }, { signal });
    const logoutLink = header.querySelector('[data-testid="logout-link"]');
    if (logoutLink)
        logoutLink.onclick = (e) => { e.preventDefault(); window.__logout(); };
}
window.__logout = async () => {
    try {
        await api.logout();
    }
    catch { /* ignore */ }
    state.user = null;
    state.cart = { items: [], count: 0, subtotalCents: 0 };
    renderHeader();
    flash('You have been signed out.');
    if (location.hash !== '#/') {
        location.hash = '#/';
    }
    else {
        router();
    }
};
// ============================================================
//  Pages
// ============================================================
function priceBlock(p) {
    if (p.onSale) {
        return `<span class="price-now" data-testid="price">${money(p.effectiveCents)}</span>
            <span class="price-was" data-testid="price-was">${money(p.priceCents)}</span>`;
    }
    return `<span class="price-now" data-testid="price">${money(p.priceCents)}</span>`;
}
function productCard(p) {
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
async function pageShop() {
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
          ${state.categories.map(c => `<option value="${esc(c)}" ${params.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
        <select data-testid="sort-select" aria-label="Sort products">
          <option value="">Newest</option>
          <option value="price_asc" ${params.sort === 'price_asc' ? 'selected' : ''}>Price: Low to High</option>
          <option value="price_desc" ${params.sort === 'price_desc' ? 'selected' : ''}>Price: High to Low</option>
          <option value="name" ${params.sort === 'name' ? 'selected' : ''}>Name</option>
        </select>
        <button class="btn btn--sm" data-testid="search-submit" type="button">Apply</button>
      </form>
      <div id="catalogue" class="grid" data-testid="catalogue" aria-live="polite"></div>
    </section>`;
    const search = app.querySelector('[data-testid="search-input"]');
    const cat = app.querySelector('[data-testid="filter-category"]');
    const sort = app.querySelector('[data-testid="sort-select"]');
    const apply = () => {
        const q = new URLSearchParams();
        if (search.value)
            q.set('q', search.value);
        if (cat.value)
            q.set('category', cat.value);
        if (sort.value)
            q.set('sort', sort.value);
        location.hash = '#/?' + q.toString();
    };
    app.querySelector('[data-testid="search-submit"]').onclick = apply;
    search.addEventListener('keydown', e => { if (e.key === 'Enter')
        apply(); });
    cat.onchange = apply;
    sort.onchange = apply;
    const grid = document.getElementById('catalogue');
    grid.innerHTML = `<p class="muted" data-testid="loading">Loading the collection…</p>`;
    try {
        const r = await api.products({ q: params.q, category: params.category, sort: params.sort });
        if (!r.products.length) {
            grid.innerHTML = `<div class="empty" data-testid="no-results"><h3>Nothing found</h3><p>Try a different search or category.</p></div>`;
            return;
        }
        grid.innerHTML = r.products.map(productCard).join('');
        grid.style.animationDelay = '0';
    }
    catch (e) {
        grid.innerHTML = `<div class="empty" data-testid="error"><h3>Unable to load</h3><p>${esc(e.message)}</p></div>`;
    }
}
async function pageProduct(id) {
    app.innerHTML = `<section class="section"><p class="muted" data-testid="loading">Loading…</p></section>`;
    let p;
    try {
        const r = await api.product(id);
        p = r.product;
    }
    catch (e) {
        app.innerHTML = `<section class="section"><div class="empty" data-testid="error"><h3>Not found</h3><p>${esc(e.message)}</p><a class="btn btn--ghost btn--sm" href="#/">Back to shop</a></div></section>`;
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
          <div class="row" data-testid="pdp-extras" style="margin-top:24px;gap:12px;flex-wrap:wrap">
            <a class="btn btn--ghost btn--sm" data-testid="certificate-link" target="_blank" href="/certificate/${p.id}">View Certificate of Authenticity</a>
            <button class="btn btn--ghost btn--sm" type="button" data-testid="size-guide-button">Size &amp; Fit Guide</button>
            <button class="btn btn--ghost btn--sm" type="button" data-testid="share-all-button">Share this piece</button>
          </div>
        </div>
      </div>
    </section>`;
    if (p.inStock) {
        const input = app.querySelector('[data-testid="qty-input"]');
        app.querySelector('[data-testid="qty-decr"]').onclick = () => {
            input.value = String(Math.max(1, (+input.value || 1) - 1));
        };
        app.querySelector('[data-testid="qty-incr"]').onclick = () => {
            input.value = String(Math.min(p.stock, (+input.value || 1) + 1));
        };
        app.querySelector('[data-testid="add-to-cart"]').onclick = async (e) => {
            if (!isBuyer) {
                flash('Please sign in as a buyer to add items.', 'error');
                location.hash = '#/login';
                return;
            }
            const btn = e.currentTarget;
            btn.disabled = true;
            try {
                await api.addToCart(p.id, +input.value || 1);
                await refreshCart();
                flash(`${p.name} added to your cart.`);
            }
            catch (err) {
                flash(err.message, 'error');
            }
            finally {
                btn.disabled = false;
            }
        };
    }
    // Multi-window triggers (always present, regardless of stock).
    app.querySelector('[data-testid="size-guide-button"]').onclick = () => {
        window.open('/size-guide', 'maison_size_guide', 'popup,width=480,height=640');
    };
    app.querySelector('[data-testid="share-all-button"]').onclick = () => {
        window.open(`/share/${p.id}/link`, 'maison_share_link', 'popup,width=480,height=560');
        window.open(`/share/${p.id}/email`, 'maison_share_email', 'popup,width=480,height=560');
        window.open(`/share/${p.id}/preview`, 'maison_share_preview', 'popup,width=480,height=560');
    };
}
function buildDobPicker(wrapper) {
    const MONTH_NAMES = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const maxYear = new Date().getFullYear() - 18;
    let selected = '';
    let viewYear = maxYear - 12;
    let viewMonth = new Date().getMonth() + 1; // 1–12
    const trigger = wrapper.querySelector('[data-testid="dob-display"]');
    const popup = wrapper.querySelector('[data-testid="dob-picker"]');
    function isOpen() { return popup.classList.contains('dob-popup--open'); }
    function open() {
        renderCalendar();
        popup.classList.add('dob-popup--open');
        popup.setAttribute('aria-hidden', 'false');
        trigger.setAttribute('aria-expanded', 'true');
    }
    function close() {
        popup.classList.remove('dob-popup--open');
        popup.setAttribute('aria-hidden', 'true');
        trigger.setAttribute('aria-expanded', 'false');
    }
    function updateTriggerText() {
        const span = trigger.querySelector('[data-dob-display-text]');
        if (!selected) {
            span.textContent = 'Select date of birth';
            return;
        }
        const [y, m, d] = selected.split('-').map(Number);
        span.textContent = `${d} ${MONTH_NAMES[m - 1]} ${y}`;
    }
    function renderCalendar() {
        const monthOpts = MONTH_NAMES.map((name, i) => `<option value="${i + 1}"${viewMonth === i + 1 ? ' selected' : ''}>${name}</option>`).join('');
        const yearOpts = [];
        for (let y = maxYear; y >= 1920; y--) {
            yearOpts.push(`<option value="${y}"${viewYear === y ? ' selected' : ''}>${y}</option>`);
        }
        const firstWeekday = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0=Sun
        const leadBlanks = (firstWeekday + 6) % 7; // Monday-first grid
        const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
        const cutoff = new Date();
        cutoff.setFullYear(cutoff.getFullYear() - 18);
        let cells = '';
        for (let i = 0; i < leadBlanks; i++)
            cells += '<span class="dob-grid__blank"></span>';
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(viewYear, viewMonth - 1, d);
            const iso = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const disabled = date > cutoff;
            const sel = selected === iso;
            cells += `<button type="button" data-testid="dob-day-${d}"
        class="dob-day${sel ? ' dob-day--selected' : ''}${disabled ? ' dob-day--disabled' : ''}"
        aria-label="Day ${d}"${disabled ? ' disabled' : ''}>${d}</button>`;
        }
        popup.innerHTML = `
      <div class="dob-nav">
        <button type="button" class="dob-nav__arrow" data-testid="dob-prev-month" aria-label="Previous month">&#9664;</button>
        <select class="dob-nav__select" data-testid="dob-month-select">${monthOpts}</select>
        <select class="dob-nav__select" data-testid="dob-year-select">${yearOpts}</select>
        <button type="button" class="dob-nav__arrow" data-testid="dob-next-month" aria-label="Next month">&#9654;</button>
      </div>
      <div class="dob-weekdays">
        <span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span>
        <span>Sa</span><span>Su</span>
      </div>
      <div class="dob-grid">${cells}</div>`;
        popup.querySelector('[data-testid="dob-prev-month"]').onclick = (e) => {
            e.stopPropagation();
            viewMonth--;
            if (viewMonth < 1) {
                viewMonth = 12;
                viewYear--;
            }
            renderCalendar();
        };
        popup.querySelector('[data-testid="dob-next-month"]').onclick = (e) => {
            e.stopPropagation();
            if (viewYear >= maxYear && viewMonth >= 12)
                return;
            viewMonth++;
            if (viewMonth > 12) {
                viewMonth = 1;
                viewYear++;
            }
            renderCalendar();
        };
        popup.querySelector('[data-testid="dob-month-select"]').onchange = (e) => {
            viewMonth = parseInt(e.target.value, 10);
            renderCalendar();
        };
        popup.querySelector('[data-testid="dob-year-select"]').onchange = (e) => {
            viewYear = parseInt(e.target.value, 10);
            renderCalendar();
        };
        popup.querySelectorAll('[data-testid^="dob-day-"]').forEach(btn => {
            btn.onclick = () => {
                const n = parseInt((btn.dataset.testid ?? '').replace('dob-day-', ''), 10);
                selected = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
                updateTriggerText();
                close();
            };
        });
    }
    trigger.onclick = () => { if (isOpen()) {
        close();
    }
    else {
        open();
    } };
    trigger.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            trigger.click();
        }
    };
    // Close on outside click; guard against stale listeners after page navigation
    document.addEventListener('click', (e) => {
        if (!document.contains(wrapper))
            return;
        if (!wrapper.contains(e.target))
            close();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen())
            close();
    });
    return { getValue: () => selected };
}
async function pageLogin() {
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
    const form = app.querySelector('[data-testid="login-form"]');
    form.addEventListener('submit', e => e.preventDefault());
    form.querySelector('[data-testid="login-submit"]').onclick = async () => {
        const email = form.querySelector('[data-testid="login-email"]').value.trim();
        const password = form.querySelector('[data-testid="login-password"]').value;
        const alert = document.getElementById('login-alert');
        alert.innerHTML = '';
        try {
            const r = await api.login({ email, password });
            state.user = r.user;
            renderHeader();
            await refreshCart();
            flash(`Welcome, ${r.user.name}.`);
            location.hash = r.user.role === 'seller' ? '#/seller' : '#/';
        }
        catch (e) {
            alert.innerHTML = `<div class="alert alert--error" data-testid="login-error" role="alert">${esc(e.message)}</div>`;
        }
    };
}
async function pageRegister() {
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
        <div id="buyer-name-row">
          <div class="row" style="gap:16px">
            <div class="field" style="flex:1">
              <label for="reg-first-name">First name</label>
              <input id="reg-first-name" data-testid="register-first-name" autocomplete="given-name" />
            </div>
            <div class="field" style="flex:1">
              <label for="reg-last-name">Last name</label>
              <input id="reg-last-name" data-testid="register-last-name" autocomplete="family-name" />
            </div>
          </div>
        </div>
        <div id="seller-name-row" style="display:none">
          <div class="field">
            <label for="reg-name">Atelier name</label>
            <input id="reg-name" data-testid="register-name" />
          </div>
        </div>
        <div class="field">
          <label for="reg-email">Email</label>
          <input id="reg-email" type="email" data-testid="register-email" autocomplete="email" required />
        </div>
        <div id="buyer-extra-row">
          <div class="row" style="gap:16px">
            <div class="field" style="flex:1">
              <label for="reg-gender">Gender <span class="tiny">(optional)</span></label>
              <select id="reg-gender" data-testid="register-gender">
                <option value="">— Select —</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="non-binary">Non-binary</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>
            <div class="field" style="flex:1">
              <label for="reg-phone">Phone <span class="tiny">(optional)</span></label>
              <input id="reg-phone" type="tel" data-testid="register-phone" autocomplete="tel" />
            </div>
          </div>
        </div>
        <div id="dob-wrapper" class="dob-field">
          <div class="field">
            <label for="reg-dob">Date of birth</label>
            <div class="dob-trigger" data-testid="dob-display" id="reg-dob"
                 tabindex="0" role="button" aria-haspopup="dialog"
                 aria-expanded="false" aria-label="Select date of birth">
              <span data-dob-display-text>Select date of birth</span>
              <svg class="dob-trigger__icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                   viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            </div>
          </div>
          <div class="dob-popup" data-testid="dob-picker"
               role="dialog" aria-label="Select date of birth" aria-hidden="true"></div>
        </div>
        <div class="row" style="gap:16px;align-items:flex-end">
          <div class="field" style="flex:1">
            <label for="reg-password">Password</label>
            <input id="reg-password" type="password" data-testid="register-password" autocomplete="new-password" />
          </div>
          <div class="field" style="flex:1" id="confirm-password-field">
            <label for="reg-confirm-password">Confirm password</label>
            <input id="reg-confirm-password" type="password" data-testid="register-confirm-password" autocomplete="new-password" />
          </div>
        </div>
        <p class="tiny" style="margin-top:6px">At least 8 characters, including a letter and a number.</p>
        <button class="btn btn--solid btn--block" data-testid="register-submit" type="submit">Create Account</button>
        <p class="muted" style="margin-top:20px;font-size:0.88rem">Already have an account? <a href="#/login" data-testid="goto-login" style="color:var(--gold)">Sign in</a></p>
      </form>
    </section>`;
    const form = app.querySelector('[data-testid="register-form"]');
    form.addEventListener('submit', e => e.preventDefault());
    const bBuyer = form.querySelector('[data-testid="role-buyer"]');
    const bSeller = form.querySelector('[data-testid="role-seller"]');
    const buyerNameRow = form.querySelector('#buyer-name-row');
    const sellerNameRow = form.querySelector('#seller-name-row');
    const buyerExtraRow = form.querySelector('#buyer-extra-row');
    const dobWrapper = form.querySelector('#dob-wrapper');
    const dob = buildDobPicker(dobWrapper);
    const setRole = (r) => {
        role = r;
        const isBuyer = r === 'buyer';
        bBuyer.setAttribute('aria-pressed', String(isBuyer));
        bSeller.setAttribute('aria-pressed', String(!isBuyer));
        buyerNameRow.style.display = isBuyer ? '' : 'none';
        sellerNameRow.style.display = isBuyer ? 'none' : '';
        buyerExtraRow.style.display = isBuyer ? '' : 'none';
    };
    bBuyer.onclick = () => setRole('buyer');
    bSeller.onclick = () => setRole('seller');
    form.querySelector('[data-testid="register-submit"]').onclick = async () => {
        const email = form.querySelector('[data-testid="register-email"]').value.trim();
        const password = form.querySelector('[data-testid="register-password"]').value;
        const alertEl = document.getElementById('register-alert');
        alertEl.innerHTML = '';
        let payload;
        if (role === 'buyer') {
            const firstName = form.querySelector('[data-testid="register-first-name"]').value.trim();
            const lastName = form.querySelector('[data-testid="register-last-name"]').value.trim();
            const gender = form.querySelector('[data-testid="register-gender"]').value;
            const phone = form.querySelector('[data-testid="register-phone"]').value.trim();
            const confirmPassword = form.querySelector('[data-testid="register-confirm-password"]').value;
            if (password !== confirmPassword) {
                alertEl.innerHTML = `<div class="alert alert--error" data-testid="register-error" role="alert">Passwords do not match.</div>`;
                return;
            }
            payload = { firstName, lastName, email, password, role, dateOfBirth: dob.getValue() };
            if (gender)
                payload.gender = gender;
            if (phone)
                payload.phone = phone;
        }
        else {
            const name = form.querySelector('[data-testid="register-name"]').value.trim();
            const confirmPassword = form.querySelector('[data-testid="register-confirm-password"]').value;
            if (password !== confirmPassword) {
                alertEl.innerHTML = `<div class="alert alert--error" data-testid="register-error" role="alert">Passwords do not match.</div>`;
                return;
            }
            payload = { name, email, password, role, dateOfBirth: dob.getValue() };
        }
        try {
            const r = await api.register(payload);
            state.user = r.user;
            renderHeader();
            await refreshCart();
            flash(`Welcome to Maison, ${r.user.name}.`);
            location.hash = r.user.role === 'seller' ? '#/seller' : '#/';
        }
        catch (e) {
            alertEl.innerHTML = `<div class="alert alert--error" data-testid="register-error" role="alert">${esc(e.message)}</div>`;
        }
    };
}
async function pageCart() {
    if (!state.user || state.user.role !== 'buyer') {
        location.hash = '#/login';
        return;
    }
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
        app.querySelectorAll('[data-testid="remove-item"]').forEach(btn => {
            btn.onclick = async () => { await api.removeCartItem(+(btn.dataset.itemId ?? '0')); await refreshCart(); pageCart(); };
        });
        app.querySelector('[data-testid="clear-cart"]').onclick = async () => { await api.clearCart(); await refreshCart(); pageCart(); flash('Cart emptied.'); };
        app.querySelector('[data-testid="checkout-button"]').onclick = () => { location.hash = '#/checkout'; };
    }
}
async function pageCheckout() {
    if (!state.user || state.user.role !== 'buyer') {
        location.hash = '#/login';
        return;
    }
    await refreshCart();
    if (!state.cart.items.length) {
        location.hash = '#/cart';
        return;
    }
    const c = state.cart;
    app.innerHTML = `
    <section class="section reveal">
      <div class="page-head"><p class="tiny">Final details</p><h1>Checkout</h1></div>
      <div class="cart-layout">
        <form class="form" data-testid="checkout-form" style="max-width:none">
          <div id="checkout-alert"></div>
          <h3 style="margin-bottom:18px">Shipping</h3>
          <div class="field"><label for="ship-name">Full name</label><input id="ship-name" data-testid="ship-name" value="${esc(state.user.name)}" required /></div>
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
    app.querySelector('[data-testid="checkout-form"]').addEventListener('submit', e => e.preventDefault());
    app.querySelector('[data-testid="place-order"]').onclick = async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        const alert = document.getElementById('checkout-alert');
        alert.innerHTML = '';
        const shipping = {
            name: app.querySelector('[data-testid="ship-name"]').value.trim(),
            address: app.querySelector('[data-testid="ship-address"]').value.trim(),
            city: app.querySelector('[data-testid="ship-city"]').value.trim(),
            postalCode: app.querySelector('[data-testid="ship-postal"]').value.trim(),
        };
        try {
            const r = await api.checkout({ shipping, payment: { method: 'mock-card', token: 'demo' } });
            await refreshCart();
            sessionStorage.setItem('lastOrder', JSON.stringify(r.order));
            location.hash = '#/confirmation/' + r.order.reference;
        }
        catch (err) {
            alert.innerHTML = `<div class="alert alert--error" data-testid="checkout-error" role="alert">${esc(err.message)}</div>`;
            btn.disabled = false;
        }
    };
}
async function pageConfirmation(ref) {
    let order;
    try {
        const r = await api.order(ref);
        order = r.order;
    }
    catch {
        const cached = sessionStorage.getItem('lastOrder');
        order = cached ? JSON.parse(cached) : null;
    }
    if (!order) {
        app.innerHTML = `<section class="section"><div class="empty"><h3>Order not found</h3></div></section>`;
        return;
    }
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
async function pageOrders() {
    if (!state.user || state.user.role !== 'buyer') {
        location.hash = '#/login';
        return;
    }
    app.innerHTML = `<section class="section"><p class="muted" data-testid="loading">Loading orders…</p></section>`;
    const r = await api.orders();
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
async function pageSeller() {
    if (!state.user || state.user.role !== 'seller') {
        location.hash = '#/login';
        return;
    }
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
    app.querySelector('[data-testid="new-product-form"]').addEventListener('submit', e => e.preventDefault());
    app.querySelector('[data-testid="np-submit"]').onclick = async () => {
        const alert = document.getElementById('seller-alert');
        alert.innerHTML = '';
        const priceCents = Math.round(parseFloat(app.querySelector('[data-testid="np-price"]').value || '0') * 100);
        const payload = {
            name: app.querySelector('[data-testid="np-name"]').value.trim(),
            description: app.querySelector('[data-testid="np-description"]').value.trim(),
            category: app.querySelector('[data-testid="np-category"]').value.trim() || 'Atelier',
            priceCents,
            stock: parseInt(app.querySelector('[data-testid="np-stock"]').value || '0', 10),
        };
        try {
            await api.createProduct(payload);
            flash('Listing published.');
            app.querySelector('[data-testid="new-product-form"]').reset();
            loadMyListings();
        }
        catch (e) {
            alert.innerHTML = `<div class="alert alert--error" data-testid="seller-error" role="alert">${esc(e.message)}</div>`;
        }
    };
    loadMyListings();
}
async function loadMyListings() {
    const host = document.getElementById('my-listings');
    if (!host)
        return;
    const r = await api.myProducts();
    if (!r.products.length) {
        host.innerHTML = `<p class="muted" data-testid="no-listings">No listings yet.</p>`;
        return;
    }
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
    host.querySelectorAll('[data-testid="edit-price"]').forEach(b => b.onclick = () => openPriceModal(+(b.dataset.id ?? '0'), +(b.dataset.price ?? '0')));
    host.querySelectorAll('[data-testid="edit-discount"]').forEach(b => b.onclick = () => openDiscountModal(+(b.dataset.id ?? '0')));
    host.querySelectorAll('[data-testid="edit-stock"]').forEach(b => b.onclick = () => openStockModal(+(b.dataset.id ?? '0'), +(b.dataset.stock ?? '0')));
}
// ---------- Seller modals ----------
function showModal(inner) {
    const backdrop = el(`<div class="modal-backdrop" data-testid="modal"><div class="modal" role="dialog" aria-modal="true">${inner}</div></div>`);
    backdrop.addEventListener('click', e => { if (e.target === backdrop)
        backdrop.remove(); });
    document.body.appendChild(backdrop);
    return backdrop;
}
function openPriceModal(id, currentCents) {
    const m = showModal(`
    <h3>Update Price</h3><p class="muted" style="margin-bottom:18px">Set a new price for this piece.</p>
    <div class="field"><label for="mp">Price (USD)</label><input id="mp" type="number" step="0.01" min="0" data-testid="modal-price" value="${(currentCents / 100).toFixed(2)}" /></div>
    <div class="row"><button class="btn btn--solid" data-testid="modal-price-save">Save</button><button class="btn btn--ghost" data-testid="modal-cancel">Cancel</button></div>`);
    m.querySelector('[data-testid="modal-cancel"]').onclick = () => m.remove();
    m.querySelector('[data-testid="modal-price-save"]').onclick = async () => {
        const priceCents = Math.round(parseFloat(m.querySelector('[data-testid="modal-price"]').value || '0') * 100);
        try {
            await api.updateProduct(id, { priceCents });
            m.remove();
            flash('Price updated.');
            loadMyListings();
        }
        catch (e) {
            flash(e.message, 'error');
        }
    };
}
function openStockModal(id, currentStock) {
    const m = showModal(`
    <h3>Update Stock</h3><p class="muted" style="margin-bottom:18px">Adjust available inventory.</p>
    <div class="field"><label for="ms">Stock</label><input id="ms" type="number" min="0" data-testid="modal-stock" value="${currentStock}" /></div>
    <div class="row"><button class="btn btn--solid" data-testid="modal-stock-save">Save</button><button class="btn btn--ghost" data-testid="modal-cancel">Cancel</button></div>`);
    m.querySelector('[data-testid="modal-cancel"]').onclick = () => m.remove();
    m.querySelector('[data-testid="modal-stock-save"]').onclick = async () => {
        const stock = parseInt(m.querySelector('[data-testid="modal-stock"]').value || '0', 10);
        try {
            await api.updateProduct(id, { stock });
            m.remove();
            flash('Stock updated.');
            loadMyListings();
        }
        catch (e) {
            flash(e.message, 'error');
        }
    };
}
function openDiscountModal(id) {
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
    m.querySelector('[data-testid="modal-cancel"]').onclick = () => m.remove();
    m.querySelector('[data-testid="modal-discount-save"]').onclick = async () => {
        const type = m.querySelector('[data-testid="modal-discount-type"]').value;
        let value = parseInt(m.querySelector('[data-testid="modal-discount-value"]').value || '0', 10);
        if (type === 'fixed')
            value = Math.round(parseFloat(m.querySelector('[data-testid="modal-discount-value"]').value || '0') * 100);
        try {
            await api.setDiscount(id, { type, value });
            m.remove();
            flash('Discount applied.');
            loadMyListings();
        }
        catch (e) {
            flash(e.message, 'error');
        }
    };
    m.querySelector('[data-testid="modal-discount-remove"]').onclick = async () => {
        try {
            await api.removeDiscount(id);
            m.remove();
            flash('Discount removed.');
            loadMyListings();
        }
        catch (e) {
            flash(e.message, 'error');
        }
    };
}
// ============================================================
//  Router
// ============================================================
function parseQuery() {
    const hash = location.hash.slice(1);
    const qi = hash.indexOf('?');
    if (qi === -1)
        return {};
    return Object.fromEntries(new URLSearchParams(hash.slice(qi + 1)));
}
async function router() {
    const raw = location.hash.slice(1) || '/';
    const path = raw.split('?')[0];
    const parts = path.split('/').filter(Boolean);
    window.scrollTo(0, 0);
    document.querySelectorAll('.nav a').forEach(a => a.classList.remove('active'));
    if (parts.length === 0)
        return pageShop();
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
//  Standalone window/tab views (multi-window automation)
//  Opened via path-style internal routes served by the SPA
//  static fallback. Minimal chrome: own <main>, lang, one <h1>,
//  root data-testid, deterministic title. No session/cart.
// ============================================================
function mountStandalone(rootTestId, title, innerHTML) {
    document.documentElement.lang = 'en';
    document.title = title;
    document.body.innerHTML = `<main role="main" class="container" style="padding:48px 0">
    <div data-testid="${rootTestId}">${innerHTML}</div>
  </main>`;
    return document.body.querySelector(`[data-testid="${rootTestId}"]`);
}
function markReady() {
    document.body.setAttribute('data-app-ready', 'true');
}
// Deterministic inline-SVG authenticity seal (data-URI), styled like placeholderImage.
function certificateSeal() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <circle cx="100" cy="100" r="92" fill="#100f0d" stroke="#c8a96a" stroke-width="2"/>
    <circle cx="100" cy="100" r="74" fill="none" stroke="#c8a96a" stroke-width="1" opacity="0.6"/>
    <text x="100" y="92" font-family="Georgia, serif" font-size="42" fill="#c8a96a" text-anchor="middle">M</text>
    <text x="100" y="128" font-family="Georgia, serif" font-size="13" fill="#e8e2d6" text-anchor="middle" letter-spacing="3">AUTHENTIC</text>
  </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
async function renderCertificateWindow(id) {
    const root = mountStandalone('certificate-view', 'Certificate of Authenticity | Maison', `<h1>Certificate of Authenticity</h1><p class="muted" data-testid="loading">Loading…</p>`);
    try {
        const r = await api.certificate(id);
        const c = r.certificate;
        root.innerHTML = `
      <h1>Certificate of Authenticity</h1>
      <img src="${certificateSeal()}" alt="Maison authenticity seal" width="160" height="160" data-testid="certificate-seal" />
      <dl class="cert">
        <dt>Product</dt><dd data-testid="certificate-product">${esc(c.productName)}</dd>
        <dt>Serial No.</dt><dd data-testid="certificate-serial">${esc(c.serialNo)}</dd>
        <dt>Issuer</dt><dd data-testid="certificate-issuer">${esc(c.issuer)}</dd>
        <dt>Material</dt><dd data-testid="certificate-material">${esc(c.material)}</dd>
        <dt>Issued</dt><dd data-testid="certificate-issued">${esc(c.issuedAt)}</dd>
      </dl>`;
    }
    catch (e) {
        root.innerHTML = `
      <h1>Certificate of Authenticity</h1>
      <p data-testid="certificate-missing">${esc(e.message)}</p>`;
    }
    markReady();
}
function renderSizeGuideWindow() {
    mountStandalone('size-guide-view', 'Size & Fit Guide | Maison', `
    <h1>Size &amp; Fit Guide</h1>
    <table class="size-table">
      <caption class="tiny">All measurements in inches</caption>
      <thead><tr><th scope="col">Size</th><th scope="col">Chest</th><th scope="col">Waist</th></tr></thead>
      <tbody>
        <tr><th scope="row">XS</th><td>34</td><td>28</td></tr>
        <tr><th scope="row">S</th><td>36</td><td>30</td></tr>
        <tr><th scope="row">M</th><td>38</td><td>32</td></tr>
        <tr><th scope="row">L</th><td>40</td><td>34</td></tr>
        <tr><th scope="row">XL</th><td>42</td><td>36</td></tr>
      </tbody>
    </table>
    <p class="muted">Measurements are approximate. Our pieces fit true to size.</p>`);
    markReady();
}
function renderShareWindow(kind, id) {
    const views = {
        link: {
            testid: 'share-link-view', title: 'Share — Copy Link | Maison',
            body: `<p>Copy this internal link to share the piece:</p><code data-testid="share-link-value">/product/${esc(id)}</code>`,
        },
        email: {
            testid: 'share-email-view', title: 'Share — Email | Maison',
            body: `<p>Share this piece by email.</p><p data-testid="share-email-subject">A piece from Maison</p>`,
        },
        preview: {
            testid: 'share-preview-view', title: 'Share — Preview | Maison',
            body: `<p data-testid="share-preview-body">Preview of product #${esc(id)}.</p>`,
        },
    };
    const cfg = views[kind] ?? views.link;
    mountStandalone(cfg.testid, cfg.title, `<h1>Share this piece</h1>${cfg.body}`);
    markReady();
}
// ============================================================
//  Boot
// ============================================================
async function boot() {
    const path = location.pathname;
    const certMatch = path.match(/^\/certificate\/([^/]+)$/);
    if (certMatch)
        return renderCertificateWindow(certMatch[1]);
    if (path === '/size-guide')
        return renderSizeGuideWindow();
    const shareMatch = path.match(/^\/share\/([^/]+)\/([^/]+)$/);
    if (shareMatch)
        return renderShareWindow(shareMatch[2], shareMatch[1]);
    renderHeader();
    try {
        const r = await api.categories();
        state.categories = r.categories;
    }
    catch { /* ignore */ }
    await refreshSession();
    renderHeader();
    await refreshCart();
    window.addEventListener('hashchange', router);
    await router();
    document.body.setAttribute('data-app-ready', 'true');
}
boot();
//# sourceMappingURL=app.js.map