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
import { catalystPriceKey } from "../../services/htc/catalysing";
import { catalystsFor } from "../../services/htc/quality";
import type { SimNode, SimState } from "../../services/htc/sim-route";
import type { Side } from "../../services/htc/step-odds";
import type { Prices } from "../../vendor/poe2htc/optimizer/cost";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { PatchData } from "../../vendor/poe2htc/engine/types";

export interface AutoTreeInput {
  data: PatchData;
  prices: Prices;
  targets: readonly TierTarget[];
  /** 固定済みで始める狙い (作らない) */
  fixedIds: readonly string[];
  /** 貼り付けの品質の種類のタグ (「品質 (マナモッド)」→ mana)。無ければ品質の手は入れない */
  qualityTag: string | null;
  /**
   * 貼り付けの品質 (%) とベースの品質の上限 (普通 20、ブリーチの指輪 40)。品質が上限を超えていれば、ブリーチの MOD を
   * 付けて品質を上げ、後で消している (オーナー 2026-09-24:「品質 MOD かまして消してるね」。死体の円環は 40% なのに
   * ブリーチの MOD の行が無い)。その時もブリーチを道具として使う
   */
  qualityPct?: number | null;
  baseQuality?: number;
  /** 触媒の高貴のお告げに使ってよい値段の上限 (神)。これより高いカタリストは使わない */
  catalystMaxDivine?: number;
  /**
   * 側の無いカオスを使ってよいか (触らない MOD が無い = 樹 MOD は固定済みか、そもそも無い)。
   * よければ、一番出にくい普通の狙いを最初にカオスで狙う (手で組んだ死体の円環の見本と同じ。高貴で狙うより桁違いに安い)
   */
  chaosOk?: boolean;
  /** 付きやすさ (その側に 1 回付けて出る確率)。カオスで狙う物を選ぶのに使う */
  chance?: (t: TierTarget) => number | null;
  /**
   * 触らない MOD (固定していない樹 MOD など) がある側。ここは消去を使わず、狙いを冒涜 + 光のお告げのリロールで作る
   * (光は冒涜の外れだけ消す)。オーナー:「片方が 2 以下の場合は冒涜でリロールできる」。2026-09-24 忍者の上位の指輪で、
   * 樹 MOD と同じ側を 高貴 + 側の消去 で作って樹 MOD を 24〜26% 消していた
   */
  protectedSides?: readonly Side[];
  /**
   * 抹消のお告げ付きのカオス (消すのをこの側だけに) を使ってよい側。触らない MOD の側が満杯なら、足される MOD も
   * この側にしか付かないので安全 ([[chaosSideFor]])。金の指輪: サフィが樹 MOD 3 つで満杯 → プレをカオスで回せる
   */
  chaosSide?: Side | null;
}

/** 抹消のお告げ付きのカオスを使える側: 触らない MOD がある側が全部満杯で、残りが 1 側だけの時 */
export function chaosSideFor(start: SimState, limits: { prefix: number; suffix: number }): Side | null {
  const keepSides = new Set(start.slots.filter((x) => x.keep).map((x) => x.side));
  if (!keepSides.size) return null;
  const count = (sd: Side): number => start.slots.filter((x) => x.side === sd).length;
  const full = [...keepSides].every((sd) => count(sd) >= limits[sd]);
  const rest = (["prefix", "suffix"] as Side[]).filter((sd) => !keepSides.has(sd));
  return full && rest.length === 1 ? rest[0]! : null;
}

const BREACH_FAMILY = "LocalMaximumQuality";

export function autoTree(inp: AutoTreeInput): SimNode[] {
  const { data: d, prices: p } = inp;
  const fixed = new Set(inp.fixedIds);
  const ts = inp.targets.filter((t) => !fixed.has(t.modId) && d.mods.has(t.modId));
  const mod = (id: string) => d.mods.get(id)!;
  const sideOf = (id: string): Side => (mod(id).type === "prefix" ? "prefix" : "suffix");
  const breach = ts.some((t) => mod(t.modId).family === BREACH_FAMILY)
    || (inp.qualityPct != null && inp.qualityPct > (inp.baseQuality ?? 20));
  const essences = ts.filter((t) => CRAFTED_SOURCES.has(mod(t.modId).source) && mod(t.modId).family !== BREACH_FAMILY);
  const guarded = new Set(inp.protectedSides ?? []);
  const normal = (side: Side) => guarded.has(side) ? []
    : ts.filter((t) => mod(t.modId).source === "normal" && sideOf(t.modId) === side && t.modId !== spamId && t.modId !== toDesecrate?.modId);
  /** 冒涜 + 光で作る狙い (冒涜のみの MOD と、触らない MOD がある側の普通の狙い) */
  const viaDesecrate = (t: TierTarget): boolean =>
    mod(t.modId).source === "desecrated" || (mod(t.modId).source === "normal" && guarded.has(sideOf(t.modId)));
  /**
   * 冒涜で作る狙い。冒涜のみの MOD と、触らない MOD がある側の普通の狙いに加え、それが無ければ**一番出にくい普通の狙いを
   * 1 つ冒涜に回す** (冒涜は 3 択から選べるので高貴 1 回より当たりやすい)。オーナー 2026-09-24:「基本 2 つまでは確定で
   * MOD 付ける場合が多い。クラフト MOD 1、冒涜 1 のパターンがほとんど」
   */
  const extraDesecrate = (): TierTarget | null => {
    if (ts.some((t) => viaDesecrate(t))) return null;
    const cands = ts.filter((t) => mod(t.modId).source === "normal" && (inp.chance?.(t) ?? 1) > 0);
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
  const switchTypes = breach && !!inp.qualityTag && (["prefix", "suffix"] as Side[]).some((sd) => {
    // 実際に高貴で狙う物だけで見る (冒涜に回す物は除く。金の指輪で回避を数えて「替える」と判定し、使わないブリーチを
    // 残し続けて消えるたびに付け直していた)
    const l = ts.filter((t) => mod(t.modId).source === "normal" && sideOf(t.modId) === sd && !guarded.has(sd) && t.modId !== toDesecrate?.modId);
    return l.length > 0 && !qualityTagBoosts(l) && freeCatalyst(l) != null;
  });
  const lockTag = breach && inp.qualityTag && !switchTypes ? inp.qualityTag : null;
  /** その側の狙いに使うカタリスト */
  function catalystFor(list: readonly TierTarget[]): string | null {
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
  const plainAnnul = (inp.protectedSides ?? []).length === 0 && ts.filter((t) => mod(t.modId).source === "normal").length <= 4;
  const annulFor = (side: Side): string => {
    const aid = plainAnnul ? "x-any" : `x-${side}`;
    if (!extra.some((x) => x.id === aid)) extra.push({ ...base, id: aid, action: { kind: "annul", side: plainAnnul ? null : side }, targets: [], need: 1, onHit: "auto", onMiss: "auto" });
    return aid;
  };

  // カオスで一番出にくい普通の狙いを先に (○ 次へ、× もう一度)
  // 付く確率が 0 (このベース・ilvl では出ない段) の物は狙えないので除く (選ぶと永久にスパムする)。
  // エッセンス・ブリーチを使う側の物も除く (パーフェクトエッセンスはその側の MOD を必ず 1 つ消すので、カオスで付けた物を
  // 食ってしまう。死体の円環で最大マナをカオスで付け、マナ % のエッセンスに食われて回り続けた)
  const eatSides = new Set<Side>([...essences.map((t) => sideOf(t.modId)), ...(breach ? ["prefix" as Side] : [])]);
  const pool = ts.filter((t) => mod(t.modId).source === "normal" && (inp.chance?.(t) ?? 1) > 0 && !eatSides.has(sideOf(t.modId))
    && t.modId !== toDesecrate?.modId);
  // カオスで付けた物が後の消去で消えると、カオスからやり直して他の狙いを壊す。残りの普通の狙いが多いと割に合わない
  // (2026-09-24 実測、段は問わず: 死体の円環 残り 3 つ カオスあり 744 神 / なし 3,680 神、プリズム 残り 5 つ あり 6.5 万神・
  // 完成 70% / なし 1.5 万神・100%)。残りが 3 つ以下の時だけカオスで始める
  const normalCount = ts.filter((t) => mod(t.modId).source === "normal" && t.modId !== toDesecrate?.modId).length;
  // カオスで狙うのは、カタリスト (触媒の高貴のお告げ) が効かない物を優先。効く物は後で品質を入れて高貴で狙う方が安い
  // (死体の円環: 見本はキャスピをカオス、全耐性・知性はカタリスト。自動が全耐性をカオスで狙って 2,130 回打っていた)
  const boostable = (t: TierTarget): boolean => catalystFor([t]) != null;
  const spamPool = pool.some((t) => !boostable(t)) ? pool.filter((t) => !boostable(t)) : pool;
  // 抹消のお告げで側を決めたカオスなら、その側の狙いだけ
  const spamPool2 = inp.chaosSide ? spamPool.filter((t) => sideOf(t.modId) === inp.chaosSide) : spamPool;
  const spam = (inp.chaosOk || !!inp.chaosSide) && spamPool2.length && normalCount - 1 <= 3
    ? [...spamPool2].sort((a, b) => (inp.chance?.(a) ?? 1) - (inp.chance?.(b) ?? 1))[0]! : null;
  if (spam) {
    spamId = spam.modId;
    const sid = id();
    main.push({ ...base, id: sid, action: { kind: "chaos", tier: "chaos", side: inp.chaosOk ? null : inp.chaosSide ?? null }, targets: [{ modId: spam.modId, minTier: spam.minTierIndex ?? 0 }], need: 1, onHit: null, onMiss: sid });
  }
  // ブリーチは最初に付けて品質を上げる道具。上げた後は消えても品質は残るので、残す対象にしない (外れと同じ扱い。消去で
  // 50% で消える)。オーナー 2026-09-24:「40% 上げて触媒の高貴のお告げで狙って、外れたら左側消去で 50%、それを付くまで」
  // 「品質 20% を必須 MOD として最後まで残しておくなんてことはない」
  // 種類を替えるやり方の時は、最後に貼り付けの種類で上限 (ブリーチ込み) まで入れるので、それまでブリーチの MOD を残す
  const keepBreach: string[] = switchTypes ? ["__breach__"] : [];
  // ブリーチの手自体は常に「ブリーチの MOD があること」を条件にする (無いと最初から揃っている扱いで飛ばされ、1 回も打って
  // いなかった。2026-09-24 金の指輪)。品質を上限まで入れた後は、エンジンが外れと同じに扱う (breachSpent)
  if (breach) main.push({ ...base, id: id(), action: { kind: "breach" }, targets: [], keep: ["__breach__"], need: 1, onHit: null, onMiss: null });
  if (lockTag) main.push({ ...base, id: id(), action: { kind: "quality", catalyst: lockTag }, targets: [], need: 1, onHit: null, onMiss: null });
  // エッセンス。種類を替えるやり方の時は、最後の品質の後で削減がブリーチを消して付けた 1 つを食わせる (見本と同じ) ので後回し
  const essenceNodes: SimNode[] = essences.map((t) => ({
    ...base, id: id(), action: { kind: "essence", modId: t.modId }, targets: [{ modId: t.modId, minTier: 0 }], keep: switchTypes ? [] : keepBreach, need: 1, onHit: null, onMiss: null,
  }));
  if (!switchTypes) main.push(...essenceNodes);
  // 普通の狙いは多い側から (枠が詰まる前に付けたい物を先に)
  const sides = (["prefix", "suffix"] as Side[]).filter((s) => normal(s).length).sort((a, b) => normal(b).length - normal(a).length);
  /** 今入っている品質の種類 (自動で組む中で、最後に入れたカタリスト) */
  let qualityNow: string | null = lockTag;
  for (const side of sides) {
    // 同じ側の狙いを、効くカタリストごとに分けて順に狙う (見本: 全耐性は耐性用、知性は適応用。まとめて 1 つのカタリストで
    // 狙うと、効かない方の外れが増えて消去とブリーチの付け直しが膨らんだ。2026-09-24 死体の円環)
    const groups = new Map<string | null, TierTarget[]>();
    for (const t of normal(side)) {
      const k = catalystFor([t]);
      groups.set(k, [...(groups.get(k) ?? []), t]);
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
      for (let k = 1; k <= list.length; k++) {
        main.push({
          ...base, id: id(),
          action: { kind: "exalt", tier: exaltTier(list), side, catalyst: cat },
          targets: list.map((t) => ({ modId: t.modId, minTier: t.minTierIndex ?? 0 })),
          // ブリーチの MOD を残す条件は、ブリーチと品質の手だけに付ける (高貴の手にも付けると、ブリーチが消えた時に揃った手を
          // 飛ばせず、満杯の側に高貴を打とうとして止まった。消えれば自動でブリーチの手へ戻る)
          keep: [], need: k, onHit: null, onMiss: annulId,
        });
      }
    }
  }
  const desecrateNodes: SimNode[] = [];
  for (const t of desecrated) {
    const side = sideOf(t.modId);
    const lightId = `l-${t.modId}`;
    const node: SimNode = {
      // 古代の鎖骨は段 40 以上だけ。届かなければ普通の鎖骨
      ...base, id: id(), action: { kind: "desecrate", side, bone: reach([t]) >= 40 ? "desecrate_ancient" : "desecrate", echoes: false },
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
    main.push({ ...base, id: id(), action: { kind: "whittle" }, targets: [], need: 1, onHit: null, onMiss: null, onlyWithBreach: true });
    main.push(...essenceNodes, ...desecrateNodes);
  } else {
    main.push(...desecrateNodes);
    if (finalQuality) main.push(finalQuality);
  }

  // 本線をつなぐ (○ は次の手、最後は完成)
  main.forEach((x, i) => { x.onHit = main[i + 1]?.id ?? "done"; });
  return [...main, ...extra];
}
