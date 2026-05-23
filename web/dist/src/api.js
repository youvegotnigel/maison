// Maison API client. Thin, transparent wrapper over fetch.
// Exposes window.MaisonAPI for both the app and for test introspection.
const BASE = '/api/v1';

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error((json && json.error && json.error.message) || res.statusText);
    err.code = (json && json.error && json.error.code) || 'HTTP_' + res.status;
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

export const api = {
  health: () => request('GET', '/health'),
  seedInfo: () => request('GET', '/seed-info'),

  register: (data) => request('POST', '/auth/register', data),
  login: (data) => request('POST', '/auth/login', data),
  logout: () => request('POST', '/auth/logout'),
  me: () => request('GET', '/auth/me'),

  products: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v != null)
    ).toString();
    return request('GET', '/products' + (qs ? '?' + qs : ''));
  },
  product: (id) => request('GET', '/products/' + id),
  categories: () => request('GET', '/products/categories'),

  // seller
  myProducts: () => request('GET', '/products/seller/mine'),
  createProduct: (data) => request('POST', '/products', data),
  updateProduct: (id, data) => request('PATCH', '/products/' + id, data),
  addImage: (id, url) => request('POST', `/products/${id}/images`, { url }),
  setDiscount: (id, data) => request('PUT', `/products/${id}/discount`, data),
  removeDiscount: (id) => request('DELETE', `/products/${id}/discount`),

  // buyer
  getCart: () => request('GET', '/cart'),
  addToCart: (productId, quantity = 1) => request('POST', '/cart/items', { productId, quantity }),
  removeCartItem: (itemId) => request('DELETE', '/cart/items/' + itemId),
  clearCart: () => request('DELETE', '/cart'),
  checkout: (data) => request('POST', '/orders', data),
  orders: () => request('GET', '/orders'),
  order: (ref) => request('GET', '/orders/' + ref),
};

export function money(cents) {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
