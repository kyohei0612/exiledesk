/**
 * use-sim-shelf.ts — シミュの画面で見本のアイテムにクラフト台の棚 (CurrencyShelf) を出す時の共通の部品 (2026-10-22 code-audit 2 節。
 * 木の手を選ぶ TreeHandShelf・シミュのクイズ StageQuizEditor の写しをまとめた。ツリーの試し打ち TreeTrial は 10-22 に消した)。
 * provideShelf で見本を棚に渡し、打てるか (当たり所で弾かれるだけの物は打てる扱い、オーナーの方針 2026-10-12) とお告げの付け外しを決める。
 * 持つ / 離すはクラフト台と同じ: 同じ物をもう一度押す・棚の空いている所を押す・どこでも右クリック = 離す (お告げも外す、オーナー 10-22)
 */
import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";
import { craftStage as s } from "../../state/craft-stage";
import { provideShelf, simHidden } from "../../state/for-share/shelf-context";
import { OMEN_KEY, toggleOmen as toggleHeld, useReason, type StageItem } from "../../services/craft-stage/engine";
import { tr } from "../../i18n/lang";
import { FORESEE_ON } from "../../services/simulator/tree/tree-foresee";

/**
 * ツリーの棚だけで出さない物 (10-24 オーナー「要望があれば戻す」温度感。消さずに出さないだけ、戻す時はここ 1 か所):
 * 聖別 (聖別のお告げ。神のオーブと組む手)、神のオーブと祝福のお告げ (10-24 オーナー「神のオーブもいらんな」)、クラフトのルーン・特別なルーン以外のルーン (ソウルコア・アイドル・遺産・効き目だけのルーン)。
 * ヒネコラの錠・鏡写しは前から共通の SIM_HIDDEN で出していない。エミュの棚は変えない
 */
/**
 * カオススパムオーブ (棚の上の札「スパム」、当たるまでカオス。800a5274) を出すか。10-25 オーナー「これならぶっちゃけカオススパムモードいらんわ。俺が間違ってた」で
 * 出さない (同じ状態の箱への自動の矢印で、カオス 1 回ずつ + 外れ → 親の箱で組める)。作りは残す、要望が来たらここを true に。前に保存した当たるまでの手は開いた時に札が出る
 */
export const TREE_SPAM_ORB = false;
/** 神のオーブは 11-06 から木の棚に出す (狙いの MOD の数値の目標を決める手、S-202) */
export const TREE_HIDDEN = new Set<string>([OMEN_KEY.sanctification, OMEN_KEY.blessed]);
/** フラックス (耐性の変換) は木の枝の決まりが無いのでツリーの棚に出さない (S-20、10-31 朝オーナー決め 5 の B、エミュには残す) */
const FLUX_KEYS = new Set(["flux_fire", "flux_cold", "flux_lightning", "flux_chaos"]);
/** ルーンはクラフト以外も消さず、エミュの棚と同じく畳んだ節に出す (S-20・S-31f、11-05 オーナー「いつでもルーンは展開して使えるように」) */
/**
 * ヒネコラの髪束 (予見) は木の棚に出す。神のオーブは予見したアイテムの時だけ (予見を消す手、S-39・開発版だけ = FORESEE_ON。
 * 11-05 オーナー「神うって同じようにヒネコラしてどうループするのかって挙動みたら」)。ほかの所の神のオーブは今までどおり出さない (S-20)
 */
const foreseeShown = (key: string, it: StageItem | null | undefined): boolean => FORESEE_ON && (key === "hinekora" || (key === "divine" && !!it?.foreseen));
/** it = 棚に渡したアイテム (無ければ予見の例外は神のオーブに効かない) */
export const treeHidden = (key: string, it?: StageItem | null): boolean => !foreseeShown(key, it) && (simHidden(key) || TREE_HIDDEN.has(key) || FLUX_KEYS.has(key));

/** block = 画面の決まりで打たせない理由 (ツリーの「フラクチャーの印が無い」など。null ならエンジンの useReason) */
export function useSimShelf(item: Ref<StageItem | null>, held: Ref<string | null> = ref(null), omens: Ref<string[]> = ref([]), block: (key: string) => string | null = () => null, runeFirst?: () => readonly string[]) {
  /** 掛け替えはエンジンのお告げの層 (エミュの棚と同じ toggleOmen = 同じ組の前の方を外す、E-27) */
  function toggleOmen(id: string): void { omens.value = toggleHeld(omens.value, id); }
  function release(): void { held.value = null; omens.value = []; }
  function onHold(k: string): void { if (held.value === k) release(); else held.value = k; }
  /**
   * 右クリックはどこでも持った物を離す (窓の中・窓の外の暗い所・題・木の上。持っている間だけ、ブラウザのメニューも出さない)。
   * 前は手の窓の中の欄の右クリックだけで、窓の文「右クリック / Esc で手放す」どおりに効かない所があった (10-28 深夜オーナー「シミュもアイテムもって右クリで持つのキャンセルしてくれ」)
   */
  const onContext = (e: MouseEvent): void => { if (!held.value) return; e.preventDefault(); e.stopPropagation(); release(); };
  onMounted(() => window.addEventListener("contextmenu", onContext, true));
  onBeforeUnmount(() => window.removeEventListener("contextmenu", onContext, true));
  /**
   * 棚の空いている所を押す = 離す (ボタン・入力・お告げの欄の中は除く)。
   * 指 (touch) は押した瞬間には離さず、動かさずに押して離した時だけ離す (送ろうと棚に触れただけで持った物とお告げの欄が消えた、10-26 オーナー
   * 「お告げが画面外のままでスクロールしても見られなかった」。その後 10-26 夜オーナー「スマホも PC と同じ動きに」で、送らずに押した時は離す)
   */
  function onShelfDown(e: PointerEvent): void {
    if (!held.value || (e.target as HTMLElement).closest("button,input,select,label,[data-held-box]")) return;
    if (e.pointerType !== "touch") { release(); return; }
    const x0 = e.clientX, y0 = e.clientY;
    const up = (u: PointerEvent): void => { stop(); if (Math.hypot(u.clientX - x0, u.clientY - y0) < 8) release(); };
    const stop = (): void => { window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", stop); };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", stop); // 送り始めると指の押しは取り消される (pointercancel) = 離さない
  }
  function usableWith(k: string, om: readonly string[]): string | null {
    const d = s.data.value, it = item.value;
    return block(k) ?? (d && it ? useReason(d, it, k, om) : tr("準備中", "Loading"));
  }
  provideShelf({
    data: s.data, item, omens, held,
    // 打てるかはエンジンの useReason (クラフト台の棚と同じ判定、10-23)。お告げを抜いた判定も渡す (掛けたお告げのせいで棚から消さない、クラフト台と同じ)
    usable: (k) => usableWith(k, omens.value),
    usableBare: (k) => usableWith(k, []),
    toggleOmen,
    // 予見したアイテム (ヒネコラの後、S-39) の棚は今打てるカレンシーだけ (エンジンの useReason が通す物。お告げは持った手の欄で決まるので除く。
    // 11-05 オーナー「その枠の状態でさせるカレンシー ただしエミュで動く奴限定で」)
    hidden: (k) => treeHidden(k, item.value) || (FORESEE_ON && !!item.value?.foreseen && !k.startsWith("Omen") && usableWith(k, []) !== null),
    runeFirst,
  });
  return { held, omens, toggleOmen, release, onHold, onShelfDown };
}
