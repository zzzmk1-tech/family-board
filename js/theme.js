// 가족 보드 - 사람 색과 미션 그림 ('오늘의 미션' 앱과 같은 규칙)

// 고를 수 있는 사람 색. CSS의 :root[data-tone="…"] 과 이름이 같아야 해요.
export const TONES = [
  { id: 'green', label: '초록', color: '#2f8f5b' },
  { id: 'purple', label: '보라', color: '#6a5acd' },
  { id: 'pink', label: '핑크', color: '#e05a8a' },
  { id: 'sky', label: '하늘', color: '#2b9bd6' },
  { id: 'gold', label: '노랑', color: '#e0a800' },
  { id: 'blue', label: '파랑', color: '#2f6fd6' },
  { id: 'coral', label: '주황', color: '#d4573b' },
];

/** 그 사람의 색. 따로 고르지 않았으면 우재 초록, 소율 보라, 엄마 핑크, 아빠 하늘 */
export function toneOf(p) {
  if (!p) return 'green';
  if (p.tone && TONES.some((t) => t.id === p.tone)) return p.tone;
  if (p.id === 'mom') return 'pink';
  if (p.id === 'dad') return 'sky';
  if (p.role === '부모') return 'gold';
  if (p.id === 'daughter') return 'purple';
  return 'green';
}

/** 화면 전체 색을 지금 쓰는 사람 색으로 */
export function applyTone(p) {
  document.documentElement.dataset.tone = toneOf(p);
}

// 미션 이름에 들어간 말로 그림을 골라요. 위에서부터 먼저 맞는 것.
const ICONS = [[/강의|인강/, '📺'], [/연산|계산/, '🔢'], [/수학/, '📐'], [/독해|독서|책/, '📖'], [/파닉스|EBS|영어|듀오/, '🔤'],
  [/단어/, '📝'], [/국어/, '✏️'], [/과학/, '🔬'], [/사회/, '🌏'], [/놀기|놀|끝냈/, '⚽'], [/태권/, '🥋'], [/피아노|음악/, '🎹'], [/운동|줄넘기/, '🏃']];
export function missionIcon(title) {
  const hit = ICONS.find(([re]) => re.test(title || ''));
  return hit ? hit[1] : '⭐';
}
