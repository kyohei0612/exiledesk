<script setup lang="ts">
/**
 * 装備 DPS 比較ビュー (tool-dps) — 装備一覧 + slot 選択方式
 *
 * 流れ:
 *  ① base build 取込 (PoB share code) → load_build_code
 *      → get_stats_all (baseline)
 *      → get_equipped_items (slot 一覧)
 *      → get_skill_groups (メインスキル候補)
 *  ② 装備一覧を表示 + メインスキルプルダウンで再計算（baseline 更新）
 *  ③ 「この slot を変えたら？」プルダウン + 候補装備コピペ → 比較
 *      → snapshot/restore で base build を破壊しない
 *  ④ ▲▼＝ で diff 表示
 */
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { parseJaClipboard, type ParsedClipboard } from "../parser/item-text";
import { translateItemTextToEn } from "../parser/translate-item";

interface EquippedItemInfo {
  slot_name: string;
  has_item: boolean;
  base_name: string;
  title: string;
  rarity: string;
}
interface SkillGroupInfo {
  index: number;
  label: string;
  main_skill_name: string;
  gem_count: number;
  is_main: boolean;
}

// ─── ① base build ───────────────────────────────────────────────
const pobCode = ref<string>("");
const pobCodeStatus = computed(() => {
  const t = pobCode.value.trim();
  if (!t) return "未取込";
  if (t.length < 100) return "コードが短すぎます";
  return `${t.length} 文字`;
});
const pobCodeReady = computed(() => pobCode.value.trim().length >= 100);

type LoadState = "idle" | "loading" | "loaded" | "error";
const loadState = ref<LoadState>("idle");
const loadError = ref<string>("");
const baselineStats = ref<Record<string, number>>({});
const equippedItems = ref<EquippedItemInfo[]>([]);
const skillGroups = ref<SkillGroupInfo[]>([]);
const selectedSkillIndex = ref<number>(0);
const buildSnapshot = ref<string>("");

async function onLoadBuild() {
  loadState.value = "loading";
  loadError.value = "";
  buildSnapshot.value = "";
  try {
    await invoke("pob_load_build_code", { code: pobCode.value });
    await refreshBaseline();
    equippedItems.value = await invoke<EquippedItemInfo[]>(
      "pob_get_equipped_items",
    );
    skillGroups.value = await invoke<SkillGroupInfo[]>("pob_get_skill_groups");
    const main = skillGroups.value.find((s) => s.is_main);
    selectedSkillIndex.value = main?.index ?? skillGroups.value[0]?.index ?? 0;
    loadState.value = "loaded";
  } catch (e: any) {
    loadError.value = String(e);
    loadState.value = "error";
  }
}

async function refreshBaseline() {
  baselineStats.value = await invoke<Record<string, number>>(
    "pob_get_stats_all",
  );
}

// ─── ② スキル切替 ──────────────────────────────────────────────
async function onChangeSkill() {
  if (loadState.value !== "loaded") return;
  try {
    await invoke("pob_set_main_socket_group", { index: selectedSkillIndex.value });
    await refreshBaseline();
    // 比較中の状態もリセット（baseline が変わったので意味がなくなる）
    compareState.value = "idle";
    afterStats.value = {};
    if (buildSnapshot.value) {
      // snapshot は古い baseline 由来なので破棄、必要なら次回比較時に取り直す
      buildSnapshot.value = "";
    }
  } catch (e: any) {
    loadError.value = String(e);
    loadState.value = "error";
  }
}

// ─── ③ 候補装備で比較 ─────────────────────────────────────────
const candidateText = ref<string>("");
const candidateParsed = computed<ParsedClipboard | null>(() =>
  parseJaClipboard(candidateText.value),
);
const selectedSlot = ref<string>(""); // 空 = auto 推定

const compareState = ref<"idle" | "comparing" | "done" | "error">("idle");
const compareError = ref<string>("");
const equippedSlot = ref<string>("");
const afterStats = ref<Record<string, number>>({});

async function onCompare() {
  if (!candidateParsed.value?.raw) {
    compareError.value = "候補装備のテキストが空です";
    compareState.value = "error";
    return;
  }
  if (loadState.value !== "loaded") {
    compareError.value = "先に base build を読み込んでください";
    compareState.value = "error";
    return;
  }
  compareState.value = "comparing";
  compareError.value = "";
  try {
    if (!buildSnapshot.value) {
      buildSnapshot.value = await invoke<string>("pob_snapshot");
    } else {
      await invoke("pob_restore_snapshot", { xml: buildSnapshot.value });
    }

    // PoB は英語アイテムテキストしか認識できないため、日本語 paste を英訳して投入。
    // bundle.json の text_ja ↔ text_en と items-ja.json で逆引き。
    // 日本語が含まれない英文 paste はそのまま渡す（PoB が直接処理）。
    const rawJa = candidateParsed.value.raw;
    const looksJa = /[ぁ-んァ-ヶ一-龯]/.test(rawJa);
    const rawEn = looksJa
      ? translateItemTextToEn(rawJa).englishText
      : rawJa;
    const slot = await invoke<string>("pob_set_item_in_slot", {
      slot: selectedSlot.value || null,
      raw: rawEn,
    });
    equippedSlot.value = slot;
    afterStats.value = await invoke<Record<string, number>>("pob_get_stats_all");
    compareState.value = "done";
  } catch (e: any) {
    compareError.value = String(e);
    compareState.value = "error";
  }
}

async function onResetCompare() {
  compareState.value = "idle";
  afterStats.value = {};
  equippedSlot.value = "";
  if (buildSnapshot.value) {
    try {
      await invoke("pob_restore_snapshot", { xml: buildSnapshot.value });
      await refreshBaseline();
    } catch {
      // ignore
    }
  }
}

// ─── ④ stat 表示 + diff ────────────────────────────────────────
const KEY_STATS: { key: string; label: string; format?: (v: number) => string }[] = [
  { key: "TotalDPS", label: "総合 DPS", format: (v) => v.toFixed(1) },
  { key: "AverageHit", label: "平均ヒット", format: (v) => v.toFixed(1) },
  { key: "Speed", label: "速度", format: (v) => v.toFixed(2) },
  { key: "CritChance", label: "クリ率%", format: (v) => v.toFixed(2) },
  { key: "LifeMax", label: "ライフ", format: (v) => v.toFixed(0) },
  { key: "ManaMax", label: "マナ", format: (v) => v.toFixed(0) },
  { key: "EnergyShieldMax", label: "ES", format: (v) => v.toFixed(0) },
  { key: "Armour", label: "アーマー", format: (v) => v.toFixed(0) },
  { key: "Evasion", label: "回避", format: (v) => v.toFixed(0) },
  { key: "FireResist", label: "火耐性%", format: (v) => v.toFixed(0) },
  { key: "ColdResist", label: "冷気耐性%", format: (v) => v.toFixed(0) },
  { key: "LightningResist", label: "雷耐性%", format: (v) => v.toFixed(0) },
  { key: "ChaosResist", label: "混沌耐性%", format: (v) => v.toFixed(0) },
];

interface StatDiff {
  key: string;
  label: string;
  before: number;
  after: number;
  diff: number;
  diffPercent: number;
  format: (v: number) => string;
}
const statDiffs = computed<StatDiff[]>(() => {
  if (compareState.value !== "done") return [];
  const out: StatDiff[] = [];
  for (const s of KEY_STATS) {
    const before = baselineStats.value[s.key];
    const after = afterStats.value[s.key];
    if (before === undefined || after === undefined) continue;
    const diff = after - before;
    const diffPercent = before === 0 ? 0 : (diff / Math.abs(before)) * 100;
    out.push({
      key: s.key,
      label: s.label,
      before,
      after,
      diff,
      diffPercent,
      format: s.format ?? ((v) => v.toString()),
    });
  }
  return out;
});
const upStats = computed(() => statDiffs.value.filter((d) => d.diff > 0.01));
const downStats = computed(() => statDiffs.value.filter((d) => d.diff < -0.01));
const sameStats = computed(() => statDiffs.value.filter((d) => Math.abs(d.diff) <= 0.01));

const rarityColor = (r: string) => {
  if (r === "RARE" || r === "Rare") return "text-yellow-300";
  if (r === "UNIQUE" || r === "Unique") return "text-orange-400";
  if (r === "MAGIC" || r === "Magic") return "text-blue-300";
  return "text-[var(--color-text)]";
};
</script>

<template>
  <div class="p-6 overflow-auto h-full">
    <header class="mb-4">
      <h2 class="text-2xl font-semibold mb-1">📈 装備 DPS 比較</h2>
      <p class="text-sm text-[var(--color-text-muted)]">
        ① PoB code で base build を取込 → ② 装備一覧 + メインスキル選択 →
        ③ 変更したい slot に候補装備をコピペ → ④ 差分表示
      </p>
    </header>

    <!-- ① base build -->
    <section class="mb-4 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-4">
      <div class="flex justify-between items-center mb-2">
        <h3 class="text-sm font-semibold">① base build（PoB share code）</h3>
        <span class="text-xs" :class="pobCodeReady ? 'text-green-400' : 'text-[var(--color-text-muted)]'">
          {{ pobCodeStatus }}
        </span>
      </div>
      <p class="text-[11px] text-[var(--color-text-muted)] mb-2 leading-relaxed">
        poe.ninja のビルドページで「Copy PoB code」 → そのまま貼付。
        または PoB アプリの Import/Export で生成した share code でも可。
      </p>
      <textarea
        v-model="pobCode"
        rows="4"
        placeholder="eNrFXG..."
        class="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded p-2 text-[11px] font-mono focus:outline-none focus:border-[var(--color-accent)] resize-none"
      />
      <div class="mt-2 flex items-center gap-2">
        <button
          @click="onLoadBuild"
          :disabled="!pobCodeReady || loadState === 'loading'"
          class="px-3 py-1.5 rounded text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
          :class="loadState === 'loaded'
            ? 'bg-green-600 hover:bg-green-700 text-white'
            : 'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-black'"
        >
          {{ loadState === "loading" ? "ロード中…"
             : loadState === "loaded" ? "✓ 読み込み完了（再実行）"
             : "PoB に読み込む" }}
        </button>
        <span v-if="loadState === 'error'" class="text-xs text-red-400">
          失敗: {{ loadError.slice(0, 80) }}
        </span>
        <span v-else-if="loadState === 'loaded'" class="text-xs text-green-400">
          ✓ {{ Object.keys(baselineStats).length }} stats / {{ equippedItems.length }} slots / {{ skillGroups.length }} skill groups
        </span>
      </div>
    </section>

    <!-- ② 装備一覧 + メインスキル -->
    <section
      v-if="loadState === 'loaded'"
      class="mb-4 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-4"
    >
      <h3 class="text-sm font-semibold mb-2">② 現在装備 + メインスキル</h3>

      <!-- メインスキル プルダウン -->
      <div v-if="skillGroups.length > 0" class="mb-3">
        <label class="text-xs text-[var(--color-text-muted)] mr-2">メインスキル:</label>
        <select
          v-model.number="selectedSkillIndex"
          @change="onChangeSkill"
          class="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs"
        >
          <option v-for="g in skillGroups" :key="g.index" :value="g.index">
            {{ g.main_skill_name || g.label }}
            <span v-if="g.gem_count">（{{ g.gem_count }} gems）</span>
          </option>
        </select>
      </div>

      <!-- 装備一覧（has_item=true のみ） -->
      <div class="grid grid-cols-3 gap-2 text-[11px]">
        <div
          v-for="it in equippedItems.filter(i => i.has_item)"
          :key="it.slot_name"
          class="p-2 rounded bg-[var(--color-bg)] border border-[var(--color-border)]"
        >
          <div class="text-[var(--color-text-muted)] text-[10px]">
            {{ it.slot_name }}
          </div>
          <div :class="rarityColor(it.rarity)" class="font-medium truncate">
            {{ it.title || it.base_name || "（名前なし）" }}
          </div>
          <div v-if="it.title && it.base_name" class="text-[var(--color-text-muted)] text-[10px] truncate">
            {{ it.base_name }}
          </div>
        </div>
      </div>

      <!-- baseline stats のサマリ -->
      <div class="mt-3 grid grid-cols-4 gap-2 text-[11px]">
        <div
          v-for="s in KEY_STATS.filter(s => baselineStats[s.key] !== undefined)"
          :key="s.key"
          class="p-2 rounded bg-[var(--color-bg)] border border-[var(--color-border)]"
        >
          <div class="text-[var(--color-text-muted)]">{{ s.label }}</div>
          <div class="font-medium text-[var(--color-accent)]">
            {{ s.format ? s.format(baselineStats[s.key]) : baselineStats[s.key] }}
          </div>
        </div>
      </div>
    </section>

    <!-- ③ 候補装備で比較 -->
    <section
      v-if="loadState === 'loaded'"
      class="mb-4 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-4"
    >
      <h3 class="text-sm font-semibold mb-2">③ 候補装備で比較</h3>
      <div class="flex items-center gap-2 mb-2 text-xs">
        <label class="text-[var(--color-text-muted)]">変更する slot:</label>
        <select
          v-model="selectedSlot"
          class="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1"
        >
          <option value="">（自動推定 / アイテム class から）</option>
          <option
            v-for="it in equippedItems"
            :key="it.slot_name"
            :value="it.slot_name"
          >
            {{ it.slot_name }}
            <span v-if="it.has_item">— 現在: {{ it.title || it.base_name }}</span>
            <span v-else>— 空</span>
          </option>
        </select>
      </div>

      <textarea
        v-model="candidateText"
        rows="8"
        placeholder="候補装備のテキストをコピペ&#10;&#10;例:&#10;Rarity: Rare&#10;装備名&#10;ベース名&#10;--------&#10;Item Level: 78&#10;...mod 行..."
        class="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded p-2 text-xs font-mono focus:outline-none focus:border-[var(--color-accent)] resize-none mb-2"
      />

      <div v-if="candidateParsed" class="text-[11px] text-[var(--color-text-muted)] mb-2">
        パース結果:
        <span class="text-[var(--color-text)]">{{ candidateParsed.name || "（名前なし）" }}</span>
        / {{ candidateParsed.base || "?" }}
        / ilvl {{ candidateParsed.itemLevel ?? "?" }}
        / mod {{ candidateParsed.modLines.length }} 行
      </div>

      <div class="flex items-center gap-2">
        <button
          @click="onCompare"
          :disabled="!candidateParsed || compareState === 'comparing'"
          class="px-3 py-1.5 rounded bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-black font-medium text-xs disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {{ compareState === "comparing" ? "計算中…" : "この装備で比較" }}
        </button>
        <button
          v-if="compareState === 'done' || compareState === 'error'"
          @click="onResetCompare"
          class="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          リセット
        </button>
        <span v-if="compareState === 'error'" class="text-xs text-red-400 truncate">
          失敗: {{ compareError.slice(0, 80) }}
        </span>
      </div>
    </section>

    <!-- ④ ステータス差分 -->
    <section
      v-if="compareState === 'done'"
      class="rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] p-4"
    >
      <h3 class="text-sm font-semibold mb-3">
        ④ ステータス差分
        <span class="text-xs text-[var(--color-text-muted)] ml-2">
          slot: <span class="text-[var(--color-accent)]">{{ equippedSlot }}</span>
        </span>
      </h3>

      <div class="text-xs space-y-3">
        <div v-if="upStats.length > 0">
          <div class="text-green-400 font-semibold mb-1">▲ よくなる ({{ upStats.length }})</div>
          <div class="grid grid-cols-2 gap-1">
            <div
              v-for="d in upStats"
              :key="d.key"
              class="p-2 rounded bg-[var(--color-bg)] border border-green-900/40"
            >
              <div class="text-[var(--color-text-muted)] text-[10px]">{{ d.label }}</div>
              <div>
                {{ d.format(d.before) }} → {{ d.format(d.after) }}
                <span class="text-green-400 ml-1">
                  ({{ d.diff > 0 ? "+" : "" }}{{ d.format(d.diff) }}{{ d.diffPercent !== 0 ? `, ${d.diffPercent.toFixed(1)}%` : "" }})
                </span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="downStats.length > 0">
          <div class="text-red-400 font-semibold mb-1">▼ わるくなる ({{ downStats.length }})</div>
          <div class="grid grid-cols-2 gap-1">
            <div
              v-for="d in downStats"
              :key="d.key"
              class="p-2 rounded bg-[var(--color-bg)] border border-red-900/40"
            >
              <div class="text-[var(--color-text-muted)] text-[10px]">{{ d.label }}</div>
              <div>
                {{ d.format(d.before) }} → {{ d.format(d.after) }}
                <span class="text-red-400 ml-1">
                  ({{ d.format(d.diff) }}{{ d.diffPercent !== 0 ? `, ${d.diffPercent.toFixed(1)}%` : "" }})
                </span>
              </div>
            </div>
          </div>
        </div>

        <details v-if="sameStats.length > 0">
          <summary class="cursor-pointer text-[var(--color-text-muted)]">
            ＝ 変化なし ({{ sameStats.length }}) を表示
          </summary>
          <div class="grid grid-cols-3 gap-1 mt-2">
            <div
              v-for="d in sameStats"
              :key="d.key"
              class="p-1.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)]"
            >
              <div class="text-[var(--color-text-muted)] text-[10px]">{{ d.label }}</div>
              <div>{{ d.format(d.after) }}</div>
            </div>
          </div>
        </details>
      </div>
    </section>
  </div>
</template>
