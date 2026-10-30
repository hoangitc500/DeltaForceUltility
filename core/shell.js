// shell.js - Khung giao diện dùng chung (header, footer, ủng hộ, toast, confirm)
// Mỗi trang chỉ cần nạp core/theme.js trong <head> và file này trước script của trang.
(function () {
  const root = document.documentElement;
  const view = root.dataset.view || 'popup';

  const ICONS = {
    sidebar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></svg>',
    tab: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
    // Icon cho từng module (nét mảnh, đồng bộ phong cách)
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>',
    crosshair: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M8.5 15.5h.01M12 15.5h.01M15.5 15.5h.01"/></svg>',
    market: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 14 4-4 3 3 5-6"/><path d="M15 7h4v4"/></svg>',
    factory: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20V9l6 4V9l6 4V4h6a2 2 0 0 1 2 2v14z"/><path d="M6 17h1M11 17h1M16 17h1"/></svg>',
    map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/></svg>'
  };

  const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const querySuffix = () => (view === 'sidebar' ? '?sidebar=true' : view === 'tab' ? '?view=tab' : '');
  const currentPath = () => location.pathname.replace(/^\//, '');

  // ---------- Header ----------
  const header = document.createElement('header');
  header.className = 'app-header';
  header.innerHTML = `
    <div class="app-brand" id="brandHome" title="Về trang chủ">
      <img src="${chrome.runtime.getURL('icon.png')}" alt="">
      <h2>Delta Force <span>Utility</span></h2>
    </div>
    <div class="header-btns">
      <div style="position:relative">
        <button class="icon-btn" id="openSidebarBtn" title="Mở trong Sidebar (không bị đóng khi chuyển tab)">${ICONS.sidebar}</button>
        <div class="sidebar-tip hidden" id="sidebarTipUI">Khuyên dùng Sidebar: không bị đóng khi bạn chuyển tab</div>
      </div>
      <button class="icon-btn" id="openTabBtn" title="Mở thành tab mới">${ICONS.tab}</button>
      <button class="icon-btn" id="themeToggleBtn" title="Đổi giao diện sáng / tối"></button>
    </div>`;
  document.body.prepend(header);

  const themeBtn = header.querySelector('#themeToggleBtn');
  const paintThemeBtn = () => { themeBtn.innerHTML = root.classList.contains('light-theme') ? ICONS.sun : ICONS.moon; };
  paintThemeBtn();
  themeBtn.addEventListener('click', () => {
    const isLight = root.classList.toggle('light-theme');
    try { localStorage.setItem('df_theme', isLight ? 'light' : 'dark'); } catch (e) { }
    paintThemeBtn();
  });

  header.querySelector('#brandHome').addEventListener('click', () => {
    if (currentPath() !== 'popup.html') DF.go('popup.html');
  });

  header.querySelector('#openTabBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL(currentPath()) + '?view=tab' });
    if (view === 'popup') window.close();
  });

  const sidebarBtn = header.querySelector('#openSidebarBtn');
  const tip = header.querySelector('#sidebarTipUI');
  if (view === 'sidebar') {
    sidebarBtn.parentElement.remove();
  } else {
    // Gợi ý dùng Sidebar: chỉ hiện vài lần đầu ở popup, tắt hẳn khi đã mở Sidebar
    let tipShown = 99;
    try { tipShown = Number(localStorage.getItem('df_tip_sidebar_count') || 0); } catch (e) { }
    if (tipShown < 3 && view === 'popup') {
      try { localStorage.setItem('df_tip_sidebar_count', String(tipShown + 1)); } catch (e) { }
      tip.classList.remove('hidden');
      setTimeout(() => { tip.style.opacity = '0'; setTimeout(() => tip.classList.add('hidden'), 300); }, 8000);
    }
    sidebarBtn.addEventListener('click', () => {
      tip.classList.add('hidden');
      try { localStorage.setItem('df_tip_sidebar_count', '99'); } catch (e) { }
      if (!chrome.sidePanel || !chrome.sidePanel.open) {
        DF.toast('Trình duyệt chưa hỗ trợ mở Sidebar tự động. Hãy nhấn chuột phải vào icon tiện ích → "Open side panel".', 'warn', 6000);
        return;
      }
      chrome.windows.getCurrent((win) => {
        // Mở Sidebar ngay tại trang đang xem. Không await giữa 2 lệnh để giữ "user gesture".
        chrome.sidePanel.setOptions({ path: currentPath() + '?sidebar=true', enabled: true }).catch(() => { });
        chrome.sidePanel.open({ windowId: win.id })
          .then(() => { if (view === 'popup') window.close(); })
          .catch((err) => DF.toast('Không thể mở Sidebar: ' + err.message + '. Hãy nhấn chuột phải vào icon tiện ích → "Open side panel".', 'error', 6000));
      });
    });
  }

  // ---------- Footer + Ủng hộ ----------
  const footer = document.createElement('footer');
  footer.className = 'app-footer';
  footer.innerHTML = `
    <span>Phát triển bởi <strong>Đỗ Việt Hoàng</strong> · <button class="link-btn" id="sourcesBtn">Nguồn dữ liệu</button></span>
    <button id="donateBtn" class="donate-btn">💖 Ủng hộ tác giả</button>`;
  document.body.append(footer);

  // ---------- Nguồn dữ liệu & ghi công ----------
  const SOURCES = [
    ['Trang đổi code chính thức (Garena)', 'https://redeem.df.garena.sg/', 'Nơi tiện ích tự động nhập giftcode cho bạn.'],
    ['Danh sách code do tác giả tổng hợp', 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQS9k3934WWwsVa5yNKAnmBIY80dmtV9ezNgZeSvqgRI0T7QnlCKN_5XdcZFiPxI012vsisZBm92L9b/pubhtml', 'Google Sheet công khai của tác giả tiện ích.'],
    ['DFLoadout.gg - Code Garena', 'https://dfloadout.gg/code-garena', 'Nguồn code thứ hai khi bấm "Lấy code mới".'],
    ['DFLoadout.gg - Mật khẩu hằng ngày', 'https://dfloadout.gg/mat-khau-hang-ngay', 'Mật khẩu phòng và ảnh hướng dẫn đường đi.'],
    ['DFLoadout.gg - Chợ đấu giá', 'https://dfloadout.gg/cho-dau-gia', 'Giá thấp nhất đang rao và icon vật phẩm.'],
    ['DFLoadout.gg - Đề xuất sản xuất', 'https://dfloadout.gg/de-xuat-san-xuat', 'Công thức, lãi ước tính và icon cho module Sản xuất Căn Cứ.'],
    ['Garena Delta Force Meta', 'https://meta.deltaforce.garena.com/loadout', 'Mã loadout cộng đồng, chỉ số và ảnh súng trong Kho Loadout.'],
    ['Trạm Công Cụ Tổng hành dinh (chính thức)', 'https://www.playdeltaforce.com/events/hq/vi/index.html', 'Cấu hình súng do Garena đề xuất, ảnh súng và phụ kiện.'],
    ['Delta Force Official Wiki', 'https://www.playdeltaforce.com/events/officialwiki/vi/#/home', 'Dữ liệu, hình ảnh và mô tả trong Cẩm Nang; vật phẩm theo khu vực ở Bản Đồ.'],
    ['Công cụ bản đồ Delta Force (chính thức)', 'https://www.playdeltaforce.com/events/mapswiki/vi/index.html', 'Bản đồ tương tác được nhúng nguyên vẹn trong module Bản Đồ.']
  ];
  const sourcesModal = document.createElement('div');
  sourcesModal.className = 'modal-overlay';
  sourcesModal.hidden = true;
  sourcesModal.innerHTML = `
    <div class="modal-content" role="dialog" aria-modal="true">
      <button class="icon-btn modal-close" data-close>${ICONS.close}</button>
      <h3>Nguồn dữ liệu &amp; ghi công</h3>
      <p class="muted" style="font-size:12px; margin:0 0 10px">Tiện ích chỉ đọc dữ liệu công khai và luôn dẫn link về trang gốc. Cảm ơn các nguồn dưới đây.</p>
      <ul class="source-list">
        ${SOURCES.map(([name, url, desc]) => `<li><a href="${url}" target="_blank" rel="noopener">${escapeHtml(name)}</a><span>${escapeHtml(desc)}</span></li>`).join('')}
      </ul>
      <p class="muted" style="font-size:11px; margin:12px 0 0">Một số tính năng (mật khẩu hằng ngày, giá chợ, đề xuất sản xuất, nguồn code thứ hai) được phát triển dựa trên dữ liệu và ý tưởng của DFLoadout.gg.
      Delta Force do Team Jade (TiMi Studio Group) phát triển, Garena phát hành tại Việt Nam. Delta Force Utility là tiện ích cộng đồng độc lập, không liên kết với Garena, TiMi hay DFLoadout.gg.</p>
    </div>`;
  document.body.append(sourcesModal);
  footer.querySelector('#sourcesBtn').addEventListener('click', () => { sourcesModal.hidden = false; });
  sourcesModal.addEventListener('click', (e) => {
    if (e.target === sourcesModal || e.target.closest('[data-close]')) sourcesModal.hidden = true;
  });

  const donateModal = document.createElement('div');
  donateModal.className = 'modal-overlay';
  donateModal.hidden = true;
  donateModal.innerHTML = `
    <div class="modal-content" style="max-width:310px; text-align:center" role="dialog" aria-modal="true">
      <button class="icon-btn modal-close" data-close>${ICONS.close}</button>
      <h3>Cảm ơn bạn đã ủng hộ!</h3>
      <p class="muted" style="font-size:12px; margin:0">Mọi sự đóng góp là động lực lớn để mình phát triển thêm nhiều tính năng hay cho cộng đồng Delta Force.</p>
      <img class="donate-qr" src="${chrome.runtime.getURL('assets/qrdonate.jpg')}" alt="QR chuyển khoản">
      <div class="donate-info">
        <div><span>Ngân hàng</span><strong>BIDV</strong></div>
        <div><span>Chủ TK</span><strong>DO VIET HOANG</strong></div>
        <div><span>Số TK</span><strong class="acc">4830607605</strong></div>
      </div>
      <div class="modal-actions">
        <button class="btn" id="copyAccBtn">📋 Copy số TK</button>
        <button class="btn btn-ghost" data-close>Đóng</button>
      </div>
    </div>`;
  document.body.append(donateModal);

  footer.querySelector('#donateBtn').addEventListener('click', () => { donateModal.hidden = false; });
  donateModal.addEventListener('click', (e) => {
    if (e.target === donateModal || e.target.closest('[data-close]')) donateModal.hidden = true;
  });
  donateModal.querySelector('#copyAccBtn').addEventListener('click', () => {
    DF.copy('4830607605', 'Đã copy số tài khoản');
  });

  // ---------- Toast ----------
  const toastStack = document.createElement('div');
  toastStack.className = 'toast-stack';
  toastStack.setAttribute('aria-live', 'polite');
  document.body.append(toastStack);

  function toast(message, type = 'success', ms = 3500) {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = message;
    toastStack.append(el);
    while (toastStack.children.length > 3) toastStack.firstElementChild.remove();
    setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 200); }, ms);
  }

  // ---------- Confirm ----------
  function confirmDialog({ title = 'Xác nhận', message = '', okText = 'Đồng ý', cancelText = 'Hủy', danger = false } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-content" style="max-width:340px" role="alertdialog" aria-modal="true">
          <h3 style="color:${danger ? 'var(--error)' : 'var(--primary)'}">${escapeHtml(title)}</h3>
          <p class="muted" style="margin:0; white-space:pre-line">${escapeHtml(message)}</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" data-v="0">${escapeHtml(cancelText)}</button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-accent'}" data-v="1">${escapeHtml(okText)}</button>
          </div>
        </div>`;
      const done = (v) => { overlay.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
      const onKey = (e) => { if (e.key === 'Escape') done(false); };
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) return done(false);
        const b = e.target.closest('[data-v]');
        if (b) done(b.dataset.v === '1');
      });
      document.addEventListener('keydown', onKey);
      document.body.append(overlay);
      overlay.querySelector('[data-v="1"]').focus();
    });
  }

  // Đóng modal bằng phím Esc
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal-overlay:not([hidden])').forEach((m) => { if (m.dataset.persistent !== '1') m.hidden = true; });
  });

  function setBusy(btn, busy, label) {
    if (busy) {
      if (!btn.dataset.idleHtml) btn.dataset.idleHtml = btn.innerHTML;
      btn.innerHTML = `<span class="spinner"></span>${escapeHtml(label || 'Đang xử lý...')}`;
      btn.disabled = true;
    } else {
      if (btn.dataset.idleHtml) btn.innerHTML = btn.dataset.idleHtml;
      delete btn.dataset.idleHtml;
      btn.disabled = false;
    }
  }

  function copy(text, okMessage = 'Đã copy') {
    return navigator.clipboard.writeText(text)
      .then(() => { toast(okMessage); return true; })
      .catch(() => { toast('Không copy được, hãy thử lại', 'error'); return false; });
  }

  const DF = window.DF = {
    view,
    icons: ICONS,
    escape: escapeHtml,
    url: (path) => chrome.runtime.getURL(path) + querySuffix(),
    go: (path) => { location.href = chrome.runtime.getURL(path) + querySuffix(); },
    toast,
    confirm: confirmDialog,
    setBusy,
    copy
  };

  // Nút "Trở về" chuẩn cho các module
  document.querySelectorAll('[data-back]').forEach((b) => {
    b.innerHTML = ICONS.back;
    b.title = 'Về trang chủ';
    b.addEventListener('click', () => DF.go('popup.html'));
  });
})();
