-- 記録しない端末 (forget.ts)。前は KV の端末ごとのキーで、読むたびに一覧 (1 日 1,000 回の枠) を使っていた (2026-10-11)
CREATE TABLE IF NOT EXISTS nolog (uid TEXT PRIMARY KEY, at TEXT NOT NULL);
