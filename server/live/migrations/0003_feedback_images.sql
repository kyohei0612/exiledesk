-- 要望・バグに付いた画像 (2026-10-14 オーナー「画像送れるようにもしようか、こっちからその画像下さいみたいな」)。
-- KV は増やさない決まり (analytics-logs) なので D1 に。90 日で消す (毎朝の cron)
CREATE TABLE IF NOT EXISTS fb_images (id TEXT PRIMARY KEY, fb_id TEXT NOT NULL, at INTEGER NOT NULL, mime TEXT NOT NULL, data BLOB NOT NULL);
CREATE INDEX IF NOT EXISTS fb_images_fb ON fb_images (fb_id);
CREATE INDEX IF NOT EXISTS fb_images_at ON fb_images (at);
