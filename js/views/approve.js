// 미션 확인 (엄마·아빠 화면): 오늘 확인, 이번 주, 미션 설정, 칭찬모아 지급
import { call } from '../api.js';
import { state, emit, personById } from '../state.js';
import { esc, avatar, modal, armed, toast, fail, dayKey, addDays, koDate } from '../ui.js';
import { icon } from '../icons.js';
import { KIND_LABEL } from './missions.js';

const DAYS = ['', '월', '화', '수', '목', '금', '토', '일'];

export default {
  id: 'approve', label: '미션 확인', icon: 'approve', needsPerson: true,
  visible: (s) => !!s.me && s.me.role === '부모',
  badge: (s) => s.missionPending || 0,
  mount(root) {
    let tab = 'check', parent = null, week = null, weekOffset = 0, defs = null, pays = null;

    root.innerHTML = `<div class="seg" role="tablist" id="tabs">
        <button role="tab" data-tab="check">확인</button><button role="tab" data-tab="week">이번 주</button>
        <button role="tab" data-tab="defs">미션 설정</button><button role="tab" data-tab="pay">칭찬모아</button></div>
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
    const load = () => { loading(); return call('missions.parent').then((p) => { setParent(p); if (tab === 'check') drawCheck(); }).catch(fail); };
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
      const ab = t.closest('[data-act]');
      if (ab) {
        if (ab.dataset.act === 'reject' && !armed(ab, '정말 취소할까요?')) return;
        if (ab.dataset.act === 'unapprove' && !armed(ab, '확인을 취소할까요?')) return;
        ab.disabled = true;
        try { await act(ab.dataset.kid, ab.dataset.date, ab.dataset.mid, ab.dataset.act); week = null; drawCheck(); } catch (err) { fail(err); ab.disabled = false; }
        return;
      }
      const all = t.closest('[data-allok]');
      if (all) {
        all.disabled = true;
        const k = parent.kids.find((x) => x.kidId === all.dataset.allok);
        const todo = k.items.filter((m) => m.state === 'pending').map((m) => [parent.date, m.id]).concat(k.past.map((m) => [m.date, m.id]));
        try { for (const [d, mid] of todo) await act(k.kidId, d, mid, 'approve'); week = null; drawCheck(); toast(`${todo.length}개를 확인했어요`); } catch (err) { fail(err); drawCheck(); }
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
    return { onSync: () => { if (tab === 'check') call('missions.parent').then((p) => { setParent(p); if (tab === 'check' && !root.querySelector('[data-armed="1"]')) drawCheck(); }).catch(() => {}); } };
  },
};
