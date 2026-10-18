-- シェアの短い URL (2026-10-18 オーナー「スマホからシェアの URL 長くて怖い」)。/s/<id> の id → 中身の code (server/web/og-card.js)。
-- id は code の SHA-256 から決まる 7 文字なので、同じ結果は同じ行 (INSERT OR IGNORE)。KV は増やさない決まり (analytics-logs) なので D1 に
CREATE TABLE IF NOT EXISTS shares (id TEXT PRIMARY KEY, code TEXT NOT NULL, at INTEGER NOT NULL);
