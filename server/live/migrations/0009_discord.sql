-- Discord を読むだけの Bot (2026-10-24 オーナー「Bot は自分で 9:03 に起きて Discord を見に行き、書き込みをファイルにして管理人に渡す」)。src/discord.ts
-- discord_daily: 1 日 1 行 (日本時間の日付)。body は JSON { status, channels: [{ id, messages: [...] }], error? }。scripts/daily-summary.mjs が読んで日報の md に載せる
-- discord_cursor: チャンネルごとに、前回どこまで読んだか (最後の書き込みの id)。KV は増やさない決まり (analytics-logs) なので D1 に
CREATE TABLE IF NOT EXISTS discord_daily (day TEXT PRIMARY KEY, at INTEGER NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS discord_cursor (channel TEXT PRIMARY KEY, last_id TEXT NOT NULL, at INTEGER NOT NULL);
