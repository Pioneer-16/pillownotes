// ===== 枕书阁 · 移动端 =====
// 依赖：core.js（storage、getAuthHeaders、setAuth、API_BASE）

// ---------- 全局状态 ----------
const M = {
  activeTab: 'notes',
  stacks: {
    notes:    [{ view: 'notebookList' }],
    groups:   [{ view: 'groupList' }],
    settings: [{ view: 'settings' }],
  },
  allNotebooks: [],
  notesCache: {},        // notebook -> notes[]
  globals: null,
  groups: [],
  currentGroupId: null,  // 群组模式（暂共享桌面同一 API 语义，null=个人）
  aiHistory: [],
  aiConfig: {
    apiUrl: localStorage.getItem('zhenshuge_ai_api_url') || '',
    apiKey: localStorage.getItem('zhenshuge_ai_api_key') || '',
    model:  localStorage.getItem('zhenshuge_ai_model')   || 'gpt-3.5-turbo',
  },
};

// ---------- DOM 缓存 ----------
const el = id => document.getElementById(id);
const $stack = () => el('m-stack');
const $topTitle = () => el('m-title');
const $back = () => el('m-back');

// ---------- 工具 ----------
function toast(msg, dur = 1800) {
  const c = el('m-toast-container');
  const t = document.createElement('div');
  t.className = 'm-toast';
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 220); }, dur);
}

function confirmModal(text, { withInput = false, inputValue = '', inputPlaceholder = '' } = {}) {
  return new Promise(resolve => {
    const overlay = el('m-modal-overlay');
    el('m-modal-text').textContent = text;
    const inputWrap = el('m-modal-input-wrap');
    const input = el('m-modal-input');
    if (withInput) {
      inputWrap.hidden = false;
      input.value = inputValue;
      input.placeholder = inputPlaceholder;
      setTimeout(() => input.focus(), 60);
    } else {
      inputWrap.hidden = true;
    }
    overlay.hidden = false;
    const cleanup = () => {
      overlay.hidden = true;
      el('m-modal-confirm').onclick = null;
      el('m-modal-cancel').onclick = null;
    };
    el('m-modal-confirm').onclick = () => {
      const val = withInput ? input.value.trim() : true;
      cleanup();
      resolve(val || false);
    };
    el('m-modal-cancel').onclick = () => { cleanup(); resolve(false); };
  });
}

function renderMarkdown(str) {
  if (!str) return '';
  if (typeof marked !== 'undefined') {
    try { return marked.parse(str); } catch (e) { /* fallback */ }
  }
  return escapeHtml(str).replace(/\n/g, '<br>');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
}

// ---------- 主题 ----------
function initTheme() {
  const saved = localStorage.getItem('zhenshuge_theme');
  const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('zhenshuge_theme', next);
}

// ---------- 认证 ----------
function isLoggedIn() { return !!localStorage.getItem('zhenshuge_auth'); }

function showAuth() {
  el('m-auth-page').hidden = false;
  $stack().style.display = 'none';
  el('m-tabbar').style.display = 'none';
  el('m-topbar').style.visibility = 'hidden';
}
function hideAuth() {
  el('m-auth-page').hidden = true;
  $stack().style.display = '';
  el('m-tabbar').style.display = '';
  el('m-topbar').style.visibility = '';
}

async function doLogin(username, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '登录失败');
  return data;
}

async function doRegister(username, password) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '注册失败');
  return data;
}

function logout() {
  localStorage.removeItem('zhenshuge_auth');
  authToken = '';
  M.allNotebooks = [];
  M.notesCache = {};
  M.stacks.notes = [{ view: 'notebookList' }];
  M.stacks.groups = [{ view: 'groupList' }];
  M.stacks.settings = [{ view: 'settings' }];
  showAuth();
}

// ---------- 栈路由 ----------
function currentFrame() { return M.stacks[M.activeTab].at(-1); }

function render(direction = 'fade') {
  const frame = currentFrame();
  const stack = $stack();
  const oldView = stack.querySelector('.m-view');

  clearFab();

  const newView = document.createElement('div');
  newView.className = 'm-view';
  const enterCls = direction === 'right' ? 'enter-right' : direction === 'left' ? 'enter-left' : 'enter-fade';
  newView.classList.add(enterCls);

  const view = views[frame.view];
  if (view) view.render(newView, frame.params || {});
  else newView.innerHTML = `<div class="m-empty">未知视图：${frame.view}</div>`;

  stack.appendChild(newView);

  if (oldView) {
    const leaveCls = direction === 'right' ? 'leave-left' : direction === 'left' ? 'leave-right' : '';
    if (leaveCls) oldView.classList.add(leaveCls);
    setTimeout(() => oldView.remove(), 260);
  }

  updateChrome(frame);
}

function push(view, params, direction = 'right') {
  M.stacks[M.activeTab].push({ view, params });
  history.pushState({ tab: M.activeTab, depth: M.stacks[M.activeTab].length }, '');
  render(direction);
}

function pop() {
  const stk = M.stacks[M.activeTab];
  if (stk.length > 1) {
    stk.pop();
    render('left');
    return true;
  }
  return false;
}

function switchTab(t) {
  if (M.activeTab === t) return;
  M.activeTab = t;
  document.querySelectorAll('.m-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  render('fade');
}

function updateChrome(frame) {
  const view = views[frame.view];
  const title = (view && view.title) ? view.title(frame.params || {}) : '枕 书 阁';
  $topTitle().textContent = title;
  const stk = M.stacks[M.activeTab];
  $back().hidden = stk.length <= 1;
}

// ---------- 视图定义 ----------
const views = {};

// 全局悬浮按钮：由每个视图声明；render() 会清理
function setFab({ label, onClick }) {
  clearFab();
  const btn = document.createElement('button');
  btn.className = 'm-fab';
  btn.id = 'm-global-fab';
  if (label) btn.setAttribute('aria-label', label);
  btn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  btn.onclick = onClick;
  document.body.appendChild(btn);
}
function clearFab() {
  const old = document.getElementById('m-global-fab');
  if (old) old.remove();
}

// 视图：笔记本列表
views.notebookList = {
  title: () => '笔记本',
  async render(container) {
    container.innerHTML = `<div class="m-view-inner">
      <div class="m-list-heading">我的笔记本</div>
      <ul class="m-nb-list" id="m-nb-list"><li class="m-loading">加载中…</li></ul>
    </div>`;
    setFab({
      label: '新建笔记本',
      onClick: async () => {
        const name = await confirmModal('新建笔记本', { withInput: true, inputPlaceholder: '笔记本名称' });
        if (!name) return;
        try {
          const result = await storage.createNotebook(name);
          if (result && result.success === false) {
            toast(result.error || '创建失败');
            return;
          }
          toast('已创建');
          render('fade');
        } catch (e) { toast('创建失败'); }
      }
    });
    try {
      M.allNotebooks = await storage.getNotebooks();
    } catch (e) {
      container.querySelector('#m-nb-list').innerHTML = `<div class="m-empty">加载失败：${escapeHtml(e.message)}</div>`;
      return;
    }
    // 401/未登录：接口会返回 {error:'需要登录'}
    if (M.allNotebooks && M.allNotebooks.error) {
      logout();
      return;
    }
    if (!Array.isArray(M.allNotebooks)) M.allNotebooks = [];
    const list = container.querySelector('#m-nb-list');
    if (!M.allNotebooks.length) {
      list.innerHTML = `<div class="m-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
        <div>还没有笔记本</div><div style="font-size:12px;margin-top:6px;">点击右下角 + 新建</div>
      </div>`;
    } else {
      list.innerHTML = '';
      M.allNotebooks.forEach(nb => {
        const name = (nb && typeof nb === 'object') ? nb.name : nb;
        if (!name) return;
        const count = (nb && typeof nb === 'object' && nb.count != null) ? nb.count : '';
        const li = document.createElement('li');
        li.className = 'm-nb-row';
        li.dataset.name = name;
        li.innerHTML = `<span class="m-nb-name">${escapeHtml(name)}</span>
          ${count !== '' ? `<span class="m-nb-count">${count}</span>` : ''}
          <svg class="m-nb-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
        list.appendChild(li);
        attachTapAndLongPress(li, {
          onTap: () => push('notebookDetail', { notebook: name }, 'right'),
          onLongPress: () => enterReorderMode(list, li),
        });
      });
    }
  }
};

// 视图：笔记本详情（笔记列表）
views.notebookDetail = {
  title: (p) => p.notebook || '笔记',
  async render(container, params) {
    const { notebook } = params;
    container.innerHTML = `<div class="m-view-inner">
      <div class="m-list-heading">${escapeHtml(notebook)}</div>
      <div id="m-notes-list"><div class="m-loading">加载中…</div></div>
    </div>`;
    setFab({
      label: '新建笔记',
      onClick: () => push('noteEdit', { notebook, note: null }, 'right'),
    });
    let notes = [];
    try {
      notes = await storage.getNotes(notebook, M.currentGroupId);
      M.notesCache[notebook] = notes;
    } catch (e) {
      container.querySelector('#m-notes-list').innerHTML = `<div class="m-empty">加载失败</div>`;
      return;
    }
    const list = container.querySelector('#m-notes-list');
    if (!notes.length) {
      list.innerHTML = `<div class="m-empty">笔记本还是空的<br><span style="font-size:12px;color:var(--color-ink-ghost);">点击右下角 + 新增第一条</span></div>`;
    } else {
      list.innerHTML = '';
      notes.forEach(n => list.appendChild(renderNoteCard(n)));
    }
  }
};

function renderNoteCard(note) {
  const card = document.createElement('div');
  card.className = 'm-note-card';
  card.dataset.id = note.id;
  const title = note.title || note.book || (note.content ? String(note.content).slice(0, 32) : '（无标题）');
  const meta = [note.book, note.dynasty, note.page ? 'P' + note.page : ''].filter(Boolean).join(' · ');
  const body = renderMarkdown(note.content || '');
  const quote = note.quote ? `<div class="m-note-quote">${escapeHtml(note.quote)}</div>` : '';
  card.innerHTML = `
    <div class="m-note-card-header">
      <div class="m-note-title">${escapeHtml(title)}</div>
    </div>
    ${meta ? `<div class="m-note-meta">${escapeHtml(meta)}</div>` : ''}
    <div class="m-note-body">${body}</div>
    ${quote}
    <div class="m-note-footer">
      <button class="m-note-refs-btn" data-act="refs">关联引用</button>
      <button class="m-note-refs-btn" data-act="edit">编辑</button>
      <button class="m-note-refs-btn" data-act="delete" style="color:var(--color-danger)">删除</button>
    </div>`;
  card.querySelector('[data-act="refs"]').onclick = () => push('refColumn', { note }, 'right');
  card.querySelector('[data-act="edit"]').onclick = () => push('noteEdit', { notebook: note.notebooks?.[0] || note.notebook, note }, 'right');
  card.querySelector('[data-act="delete"]').onclick = async () => {
    if (await confirmModal(`删除这条笔记？`)) {
      try {
        await storage.deleteNote(note.id, M.currentGroupId);
        toast('已删除');
        card.remove();
      } catch (e) { toast('删除失败'); }
    }
  };
  return card;
}

// 视图：笔记编辑
views.noteEdit = {
  title: (p) => p.note ? '编辑笔记' : '新增笔记',
  render(container, params) {
    const { notebook, note } = params;
    const isNew = !note;
    const initial = note || { content: '', book: '', dynasty: '', page: '', quote: '' };
    container.innerHTML = `<div class="m-view-inner">
      <div class="m-editor">
        <div class="m-editor-field">
          <label class="m-editor-label">正文</label>
          <textarea class="m-editor-textarea" id="m-ne-content" placeholder="笔记正文…">${escapeHtml(initial.content || '')}</textarea>
        </div>
        <div class="m-editor-field">
          <label class="m-editor-label">书名</label>
          <input class="m-input" id="m-ne-book" value="${escapeHtml(initial.book || '')}" placeholder="书名">
        </div>
        <div class="m-editor-field">
          <label class="m-editor-label">朝代 / 时间</label>
          <input class="m-input" id="m-ne-dynasty" value="${escapeHtml(initial.dynasty || '')}" placeholder="朝代">
        </div>
        <div class="m-editor-field">
          <label class="m-editor-label">页码</label>
          <input class="m-input" id="m-ne-page" inputmode="numeric" value="${escapeHtml(initial.page || '')}" placeholder="页码">
        </div>
        <div class="m-editor-field">
          <label class="m-editor-label">引用原文</label>
          <textarea class="m-editor-textarea" id="m-ne-quote" placeholder="引用原文…">${escapeHtml(initial.quote || '')}</textarea>
        </div>
        <div class="m-editor-actions">
          <button class="m-btn-secondary" id="m-ne-cancel">取消</button>
          <button class="m-btn-primary" id="m-ne-save">保存</button>
        </div>
      </div>
    </div>`;
    container.querySelector('#m-ne-cancel').onclick = () => pop();
    container.querySelector('#m-ne-save').onclick = async () => {
      const payload = {
        content:  container.querySelector('#m-ne-content').value.trim(),
        book:     container.querySelector('#m-ne-book').value.trim(),
        dynasty:  container.querySelector('#m-ne-dynasty').value.trim(),
        page:     container.querySelector('#m-ne-page').value.trim(),
        quote:    container.querySelector('#m-ne-quote').value.trim(),
      };
      if (!payload.content) { toast('请输入正文'); return; }
      try {
        if (isNew) {
          const id = 'n_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          const now = new Date().toISOString();
          await storage.createNote({ id, ...payload, notebooks: [notebook], createdAt: now, updatedAt: now }, M.currentGroupId);
        } else {
          await storage.updateNote({ ...note, ...payload, updatedAt: new Date().toISOString() }, M.currentGroupId);
        }
        toast('已保存');
        pop();
      } catch (e) { toast('保存失败'); }
    };
  }
};

// 视图：关联引用列
views.refColumn = {
  title: () => '关联引用',
  async render(container, params) {
    const { note } = params;
    container.innerHTML = `<div class="m-view-inner">
      <div class="m-ref-title">来源笔记</div>
      <div class="m-ref-source">${escapeHtml((note.content || '').slice(0, 120))}${(note.content || '').length > 120 ? '…' : ''}</div>
      <div class="m-list-heading">关联的笔记</div>
      <div id="m-refs-list"><div class="m-loading">加载中…</div></div>
    </div>`;
    let refs = { outgoing: [], incoming: [] };
    try {
      refs = await storage.getRefs(note.id);
    } catch (e) {
      container.querySelector('#m-refs-list').innerHTML = `<div class="m-empty">加载失败</div>`;
      return;
    }
    // storage.getRefs 返回 { outgoing: Note[], incoming: Note[] }；合并去重
    const uniqueMap = new Map();
    [...(refs.outgoing || []), ...(refs.incoming || [])].forEach(r => {
      if (r && r.id && !uniqueMap.has(r.id)) uniqueMap.set(r.id, r);
    });
    const list = container.querySelector('#m-refs-list');
    if (!uniqueMap.size) {
      list.innerHTML = `<div class="m-empty">还没有关联引用</div>`;
      return;
    }
    list.innerHTML = '';
    uniqueMap.forEach(target => {
      list.appendChild(renderNoteCard(target));
    });
  }
};

// 视图：群组列表
views.groupList = {
  title: () => '群组',
  async render(container) {
    container.innerHTML = `<div class="m-view-inner">
      <div class="m-group-tabs">
        <button class="m-group-tab active" data-t="mine">我的群组</button>
        <button class="m-group-tab" data-t="join">加入</button>
        <button class="m-group-tab" data-t="create">创建</button>
      </div>
      <div id="m-group-panel"></div>
    </div>`;
    const panel = container.querySelector('#m-group-panel');
    const showTab = async (t) => {
      container.querySelectorAll('.m-group-tab').forEach(b => b.classList.toggle('active', b.dataset.t === t));
      if (t === 'mine') {
        panel.innerHTML = '<div class="m-loading">加载中…</div>';
        try {
          const groups = await storage.getGroups();
          M.groups = groups || [];
          if (!M.groups.length) {
            panel.innerHTML = '<div class="m-empty">还没加入任何群组</div>';
          } else {
            panel.innerHTML = '';
            M.groups.forEach(g => {
              const row = document.createElement('div');
              row.className = 'm-group-row';
              row.innerHTML = `<div><div class="m-group-row-name">${escapeHtml(g.name)}</div>
                <div class="m-group-row-meta">邀请码 ${escapeHtml(g.invite_code || g.inviteCode || '—')}</div></div>`;
              panel.appendChild(row);
            });
          }
        } catch (e) { panel.innerHTML = '<div class="m-empty">加载失败</div>'; }
      } else if (t === 'join') {
        panel.innerHTML = `<div class="m-editor">
          <input class="m-input" id="m-join-code" placeholder="输入邀请码">
          <button class="m-btn-primary" id="m-join-confirm">加入群组</button>
        </div>`;
        panel.querySelector('#m-join-confirm').onclick = async () => {
          const code = panel.querySelector('#m-join-code').value.trim();
          if (!code) return;
          try {
            const r = await storage.joinGroup(code);
            if (r && r.error) { toast(r.error); return; }
            toast('已加入'); showTab('mine');
          } catch (e) { toast('加入失败'); }
        };
      } else if (t === 'create') {
        panel.innerHTML = `<div class="m-editor">
          <input class="m-input" id="m-create-name" placeholder="群组名称">
          <button class="m-btn-primary" id="m-create-confirm">创建群组</button>
        </div>`;
        panel.querySelector('#m-create-confirm').onclick = async () => {
          const name = panel.querySelector('#m-create-name').value.trim();
          if (!name) return;
          try {
            const r = await storage.createGroup(name);
            if (r && r.error) { toast(r.error); return; }
            toast('已创建'); showTab('mine');
          } catch (e) { toast('创建失败'); }
        };
      }
    };
    container.querySelectorAll('.m-group-tab').forEach(b => b.onclick = () => showTab(b.dataset.t));
    showTab('mine');
  }
};

// 视图：设置
views.settings = {
  title: () => '设置',
  render(container) {
    const uname = localStorage.getItem('zhenshuge_username') || '';
    container.innerHTML = `<div class="m-view-inner">
      <div class="m-setting-section">
        <div class="m-setting-row" data-act="account">
          <div class="m-setting-label">账户</div>
          <div class="m-setting-value">${escapeHtml(uname || '已登录')}</div>
        </div>
        <div class="m-setting-row" data-act="theme">
          <div class="m-setting-label">主题</div>
          <div class="m-setting-value" id="m-set-theme-val">—</div>
        </div>
        <div class="m-setting-row" data-act="ai">
          <div class="m-setting-label">AI 配置</div>
          <div class="m-setting-value">配置 API</div>
        </div>
      </div>
      <div class="m-setting-section">
        <div class="m-setting-row" data-act="logout">
          <div class="m-setting-label" style="color:var(--color-danger)">退出登录</div>
        </div>
      </div>
    </div>`;
    const themeVal = () => document.documentElement.getAttribute('data-theme') === 'dark' ? '深色' : '浅色';
    container.querySelector('#m-set-theme-val').textContent = themeVal();
    container.querySelectorAll('.m-setting-row').forEach(row => {
      row.onclick = async () => {
        const act = row.dataset.act;
        if (act === 'theme') { toggleTheme(); container.querySelector('#m-set-theme-val').textContent = themeVal(); }
        else if (act === 'logout') {
          if (await confirmModal('确认退出登录？')) logout();
        } else if (act === 'ai') {
          openAI();
          el('m-ai-settings').hidden = false;
        }
      };
    });
  }
};

// ---------- 长按 & 拖动排序 ----------
function attachTapAndLongPress(node, { onTap, onLongPress }) {
  let timer = null, longFired = false, startX = 0, startY = 0, moved = false;
  node.addEventListener('touchstart', e => {
    longFired = false; moved = false;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    timer = setTimeout(() => {
      longFired = true;
      if (navigator.vibrate) navigator.vibrate(30);
      onLongPress && onLongPress();
    }, 500);
  }, { passive: true });
  node.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      moved = true;
      if (timer) { clearTimeout(timer); timer = null; }
    }
  }, { passive: true });
  node.addEventListener('touchend', () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!longFired && !moved) onTap && onTap();
  });
  node.addEventListener('touchcancel', () => {
    if (timer) { clearTimeout(timer); timer = null; }
  });
  // 桌面回退（?force=mobile 在 PC 上测试用）
  node.addEventListener('click', e => {
    if ('ontouchstart' in window) return; // 触屏走 touchend
    onTap && onTap();
  });
}

function enterReorderMode(list, initialRow) {
  // 简易实现：为每个 row 绑定拖动，touchmove 定位到 elementFromPoint 邻近 row，插入 DOM
  const rows = Array.from(list.querySelectorAll('.m-nb-row'));
  let dragging = initialRow;
  dragging.classList.add('dragging');

  const onMove = e => {
    if (!dragging) return;
    e.preventDefault();
    const t = e.touches[0];
    const target = document.elementFromPoint(t.clientX, t.clientY)?.closest('.m-nb-row');
    if (target && target !== dragging && target.parentNode === list) {
      const rect = target.getBoundingClientRect();
      const before = (t.clientY - rect.top) < rect.height / 2;
      list.insertBefore(dragging, before ? target : target.nextSibling);
    }
  };
  const onEnd = async () => {
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    document.removeEventListener('touchcancel', onEnd);
    dragging.classList.remove('dragging');
    dragging = null;
    // 提交顺序
    const newOrder = Array.from(list.querySelectorAll('.m-nb-row')).map(r => r.dataset.name);
    try {
      const cur = await storage.getGlobals();
      cur.notebooks = newOrder;
      await storage.saveGlobals(cur);
      toast('已保存排序');
    } catch (e) { toast('保存失败'); }
  };
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
  document.addEventListener('touchcancel', onEnd);
}

// ---------- AI 覆盖层 ----------
function openAI() {
  const ov = el('m-ai-overlay');
  ov.classList.remove('closing');
  ov.hidden = false;
  el('m-ai-api-url').value = M.aiConfig.apiUrl;
  el('m-ai-api-key').value = M.aiConfig.apiKey;
  el('m-ai-model').value = M.aiConfig.model;
  if (!M.aiHistory.length) {
    el('m-ai-messages').innerHTML = `<div class="m-ai-msg m-ai-msg-system">你好！我是 AI 助手，可以帮你回答关于笔记的问题。</div>`;
  }
}
function closeAI() {
  const ov = el('m-ai-overlay');
  ov.classList.add('closing');
  setTimeout(() => { ov.hidden = true; ov.classList.remove('closing'); }, 220);
}

async function sendAI() {
  const input = el('m-ai-input');
  const msg = input.value.trim();
  if (!msg) return;
  if (!M.aiConfig.apiUrl || !M.aiConfig.apiKey) {
    toast('请先在 AI 设置中配置 API');
    el('m-ai-settings').hidden = false;
    return;
  }
  input.value = ''; input.style.height = '';
  appendAIMsg('user', msg);
  M.aiHistory.push({ role: 'user', content: msg });
  const sendBtn = el('m-ai-send');
  sendBtn.disabled = true;
  try {
    const res = await fetch(M.aiConfig.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + M.aiConfig.apiKey },
      body: JSON.stringify({ model: M.aiConfig.model, messages: M.aiHistory })
    });
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || data.error?.message || '（无响应）';
    appendAIMsg('assistant', reply);
    M.aiHistory.push({ role: 'assistant', content: reply });
  } catch (e) {
    appendAIMsg('assistant', '请求失败：' + e.message);
  } finally {
    sendBtn.disabled = false;
  }
}
function appendAIMsg(role, content) {
  const wrap = el('m-ai-messages');
  const div = document.createElement('div');
  div.className = 'm-ai-msg m-ai-msg-' + role;
  div.innerHTML = renderMarkdown(content);
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

// ---------- 认证 UI ----------
function bindAuthUI() {
  document.querySelectorAll('.m-auth-tab').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.m-auth-tab').forEach(x => x.classList.toggle('active', x === b));
      el('m-login-form').hidden = b.dataset.tab !== 'login';
      el('m-register-form').hidden = b.dataset.tab !== 'register';
    };
  });
  el('m-login-confirm').onclick = async () => {
    const u = el('m-login-username').value.trim();
    const p = el('m-login-password').value;
    if (!u || !p) return;
    const err = el('m-login-error');
    err.hidden = true;
    try {
      const data = await doLogin(u, p);
      setAuth(data.token);
      localStorage.setItem('zhenshuge_username', u);
      hideAuth();
      initApp();
    } catch (e) { err.textContent = e.message; err.hidden = false; }
  };
  el('m-register-confirm').onclick = async () => {
    const u = el('m-register-username').value.trim();
    const p = el('m-register-password').value;
    const p2 = el('m-register-password-confirm').value;
    const err = el('m-register-error');
    err.hidden = true;
    if (!u || u.length < 2) { err.textContent = '用户名需 2 个字符以上'; err.hidden = false; return; }
    if (!p || p.length < 6) { err.textContent = '密码至少 6 位'; err.hidden = false; return; }
    if (p !== p2) { err.textContent = '两次输入的密码不一致'; err.hidden = false; return; }
    try {
      const data = await doRegister(u, p);
      setAuth(data.token);
      localStorage.setItem('zhenshuge_username', u);
      hideAuth();
      initApp();
    } catch (e) { err.textContent = e.message; err.hidden = false; }
  };
}

// ---------- 全局事件绑定 ----------
function bindGlobalUI() {
  el('m-back').onclick = () => pop();
  el('m-btn-theme').onclick = toggleTheme;
  el('m-btn-ai').onclick = () => openAI();
  el('m-ai-close').onclick = () => closeAI();
  el('m-ai-settings-toggle').onclick = () => {
    const s = el('m-ai-settings');
    s.hidden = !s.hidden;
  };
  el('m-ai-save-config').onclick = () => {
    M.aiConfig.apiUrl = el('m-ai-api-url').value.trim();
    M.aiConfig.apiKey = el('m-ai-api-key').value.trim();
    M.aiConfig.model  = el('m-ai-model').value.trim() || 'gpt-3.5-turbo';
    localStorage.setItem('zhenshuge_ai_api_url', M.aiConfig.apiUrl);
    localStorage.setItem('zhenshuge_ai_api_key', M.aiConfig.apiKey);
    localStorage.setItem('zhenshuge_ai_model',   M.aiConfig.model);
    toast('已保存');
    el('m-ai-settings').hidden = true;
  };
  el('m-ai-send').onclick = sendAI;
  el('m-ai-input').addEventListener('input', e => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px';
  });
  el('m-ai-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
      e.preventDefault(); sendAI();
    }
  });
  document.querySelectorAll('.m-tab').forEach(b => {
    b.onclick = () => switchTab(b.dataset.tab);
  });
  window.addEventListener('popstate', () => {
    if (!el('m-ai-overlay').hidden) { closeAI(); history.pushState({}, ''); return; }
    if (!pop()) {
      // 已在栈底，不做处理（避免 iOS Safari 返回退出）
      history.pushState({}, '');
    }
  });
}

// ---------- 初始化 ----------
function initApp() {
  render('fade');
  // 初始 pushState 占位一次，使浏览器返回不会直接离开
  history.replaceState({ tab: M.activeTab, depth: 1 }, '');
}

function boot() {
  initTheme();
  bindGlobalUI();
  bindAuthUI();
  if (!isLoggedIn()) {
    showAuth();
  } else {
    hideAuth();
    initApp();
  }
}

document.addEventListener('DOMContentLoaded', boot);
