// 미션 확인 (엄마·아빠 화면): 오늘 확인, 이번 주, 미션 설정, 칭찬모아 지급
import { call, peek } from '../api.js';
import { state, emit, personById } from '../state.js';
import { esc, avatar, modal, armed, toast, fail, dayKey, addDays, koDate } from '../ui.js';
import { icon } from '../icons.js';
import { KIND_LABEL } from './missions.js';
import { boardHtml, wishForm } from './stamps.js';

const DAYS = ['', '월', '화', '수', '목', '금', '토', '일'];

export default {
  id: 'approve', label: '미션 확인', icon: 'approve', needsPerson: true,
  visible: (s) => !!s.me && s.me.role === '부모',
  badge: (s) => s.missionPending || 0,
  mount(root) {
    let tab = 'check', parent = null, week = null, weekOffset = 0, defs = null, pays = null, stampsD = null;

    root.innerHTML = `<div class="seg" role="tablist" id="tabs">
        <button role="tab" data-tab="check">확인</button><button role="tab" data-tab="stamps">도장판<span class="badge" id="wishBadge" hidden></span></button>
        <button role="tab" data-tab="week">이번 주</button>
        <button role="tab" data-tab="defs">설정</button><button role="tab" data-tab="pay">칭찬모아</button></div>
      <div id="body" class="view-body"><div class="sub">불러오는 중…</div></div>`;
    const body = root.querySelector('#body');

    const setParent = (p) => {
      parent = p;
      state.missionPending = p.kids.reduce((n, k) => n + k.pending, 0) + (p.wishPending || 0);
      const wb = root.querySelector('#wishBadge');
      if (wb) { wb.hidden = !p.wishPending; wb.textContent = p.wishPending || ''; }
      emit('top');
    };

    function draw() {
      root.querySelectorAll('[data-tab]').forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab); });
      if (tab === 'check') return parent ? drawCheck() : load();
      if (tab === 'week') return week ? drawWeek() : loadWeek();
      if (tab === 'defs') return defs ? drawDefs() : loadDefs();
      if (tab === 'stamps') return loadStamps();
      return pays ? drawPay() : loadPay();
    }
    const loadStamps = () => { if (!stampsD) stampsD = peek('stamps.parent'); if (stampsD) drawStamps(); else loading(); return call('stamps.parent').then((d) => { stampsD = d; if (tab === 'stamps') drawStamps(); }).catch(fail); };
    // 도장판 탭에서 무언가 바꾸면: 화면 다시 그리고, 확인 대기 수도 새로
    const afterStamps = (d, msg) => { stampsD = d; drawStamps(); if (msg) toast(msg); call('missions.parent').then(setParent).catch(() => {}); };

    /* ---------- 도장판 ---------- */
    function drawStamps() {
      const d = stampsD;
      const ST = { '대기': '도장 개수를 정해 주세요', '확인': '', '요청': '사 달래요! 🎁', '받음': '' };
      body.innerHTML = d.kids.map((k) => {
        const goal = k.wishes.find((w) => w.goal);
        return `<section class="panel">
          <div class="head"><div class="row">${avatar(personById(k.kidId), 36)}<h2>${esc(k.name)}</h2>
              <span class="chip">★ ${k.balance}개${k.available < k.balance ? ` (쓸 수 있는 ${k.available})` : ''}</span></div>
            <div class="row"><button class="small nowrap" data-wadd="${esc(k.kidId)}">${icon('plus', 14)} 대신 적기</button>
              <button class="small ghost nowrap" data-sadj="${esc(k.kidId)}">도장 더하기·빼기</button></div></div>
          ${goal && goal.status !== '대기' && goal.stamps ? `<p class="sub">🎯 목표 <b>${esc(goal.title)}</b> ${Math.min(k.available + (goal.status === '요청' ? goal.stamps : 0), goal.stamps)} / ${goal.stamps}</p>${boardHtml(k.available + (goal.status === '요청' ? goal.stamps : 0), goal.stamps)}` : ''}
          <div class="list">${k.wishes.length ? k.wishes.map((w) => `<div class="item wish${w.status === '대기' || w.status === '요청' ? ' needs' : ''}">
              <div class="grow"><b>${w.goal ? '🎯 ' : ''}${esc(w.title)}</b>
                <br><span class="sub">${w.price ? `${w.price.toLocaleString()}원 · ` : ''}${w.status === '대기' ? `예상 도장 ${w.stamps || '?'}개` : `도장 ${w.stamps}개`}${w.note ? ' · ' + esc(w.note) : ''}</span>
                ${ST[w.status] ? `<br><span class="btag${w.status === '요청' ? '' : ' warn'}">${ST[w.status]}</span>` : ''}
                ${w.link ? ` <a class="sub" href="${esc(w.link)}" target="_blank" rel="noopener">링크 ↗</a>` : ''}</div>
              ${w.status === '대기' ? `<button class="primary small" data-wset="${esc(w.id)}">개수 정하기</button>` : ''}
              ${w.status === '요청' || (w.status === '확인' && k.available >= w.stamps) ? `<button class="primary small" data-wdone="${esc(w.id)}">사 줬어요</button>` : ''}
              ${w.status === '요청' ? `<button class="small ghost" data-wcancel="${esc(w.id)}">요청 취소</button>` : `<button class="small ghost" data-wedit="${esc(w.id)}">고치기</button>`}
            </div>`).join('') : '<div class="empty">아직 적은 게 없어요.</div>'}</div>
          ${k.log.length ? `<details class="guide"><summary>도장 기록</summary><div class="list">${k.log.map((l) => `<div class="item"><span class="sub num">${esc(l.at.slice(5, 16))}</span>
              <span class="grow">${esc(l.reason)}</span><b class="num">${l.delta > 0 ? '+' : ''}${l.delta}</b></div>`).join('')}</div></details>` : ''}
        </section>`;
      }).join('') + `<section class="panel"><div class="head"><h2>도장 규칙</h2></div>
          <ul class="rules"><li>엄마·아빠가 확인한 미션 1개 = 도장 1개 (${esc(d.start.slice(5).replace('-', '/'))}부터)</li>
            <li>"놀기 전에 끝냈어요" 같은 보너스는 그날 기본 미션을 다 했을 때만</li>
            <li>아이가 갖고 싶은 것을 적으면 도장 개수를 정해 주세요. 도장을 다 모으면 아이가 "사 주세요"를 눌러요</li></ul>
          <form class="inline" id="rateForm"><label for="rateIn" class="nowrap">도장 1개 =</label><input id="rateIn" inputmode="numeric" value="${d.rate}" style="width:7em"><span>원</span><button class="small">저장</button></form>
          <p class="sub">도장 1개 값은 새로 적는 것의 도장 개수를 짐작할 때만 써요. 이미 정한 개수는 그대로예요.</p></section>`;
    }

    function stampAdjust(kidId) {
      const kid = personById(kidId);
      const md = modal(`${kid ? kid.name : ''} 도장 더하기·빼기`, `<form class="stack" id="adjForm">
        <label for="adjN">몇 개? <span class="sub">(빼려면 -3처럼)</span></label><input id="adjN" inputmode="numeric" required placeholder="예: 2 또는 -1">
        <label for="adjR">이유</label><input id="adjR" maxlength="40" placeholder="예: 동생을 잘 도와줘서">
        <button class="primary">저장</button></form>`);
      md.el.querySelector('#adjForm').onsubmit = async (e) => {
        e.preventDefault();
        try { const d = await call('stamps.adjust', kidId, Number(md.el.querySelector('#adjN').value), md.el.querySelector('#adjR').value); md.close(); afterStamps(d, '저장했어요'); } catch (err) { fail(err); }
      };
    }
    const findWish = (id) => stampsD.kids.flatMap((k) => k.wishes).find((w) => w.id === id);
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
      state.missionPending = parent.kids.reduce((n, k) => n + k.pending, 0) + (parent.wishPending || 0);
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
        ${defs.payoutUrl ? `<div class="stack"><span class="label">칭찬모아 자동 지급 스크립트(Firefox)에 넣을 주소</span>
          <div class="copy"><input readonly id="payUrl" value="${esc(defs.payoutUrl)}" aria-label="지급 주소"><button type="button" id="copyUrl">복사</button></div>
          <p class="sub">예전 미션 앱 주소 대신 이 주소를 넣으면 새 보드의 포인트로 지급돼요. 비밀번호가 들어 있으니 다른 사람에게 보내지 마세요.</p></div>` : ''}
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
      body.innerHTML = `<section class="panel"><div class="head"><h2>미지급 포인트</h2></div>
          <p class="sub">아이가 받았지만 아직 칭찬모아에 넣어 주지 않은 포인트예요. 칭찬모아에서 포인트를 준 뒤 "줬어요"를 누르면 여기서 빠져요. Firefox 자동 지급 스크립트를 쓰면 저절로 기록돼요.</p>
          <div class="list">${pays.kids.map((k) => `<div class="item">${avatar(personById(k.kidId), 36)}
            <div class="grow"><b>${esc(k.name)}</b><br><span class="sub">${esc(k.memo)}</span></div>
            <b class="num big-num">${k.unpaid.toLocaleString()}</b>
            ${k.unpaid ? `<button class="primary small" data-paid="${esc(k.kidId)}" data-amount="${k.unpaid}" data-memo="${esc(k.memo)}">줬어요</button>` : ''}</div>`).join('')}</div></section>
        <section class="panel"><div class="head"><h2>지급 기록</h2></div>
          <div class="list">${pays.history.length ? pays.history.map((h) => `<div class="item"><span class="sub num">${esc(h.at.slice(5, 16))}</span>
            <span class="grow">${esc(personById(h.kidId)?.name || h.kidId)} · ${esc(h.memo)}</span><b class="num">${h.amount.toLocaleString()}</b></div>`).join('') : '<div class="empty">아직 지급 기록이 없어요.</div>'}</div></section>`;
    }

    /* ---------- 클릭 ---------- */
    root.querySelector('#tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; draw(); } };
    body.addEventListener('click', async (e) => {
      const t = e.target;
      // 도장판 탭
      const wa = t.closest('[data-wadd]'); if (wa) return wishForm({ kidId: wa.dataset.wadd, rate: stampsD.rate, parent: true, onSaved: (d) => afterStamps(d) });
      const ws = t.closest('[data-wset],[data-wedit]');
      if (ws) { const w = findWish(ws.dataset.wset || ws.dataset.wedit); return wishForm({ wish: w, kidId: w.kidId, rate: stampsD.rate, parent: true, onSaved: (d) => afterStamps(d) }); }
      const wd = t.closest('[data-wdone]');
      if (wd) {
        const w = findWish(wd.dataset.wdone);
        if (!armed(wd, `도장 ${w.stamps}개 빼요. 사 줬어요?`)) return;
        try { afterStamps(await call('wish.done', w.id), '도장을 뺐어요. 선물 고마워요! 🎁'); } catch (err) { fail(err); }
        return;
      }
      const wc = t.closest('[data-wcancel]');
      if (wc) { if (!armed(wc, '요청을 취소할까요?')) return; try { afterStamps(await call('wish.cancel', wc.dataset.wcancel), '취소했어요'); } catch (err) { fail(err); } return; }
      const sa = t.closest('[data-sadj]'); if (sa) return stampAdjust(sa.dataset.sadj);
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
      const wk = t.closest('[data-wk]');
      if (wk) { weekOffset = wk.dataset.wk === '0' ? 0 : weekOffset + Number(wk.dataset.wk); loadWeek(); return; }
      const nd = t.closest('[data-newdef]'); if (nd) return defModal({ kidId: nd.dataset.newdef, dows: [1, 2, 3, 4, 5] });
      const ed = t.closest('[data-def]'); if (ed) return defModal(defs.defs.find((x) => x.id === ed.dataset.def));
      if (t.closest('#copyUrl')) {
        const inp = root.querySelector('#payUrl');
        try { await navigator.clipboard.writeText(inp.value); toast('복사했어요'); } catch (err) { inp.select(); toast('주소를 길게 눌러 복사해 주세요'); }
        return;
      }
      const pd = t.closest('[data-paid]');
      if (pd) {
        if (!armed(pd, `${Number(pd.dataset.amount).toLocaleString()} 줬어요?`)) return;
        try { pays = await call('missions.paid', pd.dataset.paid, Number(pd.dataset.amount), pd.dataset.memo); parent = null; drawPay(); toast('지급 기록을 남겼어요'); } catch (err) { fail(err); }
      }
    });
    body.addEventListener('submit', async (e) => {
      if (e.target.id === 'rateForm') {
        e.preventDefault();
        try { afterStamps(await call('stamps.setRate', Number(body.querySelector('#rateIn').value)), '저장했어요'); } catch (err) { fail(err); }
        return;
      }
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
      if (tab === 'stamps' && !document.querySelector('.modal-bg') && !root.querySelector('[data-armed="1"]')) call('stamps.parent').then((d) => { stampsD = d; if (tab === 'stamps') drawStamps(); }).catch(() => {});
      if (tab === 'check' && !saving) call('missions.parent').then((p) => { if (saving) return; setParent(p); if (tab === 'check' && !root.querySelector('[data-armed="1"]')) drawCheck(); }).catch(() => {}); } };
  },
};
