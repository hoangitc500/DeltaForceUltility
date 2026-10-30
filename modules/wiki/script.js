// Cẩm Nang - dữ liệu Official Wiki (core/garena.js)

const $ = (id) => document.getElementById(id);
const { vi, gradeColor, word } = GDF;
const esc = (s) => DF.escape(s);
const PAGE = 90;

const ATT_CATS = {
  '弹匣': 'Băng đạn', '枪口': 'Đầu nòng', '枪管': 'Nòng súng', '瞄具': 'Kính ngắm', '枪托': 'Báng súng',
  '护木': 'Ốp nòng', '前握把': 'Tay cầm trước', '后握把': 'Tay cầm sau', '功能性配件': 'Chức năng'
};
const ATT_ORDER = Object.keys(ATT_CATS);
const RED = '__red';
const KEYS = '__keys';

const fmtValue = (v) => {
  v = Number(v);
  if (!v) return '';
  if (v >= 1e6) return (v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' Tr';
  if (v >= 1e3) return (v / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' N';
  return v.toLocaleString('vi-VN');
};

// ---------- Cấu hình từng tab: tải file nào, chuẩn hóa ra danh sách thẻ ----------
const TABS = {
  weapon: {
    label: 'Vũ khí',
    files: ['guns', 'bullets'],
    build: (d) => d.guns.guns.map((g) => ({
      kind: 'gun', raw: g, id: g.gun_id, name: vi(g.language), img: g.image_w480_url || g.image_url, grade: g.grade,
      subs: [String(g.category)], line: `${g.caliber} · ${g.fire_rate} phát/phút`
    })),
    chips: (d) => Object.entries(d.guns.guncategory_map)
  },
  gear: {
    label: 'Trang bị',
    files: ['helmets', 'armors', 'rigs'],
    build: (d) => [
      ...d.helmets.map((x) => ({ kind: 'helmet', raw: x, id: x.helmet_id, name: vi(x.language), img: x.image_url, grade: x.grade, subs: ['helmet'], line: `Cấp ${x.protection_level} · độ bền ${x.durability}` })),
      ...d.armors.map((x) => ({ kind: 'armor', raw: x, id: x.armor_id, name: vi(x.language), img: x.image_url, grade: x.grade, subs: ['armor'], line: `Cấp ${x.protection_level} · độ bền ${x.durability}` })),
      ...d.rigs.map((x) => ({ kind: 'rig', raw: x, id: x.rig_id, name: vi(x.language), img: x.image_url, grade: x.grade, subs: ['rig'], line: `${x.carry_capacity} ô chứa · ${x.weight} kg` }))
    ],
    chips: () => [['helmet', 'Mũ'], ['armor', 'Áo giáp'], ['rig', 'Túi / Ba lô']]
  },
  attach: {
    label: 'Phụ kiện',
    files: ['attachments'],
    build: (d) => d.attachments
      .slice()
      .sort((a, b) => ATT_ORDER.indexOf(a.category) - ATT_ORDER.indexOf(b.category))
      .map((x) => ({ kind: 'attach', raw: x, id: x.attachment_id, name: vi(x.language) || x.name, img: x.image_url, grade: x.grade, subs: [x.category], line: `${ATT_CATS[x.category] || x.category} · ${x.weight} kg` })),
    chips: () => ATT_ORDER.map((k) => [k, ATT_CATS[k]])
  },
  ammo: {
    label: 'Đạn',
    files: ['bullets', 'guns'],
    build: (d) => d.bullets
      .slice()
      .sort((a, b) => Number(b.penetration_level) - Number(a.penetration_level))
      .map((x) => ({ kind: 'ammo', raw: x, id: x.bullet_id, name: vi(x.language), img: x.image_url, grade: x.grade, subs: ['p' + x.penetration_level], line: `Xuyên giáp cấp ${x.penetration_level}` })),
    chips: (d) => [...new Set(d.bullets.map((b) => Number(b.penetration_level)))].sort((a, b) => b - a).map((p) => ['p' + p, `Xuyên cấp ${p}`])
  },
  item: {
    label: 'Vật phẩm',
    files: ['collections'],
    build: (d) => d.collections
      .map((x) => {
        const maps = [vi(x.source_map_1_i18n), vi(x.source_map_2_i18n)].filter(Boolean);
        const isKey = x.prop_id.startsWith('1505');
        const subs = [...maps];
        if (Number(x.grade) >= 6) subs.push(RED);
        if (isKey) subs.push(KEYS);
        const value = fmtValue(x.value);
        return {
          kind: 'item', raw: x, id: x.prop_id, name: vi(x.language), img: x.image_url, grade: x.grade, subs, maps,
          line: isKey ? `Chìa khóa · ${maps[0] || ''}` : (value ? `≈ ${value}` : maps.join(', ') || `${x.weight} kg`)
        };
      })
      .sort((a, b) => Number(b.grade) - Number(a.grade) || (Number(b.raw.value) || 0) - (Number(a.raw.value) || 0)),
    chips: (d) => {
      const maps = [...new Set(d.collections.flatMap((x) => [vi(x.source_map_1_i18n), vi(x.source_map_2_i18n)]).filter(Boolean))];
      return [[RED, 'Vật phẩm Đỏ'], [KEYS, 'Chìa khóa'], ...maps.map((m) => [m, m])];
    }
  },
  ops: {
    label: 'Đặc công',
    files: ['operators'],
    wide: true,
    build: (d) => d.operators.map((x) => ({
      kind: 'op', raw: x, id: x.operator_id, name: vi(x.language), img: x.image_url, grade: x.is_operator ? 4 : 6,
      subs: [x.is_operator ? vi(x.troop_type_i18n) || 'Khác' : '__npc'],
      line: x.is_operator ? `${vi(x.full_name_i18n)} · ${vi(x.troop_type_i18n)}` : 'Nhân vật / kẻ địch đặc biệt'
    })),
    chips: (d) => [...[...new Set(d.operators.filter((x) => x.is_operator).map((x) => vi(x.troop_type_i18n) || 'Khác'))].map((t) => [t, t]), ['__npc', 'Nhân vật khác']]
  }
};

const state = { tab: 'weapon', sub: '', q: '', shown: PAGE, data: {}, lists: {}, filtered: [] };

// ---------- Tải dữ liệu ----------
async function ensureTab(tab) {
  if (state.lists[tab]) return;
  const cfg = TABS[tab];
  await Promise.all(cfg.files.map(async (f) => {
    if (!state.data[f]) state.data[f] = await GDF.load(f);
  }));
  state.lists[tab] = cfg.build(state.data);
}

// ---------- Hiển thị danh sách ----------
function renderTabs() {
  $('tabs').innerHTML = Object.entries(TABS).map(([k, c]) => `<button class="${k === state.tab ? 'active' : ''}" data-tab="${k}">${c.label}</button>`).join('');
}

function renderChips() {
  const list = state.lists[state.tab] || [];
  const chips = TABS[state.tab].chips(state.data);
  const count = (v) => list.filter((x) => x.subs.includes(v)).length;
  $('subChips').innerHTML = `<button class="chip ${!state.sub ? 'active' : ''}" data-v="">Tất cả<small>${list.length}</small></button>`
    + chips.map(([v, l]) => `<button class="chip ${state.sub === v ? 'active' : ''}" data-v="${esc(v)}">${esc(l)}<small>${count(v)}</small></button>`).join('');
}

function cardHtml(x, i) {
  return `<button class="card" style="--g:${gradeColor(x.grade)}" data-i="${i}">
    <span class="pic"><img src="${esc(x.img)}" alt="" loading="lazy"></span>
    <span class="nm">${esc(x.name)}</span>
    <span class="ln">${esc(x.line)}</span>
  </button>`;
}

function renderGrid() {
  const q = state.q.toLowerCase();
  const list = state.lists[state.tab] || [];
  state.filtered = list.filter((x) => (!state.sub || x.subs.includes(state.sub)) && (!q || x.name.toLowerCase().includes(q)));
  $('grid').classList.toggle('wide', !!TABS[state.tab].wide);
  $('grid').innerHTML = state.filtered.slice(0, state.shown).map(cardHtml).join('')
    || '<div class="state-box">🔍 Không tìm thấy mục phù hợp.</div>';
  $('count').textContent = `${state.filtered.length} mục`;
  $('moreBtn').classList.toggle('hidden', state.filtered.length <= state.shown);
}

async function showTab(tab) {
  state.tab = tab;
  state.sub = '';
  state.shown = PAGE;
  renderTabs();
  $('subChips').innerHTML = '';
  $('count').textContent = '';
  $('grid').innerHTML = '<div class="skeleton"></div>'.repeat(6);
  $('moreBtn').classList.add('hidden');
  chrome.storage.local.set({ df_wiki_tab: tab });
  try {
    await ensureTab(tab);
    if (state.tab !== tab) return;
    renderChips();
    renderGrid();
  } catch (e) {
    if (state.tab !== tab) return;
    $('grid').innerHTML = `<div class="state-box">📡 Không tải được dữ liệu (${esc(e.message)}).<br><br><button class="btn btn-accent" id="retry">Thử lại</button></div>`;
    $('retry').addEventListener('click', () => showTab(tab));
  }
}

// ---------- Chi tiết ----------
const kv = (pairs) => `<dl class="kv">${pairs.filter(([, v]) => v !== '' && v != null).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
const bar = (label, v) => {
  const n = Math.max(0, Math.min(100, Number(v) || 0));
  return `<div class="bar-row"><div class="r"><span>${esc(label)}</span><b>${esc(v)}</b></div><div class="bar"><div style="width:${n}%"></div></div></div>`;
};
const signed = (v) => {
  if (v === '' || v == null) return '';
  const s = String(v);
  const neg = s.startsWith('-');
  return `<span class="delta ${neg ? 'down' : 'up'}">${neg || s.startsWith('+') ? s : '+' + s}</span>`;
};

const DETAIL = {
  gun: (g) => {
    const ammo = (state.data.bullets || []).filter((b) => (b.guns || []).some((x) => x.gun_id === g.gun_id));
    return `<div class="bars">
        ${bar('Sát thương', g.gun_base_damage)}${bar('Tầm bắn', g.gun_range)}
        ${bar('Kiểm soát', g.gun_recoil_control)}${bar('Thao tác', g.gun_handling_speed)}
        ${bar('Ổn định', g.gun_stability)}${bar('Bắn từ hông', g.gun_hip_fire)}
      </div>
      ${kv([['Cỡ đạn', g.caliber], ['Chế độ bắn', vi(g.fire_mode)], ['Tốc độ bắn', g.fire_rate + ' phát/phút'], ['Sơ tốc đạn', g.muzzle_velocity + ' m/s'],
        ['Băng đạn', g.capacity], ['Sát thương giáp', g.armor_damage], ['Tầm nghe tiếng súng', g.gun_sound_range + ' m'], ['Khối lượng', g.weight + ' kg']])}
      ${ammo.length ? `<div class="d-sec">Đạn dùng được (${ammo.length})</div><div class="pill-list">${ammo.map((b) => `<span class="badge" style="color:${gradeColor(b.grade)}">${esc(vi(b.language))}</span>`).join('')}</div>` : ''}`;
  },
  helmet: (x) => kv([['Cấp bảo vệ', x.protection_level], ['Độ bền', x.durability], ['Vùng bảo vệ', (vi(x.protection_area) || []).join(', ')],
    ['Khối lượng', x.weight + ' kg'], ['Giảm tốc độ di chuyển', x.move_speed_reduction], ['Giảm tốc độ thao tác', x.weapon_handling_reduction],
    ['Âm thanh', x.sound_effect], ['Chống ồn', word(x.noise_reduction)], ['Tầm nhìn', word(x.visor)], ['Hiệu suất sửa', word(x.repair_efficiency)], ['Hao mòn độ bền', word(x.durability_loss)]]),
  armor: (x) => kv([['Cấp bảo vệ', x.protection_level], ['Độ bền', x.durability], ['Vùng bảo vệ', (vi(x.protection_area) || []).join(', ')],
    ['Khối lượng', x.weight + ' kg'], ['Giảm tốc độ di chuyển', x.move_speed_reduction], ['Giảm tốc độ ngắm', x.aim_speed],
    ['Giảm thể lực chạy', x.sprint_stamina_reduction], ['Hiệu suất sửa', word(x.repair_efficiency)], ['Hao mòn độ bền', word(x.durability_loss)]]),
  rig: (x) => kv([['Sức chứa', x.carry_capacity + ' ô'], ['Kích thước', `${x.length}×${x.width}`], ['Khối lượng', x.weight + ' kg'], ['Hiệu ứng', x.effect]]),
  attach: (x) => {
    const stats = [['Tầm bắn', x.range], ['Kiểm soát', x.recoil_control], ['Thao tác', x.handling_speed], ['Ổn định', x.stability], ['Bắn từ hông', x.hip_fire],
      ['Sát thương', x.base_damage], ['Sát thương giáp', x.armor_damage], ['Băng đạn', x.mag_capacity]].filter(([, v]) => v !== '' && v != null);
    return `${stats.length ? `<div class="d-sec">Ảnh hưởng chỉ số</div><dl class="kv">${stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${signed(v)}</dd></div>`).join('')}</dl>` : ''}
      ${kv([['Loại', ATT_CATS[x.category] || x.category], ['Khối lượng', x.weight + ' kg'], ['Kích thước', `${x.length}×${x.width}`], ['Tháo nhanh', x.quick_detach ? 'Có' : 'Không']])}`;
  },
  ammo: (x) => {
    const guns = ((state.data.guns && state.data.guns.guns) || []).filter((g) => (x.guns || []).some((y) => y.gun_id === g.gun_id));
    return `${kv([['Xuyên giáp', 'Cấp ' + x.penetration_level], ['Sát thương cơ bản', x.base_damage_ratio], ['Giảm sát thương lên giáp', word(x.armor_damage_reduction)], ['Khối lượng', x.weight + ' kg']])}
      ${guns.length ? `<div class="d-sec">Dùng cho (${guns.length})</div><div class="pill-list">${guns.map((g) => `<span class="badge">${esc(vi(g.language))}</span>`).join('')}</div>` : ''}`;
  },
  item: (x) => {
    const locs = [1, 2].map((i) => [vi(x[`source_map_${i}_i18n`]), vi(x[`item_position_${i}_i18n`])]).filter(([m]) => m);
    return `${kv([['Giá trị tham khảo', fmtValue(x.value) || '—'], ['Khối lượng', x.weight + ' kg'], ['Kích thước', `${x.length}×${x.width}`], ['Sưu tầm', x.is_collectible ? 'Có (Triển lãm Đỏ)' : '']])}
      ${locs.length ? `<div class="d-sec">Có thể tìm thấy ở</div>${locs.map(([m, p]) => `<div class="loc"><span class="badge">${esc(m)}</span>${esc(p || 'Khắp bản đồ')}</div>`).join('')}` : ''}`;
  },
  op: (x) => `${x.is_operator ? kv([['Họ tên', vi(x.full_name_i18n)], ['Định vị', vi(x.troop_type_i18n)]]) : ''}
    ${(x.skills || []).length ? `<div class="d-sec">Kỹ năng</div>${x.skills.map((s) => {
      const t = (s.i18n && s.i18n.vi) || s;
      return `<div class="skill"><img src="${esc(s.skill_icon)}" alt=""><div><small>${esc(vi(s.skill_desc1))}</small><b>${esc(t.skill_name || s.skill_name)}</b><p>${esc(t.skill_desc2 || s.skill_desc2)}</p></div></div>`;
    }).join('')}` : ''}`
};

function openDetail(x) {
  const r = x.raw;
  const desc = vi(r.description_i18n) || vi(r.desc_i18n);
  const img = x.kind === 'op' ? (r.wiki_image_w480_url || r.image_url) : x.img;
  $('detailBody').innerHTML = `
    <button class="icon-btn modal-close" data-close>${DF.icons.close}</button>
    <h3 style="padding-right:28px">${esc(x.name)}</h3>
    <div class="d-sub">${esc(x.line)}</div>
    <div class="d-hero" style="--g:${gradeColor(x.grade)}"><img src="${esc(img)}" alt=""></div>
    ${DETAIL[x.kind](r)}
    ${desc ? `<p class="d-desc">${esc(desc)}</p>` : ''}
    <p class="source-note">Nguồn: <a href="${GDF.WIKI_URL}" target="_blank" rel="noopener">Delta Force Official Wiki</a></p>`;
  $('detail').hidden = false;
}

// ---------- Sự kiện ----------
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b && b.dataset.tab !== state.tab) showTab(b.dataset.tab);
});
$('subChips').addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c) return;
  state.sub = c.dataset.v;
  state.shown = PAGE;
  renderChips();
  renderGrid();
});
let timer;
$('searchInput').addEventListener('input', (e) => {
  clearTimeout(timer);
  timer = setTimeout(() => { state.q = e.target.value.trim(); state.shown = PAGE; renderGrid(); }, 200);
});
$('moreBtn').addEventListener('click', () => { state.shown += PAGE; renderGrid(); });
$('grid').addEventListener('click', (e) => {
  const c = e.target.closest('[data-i]');
  if (c) openDetail(state.filtered[Number(c.dataset.i)]);
});
$('detail').addEventListener('click', (e) => {
  if (e.target === $('detail') || e.target.closest('[data-close]')) $('detail').hidden = true;
});
$('openWiki').addEventListener('click', () => chrome.tabs.create({ url: GDF.WIKI_URL }));

(async function init() {
  // Cho phép mở thẳng một tab: index.html?tab=item
  const fromUrl = new URLSearchParams(location.search).get('tab');
  const saved = (await chrome.storage.local.get('df_wiki_tab')).df_wiki_tab;
  const tab = TABS[fromUrl] ? fromUrl : TABS[saved] ? saved : 'weapon';
  showTab(tab);
})();
