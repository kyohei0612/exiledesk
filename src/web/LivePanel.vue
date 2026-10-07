<script setup lang="ts">
/**
 * 配信中のチャンネル (自分・協賛) の枠。server/live の /live.json を 60 秒ごとに読む (サーバーが 5 分おきに調べた結果)。
 * 見た目は server/live/public/live-panel.js と同じ (こちらは Vue)。協賛は PR と出す (ステマ規制)
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { WEB_API_BASE } from "./config";

interface Entry { id: string; name: string; platform: "youtube" | "twitch"; url: string; pr: boolean; status: "live" | "upcoming"; title: string; thumb: string | null; watchUrl: string; startedAt: string | null; scheduledAt: string | null; viewers: number | null }
interface Ch { id: string; name: string; platform: "youtube" | "twitch"; url: string; pr: boolean; status: "live" | "upcoming" | "off"; avatar: string | null }
interface State { updatedAt: string | null; live: Entry[]; upcoming: Entry[]; channels: Ch[] }

const state = ref<State | null>(null);
const failed = ref("");
let timer: ReturnType<typeof setInterval> | null = null;

async function load(): Promise<void> {
  try {
    const r = await fetch(`${WEB_API_BASE}/live.json`, { cache: "no-cache" });
    if (!r.ok) throw new Error(String(r.status));
    state.value = (await r.json()) as State;
    failed.value = "";
  } catch (e) {
    failed.value = String((e as Error).message ?? e);
  }
}
onMounted(() => { void load(); timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000); });
onBeforeUnmount(() => { if (timer) clearInterval(timer); });

const PF: Record<string, string> = { youtube: "YouTube", twitch: "Twitch" };
const avatars = computed(() => new Map((state.value?.channels ?? []).map((c) => [c.id, c.avatar])));
const on = computed(() => [...(state.value?.live ?? []), ...(state.value?.upcoming ?? [])]);
const off = computed(() => { const ids = new Set(on.value.map((e) => e.id)); return (state.value?.channels ?? []).filter((c) => !ids.has(c.id)); });
const fmtViewers = (n: number | null): string => (n == null ? "" : n >= 10000 ? `${(n / 10000).toFixed(1)}万人` : `${n.toLocaleString("ja-JP")}人`);
function fmtWhen(iso: string | null): string {
  if (!iso) return "予定";
  const d = new Date(iso), now = new Date();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const same = d.toDateString() === now.toDateString();
  return same ? `今日 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
function fmtSince(iso: string | null): string {
  if (!iso) return "";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}
const updated = computed(() => (state.value?.updatedAt ? new Date(state.value.updatedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) : ""));
</script>

<template>
  <div class="rounded-xl border border-white/10 bg-[#15120d] p-2.5 text-[12px]">
    <div class="mb-2 flex items-center gap-1.5 text-[11px] opacity-60">
      <b class="text-amber-200 opacity-100">配信</b>
      <span>{{ state?.live.length ? `${state.live.length} 人がライブ中` : "ライブ中なし" }}</span>
      <span class="ml-auto">{{ state?.channels.length ?? 0 }} ch</span>
    </div>
    <p v-if="failed && !state" class="py-2 text-center opacity-50">読めなかった ({{ failed }})</p>
    <ul v-else class="flex flex-col gap-1.5">
      <li v-for="e in on" :key="e.id" class="overflow-hidden rounded-lg border border-white/10 bg-black/25 hover:border-amber-300/50 hover:bg-black/40">
        <a :href="e.watchUrl" target="_blank" rel="noopener" :title="e.title" class="block">
          <div class="relative aspect-video overflow-hidden bg-gradient-to-br from-[#2a2219] to-[#0e0c09]">
            <img v-if="e.thumb" :src="e.thumb" alt="" loading="lazy" class="h-full w-full object-cover" />
            <span v-if="e.status === 'live'" class="absolute left-1.5 top-1.5 rounded bg-[#e5484d] px-1.5 text-[10px] font-extrabold tracking-wider text-white">LIVE</span>
            <span v-else class="absolute left-1.5 top-1.5 rounded border border-amber-300/50 bg-black/65 px-1.5 text-[10px] font-bold text-amber-200">{{ fmtWhen(e.scheduledAt) }}</span>
            <span v-if="e.status === 'live' && (e.viewers != null || e.startedAt)" class="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 text-[10px]">{{ [fmtViewers(e.viewers), fmtSince(e.startedAt)].filter(Boolean).join(" · ") }}</span>
          </div>
          <div class="flex items-center gap-2 px-2 py-1.5">
            <span class="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-[#2a2219] font-bold text-amber-200" :class="e.status === 'live' ? 'ring-2 ring-[#e5484d]' : ''"><img v-if="avatars.get(e.id)" :src="avatars.get(e.id)!" alt="" class="h-full w-full object-cover" /><template v-else>{{ e.name.slice(0, 1) }}</template></span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1 truncate font-bold"><span class="truncate">{{ e.name }}</span><span class="shrink-0 rounded px-1 text-[9px] text-white" :class="e.platform === 'youtube' ? 'bg-[#c4302b]' : 'bg-[#8b5cf6]'">{{ PF[e.platform] }}</span><span v-if="e.pr" class="shrink-0 rounded border border-white/40 px-1 text-[9px] opacity-70" title="協賛">PR</span></div>
              <div class="truncate opacity-60">{{ e.title }}</div>
            </div>
          </div>
        </a>
      </li>
      <li v-for="c in off" :key="c.id" class="rounded-lg border border-white/10 bg-black/25 opacity-60 hover:opacity-100">
        <a :href="c.url" target="_blank" rel="noopener" class="flex items-center gap-2 px-2 py-1.5">
          <span class="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-[#2a2219] font-bold text-amber-200"><img v-if="c.avatar" :src="c.avatar" alt="" class="h-full w-full object-cover" /><template v-else>{{ c.name.slice(0, 1) }}</template></span>
          <div class="flex min-w-0 flex-1 items-center gap-1 truncate font-bold"><span class="truncate">{{ c.name }}</span><span class="shrink-0 rounded px-1 text-[9px] text-white" :class="c.platform === 'youtube' ? 'bg-[#c4302b]' : 'bg-[#8b5cf6]'">{{ PF[c.platform] }}</span><span v-if="c.pr" class="shrink-0 rounded border border-white/40 px-1 text-[9px] opacity-70" title="協賛">PR</span></div>
        </a>
      </li>
    </ul>
    <p class="mt-2 text-right text-[10px] opacity-50">{{ updated ? `更新 ${updated}` : "" }}</p>
  </div>
</template>
