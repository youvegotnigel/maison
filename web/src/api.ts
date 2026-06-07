// Maison API client. Thin, transparent wrapper over fetch.
// Exposes window.MaisonAPI for both the app and for test introspection.
const BASE = '/api/v1';

export class ApiError extends Error {
  code: string;
  status: number;
  payload: unknown;
  constructor(message: string, code: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.payload = payload;
  }
}

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  let json: unknown = null;
  try { json = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const j = json as { error?: { message?: string; code?: string } } | null;
    throw new ApiError(
      j?.error?.message || res.statusText,
      j?.error?.code || 'HTTP_' + res.status,
      res.status,
      json,
    );
  }
  return json;
}

export const api = {
  health: () => request('GET', '/health'),
  seedInfo: () => request('GET', '/seed-info'),

  register: (data: unknown) => request('POST', '/auth/register', data),
  login: (data: unknown) => request('POST', '/auth/login', data),
  logout: () => request('POST', '/auth/logout'),
  me: () => request('GET', '/auth/me'),

  products: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v != null)
    ).toString();
    return request('GET', '/products' + (qs ? '?' + qs : ''));
  },
  product: (id: number | string) => request('GET', '/products/' + id),
  certificate: (id: number | string) => request('GET', `/products/${id}/certificate`),
  issueCertificate: (id: number | string) => request('POST', `/products/${id}/certificate`),
  categories: () => request('GET', '/products/categories'),

  // seller
  myProducts: () => request('GET', '/products/seller/mine'),
  createProduct: (data: unknown) => request('POST', '/products', data),
  updateProduct: (id: number | string, data: unknown) => request('PATCH', '/products/' + id, data),
  addImage: (id: number | string, url: string) => request('POST', `/products/${id}/images`, { url }),
  setDiscount: (id: number | string, data: unknown) => request('PUT', `/products/${id}/discount`, data),
  removeDiscount: (id: number | string) => request('DELETE', `/products/${id}/discount`),

  // buyer
  getCart: () => request('GET', '/cart'),
  addToCart: (productId: number | string, quantity = 1) => request('POST', '/cart/items', { productId, quantity }),
  removeCartItem: (itemId: number | string) => request('DELETE', '/cart/items/' + itemId),
  clearCart: () => request('DELETE', '/cart'),
  checkout: (data: unknown) => request('POST', '/orders', data),
  orders: () => request('GET', '/orders'),
  order: (ref: string) => request('GET', '/orders/' + ref),
};

export function money(cents: number): string {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
