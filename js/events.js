// 가족 보드 - 일정 계산 (홈과 달력이 같이 써요)
import { state, personById } from './state.js';
import { esc, parseDay, DOW } from './ui.js';

const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];

let cache = null;
export const eventsCache = {
  get: () => cache,
  set: (list) => { cache = list; },
};

/** 이 일정이 그 날짜에 있는지 (매주 반복 포함) */
export function occurs(ev, k) {
  if (ev.repeat === '매주') {
    if (k < ev.date) return false;
    if (ev.until && k > ev.until) return false;
    return (ev.days || []).includes(parseDay(k).getDay());
  }
  return ev.date === k;
}
export const eventsOn = (list, k) => list.filter((e) => occurs(e, k)).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));

export function personColor(id) {
  const i = state.people.findIndex((p) => p.id === id);
  return i < 0 ? 'var(--muted)' : COLORS[i % COLORS.length];
}
export const evColor = (e) => (e.people && e.people.length === 1 ? personColor(e.people[0]) : 'var(--accent)');
export const whoText = (e) => (e.people || []).map((id) => personById(id)?.name).filter(Boolean).join(', ') || '가족 모두';
export const timeText = (e) => (e.time ? (e.end ? `${e.time}–${e.end}` : e.time) : '하루 종일');
export const repText = (e) => (e.repeat === '매주'
  ? `매주 ${(e.days || []).slice().sort().map((d) => DOW[d]).join('·')}${e.until ? ` (${e.until.slice(5).replace('-', '/')}까지)` : ''}` : '');

/** 일정 한 줄 */
export function evRow(e, { actions = false } = {}) {
  return `<div class="evrow" style="--c:${evColor(e)}">
    <span class="t num">${esc(timeText(e))}</span>
    <div class="grow"><div class="title">${esc(e.title)}</div>
      <div class="tag">${esc(whoText(e))}${repText(e) ? ' · ' + esc(repText(e)) : ''}${e.memo ? ' · ' + esc(e.memo) : ''}</div></div>
    ${actions ? `<button class="ghost small" data-evedit="${esc(e.id)}">고치기</button>` : ''}
  </div>`;
}
