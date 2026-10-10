// 分析用の記録は 1 時間に 1 回まで送り、間の分は端末に溜めて次に一緒に送る (2026-10-10 log-sender.ts)
import { afterEach, describe, expect, it, vi } from "vitest";

describe("log-sender: 1 時間に 1 回まで", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

  it("初めは離れた時にすぐ送り、1 時間以内は溜め、1 時間たったら溜めた分と一緒に送る", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-10T00:00:00Z"));
    const store = new Map<string, string>();
    const sent: string[] = [];
    const listeners: Record<string, Array<() => void>> = {};
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    vi.stubGlobal("navigator", { userAgent: "x", sendBeacon: (_u: string, b: Blob) => { void b.text().then((t) => sent.push(t)); return true; } });
    vi.stubGlobal("document", { visibilityState: "hidden", createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, addEventListener: (n: string, f: () => void) => { (listeners[n] ??= []).push(f); } });
    vi.stubGlobal("addEventListener", (n: string, f: () => void) => { (listeners[n] ??= []).push(f); });
    vi.stubGlobal("fetch", async (_u: string, o: { body: string }) => { sent.push(o.body); return new Response("{}"); });
    let evN = 0;
    (globalThis as { __exiledeskEvPull?: () => string | null }).__exiledeskEvPull = () => JSON.stringify({ uid: "u", sid: `s${++evN}`, ev: [{ n: "open", s: 0 }] });
    const { startLogSender } = await import("../src/services/telemetry/log-sender");
    startLogSender("web");
    const log = (globalThis as { __exiledeskLog?: (k: string, d: Record<string, unknown>) => void }).__exiledeskLog!;
    const leave = async (): Promise<void> => { for (const f of listeners.visibilitychange ?? []) f(); await Promise.resolve(); };

    log("emu_use", { a: 1 });
    await leave();
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(1);

    // 30 分後にもう 2 回離れる → 溜めるだけ
    vi.setSystemTime(new Date("2026-10-10T00:30:00Z"));
    log("emu_use", { a: 2 });
    await leave();
    log("emu_use", { a: 3 });
    await leave();
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(1);
    expect(JSON.parse(store.get("exiledesk.log.pending")!).recs).toHaveLength(2);

    // 1 時間を過ぎて離れる → 溜めた分と一緒に 1 本
    vi.setSystemTime(new Date("2026-10-10T01:01:00Z"));
    log("emu_use", { a: 4 });
    await leave();
    await new Promise((r) => setImmediate(r));
    expect(sent).toHaveLength(2);
    const body = JSON.parse(sent[1]!) as { n: number; recs: unknown[]; __ev: Array<{ sid: string }> };
    expect(body.n).toBe(3);
    expect(body.__ev.map((e) => e.sid)).toEqual(["s2", "s3", "s4"]);
    expect(store.has("exiledesk.log.pending")).toBe(false);
  });
});
