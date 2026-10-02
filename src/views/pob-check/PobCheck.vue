<!--
  PobCheck.vue — 火力チェック (2026-10-02)

  同梱の PoB でビルドを読み込み、ジェムやパワーチャージを変えて計算し直し、前と比べる。
  数字はゲーム内の表記 (敵の耐性・呪い・露出を割り戻した値)。計算は PoB のまま (memory: pob-ui-remake-direction)。
  オーナー「pob新しいやつはUIシンプルかつわかりやすく、色付きで今風で表示してくれ」
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import { gemJa, openPob } from "../../services/pob-check/api";
import DiffBadge from "./DiffBadge.vue";
import SkillTable from "./SkillTable.vue";
import GemGroupCard from "./GemGroupCard.vue";
import ItemSlotCard from "./ItemSlotCard.vue";
import TreeView from "./TreeView.vue";
import { fmtNum } from "./fmt";
import { usePobCheck, type PasteNote } from "./usePobCheck";

const { lastSource, canReload, reload, loadedFrom, shareCode, changes, clickNode, resetTreeToLoaded, power, powerProgress, computePower, treeNodes, loadSeq, input, loading, busy, error, cur, base, baseAt, skills, baseSkills, focus, focusBase, focusKey, groups, merged, load, setBaseToNow, changeGem, toggleGroup, changeCharges, changeItem, clearItem, restoreItem, changeWeaponSet } =
  usePobCheck();

/**
 * 自分のキャラ: PoB でログインして取り込み、Import/Export のコードを上の欄に貼る (2026-10-02 オーナー決定)。
 * アプリのログイン (POESESSID) では PoE2 の装備・パッシブは読めない (Web サイト側に口が無く、公式 API は OAuth の登録が要る)
 */
const pobMsg = ref("");
async function openPobApp(): Promise<void> {
  pobMsg.value = "PoB を開いています…";
  try {
    await openPob();
    pobMsg.value = "PoB で「Import/Export Build」→ ログインして取り込み → 「Generate」のコードをコピーして上の欄へ";
  } catch (e) {
    pobMsg.value = String(e);
  }
}

/** 共有: 今のビルドの PoB コードをコピー */
const shareMsg = ref("");
async function onShare(): Promise<void> {
  // 失敗の理由は usePobCheck が error (上の帯) に出す
  const code = await shareCode();
  shareMsg.value = code ? (changes.value.length ? "変えた所も込みでコピーしました" : "コピーしました") : "できませんでした";
  setTimeout(() => (shareMsg.value = ""), 4000);
}

const TABS = [
  { id: "items", label: "装備" },
  { id: "gems", label: "ジェム" },
  { id: "tree", label: "パッシブツリー" },
] as const;
const tab = ref<(typeof TABS)[number]["id"]>("items");

const STEPS = [
  { title: "読み込む", cls: "text-amber-200", body: "PoB の「Import/Export」のコードか、poe.ninja のキャラのページの URL を上に貼って「読み込む」。自分のキャラは同梱の PoB でログインして取り込み、そのコードを貼る。" },
  { title: "変える", cls: "text-sky-200", body: "装備はゲームで Ctrl+C したアイテムを貼る (日本語のまま)。ジェムはレベルや品質を ±、ツリーはノードをクリックで取る / 外す。" },
  { title: "比べる", cls: "text-emerald-200", body: "変えるたびに PoB で計算し直して、上のバーに合計の差、スキルの表に 1 つずつの差が出ます。良ければ「今を比べる元にする」で続けて比べる。" },
] as const;

const num = (k: string): number => {
  const v = cur.value?.stats[k];
  return typeof v === "number" ? v : 0;
};
/** 実効のパワーチャージ (PoB が使っている数。Min のあるビルドは 0 にしても Min 個が効く) */
const charges = computed(() => cur.value?.config.powerCharges ?? 0);
const chargesMax = computed(() => Math.max(num("PowerChargesMax"), 3));
const sameAsBase = computed(() => cur.value === base.value);
/** ツリーに渡す寄与 (毎レンダーで新しい物を作ると TreeView が描き直し続けるので computed) */
const treePower = computed(() => (power.value ? { label: power.value.label, nodes: power.value.nodes, stale: power.value.of !== cur.value } : null));
const treeSkillOptions = computed(() => skills.value.map((x) => ({ key: x.key, name: x.s.name + (x.s.game.minionName ? ` → ${x.s.game.minionName}` : "") })));

/** 差し替えの結果をカードに返す */
async function onPaste(slot: string, text: string, done: (r: PasteNote | null, err?: string) => void): Promise<void> {
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
      <!-- 読み込み: PoB コード (人のビルドも自分のキャラも) か poe.ninja の URL。自分のキャラは PoB でログインして取り込んだコードを貼る -->
      <form class="mt-3 flex gap-2" @submit.prevent="load()">
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
      <p class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--exile-color-text-tertiary)]">
        <span>自分のキャラは <b>同梱の PoB</b> でログインして取り込み、「Import/Export」のコードをここに貼る。</span>
        <button type="button" class="rounded bg-white/[0.07] px-2 py-0.5 text-[11px] font-semibold text-[var(--exile-color-text-secondary)] hover:bg-white/15" @click="openPobApp">同梱の PoB を開く</button>
        <span v-if="pobMsg" class="text-[var(--exile-color-text-secondary)]">{{ pobMsg }}</span>
      </p>
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
        <!-- PoB コードは同じ文字列を読み直すだけで最新は取れないので、poe.ninja と保存したビルドの時だけ -->
        <button
          v-if="lastSource && canReload"
          type="button"
          class="rounded-lg bg-white/[0.07] px-2.5 py-1 text-[11px] font-semibold hover:bg-white/15 disabled:opacity-40"
          :disabled="loading || busy"
          title="同じ所から最新を読み直し、今の状態を比べる元に残す (ゲームで装備を変えた後に、どれだけ変わったか)。poe.ninja はあちらの更新待ちで古いことがある"
          @click="reload"
        >{{ loading ? "読み込み中…" : "↻ 読み込み直す" }}</button>
        <span v-if="cur.stats.LowLife" class="rounded-lg bg-rose-500/20 px-2.5 py-1.5 text-xs font-semibold text-rose-200">低ライフ</span>
      </div>

      <!-- 合計・変えた所・操作 (スクロールしても上に残す。変えたらすぐ差が見えるように) -->
      <div class="sticky -top-4 z-20 -mx-4 mb-4 border-b border-amber-400/20 bg-[#0b0907]/90 px-4 pb-3 pt-4 backdrop-blur">
        <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div v-if="focus">
            <select
              :value="focus.key"
              class="max-w-[16rem] rounded border border-transparent bg-transparent text-[11px] text-amber-100/80 outline-none hover:border-white/15"
              title="上に出すスキルを選ぶ (初めは DPS が一番高いスキル)"
              @change="focusKey = ($event.target as HTMLSelectElement).value"
            >
              <option v-for="x in skills" :key="x.key" :value="x.key" class="bg-[#1c1812]">{{ gemJa(x.s.name) }}{{ x.s.game.minionName ? ` → ${x.s.game.minionName}` : "" }} の DPS</option>
            </select>
            <div class="flex items-baseline gap-2">
              <span class="text-3xl font-black leading-none tabular-nums text-amber-200">{{ fmtNum(focus.s.game.dps) }}</span>
              <DiffBadge :now="focus.s.game.dps" :before="focusBase?.game.dps" size="lg" />
              <span v-if="busy" class="flex items-center gap-1 text-[11px] text-amber-200/80"><span class="h-2 w-2 animate-ping rounded-full bg-amber-300" />計算中</span>
            </div>
          </div>
          <!-- 変えた所 -->
          <div class="min-w-0 flex-1">
            <p class="text-[10px] text-[var(--exile-color-text-tertiary)]">
              比べる元: {{ baseAt }}<template v-if="!sameAsBase && focusBase"> ({{ fmtNum(focusBase.game.dps) }})</template>
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
        <SkillTable :rows="skills" :before="baseSkills" :focus-key="focus?.key ?? null" @focus="(k) => (focusKey = k)" />
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
          :power="treePower"
          :power-progress="powerProgress"
          :skill-options="treeSkillOptions"
          :default-target="focus?.key ?? ''"
          :fit-key="loadSeq"
          :busy="busy"
          @power="computePower"
          @toggle="async (id, attr, done) => done(await clickNode(id, attr))"
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
