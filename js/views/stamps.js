// 도장판 (아이 화면): 엄마가 확인한 미션 1개 = 도장 1개. 갖고 싶은 것을 적고, 도장을 모으면 "사 주세요"
// 엄마·아빠 화면은 미션 확인 → 도장판 탭 (approve.js가 아래 함수들을 같이 써요)
import { call } from '../api.js';
import { state } from '../state.js';
import { esc, modal, armed, toast, fail, parseDay } from '../ui.js';

const won = (n) => Math.round(n).toLocaleString('ko-KR') + '원';
export const STATUS_TEXT = { '대기': '엄마·아빠가 도장 개수를 정하는 중', '확인': '', '요청': '사 달라고 했어요 ⏳', '받음': '받았어요 🎉' };

/** 도장 칸: 목표 개수만큼 칸을 그리고 모은 만큼 찍어요 (칸이 많으면 막대로) */
export function boardHtml(have, need) {
  const n = Math.max(0, Math.min(have, need));
  if (!need) return '';
  if (need > 60) {
    const pct = Math.round((n / need) * 100);
    return `<div class="bar stamp-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>`;
  }
  return `<div class="stampgrid" aria-label="도장 ${need}개 중 ${n}개">${Array.from({ length: need }, (_, i) =>
    `<span class="stampcell${i < n ? ' on' : ''}" aria-hidden="true">${i < n ? '★' : ''}</span>`).join('')}</div>`;
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

export default {
  id: 'stamps', label: '도장판', icon: 'star', needsPerson: true,
  visible: (s) => (s.me ? s.me.role === '아이' : !!s.device && s.device.kind === '공용'),
  mount(root) {
    if (state.me.role !== '아이') { root.innerHTML = '<div class="empty big">도장판은 아이 화면이에요. 엄마·아빠는 "미션 확인 → 도장판"을 써 주세요.</div>'; return null; }
    let d = null;

    function draw() {
      const goal = d.wishes.find((w) => w.goal) || null;
      const others = d.wishes.filter((w) => w !== goal);
      const DOWS = '일월화수목금토';
      root.innerHTML = `<div class="view-body">
        <section class="panel stamp-hero">
          <div class="stamp-count"><span class="big-star" aria-hidden="true">★</span><b class="num">${d.balance}</b><span>개</span></div>
          <div class="sub">${d.today ? `오늘 도장 +${d.today}개! ` : ''}엄마가 확인한 미션 1개 = 도장 1개${d.available < d.balance ? ` · 사 달라고 한 것 ${d.balance - d.available}개 빼고 ${d.available}개 쓸 수 있어요` : ''}</div>
        </section>
        ${goal ? goalHtml(goal) : `<section class="panel"><div class="empty">갖고 싶은 것을 적고 도장을 모아 보세요! 🎁</div></section>`}
        <section class="panel"><div class="head"><h2>갖고 싶은 것</h2></div>
          <div class="list">${others.map(wishRowHtml).join('') || (goal ? '<div class="sub">더 갖고 싶은 게 있으면 적어 두세요.</div>' : '')}</div>
          <button class="add-btn" id="wAdd">+ 갖고 싶은 것 적기</button></section>
        <section class="panel"><div class="head"><h2>최근 2주 도장</h2></div>
          <div class="stampdays">${d.days.map((x) => { const dt = parseDay(x.date); return `<div class="sday${x.count ? ' on' : ''}"><span class="sub">${dt.getMonth() + 1}/${dt.getDate()}<br>${DOWS[dt.getDay()]}</span><b class="num">${x.count ? '★' + x.count : '·'}</b></div>`; }).join('')}</div></section>
        ${d.done.length ? `<section class="panel"><div class="head"><h2>받은 것</h2></div><div class="list">${d.done.map((w) => `<div class="item"><span class="grow">🎁 <b>${esc(w.title)}</b><br><span class="sub">${esc(w.doneAt.slice(0, 10))} · 도장 ${w.stamps}개</span></span></div>`).join('')}</div></section>` : ''}
      </div>`;
    }

    function goalHtml(g) {
      const need = g.stamps || 0;
      const have = d.available + (g.status === '요청' ? need : 0);   // 사 달라고 한 건 이미 모은 거예요
      const left = Math.max(0, need - have);
      let action = '';
      if (g.status === '대기') action = `<p class="hint">엄마·아빠가 도장 개수를 정하는 중이에요${need ? ` (예상 ${need}개)` : ''}.</p>`;
      else if (g.status === '요청') action = `<p class="hint">엄마·아빠에게 사 달라고 했어요 ⏳</p><button class="ghost small" data-cancel="${esc(g.id)}">사 달라는 거 취소</button>`;
      else if (left === 0) action = `<button class="primary big-btn" data-req="${esc(g.id)}">🎁 사 주세요!</button>`;
      else action = `<p class="goal-left">도장 <b class="num">${left}</b>개 더 모으면 받아요! 💪</p>`;
      return `<section class="panel goal-card"><div class="head"><h2>🎯 ${esc(g.title)}</h2>
          <span class="sub">${g.price ? won(g.price) + ' · ' : ''}${need && g.status !== '대기' ? `도장 ${Math.min(have, need)} / ${need}` : ''}</span></div>
        ${g.status !== '대기' ? boardHtml(have, need) : ''}
        ${g.note ? `<p class="sub">${esc(g.note)}</p>` : ''}${g.link ? `<a class="sub" href="${esc(g.link)}" target="_blank" rel="noopener">링크 보기 ↗</a>` : ''}
        ${action}
        <div class="row end">${g.status !== '요청' ? `<button class="small ghost" data-edit="${esc(g.id)}">고치기</button><button class="small ghost" data-del="${esc(g.id)}">지우기</button>` : ''}</div></section>`;
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

    const load = () => call('stamps.view').then((x) => { d = x; draw(); });
    root.innerHTML = '<div class="sub">불러오는 중…</div>';
    load().catch(fail);
    return { onSync: () => { if (!document.querySelector('.modal-bg')) load().catch(() => {}); } };
  },
};
