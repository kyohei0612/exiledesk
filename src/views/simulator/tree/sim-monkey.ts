/**
 * sim-monkey.ts — 猿の台本が呼ぶツリーのページの中の口 window.__simMonkey (2026-10-24 モンキー隊長の頼み、オーナー「各ベースに猿 3 匹、記録を隊長に」)。
 * 開発の時だけ (release-flags の DEV_BUILD = 手元の dev と preview:prod -- --dev)。本番のビルドでは入れない。
 * 中身は画面と同じ関数を呼ぶだけ (棚 = CurrencyShelf と同じ一覧と useReason、お告げ = omenBlock、手 = tree-hand-plan、組み替え = applyPick、見本 = sampleOf)。
 * 名前はその箱のアイテムで引く (骨の名前は部位で変わる、nameOfKey)。別の打ち方は作らない (メモ feedback-sim-no-own-logic)。液化した感情 (ジュエルだけ) は入口に一覧が無いので棚に入れていない
 *
 *   __simMonkey.setBase("兜", "Imperial Greathelm")     完成形の設定を飛ばしてツリーへ (ベースは英語名か日本語名、空なら部位の代表 = 一番レベルの高い物。アイテムレベルは 3 つ目、既定 82)
 *   __simMonkey.addable()                              手を足せる箱 [{ id, out, needAim, rarity }] (rarity = その箱のアイテム (見本) のレアリティ) (needAim = 当たりの MOD が無い当たりの箱、先に MOD が要る)
 *   __simMonkey.shelf(id)                              その箱の棚 [{ key, name, ok, reason }]
 *   __simMonkey.omens(id, key)                         持った物に掛けられるお告げ [{ key, name, ok, reason }]
 *   __simMonkey.add(id, key, omens?, opt?)             次の手の箱を作る → { ok, problem?, at, boxes: [{ id, out, aim, mods: [{ side, modId, tier, text }] }] }
 *   __simMonkey.hitChoices(id, key, omens?)            窓の「当たりの箱にする MOD」の候補 [{ modId, tier, label }]。add の opt.hitAims = [modId…] でチェック (画面と同じ: [] = 狙い無し、当たるまでなら確定しない (problem「狙う MOD を選んで」、10-25 オーナー)、渡さないと付きうる狙い全部)
 *   __simMonkey.boxItem(id)                            その箱でエンジンに渡すアイテム { item, preItem, raw, preRaw, hand } / run(n=300, seed=1) = 画面と同じ tree-run を値段 1 で (費用 = 個数)
 *   __simMonkey.dump()                                 今の木 (JSON、startRarity = スタートの本当のレアリティ)。add の boxes にも rarity
 * 流れの 2・4 (完成形の設定と結果、10-24 ブラックの頼み。中身は完成形の設定の窓・箱の窓・テストラン・「100 人回す」と同じ関数):
 *   __simMonkey.goalCandidates()                       そのベースの完成の MOD の候補 (完成形の設定の表と同じ行) [{ id, side, group, text, tiers: [{ modId, tier, rank, ilvl, text }] }]
 *   __simMonkey.setGoal([{ modId, tier, fractured? }])  完成の MOD を決め直す (tier = 表の段の番号、その段以上が当たり。fractured = フラクチャーの印) → { ok, goals, left, unknown }
 *   __simMonkey.setAim(id, modId, tier)                当たりの箱の MOD を選ぶ (完成の MOD があればその中から、画面の MOD を選ぶ窓と同じ)
 *   __simMonkey.setBack(id, to)                        戻り先 (箱の id、"start" = 始めに戻る、null で外す。画面と同じく作り直し・形の合う箱は無し)
 *   __simMonkey.setDone(id, on = true)               完成の印 (当たり・分かれ目の行の、次の手も戻りも無い箱だけ)
 *   await __simMonkey.check()                          テストラン (ルート精査) → { passed, done: [完成の箱], issues: [{ boxId, kind, text }] }
 *   await __simMonkey.result(n = 100, seed = 1)        画面の「100 人回す」と同じ値段 (相場、神建て) と始めの値段で回す → { finished, perItem, median, … }
 */
import { baseCatalog, omenBlock, omensAllowedFor, runeOf, socketCapOf, useReason, type StageItem } from "../../../services/craft-stage/engine";
import { CATALYSING } from "../../../services/simulator/tree/tree-hands";
import { sampleOf } from "../../../services/simulator/tree/tree-sample";
import { runTree } from "../../../services/simulator/tree/tree-run";
import { checkTreeAsync } from "../../../services/simulator/tree/tree-check";
import { setAim, setBack, setDone } from "../../../services/simulator/tree/tree-model";
import { RUN_N } from "./use-tree-run";
import { bonesFor, CRAFT_RUNE_KEYS, essenceShelf, nameOfKey, ORBS, runesFor } from "../../../state/for-share/craft-stage-shelf";
import { treeHidden } from "../use-sim-shelf";
import { craftStage as s } from "../../../state/craft-stage";
import { DEV_BUILD } from "../../../web/release-flags";
import { modText } from "../../../i18n/lang";
import { afterQualityOf, applyPick, autoCatOf, handOf, hitAimsOf, hitChoicesOf, kindOf, needAimOf, onlyOf, pickedHits, preFillOf, problemOf, type HandPick } from "./tree-hand-plan";
import { useTree } from "./use-tree";

type Opt = Omit<HandPick, "held" | "omens"> & { /** 当たりの箱にする MOD (modId の並び、[] = 狙い無し。渡さないと付きうる狙い全部) */ hitAims?: string[] };
/** 部位の日本語 → ベースの一覧の部位 (cls) の頭 (英語の部位名ならそのまま頭で合わせる) */
const PART_CLASS: Record<string, string> = {
  兜: "Helmet", 鎧: "Body", 手袋: "Gloves", 靴: "Boots", 盾: "Shield", バックラー: "Buckler", フォーカス: "Foci", 矢筒: "Quiver",
  指輪: "Ring", アミュレット: "Amulet", ベルト: "Belt", ジュエル: "Jewel", 弓: "Bow", クロスボウ: "Crossbow", ワンド: "Wand", スタッフ: "Stav",
  セプター: "Sceptre", スピア: "Spear", 片手メイス: "OneHand_Mace", 両手メイス: "TwoHand_Mace", クォータースタッフ: "Quarterstav", タリスマン: "Talisman",
  // 英語の部位名 (ベースの一覧の部位の id は複数形・下線つき: Foci・Staves・Quarterstaves・OneHand_Maces)
  Focus: "Foci", Staff: "Stav", Quarterstaff: "Quarterstav", Warstaff: "Quarterstav", OneHandMace: "OneHand_Mace", TwoHandMace: "TwoHand_Mace",
};

/** 棚に並ぶ物 (CurrencyShelf と同じ: オーブ・骨・エッセンス、ソケットがあればクラフトのルーン。隠すのはツリーの棚と同じ treeHidden) */
function shelfKeys(it: StageItem): string[] {
  const d = s.data.value;
  if (!d) return [];
  const sockets = socketCapOf(it.base, it.cls.category) > 0 || (it.sockets ?? 0) > 0;
  const runes = sockets ? runesFor(it).flatMap((g) => g.keys).filter((k) => CRAFT_RUNE_KEYS.includes(k) && runeOf(k)) : [];
  return [...ORBS.flatMap((g) => g.keys), ...bonesFor(it), ...essenceShelf(d, it).flatMap((g) => g.keys), ...runes].filter((k) => !treeHidden(k));
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
    /** base は英語名・日本語名 (一覧 baseCatalog の en / ja)。無い・空なら部位 (兜・靴・指輪… か英語の部位名) のうち一番レベルの高いベース */
    setBase(part: string, base = "", itemLevel = 82): { ok: boolean; part: string; base: string; why: string } {
      const d = s.data.value;
      if (!d) return { ok: false, part, base, why: "データの読み込み前" };
      const rows = baseCatalog(d, false);
      const hit = rows.find((r) => r.en === base || r.ja === base) ?? (base ? rows.find((r) => r.en.toLowerCase() === base.toLowerCase()) : undefined);
      let pick = hit?.en, why = hit ? "名前" : "";
      if (!pick) {
        const pre = (PART_CLASS[part] ?? part).toLowerCase();
        const fam = rows.filter((r) => r.cls.toLowerCase().startsWith(pre)).sort((a, b) => b.lvl - a.lvl);
        pick = fam[0]?.en; why = pick ? `部位の代表 (${fam.length} 種のうち一番レベルの高い物)` : "";
      }
      if (!pick) return { ok: false, part, base, why: "名前にも部位にも合うベースが無い" };
      t.startTreeWith(pick, itemLevel);
      t.goalPage.value = 0;
      return { ok: t.doc.value.base === pick, part, base: pick, why };
    },
    addable(): Array<{ id: string; out: string; needAim: boolean; rarity: string | null }> {
      return Object.values(t.doc.value.boxes)
        .filter((b) => !b.hand && !b.back && !b.done && !b.split)
        .map((b) => { const smp = sample(b.id); return { id: b.id, out: b.out, needAim: needAimOf(t.doc.value, b.id, smp?.note), rarity: smp?.item.rarity ?? null }; });
    },
    shelf(id: string): Array<{ key: string; name: string; ok: boolean; reason: string | null }> {
      const d = s.data.value, it = sample(id)?.item;
      if (!d || !it) return [];
      return shelfKeys(it).map((k) => { const reason = useReason(d, it, k, []); return { key: k, name: nameOfKey(k, it), ok: !reason, reason }; });
    },
    omens(id: string, key: string): Array<{ key: string; name: string; ok: boolean; reason: string | null }> {
      const d = s.data.value, it = shelfItemFor(id, key);
      if (!d || !it) return [];
      return omensAllowedFor(key).filter((o) => !treeHidden(o)).map((o) => { const reason = omenBlock(d, it, key, [], o); return { key: o, name: nameOfKey(o, it), ok: !reason, reason }; });
    },
    /** 次に打つ手の窓の「当たりの箱にする MOD」の候補 (画面と同じ hitChoicesOf。付く MOD を選べない手でなければ []) */
    hitChoices(id: string, key: string, omens: string[] = [], echo = true): Array<{ modId: string; tier: number; label: string }> {
      const d = s.data.value, it = sample(id)?.item;
      if (!d || !it) return [];
      return hitChoicesOf(d, t.doc.value, id, it, { held: key, omens, echo }, t.goals.value).map((a) => ({ modId: a.modId, tier: a.tier, label: t.aimLabel(a) }));
    },
    add(id: string, key: string, omens: string[] = [], opt: Opt = {}) {
      const d = s.data.value, smp = sample(id), it = smp?.item;
      if (!d || !it || !t.doc.value.boxes[id]) return { ok: false, problem: "箱が無い・データが無い" };
      if (needAimOf(t.doc.value, id, smp?.note)) return { ok: false, problem: "当たりの MOD が無い当たりの箱 (先に MOD を選ぶ)" };
      const doc = t.doc.value, afterQ = afterQualityOf(doc, id), autoCat = autoCatOf(d, doc, it);
      const needPre = omensAllowedFor(key).includes(CATALYSING) && !afterQ;
      const preFill = preFillOf(d, it, needPre, autoCat);
      // 「当たりの箱にする MOD」のチェック (opt.hitAims = modId の並び、[] = 狙い無し)。渡さない時は前からの既定 (付きうる狙い全部)
      const pick = opt.hitAims ? pickedHits(hitChoicesOf(d, doc, id, it, { held: key, omens, echo: opt.echo }, t.goals.value), opt.hitAims, key, !!opt.spam) : null;
      const h = handOf({ held: key, omens, ...opt, ...(pick ? { free: pick.free } : {}) }), kind = kindOf(h);
      const hitAims = pick && !pick.free ? pick.aims : hitAimsOf(d, doc, id, it, h, t.goals.value, opt.fractureOf ?? null);
      const preCat = h.omens.includes(CATALYSING) && !afterQ ? autoCat : null;
      const only = onlyOf(d, doc, id, h, preCat, hitAims);
      const problem = problemOf(d, it, h, hitAims, preCat, preFill);
      if (problem) return { ok: false, problem };
      let at = id;
      t.edit((x) => { at = applyPick(x, id, h, kind, hitAims, preCat, only); });
      const boxes = (t.doc.value.boxes[at]?.outs ?? []).map((bid) => {
        const b = t.doc.value.boxes[bid]!, item = sample(bid)?.item;
        return {
          id: bid, out: b.out, aim: b.aim, rarity: item?.rarity ?? null,
          mods: item ? [...item.prefixes, ...item.suffixes].map((m) => ({ side: m.side, modId: m.modId, tier: m.tierName, text: modText(m), fractured: !!m.fractured })) : [],
        };
      });
      return { ok: true, at, hand: h, kind, boxes };
    },
    /**
     * その箱でツリーがエンジンに渡すアイテム (sampleOf の見本そのもの)。preItem = その箱の手が触媒のお告げを使う時に、前のカタリストで品質を入れた後 (TreeHandShelf の preFill と同じ)。
     * ジン部長の照らし (scripts/check-monkey-engine.mjs) が stepOutcomes に渡す
     */
    boxItem(id: string) {
      const d = s.data.value, smp = sample(id), b = t.doc.value.boxes[id];
      if (!d || !smp || !b) return null;
      const view = (it: StageItem) => ({
        base: it.base, itemLevel: it.itemLevel, rarity: it.rarity, quality: it.quality, sockets: it.sockets ?? 0, corrupted: it.corrupted,
        mods: [...it.prefixes, ...it.suffixes].map((m) => ({ side: m.side, modId: m.modId, tier: m.tierName, tierIndex: m.tierIndex, fractured: !!m.fractured })),
        runes: (it.augments ?? []).map((a) => (typeof a === "string" ? a : JSON.parse(JSON.stringify(a)) as unknown)),
      });
      const key = b.hand?.currency ?? null;
      const pre = key ? shelfItemFor(id, key) : null;
      // raw / preRaw = 渡している StageItem を JSON にした物そのまま (見えている MOD から組み立てた物との食い違いを照らす、ジン部長 8 本目)
      const raw = (it: StageItem): unknown => JSON.parse(JSON.stringify(it));
      const hasPre = !!pre && pre !== smp.item;
      return { id, out: b.out, note: smp.note, item: view(smp.item), preItem: hasPre ? view(pre!) : null, raw: raw(smp.item), preRaw: hasPre ? raw(pre!) : null, hand: b.hand ? JSON.parse(JSON.stringify(b.hand)) as unknown : null };
    },
    /**
     * 画面の「100 人回す」と同じ tree-run (runTree) を、値段を全部 1・始めの値段 0 で回した結果 (費用 = 使った個数。エンジンの 1/P と並べる、ジン部長 8 本目の頼み)。
     * 神の打ち止め (capDiv) は値段 1 だと個数の上限になってしまうので外し、打ち止めは手の上限 (capSteps、既定 20000) だけ。stuckWhy は理由と箱だけ
     */
    run(n = 300, seed = 1) {
      const d = s.data.value;
      if (!d) return null;
      const r = runTree(d, t.doc.value, { n, seed, price: () => 1, startCost: 0, capDiv: Number.POSITIVE_INFINITY });
      const stuckWhy = Object.fromEntries(Object.entries(r.stuckWhy).map(([k, v]) => [k, { reason: v.reason, backs: v.backs, noBox: !!v.noBox }]));
      return { ...r, stuckWhy };
    },
    goalCandidates() {
      return t.rows.value.map((r) => ({ id: r.id, side: r.side, group: r.group, text: r.text, tiers: r.tiers.map((x) => ({ modId: x.modId ?? r.id, tier: x.tier, rank: x.rank, ilvl: x.ilvl, text: x.text })) }));
    },
    /** 完成形の設定の窓の「狙いにする」「フラクチャー」(toggleGoal・toggleFracture) で、今の狙いを外してから mods を入れる。表に無い MOD は入れずに unknown へ */
    setGoal(mods: Array<{ modId: string; tier: number; fractured?: boolean }>) {
      const known = new Set(t.rows.value.flatMap((r) => r.tiers.map((x) => `${x.modId ?? r.id}|${x.tier}`)));
      const unknown = mods.filter((m) => !known.has(`${m.modId}|${m.tier}`));
      for (const g of [...t.goals.value]) t.toggleGoal(g.modId, g.tier);
      for (const m of mods.filter((x) => !unknown.includes(x))) (m.fractured ? t.toggleFracture : t.toggleGoal)(m.modId, m.tier);
      t.goalPage.value = 0;
      const g = t.goalItem.value;
      return { ok: !unknown.length, goals: JSON.parse(JSON.stringify(t.goals.value)) as unknown, left: g?.left ?? [], unknown };
    },
    setAim(id: string, modId: string, tier: number) {
      const b = t.doc.value.boxes[id], goals = t.goals.value;
      if (b?.out !== "hit") return { ok: false, problem: "当たりの箱ではない" };
      if (goals.length && !goals.some((a) => a.modId === modId && a.tier === tier)) return { ok: false, problem: "完成の MOD に無い (当たりの MOD は完成の MOD から選ぶ)" };
      t.edit((d) => setAim(d, id, { modId, tier }));
      return { ok: t.doc.value.boxes[id]?.aim?.modId === modId };
    },
    /** 戻り先 (画面の戻り先を選ぶ札と同じ setBack。to = 箱の id ("start" = 始めに戻る)・null = 外す。作り直し・形の合う箱は画面でまだ選べないので張れない。次の手のある箱にも張れない) */
    setBack(id: string, to: string | null) {
      t.edit((d) => setBack(d, id, to));
      return { ok: (t.doc.value.boxes[id]?.back ?? null) === to };
    },
    setDone(id: string, on = true) {
      t.edit((d) => setDone(d, id, on ? "main" : null));
      return { ok: (t.doc.value.boxes[id]?.done === "main") === on };
    },
    async check() {
      const d = s.data.value;
      if (!d) return null;
      const issues = await checkTreeAsync(d, t.doc.value, () => {});
      return { passed: !issues.length, done: Object.values(t.doc.value.boxes).filter((b) => b.done === "main").map((b) => b.id), issues };
    },
    /** 画面の use-tree-run と同じ: 相場は高貴建てを神に直し、同じ物の値段は 1 回だけ引く。始めの値段はスタートの値段 (startPrice) */
    async result(n = RUN_N, seed = 1) {
      const d = s.data.value;
      if (!d) return null;
      const div = t.treePrice("divine") || 1, memo = new Map<string, number>();
      const price = (k: string): number => { let v = memo.get(k); if (v === undefined) { v = t.treePrice(k) / div; memo.set(k, v); } return v; };
      const r = runTree(d, t.doc.value, { n, seed, price, startCost: t.startPrice() });
      return { n: r.n, finished: r.finished, capped: r.capped, stuck: r.stuck, stuckAt: r.stuckAt, unexpected: r.unexpected, moved: r.moved, perItem: r.perItem, meanFinished: r.meanFinished, median: r.median, p10: r.p10, p90: r.p90, restarts: r.restarts, startCost: t.startPrice(), divinePrice: div, uses: r.uses,
        // 照らしの台本が同じ打ち止めで辿れるよう、使った手の神建ての値段と打ち止め (runTree の既定、画面と同じ)
        prices: Object.fromEntries(memo), capDiv: 2000, capSteps: 20000 };
    },
    /** 今の木。startRarity = スタートの本当のレアリティ (start.rarity は保存の形の値で、印も＋の MOD も無い時の白とずれる事がある) */
    dump(): unknown { return { ...JSON.parse(JSON.stringify(t.doc.value)), startRarity: sample("start")?.item.rarity ?? null }; },
  };
  (window as unknown as { __simMonkey?: typeof api }).__simMonkey = api;
  return () => { delete (window as unknown as { __simMonkey?: typeof api }).__simMonkey; };
}
