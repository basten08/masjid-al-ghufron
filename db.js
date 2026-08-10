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
    type TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    account_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
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
];

async function migrate() {
  for (const stmt of SCHEMA_STATEMENTS) {
    await client.execute(stmt);
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
    const pemasukan = [
      'Infaq Jumat', 'Infaq Harian', 'Zakat', 'Sedekah',
      'Donasi Pembangunan', 'Kotak Amal', 'Donasi Lainnya'
    ];
    const pengeluaran = [
      'Operasional (Listrik/Air)', 'Kebersihan', 'Honorarium (Imam/Khatib/Marbot)',
      'Kegiatan & Acara', 'Pemeliharaan & Perbaikan', 'Santunan Sosial', 'Lain-lain'
    ];
    for (const name of pemasukan) await run('INSERT INTO categories (name, type) VALUES (?, ?)', [name, 'pemasukan']);
    for (const name of pengeluaran) await run('INSERT INTO categories (name, type) VALUES (?, ?)', [name, 'pengeluaran']);
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
