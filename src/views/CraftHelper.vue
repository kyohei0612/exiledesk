<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import {
  ITEM_TAGS,
  getModGroupsForItem,
  cleanModText,
  modWeightFor,
  modSpecialKind,
  type Mod,
  type ModGroup,
} from "../data/mods";
import { jaTag, tagColor } from "../i18n/mod-tags-ja";

function specialKindLabel(
  kind: ReturnType<typeof modSpecialKind>,
): string {
  if (kind === "essence") return "エッセンス";
  if (kind === "corrupt") return "コラプト";
  if (kind === "desecrated") return "冒涜";
  return "";
}

function specialKindColor(
  kind: ReturnType<typeof modSpecialKind>,
): string {
  if (kind === "essence") return "bg-amber-700/40 text-amber-200";
  if (kind === "corrupt") return "bg-red-700/40 text-red-200";
  if (kind === "desecrated") return "bg-purple-700/40 text-purple-200";
  return "";
}
import itemsJa from "../i18n/items-ja.json";

/** 現在のアイテムタグに合致しそうなベース名候補（datalist autocomplete 用） */
const BASE_PATTERNS: Record<string, RegExp> = {
  ring: /の指輪$/,
  amulet: /のアミュレット$/,
  belt: /(のベルト|帯)/,
  helmet: /(兜|ヘルム|フード|キャップ|帽|ヘッド)/,
  body_armour: /(ローブ|アーマー|ベスト|チェスト|鎧|甲|衣|装束|サブリガード)/,
  gloves: /(手袋|グローブ|ガントレット|籠手|拳)/,
  boots: /(ブーツ|靴|サンダル|履|脚甲)/,
  shield: /(盾|シールド|バックラー)/,
  focus: /(オーブ|フォーカス)/,
  quiver: /(クイバー|矢筒)/,
  wand: /ワンド/,
  sceptre: /(セプター|ホーリー)/,
  staff: /スタッフ/,
  sword: /(剣|ソード|ブレード)/,
  mace: /(メイス|ハンマー|モール|棍)/,
  axe: /(斧|アックス)/,
  spear: /(槍|スピア|ジャベリン)/,
  flail: /フレイル/,
  bow: /(弓|ボウ)/,
  crossbow: /(クロスボウ|弩)/,
  talisman: /タリスマン/,
};

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
  /** ベース固有のプレフィックス上限増減（黄昏の指輪 +1 等） */
  prefixDelta?: number;
  /** ベース固有のサフィックス上限増減（黄昏の指輪 -1 等） */
  suffixDelta?: number;
  /** コラプト済アイテム想定（範囲外値も許容、AI に通知） */
  isCorruptItem?: boolean;
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

/** 武器スロット（タイプ選択が必要）か */
const isWeaponSlot = computed(
  () => activeSlotId.value === "weapon1" || activeSlotId.value === "weapon2",
);

/** 武器タイプ dropdown の候補（武器1=メイン武器全種、武器2=オフハンド: 盾・矢筒・フォーカス・片手武器） */
const weaponTypeOptions = computed(() => {
  const mainHand = [
    "wand",
    "sceptre",
    "staff",
    "sword",
    "mace",
    "axe",
    "spear",
    "flail",
    "bow",
    "crossbow",
  ];
  const offHand = [
    "shield",
    "focus",
    "quiver",
    // 片手武器（デュアルウィールド用、2 ハンドの staff/bow/crossbow を除外）
    "wand",
    "sceptre",
    "sword",
    "mace",
    "axe",
    "spear",
    "flail",
  ];
  const allowed =
    activeSlotId.value === "weapon2" ? offHand : mainHand;
  return ITEM_TAGS.filter((t) => allowed.includes(t.id));
});

/** items-ja.json から現在のアイテムタイプに合うベース名候補（datalist 用） */
const baseNameSuggestions = computed<string[]>(() => {
  const re = BASE_PATTERNS[slot.value.itemTag];
  if (!re) return [];
  const ja = itemsJa as Record<string, string>;
  const out: string[] = [];
  for (const name of Object.values(ja)) {
    if (re.test(name)) out.push(name);
  }
  return out.sort((a, b) => a.localeCompare(b, "ja"));
});

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

/** 目標 mod から特定 key を削除（サマリの個別削除ボタン用） */
function removeSelectedMod(key: string) {
  const set = new Set(slot.value.selectedKeys);
  set.delete(key);
  slot.value.selectedKeys = Array.from(set);
}

// ============== Paste レビュー モーダル ==============
type ModClassification =
  | "normal"
  | "implicit"
  | "corrupt"
  | "desecrated"
  | "essence"
  | "skip";

const CLASSIFICATION_OPTIONS: { value: ModClassification; label: string }[] = [
  { value: "normal", label: "通常" },
  { value: "implicit", label: "暗黙" },
  { value: "corrupt", label: "破損" },
  { value: "desecrated", label: "冒涜" },
  { value: "essence", label: "エッセンス" },
  { value: "skip", label: "除外" },
];

type PasteReviewItem =
  | {
      type: "matched";
      indices: number[];
      lineTexts: string[];
      groupId: string;
      selectedTierKey: string;
      classification: ModClassification;
      /** 5→6 自動分割で追加された行か（暗黙解除時に取除く） */
      autoSplit?: boolean;
    }
  | {
      type: "unmatched";
      index: number;
      lineText: string;
      classification: ModClassification;
    };

const pasteReviewVisible = ref(false);
const pasteReviewItems = ref<PasteReviewItem[]>([]);
/** 「常に 6 mod に補完」モード（rare 想定。デフォルト ON） */
const enforceSixMods = ref(true);

/** "通常 + 特殊系" は explicit mod としてカウント、暗黙/除外は除外 */
function countsAsExplicit(item: PasteReviewItem): boolean {
  if (item.type !== "matched") return false;
  return ["normal", "corrupt", "desecrated", "essence"].includes(
    item.classification,
  );
}

const effectiveModCount = computed(
  () => pasteReviewItems.value.filter(countsAsExplicit).length,
);

/** 動的 prefix/suffix 上限（ベース修飾子 prefixDelta/suffixDelta 反映） */
const prefixMax = computed(() => 3 + (slot.value.prefixDelta ?? 0));
const suffixMax = computed(() => 3 + (slot.value.suffixDelta ?? 0));
const totalModMax = computed(() => prefixMax.value + suffixMax.value);

function getGroupById(id: string): ModGroup | undefined {
  return availableGroups.value.find((g) => g.id === id);
}

function cancelPasteReview() {
  pasteReviewVisible.value = false;
  pasteReviewItems.value = [];
}

/** 5 → 6 の自動分割: splittable な mod を見つけて反対 variant を追加 */
function tryAutoSplitForFive() {
  if (pasteReviewItems.value.some((i) => i.type === "matched" && i.autoSplit)) {
    return; // 既に追加済
  }
  for (let i = 0; i < pasteReviewItems.value.length; i++) {
    const item = pasteReviewItems.value[i];
    if (item.type !== "matched") continue;
    if (!countsAsExplicit(item)) continue;
    const cur = modByKey.value.get(item.selectedTierKey);
    if (!cur) continue;
    const myKey = modTextKey(cur.text_ja);
    const opposite = allAvailableMods.value.find(
      (m) => modTextKey(m.text_ja) === myKey && m.type !== cur.type,
    );
    if (!opposite) continue;
    const oppGroupId = opposite.groups[0];
    pasteReviewItems.value.splice(i + 1, 0, {
      type: "matched",
      indices: [...item.indices],
      lineTexts: ["（自動分割：暗黙化により補填）"],
      groupId: oppGroupId,
      selectedTierKey: opposite.key,
      classification: "normal",
      autoSplit: true,
    });
    return;
  }
}

/** 6 に戻ったら autoSplit で挿入されたものを取り除く */
function removeAutoSplit() {
  pasteReviewItems.value = pasteReviewItems.value.filter(
    (i) => !(i.type === "matched" && i.autoSplit),
  );
}

// 分類変更のたびに count を再評価。enforceSixMods が ON のとき自動補完
watch(effectiveModCount, (n) => {
  if (!pasteReviewVisible.value) return;
  if (!enforceSixMods.value) return;
  if (n < totalModMax.value) {
    tryAutoSplitForFive();
  } else if (n > totalModMax.value) {
    const idx = pasteReviewItems.value
      .map((i, k) => ({ i, k }))
      .reverse()
      .find(({ i }) => i.type === "matched" && i.autoSplit)?.k;
    if (idx !== undefined) pasteReviewItems.value.splice(idx, 1);
  }
});

// トグル OFF にしたら autoSplit を取り除く（任意モード）
watch(enforceSixMods, (on) => {
  if (!on) {
    pasteReviewItems.value = pasteReviewItems.value.filter(
      (i) => !(i.type === "matched" && i.autoSplit),
    );
  }
});

function confirmPasteReview() {
  // 既存の選択は paste 結果で上書き
  const newKeys = new Set<string>();

  // 順序保ったまま追加候補を構築（review の順 = paste 順）
  const candidates: { key: string; type: "prefix" | "suffix" }[] = [];
  for (const item of pasteReviewItems.value) {
    if (!countsAsExplicit(item)) continue;
    if (item.type !== "matched") continue;
    const tierMod = modByKey.value.get(item.selectedTierKey);
    if (!tierMod) continue;
    candidates.push({ key: item.selectedTierKey, type: tierMod.type });
  }

  // プレ/サフ それぞれ先勝ちで上限まで（base 修飾子反映）
  let pCount = 0;
  let sCount = 0;
  const skipped: { key: string; type: string }[] = [];
  for (const c of candidates) {
    if (c.type === "prefix" && pCount < prefixMax.value) {
      newKeys.add(c.key);
      pCount++;
    } else if (c.type === "suffix" && sCount < suffixMax.value) {
      newKeys.add(c.key);
      sCount++;
    } else {
      skipped.push(c);
    }
  }

  slot.value.selectedKeys = Array.from(newKeys);
  pasteReviewVisible.value = false;
  pasteReviewItems.value = [];

  if (skipped.length > 0) {
    const skippedMods = skipped
      .map((s) => {
        const m = modByKey.value.get(s.key);
        return m
          ? `${s.type === "prefix" ? "P" : "S"}: ${cleanModText(m.text_ja).split("\n").join(" / ")}`
          : "";
      })
      .filter(Boolean)
      .join("\n  - ");
    alert(
      [
        `プレ ${pCount}/3、サフ ${sCount}/3 で上限超過のため ${skipped.length} 件未反映:`,
        `  - ${skippedMods}`,
        "",
        "※ 同名グループに prefix/suffix 両方ある mod (レアリティ等) は値が高い時、",
        "  実は両 variant が乗ってる可能性があります（例: 30% = prefix15% + suffix15%）。",
        "  該当する場合は paste テキストを 2 行に分割して再解析してください。",
        "暗黙/除外/別 tier 見直しでも調整可能です。",
      ].join("\n"),
    );
  }
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
  /** "プレフィックスモッド +1個" 等から抽出（黄昏の指輪等の +/-1 ベース用） */
  prefixDelta?: number;
  suffixDelta?: number;
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

    // ベース固有の prefix/suffix +/-N 個 修飾子（黄昏の指輪 等）
    const pd = line.match(/^プレフィックスモッド\s*([+\-]?\d+)個?/);
    if (pd) {
      result.prefixDelta = parseInt(pd[1]);
      continue;
    }
    const sd = line.match(/^サフィックスモッド\s*([+\-]?\d+)個?/);
    if (sd) {
      result.suffixDelta = parseInt(sd[1]);
      continue;
    }

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

interface MatchAssignment {
  /** 入力行のうちこの mod に紐づく index 群 */
  indices: number[];
  /** 一致した mod（具体 tier） */
  mod: Mod;
}

/**
 * パースしたコピペ mod 行を bundle にマッチング（2 パス + type-balancing）。
 * - 同一テキストキーで prefix/suffix 両variantが存在する場合、現在の P/S 件数
 *   に応じて自動的にバランスする側を選択（プレ3埋まってたらサフ側を選ぶ）
 * - 1 行マッチ優先 → 残りで multi-line combo
 */
function matchModLines(
  lines: string[],
  pool: Mod[],
): { assignments: MatchAssignment[]; matched: Mod[]; unmatched: string[] } {
  // 全 variant を保持（key → Mod[] / level 降順）
  const keyToAllMods = new Map<string, Mod[]>();
  for (const m of pool) {
    const k = modTextKey(m.text_ja);
    if (!k) continue;
    const list = keyToAllMods.get(k) ?? [];
    list.push(m);
    keyToAllMods.set(k, list);
  }
  for (const list of keyToAllMods.values()) {
    list.sort((a, b) => b.level - a.level);
  }

  let pCount = 0;
  let sCount = 0;
  const assignments: MatchAssignment[] = [];
  const consumed = new Set<number>();
  const matchedKeys = new Set<string>();

  /**
   * 候補から最適 mod を選ぶ。
   * - 同 key で prefix/suffix 両方ある場合、現状の P/S 件数で偏ってる側を補完
   * - 既に matched なものは除外
   */
  function pickBalanced(candidates: Mod[]): Mod | null {
    const avail = candidates.filter((c) => !matchedKeys.has(c.key));
    if (avail.length === 0) return null;
    let bestPrefix: Mod | null = null;
    let bestSuffix: Mod | null = null;
    for (const c of avail) {
      if (c.type === "prefix" && !bestPrefix) bestPrefix = c;
      if (c.type === "suffix" && !bestSuffix) bestSuffix = c;
    }
    if (bestPrefix && bestSuffix) {
      // 偏り回避: 上限超過側を避ける
      if (pCount >= 3 && sCount < 3) return bestSuffix;
      if (sCount >= 3 && pCount < 3) return bestPrefix;
      // 通常: 件数が少ない側を補完
      if (pCount < sCount) return bestPrefix;
      if (sCount < pCount) return bestSuffix;
      // 同数 → 高 level (avail[0])
      return avail[0];
    }
    return bestPrefix ?? bestSuffix;
  }

  // Pass 1: 1 行マッチ
  for (let i = 0; i < lines.length; i++) {
    const k = modTextKey(lines[i]);
    if (!k) continue;
    const candidates = keyToAllMods.get(k);
    if (!candidates) continue;
    const chosen = pickBalanced(candidates);
    if (!chosen) continue;
    assignments.push({ indices: [i], mod: chosen });
    matchedKeys.add(chosen.key);
    consumed.add(i);
    if (chosen.type === "prefix") pCount++;
    else sCount++;
  }

  // Pass 2: 残った行の組合せ
  const remaining = Array.from({ length: lines.length }, (_, i) => i).filter(
    (i) => !consumed.has(i),
  );
  type Candidate = { indices: number[]; key: string };
  const candidates: Candidate[] = [];
  for (let k = 2; k <= 3; k++) {
    if (k > remaining.length) break;
    for (const combo of combinations(remaining.length, k)) {
      const indices = combo.map((c) => remaining[c]);
      const segment = indices.map((i) => lines[i]).join("\n");
      const ck = modTextKey(segment);
      if (!ck) continue;
      if (!keyToAllMods.has(ck)) continue;
      candidates.push({ indices, key: ck });
    }
  }
  candidates.sort((a, b) => {
    if (a.indices.length !== b.indices.length) {
      return b.indices.length - a.indices.length;
    }
    return a.indices[0] - b.indices[0];
  });
  for (const c of candidates) {
    if (c.indices.some((i) => consumed.has(i))) continue;
    const allVariants = keyToAllMods.get(c.key) ?? [];
    const chosen = pickBalanced(allVariants);
    if (!chosen) continue;
    assignments.push({ indices: c.indices, mod: chosen });
    matchedKeys.add(chosen.key);
    c.indices.forEach((i) => consumed.add(i));
    if (chosen.type === "prefix") pCount++;
    else sCount++;
  }

  // 自動分割: rare 期待値は 6 mods。マッチが 5 で、既マッチに prefix/suffix
  // 両 variant 存在の splittable mod があれば、相手 variant を追加して 6 に。
  // （レアリティ等、POE2 では合計表記される可能性がある mod 用）
  if (assignments.length === 5) {
    for (let i = 0; i < assignments.length; i++) {
      if (assignments.length >= 6) break;
      const a = assignments[i];
      const myKey = modTextKey(a.mod.text_ja);
      const opposite = pool.find(
        (m) =>
          modTextKey(m.text_ja) === myKey &&
          m.type !== a.mod.type &&
          !matchedKeys.has(m.key),
      );
      if (!opposite) continue;
      if (opposite.type === "prefix" && pCount >= 3) continue;
      if (opposite.type === "suffix" && sCount >= 3) continue;
      // 同 lv の variant を追加（半分扱いは tier picker で調整）
      assignments.splice(i + 1, 0, {
        indices: [...a.indices],
        mod: opposite,
      });
      matchedKeys.add(opposite.key);
      if (opposite.type === "prefix") pCount++;
      else sCount++;
      i++; // skip the inserted entry
    }
  }

  const matched = assignments.map((a) => a.mod);
  const unmatched = lines.filter((_, i) => !consumed.has(i));
  return { assignments, matched, unmatched };
}

function applyPaste() {
  const parsed = parseJaClipboard(slot.value.pasteText);
  if (!parsed) {
    alert("コピペ内容を解析できませんでした");
    return;
  }
  if (parsed.itemLevel) slot.value.itemLevel = parsed.itemLevel;
  slot.value.parsedName = parsed.name;
  // ベース判定: 1行目（magic）or 2行目（rare）から base パターン一致を選ぶ
  const re = BASE_PATTERNS[slot.value.itemTag];
  let baseName = parsed.base;
  if (re) {
    if (parsed.name && re.test(parsed.name)) baseName = parsed.name;
    else if (parsed.base && re.test(parsed.base)) baseName = parsed.base;
  }
  slot.value.parsedBase = baseName;
  slot.value.parsedQuality = parsed.quality;
  slot.value.parsedQualityCategory = parsed.qualityCategory;
  slot.value.prefixDelta = parsed.prefixDelta;
  slot.value.suffixDelta = parsed.suffixDelta;

  const { assignments } = matchModLines(
    parsed.modLines,
    allAvailableMods.value,
  );

  // 各 assignment → matched item (classification は特殊種別を自動セット)
  const items: PasteReviewItem[] = [];
  for (const a of assignments) {
    const groupId = a.mod.groups[0];
    if (!groupId) continue;
    const kind = modSpecialKind(a.mod);
    let cls: ModClassification = "normal";
    if (kind === "essence") cls = "essence";
    else if (kind === "corrupt") cls = "corrupt";
    else if (kind === "desecrated") cls = "desecrated";
    items.push({
      type: "matched",
      indices: a.indices,
      lineTexts: a.indices.map((i) => parsed.modLines[i]),
      groupId,
      selectedTierKey: a.mod.key,
      classification: cls,
    });
  }
  // 未マッチ行 → unmatched item
  const usedIndices = new Set<number>();
  for (const a of assignments) for (const i of a.indices) usedIndices.add(i);
  for (let i = 0; i < parsed.modLines.length; i++) {
    if (usedIndices.has(i)) continue;
    items.push({
      type: "unmatched",
      index: i,
      lineText: parsed.modLines[i],
      classification: "normal",
    });
  }
  // 表示順を paste 元の順に近づける
  items.sort((a, b) => {
    const ai = a.type === "matched" ? Math.min(...a.indices) : a.index;
    const bi = b.type === "matched" ? Math.min(...b.indices) : b.index;
    return ai - bi;
  });

  pasteReviewItems.value = items;
  pasteReviewVisible.value = true;
}

// ============== AI プロンプト構築 ==============
/** paste テキストから現在マッチしてない行を返す（AI に補完させる用） */
function getUnmatchedFromPaste(): string[] {
  const parsed = parseJaClipboard(slot.value.pasteText);
  if (!parsed) return [];
  const { unmatched } = matchModLines(
    parsed.modLines,
    allAvailableMods.value,
  );
  return unmatched;
}

function buildAiPrompt(): string {
  const itemLabel =
    ITEM_TAGS.find((t) => t.id === slot.value.itemTag)?.label ??
    slot.value.itemTag;
  const starterP = modByKey.value.get(slot.value.starterPrefix);
  const starterS = modByKey.value.get(slot.value.starterSuffix);
  const hasStarterPrefix = !!starterP;
  const hasStarterSuffix = !!starterS;
  const needSuggestStarter = !hasStarterPrefix || !hasStarterSuffix;
  const unmatched = getUnmatchedFromPaste();

  return [
    `Plan the cheapest crafting path for a Path of Exile 2 ${slot.value.itemTag} at item level ${slot.value.itemLevel} (slot: ${slotLabel(activeSlotId.value)} / ${itemLabel}).`,
    slot.value.parsedBase ? `Base item (parsed): ${slot.value.parsedBase}` : "",
    slot.value.parsedQuality
      ? `Quality bonus: +${slot.value.parsedQuality}%${slot.value.parsedQualityCategory ? ` (${slot.value.parsedQualityCategory})` : ""} — boosts the values of the matched mod category, factor in when computing final values.`
      : "",
    (slot.value.prefixDelta ?? 0) !== 0 || (slot.value.suffixDelta ?? 0) !== 0
      ? `Base modifier: prefix limit ${3 + (slot.value.prefixDelta ?? 0)} (delta ${slot.value.prefixDelta ?? 0}), suffix limit ${3 + (slot.value.suffixDelta ?? 0)} (delta ${slot.value.suffixDelta ?? 0}) — non-standard rare cap from base item.`
      : "",
    slot.value.isCorruptItem
      ? `** Item is corrupted ** — values may be outside normal tier ranges due to Vaal Orb scaling. Account for this when judging tiers and crafting feasibility (corrupted items typically can't be modified further with normal currency).`
      : "",
    "",
    `Target mods (${selectedMods.value.length}/6 selected):`,
    ...selectedMods.value.map((m, i) => {
      const kind = modSpecialKind(m);
      const kindStr = kind ? ` [SPECIAL: ${kind}]` : "";
      return `${i + 1}. [${m.type}]${kindStr} ${cleanModText(m.text_en)} (group: ${m.groups.join(",")}, key: ${m.key}, lv ${m.level})`;
    }),
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
    unmatched.length > 0
      ? `\n** ADDITIONAL TARGET MOD LINES (paste から抽出、bundle にマッチせず) **\n` +
        unmatched.map((l) => `- ${l}`).join("\n") +
        `\nInterpret these as additional target mods. POE2 may have hybrid mods (multiple stats per affix labeled like P6, S2) that aren't in our bundle. Use your training knowledge of POE2 affix structure to identify the correct mod groups and tiers.`
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
      <label v-if="isWeaponSlot" class="flex items-center gap-2 text-sm">
        <span class="text-[var(--color-text-muted)]">
          {{ activeSlotId === "weapon2" ? "オフハンド:" : "武器タイプ:" }}
        </span>
        <select
          v-model="slot.itemTag"
          class="px-3 py-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-sm"
        >
          <option v-for="t in weaponTypeOptions" :key="t.id" :value="t.id">
            {{ t.label }}
          </option>
        </select>
      </label>
      <label class="flex items-center gap-2 text-sm">
        <span class="text-[var(--color-text-muted)]">ベース:</span>
        <input
          v-model="slot.parsedBase"
          list="base-name-suggestions"
          type="text"
          placeholder="例: エメラルドの指輪"
          class="px-3 py-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-sm w-52"
        />
        <datalist id="base-name-suggestions">
          <option v-for="b in baseNameSuggestions" :key="b" :value="b" />
        </datalist>
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
    <div class="grid grid-cols-2 gap-4 items-start">
      <div class="rounded-lg border border-[var(--color-border)] overflow-hidden">
        <div class="px-3 py-2 bg-[var(--color-surface)] text-xs uppercase tracking-wider text-[var(--color-accent)] sticky top-0 z-10">
          プレフィックス（{{ prefixGroups.length }} group）
        </div>
        <div class="divide-y divide-[var(--color-border)]">
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
        <div class="px-3 py-2 bg-[var(--color-surface)] text-xs uppercase tracking-wider text-[var(--color-accent)] sticky top-0 z-10">
          サフィックス（{{ suffixGroups.length }} group）
        </div>
        <div class="divide-y divide-[var(--color-border)]">
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
          class="flex items-baseline gap-2 group"
        >
          <span
            :class="[
              'text-[10px] uppercase font-semibold tracking-wider w-12 shrink-0',
              m.type === 'prefix' ? 'text-blue-300' : 'text-amber-300',
            ]"
          >
            {{ m.type === "prefix" ? "プレ" : "サフ" }}
          </span>
          <span
            v-if="modSpecialKind(m)"
            :class="['px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0', specialKindColor(modSpecialKind(m))]"
          >{{ specialKindLabel(modSpecialKind(m)) }}</span>
          <span class="flex-1 text-[var(--color-text)] whitespace-pre-line">{{ cleanModText(m.text_ja) }}</span>
          <span class="text-[10px] text-[var(--color-text-muted)]">lv{{ m.level }}</span>
          <button
            @click="removeSelectedMod(m.key)"
            class="text-[var(--color-text-muted)] hover:text-red-300 text-xs px-1 opacity-50 group-hover:opacity-100 transition"
            title="この mod を削除"
          >✕</button>
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

    <!-- ========== Paste レビュー モーダル ========== -->
    <div
      v-if="pasteReviewVisible"
      class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      @click.self="cancelPasteReview"
    >
      <div
        class="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col"
      >
        <div class="px-4 py-3 border-b border-[var(--color-border)]">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div class="flex items-baseline gap-2 flex-wrap">
              <h3 class="text-base font-semibold">📋 解析結果確認</h3>
              <span
                v-if="slot.parsedBase"
                class="text-sm text-[var(--color-accent)]"
              >／ {{ slot.parsedBase }}</span>
              <span v-if="slot.parsedName" class="text-xs text-[var(--color-text-muted)]">
                ({{ slot.parsedName }})
              </span>
            </div>
            <div class="flex items-center gap-3 flex-wrap">
              <label class="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" v-model="slot.isCorruptItem" />
                <span class="text-red-300">コラプト想定</span>
                <span class="text-[10px] text-[var(--color-text-muted)]">(範囲外値許容)</span>
              </label>
              <label class="flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" v-model="enforceSixMods" />
                <span class="text-[var(--color-text-muted)]">常に 6 mod に補完</span>
                <span class="text-[10px] text-[var(--color-text-muted)]">(rare 想定)</span>
              </label>
            </div>
          </div>
          <p class="text-xs text-[var(--color-text-muted)] mt-1">
            各行の分類と tier を選択して「適用」。
            <span class="text-[var(--color-accent)]">
              explicit mod 数: {{ effectiveModCount }} / {{ totalModMax }}
              （プレ {{ prefixMax }} ・サフ {{ suffixMax }}）
            </span>
            <span
              v-if="(slot.prefixDelta ?? 0) !== 0 || (slot.suffixDelta ?? 0) !== 0"
              class="text-[10px] text-[var(--color-accent)] ml-2"
            >
              ベース修飾: P{{ slot.prefixDelta && slot.prefixDelta > 0 ? "+" : "" }}{{ slot.prefixDelta ?? 0 }} /
              S{{ slot.suffixDelta && slot.suffixDelta > 0 ? "+" : "" }}{{ slot.suffixDelta ?? 0 }}
            </span>
            <span v-if="enforceSixMods">（5 以下になった瞬間 splittable mod を自動分割）</span>
            <span v-else>（補完 OFF: そのまま適用）</span>
          </p>
        </div>
        <div class="flex-1 overflow-y-auto divide-y divide-[var(--color-border)]">
          <div
            v-for="(item, idx) in pasteReviewItems"
            :key="idx"
            class="px-4 py-3 hover:bg-[var(--color-surface-2)]/30"
            :class="{
              'opacity-40':
                item.classification === 'implicit' ||
                item.classification === 'skip',
              'bg-[var(--color-surface-2)]/30':
                item.type === 'matched' && item.autoSplit,
            }"
          >
            <!-- 行テキスト -->
            <div class="text-xs font-mono text-[var(--color-text)] mb-2">
              <template v-if="item.type === 'matched'">
                <span
                  v-if="item.autoSplit"
                  class="text-[10px] text-[var(--color-accent)] mr-2"
                  >🔀 自動分割</span
                >
                <span v-for="(lt, li) in item.lineTexts" :key="li">
                  {{ lt }}{{ li < item.lineTexts.length - 1 ? " / " : "" }}
                </span>
              </template>
              <template v-else>
                <div>{{ item.lineText }}</div>
              </template>
            </div>
            <!-- コントロール -->
            <div class="flex items-center gap-3 flex-wrap text-xs">
              <select
                v-model="item.classification"
                class="px-2 py-1 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-xs"
              >
                <option
                  v-for="opt in CLASSIFICATION_OPTIONS"
                  :key="opt.value"
                  :value="opt.value"
                >{{ opt.label }}</option>
              </select>
              <template v-if="item.type === 'matched'">
                <span
                  :class="
                    getGroupById(item.groupId)?.type === 'prefix'
                      ? 'text-blue-300'
                      : 'text-amber-300'
                  "
                  class="font-semibold"
                >
                  {{ getGroupById(item.groupId)?.type === "prefix" ? "プレ" : "サフ" }}
                </span>
                <span class="text-[var(--color-text-muted)]">{{ item.groupId }}</span>
                <select
                  v-model="item.selectedTierKey"
                  class="px-2 py-1 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-xs flex-1 min-w-[12rem]"
                >
                  <option
                    v-for="(t, ti) in getGroupById(item.groupId)?.tiers ?? []"
                    :key="t.key"
                    :value="t.key"
                  >
                    T{{ ti + 1 }} lv{{ t.level }}
                    {{ cleanModText(t.text_ja).split("\n").join(" / ") }}
                  </option>
                </select>
              </template>
              <template v-else>
                <span class="text-orange-300/80">未マッチ</span>
                <span class="text-[10px] text-[var(--color-text-muted)]">
                  bundle 該当なし。AI プロンプトに含めます
                </span>
              </template>
            </div>
          </div>
          <p
            v-if="!pasteReviewItems.length"
            class="px-4 py-6 text-xs text-[var(--color-text-muted)] italic text-center"
          >
            mod 行が検出されませんでした
          </p>
        </div>
        <div class="px-4 py-3 border-t border-[var(--color-border)] flex justify-end gap-2">
          <button
            @click="cancelPasteReview"
            class="px-4 py-2 rounded text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] transition"
          >キャンセル</button>
          <button
            @click="confirmPasteReview"
            class="px-4 py-2 rounded bg-[var(--color-accent)] text-black text-sm font-medium hover:bg-[var(--color-accent-hover)] transition"
          >適用</button>
        </div>
      </div>
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
