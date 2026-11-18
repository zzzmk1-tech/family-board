// 가족 보드 - 설정
//
// Apps Script를 웹앱으로 배포하면 나오는 주소(…/exec)를 아래 따옴표 안에 붙여 넣어요.
// 비워 두면 예시 가족으로 움직이는 '미리 보기'로 열려요 (아무것도 저장되지 않아요).
export const API_URL = 'https://script.google.com/macros/s/AKfycbwNP3bk9YLI86q8HtRfFpn1HHiZWyTAnVPNQ94k4z__aLyuaKG3AborlKzNdfRmUYB6/exec';

export const APP_VERSION = '1.0.0';

// 미리 보기: 주소가 비어 있을 때
export const IS_DEMO = !API_URL;

// 알림 (4단계): Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱(웹)의 설정 값을 붙여 넣어요.
// VAPID_KEY는 프로젝트 설정 > 클라우드 메시징 > 웹 푸시 인증서의 '키 쌍'이에요.
// 이 값들은 공개돼도 괜찮은 값이에요 (알림을 보내는 비밀 키는 Apps Script 쪽에만 있어요).
export const FIREBASE = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  messagingSenderId: '',
  appId: '',
};
export const VAPID_KEY = '';
export const PUSH_READY = !!(FIREBASE.apiKey && FIREBASE.projectId && VAPID_KEY);

// 바뀐 게 있는지 확인하는 간격 (밀리초). 대화방을 열어 두면 더 자주 확인해요.
export const SYNC_MS = 30000;
export const CHAT_SYNC_MS = 6000;
