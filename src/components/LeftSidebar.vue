<script setup lang="ts">
import { poeSession } from "../state/poe-session";

defineProps<{ active: string }>();
/** 画面ごとのアイコン (ゲームの絵、scripts/build-ui-art-from-client.mjs) */
const NAV_ART: Record<string, string> = {
  "econ-currency": "currency", "trade-history": "trade", "vaal-scales": "vaal", "htc-craft": "craft",
  "pob-check": "dps", pob: "pob", mtx: "mtx", "craft-stage": "stage", settings: "settings",
};
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
  // 2026-10-02: 同梱 PoB で読み込んで、ジェムなどを変えて火力を比べる (views/pob-check/PobCheck.vue)。
  // 忍者ビルドコピー (旧 `build-copy`、2026-09-26) は 2026-10-03 からこの中のタブ「値段」(PricesTab.vue)
  { id: "pob-check", icon: "🔥", label: "火力チェック", group: "tools" },
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
  <aside class="g-sidebar flex flex-col py-3 select-none">
    <!-- 名前: アプリのアイコン + 彫った金の字 (src/styles/game-ui.css の .g-brand-*) -->
    <div class="flex items-center gap-2 px-3 pb-2">
      <img src="/favicon.png" alt="" class="g-brand-icon size-11 shrink-0" draggable="false" />
      <div class="min-w-0">
        <h1 class="g-brand-word text-[20px] leading-none">EXILEDESK</h1>
        <p class="g-brand-sub mt-1 uppercase">PoE2 Secretary</p>
        <!-- ログイン状態を小さく (オーナー 2026-09-26「ExileDesk の横にちっちゃくログイン済みって出そうか」) -->
        <span v-if="poeSession.loggedIn.value === true" class="mt-0.5 block whitespace-nowrap text-[10px] text-emerald-300" title="pathofexile.com にログインしています">● ログイン済み</span>
        <span v-else-if="poeSession.loggedIn.value === false" class="mt-0.5 block whitespace-nowrap text-[10px] text-amber-300" title="pathofexile.com にログインしていません">● 未ログイン</span>
      </div>
    </div>
    <div class="g-divider mx-3 mb-1"></div>

    <nav class="flex-1 overflow-y-auto overflow-x-hidden">
      <div v-for="group in groups" :key="group.key" class="mt-1">
        <div
          v-if="group.label"
          class="g-brush px-4 mt-3 mb-1 text-[13px] tracking-[0.2em] text-[var(--exile-color-text-tertiary)]"
        >
          {{ group.label }}
        </div>
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          @click="emit('update:active', item.id)"
          :class="[
            'w-full text-left px-3 py-1.5 flex items-center gap-2 transition g-antique text-[14px] tracking-[0.06em]',
            active === item.id
              ? 'g-nav-on g-sel'
              : 'text-[var(--exile-color-text-secondary)] hover:bg-white/[0.04] hover:text-[var(--exile-color-text-primary)]',
          ]"
        >
          <!--
            アイコン (☉🜔) は Cinzel の unicode-range 外なので、
            font-display 指定の影響を受けず Yu Gothic UI / 絵文字フォントに落ちる。
            ラベル日本語も同様に自動フォールバック (visual-concept §9.6)。
          -->
          <!-- ゲームのキャラ画面の上の金のアイコン (public/ui-art/nav-*。選んでいる時は明るい方)。2026-10-09 オーナー「左のアイコンださい」 -->
          <img v-if="NAV_ART[item.id]" :src="`/ui-art/nav-${NAV_ART[item.id]}${active === item.id ? '-on' : ''}.webp`" alt="" class="size-7 shrink-0 object-contain drop-shadow-[0_1px_2px_#000]" aria-hidden="true" draggable="false" />
          <span v-else class="w-7 inline-block text-center" aria-hidden="true">{{ item.icon }}</span>
          <span class="whitespace-nowrap">{{ item.label }}</span>
        </button>
      </div>
    </nav>
  </aside>
</template>
