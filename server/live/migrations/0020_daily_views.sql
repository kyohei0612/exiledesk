-- デイリーの順位のレシピを開いた記録 (設計図 D-50e、オーナー 11-12「閲覧数でやるとええんちゃうそしたら誰が見に来たかわかるやんこっちで」)。
-- お題 × 見られた人 × 見た人 で 1 行。viewer = 見た人の名前の id、名前を決めていない人は "a" + IP の印 (ip_hash と同じ作り、元の IP は残さない)。
-- 同じ人の開き直しは行を増やさず n と at だけ進める。画面に出すのは行の数 (開いた人の数) だけで、誰が見たかは運営が台本で読む
CREATE TABLE IF NOT EXISTS daily_views (
  topic_id TEXT NOT NULL,
  owner_nick_id TEXT NOT NULL,
  viewer TEXT NOT NULL,
  first_at INTEGER NOT NULL,
  at INTEGER NOT NULL,
  n INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (topic_id, owner_nick_id, viewer)
);
