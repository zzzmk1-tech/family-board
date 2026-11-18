// 설정 > 알림: 이 기기에서 알림 켜기, 받을 알림 고르기, 방해 금지 시간, 공용 기기에서 누구 알림을 받을지
import { call } from '../api.js';
import { state } from '../state.js';
import { esc, avatar, toast, fail } from '../ui.js';
import { pushSupport, permission, enablePush, disablePush, refreshPush, markPushOn } from '../push.js';

/** 사람 역할에 따라 보여줄 알림 항목 */
function items(me) {
  const kid = me.role === '아이';
  return [
    ['chat', '가족 대화', '나에게 온 대화 메시지'],
    ['mission', kid ? '엄마가 확인했어요' : '아이 미션 체크', kid ? '엄마가 미션을 확인하면' : '아이가 미션을 체크하면 (확인해 달라고)'],
    kid && ['reminder', '저녁 7시 미션 알림', '기본 미션이 남았을 때'],
    ['event', '일정 30분 전', '나 또는 가족 모두의 일정'],
    !kid && ['weekly', '일요일 칭찬모아', '일요일 저녁 8시에 미지급 포인트'],
    !kid && ['fixed', '고정비 기록', '매달 고정비가 들어갔을 때'],
    ['preview', '잠금 화면에 내용 보이기', '끄면 "새 메시지가 있어요"로만 보여요'],
  ].filter(Boolean);
}

export function mountNotify(el) {
  let st = null, busy = false;

  async function load() {
    try { st = await call('push.state'); if (st.deviceOn) markPushOn(true); draw(); } catch (e) { el.innerHTML = `<div class="sub">${esc(e.message)}</div>`; }
  }

  function draw() {
    const sup = pushSupport();
    const me = state.me;
    const on = st.deviceOn && permission() !== 'denied';
    el.innerHTML = `
      <div class="item"><div class="grow"><b>이 기기 알림</b><br><span class="sub">${on ? '켜져 있어요' : '꺼져 있어요'}${!st.ready ? ' · 서버에 Firebase 연결 전 (README 4단계)' : ''}</span></div>
        ${sup.ok ? (on ? '<button class="small" id="pTest">시험 알림</button><button class="small ghost" id="pOff">끄기</button>' : '<button class="primary small" id="pOn">알림 켜기</button>') : ''}</div>
      ${sup.ok ? '' : `<p class="sub">${esc(sup.reason)}</p>`}
      ${permission() === 'denied' ? '<p class="sub warn">이 기기에서 알림이 막혀 있어요. 휴대폰 설정 > 앱(또는 브라우저) > 알림에서 허용해 주세요.</p>' : ''}
      ${state.device.kind === '공용' ? `<span class="label">이 기기에서 알림 받을 사람 <span class="sub">(아이들이 각자 휴대폰을 쓰면 빼 주세요)</span></span>
        <div class="chips" id="pFor">${state.people.map((p) => {
          const sel = st.notifyFor.length ? st.notifyFor.includes(p.id) : p.role === '아이';
          return `<label class="chk"><input type="checkbox" value="${esc(p.id)}" ${sel ? 'checked' : ''}>${avatar(p, 20)} ${esc(p.name)}</label>`;
        }).join('')}</div>` : ''}
      ${me && st.prefs ? `<span class="label">${esc(me.name)}이(가) 받을 알림 <span class="sub">(모든 기기에 같이 적용돼요)</span></span>
        <div class="list" id="pPrefs">${items(me).map(([k, t, d]) => `<label class="item toggle"><span class="grow"><b>${t}</b><br><span class="sub">${d}</span></span>
          <input type="checkbox" data-pref="${k}" ${st.prefs[k] ? 'checked' : ''} role="switch"></label>`).join('')}</div>
        <span class="label">방해 금지 시간 <span class="sub">(이 시간에는 알림을 보내지 않아요. 비우면 꺼짐)</span></span>
        <div class="row"><input type="time" id="qFrom" value="${esc(st.prefs.quietFrom || '')}" aria-label="방해 금지 시작" style="width:auto">
          <span class="sub">~</span><input type="time" id="qTo" value="${esc(st.prefs.quietTo || '')}" aria-label="방해 금지 끝" style="width:auto">
          <button class="small" id="qSave">저장</button>${st.prefs.quietFrom ? '<button class="small ghost" id="qClear">끄기</button>' : ''}</div>` : ''}`;
  }

  const savePrefs = async (patch, msg) => {
    try { st = await call('push.prefs', patch); draw(); if (msg) toast(msg); } catch (e) { fail(e); draw(); }
  };

  el.addEventListener('click', async (e) => {
    if (busy) return;
    const t = e.target;
    if (t.closest('#pOn')) {
      busy = true;
      try { st = await enablePush(); draw(); toast('알림을 켰어요'); } catch (err) { fail(err); }
      busy = false; return;
    }
    if (t.closest('#pOff')) { try { st = await disablePush(); draw(); toast('이 기기의 알림을 껐어요'); } catch (err) { fail(err); } return; }
    if (t.closest('#pTest')) {
      try { await call('push.test'); toast('시험 알림을 보냈어요. 잠시 뒤 알림창을 봐 주세요'); } catch (err) {
        if (err.code !== 'push_gone') { fail(err); return; }
        // 알림 주소가 바뀌었어요(앱으로 설치 등): 새 주소로 다시 등록하고 한 번 더 보내요
        try {
          markPushOn(true);
          await refreshPush(true);
          await call('push.test');
          st = await call('push.state'); draw();
          toast('알림 주소를 새로 등록하고 시험 알림을 보냈어요');
        } catch (e2) { fail(new Error('알림을 끄고 다시 켜 주세요. (' + (e2.message || '') + ')')); load(); }
      }
      return;
    }
    if (t.closest('#qSave')) {
      const from = el.querySelector('#qFrom').value, to = el.querySelector('#qTo').value;
      if (!!from !== !!to) { toast('시작과 끝을 모두 골라 주세요'); return; }
      savePrefs({ quietFrom: from, quietTo: to }, from ? `${from}~${to}에는 알림을 보내지 않아요` : '방해 금지를 껐어요');
      return;
    }
    if (t.closest('#qClear')) savePrefs({ quietFrom: '', quietTo: '' }, '방해 금지를 껐어요');
  });
  el.addEventListener('change', async (e) => {
    const p = e.target.closest('[data-pref]');
    if (p) { savePrefs({ [p.dataset.pref]: p.checked }); return; }
    if (e.target.closest('#pFor')) {
      const ids = [...el.querySelectorAll('#pFor input:checked')].map((x) => x.value);
      try { st = await call('push.device', ids); toast('저장했어요'); } catch (err) { fail(err); }
    }
  });

  load();
}
