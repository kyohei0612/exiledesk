-- デイリーの「諦める」(設計図 D-37b、オーナー 11-05「あと諦めるボタンも欲しい」)。提出なしで挑戦を終えた時刻。入っていれば提出は受けない (1 日 1 回 D-33 のまま)
ALTER TABLE daily_tries ADD COLUMN gave_up_at INTEGER;
