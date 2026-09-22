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
/** 暗黙は複数行のことがある (枠の増減は 2 行)。1 行に畳んで出す */
const implicitText = (lines: readonly string[]): string =>
  (lines[0] ?? "").split(String.fromCharCode(10)).join(" / ");
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
            <b>クラフトでは付きません</b> (ブリーチの樹からドロップした指輪など、落ちた物にしか乗らない MOD)。
            <b>付いた物を買ってください。</b>下の手順はこれを除いた残りのものです。
            <b>枠はその分を引いて解いています</b>
            (<template v-if="c.slotsUsed.value.prefixes">プレフィックス {{ c.slotsUsed.value.prefixes }} </template>
            <template v-if="c.slotsUsed.value.suffixes">サフィックス {{ c.slotsUsed.value.suffixes }} </template>
            <template v-if="c.slotsUsed.value.either">側が決まらない分 {{ c.slotsUsed.value.either }} は両側から </template>
            使用中)。
          </span>
        </p>
      </section>

      <!-- ベース選び。ここが分岐点なので、段階 0 より前に置く -->
      <section v-if="c.bases.value.length" class="mb-4">
        <h2 class="mb-1 font-bold">② ベース</h2>
        <p class="mb-2 text-xs opacity-60">
          <b>貼り付けた物を真似るなら、ベースは決まっています</b> (先頭の「今の物」)。
          下は<b>0 から作る時</b>の参考です ── 枠が違うベース、暗黙がタダで乗るベース、
          <b>品質の最大値を上げるベース</b>があります。後者ならプレフィックスを使わずに高い品質へ
          行けます (エッセンスで上げる道は枠を食う)。<b>選ぶのは手動です。</b>
        </p>
        <table class="w-full text-xs">
          <tr v-for="b in c.bases.value.slice(0, 8)" :key="b.baseType" class="border-b border-white/5">
            <td class="w-5">{{ b.fits ? "○" : "×" }}</td>
            <td class="py-0.5" :class="b.current ? 'text-amber-300 font-bold' : ''">
              {{ b.ja }}<span v-if="b.current" class="opacity-60"> ← 今の物</span>
            </td>
            <td class="w-14 opacity-50">lvl {{ b.lvl }}</td>
            <td class="w-16 opacity-70">{{ b.prefixes }}P/{{ b.suffixes }}S</td>
            <td class="w-28 text-emerald-300">{{ b.maxQualityPlus ? "品質上限 +" + b.maxQualityPlus + "%" : "" }}</td>
            <td class="pl-2 opacity-60">{{ b.why ?? implicitText(b.implicits) }}</td>
          </tr>
        </table>
      </section>

      <!-- 段階 0 -->
      <section class="mb-4">
        <h2 class="mb-1 font-bold">③ 買うか自分で出すか (1 個ずつ)</h2>
        <p class="mb-1 text-xs opacity-60">
          この値段より安く買えるなら買う。0 に近い物はエッセンス確定なので買ってはいけません。<br />
          <b>期待費用は厳密解</b>なので一瞬で出ます。<b>「沼った時」の目安 (p75) は押された時だけ</b>
          回します (方策を何千本も回すので秒単位かかる)。道中が長すぎて分布が信用できない時は
          「出せません」と出ます ── <b>嘘の数字を出すより出さない</b>ようにしています。
        </p>
        <table class="w-full text-xs">
          <tr v-for="s in c.solo.value" :key="s.modId" class="border-b border-white/5">
            <td class="py-0.5">{{ soloText(s.modId) }}</td>
            <td class="w-24 text-right">{{ c.money(s.expectedCost) }}</td>
            <td class="w-32 text-right">
              <button
                v-if="!c.p75.value[s.modId]"
                class="rounded border border-[var(--exile-color-border-subtle)] px-1.5 py-0.5 opacity-70"
                :disabled="c.p75Busy.value !== null"
                @click="c.findP75(s.modId)"
              >{{ c.p75Busy.value === s.modId ? "回しています…" : "厳しめを見る" }}</button>
              <span v-else-if="c.p75.value[s.modId].value != null" class="opacity-60">
                p75 {{ c.money(c.p75.value[s.modId].value) }}
              </span>
              <span v-else class="opacity-40" title="1 本の道中が長すぎて、回した分布が信用できません">
                出せません
              </span>
            </td>
            <td class="pl-3 opacity-60">{{ c.p75.value[s.modId]?.mainSpend ?? s.mainSpend }}</td>
            <td class="w-44 pl-2 text-right">
              <button
                v-if="!c.fractured.value[s.modId]"
                class="rounded border border-[var(--exile-color-border-subtle)] px-1.5 py-0.5"
                :disabled="c.fracturedBusy.value !== null"
                @click="c.findFractured(s.modId)"
              >
                {{ c.fracturedBusy.value === s.modId ? "探しています…" : "固定済みを探す" }}
              </button>
              <span v-else-if="c.fractured.value[s.modId].error" class="text-red-300">
                {{ c.fractured.value[s.modId].error }}
              </span>
              <a
                v-else-if="c.fractured.value[s.modId].min != null"
                :href="c.fractured.value[s.modId].url ?? undefined"
                target="_blank"
                class="text-emerald-300 underline"
              >固定済み最安 {{ c.money(c.fractured.value[s.modId].min) }}</a>
              <span v-else class="opacity-40">固定済みの出品なし</span>
            </td>
          </tr>
        </table>
        <p class="mt-1 text-xs opacity-60">
          <b>固定された MOD は消去でも消えません。</b>一番つきにくい 1 個が固定された物を買うのが
          一番効きます (実測: 素から 2,015 神 → 固定済みから 231 神)。
        </p>
      </section>

      <!-- ルートの比べ。固定済みがあれば、そこから解いた場合と並べる -->
      <section v-if="c.fracturedLines.value.length" class="mb-4">
        <h2 class="mb-1 font-bold">④ どこから始めるか</h2>
        <p class="mb-2 text-xs opacity-70">
          固定済み: <span class="text-emerald-300">{{ c.fracturedLines.value.join(" / ") }}</span><br />
          <b>固定された MOD は消去でも消えません。</b>買った時点でもう手に入っているので、そこから作れます。
        </p>
        <p v-if="c.fracturedUnusable.value" class="mb-2 rounded bg-amber-900/40 p-2 text-xs">
          ただし固定済みのうち {{ c.fracturedUnusable.value }} 件は<b>クラフトでは付かない MOD</b>
          (落ちた物にしか乗らない) なので、開始状態に置けません。<b>その物を買うのが前提</b>で、
          比べには入っていません。
        </p>
        <button
          class="mb-2 rounded border border-[var(--exile-color-border-subtle)] px-2 py-1 text-xs"
          :disabled="c.routesBusy.value"
          @click="c.compareRoutes()"
        >
          {{ c.routesBusy.value ? "解いています… (素から作るほうは分単位かかります)" : "ルートを比べる" }}
        </button>
        <table v-if="c.routes.value.length" class="w-full text-xs">
          <tr v-for="(r, i) in c.routes.value" :key="i" class="border-b border-white/5">
            <td class="py-0.5">{{ r.label }}</td>
            <td class="w-20 text-right opacity-60">残り {{ r.rest }} 個</td>
            <td class="w-24 text-right" :class="i === 0 ? 'text-emerald-300 font-bold' : ''">{{ c.money(r.cost) }}</td>
            <td class="w-24 text-right opacity-40">{{ (r.ms / 1000).toFixed(1) }} 秒</td>
          </tr>
        </table>
      </section>

      <!-- 設計図。本家と同じく案を並べ、各段が「何を狙うか」まで出す -->
      <section v-if="c.plans.value.length" class="mb-4">
        <h2 class="mb-1 font-bold">
          ⑤ 設計図
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
        <h2 class="mb-1 font-bold">⑥ 途中まで出来た物を買う</h2>
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
