/**
 * tut-route.ts — シミュのチュートリアル「不在のアミュレット (フラクチャー済み) から作る」の道 (2026-10-26 夜オーナー「案内に従ってやってもらって完成まで導く」)。
 * 完成形は前の見本「不在のアミュレット B」と同じ (✦ T1 全てのスペルスキルのレベル +3・T1 スピリット・T1 キャストスピード・ルーンの合金)。
 * 見本 B の道は最後の「パーフェクトエッセンス + 左側の結晶化」が精査で付かない (プレ 2・サフィ 2 で、その時点のプレはスピリットだけ) ので、
 * 外れが全部戻る道に組み直した (ブラック 13 代目に報告済み、猿の口で組んで精査合格・100 人で止まり 0):
 *   ① スタート: 高貴 + 左側の高貴のお告げ (狙いスピリット) → スピリット / 外れ
 *   ② 外れ: ルーンの合金 (消せる MOD はプレの外れ 1 つだけなので必ずそれが消えてルーンワード)
 *   ③ ルーンワード: 高貴 + 左側の高貴のお告げ (狙いスピリット) → スピリット / 外れ
 *   ④ 外れ: 消去 → 外れが消えた (③ へ自動) / 狙いが消えた
 *   ⑤ スピリット: 高貴 (狙いキャストスピード、空きはサフィ 1 つ) → キャストスピード / 外れ
 *   ⑥ 完成にする。残りは自動で付ける: ⑤ の外れ → 消去 + 右側の消去のお告げ、④ の狙いが消えた → ② の箱へ、
 *      ① のスピリット → 高貴 + 左側の高貴のお告げ → ルーンの合金 (結果はエンジンの自動のつなぎで ③ の当たり・外れの箱へ)
 * ③・⑤ (と ①) は「狙う MOD」にチェックが要る: 狙い無しだと結果が 1 箱にまとまり、精査が「当たりの行き先が無い」と出る (10-26 夜、1470 で確かめ)
 * ここは道の形と箱の見分けだけ。打つ・確率・当たりの判定はツリー (エンジン) の今の作りのまま
 */
import type { Aim, TreeBox, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { newTree } from "../../../services/simulator/tree/tree-model";

export const TUT_BASE = "Absent Amulet";
export const TUT_ILVL = 75;
export const TUT_GOALS: Aim[] = [
  { modId: "Amulets/GlobalIncreaseSpellSkillGemLevel", tier: 1, fractured: true },
  { modId: "Amulets/BaseSpirit", tier: 1 },
  { modId: "Amulets/IncreasedCastSpeed", tier: 1 },
  { modId: "Amulets/PerfectEssence_RunicWardPercent", tier: 1 },
];
const SPIRIT = "Amulets/BaseSpirit", CAST = "Amulets/IncreasedCastSpeed", WARD = "Amulets/PerfectEssence_RunicWardPercent";
/** ルーンの合金 (棚の名前はエンジンの名前で出す) */
export const WARD_KEY = "essence:perfect:Amulets/PerfectEssence_RunicWardPercent";
export const SIN_EXALT = "OmenofSinistralExaltation";
export const DEX_ANNUL = "OmenofDextralAnnulment";

/** チュートリアルの木の始め (箱はスタートだけ。スタートは ✦ の MOD 1 つのレア = ツリーの今の作り) */
export function tutorialDoc(): TreeDoc {
  return { ...newTree(TUT_BASE, TUT_ILVL), baseChosen: true, memoAims: TUT_GOALS.map((a) => ({ ...a })) };
}
/** 今の木がチュートリアルの木か (ベースと完成形が同じ) */
export function isTutorialDoc(d: TreeDoc): boolean {
  const key = (a: Aim): string => `${a.modId}|${a.tier}|${a.fractured ? 1 : 0}`;
  const want = TUT_GOALS.map(key).sort().join(","), have = (d.memoAims ?? []).map(key).sort().join(",");
  return d.base === TUT_BASE && want === have;
}

/** 道の箱 (役の名前 → 箱の id)。箱の id は組んだ順で変わるので、親と結果の種類と当たりの MOD で探す */
export type Role = "start" | "s1" | "s1a" | "x1" | "r" | "rs" | "rj" | "rjLost" | "d" | "dj";
export function rolesOf(d: TreeDoc): Partial<Record<Role, string>> {
  const kids = (id: string | undefined): TreeBox[] => (id ? (d.boxes[id]?.outs ?? []).map((k) => d.boxes[k]!).filter(Boolean) : []);
  const hitOf = (id: string | undefined, modId: string): string | undefined => kids(id).find((b) => b.out === "hit" && b.aim?.modId === modId)?.id;
  const missOf = (id: string | undefined): string | undefined => kids(id).find((b) => b.out !== "hit")?.id;
  const r: Partial<Record<Role, string>> = { start: "start" };
  r.s1 = hitOf("start", SPIRIT);
  r.s1a = kids(r.s1)[0]?.id;
  r.x1 = missOf("start");
  r.r = hitOf(r.x1, WARD);
  r.rs = hitOf(r.r, SPIRIT);
  r.rj = missOf(r.r);
  r.rjLost = kids(r.rj).find((b) => b.out === "lost")?.id;
  r.d = hitOf(r.rs, CAST);
  r.dj = missOf(r.rs);
  return r;
}

/** 案内の文に入れる名前 (カレンシー・お告げはエンジンの棚の名前、MOD は狙いの短い名前。言葉は画面の言語のまま、推測で訳さない) */
export type TutNames = { item: (key: string) => string; mod: (modId: string) => string };
type Why = (n: TutNames) => [string, string];
/** 案内の一手。hand = その箱に打つ手、done = 完成の印、auto = 残りを自動で付ける、run = 100 人回す、end = 終わり */
export type TutStep =
  | { kind: "hand"; box: Role; key: string; omens: string[]; /** 窓の「狙う MOD」でチェックする MOD (無ければ狙い無しのまま) */ aim?: string; why: Why }
  | { kind: "done"; box: Role; why: Why }
  | { kind: "auto"; why: Why }
  | { kind: "run"; why: Why }
  | { kind: "end"; why: Why };

export const TUT_STEPS: TutStep[] = [
  { kind: "hand", box: "start", key: "exalt", omens: [SIN_EXALT], aim: SPIRIT, why: (n) => [`スタートは ✦ の MOD だけのレア。${n.item(SIN_EXALT)}でプレに 1 つ足す。チェックした${n.mod(SPIRIT)}が付けば当たりの箱、ほかは外れの箱`, `The start is a rare with only the ✦ mod. ${n.item(SIN_EXALT)} adds one prefix. The checked ${n.mod(SPIRIT)} goes to a hit box, anything else to a miss box`] },
  { kind: "hand", box: "x1", key: WARD_KEY, omens: [], why: (n) => [`外れの箱から。消せる MOD はさっき付いたプレの外れ 1 つだけなので、それが消えて必ず${n.mod(WARD)}が付く`, `Start with the miss box. The only removable mod is the miss prefix just added, so it is always replaced by ${n.mod(WARD)}`] },
  { kind: "hand", box: "r", key: "exalt", omens: [SIN_EXALT], aim: SPIRIT, why: (n) => [`残りのプレ 1 つで${n.mod(SPIRIT)}を狙う。チェックした MOD が当たりの箱、ほかは外れの箱になる`, `Aim for ${n.mod(SPIRIT)} in the last prefix slot. The checked mod gets a hit box, anything else goes to a miss box`] },
  { kind: "hand", box: "rj", key: "annul", omens: [], why: (n) => [`外れたら${n.item("annul")}で外れを消して、もう一度上の手へ (再度挑戦)。外れが消えた人は自動で上の箱へ戻る`, `On a miss, use ${n.item("annul")} to remove it and try the craft above again. Runs that lost the miss go back up by themselves`] },
  { kind: "hand", box: "rs", key: "exalt", omens: [], aim: CAST, why: (n) => [`空きはサフィ 1 つだけなので、お告げ無しで${n.mod(CAST)}を狙う`, `Only one suffix slot is open, so aim for ${n.mod(CAST)} without an omen`] },
  { kind: "done", box: "d", why: () => ["狙いが全部揃った。この箱を完成にする", "All targets are in. Mark this box as done"] },
  { kind: "auto", why: (n) => [`残りも同じ要領で付ける: ${n.mod(CAST)}の外れ → ${n.item("annul")} + ${n.item(DEX_ANNUL)} で上の箱へ戻る。消去で${n.mod(WARD)}が消えた → ${n.item(WARD_KEY)}の手の箱へ戻る。スタートで${n.mod(SPIRIT)}が付いた → ${n.item(SIN_EXALT)}でプレを埋めて${n.item(WARD_KEY)} (結果は同じ形の箱へ自動でつながる)`, `The rest follows the same idea: ${n.mod(CAST)} miss → ${n.item("annul")} + ${n.item(DEX_ANNUL)} back up. ${n.mod(WARD)} lost to the annul → back to the ${n.item(WARD_KEY)} box. ${n.mod(SPIRIT)} at the start → fill the prefix with ${n.item(SIN_EXALT)}, then ${n.item(WARD_KEY)} (the results link to the same-shape boxes by themselves)`] },
  { kind: "run", why: () => ["足りない所が 0 になり、テストで ✓ 合格が出たら 100 人回す", "Once nothing is missing and the test run shows ✓ Passed, run it 100 times"] },
  { kind: "end", why: () => ["結果のまとめで完成の割合と費用が見られる。値段を入れ直すと費用も変わる", "The summary shows the finish rate and the cost. Change the prices to update the cost"] },
];
