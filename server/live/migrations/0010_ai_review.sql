-- AI の評価と見解の全文を #日報 に流す (2026-10-26 オーナー「日報に全文くれ」)。scripts/post-ai-review.mjs が Discord 向けに切った塊を置き、
-- Worker (POST /ai-review/flush・毎時の cron) が REPORT_WEBHOOK で古い順に流して posted_at を付ける。同じ日は 1 回だけ (day が主キー)。KV は増やさない
CREATE TABLE IF NOT EXISTS ai_review (day TEXT PRIMARY KEY, chunks TEXT NOT NULL, at INTEGER NOT NULL, sent INTEGER NOT NULL DEFAULT 0, posted_at INTEGER);
