/**
 * use-video-hand.ts — 動画モードで 1 手を「ゲームと同じ手つき」で見せる (2026-09-28、ADR-001)
 *
 * オーナー:「ゲームないみたいなつくまで道を描いて欲しい。高貴なら高貴をカレンシーから持って行ってマウスでつけて、MOD が追加される
 * みたいな。今は次の画面に行ったらパンっとついた状態でいきなり表示されるから違和感」。
 * 1 手の流れ (時間は ×1 の時。速さで割る):
 *   1. お告げがあれば、棚のお告げへ動いて押す (点灯して「掛けた」状態になる)
 *   2. 棚のカレンシーへ動いて押す → カーソルにアイコンが付く (持つ)
 *   3. アイテムまで運ぶ (弧を描く) → 押す → ここで初めて MOD が付く (呼ぶ側の apply)
 *   発現 (reveal:N) はカレンシーを持たず、アイテムの上に候補 3 つを出し、選ぶ物を点けてから付ける
 * 座標は 1280×720 の枠の中 (拡大しても合う)。skip() で残りを 0 秒にして一気に終わらせる (→ の連打)。
 */
import { reactive, ref, type Ref } from "vue";
import { revealOffers } from "../../services/craft-stage/apply-desecrate";
import { mulberry32 } from "../../services/htc/rng";
import { craftStage } from "../../state/craft-stage";
import { isShard } from "../../services/craft-stage/apply-act";
import type { PlayedStep } from "../../services/craft-stage/run-plan";
import type { StageMod } from "../../services/craft-stage/types";

export interface Hand { x: number; y: number; dur: number; held: string; press: number; visible: boolean; hint: string }

export function useVideoHand(frame: Ref<HTMLElement | null>, speed: Ref<number>) {
  const hand = reactive<Hand>({ x: 1180, y: 700, dur: 0, held: "", press: 0, visible: false, hint: "" });
  /** 掛けたお告げ (棚で赤金に脈打つ = ゲームの有効化) */
  const armed = ref<string[]>([]);
  /** 今の手で使われて消えるお告げ (消える動きを見せる間だけ) */
  const spent = ref<string[]>([]);
  /**
   * 発現の小窓 (魂の井戸)。offers = 今出ている 3 つ、lit = カーソルが乗って光っている行、reroll = 引き直しのボタンを出すか、
   * rerolled = 引き直した後の 3 つか。行と引き直しのボタンの要素は slots に `reveal:row:<i>` / `reveal:reroll` で入れてもらう
   */
  const reveal = ref<{ offers: StageMod[]; lit: number; reroll: boolean; rerolled: boolean; rerollLit: boolean } | null>(null);
  /** 棚の 1 つ 1 つ (キー → 要素)。VideoTray が入れる */
  const slots = new Map<string, HTMLElement>();
  let skipping = false;
  let busy = false;

  const wait = (ms: number): Promise<void> => (skipping ? Promise.resolve() : new Promise((r) => setTimeout(r, ms / speed.value)));
  /** 枠 1 単位あたりの見かけの画素 (拡大率 × アプリの表示倍率。枠の実際の幅から出す) */
  const unit = (f: DOMRect): number => f.width / 1280;
  /** 要素の真ん中 (枠の中の座標) */
  function pointOf(el: Element | null | undefined, fy = 0.5): { x: number; y: number } | null {
    const f = frame.value?.getBoundingClientRect();
    const r = el?.getBoundingClientRect();
    if (!f || !r) return null;
    return { x: (r.x + r.width / 2 - f.x) / unit(f), y: (r.y + r.height * fy - f.y) / unit(f) };
  }
  async function moveTo(p: { x: number; y: number } | null, ms: number): Promise<void> {
    if (!p) return;
    hand.dur = skipping ? 0 : ms / speed.value;
    hand.x = p.x;
    hand.y = p.y;
    await wait(ms);
  }
  async function click(): Promise<void> {
    hand.press++;
    await wait(220);
  }

  /**
   * 1 手を見せる。card はアイテム枠、apply は「付いた」瞬間に呼ぶ (画面の手を進める)。
   * onPick = 発現の手で、選ぶ 3 つが出そろってカーソルが選びに動き始める瞬間 (POE2Tube 要望 ㉗ の pick_ms)
   */
  async function play(st: PlayedStep, card: HTMLElement | null, apply: () => void, onPick?: () => void): Promise<void> {
    if (busy) return;
    busy = true;
    skipping = false;
    hand.visible = true;
    try {
      const cur = st.out.currency;
      const rv = /^reveal:(\d)(:reroll)?$/.exec(cur);
      // シャード: 棚の上で拾うだけ (アイテムには使えない。10 個でオーブになる。要望 ⑧)
      if (isShard(cur)) {
        await moveTo(pointOf(slots.get(cur)), 520);
        await click();
        apply();
        await wait(300);
        return;
      }
      // 1. お告げを有効にする (ゲームと同じく右クリック。有効になると赤金に脈打つ)
      for (const o of st.out.omen ? st.out.omen.split("+") : []) {
        await moveTo(pointOf(slots.get(o)), 520);
        hand.hint = "右クリック";
        await click();
        armed.value = [...armed.value, o];
        await wait(350);
        hand.hint = "";
      }
      // 2. カレンシーを持つ (発現は持たない)
      if (!rv) {
        await moveTo(pointOf(slots.get(cur)), 560);
        await click();
        hand.held = cur;
        await wait(120);
      }
      // 3. アイテムまで運ぶ
      await moveTo(pointOf(card, 0.35), 700);
      if (rv && craftStage.data.value) {
        // 発現 (POE2Tube 要望 ㉗): アイテムを押すと魂の井戸の小窓がアイテムの枠の下に出る → (反響なら引き直しのボタンへ動いて押す →
        // 新しい 3 つ) → 選ぶ行へ動く → 乗せて光る → 少し待って押す → 小窓が閉じて付く
        const off = revealOffers(craftStage.data.value, st.before, mulberry32(st.out.seed));
        await click();
        reveal.value = { offers: off.first, lit: -1, reroll: !!rv[2], rerolled: false, rerollLit: false };
        await wait(550);
        if (rv[2]) {
          await moveTo(pointOf(slots.get("reveal:reroll")), 550);
          reveal.value = { ...reveal.value, rerollLit: true };
          await wait(300);
          await click();
          reveal.value = { offers: off.reroll, lit: -1, reroll: false, rerolled: true, rerollLit: false };
          await wait(550);
        }
        const pick = Number(rv[1]) - 1;
        onPick?.();
        await moveTo(pointOf(slots.get(`reveal:row:${pick}`)), 650);
        reveal.value = { ...reveal.value!, lit: pick };
        await wait(300);
        await click();
        reveal.value = null;
      } else await click();
      hand.held = "";
      // 使われたお告げは消える (ゲームでは有効なお告げは使うと無くなる)
      spent.value = armed.value;
      armed.value = [];
      apply();
      await wait(250);
      setTimeout(() => (spent.value = []), 700);
    } finally {
      busy = false;
      skipping = false;
    }
  }
  /** 手の途中なら残りを一気に終わらせる */
  function skip(): void {
    if (busy) skipping = true;
  }
  /** カーソルの画面上の位置 (演出の波紋を出す所) */
  function screenPoint(): { x: number; y: number } {
    const f = frame.value?.getBoundingClientRect();
    return f ? { x: f.x + hand.x * unit(f), y: f.y + hand.y * unit(f) } : { x: 0, y: 0 };
  }
  return { hand, armed, spent, reveal, slots, play, skip, screenPoint, pointOf, isBusy: () => busy };
}
