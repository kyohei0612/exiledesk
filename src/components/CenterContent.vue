<script setup lang="ts">
import CurrencyRanking from "../views/CurrencyRanking.vue";

defineProps<{ activeNav: string }>();

const titles: Record<string, string> = {
  chat: "🤖 秘書チャット",
  "char-overview": "👤 自キャラ概要",
  "char-equipment": "⚔️ 装備",
  "char-passive": "🌳 パッシブツリー",
  "char-skills": "⚡ スキル",
  "econ-trending": "📊 需要急騰アイテム",
  "econ-search": "🔍 商品検索",
  "lib-items": "📖 アイテム図鑑",
  "lib-skills": "🪄 スキルDB",
  "lib-bosses": "🗺️ ボス情報",
  "lib-filter": "🧪 フィルタエディタ",
  settings: "⚙️ 設定",
};

const descriptions: Record<string, string> = {
  chat: "右パネルの秘書チャットで POE2 関連の何でも壁打ち。Claude CLI 連携は次ステップ。",
  "econ-trending":
    "poe2scout の DailyStatsHistory + SnapshotHistory 差分から「需要シグナル」を表示予定。",
  "char-overview":
    "OAuth PKCE で /character/poe2/<name> から取得予定。フォールバックはクリップボード／PoB コード貼付。",
};
</script>

<template>
  <main class="flex-1 overflow-hidden">
    <CurrencyRanking v-if="activeNav === 'econ-currency'" />

    <div v-else class="p-8 overflow-auto h-full">
      <h2 class="text-2xl font-semibold mb-2">
        {{ titles[activeNav] || activeNav }}
      </h2>
      <p class="text-sm text-[var(--color-text-muted)] max-w-2xl">
        {{
          descriptions[activeNav] ||
          "このセクションは v0 で実装予定。今は β マイルストーン（通貨ランキング ＋ 秘書チャット）の最小プロトタイプです。"
        }}
      </p>

      <div
        class="mt-8 p-6 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]"
      >
        <p class="text-xs uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
          プレースホルダー
        </p>
        <p class="text-sm">
          ここに <code class="text-[var(--color-accent)]">{{ activeNav }}</code>
          の詳細が表示されます。
        </p>
      </div>
    </div>
  </main>
</template>
