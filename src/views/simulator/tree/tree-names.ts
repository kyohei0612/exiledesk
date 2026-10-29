/**
 * tree-names.ts — ツリーの打つ手の名前 (2026-10-23 オーナー「表示は全部エンジンを軸にして参照させて」)。
 * 名前はクラフト台の棚と同じ nameOfKey (state/emulator/craft-stage-shelf.ts。骨の名前は部位で変わるので、ツリーのベースのアイテムを渡す)。
 * 前は price-keys.json を自前で引いていた (tree-hands.ts の nameOfKey、消した)
 */
import { computed } from "vue";
import { iconOfKey, nameOfKey } from "../../../state/for-share/craft-stage-shelf";
import { craftStage as s } from "../../../state/craft-stage";
import { freshItem } from "../../../services/craft-stage/engine";
import { CATALYSING, effectOf, isCatalyst } from "../../../services/simulator/tree/tree-hands";
import { boxAims, fractureMarks, startRarity, startsFractured, type Hand, type SplitWhen, type TreeBox, type TreeDoc, type TreeRarity } from "../../../services/simulator/tree/tree-model";
import { useTree } from "./use-tree";
import { isRevealHand, veilKeep, veilPick } from "../../../services/simulator/tree/tree-veil";
import { junkKeyLabel } from "../../../services/simulator/tree/tree-frac-pick";
import { isSideKey, isStripKey, sideKeyLabel, stripKeyLabel } from "../../../services/simulator/tree/tree-junk-side";
import { rankLabel } from "../../../services/simulator/tree/tree-whittle";
import { FRACTURE_POOL } from "../../../services/simulator/sim-odds";
import { tr } from "../../../i18n/lang";
import { flag } from "../../../web/release-flags";

/** 名前を引く時のアイテム (ツリーのベース。骨・エッセンスの名前が部位で変わる) */
const t = useTree();
const baseItem = computed(() => (s.data.value ? freshItem(s.data.value, t.doc.value.base, t.doc.value.itemLevel, "rare") : null));

/**
 * 結果ごとの名前・色・印 (10-22 見た目の作り直し、research/notes/2026-10-22-tree-ui-references.md の 2: ネオンの縁 + 印 + 題 + 副題)。
 * 色は線の色 (SimTreePage の LINE) と同じ系統: 進む = 金 / 外れ・消えた = 赤・紫・灰 / 始まり = 水色。箱 (TreeBox) とまとめた札 (TreeMergeLayer) で同じ
 */
export const OUT_LOOK: Record<TreeBox["out"], { ja: string; en: string; c: string; icon: string }> = {
  start: { ja: "スタート", en: "Start", c: "95,180,224", icon: "sparkles" },
  hit: { ja: "当たり", en: "Hit", c: "224,176,96", icon: "target" },
  junk: { ja: "外れ", en: "Miss", c: "224,112,122", icon: "x" },
  junkGone: { ja: "外れが消えた", en: "Miss removed", c: "154,167,184", icon: "check" },
  lost: { ja: "狙いが消えた", en: "Target lost", c: "165,139,224", icon: "rotate" },
  any: { ja: "打った後", en: "After", c: "200,184,150", icon: "plus" },
  pass: { ja: "品質を上げた後", en: "Quality raised", c: "200,184,150", icon: "plus" },
  // 分かれ目の行の箱 (打たずに分けた先。副題は行の条件、splitWhenText)
  branch: { ja: "分かれ目の先", en: "Branch", c: "120,200,190", icon: "arrow-right" },
};

/** 分かれ目の 1 行の条件の文 (画面で選べる 4 つ + 組み合わせ。空 = それ以外) */
export function splitWhenText(w: SplitWhen): string {
  const parts: string[] = [];
  const h = w.heldCount;
  if (h) parts.push(h[0] === 0 && h[1] === 0 ? tr("狙いが 1 つも無い", "No targets yet") : tr(`狙いが ${h[0]} つ以上`, `${h[0]}+ targets`));
  const SIDE = { prefix: ["プレ", "prefix"], suffix: ["サフィ", "suffix"], any: ["どちらか", "any side"] } as const;
  for (const sd of ["prefix", "suffix", "any"] as const) { const j = w.junk?.[sd]; if (j) parts.push(tr(`外れ (${SIDE[sd][0]}) が ${j[0]} つ以上`, `${j[0]}+ misses (${SIDE[sd][1]})`)); }
  return parts.length ? parts.join(tr(" かつ ", " and ")) : tr("それ以外", "Otherwise");
}

/** 箱の種類の名前 (始まり・当たり・外れ…。一覧・戻り先の札・まとめた札で同じ) */
export const outName = (out: TreeBox["out"]): string => tr(OUT_LOOK[out].ja, OUT_LOOK[out].en);
/** 手の窓の「結果の箱」の名前 (骨を未発現のまま次へは「未発現の冒涜が付いた」、スイッチ boneLater) */
export function outNameOf(h: Hand | null | undefined, out: TreeBox["out"], aim?: TreeBox["aim"]): string {
  if (out === "any" && veilKeep(h)) return tr("未発現の冒涜が付いた", "Unrevealed desecrated mod added");
  // 印の無い木の狙い無しのフラクチャー (スイッチ fracPick)
  if (h?.free && flag("fracPick") && effectOf(h.currency) === "fracture") {
    if (out === "hit" && aim) { const n = modShort(useTree().aimShort(aim)); return tr(`${n}がフラクチャーされた場合`, `If ${n} is fractured`); }
    if (out === "junk") return tr("外れ MOD がフラクチャーされた場合", "If a miss mod is fractured");
  }
  return outName(out);
}
/** 箱の結果の名前 (同じ形でまとめた箱は「外れ・狙いが消えた」) */
export const outsName = (b: { out: TreeBox["out"]; mergedOuts?: Array<TreeBox["out"]> }): string => [b.out, ...(b.mergedOuts ?? [])].map(outName).join(tr("・", " / "));

/** MOD の文から数字・括弧・「が増加する」を除いた短い名前 (枠の札で「キャストスピードが(25-28)%増加するが付いた」と長くなった。全文は乗せた時の文で) */
export const modShort = (text: string): string => text.replace(/\([^)]*\)/g, "").replace(/[+-]?\d+(\.\d+)?%?/g, "").replace(/%/g, "").replace(/が(増加|減少)する$/, "").replace(/\s+/g, " ").trim() || text;
/**
 * 箱の題 (枠の上の線に乗る札、スマホの行の題)。当たりは「スピリットが付いた」(どれかの箱は「スピリットかライフが付いた」)、ほかは結果の名前 (外れ・狙いが消えた・打った後…)。
 * 「当たり」とは書かない (狙い無しの手の下でも付いた MOD が分かるように、狙いのある手も同じ言い方に揃えた。10-26 オーナー「枠の上のところに●がついた みたいな形でよくある枠の形にしたら枠中ごちゃんなくていいよな」)
 */
export function headOf(b: Pick<TreeBox, "out" | "aim" | "anyOf" | "mergedOuts"> & { parent?: string | null }, aimShort: (a: NonNullable<TreeBox["aim"]>) => string): string {
  // ✦ の印の無い木の乱数のフラクチャーの結果は「〜が固定された」「外れ MOD が固定された」(付いたのではない。10-27 夜、要望 8a159e29、スイッチ fracRandom)
  const ph = b.parent ? useTree().doc.value.boxes[b.parent]?.hand : null;
  // ✦ の木のフラクチャー (どの ✦ が固定されても当たり) も「〜が固定された」(スイッチ fracMulti、S-42)
  const fixed = ph?.pick === "random" || (flag("fracMulti") && !!ph && effectOf(ph.currency) === "fracture");
  const free = fixed && !!ph?.free && flag("fracPick");
  if (b.out === "hit" && b.aim) { const n = boxAims(b).map((a) => modShort(aimShort(a))).join(tr("か", " or ")); return free ? tr(`${n}がフラクチャーされた場合`, `If ${n} is fractured`) : fixed ? tr(`${n}が固定された`, `${n} fractured`) : tr(`${n}が付いた`, `${n} added`); }
  if (free && b.out === "junk") {
    // 外れの枝が 2 つ以上 (側・種類が違う) の時だけ、どの外れかを付ける
    const many = (useTree().doc.value.boxes[b.parent!]?.outs ?? []).filter((o) => useTree().doc.value.boxes[o]?.junkKey).length > 1, k = (b as { junkKey?: string }).junkKey;
    if (many && k) { const [ja, en] = junkKeyLabel(k); return tr(`外れ MOD (${ja}) がフラクチャーされた場合`, `If a miss mod (${en}) is fractured`); }
    return tr("外れ MOD がフラクチャーされた場合", "If a miss mod is fractured");
  }
  if (fixed && b.out === "junk") return tr("外れ MOD が固定された", "A miss mod fractured");
  // 骨を未発現のまま次へ (スイッチ boneLater)
  const base = b.out === "any" && b.parent && veilKeep(useTree().doc.value.boxes[b.parent]?.hand) ? tr("未発現の冒涜が付いた", "Unrevealed desecrated mod added") : outsName(b);
  // 側で分けた箱 (S-65、スイッチ junkSide): 同じ種類の箱が側で 2 つ以上の時だけ、どの側かを付ける
  const k = (b as { junkKey?: string }).junkKey;
  // 削減の手で外れの順位で分けた箱 (S-65b、スイッチ whittleRank): 順位の鍵があればいつも付ける
  const rk = k && b.parent ? rankLabel(k) : null;
  // 全部消えてよい消去の結果は中身ごとの箱 (S-28d): 2 つ以上並ぶ時だけ残った外れの数を付ける
  // 残したい MOD の消去の「狙いが消えた」(S-28e) も同じ鍵: 同じ種類の箱が 2 つ以上並ぶ時だけ
  if (isStripKey(k) && b.parent && (useTree().doc.value.boxes[b.parent]?.outs ?? []).filter((o) => useTree().doc.value.boxes[o]?.out === b.out).length > 1) { const [ja, en] = stripKeyLabel(k); return tr(`${base} (${ja})`, `${base} (${en})`); }
  if (isSideKey(k) && b.parent) {
    const doc = useTree().doc.value, many = (doc.boxes[b.parent]?.outs ?? []).filter((o) => doc.boxes[o]?.out === b.out && isSideKey(doc.boxes[o]?.junkKey)).length > 1;
    if (many) { const [ja, en] = sideKeyLabel(k); return rk ? tr(`${base} (${ja}・${rk[0]})`, `${base} (${en}, ${rk[1]})`) : tr(`${base} (${ja})`, `${base} (${en})`); }
  }
  return rk ? tr(`${base} (${rk[0]})`, `${base} (${rk[1]})`) : base;
}
/**
 * 確定フラクチャーの素材の倍と当たり (S-43・S-44): 固定されうる MOD の数 p (費用と同じ FRACTURE_POOL) と ✦ の数 k (p まで) で ×(p ÷ k)・k/p。スイッチ fracMulti が閉じている間は ×3 = 33%。
 * 文は「×3 = 33%」の形 (日本語・英語で同じ)
 */
export function sureFracText(k: number): string {
  const p = FRACTURE_POOL, n = flag("fracMulti") ? Math.min(p, Math.max(1, k)) : 1, x = p / n;
  return `×${Number.isInteger(x) ? x : x.toFixed(1)} = ${Math.round((n / p) * 100)}%`;
}
/** 値段のキー (カレンシー・お告げ・骨・エッセンス・カタリスト) → 画面の言語の名前 (クラフト台の棚と同じ) */
export const handName = (key: string): string => nameOfKey(key, baseItem.value);
/** 値段のキー → 絵 (骨の絵も部位で変わるので木のベースで引く。前はクラフト台のアイテムで引いていた、10-28) */
export const handIcon = (key: string): string => iconOfKey(key, baseItem.value);

/** 矢印に出す 1 行 (触媒の時は先にカタリスト → カレンシー + お告げ、繰り返しは「当たるまで」。10-22 オーナー「カタリストを打つルートが無い」で先に出す) */
export function handLabel(h: Hand): string {
  const cat = h.catalyst && h.omens.includes(CATALYSING)
    ? `${h.catalystCount ? tr(`${handName(h.catalyst)} ${h.quality}% (${h.catalystCount} 個)`, `${handName(h.catalyst)} ${h.quality}% (×${h.catalystCount})`) : `${handName(h.catalyst)} ${tr("最大まで", "to max")}`} → `
    : "";
  // 消去の残したい MOD (10-27 オーナー): 全部消えてよい = 1 回ずつ箱を並べる、☑ があれば残す数
  const keep = h.keep ? (h.keep.length ? tr(` (${h.keep.length} MOD 残す)`, ` (keep ${h.keep.length})`) : tr(" (どれが消えてもよい)", " (any mod may go)")) : "";
  const label = cat + [handName(h.currency), ...h.omens.map(handName)].join(" + ") + keep + (h.free ? tr(" (狙い無し)", " (no target)") : "") + (veilKeep(h) ? tr(" (未発現のまま)", " (left unrevealed)") : veilPick(h) && !isRevealHand(h.currency) ? tr(" (発現させる)", " (reveal now)") : "") + (isCatalyst(h.currency) ? tr(" (品質を最大まで)", " (to max quality)") : "");
  // 「スパム」の呼び名は出さない = 設定したカレンシーの名前のまま (10-27 昼オーナー「普通に設定したどおり出せばおｋ」、スイッチ noSpam。中は今まで通り当たるまで)
  if (!h.repeat || flag("noSpam")) return label;
  // 当たるまで = カオススパムオーブ (10-25 オーナー。前に保存した木の「カオスの当たるまで」も同じ手として読む)
  const spam = tr("カオススパムオーブ", "Chaos Spam Orb");
  return h.repeat.max ? tr(`${spam} (${label}、${h.repeat.max} 回まで)`, `${spam} (${label}, max ${h.repeat.max})`) : `${spam} (${label})`;
}
/** レアリティの名前 (0 の箱・スタートの箱・レアリティの札) */
export const rarityName = (r: TreeRarity): string => (r === "normal" ? tr("ノーマル", "Normal") : r === "magic" ? tr("マジック", "Magic") : tr("レア", "Rare"));
/** 木のタブ・結果のまとめの始め方の名前: 印が 1 つなら「✦ <MOD> スタート」、2 つ以上なら「✦ 候補 n スタート」、無ければ「<レアリティ> スタート」(10-22 オーナー、印は 10-23) */
export function startName(d: TreeDoc): string {
  const t = useTree(), fs = startsFractured(d) ? fractureMarks(d) : [], f = fs[0];
  if (fs.length > 1) return tr(`✦ 候補 ${fs.length} スタート`, `✦ ${fs.length} candidates start`);
  return f ? tr(`✦ ${t.startModLabel(f, true)} スタート`, `✦ ${t.startModLabel(f, true)} start`) : tr(`${rarityName(startRarity(d))} スタート`, `${rarityName(startRarity(d))} start`);
}
