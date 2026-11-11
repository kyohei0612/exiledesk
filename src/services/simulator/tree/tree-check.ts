/**
 * tree-check.ts — ルート精査 = 最終チェック (2026-10-22 オーナー「今どこで止まるのか、今の状態で付くのかをチェック…穴がある所をエラー表記で」)。費用は出さない。
 * 11-11 から人を回さない (オーナー「んでまだ最終チェック何人か回してるよね。やめさせてくれ。普通に全枠2周して未設定やバグないかのチェックが最終チェックだ」
 * 「基本2週したら止まるかどうか分かるよな」、S-201 ②)。見るのは: 木のチェック (tree-frame-check = 打たずに代表の品で全部の枠を 1 周 + ↩ で着く形でもう 1 周。
 * 行き先の無い結果・打てない手・当たるまでが当たらない形)、0) 形の違う箱への戻り、1) 決めていない芽・MOD を選んでいない当たり、2) 完成に着かない道・抜けられない輪。
 * 前の 4) 5 人をエンジンで辿る・5) 30 人回す (10-22 靴を白紙から組んで足した物) と、押した後の試しの 30 人は外した
 */
import { limitOf, mulberry32, sideOfMod, SIDES, type PatchData, type StageItem } from "../../craft-stage/engine";
import { aimHeldOn, reachableAims } from "./tree-aim";
import { isMissMod, missAims } from "./tree-miss";
import { CATALYSING, effectOf, engineOmens } from "./tree-hands";
import { nameOfKey } from "../../../state/for-share/craft-stage-shelf"; // 名前はクラフト台の棚と同じ (データの名前、10-28 オーナー「名前はエンジンのデータベース参照で固定」)
import { fractureMarks, type TreeBox, type TreeDoc } from "./tree-model";
import { aimsOf, handAims, sampleOf, startItemOf } from "./tree-sample";
import type { TreeRunResult } from "./tree-run";
import { isGrayBox } from "./tree-junk-tidy";
import { depthRows } from "./tree-row-tops";
import { MATCH, RESTART } from "./tree-shape";
import { withTreeTune } from "./tree-tune";
import { frameIssues } from "./tree-frame-check";
import { judgeMemo } from "./tree-judge";
import { canPlay } from "./tree-judge-link";
import { modText, tr } from "../../../i18n/lang";

type CheckKind = "open" | "unfinished" | "noAim" | "cantUse" | "neverHit" | "noDone" | "loop" | "quality" | "unwanted" | "noMatch" | "noCatalyst" | "unexpected" | "stuck" | "carry" | "omenWaste" | "shape" | "fixedFull" | "shapeBody" | "orphan" | "frameMiss" | "frameDone";
/** 合格を止めない知らせ (shapeBody = 戻り先と外れの数・側だけが違う。回す時は実物で形の合う箱へ移る、S-62・S-73、10-28 仮) */
/** 合格を止めない知らせ: 戻り先と外れの体だけ違う (S-73)・完成にしていない完成の箱 (S-77、印は付けるが止めない) */
export const NOTICE_KINDS: readonly CheckKind[] = ["shapeBody", "unfinished", "frameMiss", "frameDone"];
/**
 * 100 人回すを止める足りない所 = 未設定 (open) だけ (S-205 ③、11-07 オーナー「未設定がないならそのまま数値だしておｋ」)。
 * 止まり・輪・打てない手などは一覧に知らせとして残し、回した結果に止まった人の数で出る
 */
export const blocksRun = (k: CheckKind): boolean => k === "open";
/** text = 1 行の要約、detail = 開いた時だけ出す詳しい文 (止まりの訳、11-08) */
export interface CheckIssue { boxId: string; kind: CheckKind; text: string; detail?: string }

/** 精査の進み (walk = 5 人を辿る、run = 30 人回す) */
export interface CheckProgress { phase: "walk" | "run"; n: number; of: number; /** ここまでに見つかった穴 (辿った人から順に足す、10-22 オーナー「読み込みながら徐々に出す」) */ partial: CheckIssue[] }
/** 手も戻りも完成も無い箱の文 (holds = 完成の狙いが全部そろっている) */
// 文は「何が起きているか。何をすればよいか」の 2 文 (11-08 オーナー「普通に日本語がいみわからんな要約の」→ 案に「それでおｋ」)
const openText = (b: TreeBox, holds: boolean): string => (holds ? tr("狙いがそろっていますが、完成にしていません。『完成』を押してください", "All targets are here, but the box isn't finished. Press Finish") : b.out === "start" ? tr("最初の手が決まっていません。＋で手を足してください", "No first craft yet. Add one with ＋") : tr("次の手が決まっていません。＋で手を足すか、『完成』か『失敗』を押してください", "No next step yet. Add a craft with ＋, or press Finish or Fail"));
const noDoneText = (): string => tr("完成の箱がまだありません。狙いがそろった箱で『完成』を押してください", "No finished box yet. Press Finish on a box that has all targets");
/**
 * 「完成の箱が無い」の印 (S-89b・S-77・S-89c): 末端の箱 (手・戻り・完成の無い箱、スタートは除く) の当たり → ほかの末端に「完成の箱が無い」。
 * 末端が無い木 (どの箱にも手か ↩ が付いた組み終わった木) は一番深い段の当たりの箱 (当たりが無ければ一番深い段の箱) に未設定 (open)「未設定: 完成にする箱が無い」
 * (前は末端が無いとスタートに落ちた、11-03 オーナー「フルでツリー作った後スタートが未設定ですなんて馬鹿な話ないだろ」・11-05「完成の箱がないなら末端に未設定を出すべきでは」)。
 * スタートしか無い木だけスタート
 */
function noDoneMarks(doc: TreeDoc): CheckIssue[] {
  const tips = noDoneTips(doc);
  // 木に 1 つだけ (一番上・左の箱。11-08 オーナー OK の案「完成の箱が無い → 木に 1 つだけ」。ほかの末端は「次の手が決まっていません」が出ている)
  const b = [...tips.box].sort((a, z) => a.y - z.y || a.x - z.x)[0];
  if (b) return [tips.end ? { boxId: b.id, kind: "noDone", text: noDoneText() } : { boxId: b.id, kind: "open", text: noDoneText() }];
  return [{ boxId: "start", kind: "noDone", text: noDoneText() }];
}
/** 印を付ける箱 (end = 末端の箱) */
function noDoneTips(doc: TreeDoc): { box: TreeBox[]; end: boolean } {
  const boxes = Object.values(doc.boxes);
  const tip = (b: TreeBox): boolean => b.id !== "start" && !b.hand && !b.back && !b.done && !b.split;
  const ends = boxes.filter((b) => tip(b) && b.out === "hit");
  if (ends.length) return { box: ends, end: true };
  const tips = boxes.filter(tip);
  if (tips.length) return { box: tips, end: true };
  const rest = boxes.filter((b) => b.id !== "start" && b.out !== "pass"), hits = rest.filter((b) => b.out === "hit"), pool = hits.length ? hits : rest;
  const depth = depthRows(doc), deepest = Math.max(-1, ...pool.map((b) => depth.get(b.id) ?? -1));
  return { box: pool.filter((b) => (depth.get(b.id) ?? -1) === deepest), end: false };
}
/**
 * 見本も人も使わず形だけで数える未設定 (S-70): 穴チェックを押していない間の「! 未設定」の帯と箱の赤枠。
 * 精査の 1) の形だけで分かる穴と「完成の箱が無い」の印と同じ箱を返す
 */
export function unsetIssues(doc: TreeDoc): CheckIssue[] {
  const boxes = Object.values(doc.boxes), out: CheckIssue[] = [];
  for (const b of boxes) {
    if (b.split?.some((r) => !r.to)) out.push({ boxId: b.id, kind: "open", text: tr("分かれ目の行き先を決めていない行がある (その形で来た人はここで止まる)", "A split row has no destination (runs of that shape stop here)") });
    if (!b.hand && !b.back && !b.done && !b.split && !isGrayBox(b)) out.push({ boxId: b.id, kind: "open", text: openText(b, false) });
    if (b.out === "hit" && !b.aim) out.push({ boxId: b.id, kind: "noAim", text: tr("付く MOD を選んでいない", "No mod picked for this hit") });
  }
  if (!boxes.some((b) => b.done === "main")) out.push(...noDoneMarks(doc));
  return ranked(out);
}
/** ルート精査 (木の設定 tune で打つ。一気に回す、台本・テスト用) */
export function checkTree(data: PatchData, doc: TreeDoc): CheckIssue[] {
  const g = checkSteps(data, doc);
  for (;;) { const r = withTreeTune(doc, () => g.next()); if (r.done) return r.value; }
}
/**
 * ルート精査を 1 人ずつ区切って回し、間に画面を返す (くるくるが回り「精査中 12/30」が出る、10-22 オーナー「ローディング画面を出さないとバグってるのか分からない」)。
 * 中身は checkTree と同じ。木の設定 (tune) は 1 区切りごとに包む
 */
/** 精査の 30 人を穴チェックの走行に使い回す時の値段 (S-71b)。費用の上限は掛けないので、精査の結果は値段 0 の時と同じ */
export interface CheckPrice { price: (key: string) => number; startCost: number }
export async function checkTreeAsync(data: PatchData, doc: TreeDoc, onProgress: (p: CheckProgress) => void, _priced?: CheckPrice, _onRun?: (r: TreeRunResult) => void): Promise<CheckIssue[]> {
  // 値段・走行の受け取りは 30 人回しをやめた (11-11) ので使わない (呼ぶ側の形はそのまま)
  const g = checkSteps(data, doc);
  for (;;) {
    const r = withTreeTune(doc, () => g.next());
    if (r.done) return r.value;
    onProgress(r.value);
    await new Promise((res) => setTimeout(res, 0));
  }
}
/**
 * 精査の中だけの「当たるまで」の上限 (上限無し・これより多い物はここで打ち切る)。付かない狙いの当たるまでが 1 人ごとに 5000 回 (見本の上限) 回り、
 * 30 人回しでページが固まった (10-25 モンキー 3 本目、前に保存した木でも起きる)。打ち切りまで当たらなかった人はその箱で止まる (tree-run の untilHit)、穴として出す。100 人回しの上限は SPAM_CAP (5000)
 */
const CHECK_SPAM_CAP = 1000;
/**
 * 精査に使う木の写し: 当たるまでの上限を CHECK_SPAM_CAP までに (capped)。当たりの狙いがこの箱の見本で 1 つもそのカレンシーで付かない当たるまで (dead) は手を外す
 * (当たらなかった人が形の合う同じ箱へ戻って打ち直し、上限を付けても 1 人の中で回り続けた。今の画面では作れない形、前に保存した木の分)
 */
function capSpam(data: PatchData, doc: TreeDoc): { doc: TreeDoc; capped: Set<string>; dead: Set<string> } {
  const capped = new Set<string>(), dead = new Set<string>();
  const boxes = { ...doc.boxes }, all = aimsOf(data, doc);
  for (const b of Object.values(doc.boxes)) {
    const r = b.hand?.repeat;
    if (!r) continue;
    const item = sampleOf(data, doc, b.id, 1).item;
    const open = handAims(doc, b.id, all).filter((a) => !aimHeldOn(data, item, a, { sameText: true }));
    const reach = reachableAims(data, [item], b.hand!.currency, engineOmens(b.hand!), open, { sameText: true });
    if (open.length && reach && !reach.length) { boxes[b.id] = { ...b, hand: null }; dead.add(b.id); continue; }
    if (r.max != null && r.max <= CHECK_SPAM_CAP) continue;
    boxes[b.id] = { ...b, hand: { ...b.hand!, repeat: { ...r, max: CHECK_SPAM_CAP } } };
    capped.add(b.id);
  }
  return { doc: capped.size || dead.size ? { ...doc, boxes } : doc, capped, dead };
}
function* checkSteps(data: PatchData, doc0: TreeDoc): Generator<CheckProgress, CheckIssue[]> {
  const { doc, dead } = capSpam(data, doc0);
  const out: CheckIssue[] = [];
  for (const id of dead) out.push({ boxId: id, kind: "cantUse", text: tr("この手で付く狙いが無い (当たりの狙いはこのカレンシーでは付かない。当たるまで繰り返すと終わらないので、精査はここで止まる扱い)", "No target this craft can add (this currency can't add the hit's target; repeating would never end, so the check treats this box as a stop)") });
  const add = (boxId: string, kind: CheckKind, text: string, detail?: string): void => { if (!out.some((x) => x.boxId === boxId && x.kind === kind)) out.push({ boxId, kind, text, ...(detail ? { detail } : {}) }); };
  // 木のチェック (S-201 ②): 打たずに配置の木を辿り、行き先の無い結果・代表で打てない手・完成の条件に届かない完成の箱
  for (const x of frameIssues(data, doc0)) add(x.boxId, x.kind, x.text);
  const boxes = Object.values(doc.boxes);
  const aims = aimsOf(data, doc);
  /** 判定 (戻り先の比べ・辿りの行き先はこれだけ、S-50b・S-73) */
  const J = judgeMemo(data, doc);
  /** 戻りの矢印の行き先 (形の合う箱へ = 行きうる全部、作り直し = 始まり) */
  const backTo = (id: string): string[] => {
    const split = doc.boxes[id]?.split;
    if (split) return split.flatMap((r) => (r.to ? [r.to] : []));
    const back = doc.boxes[id]?.back;
    if (!back) return [];
    if (back === MATCH) return boxes.filter((t) => t.hand && J.fitsBox(id, t.id)).map((t) => t.id);
    return [back === RESTART ? "start" : back];
  };

  // 0) 形の違う箱への戻り (10-26 オーナー「その選択肢が出てくるのは前提狙いMODの状態でなんかする時やろ」): 付いている狙いの組が違う人が行き先の箱に入り、
  // その箱の結果 (狙いが消えた など) が箱の形と合わなくなる。直すのは戻りの箱 (戻り先を同じ形の箱に)
  // 戻り先と中身 (S-60) が違う戻りを「箱どうし」で 1 つに (つなぐ時と同じ規則、S-73)。全部消えてよい消去の直線の止まりも同じ
  for (const b of boxes) {
    if (!b.back || b.back === MATCH || b.back === RESTART || !doc.boxes[b.back] || J.fitsBox(b.id, b.back)) continue;
    // 「エッセンスと同じ MOD (同格以上)」の統合は特例でエッセンスとして扱う (S-33e ⑥)
    if (b.out === "blocked" && b.junkKey === "hi" && b.autoBack) continue;
    // 見本が作れない箱 (誰も着かない) は分からない扱い
    if (!J.contents(b.id) || !J.contents(b.back)) continue;
    add(b.id, "shape", tr("戻り先の箱と中身が違う (狙いの組・外れの側と数と種類・✦・レアリティ・品質のどれかが違う人が入る)。直し方: 戻り先を同じ中身の箱にする (↩ で選び直す。選べる箱だけ明るくなる) か、ここに次の手を置く", "The return target holds a different item (targets, misses per side and kind, fractures, rarity or quality differ). Fix: return to a box with the same contents (pick again with ↩; only valid boxes are lit), or add a next craft here"));
  }

  // 0b) 戻り先の手がこの箱の代表の品に打てない (置けるのに打てない = 戻った人はそこで止まる。11-11 枝のフルチェック: 骨の発現の後の外れが ↩ 骨の箱へ戻り、
  // 冒涜の MOD を持った人が 2 つ目の骨を打てなかった。オーナー「1周目で気づけない仕組みもどーかと思う」)。1 周目 (打たずに辿る) で止まりとして出す
  for (const b of boxes) {
    const to = b.back && b.back !== MATCH && b.back !== RESTART ? doc.boxes[b.back] : undefined;
    if (!to?.hand || to.done) continue;
    const s = sampleOf(data, doc, b.id, 1);
    if (s.note === "none" || s.note?.startsWith("cant:") || canPlay(data, s.item, to.hand)) continue;
    add(b.id, "open", tr(`戻り先の手 (${nameOfKey(to.hand.currency, null)}) がこの箱の品に打てない (戻った人はそこで止まる)。直し方: ここに次の手を置くか、打てる箱へ戻す`, `The return target's craft (${nameOfKey(to.hand.currency, null)}) can't be used on this box's item (runs that return stop there). Fix: add a next craft here, or return to a box where it can be used`));
  }

  // 1) 形だけで分かる穴: 決めていない芽・MOD を選んでいない当たり
  // 始まりの MOD は自由 (無くてよい、10-22 オーナー)。付けられない時は見本の理由を出す
  { const note = startItemOf(data, doc, mulberry32(1)).note; if (note) add("start", "cantUse", tr(`始まりの形が作れない: ${note}`, `Can't make the starting item: ${note}`)); }
  for (const b of boxes) {
    if (b.split?.some((r) => !r.to)) add(b.id, "open", tr("分かれ目の行き先を決めていない行がある (その形で来た人はここで止まる)", "A split row has no destination (runs of that shape stop here)"));
    if (!b.hand && !b.back && !b.done && !b.split && !dead.has(b.id)) add(b.id, "open", openText(b, b.out !== "start" && J.holdsAll(b.id)));
    if (b.out === "hit" && !b.aim) add(b.id, "noAim", tr("付く MOD を選んでいない", "No mod picked for this hit"));
    // フラクチャーの手は完成の MOD にフラクチャーの印がある木だけ (10-25 オーナー「最初にフラクチャーを決めないとフラクチャーオーブを打てないように」)。前に保存した印の無い木の手は穴に
    if (b.hand && effectOf(b.hand.currency) === "fracture" && b.hand.pick !== "random" && !fractureMarks(doc).length) add(b.id, "cantUse", tr("フラクチャーの印が無い (先に完成の MOD でフラクチャーを決めて)", "No fracture mark (set a fracture on the final mods first)"));
    // 触媒のお告げはカタリストで入れた品質にだけ効く。カタリストを打つ手が無ければ効きは乗らない (10-22 オーナー「ちゃんと打つルートが無いとあかん」)。
    // 品質を上げた後かは見本の品質 (中身、S-31b。品質だけ上げる手の後の通り抜け・「n % まで」の打った後の箱も)
    const afterCat = J.afterQuality(b.id);
    if (b.hand?.omens.includes(CATALYSING) && !afterCat) add(b.id, "noCatalyst", tr(`${nameOfKey(CATALYSING, null)}なのにカタリストを打つ手が無い (前にカタリストの手を置く)`, `${nameOfKey(CATALYSING, null)} without a catalyst craft (place a catalyst craft before it)`));
  }

  // 1a) 固定された外れ MOD (フラクチャーで外れが固定された・始めから固定の外れ) で、その側の完成の狙いが枠に入りきらない = この枝は完成できない
  // (10-27 夜オーナー、カマサのティアラの「外れ MOD が固定された」の箱。スイッチ tidyUnder)。固定は消せないので、レアの枠 − 固定の外れ < その側の狙いの数なら届かない。枝の一番上の箱だけに出す
  {
    // 完成の狙いの印の ✦ (フラクチャー済みからの始まり) は外れでない。aims には当たりの箱の札しか無く、印の ✦ を固定の外れと数えた (11-05 8 MOD ワンド)
    const miss = missAims(data, [...aims, ...fractureMarks(doc)]), stuckFix = new Set<string>();
    for (const b of boxes) {
      if (b.parent && stuckFix.has(b.parent)) { stuckFix.add(b.id); continue; }
      if (b.done) continue;
      let item: StageItem;
      try { item = sampleOf(data, doc, b.id, 1).item; } catch { continue; }
      const rare = { ...item, rarity: "rare" as const };
      for (const side of SIDES) {
        const fixed = (side === "prefix" ? item.prefixes : item.suffixes).filter((m) => m.fractured && isMissMod(m, miss));
        const want = aims.filter((a) => sideOfMod(data, a.modId) === side).length;
        if (!fixed.length || limitOf(rare, side) - fixed.length >= want) continue;
        stuckFix.add(b.id);
        const sideJa = side === "prefix" ? "プレフィックス" : "サフィックス", sideEn = side === "prefix" ? "prefix" : "suffix";
        add(b.id, "fixedFull", tr(`固定された外れ MOD (${fixed.map(modText).join("・")}) で${sideJa}の枠が足りず、完成の狙い ${want} つが入りきらない (固定は消せないので、この枝は完成できない)`, `A fixed (fractured) miss mod (${fixed.map(modText).join(", ")}) leaves too few ${sideEn} slots for the ${want} final target(s) (fractured mods can't be removed, so this branch can never finish)`));
        break;
      }
    }
  }

  // 1b) 前の版の「形の合う箱へ」(match) は、人が戻り先を選ぶのを無くした今 (S-52b) は決めていない箱 = 未設定の印 (10-29 オーナー「直して」)。
  for (const b of boxes) if (b.back === MATCH && !b.autoBack) add(b.id, "open", tr("前の版の「形の合う箱へ」の戻り (今は選べない)。次の手・完成・失敗を決める", "Old \"go to the matching box\" return (no longer selectable). Pick a next craft, Finish, or Fail"));

  // 2) 完成に着かない道・抜けられない輪 (矢印を逆に辿って、完成の箱へ行ける箱を集める)
  // 失敗 (ここで終わり) の箱も道の終わり (完成の箱が無いかは完成だけで見る)
  const done = boxes.filter((b) => b.done === "main");
  // 完成にしていない完成の箱 (unfinished) があれば、回す時はそこで完成する (S-54) ので「完成の箱が無い」で合格を止めない (⑦12 → ブラック案・オーナー「進めてくれ」10-28)
  if (!done.length) {
    // スイッチ unsetMark: 印は原因の末端の箱に (手・戻り・完成の無い当たり → 無ければほかの末端の箱)。スタートには付けない、スタートしか無い時だけスタート
    // (S-89b・S-77、10-28 深夜オーナー「末端の枠のせいだからスタートに出したら行かんでしょそもそも」「スタートの枠しかない時は勿論枠はあると思うが」)
    for (const x of noDoneMarks(doc)) add(x.boxId, x.kind, x.text);
  }
  const reach = new Set(boxes.filter((b) => b.done).map((b) => b.id));
  for (let changed = true; changed;) {
    changed = false;
    for (const b of boxes) {
      if (reach.has(b.id)) continue;
      if (b.outs.some((o) => reach.has(o)) || backTo(b.id).some((x) => reach.has(x))) { reach.add(b.id); changed = true; }
    }
  }
  if (done.length) for (const b of boxes) {
    if (reach.has(b.id) || (!b.hand && !b.back && !b.done && !b.split)) continue; // 決めていない芽は 1) で出している
    if (b.back || b.split) add(b.id, "loop", tr("戻りの輪から抜けられない (完成の箱へ着く道が無い)", "Stuck in a return loop (no way to a done box)"));
    else if (b.hand && b.outs.every((o) => !reach.has(o))) add(b.id, "noDone", tr("この先は完成の箱へ一度も着かない", "Nothing below this ever reaches a done box"));
  }

  // 3) 完成の形の食い違い (完成の箱どうしで揃った狙いの数を比べる doneShape) は 11-07 にやめた: 完成の箱に着いた人はそのまま完成で、狙いの数を数え直さない (S-05)。木のチェックは止まりと輪だけ

  // 4) 5 人を辿る・5) 30 人回すは 11-11 にやめた (オーナー「んでまだ最終チェック何人か回してるよね。やめさせてくれ。普通に全枠2周して未設定やバグないかのチェックが最終チェックだ」
  // 「基本2週したら止まるかどうか分かるよな」、S-201 ②)。人を回さず、頭の木のチェック (tree-frame-check = 代表の品で 1 周 + ↩ で着く形でもう 1 周) と 0)〜2) の形の見方だけ
  return ranked(out);
}

/** 止まる・打てない物を先に (10-22 精査で靴の止まりが完成の札の ! の下に埋もれた) */
const RANK: Partial<Record<CheckKind, number>> = { stuck: 0, carry: 0, cantUse: 1, noMatch: 2, unexpected: 3, open: 4, loop: 5, noDone: 6 };
function ranked(list: readonly CheckIssue[]): CheckIssue[] {
  return list.map((x, i) => ({ x, i })).sort((a, z) => (RANK[a.x.kind] ?? 9) - (RANK[z.x.kind] ?? 9) || a.i - z.i).map((v) => v.x);
}
