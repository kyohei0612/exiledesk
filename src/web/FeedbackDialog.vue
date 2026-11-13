<script setup lang="ts">
import { rememberSent, replyTo } from "../state/feedback-replies";
/**
 * 要望・バグを送る窓 (Web 版、2026-10-07 オーナー「要望バグの送信もできるようにしたい」)。
 * server/live の POST /feedback に送る。「今の画面の状態を添付」で ベース・狙い・パターン (シミュレーションの途中) が一緒に届くので再現できる
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { MAX_IMAGES, imagesFromClipboard, shrinkImage, type PickedImage } from "./feedback-images";
import { craftStage } from "../state/craft-stage";
import { WEB_API_BASE } from "./config";
import { diagNow, track, trailNow } from "./track";
import { feedbackSummaryJa } from "./feedback-summary";
import { treeDraftNow } from "./feedback-tree";
import { marketStore } from "../state/market-store";
import { allMods } from "../services/craft-stage/stage-core";
import { craftedKindOf, tierRankOf } from "../services/craft-stage/tier-rank";
import type { StageMod } from "../services/craft-stage/types";
import pkg from "../../package.json";
import { tr } from "../i18n/lang";
import ModalShell from "../components/ui/ModalShell.vue";
import LinkText from "../components/ui/LinkText.vue";
import { flag } from "./release-flags";

/**
 * forId: 返事で「画像を下さい」と頼んだ要望の id (その要望に画像を足す。2026-10-14)。
 * prefill: 開いた時に欄へ最初から入れる文 (シミュの木の未設定一覧の「要望・バグを送る」が木の URL を渡す、11-08 オーナー「おけ　それで進めて」)。
 * 短い URL を待つ間は Promise のまま渡してよい。欄に人がもう書いていたら上書きせず先頭に足す
 */
const props = defineProps<{ open: boolean; forId?: string | null; /** 重ねる窓ではなく、要望・バグを送るのページとして出す (web/page.ts、2026-10-18) */ page?: boolean; prefill?: string | Promise<string> | null }>();
const emit = defineEmits<{ close: [] }>();

// 要望とバグは分けない、連絡先の欄も無し (2026-10-10 オーナー「要望バグ欄統一、連絡先書かなくていい」)
const text = ref("");
const website = ref(""); // bot よけ (人は見えない。入っていたらサーバーが捨てる)
const state = ref<"idle" | "sending" | "sent" | "error">("idle");
const errorText = ref("");
/**
 * 付ける画像 (2026-10-14 オーナー「画像送れるようにもしようか」)。ボタンで選ぶ・貼り付け (Ctrl+V)・落とす、の 3 通り。端末で縮めてから送る
 */
const images = ref<PickedImage[]>([]);
const imageNote = ref("");
const fileEl = ref<HTMLInputElement | null>(null);
const canSend = computed(() => state.value !== "sending" && (props.forId ? images.value.length > 0 : text.value.trim().length > 0));
const clearImages = (): void => { for (const im of images.value) URL.revokeObjectURL(im.url); images.value = []; };
async function addFiles(files: readonly Blob[]): Promise<void> {
  imageNote.value = "";
  for (const f of files) {
    if (images.value.length >= MAX_IMAGES) { imageNote.value = tr(`画像は ${MAX_IMAGES} 枚まで`, `Up to ${MAX_IMAGES} images`); break; }
    try {
      const im = await shrinkImage(f);
      if (im) images.value = [...images.value, im];
      else imageNote.value = tr("この画像は付けられなかった", "Couldn't attach this image");
    } catch { imageNote.value = tr("この画像は付けられなかった", "Couldn't attach this image"); }
  }
}
function removeImage(i: number): void { const im = images.value[i]; if (im) URL.revokeObjectURL(im.url); images.value = images.value.filter((_, j) => j !== i); }
function onPaste(e: ClipboardEvent): void { const fs = imagesFromClipboard(e); if (fs.length) { e.preventDefault(); void addFiles(fs); } }
function onDrop(e: DragEvent): void { const fs = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/")); if (fs.length) { e.preventDefault(); void addFiles(fs); } }
function onPick(e: Event): void { const el = e.target as HTMLInputElement; void addFiles([...(el.files ?? [])]); el.value = ""; }
onBeforeUnmount(clearImages);
// 返事を書く (U-36): 閉じたら返事の形をやめる (次に要望のページを開いた時はふつうの要望)
onBeforeUnmount(() => { replyTo.value = null; });
watch(() => props.open, (v) => { if (!v) replyTo.value = null; });

watch(() => props.open, (v) => { if (v) { state.value = "idle"; errorText.value = ""; imageNote.value = ""; track("feedback:open"); } });
const textEl = ref<HTMLTextAreaElement | null>(null);
watch(() => [props.open, props.prefill] as const, ([v, p]) => {
  if (!v || !p) return;
  void Promise.resolve(p).then((t) => {
    if (!t || props.prefill !== p || text.value.includes(t)) return;
    text.value = text.value.trim() ? `${t}\n${text.value}` : `${t}\n`;
    // 続けて書けるよう、カーソルは入れた文の後ろへ
    requestAnimationFrame(() => { const el = textEl.value; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } });
  }, () => {});
}, { immediate: true });

/**
 * 今の画面の状態 (本文が「使いづらい」「バグっぽい」だけでも、受けた側がすぐ再現・解析できる分を自動で付ける。2026-10-07 オーナー):
 * 版・URL・手で打つ / シミュレーション・ベース・直前の流れ・手で打った手順 (同じ seed で再生できる plan)・今のアイテム・
 * 直近の JS エラーと console・相場の状態。名前やログインの情報は入らない
 */
const KIND_JA = { essence: "エッセンス", alloy: "合金" } as const;
function modLine(m: StageMod): string {
  const data = craftStage.data.value;
  const kind = data ? craftedKindOf(data, m) : null;
  const tier = m.tierIndex == null || !data ? "" : kind ? " T0" : ` T${tierRankOf(data, m.modId, m.tierIndex)}`;
  return `${m.modId}${tier}${kind ? ` (${KIND_JA[kind]})` : ""}${m.fractured ? " (固定)" : ""}${m.desecrated ? " (冒涜)" : ""}`;
}
function contextNow(): unknown {
  const s = craftStage;
  const it = s.item.value;
  const hand = s.log.value.length ? { plan: s.plan(), steps: s.log.value.length } : null;
  const d = diagNow();
  return {
    version: pkg.version,
    url: location.href,
    // 端末の乱数の番号 (使い方の記録と同じ。名前とは結び付かない)。同じ人の要望だと知らせで分かるように (2026-10-12 オーナー)
    uid: (() => { try { return localStorage.getItem("exiledesk.web.uid") ?? null; } catch { return null; } })(),
    // デイリーの名前の id と名前 (端末の控え、views/daily/daily-api.ts の KEY)。困った人の今日の挑戦を `pnpm daily:reset-one <id>` で消せるように。引き継ぎコードは入れない (U-05d・D-37h4、11-10 オーナー「IDで追跡でいいんじゃね」)
    daily: (() => { try { const n = (JSON.parse(localStorage.getItem("exiledesk.daily.v4") ?? "null") as { nick?: { id?: string; name?: string } } | null)?.nick; return n?.id && n.name ? { nickId: n.id, name: n.name } : null; } catch { return null; } })(),
    // 受けた側が読む日本語のまとめ (何を作っていて、どこまで打ったか。Discord の本文に出る)
    summaryJa: (() => { try { return feedbackSummaryJa(); } catch { return []; } })(),
    mode: s.mode.value,
    base: s.base.value,
    itemLevel: s.itemLevel.value,
    // T は段の名前 (T1 = 一番上)。tierIndex (0 = 一番下) のまま書くと逆になる (要望 ff4eb935、11-02)。
    // エッセンス・合金で付いた MOD はアイテムのカードと同じ T0 と「(エッセンス)」「(合金)」(エンジンの craftedKindOf)
    item: it ? { rarity: it.rarity, sockets: it.sockets ?? 0, mods: allMods(it).map((m) => modLine(m)) } : null,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    lang: navigator.language,
    market: { league: marketStore.league.value?.Value ?? null, fetchedAt: marketStore.fetchedAt.value, error: marketStore.error.value },
    // 直前の流れ (何を押して、どこまで進んだか、何秒前か)。詰まった瞬間に送られることが多いので、これで再現の手がかりにする
    trail: trailNow(),
    errors: d.errors,
    console: d.console,
    hand,
    // シミュの作りかけの木 (保存していなくても・別のページからでも。web/feedback-tree.ts、11-08 オーナー「1おけ」)。開くのは web.html?page=sim-tree#recipe=<code>
    treeDraft: treeDraftNow(),
  };
}

async function send(): Promise<void> {
  if (!canSend.value) return;
  state.value = "sending";
  try {
    const imgs = images.value.map((x) => ({ mime: x.mime, b64: x.b64 }));
    const r = props.forId
      // 頼まれた画像を、その要望に足す (送った端末の uid で本人と確かめる)
      ? await fetch(`${WEB_API_BASE}/feedback/${encodeURIComponent(props.forId)}/images`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uid: (() => { try { return localStorage.getItem("exiledesk.web.uid") ?? ""; } catch { return ""; } })(), text: text.value.trim(), images: imgs }),
      })
      : await fetch(`${WEB_API_BASE}/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "request", text: text.value.trim(), contact: "", website: website.value, context: contextNow(), ...(imgs.length ? { images: imgs } : {}), ...(replyTo.value ? { replyTo: replyTo.value.id } : {}) }),
      });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; id?: string };
    if (!r.ok || !j.ok) throw new Error(j.error ?? `${r.status}`);
    // 直した時に返事を届けられるよう、この要望の id を覚える (state/feedback-replies.ts)
    if (j.id) rememberSent(j.id, text.value.trim());
    state.value = "sent";
    text.value = "";
    clearImages();
    track("feedback:sent");
  } catch (e) {
    state.value = "error";
    errorText.value = String((e as Error).message ?? e);
  }
}
</script>

<template>
  <!-- 窓の動き・枠は ModalShell (2026-10-10 オーナー「動きが統一されてない所」: Esc は欄の中だけでなくどこでも効く、自前の地 → .g-panel) -->
  <ModalShell :open="open" :inline="page" :title="forId ? tr('画像を送る', 'Send images') : replyTo ? tr('返事を書く', 'Write a reply') : tr('要望・バグを送る', 'Send feedback')" :width="page ? 'w-full' : 'w-[30rem] max-w-full'" body-class="px-4 py-3" @close="emit('close')">
    <p v-if="state === 'sent'" class="py-6 text-center text-[13px]">{{ tr("届きました。ありがとうございます。", "Received. Thank you!") }}<span v-if="!forId" class="mt-1 block text-[11px] opacity-60">{{ tr("直した時は、次に開いた時にお知らせします (このブラウザで)", "When it is fixed, you will be told the next time you open this page (in this browser)") }}</span></p>
    <div v-else @dragover.prevent @drop="onDrop">
      <!-- 返事を書く (U-36): 元の要望と届いた返事を小さく。送ると元の要望にぶら下がる -->
      <div v-if="replyTo && !forId" data-reply-context class="mb-2 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-[11px] leading-relaxed">
        <p class="truncate text-[var(--exile-color-text-tertiary)]" :title="replyTo.asked">{{ tr("あなたの要望", "Your feedback") }}: {{ replyTo.asked }}</p>
        <p class="line-clamp-3 whitespace-pre-wrap text-[var(--exile-color-text-secondary)]">{{ tr("返事", "Reply") }}: <LinkText :text="tr(replyTo.reply, replyTo.en ?? replyTo.reply)" /></p>
      </div>
      <textarea ref="textEl" v-model="text":rows="forId ? 3 : 6" class="w-full resize-y rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 outline-none focus:border-amber-400/60" :placeholder="forId ? tr('ひとこと (無くてもよい)', 'A note (optional)') : tr('こうなると嬉しい、ここがおかしい (何をしたら何が起きたか) など、なんでも', 'Feature ideas, something that looks wrong (what you did and what happened), anything')" autofocus @paste="onPaste"></textarea>
      <input v-model="website" tabindex="-1" autocomplete="off" class="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden="true" />
      <!-- 画像 (選ぶ・貼り付け・落とす。3 枚まで) -->
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <div v-for="(im, i) in images" :key="im.url" class="relative">
          <img :src="im.url" alt="" class="h-16 w-16 rounded border border-white/15 object-cover" />
          <button type="button" class="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-black/80 text-[12px] leading-none text-rose-300 ring-1 ring-white/20 hover:text-rose-100" :title="tr('外す', 'Remove')" @click="removeImage(i)">×</button>
        </div>
        <button v-if="images.length < MAX_IMAGES" type="button" class="g-btn sm" @click="fileEl?.click()">{{ tr("画像を付ける", "Attach image") }}</button>
        <input ref="fileEl" type="file" accept="image/*" multiple class="hidden" @change="onPick" />
        <span class="min-w-0 text-[11px] opacity-50">{{ imageNote || tr(`貼り付け (Ctrl+V) でも付けられます · ${MAX_IMAGES} 枚まで`, `You can also paste (Ctrl+V) · up to ${MAX_IMAGES}`) }}</span>
      </div>
      <!-- 画面の状態はいつも添付 (チェックの欄は外した。2026-10-13 オーナー「その欄いらんわ、送ってほしいから」: 外して送られ、再現できなかった) -->
      <p v-if="!forId" class="mt-2 text-[11px] opacity-60">{{ tr("今の画面の状態 (ベース・付いている MOD・直前の操作の流れ) も一緒に届きます。デイリーの名前は入ります。ログインの情報は入りません", "The current screen state (base, mods, recent actions) is sent along, with your Daily Craft name. No login info") }}</p>
      <p v-if="state === 'error'" class="mt-2 text-rose-300">{{ tr("送れなかった", "Could not send") }}: {{ errorText }}</p>
    </div>
    <template #footer>
      <button v-if="state === 'sent'" type="button" class="g-btn sm ml-auto" @click="emit('close')">{{ tr("閉じる", "Close") }}</button>
      <template v-else>
        <span v-if="!forId" class="text-[10px] opacity-40">{{ text.trim().length }} / 4000</span>
        <button type="button" class="g-btn sm ml-auto" @click="emit('close')">{{ tr("やめる", "Cancel") }}</button>
        <button type="button" class="g-btn-red sm" :class="flag('monkey1023') ? '' : 'disabled:opacity-40'" :disabled="!canSend" @click="send">{{ state === "sending" ? tr("送っています…", "Sending…") : tr("送る", "Send") }}</button>
      </template>
    </template>
  </ModalShell>
</template>
