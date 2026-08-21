const state = {
  tab: 'dashboard',
  user: null,
  accounts: [],
  categories: [],
  transactions: [],
  filters: { start: '', end: '', type: '', account_id: '', category_id: '', group: '' },
};

const TABS = [
  { key: 'dashboard', label: 'Dashboard', roles: ['admin', 'bendahara'] },
  { key: 'transaksi', label: 'Transaksi', roles: ['admin', 'bendahara'] },
  { key: 'kategori', label: 'Kategori', roles: ['admin'] },
  { key: 'kas', label: 'Kas / Rekening', roles: ['admin'] },
  { key: 'laporan', label: 'Laporan', roles: ['admin', 'bendahara'] },
  { key: 'user', label: 'Kelola User', roles: ['admin'] },
];

const fmtMoney = (n) => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n || 0));
const fmtDate = (d) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  const bulan = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${day} ${bulan[Number(m) - 1]} ${y}`;
};
const todayISO = () => new Date().toISOString().slice(0, 10);

function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.classList.remove('show'); }, 3000);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan');
  return data;
}

// ---------- Auth ----------

async function init() {
  try {
    state.user = await api('/api/auth/me');
    showApp();
  } catch (err) {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
  document.getElementById('login-error').classList.add('hidden');
  const form = document.getElementById('login-form');
  form.reset();
  form.querySelector('[name="username"]').focus();
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  document.getElementById('user-info').innerHTML =
    `${state.user.name}<span class="role-tag">${state.user.role === 'admin' ? 'Admin' : 'Bendahara'}</span>`;
  buildTabs();
  render();
}

function buildTabs() {
  const tabsEl = document.getElementById('tabs');
  const allowed = TABS.filter((t) => t.roles.includes(state.user.role));
  if (!allowed.find((t) => t.key === state.tab)) state.tab = 'dashboard';
  tabsEl.innerHTML = allowed.map((t) =>
    `<button class="tab-btn ${t.key === state.tab ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`
  ).join('');
  tabsEl.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.onclick = () => {
      state.tab = btn.dataset.tab;
      tabsEl.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      render();
    };
  });
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  try {
    state.user = await api('/api/auth/login', { method: 'POST', body });
    showApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  state.user = null;
  showLogin();
});

function openChangePasswordModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h3>Ganti Password</h3>
      <form id="pw-form">
        <div class="form-grid cols-2">
          <label>Password Lama
            <input type="password" name="oldPassword" required>
          </label>
          <label>Password Baru
            <input type="password" name="newPassword" required minlength="6">
          </label>
        </div>
        <div class="modal-actions">
          <button type="button" id="pw-cancel">Batal</button>
          <button type="submit" class="btn-primary">Simpan</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#pw-cancel').onclick = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector('#pw-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api('/api/auth/password', { method: 'PUT', body });
      toast('Password berhasil diubah');
      backdrop.remove();
    } catch (err) { toast(err.message, true); }
  };
}

async function render() {
  const content = document.getElementById('content');
  content.innerHTML = '<div class="empty-state">Memuat...</div>';
  try {
    if (state.tab === 'dashboard') await renderDashboard();
    else if (state.tab === 'transaksi') await renderTransaksi();
    else if (state.tab === 'kategori') await renderKategori();
    else if (state.tab === 'kas') await renderKas();
    else if (state.tab === 'laporan') await renderLaporan();
    else if (state.tab === 'user') await renderUsers();
  } catch (err) {
    content.innerHTML = `<div class="empty-state">Gagal memuat: ${err.message}</div>`;
  }
}

// ---------- Dashboard ----------

async function renderDashboard() {
  const d = await api('/api/dashboard');
  const content = document.getElementById('content');

  const accountCards = d.accounts.map((a) => `
    <div class="card stat-card">
      <div class="label">${a.name} (${a.type === 'tunai' ? 'Tunai' : 'Bank'})</div>
      <div class="value ${a.saldo < 0 ? 'negative' : ''}">${fmtMoney(a.saldo)}</div>
      <div class="sub">Masuk ${fmtMoney(a.total_masuk)} · Keluar ${fmtMoney(a.total_keluar)}</div>
    </div>`).join('');

  const maxCat = Math.max(1, ...d.byCategory.map((c) => c.total));
  const catRows = d.byCategory.length
    ? d.byCategory.map((c) => `
      <div class="progress-row">
        <div class="name">${c.category_name} <span class="badge ${c.group_type === 'pembangunan' ? 'out' : 'in'}" style="margin-left:4px">${c.group_type === 'pembangunan' ? 'Pembangunan' : 'Operasional'}</span></div>
        <div class="progress-bar"><div class="fill" style="width:${(c.total / maxCat) * 100}%; background:${c.type === 'pemasukan' ? 'var(--success)' : 'var(--danger)'}"></div></div>
        <div class="amt">${fmtMoney(c.total)}</div>
      </div>`).join('')
    : '<div class="empty-state">Belum ada transaksi bulan ini</div>';

  const recentRows = d.recent.length
    ? d.recent.map((t) => `
      <tr>
        <td>${fmtDate(t.date)}</td>
        <td>${t.category_name}</td>
        <td>${t.account_name}</td>
        <td><span class="badge ${t.type === 'pemasukan' ? 'in' : 'out'}">${t.type === 'pemasukan' ? 'Masuk' : 'Keluar'}</span></td>
        <td class="amount ${t.type === 'pemasukan' ? 'in' : 'out'}">${t.type === 'pemasukan' ? '+' : '-'}${fmtMoney(t.amount)}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="empty-state">Belum ada transaksi</td></tr>';

  content.innerHTML = `
    <div class="section">
      <h2 class="section-title">Ringkasan Saldo</h2>
      <div class="grid grid-4">
        <div class="card stat-card">
          <div class="label">Total Saldo Masjid</div>
          <div class="value">${fmtMoney(d.totalSaldo)}</div>
          <div class="sub">Gabungan semua kas &amp; rekening</div>
        </div>
        ${accountCards}
      </div>
    </div>
    <div class="section">
      <h2 class="section-title">Saldo per Kelompok Dana</h2>
      <div class="grid grid-4">
        <div class="card stat-card">
          <div class="label">Kas Operasional</div>
          <div class="value ${d.groupSaldo.operasional < 0 ? 'negative' : ''}">${fmtMoney(d.groupSaldo.operasional)}</div>
        </div>
        <div class="card stat-card">
          <div class="label">Dana Pembangunan</div>
          <div class="value ${d.groupSaldo.pembangunan < 0 ? 'negative' : ''}">${fmtMoney(d.groupSaldo.pembangunan)}</div>
        </div>
      </div>
    </div>
    <div class="section">
      <h2 class="section-title">Bulan Ini</h2>
      <div class="grid grid-4">
        <div class="card stat-card">
          <div class="label">Pemasukan Bulan Ini</div>
          <div class="value">${fmtMoney(d.monthMasuk)}</div>
        </div>
        <div class="card stat-card">
          <div class="label">Pengeluaran Bulan Ini</div>
          <div class="value negative">${fmtMoney(d.monthKeluar)}</div>
        </div>
        <div class="card stat-card">
          <div class="label">Selisih Bulan Ini</div>
          <div class="value ${d.monthMasuk - d.monthKeluar < 0 ? 'negative' : ''}">${fmtMoney(d.monthMasuk - d.monthKeluar)}</div>
        </div>
      </div>
      <div class="card" style="margin-top:12px">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Kelompok Dana</th><th>Pemasukan</th><th>Pengeluaran</th><th>Selisih</th></tr></thead>
            <tbody>
              <tr>
                <td>Kas Operasional</td>
                <td class="amount in">${fmtMoney(d.monthByGroup.operasional.masuk)}</td>
                <td class="amount out">${fmtMoney(d.monthByGroup.operasional.keluar)}</td>
                <td class="amount ${d.monthByGroup.operasional.masuk - d.monthByGroup.operasional.keluar < 0 ? 'out' : 'in'}">${fmtMoney(d.monthByGroup.operasional.masuk - d.monthByGroup.operasional.keluar)}</td>
              </tr>
              <tr>
                <td>Dana Pembangunan</td>
                <td class="amount in">${fmtMoney(d.monthByGroup.pembangunan.masuk)}</td>
                <td class="amount out">${fmtMoney(d.monthByGroup.pembangunan.keluar)}</td>
                <td class="amount ${d.monthByGroup.pembangunan.masuk - d.monthByGroup.pembangunan.keluar < 0 ? 'out' : 'in'}">${fmtMoney(d.monthByGroup.pembangunan.masuk - d.monthByGroup.pembangunan.keluar)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <div class="two-col">
      <div class="card">
        <h2 class="section-title">Transaksi Terbaru</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Tanggal</th><th>Kategori</th><th>Kas</th><th>Jenis</th><th>Jumlah</th></tr></thead>
            <tbody>${recentRows}</tbody>
          </table>
        </div>
      </div>
      <div class="card">
        <h2 class="section-title">Per Kategori (Bulan Ini)</h2>
        ${catRows}
      </div>
    </div>
  `;
}

// ---------- Transaksi ----------

async function loadRefData() {
  [state.accounts, state.categories] = await Promise.all([
    api('/api/accounts'),
    api('/api/categories'),
  ]);
}

function buildQuery(filters) {
  const p = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
  return p.toString();
}

const TRANS_PAGE_SIZE = 50;

async function renderTransaksi() {
  await loadRefData();
  const qs = buildQuery(state.filters);
  state.transactions = await api('/api/transactions' + (qs ? '?' + qs : ''));
  state.transPage = 1;
  const content = document.getElementById('content');

  const accOptions = state.accounts.map((a) => `<option value="${a.id}">${a.name}</option>`).join('');

  content.innerHTML = `
    <div class="card section">
      <div class="toolbar">
        <input type="date" id="f-start" value="${state.filters.start}" title="Dari tanggal">
        <input type="date" id="f-end" value="${state.filters.end}" title="Sampai tanggal">
        <select id="f-type">
          <option value="">Semua Jenis</option>
          <option value="pemasukan" ${state.filters.type === 'pemasukan' ? 'selected' : ''}>Pemasukan</option>
          <option value="pengeluaran" ${state.filters.type === 'pengeluaran' ? 'selected' : ''}>Pengeluaran</option>
        </select>
        <select id="f-account"><option value="">Semua Kas</option>${accOptions}</select>
        <select id="f-group">
          <option value="">Semua Sumber Dana</option>
          <option value="operasional" ${state.filters.group === 'operasional' ? 'selected' : ''}>Kas Operasional</option>
          <option value="pembangunan" ${state.filters.group === 'pembangunan' ? 'selected' : ''}>Dana Pembangunan</option>
        </select>
        <button id="f-apply">Terapkan Filter</button>
        <button id="f-reset">Reset</button>
        <div class="spacer"></div>
        <button class="btn-primary" id="btn-new-trx">+ Tambah Transaksi</button>
      </div>
      <div class="table-wrap" id="trx-table-wrap"></div>
      <div class="toolbar" id="trx-pagination" style="margin-top:10px; margin-bottom:0"></div>
    </div>
  `;

  document.getElementById('f-account').value = state.filters.account_id;

  document.getElementById('f-apply').onclick = () => {
    state.filters.start = document.getElementById('f-start').value;
    state.filters.end = document.getElementById('f-end').value;
    state.filters.type = document.getElementById('f-type').value;
    state.filters.account_id = document.getElementById('f-account').value;
    state.filters.group = document.getElementById('f-group').value;
    renderTransaksi();
  };
  document.getElementById('f-reset').onclick = () => {
    state.filters = { start: '', end: '', type: '', account_id: '', category_id: '', group: '' };
    renderTransaksi();
  };
  document.getElementById('btn-new-trx').onclick = () => openTrxModal();

  renderTransTable();
}

function renderTransTable() {
  const totalRows = state.transactions.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / TRANS_PAGE_SIZE));
  state.transPage = Math.min(Math.max(1, state.transPage || 1), totalPages);
  const startIdx = (state.transPage - 1) * TRANS_PAGE_SIZE;
  const pageItems = state.transactions.slice(startIdx, startIdx + TRANS_PAGE_SIZE);

  const rows = pageItems.length
    ? pageItems.map((t) => `
      <tr>
        <td>${fmtDate(t.date)}</td>
        <td><span class="badge ${t.type === 'pemasukan' ? 'in' : 'out'}">${t.type === 'pemasukan' ? 'Masuk' : 'Keluar'}</span></td>
        <td>${t.category_name}</td>
        <td><span class="badge ${t.fund_source === 'pembangunan' ? 'out' : 'in'}">${t.fund_source === 'pembangunan' ? 'Pembangunan' : 'Operasional'}</span></td>
        <td>${t.account_name}</td>
        <td>${t.description || ''}</td>
        <td class="amount ${t.type === 'pemasukan' ? 'in' : 'out'}">${t.type === 'pemasukan' ? '+' : '-'}${fmtMoney(t.amount)}</td>
        <td class="actions-cell">
          <button class="btn-sm" data-edit="${t.id}">Edit</button>
          <button class="btn-sm btn-danger" data-del="${t.id}">Hapus</button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="8" class="empty-state">Tidak ada transaksi sesuai filter</td></tr>';

  document.getElementById('trx-table-wrap').innerHTML = `
    <table>
      <thead><tr><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Sumber Dana</th><th>Kas/Rekening</th><th>Keterangan</th><th>Jumlah</th><th>Aksi</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  const rangeStart = totalRows === 0 ? 0 : startIdx + 1;
  const rangeEnd = Math.min(startIdx + TRANS_PAGE_SIZE, totalRows);
  document.getElementById('trx-pagination').innerHTML = `
    <button id="trx-prev" ${state.transPage <= 1 ? 'disabled' : ''}>&laquo; Sebelumnya</button>
    <span style="font-size:12.5px; color:var(--muted)">Menampilkan ${rangeStart}-${rangeEnd} dari ${totalRows} transaksi &middot; Halaman ${state.transPage} dari ${totalPages}</span>
    <div class="spacer"></div>
    <button id="trx-next" ${state.transPage >= totalPages ? 'disabled' : ''}>Berikutnya &raquo;</button>
  `;

  document.getElementById('trx-prev').onclick = () => { state.transPage--; renderTransTable(); };
  document.getElementById('trx-next').onclick = () => { state.transPage++; renderTransTable(); };

  const content = document.getElementById('content');
  content.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.onclick = () => {
      const t = state.transactions.find((x) => x.id === Number(btn.dataset.edit));
      openTrxModal(t);
    };
  });
  content.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Hapus transaksi ini?')) return;
      try {
        await api('/api/transactions/' + btn.dataset.del, { method: 'DELETE' });
        toast('Transaksi dihapus');
        renderTransaksi();
      } catch (err) { toast(err.message, true); }
    };
  });
}

function openTrxModal(trx) {
  const isEdit = !!trx;
  const catOptions = (type) => state.categories.filter((c) => c.type === type)
    .map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  const accOptions = state.accounts.map((a) => `<option value="${a.id}">${a.name}</option>`).join('');

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h3>${isEdit ? 'Edit' : 'Tambah'} Transaksi</h3>
      <form id="trx-form">
        <div class="form-grid cols-2">
          <label>Tanggal
            <input type="date" name="date" required value="${trx ? trx.date : todayISO()}">
          </label>
          <label>Jenis
            <select name="type" id="trx-type" required>
              <option value="pemasukan" ${trx?.type === 'pemasukan' ? 'selected' : ''}>Pemasukan</option>
              <option value="pengeluaran" ${trx?.type === 'pengeluaran' ? 'selected' : ''}>Pengeluaran</option>
            </select>
          </label>
          <label>Kategori
            <select name="category_id" id="trx-category" required></select>
          </label>
          <label id="trx-fund-wrap" class="hidden">Sumber Dana
            <select name="fund_source" id="trx-fund">
              <option value="operasional" ${trx?.fund_source === 'operasional' ? 'selected' : ''}>Kas Operasional</option>
              <option value="pembangunan" ${trx?.fund_source === 'pembangunan' ? 'selected' : ''}>Dana Pembangunan</option>
            </select>
          </label>
          <label>Kas / Rekening
            <select name="account_id" required>${accOptions}</select>
          </label>
          <label>Jumlah (Rp)
            <input type="number" name="amount" min="0" step="1" required value="${trx ? trx.amount : ''}">
          </label>
          <label>Keterangan
            <input type="text" name="description" value="${trx ? (trx.description || '').replace(/"/g, '&quot;') : ''}">
          </label>
        </div>
        <div class="modal-actions">
          <button type="button" id="trx-cancel">Batal</button>
          <button type="submit" class="btn-primary">Simpan</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);

  const typeSelect = backdrop.querySelector('#trx-type');
  const catSelect = backdrop.querySelector('#trx-category');
  const fundWrap = backdrop.querySelector('#trx-fund-wrap');
  const fundSelect = backdrop.querySelector('#trx-fund');

  const updateFundVisibility = () => {
    const isExpense = typeSelect.value === 'pengeluaran';
    fundWrap.classList.toggle('hidden', !isExpense);
    fundSelect.required = isExpense;
  };

  const refreshCats = () => {
    catSelect.innerHTML = catOptions(typeSelect.value);
    if (trx) catSelect.value = trx.category_id;
    updateFundVisibility();
    suggestFundFromCategory();
  };

  function suggestFundFromCategory() {
    if (typeSelect.value !== 'pengeluaran') return;
    const cat = state.categories.find((c) => c.id === Number(catSelect.value));
    if (cat) fundSelect.value = cat.group_type;
  }

  typeSelect.onchange = refreshCats;
  catSelect.onchange = suggestFundFromCategory;
  refreshCats();
  if (trx) {
    backdrop.querySelector('[name="account_id"]').value = trx.account_id;
    fundSelect.value = trx.fund_source || 'operasional';
  }

  backdrop.querySelector('#trx-cancel').onclick = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });

  backdrop.querySelector('#trx-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    try {
      if (isEdit) {
        await api('/api/transactions/' + trx.id, { method: 'PUT', body });
        toast('Transaksi diperbarui');
      } else {
        await api('/api/transactions', { method: 'POST', body });
        toast('Transaksi ditambahkan');
      }
      backdrop.remove();
      renderTransaksi();
    } catch (err) { toast(err.message, true); }
  };
}

// ---------- Kategori ----------

async function renderKategori() {
  state.categories = await api('/api/categories');
  const content = document.getElementById('content');

  const rowsFor = (type) => {
    const list = state.categories.filter((c) => c.type === type);
    if (!list.length) return '<tr><td colspan="2" class="empty-state">Belum ada kategori</td></tr>';
    return list.map((c) => `
      <tr>
        <td>${c.name} <span class="badge ${c.group_type === 'pembangunan' ? 'out' : 'in'}">${c.group_type === 'pembangunan' ? 'Dana Pembangunan' : 'Kas Operasional'}</span></td>
        <td class="actions-cell">
          <button class="btn-sm" data-edit-cat="${c.id}">Edit</button>
          <button class="btn-sm btn-danger" data-del-cat="${c.id}">Hapus</button>
        </td>
      </tr>`).join('');
  };

  content.innerHTML = `
    <div class="toolbar">
      <div class="spacer"></div>
      <button class="btn-primary" id="btn-new-cat">+ Tambah Kategori</button>
    </div>
    <div class="two-col">
      <div class="card">
        <h2 class="section-title">Kategori Pemasukan</h2>
        <div class="table-wrap"><table><tbody>${rowsFor('pemasukan')}</tbody></table></div>
      </div>
      <div class="card">
        <h2 class="section-title">Kategori Pengeluaran</h2>
        <div class="table-wrap"><table><tbody>${rowsFor('pengeluaran')}</tbody></table></div>
      </div>
    </div>
  `;

  document.getElementById('btn-new-cat').onclick = () => openCatModal();
  content.querySelectorAll('[data-edit-cat]').forEach((btn) => {
    btn.onclick = () => {
      const c = state.categories.find((x) => x.id === Number(btn.dataset.editCat));
      openCatModal(c);
    };
  });
  content.querySelectorAll('[data-del-cat]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Hapus kategori ini?')) return;
      try {
        await api('/api/categories/' + btn.dataset.delCat, { method: 'DELETE' });
        toast('Kategori dihapus');
        renderKategori();
      } catch (err) { toast(err.message, true); }
    };
  });
}

function openCatModal(cat) {
  const isEdit = !!cat;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h3>${isEdit ? 'Edit' : 'Tambah'} Kategori</h3>
      <form id="cat-form">
        <div class="form-grid cols-2">
          <label>Nama Kategori
            <input type="text" name="name" required value="${cat ? cat.name.replace(/"/g, '&quot;') : ''}">
          </label>
          <label>Jenis
            <select name="type" required>
              <option value="pemasukan" ${cat?.type === 'pemasukan' ? 'selected' : ''}>Pemasukan</option>
              <option value="pengeluaran" ${cat?.type === 'pengeluaran' ? 'selected' : ''}>Pengeluaran</option>
            </select>
          </label>
          <label>Kelompok Dana
            <select name="group_type" required>
              <option value="operasional" ${(cat?.group_type ?? 'operasional') === 'operasional' ? 'selected' : ''}>Kas Operasional</option>
              <option value="pembangunan" ${cat?.group_type === 'pembangunan' ? 'selected' : ''}>Dana Pembangunan</option>
            </select>
          </label>
        </div>
        <div class="modal-actions">
          <button type="button" id="cat-cancel">Batal</button>
          <button type="submit" class="btn-primary">Simpan</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#cat-cancel').onclick = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector('#cat-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try {
      if (isEdit) await api('/api/categories/' + cat.id, { method: 'PUT', body });
      else await api('/api/categories', { method: 'POST', body });
      toast('Kategori disimpan');
      backdrop.remove();
      renderKategori();
    } catch (err) { toast(err.message, true); }
  };
}

// ---------- Kas / Rekening ----------

async function renderKas() {
  state.accounts = await api('/api/accounts');
  const content = document.getElementById('content');

  const rows = state.accounts.length ? state.accounts.map((a) => `
    <tr>
      <td>${a.name}</td>
      <td>${a.type === 'tunai' ? 'Tunai' : 'Bank'}</td>
      <td>${fmtMoney(a.initial_balance)}</td>
      <td class="amount ${a.saldo < 0 ? 'out' : 'in'}">${fmtMoney(a.saldo)}</td>
      <td class="actions-cell">
        <button class="btn-sm" data-edit-acc="${a.id}">Edit</button>
        <button class="btn-sm btn-danger" data-del-acc="${a.id}">Hapus</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="5" class="empty-state">Belum ada kas/rekening</td></tr>';

  content.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <h2 class="section-title" style="margin:0">Daftar Kas &amp; Rekening</h2>
        <div class="spacer"></div>
        <button class="btn-primary" id="btn-new-acc">+ Tambah Kas/Rekening</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nama</th><th>Tipe</th><th>Saldo Awal</th><th>Saldo Berjalan</th><th>Aksi</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('btn-new-acc').onclick = () => openAccModal();
  content.querySelectorAll('[data-edit-acc]').forEach((btn) => {
    btn.onclick = () => {
      const a = state.accounts.find((x) => x.id === Number(btn.dataset.editAcc));
      openAccModal(a);
    };
  });
  content.querySelectorAll('[data-del-acc]').forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm('Hapus kas/rekening ini?')) return;
      try {
        await api('/api/accounts/' + btn.dataset.delAcc, { method: 'DELETE' });
        toast('Kas/rekening dihapus');
        renderKas();
      } catch (err) { toast(err.message, true); }
    };
  });
}

function openAccModal(acc) {
  const isEdit = !!acc;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h3>${isEdit ? 'Edit' : 'Tambah'} Kas/Rekening</h3>
      <form id="acc-form">
        <div class="form-grid cols-2">
          <label>Nama
            <input type="text" name="name" required value="${acc ? acc.name.replace(/"/g, '&quot;') : ''}">
          </label>
          <label>Tipe
            <select name="type" required>
              <option value="tunai" ${acc?.type === 'tunai' ? 'selected' : ''}>Tunai</option>
              <option value="bank" ${acc?.type === 'bank' ? 'selected' : ''}>Bank</option>
            </select>
          </label>
          <label>Saldo Awal (Rp)
            <input type="number" name="initial_balance" min="0" step="1" value="${acc ? acc.initial_balance : 0}">
          </label>
        </div>
        <div class="modal-actions">
          <button type="button" id="acc-cancel">Batal</button>
          <button type="submit" class="btn-primary">Simpan</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#acc-cancel').onclick = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector('#acc-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    try {
      if (isEdit) await api('/api/accounts/' + acc.id, { method: 'PUT', body });
      else await api('/api/accounts', { method: 'POST', body });
      toast('Kas/rekening disimpan');
      backdrop.remove();
      renderKas();
    } catch (err) { toast(err.message, true); }
  };
}

// ---------- Laporan ----------

state.laporanMode = state.laporanMode || 'periode';
state.laporanGroup = state.laporanGroup || 'operasional';

async function renderLaporan() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="toolbar">
      <button id="mode-periode" class="${state.laporanMode === 'periode' ? 'btn-primary' : ''}">Laporan per Periode</button>
      <button id="mode-tahunan" class="${state.laporanMode === 'tahunan' ? 'btn-primary' : ''}">Laporan Tahunan</button>
    </div>
    <div class="toolbar">
      <button id="group-operasional" class="${state.laporanGroup === 'operasional' ? 'btn-gold' : ''}">Kas Operasional</button>
      <button id="group-pembangunan" class="${state.laporanGroup === 'pembangunan' ? 'btn-gold' : ''}">Dana Pembangunan</button>
    </div>
    <div id="laporan-body"></div>
  `;
  document.getElementById('mode-periode').onclick = () => { state.laporanMode = 'periode'; renderLaporan(); };
  document.getElementById('mode-tahunan').onclick = () => { state.laporanMode = 'tahunan'; renderLaporan(); };
  document.getElementById('group-operasional').onclick = () => { state.laporanGroup = 'operasional'; renderLaporan(); };
  document.getElementById('group-pembangunan').onclick = () => { state.laporanGroup = 'pembangunan'; renderLaporan(); };

  if (state.laporanMode === 'periode') await renderLaporanPeriode();
  else await renderLaporanTahunan();
}

async function renderLaporanPeriode() {
  await loadRefData();
  const content = document.getElementById('laporan-body');
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const defStart = firstOfMonth.toISOString().slice(0, 10);
  const defEnd = todayISO();

  const groupLabel = state.laporanGroup === 'pembangunan' ? 'Dana Pembangunan' : 'Kas Operasional';

  content.innerHTML = `
    <div class="card section">
      <h2 class="section-title">Laporan Periode &mdash; ${groupLabel}</h2>
      <div class="toolbar">
        <input type="date" id="r-start" value="${defStart}">
        <input type="date" id="r-end" value="${defEnd}">
        <button id="r-generate" class="btn-primary">Tampilkan Laporan</button>
        <div class="spacer"></div>
        <button id="r-export-excel">⬇ Export Excel</button>
        <button id="r-print" class="btn-gold">🖨 Cetak / Simpan PDF</button>
      </div>
      <div id="r-summary"></div>
      <div class="table-wrap" id="r-table"></div>
    </div>
  `;

  async function generate() {
    const start = document.getElementById('r-start').value;
    const end = document.getElementById('r-end').value;
    const qs = buildQuery({ start, end, group: state.laporanGroup });
    const rows = await api('/api/transactions?' + qs);
    const totalMasuk = rows.filter((r) => r.type === 'pemasukan').reduce((s, r) => s + r.amount, 0);
    const totalKeluar = rows.filter((r) => r.type === 'pengeluaran').reduce((s, r) => s + r.amount, 0);

    document.getElementById('r-summary').innerHTML = `
      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="card stat-card"><div class="label">Periode</div><div class="value" style="font-size:15px">${fmtDate(start)} - ${fmtDate(end)}</div></div>
        <div class="card stat-card"><div class="label">Total Pemasukan</div><div class="value">${fmtMoney(totalMasuk)}</div></div>
        <div class="card stat-card"><div class="label">Total Pengeluaran</div><div class="value negative">${fmtMoney(totalKeluar)}</div></div>
        <div class="card stat-card"><div class="label">Selisih</div><div class="value ${totalMasuk - totalKeluar < 0 ? 'negative' : ''}">${fmtMoney(totalMasuk - totalKeluar)}</div></div>
      </div>
    `;

    const bodyRows = rows.length ? rows.map((r) => `
      <tr>
        <td>${fmtDate(r.date)}</td>
        <td><span class="badge ${r.type === 'pemasukan' ? 'in' : 'out'}">${r.type === 'pemasukan' ? 'Masuk' : 'Keluar'}</span></td>
        <td>${r.category_name}</td>
        <td>${r.account_name}</td>
        <td>${r.description || ''}</td>
        <td class="amount ${r.type === 'pemasukan' ? 'in' : 'out'}">${r.type === 'pemasukan' ? '+' : '-'}${fmtMoney(r.amount)}</td>
      </tr>`).join('') : '<tr><td colspan="6" class="empty-state">Tidak ada transaksi pada periode ini</td></tr>';

    document.getElementById('r-table').innerHTML = `
      <table id="r-print-table">
        <thead><tr><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Kas/Rekening</th><th>Keterangan</th><th>Jumlah</th></tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    `;

    document.getElementById('r-export-excel').onclick = () => {
      window.location.href = '/api/export/excel?' + qs;
    };
    document.getElementById('r-print').onclick = () => {
      printReport(start, end, rows, totalMasuk, totalKeluar, groupLabel);
    };
  }

  document.getElementById('r-generate').onclick = generate;
  generate();
}

function printReport(start, end, rows, totalMasuk, totalKeluar, groupLabel) {
  const win = window.open('', '_blank');
  const bodyRows = rows.map((r) => `
    <tr>
      <td>${fmtDate(r.date)}</td>
      <td>${r.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'}</td>
      <td>${r.category_name}</td>
      <td>${r.account_name}</td>
      <td>${r.description || ''}</td>
      <td style="text-align:right">${r.type === 'pemasukan' ? fmtMoney(r.amount) : ''}</td>
      <td style="text-align:right">${r.type === 'pengeluaran' ? fmtMoney(r.amount) : ''}</td>
    </tr>`).join('');

  win.document.write(`
    <html><head><title>Laporan Keuangan Masjid Al-Ghufron Blok G RW 035 - ${groupLabel}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #1c2b24; }
      h1 { font-size: 18px; margin-bottom: 2px; }
      p.sub { color: #555; margin-top: 0; font-size: 12.5px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 16px; }
      th, td { border: 1px solid #ccc; padding: 6px 8px; }
      th { background: #f0f4f1; text-align: left; }
      tfoot td { font-weight: bold; background: #fafafa; }
    </style>
    </head><body>
      <h1>Laporan Keuangan Masjid Al-Ghufron Blok G RW 035 &mdash; ${groupLabel}</h1>
      <p class="sub">Periode: ${fmtDate(start)} s/d ${fmtDate(end)} · Dicetak: ${fmtDate(todayISO())}</p>
      <table>
        <thead><tr><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Kas/Rekening</th><th>Keterangan</th><th>Pemasukan</th><th>Pengeluaran</th></tr></thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr><td colspan="5" style="text-align:right">Total</td><td style="text-align:right">${fmtMoney(totalMasuk)}</td><td style="text-align:right">${fmtMoney(totalKeluar)}</td></tr>
          <tr><td colspan="5" style="text-align:right">Selisih</td><td colspan="2" style="text-align:right">${fmtMoney(totalMasuk - totalKeluar)}</td></tr>
        </tfoot>
      </table>
      <script>window.onload = () => window.print();<\/script>
    </body></html>
  `);
  win.document.close();
}

// ---------- Laporan Tahunan ----------

async function renderLaporanTahunan() {
  const content = document.getElementById('laporan-body');
  const currentYear = new Date().getFullYear();
  let years = [];
  try { years = await api('/api/report/years'); } catch (e) { years = [currentYear]; }
  state.laporanTahun = state.laporanTahun && years.includes(state.laporanTahun) ? state.laporanTahun : years[0];
  const groupLabel = state.laporanGroup === 'pembangunan' ? 'Dana Pembangunan' : 'Kas Operasional';

  content.innerHTML = `
    <div class="card section">
      <h2 class="section-title">Laporan Tahunan &mdash; ${groupLabel}</h2>
      <div class="toolbar">
        <select id="y-select">${years.map((y) => `<option value="${y}" ${y === state.laporanTahun ? 'selected' : ''}>${y}</option>`).join('')}</select>
        <div class="spacer"></div>
        <button id="y-export-excel">⬇ Export Excel</button>
        <button id="y-print" class="btn-gold">🖨 Cetak / Simpan PDF</button>
      </div>
      <div id="y-summary"></div>
      <div class="two-col">
        <div class="table-wrap" id="y-table"></div>
        <div id="y-category"></div>
      </div>
    </div>
  `;

  document.getElementById('y-select').onchange = (e) => {
    state.laporanTahun = Number(e.target.value);
    renderLaporanTahunan();
  };

  const report = await api(`/api/report/annual?year=${state.laporanTahun}&group=${state.laporanGroup}`);
  const selisih = report.totalMasuk - report.totalKeluar;

  document.getElementById('y-summary').innerHTML = `
    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="card stat-card"><div class="label">Tahun</div><div class="value" style="font-size:15px">${report.year}</div></div>
      <div class="card stat-card"><div class="label">Total Pemasukan</div><div class="value">${fmtMoney(report.totalMasuk)}</div></div>
      <div class="card stat-card"><div class="label">Total Pengeluaran</div><div class="value negative">${fmtMoney(report.totalKeluar)}</div></div>
      <div class="card stat-card"><div class="label">Selisih</div><div class="value ${selisih < 0 ? 'negative' : ''}">${fmtMoney(selisih)}</div></div>
    </div>
  `;

  const monthRows = report.months.map((m) => `
    <tr>
      <td>${m.label}</td>
      <td class="amount in">${fmtMoney(m.masuk)}</td>
      <td class="amount out">${fmtMoney(m.keluar)}</td>
      <td class="amount ${m.masuk - m.keluar < 0 ? 'out' : 'in'}">${fmtMoney(m.masuk - m.keluar)}</td>
      <td>${fmtMoney(m.saldoAkhir)}</td>
    </tr>`).join('');

  document.getElementById('y-table').innerHTML = `
    <table>
      <thead><tr><th>Bulan</th><th>Pemasukan</th><th>Pengeluaran</th><th>Selisih</th><th>Saldo Akhir</th></tr></thead>
      <tbody>${monthRows}</tbody>
    </table>
  `;

  const maxCat = Math.max(1, ...report.byCategory.map((c) => c.total));
  const catRows = report.byCategory.length ? report.byCategory.map((c) => `
    <div class="progress-row">
      <div class="name">${c.category_name}</div>
      <div class="progress-bar"><div class="fill" style="width:${(c.total / maxCat) * 100}%; background:${c.type === 'pemasukan' ? 'var(--success)' : 'var(--danger)'}"></div></div>
      <div class="amt">${fmtMoney(c.total)}</div>
    </div>`).join('') : '<div class="empty-state">Belum ada transaksi tahun ini</div>';

  document.getElementById('y-category').innerHTML = `
    <div class="card">
      <h2 class="section-title">Rekap per Kategori</h2>
      ${catRows}
    </div>
  `;

  document.getElementById('y-export-excel').onclick = () => {
    window.location.href = `/api/export/excel-annual?year=${state.laporanTahun}&group=${state.laporanGroup}`;
  };
  document.getElementById('y-print').onclick = () => printAnnualReport(report, groupLabel);
}

function printAnnualReport(report, groupLabel) {
  const win = window.open('', '_blank');
  const monthRows = report.months.map((m) => `
    <tr>
      <td>${m.label}</td>
      <td style="text-align:right">${fmtMoney(m.masuk)}</td>
      <td style="text-align:right">${fmtMoney(m.keluar)}</td>
      <td style="text-align:right">${fmtMoney(m.masuk - m.keluar)}</td>
      <td style="text-align:right">${fmtMoney(m.saldoAkhir)}</td>
    </tr>`).join('');
  const catRows = report.byCategory.map((c) => `
    <tr><td>${c.category_name}</td><td>${c.type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'}</td><td style="text-align:right">${fmtMoney(c.total)}</td></tr>
  `).join('');

  win.document.write(`
    <html><head><title>Laporan Tahunan Masjid Al-Ghufron Blok G RW 035 ${report.year} - ${groupLabel}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 24px; color: #1c2b24; }
      h1 { font-size: 18px; margin-bottom: 2px; }
      h2 { font-size: 15px; margin-top: 28px; }
      p.sub { color: #555; margin-top: 0; font-size: 12.5px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
      th, td { border: 1px solid #ccc; padding: 6px 8px; }
      th { background: #f0f4f1; text-align: left; }
    </style>
    </head><body>
      <h1>Laporan Tahunan Masjid Al-Ghufron Blok G RW 035 &mdash; ${groupLabel}</h1>
      <p class="sub">Tahun ${report.year} · Dicetak: ${fmtDate(todayISO())}</p>
      <table>
        <thead><tr><th>Bulan</th><th>Pemasukan</th><th>Pengeluaran</th><th>Selisih</th><th>Saldo Akhir</th></tr></thead>
        <tbody>${monthRows}</tbody>
      </table>
      <h2>Rekap per Kategori</h2>
      <table>
        <thead><tr><th>Kategori</th><th>Jenis</th><th>Total</th></tr></thead>
        <tbody>${catRows}</tbody>
      </table>
      <script>window.onload = () => window.print();<\/script>
    </body></html>
  `);
  win.document.close();
}

// ---------- Kelola User ----------

async function renderUsers() {
  const users = await api('/api/users');
  const content = document.getElementById('content');

  const rows = users.map((u) => `
    <tr>
      <td>${u.username}</td>
      <td>${u.name}</td>
      <td><span class="badge ${u.role === 'admin' ? 'in' : 'out'}">${u.role === 'admin' ? 'Admin' : 'Bendahara'}</span></td>
      <td class="actions-cell">
        <button class="btn-sm" data-edit-user="${u.id}">Edit</button>
        <button class="btn-sm btn-danger" data-del-user="${u.id}" ${u.username === state.user.username ? 'disabled' : ''}>Hapus</button>
      </td>
    </tr>`).join('');

  content.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <h2 class="section-title" style="margin:0">Kelola User</h2>
        <div class="spacer"></div>
        <button id="btn-change-password">Ganti Password Saya</button>
        <button class="btn-primary" id="btn-new-user">+ Tambah User</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Username</th><th>Nama</th><th>Role</th><th>Aksi</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('btn-change-password').onclick = () => openChangePasswordModal();
  document.getElementById('btn-new-user').onclick = () => openUserModal();
  content.querySelectorAll('[data-edit-user]').forEach((btn) => {
    btn.onclick = () => {
      const u = users.find((x) => x.id === Number(btn.dataset.editUser));
      openUserModal(u);
    };
  });
  content.querySelectorAll('[data-del-user]').forEach((btn) => {
    btn.onclick = async () => {
      if (btn.disabled) return;
      if (!confirm('Hapus user ini?')) return;
      try {
        await api('/api/users/' + btn.dataset.delUser, { method: 'DELETE' });
        toast('User dihapus');
        renderUsers();
      } catch (err) { toast(err.message, true); }
    };
  });
}

function openUserModal(user) {
  const isEdit = !!user;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <h3>${isEdit ? 'Edit' : 'Tambah'} User</h3>
      <form id="user-form">
        <div class="form-grid cols-2">
          <label>Username
            <input type="text" name="username" required ${isEdit ? 'disabled' : ''} value="${user ? user.username : ''}">
          </label>
          <label>Nama Lengkap
            <input type="text" name="name" required value="${user ? user.name.replace(/"/g, '&quot;') : ''}">
          </label>
          <label>Role
            <select name="role" required>
              <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Admin</option>
              <option value="bendahara" ${user?.role === 'bendahara' ? 'selected' : ''}>Bendahara</option>
            </select>
          </label>
          <label>${isEdit ? 'Password Baru (opsional)' : 'Password'}
            <input type="password" name="password" ${isEdit ? '' : 'required'} minlength="6">
          </label>
        </div>
        <div class="modal-actions">
          <button type="button" id="user-cancel">Batal</button>
          <button type="submit" class="btn-primary">Simpan</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#user-cancel').onclick = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector('#user-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    if (isEdit && !body.password) delete body.password;
    try {
      if (isEdit) await api('/api/users/' + user.id, { method: 'PUT', body });
      else await api('/api/users', { method: 'POST', body });
      toast('User disimpan');
      backdrop.remove();
      renderUsers();
    } catch (err) { toast(err.message, true); }
  };
}

init();
