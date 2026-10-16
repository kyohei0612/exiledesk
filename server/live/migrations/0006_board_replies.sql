-- 掲示板の 2 段目 (2026-10-16 オーナー「掲示板強化」): 返信・いいね・貼ったアイテム。
-- 番号は 0006 (0005 は wip/craft-challenge の 0005_challenge.sql が使う)
-- parent = 返信先の書き込みの id (NULL = タイムラインの書き込み)。返信は 1 段だけ
ALTER TABLE board_posts ADD COLUMN parent TEXT;
-- 並びの時刻 (書き込み = 書いた時。返信が付くと返信の時刻に上がる)
ALTER TABLE board_posts ADD COLUMN bump INTEGER;
ALTER TABLE board_posts ADD COLUMN likes INTEGER NOT NULL DEFAULT 0;
-- 貼ったアイテム (エミュレーターの今のアイテムを縮めた JSON。画面が自分のデータで文にする)
ALTER TABLE board_posts ADD COLUMN att TEXT;
UPDATE board_posts SET bump = at WHERE bump IS NULL;
CREATE INDEX IF NOT EXISTS board_posts_bump ON board_posts (hidden, parent, bump);
CREATE INDEX IF NOT EXISTS board_posts_parent ON board_posts (parent, hidden, at);
-- いいね (同じ端末は 1 件に 1 回。もう一度押すと外す)
CREATE TABLE IF NOT EXISTS board_likes (post_id TEXT NOT NULL, uid TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (post_id, uid));
CREATE INDEX IF NOT EXISTS board_likes_uid ON board_likes (uid, at);
