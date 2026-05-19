// storage.js — SQLite persistence for Test Suites & History
// Handles all DB operations: create / list / load / delete suites,
// save executions, list history, fetch a specific past run.

// Schema:
//   suites      — saved test case collections
//   executions  — every test run, linked to a suite (or null for ad-hoc runs)

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "testforge.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// ----- Schema -----
db.exec(`
  CREATE TABLE IF NOT EXISTS suites (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    app_url     TEXT,
    test_data   TEXT,
    testcases   TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS executions (
    id          TEXT PRIMARY KEY,
    suite_id    TEXT,
    suite_name  TEXT,
    app_url     TEXT,
    results     TEXT NOT NULL,
    summary     TEXT NOT NULL,
    executed_at INTEGER NOT NULL,
    FOREIGN KEY (suite_id) REFERENCES suites(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_executions_suite ON executions(suite_id);
  CREATE INDEX IF NOT EXISTS idx_executions_date  ON executions(executed_at DESC);
`);

// ----- Helpers -----
const newId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const now = () => Date.now();

// SUITES

function createSuite({ name, description = "", appUrl = "", testData = {}, testcases = [] }) {
    const id = newId("suite");
    const ts = now();
    db.prepare(`
        INSERT INTO suites (id, name, description, app_url, test_data, testcases, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, name, description, appUrl,
        JSON.stringify(testData),
        JSON.stringify(testcases),
        ts, ts
    );
    return getSuite(id);
}

function updateSuite(id, { name, description, appUrl, testData, testcases }) {
    const existing = getSuite(id);
    if (!existing) return null;

    db.prepare(`
        UPDATE suites
        SET name = ?, description = ?, app_url = ?, test_data = ?, testcases = ?, updated_at = ?
        WHERE id = ?
    `).run(
        name ?? existing.name,
        description ?? existing.description,
        appUrl ?? existing.appUrl,
        JSON.stringify(testData ?? existing.testData),
        JSON.stringify(testcases ?? existing.testcases),
        now(),
        id
    );
    return getSuite(id);
}

function getSuite(id) {
    const row = db.prepare("SELECT * FROM suites WHERE id = ?").get(id);
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        appUrl: row.app_url,
        testData: safeParse(row.test_data, {}),
        testcases: safeParse(row.testcases, []),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function listSuites() {
    const rows = db.prepare(`
        SELECT id, name, description, app_url, testcases, created_at, updated_at
        FROM suites
        ORDER BY updated_at DESC
    `).all();

    return rows.map((r) => {
        const tcs = safeParse(r.testcases, []);
        return {
            id: r.id,
            name: r.name,
            description: r.description,
            appUrl: r.app_url,
            testCount: Array.isArray(tcs) ? tcs.length : 0,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        };
    });
}

function deleteSuite(id) {
    db.prepare("DELETE FROM suites WHERE id = ?").run(id);
    return { ok: true };
}

// EXECUTIONS / HISTORY

function saveExecution({ suiteId = null, suiteName = "Ad-hoc Run", appUrl = "", results = [] }) {
    const id = newId("exec");
    const summary = computeSummary(results);

    db.prepare(`
        INSERT INTO executions (id, suite_id, suite_name, app_url, results, summary, executed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, suiteId, suiteName, appUrl,
        JSON.stringify(results),
        JSON.stringify(summary),
        now()
    );
    return getExecution(id);
}

function getExecution(id) {
    const row = db.prepare("SELECT * FROM executions WHERE id = ?").get(id);
    if (!row) return null;
    return {
        id: row.id,
        suiteId: row.suite_id,
        suiteName: row.suite_name,
        appUrl: row.app_url,
        results: safeParse(row.results, []),
        summary: safeParse(row.summary, {}),
        executedAt: row.executed_at,
    };
}

function listExecutions({ suiteId = null, limit = 100 } = {}) {
    const rows = suiteId
        ? db.prepare(`
            SELECT id, suite_id, suite_name, app_url, summary, executed_at
            FROM executions
            WHERE suite_id = ?
            ORDER BY executed_at DESC
            LIMIT ?
          `).all(suiteId, limit)
        : db.prepare(`
            SELECT id, suite_id, suite_name, app_url, summary, executed_at
            FROM executions
            ORDER BY executed_at DESC
            LIMIT ?
          `).all(limit);

    return rows.map((r) => ({
        id: r.id,
        suiteId: r.suite_id,
        suiteName: r.suite_name,
        appUrl: r.app_url,
        summary: safeParse(r.summary, {}),
        executedAt: r.executed_at,
    }));
}

function deleteExecution(id) {
    db.prepare("DELETE FROM executions WHERE id = ?").run(id);
    return { ok: true };
}

// Utilities

function computeSummary(results) {
    const total = results.length;
    const pass = results.filter((r) => r.status === "Pass").length;
    const fail = results.filter((r) => r.status === "Fail").length;
    const skipped = results.filter((r) => r.status === "Skipped").length;
    const healed = results.filter((r) => r.healed === true).length;
    const passRate = total > 0 ? +((pass / total) * 100).toFixed(1) : 0;
    return { total, pass, fail, skipped, healed, passRate };
}

function safeParse(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = {
    createSuite,
    updateSuite,
    getSuite,
    listSuites,
    deleteSuite,
    saveExecution,
    getExecution,
    listExecutions,
    deleteExecution,
};
