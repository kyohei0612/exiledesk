/**
 * stage-replay.ts — クラフトステージの手順 JSON・結果 JSON・共有・再生 (2026-10-20、craft-stage.ts が 500 行を超えたので分けた。割る仕事 R5)。
 * 中身は craft-stage.ts にあった時のまま。状態 (ref) は craft-stage.ts が持ち、ここは ctx で受け取って craftStage の中に広げる
 * (呼ぶ側は今まで通り craftStage.plan() / loadReplay() などと呼ぶ)。案は docs/org/dev/notes/2026-10-20-agent-friendly.md の 2。
 */
import { computed, type Ref, type ShallowRef } from "vue";
import { recordHistory } from "../services/history";
import { freshItem, playPlan, resultOf, type PlayedStep, type StartSpec } from "../services/craft-stage/run-plan";
import type { Force } from "../services/craft-stage/stage-core";
import type { PatchData } from "../vendor/poe2htc/engine/types";
import type { StageItem } from "../services/craft-stage/types";
import type { CraftStagePlan } from "../services/craft-stage/contract";
import { shareBlock } from "../services/craft-stage/share";
import { marketStore } from "./market-store";
import { fullSockets, planStepOf, type PlanStep } from "./emulator/stage-steps";

/** craft-stage.ts の状態と、ここから呼ぶ craft-stage.ts の関数 */
export interface StageReplayCtx {
  data: ShallowRef<PatchData | null>;
  item: Ref<StageItem | null>;
  log: Ref<PlayedStep[]>;
  dropped: Ref<Array<{ step: PlanStep; index: number }>>;
  replay: Ref<{ plan: CraftStagePlan; step: number; shared?: boolean } | null>;
  base: Ref<string>;
  itemLevel: Ref<number>;
  seed: Ref<number>;
  startMods: Ref<Force[]>;
  omens: Ref<string[]>;
  held: Ref<string | null>;
  rollSeed: Ref<number>;
  error: Ref<string | null>;
  priceOf: (key: string) => number;
  priceKeysAll: () => string[];
  freshSeed: () => number;
  reset: () => void;
}

export function stageReplay(c: StageReplayCtx) {
  const api = {
    /** 今までの手を手順 JSON に (同じ seed なので CLI に流すと同じ結果) */
    plan(): CraftStagePlan {
      return {
        schema: "craft-stage-plan/1",
        title: null,
        base: c.base.value,
        item_level: c.itemLevel.value,
        start_rarity: "normal",
        start_paste: null,
        // 始めの状態: MOD (要望 ⑱-2) と、手で打つ画面が始めに開けているソケット (規格外。書かないと再生でルーンが打てない、2026-10-10 点検)
        ...(() => {
          const sockets = c.data.value ? fullSockets(freshItem(c.data.value, c.base.value, c.itemLevel.value)).sockets ?? 0 : 0;
          const start: StartSpec = { ...(c.startMods.value.length ? { mods: c.startMods.value } : {}), ...(sockets ? { sockets } : {}) };
          return Object.keys(start).length ? ({ start } as object) : {};
        })(),
        seed: c.seed.value,
        // 手ごとの乱数 (seed) も書く (2026-10-09 から手ごとに新しい乱数。再生はこれを使う。追加のキー = outcome / pick と同じ扱い)
        // カタリストは手で打つと 1 個 +1〜2%、再生は 1 手 = 1 個 (+1%)。上げた分の回数で書く (2026-10-10 点検: 再生で品質が違った)
        // Web で 50 手より前に消した手も頭に付ける (dropped)
        steps: (c.log.value.length || c.dropped.value.length ? [...c.dropped.value.map((d) => d.step), ...c.log.value.map(planStepOf)] : [{ currency: "transmute", omen: null, times: 1, note: null }]) as CraftStagePlan["steps"],
      };
    },
    /** 結果 JSON (今の相場の値段で) */
    result(version: string): unknown {
      if (!c.item.value) return null;
      return resultOf(c.replay.value?.plan ?? api.plan(), c.log.value, c.item.value, {
        prices: {}, exiledeskVersion: version, patch: "0.5.0", league: marketStore.league.value?.Value ?? null,
      }, c.data.value ?? undefined);
    },
    /** CLI (craft-stage-run.mjs --prices) に渡す相場 (高貴建て) */
    prices(): Record<string, number> {
      return Object.fromEntries(c.priceKeysAll().map((k) => [k, c.priceOf(k)]).filter(([, v]) => (v as number) > 0));
    },
    /**
     * 共有できない理由 (できるなら null)。最初のカレンシーの後に手で MOD を足していたら共有できない ([[share.ts]])。
     * 再生中 (共有の URL から開いた時も) はその手順をそのまま渡せる
     */
    shareWhy: computed((): string | null => (c.replay.value ? null : shareBlock([...c.dropped.value.map((d) => ({ currency: d.step.currency, index: d.index })), ...c.log.value.map((s) => ({ currency: s.out.currency, index: s.out.index }))]))),
    /** 共有する手順 (再生中はその手順を全部) */
    sharePlan(): CraftStagePlan {
      return c.replay.value?.plan ?? api.plan();
    },
    /** 再生の手を送る (0 = 始め、手順の手の数まで) */
    replayTo(step: number): void {
      const r = c.replay.value;
      if (!r) return;
      const all = r.plan.steps.reduce((n, s) => n + (s.times ?? 1), 0);
      api.loadReplay(r.plan, Math.max(0, Math.min(all, step)), r.shared);
    },
    /** 再生の手の数 (times 込み) */
    replayLength: computed(() => c.replay.value?.plan.steps.reduce((n, s) => n + (s.times ?? 1), 0) ?? 0),
    /**
     * 再生している今の手から、手で打つ方へ続ける (共有の手順の続きを自分で打つ)。工程はそのまま残るので 1 手戻す・工程を押して戻るもそのまま使える
     */
    continueFromReplay(): void {
      const r = c.replay.value;
      if (!r) return;
      c.startMods.value = (r.plan as { start?: StartSpec }).start?.mods ?? [];
      c.omens.value = [];
      c.held.value = null;
      c.rollSeed.value = c.freshSeed();
      c.replay.value = null;
    },
    /** 再生: 手順 JSON を step 手目まで打った状態 */
    loadReplay(plan: CraftStagePlan, step: number, shared = false): void {
      if (!c.data.value) return;
      try {
        c.base.value = plan.base;
        c.itemLevel.value = plan.item_level ?? 80;
        c.item.value = freshItem(c.data.value, plan.base, c.itemLevel.value);
        const keys = [...new Set([...plan.steps.flatMap((s) => [s.currency, ...(s.omen ? s.omen.split("+") : [])]), ...c.priceKeysAll()])];
        const prices = Object.fromEntries(keys.map((k) => [k, c.priceOf(k)]));
        const { steps, final } = playPlan(c.data.value, plan, prices, step);
        c.replay.value = { plan, step, ...(shared ? { shared } : {}) };
        c.seed.value = plan.seed;
        c.log.value = steps;
        c.dropped.value = [];
        c.item.value = final;
        c.error.value = null;
        recordHistory("craft-stage", "replay", { plan, step, final, steps: steps.map((s) => s.out) });
      } catch (e) {
        c.error.value = e instanceof Error ? e.message : String(e);
      }
    },
    /** 再生をやめて手で打つ */
    leaveReplay(): void {
      c.replay.value = null;
      c.reset();
    },
  };
  return api;
}
