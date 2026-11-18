// 가족 보드 - 서버(Apps Script)와 주고받는 곳
//
// 화면 코드는 모두 call('요청 이름', 인자...)로 서버를 불러요.
// 요청 이름 목록은 apps-script/Main.gs 의 routes_() 에 있어요.
import { API_URL, IS_DEMO } from './config.js';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* 저장 못 해도 계속 */ } },
};

// 기기 토큰과 공용 기기에서 고른 사람은 기기에 기억해요. PIN은 기억하지 않아요(화면을 닫으면 사라짐).
export const session = {
  token: store.get('fb.token'),
  as: store.get('fb.as'),
  pin: null,
};
export function setToken(t) { session.token = t; store.set('fb.token', t); }
export function setAs(id, pin) { session.as = id || null; session.pin = pin || null; store.set('fb.as', id || null); }
export { store };

export class ApiError extends Error {
  constructor(message, code) { super(message); this.code = code || ''; }
}

let mock = null;

export async function call(fn, ...args) {
  const body = { fn, args, token: session.token, as: session.as, pin: session.pin };
  let res;
  if (IS_DEMO) {
    if (!mock) mock = await import('./mock.js');
    res = await mock.handle(JSON.parse(JSON.stringify(body)));
  } else {
    let r;
    try {
      // text/plain 으로 보내야 Apps Script가 추가 확인 요청 없이 받아요
      // credentials: 'omit' - 쿠키 없이 불러야 만 13세 미만 아이 구글 계정으로 로그인된 기기에서도 열려요 (예전 미션 앱과 같은 이유)
      r = await fetch(API_URL, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    } catch (e) {
      throw new ApiError('인터넷 연결을 확인해 주세요.', 'network');
    }
    try { res = await r.json(); } catch (e) { throw new ApiError('서버 답을 읽지 못했어요. 잠시 후 다시 해 주세요.', 'bad_response'); }
  }
  if (!res || !res.ok) throw new ApiError((res && res.error) || '문제가 생겼어요.', res && res.code);
  return res.data;
}
