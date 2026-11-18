// 가족 보드 - 이 기기에서 알림 받기 켜기·끄기
// 휴대폰 알림창에 뜨는 그림과 글자는 sw.js(서비스 워커)가 그려요.
import { call, store } from './api.js';
import { IS_DEMO, FIREBASE, VAPID_KEY, PUSH_READY } from './config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

/** 이 기기가 알림을 받을 수 있는지. { ok, reason } */
export function pushSupport() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (ios && !standalone) return { ok: false, reason: '아이폰은 Safari 공유 버튼 → "홈 화면에 추가"로 설치한 가족 보드에서만 알림을 받을 수 있어요. 홈 화면 아이콘으로 열어 주세요.' };
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: '이 브라우저는 알림을 지원하지 않아요. 갤럭시는 Chrome이나 삼성 인터넷에서 "앱 설치" 후 열어 주세요.' };
  }
  if (!IS_DEMO && !PUSH_READY) return { ok: false, reason: '아직 Firebase 설정이 안 됐어요 (README 4단계 준비).' };
  return { ok: true };
}

export const permission = () => ('Notification' in window ? Notification.permission : 'denied');

function loadScript(src) {
  return new Promise((ok, fail) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => fail(new Error('알림 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'));
    document.head.append(s);
  });
}

/** Firebase에서 이 기기의 알림 주소(토큰)를 받아요 (알림 허용이 된 다음에) */
async function getPushToken() {
  const reg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  await loadScript(SDK + 'firebase-app-compat.js');
  await loadScript(SDK + 'firebase-messaging-compat.js');
  const fb = window.firebase;
  if (!fb.apps.length) fb.initializeApp(FIREBASE);
  return fb.messaging().getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
}

/** 알림 켜기: 허용을 물어보고, Firebase에서 이 기기 주소(토큰)를 받아 서버에 저장해요. 버튼을 눌렀을 때 불러야 해요. */
export async function enablePush() {
  if (IS_DEMO) return call('push.register', 'demo-token');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? '알림이 막혀 있어요. 휴대폰 설정 > 앱(또는 브라우저) > 알림에서 허용해 주세요.' : '알림 허용을 눌러 주세요.');
  const token = await getPushToken();
  if (!token) throw new Error('알림 주소를 받지 못했어요. 잠시 후 다시 해 주세요.');
  const st = await call('push.register', token);
  store.set('fb.pushOn', '1');
  store.set('fb.pushToken', token);
  return st;
}

export async function disablePush() {
  store.set('fb.pushOn', '0');
  store.set('fb.pushToken', null);
  return call('push.unregister');
}

/**
 * 앱을 열 때: 이 기기에서 알림을 켜 두었는데 알림 주소가 바뀌었으면(앱으로 설치 등) 새 주소로 다시 등록해요.
 * 허용을 묻지 않아요 (이미 허용된 기기에서만).
 */
export async function refreshPush(force) {
  if (IS_DEMO || !PUSH_READY || !pushSupport().ok || permission() !== 'granted') return false;
  if (store.get('fb.pushOn') == null) {
    // 이 기능 전에 알림을 켠 기기: 서버에 켜져 있는지 한 번만 물어봐요
    const st = await call('push.state');
    markPushOn(!!st.deviceOn);
  }
  if (store.get('fb.pushOn') !== '1') return false;
  const token = await getPushToken();
  if (!token || (!force && token === store.get('fb.pushToken'))) return false;
  await call('push.register', token);
  store.set('fb.pushToken', token);
  return true;
}
/** 설정 화면에서 서버가 '켜짐'이라고 하면 기기에도 켜짐으로 적어 둬요 (예전에 켠 기기) */
export function markPushOn(on) { store.set('fb.pushOn', on ? '1' : '0'); }

/** 앱이 열려 있을 때 온 알림: 화면을 새로 고치고, 알림을 눌렀으면 그 메뉴로 */
export function listenPush({ onPush, onGo }) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type === 'push' && onPush) onPush(m.data || {});
    if (m.type === 'go' && onGo) onGo(m.url || '#home');
  });
}
