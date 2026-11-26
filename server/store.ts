import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import type { Case, Doc, Entry, Result, Source } from '../src/domain'

export function createStore(path: string) {
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA secure_delete = ON;
    CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      data TEXT NOT NULL, bytes BLOB NOT NULL, filename TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS policies (
      id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS results (
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE, tool TEXT NOT NULL, data TEXT NOT NULL,
      PRIMARY KEY (case_id, tool)
    );
  `)
  const all = <T>(table: 'documents' | 'policies' | 'entries' | 'results', id: string): T[] =>
    db.prepare('SELECT data FROM ' + table + ' WHERE case_id = ? ORDER BY rowid').all(id)
      .map(row => JSON.parse(String(row.data)) as T)
  const get = (id: string): Case | undefined => {
    const row = db.prepare('SELECT id, title, description FROM cases WHERE id = ?').get(id)
    if (!row) return
    return { id, title: String(row.title), description: String(row.description),
      docs: all<Doc>('documents', id), policy: all<Source>('policies', id),
      entries: all<Entry>('entries', id), results: all<Result>('results', id) }
  }
  return {
    get,
    list: () => db.prepare('SELECT id, title, description FROM cases ORDER BY rowid DESC').all(),
    close: () => db.close(),
    create(title: string, description: string) {
      const id = randomUUID()
      db.prepare('INSERT INTO cases VALUES (?, ?, ?)').run(id, title, description)
      return get(id)!
    },
    delete: (id: string) => db.prepare('DELETE FROM cases WHERE id = ?').run(id),
    addDoc(caseId: string, doc: Doc, bytes: Buffer, filename: string) {
      db.prepare('INSERT INTO documents VALUES (?, ?, ?, ?, ?)').run(doc.id, caseId, JSON.stringify(doc), bytes, filename)
    },
    getFile: (caseId: string, id: string) => db.prepare('SELECT filename, bytes FROM documents WHERE case_id = ? AND id = ?').get(caseId, id),
    addEntry(caseId: string, entry: Entry) {
      db.prepare('INSERT INTO entries VALUES (?, ?, ?)').run(entry.id, caseId, JSON.stringify(entry))
    },
    addPolicy(caseId: string, source: Source, previous?: Source) {
      db.exec('BEGIN')
      try {
        if (previous) db.prepare('UPDATE policies SET data = ? WHERE case_id = ? AND id = ?')
          .run(JSON.stringify({ ...previous, archived: true }), caseId, previous.id)
        db.prepare('INSERT INTO policies VALUES (?, ?, ?)').run(source.id, caseId, JSON.stringify(source))
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    putResult(caseId: string, result: Result) {
      db.prepare('INSERT INTO results VALUES (?, ?, ?) ON CONFLICT(case_id, tool) DO UPDATE SET data = excluded.data')
        .run(caseId, result.tool, JSON.stringify(result))
    },
  }
}
