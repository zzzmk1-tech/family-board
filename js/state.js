// 가족 보드 - 화면 전체가 같이 쓰는 데이터
export const state = {
  device: null,      // 이 기기 { id, name, kind: 개인|공용, personId }
  me: null,          // 지금 쓰는 사람 (공용 기기에서 아직 안 골랐으면 null)
  people: [],        // 가족 구성원
  rooms: [],         // 내 대화방 목록 (안 읽은 수 포함)
  settings: {},
  statuses: [],
  wikiCategories: [],
  v: null,           // 서버의 '바뀜 번호'
};

const listeners = new Set();
/** 데이터가 바뀌면 알려 달라고 등록. 돌려받은 함수를 부르면 해제 */
export function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(what) { listeners.forEach((fn) => { try { fn(what); } catch (e) { console.error(e); } }); }

export const personById = (id) => state.people.find((p) => p.id === id) || null;
export const isParent = () => !!state.me && state.me.role === '부모';
export const unreadTotal = () => state.rooms.reduce((n, r) => n + (r.unread || 0), 0);
