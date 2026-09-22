/**
 * usePicker.ts — ベースから選んで 0 から組む道 (2026-09-23)
 *
 * オーナー指示:「まず何も表示してない状態からスタートして、忍者からコピー、または
 * ベース選択って感じの画面から始まる感じだね」。
 *
 * 貼り付けの道は**真似る**ための物 (欲しい物が既にある)。こちらは**自分で決める**ための物で、
 * ベースと狙う MOD とティアを手で並べます。オーナー方針「手動の所は手動でいきたい」に沿って、
 * ここは一切自動で選びません ── 並べて、絞って、押せるようにするだけです。
 */
import { computed, ref, shallowRef } from "vue";
import { htcBaseInfo } from "../../services/htc/patch";
import { itemBaseFor } from "../../services/htc/bridge";
import { jaOfMod } from "../../services/htc/mod-text";
import { isCraftedMod } from "../../services/htc/craft-slots";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { ItemBase, Mod, PatchData } from "../../vendor/poe2htc/engine/types";

/** 一覧に出すベース 1 行 */
export interface BaseRow {
  /** 英語名 (エンジンの引き当てに使う) */
  en: string;
  ja: string;
  /** エンジンのクラス (`Rings`) */
  cls: string;
  lvl: number;
  /** 暗黙の効果 (日本語)。無ければ空 */
  implicits: string[];
}

/** 選べる MOD 1 行 */
export interface ModRow {
  modId: string;
  ja: string;
  side: "P" | "S";
  /** 段の名前 (低い方から)。`tiers[i]` と同じ並び */
  tiers: { name: string; ilvl: number; range: string }[];
  /** 確定で乗せられる MOD (エッセンス / 合金) か */
  crafted: boolean;
}

/** 選んだ MOD と、狙う段 */
export interface Pick {
  modId: string;
  /** `mod.tiers` の添字。**大きいほど良い** (tiers は ilvl 昇順) */
  tierIndex: number;
}

export function usePicker() {
  /** ベースの絞り込み (日本語・英語どちらでも) */
  const baseQuery = ref("");
  /** 選んだベースの英語名 */
  const baseName = ref<string | null>(null);
  /** MOD の絞り込み */
  const modQuery = ref("");
  const picks = ref<Pick[]>([]);
  /** 作るアイテムの ilvl。段の上限を決めるので先に要る */
  const level = ref(82);
  const cls = shallowRef<ItemBase | null>(null);

  // **`dataRef` を読むこと。**`htcBaseInfo()` は素の関数で、読み込みが終わっても
  // それ自体は変化を通知しません。参照しないと、パッチを読む前の空の結果を掴んだまま
  // 二度と作り直されず、一覧が永久に空になります (2026-09-23 に実際そうなった)。
  /** 一覧が参照する PatchData。画面側から差し込む */
  const dataRef = shallowRef<PatchData | null>(null);
  function useData(d: PatchData | null): void {
    dataRef.value = d;
  }

  const allBases = computed<BaseRow[]>(() =>
    dataRef.value === null ? [] : Object.entries(htcBaseInfo())
      .map(([en, info]) => ({
        en,
        ja: info.ja,
        cls: info.cls,
        lvl: info.lvl,
        implicits: (info.implicits ?? []).map((i) => i.ja),
      }))
      .sort((a, b) => a.cls.localeCompare(b.cls) || a.lvl - b.lvl || a.ja.localeCompare(b.ja)),
  );

  const baseRows = computed<BaseRow[]>(() => {
    const q = baseQuery.value.trim().toLowerCase();
    if (!q) return allBases.value.slice(0, 40);
    return allBases.value
      .filter((b) => b.ja.toLowerCase().includes(q) || b.en.toLowerCase().includes(q) || b.cls.toLowerCase().includes(q))
      .slice(0, 40);
  });

  /** ベースを選ぶ。選び直すと MOD の選択は捨てる (別のベースでは同じ MOD が無い) */
  function chooseBase(data: PatchData, en: string): void {
    baseName.value = en;
    cls.value = itemBaseFor(data, en);
    picks.value = [];
    modQuery.value = "";
  }

  /** 選んだベースのプール。`level` を超える段は**出しません** (取れない物を並べない) */
  const modRows = computed<ModRow[]>(() => {
    const c = cls.value;
    const d = dataRef.value;
    if (!c || !d) return [];
    const q = modQuery.value.trim().toLowerCase();
    const out: ModRow[] = [];
    for (const [side, ids] of [["P", c.pools.normal.prefixes], ["S", c.pools.normal.suffixes]] as const) {
      for (const id of ids) {
        const mod: Mod | undefined = d.mods.get(id);
        if (!mod) continue;
        const ja = jaOfMod(mod);
        if (q && !ja.toLowerCase().includes(q) && !id.toLowerCase().includes(q)) continue;
        const tiers = mod.tiers
          .map((t, i) => ({ i, t }))
          .filter(({ t }) => t.ilvl <= level.value)
          .map(({ t }) => ({
            name: String(t.name ?? ""),
            ilvl: t.ilvl,
            range: (t.ranges ?? []).map((r) => `${r[0]}-${r[1]}`).join(" / "),
          }));
        if (tiers.length === 0) continue; // この ilvl では 1 段も取れない
        out.push({ modId: id, ja, side, tiers, crafted: isCraftedMod(mod) });
      }
    }
    return out;
  });

  function isPicked(modId: string): boolean {
    return picks.value.some((p) => p.modId === modId);
  }
  /** 押すたびに入れる / 外す。既定は**その ilvl で取れる一番良い段** */
  function toggle(row: ModRow): void {
    if (isPicked(row.modId)) {
      picks.value = picks.value.filter((p) => p.modId !== row.modId);
      return;
    }
    picks.value = [...picks.value, { modId: row.modId, tierIndex: row.tiers.length - 1 }];
  }
  function setTier(modId: string, tierIndex: number): void {
    picks.value = picks.value.map((p) => (p.modId === modId ? { ...p, tierIndex } : p));
  }
  function tierOf(modId: string): number | null {
    return picks.value.find((p) => p.modId === modId)?.tierIndex ?? null;
  }

  /**
   * ソルバに渡す形へ。`minTierIndex` は「**その段以上**」なので、画面の添字をそのまま渡します
   * (`modRows` の段は ilvl 昇順のまま、取れない段だけ落としてある)。
   */
  const targets = computed<TierTarget[]>(() =>
    picks.value.map((p) => ({ modId: p.modId, minTierIndex: p.tierIndex })),
  );

  function clear(): void {
    baseName.value = null;
    cls.value = null;
    picks.value = [];
    baseQuery.value = "";
    modQuery.value = "";
  }

  return {
    baseQuery, baseRows, baseName, cls, chooseBase,
    modQuery, modRows, picks, isPicked, toggle, setTier, tierOf,
    level, targets, useData, clear,
  };
}
