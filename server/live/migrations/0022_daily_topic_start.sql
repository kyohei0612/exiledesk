-- デイリーのお題の始まり (設計図 D-03c、オーナー 11-15「MOD無しのレアで」)。'rare' = 始め方を選ばず MOD の無いレアから始める日。NULL = 今まで (D-03)
ALTER TABLE daily_topics ADD COLUMN start TEXT;
