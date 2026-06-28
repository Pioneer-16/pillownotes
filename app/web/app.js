// ===== 枕书阁 - Web 版 =====
// 数据存储在单一 notes.json，通过 notebooks 数组字段做 tag 分类

const API_BASE = window.location.origin;

// ===== 存储 API =====
const storage = {
  async getNotebooks() {
    const res = await fetch(`${API_BASE}/api/notebooks`);
    return await res.json();
  },

  async getNotes(notebook) {
    const url = notebook
      ? `${API_BASE}/api/notes?notebook=${encodeURIComponent(notebook)}`
      : `${API_BASE}/api/notes`;
    const res = await fetch(url);
    return await res.json();
  },

  async getAllNotes() {
    const res = await fetch(`${API_BASE}/api/notes`);
    return await res.json();
  },

  async saveAllNotes(notes) {
    await fetch(`${API_BASE}/api/notes`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ notes })
    });
  },

  async createNote(note) {
    await fetch(`${API_BASE}/api/notes/${encodeURIComponent(note.id)}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(note)
    });
  },

  async updateNote(note) {
    await fetch(`${API_BASE}/api/notes/${encodeURIComponent(note.id)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(note)
    });
  },

  async createNotebook(name) {
    const res = await fetch(`${API_BASE}/api/notebooks`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name })
    });
    return await res.json();
  },

  async deleteNotebook(name) {
    await fetch(`${API_BASE}/api/notebooks/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
  },

  async getGlobals() {
    const res = await fetch(`${API_BASE}/api/globals`);
    return await res.json();
  },

  async saveGlobals(data) {
    await fetch(`${API_BASE}/api/globals`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
  },

  async searchNotes(q) {
    const res = await fetch(`${API_BASE}/api/notes/search?q=${encodeURIComponent(q)}`);
    return await res.json();
  },

  async deleteNote(id) {
    await fetch(`${API_BASE}/api/notes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
  },

  async filterNotes(filters) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v);
    }
    const res = await fetch(`${API_BASE}/api/notes/filter?${params}`);
    return await res.json();
  },

  async getRefs(noteId) {
    const res = await fetch(`${API_BASE}/api/refs?noteId=${encodeURIComponent(noteId)}`);
    return await res.json();
  },

  async addRef(sourceId, targetId, type) {
    await fetch(`${API_BASE}/api/refs`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ sourceId, targetId, type })
    });
  },

  async removeRef(sourceId, targetId) {
    await fetch(`${API_BASE}/api/refs`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      body: JSON.stringify({ sourceId, targetId })
    });
  },

  async deleteImage(url) {
    const filename = url.split('/').pop();
    await fetch(`${API_BASE}/api/images/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
  },

  async getAllRefs() {
    const res = await fetch(`${API_BASE}/api/refs/all`);
    return await res.json();
  },

  async importRefs(refs) {
    for (const r of refs) {
      await fetch(`${API_BASE}/api/refs`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ sourceId: r.source_id, targetId: r.target_id, type: r.type })
      });
    }
  }
};

// ===== 认证 =====
let authToken = localStorage.getItem('zhenshuge_auth') || '';

function getAuthHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (authToken) h['X-Auth-Token'] = authToken;
  return h;
}

function setAuth(token) {
  authToken = token;
  localStorage.setItem('zhenshuge_auth', token);
  document.body.classList.add('auth-unlocked');
}

function clearAuth() {
  authToken = '';
  localStorage.removeItem('zhenshuge_auth');
  document.body.classList.remove('auth-unlocked');
}

// ===== 状态 =====
let currentNotebook = null;
let notes = [];
let allNotebooks = [];
let globals = { books: [], dynasties: [], lastBook: '', lastDynasty: '', fieldComponents: [], cardTemplates: [], notebookTemplates: {} };
let searchMode = false;
let navigatingToNote = false;
let activeFilters = {};
let originalNotes = null;

// ===== 模板数据层 =====
function getActiveTemplate() {
  const templateId = globals.notebookTemplates?.[currentNotebook] || 'default';
  return (globals.cardTemplates || []).find(t => t.id === templateId) || getDefaultTemplate();
}

function getDefaultTemplate() {
  return { id: 'default', name: '古籍笔记', fieldIds: ['content', 'book', 'page', 'dynasty', 'quote'] };
}

function getComponentById(id) {
  return (globals.fieldComponents || []).find(c => c.id === id);
}

function ensureTemplateDefaults() {
  const defaultComponents = [
    { id: 'content', type: 'textarea', label: '正文', placeholder: '笔记正文…', config: { hasTable: true } },
    { id: 'book', type: 'dropdown', label: '书名', placeholder: '书名', config: { display: 'bookname' } },
    { id: 'page', type: 'number', label: '页码', placeholder: '页码', config: { format: 'P000' } },
    { id: 'dynasty', type: 'dropdown', label: '朝代 / 时间', placeholder: '朝代', config: {} },
    { id: 'quote', type: 'textarea', label: '引用', placeholder: '引用原文…', config: { hasTable: true, isQuote: true } }
  ];
  const defaultIds = new Set(defaultComponents.map(c => c.id));

  if (!globals.fieldComponents || globals.fieldComponents.length === 0) {
    globals.fieldComponents = defaultComponents;
  } else {
    // 只补充缺失的默认组件，不覆盖用户已有的修改
    const existingIds = new Set(globals.fieldComponents.map(c => c.id));
    const missing = defaultComponents.filter(c => !existingIds.has(c.id));
    if (missing.length > 0) globals.fieldComponents.push(...missing);
  }
  if (!globals.cardTemplates || globals.cardTemplates.length === 0) {
    globals.cardTemplates = [getDefaultTemplate()];
  }
  if (!globals.notebookTemplates) {
    globals.notebookTemplates = {};
  }

  // 迁移旧的 book/dynasty 数据到通用格式
  if (globals.books && !globals.dropdown_book) {
    globals.dropdown_book = globals.books;
  }
  if (globals.dynasties && !globals.dropdown_dynasty) {
    globals.dropdown_dynasty = globals.dynasties;
  }
  if (globals.lastBook && !globals.last_book) {
    globals.last_book = globals.lastBook;
  }
  if (globals.lastDynasty && !globals.last_dynasty) {
    globals.last_dynasty = globals.lastDynasty;
  }
  delete globals.books;
  delete globals.dynasties;
  delete globals.lastBook;
  delete globals.lastDynasty;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getNoteSummary(note, maxLen = 30) {
  const tpl = getActiveTemplate();
  for (const fid of tpl.fieldIds) {
    const comp = getComponentById(fid);
    if (!comp || comp.type === 'number' || comp.type === 'date' || comp.type === 'rating') continue;
    const val = note[fid];
    if (val) return String(val).substring(0, maxLen);
  }
  return '';
}

function showToast(message, type = 'error') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, 2500);
}

// ===== DOM =====
const fileList = document.getElementById('file-list');
const notesView = document.getElementById('notes-view');
const notesList = document.getElementById('notes-list');
const fileTitle = document.getElementById('file-title');
const placeholder = document.getElementById('placeholder');
const modalOverlay = document.getElementById('modal-overlay');
const modalText = document.getElementById('modal-text');
const modalConfirm = document.getElementById('modal-confirm');
const modalCancel = document.getElementById('modal-cancel');
const searchInput = document.getElementById('search-input');
const searchClear = document.getElementById('search-clear');

let modalResolve = null;

// ===== 初始化 =====
async function init() {
  loadTheme();
  if (authToken) {
    try {
      const res = await fetch(`${API_BASE}/api/auth/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': authToken }
      });
      if (res.ok) {
        document.body.classList.add('auth-unlocked');
      } else {
        clearAuth();
      }
    } catch (e) { clearAuth(); }
  } else {
    try {
      const res = await fetch(`${API_BASE}/api/auth/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': '' }
      });
      if (res.ok) {
        document.body.classList.add('auth-unlocked');
      }
    } catch (e) {}
  }
  globals = await storage.getGlobals();
  ensureTemplateDefaults();
  await loadFiles();
  setupEvents();
  setupSearch();
  setupFilter();
}

// ===== 主题 =====
function loadTheme() {
  const saved = localStorage.getItem('zhenshuge_theme');
  if (saved === 'auto' || !saved) {
    // 跟随系统
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme-mode', 'auto');
  } else {
    document.documentElement.setAttribute('data-theme', saved);
    document.documentElement.setAttribute('data-theme-mode', saved);
  }

  // 监听系统主题变化
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const mode = document.documentElement.getAttribute('data-theme-mode');
    if (mode === 'auto') {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    }
  });
}

function toggleTheme() {
  const currentMode = document.documentElement.getAttribute('data-theme-mode') || 'auto';
  let nextMode;
  if (currentMode === 'auto') {
    nextMode = 'light';
  } else if (currentMode === 'light') {
    nextMode = 'dark';
  } else {
    nextMode = 'auto';
  }

  document.documentElement.setAttribute('data-theme-mode', nextMode);
  localStorage.setItem('zhenshuge_theme', nextMode);

  if (nextMode === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', nextMode);
  }
}

// ===== 笔记本列表 =====
async function loadFiles() {
  const notebooks = await storage.getNotebooks();
  allNotebooks = notebooks;
  fileList.innerHTML = notebooks.map(nb => `
    <li class="file-item ${nb.name === currentNotebook ? 'active' : ''}" data-name="${escapeHtml(nb.name)}" draggable="true">
      <span class="file-item-drag">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
      </span>
      <span class="file-item-name">${escapeHtml(nb.name)}</span>
      <span class="file-item-count">${nb.count || 0}</span>
      <button class="file-item-delete" data-name="${escapeHtml(nb.name)}" title="删除">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
      </button>
    </li>
  `).join('');
  setupDragSort();
}

// ===== 拖拽排序 =====
function setupDragSort() {
  let dragItem = null;

  fileList.querySelectorAll('.file-item[draggable]').forEach(item => {
    item.addEventListener('dragstart', (e) => {
      dragItem = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      dragItem = null;
      document.querySelectorAll('.file-item.drag-over').forEach(el => el.classList.remove('drag-over'));
      saveFileOrder();
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (item !== dragItem) {
        item.classList.add('drag-over');
      }
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over');
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      item.classList.remove('drag-over');
      if (item !== dragItem && dragItem) {
        const items = [...fileList.querySelectorAll('.file-item[draggable]')];
        const fromIndex = items.indexOf(dragItem);
        const toIndex = items.indexOf(item);
        if (fromIndex < toIndex) {
          item.after(dragItem);
        } else {
          item.before(dragItem);
        }
      }
    });
  });
}

async function saveFileOrder() {
  const items = [...fileList.querySelectorAll('.file-item[draggable]')];
  const order = items.map(item => item.dataset.name);
  const data = globals;
  data.notebooks = order;
  await storage.saveGlobals(data);
}

// ===== 打开笔记本 =====
async function openNotebook(name) {
  currentNotebook = name;
  notes = await storage.getNotes(name);
  activeFilters = {};
  originalNotes = null;
  document.getElementById('filter-tags').style.display = 'none';
  document.getElementById('filter-panel').style.display = 'none';
  document.getElementById('btn-filter').classList.remove('active');
  fileTitle.textContent = name;
  placeholder.style.display = 'none';
  notesView.style.display = 'flex';
  renderNotes();
  loadNoteRefs();
  await loadFiles();
}

// ===== 渲染笔记 =====
function renderNotes() {
  if (notes.length === 0) {
    notesList.innerHTML = '<p class="empty-hint">暂无笔记，点击「新增」添加第一条</p>';
    return;
  }

  const template = getActiveTemplate();

  notes.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  notesList.innerHTML = notes.map((note, i) => {
    const hasContent = template.fieldIds.some(fid => {
      const val = note[fid];
      return val !== undefined && val !== null && val !== '';
    });
    if (!hasContent) {
      return `<div class="note-card note-card-empty" data-index="${i}" style="animation-delay: 0s"></div>`;
    }
    const tags = (note.notebooks || []).filter(t => t !== currentNotebook);
    const tagsHtml = tags.length ? `<div class="note-tags">${tags.map(t => `<span class="note-tag" data-notebook="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('')}</div>` : '';
    const { html: fieldsHtml, quoteFields, urlFields } = renderCardFields(note, template, false);
    const hasQuote = quoteFields.length > 0;
    const hasUrl = urlFields.length > 0;
    const quoteToggles = quoteFields.map(qf =>
      `<div class="note-quote-toggle" data-action="toggle-quote" data-index="${i}" data-quote-id="${qf.id}" data-tooltip="${escapeHtml(qf.label)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></div>`
    ).join('');
    const urlLinks = urlFields.map(uf =>
      `<a class="toolbar-url" href="${escapeHtml(uf.val)}" target="_blank" rel="noopener" data-tooltip="${escapeHtml(uf.val)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></a>`
    ).join('');
    return `
    <div class="note-card" data-index="${i}" style="animation-delay: ${Math.min(i * 0.05, 0.25)}s">
      <div class="note-card-body">
        ${fieldsHtml}
        ${tagsHtml}
      </div>
      <div class="note-card-toolbar ${hasQuote || hasUrl ? '' : 'no-quote'}">
        <div class="toolbar-left">
          ${quoteToggles}
          ${urlLinks}
        </div>
        <div class="toolbar-right">
          <button class="icon-btn-sm ref-btn" data-action="refs" data-index="${i}" title="引用" style="display:${note._hasOutgoingRefs ? '' : 'none'}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
          </button>
          <button class="icon-btn-sm" data-action="edit" data-index="${i}" title="编辑">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn-sm danger" data-action="delete" data-index="${i}" title="删除">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  `}).join('');

  document.querySelectorAll('.note-card-empty').forEach(card => {
    const index = parseInt(card.dataset.index);
    editNote(index);
  });
}

let loadNoteRefsVersion = 0;

async function loadNoteRefs() {
  const ver = ++loadNoteRefsVersion;
  const list = notes;
  await Promise.all(list.map(async (note) => {
    if (!note?.id) return;
    try {
      const refs = await storage.getRefs(note.id);
      note._hasOutgoingRefs = refs.outgoing.length > 0;
    } catch (e) { note._hasOutgoingRefs = false; }
  }));
  if (ver !== loadNoteRefsVersion) return;
  document.querySelectorAll('.ref-btn[data-index]').forEach(btn => {
    const idx = parseInt(btn.dataset.index);
    btn.style.display = list[idx]?._hasOutgoingRefs ? '' : 'none';
  });
}

function renderCardFields(note, template, isSearch, q) {
  let html = '';
  const sourceParts = [];
  const quoteFields = [];
  const urlFields = [];

  for (const fieldId of template.fieldIds) {
    const comp = getComponentById(fieldId);
    if (!comp) continue;
    const val = note[fieldId];
    if (!val && val !== 0) continue;

    if (comp.type === 'textarea') {
      const isQuote = comp.config?.isQuote;
      const isCode = comp.config?.isCode;
      let rendered;
      if (isQuote) {
        rendered = renderQuote(val);
      } else if (isCode) {
        rendered = `<pre><code>${escapeHtml(val)}</code></pre>`;
      } else {
        rendered = renderContent(val);
      }
      const content = isSearch ? highlightHtml(rendered, q) : rendered;
      if (isQuote) {
        quoteFields.push({ id: fieldId, label: comp.label });
        html += `<div class="note-quote collapsed" data-quote-id="${fieldId}"><div class="note-quote-content">${content}</div></div>`;
      } else {
        html += `<div class="note-text">${content}</div>`;
      }
    } else if (comp.type === 'rating') {
      const rating = parseInt(val) || 0;
      let stars = '';
      for (let s = 1; s <= 5; s++) {
        stars += `<span class="rating-star-display ${s <= rating ? 'active' : ''}">★</span>`;
      }
      sourceParts.push(stars);
    } else if (comp.type === 'url') {
      const urls = val ? val.split('\n').filter(Boolean) : [];
      urls.forEach(u => urlFields.push({ id: fieldId, label: comp.label, val: u }));
    } else {
      let displayVal = escapeHtml(String(val));
      if (isSearch) displayVal = highlightHtml(displayVal, q);
      if (comp.config?.display === 'bookname') {
        sourceParts.push(`《${displayVal}》`);
      } else if (comp.type === 'number' && comp.config?.format) {
        sourceParts.push(escapeHtml(formatNumberField(String(val), comp.config.format)));
      } else if (comp.type === 'date' && comp.config?.format) {
        sourceParts.push(escapeHtml(formatDateField(val, comp.config.format)));
      } else {
        sourceParts.push(displayVal);
      }
    }
  }

  if (sourceParts.length > 0) {
    const separator = ' · ';
    html += `<div class="note-source">——${sourceParts.join(separator)}</div>`;
  }

  return { html, quoteFields, urlFields };
}

// ===== 搜索 =====
let searchTimer = null;

function setupSearch() {
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    searchClear.style.display = q ? 'flex' : 'none';
    if (!q) {
      if (!navigatingToNote) exitSearch();
      return;
    }
    searchTimer = setTimeout(() => doSearch(q), 300);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      searchClear.style.display = 'none';
      exitSearch();
    }
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    exitSearch();
  });
}

async function doSearch(q) {
  const results = await storage.searchNotes(q);
  searchMode = true;
  placeholder.style.display = 'none';
  notesView.style.display = 'flex';
  fileTitle.textContent = `搜索"${q}" — ${results.length} 条结果`;

  if (results.length === 0) {
    notesList.innerHTML = '<p class="empty-hint">未找到匹配的笔记</p>';
    return;
  }

  // 搜索结果：每条笔记使用其所属笔记本绑定的模板
  const defaultTemplate = getDefaultTemplate();

  notesList.innerHTML = results.map((note, i) => {
    const notebooks = (note.notebooks || []).map(t => `<span class="note-tag" data-notebook="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('');
    const matchComp = getComponentById(note.matchField);
    const matchBadge = matchComp ? `<span class="match-badge">${escapeHtml(matchComp.label)}</span>` : '';
    const notebook = (note.notebooks || [])[0];
    const tplId = globals.notebookTemplates?.[notebook];
    const searchTemplate = tplId ? (globals.cardTemplates || []).find(t => t.id === tplId) || defaultTemplate : defaultTemplate;
    const { html: fieldsHtml, quoteFields, urlFields } = renderCardFields(note, searchTemplate, true, q);
    const quoteToggles = quoteFields.map(qf =>
      `<div class="note-quote-toggle" data-action="toggle-quote" data-quote-id="${qf.id}" data-tooltip="${escapeHtml(qf.label)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></div>`
    ).join('');
    const urlLinks = urlFields.map(uf =>
      `<a class="toolbar-url" href="${escapeHtml(uf.val)}" target="_blank" rel="noopener" data-tooltip="${escapeHtml(uf.val)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></a>`
    ).join('');
    return `
    <div class="note-card search-result" data-id="${note.id}" data-notebook="${escapeHtml((note.notebooks || [])[0] || '')}" style="animation-delay: ${Math.min(i * 0.05, 0.25)}s">
      <div class="note-card-body">
        ${fieldsHtml}
        ${notebooks || matchBadge ? `<div class="note-tags">${matchBadge}${notebooks}</div>` : ''}
      </div>
      <div class="note-card-toolbar visible">
        <div class="toolbar-left">
          ${quoteToggles}
          ${urlLinks}
        </div>
        <div class="toolbar-right">
          <button class="icon-btn-sm" data-action="go-to-note" data-id="${note.id}" data-notebook="${escapeHtml((note.notebooks || [])[0] || '')}" title="前往笔记本">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>
    </div>
  `}).join('');
}

async function exitSearch() {
  searchMode = false;
  activeFilters = {};
  originalNotes = null;
  document.getElementById('filter-tags').style.display = 'none';
  if (currentNotebook) {
    notes = await storage.getNotes(currentNotebook);
    fileTitle.textContent = currentNotebook;
    renderNotes();
  } else {
    notesView.style.display = 'none';
    placeholder.style.display = 'flex';
    fileTitle.textContent = '';
  }
}

function scrollToNote(noteId) {
  requestAnimationFrame(() => {
    const idx = notes.findIndex(n => n.id === noteId);
    if (idx === -1) return;
    const card = document.querySelector(`.note-card[data-index="${idx}"]`);
    if (!card) return;
    card.style.opacity = '1';
    card.style.transition = 'none';
    card.style.boxShadow = '0 0 0 3px var(--color-bamboo), 0 4px 20px rgba(45, 90, 61, 0.3)';
    card.style.backgroundColor = 'var(--color-bamboo-mist)';
    card.style.transform = 'scale(1.02)';
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        card.style.transition = 'box-shadow 0.8s ease, background-color 0.8s ease, transform 0.4s ease';
        card.style.transform = '';
        setTimeout(() => {
          card.style.boxShadow = '';
          card.style.backgroundColor = '';
        }, 1000);
      });
    });
  });
}

function highlightMatch(text, q) {
  if (!q) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(new RegExp(safeQ, 'gi'), '<mark>$&</mark>');
}

function highlightHtml(html, q) {
  if (!q) return html;
  const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(/>([^<]*)</g, (match, text) => {
    return '>' + text.replace(new RegExp(safeQ, 'gi'), '<mark>$&</mark>') + '<';
  });
}

// ===== 筛选功能 =====
function setupFilter() {
  const btn = document.getElementById('btn-filter');
  const panel = document.getElementById('filter-panel');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = panel.style.display !== 'none';
    if (isVisible) {
      panel.style.display = 'none';
    } else {
      renderFilterPanel();
      const rect = btn.getBoundingClientRect();
      panel.style.display = 'block';
      panel.style.top = (rect.bottom + 8) + 'px';
      const header = document.querySelector('.notes-header');
      const hRect = header.getBoundingClientRect();
      panel.style.left = hRect.left + 'px';
      panel.style.width = hRect.width + 'px';
    }
  });

  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      panel.style.display = 'none';
    }
  });
}

function renderFilterPanel() {
  const panel = document.getElementById('filter-panel');
  const template = getActiveTemplate();
  let html = '';

  for (const fieldId of template.fieldIds) {
    const comp = getComponentById(fieldId);
    if (!comp) continue;

    if (comp.type === 'dropdown') {
      const globalOptions = globals[`dropdown_${fieldId}`] || [];
      const noteOptions = notes.map(n => n[fieldId]).filter(Boolean);
      const options = [...new Set([...globalOptions, ...noteOptions])];
      if (options.length === 0) continue;

      const selected = activeFilters[fieldId] || '';
      html += `<div class="filter-section" data-field-id="${fieldId}">
        <span class="filter-section-label">${escapeHtml(comp.label)}</span>
        <div class="filter-options">
          ${options.map(opt => `<span class="filter-opt ${selected === opt ? 'selected' : ''}" data-field="${fieldId}" data-value="${escapeHtml(opt)}">${escapeHtml(opt)}</span>`).join('')}
        </div>
      </div>`;
    } else {
      const val = activeFilters[fieldId] || '';
      html += `<div class="filter-section" data-field-id="${fieldId}">
        <span class="filter-section-label">${escapeHtml(comp.label)}</span>
        <input type="text" class="filter-search-input" data-field="${fieldId}" placeholder="搜索${escapeHtml(comp.label)}…" value="${escapeHtml(val)}">
      </div>`;
    }
  }

  if (!html) {
    html = '<p style="color:var(--color-text-secondary);font-size:13px;text-align:center;margin:8px 0">当前模板无可筛选字段</p>';
  }

  panel.innerHTML = html;

  // 绑定下拉选项点击
  panel.querySelectorAll('.filter-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      const fieldId = opt.dataset.field;
      const value = opt.dataset.value;
      if (activeFilters[fieldId] === value) {
        delete activeFilters[fieldId];
      } else {
        activeFilters[fieldId] = value;
      }
      renderFilterPanel();
      applyFilters();
    });
  });

  // 绑定搜索输入
  let filterTimer = null;
  panel.querySelectorAll('.filter-search-input').forEach(input => {
    input.addEventListener('input', () => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(() => {
        const fieldId = input.dataset.field;
        const value = input.value.trim();
        if (value) {
          activeFilters[fieldId] = value;
        } else {
          delete activeFilters[fieldId];
        }
        applyFilters();
      }, 300);
    });
  });
}

function applyFilters() {
  const filterKeys = Object.keys(activeFilters);

  // 恢复原始笔记
  if (originalNotes) {
    notes = [...originalNotes];
  }

  if (filterKeys.length === 0) {
    originalNotes = null;
    if (currentNotebook && !searchMode) {
      fileTitle.textContent = currentNotebook;
    }
  } else {
    if (!originalNotes) originalNotes = [...notes];

    notes = notes.filter(note => {
      return filterKeys.every(fieldId => {
        const filterVal = activeFilters[fieldId].toLowerCase();
        const comp = getComponentById(fieldId);
        if (!comp) return true;
        const noteVal = String(note[fieldId] || '').toLowerCase();
        if (comp.type === 'dropdown') {
          return noteVal === filterVal;
        }
        return noteVal.includes(filterVal);
      });
    });

    if (currentNotebook && !searchMode) {
      fileTitle.textContent = `${currentNotebook} — 筛选 ${notes.length} 条`;
    }
  }

  renderNotes();
  renderFilterTags();
}

function renderFilterTags() {
  const container = document.getElementById('filter-tags');
  const filterKeys = Object.keys(activeFilters);

  if (filterKeys.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = filterKeys.map(fieldId => {
    const comp = getComponentById(fieldId);
    const label = comp ? comp.label : fieldId;
    const value = activeFilters[fieldId];
    return `<span class="filter-tag">
      <span class="filter-tag-label">${escapeHtml(label)}</span>
      ${escapeHtml(value)}
      <span class="filter-tag-x" data-field="${fieldId}">×</span>
    </span>`;
  }).join('');

  container.querySelectorAll('.filter-tag-x').forEach(x => {
    x.addEventListener('click', () => {
      delete activeFilters[x.dataset.field];
      applyFilters();
      const panel = document.getElementById('filter-panel');
      if (panel.style.display !== 'none') renderFilterPanel();
    });
  });
}

// ===== 编辑笔记 =====
function editNote(index) {
  const card = document.querySelector(`.note-card[data-index="${index}"]`);
  if (!card) return;
  const note = notes[index];
  const template = getActiveTemplate();

  const noteNotebooks = note.notebooks || [];
  const toggleChipsHtml = allNotebooks.map(nb => {
    const active = noteNotebooks.includes(nb.name);
    return `<span class="tag-chip ${active ? 'active' : ''}" data-value="${escapeHtml(nb.name)}">${escapeHtml(nb.name)}</span>`;
  }).join('');

  card.classList.add('note-card-editing');
  card.classList.remove('note-card-empty');
  card.style.animation = 'none';
  card.style.opacity = '1';

  // 按模板字段顺序生成编辑表单
  let fieldsHtml = '';
  let pendingInline = []; // 累积的 inline 字段

  function flushInline() {
    if (pendingInline.length === 0) return;
    const cols = Math.min(pendingInline.length, 5);
    fieldsHtml += `<div class="edit-row edit-row-${cols}">`;
    for (const { id, comp } of pendingInline) {
      const isSmall = comp.type === 'number' || comp.type === 'date' || comp.type === 'rating';
      const colClass = isSmall ? 'edit-col edit-col-sm' : 'edit-col';
      const val = note[id] !== undefined ? note[id] : '';

      if (comp.type === 'dropdown') {
        const allNotesForOptions = notes.map(n => n[id]).filter(Boolean);
        const globalKey = `dropdown_${id}`;
        const globalOptions = globals[globalKey] || [];
        const usedOptions = [...new Set([...globalOptions, ...allNotesForOptions])];
        const optionsHtml = usedOptions.map(o => `<div class="dropdown-item" data-value="${escapeHtml(o)}">${escapeHtml(o)}</div>`).join('');
        const defaultVal = val || (globals[`last_${id}`] || '');
        fieldsHtml += `
        <div class="${colClass}">
          <label class="edit-label">${escapeHtml(comp.label)}</label>
          <div class="dropdown-wrap">
            <input type="text" class="edit-field edit-${id}" data-field-id="${id}" placeholder="${escapeHtml(comp.placeholder || '')}" value="${escapeHtml(defaultVal)}" autocomplete="off">
            ${usedOptions.length ? `<button type="button" class="dropdown-toggle" data-target="${id}-dropdown-${index}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></button>` : ''}
            <div class="dropdown-menu" id="${id}-dropdown-${index}">${optionsHtml}</div>
          </div>
        </div>`;
      } else if (comp.type === 'rating') {
        const rating = parseInt(val) || 0;
        let starsHtml = '';
        for (let s = 1; s <= 5; s++) starsHtml += `<span class="rating-star ${s <= rating ? 'active' : ''}" data-value="${s}">★</span>`;
        fieldsHtml += `
        <div class="${colClass}">
          <label class="edit-label">${escapeHtml(comp.label)}</label>
          <div class="rating-input" data-field-id="${id}">${starsHtml}</div>
          <input type="hidden" class="edit-field" data-field-id="${id}" value="${rating}">
        </div>`;
      } else {
        const inputType = comp.type === 'date' ? 'date' : comp.type === 'url' ? 'url' : 'text';
        fieldsHtml += `
        <div class="${colClass}">
          <label class="edit-label">${escapeHtml(comp.label)}</label>
          <input type="${inputType}" class="edit-field edit-${id}" data-field-id="${id}" placeholder="${escapeHtml(comp.placeholder || '')}" value="${escapeHtml(val)}">
        </div>`;
      }
    }
    fieldsHtml += '</div>';
    pendingInline = [];
  }

  for (const fieldId of template.fieldIds) {
    const comp = getComponentById(fieldId);
    if (!comp) continue;
    if (comp.type === 'textarea' || comp.type === 'url') {
      flushInline();
      if (comp.type === 'textarea') {
        const hasTable = comp.config?.hasTable;
        const isQuote = comp.config?.isQuote;
        const isCode = comp.config?.isCode;
        const cssClass = isQuote ? 'edit-quote' : (isCode ? 'edit-code' : 'edit-content');
        const rows = isQuote ? '2' : (isCode ? '4' : '3');
        fieldsHtml += `
          <div class="edit-col">
            <label class="edit-label">${escapeHtml(comp.label)}</label>
            ${hasTable || isCode ? `<div class="edit-toolbar">
              ${hasTable ? `<button type="button" class="edit-tool-btn" data-action="insert-table" data-target="${fieldId}" data-index="${index}" title="插入表格">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
              </button>` : ''}
              ${isCode ? `<button type="button" class="edit-tool-btn" data-action="insert-code" data-target="${fieldId}" data-index="${index}" title="插入代码块">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              </button>` : ''}
            </div>` : ''}
            <textarea class="edit-field ${cssClass}" data-field-id="${fieldId}" placeholder="${escapeHtml(comp.placeholder || '')}" rows="${rows}">${escapeHtml(note[fieldId] || '')}</textarea>
          </div>`;
      } else {
        const val = note[fieldId] !== undefined ? note[fieldId] : '';
        const urls = val ? val.split('\n').filter(Boolean) : [];
        const chipsHtml = urls.map(u => `<span class="tag-chip active" data-value="${escapeHtml(u)}">${escapeHtml(u)}<span class="tag-chip-remove" data-url="${escapeHtml(u)}">×</span></span>`).join('');
        fieldsHtml += `
          <div class="edit-col">
            <label class="edit-label">${escapeHtml(comp.label)}</label>
            <div class="edit-url-manager" data-field-id="${fieldId}">
              <div class="tag-chips">${chipsHtml}</div>
              <div class="tag-add-wrap">
                <input type="url" class="tag-add-input" placeholder="输入链接，回车添加" autocomplete="off">
              </div>
            </div>
          </div>`;
      }
    } else {
      pendingInline.push({ id: fieldId, comp });
    }
  }
  flushInline();

  card.innerHTML = `
    <div class="edit-form">
      ${fieldsHtml}

      <div class="edit-col">
        <label class="edit-label">引用笔记</label>
        <div class="edit-ref-manager" data-note-id="${note.id || ''}">
          <div class="ref-chips" id="ref-chips-${index}"></div>
          <div class="ref-search-wrap">
            <input type="text" class="ref-search-input" id="ref-search-${index}" placeholder="搜索笔记添加引用…" autocomplete="off">
            <div class="ref-search-results" id="ref-results-${index}"></div>
          </div>
          <div class="ref-type-select">
            <label><input type="radio" name="ref-type-${index}" value="cross" checked> 交叉引用</label>
            <label><input type="radio" name="ref-type-${index}" value="one-way"> 单向引用</label>
          </div>
        </div>
      </div>

      <div class="edit-col">
        <label class="edit-label">所属笔记本</label>
        <div class="edit-tag-manager" data-note-id="${note.id || ''}">
          <div class="tag-chips">${toggleChipsHtml}</div>
          <div class="tag-add-wrap">
            <input type="text" class="tag-add-input" placeholder="新笔记本名称…" autocomplete="off">
            <button type="button" class="tag-add-btn" title="添加">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div class="edit-actions">
        <button class="btn-sm btn-sm-cancel" data-action="cancel-edit" data-index="${index}">取消</button>
        <button class="btn-sm btn-sm-save" data-action="save-edit" data-index="${index}">保存</button>
      </div>
    </div>
  `;

  // 加载引用
  loadEditRefs(note.id, index);

  // 下拉菜单交互
  card.querySelectorAll('.dropdown-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = document.getElementById(btn.dataset.target);
      const isOpen = menu.classList.contains('open');
      document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
      if (!isOpen) menu.classList.add('open');
    });
  });

  card.querySelectorAll('.dropdown-menu').forEach(menu => {
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.dropdown-item');
      if (!item) return;
      const wrap = menu.closest('.dropdown-wrap');
      const input = wrap.querySelector('input');
      input.value = item.dataset.value;
      menu.classList.remove('open');
      input.focus();
    });
  });

  // 数字字段格式化
  card.querySelectorAll('.edit-field[data-field-id]').forEach(input => {
    const fieldId = input.dataset.fieldId;
    const comp = getComponentById(fieldId);
    if (comp?.type === 'number' && comp.config?.format) {
      input.addEventListener('blur', () => {
        input.value = formatNumberField(input.value, comp.config.format);
      });
    }
  });

  // 评分交互
  card.querySelectorAll('.rating-input').forEach(container => {
    const fieldId = container.dataset.fieldId;
    const hiddenInput = card.querySelector(`input[data-field-id="${fieldId}"]`);
    const stars = container.querySelectorAll('.rating-star');
    container.addEventListener('click', (e) => {
      const star = e.target.closest('.rating-star');
      if (!star) return;
      const val = parseInt(star.dataset.value);
      hiddenInput.value = val;
      stars.forEach((s, i) => {
        s.classList.toggle('active', i < val);
      });
    });
    container.addEventListener('mouseover', (e) => {
      const star = e.target.closest('.rating-star');
      if (!star) return;
      const val = parseInt(star.dataset.value);
      stars.forEach((s, i) => {
        s.classList.toggle('hover', i < val);
      });
    });
    container.addEventListener('mouseleave', () => {
      stars.forEach(s => s.classList.remove('hover'));
    });
  });

  // textarea 自动高度 + 图片粘贴
  card.querySelectorAll('textarea').forEach(ta => {
    autoResize(ta);
    ta.addEventListener('input', () => autoResize(ta));
    ta.addEventListener('paste', (e) => {
      const sc = ta.closest('.notes-list');
      if (sc) {
        const st = sc.scrollTop;
        requestAnimationFrame(() => { sc.scrollTop = st; });
      }
      // 图片粘贴
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          uploadAndInsertImage(file, ta);
          break;
        }
      }
    });
    ta.addEventListener('focus', () => {
      const sc = ta.closest('.notes-list');
      if (!sc) return;
      const st = sc.scrollTop;
      requestAnimationFrame(() => { sc.scrollTop = st; });
    });
    // 图片语法整段删除
    ta.addEventListener('keydown', (e) => {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;
      const pos = ta.selectionStart;
      if (ta.selectionStart !== ta.selectionEnd) return; // 有选区时不拦截
      const text = ta.value;
      const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        const url = match[2];
        // Backspace at start or end of image block
        if (e.key === 'Backspace' && (pos === start || pos === end)) {
          e.preventDefault();
          ta.value = text.substring(0, start) + text.substring(end);
          ta.selectionStart = ta.selectionEnd = start;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          removeImagePreview(ta, url);
          storage.deleteImage(url);
          return;
        }
        // Delete at end of image block
        if (e.key === 'Delete' && pos === end) {
          e.preventDefault();
          ta.value = text.substring(0, start) + text.substring(end);
          ta.selectionStart = ta.selectionEnd = start;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          removeImagePreview(ta, url);
          storage.deleteImage(url);
          return;
        }
      }
    });
  });
  card.querySelector('.edit-content, textarea')?.focus({ preventScroll: true });

  // 加载已有图片预览
  card.querySelectorAll('textarea').forEach(ta => {
    loadExistingImagePreviews(ta);
  });

  // 标签管理
  const tagManager = card.querySelector('.edit-tag-manager');
  if (tagManager) {
    const chipsContainer = tagManager.querySelector('.tag-chips');
    const tagInput = tagManager.querySelector('.tag-add-input');
    const tagAddBtn = tagManager.querySelector('.tag-add-btn');

    chipsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.tag-chip');
      if (!chip) return;
      chip.classList.toggle('active');
    });

    function addNewTag() {
      const name = tagInput.value.trim();
      if (!name) return;
      const exists = chipsContainer.querySelector(`.tag-chip[data-value="${CSS.escape(name)}"]`);
      if (exists) {
        exists.classList.add('active');
      } else {
        const chip = document.createElement('span');
        chip.className = 'tag-chip active';
        chip.dataset.value = name;
        chip.textContent = name;
        chipsContainer.appendChild(chip);
      }
      tagInput.value = '';
      tagInput.focus();
    }

    tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addNewTag(); }
    });
    tagAddBtn.addEventListener('click', addNewTag);
  }

  // URL 标签管理
  card.querySelectorAll('.edit-url-manager').forEach(manager => {
    const chipsContainer = manager.querySelector('.tag-chips');
    const urlInput = manager.querySelector('.tag-add-input');

    // 删除链接
    chipsContainer.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.tag-chip-remove');
      if (removeBtn) {
        e.stopPropagation();
        removeBtn.closest('.tag-chip').remove();
        return;
      }
    });

    // 添加链接
    function addUrl() {
      const url = urlInput.value.trim();
      if (!url) return;
      const exists = chipsContainer.querySelector(`.tag-chip[data-value="${CSS.escape(url)}"]`);
      if (exists) { urlInput.value = ''; return; }
      const chip = document.createElement('span');
      chip.className = 'tag-chip active';
      chip.dataset.value = url;
      chip.innerHTML = `${escapeHtml(url)}<span class="tag-chip-remove" data-url="${escapeHtml(url)}">×</span>`;
      chipsContainer.appendChild(chip);
      urlInput.value = '';
      urlInput.focus();
    }

    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addUrl(); }
    });
  });
}

function loadExistingImagePreviews(textarea) {
  const text = textarea.value;
  const regex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  const urls = [];
  while ((match = regex.exec(text)) !== null) {
    urls.push(match[2]);
  }
  if (urls.length === 0) return;
  const editCol = textarea.closest('.edit-col');
  if (!editCol) return;
  const previewWrap = document.createElement('div');
  previewWrap.className = 'edit-image-preview';
  urls.forEach(url => {
    const img = document.createElement('img');
    img.src = url;
    previewWrap.appendChild(img);
  });
  textarea.after(previewWrap);
}

function removeImagePreview(textarea, url) {
  const editCol = textarea.closest('.edit-col');
  if (!editCol) return;
  const previewWrap = editCol.querySelector('.edit-image-preview');
  if (!previewWrap) return;
  const imgs = previewWrap.querySelectorAll('img');
  imgs.forEach(img => {
    if (img.src.endsWith(url) || url.endsWith(img.src) || img.src.includes(url)) {
      img.remove();
    }
  });
  if (previewWrap.children.length === 0) previewWrap.remove();
}

async function uploadAndInsertImage(file, textarea) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    const data = e.target.result;
    try {
      const res = await fetch(`${API_BASE}/api/images`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ data, name: file.name || 'image.png' })
      });
      const result = await res.json();
      if (result.url) {
        const md = `![图片](${result.url})`;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const before = textarea.value.substring(0, start);
        const after = textarea.value.substring(end);
        const prefix = before && !before.endsWith('\n') ? '\n' : '';
        textarea.value = before + prefix + md + '\n' + after;
        textarea.selectionStart = textarea.selectionEnd = (before + prefix + md).length;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        // 在 textarea 下方添加图片预览
        const editCol = textarea.closest('.edit-col');
        if (editCol) {
          let previewWrap = editCol.querySelector('.edit-image-preview');
          if (!previewWrap) {
            previewWrap = document.createElement('div');
            previewWrap.className = 'edit-image-preview';
            textarea.after(previewWrap);
          }
          const img = document.createElement('img');
          img.src = result.url;
          previewWrap.appendChild(img);
        }
      }
    } catch (err) {
      console.error('图片上传失败:', err);
    }
  };
  reader.readAsDataURL(file);
}

function autoResize(el) {
  const scrollContainer = el.closest('.notes-list');
  const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
  if (scrollContainer) scrollContainer.scrollTop = scrollTop;
}

let tableInsertTarget = null;
let tableInsertPos = null;

function insertTable(btn) {
  const target = btn.dataset.target;
  const card = btn.closest('.note-card');
  const textarea = card.querySelector(`textarea[data-field-id="${target}"]`);

  tableInsertTarget = textarea;
  tableInsertPos = {
    start: textarea.selectionStart,
    end: textarea.selectionEnd
  };

  document.getElementById('table-rows').value = '3';
  document.getElementById('table-cols').value = '3';
  showTableEditor(3, 3);
  document.getElementById('table-overlay').style.display = 'flex';
}

function showTableEditor(rows, cols) {
  const editor = document.getElementById('table-editor');
  let html = '<tr class="table-header-row">';
  for (let c = 0; c < cols; c++) {
    html += `<td><input type="text" placeholder="列${c + 1}" data-row="0" data-col="${c}"></td>`;
  }
  html += '</tr>';
  for (let r = 1; r < rows; r++) {
    html += '<tr>';
    for (let c = 0; c < cols; c++) {
      html += `<td><input type="text" placeholder="" data-row="${r}" data-col="${c}"></td>`;
    }
    html += '</tr>';
  }
  editor.innerHTML = html;
}

function insertTableConfirm() {
  const editor = document.getElementById('table-editor');
  const trs = editor.querySelectorAll('tr');
  const rows = trs.length;
  const cols = trs[0] ? trs[0].querySelectorAll('td').length : 0;
  if (rows === 0 || cols === 0) return;

  const data = [];
  trs.forEach(tr => {
    const row = [];
    tr.querySelectorAll('input').forEach(input => {
      row.push(input.value.trim());
    });
    data.push(row);
  });

  const header = '|' + data[0].map(v => v || '  ').join('|') + '|';
  const separator = '|' + data[0].map(() => '--').join('|') + '|';
  const dataRows = data.slice(1).map(row => '|' + row.map(v => v || '  ').join('|') + '|').join('\n');
  const table = header + '\n' + separator + '\n' + dataRows + '\n';

  const textarea = tableInsertTarget;
  const pos = tableInsertPos;
  const before = textarea.value.substring(0, pos.start);
  const after = textarea.value.substring(pos.end);
  const prefix = (before && !before.endsWith('\n')) ? '\n' : '';
  textarea.value = before + prefix + table + after;
  textarea.focus();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  autoResize(textarea);

  document.getElementById('table-overlay').style.display = 'none';
  tableInsertTarget = null;
  tableInsertPos = null;
}

function insertCodeBlock(btn) {
  const target = btn.dataset.target;
  const card = btn.closest('.note-card');
  const textarea = card.querySelector(`textarea[data-field-id="${target}"]`);

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const before = textarea.value.substring(0, start);
  const after = textarea.value.substring(end);

  const codeBlock = '```\n\n```';
  const prefix = (before && !before.endsWith('\n')) ? '\n' : '';
  textarea.value = before + prefix + codeBlock + after;

  const cursorPos = (before + prefix).length + 4;
  textarea.setSelectionRange(cursorPos, cursorPos);
  textarea.focus();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  autoResize(textarea);
}

async function saveEdit(index) {
  const card = document.querySelector(`.note-card[data-index="${index}"]`);
  if (!card) return;
  const template = getActiveTemplate();

  // 动态读取所有模板字段的值
  const fieldValues = {};
  let hasContent = false;
  for (const fieldId of template.fieldIds) {
    const comp = getComponentById(fieldId);
    if (!comp) continue;
    let val = '';
    // URL 类型从标签读取
    if (comp.type === 'url') {
      const urlManager = card.querySelector(`.edit-url-manager[data-field-id="${fieldId}"]`);
      if (urlManager) {
        const chips = urlManager.querySelectorAll('.tag-chip');
        val = [...chips].map(c => c.dataset.value).filter(Boolean).join('\n');
      }
    } else {
      const el = card.querySelector(`input[data-field-id="${fieldId}"], textarea[data-field-id="${fieldId}"]`);
      if (el) {
        if (el.tagName === 'TEXTAREA') {
          val = el.value.replace(/^\n+|\n+$/g, '');
        } else if (el.type === 'hidden') {
          val = el.value;
        } else {
          val = el.value.trim();
        }
      }
    }
    fieldValues[fieldId] = val;
    if (comp.type === 'textarea' && val.trim()) hasContent = true;
    else if (comp.type !== 'textarea' && val) hasContent = true;
  }

  const tagManager = card.querySelector('.edit-tag-manager');
  let notebooks = [];
  if (tagManager) {
    notebooks = [...tagManager.querySelectorAll('.tag-chip.active')].map(c => c.dataset.value);
  }
  if (notebooks.length === 0) notebooks.push(currentNotebook);

  const note = notes[index];

  if (!hasContent) {
    await storage.deleteNote(note.id);
  } else {
    const updated = { id: note.id, ...fieldValues, notebooks, updatedAt: new Date().toISOString() };
    for (const key of Object.keys(note)) {
      if (!updated.hasOwnProperty(key) && key !== 'id' && key !== 'updatedAt') {
        updated[key] = note[key];
      }
    }
    if (note.createdAt) updated.createdAt = note.createdAt;
    await storage.updateNote(updated);
  }

  // 更新全局选项（下拉字段的历史数据）
  for (const fieldId of template.fieldIds) {
    const comp = getComponentById(fieldId);
    if (!comp || comp.type !== 'dropdown') continue;
    const val = fieldValues[fieldId];
    if (!val) continue;
    const globalKey = `dropdown_${fieldId}`;
    if (!globals[globalKey]) globals[globalKey] = [];
    if (!globals[globalKey].includes(val)) globals[globalKey].push(val);
    globals[`last_${fieldId}`] = val;
  }

  // 更新全局笔记本列表
  for (const nb of notebooks) {
    if (!globals.notebooks) globals.notebooks = [];
    if (!globals.notebooks.includes(nb)) {
      globals.notebooks.push(nb);
    }
  }

  await storage.saveGlobals(globals);

  notes = await storage.getNotes(currentNotebook);
  originalNotes = null;
  if (Object.keys(activeFilters).length > 0) {
    applyFilters();
  } else {
    renderNotes();
  }
  loadNoteRefs();
  await loadFiles();

  setTimeout(() => {
    const card = document.querySelector(`.note-card[data-index="${index}"]`);
    if (card) {
      const quoteEl = card.querySelector('.note-quote');
      if (quoteEl) {
        quoteEl.classList.remove('collapsed');
        card.classList.add('quote-expanded');
        const toggle = card.querySelector('.note-quote-toggle svg');
        if (toggle) toggle.style.transform = 'rotate(180deg)';
      }
      setTimeout(() => {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 400);
    }
  }, 600);
}

async function cancelEdit(index) {
  const note = notes[index];
  const template = getActiveTemplate();
  const hasContent = template.fieldIds.some(fid => {
    const val = note[fid];
    return val !== undefined && val !== null && val !== '';
  });
  if (!hasContent) {
    await storage.deleteNote(note.id);
    notes = await storage.getNotes(currentNotebook);
  }
  originalNotes = null;
  if (Object.keys(activeFilters).length > 0) {
    applyFilters();
  } else {
    renderNotes();
  }
}

// ===== 删除笔记 =====
async function deleteNote(index) {
  const ok = await showModal('确定删除这条笔记吗？');
  if (!ok) return;
  const note = notes[index];
  await storage.deleteNote(note.id);
  notes = await storage.getNotes(currentNotebook);
  originalNotes = null;
  if (Object.keys(activeFilters).length > 0) {
    applyFilters();
  } else {
    renderNotes();
  }
  loadFiles();
}

// ===== 新增笔记 =====
async function addNote() {
  if (!currentNotebook) return;
  const template = getActiveTemplate();
  const newNote = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    notebooks: [currentNotebook],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  for (const fieldId of template.fieldIds) {
    if (newNote[fieldId] === undefined) newNote[fieldId] = '';
  }
  await storage.createNote(newNote);
  notes = await storage.getNotes(currentNotebook);
  originalNotes = null;
  if (Object.keys(activeFilters).length > 0) {
    applyFilters();
  } else {
    renderNotes();
  }
  const lastIndex = notes.length - 1;
  setTimeout(() => {
    const card = document.querySelector(`.note-card[data-index="${lastIndex}"]`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 50);
}

// ===== 引用列 =====
let currentRefNoteIndex = -1;

async function loadEditRefs(noteId, index) {
  const chipsEl = document.getElementById(`ref-chips-${index}`);
  const searchInput = document.getElementById(`ref-search-${index}`);
  const resultsEl = document.getElementById(`ref-results-${index}`);
  if (!chipsEl || !searchInput) return;

  const refs = await storage.getRefs(noteId);
  const allRefs = [...refs.outgoing, ...refs.incoming];
  const uniqueMap = new Map();
  allRefs.forEach(r => { if (!uniqueMap.has(r.id)) uniqueMap.set(r.id, r); });

  function renderChips() {
    const chips = [];
    uniqueMap.forEach((r, id) => {
      const notebooks = (r.notebooks || []).join(', ');
      const content = getNoteSummary(r, 30);
      const icon = r.refType === 'cross' ? '⇄' : '→';
      chips.push(`<span class="ref-chip" data-id="${id}"><span class="ref-chip-type">${icon}</span><span class="ref-chip-text">${escapeHtml(notebooks)} · ${escapeHtml(content)}</span><span class="ref-chip-remove" data-id="${id}">×</span></span>`);
    });
    chipsEl.innerHTML = chips.join('') || '<span class="ref-chips-empty">暂无引用</span>';
  }
  renderChips();

  chipsEl.addEventListener('click', async (e) => {
    const removeBtn = e.target.closest('.ref-chip-remove');
    if (!removeBtn) return;
    const targetId = removeBtn.dataset.id;
    await storage.removeRef(noteId, targetId);
    uniqueMap.delete(targetId);
    renderChips();
  });

  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (!q) { resultsEl.innerHTML = ''; resultsEl.style.display = 'none'; return; }
    searchTimer = setTimeout(async () => {
      const found = await storage.searchNotes(q);
      const filtered = found.filter(n => n.id !== noteId && !uniqueMap.has(n.id));
      if (filtered.length === 0) { resultsEl.innerHTML = ''; resultsEl.style.display = 'none'; return; }
      resultsEl.style.display = 'block';
      resultsEl.innerHTML = filtered.slice(0, 8).map(n => {
        const notebooks = (n.notebooks || []).join(', ');
        const content = getNoteSummary(n, 50);
        return `<div class="ref-search-item" data-id="${n.id}">
          <span class="ref-search-notebook">${escapeHtml(notebooks)}</span>
          <span class="ref-search-text">${escapeHtml(content)}</span>
        </div>`;
      }).join('');
    }, 200);
  });

  resultsEl.addEventListener('click', async (e) => {
    const item = e.target.closest('.ref-search-item');
    if (!item) return;
    const targetId = item.dataset.id;
    const type = document.querySelector(`input[name="ref-type-${index}"]:checked`)?.value || 'cross';
    await storage.addRef(noteId, targetId, type);
    const freshRefs = await storage.getRefs(noteId);
    const allFresh = [...freshRefs.outgoing, ...freshRefs.incoming];
    uniqueMap.clear();
    allFresh.forEach(r => { if (!uniqueMap.has(r.id)) uniqueMap.set(r.id, r); });
    renderChips();
    searchInput.value = '';
    resultsEl.innerHTML = '';
    resultsEl.style.display = 'none';
  });

  searchInput.addEventListener('blur', () => {
    setTimeout(() => { resultsEl.style.display = 'none'; }, 200);
  });
  searchInput.addEventListener('focus', () => {
    if (resultsEl.innerHTML) resultsEl.style.display = 'block';
  });
}

function renderRefCards(uniqueRefs) {
  if (uniqueRefs.length === 0) return '<p class="empty-hint">暂无引用</p>';
  const template = getActiveTemplate();
  return uniqueRefs.map((r, i) => {
    const { html: fieldsHtml, quoteFields, urlFields } = renderCardFields(r, template, false);
    const tags = (r.notebooks || []);
    const tagsHtml = tags.length ? `<div class="note-tags">${tags.map(t => `<span class="note-tag">${escapeHtml(t)}</span>`).join('')}</div>` : '';
    const hasQuote = quoteFields.length > 0;
    const hasUrl = urlFields.length > 0;
    const quoteToggles = quoteFields.map(qf =>
      `<div class="note-quote-toggle" data-action="toggle-quote" data-quote-id="${qf.id}" data-tooltip="${escapeHtml(qf.label)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></div>`
    ).join('');
    const urlLinks = urlFields.map(uf =>
      `<a class="toolbar-url" href="${escapeHtml(uf.val)}" target="_blank" rel="noopener" data-tooltip="${escapeHtml(uf.val)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></a>`
    ).join('');
    return `<div class="note-card" data-id="${r.id}" style="animation-delay: ${Math.min(i * 0.05, 0.25)}s">
      <div class="note-card-body">
        ${fieldsHtml}
        ${tagsHtml}
      </div>
      <div class="note-card-toolbar ${hasQuote || hasUrl ? '' : 'no-quote'}">
        <div class="toolbar-left">
          ${quoteToggles}
          ${urlLinks}
        </div>
        <div class="toolbar-right">
          <button class="icon-btn-sm" data-action="ref-jump" data-id="${r.id}" data-notebook="${escapeHtml((r.notebooks || [])[0] || '')}" title="跳转到笔记">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function openRefPanel(index) {
  const note = notes[index];
  if (!note) return;

  const wrapper = document.getElementById('notes-columns-wrapper');
  const existingRef = wrapper.querySelector('.ref-notes-list');

  if (currentRefNoteIndex === index && existingRef) {
    closeRefPanel();
    return;
  }

  const refs = await storage.getRefs(note.id);
  const allRefs = [...refs.outgoing, ...refs.incoming];
  const uniqueMap = new Map();
  allRefs.forEach(r => { if (!uniqueMap.has(r.id)) uniqueMap.set(r.id, r); });
  const uniqueRefs = [...uniqueMap.values()];
  const cardsHtml = renderRefCards(uniqueRefs);

  if (existingRef) {
    const header = existingRef.querySelector('.ref-notes-header');
    while (header && header.nextElementSibling) header.nextElementSibling.remove();
    header.insertAdjacentHTML('afterend', cardsHtml);
    currentRefNoteIndex = index;
    return;
  }

  const refDiv = document.createElement('div');
  refDiv.className = 'notes-list ref-notes-list';
  refDiv.innerHTML = `
    <div class="ref-notes-header">
      <span class="ref-notes-title">引用笔记</span>
      <button class="icon-btn" data-action="close-ref" title="关闭">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    ${cardsHtml}
  `;
  wrapper.appendChild(refDiv);

  const cards = refDiv.querySelectorAll('.note-card');
  cards.forEach(c => { c.style.animation = 'none'; c.style.opacity = '0'; });
  setTimeout(() => {
    cards.forEach((c, i) => {
      c.style.animation = `note-enter 0.5s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.05}s forwards`;
    });
  }, 425);

  currentRefNoteIndex = index;
}

function closeRefPanel() {
  const el = document.querySelector('.ref-notes-list');
  if (!el) { currentRefNoteIndex = -1; return; }

  el.classList.add('closing');
  let done = false;
  function cleanup() {
    if (done) return;
    done = true;
    el.remove();
  }
  el.addEventListener('animationend', cleanup, { once: true });
  setTimeout(cleanup, 400);
  currentRefNoteIndex = -1;
}

// ===== 新建笔记本 =====
function createNotebook() {
  const existing = document.getElementById('new-file-input');
  if (existing) { existing.focus(); return; }

  const li = document.createElement('li');
  li.className = 'file-item';
  li.innerHTML = '<input type="text" id="new-file-input" class="inline-input" placeholder="输入名称，回车确认" autofocus>';
  fileList.prepend(li);

  const input = li.querySelector('input');
  input.focus();

  async function confirm() {
    const name = input.value.trim();
    if (!name) { li.remove(); return; }
    const result = await storage.createNotebook(name);
    if (result.success) {
      await loadFiles();
      await openNotebook(name);
    } else {
      input.value = '';
      input.placeholder = result.error || '创建失败';
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirm();
    if (e.key === 'Escape') li.remove();
  });
  input.addEventListener('blur', () => {
    setTimeout(() => { if (li.parentNode) confirm(); }, 100);
  });
}

// ===== 删除笔记本 =====
async function deleteNotebook(name) {
  const ok = await showModal(`确定删除笔记本「${name}」吗？此操作不可恢复。`);
  if (!ok) return;
  await storage.deleteNotebook(name);
  globals.notebooks = (globals.notebooks || []).filter(n => n !== name);
  await storage.saveGlobals(globals);
  if (currentNotebook === name) {
    currentNotebook = null;
    notes = [];
    notesView.style.display = 'none';
    placeholder.style.display = 'flex';
  } else if (currentNotebook) {
    notes = await storage.getNotes(currentNotebook);
    renderNotes();
  }
  await loadFiles();
}

// ===== 导入导出 =====
async function exportData() {
  const allNotes = await storage.getAllNotes();
  const allRefs = await storage.getAllRefs();
  const globalsData = await storage.getGlobals();
  const exportObj = {
    version: 1,
    exportedAt: new Date().toISOString(),
    globals: {
      notebooks: globalsData.notebooks || [],
      fieldComponents: globalsData.fieldComponents || [],
      cardTemplates: globalsData.cardTemplates || [],
      notebookTemplates: globalsData.notebookTemplates || {}
    },
    notes: allNotes,
    refs: allRefs
  };
  const json = JSON.stringify(exportObj, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `枕书阁_备份_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importData(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      let importedNotes = [];
      let importedGlobals = null;

      // 新格式：包含 globals 和 notes
      if (data.version && data.notes) {
        importedNotes = data.notes;
        importedGlobals = data.globals;
      } else if (Array.isArray(data)) {
        importedNotes = data;
      } else if (data.notebooks) {
        for (const [name, notes] of Object.entries(data.notebooks)) {
          if (Array.isArray(notes)) {
            notes.forEach(n => {
              if (!n.notebooks) n.notebooks = [name];
              else if (!n.notebooks.includes(name)) n.notebooks.push(name);
              importedNotes.push(n);
            });
          }
        }
      } else {
        for (const [name, notes] of Object.entries(data)) {
          if (Array.isArray(notes)) {
            notes.forEach(n => {
              if (!n.notebooks) n.notebooks = [name];
              else if (!n.notebooks.includes(name)) n.notebooks.push(name);
              importedNotes.push(n);
            });
          }
        }
      }

      // 清理笔记数据
      importedNotes = importedNotes.filter(n => n && n.id);
      importedNotes.forEach(n => {
        if (n.notebooks) {
          n.notebooks = n.notebooks.filter(nb => nb != null && nb !== '');
        }
        if (!n.notebooks || n.notebooks.length === 0) {
          n.notebooks = ['未分类'];
        }
      });

      const allNotes = await storage.getAllNotes();
      const importMap = new Map(importedNotes.map(n => [n.id, n]));
      const merged = allNotes.map(n => importMap.get(n.id) || n);
      for (const n of importedNotes) {
        if (!merged.some(m => m.id === n.id)) merged.push(n);
      }
      // 合并组件和模板，按 label 做 ID 映射
      if (importedGlobals) {
        const importedComps = importedGlobals.fieldComponents || [];
        const existingComps = globals.fieldComponents || [];

        // label → existing id 映射表
        const labelTypeToId = new Map();
        existingComps.forEach(c => labelTypeToId.set(c.label + '|' + c.type, c.id));

        // 构建 imported id → existing id 的映射
        const idMap = new Map();
        for (const ic of importedComps) {
          const existingId = labelTypeToId.get(ic.label + '|' + ic.type);
          if (existingId) {
            idMap.set(ic.id, existingId);
            const existingComp = existingComps.find(c => c.id === existingId);
            if (existingComp && ic.config) {
              existingComp.config = { ...existingComp.config, ...ic.config };
            }
          } else {
            const oldId = ic.id;
            let newId = oldId;
            if (existingComps.some(c => c.id === newId)) {
              newId = oldId + '_' + Date.now().toString(36);
              ic.id = newId;
            }
            globals.fieldComponents.push(ic);
            idMap.set(oldId, newId);
          }
        }

        // 用 idMap 重写导入笔记的字段 key
        if (idMap.size > 0) {
          for (const note of importedNotes) {
            for (const [oldId, newId] of idMap) {
              if (oldId !== newId && note[oldId] !== undefined) {
                if (note[newId] === undefined) note[newId] = note[oldId];
                delete note[oldId];
              }
            }
          }
          // 重新保存笔记（字段 key 已映射）
          const allNotes2 = await storage.getAllNotes();
          const importMap2 = new Map(importedNotes.map(n => [n.id, n]));
          const merged2 = allNotes2.map(n => importMap2.get(n.id) || n);
          for (const n of importedNotes) {
            if (!merged2.some(m => m.id === n.id)) merged2.push(n);
          }
          await storage.saveAllNotes(merged2);
        }

        // 合并模板，按 name 匹配
        const importedTemplates = importedGlobals.cardTemplates || [];
        for (const it of importedTemplates) {
          const existing = (globals.cardTemplates || []).find(t => t.name === it.name);
          if (existing) {
            // 映射 fieldIds
            existing.fieldIds = it.fieldIds.map(fid => idMap.get(fid) || fid);
          } else {
            // 新模板，映射 fieldIds 后加入
            it.fieldIds = it.fieldIds.map(fid => idMap.get(fid) || fid);
            if (!globals.cardTemplates) globals.cardTemplates = [];
            globals.cardTemplates.push(it);
          }
        }
      }

      // 更新全局笔记本列表
      if (importedGlobals && importedGlobals.notebooks) {
        for (const nb of importedGlobals.notebooks) {
          if (!globals.notebooks) globals.notebooks = [];
          if (!globals.notebooks.includes(nb)) {
            globals.notebooks.push(nb);
          }
        }
      }
      for (const note of importedNotes) {
        if (note.notebooks) {
          for (const nb of note.notebooks) {
            if (!globals.notebooks) globals.notebooks = [];
            if (!globals.notebooks.includes(nb)) {
              globals.notebooks.push(nb);
            }
          }
        }
      }
      if (importedGlobals && importedGlobals.notebookTemplates) {
        if (!globals.notebookTemplates) globals.notebookTemplates = {};
        for (const [nb, tplId] of Object.entries(importedGlobals.notebookTemplates)) {
          if (!globals.notebookTemplates[nb]) {
            globals.notebookTemplates[nb] = tplId;
          }
        }
      }
      await storage.saveGlobals(globals);

      if (data.refs && Array.isArray(data.refs)) {
        await storage.importRefs(data.refs);
      }

      await loadFiles();
      if (currentNotebook) {
        notes = await storage.getNotes(currentNotebook);
      } else {
        notes = allNotes;
      }
      originalNotes = null;
      if (Object.keys(activeFilters).length > 0) {
        applyFilters();
      } else {
        renderNotes();
      }
      alert('导入成功！');
    } catch (err) {
      alert('导入失败：' + err.message);
    }
  };
  reader.readAsText(file);
}

// ===== 模态框 =====
function showModal(text) {
  return new Promise(resolve => {
    modalText.textContent = text;
    modalOverlay.style.display = 'flex';
    const modalEl = modalOverlay.querySelector('.modal');
    modalEl.classList.remove('animate-scale-in');
    void modalEl.offsetWidth;
    modalEl.classList.add('animate-scale-in');
    modalResolve = resolve;
  });
}

// ===== 设置弹窗 =====
function setupSettingsEvents() {
  const settingsOverlay = document.getElementById('settings-overlay');
  const settingsClose = document.getElementById('settings-close');
  const btnSettings = document.getElementById('btn-settings');
  const btnNewTemplate = document.getElementById('btn-new-template');
  const btnSaveTemplate = document.getElementById('btn-save-template');
  const btnDeleteTemplate = document.getElementById('btn-delete-template');

  btnSettings.addEventListener('click', openSettings);
  function closeSettings() {
    settingsOverlay.classList.add('closing');
    settingsOverlay.addEventListener('animationend', () => {
      settingsOverlay.classList.remove('closing');
      settingsOverlay.style.display = 'none';
    }, { once: true });
  }

  settingsClose.addEventListener('click', closeSettings);
  let settingsMouseDownTarget = null;
  settingsOverlay.addEventListener('mousedown', (e) => {
    settingsMouseDownTarget = e.target;
  });
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay && settingsMouseDownTarget === settingsOverlay) closeSettings();
  });

  btnNewTemplate.addEventListener('click', createNewTemplate);
  btnSaveTemplate.addEventListener('click', saveCurrentTemplate);
  btnDeleteTemplate.addEventListener('click', deleteCurrentTemplate);

  // AI 聊天
  const aiSidebar = document.getElementById('ai-chat-sidebar');
  const aiClose = document.getElementById('ai-chat-close');
  const btnAiChat = document.getElementById('btn-ai-chat');
  const btnAiSettings = document.getElementById('btn-ai-settings');
  const aiSettingsPanel = document.getElementById('ai-settings-panel');
  const aiInput = document.getElementById('ai-chat-input');
  const aiSend = document.getElementById('ai-chat-send');
  const aiMessages = document.getElementById('ai-chat-messages');
  const aiResize = document.getElementById('ai-chat-resize');

  btnAiChat.addEventListener('click', () => {
    aiSidebar.classList.toggle('open');
    if (aiSidebar.classList.contains('open')) {
      setTimeout(() => aiInput.focus(), 300);
    }
  });

  aiClose.addEventListener('click', () => {
    aiSidebar.style.width = '';
    aiSidebar.style.minWidth = '';
    aiSidebar.classList.remove('open');
  });

  // AI 设置面板
  btnAiSettings.addEventListener('click', () => {
    const isOpen = aiSettingsPanel.classList.toggle('open');
    if (isOpen) {
      const aiConfig = globals.aiConfig || {};
      document.getElementById('ai-api-url').value = aiConfig.apiUrl || '';
      document.getElementById('ai-api-key').value = aiConfig.apiKey || '';
      document.getElementById('ai-model').value = aiConfig.model || '';
    }
  });

  // 保存 AI 配置
  const btnSaveAiConfig = document.getElementById('btn-save-ai-config');
  btnSaveAiConfig.addEventListener('click', async () => {
    const apiUrl = document.getElementById('ai-api-url').value.trim();
    const apiKey = document.getElementById('ai-api-key').value.trim();
    const model = document.getElementById('ai-model').value.trim();

    if (!apiUrl || !apiKey) {
      showToast('请填写 API 地址和密钥');
      return;
    }

    globals.aiConfig = { apiUrl, apiKey, model };
    await storage.saveGlobals(globals);
    showToast('AI 配置已保存');
    aiSettingsPanel.classList.remove('open');
  });

  // 拖动调整宽度
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  aiResize.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = aiSidebar.offsetWidth;
    aiSidebar.style.transition = 'none';
    aiResize.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const diff = e.clientX - startX;
    const newWidth = Math.max(250, startWidth + diff);
    aiSidebar.style.width = newWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      aiSidebar.style.transition = '';
      aiResize.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });

  function renderAiMarkdown(str) {
    if (!str) return '';
    if (typeof marked !== 'undefined') {
      try { return marked.parse(str); } catch (e) { /* fallback */ }
    }
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }

  function addAiMessage(text, type) {
    const div = document.createElement('div');
    div.className = `ai-message ai-message-${type}`;
    div.innerHTML = type === 'ai' ? renderAiMarkdown(text) : text;
    aiMessages.appendChild(div);
    aiMessages.scrollTop = aiMessages.scrollHeight;
    return div;
  }

  function addAiRecommendNotes(notes) {
    if (!notes || notes.length === 0) return;
    const wrap = document.createElement('div');
    wrap.className = 'ai-recommend-notes';
    let html = '<div class="ai-recommend-title">相关笔记推荐</div>';
    notes.forEach(n => {
      const notebooks = (n.notebooks || []).join(', ');
      const content = getNoteSummary(n, 80);
      html += `<div class="ai-recommend-item" data-notebook="${escapeHtml(notebooks)}" data-id="${n.id}">
        <div class="ai-recommend-info">
          <span class="ai-recommend-text">${escapeHtml(content)}</span>
          <span class="ai-recommend-notebook">${escapeHtml(notebooks)}</span>
        </div>
        <button class="ai-recommend-jump" data-action="ai-go-to-note" data-notebook="${escapeHtml(notebooks)}" data-id="${n.id}" title="前往笔记">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>`;
    });
    wrap.innerHTML = html;
    aiMessages.appendChild(wrap);
    aiMessages.scrollTop = aiMessages.scrollHeight;
  }

  aiMessages.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="ai-go-to-note"]');
    if (!btn) return;
    const notebook = btn.dataset.notebook;
    const noteId = btn.dataset.id;
    if (notebook) {
      await openNotebook(notebook);
      if (noteId) scrollToNote(noteId);
    }
  });

  function getAiTools() {
    const tpl = getActiveTemplate();
    const filterFields = { notebook: { type: 'string', description: '笔记本名称' } };
    const fieldDescs = ['笔记本(notebook)'];
    for (const fid of tpl.fieldIds) {
      const comp = getComponentById(fid);
      if (comp && comp.type === 'dropdown') {
        filterFields[fid] = { type: 'string', description: comp.label };
        fieldDescs.push(`${comp.label}(${fid})`);
      }
    }
    return [
    {
      type: 'function',
      function: {
        name: 'search_notes',
        description: '按关键词搜索笔记，返回匹配的笔记列表',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: '搜索关键词' } },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_notes_by_notebook',
        description: '获取指定笔记本中的所有笔记',
        parameters: {
          type: 'object',
          properties: { notebook: { type: 'string', description: '笔记本名称' } },
          required: ['notebook']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_notebooks',
        description: '列出所有笔记本及其笔记数量',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'filter_notes',
        description: `按条件筛选笔记。可用字段：${fieldDescs.join('、')}`,
        parameters: {
          type: 'object',
          properties: filterFields
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_all_notes',
        description: '获取全部笔记概览（数据量大，最多返回 200 条精简数据）',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_note_refs',
        description: '获取指定笔记的引用关系（关联的其他笔记）',
        parameters: {
          type: 'object',
          properties: { noteId: { type: 'string', description: '笔记 ID' } },
          required: ['noteId']
        }
      }
    }
    ];
  }

  function slimNote(n) {
    const skip = new Set(['createdAt', 'updatedAt', 'matchField']);
    const slim = {};
    for (const [k, v] of Object.entries(n)) {
      if (skip.has(k)) continue;
      if (typeof v === 'string') slim[k] = v.length > 300 ? v.substring(0, 300) + '...' : v;
      else slim[k] = v;
    }
    return slim;
  }

  function slimNotes(notes) {
    return notes.slice(0, 30).map(slimNote);
  }

  async function executeAiTool(name, args) {
    try {
      switch (name) {
        case 'search_notes':
          return slimNotes(await storage.searchNotes(args.query || ''));
        case 'get_notes_by_notebook':
          return slimNotes(await storage.getNotes(args.notebook));
        case 'list_notebooks':
          return await storage.getNotebooks();
        case 'filter_notes':
          return slimNotes(await storage.filterNotes(args));
        case 'get_all_notes':
          return slimNotes(await storage.getAllNotes());
        case 'get_note_refs': {
          const refs = await storage.getRefs(args.noteId);
          const allRefs = [...refs.outgoing, ...refs.incoming];
          const uniqueMap = new Map();
          allRefs.forEach(r => { if (!uniqueMap.has(r.id)) uniqueMap.set(r.id, r); });
          return slimNotes([...uniqueMap.values()]);
        }
        default:
          return { error: `未知工具: ${name}` };
      }
    } catch (e) {
      return { error: `工具执行失败: ${e.message}` };
    }
  }

  const aiChatHistory = [];

  async function sendAiMessage() {
    const text = aiInput.value.trim();
    if (!text) return;

    const aiConfig = globals.aiConfig || {};
    if (!aiConfig.apiKey || !aiConfig.apiUrl) {
      addAiMessage('<p>请先在设置中配置 AI API 地址和密钥。</p>', 'system');
      return;
    }

    addAiMessage(escapeHtml(text), 'user');
    aiInput.value = '';

    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'ai-message ai-message-ai ai-thinking';
    thinkingDiv.innerHTML = '<span class="thinking-text">AI 正在思考</span><span class="thinking-dots"><span></span><span></span><span></span></span>';
    aiMessages.appendChild(thinkingDiv);
    aiMessages.scrollTop = aiMessages.scrollHeight;

    let apiUrl = aiConfig.apiUrl;
    if (!apiUrl.endsWith('/chat/completions')) {
      apiUrl = apiUrl.replace(/\/+$/, '') + '/chat/completions';
    }

    const systemMsg = {
      role: 'system',
      content: '你是「枕书阁」的读书笔记助手。你可以通过工具查询用户的笔记数据来回答问题。\n\n使用规则：\n1. 先用工具获取相关笔记数据，再基于数据回答\n2. 不要猜测笔记内容，必须通过工具查询\n3. 如果用户问笔记本相关，先用 list_notebooks\n4. 如果用户问某本书/某个朝代的笔记，用 filter_notes 或 search_notes\n5. 回答时引用具体笔记内容'
    };

    aiChatHistory.push({ role: 'user', content: text });
    const messages = [systemMsg, ...aiChatHistory];

    try {
      const collectedNotes = new Map();

      while (true) {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aiConfig.apiKey}`
          },
          body: JSON.stringify({
            model: aiConfig.model || 'gpt-3.5-turbo',
            messages,
            tools: getAiTools(),
            stream: true
          })
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          thinkingDiv.remove();
          addAiMessage(`<p>AI API 错误 (${response.status})：${errText || response.statusText}</p>`, 'system');
          aiChatHistory.pop();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';
        let toolCalls = [];
        let aiMsgDiv = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') continue;

            let chunk;
            try { chunk = JSON.parse(payload); } catch (e) { continue; }

            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              fullText += delta.content;
              if (!aiMsgDiv) {
                thinkingDiv.remove();
                aiMsgDiv = document.createElement('div');
                aiMsgDiv.className = 'ai-message ai-message-ai';
                aiMessages.appendChild(aiMsgDiv);
              }
              aiMsgDiv.innerHTML = renderAiMarkdown(fullText);
              aiMessages.scrollTop = aiMessages.scrollHeight;
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (!toolCalls[tc.index]) {
                  toolCalls[tc.index] = { id: tc.id, function: { name: tc.function?.name || '', arguments: '' } };
                }
                if (tc.id) toolCalls[tc.index].id = tc.id;
                if (tc.function?.name) toolCalls[tc.index].function.name = tc.function.name;
                if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
              }
            }
          }
        }

        if (toolCalls.length > 0) {
          const assistantMsg = { role: 'assistant', content: fullText || null, tool_calls: toolCalls.map((tc, i) => ({ id: tc.id, type: 'function', function: { name: tc.function.name, arguments: tc.function.arguments } })) };
          messages.push(assistantMsg);
          aiChatHistory.push(assistantMsg);

          for (const tc of toolCalls) {
            const args = JSON.parse(tc.function.arguments || '{}');
            const result = await executeAiTool(tc.function.name, args);
            if (Array.isArray(result)) {
              for (const n of result) {
                if (n.id) collectedNotes.set(n.id, n);
              }
            }
            const toolMsg = { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) };
            messages.push(toolMsg);
            aiChatHistory.push(toolMsg);
          }
          toolCalls = [];
          fullText = '';
          aiMsgDiv = null;
          continue;
        }

        if (fullText) {
          aiChatHistory.push({ role: 'assistant', content: fullText });
        }

        if (collectedNotes.size > 0) {
          addAiRecommendNotes([...collectedNotes.values()].slice(0, 5));
        }
        break;
      }
    } catch (error) {
      thinkingDiv.remove();
      addAiMessage(`<p>调用 AI API 失败：${error.message}</p>', 'system`);
      aiChatHistory.pop();
    }
  }

  aiSend.addEventListener('click', sendAiMessage);
  aiInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAiMessage();
    }
  });

  // 全局点击关闭下拉菜单
  document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
  });
}

let editingTemplateId = null;

function openSettings() {
  document.getElementById('settings-overlay').style.display = 'flex';
  // 优先使用当前笔记本绑定的模板
  if (currentNotebook && globals.notebookTemplates?.[currentNotebook]) {
    editingTemplateId = globals.notebookTemplates[currentNotebook];
  }
  if (!editingTemplateId) {
    editingTemplateId = globals.cardTemplates?.[0]?.id || 'default';
  }
  renderSettings();
}

function renderSettings() {
  renderTemplateList();
  renderTemplateDetail();
  renderComponentPanel();
  renderNotebookSelect();
}

// ===== 左侧：模板列表 =====
function renderTemplateList() {
  const list = document.getElementById('template-list');
  const activeId = (globals.notebookTemplates?.[currentNotebook]) || 'default';
  list.innerHTML = (globals.cardTemplates || []).map(t => {
    const isSelected = t.id === editingTemplateId;
    const isActive = t.id === activeId;
    return `<div class="template-list-item ${isSelected ? 'active' : ''}" data-id="${t.id}">
      <span class="template-list-name">${escapeHtml(t.name)}</span>
      ${isActive ? '<span class="template-list-badge">当前</span>' : ''}
    </div>`;
  }).join('');

  list.querySelectorAll('.template-list-item').forEach(item => {
    item.addEventListener('click', () => {
      editingTemplateId = item.dataset.id;
      renderSettings();
    });
  });

  const currentTemplate = globals.cardTemplates?.find(t => t.id === editingTemplateId);
  const currentNameEl = document.getElementById('current-template-name');
  if (currentNameEl && currentTemplate) {
    currentNameEl.textContent = currentTemplate.name;
  }
}

// ===== 左侧：模板详情 =====
function renderTemplateDetail() {
  const template = globals.cardTemplates?.find(t => t.id === editingTemplateId);
  if (!template) {
    document.getElementById('template-detail').style.display = 'none';
    return;
  }
  document.getElementById('template-detail').style.display = 'block';
  document.getElementById('template-name-input').value = template.name;

  // 模板名称输入即时更新
  const nameInput = document.getElementById('template-name-input');
  nameInput.oninput = () => {
    template.name = nameInput.value.trim() || template.name;
    renderTemplateList();
  };

  renderTemplateFields(template);
  renderTemplatePreview(template);
}

function renderTemplateFields(template) {
  const fieldList = document.getElementById('template-field-list');
  const typeLabels = { textarea: '文本域', input: '单行输入', dropdown: '下拉选择', number: '数字', date: '日期', url: '链接', rating: '评分' };
  const ids = template.fieldIds;

  fieldList.innerHTML = ids.map((fieldId, i) => {
    const comp = getComponentById(fieldId);
    return `<div class="template-field-item" data-field-id="${fieldId}">
      <button class="template-field-up" data-idx="${i}" title="上移" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="template-field-down" data-idx="${i}" title="下移" ${i === ids.length - 1 ? 'disabled' : ''}>↓</button>
      <span class="template-field-sep"></span>
      <span class="template-field-name">${comp ? escapeHtml(comp.label) : escapeHtml(fieldId)}</span>
      <span class="template-field-type">${comp ? (typeLabels[comp.type] || comp.type) : '未知'}</span>
      <button class="template-field-remove" data-field-id="${fieldId}" title="移除">✕</button>
    </div>`;
  }).join('');

  // 上移
  fieldList.querySelectorAll('.template-field-up').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      if (idx <= 0) return;
      const items = [...fieldList.querySelectorAll('.template-field-item')];
      const a = items[idx - 1];
      const b = items[idx];
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      a.style.transition = 'none';
      b.style.transition = 'none';
      b.parentNode.insertBefore(b, a);
      const newRectA = a.getBoundingClientRect();
      const newRectB = b.getBoundingClientRect();
      a.style.transform = `translateY(${rectA.top - newRectA.top}px)`;
      b.style.transform = `translateY(${rectB.top - newRectB.top}px)`;
      a.offsetHeight;
      a.style.transition = 'transform 0.25s ease';
      b.style.transition = 'transform 0.25s ease';
      a.style.transform = '';
      b.style.transform = '';
      a.addEventListener('transitionend', () => { a.style.transition = ''; a.style.transform = ''; }, { once: true });
      b.addEventListener('transitionend', () => { b.style.transition = ''; b.style.transform = ''; }, { once: true });
      [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
      syncFieldButtons(fieldList, ids);
      renderTemplatePreview(template);
    });
  });

  // 下移
  fieldList.querySelectorAll('.template-field-down').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      if (idx >= ids.length - 1) return;
      const items = [...fieldList.querySelectorAll('.template-field-item')];
      const a = items[idx];
      const b = items[idx + 1];
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      a.style.transition = 'none';
      b.style.transition = 'none';
      b.parentNode.insertBefore(b, a);
      const newRectA = a.getBoundingClientRect();
      const newRectB = b.getBoundingClientRect();
      a.style.transform = `translateY(${rectA.top - newRectA.top}px)`;
      b.style.transform = `translateY(${rectB.top - newRectB.top}px)`;
      a.offsetHeight;
      a.style.transition = 'transform 0.25s ease';
      b.style.transition = 'transform 0.25s ease';
      a.style.transform = '';
      b.style.transform = '';
      a.addEventListener('transitionend', () => { a.style.transition = ''; a.style.transform = ''; }, { once: true });
      b.addEventListener('transitionend', () => { b.style.transition = ''; b.style.transform = ''; }, { once: true });
      [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
      syncFieldButtons(fieldList, ids);
      renderTemplatePreview(template);
    });
  });

  // 删除字段
  fieldList.querySelectorAll('.template-field-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const removedId = btn.dataset.fieldId;
      // 右侧按钮反向动画：√ → +
      const compBtn = document.querySelector(`.comp-add-btn.added[data-comp-id="${removedId}"]`) ||
        document.querySelector(`.comp-item[data-id="${removedId}"] .comp-add-btn.added`);
      if (compBtn) {
        compBtn.classList.remove('added');
        compBtn.disabled = false;
        compBtn.innerHTML = '+';
        compBtn.dataset.compId = removedId;
        compBtn.addEventListener('animationend', () => compBtn.classList.remove('pop'), { once: true });
        compBtn.classList.add('pop');
        // 重新绑定点击事件
        compBtn.onclick = (e) => {
          e.stopPropagation();
          const tpl = globals.cardTemplates?.find(t => t.id === editingTemplateId);
          if (!tpl || tpl.fieldIds.includes(removedId)) return;
          tpl.fieldIds.push(removedId);
          compBtn.classList.add('added');
          compBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12 10 17 19 7"/></svg>';
          compBtn.disabled = true;
          compBtn.onclick = null;
          compBtn.addEventListener('animationend', () => compBtn.classList.remove('pop'), { once: true });
          compBtn.classList.add('pop');
          renderTemplateFields(tpl);
          renderTemplatePreview(tpl);
          const newItem = document.getElementById('template-field-list')?.querySelector(`[data-field-id="${removedId}"]`);
          if (newItem) newItem.classList.add('slide-in');
        };
      }
      template.fieldIds = template.fieldIds.filter(id => id !== removedId);
      renderTemplateFields(template);
      renderTemplatePreview(template);
    });
  });
}

function syncFieldButtons(fieldList, ids) {
  const items = fieldList.querySelectorAll('.template-field-item');
  items.forEach((item, i) => {
    item.querySelector('.template-field-up').disabled = i === 0;
    item.querySelector('.template-field-down').disabled = i === ids.length - 1;
    item.querySelector('.template-field-up').dataset.idx = i;
    item.querySelector('.template-field-down').dataset.idx = i;
  });
}

// ===== 左侧：预览 =====
function renderTemplatePreview(template) {
  const preview = document.getElementById('template-preview');
  const previewEdit = document.getElementById('template-preview-edit');
  // 用示例数据渲染卡片
  const sampleNote = {};
  for (const fieldId of template.fieldIds) {
    const comp = getComponentById(fieldId);
    if (!comp) continue;
    if (fieldId === 'content') sampleNote.content = '古者包羲氏之王天下也，仰则观象于天，俯则观法于地。';
    else if (fieldId === 'book') sampleNote.book = '中国古代文化常识';
    else if (fieldId === 'page') sampleNote.page = 'P020';
    else if (fieldId === 'dynasty') sampleNote.dynasty = '战国';
    else if (fieldId === 'quote') sampleNote.quote = '观鸟兽之文与地之宜，近取诸身，远取诸物。';
    else if (comp.type === 'textarea') sampleNote[fieldId] = '示例文本内容';
    else if (comp.type === 'input') sampleNote[fieldId] = '示例输入';
    else if (comp.type === 'dropdown') sampleNote[fieldId] = '示例选项';
    else if (comp.type === 'number') sampleNote[fieldId] = '42';
    else if (comp.type === 'date') sampleNote[fieldId] = '2026-06-25';
    else if (comp.type === 'url') sampleNote[fieldId] = 'https://example.com';
    else if (comp.type === 'rating') sampleNote[fieldId] = '4';
    else if (comp.label === '图片') sampleNote[fieldId] = '![示例图片](https://via.placeholder.com/200x150/f0f0f0/999999?text=图片)';
    else sampleNote[fieldId] = '示例';
  }

  // 正式卡片预览（与真实卡片一致，含展开箭头）
  const { html: fieldsHtml, quoteFields, urlFields } = renderCardFields(sampleNote, template, false);
  const quoteToggles = quoteFields.map(qf =>
    `<div class="note-quote-toggle" data-action="toggle-quote" data-quote-id="${qf.id}" data-tooltip="${escapeHtml(qf.label)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></div>`
  ).join('');
  const urlLinks = urlFields.map(uf =>
      `<a class="toolbar-url" href="${escapeHtml(uf.val)}" target="_blank" rel="noopener" data-tooltip="${escapeHtml(uf.val)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></a>`
    ).join('');
  const hasToolbar = quoteFields.length > 0 || urlFields.length > 0;
  const previewIdx = 'preview';
  preview.innerHTML = `<div class="note-card" style="margin:0;animation:none;opacity:1;box-shadow:none">
    <div class="note-card-body">
      ${fieldsHtml}
    </div>
    <div class="note-card-toolbar ${hasToolbar ? '' : 'no-quote'}" style="position:static;opacity:1;max-height:none;overflow:visible;padding-top:8px;margin-top:10px;border-top-color:var(--color-paper-deep)">
      <div class="toolbar-left">
        ${quoteToggles}
        ${urlLinks}
      </div>
      <div class="toolbar-right"></div>
    </div>
  </div>`;

  // 绑定预览中的展开/折叠事件
  preview.querySelectorAll('[data-action="toggle-quote"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.note-card');
      const quoteId = btn.dataset.quoteId;
      const quote = quoteId ? card.querySelector(`.note-quote[data-quote-id="${quoteId}"]`) : card.querySelector('.note-quote');
      if (!quote) return;
      const isCollapsed = quote.classList.contains('collapsed');
      quote.classList.toggle('collapsed');
      btn.querySelector('svg').style.transform = isCollapsed ? 'rotate(180deg)' : '';
    });
  });

  // 编辑表单预览（按模板字段顺序，静态展示）
  let editHtml = '<div class="edit-form">';
  let pendingInline = [];

  function flushInline() {
    if (pendingInline.length === 0) return;
    const cols = Math.min(pendingInline.length, 5);
    editHtml += `<div class="edit-row edit-row-${cols}">`;
    for (const { id, comp } of pendingInline) {
      const isSmall = comp.type === 'number' || comp.type === 'date' || comp.type === 'rating';
      const colClass = isSmall ? 'edit-col edit-col-sm' : 'edit-col';
      const val = sampleNote[id] || '';
      if (comp.type === 'dropdown') {
        editHtml += `<div class="${colClass}">
          <label class="edit-label">${escapeHtml(comp.label)}</label>
          <div class="dropdown-wrap">
            <input type="text" class="edit-field" placeholder="${escapeHtml(comp.placeholder || '')}" value="${escapeHtml(val)}" disabled>
            <button type="button" class="dropdown-toggle" disabled><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></button>
          </div>
        </div>`;
      } else if (comp.type === 'rating') {
        const rating = parseInt(val) || 0;
        let stars = '';
        for (let s = 1; s <= 5; s++) stars += `<span class="rating-star ${s <= rating ? 'active' : ''}" style="cursor:default">★</span>`;
        editHtml += `<div class="${colClass}">
          <label class="edit-label">${escapeHtml(comp.label)}</label>
          <div class="rating-input">${stars}</div>
        </div>`;
      } else {
        editHtml += `<div class="${colClass}">
          <label class="edit-label">${escapeHtml(comp.label)}</label>
          <input type="text" class="edit-field" placeholder="${escapeHtml(comp.placeholder || '')}" value="${escapeHtml(val)}" disabled>
        </div>`;
      }
    }
    editHtml += '</div>';
    pendingInline = [];
  }

  for (const fieldId of template.fieldIds) {
    const comp = getComponentById(fieldId);
    if (!comp) continue;
    if (comp.type === 'textarea' || comp.type === 'url') {
      flushInline();
      if (comp.type === 'textarea') {
        const hasTable = comp.config?.hasTable;
        const isCode = comp.config?.isCode;
        editHtml += `<div class="edit-col">
          <label class="edit-label">${escapeHtml(comp.label)}</label>
          ${hasTable || isCode ? `<div class="edit-toolbar">
            ${hasTable ? '<button type="button" class="edit-tool-btn" disabled title="插入表格"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg></button>' : ''}
            ${isCode ? '<button type="button" class="edit-tool-btn" disabled title="插入代码块"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></button>' : ''}
          </div>` : ''}
          <textarea class="edit-field" placeholder="${escapeHtml(comp.placeholder || '')}" rows="${comp.config?.isQuote ? '2' : (isCode ? '4' : '3')}" disabled>${escapeHtml(sampleNote[fieldId] || '')}</textarea>
        </div>`;
      } else {
        const val = sampleNote[fieldId] || '';
        editHtml += `<div class="edit-col">
          <label class="edit-label">${escapeHtml(comp.label)}</label>
          <input type="text" class="edit-field" placeholder="${escapeHtml(comp.placeholder || '')}" value="${escapeHtml(val)}" disabled>
        </div>`;
      }
    } else {
      pendingInline.push({ id: fieldId, comp });
    }
  }
  flushInline();

  editHtml += `<div class="edit-col">
    <label class="edit-label">所属笔记本</label>
    <div class="edit-tag-manager"><div class="tag-chips"><span class="tag-chip active" style="cursor:default">天文</span></div></div>
  </div>`;
  editHtml += `<div class="edit-actions">
    <button class="btn-sm btn-sm-cancel" disabled>取消</button>
    <button class="btn-sm btn-sm-save" disabled>保存</button>
  </div>`;
  editHtml += '</div>';
  previewEdit.innerHTML = editHtml;
}

// ===== 左侧：笔记本和模板选择 =====
function renderNotebookSelect() {
  const notebookLabel = document.getElementById('settings-notebook-label');
  const templateInput = document.getElementById('template-dropdown-input');
  const templateMenu = document.getElementById('template-dropdown-menu');
  const templateToggle = document.getElementById('template-dropdown-toggle');

  // 笔记本名称（只读）
  notebookLabel.textContent = currentNotebook || '未选择笔记本';

  // 模板下拉
  const activeTplId = (globals.notebookTemplates?.[currentNotebook]) || 'default';
  const activeTpl = (globals.cardTemplates || []).find(t => t.id === activeTplId);
  templateInput.value = activeTpl?.name || '';
  templateMenu.innerHTML = (globals.cardTemplates || []).map(t =>
    `<div class="dropdown-item" data-value="${t.id}">${escapeHtml(t.name)}</div>`
  ).join('');

  templateToggle.onclick = (e) => {
    e.stopPropagation();
    templateMenu.classList.toggle('open');
  };
  templateInput.onclick = (e) => {
    e.stopPropagation();
    templateMenu.classList.toggle('open');
  };
  templateMenu.onclick = async (e) => {
    const item = e.target.closest('.dropdown-item');
    if (!item) return;
    const tplId = item.dataset.value;
    templateMenu.classList.remove('open');
    if (currentNotebook) {
      globals.notebookTemplates[currentNotebook] = tplId;
      await storage.saveGlobals(globals);
    }
    editingTemplateId = tplId;
    renderSettings();
  };
}

// ===== 右侧：组件库面板 =====
function renderComponentPanel() {
  const panel = document.getElementById('component-panel');
  const tpl = globals.cardTemplates?.find(t => t.id === editingTemplateId);
  const usedIds = new Set(tpl?.fieldIds || []);
  const categories = [
    { type: 'textarea', label: '文本域' },
    { type: 'dropdown', label: '下拉选择' },
    { type: 'number', label: '数字' },
    { type: 'input', label: '单行输入' },
    { type: 'date', label: '日期' },
    { type: 'url', label: '链接' },
    { type: 'rating', label: '评分' }
  ];

  panel.innerHTML = categories.map(cat => {
    const comps = (globals.fieldComponents || []).filter(c => c.type === cat.type);
    return `<div class="comp-category open" data-type="${cat.type}">
      <div class="comp-category-header">
        <div class="comp-category-left">
          <span class="comp-category-arrow">▶</span>
          <span class="comp-category-title">${cat.label}</span>
          <span class="comp-category-count">${comps.length}</span>
        </div>
        <button class="comp-category-add" data-type="${cat.type}" title="新建">+ 新建</button>
      </div>
      <div class="comp-category-body">
        ${comps.map(comp => renderCompItem(comp, usedIds.has(comp.id))).join('')}
      </div>
    </div>`;
  }).join('');

  // 折叠/展开
  panel.querySelectorAll('.comp-category-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.comp-category-add')) return;
      header.closest('.comp-category').classList.toggle('open');
    });
  });

  // 新建组件
  panel.querySelectorAll('.comp-category-add').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      addNewComponent(btn.dataset.type);
    });
  });

  // 组件点击展开编辑
  panel.querySelectorAll('.comp-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.comp-add-btn')) return;
      toggleCompEdit(item.dataset.id);
    });
  });

  // + 按钮：添加到模板
  panel.querySelectorAll('.comp-add-btn:not(.added)').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const compId = btn.dataset.compId;
      if (!tpl || tpl.fieldIds.includes(compId)) return;
      tpl.fieldIds.push(compId);
      btn.classList.add('added');
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12 10 17 19 7"/></svg>';
      btn.disabled = true;
      btn.addEventListener('animationend', () => btn.classList.remove('pop'), { once: true });
      btn.classList.add('pop');
      renderTemplateFields(tpl);
      renderTemplatePreview(tpl);
      // 左侧新字段滑入动画
      const fieldList = document.getElementById('template-field-list');
      const newItem = fieldList.querySelector(`[data-field-id="${compId}"]`);
      if (newItem) newItem.classList.add('slide-in');
    });
  });
}

function renderCompItem(comp, inTemplate) {
  const summary = getCompSummary(comp);
  const checkSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12 10 17 19 7"/></svg>';
  const btnHtml = inTemplate
    ? `<button class="comp-add-btn added" disabled>${checkSvg}</button>`
    : `<button class="comp-add-btn" data-comp-id="${comp.id}" title="添加到模板">+</button>`;
  return `<div class="comp-item" data-id="${comp.id}">
    ${btnHtml}
    <span class="comp-name">${escapeHtml(comp.label)}</span>
    <span class="comp-summary">${summary}</span>
  </div>`;
}

function getCompSummary(comp) {
  if (comp.config?.format) return comp.config.format;
  if (comp.config?.display === 'bookname') return '《》';
  const parts = [];
  if (comp.config?.isQuote) parts.push('引用');
  if (comp.config?.isCode) parts.push('代码');
  if (comp.config?.hasTable) parts.push('表格');
  return parts.join('+');
}

function toggleCompEdit(compId) {
  const existing = document.querySelector('.comp-edit');
  if (existing && existing.dataset.id === compId) {
    renderComponentPanel();
    return;
  }
  const comp = getComponentById(compId);
  if (!comp) return;

  // 先重绘面板（清除旧编辑面板）
  renderComponentPanel();

  const typeLabels = { textarea: '文本域', input: '单行输入', dropdown: '下拉选择', number: '数字', date: '日期', url: '链接', rating: '评分' };
  let configHtml = '';

  if (comp.type === 'textarea') {
    configHtml = `
      <div class="comp-edit-row">
        <span class="comp-edit-label">插入表格</span>
        <label class="comp-edit-check"><input type="checkbox" data-config="hasTable" ${comp.config?.hasTable ? 'checked' : ''}> 显示表格按钮</label>
      </div>
      <div class="comp-edit-row">
        <span class="comp-edit-label">引用样式</span>
        <label class="comp-edit-check"><input type="checkbox" data-config="isQuote" ${comp.config?.isQuote ? 'checked' : ''}> 折叠+绿线</label>
      </div>
      <div class="comp-edit-row">
        <span class="comp-edit-label">代码样式</span>
        <label class="comp-edit-check"><input type="checkbox" data-config="isCode" ${comp.config?.isCode ? 'checked' : ''}> 等宽字体+背景</label>
      </div>`;
  } else if (comp.type === 'dropdown') {
    const displayVal = comp.config?.display === 'bookname' ? '书名号《》' : '纯文本';
    configHtml = `<div class="comp-edit-row">
      <span class="comp-edit-label">显示样式</span>
      <div class="dropdown-wrap">
        <input type="text" class="comp-edit-input" data-config="display" data-raw-value="${comp.config?.display || 'plain'}" value="${displayVal}" readonly>
        <button type="button" class="dropdown-toggle"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></button>
        <div class="dropdown-menu">
          <div class="dropdown-item" data-value="plain">纯文本</div>
          <div class="dropdown-item" data-value="bookname">书名号《》</div>
        </div>
      </div>
    </div>`;
  } else if (comp.type === 'number') {
    const fmt = comp.config?.format || '';
    configHtml = `<div class="comp-edit-row">
      <span class="comp-edit-label">格式规则</span>
      <input type="text" class="comp-edit-input" data-config="format" value="${escapeHtml(fmt)}" placeholder="如 P000">
    </div>
    <div class="comp-format-preview" id="format-preview-${compId}">${fmt ? formatNumberField('42', fmt) + ' (输入42)' : ''}</div>`;
  } else if (comp.type === 'date') {
    const fmt = comp.config?.format || 'YYYY-MM-DD';
    configHtml = `<div class="comp-edit-row">
      <span class="comp-edit-label">格式规则</span>
      <input type="text" class="comp-edit-input" data-config="format" value="${escapeHtml(fmt)}" placeholder="如 YYYY-MM-DD">
    </div>
    <div class="comp-format-preview" id="format-preview-${compId}">${formatDateField('2026-06-25', fmt)}</div>`;
  }

  // 渲染编辑面板替换组件项
  const item = document.querySelector(`.comp-item[data-id="${compId}"]`);
  if (!item) return;

  const editPanel = document.createElement('div');
  editPanel.className = 'comp-edit';
  editPanel.dataset.id = compId;
  editPanel.innerHTML = `
    <div class="comp-edit-row">
      <span class="comp-edit-label">名称</span>
      <input type="text" class="comp-edit-input" data-field="label" value="${escapeHtml(comp.label)}">
    </div>
    <div class="comp-edit-row">
      <span class="comp-edit-label">占位符</span>
      <input type="text" class="comp-edit-input" data-field="placeholder" value="${escapeHtml(comp.placeholder || '')}">
    </div>
    ${configHtml}
    <div class="comp-edit-actions">
      <button class="btn-sm btn-sm-cancel" data-action="delete-comp">删除</button>
      <button class="btn-sm btn-sm-save" data-action="save-comp">保存</button>
    </div>
  `;
  item.replaceWith(editPanel);
  editPanel.classList.add('slide-in');

  // 下拉菜单交互
  editPanel.querySelectorAll('.dropdown-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wrap = btn.closest('.dropdown-wrap');
      const menu = wrap.querySelector('.dropdown-menu');
      document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
      menu.classList.toggle('open');
    });
  });
  editPanel.querySelectorAll('.dropdown-menu').forEach(menu => {
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.dropdown-item');
      if (!item) return;
      const wrap = menu.closest('.dropdown-wrap');
      const input = wrap.querySelector('input');
      input.value = item.textContent;
      input.dataset.rawValue = item.dataset.value;
      menu.classList.remove('open');
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  // 即时保存：监听所有输入变化
  const saveComp = async () => {
    const newLabel = editPanel.querySelector('[data-field="label"]').value.trim() || comp.label;
    const duplicate = globals.fieldComponents.find(
      c => c.type === comp.type && c.id !== comp.id && c.label === newLabel
    );
    if (duplicate) {
      showToast(`已存在同名组件「${newLabel}」`);
      return;
    }
    comp.label = newLabel;
    comp.placeholder = editPanel.querySelector('[data-field="placeholder"]').value.trim();
    if (!comp.config) comp.config = {};

    editPanel.querySelectorAll('[data-config]').forEach(el => {
      const key = el.dataset.config;
      if (el.type === 'checkbox') {
        comp.config[key] = el.checked;
      } else if (el.dataset.rawValue !== undefined) {
        comp.config[key] = el.dataset.rawValue;
      } else {
        comp.config[key] = el.value.trim();
      }
    });

    // 更新格式预览
    const fmtPreview = editPanel.querySelector(`#format-preview-${compId}`);
    if (fmtPreview) {
      const fmt = comp.config?.format || '';
      if (comp.type === 'number') {
        fmtPreview.textContent = fmt ? formatNumberField('42', fmt) + ' (输入42)' : '';
      } else if (comp.type === 'date') {
        fmtPreview.textContent = fmt ? formatDateField('2026-06-25', fmt) : '';
      }
    }

    await storage.saveGlobals(globals);
    const tpl = globals.cardTemplates?.find(t => t.id === editingTemplateId);
    if (tpl) renderTemplateFields(tpl);
  };

  editPanel.addEventListener('input', saveComp);
  editPanel.addEventListener('change', saveComp);

  editPanel.querySelector('[data-action="delete-comp"]').addEventListener('click', async () => {
    const ok = await showModal('确定删除此组件？');
    if (!ok) return;
    editPanel.classList.add('slide-out');
    editPanel.addEventListener('animationend', async () => {
      globals.fieldComponents = globals.fieldComponents.filter(c => c.id !== compId);
      for (const tpl of (globals.cardTemplates || [])) {
        tpl.fieldIds = tpl.fieldIds.filter(id => id !== compId);
      }
      await storage.saveGlobals(globals);
      renderComponentPanel();
      const tpl = globals.cardTemplates?.find(t => t.id === editingTemplateId);
      if (tpl) {
        renderTemplateFields(tpl);
        renderTemplatePreview(tpl);
      }
    }, { once: true });
  });

  editPanel.querySelector('[data-action="save-comp"]').addEventListener('click', () => {
    const newLabel = editPanel.querySelector('[data-field="label"]').value.trim();
    if (newLabel) {
      const duplicate = globals.fieldComponents.find(c => c.type === comp.type && c.id !== comp.id && c.label === newLabel);
      if (duplicate) {
        showToast(`已存在同名组件「${newLabel}」`);
        return;
      }
    }
    saveComp();
    editPanel.classList.add('slide-out');
    editPanel.addEventListener('animationend', (e) => {
      if (e.animationName !== 'field-slide-out') return;
      renderComponentPanel();
    });
  });
}

async function addNewComponent(type) {
  const id = 'field_' + generateId();
  const typeLabels = { textarea: '文本域', input: '输入框', dropdown: '下拉选择', number: '数字', date: '日期', url: '链接', rating: '评分' };
  const existingLabels = globals.fieldComponents.filter(c => c.type === type).map(c => c.label);
  let label = typeLabels[type] || type;
  let counter = 1;
  while (existingLabels.includes(label)) {
    counter++;
    label = (typeLabels[type] || type) + counter;
  }

  const comp = { id, type, label, placeholder: '', config: {} };
  if (type === 'textarea') comp.config.hasTable = true;
  if (type === 'number') comp.config.format = 'P000';
  if (type === 'date') comp.config.format = 'YYYY-MM-DD';

  globals.fieldComponents.push(comp);
  await storage.saveGlobals(globals);
  renderComponentPanel();
  toggleCompEdit(id);
}

// ===== 模板操作 =====
async function createNewTemplate() {
  const id = 'tpl_' + generateId();
  const baseTemplate = globals.cardTemplates?.find(t => t.id === 'default') || { fieldIds: [] };
  const newTemplate = {
    id,
    name: '新模板',
    fieldIds: [...baseTemplate.fieldIds]
  };
  globals.cardTemplates.push(newTemplate);
  editingTemplateId = id;
  await storage.saveGlobals(globals);
  renderSettings();
}

async function saveCurrentTemplate() {
  const template = globals.cardTemplates.find(t => t.id === editingTemplateId);
  if (!template) return;
  template.name = document.getElementById('template-name-input').value.trim() || template.name;
  await storage.saveGlobals(globals);
  const btn = document.getElementById('btn-save-template');
  const span = btn.querySelector('span');
  if (!span) return;
  btn.disabled = true;
  btn.style.minWidth = btn.offsetWidth + 'px';
  span.style.transition = 'opacity 0.15s ease';
  span.style.opacity = '0';
  setTimeout(() => {
    span.textContent = '已保存';
    span.style.opacity = '1';
    setTimeout(() => {
      span.style.opacity = '0';
      setTimeout(() => {
        span.textContent = '保存模板';
        span.style.opacity = '1';
        setTimeout(() => {
          span.style.transition = '';
          btn.style.minWidth = '';
          btn.disabled = false;
        }, 150);
      }, 150);
    }, 800);
  }, 150);
  renderSettings();
}

async function deleteCurrentTemplate() {
  if (globals.cardTemplates.length <= 1) {
    alert('至少保留一个模板');
    return;
  }
  const ok = await showModal('确定删除此模板？');
  if (!ok) return;
  globals.cardTemplates = globals.cardTemplates.filter(t => t.id !== editingTemplateId);
  for (const [nb, tid] of Object.entries(globals.notebookTemplates)) {
    if (tid === editingTemplateId) globals.notebookTemplates[nb] = 'default';
  }
  editingTemplateId = globals.cardTemplates[0]?.id || null;
  await storage.saveGlobals(globals);
  renderSettings();
}

// ===== 事件绑定 =====
function setupEvents() {
  fileList.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.file-item-delete');
    if (deleteBtn) {
      e.stopPropagation();
      deleteNotebook(deleteBtn.dataset.name);
      return;
    }
    const item = e.target.closest('.file-item');
    if (item && item.dataset.name) openNotebook(item.dataset.name);
  });

  document.getElementById('btn-new-file').addEventListener('click', createNotebook);
  document.getElementById('btn-add-note').addEventListener('click', addNote);

  const notesContent = document.getElementById('notes-content');
  notesContent.addEventListener('click', async (e) => {
    // 点击笔记标签跳转到对应笔记本
    const noteTag = e.target.closest('.note-tag');
    if (noteTag && noteTag.dataset.notebook) {
      e.stopPropagation();
      const notebook = noteTag.dataset.notebook;
      const card = noteTag.closest('.note-card');
      const noteIndex = card?.dataset.index;
      const noteId = noteIndex !== undefined ? notes[parseInt(noteIndex)]?.id : null;
      navigatingToNote = true;
      searchInput.value = '';
      searchClear.style.display = 'none';
      searchMode = false;
      navigatingToNote = false;
      await openNotebook(notebook);
      if (noteId) scrollToNote(noteId);
      return;
    }

    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const index = parseInt(btn.dataset.index);

    if (action === 'edit') editNote(index);
    if (action === 'delete') deleteNote(index);
    if (action === 'save-edit') saveEdit(index);
    if (action === 'cancel-edit') cancelEdit(index);
    if (action === 'refs') openRefPanel(index);
    if (action === 'close-ref') closeRefPanel();
    if (action === 'ref-jump') {
      const noteId = btn.dataset.id;
      const notebook = btn.dataset.notebook;
      if (notebook) {
        if (notebook !== currentNotebook) {
          await openNotebook(notebook);
        }
        if (noteId) {
          scrollToNote(noteId);
          const targetIndex = notes.findIndex(n => n.id === noteId);
          if (targetIndex !== -1) openRefPanel(targetIndex);
        }
      }
    }
    if (action === 'insert-table') insertTable(btn);
    if (action === 'insert-code') insertCodeBlock(btn);
    if (action === 'toggle-quote') {
      const card = btn.closest('.note-card');
      const quoteId = btn.dataset.quoteId;
      const quote = quoteId ? card.querySelector(`.note-quote[data-quote-id="${quoteId}"]`) : card.querySelector('.note-quote');
      if (!quote) return;
      const isCollapsed = quote.classList.contains('collapsed');
      quote.classList.toggle('collapsed');
      btn.querySelector('svg').style.transform = isCollapsed ? 'rotate(180deg)' : '';
    }
    if (action === 'go-to-note') {
      const notebook = btn.dataset.notebook;
      const noteId = btn.dataset.id;
      if (notebook) {
        navigatingToNote = true;
        searchInput.value = '';
        searchClear.style.display = 'none';
        searchMode = false;
        navigatingToNote = false;
        await openNotebook(notebook);
        if (noteId) scrollToNote(noteId);
      }
    }
  });

  modalConfirm.addEventListener('click', () => {
    modalOverlay.style.display = 'none';
    if (modalResolve) modalResolve(true);
  });
  modalCancel.addEventListener('click', () => {
    modalOverlay.style.display = 'none';
    if (modalResolve) modalResolve(false);
  });
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.style.display = 'none';
      if (modalResolve) modalResolve(false);
    }
  });

  document.getElementById('btn-toggle-theme').addEventListener('click', toggleTheme);

  const authOverlay = document.getElementById('auth-overlay');
  const authInput = document.getElementById('auth-input');
  const authError = document.getElementById('auth-error');
  const btnAuth = document.getElementById('btn-auth');

  btnAuth.addEventListener('click', async () => {
    if (document.body.classList.contains('auth-unlocked')) {
      clearAuth();
    } else {
      try {
        const checkRes = await fetch(`${API_BASE}/api/auth/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Auth-Token': '' }
        });
        if (checkRes.ok) {
          setAuth('');
          return;
        }
      } catch (e) {}
      authOverlay.style.display = 'flex';
      authInput.value = '';
      authError.style.display = 'none';
      setTimeout(() => authInput.focus(), 100);
    }
  });

  document.getElementById('auth-confirm').addEventListener('click', async () => {
    const pwd = authInput.value.trim();
    if (!pwd) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': pwd }
      });
      if (res.ok) {
        setAuth(pwd);
        authOverlay.style.display = 'none';
        renderNotes();
      } else {
        authError.style.display = 'block';
      }
    } catch (e) {
      authError.textContent = '连接失败';
      authError.style.display = 'block';
    }
  });

  document.getElementById('auth-cancel').addEventListener('click', () => {
    authOverlay.style.display = 'none';
  });

  authOverlay.addEventListener('click', (e) => {
    if (e.target === authOverlay) authOverlay.style.display = 'none';
  });

  authInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('auth-confirm').click();
    if (e.key === 'Escape') authOverlay.style.display = 'none';
  });

  // 表格插入弹窗
  const tableOverlay = document.getElementById('table-overlay');
  const tableRowsEl = document.getElementById('table-rows');
  const tableColsEl = document.getElementById('table-cols');

  document.getElementById('table-confirm').addEventListener('click', insertTableConfirm);
  document.getElementById('table-cancel').addEventListener('click', () => {
    tableOverlay.style.display = 'none';
    tableInsertTarget = null;
    tableInsertPos = null;
  });
  tableOverlay.addEventListener('click', (e) => {
    if (e.target === tableOverlay) {
      tableOverlay.style.display = 'none';
      tableInsertTarget = null;
      tableInsertPos = null;
    }
  });

  function updateTableEditor() {
    let rows = parseInt(tableRowsEl.value) || 1;
    let cols = parseInt(tableColsEl.value) || 1;
    rows = Math.max(1, Math.min(20, rows));
    cols = Math.max(1, Math.min(10, cols));
    showTableEditor(rows, cols);
  }

  tableRowsEl.addEventListener('input', updateTableEditor);
  tableColsEl.addEventListener('input', updateTableEditor);

  tableOverlay.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    let rows = parseInt(tableRowsEl.value) || 1;
    let cols = parseInt(tableColsEl.value) || 1;
    if (action === 'table-rows-minus') rows = Math.max(1, rows - 1);
    else if (action === 'table-rows-plus') rows = Math.min(20, rows + 1);
    else if (action === 'table-cols-minus') cols = Math.max(1, cols - 1);
    else if (action === 'table-cols-plus') cols = Math.min(10, cols + 1);
    tableRowsEl.value = rows;
    tableColsEl.value = cols;
    showTableEditor(rows, cols);
  });

  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });

  // 设置弹窗
  setupSettingsEvents();

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      if (currentNotebook) addNote();
    }
  });

  // 图片点击放大 + 滚轮缩放
  const lightbox = document.getElementById('image-lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  let lightboxScale = 1;

  document.addEventListener('click', (e) => {
    const img = e.target.closest('.note-image img');
    if (img) {
      lightboxImg.src = img.src;
      lightboxScale = 1;
      lightboxImg.style.transform = '';
      lightbox.classList.add('open');
      return;
    }
    if (e.target === lightbox || e.target === lightboxImg) {
      lightbox.classList.remove('open');
      lightboxImg.src = '';
      lightboxScale = 1;
      lightboxImg.style.transform = '';
    }
  });

  lightbox.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    lightboxScale = Math.min(5, Math.max(0.2, lightboxScale + delta));
    lightboxImg.style.transform = `scale(${lightboxScale})`;
  });
}

// ===== 工具函数 =====
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderContent(str) {
  if (!str) return '';
  const lines = str.split('\n');

  let html = '';
  let inTable = false;
  let tableLines = [];
  let inCodeBlock = false;
  let codeLines = [];
  let codeLang = '';

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 代码块处理（优先级最高）
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        // 结束代码块
        html += `<pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`;
        inCodeBlock = false;
        codeLines = [];
        codeLang = '';
      } else {
        // 开始代码块
        if (inTable) { html += renderTable(tableLines); inTable = false; tableLines = []; }
        inCodeBlock = true;
        codeLang = trimmed.slice(3).trim();
      }
      continue;
    }

    // 在代码块内，直接收集行（不做任何处理）
    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    // 以下是代码块外的处理
    if (trimmed === '') {
      if (inTable) { html += renderTable(tableLines); inTable = false; tableLines = []; }
      html += '<div class="para-gap"></div>';
      continue;
    }
    // 图片语法 ![alt](url)
    const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      if (inTable) { html += renderTable(tableLines); inTable = false; tableLines = []; }
      html += `<p class="note-image"><img src="${escapeHtml(imgMatch[2])}" alt="${escapeHtml(imgMatch[1])}" loading="lazy"></p>`;
      continue;
    }
    const escapedTrimmed = escapeHtml(trimmed);
    if (trimmed.includes('|') && (trimmed.startsWith('|') || trimmed.match(/^\S.*\|/))) {
      if (!inTable) { inTable = true; tableLines = []; }
      const normalized = escapedTrimmed.startsWith('|') ? escapedTrimmed : '| ' + escapedTrimmed;
      tableLines.push(normalized.endsWith('|') ? normalized : normalized + ' |');
      continue;
    }
    if (inTable) { html += renderTable(tableLines); inTable = false; tableLines = []; }

    let rendered = escapedTrimmed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
    const hasLeadingSpace = /^[\s\u3000]/.test(rawLine);
    if (!hasLeadingSpace) {
      html += `<p class="indent">${rendered}</p>`;
    } else {
      html += `<p>${rendered}</p>`;
    }
  }
  if (inTable) html += renderTable(tableLines);
  if (inCodeBlock) html += `<pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`;
  return html;
}

function renderQuote(str) {
  if (!str) return '';
  const cleaned = str.replace(/^>\s?/gm, '');
  const lines = cleaned.split('\n');

  let html = '';
  let inTable = false;
  let tableLines = [];
  let inCodeBlock = false;
  let codeLines = [];
  let codeLang = '';

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // 代码块处理（优先级最高）
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        html += `<pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`;
        inCodeBlock = false;
        codeLines = [];
        codeLang = '';
      } else {
        if (inTable) { html += renderTable(tableLines); inTable = false; tableLines = []; }
        inCodeBlock = true;
        codeLang = trimmed.slice(3).trim();
      }
      continue;
    }

    // 在代码块内，直接收集行
    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    if (trimmed === '') {
      if (inTable) { html += renderTable(tableLines); inTable = false; tableLines = []; }
      html += '<div class="quote-gap"></div>';
      continue;
    }

    // 图片语法 ![alt](url)
    const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      if (inTable) { html += renderTable(tableLines); inTable = false; tableLines = []; }
      html += `<p class="note-image"><img src="${escapeHtml(imgMatch[2])}" alt="${escapeHtml(imgMatch[1])}" loading="lazy"></p>`;
      continue;
    }

    const escapedTrimmed = escapeHtml(trimmed);
    if (trimmed.includes('|') && (trimmed.startsWith('|') || trimmed.match(/^\S.*\|/))) {
      const normalized = escapedTrimmed.startsWith('|') ? escapedTrimmed : '| ' + escapedTrimmed;
      if (!inTable) { inTable = true; tableLines = []; }
      tableLines.push(normalized.endsWith('|') ? normalized : normalized + ' |');
      continue;
    }

    if (inTable) { html += renderTable(tableLines); inTable = false; tableLines = []; }

    let rendered = escapedTrimmed
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');

    const hasLeadingSpace = /^[\s\u3000]/.test(rawLine);
    if (!hasLeadingSpace) {
      html += `<p class="indent">${rendered}</p>`;
    } else {
      html += `<p>${rendered}</p>`;
    }
  }

  if (inTable) { html += renderTable(tableLines); }
  if (inCodeBlock) html += `<pre><code class="language-${escapeHtml(codeLang)}">${escapeHtml(codeLines.join('\n'))}</code></pre>`;
  return html;
}

function renderTable(lines) {
  if (lines.length < 2) return lines.join('\n');

  const parseRow = (line) => line.split('|').slice(1, -1).map(cell => cell.trim());

  const header = parseRow(lines[0]);
  const startIdx = (lines[1] && lines[1].match(/^\|[\s\-:]+\|/)) ? 2 : 1;
  const rows = lines.slice(startIdx).map(parseRow);

  let html = '<table class="md-table"><thead><tr>';
  header.forEach(h => { html += `<th>${h}</th>`; });
  html += '</tr></thead><tbody>';
  rows.forEach(row => {
    html += '<tr>';
    row.forEach(cell => { html += `<td>${cell}</td>`; });
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}


function formatNumberField(val, format) {
  val = val.trim();
  if (!val || !format) return val;
  const numMatch = val.match(/-?\d+\.?\d*/);
  if (!numMatch) return val;
  const num = numMatch[0];

  // Excel风格：0=补零，#=不补零，其余原样
  // 找到 0 和 # 组成的占位符组
  const result = format.replace(/(0+|#+)/g, (match) => {
    if (match[0] === '0') {
      return num.padStart(match.length, '0');
    } else {
      return num;
    }
  });
  return result;
}

function formatDateField(val, format) {
  if (!val || !format) return val;
  let d;
  if (val instanceof Date) {
    d = val;
  } else {
    d = new Date(val);
  }
  if (isNaN(d.getTime())) return val;

  const YYYY = d.getFullYear().toString();
  const YY = YYYY.slice(-2);
  const MM = (d.getMonth() + 1).toString().padStart(2, '0');
  const M = (d.getMonth() + 1).toString();
  const DD = d.getDate().toString().padStart(2, '0');
  const D = d.getDate().toString();

  // 先替换长占位符，再替换短占位符，避免误匹配
  return format
    .replace(/YYYY/gi, YYYY)
    .replace(/YY/gi, YY)
    .replace(/MM/g, MM)
    .replace(/DD/gi, DD)
    .replace(/M/g, M)
    .replace(/D/gi, D);
}

function parseNumField(val) {
  if (!val) return null;
  const match = val.match(/\d+/);
  return match ? parseInt(match[0]) : null;
}

document.addEventListener('click', () => {
  document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
});

init();
