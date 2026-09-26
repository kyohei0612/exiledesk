<script setup lang="ts">
/**
 * BasePicker.vue — 「ベースから選ぶ」の入口 (2026-09-26 作り直し)
 *
 * オーナー:「ベースのコピペが無い場合、UI UX 死ぬほど見づらいから、同じようにシンプルかつ使いやすい形で」。
 * 貼り付けの流れと同じく上から順に: ① ベース (種類で絞れるカード) → ② 狙う MOD (プレ / サフィの 2 列、枠の数つき)
 * → ③ 作り方の設定 → 計算。右に完成図 (アイテムの絵) を出し、選んだ物がその場で絵に並ぶ。
 * 中身の状態は [[usePicker.ts]]、計算は親 (HtcCraftLab.runPicked)
 */
import { computed, ref } from "vue";
import ItemCard from "./ItemCard.vue";
import SocketPicker from "./SocketPicker.vue";
import { effectiveSocket, socketEffects, socketLabel, withSocketLimits } from "../../services/htc/sockets";
import { zeroStart } from "./craft-settings";
import { CATALYSTS } from "../../services/htc/quality";
import { sideLimits } from "../../services/htc/bridge";
import { qualityLabelOf, type CardMod } from "./item-card-data";
import { fillHashes } from "../../services/htc/mod-text";
import type { ZeroPreset } from "./presets";
import type { usePicker, ModRow } from "./usePicker";
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{
  c: ReturnType<typeof useHtcCraft>;
  pk: ReturnType<typeof usePicker>;
  presets: readonly ZeroPreset[];
  presetPicked: string | null;
}>();
const emit = defineEmits<{ (e: "preset", id: string): void; (e: "run"): void }>();
const pk = props.pk;

/** 種類の日本語 (ゲームのアイテムクラス名) */
const CLS_JA: Record<string, string> = {
  Rings: "指輪", Amulets: "アミュレット", Belts: "ベルト", Helmets: "兜", Gloves: "手袋", Boots: "靴", Body_Armours: "鎧",
  Shields: "盾", Bucklers: "バックラー", Foci: "焦点具", Quivers: "矢筒", Talismans: "タリスマン", Wands: "ワンド",
  Sceptres: "セプター", Staves: "スタッフ", Quarterstaves: "クォータースタッフ", Bows: "弓", Crossbows: "クロスボウ",
  Spears: "槍", OneHand_Maces: "片手メイス", TwoHand_Maces: "両手メイス",
};
const clsJa = (x: string): string => CLS_JA[x] ?? x.replace(/_/g, " ");
/** 種類のチップ (よく作る物を先に) */
const CLS_ORDER = ["Rings", "Amulets", "Belts", "Helmets", "Gloves", "Boots", "Body_Armours", "Shields", "Bucklers", "Foci", "Quivers", "Talismans", "Wands", "Sceptres", "Staves", "Quarterstaves", "Bows", "Crossbows", "Spears", "OneHand_Maces", "TwoHand_Maces"];
const clsFilter = ref<string>("Rings");
/** ベースの一覧 (種類と検索で絞る) */
const bases = computed(() => {
  const q = pk.baseQuery.value.trim().toLowerCase();
  return pk.allBases.value.filter((b) => (q ? b.ja.toLowerCase().includes(q) || b.en.toLowerCase().includes(q) : b.cls === clsFilter.value)).slice(0, 60);
});
const chosen = computed(() => pk.allBases.value.find((b) => b.en === pk.baseName.value) ?? null);
function choose(en: string): void {
  const d = props.c.data.value;
  if (d) pk.chooseBase(d, en);
}
/** よく使う ilvl */
const ILVLS = [75, 79, 82, 84, 86];

/** ソケットに差す物 (③ で選ぶ。種類で差せない物は落とす) */
const sockOn = computed(() => effectiveSocket(chosen.value?.cls, false, props.c.socket.value));
/** 枠 (固定済みの樹 MOD が使う分を引く) */
const limits = computed(() => {
  const d = props.c.data.value;
  // セールの凱旋を差せばサフィは 1 つ多い (③ で選ぶ。2026-09-26)
  const lim = withSocketLimits(d && pk.baseName.value ? sideLimits(d, pk.baseName.value) : { prefix: 3, suffix: 3 }, sockOn.value);
  return { P: Math.max(0, lim.prefix - (zeroStart.value.fixedPrefix ?? 0)), S: Math.max(0, lim.suffix - (zeroStart.value.fixedSuffix ?? 0)) };
});
const pickedCount = (side: "P" | "S"): number => pk.picks.value.filter((p) => pk.modRows.value.find((m) => m.modId === p.modId)?.side === side).length;
const full = (side: "P" | "S"): boolean => pickedCount(side) >= limits.value[side];
const columns = computed(() => (["P", "S"] as const).map((side) => ({ side, title: side === "P" ? "プレフィックス" : "サフィックス", rows: pk.modRows.value.filter((m) => m.side === side) })));
function toggle(m: ModRow): void {
  if (!pk.isPicked(m.modId) && full(m.side)) return;
  pk.toggle(m);
}
/** 文面の # を段の幅で埋める (入れた物はその段、まだの物は一番上の段) */
function named(m: ModRow): string {
  const i = pk.tierOf(m.modId) ?? m.tiers.length - 1;
  const ranges = (m.tiers[i]?.range ?? "").split(" / ").filter(Boolean).map((r) => r.split("-") as [string, string]);
  return fillHashes(m.ja, ranges);
}
/** 段の表示 (T1 が一番上) */
const tierLabel = (m: ModRow, i: number): string => `T${m.tiers.length - i} 以上 (${m.tiers[i]!.range})`;

/** 右の完成図 */
const cardMods = computed<CardMod[]>(() => pk.picks.value.map((p): CardMod => {
  const m = pk.modRows.value.find((x) => x.modId === p.modId);
  return { key: p.modId, side: m?.side ?? null, text: m ? named(m) : p.modId, head: m ? `${m.side === "P" ? "プレフィックス" : "サフィックス"} ${tierLabel(m, p.tierIndex)}` : undefined, tone: m?.crafted ? "crafted" : "normal" };
}).sort((a, b) => (a.side === b.side ? 0 : a.side === "P" ? -1 : 1)));
const step = computed(() => (!pk.baseName.value ? 1 : pk.picks.value.length ? 3 : 2));
</script>

<template>
  <div class="mb-4 flex items-start gap-4 text-xs">
    <div class="min-w-0 flex-1 space-y-3">
      <!-- 道しるべ -->
      <ol class="flex items-center gap-1 text-[11px]">
        <li v-for="(s, i) in ['ベースを選ぶ', '狙う MOD を選ぶ', '作り方を決めて計算']" :key="s" class="flex items-center">
          <span class="flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold"
            :class="i + 1 < step ? 'bg-emerald-500/15 text-emerald-200' : i + 1 === step ? 'bg-amber-500/25 text-amber-50 ring-1 ring-amber-400/70' : 'bg-white/5 text-white/40'">
            <span class="grid h-4 w-4 place-items-center rounded-full text-[10px]" :class="i + 1 < step ? 'bg-emerald-400 text-black' : i + 1 === step ? 'bg-amber-400 text-black' : 'bg-white/10'">{{ i + 1 < step ? "✓" : i + 1 }}</span>{{ s }}
          </span>
          <span v-if="i < 2" class="mx-1 h-px w-3 bg-white/15" />
        </li>
      </ol>

      <!-- ① ベース -->
      <section class="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div class="mb-2 flex items-center gap-2">
          <span class="rounded-full bg-amber-500/80 px-2 py-0.5 text-[11px] font-bold text-black">1</span>
          <b class="text-sm">ベースを選ぶ</b>
          <template v-if="chosen">
            <span class="ml-2 text-amber-100">{{ chosen.ja }}</span><span class="opacity-50">({{ clsJa(chosen.cls) }})</span>
            <button type="button" class="ml-auto rounded-lg border border-white/20 px-2 py-0.5 hover:bg-white/5" @click="pk.baseName.value = null">変える</button>
          </template>
        </div>
        <!-- アイテムレベル (段の上限が決まるので先に) -->
        <div class="mb-2 flex flex-wrap items-center gap-1.5">
          <span class="opacity-60">アイテムレベル</span>
          <button v-for="lv in ILVLS" :key="lv" type="button" class="rounded-lg px-2 py-0.5" :class="pk.level.value === lv ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60' : 'border border-white/15 hover:bg-white/5'" @click="pk.level.value = lv">{{ lv }}</button>
          <input v-model.number="pk.level.value" type="number" min="1" max="100" class="w-14 rounded border border-white/15 bg-black/30 px-1 py-0.5" />
          <span class="opacity-40">(出る段の上限が決まる)</span>
          <span class="ml-auto flex flex-wrap items-center gap-1.5">
            <span class="opacity-50">見本:</span>
            <button v-for="z in presets" :key="z.id" type="button" class="rounded-lg border px-2 py-0.5" :class="presetPicked === z.id ? 'border-amber-400 text-amber-300' : 'border-white/15 opacity-70 hover:opacity-100'" @click="emit('preset', z.id)">{{ z.label }}</button>
          </span>
        </div>
        <template v-if="!chosen">
          <div class="mb-2 flex flex-wrap items-center gap-1">
            <button v-for="k in CLS_ORDER" :key="k" type="button" class="rounded-full px-2.5 py-0.5" :class="!pk.baseQuery.value && clsFilter === k ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60' : 'bg-white/5 hover:bg-white/10'" @click="clsFilter = k; pk.baseQuery.value = ''">{{ clsJa(k) }}</button>
            <input v-model="pk.baseQuery.value" placeholder="名前で探す (サファイア / Ring …)" class="ml-auto w-56 rounded-lg border border-white/15 bg-black/30 px-2 py-1" />
          </div>
          <div class="grid max-h-[26rem] grid-cols-3 gap-1.5 overflow-auto pr-1">
            <button v-for="b in bases" :key="b.en" type="button" class="rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-left hover:border-amber-400/60 hover:bg-amber-500/5" @click="choose(b.en)">
              <p class="font-bold text-amber-100">{{ b.ja }}</p>
              <p class="text-[10.5px] opacity-50">{{ clsJa(b.cls) }} ・ 必要レベル {{ b.lvl }}</p>
              <p v-if="b.implicits.length" class="text-[10.5px] text-[#8888ff]">{{ b.implicits.join(" / ") }}</p>
            </button>
            <p v-if="!bases.length" class="col-span-3 py-4 text-center opacity-50">見つかりません</p>
          </div>
        </template>
      </section>

      <!-- ② 狙う MOD -->
      <section v-if="chosen" class="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div class="mb-2 flex items-center gap-2">
          <span class="rounded-full bg-amber-500/80 px-2 py-0.5 text-[11px] font-bold text-black">2</span>
          <b class="text-sm">狙う MOD を選ぶ</b>
          <span class="opacity-50">押すと入る / 外れる。段は入れた後に選べる</span>
          <input v-model="pk.modQuery.value" placeholder="MOD を探す (ライフ / 耐性 …)" class="ml-auto w-56 rounded-lg border border-white/15 bg-black/30 px-2 py-1" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div v-for="col in columns" :key="col.side">
            <p class="mb-1 flex items-center gap-2 border-b border-white/10 pb-1 font-bold">
              {{ col.title }}
              <span class="rounded-full px-1.5 text-[10.5px] font-normal" :class="full(col.side) ? 'bg-amber-500/20 text-amber-200' : 'bg-white/5 opacity-70'">{{ pickedCount(col.side) }} / {{ limits[col.side] }} 枠</span>
            </p>
            <div class="max-h-[22rem] space-y-0.5 overflow-auto pr-1">
              <div v-for="m in col.rows" :key="m.modId" class="flex items-center gap-2 rounded-lg px-2 py-1"
                :class="pk.isPicked(m.modId) ? 'bg-amber-500/10 ring-1 ring-amber-400/40' : full(col.side) ? 'opacity-35' : 'cursor-pointer hover:bg-white/5'"
                @click="toggle(m)">
                <span class="grid h-3.5 w-3.5 shrink-0 place-items-center rounded border text-[9px]" :class="pk.isPicked(m.modId) ? 'border-amber-400 bg-amber-400 text-black' : 'border-white/30'">{{ pk.isPicked(m.modId) ? "✓" : "" }}</span>
                <span class="min-w-0 flex-1">{{ named(m) }}</span>
                <span v-if="m.crafted" class="shrink-0 rounded bg-sky-500/15 px-1 text-[10px] text-sky-200">エッセンスで確定</span>
                <select v-if="pk.isPicked(m.modId)" class="shrink-0 rounded border border-white/20 bg-black/40 px-1 py-0.5" :value="pk.tierOf(m.modId)"
                  @click.stop @change="pk.setTier(m.modId, Number(($event.target as HTMLSelectElement).value))">
                  <option v-for="(_t, i) in m.tiers" :key="i" :value="i">{{ tierLabel(m, i) }}</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ③ 作り方の設定と計算 -->
      <section v-if="chosen" class="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div class="mb-2 flex items-center gap-2">
          <span class="rounded-full bg-amber-500/80 px-2 py-0.5 text-[11px] font-bold text-black">3</span>
          <b class="text-sm">作り方を決めて計算</b>
        </div>
        <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span class="flex items-center gap-1.5">
            <span class="opacity-60">品質の上限</span>
            <button type="button" class="rounded-lg px-2 py-0.5" :class="zeroStart.quality === 20 ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60' : 'border border-white/15 hover:bg-white/5'" @click="zeroStart = { ...zeroStart, quality: 20 }">20% (カタリストだけ)</button>
            <button type="button" class="rounded-lg px-2 py-0.5" :class="zeroStart.quality === 40 ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60' : 'border border-white/15 hover:bg-white/5'" @click="zeroStart = { ...zeroStart, quality: 40 }">40% (ブリーチのエッセンス)</button>
          </span>
          <label class="flex items-center gap-1.5">
            <span class="opacity-60">最後に入れるカタリスト</span>
            <select v-model="zeroStart.qualityTag" class="rounded border border-white/20 bg-black/40 px-1 py-0.5">
              <option :value="null">入れない</option>
              <option v-for="k in CATALYSTS" :key="k.tag" :value="k.tag">{{ k.ja }}</option>
            </select>
          </label>
          <SocketPicker :c="c" :category="chosen.cls" class="basis-full" />
          <details class="opacity-80">
            <summary class="cursor-pointer opacity-70">樹 MOD (固定済みで買う物) がある時</summary>
            <span class="mt-1 flex items-center gap-2">
              使う枠: プレ <input v-model.number="zeroStart.fixedPrefix" type="number" min="0" max="3" class="w-10 rounded border border-white/15 bg-black/30 px-1" />
              サフィ <input v-model.number="zeroStart.fixedSuffix" type="number" min="0" max="3" class="w-10 rounded border border-white/15 bg-black/30 px-1" />
            </span>
          </details>
          <button type="button" class="ml-auto rounded-lg bg-amber-500 px-4 py-1.5 text-sm font-bold text-black shadow hover:bg-amber-400 disabled:opacity-40"
            :disabled="c.loading.value || !pk.picks.value.length" @click="emit('run')">
            {{ c.loading.value ? "計算中…" : pk.picks.value.length ? `この ${pk.picks.value.length} 個で計算する →` : "狙う MOD を選んでください" }}
          </button>
        </div>
      </section>
    </div>

    <!-- 右: 完成図 -->
    <aside class="sticky top-2 w-[22rem] shrink-0">
      <p class="mb-1.5 text-[11px] opacity-50">完成図 (選んだ物がここに並ぶ)</p>
      <ItemCard v-if="chosen" :base="chosen.ja" :ilvl="pk.level.value" :quality="zeroStart.quality" :quality-label="qualityLabelOf(zeroStart.qualityTag)" :implicits="chosen.implicits" :mods="cardMods" :socket="socketLabel(sockOn)" :socket-effects="socketEffects(sockOn)" detail />
      <div v-else class="rounded-xl border border-dashed border-white/15 p-6 text-center opacity-50">ベースを選ぶとここに出ます</div>
    </aside>
  </div>
</template>
