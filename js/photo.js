// 가족 보드 - 프로필 사진 고르기·자르기
// 앨범에서 고르거나 찍은 사진을 동그라미에 맞게 확대·이동한 뒤, 작은 JPEG(약 10KB)로 만들어요.
import { modal, fail } from './ui.js';

const OUT = 192;      // 저장 크기 (픽셀)
const VIEW = 260;     // 자르는 화면 크기
const MAX_LEN = 44000; // 서버가 받는 최대 길이

/** 사진 고르기 창을 열고, 저장하면 onDone(dataUrl)을 불러요 */
export function pickPhoto(onDone) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => crop(img, url, onDone);
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('사진을 열지 못했어요. 다른 사진을 골라 주세요.')); };
    img.src = url;
  };
  input.click();
}

function crop(img, url, onDone) {
  const md = modal('사진 맞추기', `<div class="stack center">
    <canvas id="cropC" width="${VIEW}" height="${VIEW}" class="crop" aria-label="사진을 끌어서 위치를 맞춰요"></canvas>
    <label for="zoom" class="sub">확대</label><input id="zoom" type="range" min="1" max="4" step="0.01" value="1">
    <p class="sub">사진을 끌어서 얼굴을 동그라미 안에 맞춰요.</p>
    <div class="row end"><button class="primary" id="cropSave">이 사진으로</button></div></div>`, { onClose: () => URL.revokeObjectURL(url) });
  const c = md.el.querySelector('#cropC'), g = c.getContext('2d');
  const base = Math.max(VIEW / img.width, VIEW / img.height); // 화면을 꽉 채우는 배율
  let zoom = 1, ox = 0, oy = 0; // 가운데 기준 이동

  const clampOffset = () => {
    const w = img.width * base * zoom, h = img.height * base * zoom;
    const mx = Math.max(0, (w - VIEW) / 2), my = Math.max(0, (h - VIEW) / 2);
    ox = Math.max(-mx, Math.min(mx, ox));
    oy = Math.max(-my, Math.min(my, oy));
  };
  const draw = (ctx, size) => {
    const k = size / VIEW, w = img.width * base * zoom * k, h = img.height * base * zoom * k;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, (size - w) / 2 + ox * k, (size - h) / 2 + oy * k, w, h);
  };
  const render = () => {
    draw(g, VIEW);
    g.save(); // 동그라미 밖은 흐리게
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.beginPath(); g.rect(0, 0, VIEW, VIEW); g.arc(VIEW / 2, VIEW / 2, VIEW / 2 - 4, 0, Math.PI * 2, true); g.fill('evenodd');
    g.restore();
  };

  let drag = null;
  c.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ox, oy }; c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const s = VIEW / c.getBoundingClientRect().width;
    ox = drag.ox + (e.clientX - drag.x) * s; oy = drag.oy + (e.clientY - drag.y) * s;
    clampOffset(); render();
  });
  c.addEventListener('pointerup', () => { drag = null; });
  md.el.querySelector('#zoom').addEventListener('input', (e) => { zoom = Number(e.target.value); clampOffset(); render(); });
  md.el.querySelector('#cropSave').onclick = () => {
    const out = document.createElement('canvas');
    out.width = out.height = OUT;
    draw(out.getContext('2d'), OUT);
    let q = 0.85, data = out.toDataURL('image/jpeg', q);
    while (data.length > MAX_LEN && q > 0.3) { q -= 0.1; data = out.toDataURL('image/jpeg', q); }
    md.close();
    onDone(data);
  };
  render();
}
