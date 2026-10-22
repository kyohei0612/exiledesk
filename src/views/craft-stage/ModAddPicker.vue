<!--
  ModAddPicker.vue — MOD 一覧の段の行の「付ける」(2026-10-17、オーナーの残りのタスク「付け方を選べるように」)。
  押すとプルダウンで付け方を 3 つ (そのまま / 冒涜 / フラクチャー) 出す (2026-10-18 オーナー「横に展開は寒い、プルダウンで 3 種類に分けて」)。
  付けられない付け方もプルダウンに残してグレーアウトし、乗せると理由 (既に付いているため など) を出す。
  冒涜で付けられるのは冒涜の置き場の MOD と普通の MOD (骨の発現には普通の MOD も出る。2026-10-18 オーナー「一般 MOD も冒涜で付けれるでしょ」、apply-force.ts)。冒涜の MOD は固定できない (unfracturable)。
  打ち始める前 (始めの状態を組む時) は addStartMod、打ち始めた後は指名の手 (force:…、費用 0・1 手戻すで外せる)
-->
<script setup lang="ts">
import { forceKey, type ForceFlag, allMods, type ModGroup } from "../../services/craft-stage/engine";
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { craftStage as s } from "../../state/craft-stage";
import { tr } from "../../i18n/lang";
import { toCss } from "../../utils/zoom";
import Icon from "../../components/ui/Icon.vue";
import { swallowNextClick } from "../../utils/swallow-click";

const props = defineProps<{ group: ModGroup; modId: string; rank: string }>();
/** 始めの状態を組める (まだ打っていない・再生でない) */
const canStart = computed(() => !s.log.value.length && !s.replay.value);
const desecratedPool = computed(() => props.group === "desecrated" || props.group === "otherworldly");
const essence = computed(() => props.group === "essence" || props.group === "perfect_essence");
/** 始めの状態に入れられる種類 (普通・冒涜)。エッセンス・ルーン・異界は打ち始めた後と同じ指名の手 */
const startable = computed(() => canStart.value && (props.group === "normal" || props.group === "desecrated"));

interface Way { flag: ForceFlag; label: string; why: string | null; run: () => void }
const ways = computed<Way[]>(() => {
  const it = s.item.value;
  const hasFr = startable.value ? s.startMods.value.some((f) => f.fractured) : !!it && allMods(it).some((m) => m.fractured);
  const hasDe = startable.value ? s.startMods.value.some((f) => f.desecrated) : !!it && allMods(it).some((m) => m.desecrated);
  const plain: ForceFlag = desecratedPool.value ? "d" : essence.value ? "e" : "n";
  // 3 つの付け方と、この MOD・このアイテムで付けられない理由 (付けられるなら null で、次に打てるかを見る)
  const list: Array<{ flag: ForceFlag; label: string; block: string | null }> = [
    { flag: plain === "d" ? "n" : plain, label: tr("そのまま", "As is"), block: desecratedPool.value ? tr("冒涜の MOD は「冒涜」で付ける", "Desecrated mods are added as Desecrated") : null },
    { flag: "d", label: tr("冒涜", "Desecrated"), block: !desecratedPool.value && props.group !== "normal" ? tr("冒涜で付けられるのは冒涜専用の MOD と一般 MOD だけ", "Only desecrated-only and regular mods can be added as Desecrated") : hasDe ? tr("既に冒涜の MOD が付いているため (1 つまで)", "A desecrated mod is already on the item (1 max)") : null },
    { flag: "f", label: tr("フラクチャー", "Fracture"), block: desecratedPool.value ? tr("冒涜の MOD は固定できない", "Desecrated mods can't be fractured") : hasFr ? tr("既にフラクチャーの MOD が付いているため (1 つまで)", "A fractured mod is already on the item (1 max)") : null },
  ];
  return list.map(({ flag, label, block }) => {
    if (block) return { flag, label, why: block, run: () => {} };
    if (startable.value) {
      const run = (): void => s.addStartMod({ mod: props.modId, tier: props.rank, ...(flag === "f" ? { fractured: true } : flag === "d" ? { desecrated: true } : {}) });
      return { flag, label, why: null, run };
    }
    const key = forceKey(props.modId, props.rank, flag);
    return { flag, label, why: s.replay.value ? tr("再生中は打てない", "Cannot use during replay") : s.usable(key), run: () => s.use(key) };
  });
});
const none = computed(() => ways.value.every((w) => w.why));
const why = computed(() => (none.value ? ways.value.find((w) => w.why && !/だけ|で付ける|固定できない|only|as Desecrated|can't be fractured/.test(w.why))?.why ?? ways.value[0]!.why : null));

// ── プルダウン (body に出す固定の小窓。MOD 一覧の窓 z-[300] の上) ─────
const open = ref(false);
const btn = ref<HTMLButtonElement | null>(null);
const pos = ref({ left: 0, top: 0, above: false });
const W = 190;
function place(): void {
  const r = btn.value?.getBoundingClientRect();
  if (!r) return;
  const vw = toCss(window.innerWidth), vh = toCss(window.innerHeight);
  const L = toCss(r.left), R = toCss(r.right), T = toCss(r.top), B = toCss(r.bottom);
  const above = B + 130 > vh;
  pos.value = { left: Math.max(8, Math.min(R - W, vw - W - 8, L)), top: above ? T - 4 : B + 4, above };
}
function close(): void {
  open.value = false;
  document.removeEventListener("pointerdown", outside, true);
  window.removeEventListener("scroll", close, true);
  document.removeEventListener("keydown", onKey);
}
function outside(e: PointerEvent): void {
  const t = e.target as HTMLElement | null;
  if (btn.value?.contains(t) || t?.closest?.("[data-mod-add-menu]")) return;
  close();
  swallowNextClick(); // 外を押したら閉じるだけ (下の行・見出しは押さない。utils/swallow-click.ts)
}
function onKey(e: KeyboardEvent): void { if (e.key === "Escape") close(); }
function toggle(): void {
  if (open.value) { close(); return; }
  place();
  open.value = true;
  void nextTick(() => {
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", close, true); // 一覧を送ったら閉じる (固定の小窓が行から離れるので)
    document.addEventListener("keydown", onKey);
  });
}
function pick(w: Way): void { if (w.why) return; w.run(); close(); }
onBeforeUnmount(close);
const style = computed(() => ({ left: `${pos.value.left}px`, top: `${pos.value.top}px`, width: `${W}px`, transform: pos.value.above ? "translateY(-100%)" : undefined }));
</script>

<template>
  <span class="inline-flex items-center" data-mod-add-picker>
    <button ref="btn" type="button" class="tbtn" :data-rec="`mod-add:${modId}:${rank}`" :disabled="none" :aria-expanded="open" :title="why ?? tr(`${rank} を付ける (付け方を選ぶ)`, `Add ${rank} (choose how)`)" @click.stop="toggle">{{ tr("付ける", "Add") }}<Icon name="chevron-down" class="ml-0.5 size-3" /></button>
    <Teleport to="body">
      <div v-if="open" data-mod-add-menu role="menu" class="fixed z-[320] overflow-hidden rounded-md border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-elevated)] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.6)]" :style="style">
        <p class="px-3 pb-1 pt-0.5 text-[10px] text-[var(--exile-color-text-tertiary)]">{{ tr(`${rank} の付け方`, `How to add ${rank}`) }}</p>
        <!-- 付けられない物も残してグレーアウト。disabled にすると乗せても理由が出ないので aria-disabled (2026-10-18 オーナー「ホバーで既についているためと出そう」) -->
        <button v-for="w in ways" :key="w.label" type="button" role="menuitem" class="flex w-full items-center px-3 py-1.5 text-left text-[13px]"
          :class="w.why ? 'cursor-not-allowed text-white/30' : 'text-[var(--exile-color-text-primary)] hover:bg-amber-500/15 hover:text-[#f3e2b8]'"
          :aria-disabled="!!w.why" :data-rec="`mod-add-${w.flag}:${modId}:${rank}`" :title="w.why ?? tr(`${rank} を${w.label}で付ける`, `Add ${rank} as ${w.label}`)" @click.stop="pick(w)">{{ w.label }}</button>
      </div>
    </Teleport>
  </span>
</template>
