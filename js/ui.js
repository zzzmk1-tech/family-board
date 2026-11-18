// 가족 보드 - 화면 공통 도구 (글자 처리, 프로필 그림, 알림 띠, 팝업, 날짜)

/** HTML에 넣을 글자 안전하게 */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** 프로필: 사진이 있으면 사진, 없으면 이모지 */
export function avatar(p, size = 36) {
  const s = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.58)}px`;
  if (!p) return `<span class="av" style="${s}">🙂</span>`;
  if (p.photo) return `<img class="av" style="${s}" src="${esc(p.photo)}" alt="${esc(p.name)}">`;
  return `<span class="av" style="${s}" aria-hidden="true">${esc(p.emoji || '🙂')}</span>`;
}

/** 화면 아래 잠깐 뜨는 안내 */
export function toast(msg, ms = 2600) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, ms);
}

/** 오류를 알림 띠로 */
export const fail = (e) => toast(e && e.message ? e.message : '문제가 생겼어요.');

/**
 * 팝업 창. body는 HTML 글자. 돌려받은 { el, close }로 안의 요소를 다뤄요.
 * 바깥이나 닫기 버튼을 누르면 닫혀요.
 */
export function modal(title, body, { wide = false, sheet = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-bg' + (sheet ? ' sheet-bg' : '');
  wrap.innerHTML = `<div class="modal${wide ? ' wide' : ''}${sheet ? ' sheet' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="ghost icon" data-close aria-label="닫기">✕</button></div>
    <div class="modal-body">${body}</div></div>`;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  const first = wrap.querySelector('input,textarea,select');
  if (first) setTimeout(() => first.focus(), 30);
  return { el: wrap, close };
}

/** 지우기처럼 되돌릴 수 없는 버튼: 한 번 누르면 확인 문구로 바뀌고, 한 번 더 눌러야 실행 */
export function armed(btn, confirmText) {
  if (btn.dataset.armed === '1') return true;
  btn.dataset.armed = '1';
  btn.dataset.label = btn.textContent;
  btn.textContent = confirmText;
  setTimeout(() => { if (btn.isConnected && btn.dataset.armed === '1') { btn.dataset.armed = ''; btn.textContent = btn.dataset.label; } }, 4000);
  return false;
}

/* ---------- 날짜 ---------- */
export const DOW = '일월화수목금토';
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (k, n) => { const d = parseDay(k); d.setDate(d.getDate() + n); return dayKey(d); };
export const koDate = (k) => { const d = parseDay(k); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`; };
/** 서버 시각 'yyyy-MM-dd HH:mm:ss'(한국 시간) → Date */
export const atDate = (s) => (s ? new Date(s.replace(' ', 'T') + '+09:00') : null);
export function ago(s) {
  const d = atDate(s);
  if (!d) return '';
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}
export function clock(s) {
  const d = atDate(s);
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
}
/** 서버와 같은 형식의 '지금' (미리 보기에서 씀) */
export function nowAt(offsetMin = 0) {
  return new Date(Date.now() + (540 + offsetMin) * 60000).toISOString().slice(0, 19).replace('T', ' ');
}
