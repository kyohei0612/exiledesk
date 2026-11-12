-- デイリーのリンクの番号 (設計図 D-52b、オーナー 11-12「数字打たすか。PCIDに紐づいた奴で」「おｋ数字オンリーでおｋ」)。
-- daily_links = 名前を持つ端末が出した 6 桁の番号。生きている間 (長くて 10 分) だけ、その名前の引き継ぎコードそのものを code に置く
-- (サーバーはコードのハッシュしか持たないので、もう 1 台に渡す物がほかに無い)。使った・切れた・出し直した時に dead = 1 にして code を空にし、1 時間たった行は消す。
-- daily_link_miss = 番号の打ち間違いの控え (同じ IP から 10 分に 5 回まで・全体で 10 分に 200 回までの止め)。10 分たった行は消す。元の IP は残さない
CREATE TABLE IF NOT EXISTS daily_links (
  num TEXT NOT NULL,
  nick_id TEXT NOT NULL,
  code TEXT NOT NULL,
  made_at INTEGER NOT NULL,
  until INTEGER NOT NULL,
  ip_hash TEXT,
  dead INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS daily_links_num ON daily_links (num, dead);
CREATE INDEX IF NOT EXISTS daily_links_nick ON daily_links (nick_id, made_at);
CREATE TABLE IF NOT EXISTS daily_link_miss (
  ip_hash TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS daily_link_miss_at ON daily_link_miss (at);
