<!--
  AssetPackToast.vue — 画像パックを落としている間だけ右下に小さく出す (2026-09-29、asset-packs.ts)
  初回と、画像が変わった時だけ。落とせなかった時は理由を出す (前の画像があればそれで動く)。
-->
<script setup lang="ts">
import { assetError, assetProgress } from "../services/assets/asset-packs";

const NAME: Record<string, string> = { "base-art": "ベースの絵", "mtx-art": "スキンの画像" };
const mb = (n: number): string => (n / 1048576).toFixed(1);
</script>

<template>
  <div v-if="assetProgress || assetError" class="fixed bottom-4 right-4 z-[300] w-72 rounded-xl border border-white/15 bg-black/85 p-3 text-[12px] shadow-lg">
    <template v-if="assetProgress">
      <p class="mb-1.5 font-bold text-amber-100">画像を準備しています ({{ NAME[assetProgress.pack] ?? assetProgress.pack }})</p>
      <div class="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div class="h-full rounded-full bg-amber-300 transition-all" :style="{ width: assetProgress.total ? `${Math.min(100, (assetProgress.received / assetProgress.total) * 100)}%` : '100%' }" />
      </div>
      <p class="mt-1 opacity-60">{{ assetProgress.phase === "extract" ? "展開しています…" : assetProgress.phase === "files" ? `増えた画像 ${assetProgress.received} / ${assetProgress.total} 枚` : `${mb(assetProgress.received)} / ${mb(assetProgress.total)} MB` }} · 初回と画像が変わった時だけ</p>
    </template>
    <p v-else class="text-rose-300">{{ assetError }} <button type="button" class="ml-1 underline opacity-70" @click="assetError = null">閉じる</button></p>
  </div>
</template>
