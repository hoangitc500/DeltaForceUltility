// Chạy sớm trong <head> để tránh nháy giao diện khi tải trang.
(function () {
  const root = document.documentElement;
  try {
    if (localStorage.getItem('df_theme') === 'light') root.classList.add('light-theme');
  } catch (e) { /* storage bị chặn -> dùng giao diện tối mặc định */ }

  // Ngữ cảnh hiển thị: popup (mặc định) | sidebar | tab
  const params = new URLSearchParams(location.search);
  const view = params.get('sidebar') === 'true' ? 'sidebar' : (params.get('view') === 'tab' ? 'tab' : 'popup');
  root.classList.add('view-' + view);
  root.dataset.view = view;
})();
