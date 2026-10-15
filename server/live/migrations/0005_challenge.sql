-- 今日のお題 (challenge.ts、2026-10-13)。挑戦を始めた時刻 (時間はサーバーで測る) と、1 日 1 人の一番の記録
-- seed: 乱数の種 (その日は全員同じ)。first: その人のその日の最初の挑戦 (タイムの順位はこれだけ)
CREATE TABLE IF NOT EXISTS challenge_runs (id TEXT PRIMARY KEY, day TEXT NOT NULL, uid TEXT NOT NULL, started INTEGER NOT NULL, seed INTEGER NOT NULL, first INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS challenge_runs_day_uid ON challenge_runs (day, uid);
CREATE INDEX IF NOT EXISTS challenge_runs_started ON challenge_runs (started);
-- steps / cost / steps_at / steps_plan = 一番少ない手数の記録 (同じ手数なら安い方、それも同じなら先に達成した方)。ms / ms_plan = 一番速い記録
CREATE TABLE IF NOT EXISTS challenge_scores (
  day TEXT NOT NULL, uid TEXT NOT NULL, nick TEXT NOT NULL,
  steps INTEGER, cost REAL, steps_at INTEGER, steps_plan TEXT,
  ms INTEGER, ms_at INTEGER, ms_plan TEXT,
  PRIMARY KEY (day, uid)
);
CREATE INDEX IF NOT EXISTS challenge_scores_steps ON challenge_scores (day, steps, cost, steps_at);
CREATE INDEX IF NOT EXISTS challenge_scores_ms ON challenge_scores (day, ms, ms_at);
