// 📅 가족 달력: 한 달 보기, 날짜별 일정, 일정 추가·고치기 (학원처럼 매주 반복)
import { call } from '../api.js';
import { state } from '../state.js';
import { esc, avatar, modal, armed, toast, fail, dayKey, parseDay, koDate, DOW } from '../ui.js';
import { eventsCache, eventsOn, evColor, evRow } from '../events.js';

export default {
  id: 'calendar', label: '달력', icon: 'calendar',
  mount(root) {
    const now = new Date();
    let y = now.getFullYear(), m = now.getMonth(), sel = dayKey();

    root.innerHTML = `<section class="panel">
      <div class="head"><h2 id="calTitle"></h2>
        <div class="row"><button id="prev" aria-label="이전 달">◀</button><button id="todayBtn">오늘</button><button id="next" aria-label="다음 달">▶</button>
        <button class="primary" id="addBtn">+ 일정</button></div></div>
      <div class="cal">
        <div class="month" id="month"></div>
        <div class="agenda"><h3 id="agTitle"></h3><div class="list" id="agList"></div></div>
      </div></section>`;

    const list = () => eventsCache.get() || [];

    function draw() {
      root.querySelector('#calTitle').textContent = `${y}년 ${m + 1}월`;
      const start = new Date(y, m, 1).getDay(), dim = new Date(y, m + 1, 0).getDate(), weeks = Math.ceil((start + dim) / 7), today = dayKey();
      let h = [...DOW].map((d, i) => `<div class="dow${i === 0 ? ' sun' : ''}">${d}</div>`).join('');
      for (let i = 0; i < weeks * 7; i++) {
        const dt = new Date(y, m, 1 - start + i), k = dayKey(dt), evs = eventsOn(list(), k);
        h += `<button class="day${dt.getMonth() !== m ? ' out' : ''}${k === today ? ' today' : ''}${k === sel ? ' sel' : ''}" data-day="${k}"
          aria-label="${dt.getMonth() + 1}월 ${dt.getDate()}일, 일정 ${evs.length}개">
          <span class="n num">${dt.getDate()}</span>
          ${evs.slice(0, 3).map((e) => `<span class="ev" style="--c:${evColor(e)}">${esc(e.time || '')} ${esc(e.title)}</span>`).join('')}
          ${evs.length > 3 ? `<span class="more">+${evs.length - 3}</span>` : ''}
          <span class="dots">${evs.slice(0, 4).map((e) => `<i class="dot" style="--c:${evColor(e)}"></i>`).join('')}</span></button>`;
      }
      root.querySelector('#month').innerHTML = h;
      root.querySelector('#agTitle').textContent = koDate(sel);
      const evs = eventsOn(list(), sel);
      root.querySelector('#agList').innerHTML = evs.length ? evs.map((e) => evRow(e, { actions: true })).join('') : '<div class="empty">이날은 일정이 없어요.</div>';
    }

    root.querySelector('#prev').onclick = () => { m--; if (m < 0) { m = 11; y--; } draw(); };
    root.querySelector('#next').onclick = () => { m++; if (m > 11) { m = 0; y++; } draw(); };
    root.querySelector('#todayBtn').onclick = () => { y = now.getFullYear(); m = now.getMonth(); sel = dayKey(); draw(); };
    root.querySelector('#addBtn').onclick = () => editEvent({ date: sel });
    root.querySelector('#month').onclick = (e) => {
      const b = e.target.closest('[data-day]');
      if (!b) return;
      sel = b.dataset.day;
      const d = parseDay(sel);
      if (d.getMonth() !== m) { y = d.getFullYear(); m = d.getMonth(); }
      draw();
      if (matchMedia('(max-width:860px)').matches) root.querySelector('#agTitle').scrollIntoView({ block: 'nearest' });
    };
    root.querySelector('#agList').onclick = (e) => {
      const b = e.target.closest('[data-evedit]');
      if (b) editEvent(list().find((x) => x.id === b.dataset.evedit));
    };

    /** 일정 추가·고치기 팝업 */
    function editEvent(ev) {
      if (!state.me) { toast('맨 위에서 누가 쓰는지 먼저 골라 주세요.'); return; }
      const isNew = !ev.id;
      const md = modal(isNew ? '일정 추가' : '일정 고치기', `<form class="stack" id="evForm">
        <label for="evTitle">일정</label><input id="evTitle" maxlength="40" required placeholder="예: 피아노 학원, 가족 외식" value="${esc(ev.title || '')}">
        <span class="label">누구 일정인가요? <span class="sub">(안 고르면 가족 모두)</span></span>
        <div class="chips" id="evWho">${state.people.map((p) => `<label class="chk"><input type="checkbox" value="${esc(p.id)}" ${(ev.people || []).includes(p.id) ? 'checked' : ''}>${avatar(p, 20)} ${esc(p.name)}</label>`).join('')}</div>
        <label for="evDate">날짜</label><input type="date" id="evDate" required value="${esc(ev.date || dayKey())}">
        <div class="row"><label for="evTime" class="grow">시작 <input type="time" id="evTime" value="${esc(ev.time || '')}"></label>
          <label for="evEnd" class="grow">끝 <input type="time" id="evEnd" value="${esc(ev.end || '')}"></label></div>
        <label for="evRepeat">반복</label><select id="evRepeat"><option value="없음">한 번</option>
          <option value="매주" ${ev.repeat === '매주' ? 'selected' : ''}>매주 (학원처럼)</option>
          <option value="매년" ${ev.repeat === '매년' ? 'selected' : ''}>매년 (생일·기념일)</option></select>
        <p class="sub" id="evYearNote" ${ev.repeat === '매년' ? '' : 'hidden'}>위 날짜의 월·일에 해마다 보여요. 생일은 태어난 해 날짜로 넣어도 돼요.</p>
        <div id="evDaysBox" class="stack" ${ev.repeat === '매주' ? '' : 'hidden'}>
          <div class="chips">${[...DOW].map((d, i) => `<label class="chk"><input type="checkbox" value="${i}" ${(ev.days || []).includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div>
          <label for="evUntil">언제까지 <span class="sub">(비우면 계속)</span></label>
          <div class="row"><input type="date" id="evUntil" class="grow" value="${esc(ev.until || '')}"><button type="button" class="small ghost nowrap" id="evUntilClear">지우기</button></div>
        </div>
        <label for="evMemo">메모 <span class="sub">(선택)</span></label><input id="evMemo" maxlength="200" value="${esc(ev.memo || '')}" placeholder="예: 물병 챙기기">
        <div class="row end">${isNew ? '' : '<button type="button" class="danger" id="evDel">지우기</button>'}<button class="primary">${isNew ? '추가' : '저장'}</button></div>
      </form>`);
      const f = md.el;
      f.querySelector('#evRepeat').onchange = (e) => {
        f.querySelector('#evDaysBox').hidden = e.target.value !== '매주';
        f.querySelector('#evYearNote').hidden = e.target.value !== '매년';
      };
      f.querySelector('#evUntilClear').onclick = () => { f.querySelector('#evUntil').value = ''; };
      f.querySelector('#evForm').onsubmit = async (e) => {
        e.preventDefault();
        const val = (id) => f.querySelector(id).value;
        const checked = (sel2) => [...f.querySelectorAll(sel2 + ' input:checked')].map((x) => x.value);
        const data = {
          id: ev.id, title: val('#evTitle'), people: checked('#evWho'), date: val('#evDate'), time: val('#evTime'), end: val('#evEnd'),
          repeat: val('#evRepeat'), days: [...f.querySelectorAll('#evDaysBox input[type=checkbox]:checked')].map((x) => Number(x.value)),
          until: val('#evUntil'), memo: val('#evMemo'),
        };
        try {
          const saved = await call('events.save', data);
          eventsCache.set(list().filter((x) => x.id !== saved.id).concat(saved));
          sel = saved.date;
          // 생일처럼 예전 날짜로 넣은 매년 일정은 올해 그날로 보여줘요
          if (saved.repeat === '매년' && sel < dayKey()) sel = `${new Date().getFullYear()}${sel.slice(4)}`;
          const d = parseDay(sel); y = d.getFullYear(); m = d.getMonth();
          md.close(); draw(); toast(isNew ? '일정을 추가했어요' : '저장했어요');
        } catch (err) { fail(err); }
      };
      const del = f.querySelector('#evDel');
      if (del) del.onclick = async () => {
        if (!armed(del, ev.repeat === '매주' ? '매주 일정 전부 지울까요?' : ev.repeat === '매년' ? '해마다 나오는 일정을 지울까요?' : '정말 지울까요?')) return;
        try { await call('events.remove', ev.id); eventsCache.set(list().filter((x) => x.id !== ev.id)); md.close(); draw(); toast('지웠어요'); } catch (err) { fail(err); }
      };
    }

    draw();
    call('events.list').then((l) => { eventsCache.set(l); draw(); }).catch(fail);
    return { onSync: () => call('events.list').then((l) => { eventsCache.set(l); draw(); }).catch(() => {}) };
  },
};
