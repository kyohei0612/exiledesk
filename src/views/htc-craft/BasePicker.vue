<script setup lang="ts">
/**
 * BasePicker.vue — 「ベースから選ぶ」の入口 (2026-09-26 作り直し)
 *
 * オーナー:「ベースのコピペが無い場合、UI UX 死ぬほど見づらいから、同じようにシンプルかつ使いやすい形で」。
 * 貼り付けの流れと同じく上から順に: ① ベース (種類で絞れるカード) → ② 狙う MOD (プレ / サフィの 2 列、枠の数つき)
 * → ③ 作り方の設定 → 計算。右に完成図 (アイテムの絵) を出し、選んだ物がその場で絵に並ぶ。
 * 中身の状態は [[usePicker.ts]]、計算は親 (HtcCraftLab.runPicked)
 */
import { ESSENCE_KIND } from "../../services/mods/essence-kind";
import { computed, ref } from "vue";
import ItemCard from "./ItemCard.vue";
import BaseCatalog from "../../components/items/BaseCatalog.vue";
import { classJa } from "../../services/items/base-catalog";
import { baseArt } from "../../services/craft-stage/base-art";
import SocketPicker from "./SocketPicker.vue";
import ModPickColumn from "./ModPickColumn.vue";
import { ASSUMED_RUNE_WEIGHT_NOTE, effectiveSocket, requiredRunes, socketBlock, socketEffects, socketLabel, specialKeyOf, withRequired, withSocketLimits } from "../../services/htc/sockets";
import { zeroStart } from "./craft-settings";
import { CATALYSTS } from "../../services/htc/quality";
import { sideLimits } from "../../services/htc/bridge";
import { qualityLabelOf, type CardMod } from "./item-card-data";
import { fillHashes } from "../../services/htc/mod-text";
import type { ZeroPreset } from "./presets";
import inherentSkills from "../../i18n/inherent-skills.json";
import type { usePicker, ModRow, ModGroup } from "./usePicker";
import type { useHtcCraft } from "./useHtcCraft";

const props = defineProps<{
  c: ReturnType<typeof useHtcCraft>;
  pk: ReturnType<typeof usePicker>;
  presets: readonly ZeroPreset[];
  presetPicked: string | null;
}>();
const emit = defineEmits<{ (e: "preset", id: string): void; (e: "run"): void }>();
const pk = props.pk;

const clsJa = (x: string): string => classJa(x, false);
const chosen = computed(() => pk.allBases.value.find((b) => b.en === pk.baseName.value) ?? null);
function choose(en: string): void {
  const d = props.c.data.value;
  if (d) pk.chooseBase(d, en);
  zeroStart.value = { ...zeroStart.value, grantedSkill: null };
}
/**
 * そのベースの付与スキルの候補 (不在 / 嘆き / 前兆のアミュレットなど、候補から 1 つ付く物だけ)。取引所では付与スキルで別物になるので
 * 選んでから探す (オーナー 2026-09-27「つけるもの選べるようにしないと検索で出ないぞ」)
 */
const SKILLS = inherentSkills as Record<string, Array<{ en: string; ja: string }>>;
const skillsOf = (en: string | null | undefined) => (en ? (SKILLS[en] ?? []) : []);
const skillOptions = computed(() => skillsOf(chosen.value?.en));
const pickSkill = (en: string | null): void => void (zeroStart.value = { ...zeroStart.value, grantedSkill: en });
/** よく使う ilvl */
const ILVLS = [75, 79, 82, 84, 86];

/** 狙いの特別な MOD (コルの狩りのマークスマン等) が要るルーン。差したまま作るので ③ のトグルも入って外せない (2026-10-03) */
const required = computed(() => requiredRunes(props.c.data.value, pk.picks.value.map((p) => p.modId)));
/** ソケットに差す物 (③ で選ぶ + 狙いが要るルーン。種類で差せない物は落とす) */
const sockOn = computed(() => effectiveSocket(chosen.value?.cls, false, withRequired(props.c.socket.value, required.value)));
/** 特別な MOD を入れると要るルーンが差せない (穴が足りない 等) なら、その理由。入れた物・ルーンが既に入っている物は押せる */
function runeBlock(m: ModRow): string | null {
  const key = specialKeyOf(m.rune);
  if (!key || pk.isPicked(m.modId) || sockOn.value[key]) return null;
  const why = socketBlock(chosen.value?.cls, false, sockOn.value, key);
  return why ? `${m.runeJa ?? "ルーン"}を差せない: ${why}` : null;
}
/** 狙いに特別な MOD がある (出やすさが仮の値に乗る) */
const runePicked = computed(() => pk.picks.value.some((p) => pk.modRows.value.find((m) => m.modId === p.modId)?.group === "rune"));
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
  if (!pk.isPicked(m.modId) && (full(m.side) || runeBlock(m))) return;
  pk.toggle(m);
}
/** 種類の絞り込み (オーナー 2026-09-27「普通の MOD、エッセンス、冒涜、変質とか分けて」) */
const groupFilter = ref<ModGroup | "all">("all");
const GROUP_CHIPS: Array<{ k: ModGroup | "all"; ja: string; on: string }> = [
  { k: "all", ja: "すべて", on: "bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60" },
  { k: "normal", ja: "普通", on: "bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/60" },
  { k: "essence", ja: ESSENCE_KIND.perfect_essence.label, on: "bg-sky-500/25 text-sky-100 ring-1 ring-sky-400/60" },
  { k: "desecrated", ja: "冒涜", on: "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/60" },
  { k: "otherworldly", ja: "変質した鎖骨 (異界)", on: "bg-teal-500/25 text-teal-100 ring-1 ring-teal-400/60" },
  { k: "rune", ja: "オーグメント (特別な MOD)", on: "bg-orange-500/25 text-orange-100 ring-1 ring-orange-400/60" },
];
/** 種類ごとの数 (そのベースに無い種類のチップは出さない) */
const groupCount = (k: ModGroup | "all"): number => (k === "all" ? pk.modRows.value.length : pk.modRows.value.filter((m) => m.group === k).length);
/** 冒涜の MOD (異界の MOD も) をもう選んでいるか (冒涜の MOD は 1 つまで) */
const desecTaken = computed(() => pk.picks.value.some((p) => { const g = pk.modRows.value.find((m) => m.modId === p.modId)?.group; return g === "desecrated" || g === "otherworldly"; }));
/** 文面の # を段の幅で埋める (入れた物はその段、まだの物は一番上の段) */
function named(m: ModRow): string {
  const i = pk.tierOf(m.modId) ?? m.tiers.length - 1;
  // 表示の文字列を割らずに、画面の単位の幅そのもの (負の値・1 点の幅でも崩れない。2026-10-03)
  return fillHashes(m.ja, m.tiers[i]?.ranges ?? []);
}
/** 段の表示 (T1 が一番上) */
const tierLabel = (m: ModRow, i: number): string => `T${m.tiers.length - i} 以上 (${m.tiers[i]!.range})`;

/** 右の完成図 */
const cardMods = computed<CardMod[]>(() => pk.picks.value.map((p): CardMod => {
  const m = pk.modRows.value.find((x) => x.modId === p.modId);
  return { key: p.modId, side: m?.side ?? null, text: m ? named(m) : p.modId, head: m ? `${m.side === "P" ? "プレフィックス" : "サフィックス"} ${tierLabel(m, p.tierIndex)}` : undefined, tone: m?.crafted ? "crafted" : m?.group === "desecrated" || m?.group === "otherworldly" ? "desecrated" : "normal" };
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
            <img v-if="baseArt(chosen.en)" :src="baseArt(chosen.en)!" alt="" class="ml-2 h-8 w-8 object-contain" draggable="false" />
            <span class="ml-1 text-amber-100">{{ chosen.ja }}</span><span class="opacity-50">({{ clsJa(chosen.cls) }})</span>
            <button type="button" class="ml-auto rounded-lg border border-white/20 px-2 py-0.5 hover:bg-white/5" @click="pk.baseName.value = null">変える</button>
          </template>
        </div>
        <!-- アイテムレベル (段の上限が決まるので先に) -->
        <div class="mb-2 flex flex-wrap items-center gap-1.5">
          <span class="opacity-60">アイテムレベル</span>
          <button v-for="lv in ILVLS" :key="lv" type="button" class="rounded-lg px-2 py-0.5" :class="pk.level.value === lv ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60' : 'border border-white/15 hover:bg-white/5'" @click="pk.level.value = lv">{{ lv }}</button>
          <input v-model.number="pk.level.value" type="number" min="1" max="100" class="w-14 rounded border border-white/15 bg-black/30 px-1 py-0.5" />
          <span class="opacity-40">(出るティアの上限が決まる)</span>
          <span class="ml-auto flex flex-wrap items-center gap-1.5">
            <span class="opacity-50">見本:</span>
            <button v-for="z in presets" :key="z.id" type="button" class="rounded-lg border px-2 py-0.5" :class="presetPicked === z.id ? 'border-amber-400 text-amber-300' : 'border-white/15 opacity-70 hover:opacity-100'" @click="emit('preset', z.id)">{{ z.label }}</button>
          </span>
        </div>
        <!-- 付与スキル (候補から 1 つ付くベースだけ)。選ばないと付与スキル違いも混ざる -->
        <div v-if="chosen && skillOptions.length" class="mb-2 rounded-lg p-2" :class="zeroStart.grantedSkill ? 'bg-black/20' : 'bg-amber-500/10 ring-1 ring-amber-400/40'">
          <p class="mb-1 flex items-center gap-2">
            <b class="text-amber-100">付与スキル</b>
            <span class="opacity-60">このベースは {{ skillOptions.length }} 種から 1 つ付く。取引所の検索に入れる</span>
            <span v-if="!zeroStart.grantedSkill" class="text-amber-200">選ばないと付与スキル違いの物も混ざります</span>
          </p>
          <div class="flex flex-wrap gap-1">
            <button type="button" class="rounded-full px-2 py-0.5" :class="!zeroStart.grantedSkill ? 'bg-white/15 text-white' : 'bg-white/5 opacity-60 hover:opacity-100'" @click="pickSkill(null)">問わない</button>
            <button v-for="k in skillOptions" :key="k.en" type="button" class="rounded-full px-2 py-0.5" :class="zeroStart.grantedSkill === k.en ? 'bg-sky-500/25 text-sky-100 ring-1 ring-sky-400/60' : 'bg-white/5 hover:bg-white/10'" :title="k.en" @click="pickSkill(k.en)">{{ k.ja }}</button>
          </div>
        </div>
        <!-- ベースの一覧 (クラフトステージと同じ共通の部品: poe2db の段・ゲーム内の絵・素の数値。2026-09-29) -->
        <BaseCatalog v-if="!chosen" :data="c.data.value" :selected="pk.baseName.value" :note="(en) => (skillsOf(en).length ? `付与スキル ${skillsOf(en).length} 種から 1 つ` : '')" height="26rem" @pick="choose" />
      </section>

      <!-- ② 狙う MOD -->
      <section v-if="chosen" class="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div class="mb-2 flex items-center gap-2">
          <span class="rounded-full bg-amber-500/80 px-2 py-0.5 text-[11px] font-bold text-black">2</span>
          <b class="text-sm">狙う MOD を選ぶ</b>
          <span class="opacity-50">押すと入る / 外れる。ティアは入れた後に選べる</span>
          <input v-model="pk.modQuery.value" placeholder="MOD を探す (ライフ / 耐性 …)" class="ml-auto w-56 rounded-lg border border-white/15 bg-black/30 px-2 py-1" />
        </div>
        <!-- 種類で絞る -->
        <div class="mb-2 flex flex-wrap items-center gap-1.5">
          <template v-for="g in GROUP_CHIPS" :key="g.k">
            <button v-if="groupCount(g.k)" type="button" class="rounded-full px-2.5 py-0.5" :class="groupFilter === g.k ? g.on : 'bg-white/5 hover:bg-white/10'" @click="groupFilter = g.k">
              {{ g.ja }} <span class="opacity-50">{{ groupCount(g.k) }}</span>
            </button>
          </template>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <ModPickColumn
            v-for="col in columns"
            :key="col.side"
            :title="col.title"
            :rows="col.rows"
            :filter="groupFilter"
            :count="pickedCount(col.side)"
            :limit="limits[col.side]"
            :desec-taken="desecTaken"
            :pk="pk"
            :named="named"
            :tier-label="tierLabel"
            :block-of="runeBlock"
            @toggle="toggle"
          />
        </div>
        <p v-if="runePicked" class="mt-2 rounded-lg bg-orange-500/10 px-2 py-1 text-[11px] text-orange-100/90 ring-1 ring-orange-400/30">{{ ASSUMED_RUNE_WEIGHT_NOTE }}</p>
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
          <SocketPicker :c="c" :category="chosen.cls" :required="required" class="basis-full" />
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
      <ItemCard v-if="chosen" :art="baseArt(chosen.en)" :base="chosen.ja" :ilvl="pk.level.value" :quality="zeroStart.quality" :quality-label="qualityLabelOf(zeroStart.qualityTag)" :implicits="chosen.implicits" :mods="cardMods" :socket="socketLabel(sockOn)" :socket-effects="socketEffects(sockOn)" detail />
      <div v-else class="rounded-xl border border-dashed border-white/15 p-6 text-center opacity-50">ベースを選ぶとここに出ます</div>
    </aside>
  </div>
</template>
