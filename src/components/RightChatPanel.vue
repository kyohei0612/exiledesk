<script setup lang="ts">
import { ref, nextTick, useTemplateRef } from "vue";

defineEmits<{ close: [] }>();

interface Message {
  role: "user" | "assistant";
  text: string;
}

const messages = ref<Message[]>([
  {
    role: "assistant",
    text: "おかえりなさい！ExileDesk へようこそ。\n\n今は β マイルストーン（通貨ランキング ＋ 秘書チャット）の最小プロトタイプです。Claude CLI 連携はこれから実装します。",
  },
]);

const input = ref("");
const scrollAreaRef = useTemplateRef<HTMLElement>("scrollArea");

async function send() {
  const text = input.value.trim();
  if (!text) return;

  messages.value.push({ role: "user", text });
  input.value = "";

  await nextTick();
  scrollToBottom();

  // プレースホルダー応答 — 次ステップで Claude CLI 呼出に置換
  setTimeout(async () => {
    messages.value.push({
      role: "assistant",
      text: "（プレースホルダー応答）Claude CLI 連携は次のステップで実装します。",
    });
    await nextTick();
    scrollToBottom();
  }, 300);
}

function scrollToBottom() {
  if (scrollAreaRef.value) {
    scrollAreaRef.value.scrollTop = scrollAreaRef.value.scrollHeight;
  }
}
</script>

<template>
  <aside class="bg-[var(--color-surface)] flex flex-col">
    <div
      class="px-4 py-3 border-b border-[var(--color-border)] flex justify-between items-center"
    >
      <h3 class="text-sm font-semibold text-[var(--color-accent)]">🤖 秘書</h3>
      <button
        @click="$emit('close')"
        class="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-sm w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--color-surface-2)]"
        aria-label="チャットパネルを閉じる"
      >
        ✕
      </button>
    </div>

    <div ref="scrollArea" class="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
      <div
        v-for="(m, i) in messages"
        :key="i"
        :class="[
          'p-3 rounded-lg whitespace-pre-wrap leading-relaxed',
          m.role === 'assistant'
            ? 'bg-[var(--color-surface-2)] text-[var(--color-text)]'
            : 'bg-[var(--color-accent)] text-black ml-6',
        ]"
      >
        {{ m.text }}
      </div>
    </div>

    <form
      @submit.prevent="send"
      class="p-3 border-t border-[var(--color-border)] flex gap-2"
    >
      <input
        v-model="input"
        placeholder="秘書に話しかける..."
        class="flex-1 px-3 py-2 rounded bg-[var(--color-bg)] border border-[var(--color-border)] text-sm focus:outline-none focus:border-[var(--color-accent)]"
      />
      <button
        type="submit"
        class="px-4 py-2 rounded bg-[var(--color-accent)] text-black font-medium text-sm hover:bg-[var(--color-accent-hover)] transition"
      >
        送信
      </button>
    </form>
  </aside>
</template>
