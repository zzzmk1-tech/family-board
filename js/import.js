// 가족 보드 - 카드·은행 이용내역 엑셀(xlsx, xls, csv) 읽기
//
// 카드사·은행마다 엑셀 모양이 달라서, 맨 위 몇 줄에서 '칸 이름 줄'을 찾고
// 이름(이용일, 가맹점, 이용금액, 출금액 …)으로 날짜·내용·금액 칸을 맞춰요.
// 못 맞추면 화면에서 직접 고를 수 있어요. 고른 칸은 기기에 기억해 두어요.

const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = XLSX_URL;
    s.onload = () => ok(window.XLSX);
    s.onerror = () => fail(new Error('엑셀 읽기 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'));
    document.head.append(s);
  });
}

/** 파일 → 표(줄 × 칸). 줄이 가장 많은 시트를 써요 */
export async function readTable(file) {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  let wb;
  if (/\.csv$/i.test(file.name) || /^text\//.test(file.type)) {
    // 은행 CSV는 EUC-KR(한글 윈도우)인 경우가 많아요
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('�')) text = new TextDecoder('euc-kr').decode(buf);
    wb = XLSX.read(text.replace(/^﻿/, ''), { type: 'string', cellDates: true, raw: false });
  } else {
    try { wb = XLSX.read(buf, { type: 'array', cellDates: true }); } catch (e) {
      if (/password|encrypt/i.test(String(e && e.message))) throw new Error('비밀번호가 걸린 엑셀이에요. 엑셀에서 열어 비밀번호를 풀고 다시 저장한 뒤 올려 주세요.');
      throw new Error('엑셀 파일을 읽지 못했어요. xlsx, xls, csv 파일인지 확인해 주세요.');
    }
  }
  let best = [];
  wb.SheetNames.forEach((n) => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '', blankrows: false });
    if (rows.length > best.length) best = rows;
  });
  if (!best.length) throw new Error('엑셀에 내용이 없어요.');
  return best.map((r) => r.map((v) => (typeof v === 'string' ? v.trim() : v)));
}

/* ---------- 칸 이름으로 칸 맞추기 ---------- */
const norm = (s) => String(s ?? '').replace(/\s/g, '');
const ROLES = {
  date: { words: ['이용일시', '이용일자', '이용일', '거래일시', '거래일자', '거래일', '승인일시', '승인일자', '승인일', '사용일', '결제일시', '일자', '날짜', '일시'], not: ['예정', '입금일', '청구'] },
  // 통장 내역은 '적요'에 체크카드·이체 같은 종류가, '내용'에 가게 이름이 있는 경우가 많아서 '내용'을 먼저 봐요
  merchant: { words: ['가맹점명', '가맹점', '이용하신곳', '이용처', '사용처', '상호', '거래처', '기재내용', '거래내용', '내용', '받는분', '보낸분', '상대', '적요', '거래설명', '메모'], not: ['가맹점번호', '업종'] },
  amount: { words: ['이용금액', '승인금액', '결제금액', '사용금액', '거래금액', '청구금액', '금액(원)', '금액'], not: ['잔액', '수수료', '할부', '포인트', '해외', '원금', '이자', '예정', '입금'] },
  out: { words: ['출금금액', '출금액', '출금(원)', '출금', '찾으신금액', '지급금액', '보낸금액'], not: [] },
  in: { words: ['입금금액', '입금액', '입금(원)', '입금', '맡기신금액', '받은금액'], not: [] },
  kind: { words: ['승인구분', '거래구분', '취소여부', '상태', '구분', '거래유형', '입출금구분'], not: [] },
};
function roleCol(header, role) {
  const { words, not } = ROLES[role];
  for (const w of words) {
    const i = header.findIndex((h) => { const n = norm(h); return n && n.includes(w) && !not.some((x) => n.includes(x)); });
    if (i >= 0) return i;
  }
  return -1;
}

/** 칸 이름 줄과 칸 맞춤 찾기. 못 찾으면 headerRow -1 */
export function guessLayout(rows) {
  let best = { headerRow: -1, score: 0, map: {} };
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const h = rows[i];
    const map = Object.fromEntries(Object.keys(ROLES).map((r) => [r, roleCol(h, r)]));
    if (map.amount >= 0 && map.amount === map.out) map.amount = -1;
    const score = (map.date >= 0 ? 3 : 0) + (map.amount >= 0 || map.out >= 0 ? 3 : 0) + (map.merchant >= 0 ? 2 : 0) + (map.kind >= 0 ? 1 : 0);
    if (score > best.score) best = { headerRow: i, score, map };
  }
  if (best.score < 6) best.headerRow = -1;   // 날짜와 금액은 꼭 있어야 해요
  return best;
}

/* ---------- 값 읽기 ---------- */
const pad = (n) => String(n).padStart(2, '0');
function todayParts() { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() + 1 }; }

export function parseDate(v) {
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === 'number' && v > 20000 && v < 80000) {   // 엑셀 날짜 숫자
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v ?? '').trim();
  let m = s.match(/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) return ok(2000 + +m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (m) { const t = todayParts(); return ok(+m[1] > t.m ? t.y - 1 : t.y, +m[1], +m[2]); }
  return '';
  function ok(y, mo, d) { return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y > 1990 && y < 2100 ? `${y}-${pad(mo)}-${pad(d)}` : ''; }
}

export function parseAmount(v) {
  if (typeof v === 'number') return Math.round(v);
  const s = String(v ?? '').trim();
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /^△|^▲/.test(s);
  const n = Number(s.replace(/[^\d.]/g, ''));
  return isNaN(n) ? 0 : Math.round(neg ? -n : n);
}

// 기본으로 빼 둘 줄 (이체·충전·카드대금 같은 것. 화면에서 다시 고를 수 있어요)
const TRANSFER = /(이체|송금|ATM|현금인출|카드대금|카드\s*결제대금|오픈뱅킹|토스머니|충전|이자|적금|예금|대출|환전|본인계좌|내계좌)/i;

/**
 * 표 → 가계부 줄. layout: { headerRow, map: { date, merchant, amount, out, in, kind } }
 * 돌려주는 줄: { date, amount, merchant, skip(기본으로 뺄지), note }
 */
export function buildRows(rows, layout) {
  const { headerRow, map } = layout;
  const out = [];
  const cell = (r, c) => (c >= 0 ? r[c] : '');
  // 잔액 칸이 있으면 통장 내역: 금액이 '-4,500'처럼 나오면 출금(지출), '+'면 입금이에요.
  // 잔액 칸이 없으면 카드 내역: 마이너스는 결제 취소예요.
  const head = rows[headerRow] || [];
  const bank = head.some((h) => /잔액/.test(norm(h)));
  const fallbackCols = head.map((h, i) => (i !== map.merchant && /적요|메모|내용/.test(norm(h)) ? i : -1)).filter((i) => i >= 0);
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i];
    const date = parseDate(cell(r, map.date));
    if (!date) continue;   // 합계 줄, 빈 줄
    const kind = String(cell(r, map.kind) || '');
    let amount;
    if (map.out >= 0) {
      amount = Math.abs(parseAmount(cell(r, map.out)));
      if (!amount) continue;   // 입금 줄
    } else {
      amount = parseAmount(cell(r, map.amount));
      if (!amount) continue;
      if (/입금/.test(kind)) continue;
      if (bank) {
        if (/출금|결제|지급/.test(kind)) amount = Math.abs(amount);
        else if (amount < 0) amount = -amount;
        else continue;   // 통장에 들어온 돈
      }
    }
    if (/취소|환불/.test(kind) && amount > 0) amount = -amount;
    // 가게 칸이 비었으면 적요·메모 칸에서 찾아요
    let merchant = String(cell(r, map.merchant) || '').replace(/\s+/g, ' ').trim();
    if (!merchant) merchant = fallbackCols.map((c) => String(r[c] || '').trim()).find(Boolean) || '(내용 없음)';
    const transfer = TRANSFER.test(merchant) || TRANSFER.test(String(fallbackCols.map((c) => r[c]).join(' '))) || /이체|송금/.test(kind);
    out.push({ date, amount, merchant: (amount < 0 && !/취소/.test(merchant) ? '[취소] ' : '') + merchant, skip: transfer, note: transfer ? '이체·충전?' : '' });
  }
  return out;
}

/** 파일 이름으로 결제수단 짐작 */
export function guessPayment(fileName, payments) {
  const n = String(fileName || '');
  const find = (re) => payments.find((p) => re.test(p));
  if (/kbank|k-bank|케이뱅크|k뱅크/i.test(n)) return find(/K\s*뱅크|케이뱅크|kbank/i) || 'K뱅크';   // 'kb'보다 먼저
  if (/kb|국민/i.test(n)) return find(/KB|국민/i) || 'KB카드';
  if (/toss|토스/i.test(n)) return find(/토스/) || '토스';
  return '';
}

/* ---------- 고른 칸 기억하기 (칸 이름 줄이 같은 파일이면 다음에도 같은 칸) ---------- */
const memKey = (header) => 'fb.importMap.' + header.map(norm).join('|').slice(0, 300);
export function rememberLayout(header, map, payment) {
  try { localStorage.setItem(memKey(header), JSON.stringify({ map, payment })); } catch (e) { /* 못 해도 괜찮아요 */ }
}
export function recallLayout(header) {
  try { return JSON.parse(localStorage.getItem(memKey(header)) || 'null'); } catch (e) { return null; }
}
