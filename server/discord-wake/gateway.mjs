/**
 * Discord の Gateway に 1 本つないで、届いた出来事 (MESSAGE_CREATE など) を渡すだけの小さな受け口。
 * discord.js は使わない (Node 24 の組み込み WebSocket だけ、npm install 要らず)。
 *   HELLO → 心拍 (heartbeat) を回す → IDENTIFY (初回) / RESUME (切れた後) → DISPATCH を onDispatch へ
 * 切れたら少し待ってつなぎ直す。トークン違い・Intent が許されていない時だけ止める (直さないと何度やっても同じなので)。
 */

const GATEWAY = "wss://gateway.discord.gg/?v=10&encoding=json";
// 止める閉じ方: 4004 トークン違い、4010〜4012 設定違い、4013 Intent の値が変、4014 Intent が許されていない (Message Content Intent が OFF)
const FATAL = new Set([4004, 4010, 4011, 4012, 4013, 4014]);

export const INTENTS = {
  GUILDS: 1 << 0,
  GUILD_MESSAGES: 1 << 9,
  MESSAGE_CONTENT: 1 << 15,
};

/**
 * @param {{ token: string, intents: number, onDispatch: (t: string, d: any) => void, log: (msg: string) => void, onFatal: (code: number, reason: string) => void }} opt
 */
export function connectGateway(opt) {
  let ws = null;
  let seq = null;
  let sessionId = null;
  let resumeUrl = null;
  let beat = null;
  let acked = true;
  let backoff = 1000;
  let stopped = false;

  const send = (op, d) => { if (ws?.readyState === 1) ws.send(JSON.stringify({ op, d })); };
  const stopBeat = () => { if (beat) clearInterval(beat); beat = null; };

  function open(resume) {
    const url = resume && resumeUrl ? `${resumeUrl}/?v=10&encoding=json` : GATEWAY;
    ws = new WebSocket(url);
    ws.onmessage = (ev) => {
      let p;
      try { p = JSON.parse(String(ev.data)); } catch { return; }
      if (p.s != null) seq = p.s;
      switch (p.op) {
        case 10: { // HELLO
          const every = p.d.heartbeat_interval;
          acked = true;
          stopBeat();
          // 最初の 1 回は間隔 × 乱数だけ待つ (Discord の決まり)
          setTimeout(() => { send(1, seq); }, Math.floor(every * Math.random()));
          beat = setInterval(() => {
            // 前の心拍に返事が無い = つながったふりの死んだ線。閉じて RESUME でつなぎ直す
            if (!acked) { opt.log("心拍の返事が無いのでつなぎ直します"); ws.close(4900, "zombie"); return; }
            acked = false;
            send(1, seq);
          }, every);
          if (resume && sessionId) send(6, { token: opt.token, session_id: sessionId, seq });
          else send(2, { token: opt.token, intents: opt.intents, properties: { os: "windows", browser: "exiledesk-wake", device: "exiledesk-wake" } });
          break;
        }
        case 11: acked = true; break; // 心拍の返事
        case 1: send(1, seq); break; // 今すぐ心拍を、と言われた
        case 7: ws.close(4900, "reconnect"); break; // つなぎ直して、と言われた (RESUME する)
        case 9: // セッションが無効。d が true なら RESUME できる、false なら最初から
          if (!p.d) { sessionId = null; seq = null; }
          setTimeout(() => ws.close(4900, "invalid session"), 1000 + Math.random() * 4000);
          break;
        case 0:
          if (p.t === "READY") {
            sessionId = p.d.session_id;
            resumeUrl = p.d.resume_gateway_url;
            backoff = 1000;
            opt.log(`つながりました (${p.d.user?.username ?? "?"}、サーバー ${p.d.guilds?.length ?? 0} 個)`);
          } else if (p.t === "RESUMED") {
            backoff = 1000;
            opt.log("つなぎ直しました (RESUME)");
          }
          try { opt.onDispatch(p.t, p.d); } catch (e) { opt.log(`受けた後の処理で失敗: ${e?.stack ?? e}`); }
          break;
      }
    };
    ws.onclose = (ev) => {
      stopBeat();
      if (stopped) return;
      if (FATAL.has(ev.code)) { opt.onFatal(ev.code, ev.reason); return; }
      const wait = backoff;
      backoff = Math.min(backoff * 2, 60_000);
      opt.log(`切れました (code ${ev.code} ${ev.reason || ""})。${Math.round(wait / 1000)} 秒後につなぎ直します`);
      // 自分で閉じた (4900) か、ふつうに切れた時は RESUME を試す。だめなら op 9 が来て最初からになる
      setTimeout(() => open(Boolean(sessionId)), wait);
    };
    ws.onerror = () => { /* onclose が続けて来るのでそちらで扱う */ };
  }

  open(false);
  return { close() { stopped = true; stopBeat(); ws?.close(1000, "bye"); } };
}

/** Discord の REST を 1 回 (取りこぼしの読み直しだけに使う。書かない) */
export async function discordGet(token, path) {
  const r = await fetch(`https://discord.com/api/v10${path}`, { headers: { authorization: `Bot ${token}`, "user-agent": "DiscordBot (exiledesk-wake, 1)" } });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text().catch(() => "")}`.slice(0, 300));
  return r.json();
}
