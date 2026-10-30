// Mật khẩu hằng ngày - dữ liệu từ DFLoadout.gg (core/dfloadout.js)

const list = document.getElementById('list');
const zoom = document.getElementById('zoom');

function cardHtml(m) {
  const esc = DF.escape;
  const slides = m.guides.map((g, i) => `
    <figure class="guide-slide">
      <img src="${esc(g.img)}" alt="${esc(g.caption)}" loading="lazy">
      <figcaption>${m.guides.length > 1 ? `<b>${i + 1}/${m.guides.length}</b> · ` : ''}${esc(g.caption)}</figcaption>
    </figure>`).join('');
  const nav = m.guides.length > 1
    ? '<button class="guide-nav prev" data-step="-1" aria-label="Ảnh trước">‹</button><button class="guide-nav next" data-step="1" aria-label="Ảnh sau">›</button>'
    : '';
  return `<section class="panel pw-card">
    <div class="pw-head">
      <div><div class="pw-label">Bản đồ</div><div class="pw-map">${esc(m.map)}</div></div>
      <button class="pw-code" data-code="${esc(m.code)}" title="Copy mật khẩu">${esc(m.code)}${DF.icons.copy}</button>
    </div>
    ${m.guides.length ? `<div class="guide"><div class="guide-track">${slides}</div>${nav}</div>` : ''}
  </section>`;
}

async function load(force) {
  const btn = document.getElementById('refreshBtn');
  DF.setBusy(btn, true, 'Đang tải');
  try {
    const data = await DFL.passwords(force);
    list.innerHTML = data.maps.map(cardHtml).join('');
    document.getElementById('updated').textContent = data.updated || 'Mật khẩu hôm nay';
    if (force) DF.toast('Đã cập nhật mật khẩu mới nhất');
  } catch (e) {
    list.innerHTML = `<div class="state-box">📡 Không tải được dữ liệu (${DF.escape(e.message)}).<br><br><button class="btn btn-accent" id="retry">Thử lại</button></div>`;
    document.getElementById('retry').addEventListener('click', () => load(true));
    document.getElementById('updated').textContent = '';
  } finally {
    DF.setBusy(btn, false);
  }
}

list.addEventListener('click', (e) => {
  const code = e.target.closest('[data-code]');
  if (code) return DF.copy(code.dataset.code, `Đã copy mật khẩu ${code.dataset.code}`);

  const step = e.target.closest('[data-step]');
  if (step) {
    const track = step.parentElement.querySelector('.guide-track');
    track.scrollBy({ left: Number(step.dataset.step) * track.clientWidth, behavior: 'smooth' });
    return;
  }

  const img = e.target.closest('.guide-slide img');
  if (img) {
    zoom.querySelector('img').src = img.src;
    zoom.querySelector('img').alt = img.alt;
    zoom.hidden = false;
  }
});
zoom.addEventListener('click', () => { zoom.hidden = true; });
document.getElementById('refreshBtn').addEventListener('click', () => load(true));

load(false);
