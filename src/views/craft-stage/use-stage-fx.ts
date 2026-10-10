/**
 * use-stage-fx.ts — クラフトステージの「打った瞬間」の演出 (2026-09-27、ADR-001)
 *
 * オーナー:「カレンシークリックして付け終わった時の挙動なんかいいもんないかな」。動画で 1 手ごとの手応えが見えるように:
 *   - 押した所に波紋と、持っていたアイコンが吸い込まれる
 *   - アイテム枠が色付きで光って弾む (マジック = 青 / レア = 金 / 冒涜 = 赤 / フラクチャー = 金茶 / 神 = 白)
 *   - レアリティが上がった時は大きく光って「マジックに!」「レアに!」、T1 が付いた時は金の「T1!」
 *   - 打てなかった時は枠が赤く震えて理由を出す
 *   - 2026-09-29 オーナー「高貴とか打ったらほわーんって出て欲しい。どのカレンシー打ってもなんかしら出て欲しい。T● がついたーみたいな」:
 *     何も出ていなかった手 (高貴・カオス・消去・神・カタリスト等) にも「T3 がついた!」「T4 が消えた」「数値を振り直し!」などを出す
 * 手が増えた時と、打てなかった時 (craftStage.miss。工程には積まない) だけ動く (1 手戻す・再生では動かない)。色と文字は style.css の stage-* と --fx。
 */
import { EL_JA } from "../../services/craft-stage/stage-runes";
import { ref, watch, type Ref } from "vue";
import { craftStage, iconOf, nameOf } from "../../state/craft-stage";
import type { StageItem } from "../../services/craft-stage/types";
import type { PlayedStep } from "../../services/craft-stage/run-plan";
import { tr } from "../../i18n/lang";

export interface StageFx {
  n: number;
  kind: "hit" | "up" | "shake";
  color: string;
  text: string;
  x: number;
  y: number;
  icon: string;
}

const RARITY_TEXT = { magic: "マジックに!", rare: "レアに!", normal: "", unique: "ユニークに!" } as const;
const RARITY_TEXT_EN = { magic: "Magic!", rare: "Rare!", normal: "", unique: "Unique!" } as const;
/** 属性の英語 (英語の画面。2026-10-10 英語版) */
const EL_EN: Record<string, string> = { fire: "Fire", cold: "Cold", lightning: "Lightning", chaos: "Chaos" };
const elName = (el: string): string => tr(EL_JA[el] ?? el, EL_EN[el] ?? el);
const COLOR = { magic: "var(--color-rarity-magic)", rare: "var(--color-rarity-rare)", normal: "var(--color-rarity-normal)", unique: "#ff9a4a", desecrated: "#f07070", fractured: "var(--color-mod-fractured)", divine: "#ffffff", miss: "#f43f5e", top: "#fbbf24", corrupt: "#ff2a2a" };
/**
 * アクト中に落ちる物 (要望 ⑧) の結果の文字: 品質 / 鑑定 / サポート枠 / ソケット / シャード。関係なければ null
 */
/** オーグメントの手の文字 (結果 JSON の augment_change) */
/** 耐性のフラックスで変えた先の属性 (結果 JSON の converted.element) */
const convertedOf = (o: object): string | null => (o as { converted?: { element: string } }).converted?.element ?? null;
function augText(o: object): { kind: "hit" | "up"; color: string; text: string } | null {
  const a = (o as { augment_change?: { put: { ja: string; en?: string; text_ja?: string; text_en?: string }; replaced: { ja: string; en?: string } | null; upgraded?: { from: { ja: string }; to: { ja: string; en?: string } }; converted?: { element: string } } }).augment_change;
  if (!a) return null;
  // クラフトの決まりを変えるルーン (POE2Tube 要望 ㉙): アルダー = 「火に変わった!」、セール = 「サフィックス +1!」、特殊 MOD = 「マークスマンモッドが出るように!」
  if (a.converted) return { kind: "up", color: COLOR.top, text: tr(`${elName(a.converted.element)}に変わった!`, `Now ${elName(a.converted.element)}!`) };
  if (/^Serle.s Triumph$/.test(a.put.en ?? "")) return { kind: "up", color: COLOR.top, text: tr("サフィックス +1!", "Suffix +1!") };
  if (/^Astrid.s Creativity$/.test(a.put.en ?? "")) return { kind: "up", color: COLOR.top, text: tr("クラフトモッド +1!", "Crafted mod +1!") };
  const pool = /^(.+モッド)をロールできるようになる/.exec(a.put.text_ja ?? "");
  if (pool) {
    const poolEn = /roll (.+?Modifiers)/i.exec(a.put.text_en ?? "");
    return { kind: "up", color: COLOR.top, text: tr(`${pool[1]}が出るように!`, poolEn ? `${poolEn[1]} can roll!` : "New mods can roll!") };
  }
  if (a.upgraded) {
    const tier = /^Perfect /.test(a.upgraded.to.en ?? "") ? "パーフェクト" : /^Greater /.test(a.upgraded.to.en ?? "") ? "グレーター" : "1 段上";
    const tierEn = /^Perfect /.test(a.upgraded.to.en ?? "") ? "Perfect!" : /^Greater /.test(a.upgraded.to.en ?? "") ? "Greater!" : "Tier up!";
    return { kind: "up", color: COLOR.top, text: tr(`${tier}に!`, tierEn) };
  }
  if (a.replaced) return { kind: "hit", color: COLOR.miss, text: tr(`${a.replaced.ja}はなくなった\n${a.put.ja}をはめた!`, `${a.replaced.en ?? a.replaced.ja} is gone\nSocketed ${a.put.en ?? a.put.ja}!`) };
  return { kind: "up", color: COLOR.fractured, text: tr(`${a.put.ja}をはめた!`, `Socketed ${a.put.en ?? a.put.ja}!`) };
}
function actText(before: StageItem, after: StageItem): { kind: "hit" | "up"; color: string; text: string } | null {
  if (after.quality > before.quality && !after.qualityTag) return { kind: "hit", color: COLOR.top, text: tr(`品質 +${Math.round((after.quality - before.quality) * 10) / 10}%`, `Quality +${Math.round((after.quality - before.quality) * 10) / 10}%`) };
  if (before.identified === false && after.identified !== false) return { kind: "up", color: COLOR[after.rarity], text: tr("鑑定!", "Identified!") };
  if ((after.gemSockets ?? 0) > (before.gemSockets ?? 0)) return { kind: "up", color: "#7fb0e0", text: tr(`サポート枠 ${after.gemSockets} つ!`, `${after.gemSockets} support sockets!`) };
  const sh = Object.keys(after.shards ?? {}).find((k) => (after.shards?.[k] ?? 0) !== (before.shards?.[k] ?? 0));
  if (sh) {
    const n = after.shards![sh]!;
    return n === 0 ? { kind: "up", color: COLOR.top, text: tr("10 個でオーブに!", "10 shards: Orb!") } : { kind: "hit", color: COLOR.normal, text: `+1 (${n}/10)` };
  }
  if ((after.sockets ?? 0) > (before.sockets ?? 0) && !after.corrupted) return { kind: "hit", color: COLOR.fractured, text: tr("ソケット +1!", "Socket +1!") };
  return null;
}
/** 付いた / 消えた MOD の段 (「T3 がついた!」「T4 → T2」「T5 が消えた」)。MOD が動いていなければ "" */
function modText(st: PlayedStep): string {
  const add = st.added.filter((m) => !m.unrevealed).map((m) => m.tierName);
  const del = st.removed.filter((m) => !m.unrevealed).map((m) => m.tierName);
  const sep = tr("・", ", ");
  if (add.length && del.length && st.out.currency !== "divine") return `${del.join(sep)} → ${add.join(sep)}`;
  if (add.length) return tr(`${add.join(sep)} がついた!`, `${add.join(sep)} added!`);
  if (del.length) return tr(`${del.join(sep)} が消えた`, `${del.join(sep)} removed`);
  return "";
}
/** 2026-09-29 に足したカレンシー (apply-extra.ts) の文字 */
function extraText(st: PlayedStep): string {
  const { before: b, after: a, out: o } = st;
  if (a.mirrored && !b.mirrored) return tr("ミラー!", "Mirrored!");
  if (a.foreseen && !b.foreseen) return tr("予見!", "Foreseen!");
  if (a.siphoner && !b.siphoner) return tr("キル閾値!", "Kill threshold!");
  if (a.unique && b.unique && a.unique.en !== b.unique.en) return tr(`${a.unique.ja} に!`, `${a.unique.en}!`);
  if (a.enchant && b.enchant && a.enchant.id !== b.enchant.id) return o.currency.startsWith("sacrifice_") ? tr("エンチャントが上位に!", "Enchant upgraded!") : tr("エンチャントが変わった!", "Enchant changed!");
  return "";
}
/** 解呪 / サルベージで手に入った物 (「王者のシャード +1」) */
function disposeText(before: StageItem, after: StageItem): string {
  const got: string[] = [];
  for (const k of Object.keys(after.shards ?? {})) {
    const d = (after.shards?.[k] ?? 0) - (before.shards?.[k] ?? 0);
    if (d) got.push(d > 0 ? `${nameOf(k)} +${d}` : tr(`${nameOf(k)} → オーブ!`, `${nameOf(k)} → Orb!`));
  }
  for (const k of Object.keys(after.gained ?? {})) {
    const d = (after.gained?.[k] ?? 0) - (before.gained?.[k] ?? 0);
    if (d > 0) got.push(`${nameOf(k)} +${d}`);
  }
  return got.join(tr("・", ", ")) || (after.disposed === "disenchant" ? tr("解呪!", "Disenchanted!") : tr("サルベージ!", "Salvaged!"));
}
/** コラプトの結果の文字 */
function vaalText(before: StageItem, after: StageItem, changed: number): string {
  if (after.enchant !== before.enchant) return tr("コラプト — エンチャント!", "Corrupted — Enchant!");
  if ((after.sockets ?? 0) > (before.sockets ?? 0)) return tr("コラプト — ソケット +1!", "Corrupted — Socket +1!");
  if (changed) return tr("コラプト — 振り直し!", "Corrupted — Rerolled!");
  return tr("コラプト — 変化なし", "Corrupted — No change");
}

/** 演出の元: 手の数 (増えた時だけ動く) と直前の手。既定は手で打つ画面 (動画モードは自分のテープを渡す) */
export interface FxSource { count: () => number; last: () => PlayedStep | null; quiet?: () => boolean }
const MANUAL: FxSource = { count: () => craftStage.log.value.length, last: () => craftStage.last.value, quiet: () => !!craftStage.replay.value };

export function useStageFx(mouse: Ref<{ x: number; y: number }>, src: FxSource = MANUAL) {
  const fx = ref<StageFx | null>(null);
  let n = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  watch(src.count, (len, old) => {
    if (len <= old || src.quiet?.()) return;
    const st = src.last();
    if (!st) return;
    const o = st.out;
    const top = st.added.find((m) => m.tierName === "T1" && !m.unrevealed);
    let next: Omit<StageFx, "n" | "x" | "y" | "icon">;
    const act = actText(st.before, st.after);
    const mods = modText(st);
    const extra = extraText(st);
    if (!o.applied) next = { kind: "shake", color: COLOR.miss, text: o.reason ?? tr("使えない", "Can't use") };
    else if (st.after.destroyed && !st.before.destroyed) next = { kind: "shake", color: COLOR.miss, text: tr("壊れた…", "Destroyed…") };
    else if (st.after.disposed && !st.before.disposed) next = { kind: "up", color: COLOR.top, text: disposeText(st.before, st.after) };
    else if (act) next = st.after.corrupted && !st.before.corrupted ? { ...act, color: COLOR.corrupt, text: tr(`${act.text} — コラプト!`, `${act.text} — Corrupted!`) } : act;
    else if (extra) next = { kind: "up", color: COLOR.top, text: `${extra}${mods ? ` ${mods}` : ""}` };
    else if (st.after.corrupted && !st.before.corrupted && o.currency !== "vaal") next = { kind: "up", color: COLOR.desecrated, text: tr("腐食!", "Putrefied!") };
    else if (st.after.corrupted && !st.before.corrupted) next = { kind: "up", color: COLOR.corrupt, text: vaalText(st.before, st.after, st.added.length + st.removed.length) };
    else if (st.after.sanctified) next = { kind: "up", color: COLOR.top, text: tr("聖別!", "Sanctified!") };
    // オーグメント (POE2Tube 要望 ㉘): 傑作のルーンで上げた / 置き換えた / はめた (ルーン・ソウルコア・アイドルは名前で)
    else if (augText(o)) next = augText(o)!;
    // 耐性のフラックス (2026-10-04): 「火耐性に変わった!」
    else if (convertedOf(o)) next = { kind: "up", color: COLOR.top, text: tr(`${EL_JA[convertedOf(o)!] ?? ""}耐性に変わった!`, `Now ${EL_EN[convertedOf(o)!] ?? ""} Resistance!`) };
    else if (o.changed.rarity_from !== o.changed.rarity_to) next = { kind: "up", color: COLOR[o.changed.rarity_to], text: `${tr(RARITY_TEXT[o.changed.rarity_to], RARITY_TEXT_EN[o.changed.rarity_to])}${mods ? ` ${mods}` : ""}` };
    else if (top) next = { kind: "up", color: COLOR.top, text: mods || tr("T1 がついた!", "T1 added!") };
    else if (st.added.some((m) => m.fractured)) next = { kind: "hit", color: COLOR.fractured, text: tr("フラクチャー!", "Fractured!") };
    else if (st.added.some((m) => m.desecrated)) next = { kind: "hit", color: COLOR.desecrated, text: st.added.some((m) => m.unrevealed) ? tr("冒涜!", "Desecrated!") : tr("発現!", "Revealed!") };
    else if (o.currency === "divine") next = { kind: "hit", color: COLOR.divine, text: tr("数値を振り直し!", "Values rerolled!") };
    else if (st.after.quality !== st.before.quality) next = { kind: "hit", color: COLOR.top, text: tr(`品質 ${st.after.quality}%`, `Quality ${st.after.quality}%`) };
    else next = { kind: "hit", color: COLOR[st.after.rarity], text: mods || tr("変化なし", "No change") };
    show(next, iconOf(o.currency));
  });
  watch(() => craftStage.miss.value?.n, () => {
    const m = craftStage.miss.value;
    if (src !== MANUAL) return;
    if (m) show({ kind: "shake", color: COLOR.miss, text: m.reason }, "");
  });
  function show(next: Omit<StageFx, "n" | "x" | "y" | "icon">, icon: string): void {
    // 同じ演出を続けて出す時もアニメーションをやり直すため、いったん消してから次の描画で出す
    fx.value = null;
    requestAnimationFrame(() => {
      fx.value = { ...next, n: ++n, x: mouse.value.x, y: mouse.value.y, icon };
      clearTimeout(timer);
      timer = setTimeout(() => (fx.value = null), 1400);
    });
  }
  return fx;
}
