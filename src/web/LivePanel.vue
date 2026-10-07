<script setup lang="ts">
/**
 * 自分・協賛のチャンネルの紹介 (2026-10-07 オーナー「YouTube は紹介だけ、開いた瞬間最新動画が表示されるくらいで」)。
 * server/live の /live.json を開いた時に 1 回だけ読む (読み直さない。サーバーが 5 分おきに調べた最新の動画と、配信中かどうか)。
 * 配信中のチャンネルはその配信を、ほかは最新の動画を出す。協賛は PR と出す (ステマ規制)
 */
import { computed, onMounted, ref } from "vue";
import { WEB_API_BASE } from "./config";

interface Entry { id: string; name: string; platform: "youtube" | "twitch"; url: string; pr: boolean; status: "live" | "upcoming"; title: string; thumb: string | null; watchUrl: string; startedAt: string | null; scheduledAt: string | null; viewers: number | null }
interface Latest { title: string; thumb: string; watchUrl: string; publishedAt: string | null }
interface Ch { id: string; name: string; platform: "youtube" | "twitch"; url: string; pr: boolean; status: "live" | "upcoming" | "off"; avatar: string | null; latest?: Latest | null }
interface State { updatedAt: string | null; live: Entry[]; upcoming: Entry[]; channels: Ch[] }

const state = ref<State | null>(null);
const failed = ref("");

onMounted(async () => {
  try {
    const r = await fetch(`${WEB_API_BASE}/live.json`);
    if (!r.ok) throw new Error(String(r.status));
    state.value = (await r.json()) as State;
  } catch (e) {
    failed.value = String((e as Error).message ?? e);
  }
});

const PF: Record<string, string> = { youtube: "YouTube", twitch: "Twitch" };
/** 1 チャンネル 1 枚: 配信中ならその配信、無ければ最新の動画 */
interface Card { id: string; name: string; platform: "youtube" | "twitch"; pr: boolean; avatar: string | null; live: boolean; title: string; thumb: string | null; href: string; when: string }
function ago(iso: string | null): string {
  if (!iso) return "";
  const d = Math.max(0, Date.now() - new Date(iso).getTime());
  const h = Math.floor(d / 3600e3);
  return h < 1 ? "1 時間以内" : h < 24 ? `${h} 時間前` : `${Math.floor(h / 24)} 日前`;
}
const cards = computed((): Card[] => (state.value?.channels ?? []).map((c) => {
  const live = state.value?.live.find((e) => e.id === c.id);
  if (live) return { id: c.id, name: c.name, platform: c.platform, pr: c.pr, avatar: c.avatar, live: true, title: live.title, thumb: live.thumb, href: live.watchUrl, when: "配信中" };
  const l = c.latest;
  return { id: c.id, name: c.name, platform: c.platform, pr: c.pr, avatar: c.avatar, live: false, title: l?.title ?? "", thumb: l?.thumb ?? null, href: l?.watchUrl ?? c.url, when: l ? ago(l.publishedAt) : "" };
}));
</script>

<template>
  <div class="rounded-xl border border-white/10 bg-[#15120d] p-2.5 text-[12px]">
    <div class="mb-2 text-[11px] font-bold text-amber-200">チャンネル</div>
    <p v-if="failed && !state" class="py-2 text-center opacity-50">読めなかった</p>
    <ul class="flex flex-col gap-1.5">
      <li v-for="c in cards" :key="c.id" class="overflow-hidden rounded-lg border border-white/10 bg-black/25 hover:border-amber-300/50 hover:bg-black/40">
        <a :href="c.href" target="_blank" rel="noopener" :title="c.title" class="block">
          <div v-if="c.thumb" class="relative aspect-video overflow-hidden bg-gradient-to-br from-[#2a2219] to-[#0e0c09]">
            <img :src="c.thumb" alt="" loading="lazy" class="h-full w-full object-cover" />
            <span v-if="c.live" class="absolute left-1.5 top-1.5 rounded bg-[#e5484d] px-1.5 text-[10px] font-extrabold tracking-wider text-white">LIVE</span>
            <span v-else class="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 text-[10px]">最新の動画</span>
          </div>
          <div class="flex items-center gap-2 px-2 py-1.5">
            <span class="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-[#2a2219] font-bold text-amber-200" :class="c.live ? 'ring-2 ring-[#e5484d]' : ''"><img v-if="c.avatar" :src="c.avatar" alt="" class="h-full w-full object-cover" /><template v-else>{{ c.name.slice(0, 1) }}</template></span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1 truncate font-bold"><span class="truncate">{{ c.name }}</span><span class="shrink-0 rounded px-1 text-[9px] text-white" :class="c.platform === 'youtube' ? 'bg-[#c4302b]' : 'bg-[#8b5cf6]'">{{ PF[c.platform] }}</span><span v-if="c.pr" class="shrink-0 rounded border border-white/40 px-1 text-[9px] opacity-70" title="協賛">PR</span></div>
              <div v-if="c.title" class="truncate opacity-60">{{ c.title }}</div>
              <div v-if="c.when" class="text-[10px] opacity-40">{{ c.when }}</div>
            </div>
          </div>
        </a>
      </li>
    </ul>
  </div>
</template>
