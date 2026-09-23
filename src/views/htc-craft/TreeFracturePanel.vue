<script setup lang="ts">
/**
 * TreeFracturePanel.vue — 創生の樹の MOD を「固定済みで買う / 自前で固定する」比べ (2026-09-23)
 *
 * HtcCraftLab.vue が 500 行を超えたので切り出しました (オーナーの決まり: 1 ファイル 500 行まで)。
 * 中身は useHtcCraft の `treePlan` / `searchTree` / `treeResult` を出すだけで、計算はしません。
 */
import type { useHtcCraft } from "./useHtcCraft";

defineProps<{ c: ReturnType<typeof useHtcCraft> }>();

/** 3 つの道を表の行にする */
type TreeRes = NonNullable<ReturnType<typeof useHtcCraft>["treeResult"]["value"]>;
function batchRows(r: TreeRes) {
  const row = (key: "strict" | "loose", label: string, b: TreeRes["strict"]) => ({
    key, label,
    count: b?.count ?? null, chance: b?.chance ?? null, base: b?.base ?? null,
    craft: b?.craft ?? null, total: b?.total ?? null,
    note: b ? "" : "出品が足りず 85% に届かない",
  });
  return [
    row("strict", "厳しい (プレフィックス 1 個)", r.strict),
    row("loose", "ゆるい (消去ガチャ)", r.loose),
    {
      key: "fractured" as const, label: "固定済みを買う", count: r.fracturedPrice != null ? 1 : null,
      chance: r.fracturedPrice != null ? 1 : null, base: r.fracturedPrice, craft: 0, total: r.fracturedPrice,
      note: "出品なし",
    },
  ];
}
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
          {{ f.label }}: 全 {{ f.total }} 件<a v-if="f.url" :href="f.url" target="_blank" class="ml-1 underline">開く</a> ／
        </template>
        <template v-if="c.treeResult.value.skippedNoMods"> MOD 数が読めず外した {{ c.treeResult.value.skippedNoMods }} 件</template>
      </p>
      <p v-if="c.treeResult.value.earlyBuy" class="mt-1 rounded bg-emerald-900/40 p-1 text-sm">
        固定済みが自前の最安 ({{ c.treeResult.value.selfFloor?.toFixed(1) }} 神 = 4 MOD のベースがタダでも) 以下なので、
        <b>買うのが一番安い</b>です。残りの検索は投げていません。
      </p>
      <!-- オーナーの比べ方: ゆるい / 厳しいを「85% に届く最小の個数だけ買う」総額と、固定済みを並べる -->
      <table class="mt-2 w-full">
        <tr class="opacity-50">
          <th class="text-left">道</th><th class="text-right">買う個数</th><th class="text-right">成功率</th>
          <th class="text-right">物の値段</th><th class="text-right">加工代</th><th class="text-right">合計</th>
        </tr>
        <tr
          v-for="r in batchRows(c.treeResult.value)"
          :key="r.key"
          class="border-b border-white/5"
          :class="c.treeResult.value.best === r.key ? 'text-emerald-300 font-bold' : ''"
        >
          <td class="py-0.5">{{ r.label }}<span v-if="c.treeResult.value.best === r.key"> ← 一番安い</span></td>
          <td class="text-right">{{ r.count ?? "—" }}</td>
          <td class="text-right">{{ r.chance != null ? (r.chance * 100).toFixed(1) + "%" : "—" }}</td>
          <td class="text-right">{{ r.base != null ? r.base.toFixed(1) + " 神" : "—" }}</td>
          <td class="text-right">{{ r.craft != null ? r.craft.toFixed(1) + " 神" : "—" }}</td>
          <td class="text-right">{{ r.total != null ? r.total.toFixed(1) + " 神" : r.note }}</td>
        </tr>
      </table>
      <p class="mt-1 opacity-60">
        成功率 85% に届く最小の個数だけ、安い順にまとめて買った時の総額です (それ以上は買わない)。
        加工代は成功した所で止める計算。
        <template v-for="b in [c.treeResult.value.strict, c.treeResult.value.loose]" :key="String(b?.count)">
          <span v-if="b?.assumed" class="text-amber-300">
            取れた出品では {{ b.assumed }} 個足りず、最後の 1 件と同じ物が買える前提で足しています (実際はもう少し高い)。
          </span>
        </template>
      </p>
      <!-- 一番安い道で買う物 -->
      <template v-if="c.treeResult.value.best === 'strict' || c.treeResult.value.best === 'loose'">
        <p class="mt-2 font-bold">買う物 (試す順)</p>
        <table class="w-full">
          <tr v-for="(o, i) in (c.treeResult.value.best === 'strict' ? c.treeResult.value.strict : c.treeResult.value.loose)!.items" :key="i" class="border-b border-white/5">
            <td class="w-5 opacity-40">{{ i + 1 }}</td>
            <td>{{ o.listing.label }}</td>
            <td>{{ howJa[o.how] }}</td>
            <td class="text-right">{{ (o.hit * 100).toFixed(0) }}%</td>
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
