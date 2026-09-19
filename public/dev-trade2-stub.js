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
  if (/[?&](no)?login=1/.test(location.search)) {
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
        if (cmd === "market_flow_load") return empty;
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
