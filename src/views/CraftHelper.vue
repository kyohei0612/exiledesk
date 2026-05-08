<script setup lang="ts">
import { ref, computed } from "vue";

interface ParsedItem {
  itemClass?: string;
  rarity?: string;
  name?: string;
  base?: string;
  itemLevel?: number;
  quality?: number;
  mods: string[];
  raw: string;
}

const input = ref<string>("");

/**
 * POE2 クリップボード形式（"--------"区切り）の最低限パース。
 * 完全パースは後で AI に渡してやらせる方針。
 */
function parseClipboard(text: string): ParsedItem | null {
  if (!text.trim()) return null;

  const sections = text
    .split(/^-+$/m)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sections.length === 0) return null;

  const result: ParsedItem = { mods: [], raw: text };

  // 全セクションから metadata 抽出
  for (const section of sections) {
    for (const line of section.split("\n").map((s) => s.trim())) {
      const ic = line.match(/^Item Class:\s*(.+)$/);
      if (ic) result.itemClass = ic[1];
      const r = line.match(/^Rarity:\s*(.+)$/);
      if (r) result.rarity = r[1];
      const il = line.match(/^Item Level:\s*(\d+)$/);
      if (il) result.itemLevel = parseInt(il[1]);
      const q = line.match(/^Quality:\s*\+(\d+)%/);
      if (q) result.quality = parseInt(q[1]);
    }
  }

  // 1 セクション目から name, base
  const firstLines = sections[0]
    .split("\n")
    .map((s) => s.trim())
    .filter((l) => l && !l.startsWith("Item Class:") && !l.startsWith("Rarity:"));
  if (firstLines[0]) result.name = firstLines[0];
  if (firstLines[1]) result.base = firstLines[1];

  // 後続セクションから mod っぽい行を回収
  const skipPrefix = [
    "Item Level:",
    "Quality:",
    "Armour:",
    "Energy Shield:",
    "Evasion Rating:",
    "Block:",
    "Requirements:",
    "Level:",
    "Str:",
    "Dex:",
    "Int:",
    "Sockets:",
    "Note:",
  ];
  for (let i = 1; i < sections.length; i++) {
    for (const line of sections[i]
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (skipPrefix.some((p) => line.startsWith(p))) continue;
      // POE mod 行は基本的に英語実装なので、マルチバイト含む行はスキップ寄り
      // ただし implicit/crafted 等のサフィックスは英語、安全側に倒す
      if (
        /^(\+|-|\d+%|\d+\s)/.test(line) ||
        /\b(to|with|increased|reduced|Resistance|maximum|Life|Mana|Armour|Damage)\b/i.test(
          line,
        )
      ) {
        result.mods.push(line);
      }
    }
  }

  return result;
}

const parsed = computed<ParsedItem | null>(() => parseClipboard(input.value));

function clearInput() {
  input.value = "";
}

function onAskAi() {
  alert(
    [
      "🚧 AI 連携は次のイテレーションで実装します。",
      "",
      "予定:",
      "- ローカル mod DB（RePoE fork）と現行カレンシー効果を context に渡す",
      "- 「最短経路」「最少コスト」「最高確率」の3観点で提案",
      "- 各ステップに使うカレンシー＋確率＋見積コスト",
      "- 結果はキャッシュしてトークン節約",
      "",
      "現在の入力は構造化済みなのでそのまま渡せます。",
    ].join("\n"),
  );
}
</script>

<template>
  <div class="p-8 overflow-auto h-full">
    <h2 class="text-2xl font-semibold mb-1">🔨 クラフト最短経路相談</h2>
    <p class="text-sm text-[var(--color-text-muted)] max-w-2xl mb-6">
      作りたい装備の目標 mod 構成を入力すると、最短ルート（カレンシー手順 ＋ 確率 ＋ 見積コスト）を AI が提案します。
      <span class="text-[var(--color-accent)]">v0 暫定: 入力UIのみ。AI 連携は次ステップ。</span>
    </p>

    <div class="grid grid-cols-2 gap-6">
      <!-- 入力エリア -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <label class="text-sm font-medium">
            目標装備（POE2 内で右クリック → コピー、ここに貼付）
          </label>
          <button
            v-if="input"
            @click="clearInput"
            class="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            ✕ クリア
          </button>
        </div>
        <textarea
          v-model="input"
          rows="14"
          placeholder="Item Class: Helmets&#10;Rarity: Rare&#10;...&#10;--------&#10;Item Level: 82&#10;--------&#10;+85 to maximum Life&#10;+45% to all Elemental Resistances&#10;..."
          class="w-full px-3 py-2 rounded bg-[var(--color-surface)] border border-[var(--color-border)] text-sm font-mono focus:outline-none focus:border-[var(--color-accent)] resize-y"
        ></textarea>

        <div class="mt-3 flex gap-2">
          <button
            @click="onAskAi"
            :disabled="!parsed"
            class="px-4 py-2 rounded bg-[var(--color-accent)] text-black font-medium text-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition"
          >
            🤖 秘書（AI）に相談
          </button>
        </div>
      </div>

      <!-- パース結果プレビュー -->
      <div>
        <label class="text-sm font-medium mb-2 block">解析プレビュー</label>
        <div
          class="p-4 rounded bg-[var(--color-surface)] border border-[var(--color-border)] min-h-[14rem]"
        >
          <p
            v-if="!parsed"
            class="text-sm text-[var(--color-text-muted)] italic"
          >
            左に入力するとここに構造化結果が表示されます
          </p>
          <div v-else class="space-y-3 text-sm">
            <div v-if="parsed.name || parsed.base" class="space-y-1">
              <p
                v-if="parsed.name"
                class="text-base font-semibold text-[var(--color-accent)]"
              >
                {{ parsed.name }}
              </p>
              <p v-if="parsed.base" class="text-[var(--color-text)]">
                ベース: {{ parsed.base }}
              </p>
            </div>

            <div class="grid grid-cols-2 gap-2 text-xs">
              <div v-if="parsed.itemClass">
                <span class="text-[var(--color-text-muted)]">分類: </span>
                <span>{{ parsed.itemClass }}</span>
              </div>
              <div v-if="parsed.rarity">
                <span class="text-[var(--color-text-muted)]">レアリティ: </span>
                <span>{{ parsed.rarity }}</span>
              </div>
              <div v-if="parsed.itemLevel">
                <span class="text-[var(--color-text-muted)]">アイテム lvl: </span>
                <span class="text-[var(--color-accent)]">{{ parsed.itemLevel }}</span>
              </div>
              <div v-if="parsed.quality">
                <span class="text-[var(--color-text-muted)]">品質: </span>
                <span>+{{ parsed.quality }}%</span>
              </div>
            </div>

            <div v-if="parsed.mods.length" class="border-t border-[var(--color-border)] pt-3">
              <p class="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                目標 Mod ({{ parsed.mods.length }}件)
              </p>
              <ul class="space-y-1">
                <li
                  v-for="(m, i) in parsed.mods"
                  :key="i"
                  class="text-xs font-mono text-[var(--color-text)] before:content-['+'] before:text-[var(--color-accent)] before:mr-2"
                >
                  {{ m }}
                </li>
              </ul>
            </div>

            <p
              v-else-if="parsed.name || parsed.itemClass"
              class="text-xs text-[var(--color-text-muted)] italic"
            >
              Mod 行が検出できませんでした（パース改善は AI 連携時にもう一度）
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- AI 提案エリア（プレースホルダー） -->
    <div class="mt-8 p-6 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
      <h3 class="text-base font-semibold mb-2">🤖 AI 秘書からの提案</h3>
      <p class="text-sm text-[var(--color-text-muted)]">
        次イテレーションで実装予定。RePoE fork の mod weight + tier データと
        現行カレンシー効果ルールを context に渡し、最短ルートと確率を出させます。
      </p>
      <ul class="mt-3 text-xs text-[var(--color-text-muted)] space-y-1 ml-5 list-disc">
        <li>案A: Essence chain（確定 mod ルート）</li>
        <li>案B: Chaos スパム（低コスト・低確率）</li>
        <li>案C: Annul-Augment loop（中コスト・中確率）</li>
        <li>各案に推定試行回数・期待コスト・成功確率を表示</li>
      </ul>
    </div>
  </div>
</template>
