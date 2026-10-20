<!--
  StageTargetSummary.vue — シミュレーションの ① 狙う MOD (完成図) (2026-10-05)

  オーナー「付く MOD 選んだ時の UI が分かりづらい、MOD 解析と同じ表示の仕方させるか」→
  「狙う MOD がシミュレーションの枠に入っていて、その下の枠にまた MOD 選択枠があって分かれているのかと思う。枠は一緒の枠で、
  ベースの所に出している表示を ① の MOD の所でするべきで、ベースには非表示でいい。そこに付きやすさの % も出そう、T2 以上なら確率が上がる」。
  クラフト計算機の MOD 解析 ([[ModBreakdown.vue]]) と同じく、左にプレ・右にサフィ、種類の札 + 文 + 段。番号は付ける順番。
  editable の時は ① で選んでいる間: 段のプルダウン・× (外す)・付け方の印 (押すと変える)。＋ (あるいは)・どれか N つの増減は 2 の後の整理 (SimTargetSort.vue) でやる (2026-10-18 オーナー「ここでプラスはいらん、その作業は次工程」)。
  付きやすさ = その段以上が同じ側の 1 回の抽選で出る割合 (空のレアにその側の高貴を打った時。ルーンの MOD はそのルーンを差したレア、冒涜は冒涜の置き場)。
  計算はエンジンの入口 (target-share.ts → addHitOdds、2026-10-20 手 3)。エッセンスは確定なので出さない
-->
<script setup lang="ts">
import { ref } from "vue";
import { craftStage } from "../../state/craft-stage";
import { tr } from "../../i18n/lang";
import SimMethodPop from "./SimMethodPop.vue";
import { PLAN_CLS, REST_PLANS, useTargetPlans } from "./use-target-plans";
import { useTargetRows } from "./use-target-rows";
import { useTargetShare } from "./use-target-share";
// 中身は 3 つに分けた (2026-10-20 R3): 行の並べ方 use-target-rows・付け方の ▾ use-target-plans・確率の % use-target-share。ここは並べるだけ

const props = defineProps<{ /** ① で選んでいる間 (段・×・付け方の印を出す) */ editable?: boolean; /** 付け方を選べる (2 の「決めた」の後、3 を決めるまで。2026-10-18 オーナー「決めたボタンの後ここで設定する感じで」) */ plans?: boolean; /** 自動 (② の高貴 / カオスは自動が決める。2026-10-20 S2) */ auto?: boolean }>();
const s = craftStage;
const methodPop = ref<InstanceType<typeof SimMethodPop> | null>(null);
const { pct, shareNote, shareOf } = useTargetShare(() => !!props.editable);
const { planLabel, samePlan, planList, restList, offOf, AUTO_LABELS, planOf, canFracture, setPlan, restable, restOf, restOff, setRest } = useTargetPlans(() => !!props.auto);
const { openGroups, toggleGroup, sameRank, shortName, tierOptions, rows, presentOnStart, drop, setTier, mixed, columns, noOf, essTitle, badgeOf } = useTargetRows({ shareOf, restable, restOf });
</script>

<template>
  <div class="grid min-w-0 gap-y-1 text-[13px]">
    <!-- % が何の割合か (2 は一番上のアイテムレベル、3 で決めたレベルで変わる。2026-10-18 初めての 10 人: 同じ MOD で 1.4% → 1.9% と変わって分からない) -->
    <!-- 貼り付けから始めた時は貼った物のアイテムレベルで (2026-10-20 点検 1・12: 貼り付け後も 86 の数だった)。注記は少し読みやすく -->
    <p v-if="rows.length" data-share-note class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ shareNote }}</p>
    <div v-for="col in columns" :key="col.title" class="min-w-0">
      <!-- 狙う MOD は何個でもいい (枠より多くても、次の段で整理する時にまとめる。2026-10-18 オーナー) -->
      <p class="mb-0.5 border-b border-white/10 pb-0.5 text-[12px] font-bold opacity-70">
        {{ col.title }} ({{ col.used }})<span v-if="col.used > 3" class="ml-1 font-normal opacity-70">枠より多い分は次で整理</span>
      </p>
      <p v-if="!col.groups.length" class="py-0.5 opacity-40">{{ props.editable ? "下の一覧で MOD を押し、開いた段の表の「T○ 以上」で足す" : "なし" }}</p>
      <div v-for="g in col.groups" :key="g.key" class="flex flex-wrap items-start gap-1.5 py-0.5">
        <span class="min-w-4 shrink-0 whitespace-nowrap pt-px text-right font-bold tabular-nums text-amber-200">{{ noOf.get(`${col.title}:${g.key}`) }}</span>
        <!-- 左は MOD の種類 (出どころ)、右は付け方の予定 (2026-10-05 オーナー「左はクラフト MOD とか冒涜 MOD とか付けるでしょ」) -->
        <span class="shrink-0 rounded border px-1 text-[11px]" :class="badgeOf(g.host).cls" :title="badgeOf(g.host).rune ? tr(`${badgeOf(g.host).rune}を差すと付く MOD。回す時はこのルーンを差した白から始める`, `Comes from socketing ${badgeOf(g.host).rune}. Runs start from a white base with that rune socketed`) : tr('MOD の種類 (出どころ)', 'Mod type (source)')">{{ badgeOf(g.host).label }}</span>
        <!--
          2 つ以上 (どれか n つ): 候補はほかの MOD と同じ太さの行で縦に並べ、左の金の縦線と「どれか n」の札でくくる
          (2026-10-19 オーナー「ここ太くなるのがなー」→ 縦線でくくる案。前は箱 + 説明の文で、1 つの組だけ太かった)。説明は札に乗せると出る
        -->
        <div class="min-w-0 flex-1" :class="g.members.length > 1 ? 'border-l-2 border-amber-400/60 pl-2 max-md:order-last max-md:ml-[1.375rem] max-md:basis-full' : ''"><!-- スマホは組だけ次の行に回して幅いっぱい (番号・種類・付け方の札は 1 行目) -->
          <!-- 頭の 1 行。押すと開く / たたむ -->
          <button v-if="g.members.length > 1" type="button" data-any-toggle class="g-plain flex w-full flex-wrap items-center gap-1.5 text-left text-[12px]" :aria-expanded="openGroups.has(g.key)" :title="openGroups.has(g.key) ? 'たたむ' : '押すと候補を全部開く (段・外すはここで)'" @click="toggleGroup(g.key)">
            <span class="rounded-sm bg-amber-500/20 px-1 font-bold text-amber-200" data-any-tag :title="restable(g) && restOf(g) ? `完成品に全部要る (${g.kind === 'fracture' ? '1 つ固定、残りは下の付け方' : '1 つ増強、残りは下の付け方'})` : `この中のどれか ${g.need} つ (どの順番でもいい。${g.need} つ付けば完成)`">{{ restable(g) && restOf(g) ? (g.members.length === 2 ? "どっちも" : `全部 ${g.members.length}`) : `どれか ${g.need}` }}</span>
            <span class="text-[var(--exile-color-text-tertiary)]">{{ g.members.length }} 候補</span>
            <!-- たたんだ時は候補の名前も同じ行に (… で切らず折り返して全部。2026-10-21 オーナー「MOD は全て折り返しで全体表示」「間空いてるから 2 段にしなくてもいい」) -->
            <span v-if="!openGroups.has(g.key)" class="text-[13px]" :title="g.members.map((r) => `${r.text} ${r.rank}`).join('\n')">{{ g.members.map((r) => shortName(r.text)).join(" ／ ") }}</span>
            <span v-if="!openGroups.has(g.key) && sameRank(g.members)" class="rounded-sm bg-amber-500/25 px-1 text-[11px] font-bold text-amber-100">{{ sameRank(g.members) }}</span>
            <span v-if="g.share != null" class="tabular-nums text-amber-100/70" title="1 回で付く割合の合計 (候補のどれかが付く)">合計 {{ pct(g.share) }}</span>
            <span class="text-[11px] opacity-60">{{ openGroups.has(g.key) ? "▴" : "▾" }}</span>
          </button>
          <div v-if="g.members.length <= 1 || openGroups.has(g.key)" :class="g.members.length > 1 ? 'flex flex-col gap-0.5' : 'flex items-center gap-1.5 max-md:flex-wrap'">
            <!-- 組の中 (どれか) はスマホでも札を文の横に置く (文だけ折り返す)。1 つの時は今まで通り文の下に札 -->
            <span v-for="r in g.members" :key="r.modId" class="inline-flex min-w-0 max-w-full items-center gap-1" :class="g.members.length > 1 ? 'max-md:flex max-md:w-full' : 'max-md:flex-wrap'">
              <span class="min-w-0" :class="g.members.length > 1 ? 'max-md:flex-1' : 'max-md:w-full'" :title="r.text + essTitle(r.modId)">{{ r.text }}</span>
              <select v-if="props.editable && tierOptions(r.modId).length > 1" class="shrink-0 rounded-sm bg-amber-500/25 px-0.5 text-[11px] font-bold text-amber-100" title="段を変える (その段以上が当たり)" :value="r.minTierIndex" @change="setTier(r, Number(($event.target as HTMLSelectElement).value))">
                <option v-for="o in tierOptions(r.modId)" :key="o.i" :value="o.i" class="bg-[#14120e]">{{ o.label }}</option>
              </select>
              <span v-else class="shrink-0 rounded-sm bg-amber-500/25 px-1 text-[11px] font-bold text-amber-100">{{ r.rank }}</span>
              <span v-if="presentOnStart(r)" class="shrink-0 rounded-sm bg-emerald-500/25 px-1 text-[11px] font-bold text-emerald-100" title="エミュレーターの状態にもう付いている (この段以上)">✓ 付いている</span>
              <span v-if="r.share != null" class="shrink-0 text-[11px] tabular-nums opacity-70" title="1 回の抽選でこの段以上が出る割合 (同じ側の重み)">{{ pct(r.share) }}</span>
              <button v-if="props.editable" type="button" class="shrink-0 px-0.5 text-[12px] leading-none opacity-50 hover:text-rose-300 hover:opacity-100 max-md:min-h-9 max-md:min-w-9 max-md:text-[16px]" :title="r.alt || g.hosts.length > 1 ? 'この候補を外す' : 'この MOD を外す (あるいはの候補ごと)'" @click="drop(r, g.hosts)">×</button>
            </span>
            
          </div>
        </div>
        <!-- 付け方の予定は MOD の右側 (2026-10-05 オーナー「普通カオススパムとかの設定って MOD の右側よ」) -->
        <!-- 始め方が白以外の時、固定 MOD は 1 ベースで決めた物なので予定は変えない (2026-10-08)。
             エミュレーターの状態から来た時 (item) のフラクチャー済みは、鍵を付けずほかの狙いと同じ「フラクチャー予定」として出す (付け方を変えられる。2026-10-19 オーナー「フラクチャー済みも手打ちで変更できないから、フラクチャー予定でいい、どうせ後で設定で使う」) -->
        <span v-if="g.kind === 'fracture' && s.simStart.value !== 'white' && s.simStart.value !== 'item'" class="shrink-0 rounded border px-1 text-[11px] max-md:ml-[1.375rem] max-md:basis-full" :class="PLAN_CLS.fracture" title="1 ベースの始め方で決めたフラクチャーの MOD">{{ s.simStart.value === "fractured" ? "🔒 フラクチャー (買った物)" : "🔒 フラクチャーする (買った 4 MOD から)" }}</span>
        <!-- 付け方は押して選ぶ札を MOD の行のすぐ下に (2026-10-18 オーナー「MOD 選んだら付け方選べるように、高貴ガチャかカオススパムか冒涜・フラクチャー等」。前は 10px のプルダウンで気付けなかった) -->
        <span v-else-if="props.plans && planList(g.host).length > 1" data-plan-pick class="flex basis-full flex-wrap items-center gap-1 pl-[1.375rem]" title="この MOD の付け方。打ち方の手で狙う時の目安 (後で変えられる)">
          <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">付け方</span>
          <button v-for="p in planList(g.host)" :key="p" type="button" class="rounded border px-1.5 py-px text-[12px] transition disabled:cursor-not-allowed disabled:opacity-40 max-md:min-h-9 max-md:px-2.5" :class="samePlan(planOf(g), p) ? [PLAN_CLS[p], 'bg-white/10 font-bold'] : 'border-white/15 text-white/50 hover:bg-white/5 hover:text-white/80'" :aria-pressed="samePlan(planOf(g), p)" :disabled="!samePlan(planOf(g), p) && !!offOf(g)[p]" :title="offOf(g)[p] ?? (p === 'fracture' && g.kind !== 'fracture' && !canFracture(g.host) ? 'ほかのフラクチャー予定と違う側 (非推奨)' : undefined)" @click="!samePlan(planOf(g), p) && setPlan(g, p)">{{ planLabel(p) }}<span v-if="p === 'fracture' && g.kind !== 'fracture' && !canFracture(g.host)" class="ml-0.5 opacity-70">*</span></button>
        </span>
        <!-- 選んでいる間は印を押すと付け方を変えられる (足した時と同じポップアップ。2026-10-18 オーナー「決めた奴でも途中で変えれるように」) -->
        <button v-else-if="props.editable && planList(g.host).length > 1" type="button" data-plan-change class="shrink-0 rounded border px-1 text-[11px] hover:bg-white/10 max-md:min-h-9 max-md:px-2" :class="PLAN_CLS[planOf(g)]" title="押すと付け方を変える" @click="methodPop?.ask($event.currentTarget as Element, planList(g.host), (p) => !samePlan(planOf(g), p) && setPlan(g, p), offOf(g), props.auto ? AUTO_LABELS : undefined)">{{ planLabel(planOf(g)) }} ▾</button>
        <span v-else class="shrink-0 rounded border px-1 text-[11px]" :class="PLAN_CLS[planOf(g)]" :title="props.editable ? undefined : 'この MOD の付け方 (変えるなら 2 の段の「この段に戻る」)'">{{ planLabel(planOf(g)) }}</span>
        <!-- 候補が 2 つ以上のフラクチャー予定・増強スパムの組: 残り (固定されなかった方 / マジックに入らなかった方) も要るか・その付け方 (無し = どれか 1 つで良い。2026-10-21 オーナー) -->
        <div v-if="restable(g) && props.editable" data-rest-row class="flex basis-full flex-wrap items-center gap-1 pl-[1.375rem] text-[12px]">
          <!-- まず「どれか 1 つ / どっちも」、どっちもの時だけその右に残りの付け方 (2026-10-21 オーナー「要らないとかややこしい。どっちかもしくはどっちもで選ばせて、どっちもなら固定されなかった方の付け方」) -->
          <span class="text-[var(--exile-color-text-tertiary)]">└ 完成品に</span>
          <button type="button" data-rest-one class="rounded border px-1.5 py-px transition max-md:min-h-9 max-md:px-2.5" :class="!restOf(g) ? 'border-amber-300 bg-amber-500/35 font-bold text-amber-50 ring-1 ring-amber-300/60' : 'border-white/15 text-white/50 hover:bg-white/5 hover:text-white/80'" :aria-pressed="!restOf(g)" @click="setRest(g, null)">どれか 1 つ</button>
          <button type="button" data-rest-all class="rounded border px-1.5 py-px transition max-md:min-h-9 max-md:px-2.5" :class="restOf(g) ? 'border-amber-300 bg-amber-500/35 font-bold text-amber-50 ring-1 ring-amber-300/60' : 'border-white/15 text-white/50 hover:bg-white/5 hover:text-white/80'" :aria-pressed="!!restOf(g)" @click="!restOf(g) && setRest(g, REST_PLANS.find((p) => !restOff(g)[p]) ?? null)">{{ g.members.length === 2 ? "どっちも" : `全部 (${g.members.length} つ)` }}</button>
          <template v-if="restOf(g)">
            <span class="ml-2 text-[var(--exile-color-text-tertiary)]">{{ g.kind === "fracture" ? "固定されなかった方の付け方" : "残りの付け方" }}</span>
            <button v-for="p in restList()" :key="p" type="button" :data-rest-pick="p" class="rounded border px-1.5 py-px transition disabled:cursor-not-allowed disabled:opacity-40 max-md:min-h-9 max-md:px-2.5" :class="samePlan(restOf(g), p) ? [PLAN_CLS[p], 'bg-white/10 font-bold'] : 'border-white/15 text-white/50 hover:bg-white/5 hover:text-white/80'" :aria-pressed="samePlan(restOf(g), p)" :disabled="!samePlan(restOf(g), p) && !!restOff(g)[p]" :title="restOff(g)[p]" @click="!samePlan(restOf(g), p) && setRest(g, p)">{{ planLabel(p) }}</button>
          </template>
        </div>
        <p v-else-if="restable(g) && restOf(g)" class="basis-full pl-[1.375rem] text-[12px] text-[var(--exile-color-text-secondary)]">└ 完成品に{{ g.members.length === 2 ? "どっちも" : "全部" }} · {{ g.kind === "fracture" ? "固定されなかった方" : "残り" }}は <span class="rounded border px-1 text-[11px]" :class="PLAN_CLS[restOf(g)!]">{{ planLabel(restOf(g)!) }}</span></p>
      </div>
    </div>
    <!-- プレとサフィにまたがる「どれか」(カオススパム) -->
    <div v-for="g in mixed" :key="g.key" class="min-w-0">
      <p class="mb-0.5 border-b border-white/10 pb-0.5 text-[12px] font-bold opacity-70">プレフィックスかサフィックスのどれか <span class="font-normal">(付いた側で打ち方のルートが分かれる)</span></p>
      <div class="flex items-start gap-1.5 py-0.5 max-md:flex-wrap">
        <span class="min-w-4 shrink-0 whitespace-nowrap pt-px text-right font-bold tabular-nums text-amber-200">{{ noOf.get(`mixed:${g.key}`) }}</span>
        <!-- プレとサフィにまたがる組も同じ形 (縦線でくくる) -->
        <div class="min-w-0 flex-1 border-l-2 border-amber-400/60 pl-2">
          <div class="flex flex-col gap-0.5">
            <span v-for="r in g.members" :key="r.modId" class="inline-flex min-w-0 max-w-full items-center gap-1">
              <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ r.side === "P" ? "プレフィックス" : "サフィックス" }}</span>
              <span class="min-w-0" :title="r.text">{{ r.text }}</span>
              <select v-if="props.editable && tierOptions(r.modId).length > 1" class="shrink-0 rounded-sm bg-amber-500/25 px-0.5 text-[11px] font-bold text-amber-100" title="段を変える (その段以上が当たり)" :value="r.minTierIndex" @change="setTier(r, Number(($event.target as HTMLSelectElement).value))">
                <option v-for="o in tierOptions(r.modId)" :key="o.i" :value="o.i" class="bg-[#14120e]">{{ o.label }}</option>
              </select>
              <span v-else class="shrink-0 rounded-sm bg-amber-500/25 px-1 text-[11px] font-bold text-amber-100">{{ r.rank }}</span>
              <button v-if="props.editable" type="button" class="shrink-0 px-0.5 text-[12px] leading-none opacity-50 hover:text-rose-300 hover:opacity-100" :title="r.alt ? 'この候補を外す' : 'この MOD を外す (あるいはの候補ごと)'" @click="drop(r)">×</button>
            </span>
          </div>
        </div>
        <span class="shrink-0 rounded border px-1 text-[11px]" :class="PLAN_CLS.chaos">カオススパム</span>
      </div>
    </div>
    <SimMethodPop ref="methodPop" />
  </div>
</template>
