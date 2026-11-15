/**
 * tree-ess-ele.ts — エッセンス (上位含む) で付いた火・冷気・雷耐性を、値で一般の耐性の段に読み替えて当たりに数える (S-10h ⑨、スイッチ essEleHit、開発版だけ)。
 * オーナー 11-16「Bで　グレーターはエッセンスの方…実装はしてくれ」: 値が狙いの段の下限以上なら完成形の当たり (「いずれか」・元素を決めた狙いとも)。
 * 木の側だけ (エンジンの aimHits は変えない、ブラック 115 の決め): 当たりを見る前に、エッセンスの耐性の MOD の写しを
 * 「同じ部位・同じ系統の一般の MOD で、段の値の下限が付いた値以下の一番上の段」として足して渡す。品・表示 (名前のまま)・E-11h の数えは元の MOD のまま
 */
import { makeStageMod, type PatchData, type StageMod } from "../../craft-stage/engine";
import { flag } from "../../../web/release-flags";
import { ELE_FAMILIES } from "./tree-ele-any";

export const essEleOn = (): boolean => flag("essEleHit");
const isEss = (src: string | undefined): boolean => src === "essence" || src === "perfect_essence";

type ModOf = NonNullable<ReturnType<PatchData["mods"]["get"]>>;
/** 同じ部位 (head = modId の「/」まで)・同じ系統の一般の MOD (data.mods の並びで最初の物)。当たりを見るたびに MOD を全部探していた (付ける 1 回目が約 50ms、11-15 63) ので data ごとに覚える */
const normalMemo = new WeakMap<PatchData, Map<string, ModOf | null>>();
function normalOf(data: PatchData, head: string, family: string): ModOf | null {
  let memo = normalMemo.get(data);
  if (!memo) { memo = new Map(); normalMemo.set(data, memo); }
  const key = `${head}|${family}`;
  if (memo.has(key)) return memo.get(key)!;
  let normal: ModOf | null = null;
  for (const [id, x] of data.mods) if (id.startsWith(head) && x.source === "normal" && x.family === family) { normal = x; break; }
  memo.set(key, normal);
  return normal;
}

/** エッセンスの火・冷気・雷耐性 1 つ → 値で読み替えた一般の MOD の写し (読み替えられない・対象外なら null) */
export function essEleAsNormal(data: PatchData, m: StageMod): StageMod | null {
  if (m.unrevealed || !ELE_FAMILIES.includes(m.family)) return null;
  const mod = data.mods.get(m.modId);
  if (!mod || !isEss(mod.source)) return null;
  const v = m.values[0];
  if (v == null) return null;
  const normal = normalOf(data, m.modId.slice(0, m.modId.indexOf("/") + 1), m.family);
  if (!normal) return null;
  // 段は下から上へ (添字が大きいほど上)。下限 (ranges[0][0]) が値以下の一番上の段
  let ti = -1;
  normal.tiers.forEach((t, i) => { const lo = t.ranges[0]?.[0]; if (lo != null && lo <= v) ti = i; });
  if (ti < 0) return null;
  const s = makeStageMod(normal, m.side, ti, () => 0);
  return { ...s, values: [...m.values] };
}

/** 当たりを見る MOD の並び: スイッチが入っていれば、エッセンスの耐性の読み替えの写しを後ろに足す (元の MOD はそのまま = 狙いがエッセンスの MOD の時も今どおり当たる) */
export function withEssEle(data: PatchData | undefined, mods: readonly StageMod[]): readonly StageMod[] {
  if (!data || !essEleOn()) return mods;
  const add = mods.flatMap((m) => { const n = essEleAsNormal(data, m); return n ? [n] : []; });
  return add.length ? [...mods, ...add] : mods;
}
