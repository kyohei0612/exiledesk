<!--
  StageTargetSummary.vue — シミュレーションの ① 狙う MOD (完成図) (2026-10-05)

  オーナー「付く MOD 選んだ時の UI が分かりづらい、MOD 解析と同じ表示の仕方させるか」→
  「狙う MOD がシミュレーションの枠に入っていて、その下の枠にまた MOD 選択枠があって分かれているのかと思う。枠は一緒の枠で、
  ベースの所に出している表示を ① の MOD の所でするべきで、ベースには非表示でいい。そこに付きやすさの % も出そう、T2 以上なら確率が上がる」。
  クラフト計算機の MOD 解析 ([[ModBreakdown.vue]]) と同じく、左にプレ・右にサフィ、種類の札 + 文 + 段。番号は付ける順番。
  editable の時は ① で選んでいる間: 段のプルダウン・＋ (あるいは)・× (外す)・⧉ コピー (同じ候補のグループをもう 1 つ)。
  付きやすさ = その段以上の重み ÷ 同じ側の全部の重み (このアイテムレベルで出る段、普通の MOD は差したルーンの MOD 込み、冒涜は冒涜の置き場)。
  同じ系統の除外は見ない目安。エッセンスは確定なので出さない
-->
<script setup lang="ts">
import { computed } from "vue";
import { craftStage, nameOf } from "../../state/craft-stage";
import { fillHashes, jaOfMod } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";
import { CRAFTED_SOURCES } from "../../vendor/poe2htc/engine/pool";
import { ESSENCE_KIND, essenceKindOf } from "../../services/mods/essence-kind";
import { effectiveCls } from "../../services/craft-stage/stage-core";
import { withRunes } from "../../vendor/poe2htc/engine/runes";
import { runeJaOf, runeToneOf } from "../../services/craft-stage/mod-list";

const props = defineProps<{ /** ① で選んでいる間 (段・＋・×・コピーを出す) */ editable?: boolean }>();
const s = craftStage;

type Kind = "fracture" | "normal" | "desecrated" | "essence" | "perfect_essence";


/** 付きやすさ (その段以上が、同じ側の 1 回の抽選で出る割合) */
function shareOf(modId: string, minTierIndex: number): number | null {
  const d = s.data.value, it = s.item.value;
  const m = d?.mods.get(modId);
  if (!d || !it || !m || CRAFTED_SOURCES.has(m.source)) return null;
  // ルーンの MOD (コルの狩りなど) はそのルーンを差した時の置き場で割る (シミュレーションは差した白から始める)
  const pools = (m.rune ? withRunes(effectiveCls(it), [m.rune]) : effectiveCls(it)).pools;
  const pool = m.source === "desecrated" ? pools.desecrated : pools.normal;
  const ids = m.type === "suffix" ? pool?.suffixes : pool?.prefixes;
  if (!ids?.length) return null;
  const lv = s.itemLevel.value;
  const w = (id: string, min: number): number => (d.mods.get(id)?.tiers ?? []).reduce((a, t, i) => a + (i >= min && t.ilvl <= lv ? t.weight : 0), 0);
  const total = ids.reduce((a, id) => a + w(id, 0), 0);
  return total > 0 ? w(modId, minTierIndex) / total : null;
}
const pct = (x: number): string => (x >= 0.1 ? `${(x * 100).toFixed(0)}%` : x >= 0.001 ? `${(x * 100).toFixed(1)}%` : "<0.1%");

/** 段のプルダウン (このアイテムレベルで届く段、良い順) */
function tierOptions(modId: string): Array<{ i: number; label: string }> {
  const m = s.data.value?.mods.get(modId);
  if (!m) return [];
  return m.tiers.map((t, i) => ({ i, ilvl: t.ilvl, label: `T${m.tiers.length - i} 以上` })).filter((x) => x.ilvl <= s.itemLevel.value).reverse();
}

const rows = computed(() => {
  const d = s.data.value;
  if (!d) return [];
  let n = 0;
  return s.simTargets.value.flatMap((t) => {
    const m = d.mods.get(t.modId);
    const kind: Kind = t.method === "fracture" ? "fracture"
      : m?.source === "desecrated" || t.method === "desecrate" ? "desecrated"
      : m && CRAFTED_SOURCES.has(m.source) ? essenceKindOf(m) ?? "perfect_essence" : "normal";
    const no = t.method === "fracture" ? null : ++n;
    const row = (x: { modId: string; minTierIndex: number }, alt: boolean) => {
      const xm = d.mods.get(x.modId);
      const xt = xm?.tiers[x.minTierIndex];
      return {
        modId: x.modId, minTierIndex: x.minTierIndex, kind, no: alt ? null : no, alt, group: t.modId,
        side: (xm ?? m)?.type === "suffix" ? "S" : "P",
        text: xm ? fillHashes(jaOfMod(xm), xt ? tierDisplayRanges(xt) : []).replace(/\n/g, " / ") : x.modId,
        rank: xm ? `T${xm.tiers.length - x.minTierIndex} 以上` : "",
        share: shareOf(x.modId, x.minTierIndex),
      };
    };
    const need = Math.max(1, Math.min(t.need ?? 1, 1 + (t.alts?.length ?? 0)));
    return [{ ...row(t, false), need }, ...(t.alts ?? []).map((a) => ({ ...row(a, true), need }))];
  });
});
type Row = (typeof rows.value)[number];

/** 外す: あるいはの候補はその候補だけ、本体は手順ごと (候補も一緒に) */
function drop(r: Row): void {
  if (r.alt) s.simTargets.value = s.simTargets.value.map((t) => (t.modId === r.group ? { ...t, alts: (t.alts ?? []).filter((a) => a.modId !== r.modId) } : t));
  else s.simTargets.value = s.simTargets.value.filter((t) => t.modId !== r.modId);
}
function setTier(r: Row, idx: number): void {
  s.simTargets.value = s.simTargets.value.map((t) => (t.modId !== r.group ? t
    : !r.alt ? { ...t, minTierIndex: idx } : { ...t, alts: (t.alts ?? []).map((a) => (a.modId === r.modId ? { ...a, minTierIndex: idx } : a)) }));
}
/**
 * グループをコピーして、同じ候補の手順をもう 1 つ作る (2026-10-05 オーナー「その MOD 群は 1 MOD としての扱い、コピーボタンで同じ奴が
 * もう 1 個できる」: 耐性 3 つのどれかを 2 つ欲しい時はグループを 2 つ)。手順の名前 (本体) は候補の中でまだ本体に使っていない物に回す。
 * 冒涜の手順を並べた時、2 つ目からは高貴 (冒涜の MOD は 1 つまで)。手順はすぐ後ろに入る
 */
function copyGroup(host: string): void {
  const list = s.simTargets.value;
  const i = list.findIndex((t) => t.modId === host);
  const t = list[i];
  if (!t) return;
  const members = [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])];
  const mains = new Set(list.map((x) => x.modId));
  const next = members.find((m) => !mains.has(m.modId));
  if (!next) return;
  const method = t.method === "desecrate" ? "exalt" : t.method === "fracture" ? undefined : t.method;
  const copy = { modId: next.modId, minTierIndex: next.minTierIndex, ...(method ? { method } : {}), alts: members.filter((m) => m.modId !== next.modId) };
  s.simTargets.value = [...list.slice(0, i + 1), copy, ...list.slice(i + 1)];
}
/** コピーできるか (候補の中にまだ手順の本体になっていない物がある) */
function canCopy(host: string): boolean {
  const t = s.simTargets.value.find((x) => x.modId === host);
  const mains = new Set(s.simTargets.value.map((x) => x.modId));
  return !!t && (t.alts ?? []).some((a) => !mains.has(a.modId));
}

/**
 * 1 つの枠を争う物はグループにまとめる (フラクチャーの候補全部 / 手順の本体 + あるいは)。2 つ以上の時だけ点線の枠で「どれか 1 つ」。
 * グループは 1 MOD (1 枠)。グループの付きやすさは候補の合計
 */
const columns = computed(() => (["P", "S"] as const).map((side) => {
  const list = rows.value.filter((r) => r.side === side);
  const groups: Array<{ key: string; no: number | null; kind: Kind; host: string; need: number; members: Row[]; share: number | null }> = [];
  for (const r of list) {
    const key = r.kind === "fracture" ? "fracture" : r.group;
    const g = groups.find((x) => x.key === key);
    if (g) g.members.push(r);
    else groups.push({ key, no: r.no, kind: r.kind, host: r.group, need: 1, members: [r], share: null });
  }
  for (const g of groups) g.share = g.members.every((m) => m.share == null) ? null : Math.min(1, g.members.reduce((a, m) => a + (m.share ?? 0), 0));
  const used = groups.reduce((a, g) => a + g.need, 0);
  return { title: side === "P" ? "プレフィックス" : "サフィックス", groups, used };
}));
const canAlt = (k: Kind): boolean => k === "normal" || k === "desecrated";

/**
 * 付け方の予定をここで決める (2026-10-05 オーナー「狙う MOD の所でフラクチャー予定とか冒涜予定とかカオススパム予定とか、そこで全部決めたら
 * 後が楽」)。選べるのはその MOD に使える物だけ: 冒涜の MOD は冒涜、エッセンスの MOD はエッセンス、普通の MOD は
 * フラクチャー予定 / 高貴ガチャ / カオススパム / 冒涜。フラクチャー予定は同じ側だけ (どれか 1 つが固定されれば良い)
 */
/** エッセンス / 合金の MOD なら、付ける物の名前 (MOD 名のホバーに出す) */
function essTitle(modId: string): string {
  const m = s.data.value?.mods.get(modId);
  const k = m ? essenceKindOf(m) : null;
  if (!k) return "";
  const key = `essence:${k === "perfect_essence" ? "perfect" : "normal"}:${modId}`;
  const n = nameOf(key);
  return n && n !== key ? `
付ける物: ${n}` : "";
}
/** MOD の種類 (出どころ。左の札) */
type Src = "normal" | "desecrated" | "essence" | "perfect_essence";
const SRC: Record<Src, { label: string; cls: string }> = {
  normal: { label: "クラフト MOD", cls: "border-rarity-magic/70 text-[#c8c8ff]" },
  desecrated: { label: "冒涜 MOD", cls: "border-green-700/80 bg-gradient-to-r from-green-900/60 to-lime-900/40 text-lime-200/90" },
  essence: { label: ESSENCE_KIND.essence.short, cls: "border-sky-400/60 text-sky-200" },
  perfect_essence: { label: ESSENCE_KIND.perfect_essence.short, cls: "border-cyan-400/60 text-cyan-200" },
};
/** 左の札: ルーンの MOD はルーンの名前 (コルの狩りなど) */
function badgeOf(host: string): { label: string; cls: string } {
  const r = s.data.value?.mods.get(host)?.rune;
  return r ? { label: runeJaOf(r), cls: runeToneOf(runeJaOf(r))?.badge ?? "border-amber-400/60 text-amber-200" } : SRC[srcOf(host)];
}
function srcOf(host: string): Src {
  const m = s.data.value?.mods.get(host);
  if (m?.source === "desecrated") return "desecrated";
  return (m && essenceKindOf(m)) ?? "normal";
}
type Plan = "fracture" | "exalt" | "chaos" | "desecrate" | "essence";
const PLAN_JA: Record<Plan, string> = { fracture: "🔒 フラクチャー予定", exalt: "高貴ガチャ", chaos: "カオススパム", desecrate: "冒涜", essence: "エッセンス" };
/** 付け方の予定の色 (2026-10-05 オーナー「高貴ガチャは黄色、フラクチャーはオレンジ、冒涜は深緑」「カオスも黄色」) */
const PLAN_CLS: Record<Plan, string> = {
  fracture: "border-orange-400/80 text-orange-200",
  exalt: "border-yellow-400/80 text-yellow-200",
  chaos: "border-yellow-400/80 text-yellow-200",
  desecrate: "border-green-700 text-green-500",
  essence: "border-sky-400/60 text-sky-200",
};
function plansOf(host: string): Plan[] {
  const m = s.data.value?.mods.get(host);
  if (!m) return ["exalt"];
  if (m.source === "desecrated") return ["desecrate"];
  if (CRAFTED_SOURCES.has(m.source)) return ["essence"];
  return ["fracture", "exalt", "chaos", "desecrate"];
}
function planOf(g: { kind: Kind; host: string }): Plan {
  if (g.kind === "fracture") return "fracture";
  const t = s.simTargets.value.find((x) => x.modId === g.host);
  const ps = plansOf(g.host);
  return t?.method && (ps as string[]).includes(t.method) ? (t.method as Plan) : ps.find((p) => p !== "fracture") ?? ps[0]!;
}
/** ほかのフラクチャー予定と同じ側か (違う側も選べるが、同じ側を推奨。2026-10-05 オーナー「どっちも選択できるでいい、推奨とかで出しておけば」) */
function canFracture(host: string): boolean {
  const type = s.data.value?.mods.get(host)?.type;
  return !s.simTargets.value.some((t) => t.method === "fracture" && t.modId !== host && s.data.value?.mods.get(t.modId)?.type !== type);
}
function setPlan(g: { kind: Kind; host: string }, p: Plan): void {
  let list = s.simTargets.value;
  if (g.kind === "fracture") {
    if (p === "fracture") return;
    // フラクチャー予定のまとまりを全部その付け方に
    list = list.map((t) => (t.method === "fracture" ? { ...t, method: p } : t));
  } else {
    list = list.map((t) => (t.modId === g.host ? { ...t, method: p } : t));
    // フラクチャー予定は一番上へ (最初に作る物)
    if (p === "fracture") list = [...list.filter((t) => t.method === "fracture"), ...list.filter((t) => t.method !== "fracture")];
  }
  s.simTargets.value = list;
}
</script>

<template>
  <div class="grid min-w-0 gap-x-6 gap-y-1 text-[12px] md:grid-cols-2">
    <div v-for="col in columns" :key="col.title" class="min-w-0">
      <p class="mb-0.5 border-b border-white/10 pb-0.5 text-[11px] font-bold" :class="col.used > 3 ? 'text-rose-300' : 'opacity-70'">
        {{ col.title }} ({{ col.used }}/3)<span v-if="col.used > 3" class="ml-1 font-normal">枠が足りない</span>
      </p>
      <p v-if="!col.groups.length" class="py-0.5 opacity-40">{{ props.editable ? "下の一覧の「T○ 以上」で足す" : "なし" }}</p>
      <div v-for="g in col.groups" :key="g.key" class="flex items-start gap-1.5 py-0.5">
        <span class="w-4 shrink-0 pt-px text-right font-bold text-amber-200">{{ g.no ?? "" }}</span>
        <!-- 左は MOD の種類 (出どころ)、右は付け方の予定 (2026-10-05 オーナー「左はクラフト MOD とか冒涜 MOD とか付けるでしょ」) -->
        <span class="shrink-0 rounded border px-1 text-[10px]" :class="badgeOf(g.host).cls" :title="s.data.value?.mods.get(g.host)?.rune ? '差すと付く MOD。回す時はこのルーンを差した白から始める' : undefined">{{ badgeOf(g.host).label }}</span>
        <div class="min-w-0 flex-1" :class="g.members.length > 1 ? 'rounded border border-dashed border-amber-400/50 bg-amber-500/[0.06] px-1.5 py-0.5' : ''">
          <!-- 2 つ以上: 見出し (どれか 1 つ・合計の付きやすさ) と、横に並べて折り返す候補 -->
          <p v-if="g.members.length > 1" class="mb-0.5 flex flex-wrap items-center gap-1 text-[10px] font-bold text-amber-200">
            どれか 1 つ
            <span v-if="g.share != null" class="ml-1 font-normal tabular-nums text-amber-100/80">付きやすさ 合計 {{ pct(g.share) }}</span>
          </p>
          <div :class="g.members.length > 1 ? 'flex flex-wrap items-center gap-x-1.5 gap-y-0.5' : 'flex items-center gap-1.5'">
            <span v-for="r in g.members" :key="r.modId" class="inline-flex min-w-0 max-w-full items-center gap-1" :class="g.members.length > 1 ? 'rounded bg-black/30 px-1' : ''">
              <span class="truncate" :title="r.text + essTitle(r.modId)">{{ r.text }}</span>
              <select v-if="props.editable && tierOptions(r.modId).length > 1" class="shrink-0 rounded-sm bg-amber-500/25 px-0.5 text-[10px] font-bold text-amber-100" title="段を変える (その段以上が当たり)" :value="r.minTierIndex" @change="setTier(r, Number(($event.target as HTMLSelectElement).value))">
                <option v-for="o in tierOptions(r.modId)" :key="o.i" :value="o.i" class="bg-[#14120e]">{{ o.label }}</option>
              </select>
              <span v-else class="shrink-0 rounded-sm bg-amber-500/25 px-1 text-[10px] font-bold text-amber-100">{{ r.rank }}</span>
              <span v-if="r.share != null" class="shrink-0 text-[10px] tabular-nums opacity-70" title="1 回の抽選でこの段以上が出る割合 (同じ側の重み)">{{ pct(r.share) }}</span>
              <button v-if="props.editable" type="button" class="shrink-0 px-0.5 text-[11px] leading-none opacity-50 hover:text-rose-300 hover:opacity-100" :title="r.alt ? 'この候補を外す' : 'この MOD を外す (あるいはの候補ごと)'" @click="drop(r)">×</button>
            </span>
            <!-- 「＋」は MOD のすぐ横 (2026-10-05 オーナー) -->
            <button v-if="props.editable && canAlt(g.kind)" type="button" class="shrink-0 rounded border border-amber-400/40 px-1 text-[11px] leading-none text-amber-200 hover:bg-amber-500/15" title="あるいは (この MOD の代わりに付いても当たりにする MOD を選ぶ)" @click="s.simAltFor.value = g.host">＋</button>
            <!-- コピー: 同じ候補のグループをもう 1 つ (2 つ欲しい時) -->
            <button v-if="props.editable && g.members.length > 1 && g.kind !== 'fracture'" type="button" class="shrink-0 rounded border border-sky-400/40 px-1 text-[11px] leading-none text-sky-200 hover:bg-sky-500/15 disabled:opacity-30" :disabled="!canCopy(g.host)" :title="canCopy(g.host) ? 'このグループをコピーして、同じ候補からもう 1 つ狙う' : '候補の数だけコピー済み'" @click="copyGroup(g.host)">⧉ コピー</button>
          </div>
        </div>
        <!-- 付け方の予定は MOD の右側 (2026-10-05 オーナー「普通カオススパムとかの設定って MOD の右側よ」) -->
        <select v-if="props.editable && plansOf(g.host).length > 1" class="shrink-0 rounded border bg-[#14120e] px-0.5 text-[10px]" :class="PLAN_CLS[planOf(g)]" title="付け方の予定" :value="planOf(g)" @change="setPlan(g, ($event.target as HTMLSelectElement).value as Plan)">
          <option v-for="p in plansOf(g.host)" :key="p" :value="p">{{ PLAN_JA[p] }}{{ p === "fracture" && g.kind !== "fracture" && !canFracture(g.host) ? " (違う側・非推奨)" : "" }}</option>
        </select>
        <span v-else class="shrink-0 rounded border px-1 text-[10px]" :class="PLAN_CLS[planOf(g)]">{{ PLAN_JA[planOf(g)] }}</span>
      </div>
    </div>
  </div>
</template>
