<!--
  CurrencyShelf.vue — クラフトステージの棚 (2026-09-27、ADR-001)

  オーナー:「操作は Craft of Exile 仕様 — カレンシーアイコンをクリックしてカーソルに持ち、アイテムをクリックで適用」
  「カレンシーっていうかクラフトに使える奴全部だねこのステージは」。
  タブ: オーブ・骨 / エッセンス (そのベースで使える物) / カタリスト (指輪・アミュレット) / ルーン (ソケットの付く部位、効き目のある物だけ) /
  お告げ (掛けておくと次の関係する手で食う)。ルーンのタブは 2026-09-29 オーナー「ルーン関係タブでまとめてもいいかも」。
  並べる物・名前・値段は [[craft-stage-shelf.ts]]、1 つの見た目は [[ShelfButton.vue]]。
-->
<script setup lang="ts">
import { scrollBoxOf } from "../../utils/keep-place";
import { toCss } from "../../utils/zoom";
import { GAP_X, GAP_Y } from "../../utils/anchor-place";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import ShelfButton from "./ShelfButton.vue";
import Disclosure from "../../components/ui/Disclosure.vue";
import { useShelf } from "../../state/shelf-context";
import { bonesFor, CATALYSTS, CRAFT_RUNE_KEYS, essenceShelf, OMEN_GROUPS, ORBS, runesFor } from "../../state/craft-stage-shelf";
import { socketCapOf } from "../../services/craft-stage/stage-runes";
import { tr } from "../../i18n/lang";

const emit = defineEmits<{ hold: [key: string] }>();
type ShelfTab = "usable" | "orb" | "essence" | "catalyst" | "rune" | "omen";
/** 最初に開くタブ。エミュレーターもシミュレーターも「使用可能」(2026-10-09 オーナー「エミュレーターではデフォルトで使用可能」「シミュレーターも使用可能からスタート」) */
const props = withDefaults(defineProps<{ initialTab?: ShelfTab }>(), { initialTab: "usable" });
const craftStage = useShelf();
const tab = ref<ShelfTab>(props.initialTab);
/**
 * 持った物に掛けられるお告げの欄 (呼ぶ側の slot "held") は、持ったアイコンを軸に重ねて出す (棚は押し下げない・送らない)。
 * 今のタブにアイコンが無い時だけ、タブの下に並べて出す
 */
const root = ref<HTMLElement | null>(null);
/**
 * お告げの欄の置き場: 持っているカレンシーのアイコン (data-key) のすぐ下。アイコンが右寄りなら右端をそろえる。
 * 今のタブにアイコンが無ければ null (今まで通りタブの下に出す)
 */
const anchor = ref<{ style: Record<string, string> } | null>(null);
function placeAnchor(): void {
  const k = craftStage.held.value, r = root.value;
  if (!k || !r) { anchor.value = null; return; }
  const btn = [...r.querySelectorAll<HTMLElement>(`[data-key="${CSS.escape(k)}"]`)].find((b) => b.offsetParent && !b.closest("[data-held-box]"));
  if (!btn) { anchor.value = null; return; }
  // 画面の座標は拡大率 (zoom) 込みなので、CSS の px に直してから使う (直さずに使って、拡大率の分だけアイコンに被っていた。2026-10-10 オーナー「座標がおかしい」)
  const rr = r.getBoundingClientRect(), b = btn.getBoundingClientRect();
  const px = (v: number): string => `${Math.round(toCss(v))}px`;
  const side: Record<string, string> = b.left - rr.left < rr.width / 2 ? { left: px(Math.max(0, b.left - rr.left - GAP_X)) } : { right: px(Math.max(0, rr.right - b.right - GAP_X)) };
  // ふだんはアイコンのすぐ下
  anchor.value = { style: { top: px(b.bottom - rr.top + GAP_Y), ...side } };
  // 下で画面から切れるなら、アイコンのすぐ上に (送らない。2026-10-10 オーナー「スクロール判定は逆の上でおｋ、1 行上とかでいい」)。測り直しはその時の位置で
  void nextTick(() => {
    const pop = r.querySelector<HTMLElement>(".held-anchor .held-pop-in");
    if (!pop) return;
    const sc = scrollBoxOf(r);
    // スマホは画面の下に固定の帯 (持っている物 → 使う) があるので、その上までを見える所とする (2026-10-10 点検)
    const bar = window.innerWidth < 768 ? document.querySelector<HTMLElement>(".fixed.bottom-0")?.getBoundingClientRect().height ?? 0 : 0;
    const viewBottom = Math.min(sc ? sc.getBoundingClientRect().bottom : Infinity, window.innerHeight) - bar;
    const pr = pop.getBoundingClientRect();
    if (pr.bottom <= viewBottom - GAP_Y) return;
    const rr2 = r.getBoundingClientRect(), b2 = btn.getBoundingClientRect();
    anchor.value = { style: { top: px(b2.top - rr2.top - pr.height - GAP_Y), ...side } };
  });
}
let anchorRo: ResizeObserver | null = null;
watch([() => craftStage.held.value, () => tab.value, () => craftStage.item.value], () => void nextTick(placeAnchor), { immediate: true });
onMounted(() => { if (root.value && typeof ResizeObserver === "function") { anchorRo = new ResizeObserver(() => placeAnchor()); anchorRo.observe(root.value); } });
onBeforeUnmount(() => anchorRo?.disconnect());
/**
 * オーブ・骨のタブ: 今のアイテムに使える (光っている) 物を前に、使えない物を後ろに (2026-10-05 オーナー「使える光ってるオーブを丸ごと前に
 * 持ってきちゃおうか。1 段目に入らなければ折り返して 2 段目に。その方がこれ使えるんだなってなる」)。まとまり (変成・増強…) の並びは保つ
 */
const orbSplit = computed(() => {
  const it = craftStage.item.value;
  void craftStage.omens.value;
  const shown = (k: string): boolean => !craftStage.hidden?.(k);
  // 棚に出さない物 (シミュレーションに要らない物) は写しから外す (ORBS は共通の一覧なので書き換えない)
  const groups = [...ORBS, { kind: "bones", label: "骨", keys: bonesFor(it) }].map((g) => ({ ...g, keys: g.keys.filter(shown) }));
  // お告げを抜きにして打てる物は全部 (掛けたままのお告げのせいで打てない物も残し、ボタンに理由を出す。2026-10-10「錬金の後に高貴が打てない」)
  const ok = (k: string): boolean => !(craftStage.usableBare ?? craftStage.usable)(k);
  return {
    usable: groups.map((g) => ({ kind: g.kind, keys: g.keys.filter(ok) })).filter((g) => g.keys.length),
    unusable: groups.map((g) => ({ kind: g.kind, keys: g.keys.filter((k) => !ok(k)) })).filter((g) => g.keys.length),
  };
});
// クラフトに関わるルーンだけ (他は外す。2026-10-10 オーナー「ルーンいらんくね、クラフト機能のない奴は外そう、邪魔だし」)。
// 外したルーンを打つ処理 (stage-runes.ts) は古い手順の再生のため残す
const runes = computed(() => runesFor(craftStage.item.value).map((g) => ({ ...g, keys: g.keys.filter((k) => CRAFT_RUNE_KEYS.includes(k)) })).filter((g) => g.keys.length));
/**
 * ルーンのタブの「その他のルーン」: クラフトに関わらないルーン・ソウルコア・アイドルも全部 (段ごと)。使用可能のタブには出さない
 * (2026-10-10 オーナー「その他ルーンってとこにやっぱ表示しておくか、使用可能には表示せず、悪さできそうだし色々」: 効果の増加で数値が伸びるため)
 */
const otherRunes = computed(() => runesFor(craftStage.item.value).map((g) => ({ ...g, keys: g.keys.filter((k) => !CRAFT_RUNE_KEYS.includes(k)) })).filter((g) => g.keys.length));
/**
 * 「今のアイテムには使えない物」は畳める (2026-10-08 オーナー「使わないカレンシー閉じてもいいしな畳む」)。
 * PC もスマホも畳んだ状態が既定 (2026-10-09 オーナー「使えないものはデフォで畳んでてくれ、これは手で打つ奴も」)
 */
const unusableOpen = ref(false);
/** ソケット: 今の数 / 熟練工の上限、はめたルーンの数 */
const sockets = computed(() => {
  const it = craftStage.item.value;
  return it ? { cap: socketCapOf(it.base, it.cls.category), now: it.sockets ?? 0, used: it.augments?.length ?? 0 } : null;
});
const essences = computed(() => essenceShelf(craftStage.data.value, craftStage.item.value));
const hasCatalyst = computed(() => ["Rings", "Amulets"].includes(craftStage.item.value?.cls.category ?? ""));
/**
 * 使用可能のタブ (実験、2026-10-05 オーナー「他のエッセンスとかも。使用可能ってタブを足して、そこに使える物だけ全部」)。
 * オーブ・骨 / エッセンス / カタリスト / ルーン (ソウルコア・アイドルも) のうち、今のアイテムに打てる物だけを種類ごとに。お告げは掛けておく物なので入れない
 */
const usableAll = computed(() => {
  const it = craftStage.item.value;
  void craftStage.omens.value;
  // ここもお告げ抜きで (掛けたままのお告げのせいで打てない物を消さず、ボタンに理由を出す。2026-10-10)
  const ok = (k: string): boolean => !(craftStage.usableBare ?? craftStage.usable)(k);
  const sec = (label: string, keys: string[], kind?: string) => ({ label, keys: keys.filter((k) => ok(k) && !craftStage.hidden?.(k)), kind });
  return [
    sec(tr("オーブ・骨", "Orbs & Abyssal Bones"), [...ORBS.flatMap((g) => g.keys), ...bonesFor(it)]),
    sec(tr("エッセンス", "Essences"), essences.value.flatMap((g) => g.keys)),
    ...(hasCatalyst.value ? [sec(tr("カタリスト", "Catalysts"), [...CATALYSTS])] : []),
    // ルーンはルーンのタブと同じ段ごとのまとまり (クラフトに関わる物だけ)
    ...(sockets.value?.cap ? runes.value.map((g) => sec(g.label, g.keys, g.kind)) : []),
  ].filter((x) => x.keys.length);
});
const usableCount = computed(() => usableAll.value.reduce((a, x) => a + x.keys.length, 0));
const TABS = computed(() => [
  { id: "usable" as const, label: `${tr("使用可能", "Usable")} (${usableCount.value})` },
  { id: "orb" as const, label: tr("オーブ・骨", "Orbs & Abyssal Bones") },
  { id: "essence" as const, label: `${tr("エッセンス", "Essences")} (${essences.value.length})` },
  ...(hasCatalyst.value ? [{ id: "catalyst" as const, label: tr("カタリスト", "Catalysts") }] : []),
  ...(sockets.value?.cap ? [{ id: "rune" as const, label: tr("ルーン", "Runes") }] : []),
  { id: "omen" as const, label: craftStage.omens.value.length ? tr(`お告げ (${craftStage.omens.value.length} 枚掛け)`, `Omens (${craftStage.omens.value.length} active)`) : tr("お告げ", "Omens") },
]);
</script>

<template>
  <div ref="root" class="relative" data-shelf-root>
    <div class="mb-2 flex flex-wrap gap-1 text-[12px]">
      <button
        v-for="t in TABS"
        :key="t.id"
        type="button"
        class="g-tab !min-h-[30px] !px-4 !text-[13px] max-md:!min-h-10"
        :class="tab === t.id ? 'on' : ''"
        @click="tab = t.id"
      >{{ t.label }}</button>
    </div>

    <!-- 使用可能 (実験): 今のアイテムに打てる物だけを種類ごとに -->
    <div v-if="tab === 'usable'" class="space-y-2">
      <div v-for="sec in usableAll" :key="sec.kind ?? sec.label">
        <p class="mb-0.5 flex items-center gap-2 text-[10px]">
          <span class="opacity-60">{{ sec.label }} ({{ sec.keys.length }})</span>
        </p>
        <div class="flex flex-wrap gap-1.5 max-md:gap-x-1.5">
          <ShelfButton v-for="k in sec.keys" :key="k" :k="k" @pick="emit('hold', $event)" />
        </div>
      </div>
      <p v-if="!usableAll.length" class="text-[12px] opacity-50">{{ tr("今のアイテムに使える物はありません", "Nothing usable on this item") }}</p>
      <div v-if="$slots.held && !anchor" class="mt-2" data-held-box><slot name="held" /></div>
    </div>

    <!-- 使える物を前に、使えない物は線の下に (2026-10-05)。持っているカレンシーのお告げは使える物の直後 -->
    <div v-else-if="tab === 'orb'">
      <div class="flex flex-wrap gap-x-4 gap-y-2 max-md:gap-x-1.5">
        <template v-for="g in orbSplit.usable" :key="'u' + g.kind">
          <div class="flex flex-wrap gap-1.5 max-md:contents">
            <ShelfButton v-for="k in g.keys" :key="k" :k="k" @pick="emit('hold', $event)" />
          </div>
        </template>
        <p v-if="!orbSplit.usable.length" class="text-[12px] opacity-50">{{ tr("今のアイテムに使える物はありません", "Nothing usable on this item") }}</p>
      </div>
      <div v-if="$slots.held && !anchor" class="mt-2" data-held-box><slot name="held" /></div>
      <template v-if="orbSplit.unusable.length">
        <!-- 2026-10-10 動きの揃え 3: 開く / たたむ は Disclosure に -->
        <div class="mb-1 mt-3 border-t border-white/10 pt-2 max-md:flex max-md:min-h-10 max-md:items-center">
          <Disclosure v-model:open="unusableOpen" :rest="orbSplit.unusable.reduce((a, g) => a + g.keys.length, 0)" class="text-[11px]">{{ tr("今のアイテムには使えない物", "Not usable on this item") }} ·</Disclosure>
        </div>
        <div v-if="unusableOpen" class="flex flex-wrap gap-x-4 gap-y-2 max-md:gap-x-1.5">
          <template v-for="g in orbSplit.unusable" :key="'x' + g.kind">
            <div class="flex flex-wrap gap-1.5 max-md:contents">
              <ShelfButton v-for="k in g.keys" :key="k" :k="k" @pick="emit('hold', $event)" />
            </div>
          </template>
        </div>
      </template>
    </div>

    <div v-else-if="tab === 'essence'" class="flex flex-wrap gap-x-4 gap-y-2 max-md:gap-x-1.5">
      <template v-for="g in essences" :key="g.kind">
        <div class="flex flex-wrap gap-1.5 max-md:contents">
          <ShelfButton v-for="k in g.keys" :key="k" :k="k" @pick="emit('hold', $event)" />
        </div>
      </template>
      <p v-if="!essences.length" class="text-[12px] opacity-50">{{ tr("このベースに使えるエッセンスはありません", "No essences for this base") }}</p>
    </div>

    <div v-else-if="tab === 'catalyst'" class="flex flex-wrap gap-1.5">
      <ShelfButton v-for="k in CATALYSTS" :key="k" :k="k" @pick="emit('hold', $event)" />
    </div>

    <div v-else-if="tab === 'rune'">
      <!-- ソケットの説明と熟練工のオーブは出さない: 新品は最初から規格外の最大のソケット、コラプトでもう 1 つ (2026-10-10 オーナー「こいつもう不必要」) -->
      <!-- 段ごとのまとまり (クラフトに関わるルーンだけ) -->
      <div class="space-y-2">
        <div v-for="g in runes" :key="g.kind">
          <p class="mb-0.5 flex items-center gap-2 text-[10px]">
            <span class="opacity-60">{{ g.label }}</span>
          </p>
          <div class="flex flex-wrap gap-1.5 max-md:contents">
            <ShelfButton v-for="k in g.keys" :key="k" :k="k" @pick="emit('hold', $event)" />
          </div>
        </div>
      </div>
      <p v-if="!runes.length && !otherRunes.length" class="text-[12px] opacity-50">{{ tr("このベースに効くルーンはありません", "No runes for this base") }}</p>
      <!-- その他のルーン (クラフトの決まりは変えないが、効果の増加で数値が伸びる物) -->
      <template v-if="otherRunes.length">
        <p class="mb-1 mt-3 border-t border-white/10 pt-2 text-[11px] text-[var(--exile-color-text-secondary)]">{{ tr("その他のルーン", "Other runes") }}</p>
        <div class="space-y-2">
          <div v-for="g in otherRunes" :key="'o' + g.kind">
            <p class="mb-0.5 text-[10px] opacity-60">{{ g.label }}</p>
            <div class="flex flex-wrap gap-1.5 max-md:contents">
              <ShelfButton v-for="k in g.keys" :key="k" :k="k" @pick="emit('hold', $event)" />
            </div>
          </div>
        </div>
      </template>
    </div>

    <div v-else>
      <p class="mb-2 text-[11px] opacity-60">{{ tr("押すと掛けておきます (何枚でも)。次に打つ手に関係する物だけ使われます。", "Click to activate (any number). Only omens relevant to your next action are consumed.") }}</p>
      <div class="flex flex-wrap gap-x-4 gap-y-2 max-md:gap-x-1.5">
      <div v-for="g in OMEN_GROUPS" :key="g.kind">
        <p class="mb-0.5 text-[10px] opacity-60">{{ g.label }}</p>
        <div class="flex flex-wrap gap-1.5 max-md:contents">
          <ShelfButton v-for="k in g.keys" :key="k" :k="k" omen @pick="craftStage.toggleOmen($event)" />
        </div>
      </div>
      </div>
    </div>
    <!-- オーブ以外のタブ (エッセンス等) で持った時は一番下 (お告げのタブは棚そのものがお告げなので出さない) -->
    <div v-if="tab !== 'orb' && tab !== 'usable' && tab !== 'omen' && $slots.held && !anchor" class="mt-3" data-held-box><slot name="held" /></div>
    <!-- 持っている物のお告げは、そのアイコンのすぐ下に重ねて出す (棚は押し下げない。2026-10-10 オーナー「アイコンの下まで持ってきていい」) -->
    <div v-if="$slots.held && anchor" class="held-anchor" :style="anchor.style" data-held-box><div class="held-pop-in"><slot name="held" /></div></div>
  </div>
</template>

<style scoped>
/* 持っている物のお告げの欄は、そのアイコンのすぐ下に重ねて出す (下の行を押し下げない)。2026-10-10 オーナー「毎回画面がめっちゃ動く」「アイコンの下まで持ってきていい」 */
.held-anchor { position: absolute; z-index: 30; max-width: min(640px, 100%); }
.held-pop-in {
  background: #0d0b10; border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(167, 139, 250, 0.35);
}
</style>
