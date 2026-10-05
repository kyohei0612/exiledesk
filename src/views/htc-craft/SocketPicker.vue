<script setup lang="ts">
/**
 * SocketPicker.vue — ソケットに差す物 (アストリッドの創造性 / セールの凱旋 / 特別な MOD のルーン) のトグルと、買うベースのソケットの数 (2026-09-26)
 *
 * オーナー:「アストリッドやら追加しとこうか」。作り方のツリーの設定の列と、ベースから選ぶ道の ③ に置く。
 * 武器・防具は規格外 (ソケット 2 つ) のベースが既定で、素材の検索もその数以上で探す。差せない時 (指輪など・コラプト済み) は
 * 押せず、理由を短く出す。決まりと費用は [[sockets.ts]]。
 * 特別な MOD のルーン (コルの狩り 等、2026-10-03) は差せる部位 (手袋・兜・鎧・靴・武器) だけ並べる。狙いにその MOD があれば入ったまま外せない
 */
import { computed } from "vue";
import { ASSUMED_RUNE_WEIGHT_NOTE, artificerCount, effectiveSocket, requiredRunes, socketBlock, socketCostOf, socketCountFor, socketRunesFor, usesAssumedWeight, withRequired, type SocketKey, type SocketPick } from "../../services/htc/sockets";
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{
  c: ReturnType<typeof useHtcCraft>;
  /** ベースの種類 (ItemBase.category)。ベースから選ぶ道では計算前なので、選んだベースの種類を渡す */
  category: string | null | undefined;
  /** 狙いの特別な MOD が要るルーン (外せない)。省略時は計算機の狙い (c.targets) から引く。ベースから選ぶ道は計算前なので渡す */
  required?: readonly SocketKey[];
}>();
const c = props.c;
const corrupted = computed(() => !!c.item.value?.corrupted);
const count = computed(() => socketCountFor(props.category));
const required = computed<readonly SocketKey[]>(() => props.required ?? requiredRunes(c.data.value, c.targets.value.map((t) => t.modId)));
const on = computed(() => effectiveSocket(props.category, corrupted.value, withRequired(c.socket.value, required.value)));
const rows = computed(() => socketRunesFor(props.category).map((r) => {
  const locked = !!on.value[r.key] && required.value.includes(r.key);
  return { ...r, on: !!on.value[r.key], locked, why: locked ? "狙いの MOD に要るので外せない" : socketBlock(props.category, corrupted.value, on.value, r.key) };
}));
/** 特別な MOD のルーンを差している (確率・費用が仮の重みに乗る) */
const assumed = computed(() => usesAssumedWeight(on.value));
const onRows = computed(() => rows.value.filter((x) => x.on));
/** 選べるソケットの数: 0〜その装備の規格外 (胴・両手 3 / ほか 2) */
const BASE_SOCKETS = computed(() => Array.from({ length: count.value + 1 }, (_, i) => i));
function toggle(key: SocketKey): void {
  const r = rows.value.find((x) => x.key === key);
  if (!r || r.locked || (!r.on && r.why)) return;
  c.socket.value = { ...c.socket.value, [key]: !r.on };
}
function setBase(n: SocketPick["baseSockets"]): void {
  c.socket.value = { ...c.socket.value, baseSockets: n };
}
/** 押せないトグルの理由 (最初の 1 つ) */
const blockedWhy = computed(() => rows.value.find((r) => !r.on && r.why)?.why ?? null);
/** 差す物の代 (ルーン + 足りない穴の熟練工のオーブ。1 回の作成に 1 度) */
const cost = computed(() => (c.prices.value ? socketCostOf(c.prices.value, on.value) : null));
const artificers = computed(() => artificerCount(on.value));
/** アストリッドが要るのに差せない */
const astridMissing = computed(() => !!c.slots.value?.needsAstrid && !on.value.astrid);
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5 text-xs">
    <span class="opacity-60">ソケットに差す物</span>
    <template v-if="count">
      <span class="opacity-50">買うベースのソケット</span>
      <button v-for="n in BASE_SOCKETS" :key="n" type="button" class="rounded px-1.5 py-0.5"
        :class="on.baseSockets === n ? 'bg-white/15 ring-1 ring-white/30' : 'border border-white/10 opacity-60 hover:opacity-100'"
        :title="n === count ? `規格外 (ルーンソケット ${n} つ)。武器・防具のクラフトはほぼこれ。素材もこの数以上で探す` : `ソケット ${n} つ以上で探す。足りない穴は熟練工のオーブで開ける`" @click="setBase(n)">{{ n }}</button>
    </template>
    <button v-for="r in rows" :key="r.key" type="button" class="rounded-lg px-2 py-0.5 disabled:cursor-not-allowed disabled:opacity-40"
      :class="[r.on ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60' : 'border border-white/15 hover:bg-white/5', r.locked ? 'cursor-default' : '']"
      :disabled="!r.on && !!r.why" :title="r.locked ? `${r.why}。${r.effect}。${r.note}` : r.why ?? `${r.effect}。${r.note}`" @click="toggle(r.key)">
      {{ r.on ? "✓ " : "" }}{{ r.ja }} <span class="opacity-60">{{ r.effect }}</span><span v-if="r.locked" class="ml-1 text-orange-200/80">(狙いに要る)</span>
    </button>
    <span v-if="blockedWhy" class="opacity-50">{{ blockedWhy }}</span>
    <span v-if="assumed" class="text-orange-200/90" :title="ASSUMED_RUNE_WEIGHT_NOTE">特別な MOD の出やすさは仮 (重みがデータに無い)</span>
    <span v-for="r in onRows" :key="`n-${r.key}`" class="opacity-50">{{ r.ja }}: {{ r.note }}</span>
    <span v-if="cost && cost.lines.length" class="opacity-60">
      代 {{ Number.isFinite(cost.total) ? c.money(cost.total) : "相場に無い物がある" }}
      (ルーン{{ artificers ? ` + 熟練工のオーブ ${artificers} 個` : "" }}、1 回だけ)
    </span>
    <span v-if="astridMissing" class="text-rose-300">{{ c.slots.value?.note }}{{ count ? "" : " このベースは差せないので作れません。" }}</span>
    <span v-else-if="c.slots.value?.needsAstrid" class="text-amber-200">確定で乗せる MOD が {{ c.slots.value.crafted.length }} 個なので、アストリッドの創造性を差しています</span>
  </div>
</template>
