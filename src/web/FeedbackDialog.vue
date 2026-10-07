<script setup lang="ts">
/**
 * 要望・バグを送る窓 (Web 版、2026-10-07 オーナー「要望バグの送信もできるようにしたい」)。
 * server/live の POST /feedback に送る。「今の画面の状態を添付」で ベース・狙い・パターン (シミュレーションの途中) が一緒に届くので再現できる
 */
import { computed, ref, watch } from "vue";
import { craftStage, readSimSession } from "../state/craft-stage";
import { WEB_API_BASE } from "./config";
import { track, trailNow } from "./track";
import pkg from "../../package.json";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const kind = ref<"request" | "bug">("request");
const text = ref("");
const contact = ref("");
const attach = ref(true);
const website = ref(""); // bot よけ (人は見えない。入っていたらサーバーが捨てる)
const state = ref<"idle" | "sending" | "sent" | "error">("idle");
const errorText = ref("");
const canSend = computed(() => text.value.trim().length > 0 && state.value !== "sending");

watch(() => props.open, (v) => { if (v) { state.value = "idle"; errorText.value = ""; track("feedback:open"); } });

/** 今の画面の状態 (小さく): 版・URL・手で打つ / シミュレーション・ベース・シミュレーションの途中 */
function contextNow(): unknown {
  const ses = readSimSession();
  return {
    version: pkg.version,
    url: location.href,
    mode: craftStage.mode.value,
    base: craftStage.base.value,
    itemLevel: craftStage.itemLevel.value,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    // 直前の流れ (何を押して、どこまで進んだか、何秒前か)。詰まった瞬間に送られることが多いので、これで再現の手がかりにする
    trail: trailNow(),
    sim: ses ? { base: ses.base, itemLevel: ses.itemLevel, targets: ses.targets, sockets: ses.sockets, order: ses.order, patterns: ses.patterns } : null,
  };
}

async function send(): Promise<void> {
  if (!canSend.value) return;
  state.value = "sending";
  try {
    const r = await fetch(`${WEB_API_BASE}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: kind.value, text: text.value.trim(), contact: contact.value.trim(), website: website.value, context: attach.value ? contextNow() : null }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!r.ok || !j.ok) throw new Error(j.error ?? `${r.status}`);
    state.value = "sent";
    text.value = "";
    track("feedback:sent");
  } catch (e) {
    state.value = "error";
    errorText.value = String((e as Error).message ?? e);
  }
}
function onKey(e: KeyboardEvent): void { if (e.key === "Escape") emit("close"); }
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 grid place-items-center bg-black/60" @click.self="emit('close')" @keydown="onKey">
      <div class="w-[30rem] rounded-xl border border-white/15 bg-[#14110d] p-4 text-[12px] shadow-2xl">
        <div class="mb-3 flex items-center gap-2">
          <b class="text-[14px] text-amber-200">要望・バグを送る</b>
          <button type="button" class="ml-auto rounded px-2 py-0.5 opacity-60 hover:bg-white/10 hover:opacity-100" @click="emit('close')">×</button>
        </div>
        <template v-if="state === 'sent'">
          <p class="py-6 text-center text-[13px]">届きました。ありがとうございます。</p>
          <div class="text-right"><button type="button" class="rounded-lg border border-white/20 px-3 py-1 hover:bg-white/10" @click="emit('close')">閉じる</button></div>
        </template>
        <template v-else>
          <div class="mb-2 flex gap-2">
            <button v-for="k in (['request', 'bug'] as const)" :key="k" type="button" class="flex-1 rounded-lg border px-3 py-1.5 font-bold" :class="kind === k ? 'border-amber-400/70 bg-amber-500/15 text-amber-100' : 'border-white/15 hover:bg-white/5'" @click="kind = k">{{ k === "request" ? "💡 要望" : "🐛 バグ" }}</button>
          </div>
          <textarea v-model="text" rows="6" class="w-full resize-y rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 outline-none focus:border-amber-400/60" :placeholder="kind === 'bug' ? '何をしたら、何が起きたか (期待と違った所)' : 'こうなると嬉しい、を一言で'" autofocus></textarea>
          <input v-model="contact" class="mt-2 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1 outline-none focus:border-amber-400/60" placeholder="連絡先 (任意: X や Discord の名前。返事が要る時だけ)" />
          <input v-model="website" tabindex="-1" autocomplete="off" class="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true" />
          <label class="mt-2 flex cursor-pointer items-center gap-2 opacity-80"><input v-model="attach" type="checkbox" class="accent-amber-400" /> 今の画面の状態を添付 (ベース・狙い・パターン・直前の操作の流れ。名前やログインの情報は入らない)</label>
          <p v-if="state === 'error'" class="mt-2 text-rose-300">送れなかった: {{ errorText }}</p>
          <div class="mt-3 flex items-center gap-2">
            <span class="text-[10px] opacity-40">{{ text.trim().length }} / 4000</span>
            <button type="button" class="ml-auto rounded-lg border border-white/20 px-3 py-1 hover:bg-white/10" @click="emit('close')">やめる</button>
            <button type="button" class="rounded-lg border border-amber-400/60 bg-amber-500/20 px-4 py-1 font-bold text-amber-100 hover:bg-amber-500/30 disabled:opacity-40" :disabled="!canSend" @click="send">{{ state === "sending" ? "送っています…" : "送る" }}</button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
