require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const PORT = process.env.PORTAL_PORT || 3001;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_PATH = path.resolve(__dirname, '../pillownotes/data/notes.db');
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';
const JWT_SECRET = process.env.JWT_SECRET || 'pillownotes-secret-key-' + Date.now();

const Database = require('better-sqlite3');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// 创建工作台专用表
db.exec(`
  CREATE TABLE IF NOT EXISTS portal_users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS invite_codes (
    code TEXT PRIMARY KEY,
    created_by TEXT NOT NULL,
    used_by TEXT,
    used_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sso_tokens (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER DEFAULT 0
  );
`);

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

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
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

const userOps = {
  async register(username, password, inviteCode) {
    // 验证邀请码
    const code = db.prepare('SELECT * FROM invite_codes WHERE code = ? AND used_by IS NULL').get(inviteCode);
    if (!code) throw new Error('邀请码无效或已使用');

    const existing = db.prepare('SELECT id FROM portal_users WHERE username = ?').get(username);
    if (existing) throw new Error('用户名已存在');

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const passwordHash = await bcrypt.hash(password, 10);
    db.prepare('INSERT INTO portal_users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(id, username, passwordHash, 'user');
    
    // 标记邀请码已使用
    db.prepare("UPDATE invite_codes SET used_by = ?, used_at = datetime('now') WHERE code = ?").run(id, inviteCode);
    
    return { id, username, role: 'user' };
  },

  async login(username, password) {
    const user = db.prepare('SELECT id, username, password_hash, role FROM portal_users WHERE username = ?').get(username);
    if (!user) throw new Error('用户名或密码错误');
    if (!await bcrypt.compare(password, user.password_hash)) throw new Error('用户名或密码错误');
    return { id: user.id, username: user.username, role: user.role || 'user' };
  },

  generateToken(user) {
    return jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
  },

  generateSSOToken(userId, username) {
    const token = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5分钟有效
    db.prepare('INSERT INTO sso_tokens (token, user_id, username, expires_at) VALUES (?, ?, ?, ?)').run(token, userId, username, expiresAt);
    return token;
  },

  verifySSOToken(token) {
    const sso = db.prepare('SELECT * FROM sso_tokens WHERE token = ? AND used = 0').get(token);
    if (!sso) return null;
    if (Date.now() > sso.expires_at) return null;
    db.prepare('UPDATE sso_tokens SET used = 1 WHERE token = ?').run(token);
    return { userId: sso.user_id, username: sso.username };
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

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // 认证接口
  if (pathname === '/api/auth/register' && req.method === 'POST') {
    try {
      const { username, password, inviteCode } = await parseBody(req);
      if (!username || !password) return sendError(req, res, '用户名和密码不能为空');
      if (!inviteCode) return sendError(req, res, '邀请码不能为空');
      if (username.length < 2 || username.length > 20) return sendError(req, res, '用户名长度需要在2-20个字符之间');
      if (password.length < 6) return sendError(req, res, '密码长度不能少于6个字符');
      const user = await userOps.register(username, password, inviteCode);
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

  // SSO Token 生成
  if (pathname === '/api/auth/sso-token' && req.method === 'POST') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    const ssoToken = userOps.generateSSOToken(req.userId, req.username);
    return sendJSON(req, res, { token: ssoToken });
  }

  // SSO Token 验证（供枕书阁调用）
  if (pathname === '/api/auth/sso-verify' && req.method === 'POST') {
    try {
      const { token } = await parseBody(req);
      if (!token) return sendError(req, res, '缺少 token');
      const result = userOps.verifySSOToken(token);
      if (!result) return sendError(req, res, 'token 无效或已过期');
      return sendJSON(req, res, result);
    } catch (e) {
      return sendError(req, res, '验证失败', 400);
    }
  }

  // 管理员接口
  if (pathname === '/api/admin/users' && req.method === 'GET') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    if (req.role !== 'admin') return sendError(req, res, '需要管理员权限', 403);
    const portalUsers = db.prepare("SELECT id, username, role, created_at, 'portal' as source FROM portal_users").all();
    const notesUsers = db.prepare("SELECT id, username, role, created_at, 'notes' as source FROM users").all();
    // 合并用户，portal 优先
    const userMap = new Map();
    for (const u of portalUsers) userMap.set(u.id, u);
    for (const u of notesUsers) {
      if (!userMap.has(u.id)) userMap.set(u.id, u);
      else {
        const existing = userMap.get(u.id);
        existing.hasNotesAccess = true;
      }
    }
    const allUsers = Array.from(userMap.values()).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return sendJSON(req, res, allUsers);
  }

  if (pathname === '/api/admin/set-role' && req.method === 'POST') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    if (req.role !== 'admin') return sendError(req, res, '需要管理员权限', 403);
    try {
      const { userId, role, source } = await parseBody(req);
      if (!userId || !role) return sendError(req, res, '缺少参数');
      if (!['user', 'admin'].includes(role)) return sendError(req, res, '无效角色');
      // 更新对应表的角色
      if (source === 'notes') {
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
      } else {
        db.prepare('UPDATE portal_users SET role = ? WHERE id = ?').run(role, userId);
      }
      return sendJSON(req, res, { success: true });
    } catch (e) {
      return sendError(req, res, '请求数据格式错误', 400);
    }
  }

  // 邀请码管理
  if (pathname === '/api/admin/invite-codes' && req.method === 'GET') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    if (req.role !== 'admin') return sendError(req, res, '需要管理员权限', 403);
    const codes = db.prepare('SELECT * FROM invite_codes ORDER BY created_at DESC').all();
    return sendJSON(req, res, codes);
  }

  if (pathname === '/api/admin/invite-codes' && req.method === 'POST') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    if (req.role !== 'admin') return sendError(req, res, '需要管理员权限', 403);
    const code = Math.random().toString(36).slice(2, 10).toUpperCase();
    db.prepare('INSERT INTO invite_codes (code, created_by) VALUES (?, ?)').run(code, req.userId);
    return sendJSON(req, res, { code });
  }

  if (pathname === '/api/admin/system' && req.method === 'GET') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    if (req.role !== 'admin') return sendError(req, res, '需要管理员权限', 403);
    const os = require('os');
    let disk = '未知';
    try { 
      const { stdout } = await execAsync("df -h / | tail -1 | awk '{print $3\"/\"$2\" (\"$5\")\"}'");
      disk = stdout.trim();
    } catch (e) {}
    const cpus = os.cpus();
    return sendJSON(req, res, {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      uptime: Math.floor(os.uptime() / 3600) + '小时' + Math.floor((os.uptime() % 3600) / 60) + '分钟',
      totalMem: (os.totalmem() / 1024 / 1024 / 1024).toFixed(1) + ' GB',
      freeMem: (os.freemem() / 1024 / 1024 / 1024).toFixed(1) + ' GB',
      cpu: cpus[0] ? cpus[0].model : '未知',
      nodeVersion: process.version,
      disk: disk
    });
  }

  if (pathname === '/api/admin/services' && req.method === 'GET') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    if (req.role !== 'admin') return sendError(req, res, '需要管理员权限', 403);
    try {
      const { stdout } = await execAsync('pm2 jlist');
      const procs = JSON.parse(stdout);
      const services = procs.map(p => ({
        name: p.name,
        pid: p.pid,
        memory: (p.monit.memory / 1024 / 1024).toFixed(1) + ' MB',
        uptime: p.pm2_env.pm_uptime ? Math.floor((Date.now() - p.pm2_env.pm_uptime) / 60000) + '分钟' : '未运行',
        status: p.pm2_env.status
      }));
      return sendJSON(req, res, services);
    } catch (e) {
      return sendJSON(req, res, []);
    }
  }

  if (pathname === '/api/admin/restart' && req.method === 'POST') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    if (req.role !== 'admin') return sendError(req, res, '需要管理员权限', 403);
    try {
      const { name } = await parseBody(req);
      if (!name) return sendError(req, res, '缺少参数');
      await execAsync(`pm2 restart ${name}`);
      return sendJSON(req, res, { success: true });
    } catch (e) {
      return sendError(req, res, '重启失败', 500);
    }
  }

  if (pathname === '/api/admin/db-stats' && req.method === 'GET') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    if (req.role !== 'admin') return sendError(req, res, '需要管理员权限', 403);
    const portalUsers = db.prepare('SELECT COUNT(*) as c FROM portal_users').get().c;
    const notesUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const notes = db.prepare('SELECT COUNT(*) as c FROM notes').get().c;
    const notebooks = db.prepare('SELECT COUNT(*) as c FROM notebooks').get().c;
    const refs = db.prepare('SELECT COUNT(*) as c FROM note_references').get().c;
    const inviteCodes = db.prepare('SELECT COUNT(*) as c FROM invite_codes WHERE used_by IS NULL').get().c;
    const fs = require('fs');
    let dbSize = '未知';
    try {
      const stat = fs.statSync(DB_PATH);
      dbSize = (stat.size / 1024 / 1024).toFixed(2) + ' MB';
    } catch (e) {}
    return sendJSON(req, res, { portalUsers, notesUsers, notes, notebooks, refs, inviteCodes, dbSize });
  }

  // ============ 导表管理 API ============
  const STRING_TABLE_DIR = process.env.STRING_TABLE_DIR
    ? path.resolve(process.env.STRING_TABLE_DIR)
    : path.resolve(__dirname, '../data/stringtables');

  // 确保导表目录存在
  if (!fs.existsSync(STRING_TABLE_DIR)) {
    fs.mkdirSync(STRING_TABLE_DIR, { recursive: true });
  }

  // GET /api/stringtables — 列出所有 CSV 文件
  if (pathname === '/api/stringtables' && req.method === 'GET') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    try {
      const files = fs.readdirSync(STRING_TABLE_DIR)
        .filter(f => f.endsWith('.csv'))
        .sort()
        .map(f => {
          const stat = fs.statSync(path.join(STRING_TABLE_DIR, f));
          return {
            name: f,
            displayName: f.replace(/\.csv$/, ''),
            size: stat.size,
            modifiedAt: stat.mtime.toISOString()
          };
        });
      return sendJSON(req, res, files);
    } catch (e) {
      return sendError(req, res, '读取目录失败', 500);
    }
  }

  // GET /api/stringtables/:name — 获取 CSV 内容（JSON 格式）
  const stGetMatch = pathname.match(/^\/api\/stringtables\/([^/]+)$/);
  if (stGetMatch && req.method === 'GET') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    const name = decodeURIComponent(stGetMatch[1]);
    const csvPath = path.join(STRING_TABLE_DIR, name.endsWith('.csv') ? name : name + '.csv');
    if (!fs.existsSync(csvPath)) return sendError(req, res, '文件不存在', 404);
    try {
      const csvText = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
      const lines = csvText.split(/\r?\n/).filter(l => l.trim());
      if (lines.length === 0) return sendJSON(req, res, { headers: ['Key', 'SourceString', 'Comment'], rows: [] });

      const headers = parseCSVLine(lines[0]);
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((h, idx) => { row[h.trim()] = (values[idx] || '').trim(); });
        rows.push(row);
      }
      return sendJSON(req, res, { headers: headers.map(h => h.trim()), rows });
    } catch (e) {
      return sendError(req, res, '读取文件失败', 500);
    }
  }

  // PUT /api/stringtables/:name — 更新 CSV 内容
  const stPutMatch = pathname.match(/^\/api\/stringtables\/([^/]+)$/);
  if (stPutMatch && req.method === 'PUT') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    const name = decodeURIComponent(stPutMatch[1]);
    const csvPath = path.join(STRING_TABLE_DIR, name.endsWith('.csv') ? name : name + '.csv');
    try {
      const body = await parseBody(req);
      if (!body.headers || !body.rows) return sendError(req, res, '缺少 headers 或 rows');

      // 构建 CSV 文本
      const csvLines = [body.headers.join(',')];
      for (const row of body.rows) {
        const line = body.headers.map(h => {
          const val = (row[h] || '').replace(/"/g, '""');
          return val.includes(',') || val.includes('"') || val.includes('\n') ? `"${val}"` : val;
        }).join(',');
        csvLines.push(line);
      }
      // 写入 UTF-8 BOM + CSV 内容
      fs.writeFileSync(csvPath, '\uFEFF' + csvLines.join('\n'), 'utf-8');
      return sendJSON(req, res, { success: true, rowCount: body.rows.length });
    } catch (e) {
      return sendError(req, res, '保存失败: ' + e.message, 500);
    }
  }

  // POST /api/stringtables — 创建新的 CSV 文件
  if (pathname === '/api/stringtables' && req.method === 'POST') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    try {
      const { name } = await parseBody(req);
      if (!name) return sendError(req, res, '缺少文件名');
      const safeName = name.replace(/[^a-zA-Z0-9_\-]/g, '');
      if (!safeName) return sendError(req, res, '无效的文件名');
      const csvName = safeName.startsWith('ST_') ? safeName + '.csv' : 'ST_' + safeName + '.csv';
      const csvPath = path.join(STRING_TABLE_DIR, csvName);
      if (fs.existsSync(csvPath)) return sendError(req, res, '文件已存在');
      fs.writeFileSync(csvPath, '\uFEFFKey,SourceString,Comment\n', 'utf-8');
      return sendJSON(req, res, { success: true, name: csvName });
    } catch (e) {
      return sendError(req, res, '创建失败', 500);
    }
  }

  // DELETE /api/stringtables/:name — 删除 CSV 文件
  const stDelMatch = pathname.match(/^\/api\/stringtables\/([^/]+)$/);
  if (stDelMatch && req.method === 'DELETE') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    const name = decodeURIComponent(stDelMatch[1]);
    const csvPath = path.join(STRING_TABLE_DIR, name.endsWith('.csv') ? name : name + '.csv');
    if (!fs.existsSync(csvPath)) return sendError(req, res, '文件不存在', 404);
    try {
      fs.unlinkSync(csvPath);
      return sendJSON(req, res, { success: true });
    } catch (e) {
      return sendError(req, res, '删除失败', 500);
    }
  }

  // ============ 腾讯文档 API ============
  const TDOC_CONFIG_PATH = path.join(STRING_TABLE_DIR, 'tdoc_config.json');
  const TDOC_MAP_PATH = path.join(STRING_TABLE_DIR, 'tdoc_map.json');

  function loadTDocConfig() {
    try {
      if (fs.existsSync(TDOC_CONFIG_PATH)) return JSON.parse(fs.readFileSync(TDOC_CONFIG_PATH, 'utf-8'));
    } catch (e) {}
    return {};
  }

  function saveTDocConfig(config) {
    fs.writeFileSync(TDOC_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  }

  function loadTDocMap() {
    try {
      if (fs.existsSync(TDOC_MAP_PATH)) return JSON.parse(fs.readFileSync(TDOC_MAP_PATH, 'utf-8'));
    } catch (e) {}
    return {};
  }

  function saveTDocMap(map) {
    fs.writeFileSync(TDOC_MAP_PATH, JSON.stringify(map, null, 2), 'utf-8');
  }

  async function tdocRequest(method, url, body) {
    return new Promise((resolve, reject) => {
      const config = loadTDocConfig();
      if (!config.access_token) return reject(new Error('未配置腾讯文档凭证'));

      const https = require('https');
      const parsed = new URL(url);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: method,
        headers: {
          'Access-Token': config.access_token,
          'Client-Id': config.client_id || '',
          'Open-Id': config.open_id || '',
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf-8');
          try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
          catch (e) { resolve({ status: res.statusCode, data: data }); }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // GET /api/tdoc/config — 获取腾讯文档配置状态
  if (pathname === '/api/tdoc/config' && req.method === 'GET') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    const config = loadTDocConfig();
    return sendJSON(req, res, {
      configured: !!config.access_token,
      client_id: config.client_id || '',
      open_id: config.open_id || ''
    });
  }

  // POST /api/tdoc/config — 保存腾讯文档凭证
  if (pathname === '/api/tdoc/config' && req.method === 'POST') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    try {
      const { access_token, client_id, open_id } = await parseBody(req);
      if (!access_token || !open_id) return sendError(req, res, '缺少 access_token 或 open_id');
      saveTDocConfig({ access_token, client_id: client_id || '', open_id });
      return sendJSON(req, res, { success: true });
    } catch (e) {
      return sendError(req, res, '保存失败', 500);
    }
  }

  // POST /api/tdoc/push/:name — 推送 CSV 到腾讯文档（创建或更新在线表格）
  const tdocPushMatch = pathname.match(/^\/api\/tdoc\/push\/([^/]+)$/);
  if (tdocPushMatch && req.method === 'POST') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    const name = decodeURIComponent(tdocPushMatch[1]);
    const csvPath = path.join(STRING_TABLE_DIR, name.endsWith('.csv') ? name : name + '.csv');
    if (!fs.existsSync(csvPath)) return sendError(req, res, '文件不存在', 404);

    try {
      // 读取 CSV 内容
      const csvText = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
      const lines = csvText.split(/\r?\n/).filter(l => l.trim());
      const headers = parseCSVLine(lines[0]);
      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        rows.push(parseCSVLine(lines[i]));
      }

      const map = loadTDocMap();
      const displayName = name.replace(/\.csv$/, '');
      let bookId = map[name]?.bookId;
      let sheetId = map[name]?.sheetId;

      if (!bookId) {
        // 创建新的在线表格
        const createRes = await tdocRequest('POST', 'https://docs.qq.com/openapi/drive/v2/files', {
          title: `[AirDream] ${displayName}`,
          type: 'sheet'
        });

        if (createRes.status !== 200 || createRes.data.ret !== 0) {
          return sendError(req, res, '创建腾讯文档失败: ' + (createRes.data.msg || JSON.stringify(createRes.data)), 500);
        }

        bookId = createRes.data.data.ID;
        const docUrl = createRes.data.data.url;

        // 获取子表信息
        const sheetsRes = await tdocRequest('GET', `https://docs.qq.com/openapi/spreadsheet/v2/${bookId}/sheets-info`);
        if (sheetsRes.status === 200 && sheetsRes.data.data?.sheets?.length > 0) {
          sheetId = sheetsRes.data.data.sheets[0].sheetId;
        }

        map[name] = { bookId, sheetId, url: docUrl, lastPush: new Date().toISOString() };
        saveTDocMap(map);
      }

      // 清空现有内容
      const allRange = `${sheetId}!A1:Z1000`;
      await tdocRequest('POST', `https://docs.qq.com/openapi/spreadsheet/v2/${bookId}/values/${allRange}:clear`);

      // 写入表头 + 数据
      const values = [headers, ...rows];
      const writeRange = `${sheetId}!A1`;
      const writeRes = await tdocRequest('PUT', `https://docs.qq.com/openapi/spreadsheet/v2/${bookId}/values/${writeRange}`, {
        values: values
      });

      if (writeRes.status !== 200 || writeRes.data.ret !== 0) {
        return sendError(req, res, '写入腾讯文档失败: ' + (writeRes.data.msg || JSON.stringify(writeRes.data)), 500);
      }

      map[name].lastPush = new Date().toISOString();
      saveTDocMap(map);

      return sendJSON(req, res, {
        success: true,
        url: map[name].url,
        bookId,
        sheetId,
        rowCount: rows.length
      });
    } catch (e) {
      return sendError(req, res, '推送失败: ' + e.message, 500);
    }
  }

  // POST /api/tdoc/pull/:name — 从腾讯文档拉取数据到 CSV
  const tdocPullMatch = pathname.match(/^\/api\/tdoc\/pull\/([^/]+)$/);
  if (tdocPullMatch && req.method === 'POST') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    const name = decodeURIComponent(tdocPullMatch[1]);
    const map = loadTDocMap();

    if (!map[name]?.bookId) {
      return sendError(req, res, '该文件尚未推送到腾讯文档，请先推送', 400);
    }

    try {
      const { bookId, sheetId } = map[name];

      // 获取子表信息（确认 sheetId）
      let actualSheetId = sheetId;
      if (!actualSheetId) {
        const sheetsRes = await tdocRequest('GET', `https://docs.qq.com/openapi/spreadsheet/v2/${bookId}/sheets-info`);
        if (sheetsRes.status === 200 && sheetsRes.data.data?.sheets?.length > 0) {
          actualSheetId = sheetsRes.data.data.sheets[0].sheetId;
          map[name].sheetId = actualSheetId;
          saveTDocMap(map);
        } else {
          return sendError(req, res, '获取子表信息失败', 500);
        }
      }

      // 读取表格数据（先读取大范围，获取实际行数）
      const readRange = `${actualSheetId}!A1:Z1000`;
      const readRes = await tdocRequest('GET', `https://docs.qq.com/openapi/spreadsheet/v3/files/${bookId}/${actualSheetId}/A1:Z1000`);

      if (readRes.status !== 200 || readRes.data.ret !== 0) {
        return sendError(req, res, '读取腾讯文档失败: ' + (readRes.data.msg || JSON.stringify(readRes.data)), 500);
      }

      const gridData = readRes.data.data?.gridData;
      if (!gridData?.rows) {
        return sendError(req, res, '表格数据为空', 400);
      }

      // 提取数据
      const csvLines = [];
      for (const row of gridData.rows) {
        const cells = (row.values || []).map(cell => {
          const val = cell?.cellValue?.text || '';
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return '"' + val.replace(/"/g, '""') + '"';
          }
          return val;
        });
        csvLines.push(cells.join(','));
      }

      // 过滤空行
      const filteredLines = csvLines.filter(line => line.replace(/,/g, '').trim() !== '');
      if (filteredLines.length === 0) {
        return sendError(req, res, '表格数据为空', 400);
      }

      // 写入 CSV 文件
      const csvPath = path.join(STRING_TABLE_DIR, name.endsWith('.csv') ? name : name + '.csv');
      const csvContent = '\uFEFF' + filteredLines.join('\n');
      fs.writeFileSync(csvPath, csvContent, 'utf-8');

      map[name].lastPull = new Date().toISOString();
      saveTDocMap(map);

      return sendJSON(req, res, {
        success: true,
        rowCount: filteredLines.length - 1,
        headers: parseCSVLine(filteredLines[0])
      });
    } catch (e) {
      return sendError(req, res, '拉取失败: ' + e.message, 500);
    }
  }

  // GET /api/tdoc/map — 获取所有文件的腾讯文档映射
  if (pathname === '/api/tdoc/map' && req.method === 'GET') {
    if (!checkAuth(req)) return sendError(req, res, '需要登录', 401);
    const map = loadTDocMap();
    return sendJSON(req, res, map);
  }

  // 静态文件
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);

  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(path.resolve(PUBLIC_DIR))) {
    res.writeHead(403); res.end('403 Forbidden'); return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const isStatic = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2'].includes(ext);
    const cacheControl = isStatic ? 'public, max-age=2592000' : 'no-cache';
    res.writeHead(200, { 'Content-Type': getMime(filePath), 'Cache-Control': cacheControl });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404); res.end('404 Not Found');
  }
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
  console.log(`\n  AirDream Portal 已启动！`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  数据库: ${DB_PATH}`);
  console.log(`  环境: ${process.env.NODE_ENV || 'development'}\n`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[ERROR] 端口 ${PORT} 已被占用，请检查是否有其他进程在使用`);
  } else if (err.code === 'EACCES') {
    console.error(`[ERROR] 无权限监听端口 ${PORT}，请使用 sudo 或更换端口`);
  } else {
    console.error('[ERROR] 服务器启动失败:', err.message);
  }
  process.exit(1);
});
