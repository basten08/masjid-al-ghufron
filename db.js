const { createClient } = require('@libsql/client');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const url = process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, 'data', 'keuangan.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (url.startsWith('file:')) {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

const client = createClient(authToken ? { url, authToken } : { url });

async function run(sql, params) {
  const result = await client.execute({ sql, args: params ?? [] });
  return { lastInsertRowid: Number(result.lastInsertRowid ?? 0), changes: result.rowsAffected };
}

async function all(sql, params) {
  const result = await client.execute({ sql, args: params ?? [] });
  return result.rows;
}

async function get(sql, params) {
  const rows = await all(sql, params);
  return rows[0];
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

async function createUser({ username, name, role, password }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const password_hash = hashPassword(password, salt);
  return run('INSERT INTO users (username, name, role, salt, password_hash) VALUES (?, ?, ?, ?, ?)',
    [username, name, role, salt, password_hash]);
}

function verifyPassword(user, password) {
  const attempt = hashPassword(password, user.salt);
  const a = Buffer.from(attempt, 'hex');
  const b = Buffer.from(user.password_hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    initial_balance REAL NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    group_type TEXT NOT NULL DEFAULT 'operasional'
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    fund_source TEXT NOT NULL DEFAULT 'operasional',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(account_id) REFERENCES accounts(id),
    FOREIGN KEY(category_id) REFERENCES categories(id)
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS berita (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    tag TEXT NOT NULL DEFAULT 'Pengumuman',
    content TEXT NOT NULL,
    image TEXT,
    post_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS agenda (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    tag TEXT NOT NULL DEFAULT 'Segera',
    date_label TEXT NOT NULL,
    location TEXT,
    image TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
];

async function migrate() {
  for (const stmt of SCHEMA_STATEMENTS) {
    await client.execute(stmt);
  }

  try {
    await client.execute("ALTER TABLE categories ADD COLUMN group_type TEXT NOT NULL DEFAULT 'operasional'");
    // Kolom baru ditambahkan ke database lama: tandai kategori donasi pembangunan yang sudah ada.
    await run("UPDATE categories SET group_type = 'pembangunan' WHERE name = 'Donasi Pembangunan'");
  } catch (err) {
    if (!/duplicate column/i.test(err.message)) throw err;
  }

  try {
    await client.execute("ALTER TABLE transactions ADD COLUMN fund_source TEXT NOT NULL DEFAULT 'operasional'");
    // Kolom baru: isi dari kelompok dana kategori masing-masing transaksi yang sudah ada.
    await client.execute(`
      UPDATE transactions
      SET fund_source = (SELECT group_type FROM categories WHERE categories.id = transactions.category_id)
    `);
  } catch (err) {
    if (!/duplicate column/i.test(err.message)) throw err;
  }
}

async function seedIfEmpty() {
  const accCount = (await get('SELECT COUNT(*) AS c FROM accounts')).c;
  if (accCount === 0) {
    await run('INSERT INTO accounts (name, type, initial_balance) VALUES (?, ?, ?)', ['Kas Tunai', 'tunai', 0]);
    await run('INSERT INTO accounts (name, type, initial_balance) VALUES (?, ?, ?)', ['Rekening Bank', 'bank', 0]);
  }

  const catCount = (await get('SELECT COUNT(*) AS c FROM categories')).c;
  if (catCount === 0) {
    const pemasukanOperasional = ['Infaq Jumat', 'Infaq Harian', 'Zakat', 'Sedekah', 'Kotak Amal', 'Donasi Lainnya'];
    const pemasukanPembangunan = ['Donasi Pembangunan'];
    const pengeluaranOperasional = [
      'Operasional (Listrik/Air)', 'Kebersihan', 'Honorarium (Imam/Khatib/Marbot)',
      'Kegiatan & Acara', 'Pemeliharaan & Perbaikan', 'Santunan Sosial', 'Lain-lain'
    ];
    const pengeluaranPembangunan = ['Pembangunan & Renovasi'];

    const insertCat = (name, type, group) =>
      run('INSERT INTO categories (name, type, group_type) VALUES (?, ?, ?)', [name, type, group]);

    for (const name of pemasukanOperasional) await insertCat(name, 'pemasukan', 'operasional');
    for (const name of pemasukanPembangunan) await insertCat(name, 'pemasukan', 'pembangunan');
    for (const name of pengeluaranOperasional) await insertCat(name, 'pengeluaran', 'operasional');
    for (const name of pengeluaranPembangunan) await insertCat(name, 'pengeluaran', 'pembangunan');
  }

  const userCount = (await get('SELECT COUNT(*) AS c FROM users')).c;
  if (userCount === 0) {
    await createUser({ username: 'admin', name: 'Administrator', role: 'admin', password: 'admin123' });
  }
}

async function init() {
  await migrate();
  await seedIfEmpty();
}

module.exports = { get, all, run, hashPassword, createUser, verifyPassword, init };
