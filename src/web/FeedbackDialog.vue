<script setup lang="ts">
/**
 * 要望・バグを送る窓 (Web 版、2026-10-07 オーナー「要望バグの送信もできるようにしたい」)。
 * server/live の POST /feedback に送る。「今の画面の状態を添付」で ベース・狙い・パターン (シミュレーションの途中) が一緒に届くので再現できる
 */
import { computed, ref, watch } from "vue";
import { craftStage, readSimSession } from "../state/craft-stage";
import { WEB_API_BASE } from "./config";
import { diagNow, track, trailNow } from "./track";
import { marketStore } from "../state/market-store";
import { allMods } from "../services/craft-stage/stage-core";
import pkg from "../../package.json";
import { tr } from "../i18n/lang";
import ModalShell from "../components/ui/ModalShell.vue";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

// 要望とバグは分けない、連絡先の欄も無し (2026-10-10 オーナー「要望バグ欄統一、連絡先書かなくていい」)
const text = ref("");
const attach = ref(true);
const website = ref(""); // bot よけ (人は見えない。入っていたらサーバーが捨てる)
const state = ref<"idle" | "sending" | "sent" | "error">("idle");
const errorText = ref("");
const canSend = computed(() => text.value.trim().length > 0 && state.value !== "sending");

watch(() => props.open, (v) => { if (v) { state.value = "idle"; errorText.value = ""; track("feedback:open"); } });

/**
 * 今の画面の状態 (本文が「使いづらい」「バグっぽい」だけでも、受けた側がすぐ再現・解析できる分を自動で付ける。2026-10-07 オーナー):
 * 版・URL・手で打つ / シミュレーション・ベース・直前の流れ・手で打った手順 (同じ seed で再生できる plan)・今のアイテム・
 * シミュレーションの途中 (レシピとして読み込める形)・直近の JS エラーと console・相場の状態。名前やログインの情報は入らない
 */
function contextNow(): unknown {
  const ses = readSimSession();
  const s = craftStage;
  const it = s.item.value;
  const hand = s.log.value.length ? { plan: s.plan(), steps: s.log.value.length } : null;
  const d = diagNow();
  return {
    version: pkg.version,
    url: location.href,
    mode: s.mode.value,
    base: s.base.value,
    itemLevel: s.itemLevel.value,
    item: it ? { rarity: it.rarity, sockets: it.sockets ?? 0, mods: allMods(it).map((m) => `${m.modId}${m.tierIndex != null ? ` T${m.tierIndex}` : ""}${m.fractured ? " (固定)" : ""}${m.desecrated ? " (冒涜)" : ""}`) } : null,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    lang: navigator.language,
    market: { league: marketStore.league.value?.Value ?? null, fetchedAt: marketStore.fetchedAt.value, error: marketStore.error.value },
    // 直前の流れ (何を押して、どこまで進んだか、何秒前か)。詰まった瞬間に送られることが多いので、これで再現の手がかりにする
    trail: trailNow(),
    errors: d.errors,
    console: d.console,
    hand,
    sim: ses ? { base: ses.base, itemLevel: ses.itemLevel, targets: ses.targets, sockets: ses.sockets, order: ses.order, patterns: ses.patterns, flags: ses.flags } : null,
  };
}

async function send(): Promise<void> {
  if (!canSend.value) return;
  state.value = "sending";
  try {
    const r = await fetch(`${WEB_API_BASE}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "request", text: text.value.trim(), contact: "", website: website.value, context: attach.value ? contextNow() : null }),
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
</script>

<template>
  <!-- 窓の動き・枠は ModalShell (2026-10-10 オーナー「動きが統一されてない所」: Esc は欄の中だけでなくどこでも効く、自前の地 → .g-panel) -->
  <ModalShell :open="open" :title="tr('要望・バグを送る', 'Send feedback')" width="w-[30rem] max-w-full" body-class="px-4 py-3" @close="emit('close')">
    <p v-if="state === 'sent'" class="py-6 text-center text-[13px]">{{ tr("届きました。ありがとうございます。", "Received. Thank you!") }}</p>
    <template v-else>
      <textarea v-model="text" rows="6" class="w-full resize-y rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 outline-none focus:border-amber-400/60" :placeholder="tr('こうなると嬉しい、ここがおかしい (何をしたら何が起きたか) など、なんでも', 'Feature ideas, something that looks wrong (what you did and what happened), anything')" autofocus></textarea>
      <input v-model="website" tabindex="-1" autocomplete="off" class="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true" />
      <label class="mt-2 flex cursor-pointer items-center gap-2 opacity-80"><input v-model="attach" type="checkbox" class="accent-amber-400" /> {{ tr("今の画面の状態を添付 (ベース・狙い・パターン・直前の操作の流れ。名前やログインの情報は入らない)", "Attach the current screen state (base, targets, patterns, recent actions. No names or login info)") }}</label>
      <p v-if="state === 'error'" class="mt-2 text-rose-300">{{ tr("送れなかった", "Could not send") }}: {{ errorText }}</p>
    </template>
    <template #footer>
      <button v-if="state === 'sent'" type="button" class="g-btn sm ml-auto" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
      <template v-else>
        <span class="text-[10px] opacity-40">{{ text.trim().length }} / 4000</span>
        <button type="button" class="g-btn sm ml-auto" @click="emit('close')">{{ tr("やめる", "Cancel") }}</button>
        <button type="button" class="g-btn-red sm disabled:opacity-40" :disabled="!canSend" @click="send">{{ state === "sending" ? tr("送っています…", "Sending…") : tr("送る", "Send") }}</button>
      </template>
    </template>
  </ModalShell>
</template>
