const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'notes.db');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// 启用 WAL 模式和外键约束
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 初始化表结构
db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
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
    name TEXT PRIMARY KEY
  );
`);

// 全文搜索虚拟表（如果不存在）
try {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      content,
      content='notes',
      content_rowid='rowid'
    );
  `);
} catch (e) {
  // FTS5 可能不可用，忽略错误
}

// 从笔记数据中提取文本内容
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

// ===== 数据库操作 =====

// 笔记操作
const noteOps = {
  getAll() {
    return db.prepare(`
      SELECT n.id, n.data, n.created_at, n.updated_at,
             GROUP_CONCAT(nn.notebook) as notebooks
      FROM notes n
      LEFT JOIN note_notebooks nn ON n.id = nn.note_id
      GROUP BY n.id
    `).all().map(row => {
      const note = JSON.parse(row.data);
      note.notebooks = row.notebooks ? row.notebooks.split(',') : [];
      return note;
    });
  },

  getByNotebook(notebook) {
    return db.prepare(`
      SELECT n.id, n.data, n.created_at, n.updated_at
      FROM notes n
      JOIN note_notebooks nn ON n.id = nn.note_id
      WHERE nn.notebook = ?
      ORDER BY n.updated_at DESC
    `).all(notebook).map(row => {
      const note = JSON.parse(row.data);
      return note;
    });
  },

  getById(id) {
    const row = db.prepare(`
      SELECT n.data FROM notes n WHERE n.id = ?
    `).get(id);
    return row ? JSON.parse(row.data) : null;
  },

  create(note) {
    const content = extractContent(note);
    const now = new Date().toISOString();
    note.createdAt = note.createdAt || now;
    note.updatedAt = now;

    db.prepare(`
      INSERT INTO notes (id, data, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(note.id, JSON.stringify(note), content, note.createdAt, note.updatedAt);

    // 更新笔记本关联
    this.updateNotebooks(note.id, note.notebooks || []);

    // 更新 FTS
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

  update(note) {
    const content = extractContent(note);
    note.updatedAt = new Date().toISOString();

    db.prepare(`
      UPDATE notes SET data = ?, content = ?, updated_at = ? WHERE id = ?
    `).run(JSON.stringify(note), content, note.updatedAt, note.id);

    // 更新笔记本关联
    this.updateNotebooks(note.id, note.notebooks || []);

    // 更新 FTS
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

  delete(id) {
    // FTS 会通过触发器自动删除
    db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  },

  updateNotebooks(noteId, notebooks) {
    db.prepare('DELETE FROM note_notebooks WHERE note_id = ?').run(noteId);
    const insert = db.prepare('INSERT OR IGNORE INTO note_notebooks (note_id, notebook) VALUES (?, ?)');
    for (const nb of notebooks) {
      if (nb) insert.run(noteId, nb);
    }
  },

  search(query) {
    const q = query.toLowerCase();
    const allNotes = this.getAll();

    return allNotes.map(note => {
      const fields = ['content', 'quote', 'book', 'dynasty', 'page'];
      let matchField = 'other';

      for (const field of fields) {
        const val = note[field];
        if (val && String(val).toLowerCase().includes(q)) {
          matchField = field;
          break;
        }
      }

      // 检查所有字段
      const allFields = Object.keys(note).filter(k =>
        k !== 'id' && k !== 'notebooks' && k !== 'createdAt' && k !== 'updatedAt'
      );
      const hasMatch = allFields.some(k => {
        const val = note[k];
        return val && String(val).toLowerCase().includes(q);
      });

      if (hasMatch) {
        note.matchField = matchField;
        return note;
      }
      return null;
    }).filter(Boolean).slice(0, 50);
  },

  filter(filters) {
    let notes = this.getAll();

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

  countByNotebook(notebook) {
    const row = db.prepare(`
      SELECT COUNT(*) as count FROM note_notebooks WHERE notebook = ?
    `).get(notebook);
    return row ? row.count : 0;
  }
};

// 笔记本操作
const notebookOps = {
  getAll() {
    return db.prepare('SELECT name FROM notebooks ORDER BY rowid').all().map(r => r.name);
  },

  create(name) {
    try {
      db.prepare('INSERT INTO notebooks (name) VALUES (?)').run(name);
      return { success: true };
    } catch (e) {
      if (e.message.includes('UNIQUE')) {
        return { success: false, error: '已存在同名笔记本' };
      }
      throw e;
    }
  },

  delete(name) {
    db.prepare('DELETE FROM notebooks WHERE name = ?').run(name);
    // 删除只有此笔记本的笔记
    db.prepare(`
      DELETE FROM notes WHERE id IN (
        SELECT nn.note_id FROM note_notebooks nn
        WHERE nn.notebook = ?
        AND nn.note_id NOT IN (
          SELECT nn2.note_id FROM note_notebooks nn2 WHERE nn2.notebook != ?
        )
      )
    `).run(name, name);
    // 删除关联
    db.prepare('DELETE FROM note_notebooks WHERE notebook = ?').run(name);
  },

  rename(oldName, newName) {
    db.prepare('UPDATE notebooks SET name = ? WHERE name = ?').run(newName, oldName);
    db.prepare('UPDATE note_notebooks SET notebook = ? WHERE notebook = ?').run(newName, oldName);
  }
};

module.exports = { db, noteOps, notebookOps };
