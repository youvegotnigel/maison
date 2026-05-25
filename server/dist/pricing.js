import { db } from './db.js';
// Compute the effective price given a base price and an optional discount row.
export function effectivePrice(priceCents, discount) {
    if (!discount || !discount.active)
        return priceCents;
    if (discount.type === 'percentage') {
        return Math.max(0, Math.round(priceCents * (1 - discount.value / 100)));
    }
    // fixed: value is an amount in cents to subtract
    return Math.max(0, priceCents - discount.value);
}
// Prepared statements are created lazily so they bind after the schema exists
// (seed() runs at server boot, after this module is imported).
let imagesStmt;
let discountStmt;
let sellerStmt;
function stmts() {
    if (!imagesStmt) {
        imagesStmt = db.prepare('SELECT url FROM product_images WHERE product_id = ? ORDER BY sort_order, id');
        discountStmt = db.prepare('SELECT type, value, active FROM discounts WHERE product_id = ? AND active = 1');
        sellerStmt = db.prepare('SELECT name FROM users WHERE id = ?');
    }
    return { imagesStmt: imagesStmt, discountStmt: discountStmt, sellerStmt: sellerStmt };
}
// Single source of truth for the JSON shape of a product across all endpoints.
export function serializeProduct(row) {
    const { imagesStmt, discountStmt, sellerStmt } = stmts();
    const images = imagesStmt.all(row.id).map(r => r.url);
    const discount = discountStmt.get(row.id) ?? null;
    const effective = effectivePrice(row.price_cents, discount);
    const seller = sellerStmt.get(row.seller_id);
    return {
        id: row.id,
        sellerId: row.seller_id,
        sellerName: seller ? seller.name : null,
        name: row.name,
        description: row.description,
        category: row.category,
        priceCents: row.price_cents,
        effectiveCents: effective,
        onSale: effective < row.price_cents,
        discount: discount ? { type: discount.type, value: discount.value } : null,
        stock: row.stock,
        inStock: row.stock > 0,
        published: !!row.published,
        images,
        image: images[0] || null,
    };
}
export function money(cents) {
    return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
//# sourceMappingURL=pricing.js.map