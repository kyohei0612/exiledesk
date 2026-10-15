-- 掲示板 (2026-10-16 最初の段、docs/roadmap-2026-10.md「掲示板の作り」)。KV は増やさない決まりなので D1 に (board.ts)。
-- 1 つのタイムライン: 書き込み (kind = post) と当たりの速報の札 (kind = hit) を同じ表に、新しい順に読む
CREATE TABLE IF NOT EXISTS board_posts (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,          -- 受け取った時刻 (ms)。画面には出さない (並びだけ)
  kind TEXT NOT NULL,           -- post / hit
  uid TEXT NOT NULL,            -- 端末の番号 (使い方の記録・要望の context.uid と同じ)。画面には出さない
  iph TEXT NOT NULL,            -- IP の短いハッシュ (連投よけだけ。IP そのものは置かない)
  name TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,           -- post は本文、hit は札の中身 (JSON)
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0  -- 1 = 通報で隠した、2 = オーナーが消した
);
CREATE INDEX IF NOT EXISTS board_posts_at ON board_posts (hidden, at);
CREATE INDEX IF NOT EXISTS board_posts_tag ON board_posts (tag, hidden, at);
CREATE INDEX IF NOT EXISTS board_posts_uid ON board_posts (uid, at);
CREATE INDEX IF NOT EXISTS board_posts_iph ON board_posts (iph, at);
-- 通報 (同じ端末は 1 件に 1 回)
CREATE TABLE IF NOT EXISTS board_reports (post_id TEXT NOT NULL, uid TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (post_id, uid));
-- 書けなくした端末 (オーナーが消す時に ban を付けた物)。端末の番号は消せば変わるので、IP の短いハッシュも一緒に見る
CREATE TABLE IF NOT EXISTS board_bans (uid TEXT PRIMARY KEY, iph TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS board_bans_iph ON board_bans (iph);
