import { DatabaseSync } from "node:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { randomUUID } from "node:crypto"
import { sessionSchema, type DefenseSession, type TranscriptEntry } from "../src/lib/session.js"
import { briefSchema, type Brief } from "../src/lib/methodology.js"

export type Frame = { id: string; at: number; image: string }
type Row = { data: string; owner: string }
export class Store {
  private db: DatabaseSync
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(path)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS owners (id TEXT PRIMARY KEY, authorized INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, owner TEXT NOT NULL, created_at INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_owner ON sessions(owner, created_at);
      CREATE TABLE IF NOT EXISTS frames (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, at INTEGER NOT NULL, image TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts (owner TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS attempts_at ON attempts(at);
      CREATE TABLE IF NOT EXISTS calls (id TEXT PRIMARY KEY, session_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS briefs (owner TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS brief_attempts (owner TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS brief_attempts_at ON brief_attempts(at);`)
  }
  owner(id: string) { return this.db.prepare("SELECT authorized FROM owners WHERE id=?").get(id) as { authorized: number } | undefined }
  addOwner(id: string) { this.db.prepare("INSERT INTO owners(id,created_at) VALUES (?,?)").run(id, Date.now()) }
  authorize(id: string) { this.db.prepare("UPDATE owners SET authorized=1 WHERE id=?").run(id) }
  create(owner: string): DefenseSession {
    const session = sessionSchema.parse({ id: randomUUID(), createdAt: Date.now(), endedAt: null, status: "connecting", transcript: [], frameCount: 0, feedback: null, error: null })
    this.db.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run(session.id, owner, session.createdAt, JSON.stringify(session))
    return session
  }
  get(id: string, owner?: string): DefenseSession | null {
    const row = this.db.prepare("SELECT owner,data FROM sessions WHERE id=?").get(id) as Row | undefined
    return row && (!owner || row.owner === owner) ? sessionSchema.parse(JSON.parse(row.data)) : null
  }
  list(owner: string) {
    return (this.db.prepare("SELECT data FROM sessions WHERE owner=? ORDER BY created_at DESC LIMIT 30").all(owner) as { data: string }[])
      .map(row => sessionSchema.parse(JSON.parse(row.data)))
  }
  all() { return (this.db.prepare("SELECT data FROM sessions").all() as { data: string }[]).map(row => sessionSchema.parse(JSON.parse(row.data))) }
  update(id: string, patch: Partial<DefenseSession>) {
    const current = this.get(id)
    if (!current) return null
    const updated = { ...current, ...patch, id: current.id, createdAt: current.createdAt }
    this.db.prepare("UPDATE sessions SET data=? WHERE id=?").run(JSON.stringify(updated), id)
    return updated
  }
  transcript(id: string, entry: TranscriptEntry) {
    const current = this.get(id)
    if (!current || current.transcript.length >= 1200) return
    const entries = current.transcript.filter(item => item.id !== entry.id)
    entries.push(entry)
    entries.sort((a, b) => a.at - b.at)
    this.update(id, { transcript: entries })
  }
  addFrame(sessionId: string, frame: Frame) {
    if (this.db.prepare("SELECT id FROM frames WHERE id=?").get(frame.id)) return false
    this.db.prepare("INSERT INTO frames VALUES (?,?,?,?)").run(frame.id, sessionId, frame.at, frame.image)
    const frames = this.frames(sessionId)
    // Preserve the first/last frames; remove the least temporally distinct interior frame.
    if (frames.length > 24) {
      let remove = 1
      for (let i = 2; i < frames.length - 1; i++) {
        if (frames[i + 1].at - frames[i - 1].at < frames[remove + 1].at - frames[remove - 1].at) remove = i
      }
      this.db.prepare("DELETE FROM frames WHERE id=?").run(frames[remove].id)
    }
    const current = this.get(sessionId)
    if (current) this.update(sessionId, { frameCount: current.frameCount + 1 })
    return true
  }
  frames(id: string): Frame[] { return this.db.prepare("SELECT id,at,image FROM frames WHERE session_id=? ORDER BY at").all(id) as Frame[] }
  attempt(owner: string) { this.db.prepare("INSERT INTO attempts VALUES (?,?)").run(owner, Date.now()) }
  attempts(owner?: string) {
    const since = Date.now() - 86_400_000
    const row = (owner ? this.db.prepare("SELECT COUNT(*) AS count FROM attempts WHERE owner=? AND at>?").get(owner, since) : this.db.prepare("SELECT COUNT(*) AS count FROM attempts WHERE at>?").get(since)) as { count: number }
    return row.count
  }
  delete(id: string) { this.db.prepare("DELETE FROM sessions WHERE id=?").run(id) }
  addCall(id: string, sessionId: string) { this.db.prepare("INSERT OR IGNORE INTO calls VALUES (?,?)").run(id, sessionId) }
  calls() { return this.db.prepare("SELECT id,session_id FROM calls").all() as { id: string; session_id: string }[] }
  deleteCall(id: string) { this.db.prepare("DELETE FROM calls WHERE id=?").run(id) }
  saveBrief(owner: string, brief: Brief) { this.db.prepare("INSERT OR REPLACE INTO briefs VALUES (?,?,?)").run(owner, JSON.stringify(brief), brief.preparedAt) }
  brief(owner: string, id: string): Brief | null {
    const row = this.db.prepare("SELECT data FROM briefs WHERE owner=? AND at>?").get(owner, Date.now() - 86_400_000) as { data: string } | undefined
    if (!row) return null
    const brief = briefSchema.parse(JSON.parse(row.data))
    return brief.id === id ? brief : null
  }
  deleteBrief(owner: string) { this.db.prepare("DELETE FROM briefs WHERE owner=?").run(owner) }
  briefAttempt(owner: string) { this.db.prepare("INSERT INTO brief_attempts VALUES (?,?)").run(owner, Date.now()) }
  briefAttempts(owner?: string) {
    const since = Date.now() - 86_400_000
    const row = (owner ? this.db.prepare("SELECT COUNT(*) AS count FROM brief_attempts WHERE owner=? AND at>?").get(owner, since) : this.db.prepare("SELECT COUNT(*) AS count FROM brief_attempts WHERE at>?").get(since)) as { count: number }
    return row.count
  }
  cleanup(days: number) {
    this.db.prepare("DELETE FROM briefs WHERE at<?").run(Date.now() - 86_400_000)
    this.db.prepare("DELETE FROM brief_attempts WHERE at<?").run(Date.now() - 86_400_000)
    this.db.prepare("DELETE FROM sessions WHERE created_at<?").run(Date.now() - days * 86_400_000)
    this.db.prepare("DELETE FROM owners WHERE created_at<? AND id NOT IN (SELECT owner FROM sessions)").run(Date.now() - days * 86_400_000)
    this.db.prepare("DELETE FROM attempts WHERE at<?").run(Date.now() - 86_400_000)
  }
  close() { this.db.close() }
}
