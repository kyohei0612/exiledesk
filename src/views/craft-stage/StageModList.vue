<!--
  StageModList.vue — クラフトステージの「このベースに付く MOD」一覧 (2026-09-29)

  オーナー「そのベースに付く MOD 全て、アイテムレベルは無視して重み付きで。DB にならって。DB は見づらいので UI はシンプルに、
  色や形にこだわって」「表示する場所もシンプルかつ使いやすく」。
  置き場所: ステージの下 (カレンシーを打ちながら見られる)。見出しを押すと畳める。
  種類 (普通 / エッセンス / 冒涜 / 異界) を 1 ページに縦に並べ、上のタブはその見出しまでスクロールする目次 (2026-10-04 オーナー「1 ページに
  まとめて下にスクロールでおｋ、上のタブを押したらそこまで自動スクロール、よくある UI」。今見ている所のタブが光る)。プレフィックス / サフィックスを 2 列。1 行 = 1 系統:
  文面 (一番上の段の数値)・タグ (色付き)・段の数・一番上の段の MOD レベル・出やすさ (同じ側の重みに対する割合を棒と %)。
  行を押すと段ごと (T1〜) の表。今付いている系統は緑、同じ系統が付いていて付かない物は薄く。中身は [[mod-list.ts]]。
  2026-09-29 (要望 ⑱-2、オーナー「指定 MOD 選んでからそこからクラフトできるように、動画用として」): まだ 1 手も打っていない間は、
  段の表の「付ける」で始めの状態にその MOD・段を足せる (付きうる物だけ。手順 JSON の start.mods に入る)。「1 手戻す」で 1 つずつ外す。
-->
<script setup lang="ts">
import { aimTierKey, heldAnyOf, heldOdds, type StageItem, modListFor, type ListRow, type ModGroup, tagLabel } from "../../services/craft-stage/engine";
import { fmtPct } from "../../utils/format-pct";
import { baseNameOf, tr } from "../../i18n/lang";
import { keepPlace, revealOpened, scrollToTop } from "../../utils/keep-place";
import StageWeightEdit from "./StageWeightEdit.vue"; // 重みの札 (推定・直した) と直す 1 行
import { augmentHostOf, methodsFor, methodsOff } from "../../services/simulator/sim-methods";
import type { SimMethod } from "../../services/simulator/quiz-build";
import SimMethodPop from "../simulator/SimMethodPop.vue";
import { AIM_MAX } from "../../state/craft-stage";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useDismiss } from "../../utils/use-dismiss";
import HelpTip from "../../components/ui/HelpTip.vue";
import Disclosure from "../../components/ui/Disclosure.vue";
import { craftStage, nameOf } from "../../state/craft-stage";
import { factionOf, groupLabelOf, runeEnOf, shownTags, TAG_STYLE } from "../../services/craft-stage/mod-list";
import { essName, tierName, toneOf, weightNote } from "./stage-mod-list-look";
import ModAddPicker from "./ModAddPicker.vue";

/** シミュレーションの ① の枠の中に置く時 (外の枠を付けない) */
/** overlay: 手で打つ画面の重ね (MOD 一覧のボタン・Tab) の中。枠は重ねの側、見出しの右に閉じる */
/** item: クラフト台の今のアイテムの代わりに見るアイテム (ツリーの完成形)。pick: 段の行のボタンを「狙いにする」1 つにする (has = 狙いに入っているか、toggle = 足す / 外す。段は T の番号)。省略時は今と同じ */
const props = defineProps<{ embedded?: boolean; overlay?: boolean; item?: StageItem | null; pick?: { has: (modId: string, tier: number) => boolean; toggle: (modId: string, tier: number) => void } }>();
const s = craftStage;
const item = computed(() => (props.item !== undefined ? props.item : s.item.value));
/** シミュレーターの旧工程の段の表 (狙いにするの時は使わない) */
const sim = computed(() => !props.pick && s.mode.value === "sim");
/** 始めの状態を組める (まだ打っていない・再生でない) */
const canStart = computed(() => !s.log.value.length && !s.replay.value);
const rows = computed(() => (s.data.value && item.value ? modListFor(s.data.value, item.value) : []));
/**
 * 持っているカレンシーで次に付く確率 (エミュレーターでカレンシーを持っている時だけ。2026-10-09 オーナー「持った時の挙動が UI 的に全然足りてない」)。
 * 候補は打つ処理と同じ説明文の分解 (spec/odds.ts の addOddsBySpec: 側・強さの下限・お告げ・触媒・同じ系統)。null = 持っていない / MOD を足さない物
 */
const heldCands = computed(() => {
  const k = s.held.value, d = s.data.value, it = item.value;
  if (props.pick || !k || !d || !it || s.mode.value !== "hand" || s.replay.value) return null;
  // 計算は services/craft-stage/held-odds.ts (打つ処理・計算機と同じ決まり。tests/held-odds-parity.test.ts で突き合わせ)
  const h = heldOdds(d, it, k, s.omens.value);
  return h ? { ...h, name: nameOf(k) } : null;
});
/**
 * 狙う MOD を幾つか選んで「どれか 1 つでも付く確率」(2026-10-12 要望 c9dee700、オーナー「カレンシー持ったら MOD の横にチェック欄、
 * キャンセルや付けたらリセット」)。行の id (系統) で持つ。持つ物を変えた・離した・打った・ベースを変えた時は空に戻す
 */
const aimSel = ref<Set<string>>(new Set());
watch([() => s.held.value, () => s.log.value[s.log.value.length - 1]?.out.index ?? 0, () => s.base.value], () => { if (aimSel.value.size) aimSel.value = new Set(); });
/** 行の付きうる段の狙いのキー */
const rowAimKeys = (r: ListRow): string[] => r.tiers.filter((t) => heldTierShare(r, t) > 0).map((t) => aimTierKey(t.modId ?? r.id, tierIndexOf(t.modId ?? r.id, t)));
const rowAimState = (r: ListRow): "all" | "some" | "none" => {
  const ks = rowAimKeys(r);
  const n = ks.filter((k) => aimSel.value.has(k)).length;
  return n && n === ks.length ? "all" : n ? "some" : "none";
};
/** 行のチェック: 付きうる段を全部入れる / 全部外す */
function toggleAimRow(r: ListRow): void {
  const next = new Set(aimSel.value);
  const ks = rowAimKeys(r);
  if (rowAimState(r) === "all") for (const k of ks) next.delete(k); else for (const k of ks) next.add(k);
  aimSel.value = next;
}
const rankNum = (rank: string): number => Number(String(rank).replace(/^T/, "")) || 0;
/** 段のチェック: 入れる時はその段以上 (T4 なら T1〜T4) も入れる、外す時はその段だけ (2026-10-12 オーナー) */
function toggleAimTier(r: ListRow, t: ListRow["tiers"][number]): void {
  const next = new Set(aimSel.value);
  const k = aimTierKey(t.modId ?? r.id, tierIndexOf(t.modId ?? r.id, t));
  if (next.has(k)) next.delete(k);
  else for (const u of r.tiers) if (rankNum(u.rank) <= rankNum(t.rank) && heldTierShare(r, u) > 0) next.add(aimTierKey(u.modId ?? r.id, tierIndexOf(u.modId ?? r.id, u)));
  aimSel.value = next;
}
const isAimTier = (r: ListRow, t: ListRow["tiers"][number]): boolean => aimSel.value.has(aimTierKey(t.modId ?? r.id, tierIndexOf(t.modId ?? r.id, t)));
/** 選んだ系統の数 (帯の「選んだ N 個」) */
const aimRows = computed(() => {
  let n = 0;
  for (const sec of sections.value) for (const col of sec.columns) for (const r of col.items) if (rowAimState(r) !== "none") n++;
  return n;
});
const aimAny = computed(() => {
  const h = heldCands.value, d = s.data.value, it = item.value, k = s.held.value;
  if (!h || !d || !it || !k || !aimSel.value.size) return null;
  return heldAnyOf(d, it, k, s.omens.value, aimSel.value, h);
});
/** 骨を持っているが、この部位に冒涜専用の MOD (変質した鎖骨なら異界も) が無い */
const noDesecrated = computed(() => {
  const h = heldCands.value;
  if (!h || !("bone" in h)) return false;
  return !counts.value.desecrated && !(s.held.value === "desecrate_altered" && counts.value.otherworldly);
});
/** その行 (系統) が持っている物で付く確率。0 = 付かない */
function heldShare(r: ListRow): number {
  const h = heldCands.value;
  if (!h || !(h.total > 0)) return 0;
  const ids = new Set(r.tiers.map((t) => t.modId ?? r.id));
  let w = 0;
  for (const id of ids) w += h.byMod.get(id)?.w ?? 0;
  return w / h.total;
}
/** その段が持っている物で付く確率 (下限より下・アイテムレベルが届かない段は 0) */
function heldTierShare(r: ListRow, t: { name: string; ilvl: number; modId?: string }): number {
  const h = heldCands.value;
  if (!h || !(h.total > 0)) return 0;
  const id = t.modId ?? r.id;
  const idx = tierIndexOf(id, t);
  return (h.byMod.get(id)?.tiers.find((x) => x.index === idx)?.w ?? 0) / h.total;
}
/** 表の % と棒: 持っている時は付く確率、それ以外は出やすさ (同じ側の重みの割合) */
/** 今は付かない行 (同じ系統が付いている・差していないルーン) は 0% (2026-10-09 オーナー「変数で現在出ないところは 0% だね基本的に」) */
// 冒涜・異界の MOD は骨を使わないと付かないので、骨を持っていない時は 0% (2026-10-09 オーナー)
const cannow = (r: ListRow): boolean => !r.blocked && !(r.group === "rune" && !r.socketed) && !((r.group === "desecrated" || r.group === "otherworldly") && !(heldCands.value && "bone" in heldCands.value));
const shareOf = (r: ListRow): number => (!cannow(r) ? 0 : heldCands.value ? heldShare(r) : r.share);
/** 棒の長さの基準 (列で一番大きい値) */
const colTop = (items: readonly ListRow[]): number => Math.max(0.0001, ...items.map(shareOf));
/** 畳んだかどうか (見る人ごとの好み。保存できなくても動く) */
const KEY = "exiledesk.craftStage.modListOpen";
const open = ref(true);
try { open.value = localStorage.getItem(KEY) !== "0"; } catch { /* 無くてよい */ }
watch(open, (v) => { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* 無くてよい */ } });
// シミュレーションで狙いがまだ 1 つも無い時・エミュレーターの「この状態から」で来た時 (simStartItem が替わった) は開いておく (畳んだのを覚えていて、ベースを選んでも何をすればいいか分からなかった。2026-10-07 / 2026-10-19 オーナー「エミュからは MOD も開いた状態で、画面が違うぞってなる」)
watch(() => [s.mode.value === "sim" && !s.simTargets.value.length && s.base.value, s.mode.value === "sim" && s.simStartItem.value] as const, ([v, it], old) => { if (v || (it && it !== old?.[1])) open.value = true; }, { immediate: true });
// エッセンスはマジック用とレア用 (パーフェクト・合金) を 1 つの節に (2026-10-10 オーナー「エッセンスね、パーフェクトとかやなくて意味わからん」)
// 並び: 普通・ルーン → 異界 (変質) → 創生の樹など → 冒涜 → エッセンス (2026-10-09 オーナー)
/** 節の並び (既定)。普通 → ルーン → 冒涜 → 創生の樹など → 異界 → エッセンス (2026-10-11 オーナー) */
const GROUPS: ModGroup[] = ["normal", "rune", "desecrated", "special", "otherworldly", "essence"];
const inGroup = (r: { group: ModGroup }, g: ModGroup): boolean => r.group === g || (g === "essence" && r.group === "perfect_essence");
const counts = computed(() => Object.fromEntries(GROUPS.map((g) => [g, rows.value.filter((r) => inGroup(r, g)).length])) as Record<ModGroup, number>);
const query = ref("");
/** 開いている段の表 (種類:系統) */
const expanded = ref<string | null>(null);
// 開いた段の表は行の外を押す・Esc で閉じる (押した物には届ける。行から出る小窓は中に数える。2026-10-22 オーナー「キャンセルは枠の外をクリックで」)
useDismiss(() => !!expanded.value, [() => (expanded.value ? listEl.value?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(expanded.value)}"]`) : null), ...["[data-mod-add-menu]", "[data-sim-method-pop]", "[data-helptip-pop]"].map((q) => () => document.querySelector<HTMLElement>(q))], () => { expanded.value = null; }, { swallow: false, keep: '[data-rec^="mod:"]' }); // 別の行の名前は toggleRow が切り替える (先に閉じると行がずれて押した行が開かない)
/** カードから飛んで来た行 (少しの間だけ光らせる) */
const flashKey = ref<string | null>(null);
/** この一覧の根 (窓とページの下の 2 つが同時にあるので、行は自分の中から探す) */
const listEl = ref<HTMLElement | null>(null);
let flashTimer: ReturnType<typeof setTimeout> | undefined;
/** カードから飛んで来た MOD の、アイテムに付いている段 (その段だけ枠で囲んで残す。全体の枠は無し、2026-10-17 オーナー「MOD クリックで MOD 一覧のこれが付いてますって枠で」) */
const jumped = ref<{ key: string; modId: string; rank: string | null } | null>(null);
const isJumpTier = (key: string, modId: string, rank: string): boolean => !!jumped.value && jumped.value.key === key && jumped.value.modId === modId && jumped.value.rank === rank;
/** カードの MOD を押した: その MOD の行のある節・行を探して開き、一気に送る (ワープ。2026-10-10 オーナー「MOD をクリックしたらその MOD のあるとこまでスクロール」) */
watch(() => s.modJump.value, (j) => {
  if (!j || props.pick || (!props.overlay && !props.embedded)) return;
  open.value = true;
  query.value = "";
  void nextTick(() => {
    const hit = sections.value.flatMap((sec) => sec.columns.flatMap((c) => c.items.map((r) => ({ sec, r })))).find(({ r }) => r.id === j.modId || r.tiers.some((t) => (t.modId ?? r.id) === j.modId));
    if (!hit) return;
    const key = `${hit.sec.sid}:${hit.r.id}`;
    if (phone && !secOpen.value.has(hit.sec.sid)) toggleSec(hit.sec.sid);
    active.value = hit.sec.sid;
    expanded.value = key;
    const it = s.item.value;
    const on = it ? [...it.prefixes, ...it.suffixes].find((m) => m.modId === j.modId) : undefined;
    jumped.value = { key, modId: j.modId, rank: on?.tierName ?? null };
    // 窓は開いたばかりで中身がまだ並んでいない事があるので 1 枚待つ。済んだら消す (次に Tab で開いた時に同じ行へ飛ばない)
    if (props.overlay) s.modJump.value = null;
    void nextTick(() => requestAnimationFrame(() => {
      scrollToTop(listEl.value?.querySelector(`[data-row-key="${CSS.escape(key)}"]`) ?? null, "auto", "center");
      flashKey.value = key;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => (flashKey.value = null), 1400);
    }));
  });
}, { immediate: true });
/** クラフトへ: カードの頭 (ベースの枠の下) が画面の上に来るまで一気に戻る */
function toCraft(): void { scrollToTop(document.querySelector("[data-craft-top]"), "auto"); }
/**
 * 行を押して段の表を開く / 閉じる。押した行は画面の同じ所に残し、表はその下に開く (2026-10-05 オーナー「展開だけど上に開くから
 * スクロールによっては見えない、下に開こう」: 上で開いていた行が閉じた分だけ押した行が上へずれ、表が見えなくなっていた)
 */
function toggleRow(key: string, ev: MouseEvent): void {
  // 開いた時だけ、行と段の表が全部見える所まで送る (2026-10-19 オーナー「ティア開いたらティアも全体表示」。10-09 の「固定でおｋ」から変えた。閉じる時・付けた後は動かさない)
  const row = (ev.currentTarget as HTMLElement).closest("[data-row-key]"); keepPlace(ev.currentTarget as HTMLElement, () => { expanded.value = expanded.value === key ? null : key; }); if (expanded.value === key) revealOpened(row);
}
/**
 * 種類ごとの節 (中身のある物だけ)。各節はプレフィックス / サフィックスの 2 列。
 * ルーンの特殊 MOD はルーンごとに別の節で、見出しはルーンの名前 (2026-10-04 オーナー「ルーンの特殊 MOD で終わらせないで、手袋ならコルの狩りとか
 * 名前で。コルとカトラは別々に分けて、名前も DB 仕様に」)
 */
interface Section { g: ModGroup; sid: string; label: string; rune: string | null; socketed: boolean; count: number; columns: Array<{ side: "prefix" | "suffix"; title: string; items: ListRow[]; top: number }> }
const sections = computed((): Section[] => {
  const q = query.value.trim();
  const parts: Array<{ g: ModGroup; sid: string; label: string; rune: string | null }> = GROUPS.filter((g) => counts.value[g] && !(g === "special" && sim.value)).flatMap((g): Array<{ g: ModGroup; sid: string; label: string; rune: string | null }> =>
    g === "rune"
      ? [...new Set(rows.value.filter((r) => r.group === "rune").map((r) => r.runeJa ?? ""))].map((ja) => ({ g, sid: `rune:${ja}`, label: tr(ja, runeEnOf(ja)), rune: ja }))
      : [{ g, sid: g as string, label: groupLabelOf(g, item.value), rune: null as string | null }],
  );
  return parts.map(({ g, sid, label, rune }): Section => {
    const all = rows.value.filter((r) => inGroup(r, g) && (rune == null || r.runeJa === rune));
    const list = all.filter((r) => !q || r.text.toLowerCase().includes(q.toLowerCase()) || r.tags.some((t) => TAG_STYLE[t]?.ja.includes(q) || t.replace(/_/g, " ").includes(q.toLowerCase())));
    const columns = (["prefix", "suffix"] as const).map((side) => {
      const items = list.filter((r) => r.side === side).sort((a, b) => b.share - a.share || b.topLevel - a.topLevel);
      return { side, title: side === "prefix" ? tr("プレフィックス", "Prefix") : tr("サフィックス", "Suffix"), items, top: Math.max(0.0001, ...items.map((r) => r.share)) };
    });
    // 差しているか (ルーンの節の見出しに「はめている」/「差すと付く」)
    const socketed = rune != null && all.some((r) => r.socketed);
    return { g, sid, label, rune, socketed, count: all.length, columns };
  })
    // 既定は GROUPS の並び (差していないルーンだけ一番下)。カレンシーを持っている時は、それで付く節を上に、付かない節を下に
    // (2026-10-11 オーナー「冒涜 → 創生の樹 → 異界 → エッセンス、付けれる奴になったら順番が変わるけどデフォではね」)
    .map((sec, i) => ({ sec, i, off: heldCands.value ? !sec.columns.some((c) => c.items.some((r) => heldShare(r) > 0)) : sec.rune != null && !sec.socketed }))
    .sort((a, b) => Number(a.off) - Number(b.off) || a.i - b.i)
    .map((x) => x.sec);
});
/** 目次: タブを押すとその節へスクロール。スクロールに合わせて今見ている節のタブを光らせる */
const sectionEls = new Map<string, HTMLElement>();
const active = ref<string>("normal");
function jump(g: string): void {
  active.value = g;
  if (phone && !secOpen.value.has(g)) toggleSec(g);
  void nextTick(() => scrollToTop(sectionEls.get(g)));
}
/**
 * スマホ: 種類の節 (普通 / エッセンス / 冒涜 / 異界…) は見出しを押して開く。普通だけ開いた状態が既定 (一覧が 5000px あって
 * 棚の下が延々続いていた。2026-10-08 オーナー「必要なところ以外は畳んだりとかで」)。検索中は全部開く。PC は今まで通り全部開く
 */
const phone = typeof window !== "undefined" && window.innerWidth < 768;
const secOpen = ref(new Set<string>(["normal"]));
function toggleSec(sid: string): void {
  const n = new Set(secOpen.value);
  if (n.has(sid)) n.delete(sid); else n.add(sid);
  secOpen.value = n;
}
const secShown = (sid: string): boolean => !phone || !!query.value.trim() || secOpen.value.has(sid);
let io: IntersectionObserver | null = null;
function observe(): void {
  io?.disconnect();
  io = new IntersectionObserver((entries) => {
    const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    const g = seen ? ([...sectionEls].find(([, el]) => el === seen.target)?.[0] ?? null) : null;
    if (g) active.value = g;
  }, { rootMargin: "-20% 0px -70% 0px" });
  for (const el of sectionEls.values()) io.observe(el);
}
watch([sections, open], () => void nextTick(observe), { immediate: true });
onBeforeUnmount(() => io?.disconnect());
function setSection(g: string, el: unknown): void {
  if (el instanceof HTMLElement) sectionEls.set(g, el);
  else sectionEls.delete(g);
}

/**
 * シミュレーションの狙い (2026-10-05、実験)。段の表の「狙う」で、その段以上を狙いにする (同じ MOD は段を差し替え、同じ段なら外す)。
 * 段の番号はその MOD の段の表から (同じ系統をまとめた行は段が混ざるので、名前とレベルで引く)
 */
function tierIndexOf(modId: string, t: { name: string; ilvl: number }): number {
  return s.data.value?.mods.get(modId)?.tiers.findIndex((x) => x.name === t.name && x.ilvl === t.ilvl) ?? -1;
}
function isTarget(modId: string, t: { name: string; ilvl: number }): boolean {
  const idx = tierIndexOf(modId, t);
  return s.simTargets.value.some((x) => [x, ...(x.alts ?? [])].some((y) => y.modId === modId && y.minTierIndex === idx));
}
/**
 * その段が狙いに入っているか (T2 以上を選んだら T1 も入る。2026-10-05 オーナー「ティア 2 とか選択したら自動で 1 も選択される挙動、
 * MOD のとこはティア 2 以上みたいな選択でおけ」)。段の配列は低い段から順なので、番号が狙いの下限以上なら入る
 */
function isCovered(modId: string, t: { name: string; ilvl: number }): boolean {
  const idx = tierIndexOf(modId, t);
  return idx >= 0 && s.simTargets.value.some((x) => [x, ...(x.alts ?? [])].some((y) => y.modId === modId && idx >= y.minTierIndex));
}
/** エミュレーターの「次の手で狙う」(その段以上)。狙い中の段をもう一度押すとやめる。押したら選ぶ窓 (StageAimPicker.vue) を開く */
function isAim(modId: string, t: { name: string; ilvl: number }): boolean {
  const idx = tierIndexOf(modId, t);
  return s.aims.value.some((a) => a.modId === modId && a.minTierIndex === idx);
}
/** 窓では押した段が最初からチェック済み (ほかの MOD も足せる。1 つだけならそのまま「確率を見る」) */
function aimAt(modId: string, t: { name: string; ilvl: number; rank: string; text: string }, el: Element): void {
  // やめる: 上の確率の一覧が消えて押した段が上へずれ、次のタップが棚に当たっていた (2026-10-09 スマホで確認)。押した段を同じ高さに残す
  if (isAim(modId, t)) { keepPlace(el, () => { s.aims.value = s.aims.value.filter((a) => a.modId !== modId); }); return; }
  const idx = tierIndexOf(modId, t);
  if (idx < 0) return;
  s.aimPicker.value = { seed: { modId, minTierIndex: idx, label: `${t.text} (${tr(`${t.rank} 以上`, `${t.rank}+`)})`, at: `${modId}:${t.rank}` } };
}
function toggleTarget(modId: string, t: { name: string; ilvl: number }, method?: SimMethod): void {
  const idx = tierIndexOf(modId, t);
  if (idx < 0) return;
  const list = s.simTargets.value;
  // 「あるいは」に入っている物は、そこから外す (足すのは選んだ MOD の「＋」から)
  if (list.some((x) => x.alts?.some((a) => a.modId === modId))) {
    s.simTargets.value = list.map((x) => (x.alts?.some((a) => a.modId === modId) ? { ...x, alts: x.alts.filter((a) => a.modId !== modId) } : x));
    return;
  }
  // 同じ段なら外す、別の段なら順番と付け方はそのまま段だけ差し替える、無ければ ② の最後に足す
  if (isTarget(modId, t)) s.simTargets.value = list.filter((x) => x.modId !== modId);
  else if (list.some((x) => x.modId === modId)) s.simTargets.value = list.map((x) => (x.modId === modId ? { ...x, minTierIndex: idx } : x));
  // 付け方が重なっても 2 ではまとめない (「どれか N つ」は次の段で整理する時。2026-10-18 オーナー)
  // 増強スパムは側ごとに 1 つの枠: 2 つ目はその側の増強スパムの「どれか 1 つ」の候補に足す (2026-10-21)
  else if (method === "augment" && augmentHostOf(s.data.value, list, modId)) { const host = augmentHostOf(s.data.value, list, modId); s.simTargets.value = list.map((x) => (x === host ? { ...x, alts: [...(x.alts ?? []), { modId, minTierIndex: idx }] } : x)); }
  else s.simTargets.value = [...list, { modId, minTierIndex: idx, ...(method ? { method } : {}) }];
}
/** 段の表の「T○ 以上」: 足したら段の表は閉じる (2026-10-18 オーナー「開きっぱなしは美しくない」)。初めて足す MOD は付け方をポップアップで選んでから (SimMethodPop.vue) */
const methodPop = ref<InstanceType<typeof SimMethodPop> | null>(null);
function pickTier(ev: MouseEvent, modId: string, t: { name: string; ilvl: number }): void {
  const adding = !isTarget(modId, t), btn = ev.currentTarget as Element;
  const row = btn.closest("table")?.previousElementSibling ?? btn;
  const done = (m?: SimMethod): void => keepPlace(row, () => { toggleTarget(modId, t, m); if (adding) expanded.value = null; });
  const opts = methodsFor(s.data.value, modId);
  if (adding && !s.simTargets.value.some((x) => x.modId === modId) && opts.length > 1) methodPop.value?.ask(btn, opts, done, methodsOff(s.data.value, s.simTargets.value, modId));
  else done(adding ? opts[0] : undefined);
}

/** まとめた行 (同じ系統の別の MOD を 1 行に) の段は MOD ごとにタグが違うので、段の表の行にその段の MOD のタグを出す (2026-10-18 オーナー「ティア表にタグがない」) */
const tierTags = (r: ListRow, t: ListRow["tiers"][number]): string[] => { if (!t.modId || t.modId === r.id && r.tiers.every((u) => u.modId === t.modId)) return []; const m = s.data.value?.mods.get(t.modId); return m ? shownTags(m.displayTags ?? m.tags) : []; };
/** 確率の % (2026-10-10 動きの揃え 5: 書き方は utils/format-pct.ts の 1 つ) */
const pct = (x: number): string => fmtPct(x);
</script>

<template>
  <section ref="listEl" data-mod-list class="@container text-[12px]" :class="props.embedded || props.overlay ? '' : 'g-panel mt-4'">
    <!-- 見出し (押すと畳む) -->
    <div v-if="!props.overlay" role="button" tabindex="0" :aria-expanded="open" class="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left" @click="open = !open" @keydown.enter="open = !open">
      <b class="g-sec-title">{{ tr("このベースに付く MOD", "Mods for this base") }}</b>
      <span class="g-sec-sub max-md:hidden">{{ item ? baseNameOf(item) : "" }}</span>
      <HelpTip :text="s.mode.value === 'sim' ? tr('出やすさ = 同じ側の重みの割合。段 = 段の数、Lv = T1 の MOD レベル。MOD を押すと段の表が開く', 'Chance = share of weight on the same side. T = number of tiers, Lv = mod level of T1. Click a mod to open its tier table') : tr(`出やすさ = 同じ側の重みの割合 (アイテムレベルは見ない)。段 = 段の数、Lv = T1 の MOD レベル${canStart ? '。段の表の「付ける」で始めの状態を組める' : ''}`, `Chance = share of weight on the same side (ignores item level). T = number of tiers, Lv = mod level of T1${canStart ? '. Use “Add” in the tier table to build the starting item' : ''}`)" @click.stop />
      <Disclosure tag="span" kind="section" :open="open" class="ml-auto" />
    </div>

    <div v-if="open" :class="props.overlay ? '' : 'border-t border-white/10 px-3 pb-3 pt-2'">
      <!-- 目次 (押すとその種類までスクロール。スクロールしても上に残る) と検索 -->
      <!-- スマホ: 検索は目次の横送りの外 (中だと右に隠れる) -->
      <input v-model="query" type="search" :placeholder="tr('文面やタグで探す (例: 耐性、ライフ)', 'Search text or tags')" class="mb-2 w-full rounded-lg border border-white/15 bg-black/30 px-2 py-1.5 md:hidden" />
      <!-- スマホは固定せず 1 段の横送り (固定すると 4 段で 130px 占めていた。2026-10-08 レビュー) -->
      <div data-mod-toc class="sticky top-0 z-10 -mx-3 mb-4 flex flex-wrap items-center gap-1.5 bg-[#120f0c]/95 px-3 py-1.5 backdrop-blur max-md:static max-md:flex-nowrap max-md:overflow-x-auto">
        <!-- クラフトへ: ベースの枠の下 (カードの頭) が画面の上に来るまで一気に戻る (2026-10-10 オーナー「行ったり来たりできるでしょ」) -->
        <button v-if="!props.embedded && !props.overlay" type="button" class="tbtn mr-1 max-md:shrink-0" :title="tr('アイテムのカードへ戻る', 'Back to the item')" @click="toCraft">{{ tr("↑ クラフトへ", "↑ Craft") }}</button>
        <!-- 節の切り替えはほかのタブと同じ .g-tab (前は丸い札だった。2026-10-18 オーナーの UI 点検、決まり ui-one-frame-rule)。細い帯に合うよう低く -->
        <button v-for="sec in sections" :key="sec.sid" type="button" role="tab" :aria-selected="active === sec.sid" class="g-tab !min-h-[28px] !px-4 !text-[13px] max-md:shrink-0" :class="active === sec.sid ? 'on' : ''" @click="jump(sec.sid)">
          {{ sec.label }} <span class="ml-0.5 rounded-full bg-black/25 px-1.5 text-[11px] tabular-nums">{{ sec.count }}</span>
        </button>
        <!-- 狙いに選んだ MOD のどれかが付く確率 (チェック欄、要望 c9dee700) -->
        <span v-if="aimAny != null" class="ml-2 flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-500/10 px-2.5 py-0.5 text-sky-100 max-md:shrink-0">
          {{ heldCands && "bone" in heldCands ? tr(`選んだ ${aimRows} 個のどれかが候補に出る`, `Any of ${aimRows} offered`) : tr(`選んだ ${aimRows} 個のどれかが付く`, `Any of ${aimRows} rolls`) }}
          <b class="tabular-nums">{{ pct(aimAny) }}</b>
          <button type="button" class="rounded px-1 text-[11px] text-white/50 hover:bg-white/10 hover:text-white/85" :title="tr('選んだ狙いを外す', 'Clear the selection')" @click="aimSel = new Set()">×</button>
        </span>
        <input v-model="query" type="search" :placeholder="tr('文面やタグで探す (例: 耐性、ライフ)', 'Search text or tags')" class="ml-auto w-60 rounded-lg border border-white/15 bg-black/30 px-2 py-0.5 max-md:hidden" />
      </div>
      <!-- 骨を持っているのに冒涜の節が無い部位 (セプターなど): 候補が普通の MOD だけになる事を書く (2026-10-11 オーナー「ないなら注意書きいる」) -->
      <p v-if="noDesecrated" class="-mt-2 mb-3 text-[11px] text-amber-200/80">{{ tr("この部位には冒涜専用の MOD が無いので、発現の候補 3 つは普通の MOD から選ばれる", "This item class has no Desecrated-only mods, so all 3 reveal options are normal mods") }}</p>

      <section v-for="sec in sections" :key="sec.sid" :ref="(el) => setSection(sec.sid, el)" class="mb-4 scroll-mt-12">
        <!-- 目次の下は少し空ける (2026-10-10 オーナー「被ってんな、もうちょい下、プレフィックス・サフィックスの表示を全体的に」) -->
        <h3 class="mb-3 mt-1 flex flex-wrap items-center gap-2 text-[13px] font-bold max-md:min-h-11 max-md:cursor-pointer" @click="phone && toggleSec(sec.sid)">
          <span class="rounded-full px-2.5 py-0.5" :class="toneOf(sec).tab">{{ sec.label }}</span>
          <span class="font-normal opacity-50">{{ sec.count }} {{ tr("系統", "groups") }}</span>
          <span v-if="sec.rune" class="font-normal opacity-60">{{ sec.socketed ? tr("はめている", "Socketed") : tr("差していないので 0% (付ければルーンも差す)", "Not socketed, so 0% (adding one also sockets the rune)") }}</span>
          <!-- 重みが公開されていない欄は、こちらが入れた重みの出どころを短く (2026-10-09 オーナー「不明の奴全てに、コミュニティのデータから参照していますって書いとこう」) -->
          <span v-if="weightNote()[sec.rune ? 'rune' : sec.g]" class="g-hover-name font-normal opacity-60" :title="weightNote()[sec.rune ? 'rune' : sec.g]">{{ tr("· 重みはコミュニティのデータから参照", "· Weights from community data") }}</span>
          <span v-else-if="sec.g === 'special'" class="font-normal opacity-60">{{ tr("創生の樹・ハンドラップ専用の MOD · カレンシーでは付かない · 段の表の「付ける」で手で付けるだけ", "Mods exclusive to the Genesis Tree and Wraps · Cannot roll from currency · Add them manually with “Add” in the tier table") }}</span>
          <Disclosure tag="span" kind="section" :open="secShown(sec.sid)" class="ml-auto font-normal md:hidden" />
        </h3>
        <!-- プレ・サフィの左右は一覧の幅で決める (画面ではなく。窓が狭い小さいパソコンは縦に積む。2026-10-11 オーナー) -->
        <div v-if="secShown(sec.sid)" class="grid gap-3 @4xl:grid-cols-2">
          <div v-for="col in sec.columns" :key="col.side" class="min-w-0">
            <p class="mb-1 flex items-baseline gap-2 border-b border-white/10 pb-1 pr-2">
              <!-- チェック欄の上の ? (狙いは複数選べる。要望 c9dee700) -->
              <span v-if="heldCands" class="flex w-5 shrink-0 justify-center self-center"><HelpTip :text="tr('狙う MOD は複数選べます (段の表で「その段以上」も)。選んだどれか 1 つでも付く確率を上に出します (打つ・持つ物を変えると外れます)', 'You can tick several target mods (or a tier and better in the tier table). The chance that any one of them rolls is shown at the top (cleared when you use or change the held item)')" /></span>
              <b class="whitespace-nowrap text-[var(--exile-color-text-primary)]">{{ col.title }}</b>
              <span class="whitespace-nowrap text-[var(--exile-color-text-tertiary)]">{{ col.items.length }} {{ tr("系統", "groups") }}</span>
              <span class="ml-auto flex gap-1 text-[11px] text-[var(--exile-color-text-tertiary)]"><span class="w-14 whitespace-nowrap text-right" :class="heldCands ? 'text-sky-200' : ''">{{ heldCands ? ('bone' in heldCands ? tr("候補に出る", "Offered") : tr("付く確率", "Chance")) : tr("出やすさ", "Weight") }}</span><span class="w-6 text-right">{{ tr("段", "T") }}</span><span class="w-7 text-right">Lv</span></span>
            </p>
            <p v-if="!col.items.length" class="py-2 opacity-40">{{ tr("無し", "None") }}</p>
            <div v-for="r in col.items" :key="r.id" class="mb-1" :data-row-key="`${sec.sid}:${r.id}`" :class="[flashKey === `${sec.sid}:${r.id}` ? 'row-jump' : '']">
              <!-- 1 系統 1 行。後ろの棒が出やすさ (列の一番出やすい物を 100%)。カレンシーを持っている時は左に狙いのチェック欄 -->
              <div class="flex items-center gap-0">
              <label v-if="heldCands" class="flex w-5 shrink-0 cursor-pointer justify-center self-stretch" :class="heldShare(r) ? '' : 'pointer-events-none opacity-25'" :title="tr('狙いに入れる (付きうる段を全部。段の表で段ごとにも選べる)', 'Add to targets (all tiers that can roll; pick tiers in the tier table)')">
                <input type="checkbox" class="accent-sky-400" :checked="rowAimState(r) === 'all'" :indeterminate="rowAimState(r) === 'some'" :disabled="!heldShare(r)" @change="toggleAimRow(r)" />
              </label>
              <button
                type="button"
                :data-rec="`mod:${r.id}`"
                class="relative min-w-0 flex-1 overflow-hidden rounded-md px-2 py-1 text-left transition hover:bg-white/[0.05]"
                :class="[r.blocked || (heldCands && !heldShare(r)) || (r.group === 'rune' && !r.socketed) ? 'opacity-40' : '', expanded === `${sec.sid}:${r.id}` ? 'bg-white/[0.06]' : '']"
                :title="r.blocked ? tr('同じ系統の MOD が付いているので、今は付かない', 'A mod from the same group is already on the item, so this cannot roll now') : heldCands && !heldShare(r) ? tr(`持っている ${heldCands.name} では付かない`, `Cannot roll with the held ${heldCands.name}`) : undefined"
                @click="toggleRow(`${sec.sid}:${r.id}`, $event)"
              >
                <span class="pointer-events-none absolute inset-y-0 left-0" :class="toneOf(sec).bar" :style="{ width: `${(shareOf(r) / colTop(col.items)) * 100}%` }" />
                <!-- 2026-10-04 オーナー: タグは MOD 名の横に細く (行を太らせない)、右は poe2db と同じく 出やすさ % ・ ティア数 (緑) ・ 一番上の段のレベル (灰) を数字だけ -->
                <span class="relative flex items-center gap-2">
                  <!-- タグはアイテムの札と同じ色の札 (poe2db と同じ)。入らなければ次の行へ折り返して全部見せる
                       (2026-10-19 オーナー「タグが薄くて見づらい、db 仕様でおｋ」「タグ切れてること多いから折り返してフルで」。前は残りの幅に薄い字で … で切っていて、名前が折り返すとタグが丸ごと消えていた) -->
                  <span class="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-0.5 leading-tight">
                    <!-- 勢力 (アマナム・クルガル・ウラマン) は文の頭に札で (2026-10-16 オーナー「開かんと分からん」)。文の中に置いて、長い文でも札だけの行にしない -->
                    <span class="mr-0.5 min-w-0 text-[13px] text-[#c8c8ff]"><span v-if="factionOf(r.tags)" class="mr-1 inline-block rounded-sm px-1 py-px align-[1px] text-[10px] leading-none" :class="TAG_STYLE[factionOf(r.tags)!]?.cls">{{ tagLabel(factionOf(r.tags)!) }}</span>{{ r.text }}</span>
                    <span v-for="g in shownTags(r.tags)" :key="g" class="shrink-0 whitespace-nowrap rounded-sm px-1 py-px text-[10px] leading-none" :class="TAG_STYLE[g]?.cls">{{ tagLabel(g) }}</span>
                    <span v-if="essName(r)" class="shrink-0 whitespace-nowrap rounded-sm border border-sky-400/40 px-1 py-px text-[10px] leading-none text-sky-200">⚗ {{ essName(r) }}</span>
                    <span v-if="r.on" class="shrink-0 whitespace-nowrap rounded-sm bg-emerald-500/25 px-1 py-px text-[10px] leading-none text-emerald-200">{{ tr("付いている", "On item") }}</span>
                  </span>
                  <span class="flex shrink-0 items-center gap-1 tabular-nums">
                    <!-- 重みを借りた MOD の印は文字の札で (前は「※」だけで意味が分からなかった。2026-10-18 オーナーの UI 点検) -->
                    <StageWeightEdit :row="r" badge />
                    <span class="w-14 text-right text-[13px] font-bold" :class="heldCands ? 'text-sky-200' : 'text-amber-100'" :title="heldCands ? ('bone' in heldCands ? tr(`持っている ${heldCands.name} の次の発現で、候補 3 つに出る確率 (専用 MOD 1〜3 個 + 残り普通。計算機と同じ)`, `Chance to appear among the 3 options on the next reveal with the held ${heldCands.name} (1-3 desecrated-only mods + the rest normal, same as the calculator)`) : tr(`持っている ${heldCands.name} で次に付く確率`, `Chance to roll next with the held ${heldCands.name}`)) : (r.group === 'desecrated' || r.group === 'otherworldly') ? tr('骨を使わないと付かない (骨を持つと候補に出る確率)', 'Only rolls via a Bone (hold a Bone to see the chance to be offered)') : tr('出やすさ (同じ側の重みの割合)', 'Chance (share of weight on the same side)')">{{ pct(shareOf(r)) }}</span>
                    <span class="w-6 text-right text-[12px] text-[var(--exile-color-text-secondary)]" :title="tr(`段の数 ${r.tiers.length}`, `Tiers: ${r.tiers.length}`)">{{ r.tiers.length }}</span>
                    <span class="w-7 text-right text-[12px] text-[var(--exile-color-text-tertiary)]" :title="tr(`T1 の MOD レベル ${r.topLevel}`, `T1 mod level: ${r.topLevel}`)">{{ r.topLevel }}</span>
                  </span>
                </span>
              </button>
              </div>
              <StageWeightEdit v-if="expanded === `${sec.sid}:${r.id}`" :row="r" /><!-- 段の表 (上に重みを直す 1 行) -->
              <table v-if="expanded === `${sec.sid}:${r.id}`" class="mt-1 w-full text-[11px]">
                <caption v-if="sim" class="pb-1 text-left text-[10px] opacity-60">{{ tr("T1 が一番良い段。「T○ 以上」= その段か、それより良い段が付けば当たり", "T1 is the best tier. “T○+” = a hit if that tier or better rolls") }}</caption>
                <tbody>
                  <tr v-for="t in r.tiers" :key="t.rank" class="group border-b border-white/5" :class="[heldCands && !heldTierShare(r, t) ? 'opacity-35' : '', isJumpTier(`${sec.sid}:${r.id}`, t.modId ?? r.id, t.rank) ? 'bg-amber-400/15 outline outline-2 outline-amber-300/80' : '']" :title="heldCands && !heldTierShare(r, t) ? tr(`持っている ${heldCands.name} では付かない段 (強さの下限・アイテムレベル・同じ系統)`, `This tier cannot roll with the held ${heldCands.name} (minimum tier, item level, or same group)`) : undefined">
                    <!-- 段のチェック: その段以上を狙いに (外す時はその段だけ) -->
                    <td v-if="heldCands" class="w-5 py-0.5 text-center"><input type="checkbox" class="accent-sky-400 align-middle" :checked="isAimTier(r, t)" :disabled="!heldTierShare(r, t)" :title="tr(`${t.rank} 以上を狙いに入れる`, `Target ${t.rank} or better`)" @click.stop @change="toggleAimTier(r, t)" /></td>
                    <td class="w-8 py-0.5 font-bold text-amber-200">{{ t.rank }}</td>
                    <td class="py-0.5 text-[#c8c8ff]">{{ t.text }}<span v-for="g in tierTags(r, t)" :key="g" class="ml-1 inline-block whitespace-nowrap rounded-sm px-1 py-px align-[1px] text-[10px] leading-none" :class="TAG_STYLE[g]?.cls">{{ tagLabel(g) }}</span><span v-if="isJumpTier(`${sec.sid}:${r.id}`, t.modId ?? r.id, t.rank)" data-jump-tier class="ml-1.5 rounded-sm bg-amber-400/25 px-1 py-px text-[10px] leading-none text-amber-100">{{ tr("付いている", "On item") }}</span></td>
                    <!-- 段の名前 (Zaffre など) は英語しか無いので出さない。エッセンスの節はエッセンスの名前なので出す (2026-10-18 オーナーの UI 点検) -->
                    <td v-if="r.group === 'essence' || r.group === 'perfect_essence'" class="py-0.5 pl-2 opacity-60 max-md:hidden">{{ tierName(r, t.name) }}</td>
                    <td class="w-14 py-0.5 text-right tabular-nums opacity-70">Lv {{ t.ilvl }}</td>
                    <td class="w-16 py-0.5 text-right tabular-nums opacity-70 max-md:hidden" :class="heldCands ? 'text-sky-200' : ''" :title="t.weight ? tr(`重み ${t.weight}`, `Weight ${t.weight}`) : undefined">{{ !cannow(r) ? "0%" : heldCands ? pct(heldTierShare(r, t)) : t.weight && r.weight ? pct((r.share * t.weight) / r.weight) : "" }}</td>
                    <!-- ツリーの完成形: 段の行のボタンは「狙いにする」1 つ (オーナー 10-22) -->
                    <td v-if="props.pick" class="w-24 py-0.5 text-right"><button type="button" data-mod-pick class="tbtn" :class="props.pick.has(t.modId ?? r.id, rankNum(t.rank)) ? 'on' : ''" :title="props.pick.has(t.modId ?? r.id, rankNum(t.rank)) ? tr('もう一度押すと狙いから外す', 'Click again to remove the target') : tr(`${t.rank} 以上を完成の狙いにする`, `Make ${t.rank}+ a final target`)" @click.stop="props.pick.toggle(t.modId ?? r.id, rankNum(t.rank))">{{ props.pick.has(t.modId ?? r.id, rankNum(t.rank)) ? tr("✓ 狙い", "✓ Target") : tr("狙いにする", "Target") }}</button></td>
                    <td v-else-if="sim && (sec.g === 'normal' || sec.g === 'rune' || sec.g === 'desecrated' || sec.g === 'essence' || sec.g === 'perfect_essence')" class="w-20 py-0.5 text-right">
                      <button type="button" class="whitespace-nowrap rounded border px-1.5 text-[10px] max-md:min-h-10 max-md:px-3 max-md:text-[12px]" :class="isTarget(t.modId ?? r.id, t) ? 'border-amber-400 bg-amber-500/40 font-bold text-amber-50' : isCovered(t.modId ?? r.id, t) ? 'border-amber-400/70 bg-amber-500/20 text-amber-100' : 'border-amber-400/50 text-amber-200 hover:bg-amber-500/15'" :title="isTarget(t.modId ?? r.id, t) ? tr('もう一度押すと外す', 'Click again to remove') : sec.rune ? tr(`② に足す (${t.rank} 以上)。回す時は ${sec.label} を差した白から始める`, `Add to ② (${t.rank}+). Runs start from a Normal item with ${sec.label} socketed`) : tr(`② に足す (${t.rank} 以上)`, `Add to ② (${t.rank}+)`)" @click.stop="pickTier($event, t.modId ?? r.id, t)">{{ isCovered(t.modId ?? r.id, t) ? "✓ " : "" }}{{ tr(`${t.rank} 以上`, `${t.rank}+`) }}</button>
                    </td>
                    <td v-else-if="!sim && !s.replay.value" class="py-0.5 pl-2">
                      <!-- ボタンは乗せた段だけ (12 段全部に並ぶとボタンの壁だった。2026-10-18 オーナーの UI 点検)。狙い中・プルダウンを開いている段とスマホは出したまま -->
                      <div class="flex flex-nowrap items-center justify-end gap-1 transition-opacity max-md:flex-wrap md:group-hover:opacity-100 md:focus-within:opacity-100 md:has-[[aria-expanded=true]]:opacity-100" :class="isAim(t.modId ?? r.id, t) ? '' : 'md:opacity-0'">
                      <!-- 段の表のボタンは細い行に合う小さく平たい物 (tbtn、同じ高さ・1 行に右寄せ)。2026-10-10 オーナー「ここの UI きもい、並びが 3 つ合ってない、枠の細さに過剰」。狙い中は赤 -->
                      <!-- 次の手で狙う (いつでも): 今の状態から打った時にこの段以上が付く確率を、打ち方ごとに棚の上へ (2026-10-09 オーナー)。押すと選ぶ窓 -->
                      <button type="button" :data-aim-at="`${t.modId ?? r.id}:${t.rank}`" :data-rec="`aim:${t.modId ?? r.id}:${t.rank}`" class="tbtn" :class="isAim(t.modId ?? r.id, t) ? 'on' : ''" :title="isAim(t.modId ?? r.id, t) ? tr('もう一度押すとやめる', 'Click again to stop') : tr(`次の 1 手で ${t.rank} 以上が付く確率を打ち方ごとに出す (ほかの MOD も ${AIM_MAX} つまで一緒に狙える)`, `Show the chance of ${t.rank}+ rolling on the next move for each method (target up to ${AIM_MAX} mods together)`)" @click.stop="aimAt(t.modId ?? r.id, t, $event.currentTarget as Element)">{{ isAim(t.modId ?? r.id, t) ? tr("狙い中", "Targeting") : tr("次の手で狙う", "Target next move") }}</button>
                      <!-- 付ける: 付け方 (普通 / フラクチャー / 冒涜 / エッセンス) を選ぶ (ModAddPicker.vue、2026-10-17) -->
                      <ModAddPicker :group="r.group" :mod-id="t.modId ?? r.id" :rank="t.rank" />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
    <SimMethodPop ref="methodPop" /></section>
</template>

<!-- 段の行のボタン (tbtn) は子の ModAddPicker.vue でも使うので scoped にしない (scoped だと子の中のボタンに効かず「付ける」が素のボタンで折り返していた。2026-10-18) -->
<style>
/* 段の表のボタン: 細い行に合う小さく平たい物 (2026-10-10 オーナー「枠の細さに過剰」) */
.tbtn {
  display: inline-flex; align-items: center; justify-content: center; height: 24px; padding: 0 9px; white-space: nowrap;
  border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 4px; background: rgba(0, 0, 0, 0.35);
  font-size: 11px; color: rgba(255, 255, 255, 0.82); transition: background 0.12s, border-color 0.12s;
}
.tbtn:hover:not(:disabled) { background: rgba(255, 255, 255, 0.08); border-color: rgba(232, 200, 120, 0.55); color: #f3e2b8; }
.tbtn:disabled { opacity: 0.35; cursor: not-allowed; }
.tbtn.on { border-color: rgba(239, 90, 70, 0.75); background: rgba(160, 40, 30, 0.35); color: #ffd7cf; }
@media (max-width: 767px) { .tbtn { height: 34px; padding: 0 12px; font-size: 12px; } }
</style>

<style scoped>
/* カードから飛んで来た行: ふわっと金に (付いた瞬間の光り方と同じ色) */
.row-jump { animation: row-jump 1.4s ease-out; border-radius: 6px; }
@keyframes row-jump { 0% { background: rgba(250, 204, 21, 0); } 15% { background: rgba(250, 204, 21, 0.18); } 100% { background: rgba(250, 204, 21, 0); } }
</style>
