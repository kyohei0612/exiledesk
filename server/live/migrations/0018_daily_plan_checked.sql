-- 予定の 1 日を 16:00 の台本がフル MOD・段 (D-04) で確かめた印 (設計図 D-80f)。値は台本の決まりの版 (RULES_VER)。
-- 台本が落ちた日にサーバーが予定から出す時 (settleFromPlan) は、印のある予定だけをお題にし、無ければ前の日のお題をもう 1 日出す
ALTER TABLE daily_plan ADD COLUMN checked TEXT;
