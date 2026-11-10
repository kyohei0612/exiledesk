/**
 * tree-whittle-pre.ts — 削減の手前の枠 (S-65c、11-10 オーナー「エッセンスのときみたいに、削減打つ前の枠を1つ増やす必要あると思う」)。
 * ランダムに付いた外れ MOD のある結果の箱に削減の手 (お告げ + カオス) を置くと、1 つ前の手 (親の箱) の結果のその箱を、外れの MOD レベルで
 * 「低い・同じ・高い」の枠 (鍵 l:lo / l:eq / l:hi) に分ける。枠はエンジンのデータで付きうる組だけ (tree-whittle の lvClassesOf、決め打ちしない)。
 * 削減を置いた箱は自分の品の組の枠になり、ほかの組は手の無い兄弟の箱 (各枠に人が次の手を自由に置く)。回す人は打った後の外れの MOD レベルで枠へ (tree-outcome の lvKeyed)。
 * 削減の手が無くなった組は、人の決め (手・人の ↩・完成 / 失敗) の無い枠を消し、1 つだけ残ったら鍵の組を外す
 */
import type { PatchData } from "../../../services/craft-stage/engine";
import { frameOfDoc } from "../../../services/simulator/tree/tree-frame";
import { addOut } from "../../../services/simulator/tree/tree-model-ops";
import { drop, type Hand, type OutKind, type TreeBox, type TreeDoc } from "../../../services/simulator/tree/tree-model";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { aimedOfSample, sampleAimed } from "../../../services/simulator/tree/tree-judge";
import { isWhittleHand, LV_ORDER, lvClassesOf, lvClassOf, lvPart, stripLv, withLv, type LvClass } from "../../../services/simulator/tree/tree-whittle";
import { frameGroupKey as groupKey, whittleCompare } from "../../../services/simulator/tree/tree-whittle-scene";

/** 枠に分けるかは箱の種類で決めない: 削減の手を置いた箱の品に乱数の外れ MOD があれば、どの種類の箱でも分ける (S-65c ①、11-10 オーナー「枠の決まりとしてこの枠の形ならの方がいいのではそもそも」)。組の鍵は tree-whittle-scene の 1 つ */
/** 人の決めの無い箱 (消してよい) */
const idle = (d: TreeDoc, id: string): boolean => { const c = d.boxes[id]; return !!c && !c.hand && (!c.back || !!c.autoBack) && !c.done && !c.split; };

/**
 * 箱 a の手の結果の箱を、削減の手前の枠にそろえる。足した箱の id。
 * changed = 手を置いた箱: 枠を畳む (削減の手が無くなった組) のはその箱の組だけ (開いた時の組み直しで、まだ決めを打ち直していない枠を兄弟の手で畳まない)
 */
export function syncWhittlePre(data: PatchData, d: TreeDoc, a: string | null, changed?: string): string[] {
  const p = a ? d.boxes[a] : undefined;
  if (!p?.hand) return [];
  const groups = new Map<string, string[]>();
  for (const id of p.outs) { const c = d.boxes[id]; if (c) { const k = groupKey(c); (groups.get(k) ?? groups.set(k, []).get(k)!).push(id); } }
  const made: string[] = [];
  let ft: ReturnType<typeof frameOfDoc> | null = null;
  for (const ids of groups.values()) {
    const holders = ids.filter((id) => isWhittleHand(d.boxes[id]!.hand));
    // 付きうる組 (どの箱の代表の品でも、乱数の外れは全部の出方に差し替えて見るので同じ答え)
    let cls: Set<LvClass> | null = null, own: LvClass | null = null;
    if (holders.length) {
      ft ??= frameOfDoc(data, d);
      for (const id of [...holders, ...ids]) {
        // 代表の品 (配置) が無い箱 (↩ で着く人だけの箱など) は見本で見る (エッセンスと同じ MOD の枠の needsSameMod と同じ)
        const f = ft.frames.get(id), smp = !f || f.note ? sampleOf(data, d, id, 1) : null;
        if (smp && (smp.note === "none" || smp.note?.startsWith("cant:"))) continue;
        const item = smp ? smp.item : f!.item, aimed = smp ? aimedOfSample(id, smp.item) ?? sampleAimed(data, d, id, 1) : f!.aimed;
        // 残したい MOD は外れの式の札 (完成形の ☑ の狙い・置き石) で見る = 回す時の lvKeyed・判定と同じ (完成形に無いエッセンスの MOD は外れ、S-33c)
        // 削減の手で残したい MOD を決めていれば、☑ を外した MOD は外れとして比べる (S-27b 11-10)
        // 比べるのは削減の手のお告げで消える側の MOD だけ (左側の抹消ならプレフィックス、11-10)。札と側は tree-whittle-scene の 1 つ
        const { wanted, miss, side } = whittleCompare(data, d, d.boxes[holders[0]!]!.hand, aimed, item);
        cls = lvClassesOf(data, item, wanted, side);
        own = lvClassOf(item, miss, side);
        break;
      }
    }
    if (!cls) { if (changed && ids.includes(changed)) unsplit(d, p.id, ids); continue; }
    // 削減を置いた箱で組の無い物は、自分の品の組 (付きえなければ付きうる最初の組) の枠に
    const taken = new Set(ids.map((id) => lvPart(d.boxes[id]!.junkKey)).filter((c): c is LvClass => !!c));
    for (const id of ids) {
      const c = d.boxes[id]!;
      if (lvPart(c.junkKey)) continue;
      const pick = own && cls.has(own) && !taken.has(own) ? own : LV_ORDER.find((x) => cls!.has(x) && !taken.has(x));
      if (!pick) continue;
      c.junkKey = withLv(c.junkKey, pick);
      taken.add(pick);
    }
    const first = d.boxes[ids[0]!]!;
    for (const x of LV_ORDER) if (cls.has(x) && !taken.has(x)) made.push(addLike(d, p.id, first, withLv(first.junkKey, x)));
    // 付きえない組の枠 (前の手を替えた・データで出ない) は人の決めが無ければ消す
    const gone = ids.filter((id) => { const c = lvPart(d.boxes[id]!.junkKey); return !!c && !cls!.has(c) && idle(d, id); });
    if (gone.length) { drop(d, gone); p.outs = p.outs.filter((o) => !gone.includes(o)); }
  }
  return made;
}

/** 削減の手が無くなった・乱数の外れが無い組: 人の決めの無い枠を消し、1 つだけ残ったら鍵の組を外す */
function unsplit(d: TreeDoc, pid: string, ids: readonly string[]): void {
  const lv = ids.filter((id) => lvPart(d.boxes[id]!.junkKey));
  if (!lv.length) return;
  const keep = lv.filter((id) => !idle(d, id)), base = ids.filter((id) => !lvPart(d.boxes[id]!.junkKey));
  // 全部手が無ければ 1 つ (並びの先頭) を残す
  const stay = keep.length || base.length ? keep : [lv[0]!];
  const gone = lv.filter((id) => !stay.includes(id));
  if (gone.length) { drop(d, gone); d.boxes[pid]!.outs = d.boxes[pid]!.outs.filter((o) => !gone.includes(o)); }
  if (stay.length + base.length === 1) for (const id of stay) { const c = d.boxes[id]!; c.junkKey = stripLv(c.junkKey); if (!c.junkKey) delete c.junkKey; }
}

/**
 * 開いた時の組み直し (tree-rebuild): 箱 id の手を打ち直した後、保存の札に枠の組の付いた子 (…/junk[s:1|0;l:hi] など) があれば、
 * 子を打ち直す前にその組の枠を作る (削減の手が置かれるのは子を打ち直した後なので、先に作らないと枠の決めの札が今の木に無い)
 */
export function restoreWhittlePre(d: TreeDoc, id: string, at: string, onPath: ReadonlySet<string>): void {
  const p = d.boxes[id];
  if (!p?.hand) return;
  for (const o of [...p.outs]) {
    const c = d.boxes[o];
    if (!c || lvPart(c.junkKey)) continue;
    const saved = LV_ORDER.filter((x) => onPath.has(`${at}/${c.out}${c.aim ? `:${c.aim.modId}#${c.aim.tier}` : ""}[${withLv(c.junkKey, x)}]`)); // 札の形は tree-recipe-v1 の outKey (当たりは狙いも)
    if (!saved.length || p.outs.some((s) => { const x = d.boxes[s]; return !!x && groupKey(x) === groupKey(c) && !!lvPart(x.junkKey); })) continue;
    const base = c.junkKey;
    c.junkKey = withLv(base, saved[0]!);
    for (const x of saved.slice(1)) addLike(d, id, c, withLv(base, x));
  }
}

/**
 * 手を置く前 (applyPick): 削減の手なら先に枠をそろえる (この箱の枠の組が決まってから結果の箱を作る = その組の出方だけの結果、S-65c ④)。
 * この箱の鍵が変わった (枠に割れた) なら true = 呼ぶ側は割る前に数えた結果の一覧 (only) を数え直す
 * (11-10 1 外れの試し: 割る前の一覧のまま置き、低い枠の下に誰も来ない「狙いが消えた」が 2 箱出た)
 */
export function syncBeforeHand(data: PatchData, d: TreeDoc, at: string, h: Hand): boolean {
  const b = d.boxes[at];
  if (!b?.parent || !isWhittleHand(h)) return false;
  const was = b.hand, key = b.junkKey;
  b.hand = h;
  syncWhittlePre(data, d, b.parent, at);
  b.hand = was;
  return d.boxes[at]?.junkKey !== key;
}

/** 箱 src と同じ種類 (当たりなら同じ狙い) の手の無い枠を親 pid の下に足す */
function addLike(d: TreeDoc, pid: string, src: TreeBox, key: string): string {
  const id = addOut(d, pid, src.out as OutKind, key), c = d.boxes[id]!;
  if (src.out === "hit") { c.aim = src.aim ? { ...src.aim } : null; if (src.anyOf?.length) c.anyOf = src.anyOf.map((a) => ({ ...a })); }
  return id;
}
