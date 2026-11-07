/**
 * お告げの層 (E-3、2026-11-07 ジン jin-base。洗い出し base-audit-1107 の G-1)。
 *
 * お告げは単体では動かず、掛かる手 (カレンシー) の動きを変える物 (オーナー 11-07「お告げは全て共有でいい」)。正は各 spec の OmenSpec で、
 * どの手に掛かるか (appliesTo)・効き目 (effect)・一緒に効かない組 (exclusive)・上書き (supersedes)・効かない状態 (idleWhen) をデータで持つ。
 * 「今効くお告げ」(omensOfKind)・掛け替え (toggleOmen)・側・勢力のタグはここから引く。打つ処理 (planSpec)・棚 (omensFor)・お告げの一言 (omenNoteOf)・
 * 確率の表・数え上げが同じ物を見る。前は光 × 左右の消去・紋章 × ネクロマンシー・腐食をお告げの名前で 2〜3 か所に書いていた
 */
import { liveAbyssMarkOf } from "../stage-core";
import type { StageItem, StageSide } from "../types";
import type { OmenSpec } from "./types";
import { OMEN_SPECS } from "./desecrate-specs";
import { ORB_OMEN_SPECS } from "./orb-specs";
import { ESSENCE_OMEN_SPECS } from "./essence-specs";

/** 全部のお告げ (冒涜まわり + オーブ + エッセンス)。並びは一緒に効かない組が両方掛かった時に先に効く方 */
export const ALL_OMEN_SPECS: readonly OmenSpec[] = [...OMEN_SPECS, ...ORB_OMEN_SPECS, ...ESSENCE_OMEN_SPECS];
const BY_KEY: ReadonlyMap<string, OmenSpec> = new Map(ALL_OMEN_SPECS.map((o) => [o.key, o]));
export const omenSpecOf = (key: string): OmenSpec | undefined => BY_KEY.get(key);

/** お告げの側: 付ける側 (左右の高貴・ネクロマンシー) / 消す側 (左右の消去・抹消・結晶化)。側の無いお告げは {} */
export function omenSideOf(key: string): { add?: StageSide; remove?: StageSide } {
  const e = BY_KEY.get(key)?.effect;
  if (!e) return {};
  if ("side" in e) return { add: e.side };
  if ("removeSide" in e) return { remove: e.removeSide };
  return {};
}
/** 手の種類 (CurrencySpec.kind) とその側のお告げ (左右の高貴・抹消・消去・結晶化・ネクロマンシー)。無ければ null */
export function omenFor(kind: string, side: StageSide): string | null {
  return ALL_OMEN_SPECS.find((o) => o.appliesTo === kind && (("side" in o.effect && o.effect.side === side) || ("removeSide" in o.effect && o.effect.removeSide === side)))?.key ?? null;
}
/** 付く MOD の重みしか変えないお告げか (触媒の高貴 = 付きうる範囲は変えない、E-32) */
export const omenWeightOnly = (key: string): boolean => { const e = BY_KEY.get(key)?.effect; return !!e && "catalysing" in e; };
/** 付きうる範囲 (どの MOD が付きうるか) を変えるお告げだけ (重みだけのお告げを抜く。品質の無い見本で範囲を聞く時など) */
export const reachOmens = (omens: readonly string[]): string[] => omens.filter((o) => !omenWeightOnly(o));
/** 勢力のお告げ → 発現で保証する勢力の MOD のタグ (E-66) */
export const FACTION_TAG: Readonly<Record<string, string>> = Object.fromEntries(ALL_OMEN_SPECS.flatMap((o) => ("guaranteeTag" in o.effect ? [[o.key, o.effect.guaranteeTag]] : [])));

/** 同じ組 (exclusive) のお告げと、その組を上書きするお告げ (光)。画面で掛けると前の方を外す組 */
export const OMEN_EXCLUSIVE: readonly (readonly string[])[] = (() => { // E-27 お告げは外さない・反対のお告げは掛け替え
  const groups = [...new Set(ALL_OMEN_SPECS.flatMap((o) => (o.exclusive ? [o.exclusive] : [])))];
  return groups.map((g) => [...ALL_OMEN_SPECS.filter((o) => o.exclusive === g), ...ALL_OMEN_SPECS.filter((o) => o.supersedes === g)].map((o) => o.key));
})();
/** そのお告げを掛けると外れるお告げ (自分は入らない) */
export const omenRivals = (key: string): string[] => [...new Set(OMEN_EXCLUSIVE.filter((g) => g.includes(key)).flat())].filter((k) => k !== key);
/** お告げを掛ける / 外す (エミュの棚・シミュの棚が同じ物を呼ぶ)。掛かっていれば外す、掛ける時は同じ組の前の方を外して最後に足す */
export function toggleOmen(held: readonly string[], key: string): string[] {
  if (held.includes(key)) return held.filter((o) => o !== key);
  const rivals = new Set(omenRivals(key));
  return [...held.filter((o) => !rivals.has(o)), key];
}

/**
 * その手の種類に掛かって、エンジンが食う (効いて減る) お告げ (持っている中から、持っている順)。決まりはどれも OmenSpec のデータ:
 *   appliesTo が手の種類と同じ物だけ / idleWhen の状態の品では効かない (紋章がある骨のネクロマンシー、E-67。item が無ければ見ない) /
 *   alone (腐食) があればそれだけ / supersedes (光) があればその組 (左右の消去) は効かない /
 *   同じ exclusive の組が幾つも掛かっていれば ALL_OMEN_SPECS の先の 1 つだけ (左 > 右、ウラマン > アマナム > クルガル。E-27)
 */
export function omensOfKind(kind: string, held: readonly string[], item?: StageItem): OmenSpec[] {
  const mark = !!item && !!liveAbyssMarkOf(item);
  let used = held.flatMap((k) => { const o = BY_KEY.get(k); return o && o.appliesTo === kind ? [o] : []; });
  used = used.filter((o) => !(o.idleWhen === "abyssMark" && mark));
  const alone = used.find((o) => o.alone);
  if (alone) return [alone];
  const over = new Set(used.flatMap((o) => (o.supersedes ? [o.supersedes] : [])));
  used = used.filter((o) => !o.exclusive || !over.has(o.exclusive));
  const winner = new Map<string, OmenSpec>();
  for (const o of ALL_OMEN_SPECS) if (o.exclusive && used.includes(o) && !winner.has(o.exclusive)) winner.set(o.exclusive, o);
  return used.filter((o) => !o.exclusive || winner.get(o.exclusive) === o);
}
