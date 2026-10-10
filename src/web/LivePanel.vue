<script setup lang="ts">
/**
 * 自分・協賛のチャンネルの紹介 (2026-10-07 オーナー「YouTube は紹介だけ、開いた瞬間最新動画が表示されるくらいで」)。
 * server/live の /boot.json を開いた時に 1 回だけ読む (読み直さない。サーバーが 8 時間おきに調べた最新の動画)。
 * 配信中のチャンネルはその配信を、ほかは最新の動画を出す。協賛は PR と出す (ステマ規制)
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { loadBoot } from "./boot";
import { tr } from "../i18n/lang";

interface Entry { id: string; name: string; platform: "youtube" | "twitch"; url: string; pr: boolean; status: "live" | "upcoming"; title: string; thumb: string | null; watchUrl: string; startedAt: string | null; scheduledAt: string | null; viewers: number | null }
interface Latest { title: string; thumb: string; watchUrl: string; publishedAt: string | null }
interface Ch { id: string; name: string; platform: "youtube" | "twitch"; url: string; pr: boolean; status: "live" | "upcoming" | "off"; avatar: string | null; latest?: Latest | null }
interface State { updatedAt: string | null; live: Entry[]; upcoming: Entry[]; channels: Ch[] }

const state = ref<State | null>(null);
const failed = ref("");

// 配信の情報は /boot.json (相場と一緒に 1 回で読む。boot.ts、2026-10-10)
async function load(force = false): Promise<void> {
  const b = await loadBoot(force);
  if (b?.live) { state.value = b.live as State; failed.value = ""; } else failed.value = "boot";
}
// 開いた時に 1 回。45 分以上放置して戻ってきた時は WebApp.vue が exiledesk:refresh を出す (読み直しは WebApp が済ませている)
const onRefresh = (): void => { void load(); };
onMounted(() => { void load(); window.addEventListener("exiledesk:refresh", onRefresh); });
onBeforeUnmount(() => window.removeEventListener("exiledesk:refresh", onRefresh));

const PF: Record<string, string> = { youtube: "YouTube", twitch: "Twitch" };
/** 1 チャンネル 1 枚: 配信中ならその配信、無ければ最新の動画 */
interface Card { id: string; name: string; platform: "youtube" | "twitch"; pr: boolean; avatar: string | null; live: boolean; title: string; thumb: string | null; href: string; when: string }
function ago(iso: string | null): string {
  if (!iso) return "";
  const d = Math.max(0, Date.now() - new Date(iso).getTime());
  const h = Math.floor(d / 3600e3);
  return h < 1 ? tr("1 時間以内", "Within the hour") : h < 24 ? tr(`${h} 時間前`, `${h}h ago`) : tr(`${Math.floor(h / 24)} 日前`, `${Math.floor(h / 24)}d ago`);
}
const cards = computed((): Card[] => (state.value?.channels ?? []).map((c) => {
  const live = state.value?.live.find((e) => e.id === c.id);
  if (live) return { id: c.id, name: c.name, platform: c.platform, pr: c.pr, avatar: c.avatar, live: true, title: live.title, thumb: live.thumb, href: live.watchUrl, when: tr("配信中", "Live now") };
  const l = c.latest;
  return { id: c.id, name: c.name, platform: c.platform, pr: c.pr, avatar: c.avatar, live: false, title: l?.title ?? "", thumb: l?.thumb ?? null, href: l?.watchUrl ?? c.url, when: l ? ago(l.publishedAt) : "" };
}));
</script>

<template>
  <div class="rounded-xl border border-white/10 bg-[#15120d] p-2.5 text-[12px]">
    <div class="mb-2 text-[11px] font-bold text-amber-200">{{ tr("チャンネル", "Channels") }}</div>
    <p v-if="failed && !state" class="py-2 text-center opacity-50">{{ tr("読めなかった", "Could not load") }}</p>
    <ul class="flex flex-col gap-1.5">
      <li v-for="c in cards" :key="c.id" class="overflow-hidden rounded-lg border border-white/10 bg-black/25 hover:border-amber-300/50 hover:bg-black/40">
        <a :href="c.href" target="_blank" rel="noopener" :title="c.title" class="block">
          <div v-if="c.thumb" class="relative aspect-video overflow-hidden bg-gradient-to-br from-[#2a2219] to-[#0e0c09]">
            <img :src="c.thumb" alt="" loading="lazy" class="h-full w-full object-cover" />
            <span v-if="c.live" class="absolute left-1.5 top-1.5 rounded bg-[#e5484d] px-1.5 text-[10px] font-extrabold tracking-wider text-white">LIVE</span>
            <span v-else class="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 text-[10px]">{{ tr("最新の動画", "Latest video") }}</span>
          </div>
          <div class="flex items-center gap-2 px-2 py-1.5">
            <span class="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-[#2a2219] font-bold text-amber-200" :class="c.live ? 'ring-2 ring-[#e5484d]' : ''"><img v-if="c.avatar" :src="c.avatar" alt="" class="h-full w-full object-cover" /><template v-else>{{ c.name.slice(0, 1) }}</template></span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1 truncate font-bold"><span class="truncate">{{ c.name }}</span><span class="shrink-0 rounded px-1 text-[9px] text-white" :class="c.platform === 'youtube' ? 'bg-[#c4302b]' : 'bg-[#8b5cf6]'">{{ PF[c.platform] }}</span><span v-if="c.pr" class="shrink-0 rounded border border-white/40 px-1 text-[9px] opacity-70" :title="tr('協賛', 'Sponsored')">PR</span></div>
              <div v-if="c.title" class="truncate opacity-60">{{ c.title }}</div>
              <div v-if="c.when" class="text-[10px] opacity-40">{{ c.when }}</div>
            </div>
          </div>
        </a>
      </li>
    </ul>
  </div>
</template>
