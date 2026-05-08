<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import {
  ITEM_TAGS,
  getMaxTierMods,
  cleanModText,
  type Mod,
} from "../data/mods";

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

const availableMods = computed(() => getMaxTierMods(slot.value.itemTag));

const filteredMods = computed(() => {
  const q = search.value.trim().toLowerCase();
  let list = availableMods.value;
  if (q) {
    list = list.filter(
      (m) =>
        cleanModText(m.text_ja).toLowerCase().includes(q) ||
        cleanModText(m.text_en).toLowerCase().includes(q) ||
        m.name_ja.toLowerCase().includes(q),
    );
  }
  return list;
});

const prefixMods = computed(() =>
  filteredMods.value.filter((m) => m.type === "prefix"),
);
const suffixMods = computed(() =>
  filteredMods.value.filter((m) => m.type === "suffix"),
);

const selectedMods = computed(() =>
  slot.value.selectedKeys
    .map((k) => availableMods.value.find((m) => m.key === k))
    .filter((m): m is Mod => !!m),
);
const selectedPrefixCount = computed(
  () => selectedMods.value.filter((m) => m.type === "prefix").length,
);
const selectedSuffixCount = computed(
  () => selectedMods.value.filter((m) => m.type === "suffix").length,
);
const slotSelCount = computed(
  () => (id: SlotId) => slots.value[id].selectedKeys.length,
);

// ============== 操作 ==============
function toggleMod(m: Mod) {
  const set = new Set(slot.value.selectedKeys);
  if (set.has(m.key)) {
    set.delete(m.key);
  } else {
    if (m.type === "prefix" && selectedPrefixCount.value >= 3) return;
    if (m.type === "suffix" && selectedSuffixCount.value >= 3) return;
    set.add(m.key);
  }
  slot.value.selectedKeys = Array.from(set);
}

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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // メタデータ抽出
    const ilvl = line.match(/^アイテムレベル[:\s]*(\d+)/);
    if (ilvl) {
      result.itemLevel = parseInt(ilvl[1]);
      inModSection = true;
      continue;
    }
    const qm = line.match(/品質[^:]*[:\s]*\+?(\d+)%/);
    if (qm) {
      result.quality = parseInt(qm[1]);
      continue;
    }

    // スキップする metadata 行
    if (line.startsWith("品質") || line.startsWith("ソケット")) continue;
    if (line.startsWith("必要")) continue;
    if (
      line.startsWith("攻撃力") ||
      line.startsWith("アーマー") ||
      line.startsWith("回避") ||
      line.startsWith("エナジーシールド") ||
      line.startsWith("ブロック")
    ) continue;
    if (line === "腐敗" || line === "鏡映" || line === "壊れた") continue;
    if (line.match(/^---+$/)) continue;

    if (!inModSection) {
      // ヘッダー: 1行目=名前 (rare or magic) / 2行目=ベース
      if (!result.name) result.name = line;
      else if (!result.base) result.base = line;
    } else {
      result.modLines.push(line);
    }
  }
  return result;
}

/** mod text 内の数値を `__` プレースホルダに置換し、比較キー化する */
function modTextKey(text: string): string {
  return cleanModText(text)
    .replace(/\d+から\d+の/g, "__から__の") // "4から5の" → "__から__の"
    .replace(/[+\-]?\d+(\.\d+)?%?/g, "__")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** パースしたコピペ mod 行を bundle にマッチング */
function matchModLines(lines: string[], pool: Mod[]): Mod[] {
  const matched: Mod[] = [];
  for (const line of lines) {
    const k = modTextKey(line);
    if (!k) continue;
    const found = pool.find((m) => modTextKey(m.text_ja) === k);
    if (found && !matched.some((mm) => mm.key === found.key)) {
      matched.push(found);
    }
  }
  return matched;
}

function applyPaste() {
  const parsed = parseJaClipboard(slot.value.pasteText);
  if (!parsed) {
    alert("コピペ内容を解析できませんでした");
    return;
  }
  if (parsed.itemLevel) slot.value.itemLevel = parsed.itemLevel;
  const matched = matchModLines(parsed.modLines, availableMods.value);
  if (!matched.length) {
    alert(
      `mod 行 ${parsed.modLines.length} 件中、bundle と一致したものはありませんでした。\n` +
        `手動選択するか、別のアイテムタイプ（現: ${ITEM_TAGS.find((t) => t.id === slot.value.itemTag)?.label}）に切替えて再試行してください。`,
    );
    return;
  }
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
  alert(
    `${parsed.modLines.length} 行中 ${matched.length} 件マッチ、${filledKeys.size} 件選択済みに反映しました。\n` +
      "未マッチのものは手動で追加できます。",
  );
}

// ============== AI プロンプト構築 ==============
function buildAiPrompt(): string {
  const itemLabel =
    ITEM_TAGS.find((t) => t.id === slot.value.itemTag)?.label ??
    slot.value.itemTag;
  const starterP = availableMods.value.find(
    (m) => m.key === slot.value.starterPrefix,
  );
  const starterS = availableMods.value.find(
    (m) => m.key === slot.value.starterSuffix,
  );
  return [
    `Plan the cheapest crafting path for a Path of Exile 2 ${slot.value.itemTag} (item level ${slot.value.itemLevel}, slot label: ${slotLabel(activeSlotId.value)} / ${itemLabel}).`,
    "",
    `Target mods (all at maximum tier, ${selectedMods.value.length}/6 selected):`,
    ...selectedMods.value.map(
      (m, i) =>
        `${i + 1}. [${m.type}] ${cleanModText(m.text_en)} (group: ${m.groups.join(",")}, key: ${m.key}, lv ${m.level})`,
    ),
    "",
    starterP || starterS
      ? "Starter mods already on the item (assume present):"
      : "",
    starterP
      ? `- prefix: ${cleanModText(starterP.text_en)} (group: ${starterP.groups.join(",")})`
      : "",
    starterS
      ? `- suffix: ${cleanModText(starterS.text_en)} (group: ${starterS.groups.join(",")})`
      : "",
    "",
    "Return:",
    "- Cheapest currency-step path (Alchemy / Augmentation / Exalt / Annul / Chaos / Essence / Recombinator / etc.)",
    "- Estimated cost in Divine Orbs per attempt + total expected cost",
    "- Estimated success probability per attempt",
    "- 2-3 alternative paths with same metrics",
    "- Note POE2 mod weights, group exclusions, ilvl requirements",
  ]
    .filter(Boolean)
    .join("\n");
}

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
        ／ 候補 {{ filteredMods.length }} 件
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

    <!-- mod ピッカー (プレフィックス・サフィックス 2 列) -->
    <div class="grid grid-cols-2 gap-4">
      <div class="rounded-lg border border-[var(--color-border)] overflow-hidden">
        <div class="px-3 py-2 bg-[var(--color-surface)] text-xs uppercase tracking-wider text-[var(--color-accent)]">
          プレフィックス（{{ prefixMods.length }} 候補）
        </div>
        <div class="max-h-80 overflow-y-auto divide-y divide-[var(--color-border)]">
          <button
            v-for="m in prefixMods"
            :key="m.key"
            @click="toggleMod(m)"
            :class="[
              'w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface)] transition flex items-start gap-2',
              slot.selectedKeys.includes(m.key)
                ? 'bg-[var(--color-surface-2)] border-l-2 border-[var(--color-accent)]'
                : 'border-l-2 border-transparent',
            ]"
          >
            <span class="text-[var(--color-text-muted)] font-mono w-8 shrink-0">lv{{ m.level }}</span>
            <span class="flex-1">
              <span class="text-[var(--color-text)]">{{ cleanModText(m.text_ja) }}</span>
              <span class="text-[var(--color-text-muted)] block text-[10px] mt-0.5">
                {{ m.name_ja || m.name_en }} · {{ m.groups[0] }}
              </span>
            </span>
            <span v-if="slot.selectedKeys.includes(m.key)" class="text-[var(--color-accent)]">✓</span>
          </button>
          <p v-if="!prefixMods.length" class="p-4 text-xs text-[var(--color-text-muted)] italic">
            該当なし
          </p>
        </div>
      </div>

      <div class="rounded-lg border border-[var(--color-border)] overflow-hidden">
        <div class="px-3 py-2 bg-[var(--color-surface)] text-xs uppercase tracking-wider text-[var(--color-accent)]">
          サフィックス（{{ suffixMods.length }} 候補）
        </div>
        <div class="max-h-80 overflow-y-auto divide-y divide-[var(--color-border)]">
          <button
            v-for="m in suffixMods"
            :key="m.key"
            @click="toggleMod(m)"
            :class="[
              'w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface)] transition flex items-start gap-2',
              slot.selectedKeys.includes(m.key)
                ? 'bg-[var(--color-surface-2)] border-l-2 border-[var(--color-accent)]'
                : 'border-l-2 border-transparent',
            ]"
          >
            <span class="text-[var(--color-text-muted)] font-mono w-8 shrink-0">lv{{ m.level }}</span>
            <span class="flex-1">
              <span class="text-[var(--color-text)]">{{ cleanModText(m.text_ja) }}</span>
              <span class="text-[var(--color-text-muted)] block text-[10px] mt-0.5">
                {{ m.name_ja || m.name_en }} · {{ m.groups[0] }}
              </span>
            </span>
            <span v-if="slot.selectedKeys.includes(m.key)" class="text-[var(--color-accent)]">✓</span>
          </button>
          <p v-if="!suffixMods.length" class="p-4 text-xs text-[var(--color-text-muted)] italic">
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
      </p>
      <div class="grid grid-cols-2 gap-3">
        <select
          v-model="slot.starterPrefix"
          class="px-3 py-2 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-xs"
        >
          <option value="">プレフィックス: 指定なし</option>
          <option v-for="m in prefixMods" :key="m.key" :value="m.key">
            {{ cleanModText(m.text_ja) }} (lv{{ m.level }})
          </option>
        </select>
        <select
          v-model="slot.starterSuffix"
          class="px-3 py-2 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-xs"
        >
          <option value="">サフィックス: 指定なし</option>
          <option v-for="m in suffixMods" :key="m.key" :value="m.key">
            {{ cleanModText(m.text_ja) }} (lv{{ m.level }})
          </option>
        </select>
      </div>
    </div>

    <div class="mt-6 flex gap-3 items-center">
      <button
        @click="onAskAi"
        :disabled="!selectedMods.length"
        class="px-5 py-2 rounded bg-[var(--color-accent)] text-black font-medium text-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition"
      >
        🤖 秘書（AI）に最短経路を相談
      </button>
      <p class="text-[10px] text-[var(--color-text-muted)]">
        Mod データ: RePoE fork (poe2) JA / EN ／ AI 送信時は英名・stat 範囲・group・lv を渡します
      </p>
    </div>
  </div>
</template>
