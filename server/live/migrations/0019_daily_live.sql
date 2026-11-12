-- デイリーの挑戦中の控え (設計図 D-57b、オーナー 11-12「レシピに保存しなくてもこっちで見れるように」「その人の動作を全部書き込めばいいのでは」)。お題 × 名前で 1 行。tree = 最新の木を上書き (exiledesk-recipe/1)、acts = 動作の列 (1 行 1 つの JSON を後ろへ足す、30 日で空にする)。読む口は作らない
CREATE TABLE IF NOT EXISTS daily_live (
  topic_id TEXT NOT NULL,
  nick_id TEXT NOT NULL,
  first_at INTEGER NOT NULL,
  at INTEGER NOT NULL,
  n INTEGER NOT NULL DEFAULT 1,
  tree TEXT,
  acts TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (topic_id, nick_id)
);
