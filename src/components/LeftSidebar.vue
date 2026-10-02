<script setup lang="ts">
import { poeSession } from "../state/poe-session";

defineProps<{ active: string }>();
const emit = defineEmits<{ "update:active": [value: string] }>();

interface NavItem {
  id: string;
  icon: string;
  label: string;
  group: "economy" | "tools";
}

// アイコンは visual-concept §5.5 / §8.2 で確定した錬金術記号セット (☉🜔⚙)。
// ☉ = 通貨ランキング / ⚙ = 設定
// 2026-05-23: 設定画面 (autostart / close_to_tray / 自動再取得) を実装し復活。
//
// 2026-10-03 画面の統合 (オーナー「被ってる機能・要らん機能を整理、似た物は一緒に。今は器用貧乏」):
//   - ヴァールの天秤の 4 画面 (アドニア / ジェムコラプト / 自動ジェム監視 / 規格外) → 1 画面 `vaal-scales` のタブ (views/VaalScales.vue)。
//     折りたたみの親子 (children) はこれだけが使っていたので仕組みごと外した
//   - 上位プレイヤー MOD 一覧 (`craft-v2`) → クラフト計算機 `htc-craft` のタブ (HtcCraftLab.vue)
//   - ゲームログ診断 (`client-log`) → 削除 (view / services / Rust ごと)
//   - クラフトステージは動画用なので「経済」から「ツール」の下の方 (PoB を開くの近く) へ移して目立たなくした
const items: NavItem[] = [
  // ユニーク装備価格推移 (旧 `unique-trend`、2026-09-26) は 2026-10-03 からこの中のタブ「ユニーク」(CurrencyRanking.vue)
  { id: "econ-currency", icon: "☉", label: "カレンシーランキング", group: "economy" },
  // 2026-09-16: 公式サイトのマーチャント履歴をアプリ内ログインで取り込む
  { id: "trade-history", icon: "🜨", label: "取引履歴", group: "economy" },
  // 2026-09-12: 「ヴァールの天秤」= 賭けクラフトの期待値ツール群 (旧クラフト収支は廃止)。
  // 聖別の賭け / アルダーの航路 は同日オーナー指示で削除 (使わない)。中のタブは state/app-nav.ts の VAAL_SCALES_TABS
  { id: "vaal-scales", icon: "⚖", label: "ヴァールの天秤", group: "economy" },
  // 2026-09-22: 貼り付けたアイテムから「買うか自分で出すか」と設計図を出す計算機。上位プレイヤーの MOD もこの中のタブ
  { id: "htc-craft", icon: "🧪", label: "クラフト計算機", group: "economy" },
  // 2026-10-02: 同梱 PoB で読み込んで、ジェムなどを変えて火力を比べる (views/pob-check/PobCheck.vue)
  { id: "pob-check", icon: "🔥", label: "火力チェック", group: "tools" },
  // 2026-09-26: PoB のコードを貼って、ビルドをそろえる費用と取引所へのリンクを一覧に (オーナー「忍者ビルドコピーってタブで」)。
  // 後で火力チェックに統合する予定なので、今は火力チェックの直下に残す
  { id: "build-copy", icon: "🜃", label: "忍者ビルドコピー", group: "tools" },
  // 2026-09-07: 同梱 PoB を別ウィンドウで起動 (PobLauncher.vue が onActivated で起動する)
  { id: "pob", icon: "🜍", label: "PoB を開く", group: "tools" },
  // 2026-09-29: PoE1 のスキン (マイクロトランザクション) が PoE2 でも使えるか (views/mtx/MtxList.vue)
  { id: "mtx", icon: "✦", label: "スキン", group: "tools" },
  // 2026-09-27: カレンシーを 1 個ずつ使って変化を見せる実演 (動画・配信用。ADR-001 docs/decisions/001-craft-stage.md)
  { id: "craft-stage", icon: "🜖", label: "クラフトステージ", group: "tools" },
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

// 2026-10-03: 旧「ヴァールの天秤 ▶」の折りたたみ状態を localStorage (exiledesk.sidebar.expanded) に残していたが、
// 親子の仕組みごと外したので読まない。残っていても害は無い
</script>

<template>
  <aside class="bg-[var(--exile-color-bg-surface)] flex flex-col py-3 select-none">
    <div class="px-4 pb-3">
      <div class="flex items-baseline gap-2">
        <h1 class="text-lg font-semibold tracking-wide text-[var(--exile-color-accent-focus)]">
          ExileDesk
        </h1>
        <!-- ログイン状態を小さく (オーナー 2026-09-26「ExileDesk の横にちっちゃくログイン済みって出そうか」) -->
        <span v-if="poeSession.loggedIn.value === true" class="text-[10px] text-emerald-300" title="pathofexile.com にログインしています">● ログイン済み</span>
        <span v-else-if="poeSession.loggedIn.value === false" class="text-[10px] text-amber-300" title="pathofexile.com にログインしていません">● 未ログイン</span>
      </div>
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
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          @click="emit('update:active', item.id)"
          :class="[
            'w-full text-left px-4 py-2 flex items-center gap-2 transition border-l-2 font-display text-[13px] tracking-[0.06em]',
            active === item.id
              ? 'bg-[var(--exile-color-bg-elevated)] border-[var(--exile-color-accent-focus)] text-[var(--exile-color-accent-focus)]'
              : 'border-transparent hover:bg-[var(--exile-color-bg-elevated)]',
          ]"
        >
          <!--
            アイコン (☉🜔) は Cinzel の unicode-range 外なので、
            font-display 指定の影響を受けず Yu Gothic UI / 絵文字フォントに落ちる。
            ラベル日本語も同様に自動フォールバック (visual-concept §9.6)。
          -->
          <span class="w-5 inline-block text-center" aria-hidden="true">{{ item.icon }}</span>
          <span class="whitespace-nowrap">{{ item.label }}</span>
        </button>
      </div>
    </nav>
  </aside>
</template>
