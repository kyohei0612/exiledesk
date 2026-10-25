/**
 * tree-names.ts — ツリーの打つ手の名前 (2026-10-23 オーナー「表示は全部エンジンを軸にして参照させて」)。
 * 名前はクラフト台の棚と同じ nameOfKey (state/emulator/craft-stage-shelf.ts。骨の名前は部位で変わるので、ツリーのベースのアイテムを渡す)。
 * 前は price-keys.json を自前で引いていた (tree-hands.ts の nameOfKey、消した)
 */
import { computed } from "vue";
import { nameOfKey } from "../../../state/for-share/craft-stage-shelf";
import { craftStage as s } from "../../../state/craft-stage";
import { freshItem } from "../../../services/craft-stage/engine";
import { CATALYSING, isCatalyst } from "../../../services/simulator/tree/tree-hands";
import { fractureMarks, startRarity, startsFractured, type Hand, type SplitWhen, type TreeBox, type TreeDoc, type TreeRarity } from "../../../services/simulator/tree/tree-model";
import { useTree } from "./use-tree";
import { tr } from "../../../i18n/lang";

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

/** 値段のキー (カレンシー・お告げ・骨・エッセンス・カタリスト) → 画面の言語の名前 (クラフト台の棚と同じ) */
export const handName = (key: string): string => nameOfKey(key, baseItem.value);

/** 矢印に出す 1 行 (触媒の時は先にカタリスト → カレンシー + お告げ、繰り返しは「当たるまで」。10-22 オーナー「カタリストを打つルートが無い」で先に出す) */
export function handLabel(h: Hand): string {
  const cat = h.catalyst && h.omens.includes(CATALYSING)
    ? `${h.catalystCount ? tr(`${handName(h.catalyst)} ${h.quality}% (${h.catalystCount} 個)`, `${handName(h.catalyst)} ${h.quality}% (×${h.catalystCount})`) : `${handName(h.catalyst)} ${tr("最大まで", "to max")}`} → `
    : "";
  const label = cat + [handName(h.currency), ...h.omens.map(handName)].join(" + ") + (h.free ? tr(" (狙い無し)", " (no target)") : "") + (isCatalyst(h.currency) ? tr(" (品質を最大まで)", " (to max quality)") : "");
  if (!h.repeat) return label;
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
