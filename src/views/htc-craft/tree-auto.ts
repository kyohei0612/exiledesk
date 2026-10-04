/**
 * tree-auto.ts — 貼った MOD から作り方のツリーを自動で組む (見本、2026-09-24)
 *
 * オーナー:「そだね、作っていいよ色んなパターン」。指輪ごとに手で書かず、どの貼り付けにも効く組み方にする。
 * 基本は**側を選べる手だけ** (側の無いカオスは樹 MOD や触らない MOD を消しうる):
 *   0. カオス (触らない MOD が無い時だけ、chaosOk) … 一番出にくい普通の狙いを先にスパム
 *   1. ブリーチ (品質の最大値 +20% を狙う時) … 左側の結晶化 + ブリーチのエッセンス (確定)。以降の手は「ブリーチの MOD が残って
 *      いる」も○の条件 (消去で消えたら自動でここへ戻る)
 *   2. エッセンスの狙い … その側の結晶化 + パーフェクトエッセンス (確定。外れが無ければ先に付けてから)
 *   3. 普通の狙い … 側ごとに 完全の高貴 + その側の高貴なお告げ (+ 安いカタリストが効くなら触媒の高貴のお告げ)。
 *      1 つずつ「n つ揃って○」を重ね、外れたらその側の消去 (自動で戻る)
 *   4. 冒涜の狙い … その側のネクロマンシー + 古代の鎖骨、外れたら光のお告げでリロール
 *   5. 品質 … 触媒の高貴のお告げを使う側の前に、そのカタリストで品質を上限まで (品質代を数えるため)。最後に貼り付けの品質の種類で
 *      上限まで入れ直す (確定)
 * 固定済みの狙いは作らない。クラフト非推奨 (start-kind の unsafe) の時は組まない。
 */
import { CRAFTED_SOURCES } from "../../vendor/poe2htc/engine/pool";
import { essenceLevelOf } from "../../vendor/poe2htc/optimizer/cost";
import { bossOmenAllowed, desecrationBoneFor, desecrationOmenForMod, type DesecrationBossOmen } from "../../vendor/poe2htc/engine/probability";
import { catalystPriceKey } from "../../services/htc/catalysing";
import { catalystsFor } from "../../services/htc/quality";
import type { SimNode } from "../../services/htc/sim-route";
import type { Side } from "../../services/htc/step-odds";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import { BREACH_FAMILY } from "../../services/htc/omens";
// 入力の型と判定 (chaosSideFor / breachPlanned) は 2026-09-26 に tree-auto-input.ts へ分けた
import { breachPlanned, type AutoTreeInput } from "./tree-auto-input";
export { chaosSideFor, breachPlanned } from "./tree-auto-input";
export type { AutoTreeInput } from "./tree-auto-input";

export function autoTree(inp: AutoTreeInput): SimNode[] {
  return autoTreeMeta(inp).nodes;
}

/**
 * 組んだ手と、組み方の決め事 (やり直しの費用が同じ前提で見積もれるように)。catalystOff = 触媒の高貴のお告げを使わない
 * (ブリーチを先に外す組み方など。2026-09-26: 見積もりは使う前提の 40% で数えていた)
 */
export function autoTreeMeta(inp: AutoTreeInput): { nodes: SimNode[]; catalystOff: boolean } {
  const { data: d, prices: p } = inp;
  const fixed = new Set(inp.fixedIds);
  // 変成 → 普通のエッセンスで最初に付ける狙いは、ほかの手の狙いから外す (2026-10-03、その 2)
  const me = inp.magicEssence ?? null;
  const ts = inp.targets.filter((t) => !fixed.has(t.modId) && d.mods.has(t.modId) && t.modId !== me?.modId);
  const mod = (id: string) => d.mods.get(id)!;
  const sideOf = (id: string): Side => (mod(id).type === "prefix" ? "prefix" : "suffix");
  const breach = breachPlanned(inp);
  const essences = ts.filter((t) => CRAFTED_SOURCES.has(mod(t.modId).source) && mod(t.modId).family !== BREACH_FAMILY);
  /** 買った時から触らない MOD がある側 */
  const shielded = new Set(inp.protectedSides ?? []);
  const narrow = !!inp.limits && inp.limits.prefix <= 2 && inp.limits.suffix <= 2;
  /**
   * 両側とも 2 枠以下 (不在のアミュレット) のカオス: 品質を入れた後、まだ何も付いていないうちに一番出にくい狙いを 1 つだけ
   * スパムする (消えるのは外れか役目の済んだブリーチの MOD だけなので安全)。付いたらその側は触らない側にして、同じ側の
   * もう 1 つは冒涜 + 光で作る (消去で消してカオスへ戻らない)。オーナー 2026-09-24:「先に品質付けてあげておいてから
   * スパムなら安全」「不在は絶対にやり直しのカオススパムには戻らない」
   */
  const narrowSpam: TierTarget | null = (() => {
    if (!narrow || !(inp.chaosOk || inp.chaosSide)) return null;
    if (inp.chaosPick !== undefined) return ts.find((t) => t.modId === inp.chaosPick && mod(t.modId).source === "normal") ?? null;
    const eat = new Set(essences.map((t) => sideOf(t.modId)));
    const list = ts.filter((t) => mod(t.modId).source === "normal" && (inp.chance?.(t) ?? 1) > 0 && !eat.has(sideOf(t.modId))
      && !shielded.has(sideOf(t.modId)) && (!inp.chaosSide || sideOf(t.modId) === inp.chaosSide));
    return list.length ? [...list].sort((a, b) => (inp.chance?.(a) ?? 1) - (inp.chance?.(b) ?? 1))[0]! : null;
  })();
  const guarded = new Set([...shielded, ...(narrowSpam ? [sideOf(narrowSpam.modId)] : [])]);
  // 冒涜が使えない時は、触らない MOD の側の普通の狙いも高貴で作るしかない (側の消去で、触らない MOD が消えうる)
  const normal = (side: Side) => guarded.has(side) && !inp.desecratedTaken ? []
    : ts.filter((t) => mod(t.modId).source === "normal" && sideOf(t.modId) === side && t.modId !== spamId && t.modId !== toDesecrate?.modId);
  /** 冒涜 + 光で作る狙い (冒涜のみの MOD と、触らない MOD がある側の普通の狙い) */
  const viaDesecrate = (t: TierTarget): boolean => !inp.desecratedTaken
    && t.modId !== narrowSpam?.modId
    && (mod(t.modId).source === "desecrated" || (mod(t.modId).source === "normal" && guarded.has(sideOf(t.modId))));
  /**
   * 冒涜で作る狙い。冒涜のみの MOD と、触らない MOD がある側の普通の狙いに加え、それが無ければ**一番出にくい普通の狙いを
   * 1 つ冒涜に回す** (冒涜は 3 択から選べるので高貴 1 回より当たりやすい)。オーナー 2026-09-24:「基本 2 つまでは確定で
   * MOD 付ける場合が多い。クラフト MOD 1、冒涜 1 のパターンがほとんど」
   */
  const extraDesecrate = (): TierTarget | null => {
    if (inp.desecratedTaken || ts.some((t) => viaDesecrate(t))) return null;
    if (inp.desecratePick !== undefined) return ts.find((t) => t.modId === inp.desecratePick && mod(t.modId).source === "normal") ?? null;
    const cands = ts.filter((t) => mod(t.modId).source === "normal" && (inp.chance?.(t) ?? 1) > 0 && t.modId !== narrowSpam?.modId);
    // エッセンス・ブリーチを使う側 (仕上げで枠が空く側) を優先。反対側は高貴やカオスで埋まり、削減で付いた外れで冒涜の枠が
    // 塞がって回り続けた (2026-09-24 段を問わない死体の円環で、全耐性を冒涜に回した時)
    const eat = new Set<Side>([...essences.map((t) => sideOf(t.modId)), ...(breach ? ["prefix" as Side] : [])]);
    const pref = cands.filter((t) => eat.has(sideOf(t.modId)));
    const list = pref.length ? pref : cands;
    return list.length ? [...list].sort((a, b) => (inp.chance?.(a) ?? 1) - (inp.chance?.(b) ?? 1))[0]! : null;
  };
  const toDesecrate = extraDesecrate();
  const desecrated = ts.filter((t) => viaDesecrate(t) || t.modId === toDesecrate?.modId);
  const div = p.currency.divine ?? 1;
  /**
   * 狙いの段が届く一番高い下限。完全の高貴 (段 50 以上) はレベル 50 未満の MOD を出さないので、レアリティのプレ (段は
   * 全部 47 以下) を完全の高貴で狙うと永久に付かなかった (2026-09-24 金の指輪)。その MOD の「狙いの段以上」で
   * 一番高い段の ilvl が、下限以上である必要がある
   */
  const reach = (list: readonly TierTarget[]): number =>
    Math.min(...list.map((t) => Math.max(...mod(t.modId).tiers.filter((_, i) => i >= (t.minTierIndex ?? 0)).map((x) => x.ilvl), 0)));
  const exaltTier = (list: readonly TierTarget[]) => {
    // 見積もりで決めた物があればそれ (組の中で一番弱い物 = 全員に届く)
    const picks = list.map((t) => inp.exaltTiers?.[t.modId]).filter((x): x is NonNullable<typeof x> => !!x);
    if (picks.length === list.length) return picks.includes("exalt") ? "exalt" as const : picks.includes("exalt_greater") ? "exalt_greater" as const : "exalt_perfect" as const;
    const r = reach(list);
    return r >= 50 ? "exalt_perfect" as const : r >= 35 ? "exalt_greater" as const : "exalt" as const;
  };
  const maxCat = (inp.catalystMaxDivine ?? 0.2) * div;
  /**
   * 完成品にブリーチ分の品質 (貼り付けの種類で 40%) が要るか。カタリストの種類を替えると品質は 0 から入れ直しで
   * (オーナー 2026-09-24:「0 からになるよ」)、ブリーチの MOD が消えた後だと上限 20% までしか入らない。
   * なので要る時は、ブリーチ → 貼り付けの種類で 40% を最初に入れ、その種類のまま作る (触媒の高貴のお告げは、その種類が
   * 狙いに効く時だけ)
   */
  /** その側の狙いに一番多く効く、安いカタリスト (種類を問わない。無ければ null) */
  function freeCatalyst(list: readonly TierTarget[]): string | null {
    const count = new Map<string, number>();
    for (const t of list) for (const k of catalystsFor(mod(t.modId))) count.set(k.tag, (count.get(k.tag) ?? 0) + 1);
    const ok = [...count].filter(([tag]) => (p.currency[catalystPriceKey(tag)] ?? Infinity) <= maxCat);
    ok.sort((a, b) => b[1] - a[1] || (p.currency[catalystPriceKey(a[0])] ?? 0) - (p.currency[catalystPriceKey(b[0])] ?? 0));
    return ok[0]?.[0] ?? null;
  }
  const qualityTagBoosts = (list: readonly TierTarget[]): boolean =>
    !!inp.qualityTag && list.some((t) => catalystsFor(mod(t.modId)).some((k) => k.tag === inp.qualityTag));
  /**
   * 種類を替えながら狙うか (手で組んだ死体の円環の見本のやり方): ブリーチの MOD を残したまま、狙いごとに効くカタリストで
   * 品質を入れ直して触媒の高貴のお告げで狙い、最後に貼り付けの種類で上限まで入れる。貼り付けの種類が効かない狙いに、
   * 別のカタリストが安く効く時だけ (死体の円環 本物の段: マナで固定 701 神 / 見本の替えるやり方 438 神)
   */
  const switchTypes0 = breach && !!inp.qualityTag && (["prefix", "suffix"] as Side[]).some((sd) => {
    // 実際に高貴で狙う物だけで見る (冒涜に回す物は除く。金の指輪で回避を数えて「替える」と判定し、使わないブリーチを
    // 残し続けて消えるたびに付け直していた)
    const l = ts.filter((t) => mod(t.modId).source === "normal" && sideOf(t.modId) === sd && !guarded.has(sd) && t.modId !== toDesecrate?.modId);
    return l.length > 0 && !qualityTagBoosts(l) && freeCatalyst(l) != null;
  });
  /**
   * ブリーチの MOD (プレ) が残ると、プレに高貴で足す枠が足りないか。不在のアミュレット (プレ 2 枠) でスピリットが固定済みだと、
   * ブリーチで満杯になり、生命を足す手が打てずに止まっていた (2026-09-24)。その時は品質を入れたらすぐブリーチを外す
   */
  const prefixExalts = ts.filter((t) => mod(t.modId).source === "normal" && sideOf(t.modId) === "prefix" && !shielded.has("prefix") && t.modId !== toDesecrate?.modId).length;
  // 冒涜でプレに足す物も同じ (満杯の側への冒涜は 1 つ置き換わるので、触らない MOD を消しうる)
  const prefixDesec = shielded.has("prefix") ? ts.filter((t) => sideOf(t.modId) === "prefix" && (mod(t.modId).source === "desecrated" || mod(t.modId).source === "normal")).length : 0;
  const breachBlocks = breach && !!inp.limits && !!inp.startCount && prefixExalts + prefixDesec > inp.limits.prefix - inp.startCount.prefix - 1;
  /**
   * 触らない MOD (樹 MOD) がある側に冒涜の狙いがあるなら、品質の種類は替えない (替える組み方は最後に削減でブリーチの MOD を外し、
   * 削減で付いた 1 つがその側を埋めて、満杯の側への冒涜が樹 MOD を置き換える。冒涜を先にしても、削減が異界の MOD (レベル 1、
   * ブリーチの MOD と同じ) を消して同じことになる。2026-09-27 金の指輪の「ミニオンのクールダウン」を変質した鎖骨で取る形で 4 割消えた)
   */
  const shieldedDesec = ts.some((t) => viaDesecrate(t) && shielded.has(sideOf(t.modId)));
  const switchTypes = switchTypes0 && !breachBlocks && !shieldedDesec;
  const lockTag = breach && inp.qualityTag && !switchTypes ? inp.qualityTag : null;
  /** その側の狙いに使うカタリスト */
  /**
   * 触媒の高貴のお告げは品質を全部使う。ブリーチの MOD を外した後だと入れ直しは 20% までしか戻らない (上限 +20 はブリーチの
   * MOD がある間だけ) ので、ブリーチを先に外す組み方では触媒を使わない (2026-09-25: 不在で触媒の後に品質が 0 になり、
   * ブリーチを入れ直す手がプレの狙いを食っていた)
   */
  let catalystOff = false;
  function catalystFor(list: readonly TierTarget[]): string | null {
    if (catalystOff) return null;
    if (lockTag) return qualityTagBoosts(list) ? lockTag : null;
    return freeCatalyst(list);
  }

  const base = { clean: false, maxMods: null, keep: [] as string[] };
  let spamId: string | null = null;
  const main: SimNode[] = [];
  const extra: SimNode[] = [];
  let n = 0;
  const id = (): string => `a${++n}`;
  /**
   * その側の消去の手 (無ければ作る。自動で戻る)。触らない MOD が無い時はお告げ無しの素の消去 (固定済みは消えないので安全)。
   * 側のお告げは 1 回 10 神前後するので、素の消去 (1 神未満) で反対側の物を時々消す方がずっと安い。2026-09-24 死体の円環
   * (本物の段): 右側の消去のお告げ 65 回で 667 神 / 手で組んだ見本は素の消去 28 回で 20 神 (オーナー:「消去は全て普通の消去」)
   */
  // ただし普通の狙いが 5 つ以上だと、素の消去が反対側の狙いを消して揃わない (プリズム 6 つ、本物の段: 素の消去は 6 万手で
  // 完成 56% / 側のお告げ付きは 100%・平均 18,157 神)。多い時は側の消去にする
  // 両側とも 2 枠以下 (不在のアミュレット) は側の消去 (その側の外れは 1 つしか無いので確定で外れだけ消える)
  const noShield = (inp.protectedSides ?? []).length === 0;
  const plainDefault = !narrow && noShield && ts.filter((t) => mod(t.modId).source === "normal").length <= 4;
  /** その側の外れを素の消去で消すか (触らない MOD があれば素の消去は使わない) */
  const plainFor = (side: Side): boolean => {
    if (!noShield) return false;
    const a = inp.annul;
    if (a == null) return plainDefault;
    if (typeof a === "string") return a === "plain";
    return (a[side] ?? (plainDefault ? "plain" : "side")) === "plain";
  };
  const annulFor = (side: Side): string => {
    const plain = plainFor(side);
    const aid = plain ? "x-any" : `x-${side}`;
    if (!extra.some((x) => x.id === aid)) extra.push({ ...base, id: aid, action: { kind: "annul", side: plain ? null : side }, targets: [], need: 1, onHit: "auto", onMiss: "auto" });
    return aid;
  };

  // カオスで一番出にくい普通の狙いを先に (○ 次へ、× もう一度)
  // 付く確率が 0 (このベース・ilvl では出ない段) の物は狙えないので除く (選ぶと永久にスパムする)。
  // エッセンス・ブリーチを使う側の物も除く (パーフェクトエッセンスはその側の MOD を必ず 1 つ消すので、カオスで付けた物を
  // 食ってしまう。死体の円環で最大マナをカオスで付け、マナ % のエッセンスに食われて回り続けた)
  // カオスはブリーチより前 (カオスはブリーチの MOD も消すので、後に置くと消しては付け直しの輪になる。2026-09-25 金の指輪で
  // カオス 1 万回)。ブリーチの結晶化は、カオスで付けた物の反対側を食わせる。両側 2 枠以下 (不在) だけは、側が埋まる前に
  // ブリーチを入れないと 40% に出来ないので、ブリーチ → 品質 → 外す → カオス の順
  // カオスがプレで反対側 (サフィ) に触らない MOD がある時も、結晶化で食わせる先が無いので前の順 (ブリーチ → カオス) のまま
  // (金の指輪: サフィが樹 MOD で満杯、プレを抹消のお告げ付きカオスで回す形)
  const chaosAfterQuality = narrow && breach && !!inp.qualityTag && !switchTypes;
  // ブリーチ (プレ) を入れる時にサフィが触らない MOD で埋まっていると、結晶化で食わせる先がプレしか無く、カオスで付けた
  // プレの物を食う。その形ではプレはカオスで狙わない (金の指輪: 高貴で作って 1,467 神)
  const eatSides = new Set<Side>([...essences.map((t) => sideOf(t.modId)), ...(breach && shielded.has("suffix") ? ["prefix" as Side] : [])]);
  const pool = ts.filter((t) => mod(t.modId).source === "normal" && (inp.chance?.(t) ?? 1) > 0 && !eatSides.has(sideOf(t.modId))
    && t.modId !== toDesecrate?.modId);
  // 2026-09-24 は「残りの普通の狙いが 3 つ以下の時だけカオス」だったが (プリズム 残り 5 つでカオスあり 6.5 万神・完成 70%)、
  // 素の消去の巻き込みや外れの処理を直した後は残り 5 つでも 998 神・100% になったので、縛りは外した (2026-09-25)
  // カオスで狙うのは、カタリスト (触媒の高貴のお告げ) が効かない物を優先。効く物は後で品質を入れて高貴で狙う方が安い
  // (死体の円環: 見本はキャスピをカオス、全耐性・知性はカタリスト。自動が全耐性をカオスで狙って 2,130 回打っていた)
  const boostable = (t: TierTarget): boolean => catalystFor([t]) != null;
  const spamPool = pool.some((t) => !boostable(t)) ? pool.filter((t) => !boostable(t)) : pool;
  // 抹消のお告げで側を決めたカオスなら、その側の狙いだけ
  const spamPool2 = inp.chaosSide ? spamPool.filter((t) => sideOf(t.modId) === inp.chaosSide) : spamPool;
  // 両側とも 2 枠以下 (不在のアミュレット) は最初の 1 つだけ ([[narrowSpam]])
  // フラクチャーの後の 1 発目はカオススパム (オーナー 2026-09-25、確率実験場: 守る物が無い間は素のカオスが最安)。
  // どれを引くかは見積もり (chaosPick) が決める。指定が無い時は一番出にくい物
  const spam = narrow ? narrowSpam
    : inp.chaosPick !== undefined ? spamPool2.find((t) => t.modId === inp.chaosPick) ?? null
    : (inp.chaosOk || !!inp.chaosSide) && spamPool2.length
      ? [...spamPool2].sort((a, b) => (inp.chance?.(a) ?? 1) - (inp.chance?.(b) ?? 1))[0]! : null;
  let spamNode: SimNode | null = null;
  if (spam) {
    spamId = spam.modId;
    const sid = id();
    spamNode = { ...base, id: sid, action: { kind: "chaos", tier: "chaos", side: inp.chaosOk ? null : inp.chaosSide ?? null }, targets: [{ modId: spam.modId, minTier: spam.minTierIndex ?? 0 }], need: 1, onHit: null, onMiss: sid };
    if (!chaosAfterQuality) main.push(spamNode);
  }
  // ブリーチは最初に付けて品質を上げる道具。上げた後は消えても品質は残るので、残す対象にしない (外れと同じ扱い。消去で
  // 50% で消える)。オーナー 2026-09-24:「40% 上げて触媒の高貴のお告げで狙って、外れたら左側消去で 50%、それを付くまで」
  // 「品質 20% を必須 MOD として最後まで残しておくなんてことはない」
  // 種類を替えるやり方の時は、最後に貼り付けの種類で上限 (ブリーチ込み) まで入れるので、それまでブリーチの MOD を残す
  const keepBreach: string[] = switchTypes ? ["__breach__"] : [];
  // ブリーチの手自体は常に「ブリーチの MOD があること」を条件にする (無いと最初から揃っている扱いで飛ばされ、1 回も打って
  // いなかった。2026-09-24 金の指輪)。品質を上限まで入れた後は、エンジンが外れと同じに扱う (breachSpent)
  // 結晶化で消す側は、触らない MOD の無い側 (プレのスピリットを買った時のまま残していると、左側の結晶化で消していた。2026-09-24)
  const breachEat: Side | undefined = !shielded.has("suffix") && (shielded.has("prefix") || (spam && !chaosAfterQuality && sideOf(spam.modId) === "prefix")) ? "suffix" : undefined;
  if (breach) main.push({ ...base, id: id(), action: { kind: "breach", ...(breachEat ? { removeSide: breachEat } : {}) }, targets: [], keep: ["__breach__"], need: 1, onHit: null, onMiss: null });
  if (lockTag) main.push({ ...base, id: id(), action: { kind: "quality", catalyst: lockTag }, targets: [], need: 1, onHit: null, onMiss: null });
  // 不在のカオスは、ブリーチの MOD を外してから (スパム中に消えるのを待つと、付いた狙いの側を後で消去することになる)
  const narrowFirst = !!spamNode && narrow && chaosAfterQuality;
  if (spamNode && chaosAfterQuality && !narrowFirst) main.push(spamNode);
  // エッセンス。種類を替えるやり方の時は、最後の品質の後で削減がブリーチを消して付けた 1 つを食わせる (見本と同じ) ので後回し
  // 結晶化は「外れのある側」: エッセンスの側に空きがあって反対側に外れがあれば、その外れを食わせる (オーナー 2026-09-24)
  const essenceNodes: SimNode[] = essences.map((t) => ({
    ...base, id: id(), action: { kind: "essence", modId: t.modId, removeSide: "auto" }, targets: [{ modId: t.modId, minTier: 0 }], keep: switchTypes ? [] : keepBreach, need: 1, onHit: null, onMiss: null,
  }));
  // クラフト MOD は 1 つまで: ブリーチの MOD が残っているとエッセンスは打てない。品質を入れた後なので、削減でブリーチを消して
  // 代わりに付いた 1 つをエッセンスに食わせる (見本と同じ)
  // プレに固定していない MOD が無ければ、左側の消去のお告げ付きの消去で消えるのはブリーチの MOD だけ (確定)。
  // オーナー 2026-09-24:「品質も加味してやりなおしはないはず、特にその形ならお告げで」
  // 買った時の外れがプレに 1 つあっても、ブリーチ (左側の結晶化) がそれを食うので同じ
  // 不在のカオスの前は削減 (ブリーチの MOD を外して 1 つ付く。消去で外すとフラクチャーだけになってカオスが打てない)
  // ただし外せる物が 1 つだけ残る形なら消去で外す: カオスはその 1 つを入れ替え続けるので、狙いが付いた時に外れが残らない
  // (削減だと外れが 1 つ増え、狙いと同じ側に外れが残ると、消すにも冒涜で置き換えるにも狙いを巻き込む。2026-09-24 不在の
  // スペル +3: 増えた外れを消せずに高貴と消去を 2,660 回回していた)
  const eatSide: Side = breachEat ?? "prefix";
  const eaten = (inp.startLoose?.[eatSide] ?? 0) > 0 ? 1 : 0;
  const looseAfter = (inp.startLoose?.prefix ?? 9) + (inp.startLoose?.suffix ?? 9) - eaten;
  const prefixLooseAfter = (inp.startLoose?.prefix ?? 9) - (eatSide === "prefix" ? eaten : 0);
  const annulBeforeSpam = narrowFirst && !shielded.has("prefix") && prefixLooseAfter === 0 && looseAfter === 1;
  // プレに高貴の狙いが無く、冒涜の狙いがプレにあるなら外す手は要らない: 満杯のプレへの最初の冒涜が、固定でない唯一の MOD である
  // ブリーチの MOD を置き換える (オーナー 2026-09-25:「20% でもブリーチで 40% まで上げてから冒涜したらええ」)。左側の消去 18 神が浮く
  const desecrateEatsBreach = prefixExalts === 0 && desecrated.some((t) => sideOf(t.modId) === "prefix") && !shielded.has("prefix");
  const annulBreach = (annulBeforeSpam || (breachBlocks && !narrowFirst && !desecrateEatsBreach)) && !essences.some((t) => sideOf(t.modId) === "prefix") && !shielded.has("prefix")
    && (annulBeforeSpam || (inp.startLoose?.prefix ?? 9) <= (breachEat ? 0 : 1));
  // カオスの前なら、ブリーチの MOD と外れのどちらが消えても 1 つ残るので、お告げ無しの素の消去でいい (オーナー 2026-09-24:
  // 「左側消去で MOD 消さなくてもスパムで消えるじゃん」。スパム任せだと外れが 1 つ余って狙いの側に残ることがある)
  if (!switchTypes && breach && annulBreach) { main.push({ ...base, id: id(), action: { kind: "annul", side: annulBeforeSpam ? null : "prefix" }, targets: [], need: 1, onHit: null, onMiss: null, onlyWithBreach: true }); catalystOff = true; }
  // 削減は一番レベルの低い物を消す。ブリーチの MOD (レベル 1) と同じレベルの狙いがあればそれが消えうるので、× は自動 (消えた狙いを取り返しに戻る。2026-09-26 精度上げ)
  else if (!switchTypes && breach && (essenceNodes.length || (breachBlocks && !desecrateEatsBreach) || narrowFirst)) { main.push({ ...base, id: id(), action: { kind: "whittle" }, targets: [], need: 1, onHit: null, onMiss: "auto", onlyWithBreach: true }); catalystOff = true; }
  // プレの冒涜がブリーチの MOD を食う形 (外す手は無いが、以後ブリーチは無い) も同じ
  if (!switchTypes && breach && desecrateEatsBreach) catalystOff = true;
  if (narrowFirst) main.push(spamNode!);
  if (!switchTypes) main.push(...essenceNodes);
  // 普通の狙いは多い側から (枠が詰まる前に付けたい物を先に)
  const sides = (["prefix", "suffix"] as Side[]).filter((s) => normal(s).length).sort((a, b) => normal(b).length - normal(a).length);
  /** 今入っている品質の種類 (自動で組む中で、最後に入れたカタリスト) */
  let qualityNow: string | null = lockTag;
  for (const side of sides) {
    // 同じ側の狙いを、効くカタリストごとに分けて順に狙う (見本: 全耐性は耐性用、知性は適応用。まとめて 1 つのカタリストで
    // 狙うと、効かない方の外れが増えて消去とブリーチの付け直しが膨らんだ。2026-09-24 死体の円環)
    // 組の作り方: 残りの狙いのうち一番多くに効くカタリストで 1 組ずつ取る (耐性 2 つに効くカタリストがあれば 1 組にして、
    // 偉大なる高貴のお告げで 2 つともカタリストを乗せる)。どれにも効かない物は カタリスト無しの組
    const groups = new Map<string | null, TierTarget[]>();
    let rest = normal(side);
    while (rest.length) {
      const k = catalystFor(rest);
      const hit = k ? rest.filter((t) => catalystsFor(mod(t.modId)).some((c) => c.tag === k)) : [];
      if (!k || !hit.length) { groups.set(null, [...(groups.get(null) ?? []), ...rest]); break; }
      groups.set(k, [...(groups.get(k) ?? []), ...hit]);
      rest = rest.filter((t) => !hit.includes(t));
    }
    // 比べる用: カタリストに関係なく同じ側をまとめる
    if ((inp.greater ?? "catalyst") === "all" && groups.size > 1) {
      const all = [...groups.values()].flat();
      groups.clear();
      groups.set(catalystFor(all), all);
    }
    // カタリストが効く組を先に (品質を入れる回数を減らすため、今の品質の種類の組を一番先に)
    const order = [...groups.entries()].sort((a, b) => Number(b[0] === qualityNow) - Number(a[0] === qualityNow) || Number(b[0] != null) - Number(a[0] != null));
    const annulId = annulFor(side);
    for (const [cat, list] of order) {
      // 触媒の高貴のお告げを使う前に、そのカタリストで品質を上限まで (オーナー 2026-09-24:「宝飾品で触媒を使える時は品質 20% 上げて、
      // カタリスト使用後に上級またはパーフェクトで触媒の高貴のお告げを使った方がトータル収支変わる」)。種類を替えると 0 から
      if (cat && cat !== qualityNow) {
        main.push({ ...base, id: id(), action: { kind: "quality", catalyst: cat }, targets: [], keep: keepBreach, need: 1, onHit: null, onMiss: null });
        qualityNow = cat;
      }
      const useGreater = list.length >= 2 && ((inp.greater ?? "catalyst") === "all" || ((inp.greater ?? "catalyst") === "catalyst" && cat != null));
      for (let k = 1; k <= list.length; k++) {
        main.push({
          ...base, id: id(),
          // 1 手目だけ偉大なる高貴 (2 つとも当たれば次の手は揃っていて飛ばす)
          action: { kind: "exalt", tier: exaltTier(list), side, catalyst: cat, ...(useGreater && k === 1 ? { greater: true } : {}) },
          targets: list.map((t) => ({ modId: t.modId, minTier: t.minTierIndex ?? 0 })),
          // ブリーチの MOD を残す条件は、ブリーチと品質の手だけに付ける (高貴の手にも付けると、ブリーチが消えた時に揃った手を
          // 飛ばせず、満杯の側に高貴を打とうとして止まった。消えれば自動でブリーチの手へ戻る)
          keep: [], need: k, onHit: null, onMiss: annulId,
        });
      }
    }
  }
  const desecrateNodes: SimNode[] = [];
  /** 深淵の印の手 → その冒涜の手 */
  const abyssNext = new Map<string, string>();
  /**
   * 冒涜の骨: 異界の MOD は変質した鎖骨でしか付かない (2026-09-27 オーナー「変質した鎖骨 MOD も全部に追加」)。
   * それ以外は、古代の鎖骨は段 40 以上だけ・届かなければ普通の鎖骨
   */
  const boneFor = (t: TierTarget): "desecrate" | "desecrate_ancient" | "desecrate_altered" =>
    mod(t.modId).tags.includes("breach_desecration") ? "desecrate_altered" : inp.bone !== "preserved" && reach([t]) >= 40 ? "desecrate_ancient" : "desecrate";
  /**
   * 勢力のお告げ (2026-10-03、SaVeQ 0.5.5 の動画): 冒涜の MOD (勢力のタグ付き) を武器・装飾品で狙う時は、その勢力のお告げで候補を
   * その勢力の MOD だけにする (不在のアミュの「全スキルの品質」= 黒血、槍の攻撃速度 = リージュ)。防具には効かない。inp.faction === false で使わない
   */
  const factionFor = (t: TierTarget): DesecrationBossOmen | undefined => {
    if (inp.faction === false) return undefined;
    const m = mod(t.modId);
    const b = d.bases.get(t.modId.split("/")[0]!);
    return b && bossOmenAllowed(b.category) && m.source === "desecrated" ? desecrationOmenForMod(m) : undefined;
  };
  /** 冒涜の手 (反響は既定で付ける。inp.echoes === false で付けない = SaVeQ「高い時は使わない」) */
  const desecAction = (t: TierTarget, side: Side): SimNode["action"] => {
    const f = factionFor(t);
    return { kind: "desecrate", side, bone: boneFor(t), echoes: inp.echoes !== false, ...(f ? { faction: f } : {}) };
  };
  /**
   * 枠 2 つの側で 1 つが固定済みなら、光のお告げを使わずに回せる (0.5.5 の冒涜の解説): その側に付くエッセンス / 合金で
   * 上書き → 鎖骨で冒涜 (満杯の側なので、上書きした MOD が冒涜 MOD に置き換わる)。外れならまた上書き。付く側が同じでないと
   * クラフト MOD が残って次のエッセンスが打てないので、その側に付く一番安い物 (オーナー 2026-09-24:「使える場面は使える」)
   */
  const overwriteFor = (side: Side, like: string): string | null => {
    if (inp.reroll === "light") return null;
    if (!inp.limits || inp.limits[side] !== 2 || !(inp.fixedSides ?? []).includes(side)) return null;
    // クラフト MOD は 1 つまで: エッセンスの狙いがある時は上書きできない。ブリーチの MOD が残る組み方でも、プレなら最初の冒涜が
    // (満杯の側の固定でない唯一の MOD として) ブリーチの MOD を置き換えるので回せる。サフィだとブリーチが残ったままで
    // エッセンスが打てない (2026-09-24 オーナーの不在のアミュレット: 「打てない: クラフト MOD は 1 つまで」で止まっていた)
    if ((breach && !main.some((n) => n.onlyWithBreach) && side !== "prefix") || essences.length) return null;
    const cls = like.split("/")[0];
    const cands = [...d.mods.values()].filter((m) => m.id.startsWith(cls + "/") && CRAFTED_SOURCES.has(m.source) && m.type === side
      && m.family !== BREACH_FAMILY && m.family !== "EssenceAbyss" && Number.isFinite(p.currency[`essence:perfect:${m.id}`] ?? Infinity));
    cands.sort((a, b) => (p.currency[`essence:perfect:${a.id}`] ?? Infinity) - (p.currency[`essence:perfect:${b.id}`] ?? Infinity));
    return cands[0]?.id ?? null;
  };
  /**
   * 深淵の印の輪 (2026-10-03、SaVeQ 0.5.5 / poe2fun。inp.reroll === "abyss" の時だけ): 結晶化のお告げ + 深淵のエッセンスで印 → 普通の骨で冒涜
   * (印を置き換え、段の下限 33 = 仮) → 外れはその側のエッセンス / 合金で上書き → また深淵のエッセンス。光のお告げも消去も要らない。
   * 印と上書きの 2 つのクラフト MOD を持つのでアストリッドの創造性が要る (craftedLimit 2)。防具・武器だけ (動画:「指輪・アミュは別の道」)。
   * その側で消えて困る物 (固定でない狙い・触らない MOD・ブリーチ・エッセンスの狙い) があると上書きや印が食うので組まない
   */
  const abyssFor = (t: TierTarget, side: Side): string | null => {
    if (inp.reroll !== "abyss" || (inp.craftedLimit ?? 1) < 2) return null;
    const b = d.bases.get(t.modId.split("/")[0]!);
    if (!b || desecrationBoneFor(b.category) === "collarbone") return null;
    if (essences.length || (breach && !main.some((n) => n.onlyWithBreach)) || shielded.has(side) || (inp.startKeep?.[side] ?? 0) > 0) return null;
    if (ts.some((x) => x.modId !== t.modId && sideOf(x.modId) === side)) return null;
    if (!Number.isFinite(p.currency[`essence:perfect:${b.id}/PerfectEssence_EssenceAbyss`] ?? Infinity)) return null;
    const cands = [...d.mods.values()].filter((m) => m.id.startsWith(b.id + "/") && CRAFTED_SOURCES.has(m.source) && m.type === side
      && m.family !== BREACH_FAMILY && m.family !== "EssenceAbyss" && Number.isFinite(p.currency[`essence:perfect:${m.id}`] ?? Infinity));
    cands.sort((a, c) => (p.currency[`essence:perfect:${a.id}`] ?? Infinity) - (p.currency[`essence:perfect:${c.id}`] ?? Infinity));
    return cands[0]?.id ?? null;
  };
  for (const t of desecrated) {
    const side = sideOf(t.modId);
    const lightId = `l-${t.modId}`;
    const ab = abyssFor(t, side);
    if (ab) {
      const aid = id(), did = `d-${t.modId}`, eid = `o-${t.modId}`;
      desecrateNodes.push({ ...base, id: aid, action: { kind: "abyss", side }, targets: [], keep: [], need: 1, onHit: null, onMiss: null });
      // 冒涜は本線の外 (○は完成へ。本線の次の手につなぐのは印の手)
      extra.push({
        ...base, id: did, action: { ...desecAction(t, side), bone: "desecrate" } as SimNode["action"],
        targets: [{ modId: t.modId, minTier: t.minTierIndex ?? 0 }], keep: [], need: 1, onHit: "auto", onMiss: eid,
      });
      extra.push({ ...base, id: eid, action: { kind: "essence", modId: ab, removeSide: side }, targets: [], need: 1, onHit: aid, onMiss: null });
      abyssNext.set(aid, did);
      continue;
    }
    const ow = overwriteFor(side, t.modId);
    if (ow) {
      const did = id(), eid = `o-${t.modId}`;
      desecrateNodes.push({
        // 古代の鎖骨は段 40 以上だけ。届かなければ普通の鎖骨 (下の光の輪と同じ)
        ...base, id: did, action: desecAction(t, side),
        targets: [{ modId: t.modId, minTier: t.minTierIndex ?? 0 }], keep: [], need: 1, onHit: null, onMiss: eid,
      });
      // 外れの冒涜 MOD (その側で唯一外せる物) を、同じ側のエッセンス / 合金で上書きして、また冒涜へ
      extra.push({ ...base, id: eid, action: { kind: "essence", modId: ow, removeSide: side }, targets: [], need: 1, onHit: did, onMiss: null });
      continue;
    }
    const node: SimNode = {
      // 古代の鎖骨は段 40 以上だけ。届かなければ普通の鎖骨
      // 反響のお告げは必ず (3 択を 1 回引き直せる。オーナー 2026-09-24:「反響は冒涜の際必ず」)
      ...base, id: id(), action: desecAction(t, side),
      targets: [{ modId: t.modId, minTier: t.minTierIndex ?? 0 }], keep: switchTypes ? [] : keepBreach, need: 1, onHit: null, onMiss: lightId,
    };
    desecrateNodes.push(node);
    // 光の後は自動で戻る (冒涜の前に消えた狙いがあれば取り返しに、無ければこの冒涜へ)。光が打てない (冒涜の外れが無い) 時も自動
    // (2026-09-24: 冒涜 → 光 → 冒涜 の輪に固定していて、消去で消えた最大マナを取り返しに戻れず止まっていた)
    extra.push({ ...base, id: lightId, action: { kind: "light" }, targets: [], need: 1, onHit: "auto", onMiss: "auto" });
  }

  // 最後に貼り付けの品質の種類で上限まで (ブリーチで上限が上がった後も、ここで埋める)
  const finalQuality: SimNode | null = inp.qualityTag && inp.qualityTag !== qualityNow
    ? { ...base, id: id(), action: { kind: "quality", catalyst: inp.qualityTag }, targets: [], keep: keepBreach, need: 1, onHit: null, onMiss: null } : null;
  // 仕上げ (冒涜・最後の品質) に入る前の最後の高貴の手は、外れが無いことも○の条件 (外れが残ると冒涜の枠を塞ぐ)
  const lastExalt = [...main].reverse().find((x) => x.action?.kind === "exalt");
  if (lastExalt && desecrateNodes.length) lastExalt.clean = true;
  if (switchTypes) {
    // 見本と同じ仕上げ: 貼り付けの種類で上限 (ブリーチ込み) → 削減 (一番レベルの低いブリーチの MOD を消して 1 つ付く) →
    // エッセンス (付いた 1 つを食わせる) → 冒涜。品質は消えても残る
    if (finalQuality) main.push(finalQuality);
    main.push({ ...base, id: id(), action: { kind: "whittle" }, targets: [], need: 1, onHit: null, onMiss: "auto", onlyWithBreach: true });
    main.push(...essenceNodes, ...desecrateNodes);
  } else {
    main.push(...desecrateNodes);
    if (finalQuality) main.push(finalQuality);
  }

  // 特別な MOD のルーンを後で差す (2026-10-03 その 3): ルーンの MOD を狙う最初の手の直前に「差す」手を入れる。
  // それより前の手はルーンの置き場無しで引く (普通の狙いの分母が小さい)。最初の手から狙うなら入れても同じなので入れない
  if (inp.lateSocket?.length) {
    const rune = new Set(inp.lateSocket);
    const at = main.findIndex((n) => n.targets.some((t) => rune.has(t.modId)) || (n.action?.kind === "magicEssence" && rune.has(n.action.modId)));
    if (at > 0) main.splice(at, 0, { ...base, id: id(), action: { kind: "socket" }, targets: [], keep: [], need: 1, onHit: null, onMiss: null });
  }
  // 本線をつなぐ (○ は次の手、最後は完成)。深淵の印の手は○で冒涜へ、冒涜の○が本線の次へ
  // 白のベースなら最初に 変成 → 普通のエッセンス (その狙いはこれで確定。後の手は残すように keep に入れる)
  if (me) {
    for (const n of [...main, ...extra]) if (n.keep && !n.keep.includes(me.modId)) n.keep = [...n.keep, me.modId];
    main.unshift({ ...base, id: id(), action: { kind: "magicEssence", modId: me.modId, key: me.key }, targets: [{ modId: me.modId, minTier: 0 }], keep: [], need: 1, onHit: null, onMiss: null });
  }
  main.forEach((x, i) => {
    const next = main[i + 1]?.id ?? "done";
    const did = abyssNext.get(x.id);
    if (did) { x.onHit = did; const dn = extra.find((e) => e.id === did); if (dn) dn.onHit = next; } else x.onHit = next;
  });
  // 白のベースから: 変成 → 増強 → (外れなら消去 → 増強 …) → 狙いが 1 つ付いたら王者でレアにして本線へ (2026-10-04)
  if (inp.magicSpam && inp.magicSpam.targets.length) {
    const suf = inp.magicSpam.tier === "plain" ? "" : `_${inp.magicSpam.tier}`;
    const tg = inp.magicSpam.targets.map((t) => ({ modId: t.modId, minTier: t.minTierIndex ?? 0 }));
    const tr: SimNode = { ...base, id: id(), action: { kind: "transmute", tier: `transmute${suf}` as "transmute" }, targets: tg, keep: [], need: 1, onHit: null, onMiss: null };
    const au: SimNode = { ...base, id: id(), action: { kind: "augment", tier: `augment${suf}` as "augment" }, targets: tg, keep: [], need: 1, onHit: null, onMiss: null };
    const an: SimNode = { ...base, id: id(), action: { kind: "annul", side: null }, targets: [], keep: [], need: 1, onHit: null, onMiss: null };
    const rg: SimNode = { ...base, id: id(), action: { kind: "regal", tier: "regal" }, targets: [], keep: [], need: 1, onHit: null, onMiss: null };
    tr.onHit = rg.id; tr.onMiss = au.id;
    // 増強で 2 つになって外れなら消去 (マジックの 2 つから 1 つ)、消したらもう一度増強
    au.onHit = rg.id; au.onMiss = an.id;
    an.onHit = au.id; an.onMiss = au.id;
    rg.onHit = main[0]?.id ?? "done"; rg.onMiss = rg.onHit;
    return { nodes: [tr, au, an, rg, ...main, ...extra], catalystOff };
  }
  return { nodes: [...main, ...extra], catalystOff };
}

/**
 * 変成 → 普通のエッセンス で最初に付けられる狙い (2026-10-03、防具・武器への拡張 その 2)。普通の MOD の狙いのうち、同じ系統のエッセンスの MOD
 * (レッサー / 無印 / グレーター) の段が狙いの段に届く物。届く中で一番安いエッセンス、狙いの中では出にくい物 (chance の小さい物) を先に。
 * 白のベース (開始の MOD が 0) で、ブリーチもエッセンスの狙いも無い時だけ (エッセンスの MOD は 1 つまで)。無ければ null
 */
export function magicEssenceFor(inp: AutoTreeInput, cls: { pools: { essence: { prefixes: readonly string[]; suffixes: readonly string[] } } }, itemLevel: number): { modId: string; key: string } | null {
  const d = inp.data, p = inp.prices;
  const fixed = new Set(inp.fixedIds);
  if ((inp.startCount?.prefix ?? 0) + (inp.startCount?.suffix ?? 0) > 0 || breachPlanned(inp)) return null;
  const ts = inp.targets.filter((t) => !fixed.has(t.modId) && d.mods.has(t.modId));
  if (ts.some((t) => CRAFTED_SOURCES.has(d.mods.get(t.modId)!.source))) return null;
  const ess = [...cls.pools.essence.prefixes, ...cls.pools.essence.suffixes].map((id) => d.mods.get(id)).filter((m): m is NonNullable<typeof m> => !!m && m.source === "essence");
  const found: Array<{ modId: string; key: string; price: number; chance: number }> = [];
  for (const t of ts) {
    const m = d.mods.get(t.modId)!;
    if (m.source !== "normal") continue;
    for (const e of ess.filter((x) => x.family === m.family && x.type === m.type)) {
      for (const tier of e.tiers) {
        if (tier.ilvl > itemLevel) continue;
        // エッセンスの段は普通の MOD の同じ MOD レベルの段に当たる (グレーターの体 = ライフ 85-99 = レベル 46 の段)
        const idx = m.tiers.findIndex((x) => x.ilvl === tier.ilvl);
        if (idx < 0 || idx < (t.minTierIndex ?? 0)) continue;
        const level = essenceLevelOf(String(tier.name ?? ""));
        const key = `essence:${level}:${e.id}`;
        const price = (p.currency[key] ?? Infinity) + (p.currency["transmute"] ?? 0);
        if (Number.isFinite(price)) found.push({ modId: t.modId, key, price, chance: inp.chance?.(t) ?? 1 });
      }
    }
  }
  found.sort((a, b) => a.chance - b.chance || a.price - b.price);
  return found[0] ? { modId: found[0].modId, key: found[0].key } : null;
}
