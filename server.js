const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const db = require('./db.js');
const { createUser, verifyPassword } = db;

const PORT = process.env.PORT || 4321;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 jam

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', (c) => (chunks += c));
    req.on('end', () => {
      if (!chunks) return resolve({});
      try {
        resolve(JSON.parse(chunks));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// ---------- Sessions ----------

const sessions = new Map(); // token -> { userId, username, name, role, expiresAt }

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return cookies;
}

function createSession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, {
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    expiresAt: Date.now() + SESSION_MAX_AGE_MS,
  });
  return token;
}

function getSession(req) {
  const token = parseCookies(req).sid;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_MS / 1000}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
}

// ---------- Helpers ----------

async function computeAccountBalances() {
  const accounts = await db.all('SELECT * FROM accounts ORDER BY id');
  const sums = await db.all(`
    SELECT account_id,
      SUM(CASE WHEN type = 'pemasukan' THEN amount ELSE 0 END) AS masuk,
      SUM(CASE WHEN type = 'pengeluaran' THEN amount ELSE 0 END) AS keluar
    FROM transactions GROUP BY account_id
  `);
  const sumMap = new Map(sums.map((s) => [s.account_id, s]));
  return accounts.map((a) => {
    const s = sumMap.get(a.id) || { masuk: 0, keluar: 0 };
    return {
      ...a,
      total_masuk: s.masuk || 0,
      total_keluar: s.keluar || 0,
      saldo: a.initial_balance + (s.masuk || 0) - (s.keluar || 0),
    };
  });
}

function buildTransactionQuery(query) {
  const clauses = [];
  const params = {};
  if (query.get('start')) {
    clauses.push('t.date >= $start');
    params.$start = query.get('start');
  }
  if (query.get('end')) {
    clauses.push('t.date <= $end');
    params.$end = query.get('end');
  }
  if (query.get('type')) {
    clauses.push('t.type = $type');
    params.$type = query.get('type');
  }
  if (query.get('account_id')) {
    clauses.push('t.account_id = $account_id');
    params.$account_id = Number(query.get('account_id'));
  }
  if (query.get('category_id')) {
    clauses.push('t.category_id = $category_id');
    params.$category_id = Number(query.get('category_id'));
  }
  if (query.get('group')) {
    clauses.push('c.group_type = $group');
    params.$group = query.get('group');
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  return { where, params };
}

async function listTransactions(query) {
  const { where, params } = buildTransactionQuery(query);
  const sql = `
    SELECT t.*, a.name AS account_name, c.name AS category_name
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    JOIN categories c ON c.id = t.category_id
    ${where}
    ORDER BY t.date DESC, t.id DESC
  `;
  return db.all(sql, params);
}

function groupLabelOf(group) {
  if (group === 'pembangunan') return 'Dana Pembangunan';
  if (group === 'operasional') return 'Kas Operasional';
  return 'Semua Dana';
}

function toExcelHtml(rows, title) {
  const fmt = (n) => new Intl.NumberFormat('id-ID').format(n);
  let totalMasuk = 0;
  let totalKeluar = 0;
  const trs = rows.map((r) => {
    if (r.type === 'pemasukan') totalMasuk += r.amount;
    else totalKeluar += r.amount;
    return `<tr>
      <td>${r.date}</td>
      <td>${r.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'}</td>
      <td>${r.category_name}</td>
      <td>${r.account_name}</td>
      <td>${(r.description || '').replace(/</g, '&lt;')}</td>
      <td align="right">${r.type === 'pemasukan' ? fmt(r.amount) : ''}</td>
      <td align="right">${r.type === 'pengeluaran' ? fmt(r.amount) : ''}</td>
    </tr>`;
  }).join('\n');

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="utf-8"><title>${title}</title></head>
  <body>
    <table border="1">
      <tr><th colspan="7">${title}</th></tr>
      <tr>
        <th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Kas/Rekening</th>
        <th>Keterangan</th><th>Pemasukan</th><th>Pengeluaran</th>
      </tr>
      ${trs}
      <tr>
        <td colspan="5" align="right"><b>Total</b></td>
        <td align="right"><b>${fmt(totalMasuk)}</b></td>
        <td align="right"><b>${fmt(totalKeluar)}</b></td>
      </tr>
      <tr>
        <td colspan="5" align="right"><b>Saldo (Pemasukan - Pengeluaran)</b></td>
        <td colspan="2" align="right"><b>${fmt(totalMasuk - totalKeluar)}</b></td>
      </tr>
    </table>
  </body>
  </html>`;
}

function toExcelHtmlAnnual(year, months, byCategory, groupLabel) {
  const fmt = (n) => new Intl.NumberFormat('id-ID').format(n);
  const monthRows = months.map((m) => `<tr>
      <td>${m.label}</td>
      <td align="right">${fmt(m.masuk)}</td>
      <td align="right">${fmt(m.keluar)}</td>
      <td align="right">${fmt(m.masuk - m.keluar)}</td>
      <td align="right">${fmt(m.saldoAkhir)}</td>
    </tr>`).join('\n');
  const totalMasuk = months.reduce((s, m) => s + m.masuk, 0);
  const totalKeluar = months.reduce((s, m) => s + m.keluar, 0);

  const catRows = byCategory.map((c) => `<tr>
      <td>${c.category_name}</td>
      <td>${c.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'}</td>
      <td align="right">${fmt(c.total)}</td>
    </tr>`).join('\n');

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="utf-8"><title>Laporan Tahunan ${year} - ${groupLabel}</title></head>
  <body>
    <table border="1">
      <tr><th colspan="5">Laporan Tahunan Masjid Al-Ghufron - ${groupLabel} - ${year}</th></tr>
      <tr><th>Bulan</th><th>Pemasukan</th><th>Pengeluaran</th><th>Selisih</th><th>Saldo Akhir Bulan</th></tr>
      ${monthRows}
      <tr>
        <td align="right"><b>Total ${year}</b></td>
        <td align="right"><b>${fmt(totalMasuk)}</b></td>
        <td align="right"><b>${fmt(totalKeluar)}</b></td>
        <td align="right"><b>${fmt(totalMasuk - totalKeluar)}</b></td>
        <td></td>
      </tr>
    </table>
    <br>
    <table border="1">
      <tr><th colspan="3">Rekap per Kategori - ${year}</th></tr>
      <tr><th>Kategori</th><th>Jenis</th><th>Total</th></tr>
      ${catRows}
    </table>
  </body>
  </html>`;
}

// ---------- Router ----------

const routes = [];
function route(method, pattern, handler, opts = {}) {
  routes.push({ method, pattern, handler, role: opts.role });
}

function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const parts = r.pattern.split('/').filter(Boolean);
    const actual = pathname.split('/').filter(Boolean);
    if (parts.length !== actual.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(':')) {
        params[parts[i].slice(1)] = actual[i];
      } else if (parts[i] !== actual[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route: r, params };
  }
  return null;
}

// ---------- Auth routes (public) ----------

route('POST', '/api/auth/login', async (req, res) => {
  const body = await readBody(req);
  if (!body.username || !body.password) return sendJson(res, 400, { error: 'Username dan password wajib diisi' });
  const user = await db.get('SELECT * FROM users WHERE username = ?', [body.username]);
  if (!user || !verifyPassword(user, body.password)) {
    return sendJson(res, 401, { error: 'Username atau password salah' });
  }
  const token = createSession(user);
  setSessionCookie(res, token);
  sendJson(res, 200, { name: user.name, username: user.username, role: user.role });
});

route('POST', '/api/auth/logout', (req, res) => {
  const token = parseCookies(req).sid;
  if (token) sessions.delete(token);
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
});

route('GET', '/api/auth/me', (req, res) => {
  const session = getSession(req);
  if (!session) return sendJson(res, 401, { error: 'Belum login' });
  sendJson(res, 200, { name: session.name, username: session.username, role: session.role });
});

route('PUT', '/api/auth/password', async (req, res) => {
  const session = getSession(req);
  if (!session) return sendJson(res, 401, { error: 'Belum login' });
  const body = await readBody(req);
  if (!body.oldPassword || !body.newPassword) return sendJson(res, 400, { error: 'Password lama dan baru wajib diisi' });
  const user = await db.get('SELECT * FROM users WHERE id = ?', [session.userId]);
  if (!verifyPassword(user, body.oldPassword)) return sendJson(res, 400, { error: 'Password lama salah' });
  if (String(body.newPassword).length < 6) return sendJson(res, 400, { error: 'Password baru minimal 6 karakter' });
  const salt = crypto.randomBytes(16).toString('hex');
  const password_hash = db.hashPassword(body.newPassword, salt);
  await db.run('UPDATE users SET salt = ?, password_hash = ? WHERE id = ?', [salt, password_hash, user.id]);
  sendJson(res, 200, { ok: true });
});

// Accounts (view: any logged-in user, manage: admin only)
route('GET', '/api/accounts', async (req, res) => {
  sendJson(res, 200, await computeAccountBalances());
});
route('POST', '/api/accounts', async (req, res) => {
  const body = await readBody(req);
  if (!body.name || !body.type) return sendJson(res, 400, { error: 'name dan type wajib diisi' });
  const info = await db.run('INSERT INTO accounts (name, type, initial_balance) VALUES (?, ?, ?)',
    [body.name, body.type, Number(body.initial_balance) || 0]);
  sendJson(res, 201, { id: info.lastInsertRowid });
}, { role: 'admin' });
route('PUT', '/api/accounts/:id', async (req, res, params) => {
  const body = await readBody(req);
  await db.run('UPDATE accounts SET name = ?, type = ?, initial_balance = ? WHERE id = ?',
    [body.name, body.type, Number(body.initial_balance) || 0, Number(params.id)]);
  sendJson(res, 200, { ok: true });
}, { role: 'admin' });
route('DELETE', '/api/accounts/:id', async (req, res, params) => {
  const used = (await db.get('SELECT COUNT(*) AS c FROM transactions WHERE account_id = ?', [Number(params.id)])).c;
  if (used > 0) return sendJson(res, 400, { error: 'Tidak bisa hapus: kas/rekening masih dipakai transaksi' });
  await db.run('DELETE FROM accounts WHERE id = ?', [Number(params.id)]);
  sendJson(res, 200, { ok: true });
}, { role: 'admin' });

// Categories (view: any logged-in user, manage: admin only)
route('GET', '/api/categories', async (req, res) => {
  sendJson(res, 200, await db.all('SELECT * FROM categories ORDER BY type, name'));
});
route('POST', '/api/categories', async (req, res) => {
  const body = await readBody(req);
  if (!body.name || !body.type) return sendJson(res, 400, { error: 'name dan type wajib diisi' });
  const group = body.group_type === 'pembangunan' ? 'pembangunan' : 'operasional';
  const info = await db.run('INSERT INTO categories (name, type, group_type) VALUES (?, ?, ?)', [body.name, body.type, group]);
  sendJson(res, 201, { id: info.lastInsertRowid });
}, { role: 'admin' });
route('PUT', '/api/categories/:id', async (req, res, params) => {
  const body = await readBody(req);
  const group = body.group_type === 'pembangunan' ? 'pembangunan' : 'operasional';
  await db.run('UPDATE categories SET name = ?, type = ?, group_type = ? WHERE id = ?', [body.name, body.type, group, Number(params.id)]);
  sendJson(res, 200, { ok: true });
}, { role: 'admin' });
route('DELETE', '/api/categories/:id', async (req, res, params) => {
  const used = (await db.get('SELECT COUNT(*) AS c FROM transactions WHERE category_id = ?', [Number(params.id)])).c;
  if (used > 0) return sendJson(res, 400, { error: 'Tidak bisa hapus: kategori masih dipakai transaksi' });
  await db.run('DELETE FROM categories WHERE id = ?', [Number(params.id)]);
  sendJson(res, 200, { ok: true });
}, { role: 'admin' });

// Transactions (admin & bendahara)
route('GET', '/api/transactions', async (req, res, params, query) => {
  sendJson(res, 200, await listTransactions(query));
});
route('POST', '/api/transactions', async (req, res) => {
  const body = await readBody(req);
  const required = ['date', 'type', 'account_id', 'category_id', 'amount'];
  for (const f of required) {
    if (body[f] === undefined || body[f] === null || body[f] === '') {
      return sendJson(res, 400, { error: `Field ${f} wajib diisi` });
    }
  }
  const info = await db.run(`
    INSERT INTO transactions (date, type, account_id, category_id, amount, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [body.date, body.type, Number(body.account_id), Number(body.category_id), Number(body.amount), body.description || '']);
  sendJson(res, 201, { id: info.lastInsertRowid });
});
route('PUT', '/api/transactions/:id', async (req, res, params) => {
  const body = await readBody(req);
  await db.run(`
    UPDATE transactions SET date = ?, type = ?, account_id = ?, category_id = ?, amount = ?, description = ?
    WHERE id = ?
  `, [body.date, body.type, Number(body.account_id), Number(body.category_id), Number(body.amount), body.description || '', Number(params.id)]);
  sendJson(res, 200, { ok: true });
});
route('DELETE', '/api/transactions/:id', async (req, res, params) => {
  await db.run('DELETE FROM transactions WHERE id = ?', [Number(params.id)]);
  sendJson(res, 200, { ok: true });
});

// Dashboard
route('GET', '/api/dashboard', async (req, res) => {
  const accounts = await computeAccountBalances();
  const totalSaldo = accounts.reduce((s, a) => s + a.saldo, 0);

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const monthPrefix = `${y}-${m}`;

  const monthRow = await db.get(`
    SELECT
      SUM(CASE WHEN type = 'pemasukan' THEN amount ELSE 0 END) AS masuk,
      SUM(CASE WHEN type = 'pengeluaran' THEN amount ELSE 0 END) AS keluar
    FROM transactions WHERE date LIKE ?
  `, [`${monthPrefix}%`]);

  const byCategory = await db.all(`
    SELECT c.name AS category_name, c.type, c.group_type, SUM(t.amount) AS total
    FROM transactions t JOIN categories c ON c.id = t.category_id
    WHERE t.date LIKE ?
    GROUP BY t.category_id
    ORDER BY total DESC
  `, [`${monthPrefix}%`]);

  const recent = await db.all(`
    SELECT t.*, a.name AS account_name, c.name AS category_name, c.group_type AS category_group
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    JOIN categories c ON c.id = t.category_id
    ORDER BY t.date DESC, t.id DESC LIMIT 8
  `);

  const groupTotals = await db.all(`
    SELECT c.group_type AS group_type,
      SUM(CASE WHEN t.type = 'pemasukan' THEN t.amount ELSE 0 END) AS masuk,
      SUM(CASE WHEN t.type = 'pengeluaran' THEN t.amount ELSE 0 END) AS keluar
    FROM transactions t JOIN categories c ON c.id = t.category_id
    GROUP BY c.group_type
  `);
  const groupSaldo = { operasional: 0, pembangunan: 0 };
  for (const g of groupTotals) groupSaldo[g.group_type] = (g.masuk || 0) - (g.keluar || 0);

  const monthGroupTotals = await db.all(`
    SELECT c.group_type AS group_type,
      SUM(CASE WHEN t.type = 'pemasukan' THEN t.amount ELSE 0 END) AS masuk,
      SUM(CASE WHEN t.type = 'pengeluaran' THEN t.amount ELSE 0 END) AS keluar
    FROM transactions t JOIN categories c ON c.id = t.category_id
    WHERE t.date LIKE ?
    GROUP BY c.group_type
  `, [`${monthPrefix}%`]);
  const monthByGroup = {
    operasional: { masuk: 0, keluar: 0 },
    pembangunan: { masuk: 0, keluar: 0 },
  };
  for (const g of monthGroupTotals) monthByGroup[g.group_type] = { masuk: g.masuk || 0, keluar: g.keluar || 0 };

  sendJson(res, 200, {
    accounts,
    totalSaldo,
    groupSaldo,
    monthMasuk: monthRow.masuk || 0,
    monthKeluar: monthRow.keluar || 0,
    monthByGroup,
    byCategory,
    recent,
  });
});

// Export Excel (periode)
route('GET', '/api/export/excel', async (req, res, params, query) => {
  const rows = await listTransactions(query);
  const start = query.get('start') || '-';
  const end = query.get('end') || '-';
  const groupLabel = groupLabelOf(query.get('group'));
  const title = `Laporan Keuangan Masjid Al-Ghufron - ${groupLabel} (${start} s/d ${end})`;
  const html = toExcelHtml(rows, title);
  res.writeHead(200, {
    'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
    'Content-Disposition': `attachment; filename="laporan-keuangan-${query.get('group') || 'semua'}-${start}_${end}.xls"`,
  });
  res.end(html);
});

// ---------- Laporan Tahunan ----------

const MONTH_LABELS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

async function buildAnnualReport(year, group) {
  // Saldo baseline (saldo awal kas/rekening) hanya relevan untuk laporan gabungan semua dana;
  // untuk laporan per kelompok dana (pembangunan/operasional), saldo dihitung murni dari arus kas kelompok itu sendiri.
  const baseline = group
    ? 0
    : (await db.get('SELECT COALESCE(SUM(initial_balance), 0) AS b FROM accounts')).b;

  const groupFilter = group ? 'AND c.group_type = ?' : '';
  const groupParam = group ? [group] : [];

  const monthlyTotals = await db.all(`
    SELECT substr(t.date, 6, 2) AS m,
      SUM(CASE WHEN t.type = 'pemasukan' THEN t.amount ELSE 0 END) AS masuk,
      SUM(CASE WHEN t.type = 'pengeluaran' THEN t.amount ELSE 0 END) AS keluar
    FROM transactions t JOIN categories c ON c.id = t.category_id
    WHERE substr(t.date, 1, 4) = ? ${groupFilter}
    GROUP BY m
  `, [String(year), ...groupParam]);
  const monthMap = new Map(monthlyTotals.map((r) => [Number(r.m), r]));

  const cumBefore = (await db.get(`
    SELECT COALESCE(SUM(CASE WHEN t.type = 'pemasukan' THEN t.amount ELSE -t.amount END), 0) AS c
    FROM transactions t JOIN categories c ON c.id = t.category_id
    WHERE t.date < ? ${groupFilter}
  `, [`${year}-01-01`, ...groupParam])).c;

  let running = baseline + cumBefore;
  const months = [];
  for (let i = 1; i <= 12; i++) {
    const row = monthMap.get(i) || { masuk: 0, keluar: 0 };
    const masuk = row.masuk || 0;
    const keluar = row.keluar || 0;
    running += masuk - keluar;
    months.push({ month: i, label: MONTH_LABELS[i - 1], masuk, keluar, saldoAkhir: running });
  }

  const byCategory = await db.all(`
    SELECT c.name AS category_name, c.type, SUM(t.amount) AS total
    FROM transactions t JOIN categories c ON c.id = t.category_id
    WHERE substr(t.date, 1, 4) = ? ${groupFilter}
    GROUP BY t.category_id
    ORDER BY c.type, total DESC
  `, [String(year), ...groupParam]);

  const totalMasuk = months.reduce((s, m) => s + m.masuk, 0);
  const totalKeluar = months.reduce((s, m) => s + m.keluar, 0);

  return { year, group: group || null, months, byCategory, totalMasuk, totalKeluar };
}

route('GET', '/api/report/annual', async (req, res, params, query) => {
  const year = Number(query.get('year')) || new Date().getFullYear();
  sendJson(res, 200, await buildAnnualReport(year, query.get('group')));
});

route('GET', '/api/report/years', async (req, res) => {
  const rows = await db.all(`SELECT DISTINCT substr(date, 1, 4) AS y FROM transactions ORDER BY y DESC`);
  const years = rows.map((r) => Number(r.y));
  const currentYear = new Date().getFullYear();
  if (!years.includes(currentYear)) years.unshift(currentYear);
  sendJson(res, 200, years.sort((a, b) => b - a));
});

route('GET', '/api/export/excel-annual', async (req, res, params, query) => {
  const year = Number(query.get('year')) || new Date().getFullYear();
  const group = query.get('group');
  const report = await buildAnnualReport(year, group);
  const html = toExcelHtmlAnnual(year, report.months, report.byCategory, groupLabelOf(group));
  res.writeHead(200, {
    'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
    'Content-Disposition': `attachment; filename="laporan-tahunan-${group || 'semua'}-${year}.xls"`,
  });
  res.end(html);
});

// ---------- Dashboard Publik (tanpa login) ----------

function nextMonthFirstDay(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m, 1); // m is already next month (0-indexed trick)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

async function buildPublicSummary() {
  const rawAccounts = await computeAccountBalances();
  const accounts = rawAccounts.map((a) => ({ name: a.name, type: a.type, saldo: a.saldo }));
  const totalSaldo = accounts.reduce((s, a) => s + a.saldo, 0);
  const baseline = (await db.get('SELECT COALESCE(SUM(initial_balance), 0) AS b FROM accounts')).b;

  const now = new Date();
  const monthKeys = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push({ ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, year: d.getFullYear(), monthNum: d.getMonth() + 1 });
  }

  const trend = [];
  for (const { ym, year, monthNum } of monthKeys) {
    const row = await db.get(`
      SELECT
        SUM(CASE WHEN type = 'pemasukan' THEN amount ELSE 0 END) AS masuk,
        SUM(CASE WHEN type = 'pengeluaran' THEN amount ELSE 0 END) AS keluar
      FROM transactions WHERE substr(date, 1, 7) = ?
    `, [ym]);
    const masuk = row.masuk || 0;
    const keluar = row.keluar || 0;
    const cumulative = (await db.get(`
      SELECT COALESCE(SUM(CASE WHEN type = 'pemasukan' THEN amount ELSE -amount END), 0) AS c
      FROM transactions WHERE date < ?
    `, [nextMonthFirstDay(ym)])).c;
    trend.push({ label: `${MONTH_LABELS[monthNum - 1]} ${year}`, masuk, keluar, saldoAkhir: baseline + cumulative });
  }

  const current = trend[trend.length - 1];

  return {
    totalSaldo,
    accounts,
    monthLabel: current.label,
    monthMasuk: current.masuk,
    monthKeluar: current.keluar,
    trend,
    updatedAt: now.toISOString(),
  };
}

route('GET', '/api/public/summary', async (req, res) => {
  sendJson(res, 200, await buildPublicSummary());
});

// ---------- Users (admin only) ----------

route('GET', '/api/users', async (req, res) => {
  sendJson(res, 200, await db.all('SELECT id, username, name, role, created_at FROM users ORDER BY id'));
}, { role: 'admin' });

route('POST', '/api/users', async (req, res) => {
  const body = await readBody(req);
  if (!body.username || !body.name || !body.role || !body.password) {
    return sendJson(res, 400, { error: 'Semua field wajib diisi' });
  }
  if (!['admin', 'bendahara'].includes(body.role)) return sendJson(res, 400, { error: 'Role tidak valid' });
  if (String(body.password).length < 6) return sendJson(res, 400, { error: 'Password minimal 6 karakter' });
  const exists = await db.get('SELECT id FROM users WHERE username = ?', [body.username]);
  if (exists) return sendJson(res, 400, { error: 'Username sudah dipakai' });
  const info = await createUser({ username: body.username, name: body.name, role: body.role, password: body.password });
  sendJson(res, 201, { id: info.lastInsertRowid });
}, { role: 'admin' });

route('PUT', '/api/users/:id', async (req, res, params, query, session) => {
  const body = await readBody(req);
  const id = Number(params.id);
  const target = await db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!target) return sendJson(res, 404, { error: 'User tidak ditemukan' });
  if (!['admin', 'bendahara'].includes(body.role)) return sendJson(res, 400, { error: 'Role tidak valid' });
  if (target.role === 'admin' && body.role !== 'admin') {
    const adminCount = (await db.get("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")).c;
    if (adminCount <= 1) return sendJson(res, 400, { error: 'Tidak bisa mengubah role admin terakhir' });
  }
  await db.run('UPDATE users SET name = ?, role = ? WHERE id = ?', [body.name, body.role, id]);
  if (body.password) {
    if (String(body.password).length < 6) return sendJson(res, 400, { error: 'Password minimal 6 karakter' });
    const salt = crypto.randomBytes(16).toString('hex');
    const password_hash = db.hashPassword(body.password, salt);
    await db.run('UPDATE users SET salt = ?, password_hash = ? WHERE id = ?', [salt, password_hash, id]);
  }
  sendJson(res, 200, { ok: true });
}, { role: 'admin' });

route('DELETE', '/api/users/:id', async (req, res, params, query, session) => {
  const id = Number(params.id);
  if (id === session.userId) return sendJson(res, 400, { error: 'Tidak bisa menghapus akun sendiri' });
  const target = await db.get('SELECT * FROM users WHERE id = ?', [id]);
  if (!target) return sendJson(res, 404, { error: 'User tidak ditemukan' });
  if (target.role === 'admin') {
    const adminCount = (await db.get("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")).c;
    if (adminCount <= 1) return sendJson(res, 400, { error: 'Tidak bisa menghapus admin terakhir' });
  }
  await db.run('DELETE FROM users WHERE id = ?', [id]);
  sendJson(res, 200, { ok: true });
}, { role: 'admin' });

// ---------- Static files ----------

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const PUBLIC_AUTH_ROUTES = new Set(['/api/auth/login', '/api/auth/logout', '/api/auth/me', '/api/public/summary']);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const matched = matchRoute(req.method, url.pathname);
      if (!matched) return sendJson(res, 404, { error: 'Not found' });

      if (PUBLIC_AUTH_ROUTES.has(url.pathname)) {
        await matched.route.handler(req, res, matched.params, url.searchParams);
        return;
      }

      const session = getSession(req);
      if (!session) return sendJson(res, 401, { error: 'Belum login' });
      if (matched.route.role && session.role !== matched.route.role) {
        return sendJson(res, 403, { error: 'Anda tidak punya akses untuk aksi ini' });
      }
      await matched.route.handler(req, res, matched.params, url.searchParams, session);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message });
  }
});

async function main() {
  await db.init();
  server.listen(PORT, () => {
    console.log(`Aplikasi Keuangan Masjid Al-Ghufron berjalan di http://localhost:${PORT}`);
  });
}

main();
