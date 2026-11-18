// ⚙️ 설정: 내 프로필, 가족 구성원, 보드 이름, 기기 연결, 이 기기
import { call, setToken, setAs } from '../api.js';
import { APP_VERSION, IS_DEMO } from '../config.js';
import { state, emit, personById, isParent } from '../state.js';
import { esc, avatar, modal, armed, toast, fail, ago } from '../ui.js';
import { pickPhoto } from '../photo.js';
import { orderedViews, BAR_COUNT } from '../menu.js';
import { icon } from '../icons.js';
import { TONES, toneOf } from '../theme.js';
import { mountNotify } from './settings-notify.js';

const EMOJIS = ['👩', '👨', '👧', '👦', '👶', '👵', '👴', '🧑', '🐶', '🐱', '🦊', '🐻', '🐰', '🦎', '🐢', '🌻', '⚽', '🎨'];

export default {
  id: 'settings', label: '설정', icon: 'settings',
  mount(root) {
    let devices = null;
    let menuDraft = null; // 메뉴 순서를 고치는 중이면 메뉴 이름 목록

    function menuHtml() {
      const list = orderedViews();
      const byId = Object.fromEntries(list.map((v) => [v.id, v]));
      const ids = (menuDraft || list.map((v) => v.id)).filter((id) => byId[id]);
      return ids.map((id, i) => `${i === BAR_COUNT ? `<div class="menu-cut">여기부터는 휴대폰에서 '더보기' 안에 있어요</div>` : ''}
        <div class="item"><span class="ic">${icon(byId[id].icon, 20)}</span><span class="grow">${esc(byId[id].label)}</span>
          <button class="small" data-mv="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="${esc(byId[id].label)} 위로">▲</button>
          <button class="small" data-mv="${i}" data-dir="1" ${i === ids.length - 1 ? 'disabled' : ''} aria-label="${esc(byId[id].label)} 아래로">▼</button></div>`).join('')
        + (menuDraft ? '<div class="row end"><button class="ghost" id="menuCancel">취소</button><button class="primary" id="menuSave">이 순서로 저장</button></div>' : '');
    }

    function draw() {
      const me = state.me, parent = isParent();
      root.innerHTML = `
        ${me ? `<section class="panel" id="menuPanel"><div class="head"><h2>메뉴 순서</h2></div>
          <p class="sub">자주 쓰는 메뉴를 위로 올려 주세요. 위의 ${BAR_COUNT}개가 휴대폰 아래 메뉴에 나오고, 나머지는 ☰ 더보기에 들어가요. ${esc(me.name)}의 순서라 다른 기기에서도 똑같이 보여요.</p>
          <div class="menu-order" id="menuOrder">${menuHtml()}</div></section>` : ''}
        <section class="panel" id="notifyPanel"><div class="head"><h2>알림</h2></div><div class="stack" id="notifyBox"><div class="sub">불러오는 중…</div></div></section>
        ${me ? `<section class="panel"><div class="head"><h2>내 프로필</h2></div>
          <div class="profile">${avatar(me, 72)}<div class="stack grow">
            <b class="big-name">${esc(me.name)}</b>
            <div class="row"><button data-edit="${esc(me.id)}">이름·사진 바꾸기</button>
            <button data-pin="${esc(me.id)}">${me.hasPin ? 'PIN 바꾸기' : 'PIN 만들기'}</button></div>
            <span class="sub">${me.role === '부모' ? '가족 태블릿에서 엄마·아빠 화면을 열 때 PIN을 물어봐요.' : 'PIN을 켜면 가족 태블릿에서 내 이름을 누를 때 PIN을 물어봐요.'}</span>
          </div></div></section>` : ''}

        <section class="panel"><div class="head"><h2>가족 구성원</h2>${parent ? '<button id="addPerson">+ 가족 추가</button>' : ''}</div>
          <div class="list">${state.people.map((p) => `<div class="item">
            ${avatar(p, 36)}<span class="grow"><b>${esc(p.name)}</b> <span class="sub">${esc(p.role)}${p.hasPin ? ' · PIN 켜짐' : ''}</span></span>
            ${parent ? `<button class="small" data-edit="${esc(p.id)}">고치기</button>` : ''}</div>`).join('')}</div></section>

        ${parent ? `<section class="panel"><div class="head"><h2>보드 이름</h2></div>
          <form class="inline" id="famForm"><input id="famName" maxlength="20" value="${esc(state.settings.familyName || '')}" aria-label="보드 이름"><button>저장</button></form></section>

        <section class="panel"><div class="head"><h2>연결된 기기</h2><button class="primary" id="addDevice">+ 기기 추가</button></div>
          <div class="list" id="devList">${devices ? devicesHtml() : '<div class="sub">불러오는 중…</div>'}</div>
          <p class="sub">새 휴대폰이나 태블릿을 연결할 때 "+ 기기 추가"로 6자리 코드를 받아요. 잃어버린 기기는 "연결 끊기"를 눌러 주세요.</p></section>` : ''}

        <section class="panel"><div class="head"><h2>이 기기</h2></div>
          <div class="item"><span class="grow"><b>${esc(state.device.name)}</b> <span class="sub">${state.device.kind === '공용' ? '가족 공용 기기' : (personById(state.device.personId)?.name || '') + '의 기기'}</span></span>
            <button class="small" id="renameDev">이름 바꾸기</button><button class="small danger" id="unlink">연결 끊기</button></div>
          <p class="sub">휴대폰 홈 화면에 앱으로 설치하기: 갤럭시는 Chrome 메뉴(⋮) → <b>앱 설치</b>, 아이폰은 Safari 공유 버튼 → <b>홈 화면에 추가</b>.</p>
          <p class="sub num">가족 보드 ${APP_VERSION}${IS_DEMO ? ' · 미리 보기' : ''}</p></section>`;
      mountNotify(root.querySelector('#notifyBox')); // 알림 칸 (settings-notify.js)
    }

    function devicesHtml() {
      return devices.map((d) => `<div class="item">
        <span class="ic" aria-hidden="true">${d.kind === '공용' ? '📱' : '📲'}</span>
        <span class="grow"><b>${esc(d.name)}</b>${d.isThis ? ' <span class="chip small">이 기기</span>' : ''}<br>
          <span class="sub">${d.kind === '공용' ? '공용' : esc(personById(d.personId)?.name || '?') + ' 개인'} · 마지막 사용 ${esc(ago(d.lastSeen) || '-')}</span></span>
        ${d.isThis ? '' : `<button class="small danger" data-devdel="${esc(d.id)}">연결 끊기</button>`}</div>`).join('') || '<div class="sub">연결된 기기가 없어요.</div>';
    }

    /** 구성원 고치기 (이름, 이모지, 사진, 역할, PIN 끄기, 지우기) */
    function editPerson(p) {
      const parent = isParent(), self = state.me && p && p.id === state.me.id, isNew = !p;
      p = p || { name: '', emoji: '🧒', role: '아이' };
      let emoji = p.emoji || '🙂';
      const md = modal(isNew ? '가족 추가' : `${p.name} 고치기`, `<form class="stack" id="pForm">
        ${isNew ? '' : `<div class="profile">${avatar(p, 64)}<div class="row"><button type="button" id="photoBtn">사진 고르기</button>${p.photo ? '<button type="button" class="ghost" id="photoDel">사진 지우기</button>' : ''}</div></div>`}
        <label for="pName">이름</label><input id="pName" maxlength="12" required value="${esc(p.name)}">
        <span class="label">이모지 <span class="sub">(사진이 없을 때 보여요)</span></span>
        <div class="emoji-grid" id="emo">${EMOJIS.map((e) => `<button type="button" data-emo="${e}" class="${e === emoji ? 'on' : ''}" aria-label="${e}">${e}</button>`).join('')}</div>
        <span class="label">화면 색 <span class="sub">(이 사람으로 쓸 때 화면 색)</span></span>
        <div class="tones">${TONES.map((t) => `<label class="tone"><input type="radio" name="pTone" value="${t.id}" ${toneOf(p) === t.id ? 'checked' : ''}>
          <span class="sw" style="background:${t.color}"></span>${t.label}</label>`).join('')}</div>
        ${parent && !self ? `<label for="pRole">역할</label><select id="pRole"><option value="아이">아이</option><option value="부모" ${p.role === '부모' ? 'selected' : ''}>엄마·아빠</option></select>` : ''}
        <div class="row end">
          ${!isNew && parent && !self && p.role === '아이' && p.hasPin ? '<button type="button" class="ghost" id="pinOff">PIN 끄기</button>' : ''}
          ${!isNew && parent && !self ? '<button type="button" class="danger" id="pDel">가족에서 빼기</button>' : ''}
          <button class="primary">저장</button></div></form>`);
      const f = md.el;
      f.querySelector('#emo').onclick = (e) => {
        const b = e.target.closest('[data-emo]'); if (!b) return;
        emoji = b.dataset.emo;
        f.querySelectorAll('[data-emo]').forEach((x) => x.classList.toggle('on', x === b));
      };
      f.querySelector('#pForm').onsubmit = async (e) => {
        e.preventDefault();
        try {
          const tone = f.querySelector('input[name=pTone]:checked');
          const saved = await call('people.save', { id: p.id, name: f.querySelector('#pName').value, emoji, tone: tone ? tone.value : undefined,
            role: f.querySelector('#pRole') ? f.querySelector('#pRole').value : undefined });
          upsertPerson(saved); md.close(); toast('저장했어요');
        } catch (err) { fail(err); }
      };
      const photoBtn = f.querySelector('#photoBtn');
      if (photoBtn) photoBtn.onclick = () => pickPhoto(async (url) => {
        try { await call('people.photo', p.id, url); upsertPerson({ ...personById(p.id), photo: url }); md.close(); toast('사진을 바꿨어요'); } catch (err) { fail(err); }
      });
      const photoDel = f.querySelector('#photoDel');
      if (photoDel) photoDel.onclick = async () => {
        try { await call('people.photo', p.id, ''); upsertPerson({ ...personById(p.id), photo: '' }); md.close(); toast('사진을 지웠어요'); } catch (err) { fail(err); }
      };
      const pinOff = f.querySelector('#pinOff');
      if (pinOff) pinOff.onclick = async () => {
        try { await call('people.pin', p.id, ''); upsertPerson({ ...personById(p.id), hasPin: false }); md.close(); toast('PIN을 껐어요'); } catch (err) { fail(err); }
      };
      const del = f.querySelector('#pDel');
      if (del) del.onclick = async () => {
        if (!armed(del, '정말 뺄까요? 이 사람 기기도 끊겨요')) return;
        try { await call('people.remove', p.id); state.people = state.people.filter((x) => x.id !== p.id); md.close(); emit('top'); draw(); loadDevices(); } catch (err) { fail(err); }
      };
    }

    function setPin(p) {
      const md = modal(`${p.name} PIN`, `<form class="stack" id="pinForm">
        <label for="pin1">새 PIN (숫자 4자리)</label><input id="pin1" type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" required autocomplete="new-password">
        <label for="pin2">한 번 더</label><input id="pin2" type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" required autocomplete="new-password">
        ${p.role !== '부모' && p.hasPin ? '<button type="button" class="ghost" id="pinClear">PIN 끄기</button>' : ''}
        <button class="primary">저장</button></form>`);
      const f = md.el;
      f.querySelector('#pinForm').onsubmit = async (e) => {
        e.preventDefault();
        const a = f.querySelector('#pin1').value, b = f.querySelector('#pin2').value;
        if (a !== b) { toast('두 PIN이 달라요.'); return; }
        try { await call('people.pin', p.id, a); upsertPerson({ ...personById(p.id), hasPin: true }); md.close(); toast('PIN을 저장했어요'); } catch (err) { fail(err); }
      };
      const clear = f.querySelector('#pinClear');
      if (clear) clear.onclick = async () => {
        try { await call('people.pin', p.id, ''); upsertPerson({ ...personById(p.id), hasPin: false }); md.close(); toast('PIN을 껐어요'); } catch (err) { fail(err); }
      };
    }

    function addDevice() {
      const md = modal('기기 추가', `<form class="stack" id="dForm">
        <span class="label">누구 기기인가요?</span>
        <div class="chips">${state.people.map((p) => `<label class="chk"><input type="radio" name="dWho" value="${esc(p.id)}">${avatar(p, 20)} ${esc(p.name)} 휴대폰</label>`).join('')}
          <label class="chk"><input type="radio" name="dWho" value="" checked>📱 가족 공용 (태블릿)</label></div>
        <label for="dName">기기 이름 <span class="sub">(선택)</span></label><input id="dName" maxlength="30" placeholder="예: 거실 태블릿, 소율 휴대폰">
        <button class="primary">연결 코드 만들기</button></form>`);
      md.el.querySelector('#dForm').onsubmit = async (e) => {
        e.preventDefault();
        const who = md.el.querySelector('input[name=dWho]:checked').value;
        try {
          const r = await call('links.create', who ? '개인' : '공용', who, md.el.querySelector('#dName').value);
          md.el.querySelector('.modal-body').innerHTML = `<div class="stack center">
            <p>새 기기에서 가족 보드 주소를 열고 이 코드를 넣어 주세요.</p>
            <div class="code num" aria-label="연결 코드">${esc(r.code)}</div>
            <p class="sub">${r.minutes}분 동안만 쓸 수 있어요.</p>
            <button class="primary" data-close>다 했어요</button></div>`;
          setTimeout(loadDevices, 1000);
        } catch (err) { fail(err); }
      };
    }

    function upsertPerson(p) {
      const i = state.people.findIndex((x) => x.id === p.id);
      if (i >= 0) state.people[i] = { ...state.people[i], ...p }; else state.people.push(p);
      if (state.me && state.me.id === p.id) state.me = state.people[i >= 0 ? i : state.people.length - 1];
      emit('top');
      draw();
    }

    async function loadDevices() {
      if (!isParent()) return;
      try { devices = await call('devices.list'); const el = root.querySelector('#devList'); if (el) el.innerHTML = devicesHtml(); } catch (e) { /* 부모가 아니면 안 보여요 */ }
    }

    root.addEventListener('click', async (e) => {
      const t = e.target;
      const mv = t.closest('[data-mv]');
      if (mv) {
        const ids = menuDraft || orderedViews().map((v) => v.id);
        const i = Number(mv.dataset.mv), j = i + Number(mv.dataset.dir);
        [ids[i], ids[j]] = [ids[j], ids[i]];
        menuDraft = ids.slice();
        root.querySelector('#menuOrder').innerHTML = menuHtml();
        return;
      }
      if (t.closest('#menuCancel')) { menuDraft = null; root.querySelector('#menuOrder').innerHTML = menuHtml(); return; }
      if (t.closest('#menuSave')) {
        try {
          state.me.menu = await call('people.menu', menuDraft);
          const p = state.people.find((x) => x.id === state.me.id);
          if (p) p.menu = state.me.menu;
          menuDraft = null; root.querySelector('#menuOrder').innerHTML = menuHtml(); emit('top'); toast('메뉴 순서를 저장했어요');
        } catch (err) { fail(err); }
        return;
      }
      const ed = t.closest('[data-edit]'); if (ed) return editPerson(personById(ed.dataset.edit));
      const pn = t.closest('[data-pin]'); if (pn) return setPin(personById(pn.dataset.pin));
      if (t.closest('#addPerson')) return editPerson(null);
      if (t.closest('#addDevice')) return addDevice();
      const dd = t.closest('[data-devdel]');
      if (dd) {
        if (!armed(dd, '정말 끊을까요?')) return;
        try { await call('devices.remove', dd.dataset.devdel); loadDevices(); toast('연결을 끊었어요'); } catch (err) { fail(err); }
        return;
      }
      if (t.closest('#renameDev')) {
        const md = modal('기기 이름', `<form class="inline" id="rnForm"><input id="rn" maxlength="30" value="${esc(state.device.name)}" aria-label="기기 이름"><button class="primary">저장</button></form>`);
        md.el.querySelector('#rnForm').onsubmit = async (ev) => {
          ev.preventDefault();
          try { const n = md.el.querySelector('#rn').value.trim(); await call('devices.rename', n); state.device.name = n || state.device.name; md.close(); draw(); } catch (err) { fail(err); }
        };
        return;
      }
      const un = t.closest('#unlink');
      if (un) {
        if (!armed(un, '정말 끊을까요? 다시 쓰려면 새 코드가 필요해요')) return;
        try { await call('devices.remove', state.device.id); } catch (err) { /* 이미 끊겼어도 계속 */ }
        setToken(null); setAs(null); location.reload();
      }
    });
    root.addEventListener('submit', async (e) => {
      if (e.target.id !== 'famForm') return;
      e.preventDefault();
      try { state.settings = await call('settings.save', { familyName: root.querySelector('#famName').value }); emit('top'); toast('저장했어요'); } catch (err) { fail(err); }
    });

    draw();
    loadDevices();
    // '더보기 → 메뉴 순서 바꾸기'로 들어오면 메뉴 순서 칸을 보여줘요
    if (state.focus === 'menu') { state.focus = null; const mp = root.querySelector('#menuPanel'); if (mp) mp.scrollIntoView({ block: 'start' }); }
    return { onSync: () => { if (!menuDraft) draw(); } };
  },
};
