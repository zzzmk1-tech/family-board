// 가족 보드 - 시작, 메뉴, 화면 바꾸기, 바뀐 것 확인
//
// 메뉴를 추가하려면: views 폴더에 화면 파일을 만들고 아래 VIEWS 목록에 넣으면 돼요.
// 화면 파일은 { id, label, icon, needsPerson, mount(root) } 모양이에요.
//   mount는 화면을 그리고, { destroy(), onSync() }를 돌려줄 수 있어요.
import { call, session, setToken, setAs, ApiError } from './api.js';
import { IS_DEMO, SYNC_MS } from './config.js';
import { state, emit, on, personById, unreadTotal } from './state.js';
import { esc, $, avatar, toast, fail, modal, koDate, dayKey } from './ui.js';
import home from './views/home.js';
import calendar from './views/calendar.js';
import chat from './views/chat.js';
import wiki from './views/wiki.js';
import settings from './views/settings.js';
import missions from './views/missions.js';
import approve from './views/approve.js';
import budget from './views/budget.js';
import stamps from './views/stamps.js';
import { register, availableViews, orderedViews, BAR_COUNT } from './menu.js';
import { icon } from './icons.js';
import { applyTone } from './theme.js';
import { listenPush } from './push.js';

// 기본 메뉴 순서. 사람마다 설정에서 바꿀 수 있어요.
// (미션은 아이에게만, 미션 확인·가계부는 엄마·아빠에게만 보여요 - 각 화면 파일의 visible)
const VIEWS = [home, missions, stamps, approve, calendar, chat, budget, wiki, settings];
register(VIEWS);
const app = $('#app');
let current = null;      // 지금 화면 { view, handle }
let syncTimer = null;

/* ---------- 시작 ---------- */
async function start() {
  if (!session.token) {
    if (IS_DEMO) setToken('demo');
    else return showLink();
  }
  let boot;
  try {
    boot = await call('boot');
  } catch (e) {
    if (e.code === 'unlinked') { setToken(null); return showLink(e.message); }
    if (/^pin/.test(e.code) || e.code === 'no_person') { setAs(null); return start(); }
    return showError(e);
  }
  Object.assign(state, {
    device: boot.device, me: boot.me, people: boot.people, rooms: boot.rooms || [],
    settings: boot.settings, statuses: boot.statuses, wikiCategories: boot.wikiCategories, v: boot.v,
    missionPending: boot.missionPending || 0,
  });
  renderShell();
  go(location.hash.slice(1) || 'home');
  startSync();
}

/* ---------- 새 기기 연결 화면 ---------- */
function showLink(message) {
  app.innerHTML = `<div class="center-page"><div class="card link-card">
    <div class="logo">${icon('home', 44)}</div>
    <h1>가족 보드 연결하기</h1>
    <p class="sub">엄마·아빠 휴대폰의 <b>설정 → 기기 추가</b>에서 받은 6자리 코드를 넣어 주세요.</p>
    ${message ? `<p class="warn">${esc(message)}</p>` : ''}
    <form id="linkForm" class="stack">
      <label for="code">연결 코드</label>
      <input id="code" inputmode="numeric" pattern="\\d{6}" maxlength="6" autocomplete="one-time-code" placeholder="123456" required>
      <label for="devName">이 기기 이름 (선택)</label>
      <input id="devName" maxlength="30" placeholder="예: 소율 휴대폰, 거실 태블릿">
      <button class="primary">연결하기</button>
    </form></div></div>`;
  $('#linkForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true;
    try {
      const r = await call('link.redeem', $('#code').value.trim(), $('#devName').value.trim());
      setToken(r.token);
      setAs(null);
      start();
    } catch (err) { fail(err); btn.disabled = false; }
  };
}

function showError(e) {
  app.innerHTML = `<div class="center-page"><div class="card stack"><h1>열지 못했어요</h1><p>${esc(e.message)}</p><button class="primary" id="retry">다시 시도</button></div></div>`;
  $('#retry').onclick = start;
}

/* ---------- 틀: 메뉴 + 위쪽 줄 + 화면 ---------- */
function renderShell() {
  app.innerHTML = `<div class="shell">
    <nav class="rail" id="nav" aria-label="보드 메뉴"></nav>
    <div class="page">
      <header class="top">
        <div class="title"><h1 id="famName"></h1><div class="sub" id="todayLabel"></div></div>
        <div class="who" id="who"></div>
      </header>
      <main id="view" class="view"></main>
    </div></div>`;
  renderNav();
  renderTop();
}

/**
 * 메뉴: 넓은 화면은 왼쪽에 모두, 휴대폰은 아래에 앞의 4개 + 더보기.
 * (같은 버튼들을 그리고, 휴대폰에서는 CSS로 뒤쪽 버튼(extra)을 숨기고 더보기를 보여줘요)
 */
// 메뉴 옆 빨간 숫자 (화면 파일의 badge 함수: 안 읽은 대화, 확인 대기 미션 등)
const badgeOf = (v) => (v.badge ? Number(v.badge(state)) || 0 : 0);
const badgeHtml = (n) => (n ? `<span class="badge" aria-label="새 소식 ${n}개">${n > 99 ? '99+' : n}</span>` : '');

function renderNav() {
  const list = orderedViews();
  const extra = list.slice(BAR_COUNT);
  const curInExtra = !!current && extra.some((v) => v.id === current.view.id);
  $('#nav').innerHTML = list.map((v, i) => {
    const on = !!current && current.view.id === v.id;
    return `<button data-go="${v.id}" class="${on ? 'on' : ''}${i >= BAR_COUNT ? ' extra' : ''}" aria-current="${on ? 'page' : 'false'}">
      <span class="ic">${icon(v.icon)}</span><span>${v.label}</span>${badgeHtml(badgeOf(v))}</button>`;
  }).join('') + (extra.length ? `<button class="more${curInExtra ? ' on' : ''}" id="moreBtn" aria-haspopup="dialog">
      <span class="ic">${icon('more')}</span><span>더보기</span>${badgeHtml(extra.reduce((n, v) => n + badgeOf(v), 0))}</button>` : '');
  const more = $('#moreBtn');
  if (more) more.onclick = () => openMore(extra);
}

/** 휴대폰 '더보기': 아래 메뉴에 없는 메뉴들 */
function openMore(extra) {
  const m = modal('더보기', `<div class="more-grid">${extra.map((v) => `
      <button data-go="${v.id}" data-close class="${current && current.view.id === v.id ? 'on' : ''}">
        <span class="ic">${icon(v.icon, 26)}</span><span>${v.label}</span>${badgeHtml(badgeOf(v))}</button>`).join('')}
    </div><button class="ghost small edit-menu" data-go="settings" data-menu-edit data-close>메뉴 순서 바꾸기</button>`, { sheet: true });
  m.el.querySelector('[data-menu-edit]').addEventListener('click', () => { state.focus = 'menu'; });
}

function renderTop() {
  applyTone(state.me); // 화면 색 = 지금 쓰는 사람 색
  $('#famName').textContent = state.settings.familyName || '우리 가족';
  $('#todayLabel').textContent = koDate(dayKey());
  const who = $('#who');
  if (state.device.kind === '공용') {
    // 공용 기기: 이름을 눌러 사람 바꾸기
    who.innerHTML = `<span class="sub">지금 쓰는 사람</span><div class="pick">${state.people.map((p) => `
      <button data-pick="${esc(p.id)}" class="${state.me && state.me.id === p.id ? 'on' : ''}" aria-pressed="${!!state.me && state.me.id === p.id}">
        ${avatar(p, 26)}<span>${esc(p.name)}</span>${p.role === '부모' || p.hasPin ? `<span class="lock" title="PIN 필요">${icon('lock', 13)}</span>` : ''}</button>`).join('')}</div>`;
  } else {
    who.innerHTML = state.me ? `<div class="me-chip">${avatar(state.me, 30)}<span>${esc(state.me.name)}</span></div>` : '';
  }
}

document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]');
  if (g) { go(g.dataset.go); return; }
  const p = e.target.closest('[data-pick]');
  if (p) pickPerson(p.dataset.pick);
});

/** 공용 기기에서 사람 고르기. 엄마·아빠나 PIN을 켠 아이는 PIN을 물어봐요 */
async function pickPerson(id) {
  const p = personById(id);
  if (!p || (state.me && state.me.id === id)) return;
  if (p.role === '부모' || p.hasPin) {
    const m = modal(`${p.name} PIN`, `<form class="stack" id="pinForm">
      <label for="pinIn">숫자 4자리</label>
      <input id="pinIn" type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" autocomplete="off" required>
      ${IS_DEMO ? '<p class="sub">미리 보기 PIN: 0000</p>' : ''}
      <button class="primary">확인</button></form>`);
    m.el.querySelector('#pinForm').onsubmit = async (e) => {
      e.preventDefault();
      if (await becomePerson(id, m.el.querySelector('#pinIn').value)) m.close();
    };
    return;
  }
  becomePerson(id, null);
}

async function becomePerson(id, pin) {
  const prev = [session.as, session.pin];
  setAs(id, pin);
  try {
    const r = await call('auth.check');
    state.me = r.me;
    state.v = null;
    await syncNow();
    renderTop();
    remount();
    toast(`${r.me.name} 차례예요`);
    return true;
  } catch (e) {
    setAs(prev[0], prev[1]);
    fail(e);
    return false;
  }
}

/* ---------- 화면 바꾸기 ---------- */
function go(id) {
  const avail = availableViews();
  const view = avail.find((v) => v.id === id) || orderedViews()[0];
  if (location.hash.slice(1) !== view.id) history.replaceState(null, '', '#' + view.id);
  if (current && current.handle && current.handle.destroy) current.handle.destroy();
  current = { view, handle: null };
  renderNav();
  // 화면마다 새 칸을 써서 이전 화면의 클릭 처리가 남지 않게 해요
  const old = $('#view');
  const root = old.cloneNode(false);
  old.replaceWith(root);
  window.scrollTo(0, 0);
  if (view.needsPerson && !state.me) {
    root.innerHTML = `<div class="empty big">${state.device.kind === '공용' ? '맨 위에서 누가 쓰는지 먼저 골라 주세요.' : '이 기기의 사용자를 찾지 못했어요.'}</div>`;
    return;
  }
  try { current.handle = view.mount(root) || null; } catch (e) { console.error(e); root.innerHTML = `<div class="empty">화면을 그리지 못했어요: ${esc(e.message)}</div>`; }
}
function remount() { if (current) go(current.view.id); }
window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (!current || current.view.id !== id) go(id); });

/* ---------- 바뀐 것 확인 (다른 기기에서 고친 내용 가져오기) ---------- */
async function syncNow() {
  try {
    const r = await call('sync', state.v);
    if (!r.same) {
      state.v = r.v;
      if (r.people) state.people = r.people;
      if (r.rooms) state.rooms = r.rooms;
      if (r.missionPending !== undefined) state.missionPending = r.missionPending;
      if (state.me) state.me = personById(state.me.id) || state.me;
      renderTop();
      renderNav();
      emit('sync');
      if (current && current.handle && current.handle.onSync) current.handle.onSync();
    }
  } catch (e) {
    if (e.code === 'unlinked') { setToken(null); showLink(e.message); stopSync(); }
  }
}
function startSync() {
  stopSync();
  syncTimer = setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, SYNC_MS);
}
function stopSync() { clearInterval(syncTimer); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.device) syncNow(); });

// 다른 화면에서 "바로 다시 확인해 줘"라고 할 때
on((what) => { if (what === 'refresh') { state.v = null; syncNow(); } if (what === 'top') { renderTop(); renderNav(); } });

/* ---------- 알림: 앱이 열려 있을 때 온 알림은 바로 새로 고치고, 알림을 누르면 그 메뉴로 ---------- */
listenPush({
  onPush: () => { if (state.device) { state.v = null; syncNow(); } },
  onGo: (hash) => { const id = String(hash).replace('#', ''); if (state.device) go(id); },
});

/* ---------- 앱으로 설치 (홈 화면 아이콘) ---------- */
if ('serviceWorker' in navigator && !IS_DEMO && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

start();
