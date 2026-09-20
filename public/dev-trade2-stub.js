/*
 * dev-trade2-stub.js — 開発サーバでの画面確認用。**trade2 への通信を全部せき止めて**、
 * 決め打ちのダミー応答を返す (2026-09-20)。
 *
 * 開発モード (vite) は Rust の門番を通らず、プロキシで本物の trade2 に出る。
 * 画面の計算が合っているかを確かめるだけなのに公式へリクエストを投げてしまうので、
 * ?stub=1 を付けて開いた時だけ fetch を差し替える。実通信はゼロ。
 *
 * 値はすべてここで決めるので、画面に出る数字は手計算で突き合わせられる。
 * 本番のビルドには入らない (index.html が ?stub=1 の時だけ読む)。
 */
(() => {
  if (!location.search.includes("stub=1")) return;

  /** 条件ごとの最安値 (高貴)。売値の 3 行に出るはずの値 */
  const SALE = {
    // クエリの中身で条件を見分ける: 二重コラプト = 完成品、品質 23 = 品質、それ以外 = レベル 21
    level21: 100,
    quality23: 200,
    finished: 500,
    /** 素のスキル (コラプト無し) = 現物のジェム本体 */
    original: 7,
  };

  const listing = (id, amount) => ({
    id,
    listing: {
      indexed: new Date(Date.now() - 3600_000).toISOString(),
      account: { name: "StubSeller" },
      price: { type: "~b/o", amount, currency: "exalted" },
    },
    item: { properties: [] },
  });

  /** クエリを見て、どの条件の検索かを決める */
  function kindOf(body) {
    const misc = body?.query?.filters?.misc_filters?.filters ?? {};
    const type = body?.query?.filters?.type_filters?.filters ?? {};
    if (misc.twice_corrupted?.option === "true") return "finished";
    if (misc.corrupted?.option === "false") return "original";
    if ((type.quality?.min ?? 0) >= 23) return "quality23";
    return "level21";
  }

  const ids = (kind, n) => Array.from({ length: n }, (_, i) => `${kind}-${i}`);

  /**
   * ?nologin=1 を足すと「Tauri で動いていて、未ログイン」を装う。
   * ログインを促すポップアップ (LoginGate) の見え方を確かめる用。
   */
  // ?sweep=auto / ?sweep=manual の初期値 (console から書き換えられる)
  window.__stubSweep = (location.search.match(/[?&]sweep=(auto|manual)/) ?? [])[1] ?? "";

  if (/[?&](no)?login=1/.test(location.search) || window.__stubSweep || location.search.includes("flow=1")) {
    const empty = { sampled_at: 0, list_refreshed_at: 0, league: "", site: "", watches: [], states: {} };
    window.__TAURI_INTERNALS__ = {
      // listen() 系が使う。無いと設定画面などがここで落ちる
      transformCallback: (cb) => {
        const id = Math.floor(Math.random() * 1e9);
        window[`_${id}`] = cb;
        return id;
      },
      invoke: async (cmd) => {
        // ?nologin=1 は未ログイン、?login=1 ならログイン済みを装う
        if (cmd === "trade_history_session") return { logged_in: location.search.includes("login=1") && !location.search.includes("nologin=1"), account: "stub" };
        /**
         * ?flow=1 で捌き速度の記録を仕込む (判定の札の見え方を確かめる用。2026-09-20)。
         * 1 件だけ 3 時間で売れた = 根拠が薄い判定 (札に「?」が付く) と、
         * 3 件売れた = 通常の判定 の 2 つを並べる。
         */
        if (cmd === "market_flow_load") {
          if (!location.search.includes("flow=1")) return empty;
          const now = Math.floor(Date.now() / 1000);
          const l = (hAgo, goneHAgo) => ({
            id: `s${hAgo}-${goneHAgo}-${Math.random().toString(36).slice(2, 7)}`,
            listed_at: now - hAgo * 3600,
            first_seen: now - hAgo * 3600,
            last_seen: now - (goneHAgo ?? 0) * 3600,
            gone_at: goneHAgo == null ? null : now - goneHAgo * 3600,
            amount: 10,
            currency: "divine",
          });
          const st = (tracked) => ({ tracked, daily: [], total: tracked.length, sampled_at: now, list_complete: true });
          return {
            ...empty,
            league: "Forbidden Rites",
            sampled_at: now,
            watches: [
              { key: "Fireball::level21", label: "ファイアボール (レベル 21)", query: {}, note: "", manual: true, auto: true },
              { key: "Fireball::quality23", label: "ファイアボール (品質 23%)", query: {}, note: "", manual: true, auto: true },
            ],
            states: {
              // 薄い判定: 1 件だけ 3 時間で売れた → 「速い?」
              "Fireball::level21": st([l(4, 1), l(2, null)]),
              // 通常の判定: 3 件売れた → 「速い」
              "Fireball::quality23": st([l(4, 2), l(5, 2), l(6, 3), l(2, null)]),
            },
          };
        }
        /**
         * ?sweep=auto / ?sweep=manual で「取得が走っている」状態を装う
         * (画面下の帯と、他の取得ボタンが押せなくなるのを確かめる用。2026-09-20)。
         * 走らせたり止めたりは console から window.__stubSweep = "auto" | "manual" | "" でもできる。
         */
        if (cmd === "market_flow_status") {
          const mode = window.__stubSweep ?? "";
          return {
            sampling: mode !== "",
            manual_sampling: mode === "manual",
            auto_sampling: mode === "auto",
            current: mode ? "Fireball (レベル 21)" : null,
            done: mode ? 8 : 0,
            total: mode ? 21 : 0,
            rounds: 3,
            last_at: 0,
            next_at: 0,
            auto_watches: 21,
            manual_watches: 7,
            last_error: null,
            rate_state: null,
            rate_rules: null,
            wait_until: 0,
            budget_used: 4,
            budget_max: 22,
            retry_until: 0,
            retry_at: 0,
            retry_keys: 0,
            sweep_done: mode ? 8 : 0,
            pace_secs: 14,
            sampled_watches: 21,
            cycle_secs: 14400,
            swept_at: 0,
            auto_off: false,
            last_failed: 0,
          };
        }
        if (cmd === "market_flow_cancel") {
          window.__stubSweep = "";
          return null;
        }
        if (cmd === "settings_load") return { autostart_enabled: false, close_to_tray: true, auto_refetch_interval_secs: 259200 };
        if (cmd === "market_flow_import_seed") return 0;
        if (cmd === "market_flow_export_seed") return ["(スタブ) 実際には書き出していません", 0];
        return null;
      },
    };
  }

  /**
   * ?update=1 で「起動時に更新が見つかった」状態を装う (全面のアップデート画面の確認用)。
   * ダウンロードは進捗だけ流して、再起動はしない。
   */
  if (location.search.includes("update=1")) {
    window.__TAURI_UPDATER_STUB__ = true;
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    /**
     * 相場 (poe2scout) も止める (2026-09-20)。
     * ここは trade2 だけをせき止めていたので、ジェムを選ぶと素材の相場を取りに行って
     * **本物の API に出ていた**。オーナー方針「取得テストはオーナーがアプリでやる」に
     * 合わせて、確認用の画面からは外に一切出さない。
     * 中身は空で返す (素材の値段は「相場なし」になるだけで、判定の確認には要らない)。
     */
    if (/\/api\/poe2scout\//.test(url)) {
      window.__stubBlocked = (window.__stubBlocked ?? 0) + 1;
      const body = /\/History/.test(url) ? [] : { items: [], currencies: [], pages: 0 };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (!/\/api\/trade2-/.test(url)) return realFetch(input, init);

    if (/\/search\//.test(url)) {
      const body = init?.body ? JSON.parse(init.body) : {};
      const kind = kindOf(body);
      const n = kind === "original" ? 50 : 12;
      const res = { id: `stub-${kind}`, complexity: 1, total: n, result: ids(kind, n) };
      window.__stubCalls = (window.__stubCalls ?? 0) + 1;
      return new Response(JSON.stringify(res), { status: 200, headers: { "content-type": "application/json" } });
    }

    if (/\/fetch\//.test(url)) {
      const list = decodeURIComponent(url.split("/fetch/")[1].split("?")[0]).split(",");
      const kind = list[0].split("-")[0];
      const base = SALE[kind] ?? 1;
      // 最安から少しずつ高くする (現物の「最安 N 件の合計」を検算できるように +1 ずつ)
      const result = list.map((id) => listing(id, base + Number(id.split("-")[1] ?? 0)));
      window.__stubCalls = (window.__stubCalls ?? 0) + 1;
      return new Response(JSON.stringify({ result }), { status: 200, headers: { "content-type": "application/json" } });
    }

    return new Response(JSON.stringify({ result: [] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  window.__stubSale = SALE;
  console.info("[dev-stub] trade2 をせき止めました (実通信なし)", SALE);
})();
