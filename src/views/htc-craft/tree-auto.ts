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
 *   5. 品質 … 触媒の高貴を使う側の前に、そのカタリストで品質を上限まで (品質代を数えるため)。最後に貼り付けの品質の種類で
 *      上限まで入れ直す (確定)
 * 固定済みの狙いは作らない。クラフト非推奨 (start-kind の unsafe) の時は組まない。
 */
import { CRAFTED_SOURCES } from "../../vendor/poe2htc/engine/pool";
import { catalystPriceKey } from "../../services/htc/catalysing";
import { catalystsFor } from "../../services/htc/quality";
import type { SimNode } from "../../services/htc/sim-route";
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
  /** 触媒の高貴のお告げに使ってよい値段の上限 (神)。これより高いカタリストは使わない */
  catalystMaxDivine?: number;
  /**
   * 側の無いカオスを使ってよいか (触らない MOD が無い = 樹 MOD は固定済みか、そもそも無い)。
   * よければ、一番出にくい普通の狙いを最初にカオスで狙う (手で組んだ死体の円環の見本と同じ。高貴で狙うより桁違いに安い)
   */
  chaosOk?: boolean;
  /** 付きやすさ (その側に 1 回付けて出る確率)。カオスで狙う物を選ぶのに使う */
  chance?: (t: TierTarget) => number | null;
}

const BREACH_FAMILY = "LocalMaximumQuality";

export function autoTree(inp: AutoTreeInput): SimNode[] {
  const { data: d, prices: p } = inp;
  const fixed = new Set(inp.fixedIds);
  const ts = inp.targets.filter((t) => !fixed.has(t.modId) && d.mods.has(t.modId));
  const mod = (id: string) => d.mods.get(id)!;
  const sideOf = (id: string): Side => (mod(id).type === "prefix" ? "prefix" : "suffix");
  const breach = ts.some((t) => mod(t.modId).family === BREACH_FAMILY);
  const essences = ts.filter((t) => CRAFTED_SOURCES.has(mod(t.modId).source) && mod(t.modId).family !== BREACH_FAMILY);
  const desecrated = ts.filter((t) => mod(t.modId).source === "desecrated");
  const normal = (side: Side) => ts.filter((t) => mod(t.modId).source === "normal" && sideOf(t.modId) === side && t.modId !== spamId);
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
  /** その側の狙いに一番多く効く、安いカタリスト (無ければ null) */
  function catalystFor(list: readonly TierTarget[]): string | null {
    const count = new Map<string, number>();
    for (const t of list) for (const k of catalystsFor(mod(t.modId))) count.set(k.tag, (count.get(k.tag) ?? 0) + 1);
    const ok = [...count].filter(([tag]) => (p.currency[catalystPriceKey(tag)] ?? Infinity) <= maxCat);
    ok.sort((a, b) => b[1] - a[1] || (p.currency[catalystPriceKey(a[0])] ?? 0) - (p.currency[catalystPriceKey(b[0])] ?? 0));
    return ok[0]?.[0] ?? null;
  }

  const base = { clean: false, maxMods: null, keep: [] as string[] };
  let spamId: string | null = null;
  const main: SimNode[] = [];
  const extra: SimNode[] = [];
  let n = 0;
  const id = (): string => `a${++n}`;

  // カオスで一番出にくい普通の狙いを先に (○ 次へ、× もう一度)
  // 付く確率が 0 (このベース・ilvl では出ない段) の物は狙えないので除く (選ぶと永久にスパムする)。
  // エッセンス・ブリーチを使う側の物も除く (パーフェクトエッセンスはその側の MOD を必ず 1 つ消すので、カオスで付けた物を
  // 食ってしまう。死体の円環で最大マナをカオスで付け、マナ % のエッセンスに食われて回り続けた)
  const eatSides = new Set<Side>([...essences.map((t) => sideOf(t.modId)), ...(breach ? ["prefix" as Side] : [])]);
  const pool = ts.filter((t) => mod(t.modId).source === "normal" && (inp.chance?.(t) ?? 1) > 0 && !eatSides.has(sideOf(t.modId)));
  // カオスで付けた物が後の消去で消えると、カオスからやり直して他の狙いを壊す。残りの普通の狙いが多いと割に合わない
  // (2026-09-24 実測、段は問わず: 死体の円環 残り 3 つ カオスあり 744 神 / なし 3,680 神、プリズム 残り 5 つ あり 6.5 万神・
  // 完成 70% / なし 1.5 万神・100%)。残りが 3 つ以下の時だけカオスで始める
  const normalCount = ts.filter((t) => mod(t.modId).source === "normal").length;
  const spam = inp.chaosOk && pool.length && normalCount - 1 <= 3
    ? [...pool].sort((a, b) => (inp.chance?.(a) ?? 1) - (inp.chance?.(b) ?? 1))[0]! : null;
  if (spam) {
    spamId = spam.modId;
    const sid = id();
    main.push({ ...base, id: sid, action: { kind: "chaos", tier: "chaos" }, targets: [{ modId: spam.modId, minTier: spam.minTierIndex ?? 0 }], need: 1, onHit: null, onMiss: sid });
  }
  // ブリーチは、プレで作る物が無ければ最初に (以降の手でも残っていること、消えたら自動で戻る)。
  // プレで作る物があれば最後に回す: 先に付けるとプレの消去で半分消え、付け直すたびに付けた狙いを食って終わらなかった
  // (2026-09-24 金の指輪)。最後なら、左側の高貴で空きを外れで埋めてからブリーチで 1 つ食わせる (外れを食えば完成)
  const breachLast = breach && normal("prefix").length > 0;
  const keepBreach = breach && !breachLast ? ["__breach__"] : [];
  if (breach && !breachLast) main.push({ ...base, id: id(), action: { kind: "breach" }, targets: [], keep: ["__breach__"], need: 1, onHit: null, onMiss: null });
  for (const t of essences) {
    main.push({ ...base, id: id(), action: { kind: "essence", modId: t.modId }, targets: [{ modId: t.modId, minTier: 0 }], keep: keepBreach, need: 1, onHit: null, onMiss: null });
  }
  // 普通の狙いは多い側から (枠が詰まる前に付けたい物を先に)
  const sides = (["prefix", "suffix"] as Side[]).filter((s) => normal(s).length).sort((a, b) => normal(b).length - normal(a).length);
  /** 今入っている品質の種類 (自動で組む中で、最後に入れたカタリスト) */
  let qualityNow: string | null = null;
  for (const side of sides) {
    const list = normal(side);
    const cat = catalystFor(list);
    // 触媒の高貴を使う前に、そのカタリストで品質を上限まで (オーナー 2026-09-24:「宝飾品で触媒を使える時は品質 20% 上げて、
    // カタリスト使用後に上級またはパーフェクトで触媒使って試した方がトータル収支変わる」)。シミュレーターは触媒の高貴の倍率を
    // 品質の上限で数えるので、この手が無いと品質代がタダになっていた
    if (cat && cat !== qualityNow) {
      main.push({ ...base, id: id(), action: { kind: "quality", catalyst: cat }, targets: [], keep: keepBreach, need: 1, onHit: null, onMiss: null });
      qualityNow = cat;
    }
    const annulId = `x-${side}`;
    extra.push({ ...base, id: annulId, action: { kind: "annul", side }, targets: [], need: 1, onHit: "auto", onMiss: "auto" });
    for (let k = 1; k <= list.length; k++) {
      main.push({
        ...base, id: id(),
        action: { kind: "exalt", tier: exaltTier(list), side, catalyst: cat },
        targets: list.map((t) => ({ modId: t.modId, minTier: t.minTierIndex ?? 0 })),
        keep: keepBreach, need: k, onHit: null, onMiss: annulId,
      });
    }
  }
  for (const t of desecrated) {
    const side = sideOf(t.modId);
    const lightId = `l-${t.modId}`;
    const node: SimNode = {
      // 古代の鎖骨は段 40 以上だけ。届かなければ普通の鎖骨
      ...base, id: id(), action: { kind: "desecrate", side, bone: reach([t]) >= 40 ? "desecrate_ancient" : "desecrate", echoes: false },
      targets: [{ modId: t.modId, minTier: t.minTierIndex ?? 0 }], keep: keepBreach, need: 1, onHit: null, onMiss: lightId,
    };
    main.push(node);
    extra.push({ ...base, id: lightId, action: { kind: "light" }, targets: [], need: 1, onHit: node.id, onMiss: null });
  }
  if (breachLast) {
    // 空きを埋める (狙いの無い手 = 順番に打つ手)。枠が満杯なら打てないので飛ばす代わりに、確認だけの手にはしない
    // 枠が既に満杯 (外れで埋まっている) なら打てないので、× (打てない時の行き先) をブリーチへ
    const fillId = id(), breachId = id();
    main.push({ ...base, id: fillId, action: { kind: "exalt", tier: "exalt", side: "prefix", catalyst: null }, targets: [], need: 1, onHit: null, onMiss: breachId });
    main.push({ ...base, id: breachId, action: { kind: "breach" }, targets: [], keep: ["__breach__"], need: 1, onHit: null, onMiss: null });
  }
  // 最後に貼り付けの品質の種類で上限まで (ブリーチで上限が上がった後も、ここで埋める)
  if (inp.qualityTag && (inp.qualityTag !== qualityNow || breachLast)) main.push({ ...base, id: id(), action: { kind: "quality", catalyst: inp.qualityTag }, targets: [], need: 1, onHit: null, onMiss: null });

  // 本線をつなぐ (○ は次の手、最後は完成)
  main.forEach((x, i) => { x.onHit = main[i + 1]?.id ?? "done"; });
  return [...main, ...extra];
}
