// 🏠 홈: 가족 상태판, 내 상태 바꾸기, 오늘 일정
import { call } from '../api.js';
import { state, emit, unreadTotal } from '../state.js';
import { esc, avatar, ago, fail, toast, dayKey } from '../ui.js';
import { eventsCache, eventsOn, evRow } from '../events.js';
import { heroHtml } from './missions.js';
import { koDate } from '../ui.js';

// 상태 앞에 붙일 그림 (심플한 화면을 위해 지금은 비워 둠. 넣고 싶으면 '집': '🏠' 처럼)
const STATUS_ICON = {};

export default {
  id: 'home', label: '홈', icon: 'home',
  mount(root) {
    const me = state.me;
    root.innerHTML = `
      ${heroHtml({ person: me || { emoji: '🏡' }, hello: me ? `안녕, ${me.name}!` : '안녕하세요!', title: state.settings.familyName || '우리 가족', when: koDate(dayKey()) })}
      <section class="panel"><div class="head"><h2>가족 상태</h2></div><div class="magnets" id="magnets"></div></section>
      <div class="grid2">
        <section class="panel" id="myStatus"></section>
        <section class="panel"><div class="head"><h2>오늘 일정</h2><button class="ghost small" data-go="calendar">달력 보기</button></div>
          <div class="list" id="todayList"><div class="sub">불러오는 중…</div></div></section>
      </div>
      <div id="unreadNote"></div>`;

    const draw = () => {
      root.querySelector('#magnets').innerHTML = state.people.map((p) => `
        <div class="magnet"><div class="who-line">${avatar(p, 40)}<b>${esc(p.name)}</b></div>
          ${p.status ? `<span class="chip st-${esc(p.status)}">${STATUS_ICON[p.status] || ''} ${esc(p.status)}</span>` : '<span class="chip">상태 없음</span>'}
          ${p.statusNote ? `<div class="note">“${esc(p.statusNote)}”</div>` : ''}
          <div class="note">${esc(ago(p.statusAt))}</div></div>`).join('');

      const me = state.me;
      root.querySelector('#myStatus').innerHTML = me ? `
        <div class="head"><h2>내 상태 바꾸기</h2><span class="sub">${avatar(me, 22)} ${esc(me.name)}</span></div>
        <div class="chips" id="stBtns">${state.statuses.map((s) => `<button data-st="${esc(s)}" class="${me.status === s ? 'on' : ''}">${STATUS_ICON[s] || ''} ${esc(s)}</button>`).join('')}</div>
        <form class="inline" id="noteForm"><input id="noteIn" maxlength="40" placeholder="한마디 (예: 6시에 도착해요)" value="${esc(me.statusNote || '')}" aria-label="한마디"><button>남기기</button></form>`
        : '<div class="head"><h2>내 상태 바꾸기</h2></div><div class="sub">맨 위에서 누가 쓰는지 먼저 골라 주세요.</div>';

      const n = unreadTotal();
      root.querySelector('#unreadNote').innerHTML = n ? `<button class="banner" data-go="chat">💬 안 읽은 대화 ${n}개가 있어요</button>` : '';
    };

    const drawToday = () => {
      const list = eventsCache.get();
      if (!list) return;
      const today = eventsOn(list, dayKey());
      root.querySelector('#todayList').innerHTML = today.length ? today.map((e) => evRow(e)).join('')
        : '<div class="sub">오늘은 등록된 일정이 없어요. 달력에서 학원이나 가족 일정을 추가해 보세요.</div>';
    };

    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-st]');
      if (!b) return;
      const st = b.dataset.st === state.me.status ? '' : b.dataset.st; // 같은 걸 또 누르면 해제
      try { state.me = await call('status.set', st, null); patchMe(); draw(); } catch (err) { fail(err); }
    });
    root.addEventListener('submit', async (e) => {
      if (e.target.id !== 'noteForm') return;
      e.preventDefault();
      try { state.me = await call('status.set', null, root.querySelector('#noteIn').value); patchMe(); draw(); toast('남겼어요'); } catch (err) { fail(err); }
    });

    draw();
    drawToday();
    call('events.list').then((l) => { eventsCache.set(l); drawToday(); }).catch(fail);

    return {
      onSync: () => { draw(); call('events.list').then((l) => { eventsCache.set(l); drawToday(); }).catch(() => {}); },
    };
  },
};

function patchMe() {
  const i = state.people.findIndex((p) => p.id === state.me.id);
  if (i >= 0) state.people[i] = state.me;
  emit('top');
}
