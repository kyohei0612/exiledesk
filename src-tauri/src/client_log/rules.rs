//! client_log/rules.rs — 仕分け表 (どの行をどう読むか)。ここだけ見れば新しい行を足せる
//!
//! 2026-09-19 に client_log.rs (732 行) から切り出した。
//! サブモジュールは private なので pub にしてもクレートの外には出ない。
use super::*;

// ============================================================================
// 既知パターン表
// ============================================================================

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    /// 実害あり (対処を促す)
    Warn,
    /// 気に留める程度
    Notice,
    /// 既知の無害 (GGG エンジンが常時吐くもの)
    Noise,
}

pub struct Rule {
    pub id: &'static str,
    /// 行に含まれていれば一致 (先に書いたものが優先)
    pub needle: &'static str,
    pub severity: Severity,
    pub title: &'static str,
    pub advice: Option<&'static str>,
}

/// 上から順に判定する。実害ありを先に置くこと。
pub const RULES: &[Rule] = &[
    // ── 実害あり ────────────────────────────────────────────────
    Rule {
        id: "vram",
        needle: "[TEXTURE] Insufficient VRAM",
        severity: Severity::Warn,
        title: "VRAM 不足でテクスチャを読み込めなかった",
        advice: Some(
            "テクスチャ品質を 1 段下げてください。専用 VRAM を使い切ると共有メモリ (システムメモリ) に溢れ、PC 全体のメモリ逼迫やカクつきの原因になります。",
        ),
    },
    Rule {
        id: "content-corrupt",
        needle: "Marking steam content as corrupt",
        severity: Severity::Warn,
        title: "ゲームファイルの破損を検知",
        advice: Some("Steam の「ゲームファイルの整合性を確認」を実行してください。"),
    },
    Rule {
        id: "device-removed",
        needle: "device removed",
        severity: Severity::Warn,
        title: "GPU デバイスが切り離された",
        advice: Some("グラフィックドライバを更新するか、GPU のオーバークロックを解除してください。"),
    },
    Rule {
        id: "disconnect",
        needle: "Abnormal disconnect",
        severity: Severity::Notice,
        title: "予期しない切断",
        advice: Some("理由はメッセージ末尾に出ます。コントローラーの取り外しでも切断されます。"),
    },
    Rule {
        id: "shader-cache-wipe",
        needle: "Wiping cache ShaderCache",
        severity: Severity::Notice,
        title: "シェーダーキャッシュの再構築",
        advice: Some(
            "ドライバ更新や描画設定の変更直後は正常です。頻発する場合はキャッシュが毎回壊れています。",
        ),
    },
    // ── 既知の無害 (対処不要な理由も書く) ──────────────────────────
    Rule {
        id: "geal",
        needle: "Error executing GEAL",
        severity: Severity::Noise,
        title: "アニメーション / エフェクト層の内部エラー",
        advice: Some(
            "対処不要です。スキルやモンスターの演出スクリプトが実行できなかった記録で、見た目にも性能にも影響しません。全 CRIT の半分近くを占める最多のノイズです。",
        ),
    },
    Rule {
        id: "position-height",
        needle: "Tried to get position height",
        severity: Severity::Noise,
        title: "高さ情報が未確定のまま座標を参照",
        advice: Some("対処不要です。地形の高さがまだ確定していないタイミングで座標を取ろうとしただけで、エンジンが既定値で処理を続けます。"),
    },
    Rule {
        id: "moveto-nan",
        // NaN / infinite の両方を拾う
        needle: "issue a MoveTo with",
        severity: Severity::Noise,
        title: "モンスターの移動速度が未確定",
        advice: Some(
            "対処不要です。スタンや凍結、リチュアルの復活直後など速度が未確定の瞬間に出ます。リチュアルやブリーチを多く回すと増えます。",
        ),
    },
    Rule {
        id: "bone-mapping",
        needle: "in manual mapping when morphing",
        severity: Severity::Noise,
        title: "モデル変形時のボーン対応漏れ",
        advice: Some("対処不要です。装備の見た目を切り替えるときに、対応する骨が無かったという記録です。"),
    },
    Rule {
        id: "mapping-size",
        needle: "Manual mapping size mismatch",
        severity: Severity::Noise,
        title: "モデル変形時のボーン数不一致",
        advice: Some("対処不要です。上と同じくモデル差し替え時の記録です。"),
    },
    Rule {
        id: "anim-timeline",
        needle: "Negative value on timeline for animation",
        severity: Severity::Noise,
        title: "アニメーションの時間指定が負",
        advice: Some("対処不要です。攻撃モーションの再生位置が一瞬マイナスになっただけです。"),
    },
    Rule {
        id: "anim-loop",
        needle: "animation cannot be a looping animation",
        severity: Severity::Noise,
        title: "被弾モーションのループ指定",
        advice: Some("対処不要です。モンスター側のアニメーション定義の不備で、GGG のデータ側の問題です。"),
    },
    Rule {
        id: "effect-pack",
        needle: "Attempted to remove an effect pack",
        severity: Severity::Noise,
        title: "状態異常エフェクトの二重解除",
        advice: Some("対処不要です。着火などの状態異常が消えるときに、既に消えていたという記録です。"),
    },
    Rule {
        id: "controller-ui",
        needle: "SetControllerUIContextLayer",
        severity: Severity::Noise,
        title: "コントローラー UI の階層切り替え",
        advice: Some("対処不要です。コントローラー用 UI の状態遷移の記録です。"),
    },
    Rule {
        id: "atlas-input",
        needle: "Atlas input suspension",
        severity: Severity::Noise,
        title: "アトラス操作の一時停止",
        advice: Some("対処不要です。アトラス画面を開閉するたびに出ます。"),
    },
    Rule {
        id: "maven-table",
        needle: "MavenJewelRadiusKeystones",
        severity: Severity::Noise,
        title: "アトラス用テーブルの引き当て失敗",
        advice: Some("対処不要です。アトラスのノードを表示するたびに出る、GGG 側のデータ定義漏れです。プレイには影響しません。"),
    },
    Rule {
        id: "instance-sync",
        needle: "InstanceClientActionUpdate",
        severity: Severity::Noise,
        title: "サーバーとのオブジェクト同期のズレ",
        advice: Some(
            "基本は対処不要です。サーバーが送ってきた対象がクライアント側にまだ無かっただけで、通常は次の更新で揃います。極端に多い日はラグが出ていた可能性があります。",
        ),
    },
    Rule {
        id: "popup",
        needle: "SetPopupsVisibility",
        severity: Severity::Noise,
        title: "UI ポップアップの表示要求",
        advice: Some("対処不要です。表示条件が揃う前にポップアップを出そうとした UI 側の記録です。"),
    },
    Rule {
        id: "art-variation",
        needle: "GetArtVariationItemInternal",
        severity: Severity::Noise,
        title: "アート差分の読み込み失敗",
        advice: Some("対処不要です。アイテムや装備の見た目バリエーションが見つからず既定の絵で描画された、という記録です。"),
    },
    Rule {
        id: "activation-range",
        needle: "SetExtraActivationRangeAroundTile",
        severity: Severity::Noise,
        title: "レベル生成後の範囲設定",
        advice: Some("対処不要です。マップ生成が終わった後に範囲指定を追加しようとしたときに出ます。"),
    },
    Rule {
        id: "bink",
        needle: "Bink file",
        severity: Severity::Noise,
        title: "演出動画ファイルが見つからない",
        advice: Some(
            "ほぼ対処不要です。カットイン動画が未収録なだけで進行に影響しません。大量に出る場合だけ Steam の整合性確認を試してください。",
        ),
    },
    Rule {
        id: "video-open",
        needle: "[VIDEO] Failed to open file",
        severity: Severity::Noise,
        title: "演出動画ファイルが見つからない",
        advice: Some("ほぼ対処不要です。上と同じで、動画ファイルが無いか読めなかった記録です。"),
    },
    Rule {
        id: "instant-action",
        needle: "Instant/Triggered action",
        severity: Severity::Noise,
        title: "即時発動スキルの同期",
        advice: Some("対処不要です。トリガー系スキルの発動をクライアントが再現できなかった記録で、実際のダメージはサーバー側で処理されています。"),
    },
    Rule {
        id: "vertex-layout",
        needle: "incorrect vertex layout",
        severity: Severity::Noise,
        title: "シェーダーの頂点レイアウト不一致",
        advice: Some("対処不要です。描画側で想定と違う形式を渡しただけで、エンジンが吸収します。"),
    },
];

// ============================================================================
// ログの所在
// ============================================================================

