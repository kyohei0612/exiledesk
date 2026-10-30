/**
 * tut-route.ts — シミュのチュートリアル「不在のアミュレット (フラクチャー済み) から作る」の道 (2026-10-26 夜オーナー「案内に従ってやってもらって完成まで導く」)。
 * 完成形は見本「不在のアミュレット B」と同じ (✦ T1 全てのスペルスキルのレベル +3・T1 スピリット・T1 キャストスピード・ルーンの合金)。
 * 道は設計図 tutorial.md T-21 (PC、14 段) / T-26 (スマホ) の表 (10-31 朝のオーナーの決め Q1〜Q4)。外れ・消えた の箱は全部自動の ↩ (S-50・S-28e)、人が戻り先を選ぶ所は無い:
 *   0 完成形 (✦ スペル +3・品質は狙わない) → 1 始め方 (フラクチャー済みから)
 *   2 スタート: 高貴 + 左側の高貴のお告げ ☑ スピリット → s1 (スピリット) / x1 (外れ)
 *   3 x1: ルーンの合金 → r   4 r: 高貴 + 左側 ☑ スピリット → rs / rj
 *   5 rj: 消去 (残したい MOD ☑ ルーンの合金) → 外れが消えた ↩ r・狙いが消えた ↩ x1 (自動)
 *   6 rs: 高貴 ☑ キャストスピード → d / dj   7 d: 完成   8 帯の「次へ」
 *   9 dj: 消去 + 右側の消去のお告げ → ↩ rs   10 s1: 高貴 + 左側 (狙い無し) → s1a   11 s1a: ルーンの合金 → 統合 rs・狙いが消えた ↩ rj (S-27d)
 *   12 テスト ✓   13 100 人 → 終わる
 * ここは道の形と箱の見分けだけ。打つ・確率・当たりの判定はツリー (エンジン) の今の作りのまま
 */
import type { Aim, TreeBox, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { newTree } from "../../../services/simulator/tree/tree-model";

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
export const SIN_EXALT = "OmenofSinistralExaltation";
export const DEX_ANNUL = "OmenofDextralAnnulment";

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
export type Role = "start" | "s1" | "s1a" | "x1" | "r" | "rs" | "rj" | "d" | "dj";
export function rolesOf(d: TreeDoc): Partial<Record<Role, string>> {
  const kids = (id: string | undefined): TreeBox[] => (id ? (d.boxes[id]?.outs ?? []).map((k) => d.boxes[k]!).filter(Boolean) : []);
  const hitOf = (id: string | undefined, modId: string): string | undefined => kids(id).find((b) => b.out === "hit" && b.aim?.modId === modId)?.id;
  const junkOf = (id: string | undefined): string | undefined => kids(id).find((b) => b.out === "junk")?.id;
  const r: Partial<Record<Role, string>> = { start: "start" };
  r.s1 = hitOf("start", SPIRIT);
  // 狙い無しの手の結果は「打った後」1 箱 (S-23)
  r.s1a = kids(r.s1).find((b) => b.out === "any")?.id;
  r.x1 = junkOf("start");
  r.r = hitOf(r.x1, WARD);
  r.rs = hitOf(r.r, SPIRIT);
  r.rj = junkOf(r.r);
  r.d = hitOf(r.rs, CAST);
  r.dj = junkOf(r.rs);
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
  "start-exalt": (n) => [`${n.item(SIN_EXALT)}でプレに 1 つ足す。☑ した${n.mod(SPIRIT)}が付けば当たりの箱、ほかは外れの箱。お告げで側が決まるので外れは 1 つ`, `${n.item(SIN_EXALT)} adds one prefix. The checked ${n.mod(SPIRIT)} goes to a hit box, anything else to a miss box. The omen fixes the side, so there is one miss box`],
  "miss-ward": (n) => [`外れの箱から。消せる MOD はさっき付いたプレの外れ 1 つだけなので、それが消えて必ず${n.mod(WARD)}が付く (結果は当たり 1 箱)`, `Start with the miss box. The only removable mod is the miss prefix just added, so it is always replaced by ${n.mod(WARD)} (one hit box)`],
  "ward-exalt": (n) => [`さっきと同じ形の手。残りのプレ 1 つで${n.mod(SPIRIT)}を狙う`, `The same craft as before. Aim for ${n.mod(SPIRIT)} in the last prefix slot`],
  "miss-annul": (n) => [`${n.item("annul")}は消える MOD を選べないので、残したい MOD に${n.mod(WARD)}を ☑。外れが消えた人は 3 段目、${n.mod(WARD)}が消えた人 (狙いが消えた) は 2 段目へ自動で戻る (↩ n 段目へ戻る の札)`, `${n.item("annul")} can't pick what it removes, so check ${n.mod(WARD)} as a mod to keep. Runs that lose the miss go back to step 3, runs that lose ${n.mod(WARD)} (target lost) go back to step 2 by themselves (the ↩ back to step n tag)`],
  "spirit-exalt": (n) => [`プレは埋まったので、お告げ無しでもサフィにしか付かない。${n.mod(CAST)}を ☑ して打つ`, `The prefixes are full, so it can only land on a suffix even without an omen. Check ${n.mod(CAST)} and use it`],
  done: () => ["狙いが全部揃った。この箱を完成にする (完成は人が押した箱だけ)", "All targets are in. Mark this box as done (only boxes you mark are done)"],
  unset: () => ["まだ決めていない箱には「!」が付く。上の帯の「次へ」で 1 つずつ寄れる", "Boxes not decided yet have a \"!\". The bar's \"Next\" takes you to them one by one"],
  "cast-annul": (n) => [`サフィの外れだけ消したいので${n.item(DEX_ANNUL)}を掛ける。消えるのは必ず外れなので結果は 1 箱、4 段目へ自動で戻る`, `Only the suffix miss should go, so apply ${n.item(DEX_ANNUL)}. It always removes the miss, so there is one box that goes back to step 4 by itself`],
  "spirit-free": (n) => [`スタートで${n.mod(SPIRIT)}が付いた人は、残りのプレを狙い無しで埋める (☑ 無し = 結果は「打った後」1 箱)`, `Runs that got ${n.mod(SPIRIT)} at the start fill the last prefix with no target (no ☑ = one "after" box)`],
  "free-ward": (n) => [`${n.item(WARD_KEY)}で外れを消して${n.mod(WARD)}を付ける。当たりは 4 段目と同じ中身なので統合、${n.mod(SPIRIT)}が消えた人 (狙いが消えた) は 4 段目の外れへ自動で進む。これで「!」が 0`, `${n.item(WARD_KEY)} replaces the miss with ${n.mod(WARD)}. The hit has the same mods as step 4 so it merges, and runs that lose ${n.mod(SPIRIT)} (target lost) go on to the step-4 miss by themselves. Now there are no "!" left`],
  test: () => ["足りない所が 0 になると、テストで ✓ 合格が出る", "With nothing missing, the test run shows ✓ Passed"],
  run: () => ["100 人回すと、結果のまとめで完成の割合と費用が見られる。値段を入れ直すと費用も変わる", "Run it 100 times; the summary shows the finish rate and the cost. Change the prices to update the cost"],
};
