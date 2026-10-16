/**
 * use-spam-share.ts — カオススパム計算機の結果を X でシェア (StageChaosSpam.vue から分けた、2026-10-16、500 行の決まり)。
 * 運の言葉 (luck・rankWord) も PC の欄・スマホの帯・シェアの文で同じ物を使う
 */
import { computed, ref, watch, type Ref } from "vue";
import { craftStage as s, nameOf } from "../../state/craft-stage";
import { spamAims } from "../../state/chaos-spam";
import { medianOf, unluckyOf, SPAM_PEOPLE, type SpamStats } from "../../services/craft-stage/chaos-spam";
import { aimLabel } from "../../services/craft-stage/mod-list";
import { baseArtFile } from "../../services/craft-stage/base-art";
import { isTauriRuntime } from "../../utils/isTauriRuntime";
import { openExternal } from "../../services/trade2/open-external";
import { logRecord } from "../../utils/log-record";
import { isEn, tr } from "../../i18n/lang";

/** 自分のスパムの結果。sig = 狙いとカオスの種類 (変わったら別のスパム) */
export interface SpamResult { sig: string; uses: number; applied: number; hit: boolean; reason: string | null; rank: number | null }

/** 運の言葉 (PC の欄とスマホの帯で同じ) */
export const luck = (r: number): string => (r <= 10 ? tr("かなりの強運", "very lucky") : r <= 50 ? tr("運がいい方", "lucky") : r <= 90 ? tr("運が悪い方", "unlucky") : tr("かなりの沼", "very unlucky"));
/** 順位の言葉: 半分より早ければ「上位」、遅ければ「下位」(85% → 下位 15%。2026-10-16 オーナー「運悪いのに上位はおかしい」) */
export const rankWord = (r: number): string => (r <= 50 ? tr(`上位 ${r}%`, `top ${r}%`) : tr(`下位 ${Math.max(1, 100 - r)}%`, `bottom ${Math.max(1, 100 - r)}%`));

export function useSpamShare(o: { result: Ref<SpamResult | null>; stats: Ref<SpamStats | null>; statsFresh: () => boolean; key: Ref<string>; cost: (n: number) => string }) {
  const { result, stats, key, cost } = o;
  const inApp = isTauriRuntime();
  /**
   * シェア (2026-10-16 オーナー「計算機はシェア機能追加。自慢目的、URL と共に宣伝」「押したらそのまま X に」「画像付き」)。
   * 押すと X の投稿画面へ (アプリは外のブラウザで)。URL は /s/spam (server/web/og-card.js): X はそこから結果のカードの絵を出し、
   * 押した人はそのベースのエミュレーターへ。結果は全部 URL に入れる (サーバーは何も保存しない)
   */
  /** 中身を縮めて URL に (server/web/og-card.js の PACK と同じ並び: [l, b, bn, m, n, a, r, md, u, c] を deflate → base64url) */
  async function packCard(v: Array<string | number | null>): Promise<string> {
    const bytes = new Uint8Array(await new Response(new Blob([JSON.stringify(v)]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
    let bin = "";
    for (const x of bytes) bin += String.fromCharCode(x);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  const shareUrl = ref("");
  watch([result, () => stats.value, isEn], async () => {
    const r = result.value;
    if (!r?.hit) { shareUrl.value = ""; return; }
    const st = stats.value && o.statsFresh() ? stats.value : null;
    const code = await packCard([
      isEn.value ? "en" : "ja",
      s.base.value,
      isEn.value ? s.base.value : (s.item.value?.baseJa ?? s.base.value),
      spamAims.value.map((a) => aimLabel(s.data.value, a)).join(tr("・", ", ")),
      r.uses,
      baseArtFile(s.base.value),
      r.rank,
      st ? medianOf(st) : null,
      st ? unluckyOf(st) : null,
      cost(r.applied) || null,
    ]);
    shareUrl.value = `${inApp ? "https://exiledesk.com" : location.origin}/s/${code}`;
    // カードの絵を先に作らせておく (X が読みに来た時に作り始めると、出るまで待たされた。2026-10-16)
    try { void fetch(`${inApp ? "https://exiledesk.com" : location.origin}/og/${code}.png`, { mode: "no-cors" }); } catch { /* 作れなくても X が来た時に作る */ }
  }, { immediate: true });
  const shareText = computed(() => {
    const r = result.value;
    if (!r?.hit) return "";
    const base = isEn.value ? s.base.value : (s.item.value?.baseJa ?? s.base.value);
    const mods = spamAims.value.map((a) => aimLabel(s.data.value, a)).join(tr("・", ", "));
    const luckLine = r.rank != null ? tr(`${SPAM_PEOPLE} 人中 ${rankWord(r.rank)} の運 (${luck(r.rank)})`, `${rankWord(r.rank)} luck among ${SPAM_PEOPLE} people (${luck(r.rank)})`) : "";
    return tr(
      `カオススパムで ${base} に ${mods} を ${nameOf(key.value)} ${r.uses.toLocaleString()} 回で付けた！ ${luckLine}\n#PoE2 #ExileDesk`,
      `Chaos spammed ${mods} onto ${base} in ${r.uses.toLocaleString()} ${nameOf(key.value)} uses! ${luckLine}\n#PoE2 #ExileDesk`,
    );
  });
  /** X の投稿画面 (文の最後に URL が付く) */
  const xUrl = computed(() => `https://x.com/intent/post?text=${encodeURIComponent(shareText.value)}&url=${encodeURIComponent(shareUrl.value)}`);
  /** スマホ (iPhone・Android) */
  const mobile = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  function shareX(e: MouseEvent): void {
    logRecord("emu_spam_share", { to: mobile ? "x-app" : "x", base: s.base.value, rank: result.value?.rank ?? null });
    if (inApp) {
      e.preventDefault();
      void openExternal(xUrl.value);
      return;
    }
    if (!mobile) return;
    // スマホは X のアプリを直接開く (2026-10-16 オーナー「スマホ版はそのままアプリに飛ばそうか、これウェブに飛ぶね」)。
    // アプリが無くて開けなかった時 (1.5 秒たってもページが見えたまま) は Web の投稿画面へ
    e.preventDefault();
    const web = xUrl.value;
    let left = false;
    const onHide = (): void => { if (document.visibilityState === "hidden") left = true; };
    document.addEventListener("visibilitychange", onHide);
    setTimeout(() => {
      document.removeEventListener("visibilitychange", onHide);
      if (!left && document.visibilityState === "visible") location.href = web;
    }, 1500);
    location.href = `twitter://post?message=${encodeURIComponent(`${shareText.value}\n${shareUrl.value}`)}`;
  }

  return { shareUrl, shareText, xUrl, shareX };
}
