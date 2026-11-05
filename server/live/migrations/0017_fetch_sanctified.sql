-- 週の取得の品の聖別の印 (設計図 D-80d)。itemData.sanctified。型にする時に文へ「Sanctified」を置き、読み (S-08f) が値を ×0.78〜1.22 の幅で段に当てる
ALTER TABLE daily_fetch_items ADD COLUMN sanctified INTEGER;
