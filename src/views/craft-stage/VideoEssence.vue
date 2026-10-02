<!--
  VideoEssence.vue — 動画用: 1 つのエッセンスの強さの比べ (POE2Tube 要望 ㉔-6、2026-10-02)

  URL: ?video=1&layout=clip&view=essence&name=body[&part=アミュレット]
    name = エッセンスの英語名の「Essence of ○○」の ○○ (the は有っても無くても。body / the body / haste …)
    part = 部位の言葉 (「アミュレット」「鎧」など)。その部位に付く行を金で強調し、他は薄く (無ければ全部同じ)
  レッサー / (名前に何も付かない物) / グレーター / パーフェクト を左から並べ、部位ごとに付く MOD と数値を出す。
  中身はクライアントのエッセンスの説明 (src/i18n/currency-hover-ja.json の g。カレンシーランキングのホバーと同じ)。
  下 15% (612px より下) は空ける。画面に「エッセンス」の文字を出す (撮影の準備の目印)。
-->
<script setup lang="ts">
import { computed, onMounted } from "vue";
import { currencyHoverOf, loadCurrencyHover } from "../../services/currency/currency-hover";

const props = defineProps<{ name: string; part: string | null }>();
onMounted(() => void loadCurrencyHover());

const TIERS = [
  { pre: "Lesser Essence of", ja: "レッサー", cls: "text-slate-200", ring: "border-slate-400/40" },
  { pre: "Essence of", ja: "(無印)", cls: "text-sky-200", ring: "border-sky-400/40" },
  { pre: "Greater Essence of", ja: "グレーター", cls: "text-violet-200", ring: "border-violet-400/50" },
  { pre: "Perfect Essence of", ja: "パーフェクト", cls: "text-amber-200", ring: "border-amber-400/60" },
] as const;

/** [ItemRarity|マジック] → マジック */
const strip = (s: string): string => s.replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]|]+)\]/g, "$1");

const cols = computed(() => {
  const n = props.name.trim().replace(/^the\s+/i, "");
  return TIERS.map((t) => {
    const h = currencyHoverOf(`${t.pre} the ${n}`) ?? currencyHoverOf(`${t.pre} ${n}`);
    if (!h) return null;
    const groups = (h.g ?? []).map((g) => ({ ...g, hit: !!props.part && g.h.includes(props.part) }));
    return { ...t, name: h.n, effect: strip(h.e?.[0] ?? ""), groups };
  }).filter((c): c is NonNullable<typeof c> => !!c);
});
const anyHit = computed(() => cols.value.some((c) => c.groups.some((g) => g.hit)));
</script>

<template>
  <div class="absolute inset-x-0 top-0 flex h-[612px] flex-col px-8 pt-5 text-white">
    <p v-if="!cols.length" class="mt-40 text-center text-2xl opacity-60">エッセンスを読んでいます… ({{ name }})</p>
    <template v-else>
      <p class="mb-3 text-[26px] font-bold text-white/85">
        エッセンスの強さ
        <span v-if="part" class="ml-4 text-[22px] font-normal text-amber-200">{{ part }}に付く物</span>
      </p>
      <div class="grid flex-1 gap-4" :style="{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }">
        <div v-for="c in cols" :key="c.pre" class="flex min-h-0 flex-col rounded-2xl border-2 bg-black/55 p-4" :class="c.ring">
          <p class="text-[17px] font-bold" :class="c.cls">{{ c.ja }}</p>
          <p class="text-[23px] font-bold leading-tight">{{ c.name }}</p>
          <p class="mt-1 text-[14px] leading-snug text-white/55">{{ c.effect }}</p>
          <div class="mt-3 space-y-3">
            <div
              v-for="(g, i) in c.groups"
              :key="i"
              class="rounded-lg px-2.5 py-1.5"
              :class="g.hit ? 'bg-amber-400/15 ring-2 ring-amber-300/80' : anyHit ? 'opacity-35' : 'bg-white/[0.04]'"
            >
              <p class="text-[15px] text-white/60">{{ g.h }}</p>
              <p v-for="(l, j) in g.l" :key="j" class="text-[21px] font-semibold leading-snug text-[#c8c8ff]">{{ strip(l) }}</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
