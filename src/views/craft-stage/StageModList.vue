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
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { craftStage, nameOf } from "../../state/craft-stage";
import { GROUP_JA, modListFor, shownTags, TAG_STYLE, type ListRow, type ModGroup } from "../../services/craft-stage/mod-list";
import essenceKeys from "../../services/htc/essence-keys.json";

/** シミュレーションの ① の枠の中に置く時 (外の枠を付けない) */
const props = defineProps<{ embedded?: boolean }>();
const s = craftStage;
/** 始めの状態を組める (まだ打っていない・再生でない) */
const canStart = computed(() => !s.log.value.length && !s.replay.value);
const rows = computed(() => (s.data.value && s.item.value ? modListFor(s.data.value, s.item.value) : []));

/** 畳んだかどうか (見る人ごとの好み。保存できなくても動く) */
const KEY = "exiledesk.craftStage.modListOpen";
const open = ref(true);
try { open.value = localStorage.getItem(KEY) !== "0"; } catch { /* 無くてよい */ }
watch(open, (v) => { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* 無くてよい */ } });

const GROUPS: ModGroup[] = ["normal", "rune", "essence", "perfect_essence", "desecrated", "otherworldly"];
const counts = computed(() => Object.fromEntries(GROUPS.map((g) => [g, rows.value.filter((r) => r.group === g).length])) as Record<ModGroup, number>);

const query = ref("");
/** 開いている段の表 (種類:系統) */
const expanded = ref<string | null>(null);
/**
 * 行を押して段の表を開く / 閉じる。押した行は画面の同じ所に残し、表はその下に開く (2026-10-05 オーナー「展開だけど上に開くから
 * スクロールによっては見えない、下に開こう」: 上で開いていた行が閉じた分だけ押した行が上へずれ、表が見えなくなっていた)
 */
function toggleRow(key: string, ev: MouseEvent): void {
  const el = ev.currentTarget as HTMLElement;
  const before = el.getBoundingClientRect().top;
  expanded.value = expanded.value === key ? null : key;
  void nextTick(() => {
    // 送っている枠 (シミュレーションの 3 の中なら一覧の枠、手で打つ時は画面) を同じだけ戻す
    const box = el.closest(".overflow-auto") as HTMLElement | null;
    if (!box) return;
    const shift = el.getBoundingClientRect().top - before;
    if (shift) box.scrollBy({ top: shift });
    // 開いた表が下にはみ出したら、表の下まで見えるように送る (一覧の枠も画面も。はみ出していなければ動かさない)
    el.parentElement?.querySelector("table")?.scrollIntoView({ block: "nearest" });
  });
}
/**
 * 種類ごとの節 (中身のある物だけ)。各節はプレフィックス / サフィックスの 2 列。
 * ルーンの特殊 MOD はルーンごとに別の節で、見出しはルーンの名前 (2026-10-04 オーナー「ルーンの特殊 MOD で終わらせないで、手袋ならコルの狩りとか
 * 名前で。コルとカトラは別々に分けて、名前も DB 仕様に」)
 */
interface Section { g: ModGroup; sid: string; label: string; rune: string | null; socketed: boolean; count: number; columns: Array<{ side: "prefix" | "suffix"; title: string; items: ListRow[]; top: number }> }
const sections = computed((): Section[] => {
  const q = query.value.trim();
  const parts: Array<{ g: ModGroup; sid: string; label: string; rune: string | null }> = GROUPS.filter((g) => counts.value[g]).flatMap((g): Array<{ g: ModGroup; sid: string; label: string; rune: string | null }> =>
    g === "rune"
      ? [...new Set(rows.value.filter((r) => r.group === "rune").map((r) => r.runeJa ?? ""))].map((ja) => ({ g, sid: `rune:${ja}`, label: ja, rune: ja }))
      : [{ g, sid: g as string, label: GROUP_JA[g], rune: null as string | null }],
  );
  return parts.map(({ g, sid, label, rune }) => {
    const all = rows.value.filter((r) => r.group === g && (rune == null || r.runeJa === rune));
    const list = all.filter((r) => !q || r.text.includes(q) || r.tags.some((t) => TAG_STYLE[t]?.ja.includes(q)));
    const columns = (["prefix", "suffix"] as const).map((side) => {
      const items = list.filter((r) => r.side === side).sort((a, b) => b.share - a.share || b.topLevel - a.topLevel);
      return { side, title: side === "prefix" ? "プレフィックス" : "サフィックス", items, top: Math.max(0.0001, ...items.map((r) => r.share)) };
    });
    // 差しているか (ルーンの節の見出しに「はめている」/「差すと付く」)
    const socketed = rune != null && all.some((r) => r.socketed);
    return { g, sid, label, rune, socketed, count: all.length, columns };
  });
});

/** 目次: タブを押すとその節へスクロール。スクロールに合わせて今見ている節のタブを光らせる */
const sectionEls = new Map<string, HTMLElement>();
const active = ref<string>("normal");
function jump(g: string): void {
  active.value = g;
  sectionEls.get(g)?.scrollIntoView({ behavior: "smooth", block: "start" });
}
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
function toggleTarget(modId: string, t: { name: string; ilvl: number }): void {
  const idx = tierIndexOf(modId, t);
  if (idx < 0) return;
  const list = s.simTargets.value;
  // 「あるいは」に入っている物は、そこから外す (足すのは選んだ MOD の「＋」から)
  if (list.some((x) => x.alts?.some((a) => a.modId === modId))) {
    s.simTargets.value = list.map((x) => (x.alts?.some((a) => a.modId === modId) ? { ...x, alts: x.alts.filter((a) => a.modId !== modId) } : x));
    return;
  }
  // 同じ段なら外す、別の段なら順番と付け方はそのまま段だけ差し替える、無ければ ② の最後に足す
  // (① フラクチャーの候補はシミュレーションのポップアップ [[StageFracturePicker.vue]] で選ぶ)
  if (isTarget(modId, t)) s.simTargets.value = list.filter((x) => x.modId !== modId);
  else if (list.some((x) => x.modId === modId)) s.simTargets.value = list.map((x) => (x.modId === modId ? { ...x, minTierIndex: idx } : x));
  else s.simTargets.value = [...list, { modId, minTierIndex: idx }];
}

/** エッセンスの段の名前 (英語) → 日本語 */
const ESS_JA = new Map(Object.values((essenceKeys as unknown as { keys: Record<string, { en: string; ja: string }> }).keys).map((k) => [k.en, k.ja]));
/**
 * そのエッセンス / 合金の MOD を付ける物の名前 (2026-10-05 オーナー「エッセンスと合金は使うエッセンスを表示、タグの後ろに簡易的に名前」)。
 * 名前はカレンシーの棚と同じ引き方 (パーフェクトの深淵・ヒステリーなど essence-keys に無い物も出る)
 */
function essName(r: ListRow): string | null {
  if (r.group !== "essence" && r.group !== "perfect_essence") return null;
  const key = `essence:${r.group === "perfect_essence" ? "perfect" : "normal"}:${r.id}`;
  const n = nameOf(key);
  if (n && n !== key) return n;
  const top = r.tiers[0]?.name;
  return top ? ESS_JA.get(top) ?? top : null;
}
const tierName = (r: ListRow, name: string): string => (r.group === "essence" || r.group === "perfect_essence" ? (ESS_JA.get(name) ?? name) : name);
const pct = (x: number): string => (x >= 0.1 ? `${(x * 100).toFixed(0)}%` : x >= 0.001 ? `${(x * 100).toFixed(1)}%` : x > 0 ? "<0.1%" : "—");
/** 種類の色 (ゲームの MOD の色: 普通 = 青、エッセンス = 薄い青、冒涜 = 赤、異界 = 緑がかった青) */
const TONE: Record<ModGroup, { tab: string; bar: string }> = {
  normal: { tab: "bg-rarity-magic/25 text-[#c8c8ff] ring-1 ring-rarity-magic/60", bar: "bg-rarity-magic/20" },
  rune: { tab: "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/60", bar: "bg-amber-500/15" },
  essence: { tab: "bg-sky-400/20 text-sky-100 ring-1 ring-sky-300/60", bar: "bg-sky-400/15" },
  perfect_essence: { tab: "bg-indigo-400/20 text-indigo-100 ring-1 ring-indigo-300/60", bar: "bg-indigo-400/15" },
  desecrated: { tab: "bg-rose-500/20 text-rose-100 ring-1 ring-rose-400/60", bar: "bg-rose-500/15" },
  otherworldly: { tab: "bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/60", bar: "bg-teal-500/15" },
};
</script>

<template>
  <section class="text-[12px]" :class="props.embedded ? '' : 'mt-4 rounded-xl border border-white/10 bg-white/[0.03]'">
    <!-- 見出し (押すと畳む) -->
    <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left" @click="open = !open">
      <b class="text-sm text-amber-100">このベースに付く MOD</b>
      <span class="opacity-50">{{ s.item.value?.baseJa }} · アイテムレベルは見ない · 出やすさは同じ側の重みの割合<template v-if="canStart"> · ティアの表の「付ける」で始めの状態を組める</template></span>
      <span class="ml-auto opacity-60">{{ open ? "▲ 畳む" : "▼ 開く" }}</span>
    </button>

    <div v-if="open" class="border-t border-white/10 px-3 pb-3 pt-2">
      <!-- 目次 (押すとその種類までスクロール。スクロールしても上に残る) と検索 -->
      <div class="sticky top-0 z-10 -mx-3 mb-2 flex flex-wrap items-center gap-1.5 bg-[#15130f]/95 px-3 py-1.5 backdrop-blur">
        <button v-for="sec in sections" :key="sec.sid" type="button" class="rounded-full px-3 py-0.5" :class="active === sec.sid ? TONE[sec.g].tab : 'border border-white/15 opacity-70 hover:opacity-100'" @click="jump(sec.sid)">
          {{ sec.label }} <span class="opacity-60">{{ sec.count }}</span>
        </button>
        <input v-model="query" type="search" placeholder="文面やタグで探す (例: 耐性、ライフ)" class="ml-auto w-60 rounded-lg border border-white/15 bg-black/30 px-2 py-0.5" />
      </div>

      <section v-for="sec in sections" :key="sec.sid" :ref="(el) => setSection(sec.sid, el)" class="mb-4 scroll-mt-12">
        <h3 class="mb-2 flex items-center gap-2 text-[13px] font-bold">
          <span class="rounded-full px-2.5 py-0.5" :class="TONE[sec.g].tab">{{ sec.label }}</span>
          <span class="font-normal opacity-50">{{ sec.count }} 系統</span>
          <span v-if="sec.rune" class="font-normal opacity-60">{{ sec.socketed ? "はめている" : "差すと付く" }} · 重みは公開されていないので仮定 · 出やすさは差した時の割合</span>
        </h3>
        <div class="grid gap-3 md:grid-cols-2">
          <div v-for="col in sec.columns" :key="col.side" class="min-w-0">
            <p class="mb-1 flex items-baseline gap-2 border-b border-white/10 pb-1">
              <b :class="col.side === 'prefix' ? 'text-sky-200' : 'text-violet-200'">{{ col.title }}</b>
              <span class="opacity-50">{{ col.items.length }} 系統</span>
            </p>
            <p v-if="!col.items.length" class="py-2 opacity-40">無し</p>
            <div v-for="r in col.items" :key="r.id" class="mb-1">
              <!-- 1 系統 1 行。後ろの棒が出やすさ (列の一番出やすい物を 100%) -->
              <button
                type="button"
                class="relative w-full overflow-hidden rounded-lg border px-2 py-1 text-left transition"
                :class="[r.on ? 'border-emerald-400/70' : 'border-white/5 hover:border-white/25', r.blocked ? 'opacity-40' : '', expanded === `${sec.sid}:${r.id}` ? 'bg-white/[0.06]' : 'bg-black/20']"
                :title="r.blocked ? '同じ系統の MOD が付いているので、今は付かない' : undefined"
                @click="toggleRow(`${sec.sid}:${r.id}`, $event)"
              >
                <span class="pointer-events-none absolute inset-y-0 left-0" :class="TONE[sec.g].bar" :style="{ width: `${(r.share / col.top) * 100}%` }" />
                <!-- 2026-10-04 オーナー: タグは MOD 名の横に細く (行を太らせない)、右は poe2db と同じく 出やすさ % ・ ティア数 (緑) ・ 一番上の段のレベル (灰) を数字だけ -->
                <span class="relative flex items-center gap-2">
                  <span class="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-0.5 leading-tight">
                    <span class="mr-0.5 text-[13px] text-[#c8c8ff]">{{ r.text }}</span>
                    <span v-for="t in shownTags(r.tags)" :key="t" class="rounded-sm px-1 py-px text-[10px] leading-none" :class="TAG_STYLE[t]!.cls">{{ TAG_STYLE[t]!.ja }}</span>
                    <span v-if="essName(r)" class="rounded-sm border border-sky-400/40 px-1 py-px text-[10px] leading-none text-sky-200">⚗ {{ essName(r) }}</span>
                    <span v-if="r.on" class="rounded-sm bg-emerald-500/25 px-1 py-px text-[10px] leading-none text-emerald-200">付いている</span>
                  </span>
                  <span class="flex shrink-0 items-center gap-1 tabular-nums">
                    <span class="w-11 text-right text-[13px] font-bold text-amber-100">{{ pct(r.share) }}</span>
                    <span class="min-w-[22px] rounded-sm bg-emerald-600/80 px-1 text-center text-[11px] font-bold leading-[18px] text-white" :title="`${r.tiers.length} ティア`">{{ r.tiers.length }}</span>
                    <span class="min-w-[26px] rounded-sm bg-white/15 px-1 text-center text-[11px] font-bold leading-[18px] text-white/90" :title="`一番上のティアの MOD レベル ${r.topLevel}`">{{ r.topLevel }}</span>
                  </span>
                </span>
              </button>
              <!-- 段の表 -->
              <table v-if="expanded === `${sec.sid}:${r.id}`" class="mt-1 w-full text-[11px]">
                <tbody>
                  <tr v-for="t in r.tiers" :key="t.rank" class="border-b border-white/5">
                    <td class="w-8 py-0.5 font-bold text-amber-200">{{ t.rank }}</td>
                    <td class="py-0.5 text-[#c8c8ff]">{{ t.text }}</td>
                    <td class="py-0.5 pl-2 opacity-60">{{ tierName(r, t.name) }}</td>
                    <td class="w-14 py-0.5 text-right tabular-nums opacity-70">Lv {{ t.ilvl }}</td>
                    <td class="w-16 py-0.5 text-right tabular-nums opacity-70">{{ t.weight ? `重み ${t.weight}` : "" }}</td>
                    <td v-if="s.mode.value === 'sim' && (sec.g === 'normal' || sec.g === 'desecrated' || sec.g === 'essence' || sec.g === 'perfect_essence')" class="w-20 py-0.5 text-right">
                      <button type="button" class="whitespace-nowrap rounded border px-1.5 text-[10px]" :class="isTarget(t.modId ?? r.id, t) ? 'border-amber-400 bg-amber-500/40 font-bold text-amber-50' : isCovered(t.modId ?? r.id, t) ? 'border-amber-400/70 bg-amber-500/20 text-amber-100' : 'border-amber-400/50 text-amber-200 hover:bg-amber-500/15'" :title="isTarget(t.modId ?? r.id, t) ? 'もう一度押すと外す' : `② に足す (${t.rank} 以上)`" @click.stop="toggleTarget(t.modId ?? r.id, t)">{{ isCovered(t.modId ?? r.id, t) ? "✓ " : "" }}{{ t.rank }} 以上</button>
                    </td>
                    <td v-else-if="canStart && sec.g === 'normal'" class="w-14 py-0.5 text-right">
                      <button type="button" class="rounded border border-sky-400/50 px-1.5 text-[10px] text-sky-200 hover:bg-sky-500/15" :title="`始めの状態に ${t.rank} を付ける (付きうる物だけ)`" @click.stop="s.addStartMod({ mod: t.modId ?? r.id, tier: t.rank })">付ける</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>
