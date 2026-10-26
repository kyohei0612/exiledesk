-- シミュのレシピの短い URL (2026-10-26 オーナー「シェア URL なっがいし、コピー URL なっが」)。exiledesk.com/r/<id> の id → 中身の code (#recipe= の後ろの文字そのまま)。
-- 入口は server/web/recipe-share.js。id は code の SHA-256 から決まる 8 文字なので同じ中身は同じ行。ip は SHA の頭だけ (連打の制限に使う)。KV は増やさない
CREATE TABLE IF NOT EXISTS recipe_shares (id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT, at INTEGER NOT NULL, ip TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS recipe_shares_at ON recipe_shares (at);
CREATE INDEX IF NOT EXISTS recipe_shares_ip_at ON recipe_shares (ip, at);
