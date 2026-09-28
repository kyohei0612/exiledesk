<!--
  CraftStage.vue — クラフトステージ (2026-09-27、ADR-001 docs/decisions/001-craft-stage.md)

  オーナー:「動画映えするシミュレーター、配信用。実際に同じ挙動でカレンシーをクリックして押すと変化する」「クラフトステージでいこう」
  「操作は Craft of Exile 仕様 (カレンシーアイコンをクリックしてカーソルに持ち、アイテムをクリックで適用)」。
  4 つの枠: アイテム枠 ([[StageItemCard.vue]]) / カレンシー棚 ([[CurrencyShelf.vue]]) / 直前の変化 / 工程履歴 ([[StageHistory.vue]])。
  持っている間はカーソルにアイコンが付く。Esc / 右クリックで手放す。Ctrl+Z で 1 手戻す。
  再生モード: URL の ?stage-plan=<手順 JSON>&step=N で、その手まで進めた状態 (POE2Tube の撮影用)。
  状態と操作は [[craft-stage.ts]]、1 手の中身は services/craft-stage (計算機と同じ規則)。
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import StageItemCard from "./StageItemCard.vue";
import CurrencyShelf from "./CurrencyShelf.vue";
import StageHistory from "./StageHistory.vue";
import RevealPanel from "./RevealPanel.vue";
import { useStageFx } from "./use-stage-fx";
import VideoStage from "./VideoStage.vue";
import CurrencyPicker from "../../components/vaal-scales/CurrencyPicker.vue";
import { craftStage, iconOf, nameOf } from "../../state/craft-stage";
import { displayCurrency } from "../../state/display-currency";
import { htcBaseInfo } from "../../services/htc/patch";
import { FLASK_BASES, GEM_BASES } from "../../services/craft-stage/stage-bases";
import { jaTypeName } from "../../services/trade2/localize";
import pkg from "../../../package.json";

const s = craftStage;
onMounted(() => void s.init());

/** ベースの一覧 (種類ごと) */
const CLS_JA: Record<string, string> = {
  Rings: "指輪", Amulets: "アミュレット", Belts: "ベルト", Helmets: "兜", Gloves: "手袋", Boots: "靴", Body_Armours: "鎧", Shields: "盾",
  Bucklers: "バックラー", Foci: "焦点具", Quivers: "矢筒", Wands: "ワンド", Sceptres: "セプター", Staves: "スタッフ", Quarterstaves: "クォータースタッフ",
  Bows: "弓", Crossbows: "クロスボウ", Spears: "槍", OneHand_Maces: "片手メイス", TwoHand_Maces: "両手メイス", Talismans: "タリスマン",
};
const baseGroups = computed(() => {
  if (!s.data.value) return [];
  const by = new Map<string, Array<{ en: string; ja: string; lvl: number }>>();
  for (const [en, info] of Object.entries(htcBaseInfo())) {
    const list = by.get(info.cls) ?? [];
    list.push({ en, ja: info.ja, lvl: info.lvl });
    by.set(info.cls, list);
  }
  const groups = [...by.entries()].map(([cls, list]) => ({ cls, ja: CLS_JA[cls] ?? cls.replace(/_/g, " "), list: list.sort((a, b) => a.lvl - b.lvl) }));
  // 計算機に無いフラスコ・スキルジェム (要望 ⑧。品質のカレンシー・宝飾職人のオーブを見せるため)
  groups.push({ cls: "LifeFlask", ja: "ライフフラスコ", list: FLASK_BASES.filter((f) => f.cls === "LifeFlask").map((f) => ({ en: f.en, ja: jaTypeName(f.en), lvl: f.lvl })) });
  groups.push({ cls: "ManaFlask", ja: "マナフラスコ", list: FLASK_BASES.filter((f) => f.cls === "ManaFlask").map((f) => ({ en: f.en, ja: jaTypeName(f.en), lvl: f.lvl })) });
  groups.push({ cls: "SkillGem", ja: "スキルジェム", list: GEM_BASES.map((g) => ({ en: g.en, ja: g.ja, lvl: 1 })) });
  return groups;
});
const ILVLS = [45, 65, 75, 82, 86];

/** 持っているカレンシーのアイコンをカーソルに付ける */
const mouse = ref({ x: 0, y: 0 });
const onMove = (e: MouseEvent) => (mouse.value = { x: e.clientX, y: e.clientY });
function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape") s.hold(null);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); s.undo(); }
}
onMounted(() => { window.addEventListener("mousemove", onMove); window.addEventListener("keydown", onKey); });
onBeforeUnmount(() => { window.removeEventListener("mousemove", onMove); window.removeEventListener("keydown", onKey); s.hold(null); });
function hold(k: string): void {
  s.hold(s.held.value === k ? null : k);
}
/** 打った瞬間の演出 (波紋・枠の光・「レアに!」など) */
const fx = useStageFx(mouse);
const fxCls = computed(() => (fx.value ? { hit: "stage-hit", up: "stage-up", shake: "stage-shake" }[fx.value.kind] : ""));
/** 付いた / 消えた MOD を光らせ直すための番号 (手ごとに変わる) */
const flashKey = computed(() => s.log.value.length);

/** JSON をコピー (POE2Tube に渡す / CLI の --prices に使う) */
const copied = ref("");
async function copy(label: string, v: unknown): Promise<void> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(v, null, 2));
    copied.value = `${label}をコピーしました`;
  } catch {
    copied.value = "コピーできませんでした";
  }
  setTimeout(() => (copied.value = ""), 2500);
}
const btn = "rounded-lg border border-white/20 px-2 py-1 hover:bg-white/5 disabled:opacity-40";
</script>

<template>
  <div class="h-full overflow-auto p-4 @container" @contextmenu.prevent="s.hold(null)">
    <div class="mb-3 flex items-start justify-between gap-4">
      <div>
        <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">クラフトステージ</h1>
        <p class="mt-1 text-xs text-[var(--exile-color-text-secondary)]">カレンシー・骨・エッセンス・カタリストを押して持ち、アイテムを押すと 1 回使います (持ったまま連打できます)。お告げは掛けておくと次の関係する手で使われます。確率はクラフト計算機と同じ規則です。</p>
      </div>
      <CurrencyPicker />
    </div>

    <!-- 再生モード -->
    <div v-if="s.replay.value" class="mb-3 flex items-center gap-3 rounded-xl border border-sky-400/40 bg-sky-500/10 px-3 py-2 text-[12px]">
      <b class="text-sky-200">再生中</b>
      <span>{{ s.replay.value.plan.title ?? s.replay.value.plan.base }} · {{ s.log.value.length }} 手目まで (seed {{ s.replay.value.plan.seed }})</span>
      <button type="button" :class="btn" class="ml-auto" @click="s.video.value = { from: 0, autoplay: false, controls: true }">動画モード</button>
      <button type="button" :class="btn" @click="s.leaveReplay()">手で打つ</button>
    </div>

    <!-- 設定と操作 -->
    <section v-if="!s.replay.value" class="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px]">
      <label class="flex items-center gap-1.5">
        <span class="opacity-60">ベース</span>
        <select :value="s.base.value" class="num w-56 py-0.5" @change="s.base.value = ($event.target as HTMLSelectElement).value; s.reset()">
          <optgroup v-for="g in baseGroups" :key="g.cls" :label="g.ja">
            <option v-for="b in g.list" :key="b.en" :value="b.en">{{ b.ja }}</option>
          </optgroup>
        </select>
      </label>
      <span class="flex items-center gap-1">
        <span class="opacity-60">アイテムレベル</span>
        <button v-for="lv in ILVLS" :key="lv" type="button" class="rounded-lg px-2 py-0.5" :class="s.itemLevel.value === lv ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/60' : 'border border-white/15 hover:bg-white/5'" @click="s.itemLevel.value = lv; s.reset()">{{ lv }}</button>
      </span>
      <button type="button" :class="btn" @click="s.reset()">白に戻す</button>
      <button type="button" :class="btn" :disabled="!s.log.value.length" title="Ctrl+Z" @click="s.undo()">1 手戻す</button>
      <button type="button" :class="btn" class="border-amber-400/60 text-amber-100" :disabled="!s.log.value.length" title="打った手を 16:9 の撮影用画面で 1 手ずつ再生 (Space 再生 / ← → 1 手 / Esc 閉じる)" @click="s.hold(null); s.video.value = { from: 0, autoplay: false, controls: true }">動画モード</button>
      <span class="ml-auto flex items-center gap-1.5">
        <span v-if="copied" class="text-emerald-300">{{ copied }}</span>
        <button type="button" :class="btn" :disabled="!s.log.value.length" title="今までの手を手順 JSON に (同じ seed なので craft-stage-run.mjs に流すと同じ結果)" @click="copy('手順 JSON', s.plan())">手順 JSON</button>
        <button type="button" :class="btn" :disabled="!s.log.value.length" title="POE2Tube に渡す結果 JSON (今の相場の値段で)" @click="copy('結果 JSON', s.result(pkg.version))">結果 JSON</button>
        <button type="button" :class="btn" title="craft-stage-run.mjs の --prices に渡す相場 (高貴建て)" @click="copy('相場 JSON', s.prices())">相場 JSON</button>
      </span>
    </section>

    <p v-if="s.error.value" class="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-rose-300">{{ s.error.value }}</p>
    <p v-if="!s.ready.value && !s.error.value" class="py-12 text-center opacity-50">データを読んでいます…</p>

    <div v-if="s.ready.value" class="grid gap-4 @5xl:grid-cols-[auto_1fr]">
      <!-- アイテム枠 + 直前の変化 -->
      <div class="flex flex-col items-center gap-8">
        <div class="relative" :class="fxCls" :style="fx ? { '--fx': fx.color } : undefined">
        <StageItemCard
          :item="s.item.value!"
          :added="s.last.value?.added ?? []"
          :removed="s.last.value?.removed ?? []"
          :holding="!!s.held.value && !s.replay.value"
          :flash-key="flashKey"
          @use="s.use()"
        />
        <span v-if="fx?.text" :key="fx.n" class="stage-float" :class="fx.kind === 'shake' ? 'stage-float-plate text-sm' : 'text-2xl'">{{ fx.text }}</span>
        </div>
        <RevealPanel />
        <div class="w-[380px] rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[12px]">
          <p class="mb-1 flex items-center justify-between"><b class="text-amber-100">直前の変化</b><span class="tabular-nums opacity-70">累計 {{ displayCurrency.money(s.total.value) }} · {{ s.log.value.length }} 手</span></p>
          <template v-if="s.last.value">
            <p class="opacity-80">{{ s.last.value.out.currency_ja }}<span v-if="s.last.value.out.omen_ja" class="ml-1 text-violet-300">+ {{ s.last.value.out.omen_ja }}</span><span v-if="!s.last.value.out.applied" class="ml-1 text-rose-300/80">— {{ s.last.value.out.reason }}</span></p>
            <p v-for="m in s.last.value.added" :key="'a' + m.modId" class="text-emerald-300">＋ {{ m.textJa }}</p>
            <p v-for="m in s.last.value.removed" :key="'r' + m.modId" class="text-rose-300 line-through">－ {{ m.textJa }}</p>
          </template>
          <p v-else class="opacity-50">まだ何も使っていません</p>
        </div>
      </div>

      <!-- カレンシー棚 + 工程履歴 -->
      <div class="min-w-0 space-y-4">
        <section class="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p class="mb-2 flex items-center gap-2 text-[12px]">
            <b class="text-sm text-amber-100">カレンシー</b>
            <span v-if="s.held.value" class="rounded-full bg-amber-500/20 px-2 text-amber-200">持っている: {{ nameOf(s.held.value) }}</span>
            <span v-else class="opacity-50">押して持つ → アイテムを押す</span>
            <span v-for="o in s.omens.value" :key="o" class="cursor-pointer rounded-full bg-violet-500/20 px-2 text-violet-200" title="押すと外す" @click="s.toggleOmen(o)">{{ nameOf(o) }} ×</span>
          </p>
          <CurrencyShelf @hold="hold" />
        </section>
        <section class="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p class="mb-2 text-sm font-bold text-amber-100">工程</p>
          <StageHistory />
        </section>
      </div>
    </div>

    <!-- 押した所の波紋と、吸い込まれるアイコン -->
    <template v-if="fx && fx.kind !== 'shake'">
      <span :key="'r' + fx.n" class="stage-ripple" :style="{ left: `${fx.x}px`, top: `${fx.y}px`, '--fx': fx.color }" />
      <img v-if="fx.icon" :key="'d' + fx.n" :src="fx.icon" alt="" class="stage-drop object-contain" :style="{ left: `${fx.x}px`, top: `${fx.y}px` }" />
    </template>
    <!-- カーソルに付いたカレンシー -->
    <img
      v-if="s.held.value && iconOf(s.held.value)"
      :src="iconOf(s.held.value)"
      alt=""
      class="pointer-events-none fixed z-[200] h-10 w-10 object-contain drop-shadow-[0_0_6px_rgba(250,204,21,0.8)]"
      :style="{ left: `${mouse.x + 8}px`, top: `${mouse.y + 8}px` }"
    />
    <VideoStage v-if="s.video.value && s.ready.value" />
  </div>
</template>
