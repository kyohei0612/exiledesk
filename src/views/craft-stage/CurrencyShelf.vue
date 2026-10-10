<!--
  CurrencyShelf.vue — クラフトステージの棚 (2026-09-27、ADR-001)

  オーナー:「操作は Craft of Exile 仕様 — カレンシーアイコンをクリックしてカーソルに持ち、アイテムをクリックで適用」
  「カレンシーっていうかクラフトに使える奴全部だねこのステージは」。
  タブ: オーブ・骨 / エッセンス (そのベースで使える物) / カタリスト (指輪・アミュレット) / ルーン (ソケットの付く部位、効き目のある物だけ) /
  お告げ (掛けておくと次の関係する手で食う)。ルーンのタブは 2026-09-29 オーナー「ルーン関係タブでまとめてもいいかも」。
  並べる物・名前・値段は [[craft-stage-shelf.ts]]、1 つの見た目は [[ShelfButton.vue]]。
-->
<script setup lang="ts">
import { computed, nextTick, ref, useSlots, watch } from "vue";
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
/**
 * 持っているカレンシーに掛けられるお告げの並び (呼ぶ側の slot "held")。オーブのタブでは使える物の並びの直後 (2026-10-05 から。前は「その他」の段の直後)、
 * 他のタブは一番下
 */
const tab = ref<ShelfTab>(props.initialTab);
/**
 * 持った物に掛けられるお告げの欄 (slot "held") が出たら、見える所まで送る。打ち終わって欄が消えたら元の位置に戻す
 * (途中で自分で動かしていたら戻さない)。2026-10-09 オーナー「高貴とか選んだらお告げ下に出るけど画面は動かなくて表示されたか分かんないから
 * 下まで表示してあげて、終わったら既定の動きに戻るように」
 */
const slots = useSlots();
const root = ref<HTMLElement | null>(null);
let back: { sc: HTMLElement | null; top: number; after: number | null } | null = null;
const scrollerOf = (el: HTMLElement): HTMLElement | null => {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null; // ページごと送る (スマホ)
};
const topOf = (sc: HTMLElement | null): number => (sc ? sc.scrollTop : window.scrollY);
// 持っている物が替わった時に見る (欄が出たままでも、持ち替えたら送る)
watch(() => craftStage.held.value, (k, old) => {
  if (k) {
    void nextTick(() => {
      if (!slots.held) return;
      const box = root.value?.querySelector<HTMLElement>("[data-held-box]");
      if (!box) return;
      const r = box.getBoundingClientRect();
      if (r.bottom <= window.innerHeight && r.top >= 0) return; // もう見えている
      const sc = scrollerOf(box);
      if (!back) back = { sc, top: topOf(sc), after: null };
      // スマホの下に固定の帯 (持っている物 → 使う) があれば、その分だけ上に (帯の裏に隠れないように)
      const bar = document.querySelector<HTMLElement>(".fixed.bottom-0");
      box.style.scrollMarginBottom = `${(bar?.offsetHeight ?? 0) + 8}px`;
      // なめらかに送る指定は環境によって動かなかったので、すぐ送る
      box.scrollIntoView({ block: "nearest", behavior: "instant" as ScrollBehavior });
      back.after = topOf(back.sc);
    });
  } else if (old && back) {
    // 打ち終わった・離した: 元の位置へ (自分で動かしていたら戻さない)
    const b = back;
    back = null;
    if (b.after == null || Math.abs(topOf(b.sc) - b.after) < 8) (b.sc ?? window).scrollTo({ top: b.top, behavior: "instant" as ScrollBehavior });
  }
});
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
/**
 * 持っている物のお告げ (slot "held") は、持った物がある行のすぐ下に出す (2026-10-10 オーナー「お告げが上に出たり下に出たり。
 * 選んだカレンシーの下でいい、次の行に使えるお告げ関係を出して」)。今のタブに持った物が無ければ今まで通りタブの下
 */
const heldKey = computed(() => craftStage.held.value);
const holds = (keys: readonly string[]): boolean => !!heldKey.value && keys.includes(heldKey.value);
const placed = computed(() => {
  if (!heldKey.value) return false;
  if (tab.value === "orb") return orbSplit.value.usable.some((g) => holds(g.keys)) || (unusableOpen.value && orbSplit.value.unusable.some((g) => holds(g.keys)));
  if (tab.value === "usable") return usableAll.value.some((x) => !x.kind && holds(x.keys));
  if (tab.value === "essence") return essences.value.some((g) => holds(g.keys));
  if (tab.value === "catalyst") return holds(CATALYSTS);
  return false;
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
  <div ref="root">
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
        <div v-if="$slots.held && !sec.kind && holds(sec.keys)" class="mt-2" data-held-box><slot name="held" /></div>
      </div>
      <p v-if="!usableAll.length" class="text-[12px] opacity-50">{{ tr("今のアイテムに使える物はありません", "Nothing usable on this item") }}</p>
      <div v-if="$slots.held && !placed" class="mt-2" data-held-box><slot name="held" /></div>
    </div>

    <!-- 使える物を前に、使えない物は線の下に (2026-10-05)。持っているカレンシーのお告げは使える物の直後 -->
    <div v-else-if="tab === 'orb'">
      <div class="flex flex-wrap gap-x-4 gap-y-2 max-md:gap-x-1.5">
        <template v-for="g in orbSplit.usable" :key="'u' + g.kind">
          <div class="flex flex-wrap gap-1.5 max-md:contents">
            <ShelfButton v-for="k in g.keys" :key="k" :k="k" @pick="emit('hold', $event)" />
          </div>
          <div v-if="$slots.held && holds(g.keys)" class="basis-full" data-held-box><slot name="held" /></div>
        </template>
        <p v-if="!orbSplit.usable.length" class="text-[12px] opacity-50">{{ tr("今のアイテムに使える物はありません", "Nothing usable on this item") }}</p>
      </div>
      <div v-if="$slots.held && !placed" class="mt-2" data-held-box><slot name="held" /></div>
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
            <div v-if="$slots.held && holds(g.keys)" class="basis-full" data-held-box><slot name="held" /></div>
          </template>
        </div>
      </template>
    </div>

    <div v-else-if="tab === 'essence'" class="flex flex-wrap gap-x-4 gap-y-2 max-md:gap-x-1.5">
      <template v-for="g in essences" :key="g.kind">
        <div class="flex flex-wrap gap-1.5 max-md:contents">
          <ShelfButton v-for="k in g.keys" :key="k" :k="k" @pick="emit('hold', $event)" />
        </div>
        <div v-if="$slots.held && holds(g.keys)" class="basis-full" data-held-box><slot name="held" /></div>
      </template>
      <p v-if="!essences.length" class="text-[12px] opacity-50">{{ tr("このベースに使えるエッセンスはありません", "No essences for this base") }}</p>
    </div>

    <div v-else-if="tab === 'catalyst'" class="flex flex-wrap gap-1.5">
      <ShelfButton v-for="k in CATALYSTS" :key="k" :k="k" @pick="emit('hold', $event)" />
      <div v-if="$slots.held && holds(CATALYSTS)" class="basis-full" data-held-box><slot name="held" /></div>
    </div>

    <div v-else-if="tab === 'rune'">
      <p v-if="sockets" class="mb-2 text-[11px] opacity-70">
        {{ tr("ソケット", "Sockets") }} {{ sockets.now }} / {{ sockets.cap }} {{ tr("(熟練工のオーブで足す、コラプトで +1)・はめたルーン", "(add with Artificer's Orb, +1 from corruption) · Runes socketed") }} {{ sockets.used }}{{ tr("。はめたら外せないが、他のルーンで置き換えられる (置き換えた方は壊れる。ソケットバウンドの物は置き換えも不可)。ルーンを持ってソケットの絵を押すとそのソケットを置き換える", ". Socketed runes can't be removed, but can be replaced by another rune (the replaced one is destroyed; socket-bound ones can't be replaced). Hold a rune and click a socket to replace it.") }}
        <ShelfButton k="artificer" class="ml-2 inline-block align-middle" @pick="emit('hold', $event)" />
      </p>
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
      <p v-if="!runes.length" class="text-[12px] opacity-50">{{ tr("このベースに効くルーンはありません", "No runes for this base") }}</p>
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
    <div v-if="tab !== 'orb' && tab !== 'usable' && tab !== 'omen' && $slots.held && !placed" class="mt-3" data-held-box><slot name="held" /></div>
  </div>
</template>
