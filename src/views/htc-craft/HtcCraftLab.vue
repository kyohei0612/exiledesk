<script setup lang="ts">
/**
 * HtcCraftLab.vue — クラフトのお試し計算機 (2026-09-22)
 *
 * オーナー指示:「マジで簡易的な計算機的な奴でいい。動きが見たい。イメージとあってるかどうか」。
 * **リリース前の動作確認用**で、体裁は最小限。中身は useHtcCraft.ts。
 */
import { ref, onMounted } from "vue";
import { PRESETS } from "./presets";
import { useHtcCraft } from "./useHtcCraft";

const c = useHtcCraft();
const text = ref(PRESETS[0]!.text);
const picked = ref(PRESETS[0]!.id);
const listing = ref<number | null>(PRESETS[0]!.listingDivine);

function pick(id: string): void {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return;
  picked.value = id;
  text.value = p.text;
  listing.value = p.listingDivine;
  void c.run(p.text);
}
onMounted(() => void c.run(text.value));

const soloText = (id: string): string => c.rows.value.find((r) => r.modId === id)?.text ?? id;
</script>

<template>
  <div class="h-full overflow-auto p-4 text-sm">
    <h1 class="mb-1 text-lg font-bold">クラフトのお試し計算機</h1>
    <p class="mb-3 text-xs opacity-60">
      ゲームから Ctrl+C した日本語のアイテムをそのまま貼れます。リリース前の動作確認用です。
    </p>

    <!-- 入力 -->
    <div class="mb-3 flex gap-2">
      <button
        v-for="p in PRESETS"
        :key="p.id"
        class="rounded border px-2 py-1 text-xs"
        :class="picked === p.id ? 'border-amber-400 text-amber-300' : 'border-[var(--exile-color-border-subtle)] opacity-70'"
        @click="pick(p.id)"
      >
        {{ p.label }}
      </button>
    </div>
    <textarea
      v-model="text"
      rows="10"
      class="mb-2 w-full rounded border border-[var(--exile-color-border-subtle)] bg-black/20 p-2 font-mono text-xs"
      spellcheck="false"
    />
    <div class="mb-4 flex items-center gap-3">
      <button class="rounded bg-amber-600/80 px-3 py-1 text-xs font-bold" :disabled="c.loading.value" @click="c.run(text)">
        {{ c.loading.value ? "計算中…" : "読んで計算する" }}
      </button>
      <label class="text-xs opacity-70">
        完成品の売値 (神)
        <input v-model.number="listing" type="number" class="ml-1 w-20 rounded border border-[var(--exile-color-border-subtle)] bg-black/20 px-1" />
      </label>
    </div>

    <p v-if="c.error.value" class="mb-3 rounded bg-red-900/40 p-2 text-xs">{{ c.error.value }}</p>

    <!-- 相場が空だと費用が全部 0 になるので、ここで断る -->
    <p v-if="c.coverage.value && c.coverage.value.filled === 0" class="mb-3 rounded bg-amber-900/40 p-2 text-xs">
      相場が未取得です。費用はすべて 0 と出ます。左の「カレンシー」を一度開いて相場を取ってから戻ってください。
    </p>
    <p v-else-if="c.coverage.value" class="mb-3 text-xs opacity-50">
      相場 {{ c.coverage.value.league ?? "?" }} / {{ c.coverage.value.fetchedLabel }} —
      値が入ったキー {{ c.coverage.value.filled }}、エッセンス {{ c.coverage.value.essences.filled }}/{{ c.coverage.value.essences.total }}
      <span v-if="c.coverage.value.missing.length"> (相場に無い {{ c.coverage.value.missing.length }} 件は使えません)</span>
    </p>

    <template v-if="c.item.value?.baseType">
      <!-- 読み取り -->
      <section class="mb-4">
        <h2 class="mb-1 font-bold">① 読み取り</h2>
        <p class="text-xs opacity-80">
          {{ c.item.value.baseText }} ({{ c.item.value.baseType }}) / ilvl {{ c.item.value.itemLevel }}
          <span v-if="c.item.value.quality"> / 品質 {{ c.item.value.quality }}%</span>
          <span v-if="c.item.value.catalystTag" class="text-amber-300"> — 種類 {{ c.item.value.catalystTag }} (この種類の MOD は品質を外してから読む)</span>
        </p>
        <table class="mt-1 w-full text-xs">
          <tr v-for="r in c.rows.value" :key="r.modId" class="border-b border-white/5">
            <td class="w-6 opacity-50">{{ r.side }}</td>
            <td class="py-0.5">{{ r.text }}</td>
            <td class="opacity-70">{{ r.tierName }}</td>
            <td class="opacity-50">{{ r.range }}</td>
            <td class="w-28 text-amber-300">{{ r.boosted ? "品質を外した" : "" }}</td>
            <td class="w-32 text-emerald-300">{{ r.crafted ? "確定で乗せられる" : "" }}</td>
          </tr>
        </table>
        <!-- 解く前に分かる話なので、ここで先に出す -->
        <p
          v-if="c.slots.value"
          class="mt-2 rounded p-2 text-xs"
          :class="c.slots.value.impossible ? 'bg-red-900/40' : c.slots.value.needsAstrid ? 'bg-amber-900/40' : 'bg-white/5'"
        >
          {{ c.slots.value.note }}
        </p>
        <p v-if="c.implicits.value.length" class="mt-1 text-xs opacity-50">
          暗黙 (ベースで決まるので作る対象外): {{ c.implicits.value.join(" / ") }}
        </p>
        <!-- 作れない MOD は黙って外さない。外して解くと別のアイテムの手順が出る -->
        <p v-if="c.skipped.value.length" class="mt-2 rounded bg-red-900/40 p-2 text-xs">
          <b>このベースでは作れない MOD が {{ c.skipped.value.length }} 件あります</b> — {{ c.skipped.value.join(" / ") }}<br />
          <span class="opacity-80">
            どのプールもこの MOD を出しません (ブリーチの樹など別経路で乗る物)。
            <b>付いた物を買ってください。</b>下の手順はこれを除いた残りのものです。
          </span>
        </p>
      </section>

      <!-- 段階 0 -->
      <section class="mb-4">
        <h2 class="mb-1 font-bold">② 買うか自分で出すか (1 個ずつ)</h2>
        <p class="mb-1 text-xs opacity-60">この値段より安く買えるなら買う。0 に近い物はエッセンス確定なので買ってはいけません。</p>
        <table class="w-full text-xs">
          <tr v-for="s in c.solo.value" :key="s.modId" class="border-b border-white/5">
            <td class="py-0.5">{{ soloText(s.modId) }}</td>
            <td class="w-24 text-right">{{ c.money(s.expectedCost) }}</td>
            <td class="w-24 text-right opacity-50">p75 {{ c.money(s.p75) }}</td>
            <td class="pl-3 opacity-60">{{ s.mainSpend }}</td>
          </tr>
        </table>
      </section>

      <!-- 設計図。本家と同じく案を並べ、各段が「何を狙うか」まで出す -->
      <section v-if="c.plans.value.length" class="mb-4">
        <h2 class="mb-1 font-bold">
          ③ 設計図
          <span class="font-normal text-xs opacity-60">数えた手順 {{ c.plansEvaluated.value.toLocaleString() }} / 案 {{ c.plans.value.length }} 件</span>
        </h2>
        <p class="mb-2 text-xs opacity-60">
          確率は正確です。<b>1 周の値段は案どうしを比べるための物で、予算には使わないでください</b>
          (外したら作り直す前提の数字なので)。
        </p>
        <div v-for="(p, pi) in c.plans.value" :key="pi" class="mb-3 rounded border border-[var(--exile-color-border-subtle)] p-2">
          <div class="mb-1 flex gap-4 text-xs">
            <span><b class="text-amber-300">{{ p.oddsText }}</b> <span class="opacity-50">1 周あたり</span></span>
            <span><b>{{ c.money(p.perRunCost) }}</b> <span class="opacity-50">1 周の値段</span></span>
            <span v-if="pi === 0" class="text-emerald-300">一番当たりやすい</span>
          </div>
          <table class="w-full text-xs">
            <tr v-for="(s, i) in p.steps" :key="i" class="border-b border-white/5">
              <td class="w-5 opacity-40">{{ i + 1 }}</td>
              <td class="py-0.5">{{ s.text }}</td>
              <td class="pl-2 text-sky-300">{{ c.stepTarget(s.modIds) }}</td>
              <td class="w-16 text-right opacity-60">{{ s.prob != null ? (s.prob * 100).toFixed(2) + "%" : "" }}</td>
            </tr>
          </table>
        </div>
      </section>

      <!-- 買い方 -->
      <section class="mb-4">
        <h2 class="mb-1 font-bold">④ 途中まで出来た物を買う</h2>
        <button
          class="mb-2 rounded border border-[var(--exile-color-border-subtle)] px-2 py-1 text-xs"
          :disabled="c.buysRunning.value"
          @click="c.solveBuys(listing)"
        >
          {{ c.buysRunning.value ? "解いています… (20 秒ほど画面が止まります)" : "3〜4 個買いを解く (20 秒ほど)" }}
        </button>
        <table v-if="c.buys.value.length" class="w-full text-xs">
          <tr class="opacity-50"><th class="text-left">買う物</th><th class="w-20 text-right">残り</th><th class="w-28 text-right">買値の上限</th></tr>
          <tr v-for="(b, i) in c.buys.value.slice(0, 10)" :key="i" class="border-b border-white/5">
            <td class="py-0.5">{{ b.bought.join(" + ") }}</td>
            <td class="text-right">{{ c.money(b.finish) }}</td>
            <td class="text-right" :class="b.budget ? 'text-emerald-300' : 'opacity-40'">
              {{ b.budget != null ? c.money(b.budget) : "—" }}
            </td>
          </tr>
        </table>
      </section>

      <!-- 時間 -->
      <section class="text-xs opacity-50">
        <h2 class="mb-1 font-bold opacity-100">かかった時間</h2>
        <div v-for="([label, ms], i) in c.timings.value" :key="i">{{ label }}: {{ ms }} ミリ秒</div>
      </section>
    </template>
  </div>
</template>
