// Bản Đồ - nhúng công cụ bản đồ chính thức + vật phẩm theo khu vực (core/garena.js) + mật khẩu phòng (core/dfloadout.js)

const $ = (id) => document.getElementById(id);
const { vi, gradeColor, MAP_KEYS } = GDF;
const esc = (s) => DF.escape(s);
const norm = (s) => String(s || '').toLowerCase().normalize('NFC').trim();

const state = { maps: [], current: null, items: null, passwords: null };

// Chỉ nhúng bản đồ tương tác khi mở dạng tab đủ rộng; popup/sidebar hiện ảnh xem trước
const EMBED = DF.view === 'tab' && window.innerWidth >= 700;
$('frameWrap').classList.toggle('hidden', !EMBED);
$('preview').classList.toggle('hidden', EMBED);
$('preview').addEventListener('click', () => {
  // Mở chính module này dạng tab, giữ bản đồ đang chọn
  chrome.tabs.create({ url: chrome.runtime.getURL('modules/maps/index.html') + '?view=tab' });
  if (DF.view === 'popup') window.close();
});

const fmtValue = (v) => {
  v = Number(v);
  if (!v) return '';
  if (v >= 1e6) return (v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' Tr';
  if (v >= 1e3) return (v / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' N';
  return v.toLocaleString('vi-VN');
};

// Lấy 6 bản đồ Chiến Dịch có bản đồ tương tác, ảnh lấy từ biến thể đầu tiên
function buildMaps(data) {
  return Object.entries(MAP_KEYS).map(([idx, key]) => {
    const name = data.mapname_map[Number(idx)];
    const variant = data.maps.find((m) => m.category === 'SOL' && Number(m.map_name) === Number(idx));
    return { idx: Number(idx), key, name, img: variant ? (variant.image_w480_url || variant.image_url) : '' };
  });
}

function renderPicker() {
  $('picker').innerHTML = state.maps.map((m) => `
    <button class="map-btn ${state.current && state.current.key === m.key ? 'active' : ''}" data-key="${m.key}"
      style="background-image:url('${esc(m.img)}')" title="${esc(m.name)}"><span>${esc(m.name)}</span></button>`).join('');
}

function selectMap(key) {
  const m = state.maps.find((x) => x.key === key) || state.maps[0];
  state.current = m;
  chrome.storage.local.set({ df_map_key: m.key });
  renderPicker();
  $('mapTitle').textContent = m.name;
  if (EMBED) {
    $('frameLoading').classList.remove('hidden');
    $('mapFrame').src = GDF.mapUrl(m.key);
  } else {
    $('preview').style.backgroundImage = `url('${m.img}')`;
    $('previewName').textContent = m.name;
  }
  renderPassword();
  renderLoot();
}

$('mapFrame').addEventListener('load', () => $('frameLoading').classList.add('hidden'));
$('picker').addEventListener('click', (e) => {
  const b = e.target.closest('[data-key]');
  if (b && (!state.current || b.dataset.key !== state.current.key)) selectMap(b.dataset.key);
});
$('fullBtn').addEventListener('click', () => chrome.tabs.create({ url: GDF.mapUrl(state.current && state.current.key) }));

// ---------- Mật khẩu phòng hôm nay ----------
function renderPassword() {
  const box = $('pwBox');
  const m = state.current;
  const hit = m && state.passwords && state.passwords.maps.find((p) => norm(p.map) === norm(m.name) || norm(m.name).includes(norm(p.map)) || norm(p.map).includes(norm(m.name)));
  box.classList.toggle('hidden', !hit);
  if (hit) $('pwCode').textContent = hit.code;
}
$('pwCopy').addEventListener('click', () => DF.copy($('pwCode').textContent, 'Đã copy mật khẩu phòng'));

// ---------- Vật phẩm theo khu vực ----------
function lootHtml(x) {
  const value = fmtValue(x.value);
  return `<div class="loot-item" style="--g:${gradeColor(x.grade)}" title="${esc(vi(x.description_i18n))}">
    <img src="${esc(x.image_url)}" alt="" loading="lazy">
    <span><b>${esc(vi(x.language))}</b><small>${value ? '≈ ' + value : x.weight + ' kg'}</small></span>
  </div>`;
}

function group(title, list, open) {
  if (!list.length) return '';
  return `<details class="grp" ${open ? 'open' : ''}><summary><span>${esc(title)}</span><small>${list.length}</small></summary><div class="loot">${list.map(lootHtml).join('')}</div></details>`;
}

function renderLoot() {
  const m = state.current;
  if (!m || !state.items) return;
  const name = norm(m.name);
  // Mỗi vật phẩm có tối đa 2 nơi xuất hiện (bản đồ + khu vực)
  const here = [];
  for (const x of state.items) {
    for (const i of [1, 2]) {
      if (norm(vi(x[`source_map_${i}_i18n`])) === name) here.push({ x, pos: vi(x[`item_position_${i}_i18n`]) });
    }
  }
  const byValue = (a, b) => Number(b.grade) - Number(a.grade) || (Number(b.value) || 0) - (Number(a.value) || 0);
  const keys = here.filter((h) => h.x.prop_id.startsWith('1505')).map((h) => h.x).sort(byValue);
  const rest = here.filter((h) => !h.x.prop_id.startsWith('1505'));
  const red = rest.filter((h) => Number(h.x.grade) >= 6).map((h) => h.x).sort(byValue);

  const areas = {};
  rest.filter((h) => Number(h.x.grade) < 6).forEach((h) => { (areas[h.pos || 'Khắp bản đồ'] = areas[h.pos || 'Khắp bản đồ'] || []).push(h.x); });

  $('lootCount').textContent = here.length ? `${here.length} vật phẩm` : '';
  $('loot').innerHTML = here.length
    ? group('Chìa khóa phòng', keys, true)
      + group('Vật phẩm Đỏ', red, true)
      + Object.entries(areas).map(([pos, list]) => group(pos, list.sort(byValue), false)).join('')
    : '<div class="state-box">Wiki chưa có dữ liệu vật phẩm cho bản đồ này. Hãy dùng bản đồ tương tác ở trên để xem điểm loot.</div>';
}

(async function init() {
  try {
    const data = await GDF.load('maps');
    state.maps = buildMaps(data);
  } catch (e) {
    $('picker').innerHTML = `<div class="state-box" style="grid-column:1/-1">📡 Không tải được danh sách bản đồ (${esc(e.message)}).</div>`;
    return;
  }
  const saved = (await chrome.storage.local.get('df_map_key')).df_map_key;
  selectMap(saved);

  GDF.load('collections').then((items) => { state.items = items; renderLoot(); })
    .catch((e) => { $('loot').innerHTML = `<div class="state-box">📡 Không tải được vật phẩm (${esc(e.message)}).</div>`; });
  DFL.passwords().then((p) => { state.passwords = p; renderPassword(); }).catch(() => { });
})();
