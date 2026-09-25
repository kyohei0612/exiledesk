<script setup lang="ts">
/**
 * ProbLab.vue — 確率実験場 (2026-09-25)
 *
 * ベース・アイテムレベル・狙いの MOD と段を選ぶと、取り方ごとの当たりと費用 (やり直し込み) をその時の相場で並べる。
 * 「2,000 回回す」で実際に回した平均・8 割・9 割も出す。中身は [[useProbLab.ts]]
 */
import { onActivated, onMounted } from "vue";
import { useProbLab } from "./prob-lab/useProbLab";

const lab = useProbLab();
onMounted(() => void lab.ensure());
onActivated(() => void lab.ensure());
const pct = (p: number): string => (p >= 1 ? "確定" : p <= 0 ? "-" : `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`);
</script>

<template>
  <div class="mx-auto max-w-6xl p-4 text-sm">
    <h1 class="text-lg font-bold">確率実験場</h1>
    <p class="mt-1 text-xs opacity-60">
      狙いの MOD を 1 つ付けるのに、どの取り方が当たりやすく、やり直し込みで幾らかかるかを比べます。
      外れは「その側の消去のお告げ」で消す前提です (その側に他の狙いが無ければ確定。あれば巻き込む分を足します)。
      相場: {{ lab.priceLabel.value || "取得中…" }} (回す時にランキングを取り直してから値段を決めます。5 分以内ならそのまま)
    </p>
    <p v-if="lab.error.value" class="mt-1 text-rose-300">{{ lab.error.value }}</p>

    <div class="mt-3 flex flex-wrap items-end gap-3 rounded bg-white/5 p-2 text-xs">
      <label>ベース
        <select v-model="lab.baseName.value" class="sel ml-1">
          <optgroup v-for="g in lab.bases.value" :key="g.cls" :label="g.cls">
            <option v-for="n in g.names" :key="n" :value="n">{{ lab.jaOfBase(n) }}</option>
          </optgroup>
        </select>
      </label>
      <label>アイテムレベル <input v-model.number="lab.itemLevel.value" type="number" min="1" max="100" class="num w-16" /></label>
      <label>狙いの MOD
        <select v-model="lab.modId.value" class="sel ml-1">
          <optgroup label="プレフィックス"><option v-for="m in lab.mods.value.filter((x) => x.side === 'prefix')" :key="m.id" :value="m.id">{{ m.name }}</option></optgroup>
          <optgroup label="サフィックス"><option v-for="m in lab.mods.value.filter((x) => x.side === 'suffix')" :key="m.id" :value="m.id">{{ m.name }}</option></optgroup>
        </select>
      </label>
      <label>段 (これ以上で合格)
        <select v-model.number="lab.minTier.value" class="sel ml-1">
          <option v-for="t in [...lab.tiers.value].reverse()" :key="t.index" :value="t.index">T{{ lab.tiers.value.length - t.index }} ({{ t.ranges }}、レベル {{ t.ilvl }}、重み {{ t.weight }})</option>
        </select>
      </label>
      <label title="その側に固定でない他の狙いが何個あるか。外れを消す時に巻き込む">同じ側の他の狙い <input v-model.number="lab.othersOnSide.value" type="number" min="0" max="2" class="num w-12" /> 個</label>
      <label v-if="lab.othersOnSide.value > 0" title="巻き込んで消えた時の作り直し費用">その作り直し <input v-model.number="lab.redoOthersDivine.value" type="number" min="0" class="num w-16" /> 神</label>
      <label>回す回数 <input v-model.number="lab.runs.value" type="number" min="100" step="500" class="num w-20" /> 回</label>
      <button type="button" class="rounded bg-amber-600/80 px-3 py-1 font-bold disabled:opacity-40" :disabled="lab.running.value || !lab.rows.value.length" @click="lab.runAll()">
        {{ lab.running.value ? "回しています…" : `${lab.runs.value.toLocaleString()} 回回す` }}
      </button>
      <button type="button" class="rounded border border-white/30 px-2 py-1 disabled:opacity-40" title="今の表を下に留めて、設定を変えた物と並べて比べる" :disabled="!lab.rows.value.length" @click="lab.pin()">この表を留める</button>
    </div>
    <p v-if="lab.limits.value && lab.cls.value" class="mt-1 text-xs opacity-50">
      枠: プレ {{ lab.limits.value.prefix }} / サフィ {{ lab.limits.value.suffix }}。触媒 40% はブリーチの MOD がある間だけ (ブリーチのある指輪は上限が違います)
    </p>

    <table v-if="lab.rows.value.length" class="mt-3 w-full text-xs">
      <thead>
        <tr class="opacity-50">
          <th class="text-left font-normal">取り方</th>
          <th class="text-right font-normal">1 回の当たり</th>
          <th class="text-right font-normal">1 回の値段</th>
          <th class="text-right font-normal">外れ 1 回のやり直し</th>
          <th class="text-right font-normal">見込み (式)</th>
          <th class="text-right font-normal">回した: 回数</th>
          <th class="text-right font-normal">平均</th>
          <th class="text-right font-normal">8 割</th>
          <th class="text-right font-normal">9 割</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in lab.rows.value" :key="r.key" class="border-t border-white/10" :class="r.why ? 'opacity-40' : i === 0 ? 'text-emerald-300' : ''">
          <td class="py-1">{{ r.method }} <span class="opacity-60">{{ r.detail }}</span><span v-if="r.why" class="ml-1 text-amber-300">({{ r.why }})</span></td>
          <td class="text-right">{{ pct(r.p) }}</td>
          <td class="text-right">{{ r.why ? "-" : lab.money(r.perTry) }}</td>
          <td class="text-right" :class="r.safe ? '' : 'text-amber-300'">{{ r.why ? "-" : r.perMiss > 0 ? lab.money(r.perMiss) : "-" }}</td>
          <td class="text-right font-bold">{{ Number.isFinite(r.expected) ? lab.money(r.expected) : "-" }}</td>
          <template v-if="r.sim && r.sim !== 'running'">
            <td class="text-right">{{ r.sim.tries.toFixed(1) }} 回<span v-if="r.sim.pDone < 0.99" class="text-rose-300"> (完成 {{ (r.sim.pDone * 100).toFixed(0) }}%)</span></td>
            <td class="text-right font-bold">{{ lab.money(r.sim.expected) }}</td>
            <td class="text-right">{{ lab.money(r.sim.p80) }}</td>
            <td class="text-right">{{ lab.money(r.sim.p90) }}</td>
          </template>
          <template v-else>
            <td class="text-right opacity-50" colspan="4">{{ r.sim === "running" ? "回しています…" : "" }}</td>
          </template>
        </tr>
      </tbody>
    </table>
    <p v-else class="mt-3 text-xs opacity-50">{{ lab.loading.value ? "読み込み中…" : "ベースと MOD を選んでください" }}</p>
    <!-- 留めた表 (設定を変えて比べる用) -->
    <div v-for="(pn, i) in lab.pinned.value" :key="pn.title + i" class="mt-4 rounded border border-white/10 bg-black/20 p-2 text-xs">
      <p class="mb-1 flex items-center gap-2 opacity-70"><b>{{ pn.title }}</b><button type="button" class="rounded border border-white/30 px-1" @click="lab.unpin(i)">外す</button></p>
      <table class="w-full">
        <tr v-for="r in pn.rows.filter((x) => !x.why)" :key="r.key" class="border-t border-white/5">
          <td class="py-0.5">{{ r.method }} <span class="opacity-60">{{ r.detail }}</span></td>
          <td class="text-right">{{ pct(r.p) }}</td>
          <td class="text-right">見込み {{ lab.money(r.expected) }}</td>
          <td class="text-right">{{ r.sim && r.sim !== "running" ? `回した ${r.sim.tries.toFixed(1)} 回 / 平均 ${lab.money(r.sim.expected)} / 8 割 ${lab.money(r.sim.p80)}` : "" }}</td>
        </tr>
      </table>
    </div>
    <p class="mt-2 text-xs opacity-50">
      当たりの倍率 (触媒) は有志の実測 200 個からの推定で、40% 側は 5〜13 倍と幅があります。冒涜は 3 択を反響で 1 回引き直す前提 (6 候補)。
      完全の高貴は段の下限 (レベル 50) より下の MOD を出さないので、合格の下限がそれより低い狙いは上級の方が当たることがあります。
    </p>
  </div>
</template>
