-- 分析用の記録 (2026-10-09 オーナー「ユーザーのデータを分析できるようにログはしっかり残そう。サーバー重くならない仕組みで」)。
-- 届いたまとまり (POST /log) を 1 行に。中身 (body) は送られたままの JSON (サーバーは解かない = CPU を使わない)
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,       -- 受け取った時刻 (UTC ISO)
  day TEXT NOT NULL,      -- 日本時間の日付 (YYYY-MM-DD)
  app TEXT NOT NULL,      -- web / app
  country TEXT,
  n INTEGER NOT NULL,     -- 中の記録の数 (送る側の申告)
  body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS logs_day ON logs(day);
