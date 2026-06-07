import { Router } from 'express';
import { db } from '../db.js';
import { serializeProduct, serializeCertificate } from '../pricing.js';
import { fail, requireRole } from '../auth.js';
import { placeholderImage, certificateSerial, materialForCategory, CERTIFICATE_ISSUER, CERTIFICATE_ISSUED_AT } from '../db.js';
const router = Router();
// ---- Public catalogue ----
// GET /api/v1/products?q=&category=&sort=&minPrice=&maxPrice=
router.get('/', (req, res) => {
    const { q, category, sort, minPrice, maxPrice } = req.query;
    let sql = 'SELECT * FROM products WHERE published = 1';
    const params = [];
    if (q) {
        sql += ' AND (name LIKE ? OR description LIKE ?)';
        params.push(`%${q}%`, `%${q}%`);
    }
    if (category) {
        sql += ' AND category = ?';
        params.push(category);
    }
    if (minPrice) {
        sql += ' AND price_cents >= ?';
        params.push(Number(minPrice));
    }
    if (maxPrice) {
        sql += ' AND price_cents <= ?';
        params.push(Number(maxPrice));
    }
    if (sort === 'price_asc')
        sql += ' ORDER BY price_cents ASC';
    else if (sort === 'price_desc')
        sql += ' ORDER BY price_cents DESC';
    else if (sort === 'name')
        sql += ' ORDER BY name ASC';
    else
        sql += ' ORDER BY created_at DESC, id DESC';
    const rows = db.prepare(sql).all(...params);
    res.json({ products: rows.map(serializeProduct), count: rows.length });
});
router.get('/categories', (_req, res) => {
    const rows = db.prepare('SELECT DISTINCT category FROM products WHERE published = 1 ORDER BY category').all();
    res.json({ categories: rows.map(r => r.category) });
});
router.get('/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id));
    if (!row)
        return fail(res, 404, 'PRODUCT_NOT_FOUND', 'That product does not exist.');
    res.json({ product: serializeProduct(row) });
});
// Public: certificate of authenticity for a product (or 404 if none).
router.get('/:id/certificate', (req, res) => {
    const row = db.prepare('SELECT * FROM certificates WHERE product_id = ?')
        .get(Number(req.params.id));
    if (!row)
        return fail(res, 404, 'CERTIFICATE_NOT_FOUND', 'No certificate exists for that product.');
    res.json({ certificate: serializeCertificate(row) });
});
// ---- Seller-owned operations ----
function getOwnedProduct(req, res) {
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id));
    if (!row) {
        fail(res, 404, 'PRODUCT_NOT_FOUND', 'That product does not exist.');
        return null;
    }
    if (row.seller_id !== req.user.sub) {
        fail(res, 403, 'NOT_OWNER', 'You can only modify products you own.');
        return null;
    }
    return row;
}
// List the seller's own products
router.get('/seller/mine', requireRole('seller'), (req, res) => {
    const rows = db.prepare('SELECT * FROM products WHERE seller_id = ? ORDER BY created_at DESC, id DESC').all(req.user.sub);
    res.json({ products: rows.map(serializeProduct) });
});
// Create a listing
router.post('/', requireRole('seller'), (req, res) => {
    const { name, description = '', category = 'Atelier', priceCents, stock = 0 } = req.body || {};
    if (!name || !String(name).trim()) {
        return fail(res, 400, 'INVALID_NAME', 'Product name is required.');
    }
    if (!Number.isInteger(priceCents) || priceCents < 0) {
        return fail(res, 400, 'INVALID_PRICE', 'priceCents must be a non-negative integer (price in cents).');
    }
    if (!Number.isInteger(stock) || stock < 0) {
        return fail(res, 400, 'INVALID_STOCK', 'stock must be a non-negative integer.');
    }
    const id = db.prepare(`INSERT INTO products (seller_id, name, description, category, price_cents, stock)
     VALUES (?, ?, ?, ?, ?, ?)`).run(req.user.sub, String(name).trim(), description, category, priceCents, stock).lastInsertRowid;
    db.prepare('INSERT INTO product_images (product_id, url, sort_order) VALUES (?, ?, 0)')
        .run(id, placeholderImage(name));
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    res.status(201).json({ product: serializeProduct(row) });
});
// Update price / details / stock
router.patch('/:id', requireRole('seller'), (req, res) => {
    const row = getOwnedProduct(req, res);
    if (!row)
        return;
    const fields = [];
    const params = [];
    const { name, description, category, priceCents, stock, published } = req.body || {};
    if (name !== undefined) {
        fields.push('name = ?');
        params.push(String(name).trim());
    }
    if (description !== undefined) {
        fields.push('description = ?');
        params.push(description);
    }
    if (category !== undefined) {
        fields.push('category = ?');
        params.push(category);
    }
    if (priceCents !== undefined) {
        if (!Number.isInteger(priceCents) || priceCents < 0)
            return fail(res, 400, 'INVALID_PRICE', 'priceCents must be a non-negative integer.');
        fields.push('price_cents = ?');
        params.push(priceCents);
    }
    if (stock !== undefined) {
        if (!Number.isInteger(stock) || stock < 0)
            return fail(res, 400, 'INVALID_STOCK', 'stock must be a non-negative integer.');
        fields.push('stock = ?');
        params.push(stock);
    }
    if (published !== undefined) {
        fields.push('published = ?');
        params.push(published ? 1 : 0);
    }
    if (!fields.length)
        return fail(res, 400, 'NO_FIELDS', 'No updatable fields were provided.');
    params.push(row.id);
    db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(row.id);
    res.json({ product: serializeProduct(updated) });
});
// Add an image (URL or data-URI). Body: { url }
router.post('/:id/images', requireRole('seller'), (req, res) => {
    const row = getOwnedProduct(req, res);
    if (!row)
        return;
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
        return fail(res, 400, 'INVALID_IMAGE', 'An image url is required.');
    }
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM product_images WHERE product_id = ?').get(row.id).m;
    db.prepare('INSERT INTO product_images (product_id, url, sort_order) VALUES (?, ?, ?)')
        .run(row.id, url, max + 1);
    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(row.id);
    res.status(201).json({ product: serializeProduct(updated) });
});
// Set / replace a discount. Body: { type: 'percentage'|'fixed', value }
router.put('/:id/discount', requireRole('seller'), (req, res) => {
    const row = getOwnedProduct(req, res);
    if (!row)
        return;
    const { type, value } = req.body || {};
    if (type !== 'percentage' && type !== 'fixed') {
        return fail(res, 400, 'INVALID_DISCOUNT_TYPE', "Discount type must be 'percentage' or 'fixed'.");
    }
    if (!Number.isInteger(value) || value < 0) {
        return fail(res, 400, 'INVALID_DISCOUNT_VALUE', 'Discount value must be a non-negative integer.');
    }
    if (type === 'percentage' && value > 100) {
        return fail(res, 400, 'INVALID_DISCOUNT_VALUE', 'Percentage discount cannot exceed 100.');
    }
    db.prepare('DELETE FROM discounts WHERE product_id = ?').run(row.id);
    db.prepare('INSERT INTO discounts (product_id, type, value, active) VALUES (?, ?, ?, 1)')
        .run(row.id, type, value);
    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(row.id);
    res.json({ product: serializeProduct(updated) });
});
// Remove a discount
router.delete('/:id/discount', requireRole('seller'), (req, res) => {
    const row = getOwnedProduct(req, res);
    if (!row)
        return;
    db.prepare('DELETE FROM discounts WHERE product_id = ?').run(row.id);
    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(row.id);
    res.json({ product: serializeProduct(updated) });
});
// Protected: (re)issue a certificate. Seller-only, owner-only, idempotent.
router.post('/:id/certificate', requireRole('seller'), (req, res) => {
    const product = db.prepare('SELECT * FROM products WHERE id = ?')
        .get(Number(req.params.id));
    if (!product)
        return fail(res, 404, 'PRODUCT_NOT_FOUND', 'That product does not exist.');
    if (product.seller_id !== req.user.sub) {
        return fail(res, 403, 'FORBIDDEN_NOT_OWNER', 'You can only issue certificates for products you own.');
    }
    const serial = certificateSerial(product.id);
    const material = materialForCategory(product.category);
    db.prepare('DELETE FROM certificates WHERE product_id = ?').run(product.id);
    db.prepare('INSERT INTO certificates (product_id, serial_no, issuer, material, issued_at) VALUES (?, ?, ?, ?, ?)')
        .run(product.id, serial, CERTIFICATE_ISSUER, material, CERTIFICATE_ISSUED_AT);
    const row = db.prepare('SELECT * FROM certificates WHERE product_id = ?')
        .get(product.id);
    res.status(201).json({ certificate: serializeCertificate(row) });
});
export default router;
//# sourceMappingURL=products.js.map