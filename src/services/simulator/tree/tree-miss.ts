/**
 * tree-miss.ts — 外れの式 1 本 (G-1 の S-2、11-07)。外れ = 当たりに数える札 (呼ぶ側が渡す: ☑ の完成形の狙い・☑ の置き石・その箱の当たりの札) の
 * どれにも当たらない MOD。当たりはエンジンの aimHits の sameText (段は札の段以上・同じ系統で文も同じ別の modId も当たり・エッセンスの MOD は別物、未発現は当たらない)。
 * modId の一致では見ない (前は箱の体・止まりの文・手の窓の札などが modId だけで見て、同じ文の別 modId を狙いと外れの両方に数えた)。
 * 外れは枠として 1 種類 (11-07 深夜オーナー「ハズレMODは全部ハズレMODだよ。枠として」): 何の MOD でも・どこから付いても同じ。完成形に無いエッセンスの MOD も
 * 付いた時から外れ (札だけは MOD の文のまま = tree-row-tags の missTag)。✦ (フラクチャー) を外れの数に入れるかは呼ぶ側 (体では ✦ は別の欄)
 */
import { aimHits, type AimHitOpts, type AimTarget, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { flag } from "../../../web/release-flags";
import type { Aim, TreeDoc } from "./tree-model";
import { placedAims } from "./tree-veil";
import { looseTierOf } from "./tree-frac-dual";
import { aimTargetOf } from "./tree-ele-any";
import { essEleAsNormal, essEleOn } from "./tree-ess-ele";

/** 外れの式の相手 = 当たりに数える札を段の番号にした物 (1 回作って MOD ごとに使う) */
export interface MissAims { readonly targets: readonly AimTarget[]; readonly opts: AimHitOpts }
/** 当たりに数える札 (段の名前の T) から。✦ の印の狙いの 2 つ持ちは 2 つのうち下の段 (S-10g、looseTierOf) */
export const missAims = (data: PatchData, aims: readonly Aim[]): MissAims =>
  ({ targets: aims.map((a) => aimTargetOf(data, a, looseTierOf(a))), opts: { data, sameText: true } });
/**
 * ☑ (aimed、完成形の狙いと置き石の modId) で当たりに数える札。aimed が無い時は完成形の狙い全部 (置き石は入れない)。
 * stones = false で ☑ の置き石も入れない (前の世代の形の鍵の体。置き石を数えていなかった)
 */
export function aimedMiss(data: PatchData, doc: TreeDoc, aimed?: ReadonlySet<string> | null, o: { stones?: boolean } = {}): MissAims {
  return missAims(data, aimedList(data, doc, aimed, o));
}
/** aimedMiss の札の並び (削減の手前の枠 S-65c の比べの相手 = 残したい MOD も同じ札で見る) */
export function aimedList(data: PatchData, doc: TreeDoc, aimed?: ReadonlySet<string> | null, o: { stones?: boolean } = {}): Aim[] {
  const goals = doc.memoAims ?? [];
  if (!aimed) return [...goals];
  return [...goals, ...(o.stones === false ? [] : placedAims(data, doc))].filter((a) => aimed.has(a.modId));
}
/** MOD が札 t に当たるか (エッセンスの火・冷気・雷耐性は値で一般の段に読み替えても見る = S-10h ⑨、スイッチ essEleHit) */
const hitsOne = (m: StageMod, t: AimTarget, x: MissAims): boolean => {
  if (aimHits(m, t, x.opts)) return true;
  const n = essEleOn() ? essEleAsNormal(x.opts.data, m) : null;
  return !!n && aimHits(n, t, x.opts);
};
/**
 * 「いずれか」の結び (S-10h2 ①、スイッチ eleBind): 品 item の中で「いずれか」の札は 1 本ずつ、品に先に付いた元素耐性 (並びの前の方) から当たりを取る
 * (段の厳しい本から順に、まだ取られていない一番前の当たる MOD)。取られなかった元素耐性は「いずれか」の当たりにならない = ほかの札に当たらなければ外れ。
 * エンジンの当たり (aimHits) は MOD 1 つずつで火・冷気・雷のどれにも何本でも当たるので、どの MOD を当たりにするかだけを木の側で決める
 */
const bindMemo = new WeakMap<StageItem, WeakMap<MissAims, ReadonlyMap<StageMod, AimTarget>>>();
/** 品 item の中で「いずれか」の札が取った MOD → 取った札 (S-10h2 ①)。カードの札 (tree-row-tags) が行の名前に使う */
export function eleClaimOf(item: StageItem, x: MissAims): ReadonlyMap<StageMod, AimTarget> {
  let byX = bindMemo.get(item);
  const hit = byX?.get(x);
  if (hit) return hit;
  const any = x.targets.filter((t) => t.anyEle).sort((a, b) => a.anyEle! - b.anyEle!), all = [...item.prefixes, ...item.suffixes], out = new Map<StageMod, AimTarget>();
  // 発現した冒涜の MOD は隠れた枠の場所に入る (並びの位置が付いた順にならない) ので、取る順の後ろに回す (レビュワー 2 の R2-a: 骨 → 高貴で火を狙う → 発現で冷気、の冷気が先に取っていた)
  const mods = [...all.filter((m) => !m.desecrated), ...all.filter((m) => m.desecrated)];
  const seen = new Set<number>(); // 同じ番号の札が 2 つ並んでも (完成形と置き石の重なりなど) 取るのは 1 本
  for (const t of any) { if (seen.has(t.anyEle!)) continue; seen.add(t.anyEle!); const m = mods.find((y) => !out.has(y) && !y.unrevealed && hitsOne(y, t, x)); if (m) out.set(m, t); }
  if (!byX) { byX = new WeakMap(); bindMemo.set(item, byX); }
  byX.set(x, out);
  return out;
}
export const eleBindOn = (): boolean => flag("eleBind");
/**
 * 外れ = 当たりに数える札のどれにも当たらない MOD。item (m の付いている品) を渡すと「いずれか」の札は結び (eleClaimOf) で見る (スイッチ eleBind)。
 * 渡さなければ前のまま (「いずれか」は段に届く元素耐性なら何本でも当たり)
 */
export const isMissMod = (m: StageMod, x: MissAims, item?: StageItem | null): boolean => {
  if (item && eleBindOn() && x.targets.some((t) => t.anyEle)) {
    if (x.targets.some((t) => !t.anyEle && hitsOne(m, t, x))) return false;
    return !eleClaimOf(item, x).has(m);
  }
  return !x.targets.some((t) => hitsOne(m, t, x));
};
