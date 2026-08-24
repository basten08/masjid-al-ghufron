document.querySelectorAll('.nav-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.getElementById('site-nav').classList.toggle('open');
  });
});

const PRAYER_LOCATION = 'Cibitung, Bekasi, Jawa Barat, Indonesia';
const PRAYER_ORDER = [
  ['Subuh', 'Fajr'],
  ['Terbit', 'Sunrise'],
  ['Dzuhur', 'Dhuhr'],
  ['Ashar', 'Asr'],
  ['Maghrib', 'Maghrib'],
  ['Isya', 'Isha'],
];

async function loadPrayerTimes(targetId, options) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const opts = options || {};
  try {
    const url = 'https://api.aladhan.com/v1/timingsByAddress?address=' + encodeURIComponent(PRAYER_LOCATION) + '&method=20';
    const res = await fetch(url);
    const json = await res.json();
    if (json.code !== 200) throw new Error('Gagal memuat jadwal');
    const t = json.data.timings;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const rows = PRAYER_ORDER.map(([label, key]) => {
      const raw = (t[key] || '').split(' ')[0];
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
      const dateLabel = json.data.date.readable;
      el.innerHTML = `
        <p style="font-size:12.5px; color:var(--muted); margin:0 0 14px;">
          Jadwal untuk ${dateLabel} &middot; lokasi ${PRAYER_LOCATION} &middot; metode Kemenag RI
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
