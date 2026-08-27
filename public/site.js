document.querySelectorAll('.nav-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById('site-nav').classList.toggle('open');
  });
});

// Header fixed: tambahkan spacer agar konten tidak tertutup header
(function () {
  const hdr = document.querySelector('.site-header');
  if (!hdr) return;
  const spacer = document.createElement('div');
  spacer.id = 'site-header-spacer';
  hdr.parentNode.insertBefore(spacer, hdr.nextSibling);
  const sync = () => { spacer.style.height = hdr.offsetHeight + 'px'; };
  sync();
  window.addEventListener('resize', sync);
})();

// Tombol Donasi + modal QRIS
(function () {
  const nav = document.querySelector('.site-nav');
  if (!nav) return;

  // Tombol
  const btn = document.createElement('button');
  btn.className = 'nav-donasi';
  btn.innerHTML = '&#9829; Donasi';
  btn.onclick = () => document.getElementById('qris-overlay').classList.add('open');
  nav.appendChild(btn);

  // Modal
  const overlay = document.createElement('div');
  overlay.id = 'qris-overlay';
  overlay.className = 'qris-overlay';
  overlay.innerHTML = `
    <div class="qris-modal">
      <button class="qris-close" onclick="document.getElementById('qris-overlay').classList.remove('open')">&times;</button>
      <h2>&#9829; Infaq &amp; Sedekah</h2>
      <p class="qris-sub">Scan QRIS di bawah ini untuk berdonasi</p>
      <img src="/qris-masjid.jpg" alt="QRIS Masjid Al-Ghufron"
           onerror="this.outerHTML='<div class=qris-no-img>File QRIS belum tersedia.<br>Simpan foto QRIS masjid sebagai<br><strong>public/qris-masjid.jpg</strong></div>'">
      <br>
      <button class="qris-btn-close" onclick="document.getElementById('qris-overlay').classList.remove('open')">TUTUP</button>
    </div>`;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
  document.body.appendChild(overlay);
})();

const PRAYER_LOCATION = 'Cibitung, Bekasi, Jawa Barat, Indonesia';
const MYQURAN_KOTA_ID = '1203'; // KAB. BEKASI (mencakup Kec. Cibitung)
const PRAYER_ORDER_MYQURAN = [
  ['Subuh', 'subuh'],
  ['Terbit', 'terbit'],
  ['Dzuhur', 'dzuhur'],
  ['Ashar', 'ashar'],
  ['Maghrib', 'maghrib'],
  ['Isya', 'isya'],
];
const PRAYER_ORDER_ALADHAN = [
  ['Subuh', 'Fajr'],
  ['Terbit', 'Sunrise'],
  ['Dzuhur', 'Dhuhr'],
  ['Ashar', 'Asr'],
  ['Maghrib', 'Maghrib'],
  ['Isya', 'Isha'],
];

function todayISOLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Sumber utama: myquran.com (data resmi Kemenag per kota/kabupaten, tanpa geocoding).
async function fetchTimingsMyQuran() {
  const res = await fetch(`https://api.myquran.com/v2/sholat/jadwal/${MYQURAN_KOTA_ID}/${todayISOLocal()}`);
  const json = await res.json();
  if (!json.status) throw new Error('Gagal memuat jadwal (myquran)');
  const j = json.data.jadwal;
  return {
    dateLabel: j.tanggal,
    timings: PRAYER_ORDER_MYQURAN.map(([label, key]) => ({ label, raw: j[key] })),
  };
}

// Cadangan: Aladhan API (dipakai jika sumber utama sedang bermasalah).
async function fetchTimingsAladhan() {
  const url = 'https://api.aladhan.com/v1/timingsByAddress?address=' + encodeURIComponent(PRAYER_LOCATION) + '&method=20';
  const res = await fetch(url);
  const json = await res.json();
  if (json.code !== 200) throw new Error('Gagal memuat jadwal (aladhan)');
  const t = json.data.timings;
  return {
    dateLabel: json.data.date.readable,
    timings: PRAYER_ORDER_ALADHAN.map(([label, key]) => ({ label, raw: (t[key] || '').split(' ')[0] })),
  };
}

async function loadPrayerTimes(targetId, options) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const opts = options || {};
  try {
    let result;
    try {
      result = await fetchTimingsMyQuran();
    } catch (err) {
      result = await fetchTimingsAladhan();
    }

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const rows = result.timings.map(({ label, raw }) => {
      const [h, m] = raw.split(':').map(Number);
      return { label, raw, mins: h * 60 + m };
    });
    let nextIdx = rows.findIndex((r) => r.mins > nowMinutes);

    if (opts.compact) {
      el.innerHTML = rows.map((r, i) => `
        <div class="prayer-row ${i === nextIdx ? 'next' : ''}">
          <span class="prayer-name">${r.label}</span>
          <span class="prayer-time">${r.raw}</span>
        </div>`).join('');
    } else {
      el.innerHTML = `
        <p style="font-size:12.5px; color:var(--muted); margin:0 0 14px;">
          Jadwal untuk ${result.dateLabel} &middot; lokasi ${PRAYER_LOCATION} &middot; metode Kemenag RI
        </p>
        ${rows.map((r, i) => `
          <div class="prayer-row ${i === nextIdx ? 'next' : ''}">
            <span class="prayer-name">${r.label}${i === nextIdx ? ' — waktu berikutnya' : ''}</span>
            <span class="prayer-time">${r.raw}</span>
          </div>`).join('')}
      `;
    }
  } catch (err) {
    el.innerHTML = '<div class="empty-state">Gagal memuat jadwal sholat. Coba muat ulang halaman.</div>';
  }
}
