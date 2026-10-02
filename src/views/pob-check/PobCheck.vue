<!--
  PobCheck.vue — 火力チェック (2026-10-02)

  同梱の PoB でビルドを読み込み、ジェムやパワーチャージを変えて計算し直し、前と比べる。
  数字はゲーム内の表記 (敵の耐性・呪い・露出を割り戻した値)。計算は PoB のまま (memory: pob-ui-remake-direction)。
  オーナー「pob新しいやつはUIシンプルかつわかりやすく、色付きで今風で表示してくれ」
-->
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { openPob, savedBuilds, type SavedBuild } from "../../services/pob-check/api";
import DiffBadge from "./DiffBadge.vue";
import SkillTable from "./SkillTable.vue";
import GemGroupCard from "./GemGroupCard.vue";
import ItemSlotCard from "./ItemSlotCard.vue";
import TreeView from "./TreeView.vue";
import { fmtNum } from "./fmt";
import { usePobCheck } from "./usePobCheck";

const { loadedFrom, shareCode, changes, clickNode, resetTreeToLoaded, power, powerProgress, computePower, treeNodes, input, loading, busy, error, cur, base, baseAt, skills, baseSkills, total, baseTotal, groups, merged, load, setBaseToNow, changeGem, toggleGroup, changeCharges, changeItem, clearItem, restoreItem, changeWeaponSet } =
  usePobCheck();

const LOAD_MODES = [
  { id: "other", label: "人のビルド (コード / poe.ninja)" },
  { id: "mine", label: "自分のキャラ (PoB でログイン)" },
] as const;
const loadMode = ref<(typeof LOAD_MODES)[number]["id"]>("other");
const saved = ref<SavedBuild[]>([]);
const savedMsg = ref("");
async function refreshSaved(): Promise<void> {
  try {
    saved.value = await savedBuilds();
    savedMsg.value = saved.value.length ? `${saved.value.length} 件` : "保存したビルドがまだありません";
  } catch (e) {
    savedMsg.value = String(e);
  }
}
async function openPobApp(): Promise<void> {
  savedMsg.value = "PoB を開いています…";
  try {
    await openPob();
    savedMsg.value = "取り込んで保存したら「一覧を更新」";
  } catch (e) {
    savedMsg.value = String(e);
  }
}
watch(loadMode, (m) => {
  if (m === "mine") void refreshSaved();
});
const fmtDate = (sec: number): string => (sec ? new Date(sec * 1000).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

/** 共有: 今のビルドの PoB コードをコピー */
const shareMsg = ref("");
async function onShare(): Promise<void> {
  try {
    await shareCode();
    shareMsg.value = changes.value.length ? "変えた所も込みでコピーしました" : "コピーしました";
  } catch (e) {
    shareMsg.value = `できませんでした: ${e instanceof Error ? e.message : String(e)}`;
  }
  setTimeout(() => (shareMsg.value = ""), 4000);
}

const TABS = [
  { id: "items", label: "装備" },
  { id: "gems", label: "ジェム" },
  { id: "tree", label: "パッシブツリー" },
] as const;
const tab = ref<(typeof TABS)[number]["id"]>("items");

const STEPS = [
  { title: "読み込む", cls: "text-amber-200", body: "PoB の「Import/Export」のコードか、poe.ninja のキャラのページの URL を上に貼って「読み込む」。" },
  { title: "変える", cls: "text-sky-200", body: "装備はゲームで Ctrl+C したアイテムを貼る (日本語のまま)。ジェムはレベルや品質を ±、ツリーはノードをクリックで取る / 外す。" },
  { title: "比べる", cls: "text-emerald-200", body: "変えるたびに PoB で計算し直して、上のバーに合計の差、スキルの表に 1 つずつの差が出ます。良ければ「今を比べる元にする」で続けて比べる。" },
] as const;

const num = (k: string): number => {
  const v = cur.value?.stats[k];
  return typeof v === "number" ? v : 0;
};
const charges = computed(() => cur.value?.config.powerCharges ?? 0);
const chargesMax = computed(() => Math.max(num("PowerChargesMax"), 3));
const sameAsBase = computed(() => cur.value === base.value);

/** 差し替えの結果をカードに返す */
async function onPaste(slot: string, text: string, done: (r: { unread: string[]; notCalculated: string[] } | null, err?: string) => void): Promise<void> {
  try {
    done(await changeItem(slot, text));
  } catch (e) {
    done(null, e instanceof Error ? e.message : String(e));
  }
}

const statChips = computed(() => {
  if (!cur.value) return [];
  const list: Array<{ label: string; value: string; cls: string }> = [
    { label: "ライフ", value: fmtNum(num("Life")), cls: "text-rose-300" },
    { label: "マナ", value: fmtNum(num("Mana")), cls: "text-sky-300" },
  ];
  if (num("EnergyShield") > 0) list.push({ label: "ES", value: fmtNum(num("EnergyShield")), cls: "text-cyan-200" });
  if (num("Ward") > 0) list.push({ label: "ワード", value: fmtNum(num("Ward")), cls: "text-amber-200" });
  // 残りがマイナスになるビルドがある (PoB が武器セットの両方の予約を足す)。その時は合計だけ
  const left = num("SpiritUnreserved");
  list.push(
    left >= 0
      ? { label: "スピリット残り", value: `${Math.round(left)} / ${Math.round(num("Spirit"))}`, cls: "text-violet-200" }
      : { label: "スピリット", value: `${Math.round(num("Spirit"))}`, cls: "text-violet-200" },
  );
  return list;
});
const resists = computed(() =>
  cur.value
    ? [
        { label: "火", v: num("FireResist"), cls: "text-orange-300" },
        { label: "冷", v: num("ColdResist"), cls: "text-sky-300" },
        { label: "雷", v: num("LightningResist"), cls: "text-yellow-200" },
        { label: "混", v: num("ChaosResist"), cls: "text-fuchsia-300" },
      ]
    : [],
);
</script>

<template>
  <div class="h-full overflow-auto p-4 @container">
    <!-- 見出しと読み込み -->
    <div class="mb-4">
      <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">火力チェック</h1>
      <p class="mt-1 text-xs text-[var(--exile-color-text-secondary)]">ビルドを読み込んで、装備・ジェム・ツリーを変えると読み込んだ時との差が出ます。</p>
      <!-- 読み込み方: 人のビルド / 自分のキャラ (PoB でログインして取り込んだ物) -->
      <div class="mt-3 flex gap-1">
        <button
          v-for="m in LOAD_MODES"
          :key="m.id"
          type="button"
          class="rounded-t-lg px-3 py-1.5 text-xs font-bold transition-colors"
          :class="loadMode === m.id ? 'bg-white/[0.07] text-amber-200' : 'text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-text-secondary)]'"
          @click="loadMode = m.id"
        >{{ m.label }}</button>
      </div>
      <div class="rounded-b-lg rounded-tr-lg bg-white/[0.04] p-3">
        <form v-if="loadMode === 'other'" class="flex gap-2" @submit.prevent="load()">
          <input
            v-model="input"
            type="text"
            placeholder="PoB コード / https://poe.ninja/poe2/builds/... のキャラの URL"
            class="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-[var(--exile-color-accent-focus)]"
          />
          <button
            type="submit"
            class="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-2 text-sm font-bold text-black shadow disabled:opacity-40"
            :disabled="loading || !input.trim()"
          >{{ loading ? "読み込み中…" : "読み込む" }}</button>
        </form>
        <div v-else>
          <p class="text-[12px] leading-relaxed text-[var(--exile-color-text-secondary)]">
            自分のキャラは PoB と同じやり方で: <b>同梱の PoB を開く</b> → 「Import/Export Build」→ ログインしてキャラを取り込む → 保存 (Ctrl+S)。保存したビルドがここに並びます。
          </p>
          <div class="mt-2 flex items-center gap-2">
            <button type="button" class="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-amber-400" @click="openPobApp">同梱の PoB を開く</button>
            <button type="button" class="rounded-lg bg-white/[0.07] px-3 py-1.5 text-xs font-semibold hover:bg-white/15" @click="refreshSaved">一覧を更新</button>
            <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ savedMsg }}</span>
          </div>
          <ul v-if="saved.length" class="mt-2 max-h-56 space-y-1 overflow-auto">
            <li v-for="b in saved" :key="b.path">
              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-lg bg-black/25 px-3 py-1.5 text-left hover:bg-white/10 disabled:opacity-40"
                :disabled="loading"
                @click="load({ path: b.path, name: b.name })"
              >
                <span class="min-w-0 flex-1 truncate text-[13px] font-semibold">{{ b.name }}</span>
                <span class="text-[11px] text-[var(--exile-color-text-secondary)]">{{ b.ascendancy || b.class_name }} Lv {{ b.level }}</span>
                <span class="w-28 text-right text-[11px] tabular-nums text-[var(--exile-color-text-tertiary)]">{{ fmtDate(b.modified) }}</span>
              </button>
            </li>
          </ul>
        </div>
      </div>
      <p v-if="error" class="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{{ error }}</p>
    </div>

    <!-- まだ読み込んでいない時の案内 -->
    <div v-if="!cur && !loading" class="mt-6 grid gap-3 @3xl:grid-cols-3">
      <div v-for="(st, i) in STEPS" :key="i" class="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-5">
        <p class="flex items-center gap-2 text-sm font-bold" :class="st.cls">
          <span class="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs">{{ i + 1 }}</span>{{ st.title }}
        </p>
        <p class="mt-2 text-[12px] leading-relaxed text-[var(--exile-color-text-secondary)]">{{ st.body }}</p>
      </div>
    </div>
    <div v-if="loading" class="mt-10 flex items-center justify-center gap-2 text-sm text-amber-200/80">
      <span class="h-2.5 w-2.5 animate-ping rounded-full bg-amber-300" />PoB で読み込んで計算しています (数秒)
    </div>

    <template v-if="cur">
      <!-- キャラ -->
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <span class="rounded-lg bg-white/[0.06] px-3 py-1.5 text-sm font-semibold">
          {{ cur.char.ascendancy || cur.char.class }} <span class="ml-1 text-[var(--exile-color-text-tertiary)]">Lv {{ cur.char.level }}</span>
        </span>
        <span v-for="c in statChips" :key="c.label" class="rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs">
          <span class="text-[var(--exile-color-text-tertiary)]">{{ c.label }}</span>
          <span class="ml-1.5 font-semibold tabular-nums" :class="c.cls">{{ c.value }}</span>
        </span>
        <span class="rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs">
          <span class="text-[var(--exile-color-text-tertiary)]">耐性</span>
          <span v-for="r in resists" :key="r.label" class="ml-1.5 font-semibold tabular-nums" :class="r.cls">{{ r.label }}{{ Math.round(r.v) }}</span>
        </span>
        <span v-if="loadedFrom" class="text-[11px] text-[var(--exile-color-text-tertiary)]">{{ loadedFrom }} から</span>
        <span v-if="cur.stats.LowLife" class="rounded-lg bg-rose-500/20 px-2.5 py-1.5 text-xs font-semibold text-rose-200">低ライフ</span>
      </div>

      <!-- 合計・変えた所・操作 (スクロールしても上に残す。変えたらすぐ差が見えるように) -->
      <div class="sticky -top-4 z-20 -mx-4 mb-4 border-b border-amber-400/20 bg-[#0b0907]/90 px-4 pb-3 pt-4 backdrop-blur">
        <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div>
            <p class="text-[10px] text-amber-100/60">スキルの DPS の合計 (ゲーム内の表記)</p>
            <div class="flex items-baseline gap-2">
              <span class="text-3xl font-black leading-none tabular-nums text-amber-200">{{ fmtNum(total) }}</span>
              <DiffBadge :now="total" :before="baseTotal" size="lg" />
              <span v-if="busy" class="flex items-center gap-1 text-[11px] text-amber-200/80"><span class="h-2 w-2 animate-ping rounded-full bg-amber-300" />計算中</span>
            </div>
          </div>
          <!-- 変えた所 -->
          <div class="min-w-0 flex-1">
            <p class="text-[10px] text-[var(--exile-color-text-tertiary)]">
              比べる元: {{ baseAt }}<template v-if="!sameAsBase"> ({{ fmtNum(baseTotal) }})</template>
            </p>
            <div v-if="changes.length" class="mt-0.5 flex flex-wrap gap-1">
              <span v-for="(c, i) in changes.slice(-6)" :key="i" class="rounded-full bg-sky-500/15 px-2 py-px text-[11px] text-sky-200">{{ c }}</span>
              <span v-if="changes.length > 6" class="px-1 text-[11px] text-[var(--exile-color-text-tertiary)]">ほか {{ changes.length - 6 }} 件</span>
            </div>
            <p v-else class="mt-0.5 text-[11px] text-[var(--exile-color-text-tertiary)]">下の 装備 / ジェム / パッシブツリー で変えると、ここに変えた所と差が出ます</p>
          </div>
          <div class="flex items-center gap-3">
            <div>
              <p class="text-[10px] text-[var(--exile-color-text-tertiary)]">パワーチャージ</p>
              <div class="flex gap-0.5">
                <button
                  v-for="n in chargesMax + 1"
                  :key="n"
                  type="button"
                  class="h-6 w-6 rounded text-[11px] font-semibold tabular-nums transition-colors"
                  :class="n - 1 === charges ? 'bg-sky-500 text-white' : 'bg-white/5 text-[var(--exile-color-text-secondary)] hover:bg-white/15'"
                  :disabled="busy"
                  @click="changeCharges(n - 1)"
                >{{ n - 1 }}</button>
              </div>
            </div>
            <button
              type="button"
              class="self-end rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/10 disabled:opacity-30"
              :disabled="sameAsBase"
              title="今の状態を比べる元にして、ここからの差を見る"
              @click="setBaseToNow"
            >今を比べる元にする</button>
            <div class="relative self-end">
              <button
                type="button"
                class="rounded-lg bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-500/30"
                title="今のビルド (変えた所も込み) を PoB のコードにしてコピー。PoB や poe.ninja 以外の人にも渡せる"
                @click="onShare"
              >共有 (PoB コード)</button>
              <span v-if="shareMsg" class="absolute right-0 top-full mt-1 whitespace-nowrap rounded bg-black/80 px-2 py-0.5 text-[11px] text-sky-200">{{ shareMsg }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- スキル -->
      <div class="mb-6">
        <SkillTable :rows="skills" :before="baseSkills" :total="total" />
      </div>

      <!-- 変える所 (装備 / ジェム / ツリー) -->
      <div class="mb-3 flex gap-1 border-b border-white/10">
        <button
          v-for="t in TABS"
          :key="t.id"
          type="button"
          class="-mb-px border-b-2 px-4 py-2 text-sm font-bold transition-colors"
          :class="tab === t.id ? 'border-amber-400 text-amber-200' : 'border-transparent text-[var(--exile-color-text-tertiary)] hover:text-[var(--exile-color-text-secondary)]'"
          @click="tab = t.id"
        >{{ t.label }}</button>
      </div>

      <!-- 装備 -->
      <div v-show="tab === 'items'">
      <p class="mb-2 text-xs text-[var(--exile-color-text-tertiary)]">
        ゲームで Ctrl+C したアイテムを貼ると入れ替えて計算し直します (日本語のままで OK)
        <span class="ml-3 inline-flex overflow-hidden rounded-md border border-white/10 align-middle text-[11px] font-semibold">
          <button
            v-for="n in [1, 2] as const"
            :key="n"
            type="button"
            class="px-2.5 py-0.5"
            :class="cur.weaponSet === n ? 'bg-sky-500 text-white' : 'text-[var(--exile-color-text-secondary)] hover:bg-white/10'"
            :disabled="busy"
            @click="changeWeaponSet(n)"
          >武器セット {{ n === 1 ? "I" : "II" }}</button>
        </span>
      </p>
      <div class="mb-6 grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3 @[100rem]:grid-cols-4">
        <ItemSlotCard
          v-for="s in cur.items"
          :key="s.slot"
          :entry="s"
          :active-set="cur.weaponSet"
          :disabled="busy"
          @paste="(text, done) => onPaste(s.slot, text, done)"
          @clear="clearItem(s.slot)"
          @restore="restoreItem(s.slot)"
        />
      </div>
      </div>

      <!-- ジェム -->
      <div v-show="tab === 'gems'">
      <p class="mb-2 text-xs text-[var(--exile-color-text-tertiary)]">
        変えるとすぐ計算し直します<template v-if="merged > 0"> ・ 同じ中身の組 {{ merged }} 個はまとめました</template>
      </p>
      <div class="mb-6 grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
        <GemGroupCard
          v-for="g in groups"
          :key="g.i"
          :group="g"
          :disabled="busy"
          @gem="(j, field, value) => changeGem(g.i, j, field, value)"
          @group="(en) => toggleGroup(g.i, en)"
        />
      </div>
      </div>

      <!-- ツリー -->
      <div v-if="tab === 'tree'" class="mb-6">
        <TreeView
          :nodes="treeNodes"
          :state="cur.tree"
          :base-alloc="base && base !== cur ? base.tree.alloc : undefined"
          :power="power ? { label: power.label, nodes: power.nodes, stale: power.of !== cur } : null"
          :power-progress="powerProgress"
          :skill-options="skills.map((x) => ({ key: x.key, name: x.s.name }))"
          :busy="busy"
          @power="computePower"
          @toggle="async (id, attr, done) => done(await clickNode(id, attr).catch((e) => String(e)))"
          @reset="resetTreeToLoaded"
        />
      </div>

      <p class="text-[11px] leading-relaxed text-[var(--exile-color-text-tertiary)]">
        数字はゲームのスキルの詳細と同じ書き方です (敵の耐性・呪い・露出は入れない)。常時のバフは入っています。
        「自動で発動」のスキルは、PoB が発動の頻度を計算しないので自分で撃った時の数字です。計算は同梱の PoB のままです。
      </p>
    </template>
  </div>
</template>
