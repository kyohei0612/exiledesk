<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{ active: string }>();
const emit = defineEmits<{ "update:active": [value: string] }>();

interface NavItem {
  id: string;
  icon: string;
  label: string;
  group: "economy" | "tools";
  /** 折りたたみ親項目: クリックで展開 / 収納、子を選ぶと親もハイライト */
  children?: NavItem[];
}

// アイコンは visual-concept §5.5 / §8.2 で確定した錬金術記号セット (☉🜔⚙)。
// ☉ = 通貨ランキング / 🜔 = クラフト発見 / ⚙ = 設定
// 2026-05-23: 設定画面 (autostart / close_to_tray / 自動再取得) を実装し復活。
const items: NavItem[] = [
  { id: "econ-currency", icon: "☉", label: "カレンシーランキング", group: "economy" },
  // 旧「クラフト発見」(econ-trending → EconDashboard.vue) は 2026-05-22 に非表示。
  // 復活時は本行を戻し、CenterContent.vue の import + v-else-if 行も合わせて戻す。
  { id: "craft-v2", icon: "🜔", label: "上位プレイヤーMOD一覧", group: "economy" },
  // 2026-09-12: 「ヴァールの天秤」= 賭けクラフトの期待値ツール群 (旧クラフト収支は廃止)。親をクリックで展開。
  // 聖別の賭け / アルダーの航路 は同日オーナー指示で削除 (使わない)。
  {
    id: "vaal-scales",
    icon: "⚖",
    label: "ヴァールの天秤",
    group: "economy",
    children: [
      { id: "overquality", icon: "🜛", label: "アドニアの賭け", group: "economy" },
      { id: "gem-corrupt", icon: "🜏", label: "ジェムコラプトの賭け", group: "economy" },
      // 2026-09-13: ユニークにヴァール → 狙いの付加 (+ アーキテクトオーブで 2 重コラプト)
      { id: "unique-corrupt", icon: "🜚", label: "ユニークコラプトの賭け", group: "economy" },
      // 2026-09-14: レアクラフトの第 1 弾 (エッセンス + 冒涜 + エグザルト、損益分岐の当たり率で見る)
      { id: "es-helmet", icon: "🜲", label: "ES 兜のクラフト", group: "economy" },
    ],
  },
  // 2026-09-07: 同梱 PoB を別ウィンドウで起動 (PobLauncher.vue が onActivated で起動する)
  { id: "pob", icon: "🜍", label: "PoB を開く", group: "tools" },
  // 2026-09-10: Client.txt を仕分けて実害のあるエラーだけ出す
  { id: "client-log", icon: "🜂", label: "ゲームログ診断", group: "tools" },
  { id: "settings", icon: "⚙", label: "設定", group: "tools" },
];

const groupLabels: Record<string, string | null> = {
  economy: "経済",
  tools: "ツール",
};

const groups = (["economy", "tools"] as const)
  .map((key) => ({
    key,
    label: groupLabels[key],
    items: items.filter((i) => i.group === key),
  }))
  .filter((g) => g.items.length > 0);

// ---- 折りたたみ状態 (親 id → 展開中か)。localStorage に残す (ブラウザ保存はあくまで利便) ----
const STORAGE_KEY = "exiledesk.sidebar.expanded";
function loadExpanded(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}
const expanded = ref<Record<string, boolean>>(loadExpanded());
// 選択中の子を持つ親は最初から開いておく
for (const it of items) {
  if (it.children?.some((c) => c.id === props.active)) expanded.value[it.id] = true;
}
function toggle(id: string): void {
  expanded.value = { ...expanded.value, [id]: !expanded.value[id] };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expanded.value));
  } catch {
    /* 保存できなくても動作に影響なし */
  }
}
function isParentActive(item: NavItem): boolean {
  return !!item.children?.some((c) => c.id === props.active);
}
function onClick(item: NavItem): void {
  if (item.children) {
    toggle(item.id);
    return;
  }
  emit("update:active", item.id);
}
</script>

<template>
  <aside class="bg-[var(--exile-color-bg-surface)] flex flex-col py-3 select-none">
    <div class="px-4 pb-3">
      <h1 class="text-lg font-semibold tracking-wide text-[var(--exile-color-accent-focus)]">
        ExileDesk
      </h1>
      <p class="text-xs text-[var(--exile-color-text-secondary)]">POE2 Secretary</p>
    </div>

    <nav class="flex-1 overflow-y-auto">
      <div v-for="group in groups" :key="group.key" class="mt-1">
        <div
          v-if="group.label"
          class="px-4 mt-3 mb-1 text-[10px] uppercase tracking-wider text-[var(--exile-color-text-secondary)]"
        >
          {{ group.label }}
        </div>
        <template v-for="item in group.items" :key="item.id">
          <button
            type="button"
            @click="onClick(item)"
            :class="[
              'w-full text-left px-4 py-2 flex items-center gap-2 transition border-l-2 font-display text-[13px] tracking-[0.06em]',
              active === item.id || (item.children && isParentActive(item) && !expanded[item.id])
                ? 'bg-[var(--exile-color-bg-elevated)] border-[var(--exile-color-accent-focus)] text-[var(--exile-color-accent-focus)]'
                : item.children && isParentActive(item)
                  ? 'border-transparent text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)]'
                  : 'border-transparent hover:bg-[var(--exile-color-bg-elevated)]',
            ]"
            :aria-expanded="item.children ? !!expanded[item.id] : undefined"
          >
            <!--
              アイコン (☉🜔) は Cinzel の unicode-range 外なので、
              font-display 指定の影響を受けず Yu Gothic UI / 絵文字フォントに落ちる。
              ラベル日本語も同様に自動フォールバック (visual-concept §9.6)。
            -->
            <span class="w-5 inline-block text-center" aria-hidden="true">{{ item.icon }}</span>
            <span class="whitespace-nowrap">{{ item.label }}</span>
            <span
              v-if="item.children"
              class="ml-auto text-[10px] text-[var(--exile-color-text-tertiary)] transition-transform"
              :class="expanded[item.id] ? 'rotate-90' : ''"
              aria-hidden="true"
              >▶</span
            >
          </button>
          <div v-if="item.children && expanded[item.id]" class="pb-1">
            <button
              v-for="child in item.children"
              :key="child.id"
              type="button"
              @click="$emit('update:active', child.id)"
              :class="[
                'w-full text-left pl-9 pr-4 py-1.5 flex items-center gap-2 transition border-l-2 text-[12px] tracking-[0.04em]',
                active === child.id
                  ? 'bg-[var(--exile-color-bg-elevated)] border-[var(--exile-color-accent-focus)] text-[var(--exile-color-accent-focus)]'
                  : 'border-transparent text-[var(--exile-color-text-secondary)] hover:bg-[var(--exile-color-bg-elevated)] hover:text-[var(--exile-color-text-primary)]',
              ]"
            >
              <span class="w-4 inline-block text-center" aria-hidden="true">{{ child.icon }}</span>
              <span class="whitespace-nowrap">{{ child.label }}</span>
            </button>
          </div>
        </template>
      </div>
    </nav>
  </aside>
</template>
