//! 公開構造体 (Tauri emit / IPC payload)
//!
//! poe_ninja_client.rs (2,476 行) から機械分割 (2026-09-07 R3)。

use super::*;

// ============================================================================
// 公開構造体
// ============================================================================

/// アセンダンシー使用率 (build-index-state より)
#[derive(Serialize, Clone, Debug)]
pub struct AscendancyMeta {
    /// "Blood Mage" / "Oracle" など、search の class クエリにそのまま使える表記
    pub class: String,
    /// 使用率 (0.0〜100.0)
    pub percentage: f64,
}

/// キャラ参照 (search からの抽出結果)
#[derive(Serialize, Clone, Debug)]
pub struct CharacterRef {
    /// account-discriminator (例: "AsmodeusPOE-0579")
    pub account: String,
    /// キャラ名 (例: "Asmo_CarryDeluxe")
    pub name: String,
}

/// キャラ単位の取得結果 (character endpoint の items[] そのまま)
///
/// MOD フィルタ・集計は TS 側 (Phase δ) で行う。Rust 側はあくまで透過。
#[derive(Serialize, Clone, Debug)]
pub struct CharacterItems {
    pub account: String,
    pub name: String,
    /// poe.ninja `items[]` 配列の JSON value をそのまま保持
    pub items: Vec<serde_json::Value>,
}

/// snapshot メタ情報 (index-state より動的解決)
#[derive(Serialize, Clone, Debug)]
pub struct SnapshotMeta {
    /// リーグ slug (例: "vaal")
    pub league_url: String,
    /// snapshot 名 (例: "fate-of-the-vaal")
    pub snapshot_name: String,
    /// snapshot version (例: "1623-20260521-21119")
    pub version: String,
}

/// リーグ情報 (Phase ξ: economyLeagues から動的取得)
///
/// poe.ninja の `economyLeagues[]` 各エントリから抽出:
///   - `url`        : "vaal" / "hcvaal" / "ssfvaal" / "ssfhcvaal" / "standard" / "hardcore"
///   - `name`       : "Fate of the Vaal" / "Hardcore Fate of the Vaal" / ...
///   - `is_hardcore`: url または name に "hc" / "hardcore" 含むか
///   - `is_ssf`     : url または name に "ssf" 含むか
#[derive(Serialize, Clone, Debug)]
pub struct LeagueInfo {
    pub url: String,
    pub name: String,
    pub is_hardcore: bool,
    pub is_ssf: bool,
}

/// アセンダンシー単位の進捗イベント payload (Tauri emit 用)
#[derive(Serialize, Clone, Debug)]
pub struct CraftV2Progress {
    pub ascendancy: String,
    pub percentage: f64,
    pub characters_done: usize,
    pub characters_total: usize,
    /// このアセンダンシー分のすべての CharacterItems (完了時に 1 度だけ emit)
    pub items: Vec<CharacterItems>,
}

/// per-character 単位の進捗イベント payload (Tauri emit 用、2026-05-23 追加)。
///
/// アセ内のキャラ取得が「今どこまで進んでいるか」「何をしている最中か」を可視化するため、
/// `craft-v2-character-progress` event で emit される。UI 側でヘッダーに
/// 「📥 ブラッドメイジ 32/50 (4 並列)」のように表示する。
///
/// 発火タイミング:
///   - phase="search"    : `fetch_search_top_n` 呼出**前**に 1 回 (上位プレイヤー検索開始)
///   - phase="fetching"  : 5 キャラ完了毎にバッチ emit (per-character オーバーヘッド削減)
///   - phase="completed" : アセ完了時に 1 回 (UI のクリア用)
#[derive(Serialize, Clone, Debug)]
pub struct CraftV2CharacterProgress {
    /// アセンダンシー名 (例: "Blood Mage")
    pub ascendancy: String,
    /// 既に取得済 (成功 + 失敗合計、流用分は含めない)
    pub characters_done: usize,
    /// 該当アセの取得対象キャラ数 (search で得た総数 = 通常 50、検索失敗時は 0)
    pub characters_total: usize,
    /// 現在 fetch 中の並列タスク数 (= ACTIVE_FETCH_COUNT snapshot)。
    /// emit 時点での観測値なので「ちょうど 0」が一瞬で見えることもあるが、UX 上は
    /// 「何個並列で走ってる」目安が立てば十分。
    pub current_concurrency: usize,
    /// "search" | "fetching" | "completed"
    pub phase: String,
}

/// 取得完了時に return / craft-v2-done event で返す結果。
/// TS 側は `cache` を `craft_v2_cache_save` で永続化する。
#[derive(Serialize, Clone, Debug)]
pub struct CraftV2FetchResult {
    pub snapshot: SnapshotMeta,
    pub cache: CraftV2Cache,
}
