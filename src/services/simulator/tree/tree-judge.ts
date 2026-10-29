/**
 * tree-judge.ts — 箱の判定は 2 つだけ (S-50b、スイッチ judgeOne。10-29 オーナーの大本「箱の判定は箱に描いている中身で決める」「手ごとの特別扱いはしない」)。
 * 中身 (S-60) = 狙いの組 (付いている完成形の狙い、段は完成形以上、☑ で付いた物) + 体 (tree-box-shape の bodyOf: 側ごとの外れの数と種類・✦ の側・レアリティ) + 品質 (値と触媒の種類)。
 * 箱の中身はその箱の見本 (S-74、箱に描いているカード) の実物から。道から足していく数え (heldSets・pathHelds・aimsMayHold・形の鍵) は使わない。
 *   箱どうし fitsBox(from, to) = from の人が to へ行けるか (自動のつなぎ・同じ手なら戻る・まとめ・自動の ↩ の見直し・精査の戻り先・当たりの統合)
 *   人と箱 fitsItem(item, aimed, to) / boxesOf = この人のアイテムはその箱か、違えば中身の同じ箱 (回す時の行き先・消去の直線の止まり・精査の辿り)
 * ☑ で付いた狙い (aimed) はアイテムの実物ごとの印: 見本は見本の打ち方の順に、人は回した順に (当たりの箱に着いたらその札の MOD、消えたら外れる。☑ の無い手で付いた
 * 完成形の MOD は外れ = S-22・S-60。全部消えてよい消去の後は全部外れ、残したい MOD の消去の後はその MOD だけ)。カードの「外れ MOD」の札 (tree-row-tags) と同じ見方。
 * 呼ぶ側は自前の比べを持たない。1 回の組み替え・回し・精査の中で judgeMemo を 1 つ作って使う (木を替えたら作り直す)
 */
import type { PatchData, StageItem } from "../../craft-stage/engine";
import { aimHeldOn, isAimMod } from "./tree-aim";
import { bodyOf } from "./tree-box-shape";
import { aimOpts, sampleOf, startGoalAims, targetsOf } from "./tree-sample";
import { boxAims, fractureMarks, keepCut, type TreeDoc } from "./tree-model";
import { qualityOk } from "./tree-unbounded";
import { flag } from "../../../web/release-flags";

/** 箱の中身を見る見本の数 (前の boxBody と同じ 4 つ) */
const SAMPLES = 4;
/**
 * 結果が何通りかある箱 (見本 4 つで中身が 2 通り以上) は、続けて MORE 個新しい中身が出なくなるまで見本を足す (MAX まで。S-74 B、スイッチ recipeV1)。
 * 4 つだと「狙いが消えた」(どの耐性が消えたか 3 通り) の 2 通りしか拾わず、残りの通りの人が止まった (10-29 bone3 の止まり 26)
 */
const MORE = 8, MAX = 32;

/** アイテムに付いている完成形の狙い (段は完成形以上) の MOD */
const goalsOn = (data: PatchData, doc: TreeDoc, it: StageItem): Set<string> => new Set((doc.memoAims ?? []).filter((a) => aimHeldOn(data, it, a, { sameText: true })).map((a) => a.modId));
/** 始まりの ☑ (始まりの MOD の完成形の狙いと ✦ の印) */
export function startAimed(data: PatchData, doc: TreeDoc, it: StageItem): ReadonlySet<string> {
  const on = goalsOn(data, doc, it);
  return new Set([...startGoalAims(doc), ...fractureMarks(doc)].map((a) => a.modId).filter((id) => on.has(id)));
}
/** 箱 boxId に着いた時の ☑ (prev = 着く前、item = 着いた時のアイテム) */
export function nextAimed(data: PatchData, doc: TreeDoc, prev: ReadonlySet<string>, boxId: string, item: StageItem): ReadonlySet<string> {
  const b = doc.boxes[boxId];
  if (!b) return prev;
  const keep = keepCut(doc, b);
  // 消去の後も ✦ の印の狙いは残る (消去では消えない。S-28b2: 前は全部消えてよい消去の後に ✦ まで外れに数え、✦ だけの箱がスタートと別の中身になった、木 oWkFcwYX の b8)
  const base = new Set(keep ? [...keep, ...fractureMarks(doc)].map((a) => a.modId) : prev);
  if (b.out === "hit" && b.aim) for (const a of [...boxAims(b), ...(b.anyOf ?? [])]) base.add(a.modId);
  const on = goalsOn(data, doc, item);
  return new Set([...base].filter((id) => on.has(id)));
}
/** 全部消えてよい消去の後 (☑ の無い消去は全部外れ MOD、S-28。✦ の印の狙いは残る) */
export const strippedOf = (doc: TreeDoc): ReadonlySet<string> => new Set(fractureMarks(doc).map((a) => a.modId));
/**
 * アイテムの中身の鍵 (☑ の狙いの組 # 体 # 品質)。aimed に無い完成形の MOD は外れに数える。
 * 狙いに当たる MOD は文が同じなら別の modId でも当たる (エンジンの sameText) ので、体 (bodyOf) から外すのは実物の MOD の modId (前は完成形の modId で外し、同じ文の別 modId が狙いと外れの両方に数わった)
 */
export function contentOf(data: PatchData, doc: TreeDoc, it: StageItem, aimed: ReadonlySet<string>): string {
  const goals = (doc.memoAims ?? []).filter((a) => aimed.has(a.modId)), opts = aimOpts(data);
  const keys = new Set<string>(), mods = new Set<string>();
  for (const m of [...it.prefixes, ...it.suffixes]) { const g = goals.find((a) => isAimMod(m, targetsOf(data, [a]), opts)); if (g) { keys.add(g.modId); mods.add(m.modId); } }
  const body = bodyOf(data, doc, it, mods);
  return `${[...keys].sort().join(",")}#${flag("judgeOne") ? junkOne(body) : `${body}#q${qualityKey(it)}`}`;
}
/**
 * 外れは種類を見ない (S-60、10-29 深夜オーナー「そもそもハズレMODはどんな形であれハズレMODだからな」): 側ごとの 普通.エッセンス.冒涜の発現済み.未発現 を
 * 外れ.未発現 の 2 つに (「未発現のみ別枠として全然おｋ」)。冒涜の発現済みの数は最後の `#d<プレ>.<サフィ>` に残し、光のお告げの手のある箱と比べる時だけ見る (looseKey で落とす)
 */
function junkOne(body: string): string {
  if (!flag("boxShape")) return body;
  const [p = "", s = "", ...rest] = body.split("|");
  const side = (v: string): [string, number] => { const [n = 0, c = 0, x = 0, u = 0] = v.split(".").map(Number); return [`${n + c + x}.${u}`, x]; };
  const [pp, px] = side(p), [ss, sx] = side(s);
  return `${[pp, ss, ...rest].join("|")}#d${px}.${sx}`;
}
/** 中身の鍵から冒涜の発現済みの数を落とした物 (ふだんの比べ。光のお告げの手のある箱と比べる時だけ落とさない = needsDesecrated) */
export const looseKey = (k: string): string => k.replace(/#d\d+\.\d+$/, "");
/** 光のお告げ (冒涜の MOD しか消さない) を含む手の箱か。その箱へ行く人は冒涜の発現済みの外れの数も合わせる (10-29 深夜オーナー「いいかな　それでなおるなら万々歳」) */
export const needsDesecrated = (doc: TreeDoc, id: string): boolean => !!doc.boxes[id]?.hand?.omens.includes(LIGHT);
const LIGHT = "OmenofLight";
/**
 * 品質は箱の中身に入れない (S-60b、ルーンと同じ。10-29 深夜オーナー「Bでしょ途中で触媒で消える時もあればそのままついたままやり直しのパターンもあるし。品質の件はルーンと扱い同じに」)。
 * 品質はアイテムに残るだけ。前は品質 40 の「最大ライフ + ✦」(木 oWkFcwYX の b11) が品質 0 の同じ箱 b1 と別の中身になり、同じ手の枝がもう 1 本あった。スイッチ judgeOne の外は前のまま
 */
const qualityKey = (it: StageItem): string => `${it.quality ?? 0}.${it.catalystQuality ?? 0}.${it.qualityTag ?? ""}`;
/** 完成の箱へは、品質を狙う木なら完成形の品質が足りている人だけ (品質を比べから外したので、足りない人が完成の箱に入らないように) */
const doneOk = (doc: TreeDoc, id: string, it: StageItem): boolean => doc.boxes[id]?.done !== "main" || qualityOk(doc, it);

/** 見本の ☑ (見本の item ごと、木を替えて見本が作り直されたら別の物) */
const AIMED = new WeakMap<StageItem, Map<string, ReadonlySet<string>>>();
/** 箱 id の seed 番目の見本の ☑ (始まりから見本の打ち方の順に) */
export function sampleAimed(data: PatchData, doc: TreeDoc, id: string, seed: number): ReadonlySet<string> {
  const s = sampleOf(data, doc, id, seed);
  let m = AIMED.get(s.item);
  const had = m?.get(id);
  if (had) return had;
  const b = doc.boxes[id];
  const out = !b || b.out === "start" || !b.parent ? startAimed(data, doc, s.item) : nextAimed(data, doc, sampleAimed(data, doc, b.parent, seed), id, s.item);
  if (!m) AIMED.set(s.item, (m = new Map()));
  m.set(id, out);
  return out;
}
/** 見本を出す時の写し (値を揃えたカード、tree-fixed-values) → 元の見本 */
const COPY_OF = new WeakMap<StageItem, StageItem>();
/** copy は sample の写し (☑ は元の見本の物を引く) */
export const copyOfSample = (copy: StageItem, sample: StageItem): StageItem => { COPY_OF.set(copy, sample); return copy; };
/** 見本のアイテムの ☑ (sampleAimed で覚えた物。無ければ null)。カードの写しは元の見本で引く (前は引けずに道の当たりの組で数え、エッセンスの狙いが「外れ MOD」と出た、S-82。スイッチ boxShape) */
export const aimedOfSample = (id: string, item: StageItem): ReadonlySet<string> | null => AIMED.get((flag("boxShape") && COPY_OF.get(item)) || item)?.get(id) ?? null;

export interface Judge {
  /** 箱の見本の中身 (見本ごとに違えば 2 つ以上。見本が作れない箱は null = 分からない) */
  contents(id: string): ReadonlySet<string> | null;
  /** 箱どうし: from と to の中身が同じ (両方分かって、見本の中身の組がそっくり同じ) */
  fitsBox(from: string, to: string): boolean;
  /** 人と箱: この人のアイテムの中身が to の見本の中身のどれかと同じ (to が分からない箱は合う扱い) */
  fitsItem(item: StageItem, aimed: ReadonlySet<string>, to: string): boolean;
  /** 中身が item と同じ箱 (手のある箱・完成 / 失敗の箱。浅い段・先に作った箱から。ok で更に絞る) */
  boxesOf(item: StageItem, aimed: ReadonlySet<string>, ok?: (id: string) => boolean): string[];
  /** 箱の見本ごとの ☑ で付いた狙い (作れない見本は入れない) */
  aimedOf(id: string): ReadonlySet<string>[];
  /** 箱の見本に消せる (✦ でない) ☑ の狙いがあるか (「狙いが消えた」の箱を作るか、setHand) */
  holdsAim(id: string): boolean;
  /** 箱の見本が全部、完成の狙いを ☑ で持っているか (スマホの自動の完成 S-91) */
  holdsAll(id: string): boolean;
  /** 箱の見本にカタリストの品質が入っているか (品質を上げた後、S-31b) */
  afterQuality(id: string): boolean;
}

export function judgeMemo(data: PatchData, doc: TreeDoc): Judge {
  const memo = new Map<string, ReadonlySet<string> | null>(), looseMemo = new Map<string, ReadonlySet<string> | null>();
  /** 箱の作れる見本 (seed と item) */
  const samples = (id: string): Array<{ seed: number; item: StageItem }> => (doc.boxes[id] ? [1, 2, 3, 4].slice(0, SAMPLES).flatMap((seed) => { const s = sampleOf(data, doc, id, seed); return s.note === "none" || s.note?.startsWith("cant:") ? [] : [{ seed, item: s.item }]; }) : []);
  /** 箱の中身 (ふだんの比べ = 冒涜の発現済みの数を落とす。光のお告げの手のある箱と比べる時は full) */
  const contents = (id: string): ReadonlySet<string> | null => {
    if (looseMemo.has(id)) return looseMemo.get(id)!;
    const f = full(id), out = f ? new Set([...f].map(looseKey)) : null;
    looseMemo.set(id, out);
    return out;
  };
  /** to と比べる中身 (to が光のお告げの手のある箱なら冒涜の発現済みの数も) */
  const keyFor = (to: string, k: string): string => (needsDesecrated(doc, to) ? k : looseKey(k));
  const setFor = (to: string, id: string): ReadonlySet<string> | null => (needsDesecrated(doc, to) ? full(id) : contents(id));
  const full = (id: string): ReadonlySet<string> | null => {
    if (memo.has(id)) return memo.get(id)!;
    let out: Set<string> | null = null;
    if (doc.boxes[id]) {
      const more = flag("recipeV1");
      for (let seed = 1, last = 0; seed <= (more ? MAX : SAMPLES); seed++) {
        if (seed > SAMPLES && ((out?.size ?? 0) < 2 || seed - last > MORE)) break;
        const s = sampleOf(data, doc, id, seed);
        if (s.note === "none" || s.note?.startsWith("cant:")) continue;
        const k = contentOf(data, doc, s.item, sampleAimed(data, doc, id, seed));
        if (!out?.has(k)) last = seed;
        (out ??= new Set()).add(k);
      }
    }
    memo.set(id, out);
    return out;
  };
  const depth = (id: string): number => { let n = 0; for (let b = doc.boxes[id]; b?.parent; b = doc.boxes[b.parent]) n++; return n; };
  const seq = (id: string): number => (id === "start" ? -1 : Number(/\d+$/.exec(id)?.[0] ?? 0));
  let order: string[] | null = null;
  const targets = (): string[] => (order ??= Object.values(doc.boxes).filter((b) => !!b.hand || !!b.done).map((b) => b.id).sort((x, y) => depth(x) - depth(y) || seq(x) - seq(y)));
  return {
    contents,
    fitsBox(from, to) {
      if (from === to || !doc.boxes[from] || !doc.boxes[to]) return false;
      const a = setFor(to, from), b = setFor(to, to);
      return !!a && !!b && a.size === b.size && [...a].every((k) => b.has(k));
    },
    fitsItem(item, aimed, to) {
      const b = setFor(to, to);
      return (!b || b.has(keyFor(to, contentOf(data, doc, item, aimed)))) && doneOk(doc, to, item);
    },
    boxesOf(item, aimed, ok) {
      const k = contentOf(data, doc, item, aimed);
      return targets().filter((id) => !!setFor(id, id)?.has(keyFor(id, k)) && doneOk(doc, id, item) && (!ok || ok(id)));
    },
    aimedOf: (id) => samples(id).map((s) => sampleAimed(data, doc, id, s.seed)),
    holdsAim: (id) => samples(id).some((s) => { const am = sampleAimed(data, doc, id, s.seed); return [...s.item.prefixes, ...s.item.suffixes].some((m) => !m.fractured && am.has(m.modId)); }),
    holdsAll(id) { const goals = doc.memoAims ?? [], ss = samples(id); return goals.length > 0 && ss.length > 0 && ss.every((s) => { const am = sampleAimed(data, doc, id, s.seed); return goals.every((g) => am.has(g.modId)); }); },
    afterQuality: (id) => samples(id).slice(0, 1).some((s) => !!s.item.qualityTag && (s.item.catalystQuality ?? s.item.quality ?? 0) > 0),
  };
}
