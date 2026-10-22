-- シミュレーターのツリーのレシピの短い URL (2026-10-22 オーナー)。POST /tree/new で木の JSON を置き、GET /tree/<id> で取り出す (src/tree-share.ts)。
-- id は中身の SHA-256 から決まる 8 文字なので、同じ木は同じ行 (INSERT OR IGNORE)。ip は IP の SHA-256 の頭 16 文字 (連打の制限だけに使う、IP そのものは置かない)。KV は増やさない決まり (analytics-logs) なので D1 に
CREATE TABLE IF NOT EXISTS tree_shares (id TEXT PRIMARY KEY, body TEXT NOT NULL, name TEXT, at INTEGER NOT NULL, ip TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS tree_shares_ip_at ON tree_shares (ip, at);
