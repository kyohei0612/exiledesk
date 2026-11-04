-- デイリー (クラフト挑戦状) の表 (設計図 D-55、2026-11-05)。口は src/daily/、16:00 の切り替えは scripts/daily-roll.mjs (D-59)
-- 日 (day) は 16:00 JST に始まる日のその日付 "2026-11-09"、お題の id は "d" + day。week はその週の月曜の day

-- 名前 (D-51・D-52)。引き継ぎコードはハッシュだけ。ip_hash は作る数の制限だけに使う (Y-94)
CREATE TABLE IF NOT EXISTS daily_nicks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  created INTEGER NOT NULL,
  title_pick TEXT,
  ip_hash TEXT
);

-- 投稿 (D-20)。status: wait (機械の確かめ待ち) / ok (箱の中) / no (落ちた、why に訳) / used (お題に出た)
CREATE TABLE IF NOT EXISTS daily_box (
  id TEXT PRIMARY KEY,
  created INTEGER NOT NULL,
  ip_hash TEXT,
  nick_id TEXT,
  note TEXT,
  item TEXT NOT NULL,     -- {base, baseJa, ilvl, aims}
  status TEXT NOT NULL,
  why TEXT
);
CREATE INDEX IF NOT EXISTS daily_box_status ON daily_box (status, created);
CREATE INDEX IF NOT EXISTS daily_box_ip ON daily_box (ip_hash, created);

-- お題 (D-21)。出した後は変えない
CREATE TABLE IF NOT EXISTS daily_topics (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL UNIQUE,
  week TEXT NOT NULL,
  box_id TEXT,
  sample_id TEXT,
  slot INTEGER NOT NULL,
  item_class TEXT,
  base TEXT NOT NULL,
  base_ja TEXT,
  ilvl INTEGER NOT NULL,
  type_snap TEXT,
  aims TEXT NOT NULL,
  prices TEXT,
  seed INTEGER NOT NULL,
  engine_ver TEXT,
  rules_ver TEXT,
  shown_by TEXT NOT NULL  -- roll (16:00 の台本) / plan (台本が回らず Worker が週の予定から)
);

-- 挑戦 (D-32・D-33)。1 お題 1 人 1 行、記録は解決の中で一番安い物 (無ければ最後の提出)
CREATE TABLE IF NOT EXISTS daily_tries (
  topic_id TEXT NOT NULL,
  nick_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  submitted_at INTEGER,
  cost REAL,
  rate REAL,
  recipe TEXT,
  checked INTEGER,        -- 検算 (D-58): 1 = 合った、-1 = 合わない (順位から外す)、null = まだ・見ない
  PRIMARY KEY (topic_id, nick_id)
);

-- 日の結果 (D-100、締め D-59 で書き、消さない)
CREATE TABLE IF NOT EXISTS daily_results (
  day TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  nick_id TEXT NOT NULL,
  place INTEGER,
  cost REAL,
  rate REAL,
  used_ms INTEGER,
  solved_n INTEGER,
  entered_n INTEGER,
  slot INTEGER,
  item_class TEXT,
  base TEXT,
  checked INTEGER,
  engine_ver TEXT,
  facts TEXT,
  PRIMARY KEY (day, nick_id)
);

-- 称号 (D-101)。全部の記録から計算し直した写し。名前と格は付いた時の写し (行を消しても残る)
CREATE TABLE IF NOT EXISTS daily_awards (
  nick_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  title_ver INTEGER,
  first_day TEXT,
  count INTEGER,
  retired INTEGER,
  ja TEXT, en TEXT, rank INTEGER,
  PRIMARY KEY (nick_id, title_id)
);

-- 週の型 (D-80c)。mods = [{name, tier}] (daily-gen.ts の DailySample)
CREATE TABLE IF NOT EXISTS daily_samples (
  week TEXT NOT NULL,
  id TEXT NOT NULL,
  item_class TEXT,
  base TEXT NOT NULL,
  mods TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (week, id)
);

-- 週の予定 (D-06)。aims・ilvl は台本が回らなかった日に Worker がこのままお題にするための写し
CREATE TABLE IF NOT EXISTS daily_plan (
  day TEXT PRIMARY KEY,
  week TEXT NOT NULL,
  slot INTEGER NOT NULL,
  item_class TEXT,
  base TEXT NOT NULL,
  base_ja TEXT,
  sample_id TEXT,
  ilvl INTEGER,
  aims TEXT
);
