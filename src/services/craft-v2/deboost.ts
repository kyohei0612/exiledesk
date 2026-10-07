/**
 * 上位プレイヤーの装備の MOD を素の値に戻す (2026-09-29)
 *
 * オーナー「上位 MOD に表示する奴は品質とかオーグメントとか MOD で % で上がる MOD の効果抜いた数字とティアで表示して」。
 *
 * 装飾品 (指輪・アミュレット) の品質は種類つき (カタリスト) で、そのタグを持つ MOD の表示値を `素 × (1 + 品質)` に押し上げる
 * ([[quality.ts]])。ここではクラフト計算機の貼り付けの解析と同じ決まりで戻す:
 *   貼り付けの形に並べて parseJaItem → 行をエンジンの MOD に繋ぐ (bridgeMods) → そのカタリストで上がる MOD (boostedBy) だけ ÷ (1 + 品質)
 * 防具・武器の品質は MOD の数値を動かさない (素の防御値・ダメージの方) ので戻さない。
 * ルーン・ソウルコア (オーグメント) の効果は poe.ninja の explicitMods に入らない別の行なので、集計の数値には元から混ざらない。
 *
 * 品質の種類 (CachedRareItem.quality_kind) は 2026-09-29 から取る。それより前のキャッシュは種類が無く戻せない (「更新」で取り直すと入る)。
 */
import { loadHtcPatch, onHtcPatchLoaded } from "../htc/patch";
import { parseJaItem } from "../htc/paste";
import { stripMarkers } from "../htc/paste-parse";
import { bridgeMods } from "../htc/bridge";
import { boostedBy, catalystTagFromLabel, rawValue } from "../htc/quality";
import type { PatchData } from "../../vendor/poe2htc/engine/types";

let data: PatchData | null = null;
onHtcPatchLoaded((d) => { data ??= d; });
/** 計算機のデータを読んでおく (集計は同期なので、取得・キャッシュ表示の前に 1 回) */
export async function prepareDeboost(): Promise<void> {
  data ??= await loadHtcPatch();
}

type Prop = { name?: unknown; values?: unknown };
/** 品質 (%) と種類のタグ。種類が読めなければ null (戻さない) */
function catalystOf(props: unknown): { q: number; tag: string } | null {
  if (!Array.isArray(props)) return null;
  for (const p of props as Prop[]) {
    const name = typeof p.name === "string" ? stripMarkers(p.name) : "";
    if (!name.includes("Quality")) continue;
    const v = Array.isArray(p.values) && Array.isArray(p.values[0]) ? String(p.values[0][0] ?? "") : "";
    const q = Number(v.replace(/[^\d.]/g, ""));
    const tag = catalystTagFromLabel(name);
    return q > 0 && tag ? { q, tag } : null;
  }
  return null;
}

/** 数値を 1 桁で丸める (素の値は小数になる。一覧の平均と段の判定に使う) */
const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * 1 つのレアの MOD の文面 → 素の値に戻した文面 (同じ並び)。戻す物が無ければそのまま返す。
 * 文面は poe.ninja の形 (注記 `[Cold]` 付き) のまま数値だけ置き換える (集計の鍵 = 注記付きのテンプレートを変えない)
 */
export function deboostMods(baseType: string | undefined, props: unknown, mods: readonly string[], d: PatchData | null = data): string[] {
  const cat = catalystOf(props);
  if (!d || !cat || !baseType || !mods.length) return [...mods];
  const NL = String.fromCharCode(10);
  // 解析は注記を外した文面で (注記付きだと型に当たらない)
  const bare = mods.map((m) => stripMarkers(m));
  const p = parseJaItem(["Rarity: Rare", "x", baseType, "--------", ...bare].join(NL));
  if (!p.lines.length) return [...mods];
  const bridged = bridgeMods(d, baseType, p.lines.map((l) => l.template), "exclude").mods;
  // 繋がらなかった物は先頭に `+` を付けて引き直す (辞書とエンジンで `+` の置き場が違う。paste-targets.ts と同じ)
  const retry = p.lines.map((l, i) => (!bridged[i]?.mod && l.template.startsWith("#") ? i : -1)).filter((i) => i >= 0);
  if (retry.length) {
    const again = bridgeMods(d, baseType, retry.map((i) => "+" + p.lines[i]!.template), "exclude").mods;
    retry.forEach((i, k) => {
      if (again[k]?.mod) bridged[i] = again[k]!;
    });
  }
  const boosted = new Set<string>();
  p.lines.forEach((l, i) => {
    const mod = bridged[i]?.mod;
    if (mod && boostedBy(mod, cat.tag)) boosted.add(l.text);
  });
  return mods.map((m, i) => (boosted.has(bare[i]!) ? m.replace(/\d+(?:\.\d+)?/g, (n) => String(round1(rawValue(Number(n), cat.q)))) : m));
}
