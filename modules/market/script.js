// Giá chợ đấu giá - dữ liệu từ DFLoadout.gg (core/dfloadout.js)

const $ = (id) => document.getElementById(id);
const grid = $('grid');
const loadMoreBtn = $('loadMoreBtn');

const state = {
  filters: { q: '', category: '', sub: '', sort: '' },
  page: 1,
  menu: [],
  pageUrl: 'https://dfloadout.gg/cho-dau-gia',
  reqId: 0,
  loading: false
};

function renderChips() {
  const f = state.filters;
  const chip = (v, label, count, active) => `<button class="chip ${active ? 'active' : ''}" data-v="${DF.escape(v)}">${DF.escape(label)}${count ? `<small>${DF.escape(count)}</small>` : ''}</button>`;
  $('catChips').innerHTML = chip('', 'Tất cả', '', !f.category) + state.menu.map((c) => chip(c.id, c.name, c.count, f.category === c.id)).join('');

  const cat = state.menu.find((c) => c.id === f.category);
  $('subChips').classList.toggle('hidden', !cat);
  if (cat) $('subChips').innerHTML = chip('', 'Tất cả', '', !f.sub) + cat.subs.map((s) => chip(s.id, s.name, s.count, f.sub === s.id)).join('');
}

function itemHtml(it) {
  const esc = DF.escape;
  return `<button class="mk-item" data-url="${esc(it.url)}" title="Xem chi tiết ${esc(it.name)} trên DFLoadout.gg">
    ${it.img ? `<img class="mk-thumb" src="${esc(it.img)}" alt="" loading="lazy">` : '<span class="mk-thumb"></span>'}
    <span class="mk-body">
      <span class="mk-name">${esc(it.name)}</span>
      <span class="mk-price"><i class="coin"></i>${esc(it.price || '—')}</span>
      <span class="mk-stock">${esc(it.stock)}</span>
    </span>
  </button>`;
}

async function load(page) {
  const id = ++state.reqId;
  state.loading = true;
  if (page === 1) {
    grid.innerHTML = '<div class="skeleton"></div>'.repeat(6);
    loadMoreBtn.classList.add('hidden');
  } else {
    DF.setBusy(loadMoreBtn, true, 'Đang tải...');
  }
  try {
    const res = await DFL.market({ ...state.filters, page: page > 1 ? page : '' });
    if (id !== state.reqId) return;
    if (res.menu.length && !state.menu.length) { state.menu = res.menu; renderChips(); }
    state.page = page;
    state.pageUrl = res.pageUrl;
    const html = res.items.map(itemHtml).join('');
    if (page === 1) {
      grid.innerHTML = html || '<div class="state-box">🔍 Không tìm thấy vật phẩm phù hợp.</div>';
    } else {
      grid.insertAdjacentHTML('beforeend', html);
    }
    $('meta').textContent = res.meta;
    loadMoreBtn.classList.toggle('hidden', !res.hasNext);
  } catch (e) {
    if (id !== state.reqId) return;
    if (page === 1) {
      grid.innerHTML = `<div class="state-box">📡 Không tải được dữ liệu (${DF.escape(e.message)}).<br><br><button class="btn btn-accent" id="retry">Thử lại</button></div>`;
      $('retry').addEventListener('click', () => load(1));
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

$('catChips').addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c || c.dataset.v === state.filters.category) return;
  state.filters.category = c.dataset.v;
  state.filters.sub = '';
  renderChips();
  load(1);
});
$('subChips').addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c || c.dataset.v === state.filters.sub) return;
  state.filters.sub = c.dataset.v;
  renderChips();
  load(1);
});

let searchTimer;
$('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.filters.q = e.target.value.trim(); load(1); }, 400);
});
$('sortSelect').addEventListener('change', (e) => { state.filters.sort = e.target.value; load(1); });

grid.addEventListener('click', (e) => {
  const item = e.target.closest('[data-url]');
  if (item) chrome.tabs.create({ url: item.dataset.url });
});
loadMoreBtn.addEventListener('click', () => { if (!state.loading) load(state.page + 1); });
$('openSource').addEventListener('click', () => chrome.tabs.create({ url: state.pageUrl }));

(async function init() {
  const cached = (await chrome.storage.local.get('dfl_cache_market_menu')).dfl_cache_market_menu;
  if (cached) { state.menu = cached.data; renderChips(); }
  load(1);
})();
