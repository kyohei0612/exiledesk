-- 共通アカウント (引き継ぎコード、docs/spec/account.md A-xx、2026-11-03 案)。本番の D1 にはまだ当てない (オーナーの OK の後)。
-- 生のコード・札・IP・メールは持たない (A-02・A-12)。コードと札は HMAC-SHA256 (鍵 ACCOUNT_PEPPER) の 16 進
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,              -- 乱数 16 字
  name TEXT,                        -- 表示の名前 (デイリーのニックネーム、A-60)。無くてよい
  name_key TEXT UNIQUE,             -- そろえた名前 (D-52)。全体で 1 人
  code_hash TEXT NOT NULL UNIQUE,   -- 引き継ぎコード (A-10)。作り直すと替わる
  created INTEGER NOT NULL,
  code_at INTEGER NOT NULL,         -- コードを出した時刻
  synced INTEGER                    -- 最後の同期 (復元の確かめに使う、A-71)
);
-- つないだ端末 (A-15、1 アカウント 10 台まで)
CREATE TABLE IF NOT EXISTS account_devices (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  label TEXT NOT NULL,              -- 「iPhone Safari」程度
  created INTEGER NOT NULL,
  seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_devices_acc ON account_devices (account_id);
-- 保存物 (A-40・A-41)。1 件ずつ、新しい方が勝つ。deleted = 1 は消した印 (body は空、30 日で掃除)
CREATE TABLE IF NOT EXISTS account_items (
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  updated INTEGER NOT NULL,         -- 端末の updatedAt (勝ち負け)
  rev INTEGER NOT NULL,             -- サーバーが置いた時刻 (下ろす時の since)
  deleted INTEGER NOT NULL DEFAULT 0,
  name TEXT,                        -- 包みの名前 (復元の確かめ用、A-71)
  body TEXT,
  PRIMARY KEY (account_id, kind, item_id)
);
CREATE INDEX IF NOT EXISTS account_items_rev ON account_items (account_id, rev);
-- コードの外れの数 (A-11)。ip は SHA の頭、hour は時刻 / 3600000。1 日で消す
CREATE TABLE IF NOT EXISTS account_tries (
  ip TEXT NOT NULL,
  hour INTEGER NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (ip, hour)
);
