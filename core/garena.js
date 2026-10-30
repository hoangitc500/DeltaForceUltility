// garena.js - Đọc dữ liệu wiki công khai của trang chính thức playdeltaforce.com
// (cùng nguồn với Official Wiki và Trạm Công Cụ). Luôn ghi nguồn khi hiển thị.
(function () {
  const BASE = 'https://www.playdeltaforce.com';
  const TTL = 12 * 60 * 60 * 1000;

  // Các file có dạng "var ten_bien = {...}". Thư mục basic_info/ là bản ổn định,
  // thư mục của Wiki là bản mới hơn nhưng có thể đổi tên -> chỉ dùng làm dự phòng.
  const PATHS = (name) => [`/basic_info/${name}_vi.js`, `/basic_info_jytnqweq/${name}_vi_test.js`];

  async function fetchVar(path) {
    const res = await fetch(BASE + path, { credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const t = await res.text();
    return JSON.parse(t.slice(t.indexOf('=') + 1).trim().replace(/;\s*$/, ''));
  }

  async function load(name, force) {
    const key = 'gdf_' + name;
    const hit = (await chrome.storage.local.get(key))[key];
    if (!force && hit && Date.now() - hit.at < TTL) return hit.data;
    let lastErr;
    for (const path of PATHS(name)) {
      try {
        const data = await fetchVar(path);
        chrome.storage.local.set({ [key]: { at: Date.now(), data } });
        return data;
      } catch (e) { lastErr = e; }
    }
    if (hit) return hit.data; // mạng lỗi -> dùng bản cũ
    throw lastErr;
  }

  const vi = (o) => (o && typeof o === 'object' ? o.vi || '' : o || '');

  // Màu theo phẩm chất (grade) giống trong game
  const GRADE = ['#8a8f98', '#8a8f98', '#4caf50', '#42a5f5', '#ab47bc', '#ffb300', '#ef5350'];
  const gradeColor = (g) => GRADE[Number(g)] || GRADE[0];

  // Một số giá trị trong dữ liệu gốc còn để tiếng Trung / tiếng Anh
  const WORDS = { '高': 'Cao', '中': 'Trung bình', '低': 'Thấp', High: 'Cao', Medium: 'Trung bình', Low: 'Thấp', '头盔视野下降': 'Giảm tầm nhìn' };
  const word = (s) => WORDS[s] || s;

  // Khóa bản đồ tương tác (mapswiki ?map=) theo chỉ số tên bản đồ trong maps_vi.js
  const MAP_KEYS = { 0: 'daba', 1: 'cgxg', 2: 'htjd', 3: 'bks', 4: 'cxjy', 18: 'az3' };
  const mapUrl = (key) => `${BASE}/events/mapswiki/vi/index.html${key ? '?map=' + key : ''}`;

  window.GDF = { BASE, load, vi, gradeColor, word, MAP_KEYS, mapUrl, WIKI_URL: BASE + '/events/officialwiki/vi/#/home' };
})();
