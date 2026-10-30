// Kho Loadout Meta - dữ liệu thật từ API công khai của meta.deltaforce.garena.com

const API = 'https://meta.deltaforce.garena.com/api/app';
const CONFIG_KEY = 'df_meta_config';
const FAV_KEY = 'df_fav_loadouts';
const CONFIG_TTL = 12 * 60 * 60 * 1000;
const PAGE_SIZE = 12;

const TYPE_VI = { GUN_RIFLE: 'Súng trường', GUN_SMG: 'Tiểu liên & Súng máy', GUN_SHOTGUN_PISTOL: 'Shotgun & Súng lục', GUN_SNIPER: 'Bắn tỉa & DMR', GUN_OTHER: 'Khác' };
const TAG_VI = { TAG_CLOSE_RANGE: 'Tầm gần', TAG_MEDIUM_RANGE: 'Tầm trung', TAG_LONG_RANGE: 'Tầm xa', TAG_SNIPER: 'Bắn tỉa' };
const MODES = [['', 'Tất cả'], ['WARFARE', 'Chiến Trường'], ['OPERATIONS', 'Chiến Dịch'], ['__fav', '★ Đã lưu']];
const MODE_VI = { WARFARE: 'Chiến Trường', OPERATIONS: 'Chiến Dịch' };
const PLATFORM_VI = { Both: 'PC & Mobile', Mobile: 'Mobile', PC: 'PC' };
const STATS = [['stats2', 'Tầm bắn'], ['stats3', 'Kiểm soát'], ['stats4', 'Thao tác'], ['stats5', 'Ổn định'], ['stats6', 'Chính xác']];

const $ = (id) => document.getElementById(id);
const grid = $('grid');
const loadMoreBtn = $('loadMoreBtn');

const state = {
  config: null,
  weapons: new Map(),
  tags: new Map(),
  filters: { keyword: '', type: '', mode: '', tag: '' },
  page: 0,
  totalPage: 0,
  items: [],
  loading: false,
  reqId: 0,
  favs: new Map()
};

const STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1z"/></svg>';

async function getJson(url) {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

async function loadConfig() {
  const cached = (await chrome.storage.local.get(CONFIG_KEY))[CONFIG_KEY];
  if (cached && Date.now() - cached.at < CONFIG_TTL) return cached.data;
  try {
    const c = await getJson(`${API}/config`);
    const data = { weaponTypes: c.weaponTypes || [], weapons: c.weapons || [], tags: c.tags || [] };
    chrome.storage.local.set({ [CONFIG_KEY]: { at: Date.now(), data } });
    return data;
  } catch (e) {
    if (cached) return cached.data; // mạng lỗi -> dùng bản cũ
    throw e;
  }
}

// ---------- Bộ lọc ----------
function chipsHtml(list, active) {
  return list.map(([v, label]) => `<button class="chip ${v === active ? 'active' : ''}" data-v="${DF.escape(v)}">${DF.escape(label)}</button>`).join('');
}

function renderFilters() {
  const f = state.filters;
  const types = [['', 'Tất cả'], ...state.config.weaponTypes.map((t) => [String(t.id), TYPE_VI[t.key] || t.name])];
  const tags = [['', 'Tất cả'], ...state.config.tags.map((t) => [String(t.id), TAG_VI[t.key] || t.name])];
  $('typeChips').innerHTML = chipsHtml(types, f.type);
  $('modeChips').innerHTML = chipsHtml(MODES, f.mode);
  $('tagChips').innerHTML = chipsHtml(tags, f.tag);
}

function bindChips(id, key) {
  $(id).addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip || state.filters[key] === chip.dataset.v) return;
    state.filters[key] = chip.dataset.v;
    renderFilters();
    reload();
  });
}
bindChips('typeChips', 'type');
bindChips('modeChips', 'mode');
bindChips('tagChips', 'tag');

let searchTimer;
$('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.filters.keyword = e.target.value.trim();
    reload();
  }, 400);
});

// ---------- Dữ liệu ----------
function buildUrl(page) {
  const f = state.filters;
  const p = new URLSearchParams({ langId: '3', pageSize: String(PAGE_SIZE), page: String(page) });
  if (f.keyword) p.set('keyword', f.keyword);
  if (f.mode && f.mode !== '__fav') p.append('modes', f.mode);
  if (f.type) p.append('weaponTypeIds', f.type);
  if (f.tag) p.append('tags', f.tag);
  return `${API}/loadouts/weaponType?${p}`;
}

function favMatches(item) {
  const f = state.filters;
  if (f.type && String(item.weaponTypeId) !== f.type) return false;
  if (f.tag && ![item.tag1Id, item.tag2Id, item.tag3Id].map(String).includes(f.tag)) return false;
  if (f.keyword) {
    const hay = `${weaponName(item)} ${item.name} ${item.author}`.toLowerCase();
    if (!hay.includes(f.keyword.toLowerCase())) return false;
  }
  return true;
}

async function reload() {
  if (state.source && state.source !== 'community') return;
  state.page = 0;
  state.totalPage = 0;
  state.items = [];
  grid.innerHTML = '<div class="skeleton"></div>'.repeat(4);
  loadMoreBtn.classList.add('hidden');

  if (state.filters.mode === '__fav') {
    state.reqId++;
    state.items = [...state.favs.values()].filter(favMatches);
    renderGrid();
    return;
  }
  await loadPage(1);
}

async function loadPage(page) {
  const id = ++state.reqId;
  state.loading = true;
  DF.setBusy(loadMoreBtn, page > 1, 'Đang tải...');
  try {
    const res = await getJson(buildUrl(page));
    if (id !== state.reqId) return; // đã có yêu cầu mới hơn
    state.items = state.items.concat(res.data || []);
    state.page = page;
    state.totalPage = res.totalPage || page;
    renderGrid();
  } catch (e) {
    if (id !== state.reqId) return;
    if (page === 1) {
      grid.innerHTML = `<div class="state-box"><div class="big">📡</div>Không tải được dữ liệu từ Garena (${DF.escape(e.message)}).<br><br><button class="btn btn-accent" id="retryBtn">Thử lại</button></div>`;
      $('retryBtn').addEventListener('click', reload);
      $('resultInfo').textContent = '';
    } else {
      DF.toast('Không tải thêm được: ' + e.message, 'error');
    }
  } finally {
    if (id === state.reqId) {
      state.loading = false;
      DF.setBusy(loadMoreBtn, false);
    }
  }
}

// ---------- Hiển thị ----------
function weaponName(item) {
  const w = state.weapons.get(item.weaponId);
  if (w) return w.name;
  const parts = String(item.name || '').split(' - ');
  return parts[1] || item.name || 'Không rõ';
}

const compact = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
};

function cardHtml(item) {
  const esc = DF.escape;
  const w = state.weapons.get(item.weaponId);
  const tags = [item.tag1Id, item.tag2Id, item.tag3Id]
    .filter((t) => t && state.tags.has(t))
    .map((t) => { const tag = state.tags.get(t); return `<span class="badge">${esc(TAG_VI[tag.key] || tag.name)}</span>`; })
    .join('');
  const stats = STATS.map(([k, label]) => {
    const v = Math.max(0, Math.min(100, Number(item[k]) || 0));
    return `<div class="stat"><div class="row"><span>${label}</span><b>${v}</b></div><div class="bar"><div style="width:${v}%"></div></div></div>`;
  }).join('');
  const isFav = state.favs.has(item.id);

  return `<article class="lo-card" data-id="${item.id}">
    <div class="lo-head">
      ${w && w.image ? `<img class="lo-img" src="${esc(w.image)}" alt="" loading="lazy">` : ''}
      <div class="lo-title">
        <div class="lo-weapon">${esc(weaponName(item))}</div>
        <div class="lo-meta" title="${esc(item.name)}">bởi ${esc(item.author || 'Ẩn danh')} · #${item.id}</div>
      </div>
      <button class="icon-btn fav-btn ${isFav ? 'on' : ''}" data-fav="${item.id}" title="${isFav ? 'Bỏ lưu' : 'Lưu loadout này'}">${STAR}</button>
    </div>
    <div class="lo-tags">
      ${MODE_VI[item.stats1] ? `<span class="badge mode-${esc(item.stats1)}">${MODE_VI[item.stats1]}</span>` : ''}
      ${tags}
      ${PLATFORM_VI[item.stats7] ? `<span class="badge">${PLATFORM_VI[item.stats7]}</span>` : ''}
      <span class="badge hot" title="${Number(item.numberOfCopy || 0).toLocaleString('vi-VN')} lượt copy">🔥 ${compact(item.numberOfCopy)}</span>
    </div>
    <div class="lo-stats">${stats}</div>
    <button class="lo-code" data-code="${esc(item.code)}" title="Copy mã để dán vào game">
      <code>${esc(item.code)}</code><span>COPY CODE</span>
    </button>
  </article>`;
}

function renderGrid() {
  if (state.source !== 'community') return;
  const fav = state.filters.mode === '__fav';
  if (!state.items.length) {
    grid.innerHTML = fav
      ? '<div class="state-box"><div class="big">★</div>Chưa lưu loadout nào. Bấm ngôi sao trên thẻ để lưu lại loadout hay dùng.</div>'
      : '<div class="state-box"><div class="big">🔍</div>Không tìm thấy loadout phù hợp. Thử bỏ bớt bộ lọc.</div>';
  } else {
    grid.innerHTML = state.items.map(cardHtml).join('');
  }
  const more = !fav && state.page < state.totalPage;
  loadMoreBtn.classList.toggle('hidden', !more);
  $('resultInfo').textContent = state.items.length
    ? (fav ? `${state.items.length} loadout đã lưu` : `Đang hiển thị ${state.items.length} loadout · sắp xếp theo độ phổ biến`)
    : '';
}

grid.addEventListener('click', (e) => {
  const codeBtn = e.target.closest('[data-code]');
  if (codeBtn) {
    DF.copy(codeBtn.dataset.code, 'Đã copy! Vào game → cải tiến súng → Nhập mã để áp dụng.');
    codeBtn.classList.add('copied');
    codeBtn.querySelector('span').textContent = '✔ ĐÃ COPY';
    setTimeout(() => { codeBtn.classList.remove('copied'); codeBtn.querySelector('span').textContent = 'COPY CODE'; }, 1800);
    return;
  }
  const favBtn = e.target.closest('[data-fav]');
  if (favBtn) toggleFav(Number(favBtn.dataset.fav), favBtn);
});

function toggleFav(id, btn) {
  if (state.favs.has(id)) {
    state.favs.delete(id);
  } else {
    const item = state.items.find((x) => x.id === id);
    if (item) state.favs.set(id, item);
  }
  chrome.storage.local.set({ [FAV_KEY]: [...state.favs.values()] });
  const on = state.favs.has(id);
  btn.classList.toggle('on', on);
  btn.title = on ? 'Bỏ lưu' : 'Lưu loadout này';
  if (state.filters.mode === '__fav' && !on) reload();
}

loadMoreBtn.addEventListener('click', () => { if (!state.loading) loadPage(state.page + 1); });

// Tự tải thêm khi cuộn gần cuối
new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && !state.loading && !loadMoreBtn.classList.contains('hidden')) loadPage(state.page + 1);
}, { rootMargin: '200px' }).observe(loadMoreBtn);

$('openMetaSite').addEventListener('click', () => chrome.tabs.create({ url: 'https://meta.deltaforce.garena.com/loadout' }));

// =====================================================================
// Garena đề xuất: cấu hình chính thức (kênh Garena) từ Trạm Công Cụ Tổng hành dinh
// =====================================================================
const OFFICIAL_BASE = 'https://www.playdeltaforce.com';
const OFFICIAL_FILES = { sol: '/gun-codes/op_sol_ga_vi.js', mp: '/gun-codes/op_mp_ga_vi.js', slots: '/basic_info/slots_vi.js' };
const OFFICIAL_KEY = 'df_official_codes';
const OFFICIAL_MODES = [['sol', 'Chiến Dịch Sinh Tồn'], ['mp', 'Chiến Trường Toàn Diện']];
const OFFICIAL_STATS = [
  ['base_damage', 'Sát thương'], ['range', 'Tầm bắn'], ['recoil_control', 'Kiểm soát'],
  ['handling_speed', 'Thao tác'], ['stability', 'Ổn định'], ['hip_fire', 'Bắn từ hông']
];
state.source = 'community';
state.officialMode = 'sol';
state.official = null;

// Các file dữ liệu có dạng "var ten_bien = [...]"
async function loadJsVar(path) {
  const res = await fetch(OFFICIAL_BASE + path, { credentials: 'omit' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const t = await res.text();
  return JSON.parse(t.slice(t.indexOf('=') + 1).trim().replace(/;\s*$/, ''));
}

async function loadOfficial() {
  const cached = (await chrome.storage.local.get(OFFICIAL_KEY))[OFFICIAL_KEY];
  if (cached && Date.now() - cached.at < CONFIG_TTL) return cached.data;
  try {
    const [sol, mp, slots] = await Promise.all([loadJsVar(OFFICIAL_FILES.sol), loadJsVar(OFFICIAL_FILES.mp), loadJsVar(OFFICIAL_FILES.slots)]);
    const slotNames = Object.fromEntries(slots.map((s) => [String(s.slot_id), (s.name && s.name.vi) || '']));
    const data = { sol, mp, slotNames };
    chrome.storage.local.set({ [OFFICIAL_KEY]: { at: Date.now(), data } });
    return data;
  } catch (e) {
    if (cached) return cached.data;
    throw e;
  }
}

function flattenAttachments(components, out = []) {
  for (const c of components || []) {
    const p = c.prop_data || {};
    if (p.attachment_info) out.push({ slot: String(c.slot), ...p.attachment_info });
    flattenAttachments(p.components, out);
  }
  return out;
}

function officialCardHtml(gun, s) {
  const esc = DF.escape;
  const stats = OFFICIAL_STATS.map(([k, label]) => {
    const base = Number(gun['gun_' + k]) || 0;
    const v = Number(s['final_' + k]) || 0;
    const d = v - base;
    const delta = d ? `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>` : '';
    return `<div class="stat"><div class="row"><span>${label}</span><b>${v}${delta}</b></div>
      <div class="bar"><div style="width:${Math.min(100, v)}%"></div><span class="base" style="left:${Math.min(100, base)}%" title="Chỉ số gốc ${base}"></span></div></div>`;
  }).join('');
  const atts = flattenAttachments(s.config_data && s.config_data.guncode_result && s.config_data.guncode_result.components);
  const attHtml = atts.map((a) => `<div class="att"><img src="${esc(a.image_url)}" alt="" loading="lazy"><span>${esc(a.name)}<small>${esc(state.official.slotNames[a.slot] || 'Phụ kiện')}</small></span></div>`).join('');
  const shortCode = String(s.gun_code).split('-').pop();
  const author = (s.authors || []).map((a) => a.name).join(', ');

  return `<article class="lo-card">
    <div class="lo-head">
      <img class="lo-img" src="${esc(gun.gun_image_url)}" alt="" loading="lazy">
      <div class="lo-title">
        <div class="lo-weapon">${esc(gun.gun_name)}</div>
        <div class="lo-meta" title="${esc(s.name)}">${esc(s.name)}${author ? ' · bởi ' + esc(author) : ''}</div>
      </div>
    </div>
    <div class="of-tags">
      <span class="badge hot">✔ Garena</span>
      ${(s.tags || []).map((t) => `<span class="of-tag" style="--c:${esc(t.color || '#8fa1b3')}">${esc(t.name)}</span>`).join('')}
    </div>
    <div class="lo-stats" title="Vạch xám là chỉ số gốc của súng">${stats}</div>
    ${atts.length ? `<details class="atts"><summary>${atts.length} phụ kiện</summary><div class="att-list">${attHtml}</div></details>` : ''}
    <button class="lo-code" data-code="${esc(s.gun_code)}" title="Copy mã chia sẻ đầy đủ để dán vào game">
      <code>${esc(shortCode)}</code><span>COPY CODE</span>
    </button>
  </article>`;
}

function renderOfficial() {
  $('officialModes').innerHTML = chipsHtml(OFFICIAL_MODES, state.officialMode);
  const guns = state.official[state.officialMode] || [];
  const cards = guns.flatMap((g) => (g.schemes || []).map((s) => officialCardHtml(g, s)));
  grid.innerHTML = cards.join('') || '<div class="state-box"><div class="big">🔍</div>Hiện chưa có cấu hình đề xuất cho chế độ này.</div>';
  $('resultInfo').textContent = cards.length ? `${cards.length} cấu hình do Garena đề xuất · mã dùng cho máy chủ Garena` : '';
  loadMoreBtn.classList.add('hidden');
}

async function switchSource(src) {
  state.source = src;
  state.reqId++; // bỏ qua kết quả đang tải của nguồn cũ
  document.querySelectorAll('#sourceTabs button').forEach((b) => b.classList.toggle('active', b.dataset.src === src));
  $('communityBar').classList.toggle('hidden', src !== 'community');
  $('officialBar').classList.toggle('hidden', src !== 'official');
  $('noteCommunity').classList.toggle('hidden', src !== 'community');
  $('noteOfficial').classList.toggle('hidden', src !== 'official');
  chrome.storage.local.set({ df_armory_source: src });

  if (src === 'community') {
    if (state.config) reload();
    return;
  }
  grid.innerHTML = '<div class="skeleton"></div>'.repeat(4);
  loadMoreBtn.classList.add('hidden');
  try {
    state.official = state.official || await loadOfficial();
    if (state.source === 'official') renderOfficial();
  } catch (e) {
    grid.innerHTML = `<div class="state-box"><div class="big">📡</div>Không tải được dữ liệu chính thức (${DF.escape(e.message)}).<br><br><button class="btn btn-accent" id="retryOfficial">Thử lại</button></div>`;
    $('retryOfficial').addEventListener('click', () => switchSource('official'));
  }
}

$('sourceTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-src]');
  if (b && b.dataset.src !== state.source) switchSource(b.dataset.src);
});
$('officialModes').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip || chip.dataset.v === state.officialMode) return;
  state.officialMode = chip.dataset.v;
  renderOfficial();
});

(async function init() {
  const savedSource = (await chrome.storage.local.get('df_armory_source')).df_armory_source;
  if (savedSource === 'official') switchSource('official');
  else grid.innerHTML = '<div class="skeleton"></div>'.repeat(4);
  const favData = (await chrome.storage.local.get(FAV_KEY))[FAV_KEY] || [];
  favData.forEach((x) => state.favs.set(x.id, x));
  try {
    state.config = await loadConfig();
  } catch (e) {
    if (state.source !== 'community') return;
    grid.innerHTML = `<div class="state-box"><div class="big">📡</div>Không kết nối được tới Garena Meta (${DF.escape(e.message)}).<br><br><button class="btn btn-accent" id="retryInit">Thử lại</button></div>`;
    $('retryInit').addEventListener('click', () => location.reload());
    return;
  }
  state.config.weapons.forEach((w) => state.weapons.set(w.id, w));
  state.config.tags.forEach((t) => state.tags.set(t.id, t));
  renderFilters();
  reload();
})();
