// background.js - Service worker: điều phối tiến trình đổi giftcode.
// Trạng thái tiến trình được lưu trong chrome.storage nên popup/sidebar có thể đóng-mở tùy ý
// mà không làm mất kết quả hay lịch sử.

const REDEEM_MATCH = '*://redeem.df.garena.sg/*';
const REDEEM_URL = 'https://redeem.df.garena.sg/';
const RUN_KEY = 'df_run';
const HISTORY_KEY = 'redeemedHistory';
const CODES_KEY = 'savedCodes';
const ACTIVE = ['running', 'paused'];

if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch((e) => console.error(e));
}

// ---------- Tiện ích ----------
let queue = Promise.resolve();
// Tuần tự hóa mọi thao tác ghi để các kết quả đến dồn dập không ghi đè lẫn nhau
function serial(fn) {
  const p = queue.then(fn);
  queue = p.catch((e) => console.error(e));
  return p;
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const getRun = async () => (await chrome.storage.local.get(RUN_KEY))[RUN_KEY] || null;
const setRun = (run) => chrome.storage.local.set({ [RUN_KEY]: run });
const isActive = (run) => !!run && ACTIVE.includes(run.status);

async function addHistory(code) {
  const data = await chrome.storage.local.get(HISTORY_KEY);
  const history = data[HISTORY_KEY] || [];
  if (!history.includes(code)) {
    history.push(code);
    await chrome.storage.local.set({ [HISTORY_KEY]: history });
  }
}

function paintBadge(run) {
  if (!chrome.action) return;
  let text = '';
  let color = '#00c853';
  if (isActive(run)) {
    text = String(run.current || 0);
    if (run.status === 'paused') color = '#29b6f6';
  } else if (run && run.unseen) {
    const ok = run.results.filter((r) => r.status === 'success').length;
    text = ok > 0 ? String(ok) : (run.status === 'error' ? '!' : '');
    if (run.status === 'error') color = '#ff5252';
  }
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

async function isAlive(run) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: run.tabId },
      world: 'MAIN',
      func: (id) => window.__dfRunId === id && window.__dfActive === true,
      args: [run.id]
    });
    return !!(res && res.result);
  } catch (e) {
    return false;
  }
}

// Kết thúc tiến trình. Luôn gọi bên trong serial().
async function finishRun(run, status, message) {
  if (!isActive(run)) return;
  run.status = status;
  run.message = message || '';
  run.endedAt = Date.now();
  run.unseen = true;

  // Ô nhập chỉ giữ lại những mã còn cần xử lý: mã chưa chạy tới + mã cần thử lại
  const doneCodes = new Set(run.results.map((r) => r.code));
  const pending = [
    ...run.results.filter((r) => r.status === 'retry').map((r) => r.code),
    ...run.codes.filter((c) => !doneCodes.has(c))
  ];
  run.pending = pending;
  await chrome.storage.local.set({ [RUN_KEY]: run, [CODES_KEY]: pending.join('\n') });
  paintBadge(run);
}

// ---------- Tìm / mở trang đổi code ----------
function waitTabComplete(tabId, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Trang đổi code tải quá lâu')); }, timeout);
    const onUpdated = (id, info) => { if (id === tabId && info.status === 'complete') { cleanup(); resolve(); } };
    const onRemoved = (id) => { if (id === tabId) { cleanup(); reject(new Error('Trang đổi code đã bị đóng')); } };
    function cleanup() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.get(tabId).then((t) => { if (t.status === 'complete') { cleanup(); resolve(); } }).catch(() => { });
  });
}

async function findOrOpenRedeemTab() {
  const tabs = await chrome.tabs.query({ url: REDEEM_MATCH });
  let tab = tabs.find((t) => t.active) || tabs[0];
  if (!tab) {
    // Mở ngầm để popup không bị đóng trước khi kịp khởi động tiến trình
    tab = await chrome.tabs.create({ url: REDEEM_URL, active: false });
    await waitTabComplete(tab.id);
    await delay(1500); // chờ trang khởi tạo xong trạng thái đăng nhập
  } else if (tab.discarded) {
    await chrome.tabs.reload(tab.id);
    await waitTabComplete(tab.id);
    await delay(1500);
  } else if (tab.status !== 'complete') {
    await waitTabComplete(tab.id);
    await delay(800);
  }
  return chrome.tabs.get(tab.id);
}

async function focusTab(tab) {
  try {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch (e) { console.warn('Không thể focus tab', e); }
}

// ---------- Điều khiển tiến trình ----------
async function startRun({ codes }) {
  codes = [...new Set((codes || []).map((c) => String(c).trim()).filter(Boolean))];
  if (codes.length === 0) return { ok: false, error: 'Không có mã nào để đổi.' };

  const current = await getRun();
  if (isActive(current)) {
    if (await isAlive(current)) return { ok: false, error: 'Đang có một tiến trình chạy. Hãy dừng nó trước.' };
    await serial(() => finishRun(current, 'error', 'Tiến trình trước đã bị gián đoạn.'));
  }

  let tab;
  try {
    tab = await findOrOpenRedeemTab();
  } catch (e) {
    return { ok: false, error: e.message };
  }

  const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: dfRelay });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: dfRunner,
      args: [codes, runId]
    });
    const r = res && res.result;
    if (!r || !r.ok) {
      const reason = r ? r.reason : 'page';
      if (reason === 'login') await focusTab(tab);
      const errors = {
        login: 'Bạn chưa đăng nhập trên trang đổi code. Hãy đăng nhập Garena rồi bấm "Bắt đầu đổi" lại.',
        busy: 'Trang đổi code đang chạy dở một tiến trình cũ. Hãy tải lại trang đổi code (F5) rồi thử lại.',
        page: 'Không tìm thấy ô nhập code trên trang. Hãy tải lại trang đổi code rồi thử lại.'
      };
      return { ok: false, reason, error: errors[reason] || errors.page };
    }

    const run = {
      id: runId,
      status: 'running',
      tabId: tab.id,
      account: r.account || '',
      codes,
      total: codes.length,
      current: 0,
      currentCode: '',
      results: [],
      message: '',
      startedAt: Date.now()
    };
    await serial(() => setRun(run));
    paintBadge(run);
    // Đưa tab lên trước để trình duyệt không bóp tốc độ tab chạy ngầm
    await focusTab(tab);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'Không truy cập được trang đổi code: ' + e.message };
  }
}

async function controlRun(cmd) {
  const run = await getRun();
  if (!isActive(run)) return { ok: false };
  let delivered = false;
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: run.tabId },
      world: 'MAIN',
      func: (cmd, id) => {
        if (window.__dfRunId !== id || !window.__dfCtl) return false;
        if (cmd === 'pause') window.__dfCtl.pause = true;
        if (cmd === 'resume') window.__dfCtl.pause = false;
        if (cmd === 'stop') { window.__dfCtl.cancel = true; window.__dfCtl.pause = false; }
        return true;
      },
      args: [cmd, run.id]
    });
    delivered = !!(res && res.result);
  } catch (e) { delivered = false; }

  await serial(async () => {
    const r = await getRun();
    if (!r || r.id !== run.id || !isActive(r)) return;
    if (!delivered) return finishRun(r, cmd === 'stop' ? 'stopped' : 'error', 'Mất kết nối với trang đổi code.');
    if (cmd === 'pause') r.status = 'paused';
    if (cmd === 'resume') r.status = 'running';
    if (cmd === 'stop') r.stopping = true;
    await setRun(r);
    paintBadge(r);
  });
  return { ok: true };
}

async function checkRun() {
  const run = await getRun();
  if (isActive(run) && !(await isAlive(run))) {
    await serial(async () => {
      const r = await getRun();
      if (r && r.id === run.id) await finishRun(r, 'error', 'Tiến trình bị gián đoạn (trang đổi code đã bị tải lại hoặc đóng).');
    });
  }
  return { ok: true };
}

async function markSeen() {
  await serial(async () => {
    const r = await getRun();
    if (r && r.unseen) { r.unseen = false; await setRun(r); }
    paintBadge(r);
  });
  return { ok: true };
}

// Sự kiện do dfRunner gửi về qua dfRelay
async function onRunnerEvent(msg, sender) {
  const run = await getRun();
  if (!run || run.id !== msg.runId || !isActive(run)) return;
  if (sender.tab && sender.tab.id !== run.tabId) return;

  if (msg.event === 'progress') {
    run.current = msg.current;
    run.currentCode = msg.code;
    run.attempt = msg.attempt || 1;
    await setRun(run);
    paintBadge(run);
  } else if (msg.event === 'result') {
    run.results.push({ code: msg.code, status: msg.status, msg: msg.msg });
    await setRun(run);
    // Chỉ lưu lịch sử khi kết quả là vĩnh viễn (thành công / mã không còn dùng được)
    if (msg.status === 'success' || msg.status === 'used') await addHistory(msg.code);
  } else if (msg.event === 'end') {
    await finishRun(run, msg.reason, msg.msg);
  }
}

// ---------- Theo dõi tab đổi code ----------
chrome.tabs.onRemoved.addListener((tabId) => {
  serial(async () => {
    const run = await getRun();
    if (isActive(run) && run.tabId === tabId) await finishRun(run, 'error', 'Trang đổi code đã bị đóng giữa chừng.');
  });
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== 'loading') return;
  getRun().then(async (run) => {
    if (!isActive(run) || run.tabId !== tabId) return;
    await delay(1500);
    if (await isAlive(run)) return;
    await serial(async () => {
      const r = await getRun();
      if (r && r.id === run.id) await finishRun(r, 'error', 'Trang đổi code đã tải lại (có thể do hết phiên đăng nhập). Hãy kiểm tra đăng nhập rồi chạy tiếp.');
    });
  });
});

// ---------- Hẹn giờ sản xuất Căn Cứ Ngầm ----------
// Mỗi trạm chỉ có 1 hẹn giờ (trong game mỗi trạm sản xuất 1 mẻ một lúc)
const TIMERS_KEY = 'df_timers';
const ALARM_PREFIX = 'df_timer_';
const getTimers = async () => (await chrome.storage.local.get(TIMERS_KEY))[TIMERS_KEY] || [];

async function startTimer({ timer }) {
  if (!timer || timer.station == null || !(timer.endAt > Date.now())) return { ok: false, error: 'Thời gian hẹn không hợp lệ.' };
  await serial(async () => {
    const timers = (await getTimers()).filter((t) => t.station !== timer.station);
    timers.push({ ...timer, done: false, startedAt: Date.now() });
    await chrome.storage.local.set({ [TIMERS_KEY]: timers });
  });
  await chrome.alarms.create(ALARM_PREFIX + timer.station, { when: timer.endAt });
  return { ok: true };
}

async function cancelTimer({ station }) {
  await serial(async () => {
    const timers = (await getTimers()).filter((t) => t.station !== station);
    await chrome.storage.local.set({ [TIMERS_KEY]: timers });
  });
  await chrome.alarms.clear(ALARM_PREFIX + station);
  chrome.notifications.clear(ALARM_PREFIX + station);
  return { ok: true };
}

if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm.name.startsWith(ALARM_PREFIX)) return;
    const station = Number(alarm.name.slice(ALARM_PREFIX.length));
    serial(async () => {
      const timers = await getTimers();
      const t = timers.find((x) => x.station === station);
      if (!t || t.done) return;
      t.done = true;
      await chrome.storage.local.set({ [TIMERS_KEY]: timers });
      chrome.notifications.create(alarm.name, {
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Sản xuất xong! · ' + t.stationName,
        message: `${t.itemName} đã hoàn thành. Vào Căn Cứ Ngầm để thu hoạch và bắt đầu mẻ mới.`,
        priority: 2,
        requireInteraction: true
      });
    });
  });
}

if (chrome.notifications) {
  chrome.notifications.onClicked.addListener((id) => {
    if (!id.startsWith(ALARM_PREFIX)) return;
    chrome.notifications.clear(id);
    chrome.tabs.create({ url: chrome.runtime.getURL('modules/production/index.html') + '?view=tab' });
  });
}

// ---------- Kênh tin nhắn ----------
const handlers = {
  'timer:start': startTimer,
  'timer:cancel': cancelTimer,
  'redeem:start': startRun,
  'redeem:pause': () => controlRun('pause'),
  'redeem:resume': () => controlRun('resume'),
  'redeem:stop': () => controlRun('stop'),
  'redeem:check': checkRun,
  'redeem:seen': markSeen
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;
  if (msg.action === 'sleep') {
    setTimeout(() => sendResponse({}), Math.min(Number(msg.ms) || 0, 30000));
    return true;
  }
  if (msg.type === 'DF_REDEEM_EVENT') {
    serial(() => onRunnerEvent(msg, sender));
    return false;
  }
  const handler = handlers[msg.action];
  if (!handler) return false;
  Promise.resolve(handler(msg))
    .then(sendResponse)
    .catch((e) => sendResponse({ ok: false, error: e.message }));
  return true;
});

// =====================================================================
// Các hàm dưới đây được tiêm vào trang redeem.df.garena.sg nên phải tự chứa đủ mọi thứ.
// =====================================================================

// ISOLATED world: chuyển tiếp tin nhắn giữa trang và extension
function dfRelay() {
  if (window.__dfRelay) return;
  window.__dfRelay = true;
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.__df !== true) return;
    if (d.kind === 'event') {
      chrome.runtime.sendMessage({ type: 'DF_REDEEM_EVENT', ...d.payload }).catch(() => { });
    } else if (d.kind === 'sleep') {
      // Hẹn giờ ở service worker để không bị trình duyệt bóp khi tab chạy ngầm
      const wake = () => window.postMessage({ __df: true, kind: 'wake', id: d.id }, '*');
      chrome.runtime.sendMessage({ action: 'sleep', ms: d.ms }).then(wake, wake);
    }
  });
}

// MAIN world: tự động nhập từng mã. Trả về ngay, vòng lặp chạy nền và báo kết quả qua postMessage.
function dfRunner(codes, runId) {
  if (window.__dfActive) return { ok: false, reason: 'busy' };

  const q = (s) => document.querySelector(s);
  const isShown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

  const unlogin = q('#unlogin');
  if (unlogin && isShown(unlogin)) {
    const signin = [...document.querySelectorAll('.btn-signin, #btn-login')].find(isShown);
    if (signin) signin.click();
    return { ok: false, reason: 'login' };
  }

  const input = q('.exc-input') || q('input[type="text"]');
  const submit = q('.btn-exchange') || [...document.querySelectorAll('a, button')].find((el) => {
    const t = (el.textContent || '').trim().toLowerCase();
    return (t === 'đổi' || t === 'redeem') && isShown(el);
  });
  if (!input || !submit) return { ok: false, reason: 'page' };

  const account = ((q('.username') || {}).textContent || '').trim();

  // Bảng mã lỗi lấy từ chính trang đổi code của Garena
  // used = mã không còn dùng được (lưu lịch sử), retry = nên thử lại sau,
  // transient = lỗi tạm thời (tự thử lại ngay), fatal = phải dừng toàn bộ
  const RULES = {
    0: ['success', 'Đổi thành công! Quà đã gửi vào hộp thư trong game'],
    400053: ['used', 'Tài khoản đã đạt giới hạn đổi gói quà này'],
    400054: ['used', 'Mã không hợp lệ'],
    400067: ['used', 'Tài khoản đã đạt giới hạn đổi của nhóm mã này'],
    400068: ['used', 'Mã đã hết lượt đổi'],
    400069: ['retry', 'Mã chưa đến thời gian đổi'],
    400070: ['used', 'Mã đã hết hạn'],
    400072: ['used', 'Tài khoản đã đổi mã này rồi'],
    400073: ['retry', 'Gói quà đang lỗi cấu hình (phía Garena)'],
    503701: ['transient', 'Lỗi mạng từ máy chủ Garena'],
    10000000: ['transient', 'Máy chủ bận hoặc thao tác quá nhanh'],
    300001: ['fatal', 'Phiên đăng nhập đã hết hạn, hãy đăng nhập lại'],
    503001: ['fatal', 'Tài khoản chưa có quyền tham gia sự kiện này']
  };
  const TEXT_KEYS = { lang5: 0, lang1: 400053, lang12: 400054, lang2: 503001, networkError: 503701, lang6: 10000000 };

  const ctl = window.__dfCtl = { pause: false, cancel: false };
  window.__dfRunId = runId;
  window.__dfActive = true;

  const send = (payload) => window.postMessage({ __df: true, kind: 'event', payload: { runId, ...payload } }, '*');

  const sleep = (ms) => new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener('message', onMsg);
      clearTimeout(timer);
      resolve();
    };
    const onMsg = (e) => { if (e.source === window && e.data && e.data.__df && e.data.kind === 'wake' && e.data.id === id) finish(); };
    window.addEventListener('message', onMsg);
    const timer = setTimeout(finish, ms + 1000);
    window.postMessage({ __df: true, kind: 'sleep', ms, id }, '*');
  });

  const waitFor = async (fn, timeout) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v || ctl.cancel) return v;
      await sleep(150);
    }
    return fn();
  };

  // --- Bắt phản hồi API đổi code (XHR + fetch) ---
  let lastResp = null;
  const onResp = (status, data) => {
    lastResp = status >= 200 && status < 300 && data && typeof data === 'object'
      ? { code: data.code !== undefined ? data.code : data.ret, msg: data.msg || data.message || '' }
      : { http: status || 0 };
  };
  const XO = XMLHttpRequest.prototype.open;
  const XS = XMLHttpRequest.prototype.send;
  const F = window.fetch;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__dfUrl = String(u || '');
    return XO.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if ((this.__dfUrl || '').includes('RedeemCDKey')) {
      this.addEventListener('loadend', () => {
        let d = null;
        try { d = JSON.parse(this.responseText); } catch (e) { }
        onResp(this.status, d);
      });
    }
    return XS.apply(this, arguments);
  };
  window.fetch = function (resource) {
    const url = typeof resource === 'string' ? resource : (resource && resource.url) || '';
    const p = F.apply(this, arguments);
    if (String(url).includes('RedeemCDKey')) {
      p.then((r) => r.clone().json().then((d) => onResp(r.status, d), () => onResp(r.status, null)), () => onResp(0, null));
    }
    return p;
  };

  // --- Hộp thoại thông báo của trang ---
  const dialogText = () => {
    const d = q('#diaTips');
    if (!isShown(d)) return '';
    const p = d.querySelector('p');
    return ((p && p.textContent) || '').trim();
  };
  const closeDialog = () => {
    const d = q('#diaTips');
    if (!d || !isShown(d)) return;
    try {
      if (typeof window.closeDialog === 'function') window.closeDialog();
      else { const c = d.querySelector('.btn-close'); if (c) c.click(); }
    } catch (e) { }
    if (isShown(d)) d.style.display = 'none';
  };
  // Nhận diện thông báo bằng bảng ngôn ngữ của trang -> không phụ thuộc ngôn ngữ đang chọn
  const codeFromText = (text) => {
    const langs = window.GLanguage || {};
    for (const l of Object.keys(langs)) {
      const dict = langs[l] || {};
      for (const k of Object.keys(dict)) {
        if (dict[k] !== text) continue;
        if (k.startsWith('error_hint_')) return Number(k.slice(11));
        if (k in TEXT_KEYS) return TEXT_KEYS[k];
      }
    }
    return null;
  };

  const classify = (resp, text) => {
    if (resp && resp.http !== undefined) return ['transient', `Lỗi kết nối (HTTP ${resp.http || 'mất mạng'})`];
    const code = resp ? Number(resp.code) : codeFromText(text);
    if (code !== null && !Number.isNaN(code) && RULES[code]) return RULES[code];
    if (resp) return ['retry', `${resp.msg || 'Lỗi không xác định'} (mã lỗi ${resp.code})`];
    if (text) return ['retry', text];
    return ['transient', 'Không nhận được phản hồi từ máy chủ'];
  };

  const setInput = (value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const tryCode = async (code) => {
    closeDialog();
    lastResp = null;
    setInput(code);
    submit.click();
    // Ưu tiên kết quả API; nếu chỉ thấy hộp thoại thì chờ thêm chút cho API kịp về
    await waitFor(() => lastResp || dialogText(), 10000);
    if (!lastResp && dialogText()) await waitFor(() => lastResp, 600);
    const [status, msg] = classify(lastResp, dialogText());
    await sleep(300);
    closeDialog();
    return { status, msg };
  };

  (async () => {
    let streak = 0; // số mã liên tiếp lỗi tạm thời
    let endReason = 'done';
    let endMsg = '';
    try {
      for (let i = 0; i < codes.length; i++) {
        while (ctl.pause && !ctl.cancel) await sleep(400);
        if (ctl.cancel) { endReason = 'stopped'; endMsg = 'Đã dừng theo yêu cầu.'; break; }

        const code = codes[i];
        let outcome;
        // Lỗi tạm thời (mạng, máy chủ bận) được tự thử lại tối đa 2 lần, giãn cách tăng dần
        for (let attempt = 1; attempt <= 3; attempt++) {
          send({ event: 'progress', current: i + 1, total: codes.length, code, attempt });
          outcome = await tryCode(code);
          if (outcome.status !== 'transient' || ctl.cancel || attempt === 3) break;
          await sleep(1500 * attempt);
        }

        const finalStatus = outcome.status === 'transient' || outcome.status === 'fatal' ? 'retry' : outcome.status;
        send({ event: 'result', code, status: finalStatus, msg: outcome.msg });

        if (outcome.status === 'fatal') { endReason = 'error'; endMsg = outcome.msg; break; }
        streak = outcome.status === 'transient' ? streak + 1 : 0;
        if (streak >= 3) { endReason = 'error'; endMsg = 'Mạng hoặc máy chủ Garena không ổn định. Đã tự dừng, hãy thử lại sau ít phút.'; break; }

        // Trang tự khóa nút Đổi ~1 giây sau mỗi lần gửi
        if (i < codes.length - 1) await sleep(1200);
      }
    } catch (e) {
      endReason = 'error';
      endMsg = 'Lỗi không mong muốn: ' + (e && e.message ? e.message : e);
    } finally {
      XMLHttpRequest.prototype.open = XO;
      XMLHttpRequest.prototype.send = XS;
      window.fetch = F;
      window.__dfActive = false;
      send({ event: 'end', reason: endReason, msg: endMsg });
    }
  })();

  return { ok: true, account };
}
