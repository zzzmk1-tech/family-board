// 미션 확인 (엄마·아빠 화면): 오늘 확인, 이번 주, 칭찬모아 지급, 미션 설정
// (도장판은 별도 메뉴예요: views/stamps.js)
import { call, peek } from '../api.js';
import { state, emit, personById } from '../state.js';
import { esc, avatar, modal, armed, toast, fail, dayKey, addDays, koDate } from '../ui.js';
import { icon } from '../icons.js';
import { KIND_LABEL } from './missions.js';

const DAYS = ['', '월', '화', '수', '목', '금', '토', '일'];

// 칭찬모아 지급 스크립트는 Firefox에만 있어요. 안드로이드 휴대폰에서는 기본 브라우저가 무엇이든
// "칭찬모아 열기"를 Firefox로 열어요 (Firefox가 없으면 원래 브라우저로 열려요). PC는 그대로예요.
export function chingchanLink(url, ua) {
  if (!/Android/i.test(ua ?? navigator.userAgent)) return { href: url, blank: true };
  const u = new URL(url);
  u.searchParams.set('familyboard', '1');   // 주소 끝 #표시가 빠져도 스크립트가 알아보게
  return {
    href: 'intent://' + u.host + u.pathname + u.search + u.hash +
      '#Intent;scheme=https;package=org.mozilla.firefox;S.browser_fallback_url=' + encodeURIComponent(url) + ';end',
    blank: false,
  };
}

export default {
  id: 'approve', label: '미션 확인', icon: 'approve', needsPerson: true,
  visible: (s) => !!s.me && s.me.role === '부모',
  badge: (s) => s.missionPending || 0,
  mount(root) {
    let tab = 'check', parent = null, week = null, weekOffset = 0, defs = null, pays = null;

    root.innerHTML = `<div class="seg" role="tablist" id="tabs">
        <button role="tab" data-tab="check">확인</button><button role="tab" data-tab="week">이번 주</button>
        <button role="tab" data-tab="pay">칭찬모아</button><button role="tab" data-tab="defs">설정</button></div>
      <div id="body" class="view-body"><div class="sub">불러오는 중…</div></div>`;
    const body = root.querySelector('#body');

    const setParent = (p) => {
      parent = p;
      state.missionPending = p.kids.reduce((n, k) => n + k.pending, 0);
      emit('top');
    };

    function draw() {
      root.querySelectorAll('[data-tab]').forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab); });
      if (tab === 'check') return parent ? drawCheck() : load();
      if (tab === 'week') return week ? drawWeek() : loadWeek();
      if (tab === 'defs') return defs ? drawDefs() : loadDefs();
      return pays ? drawPay() : loadPay();
    }
    const loading = () => { body.innerHTML = '<div class="sub">불러오는 중…</div>'; };
    // 지난번에 본 화면이 있으면 먼저 보여주고 새 내용을 받아 바꿔요
    const load = () => {
      const c = peek('missions.parent');
      if (c && !parent) { setParent(c); drawCheck(); } else loading();
      return call('missions.parent').then((p) => { if (saving) return; setParent(p); if (tab === 'check') drawCheck(); }).catch(fail);
    };
    const loadWeek = () => { loading(); return call('missions.week', weekOffset).then((w) => { week = w; if (tab === 'week') drawWeek(); }).catch(fail); };
    const loadDefs = () => { loading(); return call('missions.defs').then((d) => { defs = d; if (tab === 'defs') drawDefs(); }).catch(fail); };
    const loadPay = () => { loading(); return call('missions.payouts').then((p) => { pays = p; if (tab === 'pay') drawPay(); }).catch(fail); };

    /* ---------- 확인 ---------- */
    function drawCheck() {
      body.innerHTML = parent.kids.map((k) => `<section class="panel">
        <div class="head"><div class="row">${avatar(personById(k.kidId), 36)}<h2>${esc(k.name)}</h2>
            ${k.pending ? `<span class="chip warnchip">확인 대기 ${k.pending}</span>` : ''}</div>
          <div class="row">${k.pending ? `<button class="primary small" data-allok="${esc(k.kidId)}">모두 확인</button>` : ''}
            <button class="small nowrap" data-past="${esc(k.kidId)}">${icon('plus', 14)} 지난 미션 넣기</button></div></div>
        <div class="stats">
          <div class="stat"><span class="sub">오늘</span><b class="num">+${k.todayPoints.toLocaleString()}</b></div>
          <div class="stat"><span class="sub">이번 달</span><b class="num">${k.monthPoints.toLocaleString()}</b></div>
          <div class="stat"><span class="sub">미지급 포인트</span><b class="num">${k.unpaid.toLocaleString()}</b></div>
        </div>
        <div class="missions">${k.items.length ? k.items.map((m) => rowHtml(k.kidId, parent.date, m)).join('') : '<div class="empty">오늘은 미션이 없어요.</div>'}</div>
        ${k.past.length ? `<h3>지난 날 확인 안 한 미션</h3><div class="missions">${k.past.map((m) => rowHtml(k.kidId, m.date, { ...m, state: 'pending', kind: '' }, m.dateLabel)).join('')}</div>` : ''}
        ${(k.special || []).length ? `<h3>🏆 특별 미션 <span class="sub">(최근 30일)</span></h3><div class="list">${k.special.map((s) => `<div class="item">
            <div class="grow"><b>${esc(s.title)}</b><br><span class="sub">${esc(s.dateLabel)}${s.points ? ` · +${s.points.toLocaleString()}` : ''}${s.stamps ? ` · 도장 ${s.stamps}개` : ''}</span></div>
            ${s.paid ? '<span class="sub">지급됨</span>' : `<button class="small ghost" data-spdel="${esc(s.id)}">지우기</button>`}</div>`).join('')}</div>` : ''}
        <button class="add-btn" data-special="${esc(k.kidId)}">🏆 특별 미션 넣기</button>
      </section>`).join('') || '<div class="empty">아이로 등록된 가족이 없어요. 설정에서 가족을 추가해 주세요.</div>';
    }

    function rowHtml(kidId, date, m, dateLabel) {
      const a = (action, label, cls = '') => `<button class="small ${cls}" data-act="${action}" data-kid="${esc(kidId)}" data-date="${esc(date)}" data-mid="${esc(m.id)}">${label}</button>`;
      let right = '', status = '';
      if (m.state === 'pending') { status = `<span class="st wait">확인 대기${m.checkedAt ? ' · ' + esc(m.checkedAt) : ''}</span>`; right = a('approve', '확인', 'primary') + a('reject', '취소', 'ghost'); }
      else if (m.state === 'approved') { status = `<span class="st ok">${m.byParent ? '엄마가 넣음' : '확인됨'}</span>`; right = m.paid ? '<span class="sub">지급됨</span>' : a('unapprove', '확인 취소', 'ghost'); }
      else if (m.state === 'other') { status = `<span class="st">${esc(m.otherDay)}요일에 함</span>`; }
      else { status = '<span class="st">아직 안 함</span>'; right = a('add', '대신 넣기', 'ghost'); }
      return `<div class="mitem ${m.state} parent">
        <div class="grow"><div class="mtitle">${dateLabel ? `<span class="sub">${esc(dateLabel)}</span> ` : ''}${esc(m.title)}${KIND_LABEL[m.kind] ? ` <span class="kind">${KIND_LABEL[m.kind]}</span>` : ''}</div>
          <div class="sub">${status} · +${m.points}</div></div>
        <div class="row">${right}</div></div>`;
    }

    async function act(kidId, date, mid, action) {
      const p = await call('missions.act', kidId, date, mid, action);
      setParent(p);
      return p;
    }

    /** 확인 화면에서 바로 바꾸기 (저장은 뒤에서). list: [[kidId, date, mid, action], ...] */
    let saving = 0;
    function applyLocal(list) {
      list.forEach(([kidId, date, mid, action]) => {
        const k = parent.kids.find((x) => x.kidId === kidId);
        if (!k) return;
        if (date === parent.date) {
          const m = k.items.find((x) => x.id === mid);
          if (!m) return;
          if (action === 'approve' || action === 'add') { if (m.state === 'pending') k.pending--; m.state = 'approved'; m.byParent = action === 'add' || m.byParent; }
          else if (action === 'reject') { if (m.state === 'pending') k.pending--; m.state = 'none'; }
          else if (action === 'unapprove') { m.state = 'pending'; k.pending++; }
        } else if (action === 'approve' || action === 'reject') {
          const before = k.past.length;
          k.past = k.past.filter((x) => !(x.date === date && x.id === mid));
          k.pending -= before - k.past.length;
        }
      });
      state.missionPending = parent.kids.reduce((n, k) => n + k.pending, 0);   // 도장판 할 일은 도장판 메뉴 숫자에 따로
      emit('top');
    }
    async function actFast(list, msg) {
      const prev = JSON.parse(JSON.stringify(parent));
      applyLocal(list);
      saving++;
      drawCheck();
      if (msg) toast(msg);
      try {
        const p = list.length === 1 ? await call('missions.act', ...list[0]) : await call('missions.actMany', list);
        saving--;
        week = null;
        if (!saving) { setParent(p); if (tab === 'check') drawCheck(); }
      } catch (err) {
        saving--;
        if (!saving) { setParent(prev); if (tab === 'check') drawCheck(); }
        fail(err);
      }
    }

    /** 지난 미션 넣기: 지난 7일 중 날짜를 골라 그날 미션을 넣어요 (넣으면 바로 확인됨) */
    function pastModal(kidId) {
      const kid = personById(kidId);
      const today = dayKey();
      const dates = Array.from({ length: 8 }, (_, i) => addDays(today, -i));
      let date = addDays(today, -1);
      const md = modal(`${kid ? kid.name : ''} 지난 미션 넣기`, `<div class="stack">
        <p class="sub">체크를 못 하고 지나간 날의 미션을 넣어요. 넣으면 바로 확인된 걸로 들어가요.</p>
        <div class="chips" id="pd">${dates.map((d) => `<button data-d="${d}" class="${d === date ? 'on' : ''}">${d === today ? '오늘' : esc(koDate(d))}</button>`).join('')}</div>
        <div class="missions" id="pl"><div class="sub">불러오는 중…</div></div></div>`, { wide: true });
      const list = md.el.querySelector('#pl');
      const show = async () => {
        list.innerHTML = '<div class="sub">불러오는 중…</div>';
        try {
          const r = await call('missions.day', kidId, date);
          list.innerHTML = r.items.length ? r.items.map((m) => rowHtml(kidId, date, m)).join('') : '<div class="empty">그날은 미션이 없어요.</div>';
        } catch (e) { fail(e); }
      };
      md.el.querySelector('#pd').onclick = (e) => {
        const b = e.target.closest('[data-d]'); if (!b) return;
        date = b.dataset.d;
        md.el.querySelectorAll('[data-d]').forEach((x) => x.classList.toggle('on', x === b));
        show();
      };
      list.onclick = async (e) => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        if (b.dataset.act === 'reject' && !armed(b, '정말 지울까요?')) return;
        b.disabled = true;
        try { await act(b.dataset.kid, b.dataset.date, b.dataset.mid, b.dataset.act); await show(); if (tab === 'check') drawCheck(); } catch (err) { fail(err); b.disabled = false; }
      };
      show();
    }

    /** 특별 미션 넣기: 매일 미션과 상관없이 큰 일을 해냈을 때 (문제집 한 권 끝 등). 넣으면 바로 포인트·도장 */
    function specialModal(kidId) {
      const kid = personById(kidId);
      const today = dayKey();
      const dates = Array.from({ length: 8 }, (_, i) => addDays(today, -i));
      let date = today;
      const md = modal(`${kid ? kid.name : ''} 특별 미션 넣기`, `<form class="stack" id="spForm">
        <p class="sub">매일 미션과 상관없이 큰 일을 해냈을 때 넣어 주세요. 넣으면 바로 포인트와 도장이 들어가고 아이에게 알림이 가요.</p>
        <label for="spTitle">무엇을 해냈나요?</label><input id="spTitle" maxlength="40" required placeholder="예: 연산 문제집 한 권 끝!">
        <div class="grid2">
          <label>포인트<input type="number" id="spPts" min="0" step="10" inputmode="numeric" placeholder="예: 500"></label>
          <label>도장<input type="number" id="spSt" min="0" max="100" inputmode="numeric" value="5"></label>
        </div>
        <span class="label">언제 해냈나요?</span>
        <div class="chips" id="spD">${dates.map((d) => `<button type="button" data-d="${d}" class="${d === date ? 'on' : ''}">${d === today ? '오늘' : esc(koDate(d))}</button>`).join('')}</div>
        <button class="primary">넣기</button></form>`);
      const f = md.el;
      f.querySelector('#spD').onclick = (e) => {
        const b = e.target.closest('[data-d]'); if (!b) return;
        date = b.dataset.d;
        f.querySelectorAll('#spD [data-d]').forEach((x) => x.classList.toggle('on', x === b));
      };
      f.querySelector('#spForm').onsubmit = async (e) => {
        e.preventDefault();
        const btn = f.querySelector('#spForm .primary');
        btn.disabled = true;
        try {
          const p = await call('missions.special', kidId, date, f.querySelector('#spTitle').value, Number(f.querySelector('#spPts').value) || 0, Number(f.querySelector('#spSt').value) || 0);
          setParent(p); week = null; md.close();
          if (tab === 'check') drawCheck();
          toast('특별 미션을 넣었어요! 🏆');
        } catch (err) { fail(err); btn.disabled = false; }
      };
    }

    /* ---------- 이번 주 ---------- */
    function drawWeek() {
      body.innerHTML = `<section class="panel"><div class="head"><h2>${esc(week.range)}</h2>
          <div class="row"><button class="small" data-wk="-1" aria-label="지난주">${icon('back', 16)}</button>
          <button class="small" data-wk="0">이번 주</button>
          <button class="small" data-wk="1" aria-label="다음 주" style="transform:scaleX(-1)" ${weekOffset >= 0 ? 'disabled' : ''}>${icon('back', 16)}</button></div></div>
        ${week.kids.map((k) => `<div class="wk">
          <div class="row"><b>${esc(k.name)}</b><span class="sub">기본 미션 다 한 날 ${k.doneDays}/${k.coreDays} · 이번 주 +${k.total.toLocaleString()}</span></div>
          <div class="wkgrid">${k.days.map((d) => `<div class="wkday${d.today ? ' today' : ''}${d.future ? ' future' : ''}${d.allCore ? ' all' : ''}">
              <span class="sub">${esc(d.day)}</span>
              <span class="dots">${d.items.map((x) => `<i class="mdot ${x.state}" title="${esc(x.title)}"></i>`).join('')}</span>
              <b class="num">${d.points ? '+' + d.points : (d.future ? '' : '-')}</b></div>`).join('')}</div></div>`).join('')}
        <p class="sub"><i class="mdot approved"></i> 확인됨 <i class="mdot pending"></i> 확인 대기 <i class="mdot none"></i> 안 함 · 파란 칸은 기본 미션을 모두 한 날</p></section>`;
    }

    /* ---------- 미션 설정 ---------- */
    function drawDefs() {
      const kids = defs.kids;
      body.innerHTML = kids.map((k) => {
        const mine = defs.defs.filter((d) => d.kidId === k.id);
        return `<section class="panel"><div class="head"><h2>${esc(k.name)} 미션</h2><button class="primary small" data-newdef="${esc(k.id)}">${icon('plus', 14)} 미션 추가</button></div>
          <div class="list">${mine.length ? mine.map((d) => `<div class="item${d.active ? '' : ' off'}">
            <div class="grow"><b>${esc(d.title)}</b>${KIND_LABEL[d.kind] ? ` <span class="kind">${KIND_LABEL[d.kind]}</span>` : ''}${d.active ? '' : ' <span class="kind">쉬는 중</span>'}<br>
              <span class="sub">${d.dows.map((w) => DAYS[w]).join('·')} · +${d.points}${d.detail ? ' · ' + esc(d.detail) : ''}</span></div>
            <button class="small" data-def="${esc(d.id)}">고치기</button></div>`).join('') : '<div class="empty">미션이 없어요.</div>'}</div></section>`;
      }).join('') + `<section class="panel"><div class="head"><h2>보너스와 칭찬모아</h2></div>
        <form class="stack" id="msForm">
          <div class="grid2">
            <label>하루 완료 보너스 <span class="sub">(그날 기본 미션을 모두 하면)</span><input type="number" min="0" step="10" id="dayBonus" value="${defs.dayBonus}"></label>
            <label>주간 보너스 <span class="sub">(한 주를 모두 하면)</span><input type="number" min="0" step="10" id="weekBonus" value="${defs.weekBonus}"></label>
          </div>
          ${kids.map((k) => `<div class="grid2"><label>${esc(k.name)} 칭찬모아 이름<input data-cmname="${esc(k.id)}" value="${esc(k.cmName)}" maxlength="20"></label>
            <label>학급<input data-cmclass="${esc(k.id)}" value="${esc(k.cmClass)}" maxlength="20" placeholder="예: 초3"></label></div>`).join('')}
          <div class="row end"><button class="primary">저장</button></div></form>
        <p class="sub">칭찬모아 Firefox 자동 지급과 엄마 비밀번호는 <b>칭찬모아</b> 탭에 있어요.</p>
      </section>`;
    }

    function defModal(d) {
      const isNew = !d.id;
      const md = modal(isNew ? '미션 추가' : '미션 고치기', `<form class="stack" id="dForm">
        <label>아이<select id="dKid">${defs.kids.map((k) => `<option value="${esc(k.id)}" ${k.id === d.kidId ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</select></label>
        <label>미션 이름<input id="dTitle" maxlength="60" required value="${esc(d.title || '')}" placeholder="예: 미션 1 · 연산 문제집 1장"></label>
        <label>설명 <span class="sub">(선택)</span><input id="dDetail" maxlength="200" value="${esc(d.detail || '')}" placeholder="예: 타이머 켜고 시작!"></label>
        <span class="label">요일</span>
        <div class="chips" id="dDows">${[1, 2, 3, 4, 5, 6, 7].map((w) => `<label class="chk"><input type="checkbox" value="${w}" ${(d.dows || []).includes(w) ? 'checked' : ''}>${DAYS[w]}</label>`).join('')}</div>
        <div class="grid2">
          <label>포인트<input type="number" id="dPts" min="0" step="5" value="${d.points ?? 60}"></label>
          <label>종류<select id="dKind">${defs.kinds.map((k) => `<option ${k === (d.kind || '기본') ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        </div>
        <p class="sub">기본: 꼭 할 미션 · 보너스: 하면 더 받음 · 완료보너스: 기본을 다 한 날만 · 주말: 토·일 중 하루</p>
        <label class="chk"><input type="checkbox" id="dActive" ${d.active === false ? '' : 'checked'}> 사용 (끄면 목록에서 잠깐 쉬어요)</label>
        <div class="row end">${isNew ? '' : '<button type="button" class="danger" id="dDel">지우기</button>'}<button class="primary">저장</button></div></form>`);
      const f = md.el;
      f.querySelector('#dForm').onsubmit = async (e) => {
        e.preventDefault();
        try {
          defs = await call('missions.saveDef', {
            id: d.id, kidId: f.querySelector('#dKid').value, title: f.querySelector('#dTitle').value, detail: f.querySelector('#dDetail').value,
            dows: [...f.querySelectorAll('#dDows input:checked')].map((x) => Number(x.value)), points: Number(f.querySelector('#dPts').value),
            kind: f.querySelector('#dKind').value, active: f.querySelector('#dActive').checked, order: d.order,
          });
          parent = null; week = null; md.close(); drawDefs(); toast('저장했어요');
        } catch (err) { fail(err); }
      };
      const del = f.querySelector('#dDel');
      if (del) del.onclick = async () => {
        if (!armed(del, '정말 지울까요? 지난 기록은 남아요')) return;
        try { defs = await call('missions.removeDef', d.id); parent = null; week = null; md.close(); drawDefs(); toast('지웠어요'); } catch (err) { fail(err); }
      };
    }

    /* ---------- 칭찬모아 ---------- */
    function drawPay() {
      const cm = chingchanLink(pays.openUrl);
      body.innerHTML = `<section class="panel"><div class="head"><h2>미지급 포인트</h2>
            <a class="button primary small nowrap" href="${esc(cm.href)}"${cm.blank ? ' target="_blank" rel="noopener"' : ''}>칭찬모아 열기 ↗</a></div>
          <p class="sub">아이가 받았지만 아직 칭찬모아에 넣어 주지 않은 포인트예요. 칭찬모아에서 포인트를 준 뒤 "줬어요"를 누르면 여기서 빠져요.
            Firefox 자동 지급 스크립트를 쓰면 저절로 기록돼요.</p>
          <div class="list">${pays.kids.map((k) => `<div class="item">${avatar(personById(k.kidId), 36)}
            <div class="grow"><b>${esc(k.name)}</b><br><span class="sub">${esc(k.memo)}</span></div>
            <b class="num big-num">${k.unpaid.toLocaleString()}</b>
            ${k.unpaid ? `<button class="primary small" data-paid="${esc(k.kidId)}" data-amount="${k.unpaid}" data-memo="${esc(k.memo)}">줬어요</button>` : ''}</div>`).join('')}</div></section>
        <section class="panel"><div class="head"><h2>지급 기록</h2></div>
          <div class="list">${pays.history.length ? pays.history.map((h) => `<div class="item"><span class="sub num">${esc(h.at.slice(5, 16))}</span>
            <span class="grow">${esc(personById(h.kidId)?.name || h.kidId)} · ${esc(h.memo)}${/^자동/.test(h.by) ? ' <span class="btag">자동</span>' : ''}</span><b class="num">${h.amount.toLocaleString()}</b></div>`).join('') : '<div class="empty">아직 지급 기록이 없어요.</div>'}</div></section>
        <section class="panel"><div class="head"><h2>Firefox 자동 지급</h2></div>
          <ol class="rules">
            <li>안드로이드 휴대폰에서는 위의 <b>칭찬모아 열기</b>를 누르면 기본 브라우저와 상관없이 <b>Firefox</b>로 열려요. (PC는 가족 보드를 Firefox로 열어 두면 같은 Firefox에서 열려요)</li>
            <li>칭찬모아에 로그인하면 스크립트가 <b>포인트 지급하기</b> 화면으로 데려가요. (칭찬모아 주소의 버전 번호가 바뀌어도 메뉴를 찾아가요)</li>
            <li>화면 왼쪽 아래 <b>미션 포인트 가져오기</b>를 누르면 아이별로 지급하고 여기에 기록해요.</li>
            <li>처음 한 번(또는 가족 보드로 바꾼 뒤 처음) <b>엄마 비밀번호</b>를 물어봐요. 아래 값을 붙여 넣어 주세요.</li></ol>
          <span class="label">엄마 비밀번호 <span class="sub">(다른 사람에게 알려 주지 마세요)</span></span>
          <div class="copy"><input readonly id="payKey" value="${esc(pays.payoutKey)}" aria-label="엄마 비밀번호"><button type="button" data-copy="payKey">복사</button></div>
          <p class="sub">스크립트가 아직 없으면 Firefox에 Tampermonkey(또는 Violentmonkey)를 설치하고
            <a href="${esc(pays.scriptUrl)}" target="_blank" rel="noopener">칭찬모아 미션 포인트 지급 스크립트</a>를 열어 설치해 주세요. 새 버전이 나오면 저절로 업데이트돼요.</p></section>`;
    }

    /* ---------- 클릭 ---------- */
    root.querySelector('#tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; draw(); } };
    body.addEventListener('click', async (e) => {
      const t = e.target;
      const ab = t.closest('[data-act]');
      if (ab) {
        if (ab.dataset.act === 'reject' && !armed(ab, '정말 취소할까요?')) return;
        if (ab.dataset.act === 'unapprove' && !armed(ab, '확인을 취소할까요?')) return;
        // 바로 화면에 반영하고, 저장은 뒤에서
        actFast([[ab.dataset.kid, ab.dataset.date, ab.dataset.mid, ab.dataset.act]]);
        return;
      }
      const all = t.closest('[data-allok]');
      if (all) {
        const k = parent.kids.find((x) => x.kidId === all.dataset.allok);
        const todo = k.items.filter((m) => m.state === 'pending').map((m) => [k.kidId, parent.date, m.id, 'approve'])
          .concat(k.past.map((m) => [k.kidId, m.date, m.id, 'approve']));
        if (todo.length) actFast(todo, `${todo.length}개를 확인했어요`);   // 한 번의 요청으로 모두
        return;
      }
      const past = t.closest('[data-past]'); if (past) return pastModal(past.dataset.past);
      const spn = t.closest('[data-special]'); if (spn) return specialModal(spn.dataset.special);
      const spd = t.closest('[data-spdel]');
      if (spd) {
        if (!armed(spd, '포인트·도장도 빠져요. 지울까요?')) return;
        spd.disabled = true;
        try { setParent(await call('missions.removeSpecial', spd.dataset.spdel)); week = null; drawCheck(); toast('지웠어요'); } catch (err) { fail(err); spd.disabled = false; }
        return;
      }
      const wk = t.closest('[data-wk]');
      if (wk) { weekOffset = wk.dataset.wk === '0' ? 0 : weekOffset + Number(wk.dataset.wk); loadWeek(); return; }
      const nd = t.closest('[data-newdef]'); if (nd) return defModal({ kidId: nd.dataset.newdef, dows: [1, 2, 3, 4, 5] });
      const ed = t.closest('[data-def]'); if (ed) return defModal(defs.defs.find((x) => x.id === ed.dataset.def));
      const cp = t.closest('[data-copy]');
      if (cp) {
        const inp = root.querySelector('#' + cp.dataset.copy);
        try { await navigator.clipboard.writeText(inp.value); toast('복사했어요'); } catch (err) { inp.select(); toast('길게 눌러 복사해 주세요'); }
        return;
      }
      const pd = t.closest('[data-paid]');
      if (pd) {
        if (!armed(pd, `${Number(pd.dataset.amount).toLocaleString()} 줬어요?`)) return;
        try { pays = await call('missions.paid', pd.dataset.paid, Number(pd.dataset.amount), pd.dataset.memo); parent = null; drawPay(); toast('지급 기록을 남겼어요'); } catch (err) { fail(err); }
      }
    });
    body.addEventListener('submit', async (e) => {
      if (e.target.id !== 'msForm') return;
      e.preventDefault();
      const f = e.target;
      try {
        defs = await call('missions.saveSettings', {
          dayBonus: Number(f.querySelector('#dayBonus').value), weekBonus: Number(f.querySelector('#weekBonus').value),
          cm: defs.kids.map((k) => ({ kidId: k.id, cmName: f.querySelector(`[data-cmname="${k.id}"]`).value, cmClass: f.querySelector(`[data-cmclass="${k.id}"]`).value })),
        });
        drawDefs(); toast('저장했어요');
      } catch (err) { fail(err); }
    });

    draw();
    return { onSync: () => {
      if (!state.me || state.me.role !== '부모') return;   // 공용 기기에서 아이로 바뀌는 중
      if (tab === 'check' && !saving) call('missions.parent').then((p) => { if (saving) return; setParent(p); if (tab === 'check' && !root.querySelector('[data-armed="1"]')) drawCheck(); }).catch(() => {}); } };
  },
};
