// 가족 보드 - 메뉴 목록과 순서
//
// 메뉴(화면)는 app.js에서 register()로 등록해요.
// 화면 파일에 visible: (state) => true/false 를 두면 그 사람에게만 메뉴가 보여요
//   (예: 가계부는 엄마·아빠만).
// 순서는 사람마다 설정에서 바꿀 수 있고, 앞의 BAR_COUNT개가 휴대폰 아래 메뉴에 나와요.
// 나머지는 '더보기' 안에 들어가요.
import { state } from './state.js';

export const BAR_COUNT = 4;
let views = [];

export function register(list) { views = list; }
export const allViews = () => views;

/** 지금 쓰는 사람에게 보이는 메뉴 */
export const availableViews = () => views.filter((v) => !v.visible || v.visible(state));

/** 그 사람이 정한 순서대로 (정하지 않은 메뉴는 기본 순서로 뒤에) */
export function orderedViews() {
  const list = availableViews();
  const saved = (state.me && state.me.menu) || [];
  const byId = Object.fromEntries(list.map((v) => [v.id, v]));
  const first = saved.map((id) => byId[id]).filter(Boolean);
  return first.concat(list.filter((v) => !saved.includes(v.id)));
}
