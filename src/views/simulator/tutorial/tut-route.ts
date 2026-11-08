/**
 * tut-route.ts — シミュのチュートリアル「不在のアミュレット (フラクチャー済み) から作る」の道 (2026-10-26 夜オーナー「案内に従ってやってもらって完成まで導く」)。
 * 道はオーナーが 1451 で組んだ木 (11-08 夜オーナー「これだな。キャスピは冒涜で付ける形でMOD一覧からやり直しで」「おけ　それで進めて」)。設計図 tutorial.md T-21 (PC、18 段):
 *   1〜4 完成形の MOD 一覧から 4 つを「付ける」(✦ スペル +3 = フラクチャー・スピリット = ふつう・キャスト = 冒涜・ルーンの合金 = ふつう)
 *   5 品質は狙わない → 決めた   6 始め方 (フラクチャー済みから)
 *   7 スタート: 高貴 (狙い無し) → p (打った後 プレ) / q (打った後 サフィ)
 *   8 p・9 q: カオス ☑ スピリット → sp (スピリット、q の当たりは sp に統合) / 外れは自動の ↩
 *   10 sp: 骨 + 右手のネクロマンシー + アビスの反響 ☑ キャスト (発現) → c / cj (外れ)
 *   11 c: 高貴 (狙い無し) → f   12 f: ルーンの合金 (残したい MOD = スピリット) → w (当たり) / wl (狙いが消えた)   13 w: 完成
 *   14〜16 未設定の箱 (帯の「次へ」が寄る順): cj = 無限のパーフェクトエッセンス → ce = 骨 (10 と同じ手) / wl = 消去 (続きの消去と ↩ は自動、S-28e)
 *   最終チェック ✓ → 100 人 → 終わる
 * ここは道の形と箱の見分けだけ。打つ・確率・当たりの判定はツリー (エンジン) の今の作りのまま
 */
import type { Aim, TreeBox, TreeDoc } from "../../../services/simulator/tree/tree-model";
import { newTree } from "../../../services/simulator/tree/tree-model";
import { wayOfAim, type AttachWay } from "../tree/tree-attach";
import { OMEN_KEY, omenFor } from "../../../services/craft-stage/engine";

export const TUT_BASE = "Absent Amulet";
export const TUT_ILVL = 75;
export const SPELL = "Amulets/GlobalIncreaseSpellSkillGemLevel";
export const SPIRIT = "Amulets/BaseSpirit", CAST = "Amulets/IncreasedCastSpeed", WARD = "Amulets/PerfectEssence_RunicWardPercent";
/** 完成形の 4 つと付け方 (手順 1〜4 で人が「付ける」で選ぶ) */
export const TUT_GOALS: Array<{ modId: string; tier: number; way: AttachWay }> = [
  { modId: SPELL, tier: 1, way: "fracture" },
  { modId: SPIRIT, tier: 1, way: "normal" },
  { modId: CAST, tier: 1, way: "desecrated" },
  { modId: WARD, tier: 1, way: "normal" },
];
/** ルーンの合金・無限のパーフェクトエッセンス (棚の名前はエンジンの名前で出す) */
export const WARD_KEY = "essence:perfect:Amulets/PerfectEssence_RunicWardPercent";
export const DEX_KEY = "essence:perfect:Amulets/PerfectEssence_PercentageDexterity";
/** 右手のネクロマンシー・アビスの反響のお告げ (名前はエンジンのお告げの層、E-27) */
export const DEX_NECRO = omenFor("desecrate", "suffix")!, ECHO_OMEN = OMEN_KEY.echoes;

/** チュートリアルの木の始め: ベースだけ。完成形の MOD・品質の決め・始め方は空 (手順 1〜6 で人が決める) */
export function tutorialDoc(): TreeDoc {
  return { ...newTree(TUT_BASE, TUT_ILVL), baseChosen: true };
}
/** 今の木がチュートリアルの木か (ベースが同じで、完成形の MOD は 4 つの中だけ。途中で選んでいる間も入る) */
export function isTutorialDoc(d: TreeDoc): boolean {
  const ids = TUT_GOALS.map((g) => g.modId);
  return d.base === TUT_BASE && (d.memoAims ?? []).map((a) => a.modId).every((id) => ids.includes(id));
}
/** その狙いが手順の付け方どおりか */
export const goalMatches = (a: Aim | undefined, g: (typeof TUT_GOALS)[number]): boolean => !!a && a.tier === g.tier && wayOfAim(a) === g.way;

/** 道の箱 (役の名前 → 箱の id)。箱の id は組んだ順で変わるので、親と結果の種類と当たりの MOD・外れの側で探す */
export type Role = "start" | "p" | "q" | "sp" | "c" | "cj" | "f" | "w" | "wl" | "ce";
export function rolesOf(d: TreeDoc): Partial<Record<Role, string>> {
  const kids = (id: string | undefined): TreeBox[] => (id ? (d.boxes[id]?.outs ?? []).map((k) => d.boxes[k]!).filter(Boolean) : []);
  const hitOf = (id: string | undefined, modId: string): string | undefined => kids(id).find((b) => b.out === "hit" && b.aim?.modId === modId)?.id;
  const outOf = (id: string | undefined, out: TreeBox["out"], key?: string): string | undefined => kids(id).find((b) => b.out === out && (!key || (b.junkKey ?? "").startsWith(key)))?.id;
  const r: Partial<Record<Role, string>> = { start: "start" };
  // 狙い無しの高貴の結果は側ごとの「打った後」(外れの側の鍵 s:プレ|サフィ、S-65)
  r.p = outOf("start", "any", "s:1|0");
  r.q = outOf("start", "any", "s:0|1");
  r.sp = hitOf(r.p, SPIRIT);
  r.c = hitOf(r.sp, CAST);
  r.cj = outOf(r.sp, "junk");
  r.f = outOf(r.c, "any");
  r.w = hitOf(r.f, WARD);
  r.wl = outOf(r.f, "lost");
  r.ce = outOf(r.cj, "junk");
  return r;
}

/** 案内の文に入れる名前 (カレンシー・お告げはエンジンの棚の名前、MOD は狙いの短い名前。言葉は画面の言語のまま、推測で訳さない) */
export type TutNames = { item: (key: string) => string; mod: (modId: string) => string };
type Why = (n: TutNames) => [string, string];
/**
 * 下書きの文 (手順の id → なぜ)。オーナーが dev で文を打つまでの仮 (src/data/sim-tutorial.json の texts が空の時だけ出す)。
 * 手順の並び・種類は JSON、ここは文だけ。中身は tutorial.md T-21 の「何を教える」の列
 */
export const DRAFT_WHY: Record<string, Why> = {
  "pick-spell": (n) => [`完成形の MOD を一覧から 1 つずつ選ぶ。${n.mod(SPELL)}はフラクチャー済みのベースを買う前提なので、付け方は「フラクチャー」(✦)`, `Pick the final mods from the list one at a time. ${n.mod(SPELL)} comes on a fractured base, so add it as "Fracture" (✦)`],
  "pick-spirit": (n) => [`${n.mod(SPIRIT)}はカオスで狙う普通の MOD なので「ふつう」`, `${n.mod(SPIRIT)} is a normal mod you aim for with Chaos, so "Normal"`],
  "pick-cast": (n) => [`${n.mod(CAST)}は骨 (冒涜) で発現させて付けるので「冒涜」。冒涜は付け方の覚えで、当たりの数え方は変わらない`, `${n.mod(CAST)} is added by revealing a Bone (desecrate), so "Desecrate". It's only a note of how; hits count the same`],
  "pick-ward": (n) => [`${n.mod(WARD)}は合金で最後に付ける。エッセンス・合金の MOD は「ふつう」で付ける`, `${n.mod(WARD)} comes last from the alloy. Essence and alloy mods are added as "Normal"`],
  goal: () => ["アミュレットの品質はカタリストの品質。今回は狙わないので「品質は狙わない」にして決める", "Amulet quality is catalyst quality. We don't aim for it here, so pick \"No quality\" and confirm"],
  start: () => ["✦ が 1 つなので「フラクチャー済みから」始められる。スタートは ✦ の MOD だけのレアになる", "With one ✦ you can start from a fractured item. The start is a rare with only the ✦ mod"],
  "start-exalt": () => ["✦ だけのレアにはカオスが打てない (消せる MOD が要る) ので、先に狙い無しで 1 つ足す。付いた側ごとに「打った後」の箱が 2 つできる", "Chaos can't hit a rare with only the ✦ mod (it needs a mod to remove), so add one with no target first. You get one \"after\" box per side"],
  "p-chaos": (n) => [`${n.item("chaos")}は MOD を 1 つ消して 1 つ付ける。☑ した${n.mod(SPIRIT)}が付けば当たり。外れは中身の同じ箱へ自動で戻る (↩)`, `${n.item("chaos")} removes one mod and adds one. The checked ${n.mod(SPIRIT)} is a hit. Misses go back to a box with the same mods by themselves (↩)`],
  "q-chaos": (n) => [`サフィ側の箱にも同じ手。${n.mod(SPIRIT)}が付けば前の当たりの箱にまとまり、外れも自動で戻る`, `Same craft on the suffix box. A ${n.mod(SPIRIT)} hit joins the earlier hit box, and misses go back by themselves`],
  "sp-bone": (n) => [`骨で冒涜する。${n.item(DEX_NECRO)}でサフィに、${n.item(ECHO_OMEN)}で発現の候補を 1 回引き直せる。${n.mod(CAST)}を ☑ すると発現で選べた人が当たり`, `Desecrate with a Bone. ${n.item(DEX_NECRO)} puts it on a suffix and ${n.item(ECHO_OMEN)} rerolls the options once. Check ${n.mod(CAST)}: runs that can pick it are hits`],
  "c-exalt": () => ["合金は MOD を 1 つ消して付けるので、消える役の外れを先に狙い無しでプレへ足す", "The alloy removes a mod when it adds, so first add a filler to the prefixes with no target"],
  "f-ward": (n) => [`${n.item(WARD_KEY)}で〆。足した外れが消えれば完成、${n.mod(SPIRIT)}が消えた人は「狙いが消えた」の箱へ (中身が灰色、決めるのは完成の後)`, `Finish with ${n.item(WARD_KEY)}. If the filler goes it's done; runs that lose ${n.mod(SPIRIT)} go to the "target lost" box (grey; decide it after marking done)`],
  done: () => ["狙いが全部揃った。この箱を完成にする (完成は人が押した箱だけ)。この後、上の帯の「未設定」の箱を 1 つずつ決める", "All targets are in. Mark this box done (only boxes you mark are done). Then decide the \"unset\" boxes from the top bar one by one"],
  "cj-dex": (n) => [`${n.mod(CAST)}が付かなかった人。サフィの外れを${n.item(DEX_KEY)}で置き換え、骨を打ち直す下準備にする`, `Runs that missed ${n.mod(CAST)}. Replace the suffix miss with ${n.item(DEX_KEY)} to get ready to desecrate again`],
  "ce-bone": (n) => [`骨をもう一度 (スピリットの箱と同じ手)。${n.mod(CAST)}が付けば前の当たりの箱にまとまり、外れはエッセンスの前の箱へ自動で戻る (輪)`, `Desecrate again (same craft as on the Spirit box). A ${n.mod(CAST)} hit joins the earlier hit box; a miss goes back to the box before the essence (a loop)`],
  "wl-annul": (n) => [`${n.mod(SPIRIT)}が消えた人は${n.item("annul")}で消して作り直す (どれが消えてもよい)。続きの消去は自動で付き、カオスの前の箱と同じ中身になった人はそこへ戻る (↩)`, `Runs that lost ${n.mod(SPIRIT)} start over with ${n.item("annul")} (anything may go). The next annuls are added for you, and runs that match the box before Chaos go back there (↩)`],
  test: () => ["未設定が 0 になったら「最終チェック」。✓ 合格が出るまで「100 人回す」は押せない", "With nothing left unset, press \"Final check\". \"Run 100\" stays locked until it shows ✓ Passed"],
  run: () => ["100 人回すと、結果のまとめで完成の割合と費用が見られる。値段を入れ直すと費用も変わる", "Run it 100 times; the summary shows the finish rate and the cost. Change the prices to update the cost"],
};
