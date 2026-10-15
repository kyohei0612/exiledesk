// Web の広告の入れ替えの決まり (utils/ads.ts、2026-10-16)。決まりはメモ web-ads-domain-plan (2026-10-12 オーナー) と AdSense の
// 「時間で入れ替えない・操作で画面が変わった時だけ」(2026-10-12 調べ)
import { describe, expect, it } from "vitest";
import { AD_MAX_PER_PAGE, AD_MIN_GAP_MS, adLayout, adPageOf, createAdRotation, type AdPage } from "../src/utils/ads";

describe("広告の入れ替え", () => {
  it("画面を移った時だけ出し直す (同じ画面のままなら出し直さない)", () => {
    const r = createAdRotation(() => 0);
    expect(r.navigate("craft")).toBe(false); // 開いた時は画面の変化ではない (枠は付いた時に 1 回出る)
    expect(r.navigate("craft")).toBe(false);
    expect(r.navigate("base")).toBe(true);
    expect(r.navigate("base")).toBe(false);
    expect(r.navigate("craft")).toBe(true);
    expect(r.navigate("feedback")).toBe(true);
  });

  it("ベース・モードの切り替えと MOD 一覧の開け閉めは画面の変化にならない", () => {
    const pages: AdPage[] = [
      adPageOf({ basePage: false, feedbackPage: false }),
      adPageOf({ basePage: false, feedbackPage: false, modOverlay: true }),
      adPageOf({ basePage: false, feedbackPage: false, modOverlay: false, base: "Gold Ring" }),
      adPageOf({ basePage: false, feedbackPage: false, base: "Sapphire Ring", mode: "sim" }),
      adPageOf({ basePage: false, feedbackPage: false, modOverlay: true, mode: "hand" }),
    ];
    expect(new Set(pages)).toEqual(new Set(["craft"]));
    const r = createAdRotation(() => 0);
    expect(pages.map((p) => r.navigate(p)).some(Boolean)).toBe(false);
    expect(adPageOf({ basePage: true, feedbackPage: false })).toBe("base");
    expect(adPageOf({ basePage: false, feedbackPage: true })).toBe("feedback");
  });

  it("同じ枠は 60 秒に 1 回まで (行き来を連打しても回数は増えない)", () => {
    let t = 1_000_000;
    const r = createAdRotation(() => t);
    expect(r.show("side-1")).toBe(true);
    t += 1_000; expect(r.show("side-1")).toBe(false);
    t += AD_MIN_GAP_MS - 1_001; expect(r.show("side-1")).toBe(false);
    expect(r.show("side-2")).toBe(true); // 枠ごとに別
    t += 1; expect(r.show("side-1")).toBe(true);
    expect(r.slots.get("side-1")).toMatchObject({ n: 2, skipped: 2 });
    // 出さずに見送った時は時刻を進めない (見送りが続いても 60 秒たてば出る)
    t += AD_MIN_GAP_MS; expect(r.show("side-1")).toBe(true);
  });

  it("並び: 右の列は 2 つ、全体で 3 つまで、MOD 一覧の画面は無い、スマホは上に 1 つ", () => {
    for (const width of [1280, 1660, 1920]) {
      for (const page of ["craft", "base", "feedback"] as const) {
        const l = adLayout(page, { phone: false, width });
        expect(l.length).toBeLessThanOrEqual(AD_MAX_PER_PAGE);
        expect(l.filter((x) => x.place === "right").length).toBeLessThanOrEqual(2);
        expect(new Set(l.map((x) => x.id)).size).toBe(l.length);
      }
    }
    expect(adLayout("craft", { phone: false, width: 1660 }).map((x) => `${x.id} ${x.w}x${x.h}`)).toEqual(["side-1 300x250", "side-2 300x250"]);
    // ベースを選ぶ画面は右の列を外して両脇に縦長 (1800 px 以上は 300×600、それ未満は 160×600)
    expect(adLayout("base", { phone: false, width: 1660 }).map((x) => `${x.place} ${x.w}x${x.h}`)).toEqual(["left 160x600", "right 160x600"]);
    expect(adLayout("base", { phone: false, width: 1920 }).map((x) => `${x.place} ${x.w}x${x.h}`)).toEqual(["left 300x600", "right 300x600"]);
    // 要望は左に縦長 1 つ + 右の列
    expect(adLayout("feedback", { phone: false, width: 1660 }).map((x) => x.id)).toEqual(["fb-left", "side-1", "side-2"]);
    // スマホは上の帯の下に 1 つだけ (別の画面は作らない)
    expect(adLayout("craft", { phone: true, width: 390 }).map((x) => x.place)).toEqual(["top"]);
    expect(adLayout("base", { phone: true, width: 390 })).toEqual([]);
  });
});
