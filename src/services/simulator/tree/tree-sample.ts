/**
 * tree-sample.ts — ツリーの箱に「着いた時のアイテム」の見本を 1 個作る・箱の手を 1 回打つ (2026-10-22 オーナー「エンジンでカレンシーを使えるように。
 * 外れのやり方を決める時にカレンシーを打たせて決める」)。打つのは全部エンジンの入口 (engine.ts の applyCurrency)、ここで結果は作らない。
 *
 * 見本の作り方: 始まり = 金の指輪のレア + フラクチャー (指名の手 force:…|f をエンジンで打つ。創生の樹の MOD も置ける)。
 * その下の箱 = 親の見本に親の手を打ち、結果がその箱 (当たり X / 外れ / 外れが消えた / 狙いが消えた) になるまで引き直す (TRIES 回まで)。
 * 引けなかった当たりは、親の見本に指名で付けて作る (note に書く)。分け方は設計 11 の表 (付いた > 消えた > 外れが減った > 外れ)
 */
import { applyCurrency, freshItem, maxQualityOf, mulberry32, omenBlock, revealOffers, runeIdByName, stepOutcomes, unrevealedOf, type PatchData, type StageApply, type StageItem, type StageMod } from "../../craft-stage/engine";
import { CATALYSING, isCatalyst } from "./tree-hands";
import { tr } from "../../../i18n/lang";
import { startOf, type Aim, type Hand, type OutKind, type TreeDoc } from "./tree-model";
import { withTreeTune } from "./tree-tune";

const TRIES = 3000;
/** カタリストを 1 個ずつ足す上限 (見張り) */
const CAT_MAX = 200;

export interface Sample { item: StageItem; note: string | null }

const tierNo = (m: StageMod): number => Number(/\d+/.exec(m.tierName)?.[0] ?? 99);
/** 狙いが付いているか (同じ系統の MOD で、段が T 何以上) */
export function aimHeld(data: PatchData, item: StageItem, a: Aim): boolean {
  const fam = data.mods.get(a.modId)?.family;
  return [...item.prefixes, ...item.suffixes].some((m) => (m.modId === a.modId || (!!fam && m.family === fam)) && tierNo(m) <= a.tier);
}
/**
 * その箱の手で「当たり」と数える札。繰り返し (当たるまで) は、その箱の結果の当たりの箱の札だけで止める
 * (10-22 プレフィックスをつないだら、始まりのカオスがプレフィックスのレアリティで止まり、行き先が無く 87 人止まった)。ほかの手はツリー全部の札
 */
export function handAims(doc: TreeDoc, id: string, aims: readonly Aim[]): readonly Aim[] {
  const b = doc.boxes[id];
  if (!b?.hand?.repeat) return aims;
  const own = b.outs.flatMap((o) => { const c = doc.boxes[o]; return c?.out === "hit" && c.aim ? [c.aim] : []; });
  return own.length ? own : aims;
}
/** このツリーで使っている当たりの札 (重ならない物) */
export function aimsOf(doc: TreeDoc): Aim[] {
  const out: Aim[] = [];
  for (const b of Object.values(doc.boxes)) if (b.out === "hit" && b.aim && !out.some((x) => x.modId === b.aim!.modId && x.tier === b.aim!.tier)) out.push(b.aim);
  return out;
}
/** 外れ = 固定でも狙いでもない MOD */
const junkCount = (data: PatchData, item: StageItem, aims: readonly Aim[]): number =>
  [...item.prefixes, ...item.suffixes].filter((m) => !m.fractured && !aims.some((a) => aimHeld(data, { ...item, prefixes: [m], suffixes: [] }, a))).length;

/** 打つ前と後を比べて、どの箱の結果か (付いた狙いは hits に) */
export function outcomeOf(data: PatchData, before: StageItem, after: StageItem, aims: readonly Aim[]): { out: OutKind; hits: Aim[] } {
  const had = aims.filter((a) => aimHeld(data, before, a));
  const has = aims.filter((a) => aimHeld(data, after, a));
  const hits = has.filter((a) => !had.includes(a));
  if (hits.length) return { out: "hit", hits };
  if (had.some((a) => !has.includes(a))) return { out: "lost", hits: [] };
  if (junkCount(data, after, aims) < junkCount(data, before, aims)) return { out: "junkGone", hits: [] };
  return { out: "junk", hits: [] };
}

/**
 * 結果が 1 通りの手 (10-22 オーナー「光のお告げの場合ハズレとかないから、使った時点でその先には冒涜が消えた状態の枠しかない」
 * 「サフィ 3 MOD・プレ 1 MOD で左側の消去の時は狙いの MOD が無いから 1 通り。そういう判断は自動で」): 手を置く時に、この箱の見本を
 * SINGLE_SEEDS 個作り (同じ箱でも外れが左右どちらかなどで違う)、それぞれにエンジンの stepOutcomes で起こりうる行き先を全部たどる。
 * 全部の見本で結果の分け方 (outcomeOf) が同じ 1 つの時だけそれを返す (当たりは付く札も)。箱に着かなかった見本は数えない。
 * pre = 前に品質を最大まで入れるカタリスト (触媒の手の前の札)。
 * 繰り返し・狙い無し・品質だけの手・未発現が付く手と、エンジンが枝に分けられない手 (数値だけ変わる手など) は null (今までどおり手の種類の箱)
 */
export function singleOutOf(data: PatchData, doc: TreeDoc, boxId: string, h: Hand, pre: string | null = null): { out: OutKind; aim: Aim | null } | null {
  if (h.repeat || h.free || isCatalyst(h.currency)) return null;
  const aims = aimsOf(doc);
  let one: { out: OutKind; hits: Aim[] } | null = null;
  const key = (r: { out: OutKind; hits: Aim[] }): string => `${r.out}:${r.hits.map((a) => `${a.modId}/${a.tier}`).join(",")}`;
  for (let seed = 1; seed <= SINGLE_SEEDS; seed++) {
    const smp = sampleOf(data, doc, boxId, seed);
    if (smp.note === "none" || smp.note?.startsWith("cant:")) continue;
    const item = pre ? fillCatalyst(data, smp.item, pre, mulberry32(seed)).item : smp.item;
    const outs = stepOutcomes(data, item, h.currency, h.omens)?.filter((o) => !o.void);
    // 未発現が付く手 (冒涜の骨) は、発現で選ぶ候補で当たり / 外れが分かれる
    if (!outs?.length || outs.some((o) => unrevealedOf(o.item))) return null;
    for (const o of outs) {
      const r = outcomeOf(data, item, o.item, aims);
      if (r.hits.length > 1 || (one && key(one) !== key(r))) return null;
      one = r;
    }
  }
  return one ? { out: one.out, aim: one.hits[0] ?? null } : null;
}
/** 結果が 1 通りかを見る見本の数 */
const SINGLE_SEEDS = 8;

/**
 * カタリストを 1 押しで、そのアイテムの今の品質の最大まで入れる (2026-10-22 オーナー「個数を数えて入れない」)。
 * 最大はエンジンの maxQualityOf (普通 20%、品質の最大値 +20% の MOD があれば 40%。後で足すインフューザーもここに入る)。
 * 別の種類のカタリストが入っていれば 0 から (エンジンどおり)。count = 入れた個数 (費用はこの分)
 */
export function fillCatalyst(data: PatchData, item: StageItem, key: string, rng: () => number): StageApply & { count: number } {
  const tag = key.slice("catalyst_".length), max = maxQualityOf(item);
  let it = item, count = 0, last: StageApply = { applied: false, item, added: [], removed: [] };
  for (let i = 0; i < CAT_MAX && !(it.qualityTag === tag && it.quality >= max); i++) {
    last = applyCurrency(data, it, key, rng, [], { oneCatalyst: true });
    if (!last.applied) break;
    it = last.item;
    count++;
  }
  return count ? { ...last, applied: true, item: it, count } : { ...last, count: 0, ...(last.applied || last.reason ? {} : { reason: tr("品質はもう最大", "Quality is already at max") }) };
}

/** 繰り返し (カオススパム) の上限が無い時の見張り */
const SPAM_CAP = 5000;

/**
 * 箱の手を 1 回打つ (触媒の時はカタリストで品質を上げてから。台本の while と同じ)。
 * 繰り返しの手 (repeat) は、当たりの札 (aims) のどれかが新しく付くまで (か上限まで) 打ち続けた結果を 1 回分として返す。
 * use を渡すと使った物 (カタリストの数・カレンシー・お告げ) を数える (100 人回し tree-run)
 */
export function playHand(data: PatchData, item: StageItem, h: Hand, rng: () => number, aims: readonly Aim[] = [], use?: (key: string, n?: number) => void, miss = false): StageApply {
  if (h.repeat) {
    const cap = h.repeat.max ?? SPAM_CAP;
    let r: StageApply = { applied: false, item, added: [], removed: [] };
    let it = item;
    for (let i = 0; i < cap; i++) {
      r = playHand(data, it, { ...h, repeat: null }, rng, aims, use, miss);
      if (!r.applied) return i ? { ...r, applied: true, item: it } : r;
      it = r.item;
      if (outcomeOf(data, item, it, aims).out === "hit") break;
    }
    return { ...r, item: it };
  }
  // 品質だけ上げる手: カタリストを今の最大まで (もう最大なら何もせず通る。戻ってきてもう一度通る時)
  if (isCatalyst(h.currency)) {
    const r = fillCatalyst(data, item, h.currency, rng);
    if (r.count) use?.(h.currency, r.count);
    return r.count || (item.qualityTag === h.currency.slice("catalyst_".length) && item.quality >= maxQualityOf(item)) ? { ...r, applied: true } : r;
  }
  let it = item;
  // 触媒の高貴の前に、カタリストで品質を最大まで (箱の手も 1 押しと同じ)
  if (h.catalyst && h.omens.includes(CATALYSING)) {
    const r = fillCatalyst(data, it, h.catalyst, rng);
    if (!r.applied && r.count === 0 && !(it.qualityTag === h.catalyst.slice("catalyst_".length))) return r;
    if (r.count) use?.(h.catalyst, r.count);
    it = r.item;
  }
  const r = applyCurrency(data, it, h.currency, rng, h.omens);
  if (r.applied && use) {
    use(h.currency);
    for (const o of r.omensUsed ?? []) use(o);
  }
  return r.applied && unrevealedOf(r.item) ? reveal(data, r, rng, aims, miss) : r;
}

/**
 * 冒涜 (骨) の後は、そのまま魂の井戸で発現して選ぶ (2026-10-22 オーナー「冒涜は冒涜で付与かな」)。候補 3 つ (エンジンの revealOffers) のうち
 * 当たりの札に合う物を選び、無ければ 1 つ目 (外れ)。miss = 外れの箱の見本 (狙いでない候補を選ぶ。黒き血は狙いが必ず候補に入り、見本が外れの箱に着かなかった、10-22)。
 * 候補と発現の結果が同じになるよう、同じ種の rng を 2 回作る (apply-desecrate.ts の決まり)
 */
function reveal(data: PatchData, r: StageApply, rng: () => number, aims: readonly Aim[], miss = false): StageApply {
  const seed = Math.floor(rng() * 2 ** 31);
  const offers = revealOffers(data, r.item, mulberry32(seed)).first;
  const isAim = (m: StageMod): boolean => aims.some((a) => aimHeld(data, { ...r.item, prefixes: [m], suffixes: [] }, a));
  const n = Math.max(0, offers.findIndex((m) => isAim(m) !== miss));
  // reveal:N の N は 1 から (エンジンの run-plan と同じ。0 は「その番号の候補が無い」)
  const x = applyCurrency(data, r.item, `reveal:${n + 1}`, mulberry32(seed));
  return x.applied ? { ...x, added: [...r.added, ...x.added], removed: [...r.removed, ...x.removed] } : r;
}

/**
 * 始めのアイテム = 始まりの形 (レアリティ + 指名の MOD、フラクチャーはその印。startOf) + 乱数の MOD (レアは素の高貴、マジックは増強を startRandom 回)。
 * 見本・ルート精査・100 人回し (tree-run) で同じ物。
 * note = 打てなかった理由 (無ければ null)
 */
export function startItemOf(data: PatchData, doc: TreeDoc, rng: () => number): Sample {
  const st = startOf(doc);
  // マジックはノーマルから付ける (付けるとマジック、エンジンの force の決まり)。フラクチャーはレアにだけ付く (force がレアにする)
  const magic = st.rarity === "magic" && !st.mods.some((m) => m.fractured);
  let item = freshItem(data, doc.base, doc.itemLevel, magic ? "normal" : "rare");
  // 選んだルーンを先に差す。ルーンの MOD はそのルーンを差して付く (force が差す)。差すソケットを要る数だけ開けておく (手袋の投射物 +2 = コルの狩り、10-22)
  const runes = st.runes ?? [];
  const byMod = new Set(st.mods.flatMap((m) => { const r = data.mods.get(m.modId)?.rune; return r ? [r] : []; }));
  const need = runes.length + [...byMod].filter((id) => !runes.some((en) => runeIdByName(en) === id)).length;
  if (need) item = { ...item, sockets: Math.max(item.sockets ?? 0, need) };
  for (const en of runes) {
    const r = applyCurrency(data, item, `rune:${en}`, rng);
    if (!r.applied) return { item: r.item, note: r.reason ?? null };
    item = r.item;
  }
  for (const m of st.mods) {
    // エッセンスの MOD (グレーターの道の始まり) はクラフト MOD の印で付ける
    const src = data.mods.get(m.modId)?.source;
    const r = applyCurrency(data, item, `force:${m.modId}|T${m.tier}|${m.fractured ? "f" : src === "essence" || src === "perfect_essence" ? "e" : "n"}`, rng);
    if (!r.applied) return { item: r.item, note: r.reason ?? null };
    item = r.item;
  }
  for (let i = 0; i < (doc.startRandom ?? 0); i++) {
    const x = applyCurrency(data, item, item.rarity === "rare" ? "exalt" : "augment", rng);
    if (!x.applied) return { item, note: x.reason ?? null };
    item = x.item;
  }
  return { item, note: null };
}

/**
 * その手がこのアイテムに打てない理由 (打てるなら null。オーナー 10-22「進行不能」: 消せる物が無い側のお告げ・効かないお告げが掛かった手を確定させない)。
 * お告げはエンジンの入口の omenBlock (触媒の時はカタリストで品質を入れた後のアイテムで聞く)、手そのものは playHand (繰り返しは 1 回分、乱数で決まる物は打てる扱い)
 */
export function handProblem(data: PatchData, item: StageItem, h: Hand): string | null {
  let it = item;
  if (h.catalyst && h.omens.includes(CATALYSING)) it = fillCatalyst(data, it, h.catalyst, mulberry32(1)).item;
  for (const o of h.omens) { const why = omenBlock(data, it, h.currency, h.omens, o); if (why) return why; }
  const r = playHand(data, item, { ...h, repeat: null }, mulberry32(1));
  return r.applied || r.random ? null : r.reason ?? tr("打てない", "Can't use");
}

/** 箱の見本 (seed が同じなら同じ物。木の設定 tune で打つ) */
export function sampleOf(data: PatchData, doc: TreeDoc, boxId: string, seed: number): Sample {
  return withTreeTune(doc, () => sampleIn(data, doc, boxId, seed));
}
function sampleIn(data: PatchData, doc: TreeDoc, boxId: string, seed: number): Sample {
  const b = doc.boxes[boxId];
  if (!b) return { item: freshItem(data, doc.base, doc.itemLevel, "rare"), note: null };
  if (b.out === "start") return startItemOf(data, doc, mulberry32(seed));
  const p = doc.boxes[b.parent!]!;
  const base = sampleIn(data, doc, p.id, seed);
  if (!p.hand) return base;
  const aims = aimsOf(doc);
  const rng = mulberry32(seed ^ 0x5eed ^ boxId.length * 7919);
  let last: StageApply | null = null;
  for (let i = 0; i < TRIES; i++) {
    const r = playHand(data, base.item, p.hand, rng, handAims(doc, p.id, aims), undefined, b.out === "junk" || b.out === "lost");
    if (!r.applied) { last = r; break; }
    last = r;
    const o = outcomeOf(data, base.item, r.item, aims);
    // 当たるまでの手が上限まで打っても当たらない = 付かない狙いだけ。引き直しても同じなのでやめる (1 回 5000 回 × 3000 で画面が固まった、10-22)
    if (p.hand.repeat && o.out !== "hit") break;
    if (b.out === "pass") return { item: r.item, note: null };
    if (b.out !== "any" && o.out !== b.out) continue;
    if (b.out === "hit" && b.aim && !o.hits.some((a) => a.modId === b.aim!.modId && a.tier === b.aim!.tier)) continue;
    return { item: r.item, note: null };
  }
  if (last && !last.applied) return { item: base.item, note: `cant:${last.reason ?? ""}` };
  if (b.out === "hit" && b.aim) {
    const r = applyCurrency(data, base.item, `force:${b.aim.modId}|T${b.aim.tier}|n`, rng);
    return { item: r.item, note: r.applied ? "forced" : r.reason ?? null };
  }
  return { item: base.item, note: "none" };
}
