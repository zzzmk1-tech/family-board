// 도장판: 엄마가 확인한 미션 1개 = 도장 1개. 갖고 싶은 것을 적고, 목표를 골라 도장을 모으면 "사 주세요"
//  - 아이: 내 도장, 목표, 갖고 싶은 것
//  - 엄마·아빠: 아이별 도장, 도장 개수 정하기, 사 줬어요, 도장 더하기·빼기
// 홈 화면(home.js)도 아래 goalCardHtml / kidsSummaryHtml 를 같이 써요
import { call, peek } from '../api.js';
import { state, emit, personById } from '../state.js';
import { esc, modal, armed, toast, fail, parseDay, avatar } from '../ui.js';
import { icon } from '../icons.js';

const won = (n) => Math.round(n).toLocaleString('ko-KR') + '원';
export const STATUS_TEXT = { '대기': '엄마·아빠가 도장 개수를 정하는 중', '확인': '', '요청': '사 달라고 했어요 ⏳', '받음': '받았어요 🎉' };

/* ---------- 스티커판 ----------
 * 미션 1개 = 스티커 1개. 파스텔 동그라미에 같은 계열 진한 아이콘(별·하트·엄지척·체크·반짝이)이 섞여 붙어요.
 * 순서는 정해져 있어서 같은 칸에는 늘 같은 스티커가 붙어요.
 * 한 판에 PER_BOARD(20)개. 더 많으면 여러 판을 옆으로 넘겨 봐요.
 */
const PER_BOARD = 20;
const svg = (inner) => `<svg viewBox="0 0 24 24" width="58%" height="58%" aria-hidden="true">${inner}</svg>`;
const STICKERS = [
  svg('<path fill="currentColor" d="m12 3.2 2.7 5.5 6 .9-4.4 4.2 1.1 6L12 17l-5.4 2.8 1.1-6-4.4-4.2 6-.9z"/>'),                          // 별
  svg('<path fill="currentColor" d="M12 20.6S3.6 15.6 2.7 10.4C2 6.9 4.3 4.6 7.1 4.6c2 0 3.5 1.1 4.9 3 1.4-1.9 2.9-3 4.9-3 2.8 0 5.1 2.3 4.4 5.8-.9 5.2-9.3 10.2-9.3 10.2z"/>'),   // 하트
  svg('<path fill="currentColor" d="M3.5 10h3.3v10H3.5zM8.5 20V9.6l3.9-5.8c.9-1.1 2.6-.5 2.6 1v4.1h4.4c1.3 0 2.2 1.2 1.9 2.4l-1.6 6.9c-.3 1-1.1 1.8-2.2 1.8z"/>'),   // 엄지척
  svg('<path fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" d="m5 12.6 4.6 4.6L19.2 7"/>'),   // 체크
  svg('<path fill="currentColor" d="M12 2.5c.6 4.6 2.9 6.9 7.5 7.5-4.6.6-6.9 2.9-7.5 7.5-.6-4.6-2.9-6.9-7.5-7.5 4.6-.6 6.9-2.9 7.5-7.5zM19 15.5c.3 2 1.2 2.9 3 3.2-1.8.3-2.7 1.2-3 3.1-.3-1.9-1.2-2.8-3-3.1 1.8-.3 2.7-1.2 3-3.2z"/>'),   // 반짝이
];
// 아이콘 색 (별 노랑, 하트 분홍, 엄지척 하늘, 체크 초록, 반짝이 보라). 배경은 이 색을 옅게 섞은 파스텔이에요 (CSS --sfg)
const STICKER_COLORS = ['#C98A12', '#D4537E', '#378ADD', '#1D9E75', '#7F77DD'];
// 줄마다 순서를 두 칸씩 밀어서, 옆 칸·위아래 칸에 같은 아이콘이 오지 않게 섞어요
const sticker = (i) => { const k = (i + Math.floor(i / 5) * 2) % STICKERS.length; return [STICKERS[k], STICKER_COLORS[k]]; };
const GIFT = svg('<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18v-1.5H3zM12 7.5V20M12 7.5c-1.5-3-5-3-5-1s3 1 5 1zm0 0c1.5-3 5-3 5-1s-3 1-5 1z"/></g>');

/**
 * 스티커판: 목표 개수만큼 칸을 그리고 모은 만큼 붙여요. 마지막 칸은 선물.
 * 20개가 넘으면 20개씩 여러 판으로 나눠 옆으로 넘겨 보고, 처음엔 지금 채우는 판을 보여줘요.
 * newFrom: 이 번호부터는 '새로 붙은 스티커'라서 꾹 붙는 움직임을 보여줘요
 * (화면에 넣은 뒤 initSliders(감싸는 요소)를 불러야 지금 판으로 넘어가요)
 */
export function boardHtml(have, need, newFrom) {
  const n = Math.max(0, Math.min(have, need));
  if (!need) return '';
  const from = newFrom == null ? n : Math.max(0, newFrom);
  const cell = (i) => {
    if (i < n) {
      const isNew = i >= from;
      const [icon, color] = sticker(i);
      return `<span class="stampcell on${isNew ? ' new' : ''}" style="--sfg:${color}${isNew ? `;--delay:${Math.min(i - from, 15) * 110}ms` : ''}" aria-hidden="true">${icon}</span>`;
    }
    return `<span class="stampcell${i === need - 1 ? ' gift' : ''}" aria-hidden="true">${i === need - 1 ? GIFT : ''}</span>`;
  };
  const pages = Math.ceil(need / PER_BOARD);
  const current = Math.min(pages - 1, Math.floor(Math.min(n, need - 1) / PER_BOARD));   // 지금 채우는 판
  const boards = Array.from({ length: pages }, (_, p) => {
    const start = p * PER_BOARD, end = Math.min(need, start + PER_BOARD);
    return `<div class="stamppage"><div class="stampgrid">${Array.from({ length: end - start }, (_, k) => cell(start + k)).join('')}</div></div>`;
  }).join('');
  const label = `스티커 ${need}개 중 ${n}개`;
  if (pages === 1) return `<div class="stampboard${n >= need ? ' full' : ''}" role="img" aria-label="${label}">${boards}</div>`;
  return `<div class="stampboard multi${n >= need ? ' full' : ''}" data-start="${current}" role="group" aria-label="${label}, ${pages}판">
    <div class="stampnav"><button type="button" class="ghost small" data-slide="-1" aria-label="이전 판">‹</button>
      <span class="stampnav-label"><b class="num" data-pageno>${current + 1}</b> / ${pages}판</span>
      <button type="button" class="ghost small" data-slide="1" aria-label="다음 판">›</button></div>
    <div class="stampslider">${boards}</div>
    <div class="stampdots">${Array.from({ length: pages }, (_, p) => `<i class="${p === current ? 'on' : ''}" data-dot="${p}"></i>`).join('')}</div></div>`;
}

/** 여러 판짜리 스티커판: 지금 채우는 판으로 넘기고, 화살표·점·밀기를 연결해요 */
export function initSliders(root) {
  (root || document).querySelectorAll('.stampboard.multi:not([data-ready])').forEach((b) => {
    b.dataset.ready = '1';
    const sl = b.querySelector('.stampslider');
    const pages = sl.children.length;
    const show = () => {
      const p = Math.round(sl.scrollLeft / Math.max(1, sl.clientWidth));
      b.querySelector('[data-pageno]').textContent = p + 1;
      b.querySelectorAll('[data-dot]').forEach((d) => d.classList.toggle('on', Number(d.dataset.dot) === p));
    };
    const go = (p, smooth) => sl.scrollTo({ left: Math.max(0, Math.min(pages - 1, p)) * sl.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    requestAnimationFrame(() => { go(Number(b.dataset.start) || 0, false); show(); });
    sl.addEventListener('scroll', () => requestAnimationFrame(show), { passive: true });
    b.addEventListener('click', (e) => {
      const s = e.target.closest('[data-slide]');
      if (s) { e.stopPropagation(); go(Math.round(sl.scrollLeft / sl.clientWidth) + Number(s.dataset.slide), true); return; }
      const d = e.target.closest('[data-dot]');
      if (d) { e.stopPropagation(); go(Number(d.dataset.dot), true); }
    });
  });
}

/** 아이 기기에서: 지난번에 본 뒤로 새로 생긴 스티커 수 (그것만 꾹 붙는 움직임을 보여줘요) */
export function newStickers(kidId, balance) {
  const key = 'fb.seenStickers.' + kidId;
  let prev = null;
  try { prev = localStorage.getItem(key); localStorage.setItem(key, String(balance)); } catch (e) { /* 괜찮아요 */ }
  return prev == null ? 0 : Math.max(0, balance - (Number(prev) || 0));
}

/** 갖고 싶은 것 적기·고치기 팝업. onSaved(새 데이터) */
export function wishForm({ wish, kidId, rate, parent, onSaved }) {
  const w = wish || { title: '', price: '', link: '', note: '', stamps: '' };
  const md = modal(wish ? '갖고 싶은 것 고치기' : '갖고 싶은 것 적기', `<form class="stack" id="wForm">
    <label for="wTitle">무엇을 갖고 싶어요?</label><input id="wTitle" maxlength="30" required placeholder="예: 레고 시티 경찰차" value="${esc(w.title)}">
    <label for="wPrice">대략 얼마예요? <span class="sub">(모르면 비워 두세요)</span></label>
    <input id="wPrice" inputmode="numeric" placeholder="예: 15000" value="${w.price ? esc(w.price) : ''}">
    <div class="sub" id="wEst"></div>
    ${parent ? `<label for="wStamps">도장 개수 <span class="sub">(정하면 아이가 모으기 시작해요)</span></label><input id="wStamps" inputmode="numeric" value="${w.stamps ? esc(w.stamps) : ''}" placeholder="가격을 넣으면 저절로 계산돼요">` : ''}
    <label for="wLink">사진이나 파는 곳 링크 <span class="sub">(선택)</span></label><input id="wLink" maxlength="300" placeholder="https://" value="${esc(w.link || '')}">
    <label for="wNote">메모 <span class="sub">(선택, 색깔·크기 등)</span></label><input id="wNote" maxlength="100" value="${esc(w.note || '')}">
    <button class="primary">${wish ? '저장하기' : '적기'}</button></form>`);
  const el = md.el;
  const price = el.querySelector('#wPrice'), est = el.querySelector('#wEst'), stamps = el.querySelector('#wStamps');
  let touched = !!(w.stamps && wish && wish.status !== '대기');
  const update = () => {
    const p = Number(price.value.replace(/[^\d]/g, '')) || 0;
    const s = p ? Math.ceil(p / rate) : 0;
    est.textContent = p ? `도장 1개 = ${won(rate)} → 도장 약 ${s}개` : '';
    if (stamps && !touched && p) stamps.value = s;
  };
  price.addEventListener('input', update);
  if (stamps) stamps.addEventListener('input', () => { touched = true; });
  update();
  el.querySelector('#wForm').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const d = await call('wish.save', { id: wish ? wish.id : '', kidId, title: el.querySelector('#wTitle').value, price: price.value,
        link: el.querySelector('#wLink').value.trim(), note: el.querySelector('#wNote').value, stamps: stamps ? stamps.value : undefined });
      md.close();
      toast(parent ? '저장했어요' : wish ? '고쳤어요' : '적었어요! 엄마·아빠가 도장 개수를 정해 줄 거예요');
      onSaved(d);
    } catch (err) { fail(err); }
  };
}

/** 목표 카드 (도장판, 아이 홈). d: stamps.view 결과. home: 홈에 짧게 보여줄 때. fresh: 새로 붙은 스티커 수 */
export function goalCardHtml(d, home, fresh) {
  const g = d.wishes.find((w) => w.goal) || null;
  if (!g) {
    const msg = d.wishes.length ? '갖고 싶은 것 중 하나를 <b>목표로</b> 골라 보세요! 🎯' : '갖고 싶은 것을 적고 목표로 골라 보세요! 🎁';
    return `<section class="panel goal-card"><div class="head"><h2>★ 도장 ${d.balance}개</h2>${home ? '<button class="ghost small" data-go="stamps">도장판 ›</button>' : ''}</div>
      <p class="sub">${msg}</p></section>`;
  }
  const need = g.stamps || 0;
  const have = d.available + (g.status === '요청' ? need : 0);   // 사 달라고 한 건 이미 모은 거예요
  const left = Math.max(0, need - have);
  let action = '';
  if (g.status === '대기') action = `<p class="hint">엄마·아빠가 도장 개수를 정하는 중이에요${need ? ` (예상 ${need}개)` : ''}.</p>`;
  else if (g.status === '요청') action = `<p class="hint">엄마·아빠에게 사 달라고 했어요 ⏳</p>${home ? '' : `<button class="ghost small" data-cancel="${esc(g.id)}">사 달라는 거 취소</button>`}`;
  else if (left === 0) action = `<p class="goal-done">다 모았어요! 🎉</p>` + (home ? '<button class="primary big-btn" data-go="stamps">🎁 사 달라고 하러 가기</button>' : `<button class="primary big-btn" data-req="${esc(g.id)}">🎁 사 주세요!</button>`);
  else action = `<p class="goal-left">도장 <b class="num">${left}</b>개 더 모으면 받아요! 💪</p>`;
  const done = g.status === '확인' && left === 0;
  return `<section class="panel goal-card${done ? ' complete' : ''}"><div class="head"><h2>🎯 ${esc(g.title)}</h2>
      <span class="sub">${!home && g.price ? won(g.price) + ' · ' : ''}${need && g.status !== '대기' ? `${Math.min(have, need)} / ${need}` : `도장 ${d.balance}개`}</span></div>
    ${g.status !== '대기' ? boardHtml(have, need, fresh ? have - fresh : undefined) : ''}
    ${!home && g.note ? `<p class="sub">${esc(g.note)}</p>` : ''}${!home && g.link ? `<a class="sub" href="${esc(g.link)}" target="_blank" rel="noopener">링크 보기 ↗</a>` : ''}
    ${action}
    ${home ? '<div class="row end"><button class="ghost small" data-go="stamps">도장판 ›</button></div>'
      : `<div class="row end">${g.status !== '요청' ? `<button class="small ghost" data-edit="${esc(g.id)}">고치기</button><button class="small ghost" data-del="${esc(g.id)}">지우기</button>` : ''}</div>`}</section>`;
}

/** 엄마·아빠 홈: 아이들 도장 한눈에. d: stamps.parent 결과 */
export function kidsSummaryHtml(d) {
  return `<section class="panel"><div class="head"><h2>아이들 도장</h2><button class="ghost small" data-go="stamps">도장판 ›</button></div>
    <div class="list">${d.kids.map((k) => {
      const g = k.wishes.find((w) => w.goal);
      const req = k.wishes.filter((w) => w.status === '요청').length, wait = k.wishes.filter((w) => w.status === '대기').length;
      const have = g ? Math.min(k.available + (g.status === '요청' ? g.stamps : 0), g.stamps || 0) : 0;
      const pct = g && g.stamps && g.status !== '대기' ? Math.round((have / g.stamps) * 100) : 0;
      return `<button class="item kidstamp" data-go="stamps">${avatar(personById(k.kidId), 32)}
        <span class="grow"><b>${esc(k.name)}</b> <span class="sub">★ ${k.balance}개</span>
          <br><span class="sub">${g ? `🎯 ${esc(g.title)}${g.status !== '대기' && g.stamps ? ` ${have}/${g.stamps}` : ''}` : '목표 없음'}</span>
          ${g && g.status !== '대기' && g.stamps ? `<span class="bar stamp-bar mini"><i style="width:${pct}%"></i></span>` : ''}</span>
        ${req ? '<span class="btag">사 달래요! 🎁</span>' : ''}${wait ? `<span class="btag warn">개수 정하기 ${wait}</span>` : ''}</button>`;
    }).join('')}</div></section>`;
}

export default {
  id: 'stamps', label: '도장판', icon: 'star', needsPerson: true,
  visible: (s) => (s.me ? true : !!s.device && s.device.kind === '공용'),
  badge: (s) => (s.me && s.me.role === '부모' ? s.wishPending || 0 : 0),
  mount(root) {
    if (state.me.role !== '아이') return mountParent(root);
    let d = null, fresh = 0;   // fresh: 지난번에 본 뒤로 새로 붙은 스티커 수 (한 번만 움직여요)

    function draw() {
      setTimeout(() => { fresh = 0; }, 0);
      const goal = d.wishes.find((w) => w.goal) || null;
      const others = d.wishes.filter((w) => w !== goal);
      const DOWS = '일월화수목금토';
      root.innerHTML = `<div class="view-body">
        <section class="panel stamp-hero">
          <div class="stamp-count"><span class="big-star" aria-hidden="true">★</span><b class="num">${d.balance}</b><span>개</span></div>
          <div class="sub">${d.today ? `오늘 도장 +${d.today}개! ` : ''}엄마가 확인한 미션 1개 = 도장 1개${d.available < d.balance ? ` · 사 달라고 한 것 ${d.balance - d.available}개 빼고 ${d.available}개 쓸 수 있어요` : ''}</div>
        </section>
        ${goalCardHtml(d, false, fresh)}
        <section class="panel"><div class="head"><h2>갖고 싶은 것</h2></div>
          <div class="list">${others.map(wishRowHtml).join('') || (goal ? '<div class="sub">더 갖고 싶은 게 있으면 적어 두세요.</div>' : '')}</div>
          <button class="add-btn" id="wAdd">+ 갖고 싶은 것 적기</button></section>
        <section class="panel"><div class="head"><h2>최근 2주 도장</h2></div>
          <div class="stampdays">${d.days.map((x) => { const dt = parseDay(x.date); return `<div class="sday${x.count ? ' on' : ''}"><span class="sub">${dt.getMonth() + 1}/${dt.getDate()}<br>${DOWS[dt.getDay()]}</span><b class="num">${x.count ? '★' + x.count : '·'}</b></div>`; }).join('')}</div></section>
        ${d.done.length ? `<section class="panel"><div class="head"><h2>받은 것</h2></div><div class="list">${d.done.map((w) => `<div class="item"><span class="grow">🎁 <b>${esc(w.title)}</b><br><span class="sub">${esc(w.doneAt.slice(0, 10))} · 도장 ${w.stamps}개</span></span></div>`).join('')}</div></section>` : ''}
      </div>`;
      initSliders(root);
    }

    function wishRowHtml(w) {
      const need = w.stamps || 0;
      return `<div class="item wish"><div class="grow"><b>${esc(w.title)}</b>
          <br><span class="sub">${w.price ? won(w.price) + ' · ' : ''}${w.status === '대기' ? (need ? `예상 도장 ${need}개 · ` : '') + '엄마·아빠가 정하는 중' : `도장 ${need}개`}${w.status === '요청' ? ' · 사 달라고 했어요 ⏳' : ''}</span></div>
        <button class="small" data-goal="${esc(w.id)}">목표로</button>
        ${w.status !== '요청' ? `<button class="small ghost" data-edit="${esc(w.id)}">고치기</button>` : ''}</div>`;
    }

    root.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.closest('#wAdd')) return wishForm({ kidId: state.me.id, rate: d.rate, parent: false, onSaved: (x) => { d = x; draw(); } });
      const ed = t.closest('[data-edit]'); if (ed) return wishForm({ wish: d.wishes.find((w) => w.id === ed.dataset.edit), kidId: state.me.id, rate: d.rate, parent: false, onSaved: (x) => { d = x; draw(); } });
      const act = async (fn, id, msg) => { try { d = await call(fn, id); draw(); if (msg) toast(msg); } catch (err) { fail(err); } };
      const gl = t.closest('[data-goal]'); if (gl) return act('wish.goal', gl.dataset.goal, '목표로 정했어요 🎯');
      const del = t.closest('[data-del]'); if (del) { if (!armed(del, '정말 지울까요?')) return; return act('wish.remove', del.dataset.del, '지웠어요'); }
      const rq = t.closest('[data-req]'); if (rq) { rq.disabled = true; return act('wish.request', rq.dataset.req, '엄마·아빠에게 사 달라고 했어요! 🎁'); }
      const cc = t.closest('[data-cancel]'); if (cc) { if (!armed(cc, '취소할까요?')) return; return act('wish.cancel', cc.dataset.cancel, '취소했어요'); }
    });

    let lastKey = '';
    const load = () => call('stamps.view').then((x) => {
      fresh = newStickers(state.me.id, x.balance);
      const key = JSON.stringify(x);
      if (key === lastKey && !fresh) return;   // 같으면 다시 그리지 않아요 (스티커 붙는 움직임이 끊기지 않게)
      lastKey = key; d = x; draw();
    });
    d = peek('stamps.view');   // 지난번에 본 화면을 먼저
    if (d) draw(); else root.innerHTML = '<div class="sub">불러오는 중…</div>';
    load().catch(fail);
    const kidId = state.me.id;
    return { onSync: () => { if (state.me && state.me.id === kidId && !document.querySelector('.modal-bg')) load().catch(() => {}); } };
  },
};

/* ---------- 엄마·아빠 도장판 ---------- */
function mountParent(root) {
  let d = peek('stamps.parent');
  const ST = { '대기': '도장 개수를 정해 주세요', '확인': '', '요청': '사 달래요! 🎁', '받음': '' };
  const setPending = (x) => {
    state.wishPending = x.kids.reduce((n, k) => n + k.wishes.filter((w) => w.status === '대기' || w.status === '요청').length, 0);
    emit('top');
  };

  function draw() {
    root.innerHTML = `<div class="view-body">${d.kids.map((k) => {
      const goal = k.wishes.find((w) => w.goal);
      const have = goal ? k.available + (goal.status === '요청' ? goal.stamps : 0) : 0;
      return `<section class="panel">
        <div class="head"><div class="row">${avatar(personById(k.kidId), 36)}<h2>${esc(k.name)}</h2>
            <span class="chip">★ ${k.balance}개${k.available < k.balance ? ` (쓸 수 있는 ${k.available})` : ''}</span></div>
          <div class="row"><button class="small nowrap" data-wadd="${esc(k.kidId)}">${icon('plus', 14)} 대신 적기</button>
            <button class="small ghost nowrap" data-sadj="${esc(k.kidId)}">도장 더하기·빼기</button></div></div>
        ${goal && goal.status !== '대기' && goal.stamps ? `<p class="sub">🎯 목표 <b>${esc(goal.title)}</b> ${Math.min(have, goal.stamps)} / ${goal.stamps}</p>${boardHtml(have, goal.stamps)}`
          : `<p class="sub">${goal ? `🎯 목표 <b>${esc(goal.title)}</b> · 도장 개수를 정해 주세요` : '아직 목표를 고르지 않았어요.'}</p>`}
        <div class="list">${k.wishes.length ? k.wishes.map((w) => `<div class="item wish${w.status === '대기' || w.status === '요청' ? ' needs' : ''}">
            <div class="grow"><b>${w.goal ? '🎯 ' : ''}${esc(w.title)}</b>
              <br><span class="sub">${w.price ? `${w.price.toLocaleString()}원 · ` : ''}${w.status === '대기' ? `예상 도장 ${w.stamps || '?'}개` : `도장 ${w.stamps}개`}${w.note ? ' · ' + esc(w.note) : ''}</span>
              ${ST[w.status] ? `<br><span class="btag${w.status === '요청' ? '' : ' warn'}">${ST[w.status]}</span>` : ''}
              ${w.link ? ` <a class="sub" href="${esc(w.link)}" target="_blank" rel="noopener">링크 ↗</a>` : ''}</div>
            ${w.status === '대기' ? `<button class="primary small" data-wset="${esc(w.id)}">개수 정하기</button>` : ''}
            ${w.status === '요청' || (w.status === '확인' && k.available >= w.stamps) ? `<button class="primary small" data-wdone="${esc(w.id)}">사 줬어요</button>` : ''}
            ${w.status === '요청' ? `<button class="small ghost" data-wcancel="${esc(w.id)}">요청 취소</button>` : `<button class="small ghost" data-wedit="${esc(w.id)}">고치기</button>`}
          </div>`).join('') : '<div class="empty">아직 적은 게 없어요.</div>'}</div>
        ${k.done.length ? `<details class="guide"><summary>받은 것 ${k.done.length}개</summary><div class="list">${k.done.map((w) => `<div class="item"><span class="grow">🎁 ${esc(w.title)}</span><span class="sub">${esc(w.doneAt.slice(0, 10))} · ${w.stamps}개</span></div>`).join('')}</div></details>` : ''}
        ${k.log.length ? `<details class="guide"><summary>도장 기록</summary><div class="list">${k.log.map((l) => `<div class="item"><span class="sub num">${esc(l.at.slice(5, 16))}</span>
            <span class="grow">${esc(l.reason)}</span><b class="num">${l.delta > 0 ? '+' : ''}${l.delta}</b></div>`).join('')}</div></details>` : ''}
      </section>`;
    }).join('')}
      <section class="panel"><div class="head"><h2>도장 규칙</h2></div>
        <ul class="rules"><li>엄마·아빠가 확인한 미션 1개 = 도장 1개 (${esc(d.start.slice(5).replace('-', '/'))}부터)</li>
          <li>"놀기 전에 끝냈어요" 같은 보너스는 그날 기본 미션을 다 했을 때만</li>
          <li>아이가 갖고 싶은 것을 적으면 도장 개수를 정해 주세요. 아이가 목표로 골라 도장을 다 모으면 "사 주세요"를 눌러요</li></ul>
        <form class="inline" id="rateForm"><label for="rateIn" class="nowrap">도장 1개 =</label><input id="rateIn" inputmode="numeric" value="${d.rate}" style="width:7em"><span>원</span><button class="small">저장</button></form>
        <p class="sub">도장 1개 값은 새로 적는 것의 도장 개수를 짐작할 때만 써요. 이미 정한 개수는 그대로예요.</p></section></div>`;
    initSliders(root);
  }

  const after = (x, msg) => { d = x; setPending(x); draw(); if (msg) toast(msg); };
  const findWish = (id) => d.kids.flatMap((k) => k.wishes).find((w) => w.id === id);
  function adjust(kidId) {
    const kid = personById(kidId);
    const md = modal(`${kid ? kid.name : ''} 도장 더하기·빼기`, `<form class="stack" id="adjForm">
      <label for="adjN">몇 개? <span class="sub">(빼려면 -3처럼)</span></label><input id="adjN" inputmode="numeric" required placeholder="예: 2 또는 -1">
      <label for="adjR">이유</label><input id="adjR" maxlength="40" placeholder="예: 동생을 잘 도와줘서">
      <button class="primary">저장</button></form>`);
    md.el.querySelector('#adjForm').onsubmit = async (e) => {
      e.preventDefault();
      try { const x = await call('stamps.adjust', kidId, Number(md.el.querySelector('#adjN').value), md.el.querySelector('#adjR').value); md.close(); after(x, '저장했어요'); } catch (err) { fail(err); }
    };
  }

  root.addEventListener('click', async (e) => {
    const t = e.target;
    const wa = t.closest('[data-wadd]'); if (wa) return wishForm({ kidId: wa.dataset.wadd, rate: d.rate, parent: true, onSaved: (x) => after(x) });
    const ws = t.closest('[data-wset],[data-wedit]');
    if (ws) { const w = findWish(ws.dataset.wset || ws.dataset.wedit); return wishForm({ wish: w, kidId: w.kidId, rate: d.rate, parent: true, onSaved: (x) => after(x) }); }
    const wd = t.closest('[data-wdone]');
    if (wd) {
      const w = findWish(wd.dataset.wdone);
      if (!armed(wd, `도장 ${w.stamps}개 빼요. 사 줬어요?`)) return;
      try { after(await call('wish.done', w.id), '도장을 뺐어요. 선물 고마워요! 🎁'); } catch (err) { fail(err); }
      return;
    }
    const wc = t.closest('[data-wcancel]');
    if (wc) { if (!armed(wc, '요청을 취소할까요?')) return; try { after(await call('wish.cancel', wc.dataset.wcancel), '취소했어요'); } catch (err) { fail(err); } return; }
    const sa = t.closest('[data-sadj]'); if (sa) adjust(sa.dataset.sadj);
  });
  root.addEventListener('submit', async (e) => {
    if (e.target.id !== 'rateForm') return;
    e.preventDefault();
    try { after(await call('stamps.setRate', Number(root.querySelector('#rateIn').value)), '저장했어요'); } catch (err) { fail(err); }
  });

  const load = () => call('stamps.parent').then((x) => { d = x; setPending(x); draw(); });
  if (d) draw(); else root.innerHTML = '<div class="sub">불러오는 중…</div>';
  load().catch(fail);
  return { onSync: () => {
    if (!state.me || state.me.role !== '부모') return;
    if (!document.querySelector('.modal-bg') && !root.querySelector('[data-armed="1"]')) load().catch(() => {});
  } };
}
