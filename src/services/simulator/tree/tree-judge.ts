/**
 * tree-judge.ts — 箱の判定は 2 つだけ (S-50b。10-29 オーナーの大本「箱の判定は箱に描いている中身で決める」「手ごとの特別扱いはしない」)。
 * 中身 (S-60) = 狙いの組 (付いている完成形の狙い、段は完成形以上、☑ で付いた物) + 体 (tree-box-shape の bodyOf: 側ごとの外れの数と種類・✦ の側・レアリティ) + 品質 (値と触媒の種類)。
 * 箱の中身はその箱の見本 (S-74、箱に描いているカード) の実物から。道から足していく数え (heldSets・pathHelds・形の鍵) は使わない。
 *   箱どうし fitsBox(from, to) = from の人が to へ行けるか (自動のつなぎ・同じ手なら戻る・まとめ・自動の ↩ の見直し・精査の戻り先・当たりの統合)
 *   人と箱 fitsItem(item, aimed, to) / boxesOf = この人のアイテムはその箱か、違えば中身の同じ箱 (回す時の行き先・消去の直線の止まり・精査の辿り)
 * ☑ で付いた狙い (aimed) はアイテムの実物ごとの印: 見本は見本の打ち方の順に、人は回した順に (当たりの箱に着いたらその札の MOD、消えたら外れる。☑ の無い手で付いた
 * 完成形の MOD は外れ = S-22・S-60。全部消えてよい消去の後は全部外れ、残したい MOD の消去の後はその MOD だけ)。カードの「外れ MOD」の札 (tree-row-tags) と同じ見方。
 * 呼ぶ側は自前の比べを持たない。1 回の組み替え・回し・精査の中で judgeMemo を 1 つ作って使う (木を替えたら作り直す)
 */
import { kindOf, mulberry32, occupiedFamiliesOf, OMEN_KEY, type PatchData, type StageItem, type StageMod } from "../../craft-stage/engine";
import { effectOf, isBone } from "./tree-hands";
import { aimHeldOn, isAimMod } from "./tree-aim";
import { sameAimMod } from "./tree-hand-core";
import { bodyOf } from "./tree-box-shape";
import { aimedList, isMissMod, missAims, type MissAims } from "./tree-miss";
import { aimOpts, playHand, sampleOf, SINGLE_SEEDS, startGoalAims, targetsOf } from "./tree-sample";
import { isWhittleHand, lvClassOf, lvPart } from "./tree-whittle";
import { frameHandOf, whittleCompare } from "./tree-whittle-scene";
import { bothOf, boxAims, fractureMarks, keepCut, type Aim, type Hand, type TreeDoc } from "./tree-model";
import { goneOf, gotOf, isSwapEssence, keptAimsOf } from "./tree-keep";
import { essenceModOf, midAims, placedAims } from "./tree-veil";
import { frameKeyOf, frameOfDoc, type Frame } from "./tree-frame";
import { treeOrder } from "./tree-order";
import { modText, tr } from "../../../i18n/lang";
import { nameOfKey } from "../../../state/for-share/craft-stage-shelf";
import { RUNE_PREFIX } from "../../craft-stage/stage-runes";

/**
 * 箱の中身の狙いの組に入る札 = 完成形の狙い + 発現で選んだ置き石 (S-33) + 木の手で残したい MOD に ☑ した MOD (S-27b・S-33c、11-08)。
 * ☑ した完成形に無いエッセンスは、その後の箱でも ☑ の印のある人には狙い (消えたら「狙いが消えた」)。前は完成形の札だけで絞り、☑ しても外れに戻って
 * 「エッセンスが消えて外れが残った」と「外れが消えてエッセンスが残った」が同じ枠で合流した (11-08 オーナー「エッセンスかも扱い　残す方の挙動かなこれ」)
 */
const contentAims = (data: PatchData, doc: TreeDoc): Aim[] => [...(doc.memoAims ?? []), ...placedAims(data, doc), ...keptOfTree(data, doc), ...midAims(data, doc)];
/** 木の手の残したい MOD (☑) のうち完成形に無い物 (同じ MOD かはエンジンの当て方 sameAimMod) */
const keptOfTree = (data: PatchData, doc: TreeDoc): Aim[] => {
  const out: Aim[] = [];
  for (const b of Object.values(doc.boxes)) for (const a of [...(b.hand?.keep ?? []), ...(b.handBack?.keep ?? [])]) if (![...(doc.memoAims ?? []), ...out].some((g) => sameAimMod(data, g, a))) out.push(a);
  return out;
};
/** アイテムに付いている名前の印になりうる MOD (完成形の狙い (段は完成形以上)・置き石・残したい MOD・木の手のエッセンス / 合金)。回す時の印の絞りも同じ物 (tree-run) */
export const goalsOn =(data: PatchData, doc: TreeDoc, it: StageItem): Set<string> => new Set(contentAims(data, doc).filter((a) => aimHeldOn(data, it, a, { sameText: true })).map((a) => a.modId));
/** 始まりの ☑ (始まりの MOD の完成形の狙いと ✦ の印) */
export function startAimed(data: PatchData, doc: TreeDoc, it: StageItem): ReadonlySet<string> {
  const on = goalsOn(data, doc, it);
  return new Set([...startGoalAims(data, doc), ...fractureMarks(doc)].map((a) => a.modId).filter((id) => on.has(id)));
}
/** 打つ前の印のうち、この手で消えない MOD の物 (S-27e、候補の外は自動で残したい MOD。お告げの有無では分けない) */
export function outsideAimed(data: PatchData, doc: TreeDoc, h: Hand | null | undefined, prev: ReadonlySet<string> | null | undefined, before: StageItem | null | undefined): string[] {
  if (!h || !prev || !before) return [];
  // 消えうるかは窓の候補と同じ数え (削減は外れを付きうる段に差し替えた結果も、S-27d の頭の 1 本)
  const gone = goneOf(data, before, h.currency, h.omens, aimedList(data, doc, prev));
  if (!gone) return [];
  const mods = [...before.prefixes, ...before.suffixes].filter((m) => gone.has(m.modId)), o = aimOpts(data);
  return [...prev].filter((id) => { const g = contentAims(data, doc).find((a) => a.modId === id), ts = g ? targetsOf(data, [g]) : null; return !mods.some((m) => m.modId === id || (ts && isAimMod(m, ts, o))); });
}
/** 箱 boxId に着いた時の ☑ (prev = 着く前、item = 着いた時のアイテム、before = 打つ前のアイテム。打たずに着いた時は無し) */
export function nextAimed(data: PatchData, doc: TreeDoc, prev: ReadonlySet<string>, boxId: string, item: StageItem, before?: StageItem | null): ReadonlySet<string> {
  const b = doc.boxes[boxId];
  // ヒネコラのハズレ (打たない、S-39) の箱は手を使わないので印も前のまま
  if (!b || b.seen) return prev;
  // 消える手 (カオス・パーフェクトエッセンス・骨) の残したい MOD も消去と同じ (S-27d)
  // パーフェクトエッセンスは付く MOD が決まった入れ替えなので、☑ しなかった元の MOD も狙いのまま (消えた物だけ外れる。S-29 のエッセンスの枝、11-07)
  const keep = isSwapEssence(b.parent ? doc.boxes[b.parent]?.hand : null) ? null : keepCut(doc, b) ?? keptAimsOf(data, doc, b.parent ? doc.boxes[b.parent]?.hand : null);
  // 消去の後も ✦ の印の狙いは残る (消去では消えない。S-28b2: 前は全部消えてよい消去の後に ✦ まで外れに数え、✦ だけの箱がスタートと別の中身になった、木 oWkFcwYX の b8)
  // 残したい MOD を聞く手の後は、候補なのに ☑ しなかった MOD は付け方に関わらず外れ (途中の狙い = エッセンスも。S-27e の基本動作 1 本、11-07。
  // 前はカオス・骨の後だけ途中の狙いを残した = midKept)。候補の外 (お告げで触らない側) は outsideAimed で残る
  const base = new Set(keep ? [...[...keep, ...fractureMarks(doc)].map((a) => a.modId), ...outsideAimed(data, doc, b.parent ? doc.boxes[b.parent]?.hand : null, prev, before)] : prev);
  if (b.out === "hit" && b.aim) for (const a of [...boxAims(b), ...(b.anyOf ?? [])]) base.add(a.modId);
  // 「2 つとも付いた」の当たりの箱 (鍵 a:、S-22d) は付いた組の狙いを全部 ☑ (前は箱の狙い 1 つだけで、もう 1 つがカードで「外れ MOD」と出た、11-10 猿 /r/bI798yYJ b4)
  if (b.out === "hit") for (const id of bothOf(b.junkKey)) base.add(id);
  // 狙いが消えた・狙いが付いた の箱は付いた狙いも ☑ (S-27d、ズレ 9)
  if (b.out === "lost") for (const id of gotOf(b.junkKey)) base.add(id);
  // 木の手のエッセンス / 合金で付けた完成形に無い MOD は、付いた時に名前の印 (カードで名前のまま、S-33c)。外れるのは後の残したい MOD の窓で選ばれなかった時だけ (上の keep)。
  // 11-08 オーナー「エッセンスと合金 一度付けた奴で名前がハズレＭＯＤになるのは残すを選択しなかった場合とかどうかね」
  const e = essenceModOf(b.parent ? doc.boxes[b.parent]?.hand?.currency : undefined);
  if (e) for (const a of midAims(data, doc)) if (sameAimMod(data, a, { modId: e, tier: 99 })) base.add(a.modId);
  const on = goalsOn(data, doc, item);
  return new Set([...base].filter((id) => on.has(id)));
}
/**
 * アイテムの中身の鍵 (名前の印の組 # 体 # 品質)。名前の印 (aimed) = 箱のカードで名前で出る MOD: ☑ した完成形の狙い・置き石・木の手で付けたエッセンス / 合金
 * (付いた時に印が付き、残したい MOD の窓で選ばれなければ外れる。nextAimed)。印の無い MOD は外れで、外れは側ごとの数だけ (種類は見ない)。
 * カードの札 (tree-row-tags) も同じ印を見るので、カードの名前が同じなら同じ枠 (S-60、11-08 オーナー「名前一致で枠を決めるって感じがまるいか？」
 * 「名前ありだけどハズレMOD扱いにしようが、途中のエッセンス付与で狙いMODとしてみようが、枠おなじなんだからあわせるべきじゃろ」。前はエッセンスを付けた所では外れ、
 * 残したい MOD に選んだ後は狙いと数え、同じ MOD の 10 段目と 13 段目が別の枠になった)。
 * 体 (bodyOf) の外れは印の札での外れの式 1 本 (tree-miss の isMissMod。同じ文の別 modId も当たり = 印の札と外れの両方には数えない)
 */
export function contentOf(data: PatchData, doc: TreeDoc, it: StageItem, aimed: ReadonlySet<string>): string {
  const c = contentParts(data, doc, it, aimed);
  // 狙いとして発現した冒涜の MOD の数 (#a。骨の手のある箱と比べる時だけ見る = 冒涜の MOD は 1 品 1 つ E-60。外れの冒涜は #d)
  const da = [...it.prefixes, ...it.suffixes].filter((m) => m.desecrated && !m.unrevealed && !m.fractured && !isMissMod(m, c.miss)).length;
  return `${[...c.keys].sort().join(",")}${frameOf(it)}#${junkOne(c.body)}#a${da}`;
}
/** 中身の鍵の部分 (keys = 印の札、miss = 印の札での外れの式の相手、body = 体)。contentOf と止まりの文 (contentDiff) が同じ物を使う */
function contentParts(data: PatchData, doc: TreeDoc, it: StageItem, aimed: ReadonlySet<string>): { keys: Set<string>; miss: MissAims; body: string } {
  const goals = contentAims(data, doc).filter((a) => aimed.has(a.modId)), opts = aimOpts(data), miss = missAims(data, goals);
  const keys = new Set<string>();
  for (const m of [...it.prefixes, ...it.suffixes]) { const g = goals.find((a) => isAimMod(m, targetsOf(data, [a]), opts)); if (g) keys.add(g.modId); }
  return { keys, miss, body: bodyOf(data, doc, it, miss) };
}
/**
 * この人 (item・aimed) が箱 to の代表の品 (配置) と違う所の言葉 (止まりの文、S-64)。判定 (fitsItem) と同じ部品で比べ、違う狙い・外れは MOD の名前で出す。
 * 前は見本と人の側の数だけを出し、違いが側の数の外にあると「見本 (プレ 2・サフィ 1) と形の違う人 (プレ 2・サフィ 1)」になった (要望 b3956330)
 */
export function contentDiff(data: PatchData, doc: TreeDoc, it: StageItem, aimed: ReadonlySet<string>, to: string): string[] {
  const f = frameOfDoc(data, doc).frames.get(to);
  if (!f || f.note) return [];
  const a = contentParts(data, doc, it, aimed), b = contentParts(data, doc, f.item, f.aimed), opts = aimOpts(data), out: string[] = [];
  const aimText = (x: StageItem, id: string): string => { const g = contentAims(data, doc).find((y) => y.modId === id), m = g && [...x.prefixes, ...x.suffixes].find((y) => isAimMod(y, targetsOf(data, [g]), opts)); return m ? modText(m) : id; };
  for (const id of [...a.keys].sort()) if (!b.keys.has(id)) out.push(tr(`狙い「${aimText(it, id)}」が付いている`, `has the target "${aimText(it, id)}"`));
  for (const id of [...b.keys].sort()) if (!a.keys.has(id)) out.push(tr(`狙い「${aimText(f.item, id)}」が無い`, `lacks the target "${aimText(f.item, id)}"`));
  // 体 (bodyOf の `n.c.x.u|n.c.x.u|✦…|レアリティ`): 外れの数 (種類は見ない = junkOne)・未発現、光のお告げ・骨 / エッセンスの手の箱へは冒涜 / クラフトの外れの数も (keyFor と同じ)
  const pa = a.body.split("|"), pb = b.body.split("|");
  // 名前を出す外れは体と同じ外れの式 (前は modId で見る写しで、同じ文の別 modId の狙いを外れの名前に出しえた)
  const isJunk = (m: StageMod): boolean => !m.fractured && !m.unrevealed && isMissMod(m, a.miss);
  (["prefix", "suffix"] as const).forEach((side, i) => {
    const [n = 0, c = 0, x = 0, u = 0] = (pa[i] ?? "").split(".").map(Number), [n2 = 0, c2 = 0, x2 = 0, u2 = 0] = (pb[i] ?? "").split(".").map(Number);
    const ja = side === "prefix" ? "プレ" : "サフィ";
    const names = (side === "prefix" ? it.prefixes : it.suffixes).filter(isJunk).map((m) => modText(m)).join(tr("・", ", "));
    if (n + c + x !== n2 + c2 + x2) out.push(tr(`${ja}の外れ ${n + c + x} (見本 ${n2 + c2 + x2})${names ? `: ${names}` : ""}`, `${n + c + x} ${side} miss (example ${n2 + c2 + x2})${names ? `: ${names}` : ""}`));
    else if (needsDesecrated(doc, to) && x !== x2) out.push(tr(`${ja}の冒涜の外れ ${x} (見本 ${x2})`, `${x} desecrated ${side} miss (example ${x2})`));
    else if (needsCrafted(doc, to) && c !== c2) out.push(tr(`${ja}のエッセンスの外れ ${c} (見本 ${c2})`, `${c} essence ${side} miss (example ${c2})`));
    if (u !== u2) out.push(tr(`${ja}の未発現 ${u} (見本 ${u2})`, `${u} unrevealed ${side} (example ${u2})`));
  });
  if (pa[2] !== pb[2]) out.push(tr("フラクチャーの付き方が違う", "different fractured mods"));
  if (pa[3] !== pb[3]) out.push(tr("レアリティが違う", "different rarity"));
  // 枠 (frameOf を配置の鍵 frameKeyOf にした物 = エンチャント・刺さったルーン・予見済み。品質は見ない = S-60b)
  const [, , ea = ""] = frameKeyOf(frameOf(it)).split("~"), [, , eb = ""] = frameKeyOf(frameOf(f.item)).split("~");
  if (ea !== eb) out.push(tr("エンチャントが違う", "different enchantment"));
  const ra = runesOf(it), rb = runesOf(f.item), runeName = (s: string): string => (s ? s.split("+").map((en) => nameOfKey(`${RUNE_PREFIX}${en}`, it)).join(tr("・", ", ")) : tr("なし", "none"));
  if (ra !== rb) out.push(tr(`刺さったルーンが違う (${runeName(ra)} / 見本 ${runeName(rb)})`, `different runes (${runeName(ra)} / example ${runeName(rb)})`));
  if ((it.sockets ?? 0) !== (f.item.sockets ?? 0)) out.push(tr(`ソケット ${it.sockets ?? 0} (見本 ${f.item.sockets ?? 0})`, `${it.sockets ?? 0} sockets (example ${f.item.sockets ?? 0})`));
  if (!!it.foreseen !== !!f.item.foreseen) out.push(tr("予見済みかが違う", "foreseen differs"));
  return out;
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
  const miss = missAims(data, contentAims(data, doc).filter((a) => aimed.has(a.modId))), out = new Set<string>();
  for (const m of near) if (isMissMod(m, miss)) for (const f of famsOf(m)) out.add(f);
  const r = [...out].sort().join("+");
  memo.set(mk, r);
  return r;
}
/** 外れの印の覚え (品ごと) */
const MARKS = new WeakMap<StageItem, Map<string, string>>();
/**
 * 枠に入れるエンチャント・予見済み。全部同じ時だけ同じ枠 (S-60b)。品質 (値・カタリストの種類・カタリストの品質) は 11-08 から入れない (オーナー「品質はやっぱり無視だな。
 * 同じ箱リストにはいれないでおこう」「カタリストって絶対にしょくばい使うならそのカタリストで上書きする」。前は 11-04「品質も枠に入れて全部同じ時だけで」)。
 * 品質の欄 ~q0.. は配置の鍵 (tree-frame の frameKeyOf) と理由の文 (contentDiff) の並びのために空で残す
 * 品に刺さっているルーン (augments) は名前の組で入れる (順は見ない、11-05)。刺したルーンで確率・打てる手が変わるので別の状態 (11-07 オーナー「ルーンは手で付けたところとかでおｋ
 * ツリーはあくまでもゲーム仕様にして」= S-60e)。ルーンの MOD の印 (m.rune = コルの狩りを差すと混ざるマークスマンの MOD) は入れない (外れは何の MOD でも外れ。前は入れていて、
 * 外れがマークスマンの MOD の人だけ別の枠になって止まった = 要望 b3956330)。ソケットの数も入れる (ルーンの手は空きがあれば空きへ、無ければ左から置き換える = 空きの有る無しで結果が違う。ソケットを足すのは熟練工のオーブ、エンジンの applyRune)
 */
const frameOf = (it: StageItem): string => `~q0..~e${it.enchant?.id ?? ""}.${it.enchant2?.id ?? ""}~r${runesOf(it)}.${it.sockets ?? 0}${it.foreseen ? "~f" : ""}`; // 予見済み (ヒネコラ、S-39) も別の枠
/** 刺さっているルーンの名前の組 (順は見ない) */
const runesOf = (it: StageItem): string => (it.augments ?? []).map((a) => a.en).sort().join("+");
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
export const looseKey = (k: string): string => k.replace(/#d\d+\.\d+#c\d+\.\d+#a\d+$/, "");
/** d = 冒涜の発現済みの数を残す、c = クラフト MOD (エッセンス) の数を残す */
const keyAt = (k: string, d: boolean, c: boolean, a = false): string => k.replace(/#d(\d+\.\d+)#c(\d+\.\d+)#a(\d+)$/, (_, xd: string, xc: string, xa: string) => `${d ? `#d${xd}` : ""}${c ? `#c${xc}` : ""}${a ? `#a${xa}` : ""}`);
/**
 * 冒涜の発現済みの外れの数も合わせる箱か: 光のお告げ (冒涜の MOD しか消さない) を含む手 (10-29 深夜オーナー「いいかな　それでなおるなら万々歳」) と、
 * 骨の手 (冒涜の MOD は 1 つまで E-60。発現済みの外れを持つ人は打てない、S-60d)
 */
export const needsDesecrated = (doc: TreeDoc, id: string): boolean => { const h = doc.boxes[id]?.hand; return !!h && (h.omens.includes(LIGHT) || isBone(h.currency)); };
/** 骨の手の箱か (冒涜の MOD は 1 品 1 つ E-60: 狙いとして発現した冒涜を持つ人も打てないので、その数も合わせる。11-11 枝のフルチェックの満杯 + 骨の発現) */
export const needsBoneFree = (doc: TreeDoc, id: string): boolean => { const h = doc.boxes[id]?.hand; return !!h && isBone(h.currency); };
/** クラフト MOD を付ける手 (エッセンス・液化した感情) の箱か (クラフト MOD は 1 品 1 つ E-11h。クラフト MOD の外れを持つ人は打てないので、その数も合わせる、S-60d) */
export const needsCrafted = (doc: TreeDoc, id: string): boolean => { const h = doc.boxes[id]?.hand; return !!h && (effectOf(h.currency) === "essence" || kindOf(h.currency) === "emotion"); };
const LIGHT = OMEN_KEY.light;

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
  // 判定と同じ ☑ = 配置の ☑ (S-200、箱の代表の品と同じ道で数える)。見本の道で数えると、残したい MOD の手の後で前の箱の ☑ が配置と食い違い、
  // お告げで触らない側の狙いがカードだけ「外れ MOD」と出た (11-07 カオス + 左側の抹消のお告げの打った後、S-27e)。画面の部品だけが呼ぶ (配置の計算の中では呼ばない)。
  // 枝の来ない箱 (nobranch) も配置の印 (その下の箱は配置から出すので、カードと下の箱が同じ印から)
  const f = frameOfDoc(data, doc).frames.get(id);
  if (f && (!f.note || f.note === "nobranch")) return f.aimed;
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
  /**
   * 狙いが消えた箱 to へ枝で着いた人: どの狙いが消えたかは見ず、☑ の狙いの数と体・枠が同じなら同じ箱 (箱の鍵 = 狙いが消えた + 側の増減・未発現。
   * 付く MOD の決まっていない骨・カオスは「狙いが消えた」1 箱 = オーナーの決め。前は中身の比べで消えた狙いの違う人が止まった = bone3、11-07 エミュでの枝の確かめ)
   */
  fitsLost(item: StageItem, aimed: ReadonlySet<string>, to: string): boolean;
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
  /** 箱の見本にカタリストの品質が入っているか (品質を上げた後、S-31b) */
  afterQuality(id: string): boolean;
  /** from の代表の品に to の手が打てるか (自動の ↩ の先を選ぶ時。枠の比べ fitsBox は手を見ないまま、S-60c。11-11 骨の発現の後の外れが骨の箱へ戻って打てなかった) */
  playsAt(from: string, to: string): boolean;
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
  const keyFor = (to: string, k: string): string => keyAt(k, needsDesecrated(doc, to), needsCrafted(doc, to), needsBoneFree(doc, to));
  const setFor = (to: string, id: string): ReadonlySet<string> | null => {
    const d = needsDesecrated(doc, to), c = needsCrafted(doc, to), a = needsBoneFree(doc, to);
    if (!d && !c) return contents(id);
    const f = full(id);
    return f ? new Set([...f].map((k) => keyAt(k, d, c, a))) : null;
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
  let order: string[] | null = null;
  // 並びは木の並び (S-50e の足し、tree-order。前は段と箱の番号で、開き直すと回す人の移り先が入れ替わりえた)
  const targets = (): string[] => (order ??= Object.values(doc.boxes).filter((b) => !!b.hand || !!b.done).map((b) => b.id).sort(treeOrder(doc)));
  /** 中身の鍵の ☑ の狙いの札 (先頭から最初の枠 ~ まで) を数だけにした物 (狙いが消えた箱、fitsLost) */
  const aimCount = (k: string): string => { const i = k.indexOf("~"), head = i < 0 ? k : k.slice(0, i); return `${head ? head.split(",").length : 0}${i < 0 ? "" : k.slice(i)}`; };
  // 削減の手前の枠 (S-65c、鍵 l:): 中身の比べは MOD レベルを見ないので、枠の組 (外れの MOD レベルが低い・同じ・高い) は箱の鍵と人の品で別に見る
  const lvOf = (id: string): string | null => lvPart(doc.boxes[id]?.junkKey);
  // 比べるのは枠の削減の手のお告げで消える側の MOD だけ (tree-whittle-pre と同じ)
  // 削減の手は枠の組の手 (手の無い兄弟の枠も、tree-whittle-scene の frameHandOf)
  const lvFits = (item: StageItem, aimed: ReadonlySet<string>, to: string): boolean => { const c = lvOf(to); if (!c) return true; const w = whittleCompare(data, doc, frameHandOf(doc, to), aimed, item); return lvClassOf(item, w.miss, w.side) === c; };
  return {
    contents,
    playsAt(from, to) {
      const h = doc.boxes[to]?.hand, f = h ? frameAt(from) : null;
      if (!h || !f || f.note) return true;
      const r = playHand(data, f.item, { ...h, repeat: null }, mulberry32(1));
      return r.applied || !!r.random;
    },
    fitsBox(from, to) {
      // 箱どうしは枠 (配置) だけで比べる。to に置いた手 (触媒のお告げ・カタリストの n %・光のお告げ・骨・エッセンス) は見ない
      // (11-06 オーナー「同じ枠判定は見るところは枠だけでええからなその後のカレンシーは見なくていいから」、S-60c・S-60d の箱どうしの所を外した)
      if (from === to || !doc.boxes[from] || !doc.boxes[to]) return false;
      const lf = lvOf(from), lt = lvOf(to);
      if (lf !== lt) {
        // 削減の手前の枠 (l:) を持たない箱 (削減を打った後など) は中身 (名前の印は ☑ どおり) が同じなら枠へ戻る (S-65c ⑩、11-10 オーナー「おｋ」。前は札で比べ、中身が全部同じでも枠に戻れず
        // 人が削減の枠を足し続けた = 要望 0b039a19)。戻り先は外れの MOD レベルの組が合う枠か、組の頭 (削減の手を持つ枠)。回す人は着いた所で lvFits が枠へ分ける
        const f = lf || !lt ? null : frameAt(from);
        if (!f || (!lvFits(f.item, f.aimed, to) && !isWhittleHand(doc.boxes[to]!.hand))) return false;
      }
      // to の中身に無い中身が from の見本に出たら、from の中身を作り切らずに違う枠 (同じ枠を探す自動の ↩ は、ほとんどの候補と最初の見本で違う。S-71b ⑲)
      const b = contents(to);
      if (!b) return false;
      if (fullUntil(from, (k) => !b.has(looseKey(k))) === REJECTED) return false;
      const a = contents(from);
      return !!a && a.size === b.size && [...a].every((k) => b.has(k));
    },
    fitsItem(item, aimed, to) {
      const b = setFor(to, to);
      return (!b || b.has(keyFor(to, own(contentOf(data, doc, item, aimed))))) && lvFits(item, aimed, to);
    },
    fitsLost(item, aimed, to) {
      const b = setFor(to, to);
      if (!lvFits(item, aimed, to)) return false;
      if (!b) return true;
      const k = aimCount(keyFor(to, own(contentOf(data, doc, item, aimed))));
      return [...b].some((x) => aimCount(x) === k);
    },
    boxesOf(item, aimed, ok) {
      const k = own(contentOf(data, doc, item, aimed));
      return targets().filter((id) => !!setFor(id, id)?.has(keyFor(id, k)) && lvFits(item, aimed, id) && (!ok || ok(id)));
    },
    openOf(item, aimed) {
      const k = own(contentOf(data, doc, item, aimed));
      return Object.values(doc.boxes).filter((b) => b.id !== "start" && !b.hand && !b.back && !b.done && !b.split && !!setFor(b.id, b.id)?.has(keyFor(b.id, k)) && lvFits(item, aimed, b.id)).map((b) => b.id).sort(treeOrder(doc));
    },
    aimedOf: (id) => samples(id).map(() => aimedAt(id)),
    // 置き石は完成形に無いので数えない (消えても狙いが消えたにしない、S-33)
    // 当たるかは外れの式 1 本 (☑ の完成形の狙いに当たる = 外れでない。同じ文の別 modId も持っている狙い。前は modId で見た)
    holdsAim: (id) => { const am = aimedAt(id), miss = missAims(data, (doc.memoAims ?? []).filter((g) => am.has(g.modId))); return samples(id).some((s) => [...s.item.prefixes, ...s.item.suffixes].some((m) => !m.fractured && !isMissMod(m, miss))); },
    holdsAll(id) { const goals = doc.memoAims ?? [], ss = samples(id); return goals.length > 0 && ss.length > 0 && ss.every(() => { const am = aimedAt(id); return goals.every((g) => am.has(g.modId)); }); },
    afterQuality: (id) => samples(id).slice(0, 1).some((s) => !!s.item.qualityTag && (s.item.catalystQuality ?? s.item.quality ?? 0) > 0),
  };
}
