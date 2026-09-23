<script setup lang="ts">
/**
 * TreeFracturePanel.vue — 創生の樹の MOD を「固定済みで買う / 自前で固定する」比べ (2026-09-23)
 *
 * HtcCraftLab.vue が 500 行を超えたので切り出しました (オーナーの決まり: 1 ファイル 500 行まで)。
 * 中身は useHtcCraft の `treePlan` / `searchTree` / `treeResult` を出すだけで、計算はしません。
 */
import { openExternal } from "../../services/trade2/open-external";
import type { useHtcCraft } from "./useHtcCraft";

defineProps<{ c: ReturnType<typeof useHtcCraft> }>();

/** 平均が一番安い道 */
type TreeRes = NonNullable<ReturnType<typeof useHtcCraft>["treeResult"]["value"]>;
const bestRoute = (r: TreeRes) => r.routes.find((x) => x.key === r.best) ?? null;

/** 固定のやり方 → 画面の言葉 */
const howJa: Record<string, string> = {
  buy: "そのまま買う",
  "necro-desecrate": "右側ネクロ冒涜 (サフィが足りなければ右側の高貴で足す) → 固定 (1/3)",
  desecrate: "冒涜 → 固定 (1/3、消去なし)",
  direct: "そのまま固定",
  reduce: "消去で 3 MOD まで減らす → 冒涜 → 固定",
};
</script>

<template>
  <!-- 固定済みを買うか、自前で固定するか。オーナーの順番: オーブの値段 → 固定済み最安 1 件 → 比べて起動 -->
  <div v-if="c.treePlan.value" class="mt-2 rounded border border-amber-700/50 p-2 text-xs">
    <b>固定済みを買うか、自前で固定するか</b>
    <p class="mt-1">
      フラクチャーオーブ
      <b class="text-amber-300">{{ c.treePlan.value.plan.orb == null ? "相場に無い" : c.treePlan.value.plan.orb.toFixed(2) + " 神" }}</b>
      <template v-if="c.treePlan.value.plan.orb != null && c.treePlan.value.plan.breakEvenOrb != null">
        — 分かれ目 約 {{ c.treePlan.value.plan.breakEvenOrb.toFixed(1) }} 神なので、自前なら
        <b>{{ c.treePlan.value.plan.orb > c.treePlan.value.plan.breakEvenOrb ? "3 MOD まで減らして冒涜してから固定" : "減らさずそのまま固定" }}</b>
        が得
      </template>
    </p>
    <table v-if="c.treePlan.value.plan.rows.length" class="mt-1 w-full">
      <tr class="opacity-50"><th class="text-left">樹 MOD 入りの物</th><th class="text-right">自前の期待</th><th class="text-right">期待で試す数</th></tr>
      <tr v-for="r in c.treePlan.value.plan.rows" :key="r.mods" class="border-b border-white/5">
        <td>{{ r.mods }} MOD</td>
        <td class="text-right">ベース代 × {{ r.mods }} + <b>{{ r.fixed.toFixed(1) }} 神</b></td>
        <td class="text-right opacity-60">{{ r.expectedItems }} 個</td>
      </tr>
    </table>
    <p class="mt-1 opacity-60">
      成功率は減らしても減らさなくても 1/N (最初の MOD 数分の 1)。1 個成功したら終わり。
      <b>固定済み品の最安がこれより安ければ買う</b>ほうが得です。
    </p>
    <!-- 検索の条件。stat は作れない MOD だけ、他は規定通り。手で探す時もこのまま入れればいい -->
    <p class="mt-2">次: 最安を取る — <b>{{ c.treePlan.value.searches.length }} 本</b></p>
    <table class="mt-1 w-full">
      <tr v-for="sq in c.treePlan.value.searches" :key="sq.key" class="border-b border-white/5 align-top">
        <td class="py-0.5 pr-2 whitespace-nowrap">{{ sq.label }}</td>
        <td class="opacity-80">
          {{ c.item.value?.baseText ?? c.item.value?.baseType }} / ilvl {{ c.item.value?.itemLevel ?? "?" }} 以上 / レア / コラプト無し /
          <template v-if="sq.key !== 'fractured'">フラクチャー: いいえ / </template>
          <template v-for="b in c.treePlan.value.buys" :key="b.text">
            <b>{{ b.text.replace(/[0-9]+/, "#") }}</b>
            <span class="text-amber-300">({{ sq.key === "fractured" ? "Fractured" : "Explicit" }}<template
              v-if="b.filters[0]?.min"> 最小 {{ b.filters[0].min }}</template>)</span>
          </template>
          <template v-if="sq.key === 'strict'"> / 疑似 プレフィックスモッド #個 最大 1</template>
          <span class="opacity-50"> — 最安 {{ sq.take }} 件</span>
        </td>
      </tr>
    </table>
    <p v-if="c.treePlan.value.plan.rows.find((r) => r.mods === 4)" class="mt-1 opacity-70">
      固定済みが <b>{{ c.treePlan.value.plan.rows.find((r) => r.mods === 4)!.fixed.toFixed(1) }} 神</b>
      (オーブの約 {{ (c.treePlan.value.plan.rows.find((r) => r.mods === 4)!.fixed / (c.treePlan.value.plan.orb ?? 1)).toFixed(1) }} 倍) 以下なら、
      自前は絶対に勝てないので買い。1 本目で分かれば残りは投げません。
    </p>
    <button
      class="mt-2 rounded bg-amber-600/80 px-3 py-1 font-bold disabled:opacity-40"
      :disabled="c.treeBusy.value || !c.coverage.value?.ready"
      @click="c.searchTree()"
    >
      {{ c.treeBusy.value ? "取引所に問い合わせ中… (1 本 10.5 秒間隔)" : `最安を取って比べる (${c.treePlan.value.searches.length} 本)` }}
    </button>
    <p v-if="c.treeError.value" class="mt-1 rounded bg-red-900/40 p-1">{{ c.treeError.value }}</p>

    <!-- 判定。成功 1 回あたりの安い順に試し、固定済みより高い所で打ち切る -->
    <template v-if="c.treeResult.value">
      <p class="mt-2 opacity-70">
        <template v-for="f in c.treeResult.value.found" :key="f.label">
          {{ f.label }}: 全 {{ f.total }} 件<button v-if="f.url" type="button" class="ml-1 underline" @click="openExternal(f.url)">開く</button> ／
        </template>
        <template v-if="c.treeResult.value.skippedNoMods"> MOD 数が読めず外した {{ c.treeResult.value.skippedNoMods }} 件</template>
      </p>
      <p v-if="c.treeResult.value.earlyBuy" class="mt-1 rounded bg-emerald-900/40 p-1 text-sm">
        固定済みが自前の最安 ({{ c.treeResult.value.selfFloor?.toFixed(1) }} 神 = 4 MOD のベースがタダでも) 以下なので、
        <b>買うのが一番安い</b>です。残りの検索は投げていません。
      </p>
      <!-- 物差しは平均 (オーナー:「基本確率だけど平均値で計算しよう」)。1 個ずつ買って試し、
         成功で止め、外れ続けたら固定済みを買う。85% の個数は何個用意するかの目安 -->
    <table class="mt-2 w-full">
      <tr class="opacity-50">
        <th class="text-left">道</th><th class="text-right">平均</th><th class="text-right">平均で買う数</th>
        <th class="text-right">1 個目で当たり</th><th class="text-right">最悪</th><th class="text-right">85% の目安</th>
      </tr>
      <tr
        v-for="r in c.treeResult.value.routes"
        :key="r.key"
        class="border-b border-white/5"
        :class="c.treeResult.value.best === r.key ? 'text-emerald-300 font-bold' : ''"
      >
        <td class="py-0.5">{{ r.label }}<span v-if="c.treeResult.value.best === r.key"> ← 一番安い</span></td>
        <td class="text-right">{{ r.summary.expected.toFixed(1) }} 神</td>
        <td class="text-right">{{ r.key === "fractured" ? "—" : r.summary.avgItems.toFixed(1) + " 個" }}</td>
        <td class="text-right">{{ r.summary.firstHit != null ? r.summary.firstHit.toFixed(1) + " 神" : "—" }}</td>
        <td class="text-right">
          {{ r.summary.worst.toFixed(1) }} 神
          <span v-if="r.summary.allMiss > 0" class="opacity-50">({{ (r.summary.allMiss * 100).toFixed(0) }}%)</span>
        </td>
        <td class="text-right opacity-60">{{ r.need85 != null ? r.need85 + " 個" : "—" }}</td>
      </tr>
    </table>
    <p class="mt-1 opacity-60">
      平均 = 安い物から 1 個ずつ買って試し、固定できたら終わり、全部外れたら固定済みを買った時の平均額。
      「最悪」は全部外れて固定済みを買った時の額 (括弧はその確率)。
      「85% の目安」は、その道だけで 85% の確率で 1 個固定するのに要る数です。
    </p>
    <!-- 一番安い道で買う物 (試す順) -->
    <template v-if="bestRoute(c.treeResult.value) && bestRoute(c.treeResult.value)!.key !== 'fractured'">
      <p class="mt-2 font-bold">試す順 (1 個ずつ買う)</p>
      <table class="w-full">
        <tr v-for="(o, i) in bestRoute(c.treeResult.value)!.decision.order" :key="i" class="border-b border-white/5">
          <td class="w-5 opacity-40">{{ i + 1 }}</td>
          <td>{{ o.listing.label }}</td>
          <td>{{ howJa[o.how] }}</td>
          <td class="text-right">{{ (o.hit * 100).toFixed(0) }}%</td>
        </tr>
        <tr v-if="bestRoute(c.treeResult.value)!.decision.fallback" class="opacity-60">
          <td></td>
          <td colspan="3">全部外れたら → 固定済み {{ bestRoute(c.treeResult.value)!.decision.fallback!.listing.label }} を買う</td>
        </tr>
      </table>
    </template>
    <!-- 1/3 の道はどちらもオーナーの実使用が根拠。数字と一緒に必ず出す -->
      <p class="mt-1 text-[11px] text-amber-300/70">
        ⚠ <template v-for="n in c.treeNotes" :key="n">{{ n }} </template>
      </p>

    </template>
  </div>
  <!-- 相場が無いと比べられない。黙って消すと「比べる所が無い」のか「相場が無い」のか分からない -->
  <p v-else-if="c.dropOnly.value.length" class="mt-2 rounded bg-amber-900/40 p-2 text-xs">
    相場が未取得なので、<b>固定済みを買うか自前で固定するか</b>を比べられません。
    左の「カレンシーランキング」を一度開いて相場を取ってから、もう一度「MOD 解析」を押してください。
  </p>
</template>
