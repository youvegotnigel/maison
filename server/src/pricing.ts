import { db, type DbProduct } from './db.js';
import type { StatementSync } from 'node:sqlite';

export interface Discount {
  type: 'percentage' | 'fixed';
  value: number;
  active: number;
}

export interface SerializedProduct {
  id: number;
  sellerId: number;
  sellerName: string | null;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  effectiveCents: number;
  onSale: boolean;
  discount: { type: string; value: number } | null;
  stock: number;
  inStock: boolean;
  published: boolean;
  images: string[];
  image: string | null;
}

// Compute the effective price given a base price and an optional discount row.
export function effectivePrice(priceCents: number, discount: Discount | null | undefined): number {
  if (!discount || !discount.active) return priceCents;
  if (discount.type === 'percentage') {
    return Math.max(0, Math.round(priceCents * (1 - discount.value / 100)));
  }
  // fixed: value is an amount in cents to subtract
  return Math.max(0, priceCents - discount.value);
}

// Prepared statements are created lazily so they bind after the schema exists
// (seed() runs at server boot, after this module is imported).
let imagesStmt: StatementSync | undefined;
let discountStmt: StatementSync | undefined;
let sellerStmt: StatementSync | undefined;
function stmts(): { imagesStmt: StatementSync; discountStmt: StatementSync; sellerStmt: StatementSync } {
  if (!imagesStmt) {
    imagesStmt = db.prepare('SELECT url FROM product_images WHERE product_id = ? ORDER BY sort_order, id');
    discountStmt = db.prepare('SELECT type, value, active FROM discounts WHERE product_id = ? AND active = 1');
    sellerStmt = db.prepare('SELECT name FROM users WHERE id = ?');
  }
  return { imagesStmt: imagesStmt!, discountStmt: discountStmt!, sellerStmt: sellerStmt! };
}



// Single source of truth for the JSON shape of a product across all endpoints.
export function serializeProduct(row: DbProduct): SerializedProduct {
  const { imagesStmt, discountStmt, sellerStmt } = stmts();
  const images = (imagesStmt.all(row.id) as Array<{ url: string }>).map(r => r.url);
  const discount = (discountStmt.get(row.id) as Discount | undefined) ?? null;
  const effective = effectivePrice(row.price_cents, discount);
  const seller = sellerStmt.get(row.seller_id) as { name: string } | undefined;
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

export function money(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
