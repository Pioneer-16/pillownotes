// ===== 枕书阁 - 本地文件服务器 =====
// 用法：node server.js
// 然后浏览器打开 http://localhost:3000

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const http = require('http');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { noteOps, notebookOps, refOps, db } = require('./db');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.resolve(__dirname, '../../data');
const WEB_DIR = __dirname;
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';
const JWT_SECRET = process.env.JWT_SECRET || 'pillownotes-secret-key-' + Date.now();

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// MIME 类型
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

function sendJSON(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendError(res, msg, status = 400) {
  sendJSON(res, { error: msg }, status);
}

// ===== 全局数据 =====
const GLOBALS_FILE = path.join(DATA_DIR, '_globals.json');

function getGlobals() {
  if (fs.existsSync(GLOBALS_FILE)) {
    try { return JSON.parse(fs.readFileSync(GLOBALS_FILE, 'utf-8')); } catch (e) {}
  }
  // 首次运行时从样例数据加载
  const sampleFile = path.join(DATA_DIR, 'sample', '_globals.json');
  if (fs.existsSync(sampleFile)) {
    try {
      const sample = JSON.parse(fs.readFileSync(sampleFile, 'utf-8'));
      saveGlobals(sample);
      return sample;
    } catch (e) {}
  }
  return { fieldComponents: [], cardTemplates: [], notebookTemplates: {}, notebooks: [] };
}

function saveGlobals(data) {
  fs.writeFileSync(GLOBALS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ===== 工具函数 =====
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
      catch (e) { reject(e); }
    });
  });
}

function checkAuth(req) {
  // 如果没有设置密码，直接通过
  if (!AUTH_PASSWORD) return true;
  
  // 检查 JWT token
  const token = req.headers['x-auth-token'];
  if (!token) return false;
  
  // 验证 JWT
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.username = decoded.username;
    return true;
  } catch (e) {
    return false;
  }
}

// 用户操作
const userOps = {
  async register(username, password) {
    // 检查用户名是否已存在
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      throw new Error('用户名已存在');
    }
    
    // 创建用户
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const passwordHash = await bcrypt.hash(password, 10);
    
    db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(id, username, passwordHash);
    
    return { id, username };
  },
  
  async login(username, password) {
    // 查找用户
    const user = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username);
    if (!user) {
      throw new Error('用户名或密码错误');
    }
    
    // 验证密码
    if (!await bcrypt.compare(password, user.password_hash)) {
      throw new Error('用户名或密码错误');
    }
    
    return { id: user.id, username: user.username };
  },
  
  generateToken(user) {
    return jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
  }
};

// ===== 路由 =====
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS
  const origin = req.headers.origin;
  if (origin && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // === API 路由 ===

  // --- 用户认证 ---
  if (pathname === '/api/auth/register' && req.method === 'POST') {
    try {
      const { username, password } = await parseBody(req);
      if (!username || !password) {
        return sendError(res, '用户名和密码不能为空');
      }
      if (username.length < 2 || username.length > 20) {
        return sendError(res, '用户名长度需要在2-20个字符之间');
      }
      if (password.length < 6) {
        return sendError(res, '密码长度不能少于6个字符');
      }
      
      const user = await userOps.register(username, password);
      const token = userOps.generateToken(user);
      return sendJSON(res, { success: true, token, username: user.username });
    } catch (e) {
      return sendError(res, e.message);
    }
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const { username, password } = await parseBody(req);
      if (!username || !password) {
        return sendError(res, '用户名和密码不能为空');
      }
      
      const user = await userOps.login(username, password);
      const token = userOps.generateToken(user);
      return sendJSON(res, { success: true, token, username: user.username });
    } catch (e) {
      return sendError(res, e.message);
    }
  }

  if (pathname === '/api/auth/check' && req.method === 'POST') {
    if (checkAuth(req)) {
      return sendJSON(res, { success: true, username: req.username });
    }
    return sendError(res, '未登录', 401);
  }

  // --- 笔记本 ---
  if (pathname === '/api/notebooks' && req.method === 'GET') {
    const globals = getGlobals();
    const dbNames = notebookOps.getAll();

    // 优先使用 globals 中的顺序（用户自定义排序）
    let names;
    if (globals.notebooks && globals.notebooks.length > 0) {
      // 合并：globals 中的顺序 + 数据库中新增的
      const ordered = globals.notebooks.filter(n => dbNames.includes(n));
      const newInDb = dbNames.filter(n => !globals.notebooks.includes(n));
      names = [...ordered, ...newInDb];
    } else {
      names = dbNames;
    }

    const result = names.map(name => ({
      name,
      count: noteOps.countByNotebook(name)
    }));
    return sendJSON(res, result);
  }

  if (pathname === '/api/notebooks' && req.method === 'POST') {
    if (!checkAuth(req)) return sendError(res, '需要验证密码', 401);
    try {
      const { name } = await parseBody(req);
      if (!name) return sendError(res, '名称不能为空');
      return sendJSON(res, notebookOps.create(name));
    } catch (e) {
      return sendError(res, '请求数据格式错误', 400);
    }
  }

  if (pathname.startsWith('/api/notebooks/') && req.method === 'DELETE') {
    if (!checkAuth(req)) return sendError(res, '需要验证密码', 401);
    const name = decodeURIComponent(pathname.slice('/api/notebooks/'.length));
    notebookOps.delete(name);
    return sendJSON(res, { success: true });
  }

  // --- 笔记 ---
  if (pathname === '/api/notes' && req.method === 'GET') {
    const notebook = url.searchParams.get('notebook');
    let notes;
    if (notebook) {
      notes = noteOps.getByNotebook(notebook);
    } else {
      notes = noteOps.getAll();
    }
    return sendJSON(res, notes);
  }

  if (pathname === '/api/notes/search' && req.method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return sendJSON(res, []);
    const results = noteOps.search(q);
    return sendJSON(res, results);
  }

  if (pathname === '/api/notes/filter' && req.method === 'GET') {
    const filters = {};
    for (const [key, value] of url.searchParams) {
      if (value) filters[key] = value;
    }
    const results = noteOps.filter(filters);
    return sendJSON(res, results);
  }

  if (pathname === '/api/notes' && req.method === 'POST') {
    if (!checkAuth(req)) return sendError(res, '需要验证密码', 401);
    try {
      const { notes } = await parseBody(req);
      if (!Array.isArray(notes)) return sendError(res, '无效数据');
      for (const note of notes) {
        if (!note.id) continue;
        const existing = noteOps.getById(note.id);
        if (existing) {
          noteOps.update(note);
        } else {
          noteOps.create(note);
        }
      }
      return sendJSON(res, { success: true });
    } catch (e) {
      return sendError(res, '请求数据格式错误', 400);
    }
  }

  if (pathname.startsWith('/api/notes/') && req.method === 'PUT') {
    if (!checkAuth(req)) return sendError(res, '需要验证密码', 401);
    try {
      const note = await parseBody(req);
      if (!note.id) return sendError(res, '无效数据');
      const existing = noteOps.getById(note.id);
      if (existing) {
        noteOps.update(note);
      } else {
        noteOps.create(note);
      }
      return sendJSON(res, { success: true });
    } catch (e) {
      return sendError(res, '请求数据格式错误', 400);
    }
  }

  if (pathname.startsWith('/api/notes/') && req.method === 'POST') {
    if (!checkAuth(req)) return sendError(res, '需要验证密码', 401);
    try {
      const note = await parseBody(req);
      if (!note.id) return sendError(res, '无效数据');
      noteOps.create(note);
      return sendJSON(res, { success: true });
    } catch (e) {
      return sendError(res, '请求数据格式错误', 400);
    }
  }

  if (pathname.startsWith('/api/notes/') && req.method === 'DELETE') {
    if (!checkAuth(req)) return sendError(res, '需要验证密码', 401);
    const id = decodeURIComponent(pathname.slice('/api/notes/'.length));
    if (!id) return sendError(res, '无效 ID');
    noteOps.delete(id);
    return sendJSON(res, { success: true });
  }

  // --- 引用 ---
  if (pathname === '/api/refs/all' && req.method === 'GET') {
    return sendJSON(res, refOps.getAll());
  }

  if (pathname === '/api/refs' && req.method === 'GET') {
    const noteId = url.searchParams.get('noteId');
    if (!noteId) return sendError(res, '缺少 noteId');
    const refs = refOps.getByNote(noteId);
    return sendJSON(res, refs);
  }

  if (pathname === '/api/refs' && req.method === 'POST') {
    if (!checkAuth(req)) return sendError(res, '需要验证密码', 401);
    try {
      const { sourceId, targetId, type } = await parseBody(req);
      if (!sourceId || !targetId) return sendError(res, '缺少参数');
      refOps.add(sourceId, targetId, type || 'cross');
      return sendJSON(res, { success: true });
    } catch (e) {
      return sendError(res, '请求数据格式错误', 400);
    }
  }

  if (pathname === '/api/refs' && req.method === 'DELETE') {
    if (!checkAuth(req)) return sendError(res, '需要验证密码', 401);
    try {
      const { sourceId, targetId } = await parseBody(req);
      if (!sourceId || !targetId) return sendError(res, '缺少参数');
      refOps.remove(sourceId, targetId);
      return sendJSON(res, { success: true });
    } catch (e) {
      return sendError(res, '请求数据格式错误', 400);
    }
  }

  // --- 全局配置 ---
  if (pathname === '/api/globals' && req.method === 'GET') {
    return sendJSON(res, getGlobals());
  }

  if (pathname === '/api/globals' && req.method === 'POST') {
    if (!checkAuth(req)) return sendError(res, '需要验证密码', 401);
    try {
      const data = await parseBody(req);
      const globals = getGlobals();
      // 字符串数组合并去重，对象数组直接覆盖
      const stringArrayKeys = new Set([]);
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
      saveGlobals(globals);

      // 同步笔记本到数据库
      if (data.notebooks && Array.isArray(data.notebooks)) {
        for (const nb of data.notebooks) {
          if (nb) notebookOps.create(nb);
        }
      }

      return sendJSON(res, { success: true });
    } catch (e) {
      return sendError(res, '请求数据格式错误', 400);
    }
  }

  // --- 图片上传 ---
  if (pathname === '/api/images' && req.method === 'POST') {
    if (!checkAuth(req)) return sendError(res, '需要验证密码', 401);
    try {
      const body = await parseBody(req);
      const { data, name } = body;
      if (!data) return sendError(res, '无图片数据');
      const IMAGES_DIR = path.join(DATA_DIR, 'images');
      if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
      const ext = (name || 'image.png').split('.').pop() || 'png';
      const filename = Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.' + ext;
      const base64 = data.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(path.join(IMAGES_DIR, filename), Buffer.from(base64, 'base64'));
      return sendJSON(res, { success: true, url: '/api/images/' + filename });
    } catch (e) {
      return sendError(res, '请求数据格式错误', 400);
    }
  }

  // --- 图片删除 ---
  if (pathname.startsWith('/api/images/') && req.method === 'DELETE') {
    if (!checkAuth(req)) return sendError(res, '需要验证密码', 401);
    const filename = pathname.slice('/api/images/'.length).replace(/[^a-zA-Z0-9._-]/g, '');
    const imgPath = path.join(DATA_DIR, 'images', filename);
    if (fs.existsSync(imgPath)) {
      fs.unlinkSync(imgPath);
      return sendJSON(res, { success: true });
    }
    return sendError(res, '图片不存在', 404);
  }

  // --- 图片读取 ---
  if (pathname.startsWith('/api/images/')) {
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

  // === 静态文件 ===
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(WEB_DIR, filePath);

  // 路径安全检查：防止路径遍历攻击
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(path.resolve(WEB_DIR))) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, {
      'Content-Type': getMime(filePath),
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`\n  枕书阁服务已启动！`);
  console.log(`  打开浏览器访问: http://localhost:${PORT}`);
  console.log(`  数据目录: ${DATA_DIR}\n`);
});
