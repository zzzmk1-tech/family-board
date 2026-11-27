// 미션 (아이 화면) - '오늘의 미션' 앱과 같은 모양
// 인사 카드(마스코트·진행 막대) → 포인트 카드 → 탭(오늘 / 이번 달 / 요일별) → 미션 카드
import { call, peek } from '../api.js';
import { state } from '../state.js';
import { esc, toast, fail, DOW, parseDay } from '../ui.js';
import { icon } from '../icons.js';
import { missionIcon } from '../theme.js';

export const KIND_LABEL = { '보너스': '선택', '완료보너스': '보너스', '주말': '토·일 중 하루' };

// '포인트 받는 방법' 아래에 붙는 도장 규칙 (서버 규칙과 같아요: Stamps.gs)
const STAMP_RULES = [
  '★ 도장: 엄마가 확인한 미션 1개 = 도장 1개 (보너스 미션도 1개씩)',
  '★ "놀기 전에 끝냈어요" 같은 보너스는 그날 기본 미션을 다 했을 때만 도장을 받아요',
  '★ 하루 완료 보너스·주간 보너스는 포인트만 받고 도장은 더 없어요',
  '★ 도장을 모아 갖고 싶은 것을 받아요! 도장판에서 목표를 골라 보세요',
  '🏆 특별 미션: 문제집 한 권 끝내기처럼 큰 일을 해내면 엄마·아빠가 포인트와 도장을 더 줘요',
];

/**
 * 오늘 포인트를 나눠서 한 줄로 (서버 todayParts). parent: 엄마·아빠 화면 말투("+60"), 아니면 아이 화면("60")
 * 예) 미션 +120 · 놀기 전 보너스 +60 · 하루 완료 +60 · 주간 보너스 +800 🎉
 */
export function partsText(p, parent) {
  if (!p || !p.total) return '';
  const n = (v) => (parent ? '+' : '') + v.toLocaleString();
  const list = [
    [p.mission, '미션'], [p.early, parent ? '놀기 전 보너스' : '보너스'], [p.special, '특별'],
    [p.day, '하루 완료'], [p.week, parent ? '주간 보너스' : '주간'],
  ].filter(([v]) => v > 0).map(([v, t]) => `${t} ${n(v)}`);
  return list.join(' · ') + (p.week ? ' 🎉' : '');
}

/** 특별 미션 (최근 30일): 엄마·아빠가 넣어 준 것 */
const specialHtml = (list) => (list && list.length ? `<div class="sec">🏆 특별 미션</div><div class="missions">${list.map((s) => `<div class="mitem approved">
    <span class="mico" aria-hidden="true">🏆</span>
    <span class="grow"><span class="mtitle">${esc(s.title)}</span><span class="sub" style="display:block">${esc(s.dateLabel)}${s.stamps ? ` · 도장 +${s.stamps}개` : ''}</span></span>
    ${s.points ? `<span class="mpts num">+${s.points.toLocaleString()}</span>` : ''}</div>`).join('')}</div>` : '');
const rulesHtml = (rules) => rules.concat(STAMP_RULES).map((r) => `<li>${esc(r)}</li>`).join('');

/** 미션 화면 위의 도장 한 줄: 누르면 도장판으로 */
function stampStripHtml(s) {
  const g = s.goal;
  const goalText = !g ? '갖고 싶은 것을 적어 보세요'
    : g.status === '대기' ? `목표 ${g.title} · 엄마가 도장 개수를 정하는 중`
    : g.status === '요청' ? `${g.title} · 사 달라고 했어요 ⏳`
    : s.balance >= g.stamps ? `${g.title} · 다 모았어요! 사 달라고 해요 🎁`
    : `목표 ${g.title} ${s.balance}/${g.stamps}`;
  return `<button class="stampstrip" data-go="stamps"><span class="big-star" aria-hidden="true">★</span>
    <span class="grow"><b>도장 ${s.balance}개</b>${s.today ? ` <span class="sub">오늘 +${s.today}</span>` : ''}<br><span class="sub">${esc(goalText)}</span></span><span aria-hidden="true">›</span></button>`;
}

/** 인사 카드 (홈에서도 써요) */
// 보드 이름과 날짜는 화면 맨 위에 이미 있어서 여기서는 되풀이하지 않아요. big = 홈처럼 내 그림을 크게
export function heroHtml({ person, hello, title, when, progress, big }) {
  const mascot = person && person.photo ? `<img src="${esc(person.photo)}" alt="">` : esc((person && person.emoji) || '⭐');
  return `<div class="hero${big ? ' big' : ''}${person && person.photo ? ' has-photo' : ''}"><div class="blob"></div><div class="mascot" aria-hidden="true">${mascot}</div>
    ${hello ? `<div class="hello">${esc(hello)}</div>` : ''}<h1>${esc(title)}</h1>${when ? `<div class="when">${esc(when)}</div>` : ''}
    ${progress ? `<div class="prog"><div class="prog-l"><span>${esc(progress.label)}</span><span class="num">${progress.pct}%</span></div>
      <div class="bar" role="progressbar" aria-valuenow="${progress.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${progress.pct}%"></i></div></div>` : ''}</div>`;
}

export default {
  id: 'missions', label: '미션', icon: 'mission', needsPerson: true,
  // 아이에게만 보여요. 공용 기기에서 아직 사람을 안 골랐으면 보여 두고, 들어오면 이름부터 고르게 해요.
  visible: (s) => (s.me ? s.me.role === '아이' : !!s.device && s.device.kind === '공용'),
  mount(root) {
    if (state.me.role !== '아이') { root.innerHTML = '<div class="empty big">미션은 아이 화면이에요. 엄마·아빠는 "미션 확인"을 써 주세요.</div>'; return null; }
    let data = null, tab = 'today', month = null, ym = null, busy = false, cheer = [];
    const pendingIds = new Set();   // 저장 중인 미션 체크

    root.innerHTML = `<div id="top"></div>
      <div class="seg" role="tablist" id="tabs">
        <button role="tab" data-tab="today">오늘</button><button role="tab" data-tab="month">이번 달</button><button role="tab" data-tab="rules">요일별</button></div>
      <div id="body" class="view-body"><div class="sub">불러오는 중…</div></div>`;
    const top = root.querySelector('#top'), body = root.querySelector('#body');

    function drawTop() {
      const d = data;
      const done = d.coreDone + d.corePending; // 체크한 것까지 진행으로 보여줘요 (예전 앱과 같아요)
      const pct = d.coreTotal ? Math.round((done / d.coreTotal) * 100) : 100;
      const label = !d.coreTotal ? '오늘은 쉬는 날' : done === d.coreTotal ? '기본 미션 끝! 최고야 🎉' : `기본 미션 ${done} / ${d.coreTotal}`;
      top.innerHTML = `<div class="view-body">${heroHtml({ person: state.me, hello: `안녕, ${d.name}!`, title: `${d.name}의 오늘 미션`, progress: { label, pct } })}
        <div class="stats"><div class="stat"><b class="num">${d.todayPoints.toLocaleString()}</b><span class="sub">오늘 받은 포인트</span>
            ${partsText(d.todayParts) ? `<span class="sub" style="font-size:12px;line-height:1.4">${esc(partsText(d.todayParts))}</span>` : ''}</div>
          <div class="stat"><b class="num">${d.monthPoints.toLocaleString()}</b><span class="sub">이번 달</span></div></div>
        ${d.stamp ? stampStripHtml(d.stamp) : ''}</div>`;
    }

    function draw() {
      root.querySelectorAll('[data-tab]').forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab); });
      if (!data) return;
      drawTop();
      if (tab === 'today') drawToday();
      else if (tab === 'month') drawMonth();
      else drawRules();
    }

    function drawToday() {
      const d = data;
      const must = d.items.filter((m) => m.kind === '기본' || m.kind === '주말');
      const more = d.items.filter((m) => m.kind === '보너스' || m.kind === '완료보너스');
      const waiting = d.items.filter((m) => m.state === 'pending').length;
      const sum = cheer.reduce((a, c) => a + c.points, 0);
      body.innerHTML = `
        ${cheer.length ? `<div class="celebrate"><div class="ct">🎉 엄마가 확인했어요!</div>
          ${cheer.map((c) => (c.special
            ? `<div>🏆 특별 미션 · ${esc(c.title)}${c.points ? ` <b>+${c.points}</b>` : ''}${c.stamps ? ` · 도장 <b>${c.stamps}개</b>` : ''}</div>`
            : c.bonus ? `<div>${c.week ? '🏆' : '⭐'} ${esc(c.title)} <b>+${c.points}</b></div>`
            : `<div>${esc(c.title)} <b>+${c.points}</b></div>`)).join('')}<div class="cs">모두 +${sum}점. 잘했어요!</div></div>` : ''}
        ${waiting ? `<div class="hint">⏳ 엄마 확인을 기다리는 미션 ${waiting}개. 확인되면 포인트가 들어와요.</div>` : ''}
        ${!d.items.length ? '<div class="rest"><div class="big">😴</div>오늘은 쉬는 날이에요. 푹 쉬어요!</div>' : ''}
        ${must.length ? `<div class="sec">오늘 꼭 할 미션</div><div class="missions">${must.map(itemHtml).join('')}</div>` : ''}
        ${more.length ? `<div class="sec">더 하면 포인트 UP</div><div class="missions">${more.map(itemHtml).join('')}</div>` : ''}
        ${specialHtml(d.special)}
        <details class="guide"><summary>💡 포인트·도장 받는 방법</summary><ul class="rules">${rulesHtml(d.rules)}</ul></details>`;
    }

    function itemHtml(m) {
      const st = m.state;
      const tag = st === 'pending' ? '<span class="mtag">⏳ 확인 기다리는 중 · 다시 누르면 취소</span>'
        : st === 'approved' ? `<span class="mtag">✓ 확인 완료${m.byParent ? ' (엄마가 넣음)' : ''}</span>` : '';
      const desc = st === 'other' ? `${esc(m.otherDay)}요일에 이미 했어요` : esc(m.detail);
      const box = st === 'approved' || st === 'pending' ? '✓' : st === 'other' ? esc(m.otherDay) : '';
      const tagName = st === 'none' || st === 'pending' ? 'button' : 'div';
      return `<${tagName} class="mitem ${st}" ${tagName === 'button' && !m.locked ? `data-toggle="${esc(m.id)}"` : ''}
          ${tagName === 'button' ? `aria-label="${esc(m.title)}${st === 'pending' ? ' 체크 취소' : ' 다 했어요'}"` : ''}>
        <span class="mico" aria-hidden="true">${missionIcon(m.title)}</span>
        <span class="grow"><span class="mtitle">${esc(m.title)}${KIND_LABEL[m.kind] ? `<span class="kind">${KIND_LABEL[m.kind]}</span>` : ''}</span>
          <span class="sub" style="display:block">${desc}</span>${tag}</span>
        <span class="mpts num">+${m.points}</span><span class="mcheck" aria-hidden="true">${box}</span></${tagName}>`;
    }

    async function drawMonth() {
      if (!month) { body.innerHTML = '<div class="sub">불러오는 중…</div>'; month = await call('missions.month', '', ym).catch((e) => { fail(e); return null; }); if (!month || tab !== 'month') return; }
      const first = parseDay(month.ym + '-01'), start = first.getDay();
      const y = first.getFullYear(), mo = first.getMonth();
      let cells = [...DOW].map((d, i) => `<div class="dow${i === 0 ? ' sun' : ''}">${d}</div>`).join('');
      for (let i = 0; i < start; i++) cells += '<div></div>';
      month.days.forEach((d) => {
        cells += `<div class="pday${d.future ? ' future' : ''}${d.allCore ? ' all' : ''}"><span class="n num">${Number(d.date.slice(8))}</span>
          ${d.points ? `<b class="num">${d.points}</b>` : ''}${d.allCore ? '<span class="e">⭐</span>' : ''}</div>`;
      });
      body.innerHTML = `<div class="cal-head"><button class="cal-nav" data-ym="-1" aria-label="이전 달">‹</button><b>${y}년 ${mo + 1}월</b>
          <button class="cal-nav" data-ym="1" aria-label="다음 달">›</button></div>
        <div class="stat"><b class="num">${month.total.toLocaleString()}</b><span class="sub">이 달에 받은 포인트</span></div>
        <div class="pmonth">${cells}</div>
        <p class="sub" style="text-align:center">숫자는 그날 받은 포인트, ⭐는 기본 미션을 모두 한 날이에요.</p>`;
    }

    function drawRules() {
      const todayDow = (new Date().getDay() || 7);
      body.innerHTML = data.week.map((w) => `<div class="dayplan${'월화수목금토일'.indexOf(w.day) + 1 === todayDow ? ' today' : ''}">
          <b>${esc(w.day)}요일</b>${'월화수목금토일'.indexOf(w.day) + 1 === todayDow ? '<span class="now">오늘</span>' : ''}
          <ul>${w.missions.map((t) => `<li>${missionIcon(t)} ${esc(t)}</li>`).join('')}</ul></div>`).join('')
        + `<details class="guide" open><summary>💡 포인트·도장 받는 방법</summary><ul class="rules">${rulesHtml(data.rules)}</ul></details>`;
    }

    root.querySelector('#tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; draw(); } };
    body.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-toggle]');
      if (t) {
        // 누르는 순간 화면부터 바꾸고(체크 ↔ 취소), 저장은 뒤에서 해요. 실패하면 되돌려요.
        const id = t.dataset.toggle;
        const item = data.items.find((x) => x.id === id);
        if (!item || pendingIds.has(id)) return;
        const prev = JSON.parse(JSON.stringify(data));
        const wasPending = item.state === 'pending';
        item.state = wasPending ? 'none' : 'pending';
        item.checkedAt = wasPending ? '' : new Date().toTimeString().slice(0, 5);
        if (item.kind === '기본') data.corePending += wasPending ? -1 : 1;
        pendingIds.add(id);
        busy = true;
        draw();
        toast(wasPending ? '체크를 취소했어요' : '잘했어요! 엄마가 확인하면 포인트와 도장이 들어가요');
        try {
          const fresh = await call('missions.toggle', id);
          pendingIds.delete(id);
          if (!pendingIds.size) { data = fresh; draw(); }   // 여러 개를 빨리 눌렀으면 마지막 답으로 맞춰요
        } catch (err) {
          pendingIds.delete(id);
          if (!pendingIds.size) { data = prev; draw(); }
          fail(err);
        }
        busy = pendingIds.size > 0;
        return;
      }
      const m = e.target.closest('[data-ym]');
      if (m) {
        const base = parseDay((month ? month.ym : data.date.slice(0, 7)) + '-01');
        base.setMonth(base.getMonth() + Number(m.dataset.ym));
        ym = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
        month = null; drawMonth();
      }
    });

    // 확인 소식(cheer)은 화면을 연 동안 계속 보여줘요
    const load = () => call('missions.today').then((d) => { if (busy) return; data = d; if (d.celebrate.length) cheer = cheer.concat(d.celebrate); draw(); });
    // 지난번에 본 화면이 있으면 먼저 보여주고, 새 내용을 받아 바꿔요
    const last = peek('missions.today');
    if (last) { data = { ...last, celebrate: [] }; draw(); }
    load().catch(fail);
    const kidId = state.me.id;
    return { onSync: () => { if (!busy && state.me && state.me.id === kidId) { month = null; load().catch(() => {}); } } };
  },
};
