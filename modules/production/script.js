// Sản xuất Căn Cứ Ngầm - xếp hạng công thức (dữ liệu DFLoadout.gg) + hẹn giờ báo khi xong (background.js)

const $ = (id) => document.getElementById(id);
const PREFS_KEY = 'df_prod_prefs';
const SORTS = [['hour', 'Lãi/giờ'], ['batch', 'Lãi/mẻ'], ['roi', 'ROI']];
const AWAYS = [[0, 'Bất kỳ'], [2, '2h'], [6, '6h'], [8, '8h'], [12, '12h']];
const RARITY = ['', '#9e9e9e', '#4caf50', '#42a5f5', '#ab47bc', '#ffb300', '#ef5350'];
const SOURCE_VI = { auction: 'Chợ đấu giá', merchant: 'Trạm tiếp tế', 'merchant-exchange': 'Đổi hàng' };

const state = {
  data: null,
  prefs: { station: 0, sort: 'hour', away: 0, levels: [3, 3, 3, 3] },
  timers: []
};

// ---------- Định dạng ----------
const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('vi-VN'));
function short(n) {
  if (n == null) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' Tr';
  if (a >= 1e3) return (n / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' N';
  return fmt(n);
}
function dur(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? (m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`) : `${m} phút`;
}
function countdown(ms) {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, '0')).join(':');
}

const item = (id) => (state.data.items[id] || [id, '', 0]);
const icon = (id) => { const p = item(id)[1]; return p ? DFL.ASSETS + p : ''; };
const rarity = (id) => RARITY[item(id)[2]] || 'var(--border)';
const imgHtml = (id, cls = 'ico') => `<img class="${cls}" style="--rarity:${rarity(id)}" src="${DF.escape(icon(id))}" alt="" loading="lazy">`;

// ---------- Tính toán theo cấp trạm và thời gian vắng ----------
function evaluate(id, row, level) {
  const lv = row.levels[level - 1];
  const base = { id, row, name: item(row.products[0][0])[0], productId: row.products[0][0] };
  if (!lv) return { ...base, locked: true };
  const timeSec = lv[0];
  const batch = row.profitPerBatch;
  if (batch == null) return { ...base, timeSec, na: true };
  const away = state.prefs.away;
  if (away && timeSec > away * 3600) return { ...base, timeSec, tooLong: true };
  // Đang vắng X giờ thì chỉ thu hoạch được khi quay lại -> chia lãi cho max(thời gian sản xuất, X)
  const hours = Math.max(timeSec / 3600, away || 0);
  return {
    ...base,
    timeSec,
    batch,
    cost: row.materialCost,
    hour: batch / hours,
    roi: row.materialCost ? batch / row.materialCost : null
  };
}

function rank(station) {
  const level = state.prefs.levels[station];
  const all = Object.entries(state.data.rows)
    .filter(([, r]) => r.station === station)
    .map(([id, r]) => evaluate(id, r, level));
  const key = state.prefs.sort;
  const ok = all.filter((x) => x.batch != null && !x.row.leader).sort((a, b) => (b[key] ?? -Infinity) - (a[key] ?? -Infinity));
  return {
    ok,
    leader: all.filter((x) => x.batch != null && x.row.leader),
    na: all.filter((x) => x.na),
    hidden: all.filter((x) => x.locked || x.tooLong)
  };
}

// ---------- Hiển thị ----------
function mainValue(x) {
  const k = state.prefs.sort;
  if (k === 'roi') return x.roi == null ? '—' : (x.roi * 100).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + '%';
  if (k === 'batch') return short(x.batch);
  return fmt(x.hour);
}
function subValue(x) {
  return state.prefs.sort === 'hour' ? `${short(x.batch)}/mẻ` : `${fmt(x.hour)}/giờ`;
}

function rowHtml(x, i) {
  const tags = (x.row.materials.some((m) => (m[3] || []).some((s) => s.source === 'merchant-exchange')) ? '<span class="tag ex" title="Có nguyên liệu đổi hàng ở Trạm tiếp tế">Đổi hàng</span>' : '')
    + (x.row.leader ? '<span class="tag ld">Thủ lĩnh</span>' : '');
  const cls = x.na ? 'na' : x.batch < 0 ? 'neg' : '';
  const meta = x.na ? `${dur(x.timeSec)} · không bán được trên chợ` : `${dur(x.timeSec)} · vốn ${short(x.cost)}`;
  return `<button class="row ${cls}" data-id="${x.id}">
    <span class="rk">${i == null ? '–' : i + 1}</span>
    ${imgHtml(x.productId)}
    <span class="nm"><b>${DF.escape(x.name)}${tags}</b><span>${meta}</span></span>
    <span class="val">${x.na ? 'Chưa có giá' : `${mainValue(x)}<small>${subValue(x)}</small>`}</span>
  </button>`;
}

function renderControls() {
  const p = state.prefs;
  $('stationTabs').innerHTML = state.data.stations.map(([name], i) => {
    const best = rank(i).ok[0];
    return `<button class="station-tab ${i === p.station ? 'active' : ''}" data-st="${i}">
      <span class="nm">${DF.escape(name)}</span>
      <span class="best">${best ? fmt(best.hour) + '/giờ' : '—'}</span>
    </button>`;
  }).join('');
  $('sortChips').innerHTML = SORTS.map(([v, l]) => `<button class="chip ${p.sort === v ? 'active' : ''}" data-v="${v}">${l}</button>`).join('');
  $('awayChips').innerHTML = AWAYS.map(([v, l]) => `<button class="chip ${p.away === v ? 'active' : ''}" data-v="${v}">${l}</button>`).join('');
  const max = state.data.stations[p.station][1];
  $('lvSeg').innerHTML = Array.from({ length: max }, (_, i) => `<button class="${p.levels[p.station] === i + 1 ? 'active' : ''}" data-lv="${i + 1}">Lv ${i + 1}</button>`).join('');
  $('stationTitle').textContent = state.data.stations[p.station][0];
}

function renderList() {
  const r = rank(state.prefs.station);
  const section = (title, list) => list.length
    ? `<details class="more"><summary>${title} (${list.length})</summary><div class="rows">${list.map((x) => rowHtml(x)).join('')}</div></details>`
    : '';
  $('list').innerHTML = (r.ok.length
    ? `<div class="rows">${r.ok.map(rowHtml).join('')}</div>`
    : '<div class="state-box">Không có công thức phù hợp. Thử tăng cấp trạm hoặc thời gian vắng.</div>')
    + section('Cần mở khóa Thủ lĩnh', r.leader)
    + section('Không bán được trên chợ', r.na)
    + (r.hidden.length ? `<p class="muted" style="font-size:12px; margin:8px 2px 0">${r.hidden.length} công thức bị ẩn vì cần cấp trạm cao hơn hoặc lâu hơn thời gian vắng.</p>` : '');
}

function render() {
  renderControls();
  renderList();
}

// ---------- Chi tiết công thức ----------
function openDetail(id) {
  const row = state.data.rows[id];
  const st = state.prefs.station;
  const x = evaluate(id, row, state.prefs.levels[st]);
  const timeSec = x.timeSec || row.timeSec;
  const p = row.products[0];
  // products: [id, số lượng, giá 1 đơn vị, thuế, phí ký gửi]
  const revenue = row.products.reduce((a, q) => a + (q[2] || 0) * (q[1] || 1), 0);
  const tax = row.products.reduce((a, q) => a + (q[3] || 0), 0);
  const deposit = row.products.reduce((a, q) => a + (q[4] || 0), 0);

  const mats = row.materials.map(([mid, qty, cost, sources]) => {
    const s = (sources || [])[0];
    let src = s ? SOURCE_VI[s.source] || s.source : 'Không bán trên chợ';
    if (s && s.periodLimit) src += ` · giới hạn ${s.periodLimit}/kỳ`;
    if (s && s.requirement && s.requirement.seasonLevel) src += ` · cần cấp mùa ${s.requirement.seasonLevel}`;
    return `<div class="mat">${imgHtml(mid)}<span>${DF.escape(item(mid)[0])} ×${qty}<small>${DF.escape(src)}</small></span><span class="c">${cost == null ? '—' : fmt(cost)}</span></div>`;
  }).join('');

  const defH = Math.floor(timeSec / 3600);
  const defM = Math.round((timeSec % 3600) / 60);
  $('detailBody').innerHTML = `
    <button class="icon-btn modal-close" data-close>${DF.icons.close}</button>
    <div class="d-head">${imgHtml(p[0])}<div><h3>${DF.escape(item(p[0])[0])}${p[1] > 1 ? ' ×' + p[1] : ''}</h3>
      <span class="muted" style="font-size:12px">${DF.escape(state.data.stations[st][0])} · mở từ Lv ${row.unlockLevel}${row.endTime ? ' · hết hạn ' + DF.escape(row.endTime.slice(0, 10)) : ''}</span></div></div>
    <dl class="kv">
      <div><dt>Lãi/mẻ</dt><dd class="${row.profitPerBatch < 0 ? 'neg' : 'pos'}">${short(row.profitPerBatch)}</dd></div>
      <div><dt>Lãi/giờ</dt><dd>${x.hour != null ? fmt(x.hour) : '—'}</dd></div>
      <div><dt>Vốn</dt><dd>${short(row.materialCost)}</dd></div>
      <div><dt>Thời gian</dt><dd>${dur(timeSec)}</dd></div>
    </dl>
    <div class="d-sec">Nguyên liệu</div>${mats}
    <div class="d-sec">Bán ra (giá tham khảo)</div>
    <div class="sum"><span>Doanh thu</span><b>${fmt(revenue)}</b></div>
    <div class="sum"><span>Thuế giao dịch</span><b>-${fmt(tax)}</b></div>
    <div class="sum"><span>Phí ký gửi</span><b>-${fmt(deposit)}</b></div>
    <div class="sum"><span>Tổng vốn nguyên liệu</span><b>-${fmt(row.materialCost)}</b></div>
    <div class="sum" style="border-top:1px solid var(--border); margin-top:4px; padding-top:6px"><span><b>Lãi ròng</b></span><b style="color:${row.profitPerBatch < 0 ? 'var(--error)' : 'var(--primary)'}">${fmt(row.profitPerBatch)}</b></div>
    ${row.reasons.length ? `<p class="muted" style="font-size:12px">Chưa tính được lãi: ${row.reasons.map((r) => DF.escape(r.name) + (r.code === 'not-tradable' ? ' (không bán được)' : ' (chưa có giá)')).join(', ')}</p>` : ''}

    <div class="timer-form">
      <b>⏰ Hẹn giờ báo khi xong</b>
      <div class="muted" style="font-size:12px">Vừa bắt đầu sản xuất trong game? Nhập thời gian còn lại, tiện ích sẽ thông báo khi xong.</div>
      <div class="row2">
        Còn <input class="input" type="number" min="0" max="72" id="tH" value="${defH}"> giờ
        <input class="input" type="number" min="0" max="59" id="tM" value="${defM}"> phút
        <button class="btn btn-accent btn-sm" id="startTimer" style="margin-left:auto">Bắt đầu hẹn giờ</button>
      </div>
    </div>
    <p class="source-note">Nguồn: <a href="https://dfloadout.gg/de-xuat-san-xuat" target="_blank" rel="noopener">DFLoadout.gg</a></p>`;
  $('detail').hidden = false;

  $('startTimer').addEventListener('click', async () => {
    const secs = (Number($('tH').value) || 0) * 3600 + (Number($('tM').value) || 0) * 60;
    if (secs < 60) return DF.toast('Thời gian phải từ 1 phút trở lên.', 'warn');
    const res = await chrome.runtime.sendMessage({
      action: 'timer:start',
      timer: {
        station: st,
        stationName: state.data.stations[st][0],
        itemName: item(p[0])[0],
        itemId: p[0],
        icon: icon(p[0]),
        endAt: Date.now() + secs * 1000,
        durationSec: secs
      }
    });
    if (res && res.ok) {
      $('detail').hidden = true;
      DF.toast(`Đã hẹn giờ ${dur(secs)} cho ${state.data.stations[st][0]}`);
    } else {
      DF.toast((res && res.error) || 'Không đặt được hẹn giờ', 'error');
    }
  });
}

$('detail').addEventListener('click', (e) => {
  if (e.target === $('detail') || e.target.closest('[data-close]')) $('detail').hidden = true;
});

// ---------- Hẹn giờ ----------
function renderTimers() {
  if (!state.data) return;
  const now = Date.now();
  if (!state.timers.length) {
    $('timers').innerHTML = '<p class="muted" style="grid-column:1/-1; margin:0; font-size:12.5px">Chưa có hẹn giờ nào. Bấm vào một món bên dưới → "Bắt đầu hẹn giờ" sau khi đã cho sản xuất trong game.</p>';
    return;
  }
  $('timers').innerHTML = state.data.stations.map(([name], i) => {
    const t = state.timers.find((x) => x.station === i);
    if (!t) return '';
    const left = t.endAt - now;
    const done = t.done || left <= 0;
    const pct = Math.min(100, Math.max(0, 100 - (left / (t.durationSec * 1000)) * 100));
    return `<div class="timer ${done ? 'done' : ''}">
      <button class="icon-btn x" data-cancel="${i}" title="${done ? 'Xóa' : 'Hủy hẹn giờ'}">${DF.icons.close}</button>
      <span class="st">${DF.escape(name)}</span>
      <span class="it">${DF.escape(t.itemName)}</span>
      <span class="left">${done ? '✔ Đã xong, vào thu hoạch!' : countdown(left)}</span>
      <span class="bar" style="width:${done ? 100 : pct}%"></span>
    </div>`;
  }).join('');
}

$('timers').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-cancel]');
  if (!b) return;
  await chrome.runtime.sendMessage({ action: 'timer:cancel', station: Number(b.dataset.cancel) });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.df_timers) {
    state.timers = changes.df_timers.newValue || [];
    renderTimers();
  }
});
setInterval(renderTimers, 1000);

// ---------- Sự kiện điều khiển ----------
function savePrefs() { chrome.storage.local.set({ [PREFS_KEY]: state.prefs }); }

$('stationTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-st]');
  if (!b) return;
  state.prefs.station = Number(b.dataset.st);
  savePrefs();
  render();
});
$('sortChips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  state.prefs.sort = b.dataset.v;
  savePrefs();
  render();
});
$('awayChips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  state.prefs.away = Number(b.dataset.v);
  savePrefs();
  render();
});
$('lvSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lv]');
  if (!b) return;
  state.prefs.levels[state.prefs.station] = Number(b.dataset.lv);
  savePrefs();
  render();
});
$('list').addEventListener('click', (e) => {
  const r = e.target.closest('.row[data-id]');
  if (r) openDetail(r.dataset.id);
});

async function load(force) {
  const btn = $('refreshBtn');
  DF.setBusy(btn, true, 'Đang tải');
  try {
    state.data = await DFL.production(force);
    if (state.data.stamp) {
      const d = new Date(state.data.stamp);
      $('stamp').textContent = `Ước tính theo giá chợ lúc ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${d.toLocaleDateString('vi-VN')}`;
    }
    render();
    renderTimers();
    if (force) DF.toast('Đã cập nhật giá mới nhất');
  } catch (e) {
    $('list').innerHTML = `<div class="state-box">📡 Không tải được dữ liệu (${DF.escape(e.message)}).<br><br><button class="btn btn-accent" id="retry">Thử lại</button></div>`;
    $('retry').addEventListener('click', () => load(true));
  } finally {
    DF.setBusy(btn, false);
  }
}
$('refreshBtn').addEventListener('click', () => load(true));

(async function init() {
  const saved = await chrome.storage.local.get([PREFS_KEY, 'df_timers']);
  if (saved[PREFS_KEY]) state.prefs = { ...state.prefs, ...saved[PREFS_KEY] };
  state.timers = saved.df_timers || [];
  load(false);
})();
