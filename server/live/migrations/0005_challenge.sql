-- 今日のお題 (challenge.ts、2026-10-13 → 2026-10-16 docs/craft-challenge.md の形に)。KV は増やさない決まりなので D1 に。
-- 番号は 0005 (main の 0003_feedback_images・wip/board の 0004_board とぶつけない)
-- challenge_runs: 挑戦を始めた時刻 (時間はサーバーで測る)。seed = その日の乱数の種 (全員同じ)、first = その人のその日の最初の挑戦、done = 記録を送った
CREATE TABLE IF NOT EXISTS challenge_runs (id TEXT PRIMARY KEY, day TEXT NOT NULL, uid TEXT NOT NULL, started INTEGER NOT NULL, seed INTEGER NOT NULL, first INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS challenge_runs_day_uid ON challenge_runs (day, uid);
CREATE INDEX IF NOT EXISTS challenge_runs_started ON challenge_runs (started);
-- challenge_results: 達成した挑戦 1 回ごとに 1 行 (順位の決まりが変わっても数え直せるように、一番の記録だけにまとめない)。
-- 順位は 費用 (cost、高貴) → 手数 (steps) → 時間 (ms) → 先に出した方 (at)。沼カウンター: chaos / whittle (削減) / annul (消去) / resets (振り出し)、swamp = 合計
CREATE TABLE IF NOT EXISTS challenge_results (
  id TEXT PRIMARY KEY, day TEXT NOT NULL, uid TEXT NOT NULL, nick TEXT NOT NULL, first INTEGER NOT NULL,
  cost REAL NOT NULL, steps INTEGER NOT NULL, ms INTEGER NOT NULL, at INTEGER NOT NULL,
  chaos INTEGER NOT NULL DEFAULT 0, whittle INTEGER NOT NULL DEFAULT 0, annul INTEGER NOT NULL DEFAULT 0, resets INTEGER NOT NULL DEFAULT 0, swamp INTEGER NOT NULL DEFAULT 0,
  plan TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS challenge_results_rank ON challenge_results (day, cost, steps, ms, at);
CREATE INDEX IF NOT EXISTS challenge_results_uid ON challenge_results (day, uid);
CREATE INDEX IF NOT EXISTS challenge_results_swamp ON challenge_results (day, swamp);
