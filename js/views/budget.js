// 가계부 (엄마·아빠 화면): 입력 / 내역 / 요약 / 설정 — 예전 '우리집 가계부'와 같은 기능
import { call, store } from '../api.js';
import { state, personById } from '../state.js';
import { esc, modal, armed, toast, fail, dayKey, parseDay } from '../ui.js';
import { readTable, guessLayout, buildRows, guessPayment, rememberLayout, recallLayout } from '../import.js';

const won = (n) => (n < 0 ? '-' : '') + Math.abs(Math.round(n)).toLocaleString('ko-KR') + '원';
const ymLabel = (ym) => `${ym.slice(0, 4)}년 ${Number(ym.slice(5))}월`;
const who = (id) => (id ? (personById(id)?.name || id) : '');
const pct = (v, t) => `${Math.round((v / (t || 1)) * 1000) / 10}%`;

/** 금액 계산식: 1200+1980-500, 3*1500 */
export function calc(s) {
  s = String(s ?? '').replace(/[,원\s]/g, '').replace(/^=/, '');
  if (!/^[-+]?\d+([+\-*]\d+)*$/.test(s)) return null;
  return (s.match(/[+\-]?\d+(\*\d+)*/g) || []).reduce((t, tk) => {
    const sign = tk[0] === '-' ? -1 : 1;
    return t + sign * tk.replace(/^[+\-]/, '').split('*').reduce((a, b) => a * Number(b), 1);
  }, 0);
}

export default {
  id: 'budget', label: '가계부', icon: 'wallet', needsPerson: true,
  visible: (s) => !!s.me && s.me.role === '부모',
  mount(root) {
    let tab = 'add', init = null, ym = dayKey().slice(0, 7), list = null, filter = '전체', set = null;

    root.innerHTML = `<div class="seg" role="tablist" id="tabs">
        <button role="tab" data-tab="add">입력</button><button role="tab" data-tab="list">내역</button>
        <button role="tab" data-tab="sum">요약</button><button role="tab" data-tab="set">설정</button></div>
      <div id="body" class="view-body"><div class="sub">불러오는 중…</div></div>`;
    const body = root.querySelector('#body');

    function draw() {
      root.querySelectorAll('[data-tab]').forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab); });
      if (!init) return;
      if (tab === 'add') drawAdd({});
      else if (tab === 'list') loadList();
      else if (tab === 'sum') loadSum();
      else loadSet();
    }

    /** 입력 탭. prefill: 붙여 넣은 결제 문자에서 읽은 값 */
    function drawAdd(prefill) {
      body.innerHTML = `<details class="guide" id="pasteBox" ${prefill.memo ? '' : ''}>
          <summary>📋 결제 문자·알림 붙여넣어 입력</summary>
          <div class="stack" style="margin-top:8px">
            <p class="sub">자동으로 안 들어온 결제 문자나 알림 내용을 붙여 넣으면 금액·날짜·가게·결제수단을 채워 줘요. 확인하고 저장하세요.</p>
            <textarea id="pasteIn" rows="4" placeholder="[Web발신]&#10;KB국민카드 승인&#10;11/18 12:30&#10;12,000원 일시불&#10;스타벅스 대구점"></textarea>
            <div class="row end"><button type="button" class="small" id="pasteClip">클립보드에서 붙여넣기</button><button type="button" class="primary small" id="pasteGo">읽어서 채우기</button></div>
          </div></details>
        <details class="guide" id="importBox">
          <summary>📥 카드·은행 이용내역 가져오기 (엑셀)</summary>
          <div class="stack" style="margin-top:8px">
            <p class="sub">카드사·은행 홈페이지나 앱에서 이용내역을 엑셀(xlsx, xls, csv)로 내려받아 올리면 한꺼번에 들어가요.
              이미 가계부에 있는 결제와 이체·충전은 빼 두니, 확인하고 가져오기를 누르세요.</p>
            <label class="add-btn" style="text-align:center;cursor:pointer">엑셀 파일 고르기<input type="file" id="importFile" accept=".xlsx,.xls,.csv,text/csv" hidden></label>
          </div></details>
        <section class="panel" id="addBox">${formHtml(prefill)}</section>`;
      wireForm(body.querySelector('#addBox'), null);
      body.querySelector('#importFile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openImport(f); };
      const box = body.querySelector('#pasteBox');
      box.querySelector('#pasteClip').onclick = async () => {
        try { box.querySelector('#pasteIn').value = await navigator.clipboard.readText(); } catch (e) { toast('입력칸을 길게 눌러 붙여넣기 해 주세요'); }
      };
      box.querySelector('#pasteGo').onclick = async () => {
        const text = box.querySelector('#pasteIn').value.trim();
        if (!text) { toast('결제 문자를 붙여 넣어 주세요'); return; }
        try {
          const r = await call('budget.parse', text, '');
          if (!r.ok) { toast(r.reason); return; }
          drawAdd({ amount: String(r.amount), date: r.date, memo: r.merchant, payment: r.payment, category: r.category === '미분류' ? '' : r.category });
          toast(r.category === '미분류' ? '채웠어요. 카테고리를 골라 주세요' : '채웠어요. 확인하고 저장하세요');
        } catch (err) { fail(err); }
      };
    }

    /* ---------- 이용내역 엑셀 가져오기 ---------- */
    async function openImport(file) {
      let table;
      try { toast('엑셀을 읽는 중…'); table = await readTable(file); } catch (e) { fail(e); return; }
      const auto = guessLayout(table);
      let headerRow = auto.headerRow >= 0 ? auto.headerRow : 0;
      const remembered = recallLayout(table[headerRow] || []);
      let map = { ...auto.map, ...(remembered ? remembered.map : {}) };
      let payment = (remembered && remembered.payment) || guessPayment(file.name, init.payments);
      let rows = null, checks = null;
      const md = modal('이용내역 가져오기', '<div id="impBody" class="stack"></div>', { wide: true });
      const box = md.el.querySelector('#impBody');
      const header = () => table[headerRow] || [];
      const colOpts = (sel) => `<option value="-1">(없음)</option>` + header().map((h, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(String(h || `${i + 1}번째 칸`))}</option>`).join('');

      function drawSetup() {
        const sample = table.slice(headerRow + 1, headerRow + 4);
        box.innerHTML = `
          <p class="sub"><b>${esc(file.name)}</b> · ${table.length}줄${auto.headerRow < 0 ? ' · <span class="warn">칸 이름을 못 찾았어요. 아래에서 골라 주세요.</span>' : ''}</p>
          <div class="grid2">
            <label>칸 이름이 있는 줄<select id="impHead">${table.slice(0, 40).map((r, i) => `<option value="${i}" ${i === headerRow ? 'selected' : ''}>${i + 1}줄: ${esc(r.filter((x) => x !== '').slice(0, 4).map((x) => (x instanceof Date ? x.toLocaleDateString() : x)).join(' · ').slice(0, 40))}</option>`).join('')}</select></label>
            <label>결제수단<input id="impPay" list="impPayList" value="${esc(payment)}" placeholder="예: KB카드, 토스, K뱅크"><datalist id="impPayList">${init.payments.map((p) => `<option value="${esc(p)}">`).join('')}</datalist></label>
            <label>날짜 칸<select id="impDate">${colOpts(map.date)}</select></label>
            <label>내용(가게) 칸<select id="impShop">${colOpts(map.merchant)}</select></label>
            <label>금액 칸 <span class="sub">(카드)</span><select id="impAmt">${colOpts(map.amount)}</select></label>
            <label>출금 칸 <span class="sub">(은행 통장이면)</span><select id="impOut">${colOpts(map.out)}</select></label>
            <label>구분 칸 <span class="sub">(승인/취소, 입금/출금)</span><select id="impKind">${colOpts(map.kind)}</select></label>
          </div>
          <div class="tablewrap"><table class="btable small-table"><tr>${header().map((h) => `<th>${esc(String(h))}</th>`).join('')}</tr>
            ${sample.map((r) => `<tr>${header().map((_, i) => `<td>${esc(String(r[i] instanceof Date ? r[i].toLocaleDateString() : r[i] ?? ''))}</td>`).join('')}</tr>`).join('')}</table></div>
          <div class="row end"><button class="primary" id="impRead">이대로 읽기</button></div>`;
        box.querySelector('#impHead').onchange = (e) => {
          headerRow = Number(e.target.value);
          const g = guessLayout([table[headerRow]]); map = { ...g.map };
          const rem = recallLayout(header()); if (rem) { map = { ...map, ...rem.map }; payment = rem.payment || payment; }
          drawSetup();
        };
        box.querySelector('#impRead').onclick = readRows;
      }

      async function readRows() {
        const num = (id) => Number(box.querySelector(id).value);
        map = { date: num('#impDate'), merchant: num('#impShop'), amount: num('#impAmt'), out: num('#impOut'), kind: num('#impKind'), in: -1 };
        payment = box.querySelector('#impPay').value.trim();
        if (map.date < 0) { toast('날짜 칸을 골라 주세요'); return; }
        if (map.amount < 0 && map.out < 0) { toast('금액 칸이나 출금 칸을 골라 주세요'); return; }
        if (!payment) { toast('결제수단을 적어 주세요'); return; }
        rows = buildRows(table, { headerRow, map });
        if (!rows.length) { toast('가져올 줄을 찾지 못했어요. 칸을 다시 골라 주세요'); return; }
        rememberLayout(header(), map, payment);
        box.innerHTML = '<div class="sub">가계부와 비교하는 중…</div>';
        try {
          checks = await call('budget.importCheck', rows.map((r) => ({ date: r.date, amount: r.amount, merchant: r.merchant })), payment);
        } catch (e) { fail(e); drawSetup(); return; }
        rows.forEach((r, i) => {
          r.category = checks[i].category;
          r.dup = checks[i].dup;
          r.on = !r.skip && !r.dup;
        });
        drawRows();
      }

      function drawRows() {
        const catOpts = (sel) => init.categories.map((c) => `<option ${c.name === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
        const dups = rows.filter((r) => r.dup).length, skips = rows.filter((r) => r.skip && !r.dup).length;
        box.innerHTML = `
          <p class="sub"><span id="impSum"></span>
            ${dups ? `이미 있는 결제 ${dups}건, ` : ''}${skips ? `이체·충전 같은 ${skips}건은 ` : ''}${dups || skips ? '빼 두었어요. 넣으려면 체크하세요.' : ''}</p>
          <div class="row"><button class="small" id="impAll">모두 체크</button><button class="small" id="impNone">모두 해제</button><button class="small ghost" id="impBack">칸 다시 고르기</button></div>
          <div class="txlist imp-list">${rows.map((r, i) => `<label class="tx imp-row${r.on ? '' : ' off'}">
            <input type="checkbox" data-imp="${i}" ${r.on ? 'checked' : ''}>
            <div class="grow"><div class="m">${esc(r.merchant)}</div>
              <div class="c">${esc(r.date)}${r.dup ? ' <span class="btag">이미 있음</span>' : ''}${r.note ? ` <span class="btag warn">${esc(r.note)}</span>` : ''}
              <select data-impcat="${i}" aria-label="카테고리">${catOpts(r.category)}</select></div></div>
            <div class="a num">${won(r.amount)}</div></label>`).join('')}</div>
          <div class="row end"><button class="primary" id="impSave"></button></div>`;
        updateSum();
        box.querySelector('#impBack').onclick = drawSetup;
        box.querySelector('#impAll').onclick = () => { rows.forEach((r) => { r.on = true; }); drawRows(); };
        box.querySelector('#impNone').onclick = () => { rows.forEach((r) => { r.on = false; }); drawRows(); };
        box.querySelector('#impSave').onclick = save;
      }
      function updateSum() {
        const on = rows.filter((r) => r.on), sum = on.reduce((a, r) => a + r.amount, 0);
        box.querySelector('#impSum').innerHTML = `${rows.length}건 중 <b>${on.length}건 ${won(sum)}</b>을 <b>${esc(payment)}</b>(${esc(who(init.me))}) 기록으로 가져와요.`;
        const b = box.querySelector('#impSave');
        b.textContent = `${on.length}건 가져오기`;
        b.disabled = !on.length;
      }
      box.addEventListener('change', (e) => {
        const c = e.target.closest('[data-imp]');
        if (c) { rows[Number(c.dataset.imp)].on = c.checked; c.closest('.imp-row').classList.toggle('off', !c.checked); updateSum(); return; }
        const s = e.target.closest('[data-impcat]');
        if (s) rows[Number(s.dataset.impcat)].category = s.value;
      });

      async function save() {
        const btn = box.querySelector('#impSave');
        btn.disabled = true;
        const pick = rows.filter((r) => r.on).map((r) => ({ date: r.date, amount: r.amount, memo: r.merchant, category: r.category, force: r.dup }));
        try {
          // 처음 쓰는 결제수단이면 목록에 더해요
          if (!init.payments.includes(payment)) {
            const s = await call('budget.settings');
            await call('budget.savePayments', s.payments.concat([{ name: payment, words: '' }]));
            init = await call('budget.init');
          }
          const r = await call('budget.importSave', pick, payment);
          md.close();
          toast(`${r.added}건을 가져왔어요${r.skipped ? ` (${r.skipped}건은 이미 있어서 뺐어요)` : ''}`);
          tab = 'list';
          const first = pick.map((x) => x.date).sort().pop();
          if (first) ym = first.slice(0, 7);
          draw();
        } catch (e) { fail(e); btn.disabled = false; }
      }

      drawSetup();
    }

    /* ---------- 입력 폼 (새로 쓰기·고치기 같이 써요) ---------- */
    function formHtml(tx) {
      const editing = !!tx.id;
      const groups = {};
      init.categories.forEach((c) => { if (c.name === '미분류' && !editing) return; (groups[c.group] = groups[c.group] || []).push(c.name); });
      const lastPay = tx.payment || store.get('fb.lastPay') || '';
      return `<form class="stack bform">
        <label for="fAmount">금액 <span class="sub">(1200+1980처럼 더하기 가능)</span></label>
        <input class="amount num" id="fAmount" inputmode="text" autocomplete="off" placeholder="0" value="${esc(tx.amount ?? '')}">
        <div class="preview num" id="fPreview"></div>
        <span class="label">카테고리</span>
        ${Object.keys(groups).map((g) => `<div class="grp">${esc(g)}</div><div class="chips">${groups[g].map((n) =>
          `<button type="button" data-cat="${esc(n)}" class="${tx.category === n ? 'on' : ''}">${esc(n)}</button>`).join('')}</div>`).join('')}
        <label for="fDate">날짜</label><input type="date" id="fDate" value="${esc(tx.date || dayKey())}">
        <label for="fMemo">내용 <span class="sub">(선택)</span></label><input id="fMemo" maxlength="60" placeholder="예: 이마트, 우재 책가방" value="${esc(tx.memo || '')}">
        <span class="label">결제수단</span>
        <div class="chips">${init.payments.map((p) => `<button type="button" data-pay="${esc(p)}" class="${lastPay === p ? 'on' : ''}">${esc(p)}</button>`).join('')}</div>
        <button class="primary big-btn">${editing ? '수정하기' : '저장하기'}</button>
        ${editing ? '<button type="button" class="danger big-btn" id="fDel">삭제하기</button>' : ''}
      </form>`;
    }

    function wireForm(box, tx, onDone) {
      const amt = box.querySelector('#fAmount'), prev = box.querySelector('#fPreview');
      const preview = () => { const v = calc(amt.value); prev.textContent = v == null || !amt.value ? '' : `= ${won(v)}`; };
      amt.addEventListener('input', preview);
      preview();
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cat],[data-pay]');
        if (!b) return;
        const kind = b.dataset.cat !== undefined ? 'cat' : 'pay';
        box.querySelectorAll(`[data-${kind}]`).forEach((x) => x.classList.toggle('on', x === b));
      });
      box.querySelector('form').onsubmit = async (e) => {
        e.preventDefault();
        const v = calc(amt.value), cat = box.querySelector('[data-cat].on'), pay = box.querySelector('[data-pay].on');
        if (!v) { toast('금액을 입력해 주세요'); return; }
        if (!cat) { toast('카테고리를 골라 주세요'); return; }
        if (pay) store.set('fb.lastPay', pay.dataset.pay);
        try {
          await call('budget.save', { id: tx ? tx.id : '', amount: amt.value, category: cat.dataset.cat, date: box.querySelector('#fDate').value,
            memo: box.querySelector('#fMemo').value, payment: pay ? pay.dataset.pay : '' });
          toast(tx ? '수정했어요' : `${won(v)} 저장했어요`);
          if (onDone) onDone(); else draw();
        } catch (err) { fail(err); }
      };
      const del = box.querySelector('#fDel');
      if (del) del.onclick = async () => {
        if (!armed(del, '정말 삭제할까요?')) return;
        try { await call('budget.remove', tx.id); toast('삭제했어요'); onDone && onDone(); } catch (err) { fail(err); }
      };
    }

    /* ---------- 내역 ---------- */
    async function loadList() {
      body.innerHTML = monthBar() + '<div class="sub">불러오는 중…</div>';
      try { list = await call('budget.list', ym); if (tab === 'list') drawList(); } catch (e) { fail(e); }
    }
    function monthBar() {
      return `<div class="monthbar"><button class="cal-nav" data-mv="-1" aria-label="이전 달">‹</button><b>${ymLabel(ym)}</b>
        <button class="cal-nav" data-mv="1" aria-label="다음 달">›</button></div>`;
    }
    function drawList() {
      const members = ['전체', '미분류', ...init.members.map((m) => m.id)];
      const items = list.items.filter((t) => filter === '전체' || (filter === '미분류' ? t.category === '미분류' : t.member === filter));
      let total = items.reduce((a, t) => a + t.amount, 0);
      const hiddenRows = Object.keys(list.hidden).filter((m) => filter === '전체' || filter === m).map((m) => {
        const h = list.hidden[m]; total += h.sum;
        return `<div class="tx hiddenrow"><div class="grow"><div class="m">${esc(who(m))} 지출</div>
          <div class="c">${h.count}건 · 자세한 내역은 ${esc(who(m))}만 볼 수 있어요</div></div><div class="a num">${won(h.sum)}</div></div>`;
      }).join('');
      const unc = list.items.filter((t) => t.category === '미분류').length;
      const daySum = {};
      items.forEach((t) => { daySum[t.date] = (daySum[t.date] || 0) + t.amount; });
      let last = '', rows = '';
      items.forEach((t) => {
        if (t.date !== last) {
          last = t.date;
          const d = parseDay(t.date);
          rows += `<div class="dayhead"><span>${d.getMonth() + 1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일</span><span class="num">${won(daySum[t.date])}</span></div>`;
        }
        rows += `<button class="tx" data-tx="${esc(t.id)}"><div class="grow"><div class="m">${esc(t.memo || t.category)}</div>
          <div class="c">${esc(t.category)}${t.payment ? ' · ' + esc(t.payment) : ''}${t.member ? ' · ' + esc(who(t.member)) : ''}
          ${t.source === '자동' ? '<span class="btag">자동</span>' : ''}${t.source === '고정비' ? '<span class="btag">고정비</span>' : ''}${t.source === '가져오기' ? '<span class="btag">엑셀</span>' : ''}
          ${t.category === '미분류' ? '<span class="btag warn">분류 필요</span>' : ''}</div></div><div class="a num">${won(t.amount)}</div></button>`;
      });
      body.innerHTML = `${monthBar()}
        <div class="stat"><b class="num">${won(total)}</b><span class="sub">${items.length}건${unc ? ` · 분류가 필요한 내역 ${unc}건` : ''}</span></div>
        <div class="chips">${members.map((m) => `<button data-filter="${esc(m)}" class="${filter === m ? 'on' : ''}">${esc(m === '전체' || m === '미분류' ? m : who(m))}</button>`).join('')}</div>
        <div class="txlist">${hiddenRows}${rows || (hiddenRows ? '' : '<div class="empty">내역이 없어요</div>')}</div>`;
    }
    function openEdit(t) {
      const md = modal('내역 수정', formHtml(t));
      wireForm(md.el, t, () => { md.close(); loadList(); });
    }

    /* ---------- 요약 ---------- */
    async function loadSum() {
      body.innerHTML = monthBar() + '<div class="sub">불러오는 중…</div>';
      let r;
      try { r = await call('budget.summary', ym); } catch (e) { fail(e); return; }
      if (tab !== 'sum') return;
      const T = r.total || 1;
      const barList = (title, obj, label = (k) => k) => {
        const keys = Object.keys(obj).sort((a, b) => obj[b] - obj[a]);
        if (!keys.length) return '';
        return `<section class="panel"><h2>${title}</h2>${keys.map((k) => `<div class="hrow"><div class="hl"><span>${esc(label(k))}</span><span class="num">${won(obj[k])}</span></div>
          <div class="hbar"><i style="width:${Math.max(2, (obj[k] / T) * 100)}%"></i></div></div>`).join('')}</section>`;
      };
      const typeSum = {};
      let rows = '';
      r.groups.forEach((g) => {
        typeSum[g.type] = (typeSum[g.type] || 0) + g.sum;
        rows += `<tr class="g"><td>${esc(g.type === '고정비' ? '고정비' : g.group)}</td><td class="n num">${won(g.sum)}</td><td class="p num">${pct(g.sum, T)}</td></tr>`;
        g.items.forEach((it) => { if (it.amount) rows += `<tr><td class="in">${esc(it.name)}</td><td class="n num">${won(it.amount)}</td><td class="p num">${pct(it.amount, T)}</td></tr>`; });
      });
      const max = Math.max(1, ...r.monthly.map((m) => m.variable + m.fixed));
      body.innerHTML = `${monthBar()}
        <div class="stat"><b class="num">${won(r.total)}</b><span class="sub">${ymLabel(ym)} 지출 합계 · ${r.count}건${r.unclassified ? ` · 분류 필요 ${r.unclassified}건` : ''}</span></div>
        ${barList('누가 썼나요', r.byMember, (k) => (k === '-' ? '공통' : who(k)))}
        <section class="panel"><h2>카테고리별</h2><div class="sub">변동비 ${won(typeSum['변동비'] || 0)} · 고정비 ${won(typeSum['고정비'] || 0)}</div>
          <div class="tablewrap"><table class="btable">${rows}</table></div></section>
        ${barList('결제수단별', r.byPay, (k) => (k === '-' ? '선택 안 함' : k))}
        <section class="panel"><h2>${ym.slice(0, 4)}년 월별 지출</h2><div class="sub">진한 색 변동비 · 연한 색 고정비</div>
          <div class="mbars">${r.monthly.map((m) => `<div title="${esc(ymLabel(m.ym))} ${won(m.variable + m.fixed)}"><span class="v" style="height:${(m.variable / max) * 100}px"></span>
            <span class="f" style="height:${(m.fixed / max) * 100}px"></span><em class="num">${Number(m.ym.slice(5))}</em></div>`).join('')}</div></section>`;
    }

    /* ---------- 설정 ---------- */
    async function loadSet() {
      body.innerHTML = '<div class="sub">불러오는 중…</div>';
      try { set = await call('budget.settings'); if (tab === 'set') drawSet(); } catch (e) { fail(e); }
    }
    function drawSet() {
      const groups = {};
      set.categories.forEach((c) => { const k = c.type + '|' + c.group; (groups[k] = groups[k] || []).push(c); });
      body.innerHTML = `
        <section class="panel"><h2>내 내역 공개</h2>
          <label class="chk"><input type="checkbox" id="openTog" ${set.open ? 'checked' : ''}> 다른 가족에게 내 건별 내역 보여주기</label>
          <p class="sub">끄면 다른 가족에게는 내 지출이 합계로만 보여요.</p></section>
        <section class="panel"><h2>카드 문자 자동 입력</h2>
          <p class="sub">결제 문자나 카드·페이 앱 알림이 오면 휴대폰이 아래 주소로 내용을 보내게 해 두면 자동으로 기록돼요.
            문자와 앱 알림으로 같은 결제가 두 번 와도 한 번만 들어가요.</p>
          <span class="label">보낼 주소 <span class="sub">(${esc(who(set.me))} 기록으로 들어가요. 다른 사람에게 보내지 마세요)</span></span>
          ${set.autoUrl ? `<div class="copy"><input readonly value="${esc(set.autoUrl + '?key=' + set.autoKey)}" aria-label="보낼 주소"><button data-copy="${esc(set.autoUrl + '?key=' + set.autoKey)}">복사</button></div>`
            : '<p class="sub">주소는 Apps Script를 배포하면 생겨요.</p>'}
          <p class="sub">보내는 방법: <b>POST</b>, 본문에 <b>문자·알림 내용 그대로</b> (또는 양식 칸 이름 <code>text</code>).</p>
          <details class="guide"><summary>갤럭시 설정 (문자 + 앱 알림)</summary><ol class="rules">
            <li>Play 스토어에서 <b>MacroDroid</b>(무료)를 설치하고 알림 접근 권한을 허용해요.</li>
            <li>매크로 추가 → 트리거 <b>SMS 수신</b>(내용에 "승인" 포함) 와 <b>알림 수신</b>(카드사 앱, 토스, 카카오페이, 카카오톡 등 / 내용에 "원" 포함)을 넣어요.</li>
            <li>동작 <b>HTTP 요청</b> → 방법 POST, URL = 위 보낼 주소, 본문 = 문자 내용(SMS) 또는 알림 내용 자리 표시를 골라 넣어요.</li>
            <li>휴대폰 설정에서 MacroDroid를 <b>배터리 최적화 제외</b>로 해 두세요.</li></ol></details>
          <details class="guide"><summary>아이폰 설정 (문자)</summary><ol class="rules">
            <li>단축어 앱 → 자동화 → 새로운 자동화 → <b>메시지</b> → "메시지에 포함: 승인" → <b>즉시 실행</b>.</li>
            <li>동작 <b>URL 콘텐츠 가져오기</b> → URL = 위 보낼 주소, 방법 POST, 요청 본문 <b>양식</b>, 칸 이름 <code>text</code>, 값 = 단축어 입력(메시지).</li>
            <li>아이폰은 다른 앱의 알림 내용을 읽을 수 없어요. 앱 알림만 오는 카드는 카드사 <b>문자 알림</b>을 켜거나, 입력 탭의 "결제 문자 붙여넣어 입력"을 써 주세요.</li></ol></details>
          <span class="label">문자로 시험해 보기 <span class="sub">(저장하지 않아요)</span></span>
          <textarea id="tryIn" rows="3" placeholder="결제 문자나 알림 내용을 붙여 넣어 보세요"></textarea>
          <div class="row end"><button class="small" id="tryGo">어떻게 읽히나 보기</button></div><div id="tryOut" class="sub"></div>
          <div class="row end"><button class="ghost small" id="newKey">주소 새로 만들기</button></div></section>
        <section class="panel"><h2>결제수단</h2><p class="sub">'문자 속 이름'이 결제 문자에 있으면 자동 입력 때 이 결제수단으로 기록돼요.</p>
          <div class="list">${set.payments.map((p, i) => `<div class="item"><div class="grow"><b>${esc(p.name)}</b>${p.words ? `<br><span class="sub">문자 속 이름: ${esc(p.words)}</span>` : ''}</div>
            <button class="small" data-pay-edit="${i}">수정</button><button class="small ghost" data-pay-del="${i}">삭제</button></div>`).join('')}</div>
          <button class="add-btn" data-pay-edit="-1">+ 결제수단 추가</button></section>
        <section class="panel"><h2>카테고리</h2>
          ${Object.keys(groups).map((k) => { const g = groups[k][0]; return `<div class="grp">${esc(g.type === '고정비' ? '고정비' : g.type + ' · ' + g.group)}</div>
            <div class="list">${groups[k].map((c) => `<div class="item"><span class="grow">${esc(c.name)}</span>
              <button class="small" data-cat-ren="${esc(c.name)}">이름 변경</button><button class="small ghost" data-cat-del="${esc(c.name)}">삭제</button></div>`).join('')}</div>`; }).join('')}
          <button class="add-btn" id="catAdd">+ 카테고리 추가</button></section>
        <section class="panel"><h2>고정비</h2><p class="sub">결제일이 되면 매달 자동으로 기록돼요. 다른 가족의 개인 고정비는 보이지 않아요.</p>
          <div class="list">${set.fixed.length ? set.fixed.map((f, i) => `<div class="item${f.on ? '' : ' off'}"><div class="grow"><b>${esc(f.name)}</b> <span class="btag">${esc(f.owner === '공통' ? '공통' : who(f.owner))}</span>
            <br><span class="sub">${esc(f.category)} · 매달 ${f.day}일${f.on ? '' : ' · 사용 안 함'}</span></div><b class="num">${won(f.amount)}</b>
            <button class="small" data-fix-edit="${i}">수정</button></div>`).join('') : '<div class="empty">등록된 고정비가 없어요</div>'}</div>
          <button class="add-btn" data-fix-edit="-1">+ 고정비 추가</button></section>`;
    }
    const afterSet = (d, msg) => { set = d; drawSet(); toast(msg); call('budget.init').then((x) => { init = x; }).catch(() => {}); };

    function editPay(i) {
      const p = i >= 0 ? set.payments[i] : { name: '', words: '' };
      const md = modal(i >= 0 ? '결제수단 수정' : '결제수단 추가', `<form class="stack" id="pf">
        <label for="pn">이름</label><input id="pn" maxlength="30" value="${esc(p.name)}" placeholder="예: KB 체크카드" required>
        <label for="pw">문자 속 이름 <span class="sub">(선택, 쉼표로 여러 개)</span></label><input id="pw" maxlength="60" value="${esc(p.words)}" placeholder="예: KB,국민">
        <button class="primary">저장하기</button></form>`);
      md.el.querySelector('#pf').onsubmit = async (e) => {
        e.preventDefault();
        const item = { name: md.el.querySelector('#pn').value.trim(), words: md.el.querySelector('#pw').value.trim() };
        const all = set.payments.slice(); if (i >= 0) all[i] = item; else all.push(item);
        try { const d = await call('budget.savePayments', all); md.close(); afterSet(d, '저장했어요'); } catch (err) { fail(err); }
      };
    }
    function addCat() {
      const keys = [...new Set(set.categories.map((c) => c.type + '|' + c.group))];
      const md = modal('카테고리 추가', `<form class="stack" id="cf">
        <label for="cg">어디에 넣을까요?</label><select id="cg">${keys.map((k) => { const [t, g] = k.split('|'); return `<option value="${esc(k)}">${esc(t === '고정비' ? '고정비' : t + ' · ' + g)}</option>`; }).join('')}
          <option value="new">+ 새 대분류 만들기</option></select>
        <div id="ngBox" hidden class="stack"><label for="ng">새 대분류 이름 (변동비)</label><input id="ng" maxlength="30" placeholder="예: 반려동물"></div>
        <label for="cn">카테고리 이름</label><input id="cn" maxlength="30" placeholder="예: 간식" required>
        <button class="primary">추가하기</button></form>`);
      md.el.querySelector('#cg').onchange = (e) => { md.el.querySelector('#ngBox').hidden = e.target.value !== 'new'; };
      md.el.querySelector('#cf').onsubmit = async (e) => {
        e.preventDefault();
        const g = md.el.querySelector('#cg').value;
        const [type, group] = g === 'new' ? ['변동비', md.el.querySelector('#ng').value.trim()] : g.split('|');
        try { const d = await call('budget.category', { action: 'add', type, group, name: md.el.querySelector('#cn').value.trim() }); md.close(); afterSet(d, '추가했어요'); } catch (err) { fail(err); }
      };
    }
    function renameCat(name) {
      const md = modal(`'${name}' 이름 바꾸기`, `<form class="stack" id="rf"><input id="rn" maxlength="30" value="${esc(name)}" aria-label="새 이름">
        <p class="sub">지난 내역, 자동분류, 고정비의 이름도 같이 바뀌어요.</p><button class="primary">바꾸기</button></form>`);
      md.el.querySelector('#rf').onsubmit = async (e) => {
        e.preventDefault();
        const n = md.el.querySelector('#rn').value.trim();
        if (!n || n === name) { md.close(); return; }
        try { const d = await call('budget.category', { action: 'rename', name, newName: n }); md.close(); afterSet(d, '이름을 바꿨어요'); } catch (err) { fail(err); }
      };
    }
    function editFixed(i) {
      const f = i >= 0 ? set.fixed[i] : { owner: set.me, name: '', category: '', amount: '', day: 25, payment: '', on: true };
      const md = modal(i >= 0 ? '고정비 수정' : '고정비 추가', `<form class="stack" id="ff">
        <label for="xn">항목 이름</label><input id="xn" maxlength="40" value="${esc(f.name)}" placeholder="예: 실비보험" required>
        <div class="grid2"><label>금액<input id="xa" inputmode="numeric" value="${esc(f.amount)}"></label>
          <label>매달 결제일<input id="xd" type="number" min="1" max="31" value="${esc(f.day)}"></label></div>
        <label for="xc">카테고리</label><select id="xc">${set.categories.map((c) => `<option ${c.name === f.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <label for="xp">결제수단</label><select id="xp"><option value="">선택 안 함</option>${set.payments.map((p) => `<option ${p.name === f.payment ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        <label for="xo">누구 것인가요?</label><select id="xo"><option value="me" ${f.owner !== '공통' ? 'selected' : ''}>${esc(who(set.me))} (나만 보기)</option>
          <option value="공통" ${f.owner === '공통' ? 'selected' : ''}>공통 (가족 모두 보기)</option></select>
        <label class="chk"><input type="checkbox" id="xon" ${f.on ? 'checked' : ''}> 매달 자동으로 기록하기</label>
        <div class="row end">${i >= 0 ? '<button type="button" class="danger" id="xdel">삭제하기</button>' : ''}<button class="primary">저장하기</button></div></form>`);
      const el = md.el;
      el.querySelector('#ff').onsubmit = async (e) => {
        e.preventDefault();
        if (calc(el.querySelector('#xa').value) == null) { toast('금액을 입력해 주세요'); return; }
        try {
          const d = await call('budget.saveFixed', { id: f.id, name: el.querySelector('#xn').value, amount: el.querySelector('#xa').value, day: el.querySelector('#xd').value,
            category: el.querySelector('#xc').value, payment: el.querySelector('#xp').value, owner: el.querySelector('#xo').value === '공통' ? '공통' : set.me, on: el.querySelector('#xon').checked });
          md.close(); afterSet(d, '저장했어요');
        } catch (err) { fail(err); }
      };
      const del = el.querySelector('#xdel');
      if (del) del.onclick = async () => {
        if (!armed(del, '정말 삭제할까요? 지난 기록은 남아요')) return;
        try { const d = await call('budget.removeFixed', f.id); md.close(); afterSet(d, '삭제했어요'); } catch (err) { fail(err); }
      };
    }

    /* ---------- 클릭 ---------- */
    root.querySelector('#tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; draw(); } };
    body.addEventListener('click', async (e) => {
      const t = e.target;
      const mv = t.closest('[data-mv]');
      if (mv) {
        const d = parseDay(ym + '-01'); d.setMonth(d.getMonth() + Number(mv.dataset.mv));
        ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return tab === 'list' ? loadList() : loadSum();
      }
      const fl = t.closest('[data-filter]'); if (fl) { filter = fl.dataset.filter; drawList(); return; }
      const tx = t.closest('[data-tx]'); if (tx) { openEdit(list.items.find((x) => x.id === tx.dataset.tx)); return; }
      const cp = t.closest('[data-copy]');
      if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast('복사했어요'); } catch (err) { cp.previousElementSibling.select(); toast('길게 눌러 복사해 주세요'); } return; }
      if (t.closest('#newKey')) { const b = t.closest('#newKey'); if (!armed(b, '예전 키는 못 쓰게 돼요. 바꿀까요?')) return; try { afterSet(await call('budget.newKey'), '새 키를 만들었어요. 단축어에도 바꿔 넣어 주세요'); } catch (err) { fail(err); } return; }
      const pe = t.closest('[data-pay-edit]'); if (pe) { editPay(Number(pe.dataset.payEdit)); return; }
      const pd = t.closest('[data-pay-del]');
      if (pd) { if (!armed(pd, '삭제할까요?')) return; const i = Number(pd.dataset.payDel); try { afterSet(await call('budget.savePayments', set.payments.filter((_, j) => j !== i)), '삭제했어요'); } catch (err) { fail(err); } return; }
      if (t.closest('#tryGo')) {
        const out = body.querySelector('#tryOut');
        try {
          const r = await call('budget.parse', body.querySelector('#tryIn').value, '');
          out.innerHTML = r.ok ? `✅ ${esc(r.date)} · <b>${won(r.amount)}</b> · ${esc(r.merchant)} · ${esc(r.payment)} · ${esc(r.category)}` : `⚠️ ${esc(r.reason)}`;
        } catch (err) { fail(err); }
        return;
      }
      if (t.closest('#catAdd')) { addCat(); return; }
      const cr = t.closest('[data-cat-ren]'); if (cr) { renameCat(cr.dataset.catRen); return; }
      const cd = t.closest('[data-cat-del]');
      if (cd) { if (!armed(cd, '지난 내역은 미분류로 가요. 삭제할까요?')) return; try { afterSet(await call('budget.category', { action: 'delete', name: cd.dataset.catDel }), '삭제했어요'); } catch (err) { fail(err); } return; }
      const fe = t.closest('[data-fix-edit]'); if (fe) { editFixed(Number(fe.dataset.fixEdit)); }
    });
    body.addEventListener('change', async (e) => {
      if (e.target.id !== 'openTog') return;
      try { afterSet(await call('budget.setOpen', e.target.checked), e.target.checked ? '내 내역을 가족에게 보여줘요' : '내 내역은 합계로만 보여요'); } catch (err) { fail(err); }
    });

    call('budget.init').then((d) => { init = d; draw(); }).catch(fail);
    draw();
    return null;
  },
};
