<!--
  CoreStatsCard.vue — 火力の中身 (2026-10-04)

  オーナー「DPS はその火力の計算に関わってる奴全て表示して、自分と相手で分かりやすく。基礎 DPS に関わってる主なステータスを UI でどっかに」
  「ゲーム内表記で基本的に統一でいいよ表示は」。並びはゲームのスキルの詳細 (オーナーの Spark / ファイヤーストームの画面) と同じ節:
    ダメージ / 使用量 / 投射物 / クリティカルヒット、と 増加と上昇 (ノード・サポートで上がる所)。
  ゲームの詳細はスキルごとに、そのスキルが持つ stat (クールダウン・シール・嵐の半径など) をスキル専用の書き方で並べる。そこは PoB に無いので出さず、
  どのスキルにもある火力の数字だけを同じ名前で出す。上のバーのスキルについて 自分 → 相手 (相手は比較の時だけ)
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import type { CoreStats } from "../../services/pob-check/api";
import { fmtNum } from "./fmt";
import DiffBadge from "./DiffBadge.vue";

const props = defineProps<{
  mine: CoreStats | null | undefined; target?: CoreStats | null; skillJa: string;
  /** 敵の想定 (入っている敵の状態の設定) */
  enemyMine?: Record<string, boolean | number>; enemyTarget?: Record<string, boolean | number> | null;
  /** 開いたまま (火力チェックの「内訳」タブ) */
  expanded?: boolean;
}>();

const TYPE_JA: Record<string, string> = { Physical: "物理", Fire: "火", Cold: "冷気", Lightning: "雷", Chaos: "混沌" };
const pct = (v: number) => `${Math.round(v)}%`;
const plusPct = (v: number) => `+${Math.round(v)}%`;
const range = (lo: number, hi: number) => `${fmtNum(lo)} - ${fmtNum(hi)}`;

/** 1 行: 見せる文字 (自分 / 相手) と、差の印に使う数 (無ければ印なし) */
type Row = { label: string; a: string; b: string | null; na?: number; nb?: number | null; hint?: string };
type Section = { title: string; rows: Row[] };

/** 本家の名前 → 画面の言葉 (ゲーム内の書き方。増加 = 増加、増し = 上昇) */
const STAT_JA: Record<string, string> = {
  Damage: "ダメージ", ElementalDamage: "元素ダメージ", PhysicalDamage: "物理ダメージ", FireDamage: "火ダメージ", ColdDamage: "冷気ダメージ",
  LightningDamage: "雷ダメージ", ChaosDamage: "混沌ダメージ", CritChance: "クリティカルヒット率", CritMultiplier: "クリティカルダメージボーナス",
  Speed: "スキルスピード", ProjectileSpeed: "投射物スピード", AreaOfEffect: "効果範囲", Duration: "スキル効果持続時間", ProjectileCount: "追加の投射物",
};
const EL_JA: Record<string, string> = { "": "", Physical: "物理", Fire: "火", Cold: "冷気", Lightning: "雷", Chaos: "混沌", Elemental: "元素" };
/** 計算に入る数値の 1 行の名前 */
function calcLabel(name: string, kind: string): string {
  const gain = /^(\w*?)DamageGainAs(\w+)$/.exec(name);
  // 短く (段組の幅に収める): 「火ダメージとして追加で得る」/ 種類の決まった物は「冷気から雷ダメージとして追加で得る」
  if (gain) return `${gain[1] ? `${EL_JA[gain[1]!] ?? gain[1]}から` : ""}${EL_JA[gain[2]!] ?? gain[2]}ダメージとして追加で得る`;
  const conv = /^(\w+?)DamageConvertTo(\w+)$/.exec(name);
  if (conv) return `${EL_JA[conv[1]!] ?? conv[1]}から${EL_JA[conv[2]!] ?? conv[2]}ダメージに変換`;
  const base = STAT_JA[name] ?? name;
  if (kind === "INC") return `${base}増加`;
  if (kind === "MORE") return `${base}上昇`;
  return name === "ProjectileCount" ? base : `基本の${base}`;
}
/** 計算に入る数値を 自分 → 相手 で (どちらかで 0 でない物。耐性貫通は上の ダメージ に出すので除く) */
function calcRows(a: CoreStats, b: CoreStats | null): Row[] {
  const key = (x: { name: string; kind: string }) => `${x.kind}|${x.name}`;
  const ma = new Map((a.calc ?? []).map((x) => [key(x), x.value]));
  const mb = new Map((b?.calc ?? []).map((x) => [key(x), x.value]));
  const order = [...new Set([...(a.calc ?? []), ...(b?.calc ?? [])].map(key))].filter((k) => !/Penetration$/.test(k));
  return order.map((k) => {
    const [kind, name] = k.split("|") as [string, string];
    const va = ma.get(k) ?? 0, vb = b ? mb.get(k) ?? 0 : null;
    const show = (v: number) => (name === "ProjectileCount" ? `${v > 0 ? "+" : ""}${Math.round(v)}` : `${kind === "INC" || kind === "MORE" ? "" : "+"}${Math.round(v)}%`);
    return { label: calcLabel(name, kind), a: show(va), b: vb != null ? show(vb) : null, na: va, nb: vb };
  });
}

/** 条件の名前 (本家の変数名) → 日本語 (ゲーム内の書き方)。無い物は変数名のまま */
const VAR_JA: Record<string, string> = {
  Blinded: "盲目", LowLife: "低ライフ", FullLife: "ライフが満タン", Shocked: "感電", Chilled: "冷却", Frozen: "凍結", Ignited: "発火",
  Poisoned: "毒", Bleeding: "出血", Cursed: "呪い", Stunned: "スタン", Electrocuted: "電撃", Dazed: "幻惑", Pinned: "釘付け",
  Burning: "燃焼", Moving: "移動中", UsingFlask: "フラスコ効果中", RareOrUnique: "レアかユニーク", Unique: "ユニーク", Rare: "レア",
  Hindered: "妨害", Maimed: "不具", Intimidated: "威圧", Unnerved: "動揺", Exposed: "曝露", BrokenArmour: "アーマー破壊", HeavyStunned: "ヘビースタン",
  Immobilised: "移動不能", CritRecently: "最近クリティカルヒットした", KilledRecently: "最近キルした", HitRecently: "最近ヒットした",
  BeenHitRecently: "最近ヒットを受けた", OnFullEnergyShield: "ES が満タン", LowMana: "低マナ", HaveTotem: "トーテムがいる",
  WeaponSet1: "武器セット I", WeaponSet2: "武器セット II", TriggeredSkillRecently: "最近トリガーしたスキルがある",
  InfusionConsumedRecently: "最近インフュージョンを消費した", ShockedEnemyRecently: "最近敵を感電させた", ChilledEnemyRecently: "最近敵を冷却した",
  IgnitedEnemyRecently: "最近敵を発火させた", FrozenEnemyRecently: "最近敵を凍結させた", GainedPowerChargeRecently: "最近パワーチャージを得た",
  FullEnergyShield: "ES が満タン", Debilitated: "衰弱", UsedSkillRecently: "最近スキルを使った", CastSpellRecently: "最近呪文を詠唱した",
  BrandedEnemy: "刻印された敵", targetBrandedEnemy: "刻印された敵",
};
const varJa = (v: string) => v.split("/").map((x) => VAR_JA[x] ?? (/Infused$/.test(x) ? "インフュージョン中" : x)).join(" か ");
/** 条件の書き方 (「敵が盲目の時」「敵が感電でない時」「自分が最近クリティカルヒットした時」) */
function condJa(c: { var: string; actor?: string; neg?: boolean }): string {
  const who = c.actor === "enemy" ? "敵が" : c.actor ? `${c.actor}が` : "";
  const v = varJa(c.var);
  // 「最近スキルを使った」「トーテムがいる」のような動きの言葉は「時」、名前は「の時」
  const verb = /[たるい]$/.test(v);
  return `${who}${v}${c.neg ? (verb ? "ではない時" : "でない時") : verb ? "時" : "の時"}`;
}
/** 出所 (Tree:… = ノード、Item:番号:名前 = 装備、Skill:… = ジェム) */
function srcJa(s: string): string {
  if (s.startsWith("Tree")) return "ノード";
  const item = /^Item:\d+:(.+)$/.exec(s);
  if (item) return item[1]!;
  if (s.startsWith("Skill")) return "ジェム";
  return s.split(":")[0] ?? s;
}
/** 敵の想定の設定の名前 (conditionEnemyBlinded → 盲目) */
function enemyJa(key: string): string {
  const m = /^(?:condition)?Enemy(\w+)$/i.exec(key) ?? /^conditionEnemy(\w+)$/.exec(key);
  return m ? varJa(m[1]!) : VAR_JA[key] ?? key;
}
const enemyLine = computed(() => {
  const list = (e?: Record<string, boolean | number> | null) => Object.keys(e ?? {}).map(enemyJa).sort();
  return { mine: list(props.enemyMine), target: props.target ? list(props.enemyTarget) : null };
});
/** 条件付きで今は効いていない火力の MOD (自分 / 相手) */
const condLists = computed(() => {
  const fmt = (c: NonNullable<CoreStats["cond"]>[number]) => ({
    text: `${condJa(c)}: ${calcLabel(c.name, c.kind)} ${c.kind === "MORE" || c.kind === "INC" ? "" : "+"}${Math.round(c.value)}%`,
    src: srcJa(c.source),
  });
  const group = (list: NonNullable<CoreStats["cond"]>) => {
    const m = new Map<string, NonNullable<CoreStats["cond"]>[number] & { n: number; srcs: Set<string> }>();
    for (const c of list) {
      if (c.source === "Base" || c.source.startsWith("Base")) continue;
      const k = `${c.var}|${c.actor ?? ""}|${c.neg ? 1 : 0}|${c.name}|${c.kind}`;
      const cur = m.get(k);
      if (cur) { cur.value += c.value; cur.n++; cur.srcs.add(srcJa(c.source)); }
      else m.set(k, { ...c, n: 1, srcs: new Set([srcJa(c.source)]) });
    }
    return [...m.values()].map((c) => ({ ...fmt(c), src: [...c.srcs].join("・") + (c.n > 1 ? ` ${c.n} 個` : "") }));
  };
  return { mine: group(props.mine?.cond ?? []), target: props.target ? group(props.target.cond ?? []) : null };
});

/**
 * 開くかどうか (2026-10-04 オーナー「最初の UI がブスすぎる。スキル選択して火力の詳細が知りたい時になったら展開する形で、詳細とかでボタン、たためるように」)。
 * 初めは閉じて 1 行だけ。expanded (火力チェックの「内訳」タブ、2026-10-04) は開いたまま
 */
const open = ref(!!props.expanded);
/** 閉じている時の 1 行 (平均ヒット・クリティカルヒット率・クリティカルダメージボーナス) */
const brief = computed(() => {
  const a = props.mine, b = props.target ?? null;
  if (!a) return [];
  const two = (f: (c: CoreStats) => string) => (b ? `${f(a)} → ${f(b)}` : f(a));
  return [
    { label: "ヒットごとの平均ダメージ", v: two((c) => fmtNum(c.avg)) },
    { label: "クリティカルヒット率", v: two((c) => `${c.critChance.toFixed(2)}%`) },
    { label: "クリティカルダメージボーナス", v: two((c) => plusPct((c.critMulti - 1) * 100)) },
  ];
});

const sections = computed<Section[]>(() => {
  const a = props.mine, b = props.target ?? null;
  if (!a) return [];
  const row = (label: string, get: (c: CoreStats) => number | undefined, show: (v: number) => string, opts: { hint?: string; noBadge?: boolean } = {}): Row | null => {
    const va = get(a), vb = b ? get(b) : undefined;
    if ((va == null || va === 0) && (vb == null || vb === 0)) return null;
    return { label, a: va != null ? show(va) : "—", b: b ? (vb != null ? show(vb) : "—") : null, na: opts.noBadge ? undefined : va ?? 0, nb: opts.noBadge ? null : vb ?? null, hint: opts.hint };
  };
  const keep = (rs: Array<Row | null>): Row[] => rs.filter((r): r is Row => !!r);
  // 種類ごとのダメージ・耐性貫通 (自分と相手の種類を合わせて)
  const types = [...new Set([...(a.ranges ?? []), ...(b?.ranges ?? [])].map((r) => r.type))];
  const rangeOf = (c: CoreStats | null, t: string) => c?.ranges?.find((r) => r.type === t);
  const typeRows: Row[] = types.flatMap((t) => {
    const ra = rangeOf(a, t), rb = rangeOf(b, t);
    const ja = TYPE_JA[t] ?? t;
    const out: Row[] = [{ label: `${ja}ダメージ`, a: ra ? range(ra.min, ra.max) : "—", b: b ? (rb ? range(rb.min, rb.max) : "—") : null, na: ra ? (ra.min + ra.max) / 2 : 0, nb: b ? (rb ? (rb.min + rb.max) / 2 : 0) : null }];
    if ((ra?.pen ?? 0) > 0 || (rb?.pen ?? 0) > 0) out.push({ label: `${ja}耐性貫通`, a: pct(ra?.pen ?? 0), b: b ? pct(rb?.pen ?? 0) : null, na: ra?.pen ?? 0, nb: b ? rb?.pen ?? 0 : null });
    return out;
  });
  return [
    { title: "ダメージ", rows: [
      ...keep([
        row("秒間ダメージ量", (c) => c.dps, fmtNum),
        row("ヒットごとの平均ダメージ", (c) => c.avg, fmtNum, { hint: "クリティカル込み (敵の軽減なし)" }),
      ]),
      ...(a.totalMax ? [{ label: "合計ダメージ", a: range(a.totalMin ?? 0, a.totalMax ?? 0), b: b ? range(b.totalMin ?? 0, b.totalMax ?? 0) : null, na: ((a.totalMin ?? 0) + (a.totalMax ?? 0)) / 2, nb: b ? ((b.totalMin ?? 0) + (b.totalMax ?? 0)) / 2 : null }] : []),
      ...typeRows,
    ] },
    { title: "使用量", rows: keep([
      row("キャストタイム", (c) => (c.speed > 0 ? 1 / c.speed : undefined), (v) => `${v.toFixed(2)}秒`, { noBadge: true }),
      row("秒間キャスト回数", (c) => c.speed, (v) => v.toFixed(2)),
    ]) },
    { title: "投射物", rows: keep([
      row("放たれる投射物数", (c) => c.projectiles, (v) => String(Math.round(v))),
      row("投射物スピードモッド", (c) => c.incProjSpeed, plusPct),
    ]) },
    { title: "クリティカルヒット", rows: keep([
      row("クリティカルヒット率", (c) => c.critChance, (v) => `${v.toFixed(2)}%`),
      row("クリティカルダメージボーナス", (c) => (c.critMulti - 1) * 100, plusPct),
    ]) },
    { title: "計算に関わる数値 (ノード・装備・サポートで変わる所)", rows: calcRows(a, b) },
  ].filter((s) => s.rows.length);
});
</script>

<template>
  <section v-if="sections.length" class="card px-4 py-2.5">
    <!-- 見出しの 1 行 (閉じている時はこれだけ) -->
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
      <p class="text-[13px] font-bold">火力の中身 <span class="note font-normal">— {{ skillJa }}{{ target ? " (自分 → 相手)" : "" }}</span></p>
      <template v-if="!open">
        <span v-for="x in brief" :key="x.label" class="text-[12px]"><span class="text-[var(--exile-color-text-tertiary)]">{{ x.label }}</span> <b class="tabular-nums">{{ x.v }}</b></span>
      </template>
      <button type="button" class="ml-auto rounded-md border border-white/15 px-2.5 py-0.5 text-[12px] hover:bg-white/10" @click="open = !open">{{ open ? "たたむ ▴" : "詳細 ▾" }}</button>
    </div>
    <template v-if="open">
    <p class="note mb-2 mt-1">名前と並びはゲームのスキルの詳細と同じ (スキル専用の項目は PoB に無いので出さない)</p>
    <!--
      段組 (2026-10-04 オーナー「見づらい、隙間多い、UI 工夫して」): 節を上から詰めて流す (CSS の段組)。行は 名前 | 自分 | 相手 | 差 の列をそろえた表、
      1 行おきに薄い地。差の印は右端にそろえる
    -->
    <div class="columns-1 gap-6 @4xl:columns-2 @7xl:columns-3">
      <!-- 短い節は段の途中で切らない。長い節 (計算に関わる数値) は段をまたいで流す -->
      <div v-for="s in sections" :key="s.title" class="mb-3" :class="s.rows.length <= 12 ? 'break-inside-avoid' : ''">
        <p class="mb-0.5 flex items-baseline justify-between border-b border-white/10 pb-0.5 text-[12px] font-bold text-[var(--exile-color-text-secondary)]">
          <span>{{ s.title }}</span>
          <span v-if="target" class="flex gap-0 text-[10px] font-normal text-[var(--exile-color-text-tertiary)]"><span class="w-[6.5rem] text-right">自分</span><span class="w-[6.5rem] text-right">相手</span><span class="w-[4.25rem]" /></span>
        </p>
        <div
          v-for="(r, i) in s.rows"
          :key="r.label"
          class="flex items-center rounded px-1 text-[12.5px] leading-6"
          :class="i % 2 ? 'bg-white/[0.025]' : ''"
          :title="r.hint"
        >
          <span class="min-w-0 flex-1 truncate text-[var(--exile-color-text-secondary)]">{{ r.label }}</span>
          <span class="w-[6.5rem] shrink-0 text-right font-bold tabular-nums text-amber-200">{{ r.a }}</span>
          <template v-if="r.b != null">
            <span class="w-[6.5rem] shrink-0 text-right font-bold tabular-nums text-sky-200">{{ r.b }}</span>
            <span class="flex w-[4.25rem] shrink-0 justify-end">
              <DiffBadge v-if="r.na != null && r.nb != null && r.na > 0 && r.nb !== r.na" :now="r.nb" :before="r.na" />
              <span v-else-if="r.na === 0 && (r.nb ?? 0) > 0" class="text-[11px] text-emerald-300">新たに</span>
            </span>
          </template>
        </div>
      </div>
    </div>
    <!-- 敵の想定と、条件付きで今は効いていない火力 (2026-10-04 オーナー「盲目の時とか、乗るか分からんけど相手の想定が分からん」) -->
    <div class="mt-3 border-t border-white/10 pt-2">
      <p class="text-[12px] font-bold text-[var(--exile-color-text-secondary)]">敵の想定 (PoB の設定) と、条件付きで今は効いていない火力</p>
      <p class="mt-1 text-[12px]">
        <span class="text-amber-200">自分:</span> {{ enemyLine.mine.length ? enemyLine.mine.join("・") : "なし" }}
        <template v-if="enemyLine.target"><span class="ml-3 text-sky-200">相手:</span> {{ enemyLine.target.length ? enemyLine.target.join("・") : "なし" }}</template>
      </p>
      <div class="mt-1.5 grid gap-x-8 gap-y-1" :class="condLists.target ? '@4xl:grid-cols-2' : ''">
        <div>
          <p v-if="condLists.target" class="text-[11px] text-amber-200">自分</p>
          <p v-if="!condLists.mine.length" class="note">なし</p>
          <p v-for="(c, i) in condLists.mine" :key="i" class="text-[12px]">{{ c.text }} <span class="note">({{ c.src }})</span></p>
        </div>
        <div v-if="condLists.target">
          <p class="text-[11px] text-sky-200">相手</p>
          <p v-if="!condLists.target.length" class="note">なし</p>
          <p v-for="(c, i) in condLists.target" :key="i" class="text-[12px]">{{ c.text }} <span class="note">({{ c.src }})</span></p>
        </div>
      </div>
    </div>
    </template>
  </section>
</template>
