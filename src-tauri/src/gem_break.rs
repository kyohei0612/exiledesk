//! クラフト選定ジェムの集計 (2026-09-16)
//!
//! 「レベル 21 / 品質 23% / 両方 (完成品) のジェムを使っている人数」を数える。
//! poe.ninja の全体集計 (search の dimension) にはレベル / 品質の軸が無いので、
//! アセンダンシー 1 つ分の上位キャラだけ character を取って直接数える
//! (オーナー判断: 「一旦ジェムリングのみで試してもええ」= 1 アセなら 40 リクエスト程度)。
//!
//! 進捗は `gem-break-progress` event で emit する (取得はレート制限で数分かかりうる)。
//!
//! 2026-09-18 (オーナー報告「すぐレートが制限になって取るのにかなり時間くう」):
//! キャラごとの結果を `gem_break_cache` に残し、次からはキャッシュに無い人だけ取る。
//! 途中でレート制限に当たっても取れた分は残るので、続きから再開できる。

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};

/// 取得中に「中止」が押されたか (レート制限待ちが長い時の逃げ道)
static CANCEL: AtomicBool = AtomicBool::new(false);

/// 取得を中止する。走っているループが次のキャラに移る時に見て抜ける。
#[tauri::command]
pub fn gem_break_cancel() {
    CANCEL.store(true, Ordering::Relaxed);
}

use crate::gem_break_cache as gcache;
use crate::poe_ninja_client as ninja;

mod fetch;
mod count;
mod store;
pub use count::*;
pub use store::*;
pub use fetch::*;

/// 集計 1 行 (ジェム 1 種)
#[derive(Serialize, Clone, Debug, Default)]
pub struct GemBreakRow {
    /// 英語名 (表示時に TS 側で日本語化)
    pub name: String,
    /// そのジェムを使っていた人数
    pub users: u32,
    /// レベル 21 以上で使っていた人数
    pub lvl21: u32,
    /// 品質 23% 以上で使っていた人数
    pub q23: u32,
    /// 両方 (完成品) で使っていた人数
    pub both: u32,
    /// 見えた中で一番高いレベル / 品質
    pub max_level: i64,
    pub max_quality: i64,
    /// コラプト済みで使っていた人数
    pub corrupted: u32,
    /// レベルの分布 (レベル, 人数) レベル昇順。同じキャラの同じレベルは 1 回
    pub level_dist: Vec<(i64, u32)>,
    /// 品質の分布 (品質, 人数) 昇順
    pub quality_dist: Vec<(i64, u32)>,
}

#[derive(Serialize, Clone, Debug)]
pub struct GemBreakResult {
    /// 集計に使ったアセンダンシー (複数なら "上位 N アセ合算")
    pub class: String,
    /// 実際に見たアセンダンシー名
    pub classes: Vec<String>,
    /// そのアセンダンシーの使用率 (%)
    pub percentage: f64,
    /// 実際に取れたキャラ数 (= 母数)
    pub characters: usize,
    /// そのうちキャッシュから流用した人数 (poe.ninja に取りに行かなかった分)
    pub reused: usize,
    /// 取ろうとしたキャラ数 (これより少なければレート制限や中止で打ち切られている)
    pub requested: usize,
    /// 中止ボタンで打ち切ったか
    pub cancelled: bool,
    pub league: String,
    pub snapshot: String,
    /// 取得時刻 (unix 秒)
    pub fetched_at: i64,
    pub rows: Vec<GemBreakRow>,
}

#[derive(Deserialize)]
pub struct GemBreakRequest {
    /// 省略時は使用率トップのアセンダンシー
    pub class: Option<String>,
    /// 取るキャラ数 (既定 40、上限 100)。JS からは topN で来る
    #[serde(alias = "topN")]
    pub top_n: Option<usize>,
    /// 何アセンダンシーに散らすか (既定 1 = class だけ)。2 以上なら使用率上位から均等に取る
    #[serde(alias = "spread")]
    pub spread: Option<usize>,
}

#[derive(Serialize, Clone)]
struct Progress {
    phase: &'static str,
    done: usize,
    total: usize,
    class: String,
    /// done のうちキャッシュから流用した人数 (画面で「取得 12 / キャッシュ 60」と出す)
    reused: usize,
}

fn emit(window: &tauri::Window, phase: &'static str, done: usize, total: usize, class: &str, reused: usize) {
    let _ = window.emit(
        "gem-break-progress",
        Progress { phase, done, total, class: class.to_string(), reused },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn g(name: &str, level: i64, quality: i64, corrupted: bool) -> GemView {
        GemView { name: name.to_string(), level, quality, corrupted }
    }

    /// 底上げ無し: コラプトしていない最大レベルが 20 なら 0
    #[test]
    fn gear_bonus_is_zero_without_plus_levels() {
        let gems = vec![g("A", 20, 20, false), g("B", 20, 0, false), g("C", 21, 20, true)];
        assert_eq!(gear_bonus(&gems, true), 0);
    }

    /// 「+1 to Level of all Skills」: コラプトしていないジェムが軒並み 21 なら 1
    #[test]
    fn gear_bonus_detects_global_plus_one() {
        let gems = vec![g("A", 21, 20, false), g("B", 21, 20, false), g("C", 22, 20, true)];
        assert_eq!(gear_bonus(&gems, true), 1);
    }

    /// タグ限定の +2 (少数派) には引っ張られない
    #[test]
    fn gear_bonus_ignores_minority_tag_bonus() {
        let gems = vec![
            g("A", 21, 20, false),
            g("B", 21, 20, false),
            g("C", 21, 20, false),
            g("D", 23, 20, false), // 冷気スキルだけ +2 のような例外
        ];
        assert_eq!(gear_bonus(&gems, true), 1);
    }

    /// 上限付近のジェムが無ければ底上げ 0 とみなす (低レベルの補助ジェムだけの時)
    #[test]
    fn gear_bonus_falls_back_to_zero() {
        let gems = vec![g("A", 10, 0, false), g("B", 1, 0, false)];
        assert_eq!(gear_bonus(&gems, true), 0);
    }

    /// 品質も同じ扱い (素の上限 20%)
    #[test]
    fn gear_bonus_handles_quality() {
        let gems = vec![g("A", 20, 20, false), g("B", 20, 20, false), g("C", 20, 23, true)];
        assert_eq!(gear_bonus(&gems, false), 0);
    }
}

