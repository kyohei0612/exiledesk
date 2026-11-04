-- デイリーの週の取得 (設計図 D-80b・Y-53、2026-11-05)。poe.ninja の上位プレイヤーの装備を日曜 16:00〜月曜 16:00 JST に 5 分おきの cron で数本ずつ取る (src/ninja/)
-- 止めのスイッチ: INSERT OR REPLACE INTO ninja_ctl VALUES ('stop','1') で取らない ('0' か行を消すと戻る)
CREATE TABLE IF NOT EXISTS ninja_ctl (k TEXT PRIMARY KEY, v TEXT);

-- 週ごとの取得の段 (week = 仕える月曜の JST の日付 "2026-11-09")。state: running | done | partial | failed | stopped
CREATE TABLE IF NOT EXISTS ninja_job (
  week TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  league TEXT, version TEXT, snapshot TEXT,
  ascs TEXT,              -- 上位 7 アセの英語名 (JSON)
  interval_ms INTEGER,    -- 送る間隔 (2.5 秒から、429 で倍・上限 10 秒)
  not_before INTEGER,     -- この時刻 (ms) まで送らない (429 の罰・5xx の待ち)
  last_sent INTEGER,
  pending TEXT,           -- 取り直し中の 1 本 {url, attempt, backoff}
  requests INTEGER NOT NULL DEFAULT 0,
  errors TEXT,            -- 最後の 20 件 (JSON)
  started_at TEXT, finished_at TEXT,
  people INTEGER, items INTEGER
);

-- 取得の途中の控え (search の結果 = 名前の列、キャラ = メインスキルと装備)。週の取得が終わったら消す (名前を残さない D-80c)
CREATE TABLE IF NOT EXISTS ninja_memo (
  week TEXT NOT NULL,
  kind TEXT NOT NULL,     -- search | char
  k TEXT NOT NULL,
  v TEXT,                 -- search: [{account,name}] / null = 失敗、char: {skills,dps} / null = 失敗
  items TEXT,             -- char だけ: レアの装備 (JSON)
  PRIMARY KEY (week, kind, k)
);

-- 型の材料 (残す物、消さない D-80c)。1 行 = 取った人の 1 品 (レアだけ)。段はまだ無い (16:00 の生成の側が MOD の表で当てる)
CREATE TABLE IF NOT EXISTS daily_fetch_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week TEXT NOT NULL,
  slot TEXT NOT NULL,     -- inventoryId (Helm / BodyArmour / Gloves / Boots / Amulet / Ring / Ring2 / Belt / Weapon / Offhand …)
  sub TEXT,               -- extended.subcategories (JSON)
  base TEXT NOT NULL,     -- baseType
  ilvl INTEGER,
  quality INTEGER,
  quality_kind TEXT,      -- 品質の欄の名前 (カタリストの種類、素の値に戻す用)
  mods TEXT NOT NULL,     -- explicitMods の文 (JSON)
  fractured TEXT,         -- fracturedMods (あれば、JSON)
  desecrated TEXT,        -- desecratedMods (あれば、JSON)
  corrupted INTEGER,
  who TEXT NOT NULL,      -- アカウントのハッシュ (同じアカウントは 1 人に数える。名前は残さない)
  asc TEXT, skill TEXT
);
CREATE INDEX IF NOT EXISTS daily_fetch_items_week ON daily_fetch_items (week, slot);
