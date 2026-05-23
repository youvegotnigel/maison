import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';

// In-memory DB by default — fast, isolated, perfect for an AUT.
// Set MAISON_DB_FILE to persist to disk if desired.
const dbPath = process.env.MAISON_DB_FILE || ':memory:';
export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

export function initSchema() {
  db.exec(`
    DROP TABLE IF EXISTS order_items;
    DROP TABLE IF EXISTS orders;
    DROP TABLE IF EXISTS cart_items;
    DROP TABLE IF EXISTS carts;
    DROP TABLE IF EXISTS discounts;
    DROP TABLE IF EXISTS product_images;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS users;

    CREATE TABLE users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('buyer','seller')),
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE products (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id   INTEGER NOT NULL REFERENCES users(id),
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category    TEXT NOT NULL DEFAULT 'Atelier',
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
      stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      published   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE product_images (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id  INTEGER NOT NULL REFERENCES products(id),
      url         TEXT NOT NULL,
      sort_order  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE discounts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id  INTEGER NOT NULL UNIQUE REFERENCES products(id),
      type        TEXT NOT NULL CHECK (type IN ('percentage','fixed')),
      value       INTEGER NOT NULL CHECK (value >= 0),
      active      INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE carts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_id    INTEGER NOT NULL UNIQUE REFERENCES users(id),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE cart_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      cart_id     INTEGER NOT NULL REFERENCES carts(id),
      product_id  INTEGER NOT NULL REFERENCES products(id),
      quantity    INTEGER NOT NULL CHECK (quantity > 0),
      UNIQUE (cart_id, product_id)
    );

    CREATE TABLE orders (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      buyer_id      INTEGER NOT NULL REFERENCES users(id),
      reference     TEXT NOT NULL UNIQUE,
      status        TEXT NOT NULL DEFAULT 'confirmed',
      total_cents   INTEGER NOT NULL,
      shipping_json TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE order_items (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id        INTEGER NOT NULL REFERENCES orders(id),
      product_id      INTEGER NOT NULL REFERENCES products(id),
      name            TEXT NOT NULL,
      quantity        INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL
    );
  `);
}

// Deterministic seed so automation can assert on known data.
const SEED_PASSWORD = 'Password123!';

const SEED_PRODUCTS = [
  { name: 'Noir Saffiano Tote', category: 'Bags', price: 285000, stock: 8, hue: '#1f1b18',
    desc: 'Hand-finished saffiano leather tote with palladium hardware and a suede-lined interior.' },
  { name: 'Aurum Chronograph Watch', category: 'Watches', price: 1240000, stock: 4, hue: '#3a2f1c',
    desc: 'Swiss automatic movement, 18k gold-plated case, sapphire crystal, alligator strap.' },
  { name: 'Cashmere Opera Scarf', category: 'Accessories', price: 96000, stock: 20, hue: '#4a3d4f',
    desc: 'Featherweight Mongolian cashmere woven in a 240-thread herringbone, hand-rolled edges.' },
  { name: 'Veluto Silk Eau de Parfum', category: 'Fragrance', price: 178000, stock: 15, hue: '#2c3a33',
    desc: 'Iris, oud and white amber in a faceted crystal flacon. 100ml, extrait concentration.' },
  { name: 'Onyx Leather Derby', category: 'Footwear', price: 142000, stock: 10, hue: '#161618',
    desc: 'Goodyear-welted calfskin derby, blake-stitched leather sole, hand-burnished toe.' },
  { name: 'Marble Atelier Sunglasses', category: 'Accessories', price: 68000, stock: 0, hue: '#2a2622',
    desc: 'Italian acetate frames with gradient lenses and titanium temples. Currently sold out.' },
  { name: 'Provence Linen Blazer', category: 'Apparel', price: 215000, stock: 6, hue: '#3d3a30',
    desc: 'Unstructured single-breasted blazer in washed Normandy linen, horn buttons.' },
  { name: 'Celeste Pearl Drop Earrings', category: 'Jewellery', price: 320000, stock: 5, hue: '#34303a',
    desc: 'South Sea pearls set in brushed white gold with a pavé diamond cap.' },
];

export function seed() {
  initSchema();
  const hash = bcrypt.hashSync(SEED_PASSWORD, 8);

  const insUser = db.prepare(
    'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)'
  );
  // Two known sellers + one known buyer for deterministic tests.
  const seller1 = insUser.run('seller@maison.test', hash, 'Atelier Maison', 'seller').lastInsertRowid;
  const seller2 = insUser.run('seller2@maison.test', hash, 'Maison Rive', 'seller').lastInsertRowid;
  insUser.run('buyer@maison.test', hash, 'Aurelie Dupont', 'buyer');

  const insProduct = db.prepare(
    `INSERT INTO products (seller_id, name, description, category, price_cents, stock)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insImage = db.prepare(
    'INSERT INTO product_images (product_id, url, sort_order) VALUES (?, ?, ?)'
  );
  const insDiscount = db.prepare(
    'INSERT INTO discounts (product_id, type, value, active) VALUES (?, ?, ?, 1)'
  );

  SEED_PRODUCTS.forEach((p, i) => {
    const owner = i >= 6 ? seller2 : seller1; // products 1-6 -> seller1, 7-8 -> seller2
    const pid = insProduct.run(owner, p.name, p.desc, p.category, p.price, p.stock).lastInsertRowid;
    insImage.run(pid, placeholderImage(p.name, p.hue), 0);
    // Give two products a seeded discount so the catalogue shows badges out of the box.
    if (i === 0) insDiscount.run(pid, 'percentage', 15);
    if (i === 4) insDiscount.run(pid, 'fixed', 20000);
  });
}

// Inline SVG data-URI so the app needs zero external image hosting.
export function placeholderImage(label, hue = '#1f1b18') {
  const initials = label.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${hue}"/><stop offset="1" stop-color="#0c0b0a"/>
    </linearGradient></defs>
    <rect width="800" height="800" fill="url(#g)"/>
    <circle cx="400" cy="320" r="150" fill="none" stroke="#c8a96a" stroke-width="1.5" opacity="0.5"/>
    <text x="400" y="360" font-family="Georgia, serif" font-size="160" fill="#c8a96a"
      text-anchor="middle" opacity="0.9">${initials}</text>
    <text x="400" y="620" font-family="Georgia, serif" font-size="34" fill="#e8e2d6"
      text-anchor="middle" letter-spacing="6" opacity="0.85">MAISON</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export const SEED_INFO = {
  password: SEED_PASSWORD,
  accounts: [
    { email: 'seller@maison.test', role: 'seller' },
    { email: 'seller2@maison.test', role: 'seller' },
    { email: 'buyer@maison.test', role: 'buyer' },
  ],
};
