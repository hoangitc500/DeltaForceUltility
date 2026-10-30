// popup.js - Trang chủ

document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = DF.icons[el.dataset.icon] || ''; });
document.querySelectorAll('[data-go]').forEach((card) => {
  card.addEventListener('click', () => DF.go(card.dataset.go));
});
document.getElementById('pwMore').addEventListener('click', () => DF.go('modules/passwords/index.html'));

// Hiển thị nhanh trạng thái tiến trình đổi code ngay trên thẻ
function paintRedeemStatus(run) {
  const el = document.getElementById('redeemStatus');
  el.className = 'card-status';
  if (!run) { el.textContent = ''; return; }
  const ok = run.results.filter((r) => r.status === 'success').length;
  if (run.status === 'running' || run.status === 'paused') {
    el.classList.add('live');
    el.textContent = `${run.status === 'paused' ? 'Tạm dừng' : 'Đang chạy'} ${run.results.length}/${run.total}`;
  } else {
    el.textContent = run.unseen ? `Có kết quả mới · ${ok} thành công` : `Lần gần nhất: ${ok} thành công`;
  }
}

chrome.storage.local.get(['df_run', 'df_fav_loadouts'], (data) => {
  paintRedeemStatus(data.df_run);
  const favs = (data.df_fav_loadouts || []).length;
  if (favs) document.getElementById('armoryStatus').textContent = `★ ${favs} loadout đã lưu`;
});

// Trạng thái hẹn giờ sản xuất
let timers = [];
function paintProdStatus() {
  const el = document.getElementById('prodStatus');
  const now = Date.now();
  const done = timers.filter((t) => t.done || t.endAt <= now).length;
  const running = timers.filter((t) => !t.done && t.endAt > now).sort((a, b) => a.endAt - b.endAt);
  el.className = 'card-status' + (running.length ? ' live' : '');
  if (done) el.textContent = `✔ ${done} trạm đã xong, vào thu hoạch!`;
  else if (running.length) {
    const s = Math.max(0, Math.floor((running[0].endAt - now) / 1000));
    const hms = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, '0')).join(':');
    el.textContent = `${running.length} hẹn giờ · xong sớm nhất sau ${hms}`;
  } else el.textContent = '';
}
chrome.storage.local.get('df_timers', (d) => { timers = d.df_timers || []; paintProdStatus(); });
setInterval(paintProdStatus, 1000);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.df_run) paintRedeemStatus(changes.df_run.newValue);
  if (changes.df_timers) { timers = changes.df_timers.newValue || []; paintProdStatus(); }
});

// Mật khẩu phòng hôm nay (nguồn DFLoadout.gg)
const pwGrid = document.getElementById('pwGrid');
DFL.passwords().then((data) => {
  pwGrid.innerHTML = data.maps.map((m) => `
    <button class="pw-chip" data-code="${DF.escape(m.code)}" title="Bấm để copy mật khẩu ${DF.escape(m.map)}">
      <span class="map">${DF.escape(m.map)}</span>
      <span class="code">${DF.escape(m.code)}</span>
    </button>`).join('');
  if (data.updated) document.getElementById('pwUpdated').textContent = '· ' + data.updated;
}).catch(() => {
  pwGrid.innerHTML = '<span class="muted" style="grid-column:1/-1; font-size:12px">Chưa tải được mật khẩu hôm nay. Kiểm tra kết nối mạng.</span>';
});
pwGrid.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-code]');
  if (chip) DF.copy(chip.dataset.code, `Đã copy mật khẩu ${chip.dataset.code}`);
});
