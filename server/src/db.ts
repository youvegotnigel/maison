import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';

export interface DbUser {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: 'buyer' | 'seller';
  first_name: string | null;
  last_name: string | null;
  gender: string | null;
  phone: string | null;
  date_of_birth: string;
  created_at: string;
}

export interface DbProduct {
  id: number;
  seller_id: number;
  name: string;
  description: string;
  category: string;
  price_cents: number;
  stock: number;
  published: number;
  created_at: string;
}

export interface DbCartItem {
  id: number;
  cart_id: number;
  product_id: number;
  quantity: number;
}

export interface DbOrder {
  id: number;
  buyer_id: number;
  reference: string;
  status: string;
  total_cents: number;
  shipping_json: string;
  created_at: string;
}

export interface DbOrderItem {
  id: number;
  order_id: number;
  product_id: number;
  name: string;
  quantity: number;
  unit_price_cents: number;
}

// In-memory DB by default — fast, isolated, perfect for an AUT.
// Set MAISON_DB_FILE to persist to disk if desired.
const dbPath = process.env.MAISON_DB_FILE || ':memory:';
export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

export function initSchema(): void {
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
      first_name    TEXT,
      last_name     TEXT,
      gender        TEXT CHECK (gender IN ('female','male','non-binary','prefer_not_to_say')),
      phone         TEXT,
      date_of_birth TEXT NOT NULL,
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
  // Bags
  { name: 'Stone Calf Bucket Bag', category: 'Bags', price: 195000, stock: 7, hue: '#a89e90',
    desc: 'Softly structured bucket bag in stone-grey vegetable-tanned calf leather, brass clip closure.' },
  { name: 'Ivory Croc Clutch', category: 'Bags', price: 340000, stock: 5, hue: '#e4dcd0',
    desc: 'Crocodile-embossed ivory leather clutch with a gilt push-lock fastening and chain strap.' },
  // Watches
  { name: 'Silver Moon Watch', category: 'Watches', price: 890000, stock: 3, hue: '#7a7a80',
    desc: 'Swiss-made moonphase dress watch, sterling silver dial, sapphire crystal, mesh bracelet.' },
  { name: 'Bronze Field Watch', category: 'Watches', price: 560000, stock: 6, hue: '#6b4c2a',
    desc: 'Patinated bronze case, matte khaki dial, tritium lume indices, canvas strap. Water-resistant to 100m.' },
  // Accessories
  { name: 'Alpaca Cable Gloves', category: 'Accessories', price: 72000, stock: 14, hue: '#4a3d2e',
    desc: 'Hand-knitted royal alpaca gloves in a classic cable pattern. Cashmere-lined for extra warmth.' },
  { name: 'Navy Silk Pocket Square', category: 'Accessories', price: 18000, stock: 30, hue: '#1a2a4a',
    desc: 'Hand-rolled navy silk pocket square with a tonal paisley jacquard weave. Made in Como.' },
  // Fragrance
  { name: 'Cedar Amber Parfum', category: 'Fragrance', price: 145000, stock: 12, hue: '#3a2c1a',
    desc: 'Warm cedar, labdanum and dried amber resin in an oak-capped flacon. 75ml, parfum concentration.' },
  { name: 'White Rose Cologne', category: 'Fragrance', price: 98000, stock: 18, hue: '#e8e4de',
    desc: 'Fresh Bulgarian rose, bergamot and sandalwood. Light summer cologne in a frosted glass bottle. 100ml.' },
  // Footwear
  { name: 'Tan Grain Loafer', category: 'Footwear', price: 165000, stock: 9, hue: '#8a5c2a',
    desc: 'Full-grain tan leather penny loafer, leather-lined, leather sole with brass penny keeper.' },
  { name: 'Moss Suede Mule', category: 'Footwear', price: 118000, stock: 6, hue: '#3a4a2c',
    desc: 'Open-back mule in moss-green split suede, block heel, padded leather footbed.' },
  // Apparel
  { name: 'Navy Roll Neck', category: 'Apparel', price: 185000, stock: 9, hue: '#1a2a3a',
    desc: 'Two-ply Scottish cashmere roll-neck sweater in deep navy. Ribbed cuffs and hem.' },
  { name: 'Stone Wool Trench Coat', category: 'Apparel', price: 420000, stock: 4, hue: '#b0aa9a',
    desc: 'Double-breasted trench coat in pure wool gabardine, storm flap, D-ring belt, horn buttons.' },
  // Jewellery
  { name: 'Gold Signet Ring', category: 'Jewellery', price: 185000, stock: 7, hue: '#b89830',
    desc: 'Solid 18k yellow gold oval signet ring, hand-engraved crest, comfort-fit band.' },
  { name: 'Pearl Cuff Bracelet', category: 'Jewellery', price: 240000, stock: 5, hue: '#dedad4',
    desc: 'Freshwater pearl strand set in an open sterling silver cuff, rhodium-plated finish.' },
];

export function seed(): void {
  initSchema();
  const hash = bcrypt.hashSync(SEED_PASSWORD, 8);

  const insUser = db.prepare(
    'INSERT INTO users (email, password_hash, name, role, first_name, last_name, date_of_birth) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  // Two known sellers + one known buyer for deterministic tests.
  const seller1 = Number(insUser.run('seller@maison.test', hash, 'Atelier Maison', 'seller', null, null, '1980-03-15').lastInsertRowid);
  const seller2 = Number(insUser.run('seller2@maison.test', hash, 'Maison Rive', 'seller', null, null, '1975-09-22').lastInsertRowid);
  insUser.run('buyer@maison.test', hash, 'Aurelie Dupont', 'buyer', 'Aurelie', 'Dupont', '1990-06-10');

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
    const owner = i >= 11 ? seller2 : seller1; // products 1-11 -> seller1, 12+ -> seller2
    const pid = Number(insProduct.run(owner, p.name, p.desc, p.category, p.price, p.stock).lastInsertRowid);
    insImage.run(pid, placeholderImage(p.name, p.hue), 0);
    // Give two products a seeded discount so the catalogue shows badges out of the box.
    if (i === 0) insDiscount.run(pid, 'percentage', 15);
    if (i === 4) insDiscount.run(pid, 'fixed', 20000);
  });
}

// Inline SVG data-URI so the app needs zero external image hosting.
export function placeholderImage(label: string, hue = '#1f1b18'): string {
  const initials = label.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();

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
