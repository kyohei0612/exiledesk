/**
 * use-sweep.ts — 一括取得と自動巡回の「状態と時計」(自動ジェム監視の画面用)
 *
 * 押した / 走っている / レート制限で止まっている / 次の 1 本まで何秒 / 周期は何時間、を
 * 1 か所にまとめる。記録の読み直し (reload) と画面のメッセージは呼ぶ側から渡す。
 *
 * 2026-09-19 に GemWatch.vue (778 行) から切り出した。中身は変えていない。
 */
import { computed, ref, type Ref } from "vue";
import { cancelSweep, CYCLE_OFF, DEFAULT_CYCLE_SECS, loadFlowStatus, setFlowCycle, sweepNow, tradePaceSecs, tradeRateSecs, type FlowStatus } from "../../services/market-flow";
import { fmtClock } from "../../utils/format-time";

export function useSweep(opts: {
  /** 門番と記録を読み直す (この PC のファイルだけなので何回呼んでも通信しない) */
  reload: () => void;
  /** 画面の上に出す一言 */
  message: Ref<{ ok: boolean; text: string } | null>;
  /** market_flow_status の最新 */
  status: Ref<FlowStatus | null>;
  /** 1 秒ごとに進む時計 (レート制限の残り秒を数え直すため) */
  nowMs: Ref<number>;
  /** 監視しているジェム数 (周期と残り時間の見積もりに使う) */
  gemCount: () => number;
}) {
  const { reload, message, status, nowMs } = opts;

  const sweeping = ref(false);
  /** 一括取得を中止する (取り切るまで繰り返すので途中でやめる口。2026-09-19) */
  async function stopSweep(): Promise<void> {
    message.value = { ok: true, text: "中止します (今の銘柄を取り終えたら止まります)" };
    await cancelSweep();
  }
  async function sweep(reason?: string): Promise<void> {
    // 自動巡回の途中でも押せる (記録は取った時刻つきなので間に挟まるだけ。オーナー 2026-09-19)。
    // 押せないのは手動の一括がもう走っている時だけ
    if (sweeping.value || status.value?.manual_sampling) return;
    sweeping.value = true;
    message.value = { ok: true, text: `${reason ? `${reason} ` : ""}一括取得を始めました (終わるまで数分かかります)` };
    const poll = window.setInterval(reload, 3000);
    try {
      const r = await sweepNow();
      await reload();
      const st = status.value;
      const left = st?.retry_keys ?? 0;
      const failed = st?.last_failed ?? 0;
      const got = st?.sampled_watches ?? 0;
      const all = st?.auto_watches ?? 0;
      message.value = r.ok
        ? left > 0
          ? { ok: false, text: `一括取得は一周しましたが ${left} 銘柄が取れていません (レート制限か通信)。${fmtClock(st?.retry_at ?? 0)} 頃に取り直します` }
          : failed > 0
            ? { ok: false, text: `${failed} 銘柄が取れませんでした (レート制限か通信)。繰り返しの上限に達したか、中止されました` }
            : all > 0 && got < all
              ? { ok: false, text: `一括取得は一周しましたが、記録があるのは ${got}/${all} 銘柄です` }
              : { ok: true, text: "一括取得が終わりました" }
        : { ok: false, text: r.message ?? "一括取得に失敗しました (レート制限か通信)" };
    } finally {
      clearInterval(poll);
      sweeping.value = false;
      reload();
    }
  }

  /**
   * トレードのレート制限で止まっている残り秒。
   *
   * 2026-09-19 オーナー「この監視のとこでレート制限の表記が出ないね。ズレてる。
   * ジェムのところに行ったらレート制限だったけど、こっちでは完了になってる」:
   * ここは取得中 (sampling) の時しかレートに触れていなかったので、止まっている間は
   * 何も出ず「待機中」に見えていた。ジェムコラプトと同じ時計を、取得中かどうかに
   * 関係なく出す。
   */
  const retryLeft = computed(() => {
    void nowMs.value; // 1 秒ごとに数え直す
    return tradeRateSecs(status.value);
  });
  /** 枠が空くまでの待ち (罰則ではない。取得は続く) */
  const paceLeft = computed(() => {
    void nowMs.value;
    return tradePaceSecs(status.value);
  });

  /** 前回の一括取得 / 次の自動取得 (手動で押した分も同じ時計を使う) */
  const sweepClock = computed(() => {
    const st = status.value;
    if (!st) return "";
    const last = st.swept_at > 0 ? `前回の一括取得 ${fmtClock(st.swept_at)}` : "まだ 1 巡していません";
    const next = st.swept_at > 0 ? ` · 次の自動取得 ${fmtClock(st.next_at)}` : "";
    return `${last}${next}`;
  });

  /**
   * 自動取得の間隔 (オーナー指示 2026-09-17:「自動取得の時間数を UI で変更できるようにしたい」)。
   * 記録側 (market_flow.rs) が持っている値をそのまま出し入れする。
   * 前回の一括取得 (手動でも自動でも) からこの時間ぶん経ったら、全銘柄をまとめて 1 巡する。
   */
  const CYCLE_OPTIONS = [1, 2, 3, 4, 6, 8, 12, 24];
  /** 選択中の値。0 = 自動取得しない (オーナー指示 2026-09-19) */
  /** 1 巡にかかる見込み (分)。門番が決めた今の間隔 × 本数 */
  const sweepMinutes = computed(() => {
    const pace = status.value?.pace_secs ?? 0;
    const reqs = Math.max(1, (status.value?.auto_watches ?? opts.gemCount() * 3) * 2);
    return pace > 0 ? Math.max(1, Math.round((pace * reqs) / 60)) : 0;
  });
  const cycleHours = computed(() => {
    const st = status.value;
    if (st?.auto_off) return 0;
    return Math.round(((st?.cycle_secs ?? DEFAULT_CYCLE_SECS) / 3600) * 10) / 10;
  });
  async function applyCycle(hours: number): Promise<void> {
    if (hours <= 0) {
      await setFlowCycle(CYCLE_OFF);
      status.value = await loadFlowStatus();
      message.value = { ok: true, text: "自動取得をしない設定にしました (一括取得は今まで通り押せます)" };
      return;
    }
    const applied = await setFlowCycle(Math.round(hours * 3600));
    status.value = await loadFlowStatus();
    if (applied == null) {
      message.value = { ok: false, text: "間隔を変更できませんでした" };
      return;
    }
    const st = status.value;
    const h = Math.round(applied / 3600);
    const swept = !!st && st.swept_at > 0;
    /**
     * 新しい間隔で見てもう予定時刻を過ぎているなら、そのまま 1 巡して周期を始める
     * (オーナー指示 2026-09-17:「もし一括取得できるなら、そのまま一括取得周期開始しよう」)。
     */
    const due = !st || !swept || st.next_at <= Math.floor(Date.now() / 1000);
    if (due && !st?.sampling && !sweeping.value) {
      const why = swept ? `前回の一括取得は ${fmtClock(st.swept_at)} で、もう ${h} 時間経っているので` : "まだ 1 巡していないので";
      await sweep(`自動取得を ${h} 時間ごとにしました。${why}`);
      return;
    }
    message.value = {
      ok: true,
      text: `自動取得を ${h} 時間ごとにしました。前回の一括取得は ${fmtClock(st?.swept_at)} · 次の自動取得は ${fmtClock(st?.next_at)}`,
    };
  }

  /**
   * 取得中の進捗表示。レート制限の残り秒は共通の関数 (tradeRateSecs) から取るので、
   * 待っている間もちゃんと減っていく (オーナー指示 2026-09-17:
   * 「取得中でレート制限の秒数動かすようにして、一律で同じところを見るように」)。
   */
  const sweepText = computed(() => {
    const s = status.value;
    if (!s?.sampling) return "";
    // 自動巡回は周期いっぱいに薄く流すので、「待ち」ではなく間隔として出す
    if (!sweeping.value && !s.manual_sampling && s.pace_secs > 5) {
      return `自動巡回中 ${s.sweep_done}/${s.total || opts.gemCount() * 3} 銘柄 · ${s.pace_secs} 秒おき${s.current ? ` · ${s.current}` : ""}`;
    }
    // 「レート待ち」と出すのは実際に止められている時だけ。通常の間隔 (10 秒前後) は待ちではない
    // (2026-09-18: min_spacing を入れたので pace_until が常に数秒先になり、ずっと待ちに見えていた)
    const stopped = retryLeft.value;
    const wait = Math.max(stopped, paceLeft.value);
    // 残り時間の目安。trade2 の上限 (5 分に 30 回) から、1 銘柄あたり約 20 秒で見積もる
    const left = Math.max(0, s.total - s.done);
    const eta = left > 0 ? ` · 残りおよそ ${Math.max(1, Math.round((left * 20) / 60))} 分` : "";
    return `取得中 ${s.done}/${s.total}${eta}${stopped > 0 ? ` · レート制限で停止中 ${stopped} 秒` : wait > 0 ? ` · 次の 1 本まで ${wait} 秒` : ""}${s.current ? ` · ${s.current}` : ""}`;
  });

  return { sweeping, stopSweep, sweep, retryLeft, paceLeft, sweepClock, CYCLE_OPTIONS, sweepMinutes, cycleHours, applyCycle, sweepText };
}
