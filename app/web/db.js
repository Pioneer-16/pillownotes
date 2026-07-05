const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'notes.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    data TEXT NOT NULL,
    content TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS note_notebooks (
    note_id TEXT NOT NULL,
    notebook TEXT NOT NULL,
    PRIMARY KEY (note_id, notebook),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notebooks (
    user_id TEXT,
    name TEXT NOT NULL,
    PRIMARY KEY (user_id, name)
  );

  CREATE TABLE IF NOT EXISTS note_references (
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'cross',
    PRIMARY KEY (source_id, target_id),
    FOREIGN KEY (source_id) REFERENCES notes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES notes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    joined_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS group_notebooks (
    group_id TEXT NOT NULL,
    notebook_name TEXT NOT NULL,
    PRIMARY KEY (group_id, notebook_name),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  );
`);

try {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      content,
      content='notes',
      content_rowid='rowid'
    );
  `);
} catch (e) {}

// 迁移：给已有表添加 user_id 列
function migrate() {
  const noteCols = db.prepare("PRAGMA table_info(notes)").all().map(c => c.name);
  if (!noteCols.includes('user_id')) {
    db.exec("ALTER TABLE notes ADD COLUMN user_id TEXT");
  }

  const nbCols = db.prepare("PRAGMA table_info(notebooks)").all().map(c => c.name);
  if (!nbCols.includes('user_id')) {
    db.exec("ALTER TABLE notebooks ADD COLUMN user_id TEXT");
  }

  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes('role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
  }
}

migrate();

// 群组虚拟用户ID
function getGroupUserId(groupId) {
  return `group_${groupId}`;
}

function extractContent(noteData) {
  const parts = [];
  for (const key of Object.keys(noteData)) {
    if (key === 'id' || key === 'notebooks' || key === 'createdAt' || key === 'updatedAt') continue;
    const val = noteData[key];
    if (typeof val === 'string' && val.trim()) {
      parts.push(val.trim());
    }
  }
  return parts.join('\n');
}

const noteOps = {
  getAll(userId) {
    return db.prepare(`
      SELECT n.id, n.data, n.created_at, n.updated_at,
             GROUP_CONCAT(nn.notebook) as notebooks
      FROM notes n
      LEFT JOIN note_notebooks nn ON n.id = nn.note_id
      WHERE n.user_id = ?
      GROUP BY n.id
    `).all(userId).map(row => {
      const note = JSON.parse(row.data);
      note.notebooks = row.notebooks ? row.notebooks.split(',') : [];
      return note;
    });
  },

  getByNotebook(notebook, userId) {
    return db.prepare(`
      SELECT n.id, n.data, n.created_at, n.updated_at
      FROM notes n
      JOIN note_notebooks nn ON n.id = nn.note_id
      WHERE nn.notebook = ? AND n.user_id = ?
      ORDER BY n.updated_at DESC
    `).all(notebook, userId).map(row => {
      return JSON.parse(row.data);
    });
  },

  getById(id) {
    const row = db.prepare('SELECT n.data FROM notes n WHERE n.id = ?').get(id);
    return row ? JSON.parse(row.data) : null;
  },

  create(note, userId) {
    const content = extractContent(note);
    const now = new Date().toISOString();
    note.createdAt = note.createdAt || now;
    note.updatedAt = now;

    db.prepare(`
      INSERT INTO notes (id, user_id, data, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(note.id, userId, JSON.stringify(note), content, note.createdAt, note.updatedAt);

    this.updateNotebooks(note.id, note.notebooks || []);

    try {
      if (content) {
        const rowid = db.prepare('SELECT rowid FROM notes WHERE id = ?').get(note.id)?.rowid;
        if (rowid) {
          db.prepare('INSERT INTO notes_fts (rowid, content) VALUES (?, ?)').run(rowid, content);
        }
      }
    } catch (e) {}

    return note;
  },

  update(note, userId) {
    const content = extractContent(note);
    note.updatedAt = new Date().toISOString();

    db.prepare(`
      UPDATE notes SET data = ?, content = ?, updated_at = ? WHERE id = ? AND user_id = ?
    `).run(JSON.stringify(note), content, note.updatedAt, note.id, userId);

    this.updateNotebooks(note.id, note.notebooks || []);

    try {
      const rowid = db.prepare('SELECT rowid FROM notes WHERE id = ?').get(note.id)?.rowid;
      if (rowid) {
        db.prepare('DELETE FROM notes_fts WHERE rowid = ?').run(rowid);
        if (content) {
          db.prepare('INSERT INTO notes_fts (rowid, content) VALUES (?, ?)').run(rowid, content);
        }
      }
    } catch (e) {}

    return note;
  },

  delete(id, userId) {
    db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, userId);
  },

  updateNotebooks(noteId, notebooks) {
    db.prepare('DELETE FROM note_notebooks WHERE note_id = ?').run(noteId);
    const insert = db.prepare('INSERT OR IGNORE INTO note_notebooks (note_id, notebook) VALUES (?, ?)');
    for (const nb of notebooks) {
      if (nb) insert.run(noteId, nb);
    }
  },

  search(query, userId) {
    try {
      const ftsResults = db.prepare(`
        SELECT n.id, n.data, n.created_at, n.updated_at,
               GROUP_CONCAT(nn.notebook) as notebooks
        FROM notes_fts fts
        JOIN notes n ON n.rowid = fts.rowid
        LEFT JOIN note_notebooks nn ON n.id = nn.note_id
        WHERE notes_fts MATCH ? AND n.user_id = ?
        GROUP BY n.id
        LIMIT 50
      `).all(query, userId).map(row => {
        const note = JSON.parse(row.data);
        note.notebooks = row.notebooks ? row.notebooks.split(',') : [];
        return note;
      });

      if (ftsResults.length > 0) return ftsResults;
    } catch (e) {}

    const q = query.toLowerCase();
    const allNotes = this.getAll(userId);

    return allNotes.map(note => {
      const skipFields = new Set(['id', 'notebooks', 'createdAt', 'updatedAt', 'matchField']);
      const allFields = Object.keys(note).filter(k => !skipFields.has(k));
      for (const field of allFields) {
        const val = note[field];
        if (val && String(val).toLowerCase().includes(q)) {
          note.matchField = field;
          return note;
        }
      }
      return null;
    }).filter(Boolean).slice(0, 50);
  },

  filter(filters, userId) {
    let notes = this.getAll(userId);

    if (filters.notebook) {
      notes = notes.filter(n => n.notebooks && n.notebooks.includes(filters.notebook));
    }

    for (const [fieldId, value] of Object.entries(filters)) {
      if (fieldId === 'notebook' || !value) continue;
      const q = value.toLowerCase();
      notes = notes.filter(note => {
        const val = note[fieldId];
        if (!val) return false;
        return String(val).toLowerCase().includes(q);
      });
    }

    return notes.slice(0, 100);
  },

  countByNotebook(notebook, userId) {
    const row = db.prepare(`
      SELECT COUNT(*) as count FROM note_notebooks nn
      JOIN notes n ON nn.note_id = n.id
      WHERE nn.notebook = ? AND n.user_id = ?
    `).get(notebook, userId);
    return row ? row.count : 0;
  }
};

const notebookOps = {
  getAll(userId) {
    return db.prepare('SELECT name FROM notebooks WHERE user_id = ? ORDER BY rowid').all(userId).map(r => r.name);
  },

  create(name, userId) {
    try {
      db.prepare('INSERT INTO notebooks (user_id, name) VALUES (?, ?)').run(userId, name);
      return { success: true };
    } catch (e) {
      if (e.message.includes('UNIQUE')) {
        return { success: false, error: '已存在同名笔记本' };
      }
      throw e;
    }
  },

  delete(name, userId) {
    db.prepare('DELETE FROM notebooks WHERE name = ? AND user_id = ?').run(name, userId);
    db.prepare(`
      DELETE FROM notes WHERE id IN (
        SELECT nn.note_id FROM note_notebooks nn
        WHERE nn.notebook = ?
        AND nn.note_id NOT IN (
          SELECT nn2.note_id FROM note_notebooks nn2 WHERE nn2.notebook != ?
        )
      ) AND user_id = ?
    `).run(name, name, userId);
    db.prepare('DELETE FROM note_notebooks WHERE notebook = ?').run(name);
  },

  rename(oldName, newName, userId) {
    db.prepare('UPDATE notebooks SET name = ? WHERE name = ? AND user_id = ?').run(newName, oldName, userId);
    db.prepare('UPDATE note_notebooks SET notebook = ? WHERE notebook = ?').run(newName, oldName);
  }
};

const refOps = {
  getByNote(noteId) {
    const outgoing = db.prepare(`
      SELECT r.target_id as id, r.type, n.data
      FROM note_references r JOIN notes n ON r.target_id = n.id
      WHERE r.source_id = ?
    `).all(noteId);
    const incoming = db.prepare(`
      SELECT r.source_id as id, r.type, n.data
      FROM note_references r JOIN notes n ON r.source_id = n.id
      WHERE r.target_id = ?
    `).all(noteId);
    return {
      outgoing: outgoing.map(r => { const d = JSON.parse(r.data); d.id = r.id; d.refType = r.type; return d; }),
      incoming: incoming.map(r => { const d = JSON.parse(r.data); d.id = r.id; d.refType = r.type; return d; })
    };
  },

  add(sourceId, targetId, type) {
    db.prepare('INSERT OR IGNORE INTO note_references (source_id, target_id, type) VALUES (?, ?, ?)').run(sourceId, targetId, type);
    if (type === 'cross') {
      db.prepare('INSERT OR IGNORE INTO note_references (source_id, target_id, type) VALUES (?, ?, ?)').run(targetId, sourceId, 'cross');
    }
  },

  remove(sourceId, targetId) {
    const row = db.prepare('SELECT type FROM note_references WHERE source_id = ? AND target_id = ?').get(sourceId, targetId);
    db.prepare('DELETE FROM note_references WHERE source_id = ? AND target_id = ?').run(sourceId, targetId);
    if (row && row.type === 'cross') {
      db.prepare('DELETE FROM note_references WHERE source_id = ? AND target_id = ?').run(targetId, sourceId);
    }
  },

  removeAllByNote(noteId) {
    db.prepare('DELETE FROM note_references WHERE source_id = ? OR target_id = ?').run(noteId, noteId);
  },

  getAll() {
    return db.prepare('SELECT source_id, target_id, type FROM note_references').all();
  }
};

const groupOps = {
  create(name, userId) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase();
    db.prepare('INSERT INTO groups (id, name, invite_code, created_by) VALUES (?, ?, ?, ?)').run(id, name, inviteCode, userId);
    db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)').run(id, userId, 'admin');
    return { id, name, invite_code: inviteCode };
  },

  getByUser(userId) {
    return db.prepare(`
      SELECT g.*, gm.role as member_role
      FROM groups g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = ?
      ORDER BY g.created_at DESC
    `).all(userId);
  },

  getById(groupId) {
    return db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
  },

  getByInviteCode(code) {
    return db.prepare('SELECT * FROM groups WHERE invite_code = ?').get(code);
  },

  join(groupId, userId) {
    const existing = db.prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
    if (existing) return { success: false, error: '已经是群组成员' };
    db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)').run(groupId, userId, 'member');
    return { success: true };
  },

  getMembers(groupId) {
    return db.prepare(`
      SELECT u.id, u.username, gm.role, gm.joined_at
      FROM group_members gm
      JOIN users u ON gm.user_id = u.id
      WHERE gm.group_id = ?
      ORDER BY gm.role DESC, gm.joined_at ASC
    `).all(groupId);
  },

  isMember(groupId, userId) {
    return !!db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  },

  isAdmin(groupId, userId) {
    const row = db.prepare('SELECT role FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
    return row && row.role === 'admin';
  },

  addNotebook(groupId, notebookName) {
    try {
      db.prepare('INSERT INTO group_notebooks (group_id, notebook_name) VALUES (?, ?)').run(groupId, notebookName);
      return { success: true };
    } catch (e) {
      return { success: false, error: '已存在' };
    }
  },

  removeNotebook(groupId, notebookName) {
    db.prepare('DELETE FROM group_notebooks WHERE group_id = ? AND notebook_name = ?').run(groupId, notebookName);
  },

  getNotebooks(groupId) {
    return db.prepare('SELECT notebook_name FROM group_notebooks WHERE group_id = ?').all(groupId).map(r => r.notebook_name);
  },

  getUserGroups(userId) {
    return db.prepare('SELECT group_id FROM group_members WHERE user_id = ?').all(userId).map(r => r.group_id);
  }
};

module.exports = { db, noteOps, notebookOps, refOps, groupOps, getGroupUserId };
