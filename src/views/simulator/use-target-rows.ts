/**
 * use-target-rows.ts — ② 狙う MOD の行の並べ方 (行・列・組・番号・段・外す・左の札)。StageTargetSummary.vue から分けた (2026-10-20 R3)。中身は前のまま。
 * 付け方 (restable・restOf) は use-target-plans、付きやすさ (shareOf) は use-target-share から受ける
 */
import { computed, ref } from "vue";
import { craftStage, nameOf } from "../../state/craft-stage";
import { fillModText } from "../../services/htc/mod-text";
import { tierDisplayRanges } from "../../services/mods/stat-scale";
import { CRAFTED_SOURCES } from "../../services/craft-stage/engine";
import { essenceKindOf } from "../../services/mods/essence-kind";
import { runeJaOf, runeToneOf } from "../../services/craft-stage/mod-list";
import { tr } from "../../i18n/lang";
import type { TargetKind, TargetPlans } from "./use-target-plans";

type Kind = TargetKind;
export function useTargetRows(o: { shareOf: (modId: string, minTierIndex: number) => number | null; restable: TargetPlans["restable"]; restOf: TargetPlans["restOf"] }) {
  const s = craftStage;
  const { shareOf, restable, restOf } = o;
  /**
   * 「どれか」の組は既定でたたむ: 頭の 1 行 (どれか n・候補の数・段・合計・▾) と、候補の名前を「／」で並べた 1 行
   * (2026-10-19 オーナー「3 MOD 並べて 1 MOD だけ複数候補だとかなり縦長」→ 1 行に並べて押すと開く案)。押すと縦並びに開き、段・× はそこで
   */
  const openGroups = ref(new Set<string>());
  const toggleGroup = (key: string): void => { const n = new Set(openGroups.value); if (n.has(key)) n.delete(key); else n.add(key); openGroups.value = n; };
  /** 組の候補の段が全部同じならその段 (札を 1 つだけ出す) */
  const sameRank = (ms: ReadonlyArray<{ rank: string }>): string | null => (ms.every((m) => m.rank === ms[0]?.rank) ? ms[0]?.rank ?? null : null);
  /** たたんだ時の名前 (数値の幅は外して短く) */
  const shortName = (t: string): string => t.replace(/\s*\([^()]*\d[^()]*\)/g, "").replace(/\s+/g, " ").trim();

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
          text: xm ? fillModText(xm, xt ? tierDisplayRanges(xt) : []).replace(/\n/g, " / ") : x.modId,
          rank: xm ? `T${xm.tiers.length - x.minTierIndex} 以上` : "",
          share: shareOf(x.modId, x.minTierIndex),
        };
      };
      const need = Math.max(1, Math.min(t.need ?? 1, 1 + (t.alts?.length ?? 0)));
      return [{ ...row(t, false), need }, ...(t.alts ?? []).map((a) => ({ ...row(a, true), need }))];
    });
  });
  type Row = (typeof rows.value)[number];
  /** 手打ちの状態から始める時、その MOD がもう付いているか (その段以上) */
  function presentOnStart(r: { modId: string; minTierIndex: number }): boolean {
    const it = s.simStart.value === "item" ? s.simStartItem.value : null;
    return !!it && [...it.prefixes, ...it.suffixes].some((m) => m.modId === r.modId && m.tierIndex >= r.minTierIndex);
  }

  /** 外す: あるいはの候補はその候補だけ、本体は手順ごと (候補も一緒に) */
  function drop(r: Row, hosts: readonly string[] = [r.group]): void {
    // まとめた「どれか N つ」の中の候補は、コピー全部から外す。手順の本体を外す時はまとまりごと
    const memberOf = (t: { modId: string; alts?: Array<{ modId: string }> }): boolean => t.modId === r.modId || !!t.alts?.some((a) => a.modId === r.modId);
    if (hosts.length > 1) {
      const list = s.simTargets.value;
      const left = list.filter((t) => hosts.includes(t.modId)).map((t) => {
        const ms = [{ modId: t.modId, minTierIndex: t.minTierIndex }, ...(t.alts ?? [])].filter((m) => m.modId !== r.modId);
        return ms.length ? { ...t, modId: ms[0]!.modId, minTierIndex: ms[0]!.minTierIndex, alts: ms.slice(1) } : null;
      }).filter((t): t is NonNullable<typeof t> => !!t);
      // 候補が減ったら、どれか N つの N も候補の数まで
      const n = Math.min(left.length, (left[0]?.alts?.length ?? 0) + 1);
      const keep = left.slice(0, n).map((t, i, arr) => ({ ...t, modId: [t.modId, ...(t.alts ?? []).map((a) => a.modId)].find((id) => !arr.slice(0, i).some((x) => x.modId === id)) ?? t.modId }));
      const at = list.findIndex((t) => hosts.includes(t.modId));
      s.simTargets.value = [...list.slice(0, at).filter((t) => !hosts.includes(t.modId)), ...keep, ...list.slice(at).filter((t) => !hosts.includes(t.modId) && !memberOf(t))];
      return;
    }
    if (r.alt) s.simTargets.value = s.simTargets.value.map((t) => (t.modId === r.group ? { ...t, alts: (t.alts ?? []).filter((a) => a.modId !== r.modId) } : t));
    else s.simTargets.value = s.simTargets.value.filter((t) => t.modId !== r.modId);
  }
  function setTier(r: Row, idx: number): void {
    s.simTargets.value = s.simTargets.value.map((t) => (t.modId !== r.group ? t
      : !r.alt ? { ...t, minTierIndex: idx } : { ...t, alts: (t.alts ?? []).map((a) => (a.modId === r.modId ? { ...a, minTierIndex: idx } : a)) }));
  }

  /**
   * 1 つの枠を争う物はグループにまとめる (フラクチャーの候補全部 / 手順の本体 + あるいは)。2 つ以上の時だけ点線の枠で「どれか 1 つ」。
   * グループは 1 MOD (1 枠)。グループの付きやすさは候補の合計
   */
  /** プレとサフィにまたがる「どれか」(カオススパム) の手順の本体 */
  const mixedHosts = computed(() => new Set(s.simTargets.value.filter((t) => t.alts?.length && new Set([t.modId, ...t.alts.map((a) => a.modId)].map((id) => s.data.value?.mods.get(id)?.type === "suffix" ? "S" : "P")).size > 1).map((t) => t.modId)));
  /** またがる「どれか」は左右の列でなく下の 1 枠に (打ち方ではプレに付いた時・サフィに付いた時の 2 つのルート) */
  const mixed = computed(() => [...mixedHosts.value].map((host) => {
    const members = rows.value.filter((r) => r.group === host);
    return { key: host, no: members[0]?.no ?? null, host, members };
  }));
  const columns = computed(() => (["P", "S"] as const).map((side) => {
    const list = rows.value.filter((r) => r.side === side && !mixedHosts.value.has(r.group));
    const groups: Array<{ key: string; no: number | null; kind: Kind; host: string; need: number; members: Row[]; share: number | null }> = [];
    for (const r of list) {
      const key = r.kind === "fracture" ? "fracture" : r.group;
      const g = groups.find((x) => x.key === key);
      if (g) g.members.push(r);
      else groups.push({ key, no: r.no, kind: r.kind, host: r.group, need: 1, members: [r], share: null });
    }
    for (const g of groups) g.share = g.members.every((m) => m.share == null) ? null : Math.min(1, g.members.reduce((a, m) => a + (m.share ?? 0), 0));
    // 同じ候補のグループ (コピー) は 1 つの枠「どれか N つ」にまとめて出す (2026-10-08 オーナー「この 3 つが狙いたいやつ、分かりづらい。
    // どの順番でもいいから、この MOD 群のどれか 3 つ付けば終わり」)。中はコピーのまま (エンジンは 1 つの MOD を 1 つの手順にしか数えない)
    const merged: Array<(typeof groups)[number] & { hosts: string[] }> = [];
    for (const g of groups) {
      const sig = g.kind !== "fracture" && g.members.length > 1 ? g.members.map((m) => m.modId).sort().join(",") : null;
      const m = sig ? merged.find((x) => x.kind !== "fracture" && x.members.length > 1 && x.members.map((y) => y.modId).sort().join(",") === sig) : undefined;
      if (m) { m.hosts.push(g.host); m.need += 1; continue; }
      merged.push({ ...g, hosts: [g.host] });
    }
    const used = merged.reduce((a, g) => a + slotsOf(g), 0);
    return { title: side === "P" ? "プレフィックス" : "サフィックス", groups: merged, used };
  }));
  /**
   * 行の番号: 上から並んでいる順に全部の行へ (プレ → サフィ → またがる組)。前は付ける順番の番号でフラクチャー予定の組だけ番号が無く、
   * 見出しの個数とずれて「特殊 MOD が数に入っていない」ように見えた (2026-10-21 オーナー「特殊 MOD は個数に含まれてないのなーぜー」)
   */
  /** 組が完成品で使う枠の数。残りも要る時 (どっちも・全部) は候補の数、どれか N つは N (見出しの個数と同じ数え方) */
  function slotsOf(g: { kind: Kind; host: string; need: number; members: Row[] }): number {
    return restable(g) && restOf(g) ? g.members.length : g.need;
  }
  /**
   * 2 つ以上の枠を使う組 (どっちも・どれか 2 つ…) は番号も枠の分だけ進める: 「1・2」「1〜3」、次の組は「3」
   * (2026-10-20 オーナー「どっちもの行が 1 のままで次が 2 だと、完成品の MOD の合計が分からない」)
   */
  const noOf = computed(() => {
    const out = new Map<string, string>();
    let n = 0;
    const take = (k: string, c: number): void => {
      const a = n + 1;
      n += Math.max(1, c);
      out.set(k, n === a ? `${a}` : n === a + 1 ? tr(`${a}・${n}`, `${a}, ${n}`) : tr(`${a}〜${n}`, `${a}–${n}`));
    };
    for (const c of columns.value) for (const g of c.groups) take(`${c.title}:${g.key}`, slotsOf(g));
    for (const g of mixed.value) take(`mixed:${g.key}`, 1);
    return out;
  });


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
  /**
   * MOD の種類 (出どころ。左の札)。2026-10-21 オーナー「エッセンスはクラフト MOD、普通の奴は一般 MOD で統一、冒涜 MOD は冒涜専用 MOD (冒涜で付く普通の奴は付け方が冒涜)」。
   * 前は普通の MOD に「クラフト MOD」と出ていた (クラフト MOD = エッセンスで付く物、用語集)
   */
  type Src = "normal" | "desecrated" | "essence" | "perfect_essence";
  const SRC: Record<Src, { label: string; cls: string }> = {
    get normal() { return { label: tr("一般 MOD", "Regular mod"), cls: "border-rarity-magic/70 text-[#c8c8ff]" }; },
    get desecrated() { return { label: tr("冒涜専用 MOD", "Desecrated-only mod"), cls: "border-green-700/80 bg-gradient-to-r from-green-900/60 to-lime-900/40 text-lime-200/90" }; },
    get essence() { return { label: tr("クラフト MOD", "Crafted mod"), cls: "border-sky-400/60 text-sky-200" }; },
    get perfect_essence() { return { label: tr("クラフト MOD", "Crafted mod"), cls: "border-cyan-400/60 text-cyan-200" }; },
  };
  /** 左の札: ルーンの MOD はルーンの名前 (コルの狩りなど) */
  /** 左の札。ルーンの MOD は「特殊 MOD」(どのルーンかはホバー。2026-10-21 オーナー「長くて特殊 MOD でおｋ、ホバーでなんのルーンか表示」) */
  function badgeOf(host: string): { label: string; cls: string; rune?: string } {
    const r = s.data.value?.mods.get(host)?.rune;
    return r ? { label: tr("特殊 MOD", "Special mod"), cls: runeToneOf(runeJaOf(r))?.badge ?? "border-amber-400/60 text-amber-200", rune: runeJaOf(r) } : SRC[srcOf(host)];
  }
  function srcOf(host: string): Src {
    const m = s.data.value?.mods.get(host);
    if (m?.source === "desecrated") return "desecrated";
    return (m && essenceKindOf(m)) ?? "normal";
  }

  return { openGroups, toggleGroup, sameRank, shortName, tierOptions, rows, presentOnStart, drop, setTier, mixedHosts, mixed, columns, slotsOf, noOf, essTitle, badgeOf, srcOf };
}
