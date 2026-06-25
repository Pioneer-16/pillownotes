# 笔记本标签化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将多个笔记本文件合并为单个 `notes.json`，每条笔记通过 `notebooks` 数组字段实现多笔记本归属。

**Architecture:** 前后端均改为操作单个 `notes.json` 文件。侧栏的"笔记本"变为标签筛选器，点击某个笔记本筛选含该标签的笔记，点击"全部"显示所有笔记。新增/编辑笔记时可选择多个笔记本标签。

**Tech Stack:** Node.js (server), vanilla JS + HTML + CSS (frontend), JSON file storage

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `web/server.js` | Modify | API 重构：单文件读写 + 标签管理 |
| `web/app.js` | Modify | 前端逻辑：标签筛选、多选编辑、全部视图 |
| `web/style.css` | Modify | 标签样式 |
| `web/index.html` | Modify | 侧栏增加"全部"入口 |
| `migrate.js` | Create | 一次性迁移脚本 |

---

### Task 1: 迁移脚本 — 合并现有数据

**Covers:** S4

**Files:**
- Create: `读书笔记app/migrate.js`

- [ ] **Step 1: 创建迁移脚本**

```js
// migrate.js — 一次性迁移脚本，将多文件合并为单个 notes.json
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../读书笔记');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');
const GLOBALS_FILE = path.join(DATA_DIR, '_globals.json');

// 读取所有笔记本文件
const files = fs.readdirSync(DATA_DIR).filter(f =>
  f.endsWith('.json') && f !== '_order.json' && f !== '_globals.json' && f !== 'notes.json'
);

const allNotes = [];
const notebookNames = [];

for (const file of files) {
  const name = file.replace('.json', '');
  notebookNames.push(name);

  let notes = [];
  try {
    notes = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
  } catch (e) {
    console.warn(`跳过无法读取的文件: ${file}`);
    continue;
  }

  if (!Array.isArray(notes)) continue;

  for (const note of notes) {
    allNotes.push({
      ...note,
      notebooks: [name],
    });
  }
}

// 写入 notes.json
fs.writeFileSync(NOTES_FILE, JSON.stringify(allNotes, null, 2), 'utf-8');
console.log(`已合并 ${allNotes.length} 条笔记，来自 ${files.length} 个笔记本`);

// 更新 _globals.json，增加 notebooks 字段
let globals = { books: [], dynasties: [], lastBook: '', lastDynasty: '' };
try {
  globals = JSON.parse(fs.readFileSync(GLOBALS_FILE, 'utf-8'));
} catch (e) {}
globals.notebooks = notebookNames;
fs.writeFileSync(GLOBALS_FILE, JSON.stringify(globals, null, 2), 'utf-8');
console.log(`已更新 _globals.json，笔记本列表: ${notebookNames.join(', ')}`);
```

- [ ] **Step 2: 运行迁移**

Run: `node migrate.js` (在 `读书笔记app` 目录下)
Expected: 输出合并结果，`读书笔记/` 目录下生成 `notes.json`

- [ ] **Step 3: 验证迁移结果**

检查 `读书笔记/notes.json` 内容：每条笔记都有 `notebooks` 数组字段。
检查 `_globals.json` 包含 `notebooks` 字段。

---

### Task 2: 服务端 API 重构

**Covers:** S2

**Files:**
- Modify: `web/server.js`

- [ ] **Step 1: 添加笔记读写函数**

在 `server.js` 的 `saveGlobals` 函数之后添加：

```js
// 笔记数据（单文件）
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');

function readAllNotes() {
  if (!fs.existsSync(NOTES_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(NOTES_FILE, 'utf-8'));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function saveAllNotes(notes) {
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2), 'utf-8');
}
```

- [ ] **Step 2: 重写 `getNotebooks` 函数**

替换原有 `getNotebooks` 函数：

```js
function getNotebooks() {
  const globals = getGlobals();
  const allNotes = readAllNotes();
  const names = globals.notebooks || [];

  return names.map(name => {
    const count = allNotes.filter(n => n.notebooks && n.notebooks.includes(name)).length;
    return { name, count };
  });
}
```

- [ ] **Step 3: 替换笔记 API 路由**

删除原有的 `readNotes` 和 `saveNotes` 函数。
替换所有 `/api/notes/` 路由为：

```js
// 读取笔记（可选 ?notebook=xxx 筛选）
if (pathname === '/api/notes' && req.method === 'GET') {
  let notes = readAllNotes();
  const notebook = url.searchParams.get('notebook');
  if (notebook) {
    notes = notes.filter(n => n.notebooks && n.notebooks.includes(notebook));
  }
  return sendJSON(res, notes);
}

// 保存笔记（整数组回写）
if (pathname === '/api/notes' && req.method === 'POST') {
  if (!checkAuth(req)) return sendError(res, '需要验证密码', 401);
  const { notes } = await parseBody(req);
  if (!Array.isArray(notes)) return sendError(res, '无效数据');
  saveAllNotes(notes);
  return sendJSON(res, { success: true });
}
```

- [ ] **Step 4: 替换笔记本 CRUD 路由**

替换 `createNotebook` 和 `deleteNotebook` 函数及对应路由：

```js
function createNotebook(name) {
  const globals = getGlobals();
  if (!globals.notebooks) globals.notebooks = [];
  if (globals.notebooks.includes(name)) return { success: false, error: '已存在同名笔记本' };
  globals.notebooks.push(name);
  saveGlobals(globals);
  return { success: true };
}

function deleteNotebook(name) {
  const globals = getGlobals();
  globals.notebooks = (globals.notebooks || []).filter(n => n !== name);
  saveGlobals(globals);

  // 从所有笔记中移除该标签，仅此标签的笔记连带删除
  const notes = readAllNotes();
  const filtered = notes.filter(n => {
    if (!n.notebooks || !n.notebooks.includes(name)) return true;
    n.notebooks = n.notebooks.filter(nb => nb !== name);
    return n.notebooks.length > 0;
  });
  saveAllNotes(filtered);
}
```

替换路由：

```js
if (pathname === '/api/notebooks' && req.method === 'GET') {
  return sendJSON(res, getNotebooks());
}

if (pathname === '/api/notebooks' && req.method === 'POST') {
  if (!checkAuth(req)) return sendError(res, '需要验证密码', 401);
  const { name } = await parseBody(req);
  if (!name) return sendError(res, '名称不能为空');
  return sendJSON(res, createNotebook(name));
}

if (pathname.startsWith('/api/notebooks/') && req.method === 'DELETE') {
  if (!checkAuth(req)) return sendError(res, '需要验证密码', 401);
  const name = decodeURIComponent(pathname.slice('/api/notebooks/'.length));
  deleteNotebook(name);
  return sendJSON(res, { success: true });
}
```

- [ ] **Step 5: 删除废弃代码**

删除 `getOrder`、`saveOrder`、`readNotes`、`saveNotes` 函数。
删除 `/api/notebooks/order` 路由。
删除 `_order.json` 相关逻辑。

- [ ] **Step 6: 验证服务端**

Run: `node server.js`
用浏览器或 curl 测试：
- `GET /api/notebooks` 返回笔记本列表
- `GET /api/notes` 返回所有笔记
- `GET /api/notes?notebook=天文` 返回筛选后的笔记
- `POST /api/notes` 保存笔记
- `POST /api/notebooks` 创建新笔记本
- `DELETE /api/notebooks/xxx` 删除笔记本

---

### Task 3: 前端 — 笔记本 API 调用重构

**Covers:** S2, S3

**Files:**
- Modify: `web/app.js`

- [ ] **Step 1: 更新 storage 对象**

替换 `storage` 对象中的方法：

```js
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

  async saveNotes(notes) {
    await fetch(`${API_BASE}/api/notes`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ notes })
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
  }
};
```

- [ ] **Step 2: 更新状态变量**

将 `currentFile` 替换为 `currentNotebook`：

```js
let currentNotebook = null;  // 当前选中的笔记本标签（null 表示"全部"）
let notes = [];
let allNotes = [];  // 所有笔记的缓存
let globals = { books: [], dynasties: [], notebooks: [], lastBook: '', lastDynasty: '' };
```

- [ ] **Step 3: 更新 `openNotebook` 函数**

```js
async function openNotebook(name) {
  currentNotebook = name;
  notes = await storage.getNotes(name);
  fileTitle.textContent = name || '全部笔记';
  placeholder.style.display = 'none';
  notesView.style.display = 'flex';
  renderNotes();
  await loadFiles();
}
```

- [ ] **Step 4: 更新 `loadFiles` 函数**

```js
async function loadFiles() {
  const notebooks = await storage.getNotebooks();
  const allHtml = `<li class="file-item ${!currentNotebook ? 'active' : ''}" data-notebook="">
    <span class="file-item-name">全部笔记</span>
  </li>`;
  const itemsHtml = notebooks.map(nb => `
    <li class="file-item ${nb.name === currentNotebook ? 'active' : ''}" data-notebook="${escapeHtml(nb.name)}" draggable="true">
      <span class="file-item-drag">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
      </span>
      <span class="file-item-name">${escapeHtml(nb.name)} <span class="file-item-count">(${nb.count})</span></span>
      <button class="file-item-delete" data-notebook="${escapeHtml(nb.name)}" title="删除">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
      </button>
    </li>
  `).join('');
  fileList.innerHTML = allHtml + itemsHtml;
  setupDragSort();
}
```

- [ ] **Step 5: 更新侧栏点击事件**

替换 `setupEvents` 中的侧栏点击处理：

```js
fileList.addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('.file-item-delete');
  if (deleteBtn) {
    e.stopPropagation();
    deleteNotebook(deleteBtn.dataset.notebook);
    return;
  }
  const item = e.target.closest('.file-item');
  if (item) openNotebook(item.dataset.notebook || null);
});
```

- [ ] **Step 6: 更新 `deleteNotebook` 函数**

```js
async function deleteNotebook(name) {
  const ok = await showModal(`确定删除笔记本「${name}」吗？仅此标签的笔记将被删除。`);
  if (!ok) return;
  await storage.deleteNotebook(name);
  if (currentNotebook === name) {
    currentNotebook = null;
    notes = [];
    notesView.style.display = 'none';
    placeholder.style.display = 'flex';
  }
  await loadFiles();
}
```

- [ ] **Step 7: 更新 `createNotebook` 函数**

```js
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
```

- [ ] **Step 8: 更新 `saveEdit` 和 `addNote` 中的保存逻辑**

`saveEdit` 中替换保存调用：

```js
// 替换笔记数据
const allNotesData = await storage.getNotes();
const noteIndex = parseInt(card.dataset.index);
// 找到对应笔记在全部数据中的位置
const noteToUpdate = notes[noteIndex];
// ... 更新字段 ...
// 整数组回写
await storage.saveNotes(allNotesData);
```

`addNote` 中：

```js
async function addNote() {
  if (!currentNotebook) return;
  const allNotesData = await storage.getNotes();
  allNotesData.push({
    content: '', book: '', dynasty: '', quote: '',
    notebooks: [currentNotebook],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  await storage.saveNotes(allNotesData);
  notes = await storage.getNotes(currentNotebook);
  renderNotes();
  // ... 滚动逻辑 ...
}
```

---

### Task 4: 前端 — 编辑表单支持多笔记本

**Covers:** S3

**Files:**
- Modify: `web/app.js` (editNote 函数)
- Modify: `web/style.css` (标签多选样式)

- [ ] **Step 1: 在编辑表单中添加笔记本多选字段**

在 `editNote` 函数的表单 HTML 中，在"引用"字段之前添加：

```html
<div class="edit-col">
  <label class="edit-label">所属笔记本</label>
  <div class="notebook-tags-input" data-notebooks="${escapeHtml(JSON.stringify(note.notebooks || []))}">
    <div class="notebook-tags-list"></div>
    <div class="dropdown-wrap">
      <input type="text" class="edit-field edit-notebook-input" placeholder="添加笔记本…" autocomplete="off">
      <div class="dropdown-menu notebook-dropdown"></div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: 添加笔记本标签多选的 JS 逻辑**

在 `editNote` 函数末尾（下拉逻辑之后）添加：

```js
// 笔记本标签多选
const tagsContainer = card.querySelector('.notebook-tags-input');
const tagsList = card.querySelector('.notebook-tags-list');
const nbInput = card.querySelector('.edit-notebook-input');
const nbDropdown = card.querySelector('.notebook-dropdown');
let selectedNotebooks = note.notebooks ? [...note.notebooks] : (currentNotebook ? [currentNotebook] : []);

function renderNotebookTags() {
  tagsList.innerHTML = selectedNotebooks.map(nb =>
    `<span class="notebook-tag">${escapeHtml(nb)}<button type="button" class="notebook-tag-remove" data-nb="${escapeHtml(nb)}">&times;</button></span>`
  ).join('');
}

function renderNotebookDropdown() {
  const available = (globals.notebooks || []).filter(nb => !selectedNotebooks.includes(nb));
  const filter = nbInput.value.trim();
  const filtered = filter ? available.filter(nb => nb.includes(filter)) : available;
  nbDropdown.innerHTML = filtered.map(nb =>
    `<div class="dropdown-item" data-value="${escapeHtml(nb)}">${escapeHtml(nb)}</div>`
  ).join('');
  // 如果输入值不在列表中，显示"新建"
  if (filter && !available.includes(filter)) {
    nbDropdown.innerHTML += `<div class="dropdown-item" data-value="${escapeHtml(filter)}">+ 新建「${escapeHtml(filter)}」</div>`;
  }
  nbDropdown.classList.toggle('open', nbDropdown.innerHTML.length > 0);
}

renderNotebookTags();

tagsList.addEventListener('click', (e) => {
  const btn = e.target.closest('.notebook-tag-remove');
  if (btn) {
    selectedNotebooks = selectedNotebooks.filter(nb => nb !== btn.dataset.nb);
    renderNotebookTags();
  }
});

nbInput.addEventListener('focus', renderNotebookDropdown);
nbInput.addEventListener('input', renderNotebookDropdown);

nbDropdown.addEventListener('click', (e) => {
  const item = e.target.closest('.dropdown-item');
  if (!item) return;
  const val = item.dataset.value;
  if (val && !selectedNotebooks.includes(val)) {
    selectedNotebooks.push(val);
    renderNotebookTags();
  }
  nbInput.value = '';
  nbDropdown.classList.remove('open');
});
```

- [ ] **Step 3: 更新 `saveEdit` 使用 `selectedNotebooks`**

在 `saveEdit` 中，读取编辑后的笔记本标签：

```js
const editTagsContainer = card.querySelector('.notebook-tags-input');
const selectedNbs = [...card.querySelectorAll('.notebook-tag')].map(
  tag => tag.textContent.replace('×', '').trim()
);
```

保存时设置 `notebooks: selectedNbs`。

- [ ] **Step 4: 添加笔记本标签的 CSS 样式**

在 `style.css` 的 `.edit-col` 样式之后添加：

```css
/* 笔记本标签多选 */
.notebook-tags-input {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.notebook-tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.notebook-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--color-bamboo-mist);
  color: var(--color-bamboo);
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
}
.notebook-tag-remove {
  border: none;
  background: none;
  color: var(--color-bamboo);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  opacity: 0.6;
}
.notebook-tag-remove:hover {
  opacity: 1;
}
.notebook-tag .file-item-count {
  font-size: 12px;
  opacity: 0.6;
}
.file-item-count {
  font-size: 12px;
  opacity: 0.6;
}
```

---

### Task 5: 前端 — 笔记卡片显示笔记本标签

**Covers:** S3

**Files:**
- Modify: `web/app.js` (renderNotes 函数)
- Modify: `web/style.css`

- [ ] **Step 1: 在笔记卡片渲染中添加笔记本标签**

在 `renderNotes` 函数中，`<div class="note-card-body">` 内部末尾添加：

```js
${note.notebooks && note.notebooks.length > 0 ? `<div class="note-card-notebooks">${note.notebooks.map(nb => `<span class="note-card-notebook">${escapeHtml(nb)}</span>`).join('')}</div>` : ''}
```

- [ ] **Step 2: 添加笔记本标签的卡片样式**

在 `style.css` 的 `.note-source` 样式之后添加：

```css
.note-card-notebooks {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.note-card-notebook {
  font-size: 11px;
  padding: 2px 8px;
  background: var(--color-bamboo-mist);
  color: var(--color-bamboo);
  border-radius: 10px;
  font-weight: 500;
}
```

- [ ] **Step 3: 验证全部功能**

Run: `node server.js`
浏览器打开 http://localhost:3000

验证项：
1. 侧栏显示"全部笔记"和各笔记本
2. 点击笔记本筛选对应笔记
3. 点击"全部"显示所有笔记
4. 新建笔记本正常工作
5. 删除笔记本时仅此标签的笔记被删除
6. 编辑笔记时可选择多个笔记本标签
7. 笔记卡片上显示所属笔记本标签
8. 新增笔记自动归属当前选中的笔记本

---

### Task 6: 清理旧文件和拖拽排序

**Covers:** S4

**Files:**
- Modify: `web/app.js` (拖拽排序)

- [ ] **Step 1: 更新拖拽排序逻辑**

`setupDragSort` 中更新保存排序的逻辑。由于笔记本列表现在由服务端 `_globals.json` 的 `notebooks` 数组管理，拖拽排序需要保存到服务端：

在 `saveFileOrder` 中：

```js
async function saveFileOrder() {
  const items = [...fileList.querySelectorAll('.file-item[data-notebook]')];
  const order = items.map(item => item.dataset.notebook).filter(Boolean);
  await storage.saveGlobals({ notebooks: order });
}
```

在 `storage` 中添加对 `notebooks` 字段的保存支持（在 `saveGlobals` 中已有）。

- [ ] **Step 2: 删除旧的迁移脚本和备份文件**

迁移完成并验证无误后，手动删除：
- `读书笔记app/migrate.js`
- `读书笔记/` 目录下的旧笔记本文件（如 `天文.json`、`历法.json` 等）
- `读书笔记/_order.json`

- [ ] **Step 3: 最终验证**

完整测试所有功能，确保没有遗漏。
