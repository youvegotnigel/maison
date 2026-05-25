import { Router } from 'express';
import { db } from '../db.js';
import type { DbProduct, DbOrder } from '../db.js';
import { serializeProduct } from '../pricing.js';
import { fail, requireRole } from '../auth.js';

const router = Router();

function getCartId(buyerId: number): number {
  const cart = db.prepare('SELECT id FROM carts WHERE buyer_id = ?').get(buyerId) as unknown as { id: number } | undefined;
  if (!cart) {
    const id = db.prepare('INSERT INTO carts (buyer_id) VALUES (?)').run(buyerId).lastInsertRowid;
    return Number(id);
  }
  return cart.id;
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

function buildCart(buyerId: number): { cartId: number; items: CartLine[]; subtotalCents: number; count: number } {
  const cartId = getCartId(buyerId);
  const items = db.prepare(
    'SELECT ci.id AS itemId, ci.quantity, p.id AS productId FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.cart_id = ?'
  ).all(cartId) as unknown as Array<{ itemId: number; quantity: number; productId: number }>;
  let subtotal = 0;
  const lines: CartLine[] = items.map(it => {
    const prow = db.prepare('SELECT * FROM products WHERE id = ?').get(it.productId) as unknown as DbProduct;
    const product = serializeProduct(prow);
    const lineTotal = product.effectiveCents * it.quantity;
    subtotal += lineTotal;
    return {
      itemId: it.itemId,
      productId: product.id,
      name: product.name,
      image: product.image,
      unitCents: product.effectiveCents,
      quantity: it.quantity,
      lineCents: lineTotal,
      stock: product.stock,
    };
  });
  return { cartId, items: lines, subtotalCents: subtotal, count: lines.reduce((s, l) => s + l.quantity, 0) };
}

// All cart routes are buyer-only.
router.use(requireRole('buyer'));

router.get('/', (req, res) => {
  res.json({ cart: buildCart(req.user!.sub) });
});

// Add or set quantity. Body: { productId, quantity }
router.post('/items', (req, res) => {
  const { productId, quantity = 1 } = req.body || {};
  const prow = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(productId)) as unknown as DbProduct | undefined;
  if (!prow) return fail(res, 404, 'PRODUCT_NOT_FOUND', 'That product does not exist.');
  if (!Number.isInteger(quantity) || quantity < 1) {
    return fail(res, 400, 'INVALID_QUANTITY', 'Quantity must be a positive integer.');
  }
  if (prow.stock < 1) {
    return fail(res, 409, 'OUT_OF_STOCK', 'This item is currently out of stock.');
  }
  if (quantity > prow.stock) {
    return fail(res, 409, 'INSUFFICIENT_STOCK', `Only ${prow.stock} in stock.`);
  }
  const cartId = getCartId(req.user!.sub);
  const existing = db.prepare('SELECT id FROM cart_items WHERE cart_id = ? AND product_id = ?')
    .get(cartId, prow.id) as unknown as { id: number } | undefined;
  if (existing) {
    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(quantity, existing.id);
  } else {
    db.prepare('INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)')
      .run(cartId, prow.id, quantity);
  }
  db.prepare("UPDATE carts SET updated_at = datetime('now') WHERE id = ?").run(cartId);
  res.status(201).json({ cart: buildCart(req.user!.sub) });
});

router.delete('/items/:itemId', (req, res) => {
  const cartId = getCartId(req.user!.sub);
  const item = db.prepare('SELECT id FROM cart_items WHERE id = ? AND cart_id = ?')
    .get(Number(req.params.itemId), cartId) as unknown as { id: number } | undefined;
  if (!item) return fail(res, 404, 'ITEM_NOT_FOUND', 'That cart item does not exist.');
  db.prepare('DELETE FROM cart_items WHERE id = ?').run(item.id);
  res.json({ cart: buildCart(req.user!.sub) });
});

router.delete('/', (req, res) => {
  const cartId = getCartId(req.user!.sub);
  db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cartId);
  res.json({ cart: buildCart(req.user!.sub) });
});

export default router;

// ---- Orders (separate router, also buyer-only) ----
export const ordersRouter = Router();
ordersRouter.use(requireRole('buyer'));

ordersRouter.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM orders WHERE buyer_id = ? ORDER BY created_at DESC, id DESC')
    .all(req.user!.sub) as unknown as DbOrder[];
  const orders = rows.map(o => ({
    id: o.id,
    reference: o.reference,
    status: o.status,
    totalCents: o.total_cents,
    createdAt: o.created_at,
    items: db.prepare('SELECT name, quantity, unit_price_cents AS unitCents FROM order_items WHERE order_id = ?').all(o.id),
    shipping: JSON.parse(o.shipping_json),
  }));
  res.json({ orders });
});

ordersRouter.get('/:reference', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE reference = ? AND buyer_id = ?')
    .get(req.params.reference, req.user!.sub) as unknown as DbOrder | undefined;
  if (!o) return fail(res, 404, 'ORDER_NOT_FOUND', 'That order does not exist.');
  res.json({ order: {
    id: o.id, reference: o.reference, status: o.status, totalCents: o.total_cents,
    createdAt: o.created_at,
    items: db.prepare('SELECT name, quantity, unit_price_cents AS unitCents FROM order_items WHERE order_id = ?').all(o.id),
    shipping: JSON.parse(o.shipping_json),
  }});
});

// Create an order from the cart. Body: { shipping: {...}, payment: {...} }
ordersRouter.post('/', (req, res) => {
  const { shipping, payment } = req.body || {};
  if (!shipping || !shipping.name || !shipping.address || !shipping.city || !shipping.postalCode) {
    return fail(res, 400, 'INVALID_SHIPPING', 'Complete shipping details are required.');
  }
  if (!payment || payment.method !== 'mock-card') {
    return fail(res, 400, 'INVALID_PAYMENT', "Payment method must be 'mock-card' for this demo.");
  }
  const cart = buildCart(req.user!.sub);
  if (!cart.items.length) {
    return fail(res, 400, 'EMPTY_CART', 'Your cart is empty.');
  }
  for (const line of cart.items) {
    const prow = db.prepare('SELECT stock FROM products WHERE id = ?').get(line.productId) as unknown as { stock: number } | undefined;
    if (!prow || prow.stock < line.quantity) {
      return fail(res, 409, 'INSUFFICIENT_STOCK', `Not enough stock for "${line.name}".`);
    }
  }

  const reference = 'ORD-' + Date.now().toString(36).toUpperCase() + '-' +
    Math.floor(Math.random() * 1000).toString().padStart(3, '0');

  try {
    db.exec('BEGIN');
    const orderId = db.prepare(
      'INSERT INTO orders (buyer_id, reference, status, total_cents, shipping_json) VALUES (?, ?, ?, ?, ?)'
    ).run(req.user!.sub, reference, 'confirmed', cart.subtotalCents, JSON.stringify(shipping)).lastInsertRowid;

    const insItem = db.prepare(
      'INSERT INTO order_items (order_id, product_id, name, quantity, unit_price_cents) VALUES (?, ?, ?, ?, ?)'
    );
    const decStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
    for (const line of cart.items) {
      insItem.run(orderId, line.productId, line.name, line.quantity, line.unitCents);
      decStock.run(line.quantity, line.productId);
    }
    db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.cartId);
    db.exec('COMMIT');

    return res.status(201).json({
      order: {
        reference, status: 'confirmed', totalCents: cart.subtotalCents,
        items: cart.items.map(l => ({ name: l.name, quantity: l.quantity, unitCents: l.unitCents })),
        shipping,
      },
    });
  } catch {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    return fail(res, 500, 'ORDER_FAILED', 'Could not place the order.');
  }
});
