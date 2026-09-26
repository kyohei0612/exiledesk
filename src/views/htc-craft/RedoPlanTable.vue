<script setup lang="ts">
/**
 * RedoPlanTable.vue — やり直しの費用から決めた取り方 (自動で組んだ時に出す表)
 * CraftTreePanel.vue から切り出し (2026-09-26)。中身は変えていない。
 */
import { computed } from "vue";
import { RULES, type RedoPlan } from "./redo-cost";
import { jaOfOmen, jaOfPriceKey } from "../../services/htc/labels";
import { CATALYSTS } from "../../services/htc/quality";
import { OMEN } from "../../services/htc/omens";
import type { Side } from "../../services/htc/step-odds";
import type { useHtcCraft } from "./useHtcCraft";
import type { useCraftTree } from "./useCraftTree";

const props = defineProps<{
  c: ReturnType<typeof useHtcCraft>;
  t: ReturnType<typeof useCraftTree>;
  plan: RedoPlan;
  /** 回して採った候補の名前と平均 (見積もりと違う候補が勝つこともある) */
  picked: { label: string; expected: number | null; done: number | null } | null;
  /** ソケットに差す物の代 (1 回の作成に 1 度。高貴建て) */
  socketEx: number;
}>();
const c = props.c;
const t = props.t;
/**
 * 取り方の文言はゲームの正式名で (オーナー 2026-09-26:「お告げの名前しっかり機能したい。その MOD がサフィ産かプレ産か
 * 分かるでしょ、ちゃんとお告げの名前を書いて」)。プレ = 左側 (Sinistral)、サフィ = 右側 (Dextral)
 */
const omen = (id: string): string => jaOfOmen(id) ?? id;
const ORB_JA: Record<string, string> = { exalt: "高貴なオーブ", exalt_greater: "高貴なオーブ (上級)", exalt_perfect: "高貴なオーブ (完全)" };
const priceJa = (key: string): string => jaOfPriceKey(key, c.base.value ?? undefined) ?? key;
/** 取り方の行はプレフィックスを上、サフィックスを下に (オーナー 2026-09-26:「プレフィックスは上でサフィは下だろ、順番ね」) */
const planRows = computed(() => [...(props.plan?.rows ?? [])].sort((a, b) => (a.side === b.side ? 0 : a.side === "prefix" ? -1 : 1)));
/** 何で狙うか (通貨 + お告げ) */
const howJa = (r: RedoPlan["rows"][number]): string => {
  switch (r.method) {
    case "chaos": return r.erasure ? `カオスオーブ + ${omen(OMEN.erasure[r.side])}` : "カオスオーブ";
    case "exalt": {
      const cat = r.catalyst ? CATALYSTS.find((k) => k.tag === r.catalyst) : null;
      // 反対側が埋まっていて側のお告げが効かない時は書かない (値段にも入れていない。2026-09-26 オーナー承認)
      return `${ORB_JA[r.orb ?? "exalt"] ?? "高貴なオーブ"}${r.noSideOmen ? "" : ` + ${omen(OMEN.exalt[r.side])}`}${cat ? ` + ${omen("OmenofCatalysingExaltation")} (${cat.ja})` : ""}${r.noSideOmen ? " (反対側が埋まっているのでお告げ不要)" : ""}`;
    }
    case "desecrate": return r.noSideOmen ? `${priceJa(r.bone ?? "desecrate")} (反対側が埋まっているのでお告げ不要)` : `${priceJa(r.bone ?? "desecrate")} + ${omen(OMEN.necromancy[r.side])}`;
    case "essence": return r.noSideOmen ? "パーフェクトエッセンス (確定・反対側に外せる物が無いのでお告げ不要)" : `パーフェクトエッセンス + ${omen(OMEN.crystallisation[r.side])} (確定)`;
    default: return r.method;
  }
};
/** 外れた時にどうするか */
const missJa = (r: RedoPlan["rows"][number]): string => {
  switch (r.method) {
    case "chaos": return "外れはカオスで打ち直し";
    case "exalt": return `外れは ${r.plainAnnul ? "消去のオーブ" : `${omen(OMEN.annul[r.side])} + 消去のオーブ`}${r.safe ? " (狙い以外は消えない)" : " (ほかの MOD を巻き込む)"}`;
    case "desecrate": return `外れは ${r.reroll === "overwrite" ? `${omen(OMEN.crystallisation[r.side])} + エッセンスで上書き` : `${omen("OmenofLight")} + 消去のオーブ`}`;
    default: return "";
  }
};
/**
 * 守る価値 = その狙いの作り直し費用 (見込み)。側の消去のお告げ 1 回より高ければ「守る」(オーナー 2026-09-25:「反対側に本当に
 * 守りたい物があるのかというポイント制。T5 なら守りたい物に入らないし、カオスで付くような物もお告げは要らない」)
 */
const omenPrice = (side: Side): number => (c.prices.value?.omens[OMEN.annul[side]] ?? Infinity);
const guardJa = (r: RedoPlan["rows"][number]): string => (r.expected > omenPrice(r.side) ? "守る" : "守らなくていい");
const pctHit = (p: number): string => (p >= 1 ? "確定" : `${(p * 100).toFixed(p < 0.01 ? 2 : 1)}%`);
</script>

<template>
    <details class="mb-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs" open>
      <summary class="cursor-pointer select-none">
        <b>取り方</b> <span class="opacity-60">見込み {{ t.baseEx.value > 0 || socketEx > 0 ? `初動 ${c.money(t.baseEx.value)}${socketEx > 0 ? ` + ソケット ${c.money(socketEx)}` : ""} + クラフト ${c.money(plan.total)} = ` : "" }}<b class="opacity-100">{{ c.money(plan.total + t.baseEx.value + socketEx) }}</b></span>
        <template v-if="picked"><span class="opacity-60"> ・ 採用「{{ picked.label }}」</span><template v-if="picked.expected != null"><span class="opacity-60">、平均 </span>{{ c.money(picked.expected) }}<span v-if="picked.done != null && picked.done < 0.9" class="text-rose-300"> (完成 {{ (picked.done * 100).toFixed(0) }}% しか無い)</span></template></template>
      </summary>
      <!-- 狙いごとの行 (オーナー 2026-09-26:「境目が分かりづらくてブス」→ 縞の行 + 数字は見出し付きの小さな枠) -->
      <div class="mt-2 overflow-hidden rounded-lg border border-white/[0.08]">
        <div v-for="(r, i) in planRows" :key="r.modId" class="grid grid-cols-[minmax(13rem,1fr)_minmax(18rem,1.6fr)_auto] items-center gap-x-4 px-3 py-2" :class="i % 2 ? 'bg-white/[0.03]' : 'bg-black/20'">
          <!-- 狙い -->
          <div class="flex items-center gap-2">
            <span class="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold" :class="r.side === 'prefix' ? 'bg-sky-500/20 text-sky-200' : 'bg-fuchsia-500/20 text-fuchsia-200'">{{ r.side === "prefix" ? "プレ" : "サフィ" }}</span>
            <b>{{ c.stepTarget([r.modId]) }}</b>
          </div>
          <!-- 取り方 -->
          <div class="min-w-0">
            <p class="text-amber-100">{{ howJa(r) }}</p>
            <p class="opacity-60">{{ missJa(r) }}</p>
          </div>
          <!-- 数字 -->
          <div class="flex items-center gap-1.5 tabular-nums">
            <div class="w-[4.6rem] rounded bg-black/30 px-2 py-1 text-right"><p class="text-[10px] opacity-50">1 回</p><p>{{ c.money(r.perTry) }}</p></div>
            <div class="w-[4.6rem] rounded bg-black/30 px-2 py-1 text-right"><p class="text-[10px] opacity-50">当たる</p><p class="text-emerald-300">{{ pctHit(r.p) }}</p></div>
            <div class="w-[5.4rem] rounded bg-black/30 px-2 py-1 text-right"><p class="text-[10px] opacity-50">外れのやり直し</p><p :class="r.safe ? '' : 'text-amber-300'">{{ r.perMiss > 0 ? c.money(r.perMiss) : "-" }}</p></div>
            <div class="w-[5.4rem] rounded bg-amber-500/10 px-2 py-1 text-right"><p class="text-[10px] opacity-50">見込み</p><p class="font-bold text-amber-200">{{ c.money(r.expected) }}</p></div>
            <span class="w-[5.2rem] text-center text-[11px]" :class="r.expected > omenPrice(r.side) ? 'text-amber-200' : 'opacity-40'">{{ guardJa(r) }}</span>
          </div>
        </div>
      </div>
      <details class="mt-1 opacity-60"><summary class="cursor-pointer">決まり</summary><ul class="list-disc pl-4"><li v-for="x in RULES" :key="x">{{ x }}</li></ul></details>
    </details>
</template>
