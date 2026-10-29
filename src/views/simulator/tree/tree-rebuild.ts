/**
 * tree-rebuild.ts — 保存の形 v1 (打ち方だけ) から木を組み直す (S-105〜S-107、スイッチ recipeV1)。
 * スタートから上の段の順 (同じ段は結果の順) に、決めのある箱で保存した手を打ち直す = 画面で手を決めた時と同じ applyPick (結果の箱は今の決まり、自動の ↩ も付け直す)。
 * 人の手のある箱は人の手が先 (自動の ↩ で上書きしない)、完成 / 失敗だけの箱は付いた自動の ↩ を外して印を付ける。
 * 札の無くなった決めは要確認 (orphans、⑦20)。前の形の木から開いた時だけ、前に無かった札の箱に「組み直しで増えた」(fresh、⑦19、保存しない)
 */
import type { PatchData } from "../../../services/craft-stage/engine";
import { clearHand, MATCH_BACK, migrateStart, setBack, TREE_SCHEMA_N, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { sameHandByContent } from "../../../services/simulator/tree/tree-judge-link";
import { fromStrip } from "../../../services/simulator/tree/tree-outcome";
import { childKeysOf, isRecipeV1, pathKeysOf, premiseOf, toRecipeV1, type RecipeOrphan } from "../../../services/simulator/tree/tree-recipe-v1";
import { alignEssenceAims, applyPick, kindOf, onlyOf } from "./tree-hand-plan";
import { flag } from "../../../web/release-flags";
import { judgeMemo } from "../../../services/simulator/tree/tree-judge";

export function rebuildTree(data: PatchData, src: TreeDoc): TreeDoc {
  const rec = toRecipeV1(src), d = premiseOf(rec, `exiledesk-tree/${TREE_SCHEMA_N}`);
  migrateStart(d);
  const picks = new Map((rec.picks ?? []).map((p) => [p.at, p]));
  // 保存の札とその上の札の全部 (子の札を探す時に、決めのある道か見る)
  const onPath = new Set([...picks.keys()].flatMap((k) => k.split("/").map((_, i, a) => a.slice(0, i + 1).join("/"))));
  const used = new Set<string>(), decided: string[] = [], idOf = new Map<string, string>(), backs: Array<[string, string, string]> = [];
  // [箱, 今の札, 保存の札]。側の鍵の無い保存の札 (S-65 より前の木) は、側に分かれた箱の全部に同じ決めを付ける (S-106・S-65「両方の側を受ける」)
  const q: Array<[string, string, string]> = [["start", "s", "s"]];
  while (q.length) {
    const [id, key, at] = q.shift()!;
    if (!d.boxes[id]) continue;
    const p = picks.get(at);
    if (!idOf.has(at)) idOf.set(at, id);
    if (p) {
      used.add(at);
      if (p.back) backs.push([id, p.back, at]);
      // エッセンスの MOD の ☑ は木の狙いの段にそろえる (保存した ☑ が一般の段だと当たりの箱が落ちた、alignEssenceAims)
      if (p.hand) { const aims = alignEssenceAims(data, d, p.aims ?? []), pre = p.pre ?? null; applyPick(d, id, p.hand, kindOf(p.hand), aims, pre, onlyOf(data, d, id, p.hand, pre, aims)); }
      const b = d.boxes[id];
      if (b) {
        if ((p.done || p.noAutoBack) && b.autoBack) { b.back = null; delete b.autoBack; delete b.merged; delete b.handBack; }
        if (p.done && !b.hand && !b.back) { b.done = p.done; decided.push(id); }
        if (p.note) b.note = p.note;
        if (p.unwanted) b.unwanted = [...p.unwanted];
        if (p.noAutoBack) b.noAutoBack = true;
      }
    }
    const kids = childKeysOf(d, id, key), exact = new Set(kids.map(([, ck]) => at + ck.slice(key.length)));
    for (const [cid, ck] of kids) q.push([cid, ck, savedKeyOf(at, ck.slice(key.length), onPath, exact)]);
  }
  // 前の版で人が選んだ ↩ は付け直す (S-52b の「読めてそのまま回る」)。行き先の札が今の木に無ければ要確認
  const lostBacks: RecipeOrphan[] = [];
  for (const [id, back, at] of backs) {
    const b = d.boxes[id], to = back === "match" || back === "restart" ? back : idOf.get(back);
    if (!b || b.hand || !to || to === id) { lostBacks.push({ at, why: "back", raw: { back } }); continue; }
    b.back = to; b.done = null; delete b.autoBack; delete b.merged;
  }
  if (flag("judgeOne")) { mergeIntoDecided(data, d, decided); relinkSameHand(data, d); linkLeftovers(data, d); }
  // 決めを打ち直した箱が後の見直しで消えた (同じ手なら戻るで下を畳んだ) 札も要確認
  const gone = [...picks.values()].filter((p) => !used.has(p.at) || !d.boxes[idOf.get(p.at) ?? ""]).map((p): RecipeOrphan => ({ at: p.at, why: "gone", raw: p }));
  const orphans = [...(rec.orphans ?? []), ...lostBacks, ...gone];
  if (orphans.length) d.orphans = orphans;
  // 前の形の木 (箱を全部持っている) から開いた時だけ、前に無かった札の箱が分かる
  if (!isRecipeV1(src)) {
    const before = new Set(pathKeysOf(src).values());
    for (const [id, k] of pathKeysOf(d)) if (!before.has(k)) d.boxes[id]!.fresh = true;
  }
  return d;
}

/**
 * 同じ手なら戻る (S-51) を、組み直しの終わりに全部そろった木で見直す (S-51b)。組み直しの途中は木が半分で見本が違い、✦ だけ残った箱が
 * 同じ手 (左の高貴) のスタートへ戻らず、スタートの下と同じ箱が並んだ (木 oWkFcwYX の b8 → b12・b13)。戻した箱の下の決めは要確認へ (S-107)
 */
function relinkSameHand(data: PatchData, d: TreeDoc): void {
  for (let n = 0; n < 16; n++) {
    const j = judgeMemo(data, d);
    const hit = Object.values(d.boxes).map((b) => (b.hand && b.out !== "start" && !b.split ? ([b.id, sameHandByContent(d, b.id, b.hand, j)] as const) : null)).find((x) => !!x?.[1]);
    if (!hit) return;
    const [id, to] = hit, b = d.boxes[id]!, h = b.hand!;
    clearHand(d, id);
    // 全部消えてよい消去の結果の箱は「形の合う箱へ」= 一人ずつ止まる所へ (S-28。消した後の中身が人ごとに違う)
    if (fromStrip(d, id)) { b.back = MATCH_BACK; b.done = null; } else setBack(d, id, to);
    b.autoBack = true;
    b.handBack = { ...h };
  }
}

/**
 * 子の箱の保存の札 (S-106 の古いレシピの読み方): ぴったり合う札 → 削減の順位の鍵の無い札 (S-65b より前) → 側の鍵の無い札 (S-65 より前、側に分かれた箱の全部へ) →
 * 結果の種類が「打った後」と「外れ」で替わった札 (今の決まりで同じ結果の種類が替わった箱、当たりの MOD と側は同じ。兄弟がぴったり合う札は取らない)。
 * 無ければぴったりの札 (決めの無い新しい箱)
 */
function savedKeyOf(at: string, tail: string, onPath: ReadonlySet<string>, exact: ReadonlySet<string>): string {
  const bare = (t: string): string => t.replace(/\[[^\]]*\](~\d+)?$/, "");
  const swap = (t: string): string | null => (/^\/junk/.test(t) ? t.replace(/^\/junk/, "/any") : /^\/any/.test(t) ? t.replace(/^\/any/, "/junk") : null);
  // 削減の順位の鍵 (`;w:`、S-65b より前の保存には無い) を外した札 = 順位で分かれた箱の全部へ (側の鍵の無い札と同じ読み方)
  const unrank = (t: string): string => t.replace(/;w:[^\]]*\]/, "]");
  const sw = swap(tail);
  const tries = [at + tail, at + unrank(tail), at + bare(tail), ...(sw ? [at + sw, at + bare(sw)] : [])];
  return tries.find((k, i) => onPath.has(k) && (i < 3 || !exact.has(k))) ?? at + tail;
}

/**
 * 完成 / 失敗を付けた箱へ、同じ段・同じ中身で決めの無い箱をまとめ直す (S-66 のまとめ先は作った順より人の決めが先、S-105)。
 * 組み直しは上の段から作るので、前の木で人が決めた箱より先に同じ中身の箱ができ、そちらがまとめ先になって決めの無い箱に人が流れた
 * (10-29 共有の木 GFFzxueM: 前は 3 箱が「失敗」の箱にまとまっていたのに、組み直すと決めの無い箱へまとまって止まり 0 → 32)。そこを指していた ↩ も付け替える
 */
function mergeIntoDecided(data: PatchData, d: TreeDoc, decided: readonly string[]): void {
  const j = judgeMemo(data, d), depth = (id: string): number => { let n = 0; for (let b = d.boxes[id]; b?.parent; b = d.boxes[b.parent]) n++; return n; };
  for (const x of decided) {
    for (const l of Object.values(d.boxes)) {
      if (l.id === x || l.hand || l.done || l.split || l.noAutoBack || (l.back && !l.autoBack) || !OPEN.has(l.out) || depth(l.id) !== depth(x) || !j.fitsBox(l.id, x)) continue;
      for (const o of Object.values(d.boxes)) if (o.autoBack && o.back === l.id) o.back = x;
      l.back = x; l.autoBack = true; l.merged = true;
    }
  }
}
const OPEN: ReadonlySet<string> = new Set(["junk", "any", "junkGone", "lost"]);
/**
 * 組み直した後も決めも ↩ も無い箱は、見本の中身が全部同じ 1 つの箱 (手か完成 / 失敗のある箱、浅い段から) の中身に入るならその箱へ自動の ↩ (S-107 ②)。
 * 前の木に無かった結果の箱 (今の決まりで増えた結果) に着く人は、前の版では回すと「同じ状態の箱へ」移って進んでいた (10-29 共有の木 ibMlQuAV の b22・b24)
 */
function linkLeftovers(data: PatchData, d: TreeDoc): void {
  const j = judgeMemo(data, d), depth = (id: string): number => { let n = 0; for (let b = d.boxes[id]; b?.parent; b = d.boxes[b.parent]) n++; return n; };
  const seq = (id: string): number => (id === "start" ? -1 : Number(/\d+$/.exec(id)?.[0] ?? 0));
  const targets = Object.values(d.boxes).filter((b) => b.hand || b.done).map((b) => b.id).sort((x, y) => depth(x) - depth(y) || seq(x) - seq(y));
  for (const b of Object.values(d.boxes)) {
    if (b.out === "start" || b.hand || b.back || b.done || b.split || b.noAutoBack) continue;
    const cs = j.contents(b.id);
    if (!cs?.size) continue;
    // 結果が 1 通りの手 (ルーン・品質を最大までなど) の結果を同じ中身の親へ戻すと、打っても変わらない手の輪になる (linkByContent と同じ守り。
    // ルーンの後の箱が ↩ ルーンの箱になり、同じルーンは通り抜けるので回り続けた、10-29 pass-armor、S-31e)
    const loop = (t: string): boolean => t === b.parent && (d.boxes[t]?.outs.length ?? 0) <= 1;
    const tos = new Set([...cs].map((k) => targets.find((t) => t !== b.id && !loop(t) && !!j.contents(t)?.has(k)) ?? null));
    const to = tos.size === 1 ? [...tos][0] : null;
    if (to) { b.back = to; b.autoBack = true; }
  }
}

/** 開く木の形 (use-tree の open): スイッチ recipeV1 の下と v1 の木は組み直す。データがまだ無ければ前提だけ (wait = データが来たら開き直す) */
export function openForm(tree: TreeDoc, data: PatchData | null | undefined): { doc: TreeDoc; wait: boolean } {
  if (!isRecipeV1(tree) && !flag("recipeV1")) return { doc: tree, wait: false };
  return data ? { doc: rebuildTree(data, tree), wait: false } : { doc: premiseOf(toRecipeV1(tree), `exiledesk-tree/${TREE_SCHEMA_N}`), wait: true };
}
