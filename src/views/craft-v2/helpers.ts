/**
 * MOD 一覧画面 (CraftDiscoveryV2B) 共通の定数と表示ヘルパー
 *
 * CraftDiscoveryV2B.vue から切り出し (2026-09-07)。
 */
import type { SlotKey } from "../../services/craft-v2/types";
import type { WarnLevel, WarnSource } from "../../state/craft-v2-store";

export interface SlotTab {
  key: SlotKey;
  label: string;
  /** 錬金術記号ライクな絵文字 */
  icon: string;
}

/**
 * スロットタブ (オーナー指示 2026-05-22: 指輪 / アミュレット / 武器 / オフハンド / 兜 / 手袋 / 胴体 / 靴)。
 * trade2 のカテゴリは武器1/武器2 とも `weapon` に丸めるため、ラベル側で「武器」「オフハンド」と意味分離する。
 */
export const SLOT_TABS: readonly SlotTab[] = [
  { key: "ring", label: "指輪", icon: "○" },
  { key: "amulet", label: "アミュレット", icon: "◆" },
  { key: "weapon", label: "武器", icon: "⚔" },
  { key: "weapon2", label: "オフハンド", icon: "🛡" },
  { key: "helm", label: "兜", icon: "▲" },
  { key: "gloves", label: "手袋", icon: "✋" },
  { key: "body", label: "胴体", icon: "▮" },
  { key: "boots", label: "靴", icon: "▼" },
];

/**
 * ニッチ MOD の閾値: 50 人母集団なら 6 人以上 (12%以上) を「主流」とみなし、
 * 採用者 5 人以下 (= 10% 以下) はデフォルト非表示 (クリックで展開)。
 */
export const LOW_COUNT_THRESHOLD = 6;

/** 進捗率の分母 (想定アセンダンシー数) */
export const TARGET_ASCENDANCY_COUNT = 10;

/** POE2 装備は prefix/suffix 各 3 枠まで (4 つ目のチェックは物理的にあり得ない) */
export const MAX_AFFIX_PER_ITEM = 3;

/** 警告履歴行の表示色クラス (暖色トーン) */
export function warnLevelClasses(level: WarnLevel): string {
  switch (level) {
    case "error":
      return "text-red-200 border-l-2 border-red-600/60";
    case "warn":
      return "text-amber-200 border-l-2 border-amber-600/60";
    case "info":
    default:
      return "text-[var(--exile-color-text-secondary)] border-l-2 border-[var(--exile-color-border-subtle)]";
  }
}

export function warnSourceLabel(source?: WarnSource): string {
  switch (source) {
    case "health-check":
      return "健全性";
    case "dict-check":
      return "辞書";
    case "fetch-character":
      return "キャラ取得";
    case "trade2-search":
      return "trade2";
    case "craft-fetch":
      return "クラフト取得";
    case "mod-select":
      return "MOD 選択";
    default:
      return "";
  }
}

/** Rust 側 / 内部の英語エラーメッセージをユーザー向け日本語に変換 */
export function localizeError(msg: string): string {
  if (!msg) return "";
  let s = msg;
  s = s.replace(/\[character\]/g, "[キャラ取得]");
  s = s.replace(/\[search\]/g, "[検索]");
  s = s.replace(/\[join\]/g, "[並列タスク]");
  s = s.replace(/\[aggregate\]/g, "[集計]");
  s = s.replace(/HTTP 429 after (\d+) retries for (\S+?):/, "レート制限超過 ($1 回リトライ失敗): $2 → ");
  s = s.replace(/HTTP 429 after (\d+) retries for (\S+)/, "レート制限超過 ($1 回リトライ失敗): $2");
  s = s.replace(/HTTP (\d+) Not Found for (\S+)/, "見つかりません ($1): $2");
  s = s.replace(/HTTP (\d+) for (\S+)/, "HTTP $1 エラー: $2");
  s = s.replace(/network error on (\S+):/, "ネットワークエラー: $1:");
  s = s.replace(/error code: 1015/g, "→ Cloudflare レート制限");
  s = s.replace(/error code: (\d+)/g, "→ エラーコード $1");
  s = s.replace(/character json parse error/g, "キャラデータの JSON 解析失敗");
  s = s.replace(/json parse error/g, "JSON 解析失敗");
  s = s.replace(/build-index-state: leagueBuilds[^ ]* missing/g, "リーグ別ビルド一覧が見つかりません");
  s = s.replace(/statistics missing in leagueBuilds/g, "アセンダンシー使用率データが見つかりません");
  s = s.replace(/index-state: economyLeagues[^ ]* missing/g, "現リーグ情報が取得できません");
  s = s.replace(/semaphore closed/g, "セマフォ閉鎖");
  s = s.replace(/unreachable backoff loop for/g, "バックオフループ異常:");
  return s;
}
