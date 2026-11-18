// 💬 가족 대화: 가족 모두 방, 1:1 방, 그룹 방
import { call } from '../api.js';
import { CHAT_SYNC_MS } from '../config.js';
import { state, emit, personById, unreadTotal } from '../state.js';
import { icon } from '../icons.js';
import { esc, avatar, modal, armed, toast, fail, clock, atDate, koDate, dayKey } from '../ui.js';

export default {
  id: 'chat', label: '대화', icon: 'chat', needsPerson: true,
  badge: () => unreadTotal(),
  mount(root) {
    let open = null;       // 열린 방 { room, messages, more }
    let poll = null;
    const me = state.me;

    root.innerHTML = `<section class="panel chat">
      <div class="rooms" id="rooms"><div class="head"><h2>대화방</h2><button class="small" id="newGroup">+ 그룹</button></div><div id="roomList" class="room-list"></div></div>
      <div class="room" id="room"><div class="empty">왼쪽에서 대화방을 골라 주세요.</div></div>
    </section>`;
    const chatEl = root.querySelector('.chat');

    const roomTitle = (r) => r.kind === '가족' ? '가족 모두' : r.kind === '1:1' ? (personById(r.other || r.members.find((id) => id !== me.id))?.name || '') : r.name;
    const roomIcon = (r, size) => {
      if (r.kind === '1:1') return avatar(personById(r.other || r.members.find((id) => id !== me.id)), size);
      return `<span class="av group" style="width:${size}px;height:${size}px">${icon(r.kind === '가족' ? 'home' : 'chat', Math.round(size * 0.5))}</span>`;
    };

    function drawRooms() {
      const sorted = state.rooms.slice().sort((a, b) => {
        if (a.kind === '가족') return -1; if (b.kind === '가족') return 1;
        return (b.last?.at || '').localeCompare(a.last?.at || '');
      });
      root.querySelector('#roomList').innerHTML = sorted.map((r) => `
        <button class="room-item${open && open.room.id === r.id ? ' on' : ''}" data-room="${esc(r.id)}">
          ${roomIcon(r, 40)}
          <span class="grow"><span class="rname">${esc(roomTitle(r))}${r.kind === '그룹' ? ` <span class="sub">${r.members.length}명</span>` : ''}</span>
            <span class="rlast">${r.last ? esc((r.kind !== '1:1' ? (personById(r.last.personId)?.name || '') + ': ' : '') + r.last.text) : '<span class="sub">아직 대화가 없어요</span>'}</span></span>
          <span class="rmeta">${r.last ? `<span class="sub num">${esc(shortTime(r.last.at))}</span>` : ''}${r.unread ? `<span class="badge">${r.unread}</span>` : ''}</span>
        </button>`).join('');
    }

    function drawRoom() {
      const pane = root.querySelector('#room');
      if (!open) { pane.innerHTML = '<div class="empty">왼쪽에서 대화방을 골라 주세요.</div>'; chatEl.classList.remove('in-room'); return; }
      const r = open.room;
      const members = r.kind === '가족' ? state.people : r.members.map(personById).filter(Boolean);
      pane.innerHTML = `
        <div class="room-head"><button class="ghost icon back" id="back" aria-label="대화방 목록">${icon('back')}</button>
          ${roomIcon(r, 32)}<div class="grow"><b>${esc(roomTitle(r))}</b><div class="sub">${members.map((p) => esc(p.name)).join(', ')}</div></div>
          ${r.kind === '그룹' ? '<button class="ghost small" id="leave">나가기</button>' : ''}</div>
        <div class="msgs" id="msgs">${open.more ? '<button class="ghost small more-btn" id="older">이전 메시지 더 보기</button>' : ''}${msgsHtml(open.messages)}</div>
        <form class="composer" id="composer">
          <textarea id="msgIn" rows="1" maxlength="1000" placeholder="${esc(roomTitle(r))}에게 보내기" aria-label="메시지"></textarea>
          <button class="primary">보내기</button></form>`;
      chatEl.classList.add('in-room');
      const box = pane.querySelector('#msgs');
      box.scrollTop = box.scrollHeight;
      const ta = pane.querySelector('#msgIn');
      ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); send(); } });
      ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; });
      pane.querySelector('#composer').onsubmit = (e) => { e.preventDefault(); send(); };
      pane.querySelector('#back').onclick = () => { stopPoll(); open = null; drawRoom(); drawRooms(); };
      const older = pane.querySelector('#older');
      if (older) older.onclick = loadOlder;
      const leave = pane.querySelector('#leave');
      if (leave) leave.onclick = async () => {
        if (!armed(leave, '정말 나갈까요?')) return;
        try { await call('chat.leave', r.id); state.rooms = state.rooms.filter((x) => x.id !== r.id); open = null; drawRoom(); drawRooms(); emit('top'); } catch (err) { fail(err); }
      };
    }

    function msgsHtml(msgs) {
      let out = '', lastDay = '', lastWho = '';
      msgs.forEach((mm) => {
        const d = atDate(mm.at), day = d ? dayKey(d) : '';
        if (day !== lastDay) { out += `<div class="day-sep"><span>${esc(koDate(day))}</span></div>`; lastDay = day; lastWho = ''; }
        const mine = mm.personId === me.id, p = personById(mm.personId);
        const showWho = !mine && lastWho !== mm.personId;
        out += `<div class="msg${mine ? ' mine' : ''}${showWho ? '' : ' cont'}">
          ${mine ? '' : `<span class="msg-av">${showWho ? avatar(p, 32) : ''}</span>`}
          <div class="msg-body">${showWho ? `<div class="msg-name">${esc(p ? p.name : '가족')}</div>` : ''}
            <div class="msg-line"><div class="bubble">${linkify(esc(mm.text))}</div><span class="msg-time num">${esc(clock(mm.at))}</span></div></div></div>`;
        lastWho = mm.personId;
      });
      return out;
    }

    async function openRoom(id) {
      stopPoll();
      try {
        open = await call('chat.open', id);
        const r = state.rooms.find((x) => x.id === id);
        if (r && r.unread) { r.unread = 0; emit('top'); }
        drawRoom(); drawRooms();
        startPoll();
      } catch (err) { fail(err); }
    }

    async function loadOlder() {
      if (!open || !open.messages.length) return;
      try {
        const r = await call('chat.open', open.room.id, open.messages[0].at);
        open.messages = r.messages.concat(open.messages);
        open.more = r.more;
        const box = root.querySelector('#msgs'), before = box.scrollHeight;
        drawRoom();
        const box2 = root.querySelector('#msgs');
        box2.scrollTop = box2.scrollHeight - before;
      } catch (err) { fail(err); }
    }

    async function send() {
      const ta = root.querySelector('#msgIn');
      const text = ta.value.trim();
      if (!text || !open) return;
      ta.value = '';
      ta.style.height = 'auto';
      try {
        const msg = await call('chat.send', open.room.id, text);
        addMessages([msg]);
        const r = state.rooms.find((x) => x.id === open.room.id);
        if (r) r.last = { text: msg.text, personId: msg.personId, at: msg.at };
        drawRooms();
      } catch (err) { ta.value = text; fail(err); }
    }

    function addMessages(list) {
      if (!open) return;
      const have = new Set(open.messages.map((x) => x.id));
      const fresh = list.filter((x) => !have.has(x.id));
      if (!fresh.length) return;
      open.messages = open.messages.concat(fresh).sort((a, b) => a.at.localeCompare(b.at));
      const box = root.querySelector('#msgs');
      const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      box.innerHTML = (open.more ? '<button class="ghost small more-btn" id="older">이전 메시지 더 보기</button>' : '') + msgsHtml(open.messages);
      const older = box.querySelector('#older');
      if (older) older.onclick = loadOlder;
      if (atBottom || fresh.some((x) => x.personId === me.id)) box.scrollTop = box.scrollHeight;
    }

    // 방을 열어 둔 동안 새 메시지를 자주 확인해요
    function startPoll() {
      stopPoll();
      poll = setInterval(async () => {
        if (!open || document.visibilityState !== 'visible') return;
        const last = open.messages.length ? open.messages[open.messages.length - 1].at : '';
        try { addMessages(await call('chat.since', open.room.id, last)); } catch (e) { /* 다음에 다시 */ }
      }, CHAT_SYNC_MS);
    }
    function stopPoll() { clearInterval(poll); poll = null; }

    root.querySelector('#roomList').onclick = (e) => { const b = e.target.closest('[data-room]'); if (b) openRoom(b.dataset.room); };
    root.querySelector('#newGroup').onclick = () => {
      const md = modal('그룹 대화 만들기', `<form class="stack" id="gForm">
        <label for="gName">방 이름 <span class="sub">(선택)</span></label><input id="gName" maxlength="20" placeholder="예: 엄마 아빠, 아이들">
        <span class="label">함께할 사람 <span class="sub">(나 포함 3명 이상)</span></span>
        <div class="chips">${state.people.filter((p) => p.id !== me.id).map((p) => `<label class="chk"><input type="checkbox" value="${esc(p.id)}">${avatar(p, 20)} ${esc(p.name)}</label>`).join('')}</div>
        <button class="primary">만들기</button></form>`);
      md.el.querySelector('#gForm').onsubmit = async (e) => {
        e.preventDefault();
        const ids = [...md.el.querySelectorAll('input[type=checkbox]:checked')].map((x) => x.value);
        try {
          const r = await call('chat.group', md.el.querySelector('#gName').value, ids);
          state.rooms.push(r); md.close(); drawRooms(); openRoom(r.id); toast('그룹 대화를 만들었어요');
        } catch (err) { fail(err); }
      };
    };

    drawRooms();
    // 넓은 화면에서는 처음에 가족 모두 방을 열어 둬요
    if (!matchMedia('(max-width:860px)').matches) openRoom('family');

    return {
      destroy: stopPoll,
      onSync: () => { drawRooms(); },
    };
  },
};

function shortTime(at) {
  const d = atDate(at);
  if (!d) return '';
  return dayKey(d) === dayKey() ? clock(at) : `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 글 안의 주소를 누를 수 있는 링크로 (이미 esc 처리된 글자에 써요) */
function linkify(s) {
  return s.replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}
