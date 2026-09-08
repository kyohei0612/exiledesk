/**
 * 起動時の健全性チェック (Rust health_check_all) と辞書件数チェック
 *
 * craft-v2-store.ts から切り出し (2026-09-07)。結果は警告履歴 (pushWarn) に積む。
 */
import { invoke } from "@tauri-apps/api/core";
import { craftV2Store, pushWarn } from "./store";

import uniqueModsJa from "../../i18n/unique-mods-ja.json";
import uniqueNamesJa from "../../i18n/unique-names-ja.json";
import poe2FlavourJa from "../../i18n/poe2-flavour-ja.json";
import modTierAndGroup from "../../i18n/mod-tier-and-group.json";
import trade2StatMapping from "../../i18n/trade2-stat-mapping.json";

/** Rust health_check_all の戻り値 */
interface HealthCheckResult {
  poe_ninja_schema_ok: boolean;
  poe2db_html_ok: boolean;
  trade2_api_ok: boolean;
  unknown_inventory_ids_count: number;
  unknown_inventory_id_samples: Array<{ inventory_id: string; count: number }>;
  warnings: string[];
}

export async function runHealthCheck(): Promise<void> {
  const prevCount = craftV2Store.warnHistory.length;
  try {
    const result = await invoke<HealthCheckResult>("health_check_all");
    if (!result.poe_ninja_schema_ok) {
      pushWarn("error", "poe.ninja API 構造変更を検出", "health-check");
    }
    if (!result.poe2db_html_ok) {
      pushWarn("warn", "POE2DB HTML 構造変更の可能性 (辞書再生成検討)", "health-check");
    }
    if (!result.trade2_api_ok) {
      pushWarn("warn", "trade2 API 仕様変更の可能性", "health-check");
    }
    if (result.unknown_inventory_ids_count > 0) {
      const samples = result.unknown_inventory_id_samples ?? [];
      const details = samples.map((s) => `${s.inventory_id} × ${s.count} 件`);
      pushWarn(
        "info",
        `未知 inventoryId ${result.unknown_inventory_ids_count} 件 (poe.ninja アイテム種別追加か)`,
        "health-check",
        details,
      );
    }
    for (const w of result.warnings) {
      pushWarn("warn", w, "health-check");
    }
    if (craftV2Store.warnHistory.length === prevCount) {
      pushWarn("info", "すべての外部 API が正常です", "health-check");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isUnimplemented = /not found|unregistered/i.test(msg);
    pushWarn(
      isUnimplemented ? "info" : "warn",
      isUnimplemented ? "health_check_all 未実装 (Phase ο-A 後に有効化)" : `health_check_all 失敗: ${msg}`,
      "health-check",
    );
  }
}

// ---------------------------------------------------------------------------
// 辞書件数チェック (期待件数を下回っていたら警告)
// ---------------------------------------------------------------------------
const DICT_EXPECTED_MIN: Record<string, number> = {
  "unique-mods-ja": 1500,
  "unique-names-ja": 380,
  "poe2-flavour-ja": 3000,
  "mod-tier-and-group": 600,
  "trade2-stat-mapping": 500,
};

export function checkDictionaryFreshness(): void {
  const mtg = modTierAndGroup as { groups?: Record<string, unknown> };
  const mtgMin = Object.keys(mtg.groups ?? {}).length;

  const checks: Array<readonly [string, number]> = [
    ["unique-mods-ja", Object.keys(uniqueModsJa as Record<string, unknown>).length],
    ["unique-names-ja", Object.keys(uniqueNamesJa as Record<string, unknown>).length],
    ["poe2-flavour-ja", Object.keys(poe2FlavourJa as Record<string, unknown>).length],
    ["mod-tier-and-group", mtgMin],
    ["trade2-stat-mapping", Object.keys(trade2StatMapping as Record<string, unknown>).length],
  ];

  for (const [name, actual] of checks) {
    const expected = DICT_EXPECTED_MIN[name] ?? 0;
    if (actual < expected) {
      pushWarn("warn", `辞書 ${name} が薄い (${actual}/${expected} 件) — 再生成を検討してください`, "dict-check");
    }
  }
}
