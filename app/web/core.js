// ===== 枕书阁 - 共享核心（core.js）=====
// PC 端（app.js / index.html）与移动端（mobile.js / mobile.html）共用。
// 只放数据层：API 基址、存储接口、认证 token。禁止在此文件访问任何 DOM。

const API_BASE = window.location.pathname.startsWith('/notes/')
  ? window.location.origin + '/notes'
  : window.location.origin;

// ===== 认证 token =====
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

// ===== 存储 API =====
const storage = {
  async getNotebooks() {
    const res = await fetch(`${API_BASE}/api/notebooks`, { headers: getAuthHeaders() });
    return await res.json();
  },

  async getNotes(notebook, groupId) {
    let url = notebook
      ? `${API_BASE}/api/notes?notebook=${encodeURIComponent(notebook)}`
      : `${API_BASE}/api/notes`;
    if (groupId) url += `${url.includes('?') ? '&' : '?'}group=${groupId}`;

    let lastError;
    for (let i = 0; i < 3; i++) {
      try {
        const res = await fetch(url, { headers: getAuthHeaders() });
        return await res.json();
      } catch (e) {
        lastError = e;
        if (i < 2) await new Promise(r => setTimeout(r, 1000));
      }
    }
    throw lastError;
  },

  async getAllNotes(groupId) {
    let url = `${API_BASE}/api/notes`;
    if (groupId) url += `?group=${groupId}`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    return await res.json();
  },

  async saveAllNotes(notes, groupId) {
    await fetch(`${API_BASE}/api/notes`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ notes, groupId })
    });
  },

  async createNote(note, groupId) {
    await fetch(`${API_BASE}/api/notes/${encodeURIComponent(note.id)}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ...note, groupId })
    });
  },

  async updateNote(note, groupId) {
    await fetch(`${API_BASE}/api/notes/${encodeURIComponent(note.id)}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ...note, groupId })
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
    const res = await fetch(`${API_BASE}/api/globals`, { headers: getAuthHeaders() });
    return await res.json();
  },

  async saveGlobals(data) {
    await fetch(`${API_BASE}/api/globals`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
  },

  async searchNotes(q, groupId) {
    let url = `${API_BASE}/api/notes/search?q=${encodeURIComponent(q)}`;
    if (groupId) url += `&group=${groupId}`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    return await res.json();
  },

  async deleteNote(id, groupId) {
    let url = `${API_BASE}/api/notes/${encodeURIComponent(id)}`;
    if (groupId) url += `?group=${groupId}`;
    await fetch(url, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
  },

  async filterNotes(filters, groupId) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v);
    }
    if (groupId) params.set('group', groupId);
    const res = await fetch(`${API_BASE}/api/notes/filter?${params}`, { headers: getAuthHeaders() });
    return await res.json();
  },

  async getRefs(noteId) {
    const res = await fetch(`${API_BASE}/api/refs?noteId=${encodeURIComponent(noteId)}`, { headers: getAuthHeaders() });
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
    const res = await fetch(`${API_BASE}/api/refs/all`, { headers: getAuthHeaders() });
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
  },

  // 群组相关
  async getGroups() {
    const res = await fetch(`${API_BASE}/api/groups`, { headers: getAuthHeaders() });
    return await res.json();
  },

  async createGroup(name) {
    const res = await fetch(`${API_BASE}/api/groups`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name })
    });
    return await res.json();
  },

  async joinGroup(inviteCode) {
    const res = await fetch(`${API_BASE}/api/groups/join`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ inviteCode })
    });
    return await res.json();
  },

  async getGroupDetail(groupId) {
    const res = await fetch(`${API_BASE}/api/groups/${groupId}`, { headers: getAuthHeaders() });
    return await res.json();
  },

  async addGroupNotebook(groupId, notebookName) {
    const res = await fetch(`${API_BASE}/api/groups/${groupId}/notebooks`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ notebookName })
    });
    return await res.json();
  },

  async removeGroupNotebook(groupId, notebookName) {
    const res = await fetch(`${API_BASE}/api/groups/${groupId}/notebooks/${encodeURIComponent(notebookName)}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return await res.json();
  }
};
