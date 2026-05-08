<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import {
  ITEM_TAGS,
  getModGroupsForItem,
  cleanModText,
  modWeightFor,
  type Mod,
  type ModGroup,
} from "../data/mods";
import { jaTag, tagColor } from "../i18n/mod-tags-ja";

// ============== スロット定義 ==============
const SLOT_DEFS = [
  { id: "head", label: "頭", defaultTag: "helmet" },
  { id: "body", label: "胴体", defaultTag: "body_armour" },
  { id: "feet", label: "足", defaultTag: "boots" },
  { id: "hands", label: "手", defaultTag: "gloves" },
  { id: "ring1", label: "指輪1", defaultTag: "ring" },
  { id: "ring2", label: "指輪2", defaultTag: "ring" },
  { id: "weapon1", label: "武器1", defaultTag: "sword" },
  { id: "weapon2", label: "武器2", defaultTag: "sword" },
  { id: "belt", label: "ベルト", defaultTag: "belt" },
  { id: "amulet", label: "首飾り", defaultTag: "amulet" },
] as const;

type SlotId = (typeof SLOT_DEFS)[number]["id"];

interface SlotState {
  itemTag: string;
  itemLevel: number;
  selectedKeys: string[];
  starterPrefix: string;
  starterSuffix: string;
  pasteText: string;
  notes: string;
  /** コピペから抽出: アイテム名 */
  parsedName?: string;
  /** コピペから抽出: ベースアイテム名 */
  parsedBase?: string;
  /** コピペから抽出: 品質値 (例: 14) */
  parsedQuality?: number;
  /** コピペから抽出: 品質カテゴリ (例: "アタックモッド") */
  parsedQualityCategory?: string;
}

function makeDefaultSlot(defaultTag: string): SlotState {
  return {
    itemTag: defaultTag,
    itemLevel: 82,
    selectedKeys: [],
    starterPrefix: "",
    starterSuffix: "",
    pasteText: "",
    notes: "",
  };
}

const STORAGE_KEY = "exiledesk:craft-slots-v1";

const slots = ref<Record<string, SlotState>>(
  Object.fromEntries(
    SLOT_DEFS.map((s) => [s.id, makeDefaultSlot(s.defaultTag)]),
  ),
);
const activeSlotId = ref<SlotId>("head");
const search = ref<string>("");

// ============== 永続化 ==============
onMounted(() => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    for (const s of SLOT_DEFS) {
      if (parsed[s.id]) {
        slots.value[s.id] = {
          ...makeDefaultSlot(s.defaultTag),
          ...parsed[s.id],
        };
      }
    }
  } catch (e) {
    console.warn("Failed to load saved slots:", e);
  }
});

watch(
  slots,
  (v) => localStorage.setItem(STORAGE_KEY, JSON.stringify(v)),
  { deep: true },
);

// ============== 現スロット参照 ==============
const slot = computed(() => slots.value[activeSlotId.value]);

const availableGroups = computed(() =>
  getModGroupsForItem(slot.value.itemTag, slot.value.itemLevel),
);

/** group の最高 tier (T1) でフィルタ。group 全体を残すか落とすかの判定に使う */
const filteredGroups = computed(() => {
  const q = search.value.trim().toLowerCase();
  let list = availableGroups.value;
  if (q) {
    list = list.filter((g) => {
      // group 内のいずれかの tier がマッチすれば group ごと残す
      return g.tiers.some(
        (m) =>
          cleanModText(m.text_ja).toLowerCase().includes(q) ||
          cleanModText(m.text_en).toLowerCase().includes(q) ||
          m.name_ja.toLowerCase().includes(q),
      );
    });
  }
  return list;
});

const prefixGroups = computed(() =>
  filteredGroups.value.filter((g) => g.type === "prefix"),
);
const suffixGroups = computed(() =>
  filteredGroups.value.filter((g) => g.type === "suffix"),
);

/** 全 mod のキー → mod ルックアップ（selectedMods 表示用） */
const modByKey = computed(() => {
  const map = new Map<string, Mod>();
  for (const g of availableGroups.value) {
    for (const t of g.tiers) map.set(t.key, t);
  }
  return map;
});

const selectedMods = computed(() =>
  slot.value.selectedKeys
    .map((k) => modByKey.value.get(k))
    .filter((m): m is Mod => !!m),
);

/** group 内で選択中の tier (なければ null) */
function selectedTierIn(group: ModGroup): Mod | null {
  for (const t of group.tiers) {
    if (slot.value.selectedKeys.includes(t.key)) return t;
  }
  return null;
}

/** group 内の tier の通し番号 (T1=0, T2=1, ...) */
function tierIndexOf(group: ModGroup, mod: Mod): number {
  return group.tiers.findIndex((t) => t.key === mod.key);
}

// ============== Tier ピッカー ==============
const tierPickerGroup = ref<ModGroup | null>(null);

function openTierPicker(group: ModGroup) {
  tierPickerGroup.value = group;
}

function closeTierPicker() {
  tierPickerGroup.value = null;
}

function selectTier(group: ModGroup, tier: Mod) {
  const set = new Set(slot.value.selectedKeys);
  // 同 group の既存選択を一旦外す
  for (const t of group.tiers) set.delete(t.key);
  // タイプ別上限チェック
  const otherSelectedOfType = Array.from(set)
    .map((k) => modByKey.value.get(k))
    .filter((m): m is Mod => !!m && m.type === tier.type).length;
  if (otherSelectedOfType >= 3) {
    alert(
      `${tier.type === "prefix" ? "プレフィックス" : "サフィックス"} は最大 3 つまでです`,
    );
    return;
  }
  set.add(tier.key);
  slot.value.selectedKeys = Array.from(set);
  closeTierPicker();
}

function deselectGroup(group: ModGroup) {
  const set = new Set(slot.value.selectedKeys);
  for (const t of group.tiers) set.delete(t.key);
  slot.value.selectedKeys = Array.from(set);
  closeTierPicker();
}
const selectedPrefixCount = computed(
  () => selectedMods.value.filter((m) => m.type === "prefix").length,
);
const selectedSuffixCount = computed(
  () => selectedMods.value.filter((m) => m.type === "suffix").length,
);
const slotSelCount = computed(
  () => (id: SlotId) => slots.value[id].selectedKeys.length,
);

/** 全 tier をフラット化したリスト（paste マッチング・starter ドロップダウン用） */
const allAvailableMods = computed(() =>
  availableGroups.value.flatMap((g) => g.tiers),
);

// ============== 操作 ==============

function clearSlot() {
  if (!confirm(`「${slotLabel(activeSlotId.value)}」スロットをクリアしますか？`))
    return;
  const def = SLOT_DEFS.find((s) => s.id === activeSlotId.value)!;
  slots.value[activeSlotId.value] = makeDefaultSlot(def.defaultTag);
}

function slotLabel(id: SlotId): string {
  return SLOT_DEFS.find((s) => s.id === id)?.label ?? id;
}

// ============== コピペ解析（JA） ==============
interface ParsedClipboard {
  name?: string;
  base?: string;
  itemLevel?: number;
  quality?: number;
  qualityCategory?: string;
  modLines: string[];
}

function parseJaClipboard(text: string): ParsedClipboard | null {
  const raw = text.trim();
  if (!raw) return null;
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const result: ParsedClipboard = { modLines: [] };
  let inModSection = false;

  for (const line of lines) {
    // アイテムレベル
    const ilvl = line.match(/^アイテムレベル[:\s]*(\d+)/);
    if (ilvl) {
      result.itemLevel = parseInt(ilvl[1]);
      inModSection = true;
      continue;
    }
    // 品質（カテゴリ付き: "品質 (アタックモッド): +14%"）
    const qmCat = line.match(/^品質\s*\(([^)]+)\)\s*[:\s]*\+?(\d+)%/);
    if (qmCat) {
      result.qualityCategory = qmCat[1];
      result.quality = parseInt(qmCat[2]);
      continue;
    }
    // 品質（カテゴリなし: "品質: +14%"）
    const qm = line.match(/^品質\s*[:\s]\s*\+?(\d+)%/);
    if (qm) {
      result.quality = parseInt(qm[1]);
      continue;
    }
    // 品質の最大値表記（実値ではないので無視）
    if (line.startsWith("品質の最大値")) continue;

    // スキップ metadata
    if (line.startsWith("品質") || line.startsWith("ソケット")) continue;
    if (line.startsWith("必要")) continue;
    if (
      line.startsWith("攻撃力") ||
      line.startsWith("アーマー") ||
      line.startsWith("回避") ||
      line.startsWith("エナジーシールド") ||
      line.startsWith("ブロック")
    )
      continue;
    if (line === "腐敗" || line === "鏡映" || line === "壊れた") continue;
    if (line.match(/^---+$/)) continue;

    if (!inModSection) {
      if (!result.name) result.name = line;
      else if (!result.base) result.base = line;
    } else {
      result.modLines.push(line);
    }
  }
  return result;
}

/**
 * mod text を比較キー化。
 * - bundle: "(1-4)から(60-71)の雷ダメージ" / paste: "4から71の雷ダメージ" → 同キー化
 * - 複数 stat mod は \n 区切りの sub-line を **アルファベット順にソート** して
 *   順序非依存にする（光半径＋命中力 と 命中力＋光半径 を同一視）
 */
function modTextKey(text: string): string {
  if (!text.trim()) return "";
  const cleaned = cleanModText(text);
  const subs = cleaned
    .split(/\r?\n/)
    .map((l) =>
      l
        .replace(/[()（）]/g, "")
        .replace(/[\d\-\.]+/g, "_")
        .replace(/[+＋]/g, "")
        .replace(/\s+/g, "")
        .toLowerCase(),
    )
    .filter(Boolean)
    .sort();
  return subs.join("|");
}

/** N 本中 K 本を選ぶ全組合せのインデックスリストを返す */
function combinations(n: number, k: number): number[][] {
  const result: number[][] = [];
  const helper = (start: number, current: number[]) => {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i <= n - (k - current.length); i++) {
      current.push(i);
      helper(i + 1, current);
      current.pop();
    }
  };
  helper(0, []);
  return result;
}

/**
 * パースしたコピペ mod 行を bundle にマッチング（2 パス方式）。
 * - Pass 1: 各行を **単独 1 行で** bundle 照合（pure mod 優先）
 * - Pass 2: 未マッチ行の **2-3 行組合せ**（連続・非連続両方）で hybrid mod 拾い
 * - 同一 mod の重複マッチは抑制、level 降順で T1 優先
 */
function matchModLines(
  lines: string[],
  pool: Mod[],
): { matched: Mod[]; unmatched: string[] } {
  const sortedPool = [...pool].sort((a, b) => b.level - a.level);
  const keyToMod = new Map<string, Mod>();
  for (const m of sortedPool) {
    const k = modTextKey(m.text_ja);
    if (k && !keyToMod.has(k)) keyToMod.set(k, m);
  }

  const N = lines.length;
  const matched: Mod[] = [];
  const consumed = new Set<number>();
  const matchedKeys = new Set<string>();

  // Pass 1: 1 行マッチを優先消化（pure mod を取りこぼさない）
  for (let i = 0; i < N; i++) {
    const k = modTextKey(lines[i]);
    if (!k) continue;
    const found = keyToMod.get(k);
    if (!found) continue;
    if (matchedKeys.has(found.key)) continue;
    matched.push(found);
    matchedKeys.add(found.key);
    consumed.add(i);
  }

  // Pass 2: 残った行の組合せで hybrid mod を拾う
  const remaining = Array.from({ length: N }, (_, i) => i).filter(
    (i) => !consumed.has(i),
  );
  type Candidate = { indices: number[]; mod: Mod };
  const candidates: Candidate[] = [];
  for (let k = 2; k <= 3; k++) {
    if (k > remaining.length) break;
    for (const combo of combinations(remaining.length, k)) {
      const indices = combo.map((c) => remaining[c]);
      const segment = indices.map((i) => lines[i]).join("\n");
      const ck = modTextKey(segment);
      if (!ck) continue;
      const found = keyToMod.get(ck);
      if (found) candidates.push({ indices, mod: found });
    }
  }
  candidates.sort((a, b) => {
    if (a.indices.length !== b.indices.length) {
      return b.indices.length - a.indices.length;
    }
    return a.indices[0] - b.indices[0];
  });
  for (const c of candidates) {
    if (matchedKeys.has(c.mod.key)) continue;
    if (c.indices.some((i) => consumed.has(i))) continue;
    matched.push(c.mod);
    matchedKeys.add(c.mod.key);
    c.indices.forEach((i) => consumed.add(i));
  }

  const unmatched = lines.filter((_, i) => !consumed.has(i));
  return { matched, unmatched };
}

function applyPaste() {
  const parsed = parseJaClipboard(slot.value.pasteText);
  if (!parsed) {
    alert("コピペ内容を解析できませんでした");
    return;
  }
  if (parsed.itemLevel) slot.value.itemLevel = parsed.itemLevel;
  // メタデータをスロットに保存（表示・AI プロンプト用）
  slot.value.parsedName = parsed.name;
  slot.value.parsedBase = parsed.base;
  slot.value.parsedQuality = parsed.quality;
  slot.value.parsedQualityCategory = parsed.qualityCategory;

  const { matched, unmatched } = matchModLines(
    parsed.modLines,
    allAvailableMods.value,
  );

  // プレ/サフ 上限を尊重して埋める
  const filledKeys = new Set<string>();
  let pCount = 0;
  let sCount = 0;
  for (const m of matched) {
    if (m.type === "prefix" && pCount >= 3) continue;
    if (m.type === "suffix" && sCount >= 3) continue;
    filledKeys.add(m.key);
    if (m.type === "prefix") pCount++;
    else sCount++;
  }
  slot.value.selectedKeys = Array.from(filledKeys);

  const itemTagLabel =
    ITEM_TAGS.find((t) => t.id === slot.value.itemTag)?.label ??
    slot.value.itemTag;
  const lines: string[] = [
    `マッチ: ${matched.length}/${parsed.modLines.length} 行 → ${filledKeys.size} 件を選択中に反映（アイテムタイプ: ${itemTagLabel}）`,
  ];
  if (unmatched.length) {
    lines.push("");
    lines.push(`未マッチ ${unmatched.length} 行:`);
    for (const u of unmatched) lines.push(`  • ${u}`);
    lines.push("");
    lines.push(
      "※ 暗黙モッド・固有 mod・装備タイプ違い・品質ボーナスで構造変化した行は未マッチになります。",
    );
    lines.push(
      "  手動で選択するか、別のアイテムタイプに切替えて再試行してください。",
    );
  }
  alert(lines.join("\n"));
}

// ============== AI プロンプト構築 ==============
function buildAiPrompt(): string {
  const itemLabel =
    ITEM_TAGS.find((t) => t.id === slot.value.itemTag)?.label ??
    slot.value.itemTag;
  const starterP = modByKey.value.get(slot.value.starterPrefix);
  const starterS = modByKey.value.get(slot.value.starterSuffix);
  const hasStarterPrefix = !!starterP;
  const hasStarterSuffix = !!starterS;
  const needSuggestStarter = !hasStarterPrefix || !hasStarterSuffix;

  return [
    `Plan the cheapest crafting path for a Path of Exile 2 ${slot.value.itemTag} at item level ${slot.value.itemLevel} (slot: ${slotLabel(activeSlotId.value)} / ${itemLabel}).`,
    slot.value.parsedBase ? `Base item (parsed): ${slot.value.parsedBase}` : "",
    slot.value.parsedQuality
      ? `Quality bonus: +${slot.value.parsedQuality}%${slot.value.parsedQualityCategory ? ` (${slot.value.parsedQualityCategory})` : ""} — boosts the values of the matched mod category, factor in when computing final values.`
      : "",
    "",
    `Target mods (all at maximum tier, ${selectedMods.value.length}/6 selected):`,
    ...selectedMods.value.map(
      (m, i) =>
        `${i + 1}. [${m.type}] ${cleanModText(m.text_en)} (group: ${m.groups.join(",")}, key: ${m.key}, lv ${m.level})`,
    ),
    "",
    hasStarterPrefix || hasStarterSuffix
      ? "Starter mods user specifies are already present on the base:"
      : "",
    hasStarterPrefix
      ? `- prefix: ${cleanModText(starterP!.text_en)} (group: ${starterP!.groups.join(",")})`
      : "",
    hasStarterSuffix
      ? `- suffix: ${cleanModText(starterS!.text_en)} (group: ${starterS!.groups.join(",")})`
      : "",
    needSuggestStarter
      ? `\n** RECOMMEND best starter mod(s) the user should look for on a base **\n` +
        `- The ${!hasStarterPrefix ? "prefix" : ""}${!hasStarterPrefix && !hasStarterSuffix ? " AND " : ""}${!hasStarterSuffix ? "suffix" : ""} is unspecified.\n` +
        `- Recommend max-tier mod(s) that, if already on the base, would minimize total expected cost for this 6-mod target.\n` +
        `- Justify the choice with a probability/cost reasoning.`
      : "",
    "",
    "POE2 crafting mechanics to consider (cover what's relevant):",
    "- Currency: Orb of Alchemy / Augmentation / Regal / Exalted / Annulment / Chaos",
    "- Essence (deterministic 1-mod) and Perfect Essence (broader pool / higher tier guarantee)",
    "- Desecrated mods (abyss-only, rolled via specific currency)",
    "- Vaal Orb / Corrupt: 4 outcomes (~25% each: no change / destroy / mod added / mod removed); rings don't typically gain sockets from corrupt — note item-type-specific Vaal effects",
    "- Recombinator (POE2 specific merge mechanic)",
    "- Bench / artificer crafts where applicable",
    "",
    "Return:",
    "- Cheapest currency-step path (be specific about which currencies and order)",
    "- Estimated cost in Divine Orbs per attempt + total expected cost (cost ÷ probability)",
    "- Estimated success probability per attempt + cumulative attempts",
    "- 2-3 alternative paths with same metrics",
    "- Recommended starter mod(s) if user did not specify (with rationale)",
    "- Note POE2 mod weights, group exclusions, ilvl requirements",
    "- Final mod values (factor in quality bonus; reference pre-quality stat range from bundle for stats that scale with quality)",
    "- For complex calculations cross-check with Craft of Exile POE2 (Emulator: deterministic odds; Simulator: roll trial). URL: https://www.craftofexile.com/?cl=jp&game=poe2",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Craft of Exile (POE2 / 日本語) への deep-link URL（paste 済なら eimport 付き） */
const craftOfExileUrl = computed(() => {
  const base = "https://www.craftofexile.com/?cl=jp&game=poe2";
  const paste = slot.value.pasteText.trim();
  if (paste) {
    return `${base}&eimport=${encodeURIComponent(paste)}`;
  }
  return base;
});

function onAskAi() {
  if (!selectedMods.value.length) {
    alert("先に目標 mod を選択してください");
    return;
  }
  const prompt = buildAiPrompt();
  console.log("[CraftHelper] AI prompt:\n" + prompt);
  alert(
    [
      "🚧 AI 連携は次イテレーションで実装します。",
      "",
      "現在のプロンプト（コンソールにも出力済）:",
      "----",
      prompt.length > 1500 ? prompt.slice(0, 1500) + "\n..." : prompt,
    ].join("\n"),
  );
}
</script>

<template>
  <div class="p-8 overflow-auto h-full">
    <h2 class="text-2xl font-semibold mb-1">🔨 クラフト最短経路相談</h2>
    <p class="text-sm text-[var(--color-text-muted)] max-w-3xl mb-4">
      装備スロット別に目標 mod を保存（ローカル永続）。最大6個（プレ3＋サフ3）。
      コピペ解析で日本語版の装備テキストから自動入力。
      <span class="text-[var(--color-accent)]">v0: 入力・保存・解析まで実装。AI 経路提案は次ステップ。</span>
    </p>

    <!-- スロット タブ -->
    <div class="flex gap-1 mb-4 overflow-x-auto">
      <button
        v-for="s in SLOT_DEFS"
        :key="s.id"
        @click="activeSlotId = s.id"
        :class="[
          'px-3 py-2 rounded text-sm whitespace-nowrap transition border-b-2',
          activeSlotId === s.id
            ? 'bg-[var(--color-surface-2)] border-[var(--color-accent)] text-[var(--color-accent)]'
            : 'bg-[var(--color-surface)] border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
        ]"
      >
        {{ s.label
        }}<span
          v-if="slotSelCount(s.id) > 0"
          class="ml-1.5 text-[10px] text-[var(--color-accent)]"
          >·{{ slotSelCount(s.id) }}</span
        >
      </button>
      <button
        @click="clearSlot"
        class="ml-auto px-3 py-2 rounded text-xs text-[var(--color-text-muted)] hover:bg-red-900/20 hover:text-red-300 transition"
        :title="`このスロット（${slotLabel(activeSlotId)}）をクリア`"
      >
        🗑️ スロット削除
      </button>
    </div>

    <!-- ヘッダー: アイテムタイプ・ilvl・検索 -->
    <div class="flex items-center gap-3 mb-3 flex-wrap">
      <label class="flex items-center gap-2 text-sm">
        <span class="text-[var(--color-text-muted)]">アイテムタイプ:</span>
        <select
          v-model="slot.itemTag"
          class="px-3 py-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-sm"
        >
          <option v-for="t in ITEM_TAGS" :key="t.id" :value="t.id">
            {{ t.label }}
          </option>
        </select>
      </label>
      <label class="flex items-center gap-2 text-sm">
        <span class="text-[var(--color-text-muted)]">ilvl:</span>
        <input
          v-model.number="slot.itemLevel"
          type="number"
          min="1"
          max="86"
          class="w-20 px-3 py-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-sm"
        />
      </label>
      <input
        v-model="search"
        type="text"
        placeholder="🔍 mod 検索（日英）"
        class="px-3 py-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-sm w-56"
      />
      <span class="ml-auto text-xs text-[var(--color-text-muted)]">
        選択:
        <span class="text-[var(--color-accent)]">{{ selectedPrefixCount }}/3 P</span>
        +
        <span class="text-[var(--color-accent)]">{{ selectedSuffixCount }}/3 S</span>
        ／ 候補 {{ filteredGroups.length }} group
      </span>
    </div>

    <!-- コピペ解析 -->
    <details class="mb-4 rounded border border-[var(--color-border)] bg-[var(--color-surface)]/30">
      <summary class="px-3 py-2 cursor-pointer text-sm">
        📋 コピペで一括入力（POE2 ゲーム内 → 右クリック → コピー → ここに貼付）
      </summary>
      <div class="p-3 border-t border-[var(--color-border)] grid grid-cols-2 gap-3">
        <textarea
          v-model="slot.pasteText"
          rows="8"
          placeholder="真珠の指輪&#10;指輪&#10;品質 (アタックモッド): +14%&#10;アイテムレベル: 78&#10;必要 レベル 60&#10;キャストスピードが9%増加する&#10;..."
          class="w-full px-3 py-2 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-xs font-mono resize-y focus:outline-none focus:border-[var(--color-accent)]"
        ></textarea>
        <div class="flex flex-col gap-2">
          <button
            @click="applyPaste"
            :disabled="!slot.pasteText.trim()"
            class="px-4 py-2 rounded bg-[var(--color-accent)] text-black text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition"
          >
            🔍 解析して反映
          </button>
          <p class="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
            mod 名と数値プレースホルダを照合して自動選択。<br />
            未マッチ行は手動で選び直してください。<br />
            アイテム lvl も自動取得。
          </p>
        </div>
      </div>
    </details>

    <!-- mod ピッカー (group ベース・クリックで tier ピッカー モーダル) -->
    <div class="grid grid-cols-2 gap-4">
      <div class="rounded-lg border border-[var(--color-border)] overflow-hidden">
        <div class="px-3 py-2 bg-[var(--color-surface)] text-xs uppercase tracking-wider text-[var(--color-accent)]">
          プレフィックス（{{ prefixGroups.length }} group）
        </div>
        <div class="max-h-80 overflow-y-auto divide-y divide-[var(--color-border)]">
          <button
            v-for="g in prefixGroups"
            :key="g.id"
            @click="openTierPicker(g)"
            :class="[
              'w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface)] transition flex items-start gap-2',
              selectedTierIn(g)
                ? 'bg-[var(--color-surface-2)] border-l-2 border-[var(--color-accent)]'
                : 'border-l-2 border-transparent',
            ]"
          >
            <span class="text-[var(--color-text-muted)] font-mono w-8 shrink-0">lv{{ g.tiers[0].level }}</span>
            <span class="flex-1 min-w-0">
              <span class="text-[var(--color-text)] whitespace-pre-line block">{{ cleanModText(g.tiers[0].text_ja) }}</span>
              <span v-if="g.tiers[0].tags && g.tiers[0].tags.length" class="flex gap-1 flex-wrap mt-1">
                <span
                  v-for="t in g.tiers[0].tags"
                  :key="t"
                  :class="['px-1.5 py-0.5 rounded text-[9px]', tagColor(t)]"
                >{{ jaTag(t) }}</span>
              </span>
              <span class="text-[var(--color-text-muted)] block text-[10px] mt-0.5">
                {{ g.tiers[0].name_ja || g.tiers[0].name_en }} · {{ g.id }}
              </span>
            </span>
            <span class="flex flex-col items-end shrink-0 gap-0.5">
              <span class="text-[10px] text-[var(--color-text-muted)] font-mono">w{{ modWeightFor(g.tiers[0], slot.itemTag) }}</span>
              <span v-if="g.tiers.length > 1" class="text-[9px] text-[var(--color-text-muted)]">{{ g.tiers.length }} tiers</span>
              <span v-if="selectedTierIn(g)" class="text-[10px] text-[var(--color-accent)] font-semibold">
                T{{ tierIndexOf(g, selectedTierIn(g)!) + 1 }} ✓
              </span>
            </span>
          </button>
          <p v-if="!prefixGroups.length" class="p-4 text-xs text-[var(--color-text-muted)] italic">
            該当なし
          </p>
        </div>
      </div>

      <div class="rounded-lg border border-[var(--color-border)] overflow-hidden">
        <div class="px-3 py-2 bg-[var(--color-surface)] text-xs uppercase tracking-wider text-[var(--color-accent)]">
          サフィックス（{{ suffixGroups.length }} group）
        </div>
        <div class="max-h-80 overflow-y-auto divide-y divide-[var(--color-border)]">
          <button
            v-for="g in suffixGroups"
            :key="g.id"
            @click="openTierPicker(g)"
            :class="[
              'w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface)] transition flex items-start gap-2',
              selectedTierIn(g)
                ? 'bg-[var(--color-surface-2)] border-l-2 border-[var(--color-accent)]'
                : 'border-l-2 border-transparent',
            ]"
          >
            <span class="text-[var(--color-text-muted)] font-mono w-8 shrink-0">lv{{ g.tiers[0].level }}</span>
            <span class="flex-1 min-w-0">
              <span class="text-[var(--color-text)] whitespace-pre-line block">{{ cleanModText(g.tiers[0].text_ja) }}</span>
              <span v-if="g.tiers[0].tags && g.tiers[0].tags.length" class="flex gap-1 flex-wrap mt-1">
                <span
                  v-for="t in g.tiers[0].tags"
                  :key="t"
                  :class="['px-1.5 py-0.5 rounded text-[9px]', tagColor(t)]"
                >{{ jaTag(t) }}</span>
              </span>
              <span class="text-[var(--color-text-muted)] block text-[10px] mt-0.5">
                {{ g.tiers[0].name_ja || g.tiers[0].name_en }} · {{ g.id }}
              </span>
            </span>
            <span class="flex flex-col items-end shrink-0 gap-0.5">
              <span class="text-[10px] text-[var(--color-text-muted)] font-mono">w{{ modWeightFor(g.tiers[0], slot.itemTag) }}</span>
              <span v-if="g.tiers.length > 1" class="text-[9px] text-[var(--color-text-muted)]">{{ g.tiers.length }} tiers</span>
              <span v-if="selectedTierIn(g)" class="text-[10px] text-[var(--color-accent)] font-semibold">
                T{{ tierIndexOf(g, selectedTierIn(g)!) + 1 }} ✓
              </span>
            </span>
          </button>
          <p v-if="!suffixGroups.length" class="p-4 text-xs text-[var(--color-text-muted)] italic">
            該当なし
          </p>
        </div>
      </div>
    </div>

    <!-- 選択中サマリ -->
    <div class="mt-6 p-4 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
      <h3 class="text-sm font-semibold mb-3">
        🎯 目標 mod（{{ selectedMods.length }}/6）— 「{{ slotLabel(activeSlotId) }}」スロット
      </h3>

      <!-- パース済メタデータ -->
      <div
        v-if="slot.parsedName || slot.parsedBase || slot.parsedQuality"
        class="mb-3 pb-3 border-b border-[var(--color-border)] grid grid-cols-2 gap-2 text-xs"
      >
        <div v-if="slot.parsedName">
          <span class="text-[var(--color-text-muted)]">アイテム名: </span>
          <span class="text-[var(--color-accent)]">{{ slot.parsedName }}</span>
        </div>
        <div v-if="slot.parsedBase">
          <span class="text-[var(--color-text-muted)]">ベース: </span>
          <span>{{ slot.parsedBase }}</span>
        </div>
        <div v-if="slot.parsedQuality">
          <span class="text-[var(--color-text-muted)]">品質: </span>
          <span class="text-[var(--color-accent)]">+{{ slot.parsedQuality }}%</span>
          <span v-if="slot.parsedQualityCategory" class="text-[var(--color-text-muted)]">
            ({{ slot.parsedQualityCategory }})
          </span>
        </div>
      </div>

      <ul v-if="selectedMods.length" class="space-y-1 text-sm font-mono">
        <li
          v-for="m in selectedMods"
          :key="m.key"
          class="flex items-baseline gap-2"
        >
          <span
            :class="[
              'text-[10px] uppercase font-semibold tracking-wider w-12 shrink-0',
              m.type === 'prefix' ? 'text-blue-300' : 'text-amber-300',
            ]"
          >
            {{ m.type === "prefix" ? "プレ" : "サフ" }}
          </span>
          <span class="flex-1 text-[var(--color-text)]">{{ cleanModText(m.text_ja) }}</span>
          <span class="text-[10px] text-[var(--color-text-muted)]">lv{{ m.level }}</span>
        </li>
      </ul>
      <p v-else class="text-xs text-[var(--color-text-muted)] italic">
        上のリストから選択 or コピペで自動入力
      </p>
    </div>

    <!-- スターター mod -->
    <div class="mt-3 p-4 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
      <h3 class="text-sm font-semibold mb-2">
        🎯 スターター mod（既に持ってると楽になる）
      </h3>
      <p class="text-xs text-[var(--color-text-muted)] mb-3">
        プレフィックス1 ＋ サフィックス1（最大 tier）を指定すると、その mod が既にあるベース前提で最短経路を計算します。
        <span class="text-[var(--color-accent)]">空欄のままなら AI が「おすすめスターター」を提案します。</span>
      </p>
      <div class="grid grid-cols-2 gap-3">
        <select
          v-model="slot.starterPrefix"
          class="px-3 py-2 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-xs"
        >
          <option value="">プレフィックス: 指定なし</option>
          <option v-for="g in prefixGroups" :key="g.id" :value="g.tiers[0].key">
            {{ cleanModText(g.tiers[0].text_ja).split("\n").join(" / ") }} (lv{{ g.tiers[0].level }})
          </option>
        </select>
        <select
          v-model="slot.starterSuffix"
          class="px-3 py-2 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-xs"
        >
          <option value="">サフィックス: 指定なし</option>
          <option v-for="g in suffixGroups" :key="g.id" :value="g.tiers[0].key">
            {{ cleanModText(g.tiers[0].text_ja).split("\n").join(" / ") }} (lv{{ g.tiers[0].level }})
          </option>
        </select>
      </div>
    </div>

    <div class="mt-6 flex gap-3 items-center flex-wrap">
      <button
        @click="onAskAi"
        :disabled="!selectedMods.length"
        class="px-5 py-2 rounded bg-[var(--color-accent)] text-black font-medium text-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition"
      >
        🤖 秘書（AI）に最短経路を相談
      </button>
      <a
        href="https://www.craftofexile.com/?cl=jp&game=poe2"
        target="_blank"
        rel="noopener noreferrer"
        class="px-4 py-2 rounded border border-[var(--color-border)] text-sm hover:bg-[var(--color-surface-2)] transition"
        title="エミュレーター（確率）／シミュレーター（試行）両方使える参考ツール"
      >
        🧪 Craft of Exile (POE2 / 日本語) で確率検証 ↗
      </a>
      <p class="text-[10px] text-[var(--color-text-muted)] flex-1 min-w-[12rem]">
        Mod データ: RePoE fork (poe2) JA / EN ／ AI 送信時は英名・stat 範囲・group・lv・tags・weight + 品質情報を渡します。
        AI プロンプトには冒涜・エッセンス・パーフェクトエッセンス・コラプト機構を含む POE2 クラフト機構を考慮するよう指示。
      </p>
    </div>

    <!-- ========== Tier ピッカー モーダル ========== -->
    <div
      v-if="tierPickerGroup"
      class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      @click.self="closeTierPicker"
    >
      <div
        class="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
      >
        <div class="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
          <div>
            <h3 class="text-sm font-semibold">
              <span
                :class="
                  tierPickerGroup.type === 'prefix'
                    ? 'text-blue-300'
                    : 'text-amber-300'
                "
              >{{ tierPickerGroup.type === "prefix" ? "プレフィックス" : "サフィックス" }}</span>
              ：<span class="text-[var(--color-accent)]">{{ tierPickerGroup.id }}</span>
            </h3>
            <p class="text-xs text-[var(--color-text-muted)] mt-0.5">
              {{ tierPickerGroup.tiers.length }} tier から選択（T1 = 最高 tier）
            </p>
          </div>
          <button
            @click="closeTierPicker"
            class="text-[var(--color-text-muted)] hover:text-[var(--color-text)] w-7 h-7 rounded hover:bg-[var(--color-surface-2)] flex items-center justify-center"
          >✕</button>
        </div>
        <div class="overflow-y-auto divide-y divide-[var(--color-border)] flex-1">
          <button
            v-for="(t, i) in tierPickerGroup.tiers"
            :key="t.key"
            @click="selectTier(tierPickerGroup, t)"
            :class="[
              'w-full text-left px-4 py-3 text-sm hover:bg-[var(--color-surface-2)] transition flex items-start gap-3',
              slot.selectedKeys.includes(t.key)
                ? 'bg-[var(--color-surface-2)] border-l-2 border-[var(--color-accent)]'
                : 'border-l-2 border-transparent',
            ]"
          >
            <span class="text-[var(--color-accent)] font-semibold w-10 shrink-0">T{{ i + 1 }}</span>
            <span class="text-[var(--color-text-muted)] font-mono w-12 shrink-0">lv{{ t.level }}</span>
            <span class="flex-1 whitespace-pre-line text-[var(--color-text)]">{{ cleanModText(t.text_ja) }}</span>
            <span class="text-[10px] text-[var(--color-text-muted)] font-mono shrink-0">w{{ modWeightFor(t, slot.itemTag) }}</span>
            <span v-if="slot.selectedKeys.includes(t.key)" class="text-[var(--color-accent)] shrink-0">✓</span>
          </button>
        </div>
        <div class="px-4 py-3 border-t border-[var(--color-border)] flex items-center justify-between">
          <button
            v-if="selectedTierIn(tierPickerGroup)"
            @click="deselectGroup(tierPickerGroup)"
            class="text-xs text-red-300 hover:text-red-200 transition"
          >
            🗑️ この group の選択を解除
          </button>
          <span v-else class="text-[10px] text-[var(--color-text-muted)]">
            ※ クリックすると選択 → 自動で閉じます
          </span>
          <button
            @click="closeTierPicker"
            class="ml-auto text-xs px-3 py-1 rounded text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] transition"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
