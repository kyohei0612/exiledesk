//! 同梱データの取り込み (2026-09-18)
//!
//! オーナー指示:「これサブ PC でしか使わないから、俺のこの更新データだけど
//! 自動ジェム周りのデータだけ内蔵してビルドに食い込んでよ」。
//!
//! 自動ジェム監視まわりのデータ (捌き速度の記録 / 使用率ランキングの集計結果) を
//! インストーラに同梱し、**その PC にまだ無い時だけ** app_data にコピーする。
//! これで新しい PC でもいきなり判定が出て、poe.ninja を 100 リクエスト叩かなくて済む。
//!
//! 既にある物は絶対に上書きしない (自分で貯めた記録を消さないため)。

use std::path::PathBuf;

use tauri::Manager;

/// (同梱ファイル名, app_data 側の名前)
const SEEDS: &[(&str, &str)] = &[
    ("seed/market_flow.json", "market_flow.json"),
    ("seed/gem_break_result.json", "gem_break_result.json"),
    // キャラ別キャッシュも積んでおく。同じ snapshot の間は使用率ランキングを
    // 取り直してもリクエストがほぼ 0 で済む
    ("seed/gem_break_cache.json", "gem_break_cache.json"),
];

fn app_data_path(app: &tauri::AppHandle, name: &str) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?;
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join(name))
}

/// 起動時に 1 回。無い物だけ同梱データで埋める
pub fn install_if_missing(app: &tauri::AppHandle) {
    for (res, name) in SEEDS {
        let Some(dest) = app_data_path(app, name) else { continue };
        if dest.exists() {
            continue;
        }
        let Ok(src) = app.path().resolve(res, tauri::path::BaseDirectory::Resource) else {
            continue;
        };
        if !src.exists() {
            continue;
        }
        match std::fs::copy(&src, &dest) {
            Ok(n) => crate::app_log::line(app, &format!("[同梱データ] {name} を入れました ({n} バイト)")),
            Err(e) => crate::app_log::line(app, &format!("[同梱データ] {name} を入れられません: {e}")),
        }
    }
}
