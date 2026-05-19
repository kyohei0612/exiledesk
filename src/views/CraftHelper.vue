<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import {
  ITEM_TAGS,
  allMods,
  getModGroupsForItem,
  getModGroupsByKindForItem,
  cleanModText,
  modWeightFor,
  modSpecialKind,
  essenceModKeysForSlot,
  type Mod,
  type ModGroup,
} from "../data/mods";
import { getBaseByName, type ItemBase } from "../data/item-bases";
import { jaTag, tagColor, hasJaTag } from "../i18n/mod-tags-ja";
import { parseJaClipboard } from "../parser/item-text";
import { askClaude } from "../services/ai-client";
import { applyCraftIcons, translateEnToJa } from "../services/craft-icons";

/** mod の tags 配列のうち、ユーザー向け既知タグだけを返す（内部 ID を排除） */
function visibleTags(mod: Mod): string[] {
  return (mod.tags ?? []).filter(hasJaTag);
}

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

/** 行全体に乗せるグラデーション背景クラス */
function specialKindBgGradient(
  kind: ReturnType<typeof modSpecialKind>,
): string {
  if (kind === "desecrated")
    return "bg-gradient-to-r from-purple-900/50 via-purple-800/30 to-transparent";
  if (kind === "corrupt")
    return "bg-gradient-to-r from-red-900/50 via-red-800/30 to-transparent";
  if (kind === "essence")
    return "bg-gradient-to-r from-amber-900/50 via-amber-800/30 to-transparent";
  return "";
}

/** classification → bg gradient（review modal 用） */
function classificationBg(c: ModClassification): string {
  if (c === "desecrated") return specialKindBgGradient("desecrated");
  if (c === "corrupt") return specialKindBgGradient("corrupt");
  if (c === "essence") return specialKindBgGradient("essence");
  return "";
}
import itemsJa from "../i18n/items-ja.json";

/** 現在のアイテムタグに合致しそうなベース名候補（datalist autocomplete 用） */
// Magic 接尾「 (大渦の変化)」等の suffix が後続しても match するよう、末尾 $ を除去
// （旧 /の指輪$/ では "真珠の指輪 (大渦の変化)" がヒットせず暗黙除外が機能しなかった）
const BASE_PATTERNS: Record<string, RegExp> = {
  ring: /の指輪/,
  amulet: /のアミュレット/,
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
  warstaff: /(クォータースタッフ|長杖)/,
  sword: /(剣|ソード|ブレード)/,
  mace: /(メイス|ハンマー|モール|棍)/,
  axe: /(斧|アックス)/,
  spear: /(槍|スピア|ジャベリン)/,
  flail: /フレイル/,
  bow: /(弓|ボウ)/,
  crossbow: /(クロスボウ|弩)/,
  claw: /(鉤爪|クロウ)/,
  dagger: /(短剣|ダガー)/,
  fishing_rod: /(釣り竿|釣竿)/,
  trap: /トラップ/,
  talisman: /タリスマン/,
};

// ============== スロット定義 ==============
/**
 * クラフト相談ツールが対応する slot 一覧。
 *
 * 2026-05-09 オーナー判断 (「これ MOD 大変だな... 指輪アミュレットだけにした方が無難か？」 →
 * 宝飾品 3 種に絞る方針) で、宝飾品 (指輪・アミュレット・ベルト) のみに限定。
 * 武器・防具は base type / base 別 implicit が複雑で精度担保が困難なため、
 * 装備 DPS 比較ツール (tool-dps) で PoB に任せる役割分担。
 *
 * bundle data 自体は全 slot 維持しているので、tool-dps で武器・防具 mod も使える。
 */
const SLOT_DEFS = [
  { id: "ring1", label: "指輪1", defaultTag: "ring" },
  { id: "ring2", label: "指輪2", defaultTag: "ring" },
  { id: "amulet", label: "首飾り", defaultTag: "amulet" },
  { id: "belt", label: "ベルト", defaultTag: "belt" },
] as const;

type SlotId = (typeof SLOT_DEFS)[number]["id"];

/** 防具 base type の filter chip (str / dex / int / 各 hybrid)。null = 全 type 横断 */
type ArmourTypeFilter =
  | null
  | "str_armour"
  | "dex_armour"
  | "int_armour"
  | "str_dex_armour"
  | "str_int_armour"
  | "dex_int_armour"
  | "str_dex_int_armour";

interface SlotState {
  itemTag: string;
  itemLevel: number;
  selectedKeys: string[];
  starterPrefix: string;
  starterSuffix: string;
  pasteText: string;
  notes: string;
  /** 防具系 slot で base type 別 mod 絞込（ユーザーが chip ボタンで切替） */
  armourTypeFilter?: ArmourTypeFilter;
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
    armourTypeFilter: null,
  };
}

/** itemTag が防具系（base type 切替対応）か */
function isArmourSlot(tag: string): boolean {
  return ["helmet", "body_armour", "gloves", "boots", "shield"].includes(tag);
}

/** chip ボタン定義: ラベル + フィルタ値 */
const ARMOUR_TYPE_CHIPS: { label: string; value: ArmourTypeFilter }[] = [
  { label: "全部", value: null },
  { label: "Str", value: "str_armour" },
  { label: "Dex", value: "dex_armour" },
  { label: "Int", value: "int_armour" },
  { label: "Str+Dex", value: "str_dex_armour" },
  { label: "Str+Int", value: "str_int_armour" },
  { label: "Dex+Int", value: "dex_int_armour" },
];

const STORAGE_KEY = "exiledesk:craft-slots-v1";
const SAVED_PASTES_KEY = "exiledesk:saved-pastes-v1";

const slots = ref<Record<string, SlotState>>(
  Object.fromEntries(
    SLOT_DEFS.map((s) => [s.id, makeDefaultSlot(s.defaultTag)]),
  ),
);
/** "all" は仮想タブ（自動振り分け用）。実 slot ではない */
type ActiveTabId = SlotId | "all";
const activeSlotId = ref<ActiveTabId>("all");
const search = ref<string>("");

/** 「全て」タブ専用のコピペ buffer（揮発） */
const allTabPasteText = ref("");
const allTabError = ref("");

interface SavedPaste {
  name: string;
  text: string;
  createdAt: number;
  itemTag?: string;
  baseName?: string;
}
const savedPastes = ref<SavedPaste[]>([]);

// ============== 永続化 ==============
// slot 自体は揮発（リロードで全リセット）。永続化されるのは savedPastes のみ。
// 過去バージョンで slot を localStorage に保存していた残骸を削除する。
onMounted(() => {
  localStorage.removeItem(STORAGE_KEY);
  const sp = localStorage.getItem(SAVED_PASTES_KEY);
  if (sp) {
    try {
      const arr = JSON.parse(sp);
      if (Array.isArray(arr)) savedPastes.value = arr;
    } catch (e) {
      console.warn("Failed to load saved pastes:", e);
    }
  }
});

// items-ja.json は { "Pearl Ring": "真珠の指輪", ... } 形式の EN→JA マップ
const itemsJaMap = itemsJa as Record<string, string>;
const itemsEnReverseMap: Record<string, string> = Object.fromEntries(
  Object.entries(itemsJaMap).map(([en, ja]) => [ja, en]),
);
function localizeItemName(s: string | undefined): string | undefined {
  if (!s) return s;
  return itemsJaMap[s] ?? s;
}
/**
 * Magic アイテム name から pure base 部分を抽出して英語化（getBaseByName 用）。
 * - "真珠の指輪 (大渦の変化)" → "Pearl Ring"
 * - "真珠の指輪" → "Pearl Ring"
 * - "Pearl Ring of Whirling" → "Pearl Ring"（前方一致で逆引き）
 * - 一致しなければ undefined
 */
function extractPureBaseEn(name: string | undefined): string | undefined {
  if (!name) return undefined;
  // 1. JA suffix 「 (...)」剥がし
  const stripped = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (itemsEnReverseMap[stripped]) return itemsEnReverseMap[stripped];
  if (itemsJaMap[stripped]) return stripped;
  // 2. EN: "Pearl Ring of Whirling" → 前方/後方一致で base 探す
  for (const en of Object.keys(itemsJaMap)) {
    if (stripped === en) return en;
    // Magic 接尾: "<base> of <suffix>" / 接頭: "<prefix> <base>"
    if (stripped.startsWith(en + " ")) return en;
    if (stripped.endsWith(" " + en)) return en;
    const idx = stripped.indexOf(" " + en + " ");
    if (idx >= 0) return en;
  }
  return undefined;
}

watch(
  savedPastes,
  (v) => localStorage.setItem(SAVED_PASTES_KEY, JSON.stringify(v)),
  { deep: true },
);

// ============== 現スロット参照 ==============
/** "all" タブ時は head を使う（実態 slot がないので）。実 UI は v-if で分岐するのでこの値は使われない */
const slot = computed(
  () =>
    slots.value[
      activeSlotId.value === "all" ? "head" : activeSlotId.value
    ],
);

/**
 * normal mod は spawn weight を持つ通常 prefix/suffix を取得。
 * essence / corrupt / desecrated は spawn tag が別系統のため別取得して merge。
 * essence は PoB の Data/Essence.lua から抽出した essence-mods.json で
 * 「該当 slot に essence で焼ける mod」を割り出して追加する。
 *
 * ベース選択がある場合、防具 base type (str_armour / dex_armour / int_armour / 各 hybrid)
 * の制約で mod を絞り込む（例: STR 系防具に DEX 系 mod は出ない）。
 */
const availableGroups = computed(() => {
  const tag = slot.value.itemTag;
  const lvl = slot.value.itemLevel;
  // ベース選択の tags を優先、未選択なら chip filter のみ
  let baseTags = selectedBaseInfo.value?.tags;
  if (!baseTags && slot.value.armourTypeFilter) {
    baseTags = [slot.value.armourTypeFilter];
  }
  const groups = getModGroupsForItem(tag, lvl, baseTags);

  // 既存 group に tier を merge、なければ新規 group として追加。
  // 同じ groupId でも type が違えば別 group として扱う（EssenceAbyss prefix/suffix 等）
  function mergeMod(m: Mod) {
    const gid = m.groups[0];
    if (!gid) return;
    const existing = groups.find((g) => g.id === gid && g.type === m.type);
    if (existing) {
      if (!existing.tiers.some((t) => t.key === m.key)) {
        existing.tiers.push(m);
        existing.tiers.sort((a, b) => b.level - a.level);
      }
    } else {
      groups.push({ id: gid, type: m.type, tiers: [m] });
    }
  }

  // essence-mods.json から、この slot で essence で焼ける mod を追加
  const essenceKeys = essenceModKeysForSlot(tag);
  for (const m of allMods) {
    if (!essenceKeys.has(m.key)) continue;
    if (m.level > lvl) continue;
    mergeMod(m);
  }

  // corrupt / desecrated 補完（type 別 group の整合性を保つ）
  for (const kind of ["corrupt", "desecrated"] as const) {
    const extras = getModGroupsByKindForItem(tag, kind, 99);
    for (const eg of extras) {
      const existing = groups.find((g) => g.id === eg.id && g.type === eg.type);
      if (!existing) {
        groups.push(eg);
        continue;
      }
      const existingKeys = new Set(existing.tiers.map((t) => t.key));
      for (const t of eg.tiers) {
        if (!existingKeys.has(t.key)) existing.tiers.push(t);
      }
      existing.tiers.sort((a, b) => b.level - a.level);
    }
  }
  return groups;
});

/** 武器スロット判定（宝飾品 3 種のみ対象なので常に false） */
const isWeaponSlot = computed(() => false);

/** 武器タイプ dropdown 候補（宝飾品では使わない、空配列） */
const weaponTypeOptions = computed(() => [] as { id: string; label: string }[]);

/** 武器スロットのラベル（宝飾品では使わない） */
const weaponSlotLabel = computed(() => "");

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

/**
 * items-ja.json の逆引きマップ: 日本語ベース名 → 英語ベース名。
 * PoB の Data/Bases は英語名 key なので、日本語の parsedBase を変換して
 * implicit / base stats を引く。
 */
const itemsJaReverse = (() => {
  const ja = itemsJa as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [en, jp] of Object.entries(ja)) {
    out[jp] = en;
  }
  return out;
})();

/** 現在 slot で parse / 入力されているベース名（日本語想定）に対応する PoB 英語名 */
const parsedBaseEn = computed<string | null>(() => {
  const raw = (slot.value.parsedBase ?? "").trim();
  if (!raw) return null;
  // 日本語名 → 英語名の逆引き、なければ raw を英語名として直接 lookup
  const en = itemsJaReverse[raw] ?? raw;
  return en;
});

/** PoB の Data/Bases から取った base 情報（implicit + stats）。null なら未一致 */
const selectedBaseInfo = computed<ItemBase | null>(() => {
  const en = parsedBaseEn.value;
  if (!en) return null;
  return getBaseByName(en) ?? null;
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

/** mod 一覧の特殊カテゴリ別セクション分け（通常 → エッセンス → コラプト → 冒涜） */
type GroupSectionKind = "normal" | "essence" | "corrupt" | "desecrated";
interface GroupSection {
  kind: GroupSectionKind;
  label: string;
  groups: ModGroup[];
}
const SECTION_ORDER: GroupSectionKind[] = [
  "normal",
  "essence",
  "corrupt",
  "desecrated",
];
const SECTION_LABEL: Record<GroupSectionKind, string> = {
  normal: "通常",
  essence: "エッセンス",
  corrupt: "コラプト",
  desecrated: "冒涜",
};

/**
 * tier が分類される section の配列を返す。
 *
 * ゲーム内表示と一致させる方針:
 *  - desecrated/corrupt/essence kind: そのまま（単独）
 *  - key に "Essence" 含む normal mod (EssenceIncreasedLifePercent1 / EssenceAbyssPrefix
 *    等の essence-overlay 専用 mod): essence のみ
 *  - その他の通常 mod: normal のみ
 *
 * 補足: Lesser/Greater Essence で焼ける通常 prefix/suffix tier (IncreasedLife6 等) は
 * 「通常 mod として」normal section にのみ表示する。essence-mods.json の登録は
 * availableGroups の補完取得（spawn 持たない essence kind を slot に紐付けて拾う）にだけ
 * 使い、section 振り分けには使わない。
 */
/** 現在 slot で essence で焼ける mod key の Set（slot 別の filter） */
const essenceKeysCurrentSlot = computed(() => essenceModKeysForSlot(slot.value.itemTag));

function tierKinds(t: Mod): GroupSectionKind[] {
  const baseKind = modSpecialKind(t);
  if (baseKind) return [baseKind];
  // key に Essence 含む = essence-overlay 専用 mod (Perfect Essence 系の % mod 等)
  if (/[Ee]ssence/.test(t.key)) return ["essence"];
  // Lesser/Greater Essence で **現在の slot に対して** 焼ける通常 mod tier:
  //   normal section にも essence section にも表示する。slot 別 filter なので IncreasedAccuracy7
  //   (gloves/quiver 等で焼ける) は ring slot を表示しているときは essence section に出ない。
  if (essenceKeysCurrentSlot.value.has(t.key)) return ["normal", "essence"];
  return ["normal"];
}

/**
 * group 内の tier を kind 別に分割し、複数 section に振り分ける。
 * 通常 prefix/suffix の中で essence-mods.json に登録されている tier は両方に出る。
 */
function partitionBySpecialKind(list: ModGroup[]): GroupSection[] {
  const m: Record<GroupSectionKind, ModGroup[]> = {
    normal: [],
    essence: [],
    corrupt: [],
    desecrated: [],
  };
  for (const g of list) {
    const byKind: Record<GroupSectionKind, Mod[]> = {
      normal: [],
      essence: [],
      corrupt: [],
      desecrated: [],
    };
    for (const t of g.tiers) {
      for (const k of tierKinds(t)) {
        byKind[k].push(t);
      }
    }
    for (const kind of SECTION_ORDER) {
      if (byKind[kind].length === 0) continue;
      m[kind].push({ id: g.id, type: g.type, tiers: byKind[kind] });
    }
  }
  return SECTION_ORDER.filter((k) => m[k].length > 0).map((k) => ({
    kind: k,
    label: SECTION_LABEL[k],
    groups: m[k],
  }));
}

const prefixSections = computed(() => partitionBySpecialKind(prefixGroups.value));
const suffixSections = computed(() => partitionBySpecialKind(suffixGroups.value));

// セクション折り畳み（冒涜・エッセンス・コラプトのみ。normal はヘッダが無いので折り畳み対象外）
// デフォルトは閉じた状態（ユーザー指示 2026-05-09「デフォルトで閉じたままでいいよそいつら」）
const collapsedSections = ref<Record<string, boolean>>({
  "prefix-essence": true,
  "prefix-corrupt": true,
  "prefix-desecrated": true,
  "suffix-essence": true,
  "suffix-corrupt": true,
  "suffix-desecrated": true,
});
function sectionKey(side: "prefix" | "suffix", kind: GroupSectionKind) {
  return `${side}-${kind}`;
}
function isSectionCollapsed(side: "prefix" | "suffix", kind: GroupSectionKind): boolean {
  return !!collapsedSections.value[sectionKey(side, kind)];
}
function toggleSection(side: "prefix" | "suffix", kind: GroupSectionKind) {
  const k = sectionKey(side, kind);
  collapsedSections.value[k] = !collapsedSections.value[k];
}

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

// tierIndexOf は absoluteTierOf に置き換え済み（partition で sub-group 化されると局所 tier 番号が
// POE2DB の絶対 tier 番号とズレるため）。

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
  | "corrupt"
  | "desecrated"
  | "essence"
  | "skip";

// 暗黙 (implicit) は base 固有でクラフト操作不能 → 分類肢から除外（オーナー判断 2026-05-09）
const CLASSIFICATION_OPTIONS: { value: ModClassification; label: string }[] = [
  { value: "normal", label: "通常" },
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
    const pd = slot.value.prefixDelta ?? 0;
    const sd = slot.value.suffixDelta ?? 0;
    const deltaInfo =
      pd !== 0 || sd !== 0
        ? `（ベース修飾: P${pd >= 0 ? "+" : ""}${pd} / S${sd >= 0 ? "+" : ""}${sd} 反映済）`
        : "";
    alert(
      [
        `プレ ${pCount}/${prefixMax.value}、サフ ${sCount}/${suffixMax.value} で上限超過のため ${skipped.length} 件未反映 ${deltaInfo}:`,
        `  - ${skippedMods}`,
        "",
        "※ 同名グループに prefix/suffix 両方ある mod (レアリティ等) は値が高い時、",
        "  実は両 variant が乗ってる可能性があります（例: 30% = prefix15% + suffix15%）。",
        "  該当する場合は paste テキストを 2 行に分割して再解析してください。",
        "※ 破損 / エッセンス / 冒涜 系の mod は通常 mod と type が異なる variant を",
        "  選択している可能性があります。レビュー画面の tier プルダウンで",
        "  別の variant に切り替えると解消することがあります。",
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

/** 解析関連の値だけリセット（pasteText + parsed metadata）。selectedKeys は残す */
function resetSlotPaste() {
  slot.value.pasteText = "";
  slot.value.parsedName = undefined;
  slot.value.parsedBase = undefined;
  slot.value.parsedQuality = undefined;
  slot.value.parsedQualityCategory = undefined;
  slot.value.prefixDelta = undefined;
  slot.value.suffixDelta = undefined;
  slot.value.isCorruptItem = false;
}

// ============== 保存パスト ==============
const savedListVisible = ref(false);
const hoveredSavedPaste = ref<SavedPaste | null>(null);

function saveCurrentPaste() {
  const txt = slot.value.pasteText.trim();
  if (!txt) {
    alert("保存するコピペがありません");
    return;
  }
  const defaultName =
    slot.value.parsedName ||
    slot.value.parsedBase ||
    `${activeSlotLabel(activeSlotId.value)} ${new Date().toLocaleDateString("ja-JP")}`;
  const name = prompt("保存名を入力してください", defaultName);
  if (!name) return;
  const trimmedName = name.trim();
  if (!trimmedName) return;
  const idx = savedPastes.value.findIndex((p) => p.name === trimmedName);
  if (idx >= 0) {
    if (!confirm(`「${trimmedName}」は既に存在します。上書きしますか？`)) return;
    savedPastes.value.splice(idx, 1);
  }
  savedPastes.value.unshift({
    name: trimmedName,
    text: slot.value.pasteText,
    createdAt: Date.now(),
    itemTag: slot.value.itemTag,
    baseName: slot.value.parsedBase,
  });
}

function loadSavedPaste(p: SavedPaste) {
  slot.value.pasteText = p.text;
  savedListVisible.value = false;
  hoveredSavedPaste.value = null;
}

function deleteSavedPaste(name: string, ev?: Event) {
  ev?.stopPropagation();
  if (!confirm(`「${name}」を削除しますか？`)) return;
  savedPastes.value = savedPastes.value.filter((p) => p.name !== name);
  if (hoveredSavedPaste.value?.name === name) hoveredSavedPaste.value = null;
}

function slotLabel(id: SlotId): string {
  return SLOT_DEFS.find((s) => s.id === id)?.label ?? id;
}

/**
 * SlotId 範囲外の値（"all" タブ）でも安全にラベル化する版。
 * "all" タブは複数 slot を横断するモードのため固定ラベル「全装備」を返す。
 */
function activeSlotLabel(id: ActiveTabId): string {
  if (id === "all") return "全装備";
  return slotLabel(id);
}

// ============== コピペ解析（JA） ==============
// ParsedClipboard と parseJaClipboard は ../parser/item-text に切り出し済み（共通化）。
// tool-dps（装備 DPS 比較ビュー）も同じパース仕様を使う。

// parseJaClipboard は ../parser/item-text に切り出し済み（import 上で再利用）。

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
 * mod の text_ja から **全 tier 範囲** を抽出。
 * 複合数値 mod (例: "(4-6)から(8-11)の物理ダメージ") は range 2 つ返す。
 * 単一値 tier (例: "+25 to ...") は { min: 25, max: 25 } を 1 つ。
 */
function extractAllTierRanges(
  text: string,
): { min: number; max: number }[] {
  const out: { min: number; max: number }[] = [];
  const re = /\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ min: parseFloat(m[1]), max: parseFloat(m[2]) });
  }
  // (a-b) 形式の range 表記が無ければ、固定値 (text 中の最初の \d+) を採用
  if (!out.length) {
    const single = text.match(/(\d+(?:\.\d+)?)/);
    if (single) {
      const v = parseFloat(single[1]);
      out.push({ min: v, max: v });
    }
  }
  return out;
}

/**
 * paste 行の数字群が mod の **全 tier 範囲を完全カバー**するか判定。
 *
 * 例: paste "4から8の物理ダメージ" は数字 [4, 8]、
 *     mod text_ja "(4-6)から(8-11)..." は range [(4-6), (8-11)]
 *     → range (4-6) を 4 でカバー、range (8-11) を 8 でカバー → 全カバー OK
 *
 * 単数 mod ("最大マナ +(55-64)") では 1 range のみ → paste の数字いずれかが
 * 範囲内なら OK。decoration 数字（"敵1体" の "1"）が混入しても他の数字 (9 等)
 * で range マッチすれば成立（オーナー判断 2026-05-09）。
 *
 * 品質補正: roll = base * (1 + boost/100) → base = roll / (1 + boost/100)
 * boost は qualityBoostFor(mod) を呼び側から渡す（slot×category 別）。
 * 整数誤差対策で min/max に ±0.5 のマージン。
 */
function rollMatchesTier(
  rollLine: string,
  mod: Mod,
  qualityBoostPercent: number,
): boolean {
  const ranges = extractAllTierRanges(mod.text_ja);
  if (!ranges.length) return false;
  // 範囲表記 (a-b) の中身は除外（bundle 混入時の誤判定回避）
  const stripped = rollLine.replace(/\(\d+(?:\.\d+)?-\d+(?:\.\d+)?\)/g, "");
  const numbers: number[] = [];
  const re = /(\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stripped)) !== null) {
    numbers.push(parseFloat(m[1]));
  }
  if (!numbers.length) return false;
  // 各 range が paste 数字のいずれかでカバーされる必要（全 range fit）
  for (const r of ranges) {
    const hit = numbers.some((n) => {
      const base =
        qualityBoostPercent > 0 ? n / (1 + qualityBoostPercent / 100) : n;
      return base >= r.min - 0.5 && base <= r.max + 0.5;
    });
    if (!hit) return false;
  }
  return true;
}

/**
 * パースしたコピペ mod 行を bundle にマッチング（2 パス + type-balancing）。
 * - 同一テキストキーで prefix/suffix 両variantが存在する場合、現在の P/S 件数
 *   に応じて自動的にバランスする側を選択（プレ3埋まってたらサフ側を選ぶ）
 * - 1 行マッチ優先 → 残りで multi-line combo
 * - **tier 推定**: paste 行の roll 値が tier 範囲に合致するものを優先選択。
 *   品質補正は qualityBoostFor で slot×category 別に逆算（オーナー判断 2026-05-09）。
 */
function matchModLines(
  lines: string[],
  pool: Mod[],
): { assignments: MatchAssignment[]; matched: Mod[]; unmatched: string[] } {
  // 全 variant を保持（key → Mod[] / level 降順）
  // ja/en 両方のキーで同じ Mod を引けるようにして、英語コピペにも対応
  const keyToAllMods = new Map<string, Mod[]>();
  for (const m of pool) {
    const keys = new Set<string>();
    const jaK = modTextKey(m.text_ja);
    const enK = modTextKey(m.text_en);
    if (jaK) keys.add(jaK);
    if (enK) keys.add(enK);
    for (const k of keys) {
      const list = keyToAllMods.get(k) ?? [];
      if (!list.includes(m)) list.push(m);
      keyToAllMods.set(k, list);
    }
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
   * - rollLine 渡されてれば、品質補正逆算後に tier 範囲内の mod を優先（tier 推定）
   * - 同 key で prefix/suffix 両方ある場合、現状の P/S 件数で偏ってる側を補完
   * - 既に matched なものは除外
   */
  function pickBalanced(candidates: Mod[], rollLine?: string): Mod | null {
    let avail = candidates.filter((c) => !matchedKeys.has(c.key));
    if (avail.length === 0) return null;

    // tier 推定: roll 行のいずれかの数字が tier 範囲に合致する候補に絞る
    if (rollLine) {
      const tierMatched = avail.filter((c) =>
        rollMatchesTier(rollLine, c, qualityBoostFor(c)),
      );
      if (tierMatched.length) avail = tierMatched;
      // 合致なし → fallback で従来の最高 lv 選択
    }

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
    const chosen = pickBalanced(candidates, lines[i]);
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
    // multi-line combo の roll 値は最初の line から拾う（複合 mod は first match のみ反映）
    const rollLine = c.indices.map((i) => lines[i]).join("\n");
    const chosen = pickBalanced(allVariants, rollLine);
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

// ============== コピペからスロット種別を自動判定 ==============
/** Item Class 文字列 → SlotId （JA / EN 両対応）。宝飾品 3 種のみ対応、それ以外は null */
function slotFromItemClass(cls: string): SlotId | null {
  const rules: Array<[RegExp, SlotId]> = [
    [/Rings?|リング|指輪/i, "ring1"],
    [/Amulets?|アミュレット|首飾り/i, "amulet"],
    [/Talismans?|タリスマン/i, "amulet"],
    [/Belts?|ベルト/i, "belt"],
  ];
  for (const [re, slotId] of rules) {
    if (re.test(cls)) return slotId;
  }
  return null;
}

/** 行全体（Item Class 行 or ベース名行）から SlotId を推定 */
function detectSlotFromPaste(text: string): SlotId | null {
  // 1. "Item Class:" / "アイテムクラス:" を最優先
  const m = text.match(/^(?:Item Class|アイテムクラス)\s*[:：]\s*(.+)$/im);
  if (m) {
    const target = slotFromItemClass(m[1].trim());
    if (target) return target;
  }
  // 2. フォールバック: 先頭数行を BASE_PATTERNS / slotFromItemClass で評価
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6);
  for (const line of lines) {
    // BASE_PATTERNS（日本語ベース命名規則）
    for (const [tag, re] of Object.entries(BASE_PATTERNS)) {
      if (re.test(line)) {
        return tagToSlotId(tag);
      }
    }
    // 英語アイテム名（items-ja.json のキー） → ja 名に変換 → BASE_PATTERNS で再評価
    const ja = itemsJaMap[line];
    if (ja) {
      for (const [tag, re] of Object.entries(BASE_PATTERNS)) {
        if (re.test(ja)) return tagToSlotId(tag);
      }
    }
    // class っぽい文字列
    const guess = slotFromItemClass(line);
    if (guess) return guess;
  }
  return null;
}

/** itemTag → 推奨 SlotId（宝飾品 3 種のみ対応、それ以外は null）。
 *  クラフト相談ツールは宝飾品のみ対象になったので、武器・防具系は対象外。 */
function tagToSlotId(tag: string): SlotId | null {
  const map: Record<string, SlotId> = {
    ring: "ring1",
    amulet: "amulet",
    belt: "belt",
    talisman: "amulet",
  };
  return map[tag] ?? null;
}

/** 「全て」タブからの自動振り分け実行 */
function autoRouteAllPaste() {
  allTabError.value = "";
  const txt = allTabPasteText.value.trim();
  if (!txt) {
    allTabError.value = "コピペ内容が空です";
    return;
  }
  let target = detectSlotFromPaste(txt);
  if (!target) {
    allTabError.value =
      "アイテム種別を判定できませんでした。'Item Class:' / 'アイテムクラス:' 行が含まれているか確認してください。";
    return;
  }
  // 指輪の場合: ring1 が空なら ring1、埋まってたら ring2
  if (target === "ring1") {
    if (
      slots.value.ring1.selectedKeys.length > 0 &&
      slots.value.ring2.selectedKeys.length === 0
    ) {
      target = "ring2";
    }
  }
  // target slot に paste を入れて移動 → 自動解析
  slots.value[target].pasteText = txt;
  activeSlotId.value = target;
  allTabPasteText.value = "";
  // 次の tick で applyPaste 実行（slot computed の更新を待つ）
  setTimeout(() => applyPaste(), 0);
}

function applyPaste() {
  const parsed = parseJaClipboard(slot.value.pasteText);
  if (!parsed) {
    alert("コピペ内容を解析できませんでした");
    return;
  }
  if (parsed.itemLevel) slot.value.itemLevel = parsed.itemLevel;
  // 名前/ベースを EN→JA 変換（英語コピペ対応）
  const localizedName = localizeItemName(parsed.name);
  const localizedBase = localizeItemName(parsed.base);
  slot.value.parsedName = localizedName;
  // ベース判定: 1行目（magic）or 2行目（rare）から base パターン一致を選ぶ
  const re = BASE_PATTERNS[slot.value.itemTag];
  let baseName = localizedBase;
  if (re) {
    if (localizedName && re.test(localizedName)) baseName = localizedName;
    else if (localizedBase && re.test(localizedBase)) baseName = localizedBase;
  }
  slot.value.parsedBase = baseName;
  slot.value.parsedQuality = parsed.quality;
  slot.value.parsedQualityCategory = parsed.qualityCategory;
  slot.value.prefixDelta = parsed.prefixDelta;
  slot.value.suffixDelta = parsed.suffixDelta;

  // 暗黙除去: ベースから暗黙 mod が確定するので modLines から除外（オーナー判断 2026-05-09）
  // - baseName から Magic suffix 等を剥がして pure base を英訳 → getBaseByName
  // - implicit テキストは英語（"(7-10)% increased Cast Speed"）なので、bundle で
  //   modTextKey 一致する mod を見つけて text_ja を比較対象にする（言語跨ぎ対応）
  // - parser 側のセクション分割で先頭暗黙除去済の場合も冗長に防御
  const pureBaseEn =
    extractPureBaseEn(baseName) ??
    extractPureBaseEn(localizedName) ??
    extractPureBaseEn(parsed.name) ??
    extractPureBaseEn(parsed.base);
  const baseInfoForImplicit = pureBaseEn ? getBaseByName(pureBaseEn) : null;
  const implicitText = baseInfoForImplicit?.implicit;
  let workingModLines = parsed.modLines;
  if (implicitText) {
    const implicitEnKey = modTextKey(implicitText);
    // bundle 内で同 modTextKey の mod を発見 → その text_ja を比較対象に
    const implicitMod = allMods.find(
      (m) => modTextKey(m.text_en) === implicitEnKey,
    );
    const implicitJaKey = implicitMod
      ? modTextKey(implicitMod.text_ja)
      : null;
    workingModLines = parsed.modLines.filter((l) => {
      const k = modTextKey(l);
      if (k === implicitEnKey) return false; // 英語 paste 直接一致
      if (implicitJaKey && k === implicitJaKey) return false; // 日本語 paste
      return true;
    });
  }

  const { assignments } = matchModLines(
    workingModLines,
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
      lineTexts: a.indices.map((i) => workingModLines[i]),
      groupId,
      selectedTierKey: a.mod.key,
      classification: cls,
    });
  }
  // 未マッチ行 → unmatched item
  const usedIndices = new Set<number>();
  for (const a of assignments) for (const i of a.indices) usedIndices.add(i);
  for (let i = 0; i < workingModLines.length; i++) {
    if (usedIndices.has(i)) continue;
    items.push({
      type: "unmatched",
      index: i,
      lineText: workingModLines[i],
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

/**
 * 各 mod の **絶対 Tier 番号**を計算する map。
 * Tier 番号は「同 group 内の全 normal tier（spawn 該当のみ）を高 lv 降順に並べたときの順位 (1-based)」。
 * essence/corrupt/desecrated 等で sub-group に分割されても、Tier 番号は元 group の絶対値を維持する。
 * 例: IncreasedMana group 全 12 tier、essence で焼ける IncreasedMana8 は **T5** (12 tier 中の 5 番目)。
 */
const absoluteTierMap = computed<Map<string, number>>(() => {
  const tag = slot.value.itemTag;
  const baseTags = selectedBaseInfo.value?.tags;
  const out = new Map<string, number>();
  const byGroup = new Map<string, Mod[]>();
  for (const m of allMods) {
    if (modSpecialKind(m)) continue;
    const gid = m.groups[0];
    if (!gid) continue;
    // 該当 slot に出る mod のみ対象（spawn match）
    const w = modWeightFor(m, tag);
    if (w <= 0) continue;
    // base type 制約
    if (baseTags && !__armourTypeOk(m, baseTags)) continue;
    if (!byGroup.has(gid)) byGroup.set(gid, []);
    byGroup.get(gid)!.push(m);
  }
  for (const [, mods] of byGroup.entries()) {
    mods.sort((a, b) => b.level - a.level);
    mods.forEach((m, i) => out.set(m.key, i + 1));
  }
  return out;
});

function __armourTypeOk(mod: Mod, baseTags: string[]): boolean {
  // mods.ts の modMatchesArmourType と同じロジック（インライン）
  const armourTags = new Set([
    "str_armour",
    "dex_armour",
    "int_armour",
    "str_dex_armour",
    "str_int_armour",
    "dex_int_armour",
    "str_dex_int_armour",
  ]);
  const modArmourTypes = mod.spawn
    .filter((s) => armourTags.has(s.t) && s.w > 0)
    .map((s) => s.t);
  if (modArmourTypes.length === 0) return true;
  return baseTags.some((t) => modArmourTypes.includes(t));
}

/** mod の絶対 Tier 番号を取得。未登録（kind=essence/corrupt/desecrated 等）は 1 を返す。 */
function absoluteTierOf(m: Mod): number {
  return absoluteTierMap.value.get(m.key) ?? 1;
}

/**
 * POE2 の品質カテゴリと bundle.tags の対応。
 * 公式の品質カテゴリ:
 *  - 「品質」(無印) = 全 mod 数値を強化（base item の場合）
 *  - 「アタックモッド」 = tags=attack を持つ mod
 *  - 「キャスターモッド」 = tags=caster
 *  - 「防御モッド」 = tags=defences (armour/evasion/energy_shield)
 *  - 「ライフ・マナモッド」 = tags=life or mana
 *  - 「元素モッド」 = tags=elemental
 *  - 「物理モッド」 = tags=physical
 *  - 「混沌モッド」 = tags=chaos
 *  - 「速度モッド」 = tags=speed
 *  - 「ジェムモッド」 = tags=gem
 *  - 「クリティカルモッド」 = tags=critical
 * paste の "品質 (アタックモッド): +14%" はこの category 名。空または「品質」なら全 mod。
 */
function modMatchesQualityCategory(mod: Mod, categoryRaw?: string): boolean {
  if (!categoryRaw) return true; // 無指定 = 全 mod
  const cat = categoryRaw.trim();
  if (!cat || cat === "品質") return true;
  const tags = mod.tags ?? [];
  const has = (t: string) => tags.includes(t);
  if (cat.includes("アタック") || /attack/i.test(cat)) return has("attack");
  if (cat.includes("キャスター") || /caster|spell/i.test(cat)) return has("caster");
  if (cat.includes("防御") || /defen[cs]e|armour|evasion|energy/i.test(cat)) {
    return (
      has("armour") ||
      has("evasion") ||
      has("energy_shield") ||
      has("defences") ||
      has("life") ||
      has("mana")
    );
  }
  if (cat.includes("ライフ") || /life/i.test(cat)) return has("life");
  if (cat.includes("マナ") || /mana/i.test(cat)) return has("mana");
  if (cat.includes("元素") || /element/i.test(cat)) return has("elemental");
  if (cat.includes("物理") || /physical/i.test(cat)) return has("physical");
  if (cat.includes("混沌") || /chaos/i.test(cat)) return has("chaos");
  if (cat.includes("速度") || /speed/i.test(cat)) return has("speed");
  if (cat.includes("ジェム") || /gem/i.test(cat)) return has("gem");
  if (cat.includes("クリティカル") || /critical/i.test(cat)) return has("critical");
  // 未知カテゴリ → 安全側で全 mod に適用しない
  return false;
}

/** mod に対して有効な品質ボーナス % を返す。0 = 適用なし、N = mod 値が +N% される。 */
function qualityBoostFor(mod: Mod): number {
  const q = slot.value.parsedQuality ?? 0;
  if (q <= 0) return 0;
  const cat = slot.value.parsedQualityCategory;
  return modMatchesQualityCategory(mod, cat) ? q : 0;
}

// 確率計算系 (probOfSelectedMod / formatProb / combinedProb) は撤去。
// 上流 RePoE-fork/poe2 の spawn weight が全 mod=1 の placeholder で実態と乖離していたため
// (オーナー判断 2026-05-09)。AI 推論で「全 mod 1 発で付いた前提の最短手順」を出す方針。

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
    `Plan the SHORTEST crafting STEPS (assume each step lands the desired mod on the first try) for a Path of Exile 2 ${slot.value.itemTag} at item level ${slot.value.itemLevel} (slot: ${activeSlotLabel(activeSlotId.value)} / ${itemLabel}).`,
    `Output is a step-by-step procedure: which currency / essence / omen to use, in which order, on what state of the item. Probability of each step is NOT computed (ExileDesk's spawn-weight data is uniform placeholder, not reliable).`,
    slot.value.parsedBase ? `Base item (parsed): ${slot.value.parsedBase}` : "",
    slot.value.parsedQuality
      ? `Quality: +${slot.value.parsedQuality}%${slot.value.parsedQualityCategory ? ` (category: ${slot.value.parsedQualityCategory})` : ""}. Final values use base_range * (1 + Q/100) for category-matching mods (tagged [Q+N%] below).`
      : "",
    (slot.value.prefixDelta ?? 0) !== 0 || (slot.value.suffixDelta ?? 0) !== 0
      ? `Base modifier: prefix limit ${3 + (slot.value.prefixDelta ?? 0)}, suffix limit ${3 + (slot.value.suffixDelta ?? 0)} — non-standard rare cap from base item.`
      : "",
    slot.value.isCorruptItem
      ? `** Item is CORRUPTED ** — cannot be modified by 通常通貨 anymore. Suggest alternative paths (Recombinator, Vaal Orb reroll, or "use as-is").`
      : "",
    "",
    `Target mods (${selectedMods.value.length}/6 selected):`,
    ...selectedMods.value.map((m, i) => {
      const kind = modSpecialKind(m);
      const kindStr = kind ? ` [SPECIAL: ${kind}]` : "";
      const qb = qualityBoostFor(m);
      const qStr = qb > 0 ? ` [Q+${qb}%]` : "";
      return `${i + 1}. [${m.type}]${kindStr} ${cleanModText(m.text_en)} (group: ${m.groups.join(",")}, lv ${m.level}, tags: ${(m.tags ?? []).join("|") || "-"})${qStr}`;
    }),
    "",
    hasStarterPrefix || hasStarterSuffix
      ? "Starter mods already present on the base:"
      : "",
    hasStarterPrefix
      ? `- prefix: ${cleanModText(starterP!.text_en)} (group: ${starterP!.groups.join(",")})`
      : "",
    hasStarterSuffix
      ? `- suffix: ${cleanModText(starterS!.text_en)} (group: ${starterS!.groups.join(",")})`
      : "",
    needSuggestStarter
      ? `\n** RECOMMEND best starter mod(s) ** — which mod(s) should the user pre-secure on a base before crafting? Pick high-impact / hard-to-roll mods.`
      : "",
    unmatched.length > 0
      ? `\n** ADDITIONAL UNMATCHED MOD LINES (paste から抽出、bundle にマッチせず) **\n` +
        unmatched.map((l) => `- ${l}`).join("\n") +
        `\nInterpret these as additional targets. POE2 may have hybrid mods not in our bundle.`
      : "",
    "",
    "## POE2 CURRENCY / MECHANIC RULES — STRICTLY OBSERVE",
    "",
    "### Rarity transitions (state machine)",
    "- **Normal (white)**: 0 mods.",
    "- **Magic (blue)**: 1-2 mods (max 1 prefix + 1 suffix).",
    "- **Rare (yellow)**: up to 6 mods (max 3 prefix + 3 suffix). Per-base modifiers may shift caps (e.g. 黄昏の指輪).",
    "- **Unique / Corrupted**: cannot use 通常通貨 to modify.",
    "",
    "### Currency rules (use the JA name in steps)",
    "- **変成のオーブ (Orb of Transmutation)**: Normal → Magic, adds 1 random mod. Cannot use on Magic/Rare.",
    "- **増強のオーブ (Orb of Augmentation)**: Magic with 1 mod → Magic with 2 mods, adds 1 random mod (the missing affix type). Cannot use on Magic with 2 mods, Normal, Rare.",
    "- **改変のオーブ (Orb of Alteration)**: Magic → Magic, rerolls all mods (1 or 2 mods).",
    "- **錬金術のオーブ (Orb of Alchemy)**: Normal → Rare, adds 4 random mods. Cannot use on Magic/Rare.",
    "- **王者のオーブ (Regal Orb)**: Magic (must have 2 mods) → Rare, adds 1 random mod. Cannot use on Normal, Rare, or Magic with 1 mod.",
    "- **高貴なオーブ (Exalted Orb)**: Rare → Rare, adds 1 random mod to an open affix slot. **Item must be Rare AND have empty affix space**. Cannot use on Magic, Normal, or fully-modded Rare.",
    "- **消去のオーブ / 抹消 (Orb of Annulment)**: Rare → Rare, removes 1 random mod (used to make space for further crafting).",
    "- **カオスオーブ (Chaos Orb)**: Rare → Rare, removes 1 mod and adds 1 mod (single-step reroll).",
    "- **神のオーブ (Divine Orb)**: Reroll **numerical values** of existing mods within their tier ranges; doesn't change mod identities.",
    "- **神器オーブ (Vaal Orb)**: Rare/Magic/Unique → Corrupted (4 outcomes ~25% each: 不変 / 破壊 / mod追加 / mod反転)。Corrupted state は **以後通常通貨改変不可**.",
    "- **再構築機 (Recombinator)**: Merge 2 items into 1, transferring mods probabilistically. POE2-specific.",
    "",
    "### Essence (deterministic mod injection)",
    "- **エッセンス (通常)**: Apply to **Normal** to make it Magic with 1 deterministic mod (the essence's stat) + 1 random mod. Higher-tier essences may target Magic / Rare items.",
    "- **完璧なエッセンス (Perfect Essence)**: Higher tier、特定カテゴリの確定 mod (例: 精神=Mana%、肉体=Life% 等の % 系)。",
    "- Essence ↔ stat 対応 (主要): 肉体 (Body)→Life, 精神 (Mind)→Mana, 強化 (Enhancement)→Defence, 火炎/氷晶/電気→火/冷気/雷ダメージ, 破滅 (Ruin)→Chaos, 戦闘 (Battle)→Attack, 魔法 (Sorcery)→Caster, 迅速 (Haste)→Speed, 無限 (Infinite)→Mana%、擦傷 (Abrasion)→Physical.",
    "- Lesser/通常/Greater/Perfect の階層あり、上位ほど tier 高 + 高位 rarity に使用可。",
    "",
    "### Omen (modifies the next currency action; consumed on use)",
    "- **左側の<X>のお告げ (Sinistral Omens)**: 該当 currency が prefix のみに作用。例: Sinistral Exaltation → 高貴オーブで prefix のみ追加。",
    "- **右側の<X>のお告げ (Dextral Omens)**: suffix のみに作用。例: Dextral Annulment → 消去オーブで suffix のみ削除。",
    "- **均質化のお告げ (Homogenising Omen)**: 同じ tag 系統の mod を優先選択。",
    "- **偉大なる<X>のお告げ (Greater Omens)**: より強力なバリアント。例: Greater Exaltation → 高貴オーブで複数 mod or 上位 tier 偏重。",
    "- **結晶化のお告げ (Omen of Crystallization)**: エッセンス使用時、不要な既存 mod を 1 つ消しつつエッセンス mod を追加（Magic/Rare の上書き向け）。",
    "- **穢れのお告げ (Omen of Corruption)**: 神器オーブの結果を制御。",
    "- **削減 / 抹消 / 補給 / 再生 / 改善 / 成就 (Whittling/Erasure/Refreshment/Resurgence/Amelioration/Answered Prayers)** など多数あり、状況に応じ採用。",
    "- 使用法: お告げを inventory に置いた状態で対応 currency を打つと自動消費。",
    "- **Exalted Orb の階層**: 通常 / 上級 (Greater) / 完全 (Perfect)。上位ほど高 tier mod を優先付与する偏向あり (\"T1 一点狙いなら Perfect、T3 以上で妥協なら Greater\" のような判断)。Regal/Augmentation/Transmutation も同様の 3 階層あり。",
    "",
    "### カタリスト (触媒) — 装備に塗布、特定カテゴリ mod の数値と付与率を上げる",
    "- アイテムを装備固有のカタリストで「touch」すると quality が貯まり、quality % 分その catalyst カテゴリの mod 数値が上昇 (上限の % は AI が POE2 最新仕様で判断)。さらに以降の currency action でその catalyst カテゴリの mod が選ばれる確率が上昇。",
    "- POE2 で実在するカタリスト一覧 (items-ja.json 由来、JA 名のみ採用):",
    "  - 神経のカタリスト, 肉体のカタリスト, 甲羅のカタリスト",
    "  - 強奪者のカタリスト, 軽快のカタリスト, 歯擦音のカタリスト, 適応のカタリスト",
    "  - エシュのカタリスト, トゥルのカタリスト, ゾフのカタリスト, チャユラのカタリスト, ウール・ネトルのカタリスト",
    "- 戦略: 「目標 mod のカテゴリに対応するカタリストを最初に塗布 → quality 上限まで → currency 使用」が定石。各カタリストの対象カテゴリは AI が POE2 最新知識で判断（例: 神経=マナ/キャスター, 肉体=ライフ系, 甲羅=防御）。",
    "- **POE1 由来の名前 (Tempering / Prismatic / Imbued / Fertile / Turbulent / Abrasive 等) は POE2 に存在しないので絶対に提案しない**。",
    "",
    "### Currency サブカテゴリ — 接頭辞による違い",
    "- 各通貨に 通常 / 上級 (Greater) / 完全 (Perfect) の階層あり。上位ほど高 tier mod や限定 mod を引きやすい偏向。",
    "- 例: 「Exalted Orb (完全) で T1 を一点狙い」 vs 「Exalted Orb (上級) で T3 以上の妥協」のような選択肢として AI が提示すると有用。",
    "",
    "### Chaos Orb の使い方 (POE2)",
    "- POE2 の Chaos Orb は「rare の 1 mod を削除 + 1 mod を追加」(POE1 の全 reroll とは違う、単一 mod swap)。\"カオススパム\" は特定 affix 枠の改善目的。",
    "",
    "## REFERENCE EXAMPLE — 出力スタイルとして参考にすべき POE2 craft 例",
    "(以下は別ターゲット mod の Breach Ring craft 動画ベース。粒度・形式の参考。同じ粒度で答えること)",
    "",
    "```",
    "[ベース準備] Item Level 82+ の Breach Ring を用意。",
    "",
    "[工程1: Suffix を固定]",
    "1. Chaos Orb を spam し、Cast Speed T1 を狙う。",
    "2. Tempering Catalyst を塗布して属性耐性 mod の付与率/数値を上げる。",
    "3. Omen of Greater Exaltation または Omen of Exaltation + 高貴なオーブで全元素耐性 / 特定元素耐性をサフィックスに揃える。",
    "",
    "[工程2: Prefix のクラフト]",
    "1. 不要 mod を 1 つ付けた状態で、結晶化のお告げ + Perfect Essence of Spirit を使用 → 不要 mod を消しつつ % Increased Maximum Mana 確定で付与。",
    "2. Neural Catalyst でマナ mod の品質を上げ、高貴なオーブで Flat Mana T1 を狙う。",
    "3. 最後の枠に Life を狙う。T1 一点狙いなら Exalted Orb (完全)、T3 以上で妥協なら Exalted Orb (上級)。",
    "",
    "[工程3: 仕上げ]",
    "1. Neural Catalyst でマナ mod 品質を 40% まで。",
    "2. 神のオーブ (Divine) で各 mod 数値を最大値に寄せる。",
    "```",
    "",
    "**この参考例の重要ポイント:**",
    "- 各 step で「**何を使う / どの状態に使う / 何が起きる**」を一行で書ける粒度。",
    "- Catalyst → Omen → Essence/Currency → Catalyst (再) → Divine の流れ。",
    "- 「T1 一点狙い vs 妥協」の選択肢を提示。",
    "- 失敗時の救済 (\"冷気ダメージが付いても売れる\" 等の ROI 視点) も触れていい。",
    "",
    "### Special mod kinds (in target list, marked [SPECIAL: ...])",
    "- **essence**: Only obtainable via エッセンス. Plan must include the appropriate essence step.",
    "- **corrupt**: Only obtainable via 神器オーブ corruption. Riskier, must come after all normal mods are set.",
    "- **desecrated**: Abyss 専用 mod、Bone 系通貨で付与（下記 Abyss セクション参照）。",
    "",
    "### 冒涜系クラフト (Desecrated / Abyss)",
    "- POE2 の Abyss コンテンツで取得する **Bone 系通貨** を rare アイテムに使うと、desecrated mod を付与できる。",
    "- **顎骨 (Jawbone)** — 一系統の desecrated mod を付与。3 階層: 噛み切られた (Gnawed) / 保存された (Preserved) / 古代の (Ancient)、上位ほど高 tier。",
    "- **鎖骨 (Collarbone)** — 別系統の desecrated mod。同様 3 階層。",
    "- **凝視 (Gaze)** — Abyss ボス固有 desecrated mod を付与。ボス: Amanamu (アマナム) / Kurgal (クルガル) / Ulaman (ウラマン)。各ボス由来 mod は spawn tag 'amanamu_mod' / 'kurgal_mod' / 'ulaman_mod' 等で識別可能。",
    "- **アマナムの十分の一税 (Amanamu's Tithe) / クルガルの鎖 (Kurgal's Leash)** — 強化版 / 特殊操作系。",
    "- **深淵のエッセンス (Essence of the Abyss)** — Abyss 系 mod を essence 形式で確定付与。",
    "- **アビスの反響のお告げ (Omen of Abyssal Echoes)** — Abyss 操作系 omen。",
    "- **アビスの印章指輪 (Abyssal Signet)** — Abyss 専用ベース、暗黙が冒涜系。",
    "- 戦略: target に [SPECIAL: desecrated] mod がある場合、**通常 prefix/suffix を埋めた後の最終段で Bone 通貨を打つ** が一般的（desecrated 枠は通常 mod 枠とは別扱いの場合あり、AI の最新知識で判断）。",
    "",
    "## OUTPUT FORMAT (Markdown, 日本語で書く)",
    "",
    "### 推奨ルート（フロー図）",
    "**必ず ASCII フロー図** で出力する（ユーザー要望 2026-05-10）。テキスト箇条書きじゃ視認性が悪いので、縦型フロー + 失敗時の枝分かれを ``` code block ``` で。各ノードは [アイテム状態]、矢印は ▼、枝分かれは ├── ... ──▶ / └── ... ──▶。",
    "",
    "例:",
    "```",
    "[Normal Pearl Ring (ilvl 82)]",
    "    │",
    "    ▼ Neural Catalyst を 40% まで塗布",
    "[Normal + Q40%]",
    "    │",
    "    ▼ 完璧な精神のエッセンス (Perfect Essence of the Mind)",
    "[Magic 2 mods (最大マナ T1 確定 + α)]",
    "    │",
    "    ▼ 左側の王者のお告げ + 王者のオーブ (Regal)",
    "[Rare 3 mods (prefix 追加)]",
    "    │",
    "    ▼ 左側の高貴のお告げ + 完璧な高貴なオーブ",
    "    ├── 成功 ──▶ [Rare 4 mods]",
    "    └── 失敗 ──▶ 消去のオーブ → 再 Exalt",
    "                  │",
    "                  ▼",
    "[Rare 4 mods]",
    "    ...",
    "[完成 6 mods]",
    "    │",
    "    ▼ 神のオーブで数値最大化",
    "[完成]",
    "```",
    "",
    "フロー図の **後** に補足ステップ説明を Markdown 番号付きで:",
    "1. **<JA currency / essence / omen 名>** を <現アイテム状態> に使用 → <期待結果>",
    "2. ...",
    "（各 step で **必ず**「使う currency / essence / omen の JA 名」「打つ前のアイテム状態」「期待結果」を明示）",
    "",
    "### 代替ルート A（運用しやすい）",
    "（同じくフロー図 + 補足ステップ）",
    "",
    "### 代替ルート B（高難易度・最高効率）",
    "（同じくフロー図 + 補足ステップ）",
    "",
    "### 推奨スターター mod（指定なし時）",
    "- prefix: <mod name> — 理由: <なぜこの mod を先に確保すべきか>",
    "- suffix: <mod name> — 理由: ...",
    "",
    "### 最終 mod 数値（品質適用後）",
    "各 target mod の base range × (1 + Q/100) を計算した実値",
    "",
    "## CONSTRAINTS",
    "- **応答は完全に日本語で。英名・ラテン文字（A-Z）を絶対に使わない**。素材名は items-ja.json の正式 JA 名（例: 「Pearl Ring」ではなく「真珠の指輪」、「Sinistral Exaltation」ではなく「左側の高貴なお告げ」、「Neural Catalyst」ではなく「神経のカタリスト」、「Perfect Essence of Ice」ではなく「氷晶のパーフェクトエッセンス」）。アイテム状態の「Normal/Magic/Rare/Corrupted」も「ノーマル/マジック/レア/コラプト」のカナ表記で書く。",
    "- **STRICTLY** observe rarity transition rules. 高貴なオーブ (Exalted) は レア のみ、増強のオーブ (Augmentation) は マジック のみ。マジック に 高貴なオーブ を使うな等、ルール逸脱は絶対禁止。",
    "- 「望む mod が出るまでリロール」みたいな曖昧表現避け、具体な通貨名と回数を明示。",
    "- 確率は出さなくていい (信頼できるデータがない)。「全部 1 発で付いた前提」の **手順の数と種類** を最小化することに集中。",
    "- コラプト アイテムの場合は通常通貨改変不可、再構築機 / 神器オーブ 再ロール / use as-is を提示。",
    "- **POE2 のクラフトは POE1 と異なる**: POE1 の知識（Crusader/Hunter/Redeemer/Warlord influence、fossil、harvest reforge、Tempering/Prismatic/Imbued Catalyst 等）は POE2 に存在しないので絶対に提案しない。POE2 のクラフトは上記で列挙した通貨 + エッセンス + オーメン + カタリスト + 再構築機 + 神器オーブ のみ。",
  ]
    .filter(Boolean)
    .join("\n");
}

// ============== AI 相談（Claude Code 経由・MAX プラン OAuth） ==============
// Tauri Rust 側で `claude -p` を spawn して MAX プランのトークンを消費する。
// API キー設定不要、Claude Code の `claude /login` 済セッションをそのまま使う。
const aiResultVisible = ref(false);
const aiLoading = ref(false);
const aiResultText = ref("");
const aiError = ref("");
const aiProgress = ref(0);
const aiElapsedSec = ref(0);

// 進捗 ratio = 1 - exp(-t/τ) の logistic curve。τ=25s で 25s→63%, 50s→86%, 75s→95%,
// 100s→98% と緩やかに伸び続ける。応答到達まで 99% 上限、到達で 100%。
// AI 応答時間がブレても「死んでる」感を出さない（オーナー判断 2026-05-10）。
const AI_PROGRESS_TAU_MS = 25_000;
const AI_PROGRESS_CAP = 99;
let aiProgressTimer: number | null = null;

async function onAskAi() {
  if (!selectedMods.value.length) {
    alert("先に目標 mod を選択してください");
    return;
  }
  aiResultVisible.value = true;
  aiResultText.value = "";
  aiError.value = "";
  await sendAiRequest();
}

function startAiProgressTicker() {
  const start = Date.now();
  aiProgress.value = 0;
  aiElapsedSec.value = 0;
  if (aiProgressTimer !== null) window.clearInterval(aiProgressTimer);
  aiProgressTimer = window.setInterval(() => {
    const elapsedMs = Date.now() - start;
    aiElapsedSec.value = Math.floor(elapsedMs / 1000);
    // logistic curve: 1 - exp(-t/τ)。常に上昇し続ける（時間経過で頭打ちが緩和）。
    // 99% で頭打ち（実応答到達で 100% に jump）。
    const ratio = 1 - Math.exp(-elapsedMs / AI_PROGRESS_TAU_MS);
    aiProgress.value = Math.min(AI_PROGRESS_CAP, Math.round(ratio * 100));
  }, 150);
}

function stopAiProgressTicker() {
  if (aiProgressTimer !== null) {
    window.clearInterval(aiProgressTimer);
    aiProgressTimer = null;
  }
}

async function sendAiRequest() {
  const prompt = buildAiPrompt();
  console.log("[CraftHelper] AI prompt:\n" + prompt);
  aiLoading.value = true;
  aiError.value = "";
  startAiProgressTicker();
  try {
    aiResultText.value = await askClaude(prompt);
    aiProgress.value = 100;
  } catch (e) {
    aiError.value =
      typeof e === "string" ? e : ((e as Error).message ?? String(e));
  } finally {
    stopAiProgressTicker();
    aiLoading.value = false;
  }
}

/** AI 返答を簡易 Markdown + 素材アイコン (img 画像) 化して HTML 文字列に */
const renderedAiResult = computed(() => {
  const raw = aiResultText.value;
  if (!raw) return "";
  // step 0: 英名 → 日本語名（items-ja.json で 1500+ 件の翻訳マップを逆引き union 置換）
  // AI が "Perfect Essence of Ice" と書いても "氷晶のパーフェクトエッセンス" に統一表示
  const translated = translateEnToJa(raw);
  // step 1: HTML escape（< > & " を先に escape）
  const escaped = translated
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // step 2: 簡易 Markdown 変換（フロー図用 pre は最優先で wrap）
  const md = escaped
    .replace(/```([\s\S]*?)```/g, '<pre class="bg-[var(--color-surface-2)] p-3 rounded my-3 text-xs whitespace-pre overflow-x-auto leading-relaxed font-mono">$1</pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-[var(--color-surface-2)] px-1 rounded text-xs">$1</code>')
    .replace(/^#### (.+)$/gm, '<h5 class="font-semibold mt-2 mb-1 text-sm">$1</h5>')
    .replace(/^### (.+)$/gm, '<h4 class="font-semibold mt-3 mb-1 text-[var(--color-accent)]">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 class="font-bold mt-4 mb-2 text-base text-[var(--color-accent)]">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 class="font-bold mt-4 mb-2 text-lg">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>')
    .replace(/^- (.+)$/gm, '<li class="ml-5 list-disc">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-5 list-decimal">$2</li>')
    .replace(/\n/g, "<br>");
  // step 3: 素材名 → img 画像 (公式 CDN) 前置
  return applyCraftIcons(md);
});
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
        @click="activeSlotId = 'all'"
        :class="[
          'px-3 py-2 rounded text-sm whitespace-nowrap transition border-b-2',
          activeSlotId === 'all'
            ? 'bg-[var(--color-surface-2)] border-[var(--color-accent)] text-[var(--color-accent)]'
            : 'bg-[var(--color-surface)] border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
        ]"
        title="コピペすると自動でアイテム種別を判定して該当スロットへ移動"
      >
        ✨ 全て
      </button>
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
    </div>

    <!-- 「全て」タブ専用 UI: 自動振り分けコピペ（シンプル版） -->
    <div v-if="activeSlotId === 'all'" class="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-4">
      <p class="text-xs text-[var(--color-text-muted)] mb-2 leading-relaxed">
        POE2 のアイテムテキスト（日本語 / 英語）を貼って <span class="text-[var(--color-accent)]">「自動振り分け」</span>を押すと、
        Item Class を読み取って該当スロットに自動移動＆解析します。
      </p>
      <textarea
        v-model="allTabPasteText"
        rows="6"
        placeholder="Item Class: Rings / アイテムクラス: 指輪 ..."
        class="w-full px-3 py-2 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-xs font-mono resize-y focus:outline-none focus:border-[var(--color-accent)]"
      ></textarea>
      <div class="mt-2 flex items-center gap-2 flex-wrap">
        <button
          @click="autoRouteAllPaste"
          :disabled="!allTabPasteText.trim()"
          class="px-4 py-2 rounded bg-[var(--color-accent)] text-black text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition"
        >
          🎯 自動振り分け＋解析
        </button>
        <button
          @click="allTabPasteText = ''; allTabError = ''"
          :disabled="!allTabPasteText"
          class="px-3 py-2 rounded border border-[var(--color-border)] text-xs hover:bg-[var(--color-surface-2)] disabled:opacity-40 transition"
        >
          クリア
        </button>
        <span
          v-if="allTabError"
          class="text-xs text-red-300"
        >⚠️ {{ allTabError }}</span>
      </div>
    </div>

    <div v-else>

    <!-- ヘッダー: アイテムタイプ・ilvl・検索 -->
    <div class="flex items-center gap-3 mb-3 flex-wrap">
      <label v-if="isWeaponSlot" class="flex items-center gap-2 text-sm">
        <span class="text-[var(--color-text-muted)]">
          {{ weaponSlotLabel }}
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

      <!-- 防具 base type chip フィルタ（手袋/靴/鎧/兜/盾、ユーザーが str/dex/int/hybrid を直接選ぶ） -->
      <div
        v-if="isArmourSlot(slot.itemTag)"
        class="flex flex-wrap items-center gap-1 text-xs px-3 py-1 w-full"
      >
        <span class="text-[var(--color-text-muted)] mr-1">type:</span>
        <button
          v-for="chip in ARMOUR_TYPE_CHIPS"
          :key="chip.label"
          @click="slot.armourTypeFilter = chip.value"
          :class="[
            'px-2 py-0.5 rounded transition',
            slot.armourTypeFilter === chip.value
              ? 'bg-[var(--color-accent)] text-black font-semibold'
              : 'bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-surface-2)]',
          ]"
        >
          {{ chip.label }}
        </button>
      </div>

      <!-- 選択ベースの implicit / base stats（PoB Data/Bases 由来） -->
      <div
        v-if="selectedBaseInfo"
        class="flex flex-wrap items-center gap-3 text-xs px-3 py-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)] w-full"
      >
        <span class="text-[var(--color-text-muted)]">
          {{ selectedBaseInfo.type }}
          <span v-if="selectedBaseInfo.req.level">(req lv{{ selectedBaseInfo.req.level }})</span>
        </span>
        <span
          v-if="selectedBaseInfo.implicit"
          class="px-2 py-0.5 rounded bg-blue-900/30 border border-blue-900/60 text-blue-200"
        >
          暗黙: {{ selectedBaseInfo.implicit }}
        </span>
        <span
          v-if="selectedBaseInfo.weapon"
          class="text-[var(--color-text-muted)]"
        >
          物理 {{ selectedBaseInfo.weapon.PhysicalMin }}-{{ selectedBaseInfo.weapon.PhysicalMax }}
          / 速度 {{ selectedBaseInfo.weapon.AttackRateBase }}
          / クリ率 {{ selectedBaseInfo.weapon.CritChanceBase }}%
          <span v-if="selectedBaseInfo.weapon.Range"> / 射程 {{ selectedBaseInfo.weapon.Range }}</span>
        </span>
        <span
          v-if="selectedBaseInfo.armour"
          class="text-[var(--color-text-muted)]"
        >
          <span v-if="selectedBaseInfo.armour.ArmourBase">アーマー {{ selectedBaseInfo.armour.ArmourBase }}</span>
          <span v-if="selectedBaseInfo.armour.EvasionBase"> / 回避 {{ selectedBaseInfo.armour.EvasionBase }}</span>
          <span v-if="selectedBaseInfo.armour.EnergyShieldBase"> / ES {{ selectedBaseInfo.armour.EnergyShieldBase }}</span>
        </span>
      </div>
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

    <!-- コピペ解析（デフォルト開きっぱなし） -->
    <details open class="mb-4 rounded border border-[var(--color-border)] bg-[var(--color-surface)]/30">
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
          <div class="grid grid-cols-3 gap-1.5">
            <button
              @click="resetSlotPaste"
              :disabled="!slot.pasteText && !slot.parsedName && !slot.parsedBase"
              class="px-2 py-1.5 rounded border border-[var(--color-border)] text-[11px] hover:bg-[var(--color-surface-2)] disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="現在のタブのコピペ・解析結果をリセット（選択中の目標 mod は残ります）"
            >
              🔄 リセット
            </button>
            <button
              @click="saveCurrentPaste"
              :disabled="!slot.pasteText.trim()"
              class="px-2 py-1.5 rounded border border-[var(--color-border)] text-[11px] hover:bg-[var(--color-surface-2)] disabled:opacity-40 disabled:cursor-not-allowed transition"
              title="現在のコピペを名前付きで保存"
            >
              💾 保存
            </button>
            <button
              @click="savedListVisible = !savedListVisible"
              :class="[
                'px-2 py-1.5 rounded border text-[11px] transition',
                savedListVisible
                  ? 'bg-[var(--color-surface-2)] border-[var(--color-accent)]'
                  : 'border-[var(--color-border)] hover:bg-[var(--color-surface-2)]',
              ]"
              :title="`保存スロット (${savedPastes.length} 件)`"
            >
              📂 保存リスト
              <span v-if="savedPastes.length" class="text-[var(--color-accent)]">
                · {{ savedPastes.length }}
              </span>
            </button>
          </div>
          <!-- 保存リスト -->
          <div
            v-if="savedListVisible"
            class="mt-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] max-h-56 overflow-y-auto relative"
          >
            <p
              v-if="!savedPastes.length"
              class="px-3 py-3 text-[11px] text-[var(--color-text-muted)] italic text-center"
            >
              保存されたコピペはまだありません
            </p>
            <ul v-else class="divide-y divide-[var(--color-border)]">
              <li
                v-for="p in savedPastes"
                :key="p.name"
                class="flex items-center gap-1 px-2 py-1.5 text-[11px] hover:bg-[var(--color-surface-2)]/40"
                @mouseenter="hoveredSavedPaste = p"
                @mouseleave="hoveredSavedPaste = null"
              >
                <button
                  @click="loadSavedPaste(p)"
                  class="flex-1 text-left truncate hover:text-[var(--color-accent)] transition"
                  :title="`クリックで読込 / ホバーで内容プレビュー\n保存日: ${new Date(p.createdAt).toLocaleString('ja-JP')}`"
                >
                  <span class="truncate">{{ p.name }}</span>
                  <span
                    v-if="p.baseName"
                    class="text-[9px] text-[var(--color-text-muted)] ml-1"
                  >· {{ p.baseName }}</span>
                </button>
                <button
                  @click="deleteSavedPaste(p.name, $event)"
                  class="text-[var(--color-text-muted)] hover:text-red-300 px-1 transition shrink-0"
                  title="削除"
                >✕</button>
              </li>
            </ul>
          </div>
          <p class="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
            mod 名と数値プレースホルダを照合して自動選択。<br />
            未マッチ行は手動で選び直してください。<br />
            アイテム lvl も自動取得。
          </p>
        </div>
      </div>
    </details>

    <!-- 保存リスト ホバープレビュー（floating） -->
    <div
      v-if="hoveredSavedPaste && savedListVisible"
      class="fixed z-40 right-6 top-32 w-96 max-h-[60vh] overflow-y-auto p-3 rounded-lg border border-[var(--color-accent)] bg-[var(--color-surface)] shadow-2xl pointer-events-none"
    >
      <div class="text-[11px] text-[var(--color-accent)] mb-1 font-semibold">
        {{ hoveredSavedPaste.name }}
      </div>
      <div
        v-if="hoveredSavedPaste.baseName"
        class="text-[10px] text-[var(--color-text-muted)] mb-2"
      >
        ベース: {{ hoveredSavedPaste.baseName }}
      </div>
      <pre class="text-[10px] font-mono whitespace-pre-wrap break-all text-[var(--color-text)]">{{ hoveredSavedPaste.text }}</pre>
    </div>

    <!-- 選択中サマリ（目標 mod。mod ピッカーより上に配置して常時視認できるように） -->
    <div class="mb-4 p-4 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
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

      <!-- 品質適用バッジ -->
      <div
        v-if="selectedMods.length && slot.parsedQuality"
        class="mb-2 px-3 py-1.5 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-[11px]"
      >
        <span class="text-[var(--color-accent)]">品質適用中: +{{ slot.parsedQuality }}%</span>
        <span v-if="slot.parsedQualityCategory" class="text-[var(--color-text-muted)] ml-1">
          ({{ slot.parsedQualityCategory }})
        </span>
        <span class="text-[var(--color-text-muted)] ml-2">— 該当カテゴリ mod の数値に反映</span>
      </div>

      <ul v-if="selectedMods.length" class="space-y-1 text-sm font-mono">
        <li
          v-for="m in selectedMods"
          :key="m.key"
          :class="[
            'flex items-baseline gap-2 group rounded px-2 py-1',
            specialKindBgGradient(modSpecialKind(m)),
          ]"
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
            class="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono shrink-0 bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
            :title="`Tier ${absoluteTierOf(m)} / lv${m.level}`"
          >T{{ absoluteTierOf(m) }}</span>
          <span class="flex-1 text-[var(--color-text)] whitespace-pre-line">{{ cleanModText(m.text_ja) }}</span>
          <span
            v-if="modSpecialKind(m)"
            :class="['px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0', specialKindColor(modSpecialKind(m))]"
          >{{ specialKindLabel(modSpecialKind(m)) }}</span>
          <span class="text-[10px] text-[var(--color-text-muted)]">lv{{ m.level }}</span>
          <span
            v-if="qualityBoostFor(m) > 0"
            class="text-[10px] text-emerald-300 font-mono shrink-0"
            :title="`品質 +${qualityBoostFor(m)}% がこの mod の数値に適用される (カテゴリ: ${slot.parsedQualityCategory ?? '無印'})`"
          >Q+{{ qualityBoostFor(m) }}%</span>
          <button
            @click="removeSelectedMod(m.key)"
            class="text-[var(--color-text-muted)] hover:text-red-300 text-xs px-1 opacity-50 group-hover:opacity-100 transition"
            title="この mod を削除"
          >✕</button>
        </li>
      </ul>
      <p v-else class="text-xs text-[var(--color-text-muted)] italic">
        下のリストから選択 or コピペで自動入力
      </p>
    </div>

    <!-- スターター mod（mod ピッカーより上に配置） -->
    <div class="mb-3 p-4 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
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

    <!-- AI 相談ボタン（mod ピッカーより上に配置） -->
    <div class="mb-4 flex gap-3 items-center flex-wrap">
      <button
        @click="onAskAi"
        :disabled="!selectedMods.length"
        class="px-5 py-2 rounded bg-[var(--color-accent)] text-black font-medium text-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition"
      >
        🤖 秘書（AI）に最短経路を相談
      </button>
      <p class="text-[10px] text-[var(--color-text-muted)] flex-1 min-w-[12rem]">
        Mod データ: RePoE fork (poe2) JA / EN ／ AI 送信時は英名・stat 範囲・group・lv・tags・weight + 品質情報を渡します。
        AI プロンプトには冒涜・エッセンス・パーフェクトエッセンス・コラプト機構を含む POE2 クラフト機構と、各 mod の概算個別確率を考慮した最短経路提案を指示。
      </p>
    </div>

    <!-- mod ピッカー (group ベース・クリックで tier ピッカー モーダル) -->
    <div class="grid grid-cols-2 gap-4 items-start">
      <div class="rounded-lg border border-[var(--color-border)] overflow-hidden">
        <div class="px-3 py-2 bg-[var(--color-surface)] text-xs uppercase tracking-wider text-[var(--color-accent)] sticky top-0 z-10">
          プレフィックス（{{ prefixGroups.length }} group）
        </div>
        <div
          v-for="sec in prefixSections"
          :key="'pre-' + sec.kind"
          class="contents"
        >
        <div
          v-if="sec.kind !== 'normal'"
          @click="toggleSection('prefix', sec.kind)"
          :class="['px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider cursor-pointer flex items-center justify-between select-none hover:brightness-110', specialKindBgGradient(sec.kind), specialKindColor(sec.kind)]"
        >
          <span>{{ sec.label }} ({{ sec.groups.length }})</span>
          <span class="text-[11px]">{{ isSectionCollapsed('prefix', sec.kind) ? "▶" : "▼" }}</span>
        </div>
        <div
          v-show="sec.kind === 'normal' || !isSectionCollapsed('prefix', sec.kind)"
          class="divide-y divide-[var(--color-border)]"
        >
          <button
            v-for="g in sec.groups"
            :key="g.id"
            @click="openTierPicker(g)"
            :class="[
              'w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface)] transition flex items-start gap-2',
              specialKindBgGradient(sec.kind !== 'normal' ? sec.kind : modSpecialKind(g.tiers[0])),
              selectedTierIn(g)
                ? 'bg-[var(--color-surface-2)] border-l-2 border-[var(--color-accent)]'
                : 'border-l-2 border-transparent',
            ]"
          >
            <span class="text-[var(--color-text-muted)] font-mono w-8 shrink-0">lv{{ g.tiers[0].level }}</span>
            <span class="flex-1 min-w-0">
              <span class="flex items-baseline gap-1.5 flex-wrap">
                <span
                  :class="[
                    'px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 font-mono',
                    selectedTierIn(g)
                      ? 'bg-[var(--color-accent)] text-black'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border border-[var(--color-border)]'
                  ]"
                  :title="selectedTierIn(g) ? '選択中ティア' : '最高ティア (T1) を表示中'"
                >
                  T{{ selectedTierIn(g) ? absoluteTierOf(selectedTierIn(g)!) : absoluteTierOf(g.tiers[0]) }}
                </span>
                <span class="text-[var(--color-text)] whitespace-pre-line">{{ cleanModText(g.tiers[0].text_ja) }}</span>
                <span
                  v-if="modSpecialKind(g.tiers[0])"
                  :class="['px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0', specialKindColor(modSpecialKind(g.tiers[0]))]"
                  aria-hidden="true"
                >{{ specialKindLabel(modSpecialKind(g.tiers[0])) }}</span>
              </span>
              <span v-if="visibleTags(g.tiers[0]).length" class="flex gap-1 flex-wrap mt-1">
                <span
                  v-for="t in visibleTags(g.tiers[0])"
                  :key="t"
                  :class="['px-1.5 py-0.5 rounded text-[9px]', tagColor(t)]"
                >{{ jaTag(t) }}</span>
              </span>
              <span class="text-[var(--color-text-muted)] block text-[10px] mt-0.5">
                {{ g.tiers[0].name_ja || g.tiers[0].name_en }}
              </span>
            </span>
            <span class="flex flex-col items-end shrink-0 gap-0.5">
              <span class="text-[10px] text-[var(--color-text-muted)] font-mono">w{{ modWeightFor(g.tiers[0], slot.itemTag) }}</span>
              <span v-if="g.tiers.length > 1" class="text-[9px] text-[var(--color-text-muted)]">{{ g.tiers.length }} tiers</span>
              <span v-if="selectedTierIn(g)" class="text-[10px] text-[var(--color-accent)] font-semibold">✓ 選択中</span>
            </span>
          </button>
        </div>
        </div>
        <p v-if="!prefixGroups.length" class="p-4 text-xs text-[var(--color-text-muted)] italic">
          該当なし
        </p>
      </div>

      <div class="rounded-lg border border-[var(--color-border)] overflow-hidden">
        <div class="px-3 py-2 bg-[var(--color-surface)] text-xs uppercase tracking-wider text-[var(--color-accent)] sticky top-0 z-10">
          サフィックス（{{ suffixGroups.length }} group）
        </div>
        <div
          v-for="sec in suffixSections"
          :key="'suf-' + sec.kind"
          class="contents"
        >
        <div
          v-if="sec.kind !== 'normal'"
          @click="toggleSection('suffix', sec.kind)"
          :class="['px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider cursor-pointer flex items-center justify-between select-none hover:brightness-110', specialKindBgGradient(sec.kind), specialKindColor(sec.kind)]"
        >
          <span>{{ sec.label }} ({{ sec.groups.length }})</span>
          <span class="text-[11px]">{{ isSectionCollapsed('suffix', sec.kind) ? "▶" : "▼" }}</span>
        </div>
        <div
          v-show="sec.kind === 'normal' || !isSectionCollapsed('suffix', sec.kind)"
          class="divide-y divide-[var(--color-border)]"
        >
          <button
            v-for="g in sec.groups"
            :key="g.id"
            @click="openTierPicker(g)"
            :class="[
              'w-full text-left px-3 py-2 text-xs hover:bg-[var(--color-surface)] transition flex items-start gap-2',
              specialKindBgGradient(sec.kind !== 'normal' ? sec.kind : modSpecialKind(g.tiers[0])),
              selectedTierIn(g)
                ? 'bg-[var(--color-surface-2)] border-l-2 border-[var(--color-accent)]'
                : 'border-l-2 border-transparent',
            ]"
          >
            <span class="text-[var(--color-text-muted)] font-mono w-8 shrink-0">lv{{ g.tiers[0].level }}</span>
            <span class="flex-1 min-w-0">
              <span class="flex items-baseline gap-1.5 flex-wrap">
                <span
                  :class="[
                    'px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 font-mono',
                    selectedTierIn(g)
                      ? 'bg-[var(--color-accent)] text-black'
                      : 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border border-[var(--color-border)]'
                  ]"
                  :title="selectedTierIn(g) ? '選択中ティア' : '最高ティア (T1) を表示中'"
                >
                  T{{ selectedTierIn(g) ? absoluteTierOf(selectedTierIn(g)!) : absoluteTierOf(g.tiers[0]) }}
                </span>
                <span class="text-[var(--color-text)] whitespace-pre-line">{{ cleanModText(g.tiers[0].text_ja) }}</span>
                <span
                  v-if="modSpecialKind(g.tiers[0])"
                  :class="['px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0', specialKindColor(modSpecialKind(g.tiers[0]))]"
                  aria-hidden="true"
                >{{ specialKindLabel(modSpecialKind(g.tiers[0])) }}</span>
              </span>
              <span v-if="visibleTags(g.tiers[0]).length" class="flex gap-1 flex-wrap mt-1">
                <span
                  v-for="t in visibleTags(g.tiers[0])"
                  :key="t"
                  :class="['px-1.5 py-0.5 rounded text-[9px]', tagColor(t)]"
                >{{ jaTag(t) }}</span>
              </span>
              <span class="text-[var(--color-text-muted)] block text-[10px] mt-0.5">
                {{ g.tiers[0].name_ja || g.tiers[0].name_en }}
              </span>
            </span>
            <span class="flex flex-col items-end shrink-0 gap-0.5">
              <span class="text-[10px] text-[var(--color-text-muted)] font-mono">w{{ modWeightFor(g.tiers[0], slot.itemTag) }}</span>
              <span v-if="g.tiers.length > 1" class="text-[9px] text-[var(--color-text-muted)]">{{ g.tiers.length }} tiers</span>
              <span v-if="selectedTierIn(g)" class="text-[10px] text-[var(--color-accent)] font-semibold">✓ 選択中</span>
            </span>
          </button>
        </div>
        </div>
        <p v-if="!suffixGroups.length" class="p-4 text-xs text-[var(--color-text-muted)] italic">
          該当なし
        </p>
      </div>
    </div>

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
            :class="[
              'px-4 py-3 hover:bg-[var(--color-surface-2)]/30',
              classificationBg(item.classification),
              item.classification === 'skip'
                ? 'opacity-40'
                : '',
              item.type === 'matched' && item.autoSplit
                ? 'border-l-4 border-[var(--color-accent)]'
                : '',
            ]"
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
              specialKindBgGradient(modSpecialKind(t)),
              slot.selectedKeys.includes(t.key)
                ? 'bg-[var(--color-surface-2)] border-l-2 border-[var(--color-accent)]'
                : 'border-l-2 border-transparent',
            ]"
          >
            <span class="text-[var(--color-accent)] font-semibold w-10 shrink-0">T{{ i + 1 }}</span>
            <span class="text-[var(--color-text-muted)] font-mono w-12 shrink-0">lv{{ t.level }}</span>
            <span class="flex-1 min-w-0">
              <span class="flex items-baseline gap-1.5 flex-wrap">
                <span class="whitespace-pre-line text-[var(--color-text)]">{{ cleanModText(t.text_ja) }}</span>
                <span
                  v-if="modSpecialKind(t)"
                  :class="['px-1.5 py-0.5 rounded text-[9px] font-semibold shrink-0', specialKindColor(modSpecialKind(t))]"
                  aria-hidden="true"
                >{{ specialKindLabel(modSpecialKind(t)) }}</span>
              </span>
              <span v-if="visibleTags(t).length" class="flex gap-1 flex-wrap mt-1">
                <span
                  v-for="tg in visibleTags(t)"
                  :key="tg"
                  :class="['px-1.5 py-0.5 rounded text-[9px]', tagColor(tg)]"
                >{{ jaTag(tg) }}</span>
              </span>
            </span>
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

    <!-- ========== AI 相談結果 モーダル (Claude Code, MAX プラン OAuth) ========== -->
    <div
      v-if="aiResultVisible"
      class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      @click.self="aiResultVisible = false"
    >
      <div
        class="bg-[var(--color-bg)] rounded-lg max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-[var(--color-border)] shadow-2xl"
      >
        <div
          class="px-4 py-3 border-b border-[var(--color-border)] flex justify-between items-center"
        >
          <h3 class="text-sm font-semibold text-[var(--color-accent)]">
            🤖 秘書（Claude Code）からの最短経路提案
          </h3>
          <button
            @click="aiResultVisible = false"
            class="text-[var(--color-text-muted)] hover:text-[var(--color-text)] w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--color-surface-2)]"
          >✕</button>
        </div>

        <div class="flex-1 overflow-y-auto p-4">
          <!-- 読み込み中 -->
          <div v-if="aiLoading" class="py-10 px-2">
            <div class="text-center mb-5">
              <div class="text-3xl mb-2 animate-pulse">⏳</div>
              <p class="text-sm text-[var(--color-text-muted)]">
                秘書が POE2 のクラフト機構を考慮中…
              </p>
            </div>
            <!-- progress bar（時間ベース、30 秒で 90% に到達。実応答到達で 100%） -->
            <div class="max-w-md mx-auto">
              <div
                class="h-2 bg-[var(--color-surface-2)] rounded-full overflow-hidden border border-[var(--color-border)]"
              >
                <div
                  class="h-full bg-gradient-to-r from-[var(--color-accent)] to-amber-300 transition-all duration-150 ease-out"
                  :style="{ width: aiProgress + '%' }"
                ></div>
              </div>
              <div
                class="flex justify-between text-[10px] text-[var(--color-text-muted)] mt-1 font-mono"
              >
                <span>{{ aiElapsedSec }}s 経過</span>
                <span class="text-[var(--color-accent)]">{{ aiProgress }}%</span>
              </div>
            </div>
          </div>

          <!-- エラー -->
          <div v-else-if="aiError" class="space-y-2">
            <p class="text-red-400 text-sm whitespace-pre-wrap font-mono">{{ aiError }}</p>
            <button
              @click="sendAiRequest"
              class="px-3 py-1.5 rounded bg-[var(--color-accent)] text-black text-xs"
            >🔄 再試行</button>
          </div>

          <!-- 返答表示 -->
          <div
            v-else-if="aiResultText"
            class="text-sm text-[var(--color-text)] leading-relaxed"
            v-html="renderedAiResult"
          ></div>
        </div>

        <div
          v-if="aiResultText && !aiLoading && !aiError"
          class="px-4 py-2 border-t border-[var(--color-border)] flex justify-between items-center text-[10px] text-[var(--color-text-muted)]"
        >
          <span>素材名にアイコン (絵文字) を自動付与しています</span>
          <button
            @click="sendAiRequest"
            class="px-2 py-1 rounded hover:bg-[var(--color-surface-2)]"
          >🔄 再生成</button>
        </div>
      </div>
    </div>
  </div>
</template>
