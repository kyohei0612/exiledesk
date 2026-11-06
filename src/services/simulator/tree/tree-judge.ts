/**
 * tree-judge.ts — 箱の判定は 2 つだけ (S-50b。10-29 オーナーの大本「箱の判定は箱に描いている中身で決める」「手ごとの特別扱いはしない」)。
 * 中身 (S-60) = 狙いの組 (付いている完成形の狙い、段は完成形以上、☑ で付いた物) + 体 (tree-box-shape の bodyOf: 側ごとの外れの数と種類・✦ の側・レアリティ) + 品質 (値と触媒の種類)。
 * 箱の中身はその箱の見本 (S-74、箱に描いているカード) の実物から。道から足していく数え (heldSets・pathHelds・aimsMayHold・形の鍵) は使わない。
 *   箱どうし fitsBox(from, to) = from の人が to へ行けるか (自動のつなぎ・同じ手なら戻る・まとめ・自動の ↩ の見直し・精査の戻り先・当たりの統合)
 *   人と箱 fitsItem(item, aimed, to) / boxesOf = この人のアイテムはその箱か、違えば中身の同じ箱 (回す時の行き先・消去の直線の止まり・精査の辿り)
 * ☑ で付いた狙い (aimed) はアイテムの実物ごとの印: 見本は見本の打ち方の順に、人は回した順に (当たりの箱に着いたらその札の MOD、消えたら外れる。☑ の無い手で付いた
 * 完成形の MOD は外れ = S-22・S-60。全部消えてよい消去の後は全部外れ、残したい MOD の消去の後はその MOD だけ)。カードの「外れ MOD」の札 (tree-row-tags) と同じ見方。
 * 呼ぶ側は自前の比べを持たない。1 回の組み替え・回し・精査の中で judgeMemo を 1 つ作って使う (木を替えたら作り直す)
 */
import { catalystOf, kindOf, maxQualityOf, occupiedFamiliesOf, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { catalystTagOf } from "../sim-engine";
import { CATALYSING, effectOf, isBone, isCatalyst } from "./tree-hands";
import { aimHeldOn, isAimMod } from "./tree-aim";
import { bodyOf } from "./tree-box-shape";
import { aimOpts, sampleOf, SINGLE_SEEDS, startGoalAims, targetsOf } from "./tree-sample";
import { boxAims, fractureMarks, keepCut, type Aim, type Hand, type TreeDoc } from "./tree-model";
import { qualityOk } from "./tree-unbounded";
import { goneOf, gotOf, keptAimsOf } from "./tree-keep";
import { essenceModOf, midAims, midMark, placedAims } from "./tree-veil";
import { frameKeyOf, frameOfDoc, type Frame } from "./tree-frame";

/** 箱の中身の狙いの組に入る札 = 完成形の狙い + 発現で選んだ置き石 (S-33) */
const contentAims = (doc: TreeDoc): Aim[] => [...(doc.memoAims ?? []), ...placedAims(doc)];
/** アイテムに付いている完成形の狙い (段は完成形以上) と置き石の MOD */
const goalsOn = (data: PatchData, doc: TreeDoc, it: StageItem): Set<string> => new Set(contentAims(doc).filter((a) => aimHeldOn(data, it, a, { sameText: true })).map((a) => a.modId));
/** 始まりの ☑ (始まりの MOD の完成形の狙いと ✦ の印) */
export function startAimed(data: PatchData, doc: TreeDoc, it: StageItem): ReadonlySet<string> {
  const on = goalsOn(data, doc, it);
  return new Set([...startGoalAims(doc), ...fractureMarks(doc)].map((a) => a.modId).filter((id) => on.has(id)));
}
/**
 * 打つ前の印のうち、この手で消えない MOD の物 (S-27e、候補の外は自動で残したい MOD。お告げの有無では分けない)。
 * 全部消えてよい消去 (残したい MOD が空) は残さない = ✦ 以外は触らない側も全部外れ (11-07 オーナー「狙いMODのみ消去で全て消去をえらんでもアイテムカードでは外れMODって表示になってない」)
 */
export function outsideAimed(data: PatchData, doc: TreeDoc, h: Hand | null | undefined, prev: ReadonlySet<string> | null | undefined, before: StageItem | null | undefined): string[] {
  if (!h || !prev || !before || (isRemoveHand(h) && h.keep && !h.keep.length)) return [];
  const gone = goneOf(data, before, h.currency, h.omens);
  if (!gone) return [];
  const mods = [...before.prefixes, ...before.suffixes].filter((m) => gone.has(m.modId)), o = aimOpts(data);
  return [...prev].filter((id) => { const g = contentAims(doc).find((a) => a.modId === id), ts = g ? targetsOf(data, [g]) : null; return !mods.some((m) => m.modId === id || (ts && isAimMod(m, ts, o))); });
}
/**
 * 打つ前の印のうち途中の狙い (S-33c)。残したい MOD の ☑ を外した手・全部消えてよい消去の後も外れに落とさず、付いている間ずっと狙い (消えたら印も外れる)。
 * 11-02 オーナー「狙いの完成に含めるって話途中で消えるけどやないとハズレMODあつかいやろ」
 * 消去の手 (h) の後は残さない = ☑ していない MOD は残したい MOD の有る無しに関わらず全部外れ、エッセンスも (11-06 オーナー「残したいMODで選んでない奴は全部ハズレだろ」)
 */
const midKept = (doc: TreeDoc, prev: ReadonlySet<string> | null | undefined, h?: Hand | null): string[] => (prev && !isRemoveHand(h) ? midAims(doc).map((a) => a.modId).filter((id) => prev.has(id)) : []);
const isRemoveHand = (h: Hand | null | undefined): boolean => !!h && effectOf(h.currency) === "remove";
/** 箱 boxId に着いた時の ☑ (prev = 着く前、item = 着いた時のアイテム、before = 打つ前のアイテム。打たずに着いた時は無し) */
export function nextAimed(data: PatchData, doc: TreeDoc, prev: ReadonlySet<string>, boxId: string, item: StageItem, before?: StageItem | null): ReadonlySet<string> {
  const b = doc.boxes[boxId];
  // ヒネコラのハズレ (打たない、S-39) の箱は手を使わないので印も前のまま
  if (!b || b.seen) return prev;
  // 消える手 (カオス・パーフェクトエッセンス・骨) の残したい MOD も消去と同じ (S-27d)
  const keep = keepCut(doc, b) ?? keptAimsOf(doc, b.parent ? doc.boxes[b.parent]?.hand : null);
  // 消去の後も ✦ の印の狙いは残る (消去では消えない。S-28b2: 前は全部消えてよい消去の後に ✦ まで外れに数え、✦ だけの箱がスタートと別の中身になった、木 oWkFcwYX の b8)
  const base = new Set(keep ? [...[...keep, ...fractureMarks(doc)].map((a) => a.modId), ...outsideAimed(data, doc, b.parent ? doc.boxes[b.parent]?.hand : null, prev, before), ...midKept(doc, prev, b.parent ? doc.boxes[b.parent]?.hand : null)] : prev);
  if (b.out === "hit" && b.aim) for (const a of [...boxAims(b), ...(b.anyOf ?? [])]) base.add(a.modId);
  // エッセンスで付けた・付け直した途中の狙いは印を付ける (S-33b)
  const em = before ? midMark(doc, b.parent ? doc.boxes[b.parent]?.hand : null) : null;
  if (em) base.add(em);
  // 狙いが消えた・狙いが付いた の箱は付いた狙いも ☑ (S-27d、ズレ 9)
  if (b.out === "lost") for (const id of gotOf(b.junkKey)) base.add(id);
  const on = goalsOn(data, doc, item);
  return new Set([...base].filter((id) => on.has(id)));
}
/** 全部消えてよい消去の後 (☑ の無い消去は全部外れ MOD、S-28。✦ の印の狙いは残る) */
export const strippedOf = (doc: TreeDoc): ReadonlySet<string> => new Set(fractureMarks(doc).map((a) => a.modId));
/** 消去の手 h の後の ☑ (keep = 残したい MOD の modId、全部消えてよいは無し)。打つ前の印のうち候補の外と途中の狙いも残す (S-27e・S-33c) */
export const aimedAfterAnnul = (data: PatchData, doc: TreeDoc, h: Hand | null | undefined, prev: ReadonlySet<string> | null | undefined, before: StageItem | null | undefined, keep: readonly string[] = []): ReadonlySet<string> => new Set([...strippedOf(doc), ...keep, ...outsideAimed(data, doc, h, prev, before), ...midKept(doc, prev, h)]);
/**
 * アイテムの中身の鍵 (☑ の狙いの組 # 体 # 品質)。aimed に無い完成形の MOD は外れに数える。
 * 狙いに当たる MOD は文が同じなら別の modId でも当たる (エンジンの sameText) ので、体 (bodyOf) から外すのは実物の MOD の modId (前は完成形の modId で外し、同じ文の別 modId が狙いと外れの両方に数わった)
 */
export function contentOf(data: PatchData, doc: TreeDoc, it: StageItem, aimed: ReadonlySet<string>): string {
  const goals = contentAims(doc).filter((a) => aimed.has(a.modId)), opts = aimOpts(data), memo = doc.memoAims ?? [];
  const keys = new Set<string>(), mods = new Set<string>(), placed = new Set<string>();
  for (const m of [...it.prefixes, ...it.suffixes]) { const g = goals.find((a) => isAimMod(m, targetsOf(data, [a]), opts)); if (g) { keys.add(g.modId); mods.add(m.modId); if (!memo.includes(g)) placed.add(m.modId); } }
  const body = bodyOf(data, doc, it, mods, placed);
  return `${[...keys].sort().join(",")}${frameOf(it)}#${junkOne(body)}`;
}
/** 木の族 = 完成形の狙いと、木の手で付けるエッセンスの MOD の系統 (E-11a)。外れの印 (S-200 ② の (g)) で見る */
const FAMS = new WeakMap<PatchData, Map<string, ReadonlySet<string>>>();
export function treeFamilies(data: PatchData, doc: TreeDoc): ReadonlySet<string> {
  const ids = [...new Set([...(doc.memoAims ?? []).map((a) => a.modId), ...Object.values(doc.boxes).flatMap((b) => essenceModOf(b.hand?.currency) ?? [])])].sort();
  let m = FAMS.get(data);
  if (!m) FAMS.set(data, (m = new Map()));
  const k = ids.join(","), had = m.get(k);
  if (had) return had;
  const out = new Set(ids.flatMap((id) => { const md = data.mods.get(id); return md ? occupiedFamiliesOf(md) : []; }));
  if (m.size > 200) m.clear();
  m.set(k, out);
  return out;
}
/**
 * 外れの印 (S-200 ② の (g)、11-06 オーナー「3おけ」): 外れ MOD (狙いに数えない MOD) のうち、木の族を塞ぐ物の族。同じ系統の MOD は 1 品に 1 つ (E-11a) なので、
 * 塞いでいれば狙い・エッセンスが付かない。枠の比べ (contentOf) には入れない (外れは一律 S-60 のまま。入れると完成形より低い段の狙いの MOD を外れに持つだけで
 * 人と箱が合わなくなり、見張りの木 23 本中 17 本で止まりが増えた)。代表と印の違う枝を探して手を当て、打てない・当たらない所を木のチェックに出すのに使う (tree-frame)
 */
export function blockMarkOf(data: PatchData, doc: TreeDoc, it: StageItem, aimed: ReadonlySet<string>): string {
  const fams = treeFamilies(data, doc);
  if (!fams.size) return "";
  const famsOf = (m: StageMod): string[] => { const md = data.mods.get(m.modId); return md ? occupiedFamiliesOf(md).filter((f) => fams.has(f)) : []; };
  const near = [...it.prefixes, ...it.suffixes].filter((m) => !m.unrevealed && famsOf(m).length);
  if (!near.length) return "";
  let memo = MARKS.get(it);
  if (!memo) MARKS.set(it, (memo = new Map()));
  const mk = [...fams].sort().join(",") + "|" + [...aimed].sort().join(","), had = memo.get(mk);
  if (had !== undefined) return had;
  const goals = contentAims(doc).filter((a) => aimed.has(a.modId)), opts = aimOpts(data), out = new Set<string>();
  for (const m of near) if (!goals.some((a) => isAimMod(m, targetsOf(data, [a]), opts))) for (const f of famsOf(m)) out.add(f);
  const r = [...out].sort().join("+");
  memo.set(mk, r);
  return r;
}
/** 外れの印の覚え (品ごと) */
const MARKS = new WeakMap<StageItem, Map<string, string>>();
/**
 * 枠に入れる品質 (値・カタリストの種類)・はまったルーン・ソケットの数。全部同じ時だけ同じ枠、1 つでも違えば別 (S-60b、オーナー 11-04「品質も枠に入れて全部同じ時だけで」「少しでも違えば別」)。
 * 嵌めたルーン (augments) は名前の組だけで順は見ない (11-05 オーナー「おｋ直して 順は見ないで」。前はルーンの MOD だけを見て、ルーン 0 と 2 の箱が同じ枠になっていた、要望 fd1bed1a)
 * 品質が 0% (値・カタリストの品質とも 0) の時は種類を見ない (11-06: 触媒の高貴が品質を使い切っても種類は残るが、0% の種類は打つ時に効かない)
 */
const frameOf = (it: StageItem): string => `~q${it.quality ?? 0}.${it.catalystQuality ?? ""}.${(it.quality ?? 0) + (it.catalystQuality ?? 0) > 0 ? it.qualityTag ?? "" : ""}~r${[...it.prefixes, ...it.suffixes].flatMap((m) => (m.rune ? [m.rune] : [])).sort().join("+")}.${(it.augments ?? []).map((a) => a.en).sort().join("+")}.${it.enchant?.id ?? ""}.${it.enchant2?.id ?? ""}~s${it.sockets ?? 0}${it.foreseen ? "~f" : ""}`; // 予見済み (ヒネコラ、S-39) も別の枠
/**
 * 外れは種類を見ない (S-60、10-29 深夜オーナー「そもそもハズレMODはどんな形であれハズレMODだからな」): 側ごとの 普通.エッセンス.冒涜の発現済み.未発現 を
 * 外れ.未発現 の 2 つに (「未発現のみ別枠として全然おｋ」)。冒涜の発現済みの数は最後の `#d<プレ>.<サフィ>` に残し、光のお告げの手のある箱と比べる時だけ見る (looseKey で落とす)
 */
function junkOne(body: string): string {
  const [p = "", s = "", ...rest] = body.split("|");
  const side = (v: string): [string, number, number] => { const [n = 0, c = 0, x = 0, u = 0] = v.split(".").map(Number); return [`${n + c + x}.${u}`, x, c]; };
  const [pp, px, pc] = side(p), [ss, sx, sc] = side(s);
  return `${[pp, ss, ...rest].join("|")}#d${px}.${sx}#c${pc}.${sc}`;
}
/** 中身の鍵から冒涜の発現済みの数とクラフト MOD の数を落とした物 (ふだんの比べ。光のお告げ・骨・エッセンスの手のある箱と比べる時だけ keyAt で残す) */
export const looseKey = (k: string): string => k.replace(/#d\d+\.\d+#c\d+\.\d+$/, "");
/** d = 冒涜の発現済みの数を残す、c = クラフト MOD (エッセンス) の数を残す */
const keyAt = (k: string, d: boolean, c: boolean): string => k.replace(/#d(\d+\.\d+)#c(\d+\.\d+)$/, (_, xd: string, xc: string) => `${d ? `#d${xd}` : ""}${c ? `#c${xc}` : ""}`);
/**
 * 冒涜の発現済みの外れの数も合わせる箱か: 光のお告げ (冒涜の MOD しか消さない) を含む手 (10-29 深夜オーナー「いいかな　それでなおるなら万々歳」) と、
 * 骨の手 (冒涜の MOD は 1 つまで E-60。発現済みの外れを持つ人は打てない、S-60d)
 */
export const needsDesecrated = (doc: TreeDoc, id: string): boolean => { const h = doc.boxes[id]?.hand; return !!h && (h.omens.includes(LIGHT) || isBone(h.currency)); };
/** クラフト MOD を付ける手 (エッセンス・液化した感情) の箱か (クラフト MOD は 1 品 1 つ E-11h。クラフト MOD の外れを持つ人は打てないので、その数も合わせる、S-60d) */
export const needsCrafted = (doc: TreeDoc, id: string): boolean => { const h = doc.boxes[id]?.hand; return !!h && (effectOf(h.currency) === "essence" || kindOf(h.currency) === "emotion"); };
const LIGHT = "OmenofLight";
/** 完成の箱へは、品質を狙う木なら完成形の品質が足りている人だけ (品質を比べから外したので、足りない人が完成の箱に入らないように) */
const doneOk = (doc: TreeDoc, id: string, it: StageItem): boolean => doc.boxes[id]?.done !== "main" || qualityOk(doc, it);

/** 箱 id の手がカタリストの n % なら n (最大までの手・ほかの手は 0)。この箱へ行く・比べる時だけ上限を見る (S-60c) */
const catalystTo = (doc: TreeDoc, id: string): number => { const h = doc.boxes[id]?.hand; return h && isCatalyst(h.currency) ? h.quality ?? 0 : 0; };
/** このアイテムは箱 id のカタリストの n % に届くか (同じ種類の品質がもう n 以上か、品質の上限が n 以上) */
function reachesCatalyst(doc: TreeDoc, id: string, it: StageItem): boolean {
  const n = catalystTo(doc, id), h = doc.boxes[id]?.hand;
  if (!n || !h) return true;
  const c = catalystOf(it);
  return maxQualityOf(it) >= n || (c.pct >= n && c.tag === catalystTagOf(h.currency));
}

/** 見本の ☑ (見本の item ごと、木を替えて見本が作り直されたら別の物) */
const AIMED = new WeakMap<StageItem, Map<string, ReadonlySet<string>>>();
/** 箱 id の seed 番目の見本の ☑ (始まりから見本の打ち方の順に) */
export function sampleAimed(data: PatchData, doc: TreeDoc, id: string, seed: number): ReadonlySet<string> {
  const s = sampleOf(data, doc, id, seed);
  let m = AIMED.get(s.item);
  const had = m?.get(id);
  if (had) return had;
  const b = doc.boxes[id];
  const out = !b || b.out === "start" || !b.parent ? startAimed(data, doc, s.item) : nextAimed(data, doc, sampleAimed(data, doc, b.parent, seed), id, s.item, sampleOf(data, doc, b.parent, seed).item);
  if (!m) AIMED.set(s.item, (m = new Map()));
  m.set(id, out);
  return out;
}
/** 箱 id を作った手で消えた途中の狙いの MOD (見本 1 の前後から、箱の題「<MOD> が消えた」S-33c。当たり・狙いが消えた・全部消えてよい消去の箱は無し) */
export function midGoneOf(data: PatchData, doc: TreeDoc, id: string): StageMod | null {
  const b = doc.boxes[id], p = b?.parent ? doc.boxes[b.parent] : null, h = p?.hand, mids = midAims(doc);
  if (!b || !p || !h || !mids.length || b.out === "hit" || b.out === "lost" || (effectOf(h.currency) === "remove" && !!h.keep && !h.keep.length)) return null;
  const was = sampleOf(data, doc, p.id, 1), now = sampleOf(data, doc, id, 1);
  if ([was.note, now.note].some((n) => n === "none" || n?.startsWith("cant:"))) return null;
  const am = sampleAimed(data, doc, p.id, 1), left = [...now.item.prefixes, ...now.item.suffixes];
  return [...was.item.prefixes, ...was.item.suffixes].find((m) => am.has(m.modId) && mids.some((a) => a.modId === m.modId) && !left.some((x) => x.modId === m.modId)) ?? null;
}
/** 見本を出す時の写し (値を揃えたカード、tree-fixed-values) → 元の見本 */
const COPY_OF = new WeakMap<StageItem, StageItem>();
/** copy は sample の写し (☑ は元の見本の物を引く) */
export const copyOfSample = (copy: StageItem, sample: StageItem): StageItem => { COPY_OF.set(copy, sample); return copy; };
/** 見本のアイテムの ☑ (sampleAimed で覚えた物。無ければ null)。カードの写しは元の見本で引く (前は引けずに道の当たりの組で数え、エッセンスの狙いが「外れ MOD」と出た、S-82。スイッチ boxShape) */
export const aimedOfSample = (id: string, item: StageItem): ReadonlySet<string> | null => AIMED.get(COPY_OF.get(item) ?? item)?.get(id) ?? null;
/**
 * カードの札が使う ☑。aimedOfSample は誰かが sampleAimed を呼んだ後しか引けない。組む間はつなぎを回さない (S-190) ので手を足した直後は誰も呼ばず、
 * 札が道の数え (heldSets) へ落ち、狙いが消えた箱の下のカードで残っている狙いが全部「外れ MOD」と出た (S-27e)。ここで見本の順に引く
 */
export function aimedOfCard(data: PatchData, doc: TreeDoc, id: string, item: StageItem): ReadonlySet<string> | null {
  const had = aimedOfSample(id, item);
  if (had) return had;
  for (let seed = 1; seed <= SINGLE_SEEDS; seed++) { sampleAimed(data, doc, id, seed); const am = aimedOfSample(id, item); if (am) return am; }
  return null;
}

export interface Judge {
  /** 箱の見本の中身 (見本ごとに違えば 2 つ以上。見本が作れない箱は null = 分からない) */
  contents(id: string): ReadonlySet<string> | null;
  /** 箱どうし: from と to の中身が同じ (両方分かって、見本の中身の組がそっくり同じ) */
  fitsBox(from: string, to: string): boolean;
  /** 人と箱: この人のアイテムの中身が to の見本の中身のどれかと同じ (to が分からない箱は合う扱い) */
  fitsItem(item: StageItem, aimed: ReadonlySet<string>, to: string): boolean;
  /** 中身が item と同じ箱 (手のある箱・完成 / 失敗の箱。浅い段・先に作った箱から。ok で更に絞る) */
  boxesOf(item: StageItem, aimed: ReadonlySet<string>, ok?: (id: string) => boolean): string[];
  /** 中身が item と同じ、決め (手・戻り・完成 / 失敗・分かれ目) の無い箱 (浅い段・先に作った箱から。S-64) */
  openOf(item: StageItem, aimed: ReadonlySet<string>): string[];
  /** 箱の見本ごとの ☑ で付いた狙い (作れない見本は入れない) */
  aimedOf(id: string): ReadonlySet<string>[];
  /** 箱の見本に消せる (✦ でない) ☑ の狙いがあるか (「狙いが消えた」の箱を作るか、setHand) */
  holdsAim(id: string): boolean;
  /** 箱の見本が全部、完成の狙いを ☑ で持っているか (スマホの自動の完成 S-91) */
  holdsAll(id: string): boolean;
  /** from の見本が to のカタリストの n % に届かなければ n (届けば 0、S-60c) */
  capShort(from: string, to: string): number;
  /** 箱の見本にカタリストの品質が入っているか (品質を上げた後、S-31b) */
  afterQuality(id: string): boolean;
}

/** 中身を作る途中で止めた印 (judgeMemo の fullUntil) */
const REJECTED = Symbol("rejected");

export function judgeMemo(data: PatchData, doc: TreeDoc): Judge {
  const memo = new Map<string, ReadonlySet<string> | null>(), looseMemo = new Map<string, ReadonlySet<string> | null>();
  // 配置で比べる (S-200 段階 2): 箱の中身 = 代表の品 1 個の枠、見本は代表の品だけ (打ち直さない)。出せない箱 (note) は作れない見本と同じ
  const fr = frameOfDoc(data, doc);
  /** 人の中身の鍵 (品質の % を抜く) */
  const own = frameKeyOf;
  const frameAt = (id: string): Frame | null => { const f = fr.frames.get(id); return f && !f.note ? f : null; };
  /** 代表の品の ☑ */
  const aimedAt = (id: string): ReadonlySet<string> => frameAt(id)?.aimed ?? new Set();
  /** 箱の作れる見本 (代表の品 1 つ) */
  const samples = (id: string): Array<{ seed: number; item: StageItem }> => { const f = frameAt(id); return f ? [{ seed: 1, item: f.item }] : []; };
  /** 箱の中身 (ふだんの比べ = 冒涜の発現済みの数を落とす。光のお告げの手のある箱と比べる時は full) */
  const contents = (id: string): ReadonlySet<string> | null => {
    if (looseMemo.has(id)) return looseMemo.get(id)!;
    const f = full(id), out = f ? new Set([...f].map(looseKey)) : null;
    looseMemo.set(id, out);
    return out;
  };
  /** to と比べる中身 (to が光のお告げの手のある箱なら冒涜の発現済みの数も) */
  const keyFor = (to: string, k: string): string => keyAt(k, needsDesecrated(doc, to), needsCrafted(doc, to));
  const setFor = (to: string, id: string): ReadonlySet<string> | null => {
    const d = needsDesecrated(doc, to), c = needsCrafted(doc, to);
    if (!d && !c) return contents(id);
    const f = full(id);
    return f ? new Set([...f].map((k) => keyAt(k, d, c))) : null;
  };
  /** 箱の中身 (代表の品の枠 1 つ)。stop を渡すと、その中身で stop が真なら REJECTED を返す (覚えない、S-71b ⑲) */
  const fullUntil = (id: string, stop?: (k: string) => boolean): ReadonlySet<string> | null | typeof REJECTED => {
    if (memo.has(id)) return memo.get(id)!;
    const f = frameAt(id), out = f ? new Set([f.key]) : null;
    if (f && stop?.(f.key)) return REJECTED;
    memo.set(id, out);
    return out;
  };
  const full = (id: string): ReadonlySet<string> | null => fullUntil(id) as ReadonlySet<string> | null;
  const depth = (id: string): number => { let n = 0; for (let b = doc.boxes[id]; b?.parent; b = doc.boxes[b.parent]) n++; return n; };
  const seq = (id: string): number => (id === "start" ? -1 : Number(/\d+$/.exec(id)?.[0] ?? 0));
  let order: string[] | null = null;
  const targets = (): string[] => (order ??= Object.values(doc.boxes).filter((b) => !!b.hand || !!b.done).map((b) => b.id).sort((x, y) => depth(x) - depth(y) || seq(x) - seq(y)));
  const capShort = (from: string, to: string): number => {
    // 触媒のお告げの手は品質が要るので、品質の無い人の箱とは同じ枠にしない (打てずに止まった、S-60c)
    if (doc.boxes[to]?.hand?.omens.includes(CATALYSING) && samples(from).some((s) => !(s.item.quality ?? 0))) return 1;
    return catalystTo(doc, to) && samples(from).some((s) => !reachesCatalyst(doc, to, s.item)) ? catalystTo(doc, to) : 0;
  };
  return {
    contents,
    capShort,
    fitsBox(from, to) {
      // 箱どうしは枠 (配置) だけで比べる。to に置いた手 (触媒のお告げ・カタリストの n %・光のお告げ・骨・エッセンス) は見ない
      // (11-06 オーナー「同じ枠判定は見るところは枠だけでええからなその後のカレンシーは見なくていいから」、S-60c・S-60d の箱どうしの所を外した)
      if (from === to || !doc.boxes[from] || !doc.boxes[to]) return false;
      // to の中身に無い中身が from の見本に出たら、from の中身を作り切らずに違う枠 (同じ枠を探す自動の ↩ は、ほとんどの候補と最初の見本で違う。S-71b ⑲)
      const b = contents(to);
      if (!b) return false;
      if (fullUntil(from, (k) => !b.has(looseKey(k))) === REJECTED) return false;
      const a = contents(from);
      return !!a && a.size === b.size && [...a].every((k) => b.has(k));
    },
    fitsItem(item, aimed, to) {
      const b = setFor(to, to);
      return (!b || b.has(keyFor(to, own(contentOf(data, doc, item, aimed))))) && doneOk(doc, to, item) && reachesCatalyst(doc, to, item);
    },
    boxesOf(item, aimed, ok) {
      const k = own(contentOf(data, doc, item, aimed));
      return targets().filter((id) => !!setFor(id, id)?.has(keyFor(id, k)) && doneOk(doc, id, item) && reachesCatalyst(doc, id, item) && (!ok || ok(id)));
    },
    openOf(item, aimed) {
      const k = own(contentOf(data, doc, item, aimed));
      return Object.values(doc.boxes).filter((b) => b.id !== "start" && !b.hand && !b.back && !b.done && !b.split && !!setFor(b.id, b.id)?.has(keyFor(b.id, k))).map((b) => b.id).sort((x, y) => depth(x) - depth(y) || seq(x) - seq(y));
    },
    aimedOf: (id) => samples(id).map(() => aimedAt(id)),
    // 置き石は完成形に無いので数えない (消えても狙いが消えたにしない、S-33)。途中の狙いは数える (S-33b)
    holdsAim: (id) => { const mid = new Set(midAims(doc).map((a) => a.modId)), placed = new Set(placedAims(doc).map((a) => a.modId).filter((m) => !mid.has(m))); return samples(id).some((s) => { const am = aimedAt(id); return [...s.item.prefixes, ...s.item.suffixes].some((m) => !m.fractured && am.has(m.modId) && !placed.has(m.modId)); }); },
    holdsAll(id) { const goals = doc.memoAims ?? [], ss = samples(id); return goals.length > 0 && ss.length > 0 && ss.every(() => { const am = aimedAt(id); return goals.every((g) => am.has(g.modId)); }); },
    afterQuality: (id) => samples(id).slice(0, 1).some((s) => !!s.item.qualityTag && (s.item.catalystQuality ?? s.item.quality ?? 0) > 0),
  };
}
