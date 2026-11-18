// 📒 가족 위키: 분류, 검색, 고정, 공개 범위(가족 모두 / 엄마·아빠만)
import { call } from '../api.js';
import { state, personById, isParent } from '../state.js';
import { esc, modal, armed, toast, fail, ago } from '../ui.js';

// 분류 앞에 붙일 그림 (심플한 화면을 위해 지금은 비워 둠)
const CAT_ICON = {};

export default {
  id: 'wiki', label: '위키', icon: 'wiki',
  mount(root) {
    let pages = null, cat = '전체', q = '';
    root.innerHTML = `<section class="panel">
      <div class="head"><h2>가족 위키</h2><button class="primary" id="newPage">+ 새 쪽</button></div>
      <input id="wq" type="search" placeholder="제목이나 내용으로 찾기" aria-label="위키 검색">
      <div class="chips" id="cats"></div>
      <div class="wiki-grid" id="pages"><div class="sub">불러오는 중…</div></div></section>`;

    function draw() {
      const cats = ['전체', ...state.wikiCategories];
      root.querySelector('#cats').innerHTML = cats.map((c) => `<button data-cat="${esc(c)}" class="${c === cat ? 'on' : ''}">${CAT_ICON[c] || ''} ${esc(c)}</button>`).join('');
      if (!pages) return;
      const k = q.trim().toLowerCase();
      const list = pages
        .filter((p) => cat === '전체' || p.category === cat)
        .filter((p) => !k || (p.title + '\n' + p.body).toLowerCase().includes(k))
        .sort((a, b) => (b.pinned - a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
      root.querySelector('#pages').innerHTML = list.length ? list.map((p) => `
        <button class="wiki-card" data-page="${esc(p.id)}">
          <span class="wtop"><span class="sub">${CAT_ICON[p.category] || ''} ${esc(p.category)}</span>
            ${p.pinned ? '<span class="pin" aria-label="고정">📌</span>' : ''}${p.visibility === '부모' ? '<span class="chip small">엄마·아빠만</span>' : ''}</span>
          <b class="wtitle">${esc(p.title)}</b>
          <span class="wbody">${esc(p.body.slice(0, 140))}</span>
          <span class="sub">${esc(personById(p.by)?.name || '')} · ${esc(ago(p.updatedAt))}</span>
        </button>`).join('')
        : `<div class="empty">${k ? '찾는 내용이 없어요.' : '아직 쪽이 없어요. "+ 새 쪽"으로 연락처나 집 규칙을 적어 보세요.'}</div>`;
    }

    function view(p) {
      const canEdit = !!state.me && (p.visibility !== '부모' || isParent());
      const md = modal(p.title, `<div class="stack">
        <div class="sub">${CAT_ICON[p.category] || ''} ${esc(p.category)} · ${esc(personById(p.by)?.name || '')} · ${esc(ago(p.updatedAt))}${p.visibility === '부모' ? ' · 엄마·아빠만' : ''}</div>
        <div class="wiki-text">${linkify(esc(p.body)) || '<span class="sub">내용이 없어요</span>'}</div>
        ${canEdit ? '<div class="row end"><button class="primary" id="wEdit">고치기</button></div>' : ''}</div>`, { wide: true });
      const b = md.el.querySelector('#wEdit');
      if (b) b.onclick = () => { md.close(); edit(p); };
    }

    function edit(p) {
      if (!state.me) { toast('맨 위에서 누가 쓰는지 먼저 골라 주세요.'); return; }
      const isNew = !p.id;
      const md = modal(isNew ? '새 쪽' : '쪽 고치기', `<form class="stack" id="wForm">
        <label for="wCat">분류</label><select id="wCat">${state.wikiCategories.map((c) => `<option ${c === (p.category || (cat !== '전체' ? cat : '기타')) ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <label for="wTitle">제목</label><input id="wTitle" maxlength="60" required value="${esc(p.title || '')}">
        <label for="wBody">내용</label><textarea id="wBody" rows="12" placeholder="한 줄에 하나씩 적으면 보기 좋아요">${esc(p.body || '')}</textarea>
        <label class="chk"><input type="checkbox" id="wPin" ${p.pinned ? 'checked' : ''}> 맨 위에 고정</label>
        ${isParent() ? `<label for="wVis">공개 범위</label><select id="wVis"><option value="가족">가족 모두</option><option value="부모" ${p.visibility === '부모' ? 'selected' : ''}>엄마·아빠만</option></select>` : ''}
        <p class="sub">비밀번호·계좌번호·주민번호는 적지 마세요.</p>
        <div class="row end">${isNew ? '' : '<button type="button" class="danger" id="wDel">지우기</button>'}<button class="primary">저장</button></div>
      </form>`, { wide: true });
      const f = md.el;
      f.querySelector('#wForm').onsubmit = async (e) => {
        e.preventDefault();
        try {
          const saved = await call('wiki.save', {
            id: p.id, category: f.querySelector('#wCat').value, title: f.querySelector('#wTitle').value, body: f.querySelector('#wBody').value,
            pinned: f.querySelector('#wPin').checked, visibility: f.querySelector('#wVis') ? f.querySelector('#wVis').value : (p.visibility || '가족'),
          });
          pages = pages.filter((x) => x.id !== saved.id).concat(saved);
          md.close(); draw(); toast('저장했어요');
        } catch (err) { fail(err); }
      };
      const del = f.querySelector('#wDel');
      if (del) del.onclick = async () => {
        if (!armed(del, '정말 지울까요?')) return;
        try { await call('wiki.remove', p.id); pages = pages.filter((x) => x.id !== p.id); md.close(); draw(); toast('지웠어요'); } catch (err) { fail(err); }
      };
    }

    root.querySelector('#wq').addEventListener('input', (e) => { q = e.target.value; draw(); });
    root.querySelector('#cats').onclick = (e) => { const b = e.target.closest('[data-cat]'); if (b) { cat = b.dataset.cat; draw(); } };
    root.querySelector('#pages').onclick = (e) => { const b = e.target.closest('[data-page]'); if (b) view(pages.find((x) => x.id === b.dataset.page)); };
    root.querySelector('#newPage').onclick = () => edit({});

    const load = () => call('wiki.list').then((l) => { pages = l; draw(); });
    draw();
    load().catch(fail);
    return { onSync: () => load().catch(() => {}) };
  },
};

function linkify(s) {
  return s.replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}
