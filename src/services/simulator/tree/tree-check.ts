/**
 * tree-check.ts — ルート精査 (2026-10-22 オーナー「今どこで止まるのか、今の状態で付くのかをチェック。5 人を回して、カオススパム設定なら 1 発で付く前提で
 * 動いて全パターン検出。穴がある所をエラー表記で」)。費用は出さない。打つのは全部エンジン (tree-sample の playHand → applyCurrency)。
 *
 * 辿り方: 5 人それぞれ、始まりから箱の手をエンジンで打ち、矢印の先の結果の箱を全部 (当たり・外れ・消えた) 順に 1 回ずつ通す
 * (その結果が出るまで打ち直す。乱数任せにしない)。繰り返しの手 (カオススパム) は当たりの箱へ 1 発で行く前提 = 当たりが出るまで打ち直すだけ。
 * 戻りの矢印は 1 回だけ辿り、戻った状態のまま先も辿る (箱ごとに「ふつうに着いた」と「戻りで着いた」の 2 回まで、戻りの中の戻りでは止める)。
 * 10-22 靴を白紙から組んで: 狙いが消えて外れを持ったまま始めに戻り、カオスで当たるとサフィックスが満杯で次の高貴が打てず 100 人中 64 人止まるのに、
 * 前は戻った先の手が打てるかだけ見て先へ進まず、精査に出なかった
 */
import { allMods, limitOf, modBoostsOf, mulberry32, room, sideOfMod, SIDES, unrevealedOf, type PatchData, type StageItem } from "../../craft-stage/engine";
import { stepOutcomes } from "../../simulator/sim-engine";
import { prepFor } from "./tree-unbounded";
import { TIER } from "../../../state/for-share/tier-word";
import { catalystTagOf } from "../../simulator/sim-engine";
import { aimHeldOn, isAimMod, junkOf, reachableAims } from "./tree-aim";
import { CATALYSING, effectOf, engineOmens, isCatalyst } from "./tree-hands";
import { nameOfKey } from "../../../state/for-share/craft-stage-shelf"; // 名前はクラフト台の棚と同じ (データの名前、10-28 オーナー「名前はエンジンのデータベース参照で固定」)
import { aimKey, fractureMarks, type Aim, type Hand, type OutKind, type TreeBox, type TreeDoc, boxAims } from "./tree-model";
import { aimOpts, aimsOf, goalsHeld, handAims, handProblem, heldHitOf, playHand, sampleOf, startItemOf, targetsOf } from "./tree-sample";
import { boxOutcomeOf, fromStrip, stripBackOf, stripStop, stripTargetsOf } from "./tree-outcome";
import { runTreeSteps, stuckDetail } from "./tree-run";
import { heldSets, MATCH, matchItem, matchTargets, outBoxOf, RESTART, settle, shapeFits, shapesOf, splitTo } from "./tree-shape";
import { bodyKinds, bodyMemo, bodyVaries, sameBody } from "./tree-box-shape";
import { withTreeTune } from "./tree-tune";
import { judgeMemo, nextAimed, startAimed } from "./tree-judge";
import { routeOf } from "./tree-judge-link";
import { modText, tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";

type CheckKind = "open" | "unfinished" | "noAim" | "cantUse" | "neverHit" | "noDone" | "loop" | "doneShape" | "quality" | "unwanted" | "noMatch" | "noCatalyst" | "unexpected" | "stuck" | "carry" | "omenWaste" | "shape" | "fixedFull" | "shapeBody";
/** 合格を止めない知らせ (shapeBody = 戻り先と外れの数・側だけが違う。回す時は実物で形の合う箱へ移る、S-62・S-73、10-28 仮) */
/** 合格を止めない知らせ: 戻り先と外れの体だけ違う (S-73)・完成にしていない完成の箱 (S-77、印は付けるが止めない) */
export const NOTICE_KINDS: readonly CheckKind[] = ["shapeBody", "unfinished"];
export interface CheckIssue { boxId: string; kind: CheckKind; text: string }

const PEOPLE = 5;
/** 回して止まる箱を数える人数 (5 人を辿るだけでは、止まる形 (例: 外れを持ったまま戻って満杯) を引かない事がある) */
const RUN_PEOPLE = 30;
/** 結果の名前 (画面の tree-names の OUT_LOOK と同じ言葉) */
const OUT_NAME: Partial<Record<OutKind, [string, string]>> = { hit: ["当たり", "Hit"], junk: ["外れ", "Miss"], junkGone: ["外れが消えた", "Miss removed"], lost: ["狙いが消えた", "Target lost"] };
const outName = (o: OutKind): string => { const n = OUT_NAME[o]; return n ? tr(n[0], n[1]) : o; };
/** 1 つの結果が出るまで打ち直す上限 (精査は数秒で終わるよう、見本の 3000 より少なく) */
const TRIES = 1200;

/** 精査の進み (walk = 5 人を辿る、run = 30 人回す) */
export interface CheckProgress { phase: "walk" | "run"; n: number; of: number; /** ここまでに見つかった穴 (辿った人から順に足す、10-22 オーナー「読み込みながら徐々に出す」) */ partial: CheckIssue[] }
/** ルート精査 (木の設定 tune で打つ。一気に回す、台本・テスト用) */
export function checkTree(data: PatchData, doc: TreeDoc): CheckIssue[] {
  const g = checkSteps(data, doc);
  for (;;) { const r = withTreeTune(doc, () => g.next()); if (r.done) return r.value; }
}
/**
 * ルート精査を 1 人ずつ区切って回し、間に画面を返す (くるくるが回り「精査中 12/30」が出る、10-22 オーナー「ローディング画面を出さないとバグってるのか分からない」)。
 * 中身は checkTree と同じ。木の設定 (tune) は 1 区切りごとに包む
 */
export async function checkTreeAsync(data: PatchData, doc: TreeDoc, onProgress: (p: CheckProgress) => void): Promise<CheckIssue[]> {
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
  const boxes = { ...doc.boxes }, all = aimsOf(doc);
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
  const { doc, capped, dead } = capSpam(data, doc0);
  const out: CheckIssue[] = [];
  for (const id of dead) out.push({ boxId: id, kind: "cantUse", text: tr("この手で付く狙いが無い (当たりの狙いはこのカレンシーでは付かない。当たるまで繰り返すと終わらないので、精査はここで止まる扱い)", "No target this craft can add (this currency can't add the hit's target; repeating would never end, so the check treats this box as a stop)") });
  const add = (boxId: string, kind: CheckKind, text: string): void => { if (!out.some((x) => x.boxId === boxId && x.kind === kind)) out.push({ boxId, kind, text }); };
  const boxes = Object.values(doc.boxes);
  const aims = aimsOf(doc);
  /** 判定 (スイッチ judgeOne。戻り先の比べ・辿りの行き先はこれだけ、S-50b・S-73) */
  const J = flag("judgeOne") ? judgeMemo(data, doc) : null;
  /** 戻りの矢印の行き先 (形の合う箱へ = 行きうる全部、作り直し = 始まり) */
  const backTo = (id: string): string[] => {
    const split = doc.boxes[id]?.split;
    if (split) return split.flatMap((r) => (r.to ? [r.to] : []));
    const back = doc.boxes[id]?.back;
    if (!back) return [];
    if (back === MATCH && J) return stripTargetsOf(data, doc, id) ?? boxes.filter((t) => t.hand && J.fitsBox(id, t.id)).map((t) => t.id);
    if (back === MATCH) return stripTargetsOf(data, doc, id) ?? matchTargets(doc, id).flatMap((x) => (x.to ? [x.to] : []));
    return [back === RESTART ? "start" : back];
  };

  // 0) 形の違う箱への戻り (10-26 オーナー「その選択肢が出てくるのは前提狙いMODの状態でなんかする時やろ」): 付いている狙いの組が違う人が行き先の箱に入り、
  // その箱の結果 (狙いが消えた など) が箱の形と合わなくなる。直すのは戻りの箱 (戻り先を同じ形の箱に)
  // スイッチ judgeOne: 戻り先と中身 (S-60) が違う戻りを「箱どうし」で 1 つに (つなぐ時と同じ規則、S-73)。全部消えてよい消去の直線の止まりも同じ
  if (J) for (const b of boxes) {
    if (!b.back || b.back === MATCH || b.back === RESTART || !doc.boxes[b.back] || J.fitsBox(b.id, b.back)) continue;
    // 見本が作れない箱 (誰も着かない) は分からない扱い
    if (!J.contents(b.id) || !J.contents(b.back)) continue;
    add(b.id, "shape", tr("戻り先の箱と中身が違う (狙いの組・外れの側と数と種類・✦・レアリティ・品質のどれかが違う人が入る)。直し方: 戻り先を同じ中身の箱にする (↩ で選び直す。選べる箱だけ明るくなる) か、ここに次の手を置く", "The return target holds a different item (targets, misses per side and kind, fractures, rarity or quality differ). Fix: return to a box with the same contents (pick again with ↩; only valid boxes are lit), or add a next craft here"));
  }
  if (!J) for (const b of boxes) if (b.back && !shapeFits(doc, b.id, b.back)) add(b.id, "shape", tr("戻り先の箱と形が違う (付いている狙いの組が違う人が入る)。直し方: 戻り先を同じ狙いの組の箱にする (↩ で選び直す。選べる箱だけ明るくなる) か、ここに次の手を置く", "The return target has a different shape (runs with different targets would enter it). Fix: return to a box with the same targets (pick again with ↩; only valid boxes are lit), or add a next craft here"));
  // 外れの種類 (普通 / エッセンスのクラフト MOD / 冒涜) が戻り先の箱の見本と違う戻り (10-27 夕オーナー「冒涜で付けた外れ MOD とエッセンスで付けた外れ MOD」は形の違い。スイッチ goalShape)。
  // 前に組んだ木の自動の戻りも付け替えずにここで知らせる。始まりへの戻り・当たりどうしの統合・全部消えてよい消去の自動の戻り (戻り先は打った結果の形で選んでいる) は見ない
  if (flag("goalShape") && !J) {
    const sigOf = bodyMemo(data, doc);
    for (const b of boxes) {
      const to = b.back, tb = to ? doc.boxes[to] : undefined, p = b.parent ? doc.boxes[b.parent] : undefined;
      // 当たりどうしの統合も比べる (置き石の冒涜の外れを持つ当たりが、外れの無い当たりへ統合されていた。10-28 オーナー「精査で出してアミュ B のつなぎも直して」、スイッチ boneLater)
      if (!to || !tb || to === "start" || (b.out === "hit" && tb.out === "hit" && !flag("boneLater")) || out.some((x) => x.boxId === b.id && x.kind === "shape")) continue;
      if (b.autoBack && p?.hand && effectOf(p.hand.currency) === "remove" && p.hand.keep && !p.hand.keep.length) continue;
      // スイッチ boxShape: 自動のつなぎと同じ比べ (tree-box-shape の sameBody = 外れの側・種類・数、✦ の側、レアリティ)。閉じている間は外れの種類だけ
      const a = sigOf(b.id), z = sigOf(to);
      // 見本ごとに外れの種類が違う箱 (mixed) は分からない扱い (自動ではつながないが、前につないだ戻りは回すと進める。精査で知らせると古い木で増えた)
      if (flag("boxShape") ? !a?.startsWith("mixed") && !z?.startsWith("mixed") && !sameBody(sigOf, b.id, to) && !bodyVaries(data, doc, b.id) && !bodyVaries(data, doc, to) : a !== null && z !== null && bodyKinds(a) !== bodyKinds(z)) add(b.id, flag("boxShape") ? "shapeBody" : "shape", tr("戻り先の箱と外れ MOD の種類が違う (普通 / エッセンスのクラフト MOD / 冒涜の外れ MOD のどれがあるかが違う人が入る)。直し方: 戻り先を外れの種類も同じ箱にする (↩ で選び直す) か、外れを消す手を挟む", "The return target has different kinds of miss mods (which of normal / essence crafted / desecrated misses it has differs). Fix: return to a box with the same kinds of misses (pick again with ↩), or add a step that removes the misses"));
    }
  }

  // 1) 形だけで分かる穴: 決めていない芽・MOD を選んでいない当たり
  // 始まりの MOD は自由 (無くてよい、10-22 オーナー)。付けられない時は見本の理由を出す
  { const note = startItemOf(data, doc, mulberry32(1)).note; if (note) add("start", "cantUse", tr(`始まりの形が作れない: ${note}`, `Can't make the starting item: ${note}`)); }
  for (const b of boxes) {
    if (b.split?.some((r) => !r.to)) add(b.id, "open", tr("分かれ目の行き先を決めていない行がある (その形で来た人はここで止まる)", "A split row has no destination (runs of that shape stop here)"));
    // 完成の狙いが全部そろう箱 (見本で全部付いている) は未定に数えない (回す時はその場で完成、S-77。スイッチ boxShape)
    // スイッチ judgeOne: 完成は押した箱だけ (S-05・S-54) なので、そろっていても押していない箱は「行き先を決めていない」(ここで止まる)。知らせの文だけ「完成を押す」に
    const fin = (): boolean => { if (!flag("boxShape") || b.out === "start" || J) return false; const s = sampleOf(data, doc, b.id, 1); return s.note !== "none" && !s.note?.startsWith("cant:") && goalsHeld(data, doc, s.item); };
    // スイッチ unsetMark の下では完成にしていない完成の箱も決めていない箱 (S-77・S-89b、10-28 深夜オーナー「どこに完成するかそもそも設定どこにしたらいいかわからんから固定で赤枠がイイ」)
    if (flag("unsetMark") && !b.hand && !b.back && !b.done && !b.split && !dead.has(b.id) && fin()) add(b.id, "unfinished", tr("完成にしていない (完成の狙いが全部そろっている。「完成」を押す)", "Not marked finished (all final mods are here; press Finish)"));
    else if (!b.hand && !b.back && !b.done && !b.split && !dead.has(b.id) && !fin()) add(b.id, "open", J && b.out !== "start" && J.holdsAll(b.id) ? tr("完成にしていない (完成の狙いが全部そろっている。「完成」を押す。押すまでここで止まる)", "Not marked finished (all final mods are here; press Finish — runs stop here until then)") : b.out === "start" ? tr("最初の手を決めていない (ここで止まる)", "No first craft yet (stops here)") : tr("行き先を決めていない (ここで止まる)", "No next step yet (stops here)"));
    if (b.out === "hit" && !b.aim) add(b.id, "noAim", tr("付く MOD を選んでいない", "No mod picked for this hit"));
    // フラクチャーの手は完成の MOD にフラクチャーの印がある木だけ (10-25 オーナー「最初にフラクチャーを決めないとフラクチャーオーブを打てないように」)。前に保存した印の無い木の手は穴に
    if (b.hand && effectOf(b.hand.currency) === "fracture" && b.hand.pick !== "random" && !fractureMarks(doc).length) add(b.id, "cantUse", tr("フラクチャーの印が無い (先に完成の MOD でフラクチャーを決めて)", "No fracture mark (set a fracture on the final mods first)"));
    // 触媒のお告げはカタリストで入れた品質にだけ効く。カタリストを打つ手が無ければ効きは乗らない (10-22 オーナー「ちゃんと打つルートが無いとあかん」)。
    // 品質だけ上げる手 (カタリスト) の後の通り抜けから打つ時は、その手がカタリストを打つ手
    const before = b.out === "pass" && b.parent ? doc.boxes[b.parent]?.hand : null;
    // スイッチ judgeOne: 品質を上げた後かは見本の品質 (中身、S-31b。「n % まで」の打った後の箱も)
    const afterCat = J ? J.afterQuality(b.id) : !!before && isCatalyst(before.currency);
    if (b.hand?.omens.includes(CATALYSING) && !b.hand.catalyst && !afterCat) add(b.id, "noCatalyst", tr(`${nameOfKey(CATALYSING, null)}なのにカタリストを打つ手が無い (手の札でカタリストを選ぶ)`, `${nameOfKey(CATALYSING, null)} without a catalyst craft (pick a catalyst in the craft)`));
  }

  // 1a) 固定された外れ MOD (フラクチャーで外れが固定された・始めから固定の外れ) で、その側の完成の狙いが枠に入りきらない = この枝は完成できない
  // (10-27 夜オーナー、カマサのティアラの「外れ MOD が固定された」の箱。スイッチ tidyUnder)。固定は消せないので、レアの枠 − 固定の外れ < その側の狙いの数なら届かない。枝の一番上の箱だけに出す
  if (flag("tidyUnder")) {
    const ts = targetsOf(data, aims), opts = aimOpts(data), stuckFix = new Set<string>();
    for (const b of boxes) {
      if (b.parent && stuckFix.has(b.parent)) { stuckFix.add(b.id); continue; }
      if (b.done) continue;
      let item: StageItem;
      try { item = sampleOf(data, doc, b.id, 1).item; } catch { continue; }
      const rare = { ...item, rarity: "rare" as const };
      for (const side of SIDES) {
        const fixed = (side === "prefix" ? item.prefixes : item.suffixes).filter((m) => m.fractured && !isAimMod(m, ts, opts));
        const want = aims.filter((a) => sideOfMod(data, a.modId) === side).length;
        if (!fixed.length || limitOf(rare, side) - fixed.length >= want) continue;
        stuckFix.add(b.id);
        const sideJa = side === "prefix" ? "プレフィックス" : "サフィックス", sideEn = side === "prefix" ? "prefix" : "suffix";
        add(b.id, "fixedFull", tr(`固定された外れ MOD (${fixed.map(modText).join("・")}) で${sideJa}の枠が足りず、完成の狙い ${want} つが入りきらない (固定は消せないので、この枝は完成できない)`, `A fixed (fractured) miss mod (${fixed.map(modText).join(", ")}) leaves too few ${sideEn} slots for the ${want} final target(s) (fractured mods can't be removed, so this branch can never finish)`));
        break;
      }
    }
  }

  // 1b) 形の合う箱へ: 行きうる形の箱がツリーに無い (tree-run の matchTargets、回す時と同じ判定)
  // 前の版の「形の合う箱へ」(match) は、人が戻り先を選ぶのを無くした今 (S-52b) は決めていない箱 = 未設定の印 (スイッチ settleStrict、10-29 オーナー「直して」)。
  // 全部消えてよい消去の直線の止まり (fromStrip) が自動で付けた物は除く
  if (flag("settleStrict")) for (const b of boxes) if (b.back === MATCH && !b.autoBack && !fromStrip(doc, b.id)) add(b.id, "open", tr("前の版の「形の合う箱へ」の戻り (今は選べない)。次の手・完成・失敗を決める", "Old \"go to the matching box\" return (no longer selectable). Pick a next craft, Finish, or Fail"));
  if (!J) for (const b of boxes) if (b.back === MATCH) {
    const miss = matchTargets(doc, b.id).filter((x) => !x.to);
    if (miss.length) add(b.id, "noMatch", tr(`続きの箱が無い (${miss.length} つの形。その形で手のある箱を作る)`, `No box to continue from (${miss.length} shape(s)); add a box with that shape and a craft`));
  }

  // 2) 完成に着かない道・抜けられない輪 (矢印を逆に辿って、完成の箱へ行ける箱を集める)
  // 失敗 (ここで終わり) の箱も道の終わり (完成の箱が無いかは完成だけで見る、スイッチ failEnd)
  const done = boxes.filter((b) => b.done === "main");
  // 完成にしていない完成の箱 (unfinished) があれば、回す時はそこで完成する (S-54) ので「完成の箱が無い」で合格を止めない (⑦12 → ブラック案・オーナー「進めてくれ」10-28)
  if (!done.length && (J || !out.some((x) => x.kind === "unfinished"))) {
    const msg = tr("完成の箱が無い (当たりの箱で「完成にする」)", "No done box yet (mark a hit as done)");
    // スイッチ unsetMark: 印は原因の末端の箱に (手・戻り・完成の無い当たり → 無ければほかの末端の箱)。スタートには付けない、スタートしか無い時だけスタート
    // (S-89b・S-77、10-28 深夜オーナー「末端の枠のせいだからスタートに出したら行かんでしょそもそも」「スタートの枠しかない時は勿論枠はあると思うが」)
    const tip = (b: TreeBox): boolean => b.id !== "start" && !b.hand && !b.back && !b.done && !b.split;
    const ends = flag("unsetMark") ? boxes.filter((b) => tip(b) && b.out === "hit") : [];
    const tips = ends.length ? ends : flag("unsetMark") ? boxes.filter(tip) : [];
    if (tips.length) for (const b of tips) add(b.id, "noDone", msg);
    else add("start", "noDone", msg);
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

  // 3) 完成の形の食い違い (完成の箱どうしで、道の札がそろっていない)
  const pathAims = (id: string): string => {
    const ks = new Set<string>();
    for (let b: TreeDoc["boxes"][string] | undefined = doc.boxes[id]; b; b = b.parent ? doc.boxes[b.parent] : undefined) {
      if (b.out === "hit" && b.aim) for (const a of boxAims(b)) ks.add(aimKey(a));
      // 分かれ目の行の「付いている狙い」も道の札 (10-24 不在のアミュ B: 負けの後のカオスでキャスト・ルーンワードが残った人の完成の行が「狙い 2 つ」と出た)
      const p = b.parent ? doc.boxes[b.parent] : undefined;
      for (const k of p?.split?.find((r) => r.to === b!.id)?.when.has ?? []) ks.add(k);
    }
    return [...ks].sort().join(",");
  };
  const mains = done.filter((b) => b.done === "main");
  // 比べるのは揃った狙いの数 (「どれか 2 つ」の木は完成ごとに札が違うのが正しい。前は札の組で比べ、靴の完成の箱ほぼ全部に ! が付いた、10-22)。
  // 数は下の 4) でエンジンが辿った時に完成の箱で付いていた狙いの数の一番少ない物 (戻りの矢印で合流すると親をたどった札と違う、靴 b8、10-22)。着かなかった箱は親をたどった札の数
  const nOfPath = (id: string): number => (pathAims(id) ? pathAims(id).split(",").length : 0);
  const heldAtDone = new Map<string, number>();

  // 4) エンジンで 5 人を辿る: 打てない手・付かない当たり
  {
    const cant = new Map<string, { who: Set<number>; reason: string }>();
    const never = new Set<string>();
    /** 結果の箱に無い結果が出る箱 (箱 → 人数と出る結果)。結果が 1 通りとして箱を 1 つにした手で、想定外の形で着いた時など (10-22 ブラック) */
    const odd = new Map<string, { who: Set<number>; outs: Set<string> }>();
    /** お告げが効かない (無駄になる) 人がいる箱 */
    const waste = new Map<string, { who: Set<number>; reason: string }>();
    const shapes = shapesOf(doc, data);
    /** スイッチ judgeOne: この箱の見本のどれかにもう当たりの狙いが付いている (付いていない人だけが着くので数えない) */
    const held = (id: string, ob: TreeBox): boolean => (J?.aimedOf(id) ?? []).some((am) => boxAims(ob).some((a) => am.has(a.modId)));
    const cantIssues = (): CheckIssue[] => [...cant].map(([id, c]) => ({ boxId: id, kind: "cantUse" as const, text: tr(`この箱に着いた状態では手が打てない (${PEOPLE} 人中 ${c.who.size} 人): ${c.reason}`, `The craft can't be used here (${c.who.size} of ${PEOPLE}): ${c.reason}`) }));
    const oddIssues = (): CheckIssue[] => [...odd].map(([id, c]) => ({ boxId: id, kind: "unexpected" as const, text: tr(`この手で「${[...c.outs].join("・")}」になる人がいるのに、行く箱が無い (${PEOPLE} 人中 ${c.who.size} 人、回すと同じ状態の箱があればそこへ、無ければ止まる)。直し方: この手を選び直して結果の箱に足す (PC は当たりの箱の横の ＋ でも足せる)`, `Some runs (${c.who.size} of ${PEOPLE}) end up as "${[...c.outs].join(", ")}" from this craft, but there is no box for it (runs go to a box in the same state, or stop). Fix: pick the craft again so that result gets a box (on PC, the + beside a hit box also adds one)`) }));
    for (let person = 1; person <= PEOPLE; person++) {
      const rng = mulberry32(7919 * person);
      const start = sampleOf(data, doc, "start", person).item;
      const seen = new Set<string>();
      /** aimed = この人の ☑ で付いた狙い (スイッチ judgeOne、回す時と同じ) */
      const walk = (id: string, item: StageItem, viaBack: boolean, aimed: ReadonlySet<string> = new Set()): void => {
        const b = doc.boxes[id];
        if (!b || seen.has(id + (viaBack ? "<" : ""))) return;
        seen.add(id + (viaBack ? "<" : ""));
        // 完成の狙いが全部そろった人はここで完成 (回す時と同じ、tree-sample の goalsHeld)
        // スイッチ judgeOne: 完成は押した箱だけ (S-05・S-54)
        if (!J && goalsHeld(data, doc, item)) return;
        // × (要らない) の印の MOD が残ったまま完成 (印はこの箱と上の箱で付けた物、段は問わない)
        if (b.done === "main") { const n = aims.filter((a) => aimHeldOn(data, item, a, { sameText: true })).length; heldAtDone.set(id, Math.min(heldAtDone.get(id) ?? n, n)); }
        if (b.done === "main") for (let x: typeof b | undefined = b; x; x = x.parent ? doc.boxes[x.parent] : undefined) for (const m of x.unwanted ?? []) {
          if (aimHeldOn(data, item, { modId: m, tier: 99 }, { sameText: true })) add(id, "unwanted", tr("× (要らない) の印の MOD が残ったまま完成", "A mod marked × (unwanted) is still on the done item"));
        }
        // 分かれ目: 今のアイテムの形で合う行の箱へ (回す時と同じ splitTo)。合う行が無い・行き先が無い時は止まる
        if (b.split) {
          const to = splitTo(data, b.split, item, aims);
          if (!to) { add(id, "noMatch", tr("分かれ目のどの行にも合わない形で着く (回すとここで止まる)", "Arrives in a shape no split row matches (runs stop here)")); return; }
          walk(to, item, viaBack, aimed);
          return;
        }
        if (b.back && !viaBack) {
          // 形の合う箱へ = 回す時と同じく今のアイテムの形で行き先を決める (tree-run の matchItem)。作り直し = 始めのアイテムで始まりへ
          const to = J
            ? (b.back === MATCH ? stripBackOf(data, doc, id, item) ?? (fromStrip(doc, id) ? null : routeOf(data, doc, J, null, item, aimed)) : b.back === RESTART ? "start" : routeOf(data, doc, J, b.back, item, aimed))
            : b.back === MATCH ? stripBackOf(data, doc, id, item) ?? matchItem(data, doc, item, aims) : b.back === RESTART ? "start" : settle(data, doc, shapes, b.back, item, aims);
          if (!to) { add(id, "noMatch", tr("この形の箱が無い (回すとここで止まる)", "No box has this shape (runs stop here)")); return; }
          walk(to, b.back === RESTART ? start : item, true, b.back === RESTART && J ? startAimed(data, doc, start) : aimed);
          return;
        }
        if (!b.hand) return;
        // 打てない手 (効かない・消せる物が無いお告げも。tree-sample の handProblem、オーナー 10-22「進行不能」)
        const why = handProblem(data, item, b.hand);
        const first = playHand(data, item, b.hand, rng, handAims(doc, b.id, aims), undefined, false, stripStop(data, doc, b));
        // お告げが効かないだけ (回すと打って進む) は止まりと分ける (10-22 13 通り組んだ #12: 「手が打てない」と出たのに 100 人とも進んだ)
        if (why && first.applied) { const c = waste.get(id) ?? { who: new Set<number>(), reason: why }; c.who.add(person); waste.set(id, c); }
        else if (!first.applied && !J && heldHitOf(data, doc, b, item)) { const hb = heldHitOf(data, doc, b, item)!; walk(hb, item, viaBack, J ? nextAimed(data, doc, aimed, hb, item) : aimed); return; }
        else if (why || !first.applied) { const c = cant.get(id) ?? { who: new Set<number>(), reason: why ?? first.reason ?? "" }; c.who.add(person); cant.set(id, c); return; }
        // 結果の箱に無い結果 (エンジンの stepOutcomes で起こりうる枝を全部。未発現が付く手・繰り返しの手は見ない。
        // フラクチャーも見ない: 必ず選んだ狙いを固定し、外れは費用で数える、10-24 オーナー)
        /** 起こりうる結果が全部見えている時の一覧 (無い結果の箱は下で打ち直さない) */
        let canBe: { out: OutKind; hits: Aim[] }[] | null = null;
        if (!b.hand.repeat && effectOf(b.hand.currency) !== "fracture") {
          const all = stepOutcomes(data, prepFor(data, item, b.hand.currency), b.hand.currency, engineOmens(b.hand)) ?? []; // 規格外の形で (tree-unbounded)
          // 未発現が新しく付く結果だけ見ない (前から未発現を持ったまま打つ手は見る。スイッチ boneLater)
          const veiled = (o: { item: StageItem }): boolean => !!unrevealedOf(o.item) && !(flag("boneLater") && unrevealedOf(item));
          const shown = all.filter((o) => !o.void && !veiled(o)).map((o) => boxOutcomeOf(data, doc, b, item, o.item, aims, J ? aimed : null));
          const miss = shown.filter((oc) => !outBoxOf(doc, b, oc));
          if (miss.length) { const c = odd.get(id) ?? { who: new Set<number>(), outs: new Set<string>() }; c.who.add(person); for (const oc of miss) c.outs.add(outName(oc.out)); odd.set(id, c); }
          if (all.length && shown.length === all.length) canBe = shown;
        }
        // 品質 (オーナー 10-22「ルート精査の時の品質のチェック」): 触媒の品質が当たりの MOD に効くかは下で見る。
        // 聖別・コラプトの後の手・カタリストが入らない手は、上の打てない手 (エンジンの理由) で出る。触媒は打つと品質を使い切るので、前の品質の入れ替えは起きない
        // カタリストは手の札 (前の版) か、前の「カタリストの手」の箱 (品質だけ上げた後の通り抜けの親、今の画面。10-22 13 通り組んだ #6 で見ていなかった)
        const preCat = b.out === "pass" && b.parent ? doc.boxes[b.parent]?.hand : null;
        const cat = b.hand.catalyst ?? (preCat && isCatalyst(preCat.currency) ? preCat.currency : null);
        // スイッチ judgeOne: 触媒の品質の種類はこの人のアイテムの品質の種類 (どの手で上げたかは見ない、S-31b)
        const tag = J ? (b.hand.omens.includes(CATALYSING) && item.qualityTag && (item.catalystQuality ?? item.quality ?? 0) > 0 ? item.qualityTag : null) : cat && b.hand.omens.includes(CATALYSING) ? catalystTagOf(cat) : null;
        let boosted = false, hits = 0;
        for (const o of b.outs) {
          const ob = doc.boxes[o]!;
          // もう付いている狙いの当たりの箱には着かない (打ち直しても付かないので飛ばす。始めに戻った人で当たるまでを 1200 回打ち直し、精査が 13 秒かかった、10-22 金の指輪)
          if (ob.out === "hit" && ob.aim && boxAims(ob).some((a) => aimHeldOn(data, item, a, { sameText: true }))) continue;
          let got: StageItem | null = null;
          const fits = (res: { out: OutKind; hits: Aim[] }): boolean => (res.out === ob.out || !!ob.mergedOuts?.includes(res.out) || ob.out === "any" || ob.out === "pass") && (ob.out !== "hit" || !ob.aim || boxAims(ob).some((x) => res.hits.some((h) => h.modId === x.modId && h.tier === x.tier)) || res.hits.some((a: Aim) => aimKey(a) === aimKey(ob.aim!)));
          // 出ない結果の箱は打ち直さない: 当たるまでの手は当たりしか返さない (外れ・消えたは下の break で必ず着かない)、ほかはエンジンの起こりうる結果に無い物
          // (10-25 不在のアミュ B: カオスの当たるまで →「狙いが消えた」と完璧なエッセンス → 当たり・消えたを 1 箱 1,200 回ずつ打ち、開くたび画面が 17 秒固まった)
          const impossible = b.hand.repeat ? ob.out !== "hit" && ob.out !== "any" && ob.out !== "pass" : !!canBe && !canBe.some(fits);
          for (let i = 0; i < (impossible ? 0 : TRIES) && !got; i++) {
            const r = i === 0 ? first : playHand(data, item, b.hand, rng, handAims(doc, b.id, aims), undefined, false, stripStop(data, doc, b));
            if (!r.applied) break;
            const res = boxOutcomeOf(data, doc, b, item, r.item, aims, J ? aimed : null);
            // 当たるまでの手が上限まで打っても当たらない = 付かない狙いだけ。打ち直しても同じなのでやめる (1 回 5000 回 × 1200 で固まった、10-22)
            if (b.hand.repeat && res.out !== "hit") break;
            if (fits(res)) got = r.item;
          }
          if (got && tag && ob.out === "hit" && ob.aim) {
            // 触媒の品質がこの当たりの MOD に効くか (エンジンの modBoostsOf。触媒は打つと品質を使い切るので、その種類の品質が載った形で聞く)
            const m = allMods(got).find((x) => x.modId === ob.aim!.modId);
            if (m) { hits++; if (modBoostsOf({ ...got, quality: Math.max(got.quality, 1), catalystQuality: 1, qualityTag: tag }, m, data).some((k) => k.kind === "quality")) boosted = true; }
          }
          if (got && J) { const am = nextAimed(data, doc, aimed, o, got), to = routeOf(data, doc, J, o, got, am); if (to) walk(to, got, viaBack, am); }
          else if (got) walk(settle(data, doc, shapes, o, got, aims), got, viaBack);
          // もう付いているかもしれない狙い (狙いが消えた後の取り直し、heldSets) は、付いていない人だけが着くので数えない
          else if (ob.out === "hit" && ob.aim && !viaBack && (J ? !held(id, ob) : !heldSets(doc, id).some((h) => boxAims(ob).some((a) => h.includes(aimKey(a)))))) never.add(o);
        }
        if (tag && hits && !boosted) add(id, "quality", tr("触媒で入れる品質が、この手の当たりの MOD のどれにも効かない (カタリストの種類を確かめる)", "The catalysed quality boosts none of this craft's target mods (check the catalyst type)"));
      };
      walk("start", start, false, J ? startAimed(data, doc, start) : new Set());
      yield { phase: "walk", n: person, of: PEOPLE, partial: ranked([...out, ...cantIssues(), ...oddIssues()]) };
    }
    for (const x of [...cantIssues(), ...oddIssues()]) add(x.boxId, x.kind, x.text);
    for (const [id, c] of waste) add(id, "omenWaste", tr(`お告げが効かない人がいる (${PEOPLE} 人中 ${c.who.size} 人、手は打てる): ${c.reason}`, `The omen is wasted for some runs (${c.who.size} of ${PEOPLE}; the craft still works): ${c.reason}`));
    // 5) 回して止まる箱 (tree-run を 30 人、値段 0)。10-22 靴を白紙から組んで: 100 人中 64 人が止まる箱を上の辿り方では引かなかった
    const steps = runTreeSteps(data, doc, { n: RUN_PEOPLE, seed: 1, price: () => 0, capSteps: 300, untilHit: capped });
    let st = steps.next();
    while (!st.done) { yield { phase: "run", n: st.value, of: RUN_PEOPLE, partial: ranked(out) }; st = steps.next(); }
    const run = st.value;
    // 完成 0 人で半分以上が打ち止め (手の上限) = 完成に着かない (10-22 13 通り組んだ #10: 100 人とも打ち止めの木で精査が何も言わなかった)。
    // ここの回しは手の上限 300 なので、長いだけの木 (100 人回しでは完成 100%) は完成が 1 人でもいれば出さない
    if (!run.finished && run.capped * 2 >= RUN_PEOPLE) add("start", "noDone", tr(`回すと ${RUN_PEOPLE} 人中 1 人も完成せず、${run.capped} 人が手の上限まで打っても着かない (輪から出られない・狙いが付きにくい道を確かめる)`, `None of ${RUN_PEOPLE} runs finished; ${run.capped} hit the craft limit (check for loops or hard-to-hit paths)`));
    for (const [id, n] of Object.entries(run.stuckAt)) {
      // 手も行き先も決めていない箱は 1) の「決めていない」だけ (何もしないスタートで「30 人中 27 人が止まる」が重なり、残りの人が何か分からなかった。10-24 初めての人の回 5)
      if (dead.has(id) || out.some((x) => x.boxId === id && x.kind === "open")) continue;
      const w = run.stuckWhy[id];
      if (w?.spam) { add(id, "stuck", tr(`回すと ${RUN_PEOPLE} 人中 ${n} 人が、当たるまでを ${w.spam} 回打っても当たらず止まる (この形からは狙いが付きにくい・付かない。例: 削減のお告げで満杯の側の入れ替えが続く)。付きやすい狙いを当たりに選ぶか、手・お告げを替える`, `${n} of ${RUN_PEOPLE} runs get no hit in ${w.spam} repeats and stop (the target is unlikely or impossible from this item, e.g. the reduction omen keeps swapping the full side). Pick an easier target or change the craft or omen`)); continue; }
      // 外れを持ったまま戻る「狙いが消えた」の戻り (作り直しでない)。カオスを当たるまでは 1 つしか入れ替えないので、持ち込んだ外れは消えずに先で満杯になる (10-22 靴 b14 → b1、100 人中 63 人)
      const carry = (w?.backs ?? []).filter((x) => doc.boxes[x]?.out === "lost" && doc.boxes[x]?.back !== RESTART);
      add(id, "stuck", stuckText(data, aims, n, w, carry.length > 0, doc.boxes[id]?.hand ?? null) + (flag("settleStrict") && w?.item ? ` (${stuckDetail(doc, w)})` : ""));
      // 10-26: 前は「戻り先を分かれ目の箱に」と勧めていたが、分かれ目を作るボタンは 10-25 に外した (画面でできない直し方だった)
      for (const x of carry) add(x, "carry", tr(`ここで戻ると外れを持ったまま進み、先の箱で側が満杯になって止まる (直すのはこの戻り: 戻りをやめて外れを消す手 (${nameOfKey("annul", null)} + 満杯の側のお告げなど) を次の手にし、その結果から戻す。PC は × で外して＋、スマホは「次の手を決める」)`, `Returning here keeps the misses, so a later box runs out of room and stops (fix this return: replace it with a craft that removes the misses (e.g. ${nameOfKey("annul", null)} with the omen for the full side) and return from its result. On PC remove it with × and use +; on a phone choose "Next craft")`));
    }
    // 回しで結果の箱に無い形になった箱 (5 人の辿りで出なかった物。上限つきの当たるまでが上限で当たらない時など、10-22 13 通り組んだ #13)
    for (const [id, n] of Object.entries(run.unexpected)) {
      const max = doc.boxes[id]?.hand?.repeat?.max;
      add(id, "unexpected", tr(`回すと ${RUN_PEOPLE} 人中 ${n} 人が結果の箱に無い形になる${max ? ` (${max} 回で当たらなかった)` : ""}。形の合う箱へ進み、無ければ止まる。直すには、その結果の箱を足すか、同じ形で手のある箱を作る`, `${n} of ${RUN_PEOPLE} runs end in a shape with no result box${max ? ` (no hit in ${max} tries)` : ""}. They go to a box of the same shape, or stop. Fix: add a box for that result, or a box with a craft for that shape`));
    }
    // 回しで 1 人でも着いた箱は出さない (5 人の辿りは上限つきの当たるまで・始まりに同じ系統が付いている人で外れた、10-22 13 通り組んだ #9 の誤報 3 本)
    for (const id of never) if (!run.boxes[id]?.reach) add(id, "neverHit", tr(`上の手を打ち直してもこの札が付かなかった (側・${TIER}・手を確かめる)`, "This mod never hit when the craft above was retried (check side, tier and craft)"));
  }
  // 3 の続き) 完成の形の食い違い (揃った狙いの数)
  // 一番多く揃う完成の数より少ない形で着く人がいる完成の箱に ! (前は 1 つ目の完成の箱と比べ、どちらが組み違いか分からなかった)
  if (mains.length > 1) {
    // スイッチ judgeOne: 着いた人の実物の数だけで比べる (道の札の数で補わない = S-137。着かなかった完成の箱は比べない)
    const nOf = (id: string): number => heldAtDone.get(id) ?? (J ? NaN : nOfPath(id));
    const most = Math.max(...mains.map((b) => nOf(b.id)).filter((n) => !Number.isNaN(n)));
    for (const b of mains) if (!Number.isNaN(nOf(b.id)) && nOf(b.id) < most) add(b.id, "doneShape", tr(`狙いが ${nOf(b.id)} つしか揃っていない形で着く人がいる (ほかの完成は ${most} つ)`, `Some runs arrive here with only ${nOf(b.id)} target(s) (other done boxes have ${most})`));
  }
  return ranked(out);
}

/** 回して止まる箱の文: 何人・どの側が満杯か・外れの MOD (最初の 1 人の形)。理由が側の満杯でなければエンジンの理由をそのまま */
function stuckText(data: PatchData, aims: readonly Aim[], n: number, w: { reason: string; item: StageItem; noBox?: boolean } | undefined, carry: boolean, hand: Hand | null): string {
  const head = tr(`回すと ${RUN_PEOPLE} 人中 ${n} 人がここで止まる`, `${n} of ${RUN_PEOPLE} runs stop here`);
  // 行き先の箱が無くて止まった (10-22 13 通り組んだ #11: 「手・戻り先が無い」だけでどの結果の箱が無いか分からなかった)
  if (w?.noBox) return `${head}: ${w.reason}`;
  if (!w) return tr(`${head} (手・戻り先が無い、または分かれ目のどの行にも合わない)`, `${head} (no craft or return, or no split row matches)`);
  // 手の無い箱 (完成の箱など) は「この手が打てない」ではない。回した時の理由をそのまま (完成の箱で品質が足りない など。10-27 夕、スイッチ goalShape)
  if (!hand) return `${head}: ${w.reason}`;
  const full = SIDES.filter((side) => !room(w.item, side));
  if (!full.length) return `${head}: ${w.reason}`;
  const junkAll = junkOf(w.item, targetsOf(data, aims), aimOpts(data));
  // 満杯の側の外れを外しても打てない時は、満杯が理由ではない (レアに錬金術・マジックに消去 + 外せない側のお告げなど)。エンジンの理由をそのまま
  // (10-25 指輪の猿 3: 錬金術の外れを始めに戻すと「サフィックスが満杯 → 消去 + お告げが要る」と出て、直しても打てない手を足させていた)
  if (hand) {
    const drop = new Set(full.flatMap((side) => junkAll[side]));
    const cleared: StageItem = { ...w.item, prefixes: w.item.prefixes.filter((m) => !drop.has(m)), suffixes: w.item.suffixes.filter((m) => !drop.has(m)) };
    if (!drop.size || handProblem(data, cleared, hand)) return `${head}: ${w.reason}`;
  }
  const parts = full.map((side) => {
    const junk = junkAll[side];
    const name = side === "prefix" ? tr("プレフィックス", "Prefixes") : tr("サフィックス", "Suffixes");
    return junk.length ? tr(`${name}が満杯 (外れ ${junk.length}: ${junk.map((m) => `${modText(m)} (${m.tierName})`).join("・")})`, `${name} full (${junk.length} miss: ${junk.map((m) => `${modText(m)} (${m.tierName})`).join(", ")})`) : tr(`${name}が満杯`, `${name} full`);
  });
  const fix = carry
    ? tr("。外れを持ったまま戻る「狙いが消えた」の戻りがある (! の付いた戻りの箱)", ". A \"target lost\" return keeps the misses (the return box marked !)")
    : tr(`。この手の前に外れを消す手 (${nameOfKey("annul", null)} + 満杯の側のお告げ) が要る`, `. Remove a miss first (${nameOfKey("annul", null)} + the omen for the full side)`);
  return tr(`${head}: ${parts.join("・")}で着き、この手が打てない${fix}`, `${head}: ${parts.join(", ")}, so this craft can't be used${fix}`);
}

/** 止まる・打てない物を先に (10-22 精査で靴の止まりが完成の札の ! の下に埋もれた) */
const RANK: Partial<Record<CheckKind, number>> = { stuck: 0, carry: 0, cantUse: 1, noMatch: 2, unexpected: 3, open: 4, loop: 5, noDone: 6 };
function ranked(list: readonly CheckIssue[]): CheckIssue[] {
  return list.map((x, i) => ({ x, i })).sort((a, z) => (RANK[a.x.kind] ?? 9) - (RANK[z.x.kind] ?? 9) || a.i - z.i).map((v) => v.x);
}
