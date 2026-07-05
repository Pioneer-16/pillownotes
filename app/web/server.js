require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { noteOps, notebookOps, refOps, groupOps, db, getGroupUserId } = require('./db');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.resolve(__dirname, '../../data');
const WEB_DIR = __dirname;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';
const JWT_SECRET = process.env.JWT_SECRET || 'pillownotes-secret-key-' + Date.now();

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function getMime(filePath) {
  return MIME[path.extname(filePath)] || 'application/octet-stream';
}

function sendJSON(req, res, data, status = 200) {
  const jsonData = JSON.stringify(data);
  const acceptEncoding = req.headers['accept-encoding'] || '';
  const shouldCompress = acceptEncoding.includes('gzip');
  
  if (shouldCompress) {
    const compressed = zlib.gzipSync(Buffer.from(jsonData, 'utf-8'));
    res.writeHead(status, { 
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Encoding': 'gzip'
    });
    res.end(compressed);
  } else {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(jsonData);
  }
}

function sendError(req, res, msg, status = 400) {
  sendJSON(req, res, { error: msg }, status);
}

function getGlobals(userId) {
  const userFile = path.join(DATA_DIR, `globals_${userId}.json`);
  if (fs.existsSync(userFile)) {
    try { return JSON.parse(fs.readFileSync(userFile, 'utf-8')); } catch (e) {}
  }
  const sampleFile = path.join(DATA_DIR, 'sample', '_globals.json');
  if (fs.existsSync(sampleFile)) {
    try {
      const sample = JSON.parse(fs.readFileSync(sampleFile, 'utf-8'));
      saveGlobals(sample, userId);
      return sample;
    } catch (e) {}
  }
  return { fieldComponents: [], cardTemplates: [], notebookTemplates: {}, notebooks: [] };
}

function saveGlobals(data, userId) {
  const userFile = path.join(DATA_DIR, `globals_${userId}.json`);
  fs.writeFileSync(userFile, JSON.stringify(data, null, 2), 'utf-8');
}

function parseBody(req, maxSize = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;
    const timer = setTimeout(() => reject(new Error('请求超时')), 15000);

    req.on('data', chunk => {
      totalSize += chunk.length;
      if (totalSize > maxSize) {
        req.destroy();
        reject(new Error('请求体过大'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
      catch (e) { reject(e); }
    });
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

function checkAuth(req) {
  if (!AUTH_PASSWORD) return true;
  
  const token = req.headers['x-auth-token'];
  if (!token) return false;
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.username = decoded.username;
    req.role = decoded.role || 'user';
    return true;
  } catch (e) {
    return false;
  }
}

function requireAdmin(req) {
  return req.role === 'admin';
}

const userOps = {
  async register(username, password) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      throw new Error('用户名已存在');
    }
    
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const passwordHash = await bcrypt.hash(password, 10);
    
    db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(id, username, passwordHash, 'user');
    
    const orphanedNotes = db.prepare("SELECT COUNT(*) as c FROM notes WHERE user_id IS NULL").get();
    if (orphanedNotes.c > 0) {
      db.prepare("UPDATE notes SET user_id = ? WHERE user_id IS NULL").run(id);
      db.prepare("UPDATE notebooks SET user_id = ? WHERE user_id IS NULL").run(id);
    }
    
    return { id, username, role: 'user' };
  },
  
  async login(username, password) {
    const user = db.prepare('SELECT id, username, password_hash, role FROM users WHERE username = ?').get(username);
    if (!user) {
      throw new Error('用户名或密码错误');
    }
    
    if (!await bcrypt.compare(password, user.password_hash)) {
      throw new Error('用户名或密码错误');
    }
    
    return { id: user.id, username: user.username, role: user.role || 'user' };
  },
  
  generateToken(user) {
    return jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
  },

  setRole(userId, role) {
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  }
};

const server = http.createServer(async (req, res) => {
  const start = Date.now();
  const reqId = Math.random().toString(36).slice(2, 8);
  console.log(`[${reqId}] → ${req.method} ${req.url} from ${req.socket.remoteAddress}`);
  const origEnd = res.end.bind(res);
  res.end = function(...args) {
    console.log(`[${reqId}] ← ${res.statusCode} ${Date.now() - start}ms`);
    return origEnd(...args);
  };
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // === 静态文件（不需要登录）===
  if (!pathname.startsWith('/api/')) {
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.join(WEB_DIR, filePath);

    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(WEB_DIR))) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const isStatic = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2'].includes(ext);
      const cacheControl = isStatic ? 'public, max-age=2592000' : 'no-cache';
      res.writeHead(200, {
        'Content-Type': getMime(filePath),
        'Cache-Control': cacheControl
      });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
    return;
  }

  // === 认证接口（不需要登录）===
  if (pathname === '/api/auth/register' && req.method === 'POST') {
    try {
      const { username, password } = await parseBody(req);
      if (!username || !password) return sendError(req, res, '用户名和密码不能为空');
      if (username.length < 2 || username.length > 20) return sendError(req, res, '用户名长度需要在2-20个字符之间');
      if (password.length < 6) return sendError(req, res, '密码长度不能少于6个字符');
      
      const user = await userOps.register(username, password);
      const token = userOps.generateToken(user);
      return sendJSON(req, res, { success: true, token, username: user.username });
    } catch (e) {
      return sendError(req, res, e.message);
    }
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const { username, password } = await parseBody(req);
      if (!username || !password) return sendError(req, res, '用户名和密码不能为空');
      
      const user = await userOps.login(username, password);
      const token = userOps.generateToken(user);
      return sendJSON(req, res, { success: true, token, username: user.username });
    } catch (e) {
      return sendError(req, res, e.message);
    }
  }

  if (pathname === '/api/auth/check' && req.method === 'POST') {
    if (checkAuth(req)) {
      return sendJSON(req, res, { success: true, username: req.username, role: req.role });
    }
    return sendError(req, res, '未登录', 401);
  }

  // SSO 登录
  if (pathname === '/api/auth/sso-login' && req.method === 'POST') {
    try {
      const { ssoToken } = await parseBody(req);
      if (!ssoToken) return sendError(req, res, '缺少 SSO token');

      // 验证 SSO token（调用 Portal 的验证接口）
      const http = require('http');
      const verifyRes = await new Promise((resolve, reject) => {
        const options = {
          hostname: '127.0.0.1',
          port: 3001,
          path: '/api/auth/sso-verify',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        };
        const req2 = http.request(options, (res2) => {
          let data = '';
          res2.on('data', chunk => data += chunk);
          res2.on('end', () => resolve(JSON.parse(data)));
        });
        req2.on('error', reject);
        req2.write(JSON.stringify({ token: ssoToken }));
        req2.end();
      });

      if (!verifyRes.userId) return sendError(req, res, 'SSO token 无效');

      // 检查用户是否存在于枕书阁
      let user = db.prepare('SELECT id, username, role FROM users WHERE username = ?').get(verifyRes.username);
      if (!user) {
        // 自动创建用户
        const id = verifyRes.userId;
        const passwordHash = await bcrypt.hash(Math.random().toString(36), 10);
        db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(id, verifyRes.username, passwordHash, 'user');
        user = { id, username: verifyRes.username, role: 'user' };
      }

      const token = userOps.generateToken(user);
      return sendJSON(req, res, { success: true, token, username: user.username });
    } catch (e) {
      return sendError(req, res, 'SSO 登录失败', 500);
    }
  }

  // === 管理员接口 ===
  if (pathname === '/api/admin/set-role' && req.method === 'POST') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    if (!requireAdmin(req)) return sendError(req, res, '需要管理员权限', 403);
    try {
      const { userId, role } = await parseBody(req);
      if (!userId || !role) return sendError(req, res, '缺少参数');
      if (!['user', 'admin'].includes(role)) return sendError(req, res, '无效角色');
      userOps.setRole(userId, role);
      return sendJSON(req, res, { success: true });
    } catch (e) {
      return sendError(req, res, '请求数据格式错误', 400);
    }
  }

  if (pathname === '/api/admin/users' && req.method === 'GET') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    if (!requireAdmin(req)) return sendError(req, res, '需要管理员权限', 403);
    const users = db.prepare('SELECT id, username, role, created_at FROM users').all();
    return sendJSON(req, res, users);
  }

  // === 群组接口 ===
  if (pathname === '/api/groups' && req.method === 'GET') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    const groups = groupOps.getByUser(req.userId);
    return sendJSON(req, res, groups);
  }

  if (pathname === '/api/groups' && req.method === 'POST') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    try {
      const { name } = await parseBody(req);
      if (!name) return sendError(req, res, '名称不能为空');
      const group = groupOps.create(name, req.userId);
      return sendJSON(req, res, group);
    } catch (e) {
      return sendError(req, res, '创建失败', 400);
    }
  }

  if (pathname === '/api/groups/join' && req.method === 'POST') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    try {
      const { inviteCode } = await parseBody(req);
      if (!inviteCode) return sendError(req, res, '邀请码不能为空');
      const group = groupOps.getByInviteCode(inviteCode);
      if (!group) return sendError(req, res, '邀请码无效');
      const result = groupOps.join(group.id, req.userId);
      if (!result.success) return sendError(req, res, result.error);
      return sendJSON(req, res, { success: true, groupName: group.name });
    } catch (e) {
      return sendError(req, res, '加入失败', 400);
    }
  }

  if (pathname.match(/^\/api\/groups\/[^/]+$/) && req.method === 'GET') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    const groupId = pathname.split('/').pop();
    if (!groupOps.isMember(groupId, req.userId)) return sendError(req, res, '不是群组成员', 403);
    const group = groupOps.getById(groupId);
    const members = groupOps.getMembers(groupId);
    const notebooks = groupOps.getNotebooks(groupId);
    return sendJSON(req, res, { ...group, members, notebooks });
  }

  if (pathname.match(/^\/api\/groups\/[^/]+\/notebooks$/) && req.method === 'POST') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    const groupId = pathname.split('/')[3];
    if (!groupOps.isAdmin(groupId, req.userId)) return sendError(req, res, '需要管理员权限', 403);
    try {
      const { notebookName } = await parseBody(req);
      if (!notebookName) return sendError(req, res, '名称不能为空');
      const result = groupOps.addNotebook(groupId, notebookName);
      return sendJSON(req, res, result);
    } catch (e) {
      return sendError(req, res, '添加失败', 400);
    }
  }

  if (pathname.match(/^\/api\/groups\/[^/]+\/notebooks\/[^/]+$/) && req.method === 'DELETE') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    const parts = pathname.split('/');
    const groupId = parts[3];
    const notebookName = decodeURIComponent(parts[5]);
    if (!groupOps.isAdmin(groupId, req.userId)) return sendError(req, res, '需要管理员权限', 403);
    groupOps.removeNotebook(groupId, notebookName);
    return sendJSON(req, res, { success: true });
  }

  if (pathname.match(/^\/api\/groups\/[^/]+\/notes$/) && req.method === 'GET') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    const groupId = pathname.split('/')[3];
    if (!groupOps.isMember(groupId, req.userId)) return sendError(req, res, '不是群组成员', 403);
    const groupNotebooks = groupOps.getNotebooks(groupId);
    const allNotes = [];
    for (const nb of groupNotebooks) {
      const notes = noteOps.getByNotebook(nb, groupOps.getById(groupId).created_by);
      allNotes.push(...notes.map(n => ({ ...n, _groupReadonly: !groupOps.isAdmin(groupId, req.userId) })));
    }
    return sendJSON(req, res, allNotes);
  }

  // 解散群组
  if (pathname.match(/^\/api\/groups\/[^/]+$/) && req.method === 'DELETE') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    const groupId = pathname.split('/').pop();
    if (!groupOps.isAdmin(groupId, req.userId)) return sendError(req, res, '需要管理员权限', 403);
    db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
    return sendJSON(req, res, { success: true });
  }

  // 移除成员
  if (pathname.match(/^\/api\/groups\/[^/]+\/members\/[^/]+$/) && req.method === 'DELETE') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    const parts = pathname.split('/');
    const groupId = parts[3];
    const memberId = parts[5];
    if (!groupOps.isAdmin(groupId, req.userId)) return sendError(req, res, '需要管理员权限', 403);
    db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, memberId);
    return sendJSON(req, res, { success: true });
  }

  // 退出群组
  if (pathname.match(/^\/api\/groups\/[^/]+\/leave$/) && req.method === 'POST') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    const groupId = pathname.split('/')[3];
    db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, req.userId);
    return sendJSON(req, res, { success: true });
  }

  // === 图片接口（不需要登录）===
  if (pathname.startsWith('/api/images/') && req.method !== 'DELETE') {
    const filename = pathname.slice('/api/images/'.length).replace(/[^a-zA-Z0-9._-]/g, '');
    const imgPath = path.join(DATA_DIR, 'images', filename);
    if (fs.existsSync(imgPath)) {
      const ext = path.extname(filename).toLowerCase();
      const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=31536000' });
      fs.createReadStream(imgPath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
    return;
  }

  // === 以下接口需要登录 ===
  if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
  const userId = req.userId;

  // --- 笔记本 ---
  if (pathname === '/api/notebooks' && req.method === 'GET') {
    const globals = getGlobals(userId);
    const dbNames = notebookOps.getAll(userId);

    let names;
    if (globals.notebooks && globals.notebooks.length > 0) {
      const ordered = globals.notebooks.filter(n => dbNames.includes(n));
      const newInDb = dbNames.filter(n => !globals.notebooks.includes(n));
      names = [...ordered, ...newInDb];
    } else {
      names = dbNames;
    }

    const result = names.map(name => ({
      name,
      count: noteOps.countByNotebook(name, userId),
      source: 'personal'
    }));

    // 添加群组共享笔记本
    const userGroups = groupOps.getByUser(userId);
    for (const group of userGroups) {
      const groupNotebooks = groupOps.getNotebooks(group.id);
      const groupUserId = getGroupUserId(group.id);
      for (const nb of groupNotebooks) {
        result.push({
          name: nb,
          count: noteOps.countByNotebook(nb, groupUserId),
          source: 'group',
          groupName: group.name,
          groupId: group.id,
          readonly: group.member_role !== 'admin'
        });
      }
    }

    return sendJSON(req, res, result);
  }

  if (pathname === '/api/notebooks' && req.method === 'POST') {
    try {
      const { name } = await parseBody(req);
      if (!name) return sendError(req, res, '名称不能为空');
      return sendJSON(req, res, notebookOps.create(name, userId));
    } catch (e) {
      return sendError(req, res, '请求数据格式错误', 400);
    }
  }

  if (pathname.startsWith('/api/notebooks/') && req.method === 'DELETE') {
    const name = decodeURIComponent(pathname.slice('/api/notebooks/'.length));
    notebookOps.delete(name, userId);
    return sendJSON(req, res, { success: true });
  }

  // --- 笔记 ---
  if (pathname === '/api/notes' && req.method === 'GET') {
    const notebook = url.searchParams.get('notebook');
    const groupId = url.searchParams.get('group');
    const effectiveUserId = groupId ? getGroupUserId(groupId) : userId;

    let notes;
    if (notebook) {
      notes = noteOps.getByNotebook(notebook, effectiveUserId);
    } else {
      notes = noteOps.getAll(effectiveUserId);
    }
    return sendJSON(req, res, notes);
  }

  if (pathname === '/api/notes/search' && req.method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return sendJSON(req, res, []);
    const groupId = url.searchParams.get('group');
    const effectiveUserId = groupId ? getGroupUserId(groupId) : userId;
    const results = noteOps.search(q, effectiveUserId);
    return sendJSON(req, res, results);
  }

  if (pathname === '/api/notes/filter' && req.method === 'GET') {
    const filters = {};
    for (const [key, value] of url.searchParams) {
      if (value) filters[key] = value;
    }
    const groupId = url.searchParams.get('group');
    const effectiveUserId = groupId ? getGroupUserId(groupId) : userId;
    const results = noteOps.filter(filters, effectiveUserId);
    return sendJSON(req, res, results);
  }

  if (pathname === '/api/notes' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const notes = body.notes;
      const groupId = body.groupId;
      const effectiveUserId = groupId ? getGroupUserId(groupId) : userId;
      if (!Array.isArray(notes)) return sendError(req, res, '无效数据');
      for (const note of notes) {
        if (!note.id) continue;
        const existing = noteOps.getById(note.id, effectiveUserId);
        if (existing) {
          noteOps.update(note, effectiveUserId);
        } else {
          noteOps.create(note, effectiveUserId);
        }
      }
      return sendJSON(req, res, { success: true });
    } catch (e) {
      return sendError(req, res, '请求数据格式错误', 400);
    }
  }

  if (pathname.startsWith('/api/notes/') && req.method === 'PUT') {
    try {
      const note = await parseBody(req);
      if (!note.id) return sendError(req, res, '无效数据');
      const groupId = note.groupId || url.searchParams.get('group');
      const effectiveUserId = groupId ? getGroupUserId(groupId) : userId;
      const existing = noteOps.getById(note.id, effectiveUserId);
      if (existing) {
        noteOps.update(note, effectiveUserId);
      } else {
        noteOps.create(note, effectiveUserId);
      }
      return sendJSON(req, res, { success: true });
    } catch (e) {
      return sendError(req, res, '请求数据格式错误', 400);
    }
  }

  if (pathname.startsWith('/api/notes/') && req.method === 'POST') {
    try {
      const note = await parseBody(req);
      if (!note.id) return sendError(req, res, '无效数据');
      const groupId = note.groupId || url.searchParams.get('group');
      const effectiveUserId = groupId ? getGroupUserId(groupId) : userId;
      noteOps.create(note, effectiveUserId);
      return sendJSON(req, res, { success: true });
    } catch (e) {
      return sendError(req, res, '请求数据格式错误', 400);
    }
  }

  if (pathname.startsWith('/api/notes/') && req.method === 'DELETE') {
    const id = decodeURIComponent(pathname.slice('/api/notes/'.length));
    if (!id) return sendError(req, res, '无效 ID');
    const groupId = url.searchParams.get('group');
    const effectiveUserId = groupId ? getGroupUserId(groupId) : userId;
    noteOps.delete(id, effectiveUserId);
    return sendJSON(req, res, { success: true });
  }

  // --- 引用 ---
  if (pathname === '/api/refs/all' && req.method === 'GET') {
    return sendJSON(req, res, refOps.getAll());
  }

  if (pathname === '/api/refs' && req.method === 'GET') {
    const noteId = url.searchParams.get('noteId');
    if (!noteId) return sendError(req, res, '缺少 noteId');
    const refs = refOps.getByNote(noteId);
    return sendJSON(req, res, refs);
  }

  if (pathname === '/api/refs' && req.method === 'POST') {
    try {
      const { sourceId, targetId, type } = await parseBody(req);
      if (!sourceId || !targetId) return sendError(req, res, '缺少参数');
      refOps.add(sourceId, targetId, type || 'cross');
      return sendJSON(req, res, { success: true });
    } catch (e) {
      return sendError(req, res, '请求数据格式错误', 400);
    }
  }

  if (pathname === '/api/refs' && req.method === 'DELETE') {
    try {
      const { sourceId, targetId } = await parseBody(req);
      if (!sourceId || !targetId) return sendError(req, res, '缺少参数');
      refOps.remove(sourceId, targetId);
      return sendJSON(req, res, { success: true });
    } catch (e) {
      return sendError(req, res, '请求数据格式错误', 400);
    }
  }

  // --- 全局配置 ---
  if (pathname === '/api/globals' && req.method === 'GET') {
    return sendJSON(req, res, getGlobals(userId));
  }

  if (pathname === '/api/globals' && req.method === 'POST') {
    try {
      const data = await parseBody(req);
      const globals = getGlobals(userId);
      const overwriteKeys = new Set(['notebooks', 'fieldComponents', 'cardTemplates', 'notebookTemplates']);
      for (const key of Object.keys(data)) {
        if (overwriteKeys.has(key)) {
          globals[key] = data[key];
        } else if (Array.isArray(data[key]) && Array.isArray(globals[key]) && key.startsWith('dropdown_')) {
          globals[key] = [...new Set([...globals[key], ...data[key]])];
        } else {
          globals[key] = data[key];
        }
      }
      saveGlobals(globals, userId);

      if (data.notebooks && Array.isArray(data.notebooks)) {
        for (const nb of data.notebooks) {
          if (nb) notebookOps.create(nb, userId);
        }
      }

      return sendJSON(req, res, { success: true });
    } catch (e) {
      return sendError(req, res, '请求数据格式错误', 400);
    }
  }

  // --- 图片上传/删除 ---
  if (pathname === '/api/images' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { data, name } = body;
      if (!data) return sendError(req, res, '无图片数据');
      const IMAGES_DIR = path.join(DATA_DIR, 'images');
      if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
      const ext = (name || 'image.png').split('.').pop() || 'png';
      const filename = Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.' + ext;
      const base64 = data.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(path.join(IMAGES_DIR, filename), Buffer.from(base64, 'base64'));
      return sendJSON(req, res, { success: true, url: '/api/images/' + filename });
    } catch (e) {
      return sendError(req, res, '请求数据格式错误', 400);
    }
  }

  if (pathname.startsWith('/api/images/') && req.method === 'DELETE') {
    const filename = pathname.slice('/api/images/'.length).replace(/[^a-zA-Z0-9._-]/g, '');
    const imgPath = path.join(DATA_DIR, 'images', filename);
    if (fs.existsSync(imgPath)) {
      fs.unlinkSync(imgPath);
      return sendJSON(req, res, { success: true });
    }
    return sendError(req, res, '图片不存在', 404);
  }

  return sendError(req, res, '未找到', 404);
});

// 与 nginx keepalive 匹配（nginx proxy_read_timeout = 60s）
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.on('connection', (socket) => {
  socket.on('error', (err) => {
    console.error(`[CONN] Socket error from ${socket.remoteAddress}:`, err.message);
  });
});

// 防止未捕获异常杀死进程
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
});

// 优雅关闭
function gracefulShutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, () => {
  console.log(`\n  枕书阁服务已启动！`);
  console.log(`  打开浏览器访问: http://localhost:${PORT}`);
  console.log(`  数据目录: ${DATA_DIR}\n`);
});
