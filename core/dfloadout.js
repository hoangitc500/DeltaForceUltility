// dfloadout.js - Đọc dữ liệu công khai từ DFLoadout.gg (website cộng đồng Delta Force, robots.txt cho phép).
// Mọi nơi hiển thị dữ liệu này đều phải ghi nguồn và dẫn link về trang gốc.
(function () {
  const BASE = 'https://dfloadout.gg';

  async function getDoc(path) {
    const res = await fetch(BASE + path, { credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  }

  // Cache trong chrome.storage để mở popup nhanh và đỡ tải lại trang nguồn
  async function cached(key, ttl, loader, force) {
    const storeKey = 'dfl_cache_' + key;
    const hit = (await chrome.storage.local.get(storeKey))[storeKey];
    if (!force && hit && Date.now() - hit.at < ttl) return hit.data;
    try {
      const data = await loader();
      chrome.storage.local.set({ [storeKey]: { at: Date.now(), data } });
      return data;
    } catch (e) {
      if (hit) return hit.data; // mạng lỗi -> dùng bản cũ
      throw e;
    }
  }

  const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

  // Danh sách code Garena đang tổng hợp tại /code-garena
  function codes(force) {
    return cached('codes', 30 * 60 * 1000, async () => {
      const doc = await getDoc('/code-garena');
      const area = doc.querySelector('textarea[data-redeem-codes]');
      let list = area ? String(area.getAttribute('data-initial') || area.textContent).split(/\s+/) : [];
      if (!list.filter(Boolean).length) {
        const script = text(doc.querySelector('pre.gc-script'));
        const m = script.match(/const CODES = (\[[^\]]*\])/);
        if (m) list = JSON.parse(m[1]);
      }
      return [...new Set(list.map((c) => c.trim()).filter(Boolean))];
    }, force);
  }

  // Mật khẩu phòng hằng ngày tại /mat-khau-hang-ngay
  function passwords(force) {
    return cached('passwords', 30 * 60 * 1000, async () => {
      const doc = await getDoc('/mat-khau-hang-ngay');
      const maps = [...doc.querySelectorAll('.dp-panel')].map((p) => ({
        id: (p.id || '').replace('dp-panel-', ''),
        map: text(p.querySelector('h3')),
        code: text(p.querySelector('.dp-panel__code')),
        guides: [...p.querySelectorAll('.dp-slide')].map((s) => ({
          img: (s.querySelector('img') || {}).src || '',
          caption: text(s.querySelector('p'))
        }))
      })).filter((m) => m.map && m.code);
      if (!maps.length) throw new Error('Không đọc được dữ liệu mật khẩu');
      return { updated: text(doc.querySelector('.dp-strip__date')), maps };
    }, force);
  }

  function parseMenu(doc) {
    return [...doc.querySelectorAll('.au-menu .au-menu-group')].map((g) => {
      const links = [...g.querySelectorAll('.au-menu-list a')];
      const first = new URL(links[0].getAttribute('href'), BASE);
      return {
        id: first.searchParams.get('category'),
        name: text(g.querySelector('.au-menu-head span')),
        count: text(g.querySelector('.au-menu-head small')),
        subs: links.slice(1).map((a) => ({
          id: new URL(a.getAttribute('href'), BASE).searchParams.get('sub'),
          name: text(a.querySelector('span')),
          count: text(a.querySelector('small'))
        }))
      };
    });
  }

  // Giá chợ đấu giá tại /cho-dau-gia. params: { q, category, sub, sort, page }
  async function market(params = {}) {
    const p = new URLSearchParams();
    for (const k of ['q', 'category', 'sub', 'sort', 'page']) if (params[k]) p.set(k, params[k]);
    const qs = p.toString();
    const doc = await getDoc('/cho-dau-gia' + (qs ? '?' + qs : ''));
    const items = [...doc.querySelectorAll('a.au-card-link')].map((a) => {
      const href = a.getAttribute('href') || '';
      return {
        id: href.split('/').pop(),
        url: BASE + href,
        name: text(a.querySelector('.au-name')),
        price: text(a.querySelector('.au-price b')),
        stock: text(a.querySelector('.au-stock')),
        img: (a.querySelector('img') || {}).src || ''
      };
    });
    const menu = parseMenu(doc);
    if (menu.length) chrome.storage.local.set({ dfl_cache_market_menu: { at: Date.now(), data: menu } });
    return {
      items,
      menu,
      meta: text(doc.querySelector('.au-meta time')),
      hasNext: !!doc.querySelector('.pagination-nav a[rel="next"]'),
      pageUrl: BASE + '/cho-dau-gia' + (qs ? '?' + qs : '')
    };
  }

  // Đề xuất sản xuất Căn Cứ Ngầm tại /de-xuat-san-xuat (dữ liệu JSON nhúng trong trang)
  function production(force) {
    return cached('production', 30 * 60 * 1000, async () => {
      const doc = await getDoc('/de-xuat-san-xuat');
      const node = doc.querySelector('script[data-production-rows]');
      if (!node) throw new Error('Không đọc được dữ liệu sản xuất');
      const data = JSON.parse(node.textContent);
      const stamp = doc.querySelector('.pd-stamp time');
      return {
        stamp: stamp ? stamp.getAttribute('datetime') : null,
        stations: data.stations,
        items: data.items,
        rows: data.rows
      };
    }, force);
  }

  window.DFL = { BASE, ASSETS: 'https://assets.dfloadout.gg/', codes, passwords, market, production };
})();
