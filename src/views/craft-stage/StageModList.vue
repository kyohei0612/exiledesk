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
import { craftStage } from "../../state/craft-stage";
import { GROUP_JA, modListFor, shownTags, TAG_STYLE, type ListRow, type ModGroup } from "../../services/craft-stage/mod-list";
import essenceKeys from "../../services/htc/essence-keys.json";

const s = craftStage;
/** 始めの状態を組める (まだ打っていない・再生でない) */
const canStart = computed(() => !s.log.value.length && !s.replay.value);
const rows = computed(() => (s.data.value && s.item.value ? modListFor(s.data.value, s.item.value) : []));

/** 畳んだかどうか (見る人ごとの好み。保存できなくても動く) */
const KEY = "exiledesk.craftStage.modListOpen";
const open = ref(true);
try { open.value = localStorage.getItem(KEY) !== "0"; } catch { /* 無くてよい */ }
watch(open, (v) => { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* 無くてよい */ } });

const GROUPS: ModGroup[] = ["normal", "rune", "essence", "desecrated", "otherworldly"];
const counts = computed(() => Object.fromEntries(GROUPS.map((g) => [g, rows.value.filter((r) => r.group === g).length])) as Record<ModGroup, number>);

const query = ref("");
/** 開いている段の表 (種類:系統) */
const expanded = ref<string | null>(null);
/** 種類ごとの節 (中身のある物だけ)。各節はプレフィックス / サフィックスの 2 列 */
const sections = computed(() => {
  const q = query.value.trim();
  return GROUPS.filter((g) => counts.value[g]).map((g) => {
    const list = rows.value.filter((r) => r.group === g && (!q || r.text.includes(q) || r.tags.some((t) => TAG_STYLE[t]?.ja.includes(q))));
    const columns = (["prefix", "suffix"] as const).map((side) => {
      const items = list.filter((r) => r.side === side).sort((a, b) => b.share - a.share || b.topLevel - a.topLevel);
      return { side, title: side === "prefix" ? "プレフィックス" : "サフィックス", items, top: Math.max(0.0001, ...items.map((r) => r.share)) };
    });
    return { g, columns };
  });
});

/** 目次: タブを押すとその節へスクロール。スクロールに合わせて今見ている節のタブを光らせる */
const sectionEls = new Map<ModGroup, HTMLElement>();
const active = ref<ModGroup>("normal");
function jump(g: ModGroup): void {
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
function setSection(g: ModGroup, el: unknown): void {
  if (el instanceof HTMLElement) sectionEls.set(g, el);
  else sectionEls.delete(g);
}

/** エッセンスの段の名前 (英語) → 日本語 */
const ESS_JA = new Map(Object.values((essenceKeys as unknown as { keys: Record<string, { en: string; ja: string }> }).keys).map((k) => [k.en, k.ja]));
const tierName = (r: ListRow, name: string): string => (r.group === "essence" ? (ESS_JA.get(name) ?? name) : name);
const pct = (x: number): string => (x >= 0.1 ? `${(x * 100).toFixed(0)}%` : x >= 0.001 ? `${(x * 100).toFixed(1)}%` : x > 0 ? "<0.1%" : "—");
/** 種類の色 (ゲームの MOD の色: 普通 = 青、エッセンス = 薄い青、冒涜 = 赤、異界 = 緑がかった青) */
const TONE: Record<ModGroup, { tab: string; bar: string }> = {
  normal: { tab: "bg-rarity-magic/25 text-[#c8c8ff] ring-1 ring-rarity-magic/60", bar: "bg-rarity-magic/20" },
  rune: { tab: "bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/60", bar: "bg-amber-500/15" },
  essence: { tab: "bg-sky-400/20 text-sky-100 ring-1 ring-sky-300/60", bar: "bg-sky-400/15" },
  desecrated: { tab: "bg-rose-500/20 text-rose-100 ring-1 ring-rose-400/60", bar: "bg-rose-500/15" },
  otherworldly: { tab: "bg-teal-500/20 text-teal-100 ring-1 ring-teal-400/60", bar: "bg-teal-500/15" },
};
</script>

<template>
  <section class="mt-4 rounded-xl border border-white/10 bg-white/[0.03] text-[12px]">
    <!-- 見出し (押すと畳む) -->
    <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left" @click="open = !open">
      <b class="text-sm text-amber-100">このベースに付く MOD</b>
      <span class="opacity-50">{{ s.item.value?.baseJa }} · アイテムレベルは見ない · 出やすさは同じ側の重みの割合<template v-if="canStart"> · ティアの表の「付ける」で始めの状態を組める</template></span>
      <span class="ml-auto opacity-60">{{ open ? "▲ 畳む" : "▼ 開く" }}</span>
    </button>

    <div v-if="open" class="border-t border-white/10 px-3 pb-3 pt-2">
      <!-- 目次 (押すとその種類までスクロール。スクロールしても上に残る) と検索 -->
      <div class="sticky top-0 z-10 -mx-3 mb-2 flex flex-wrap items-center gap-1.5 bg-[#15130f]/95 px-3 py-1.5 backdrop-blur">
        <template v-for="g in GROUPS" :key="g">
          <button v-if="counts[g]" type="button" class="rounded-full px-3 py-0.5" :class="active === g ? TONE[g].tab : 'border border-white/15 opacity-70 hover:opacity-100'" @click="jump(g)">
            {{ GROUP_JA[g] }} <span class="opacity-60">{{ counts[g] }}</span>
          </button>
        </template>
        <input v-model="query" type="search" placeholder="文面やタグで探す (例: 耐性、ライフ)" class="ml-auto w-60 rounded-lg border border-white/15 bg-black/30 px-2 py-0.5" />
      </div>

      <section v-for="sec in sections" :key="sec.g" :ref="(el) => setSection(sec.g, el)" class="mb-4 scroll-mt-12">
        <h3 class="mb-2 flex items-center gap-2 text-[13px] font-bold">
          <span class="rounded-full px-2.5 py-0.5" :class="TONE[sec.g].tab">{{ GROUP_JA[sec.g] }}</span>
          <span class="font-normal opacity-50">{{ counts[sec.g] }} 系統</span>
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
                :class="[r.on ? 'border-emerald-400/70' : 'border-white/5 hover:border-white/25', r.blocked ? 'opacity-40' : '', expanded === `${sec.g}:${r.id}` ? 'bg-white/[0.06]' : 'bg-black/20']"
                :title="r.blocked ? '同じ系統の MOD が付いているので、今は付かない' : undefined"
                @click="expanded = expanded === `${sec.g}:${r.id}` ? null : `${sec.g}:${r.id}`"
              >
                <span class="pointer-events-none absolute inset-y-0 left-0" :class="TONE[sec.g].bar" :style="{ width: `${(r.share / col.top) * 100}%` }" />
                <!-- 2026-10-04 オーナー: タグは MOD 名の横に細く (行を太らせない)、右は poe2db と同じく 出やすさ % ・ ティア数 (緑) ・ 一番上の段のレベル (灰) を数字だけ -->
                <span class="relative flex items-center gap-2">
                  <span class="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-0.5 leading-tight">
                    <span class="mr-0.5 text-[13px] text-[#c8c8ff]">{{ r.text }}</span>
                    <span v-for="t in shownTags(r.tags)" :key="t" class="rounded-sm px-1 py-px text-[10px] leading-none" :class="TAG_STYLE[t]!.cls">{{ TAG_STYLE[t]!.ja }}</span>
                    <span v-if="r.on" class="rounded-sm bg-emerald-500/25 px-1 py-px text-[10px] leading-none text-emerald-200">付いている</span>
                    <span v-if="r.runeJa" class="rounded-sm px-1 py-px text-[10px] leading-none" :class="r.socketed ? 'bg-amber-500/30 text-amber-100' : 'bg-white/10 text-amber-200/80'" :title="r.socketed ? 'はめているルーンの MOD (重みは仮定)' : 'このルーンを差すと付くようになる (出やすさは差した時の割合、重みは仮定)'">{{ r.socketed ? r.runeJa : `${r.runeJa}を差すと` }}</span>
                  </span>
                  <span class="flex shrink-0 items-center gap-1 tabular-nums">
                    <span class="w-11 text-right text-[13px] font-bold text-amber-100">{{ pct(r.share) }}</span>
                    <span class="min-w-[22px] rounded-sm bg-emerald-600/80 px-1 text-center text-[11px] font-bold leading-[18px] text-white" :title="`${r.tiers.length} ティア`">{{ r.tiers.length }}</span>
                    <span class="min-w-[26px] rounded-sm bg-white/15 px-1 text-center text-[11px] font-bold leading-[18px] text-white/90" :title="`一番上のティアの MOD レベル ${r.topLevel}`">{{ r.topLevel }}</span>
                  </span>
                </span>
              </button>
              <!-- 段の表 -->
              <table v-if="expanded === `${sec.g}:${r.id}`" class="mt-1 w-full text-[11px]">
                <tbody>
                  <tr v-for="t in r.tiers" :key="t.rank" class="border-b border-white/5">
                    <td class="w-8 py-0.5 font-bold text-amber-200">{{ t.rank }}</td>
                    <td class="py-0.5 text-[#c8c8ff]">{{ t.text }}</td>
                    <td class="py-0.5 pl-2 opacity-60">{{ tierName(r, t.name) }}</td>
                    <td class="w-14 py-0.5 text-right tabular-nums opacity-70">Lv {{ t.ilvl }}</td>
                    <td class="w-16 py-0.5 text-right tabular-nums opacity-70">{{ t.weight ? `重み ${t.weight}` : "" }}</td>
                    <td v-if="canStart && sec.g === 'normal'" class="w-14 py-0.5 text-right">
                      <button type="button" class="rounded border border-sky-400/50 px-1.5 text-[10px] text-sky-200 hover:bg-sky-500/15" :title="`始めの状態に ${t.rank} を付ける (付きうる物だけ)`" @click.stop="s.addStartMod({ mod: r.id, tier: t.rank })">付ける</button>
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
