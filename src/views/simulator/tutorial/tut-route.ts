/**
 * tut-route.ts — シミュのチュートリアル「不在のアミュレット (フラクチャー済み) から作る」の道 (2026-10-26 夜オーナー「案内に従ってやってもらって完成まで導く」)。
 * 完成形は見本「不在のアミュレット B」と同じ (✦ T1 全てのスペルスキルのレベル +3・T1 スピリット・T1 キャストスピード・ルーンの合金)。
 * 道は設計図 tutorial.md T-21 (PC、13 段)。ハズレ整理の流れ (S-190) の順 = 当たりの道 → 完成 → ハズレ整理 → 光る外れを決める → 最終チェック → 100 人
 * (11-03 オーナー「今の道だけ先に直す」。前の道は灰色の外れの箱 x1 から組ませて 4 段目で進めなかった)。外れを消して戻すのは自動の ↩ (S-50・S-28e):
 *   0 完成形 (✦ スペル +3・品質は狙わない) → 1 始め方 (フラクチャー済みから)
 *   2 スタート: 高貴 + 左側の高貴のお告げ ☑ スピリット → s1 (スピリット) / x1 (外れ、灰色)
 *   3 s1: 高貴 + 左側 (狙い無し) → s1a   4 s1a: ルーンの合金 → w (当たり) / wl (スピリットが消えた、灰色)
 *   5 w: 高貴 ☑ キャストスピード → d / dj (外れ、灰色)   6 d: 完成   7 ハズレ整理 (x1・dj・wl が光る)
 *   8 x1: 消去 → ↩ スタート   9 wl: 失敗   10 dj: 消去 + 右側の消去のお告げ → ↩ w (光った箱は帯の「次へ」が寄る順)
 *   11 最終チェック ✓   12 100 人 → 終わる
 * ここは道の形と箱の見分けだけ。打つ・確率・当たりの判定はツリー (エンジン) の今の作りのまま
 */
import type { Aim, TreeBox, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { newTree } from "../../../services/simulator/tree/tree-model";
import { omenFor } from "../../../services/craft-stage/engine";

export const TUT_BASE = "Absent Amulet";
export const TUT_ILVL = 75;
export const SPELL = "Amulets/GlobalIncreaseSpellSkillGemLevel";
export const TUT_GOALS: Aim[] = [
  { modId: SPELL, tier: 1, fractured: true },
  { modId: "Amulets/BaseSpirit", tier: 1 },
  { modId: "Amulets/IncreasedCastSpeed", tier: 1 },
  { modId: "Amulets/PerfectEssence_RunicWardPercent", tier: 1 },
];
export const SPIRIT = "Amulets/BaseSpirit", CAST = "Amulets/IncreasedCastSpeed", WARD = "Amulets/PerfectEssence_RunicWardPercent";
/** ルーンの合金 (棚の名前はエンジンの名前で出す) */
export const WARD_KEY = "essence:perfect:Amulets/PerfectEssence_RunicWardPercent";
/** 左側の高貴・右側の消去のお告げ (名前はエンジンのお告げの層の omenFor、E-27) */
export const SIN_EXALT = omenFor("exalt", "prefix")!;
export const DEX_ANNUL = omenFor("annul", "suffix")!;

/**
 * チュートリアルの木の始め: 完成形の 4 つは入れておき、✦ の印・品質の決め・始め方は空 (手順 0・1 で人が決める、Q3 A)。
 * 箱はスタートだけ (始め方の窓で決めるとスタートが ✦ だけのレアになる)
 */
export function tutorialDoc(): TreeDoc {
  return { ...newTree(TUT_BASE, TUT_ILVL), baseChosen: true, memoAims: TUT_GOALS.map(({ fractured: _f, ...a }) => ({ ...a })) };
}
/** 今の木がチュートリアルの木か (ベースと完成形の MOD が同じ。✦ の印は手順 0 で付けるので見ない) */
export function isTutorialDoc(d: TreeDoc): boolean {
  const key = (a: Aim): string => `${a.modId}|${a.tier}`;
  const want = TUT_GOALS.map(key).sort().join(","), have = (d.memoAims ?? []).map(key).sort().join(",");
  return d.base === TUT_BASE && want === have;
}

/** 道の箱 (役の名前 → 箱の id)。箱の id は組んだ順で変わるので、親と結果の種類と当たりの MOD で探す */
export type Role = "start" | "s1" | "s1a" | "x1" | "w" | "wl" | "d" | "dj";
export function rolesOf(d: TreeDoc): Partial<Record<Role, string>> {
  const kids = (id: string | undefined): TreeBox[] => (id ? (d.boxes[id]?.outs ?? []).map((k) => d.boxes[k]!).filter(Boolean) : []);
  const hitOf = (id: string | undefined, modId: string): string | undefined => kids(id).find((b) => b.out === "hit" && b.aim?.modId === modId)?.id;
  const outOf = (id: string | undefined, out: TreeBox["out"]): string | undefined => kids(id).find((b) => b.out === out)?.id;
  const r: Partial<Record<Role, string>> = { start: "start" };
  r.s1 = hitOf("start", SPIRIT);
  r.x1 = outOf("start", "junk");
  // 狙い無しの手の結果は「打った後」1 箱 (S-23)
  r.s1a = outOf(r.s1, "any");
  r.w = hitOf(r.s1a, WARD);
  // ルーンの合金がスピリットを消した = 狙いが消えた (S-27d)
  r.wl = outOf(r.s1a, "lost");
  r.d = hitOf(r.w, CAST);
  r.dj = outOf(r.w, "junk");
  return r;
}

/** 案内の文に入れる名前 (カレンシー・お告げはエンジンの棚の名前、MOD は狙いの短い名前。言葉は画面の言語のまま、推測で訳さない) */
export type TutNames = { item: (key: string) => string; mod: (modId: string) => string };
type Why = (n: TutNames) => [string, string];
/**
 * 下書きの文 (手順の id → なぜ)。オーナーが dev で文を打つまでの仮 (src/data/sim-tutorial.json の texts が空の時だけ出す)。
 * 手順の並び・種類は JSON、ここは文だけ。中身は tutorial.md T-21 の「何を教える」「結果と自動のつながり」の列
 */
export const DRAFT_WHY: Record<string, Why> = {
  goal: (n) => [`完成形は 4 つ入れてある。${n.mod(SPELL)}はフラクチャー済みのベースを買う前提なので ✦ (固定してよい印) を付ける。アミュレットは品質がカタリストの品質なので、狙うかを必ず決める`, `The four final mods are already in. ${n.mod(SPELL)} comes on a fractured base, so mark it ✦ (may be fixed). Amulet quality is catalyst quality, so you must decide whether to aim for it`],
  start: () => ["✦ が 1 つなので「フラクチャー済みから」始められる。スタートは ✦ の MOD だけのレアになる", "With one ✦ you can start from a fractured item. The start is a rare with only the ✦ mod"],
  "start-exalt": (n) => [`${n.item(SIN_EXALT)}でプレに 1 つ足す。☑ した${n.mod(SPIRIT)}が付けば当たりの箱、ほかは外れの箱。外れの箱は灰色で、当たりの道を組み終えるまで触らない`, `${n.item(SIN_EXALT)} adds one prefix. The checked ${n.mod(SPIRIT)} goes to a hit box, anything else to a miss box. Miss boxes stay grey until the hit route is built`],
  "spirit-free": (n) => [`${n.mod(SPIRIT)}が付いた人は、残りのプレを狙い無しで埋める (☑ 無し = 結果は「打った後」1 箱)`, `Runs that got ${n.mod(SPIRIT)} fill the last prefix with no target (no ☑ = one "after" box)`],
  "free-ward": (n) => [`${n.item(WARD_KEY)}は MOD を 1 つ消して${n.mod(WARD)}を付ける。さっき埋めた外れが消えれば当たり、${n.mod(SPIRIT)}が消えた人は「狙いが消えた」の灰色の箱へ`, `${n.item(WARD_KEY)} removes one mod and adds ${n.mod(WARD)}. If the filler goes it's a hit; runs that lose ${n.mod(SPIRIT)} go to the grey "target lost" box`],
  "ward-cast": (n) => [`プレは埋まったので、お告げ無しでもサフィにしか付かない。${n.mod(CAST)}を ☑ して打つ`, `The prefixes are full, so it can only land on a suffix even without an omen. Check ${n.mod(CAST)} and use it`],
  done: () => ["狙いが全部揃った。この箱を完成にする (完成は人が押した箱だけ)", "All targets are in. Mark this box as done (only boxes you mark are done)"],
  tidy: () => ["当たりの道ができたら「ハズレ整理」。同じ中身の箱へ自動でつなぎ、決める要る外れの箱だけが光る", "Once the hit route is built, press \"Sort misses\". It links boxes with the same mods by itself and lights only the misses you still need to decide"],
  "miss-annul": (n) => [`${n.item("annul")}で外れを消す。✦ は消えないので、消えるのは外れ (プレ) だけ。スタートと同じ中身になり、自動でスタートへ戻る (↩ の札)`, `Use ${n.item("annul")} to remove the miss. The ✦ mod can't be removed, so only the miss prefix goes. It matches the start and goes back there by itself (the ↩ tag)`],
  "cast-annul": (n) => [`サフィの外れだけ消したいので${n.item(DEX_ANNUL)}を掛ける。消えるのは必ず外れなので結果は 1 箱、${n.mod(CAST)}を狙う箱へ自動で戻る`, `Only the suffix miss should go, so apply ${n.item(DEX_ANNUL)}. It always removes the miss, so there is one box that goes back to the ${n.mod(CAST)} step by itself`],
  "lost-fail": (n) => [`${n.mod(SPIRIT)}が消えた人は作り直すより諦める。箱の「失敗」を押す (失敗に数える)`, `Runs that lost ${n.mod(SPIRIT)} aren't worth fixing here. Click "Fail" on the box (counted as failed)`],
  test: () => ["光る箱が 0 になったら「最終チェック」。✓ 合格が出るまで「100 人回す」は押せない", "With no lit boxes left, press \"Final check\". \"Run 100\" stays locked until it shows ✓ Passed"],
  run: () => ["100 人回すと、結果のまとめで完成の割合と費用が見られる。値段を入れ直すと費用も変わる", "Run it 100 times; the summary shows the finish rate and the cost. Change the prices to update the cost"],
};
