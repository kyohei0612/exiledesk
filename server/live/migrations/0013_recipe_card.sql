-- シミュのレシピのシェアのカード絵 (2026-10-28 オーナー「レシピ用に魔改造して欲しいなそのカード絵」、設計図 Y-35)。画面がシェアの時に送る値 (完成の割合・平均の費用・手の数・完成形の MOD など、server/web/recipe-card.js の cleanCard を通した JSON)
ALTER TABLE recipe_shares ADD COLUMN card TEXT;
