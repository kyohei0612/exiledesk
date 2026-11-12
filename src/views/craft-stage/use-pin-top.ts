/**
 * use-pin-top.ts — スマホで上に貼る品のカード (M-72、[data-item-pin]) を、エミュの画面のすぐ前に置かれた「上に貼り付く帯」の下に貼る (M-72b)。
 * デイリーの投稿の中のエミュ (D-12) は、エミュの画面の前に帯 (投稿へ戻る / この品で投稿へ) を貼り付けて置く。カードも画面の上 0 に貼ると帯の上に重なり、帯のボタンが押せなかった。
 * 見るのは「エミュの画面の外枠のすぐ前の兄弟が position: sticky か」だけ (置いた側の名前は知らない)。その高さを外枠の --stage-pin-top に入れ、帯の高さが変われば追う。
 * 前に帯が無い時 (エミュのタブ) は何もしない = 上 0 のまま
 */
import { onBeforeUnmount, onMounted, type Ref } from "vue";

export function usePinTop(root: Ref<HTMLElement | null>): void {
  let ro: ResizeObserver | null = null;
  onMounted(() => {
    const el = root.value, above = el?.previousElementSibling;
    if (!el || !(above instanceof HTMLElement) || getComputedStyle(above).position !== "sticky") return;
    const set = (): void => el.style.setProperty("--stage-pin-top", `${Math.round(above.getBoundingClientRect().height)}px`);
    set();
    ro = new ResizeObserver(set);
    ro.observe(above);
  });
  onBeforeUnmount(() => ro?.disconnect());
}
