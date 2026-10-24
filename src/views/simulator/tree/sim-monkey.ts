/**
 * sim-monkey.ts — 猿の台本が呼ぶツリーのページの中の口 window.__simMonkey (2026-10-24 モンキー隊長の頼み、オーナー「各ベースに猿 3 匹、記録を隊長に」)。
 * 開発の時だけ (release-flags の DEV_BUILD = 手元の dev と preview:prod -- --dev)。本番のビルドでは入れない。
 * 中身は画面と同じ関数を呼ぶだけ (棚 = CurrencyShelf と同じ一覧と useReason、お告げ = omenBlock、手 = tree-hand-plan、組み替え = applyPick、見本 = sampleOf)。
 * 名前はその箱のアイテムで引く (骨の名前は部位で変わる、nameOfKey)。別の打ち方は作らない (メモ feedback-sim-no-own-logic)。液化した感情 (ジュエルだけ) は入口に一覧が無いので棚に入れていない
 *
 *   __simMonkey.setBase("兜", "Imperial Greathelm")     完成形の設定を飛ばしてツリーへ (部位は記録用、ベースは英語名。アイテムレベルは 3 つ目、既定 82)
 *   __simMonkey.addable()                              手を足せる箱 [{ id, out, needAim }] (needAim = 当たりの MOD が無い当たりの箱、先に MOD が要る)
 *   __simMonkey.shelf(id)                              その箱の棚 [{ key, name, ok, reason }]
 *   __simMonkey.omens(id, key)                         持った物に掛けられるお告げ [{ key, name, ok, reason }]
 *   __simMonkey.add(id, key, omens?, opt?)             次の手の箱を作る → { ok, problem?, at, boxes: [{ id, out, aim, mods: [{ side, modId, tier, text }] }] }
 *   __simMonkey.dump()                                 今の木 (JSON)
 */
import { omenBlock, omensAllowedFor, runeOf, socketCapOf, useReason, type StageItem } from "../../../services/craft-stage/engine";
import { CATALYSING } from "../../../services/simulator/tree/tree-hands";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { bonesFor, CRAFT_RUNE_KEYS, essenceShelf, nameOfKey, ORBS, runesFor } from "../../../state/for-share/craft-stage-shelf";
import { simHidden } from "../../../state/for-share/shelf-context";
import { craftStage as s } from "../../../state/craft-stage";
import { DEV_BUILD } from "../../../web/release-flags";
import { modText } from "../../../i18n/lang";
import { afterQualityOf, applyPick, autoCatOf, handOf, hitAimsOf, kindOf, needAimOf, onlyOf, preFillOf, problemOf, type HandPick } from "./tree-hand-plan";
import { useTree } from "./use-tree";

type Opt = Omit<HandPick, "held" | "omens">;

/** 棚に並ぶ物 (CurrencyShelf と同じ: オーブ・骨・エッセンス、ソケットがあればクラフトのルーン。隠すのは simHidden) */
function shelfKeys(it: StageItem): string[] {
  const d = s.data.value;
  if (!d) return [];
  const sockets = socketCapOf(it.base, it.cls.category) > 0 || (it.sockets ?? 0) > 0;
  const runes = sockets ? runesFor(it).flatMap((g) => g.keys).filter((k) => CRAFT_RUNE_KEYS.includes(k) && runeOf(k)) : [];
  return [...ORBS.flatMap((g) => g.keys), ...bonesFor(it), ...essenceShelf(d, it).flatMap((g) => g.keys), ...runes].filter((k) => !simHidden(k));
}

export function installSimMonkey(): () => void {
  if (!DEV_BUILD) return () => {};
  const t = useTree();
  const sample = (id: string) => (s.data.value ? sampleOf(s.data.value, t.doc.value, id, 1) : null);
  /** 棚に渡すアイテム (触媒のお告げが掛けられる物を持った時は、前のカタリストで品質を入れた後。TreeHandShelf と同じ) */
  function shelfItemFor(id: string, key: string | null): StageItem | null {
    const d = s.data.value, it = sample(id)?.item ?? null;
    if (!d || !it || !key) return it;
    const needPre = omensAllowedFor(key).includes(CATALYSING) && !afterQualityOf(t.doc.value, id);
    return preFillOf(d, it, needPre, autoCatOf(d, t.doc.value, it))?.item ?? it;
  }
  const api = {
    setBase(part: string, base: string, itemLevel = 82): { ok: boolean; part: string; base: string } {
      t.startTreeWith(base, itemLevel);
      t.goalPage.value = 0;
      return { ok: t.doc.value.base === base, part, base };
    },
    addable(): Array<{ id: string; out: string; needAim: boolean }> {
      return Object.values(t.doc.value.boxes)
        .filter((b) => !b.hand && !b.back && !b.done && !b.split)
        .map((b) => ({ id: b.id, out: b.out, needAim: needAimOf(t.doc.value, b.id, sample(b.id)?.note) }));
    },
    shelf(id: string): Array<{ key: string; name: string; ok: boolean; reason: string | null }> {
      const d = s.data.value, it = sample(id)?.item;
      if (!d || !it) return [];
      return shelfKeys(it).map((k) => { const reason = useReason(d, it, k, []); return { key: k, name: nameOfKey(k, it), ok: !reason, reason }; });
    },
    omens(id: string, key: string): Array<{ key: string; name: string; ok: boolean; reason: string | null }> {
      const d = s.data.value, it = shelfItemFor(id, key);
      if (!d || !it) return [];
      return omensAllowedFor(key).map((o) => { const reason = omenBlock(d, it, key, [], o); return { key: o, name: nameOfKey(o, it), ok: !reason, reason }; });
    },
    add(id: string, key: string, omens: string[] = [], opt: Opt = {}) {
      const d = s.data.value, smp = sample(id), it = smp?.item;
      if (!d || !it || !t.doc.value.boxes[id]) return { ok: false, problem: "箱が無い・データが無い" };
      if (needAimOf(t.doc.value, id, smp?.note)) return { ok: false, problem: "当たりの MOD が無い当たりの箱 (先に MOD を選ぶ)" };
      const doc = t.doc.value, afterQ = afterQualityOf(doc, id), autoCat = autoCatOf(d, doc, it);
      const needPre = omensAllowedFor(key).includes(CATALYSING) && !afterQ;
      const preFill = preFillOf(d, it, needPre, autoCat);
      const h = handOf({ held: key, omens, ...opt }), kind = kindOf(h);
      const hitAims = hitAimsOf(d, doc, id, it, h, t.goals.value, opt.fractureOf ?? null);
      const preCat = h.omens.includes(CATALYSING) && !afterQ ? autoCat : null;
      const only = onlyOf(d, doc, id, h, preCat, hitAims);
      const problem = problemOf(d, it, h, hitAims, preCat, preFill);
      if (problem) return { ok: false, problem };
      let at = id;
      t.edit((x) => { at = applyPick(x, id, h, kind, hitAims, preCat, only); });
      const boxes = (t.doc.value.boxes[at]?.outs ?? []).map((bid) => {
        const b = t.doc.value.boxes[bid]!, item = sample(bid)?.item;
        return {
          id: bid, out: b.out, aim: b.aim,
          mods: item ? [...item.prefixes, ...item.suffixes].map((m) => ({ side: m.side, modId: m.modId, tier: m.tierName, text: modText(m), fractured: !!m.fractured })) : [],
        };
      });
      return { ok: true, at, hand: h, kind, boxes };
    },
    dump(): unknown { return JSON.parse(JSON.stringify(t.doc.value)); },
  };
  (window as unknown as { __simMonkey?: typeof api }).__simMonkey = api;
  return () => { delete (window as unknown as { __simMonkey?: typeof api }).__simMonkey; };
}
