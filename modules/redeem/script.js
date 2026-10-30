// Nhập Giftcode - giao diện. Toàn bộ tiến trình chạy ở background.js,
// trang này chỉ hiển thị trạng thái lưu trong chrome.storage và gửi lệnh điều khiển.

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQS9k3934WWwsVa5yNKAnmBIY80dmtV9ezNgZeSvqgRI0T7QnlCKN_5XdcZFiPxI012vsisZBm92L9b/pub?output=csv';
const CODE_RE = /^[A-Za-z0-9_-]{4,40}$/;

const $ = (id) => document.getElementById(id);
const codesInput = $('codesInput');
const skipHistoryEl = $('skipHistory');
const redeemBtn = $('redeemBtn');
const resultsEl = $('results');

const state = {
  run: null,
  history: new Set(),
  filter: 'all',
  rendered: { runId: null, count: 0, filter: 'all' }
};

const send = (action, extra = {}) => chrome.runtime.sendMessage({ action, ...extra });
const isActive = (run) => !!run && (run.status === 'running' || run.status === 'paused');

// ---------- Phân tích ô nhập ----------
function tokenize(text) {
  return text.split(/[\s,;|]+/).map((t) => t.replace(/^["'`]+|["'`]+$/g, '')).filter(Boolean);
}

function analyze() {
  const seen = new Set();
  const valid = [];
  let dup = 0, invalid = 0, old = 0;
  for (const t of tokenize(codesInput.value)) {
    if (!CODE_RE.test(t)) { invalid++; continue; }
    if (seen.has(t)) { dup++; continue; }
    seen.add(t);
    if (skipHistoryEl.checked && state.history.has(t)) { old++; continue; }
    valid.push(t);
  }
  return { valid, dup, invalid, old };
}

function renderMeter() {
  const { valid, dup, invalid, old } = analyze();
  const parts = [];
  if (valid.length || (!dup && !old && !invalid)) parts.push(`<span class="ready"><b>${valid.length}</b> mã sẽ đổi</span>`);
  if (old) parts.push(`<span><b>${old}</b> đã nhập trước (bỏ qua)</span>`);
  if (dup) parts.push(`<span><b>${dup}</b> trùng lặp</span>`);
  if (invalid) parts.push(`<span title="Mã chỉ gồm chữ, số, - hoặc _, dài 4-40 ký tự"><b>${invalid}</b> không hợp lệ</span>`);
  $('codeMeter').innerHTML = codesInput.value.trim() ? parts.join('') : '<span>Chưa có mã nào</span>';

  if (!isActive(state.run) && !redeemBtn.dataset.idleHtml) {
    redeemBtn.textContent = valid.length ? `Bắt đầu đổi ${valid.length} mã` : 'Bắt đầu đổi';
  }
}

let saveTimer;
codesInput.addEventListener('input', () => {
  renderMeter();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ savedCodes: codesInput.value }), 300);
});

skipHistoryEl.addEventListener('change', () => {
  chrome.storage.local.set({ df_skip_history: skipHistoryEl.checked });
  renderMeter();
});

$('clearBtn').addEventListener('click', async () => {
  if (!codesInput.value.trim()) return;
  const ok = await DF.confirm({ title: 'Xóa ô nhập?', message: 'Toàn bộ mã trong ô nhập sẽ bị xóa.', okText: 'Xóa', danger: true });
  if (!ok) return;
  codesInput.value = '';
  chrome.storage.local.set({ savedCodes: '' });
  renderMeter();
});

// ---------- Lấy code từ nguồn của tác giả ----------
$('cloudFetchBtn').addEventListener('click', async () => {
  const btn = $('cloudFetchBtn');
  DF.setBusy(btn, true, 'Đang tải danh sách...');
  try {
    // Gộp 2 nguồn: Google Sheet của tác giả + DFLoadout.gg/code-garena
    const sources = [
      ['Tác giả', async () => {
        const res = await fetch(SHEET_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return tokenize(await res.text());
      }],
      ['DFLoadout.gg', () => DFL.codes(true)]
    ];
    const settled = await Promise.allSettled(sources.map(([, load]) => load()));
    const failed = sources.filter((_, i) => settled[i].status === 'rejected').map(([name]) => name);
    if (failed.length === sources.length) throw new Error(settled[0].reason.message);

    const existing = new Set(tokenize(codesInput.value));
    const seen = new Set();
    const fresh = [];
    const perSource = [];
    let total = 0;
    sources.forEach(([name], i) => {
      if (settled[i].status !== 'fulfilled') return;
      let added = 0;
      for (const c of settled[i].value) {
        if (!CODE_RE.test(c) || seen.has(c)) continue;
        seen.add(c);
        total++;
        if (state.history.has(c) || existing.has(c)) continue;
        fresh.push(c);
        added++;
      }
      perSource.push(`${name}: ${added}`);
    });

    if (!total) {
      DF.toast('Các nguồn hiện chưa có mã nào.', 'info');
    } else if (!fresh.length) {
      DF.toast(`Đã kiểm tra ${total} mã từ các nguồn: bạn đã có hoặc đã nhập hết rồi. Chưa có mã mới!`, 'info', 4500);
    } else {
      const prefix = codesInput.value.trim() ? codesInput.value.replace(/\s+$/, '') + '\n' : '';
      codesInput.value = prefix + fresh.join('\n');
      chrome.storage.local.set({ savedCodes: codesInput.value });
      DF.toast(`Đã thêm ${fresh.length} mã mới (${perSource.join(' · ')}), bỏ qua ${total - fresh.length} mã đã có / đã nhập`, 'success', 5000);
    }
    if (failed.length) DF.toast(`Không tải được nguồn: ${failed.join(', ')}`, 'warn', 5000);
    renderMeter();
  } catch (e) {
    DF.toast('Không tải được danh sách mã: ' + e.message + '. Kiểm tra kết nối mạng rồi thử lại.', 'error', 5000);
  } finally {
    DF.setBusy(btn, false);
  }
});

// ---------- Điều khiển tiến trình ----------
redeemBtn.addEventListener('click', async () => {
  if (isActive(state.run)) return;
  const { valid, old } = analyze();
  if (!valid.length) {
    DF.toast(old ? 'Tất cả mã trong ô nhập đều đã được nhập trước đây. Không có mã mới.' : 'Hãy dán ít nhất một mã hợp lệ.', 'warn');
    return;
  }
  DF.setBusy(redeemBtn, true, 'Đang kết nối trang đổi code...');
  try {
    const res = await send('redeem:start', { codes: valid });
    if (!res || !res.ok) DF.toast((res && res.error) || 'Không khởi động được.', res && res.reason === 'login' ? 'warn' : 'error', 6000);
  } catch (e) {
    DF.toast('Lỗi: ' + e.message, 'error');
  } finally {
    DF.setBusy(redeemBtn, false);
    render();
  }
});

async function control(btn, action, label) {
  DF.setBusy(btn, true, label);
  try { await send(action); } finally { DF.setBusy(btn, false); }
}
$('pauseBtn').addEventListener('click', (e) => control(e.currentTarget, 'redeem:pause', 'Đang tạm dừng...'));
$('resumeBtn').addEventListener('click', (e) => control(e.currentTarget, 'redeem:resume', 'Đang tiếp tục...'));
$('stopBtn').addEventListener('click', (e) => control(e.currentTarget, 'redeem:stop', 'Đang dừng...'));

// ---------- Hiển thị ----------
const STATUS_ICON = { success: '✔', used: '–', retry: '✖' };

function itemHtml(r) {
  const esc = DF.escape;
  return `<div class="res-item s-${r.status}" data-status="${r.status}">
    <span class="res-icon">${STATUS_ICON[r.status] || '•'}</span>
    <div class="res-body"><div class="res-code">${esc(r.code)}</div><div class="res-msg">${esc(r.msg)}</div></div>
    <button class="icon-btn" data-copy="${esc(r.code)}" title="Copy mã">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
    </button>
  </div>`;
}

function renderResults(run) {
  const results = run ? run.results : [];
  const r = state.rendered;
  const match = (x) => state.filter === 'all' || x.status === state.filter;

  if (!run || r.runId !== run.id || r.filter !== state.filter || results.length < r.count) {
    // Vẽ lại toàn bộ (mới nhất ở trên)
    resultsEl.innerHTML = results.filter(match).reverse().map(itemHtml).join('');
  } else if (results.length > r.count) {
    // Chỉ chèn thêm các kết quả mới
    const added = results.slice(r.count).filter(match).reverse().map(itemHtml).join('');
    resultsEl.insertAdjacentHTML('afterbegin', added);
  }
  state.rendered = { runId: run ? run.id : null, count: results.length, filter: state.filter };

  const counts = { all: results.length, success: 0, used: 0, retry: 0 };
  results.forEach((x) => { counts[x.status] = (counts[x.status] || 0) + 1; });
  bumpStat('statAll', counts.all);
  bumpStat('statSuccess', counts.success);
  bumpStat('statUsed', counts.used);
  bumpStat('statRetry', counts.retry);

  $('resultsEmpty').classList.toggle('hidden', resultsEl.children.length > 0);
  if (!resultsEl.children.length && results.length) {
    $('resultsEmpty').innerHTML = '<div class="big">🔍</div>Không có kết quả nào trong mục này.';
  } else if (!results.length) {
    $('resultsEmpty').innerHTML = '<div class="big">🎁</div>Chưa có kết quả. Dán mã hoặc bấm <b>"Lấy code mới"</b> rồi <b>"Bắt đầu đổi"</b>.';
  }

  $('resultsTime').textContent = run && run.startedAt ? '· ' + new Date(run.startedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '';
  return counts;
}

function bumpStat(id, value) {
  const el = $(id);
  if (el.textContent === String(value)) return;
  el.textContent = value;
  el.classList.remove('pulse-anim');
  void el.offsetWidth;
  el.classList.add('pulse-anim');
}

function formatEta(run) {
  const done = run.results.length;
  if (done < 2 || run.status !== 'running') return '';
  const per = (Date.now() - run.startedAt) / done;
  const secs = Math.round((per * (run.total - done)) / 1000);
  if (secs < 5) return '';
  return secs < 60 ? `còn khoảng ${secs} giây` : `còn khoảng ${Math.round(secs / 60)} phút`;
}

function renderRun(run, counts) {
  const active = isActive(run);
  const box = $('runBox');
  box.classList.toggle('hidden', !active);
  redeemBtn.classList.toggle('hidden', active);
  codesInput.disabled = active;
  $('codeMeter').classList.toggle('hidden', active);
  $('cloudFetchBtn').disabled = active;
  $('clearBtn').disabled = active;
  $('popupHint').classList.toggle('hidden', !(DF.view === 'popup' && (active || !run)));

  const chip = $('accountChip');
  chip.classList.toggle('hidden', !(run && run.account));
  if (run && run.account) chip.textContent = run.account;

  if (active) {
    const processed = run.results.length;
    box.classList.toggle('paused', run.status === 'paused');
    $('runTitle').textContent = run.stopping ? 'Đang dừng...' : run.status === 'paused' ? 'Đã tạm dừng' : 'Đang đổi mã';
    $('runCount').textContent = `${Math.max(run.current, processed)}/${run.total}`;
    const attempt = run.attempt > 1 ? ` · thử lại lần ${run.attempt - 1}` : '';
    const eta = formatEta(run);
    $('runSub').innerHTML = run.currentCode
      ? `Mã hiện tại: <code>${DF.escape(run.currentCode)}</code>${attempt}${eta ? ' · ' + eta : ''}`
      : 'Đang khởi động...';
    $('progressFill').style.width = `${Math.round((processed / run.total) * 100)}%`;
    $('pauseBtn').classList.toggle('hidden', run.status === 'paused');
    $('resumeBtn').classList.toggle('hidden', run.status !== 'paused');
  }

  // Thông báo khi kết thúc
  const banner = $('endBanner');
  if (!run || active) { banner.classList.add('hidden'); return; }
  const pending = run.pending || [];
  const remain = run.total - run.results.length;
  const ok = run.status === 'done';
  const title = ok ? '✅ Hoàn tất!' : run.status === 'stopped' ? '⏹ Đã dừng' : '⚠️ Tiến trình bị dừng';
  const summary = `${counts.success} thành công · ${counts.used} không dùng được · ${counts.retry} cần thử lại` + (remain > 0 ? ` · ${remain} chưa chạy` : '');
  banner.className = 'end-banner ' + (ok ? 'ok' : 'err');
  banner.innerHTML = `
    <div class="title">${title}</div>
    <div>${DF.escape(run.message || summary)}</div>
    ${run.message ? `<div class="muted" style="font-size:12px; margin-top:2px">${summary}</div>` : ''}
    <div class="actions">
      ${pending.length ? `<button class="btn btn-sm btn-accent" data-act="rerun">↻ Chạy lại ${pending.length} mã còn lại</button>` : ''}
      ${counts.success ? `<button class="btn btn-sm" data-act="copy-success">📋 Copy ${counts.success} mã thành công</button>` : ''}
    </div>`;
}

$('endBanner').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || !state.run) return;
  if (btn.dataset.act === 'copy-success') {
    DF.copy(state.run.results.filter((r) => r.status === 'success').map((r) => r.code).join('\n'), 'Đã copy danh sách mã thành công');
  } else if (btn.dataset.act === 'rerun') {
    codesInput.value = (state.run.pending || []).join('\n');
    await chrome.storage.local.set({ savedCodes: codesInput.value });
    renderMeter();
    redeemBtn.click();
  }
});

resultsEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-copy]');
  if (b) DF.copy(b.dataset.copy, `Đã copy ${b.dataset.copy}`);
});

$('tiles').addEventListener('click', (e) => {
  const tile = e.target.closest('.tile');
  if (!tile) return;
  state.filter = tile.dataset.filter;
  document.querySelectorAll('.tile').forEach((t) => t.classList.toggle('active', t === tile));
  renderResults(state.run);
});

function render() {
  const counts = renderResults(state.run);
  renderRun(state.run, counts);
  renderMeter();
}

// ---------- Đồng bộ với storage ----------
function applyHistory(list) {
  state.history = new Set(list || []);
  $('historyCount').textContent = state.history.size;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.redeemedHistory) applyHistory(changes.redeemedHistory.newValue);
  if (changes.savedCodes && document.activeElement !== codesInput) {
    codesInput.value = changes.savedCodes.newValue || '';
  }
  if (changes.df_run) {
    const prev = changes.df_run.oldValue;
    const next = changes.df_run.newValue || null;
    state.run = next;
    // Vừa kết thúc khi đang mở trang -> báo luôn và đánh dấu đã xem
    if (isActive(prev) && next && !isActive(next)) {
      const okCount = next.results.filter((r) => r.status === 'success').length;
      if (next.status === 'done') DF.toast(`Hoàn tất! ${okCount} mã đổi thành công.`, 'success', 5000);
      else DF.toast(next.message || 'Tiến trình đã dừng.', next.status === 'error' ? 'error' : 'info', 6000);
      send('redeem:seen');
    }
  }
  if (changes.df_run || changes.redeemedHistory || changes.savedCodes) render();
});

// Cập nhật thời gian ước tính mỗi vài giây
setInterval(() => { if (state.run && state.run.status === 'running') renderRun(state.run, renderResults(state.run)); }, 3000);

(async function init() {
  const data = await chrome.storage.local.get(['savedCodes', 'redeemedHistory', 'df_run', 'df_skip_history']);
  codesInput.value = data.savedCodes || '';
  skipHistoryEl.checked = data.df_skip_history !== false;
  applyHistory(data.redeemedHistory);
  state.run = data.df_run || null;
  render();
  // Kiểm tra tiến trình còn sống không (trường hợp trang đổi code đã bị tải lại khi popup đóng)
  if (isActive(state.run)) send('redeem:check');
  else if (state.run && state.run.unseen) send('redeem:seen');
})();

// ======= Quản lý lịch sử =======
const historyModal = $('historyModal');
const historyTextarea = $('historyTextarea');

function updateHistoryMeta() {
  const n = tokenize(historyTextarea.value).length;
  $('historyMeta').textContent = `${n} mã`;
}
historyTextarea.addEventListener('input', updateHistoryMeta);

$('openHistoryBtn').addEventListener('click', () => {
  historyTextarea.value = [...state.history].join('\n');
  updateHistoryMeta();
  historyModal.hidden = false;
});
historyModal.addEventListener('click', (e) => {
  if (e.target === historyModal || e.target.closest('[data-close-history]')) historyModal.hidden = true;
});

$('saveHistoryBtn').addEventListener('click', async () => {
  const list = [...new Set(tokenize(historyTextarea.value))];
  await chrome.storage.local.set({ redeemedHistory: list });
  DF.toast(`Đã lưu lịch sử (${list.length} mã)`);
  historyModal.hidden = true;
});

$('clearHistoryBtn').addEventListener('click', async () => {
  const ok = await DF.confirm({
    title: 'Xóa toàn bộ lịch sử?',
    message: 'Tiện ích sẽ không còn bỏ qua các mã cũ nữa. Không thể hoàn tác trừ khi bạn đã xuất file sao lưu.',
    okText: 'Xóa lịch sử',
    danger: true
  });
  if (!ok) return;
  await chrome.storage.local.set({ redeemedHistory: [] });
  historyTextarea.value = '';
  updateHistoryMeta();
  DF.toast('Đã xóa lịch sử');
});

$('exportHistoryBtn').addEventListener('click', () => {
  const text = tokenize(historyTextarea.value).join('\n');
  if (!text) return DF.toast('Lịch sử trống, không có gì để xuất.', 'info');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `DeltaForce_History_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('importHistoryBtn').addEventListener('click', () => $('historyFileInput').click());
$('historyFileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    const imported = tokenize(String(reader.result)).filter((c) => CODE_RE.test(c));
    const merged = [...new Set([...state.history, ...imported])];
    await chrome.storage.local.set({ redeemedHistory: merged });
    historyTextarea.value = merged.join('\n');
    updateHistoryMeta();
    DF.toast(`Đã nhập ${imported.length} mã (tổng ${merged.length} mã)`);
  };
  reader.readAsText(file);
});
