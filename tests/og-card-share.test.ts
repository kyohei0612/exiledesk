// シェアのカード (server/web/og-card.js) と画面 (use-spam-share.ts・share.ts) の式の一致 (2026-10-22、点検 emulator/notes/2026-10-22-code-audit.md)。
// og-card.js は実行場所 (Cloudflare) が別なので写しのまま。外の正解は本番の D1 の shares の 1 行目 (id 6NI0Ts0 と、その時に画面が作った code)
import { describe, expect, it, vi } from "vitest";
import { shortIdOf as ogShortId, unpack } from "../server/web/og-card.js";
import { packCard, shortIdOf } from "../src/views/craft-stage/use-spam-share";

// カードの絵の部品 (wasm) と画面の部品は使わないので空に (vi.mock は import より先に効く)
vi.mock("../server/web/node_modules/workers-og", () => ({ ImageResponse: class {} }));
vi.mock("../src/i18n/lang", () => ({ tr: (ja: string) => ja }));
vi.mock("../src/utils/log-record", () => ({ logRecord: () => {} }));
vi.mock("../src/services/trade2/open-external", () => ({ openExternal: () => {} }));

// 本番の D1 (exiledesk-logs の shares) の行: 2026-10 のスパムシミュレーターのシェア 1 本
const REAL = {
  id: "6NI0Ts0",
  code: "VY2xSsNQFIZfJZxJ4aA2QU2zVYciOIh2CyHcxoOmvU3k3iiIOCRXQQuODgVRECqVanGs-Dgnta8hoXRw_r_v_3zoCEBotDUlmdXonUvKAKGcPsyeRpxPuHhl88JmyOaDjWFzBwiz2xHnb5xPfvuPs6-b-f07F99cfLIZV0pFDtiMLcdaadWs8mdYTvurgHUHYVHQ4Y7QlF2ekQ4X6WW5toFbjo32pr2NYLtrrjUfPgNeQQyeayMo8EAJRYCgwfP95eH6biqPD0nHOhNJVM0tF9CvB0GAIP6RTZm2hdxLIkVC04FKOxRlsaSjbixlk3r7dEES0K7MLngQnYpUhyeKREYKroM_",
};

describe("シェアのカードと画面の式の一致", () => {
  it("短い id: 本番の行の id を、カード側も画面側も同じに作る", async () => {
    expect(await ogShortId(REAL.code)).toBe(REAL.id);
    expect(await shortIdOf(REAL.code)).toBe(REAL.id);
  });

  it("中身: 本番の code をカード側で読むと、並び [l, b, bn, m, n, a, r, md, u, c] のとおり", async () => {
    const get = await unpack(REAL.code);
    expect([get("l"), get("b"), get("bn"), get("n"), get("r"), get("md"), get("u"), get("c")]).toEqual(["ja", "Absent Amulet", "不在のアミュレット", "93", "10", "632", "2527", "28.8 神"]);
    expect(get("h")).toBeNull();
  });

  it("画面が縮めた物 (15 個の並び) をカード側が同じ並びで読む", async () => {
    const v = ["en", "Lapis Amulet", "Lapis Amulet", "狙い", 12, "Amulets", 33, 40, 120, "3 div", { i: 82 }, "h", "o", 5, 2];
    const get = await unpack(await packCard(v));
    expect(["l", "b", "bn", "m", "n", "a", "r", "md", "u", "c", "h", "o", "p", "q"].map((k) => get(k))).toEqual(["en", "Lapis Amulet", "Lapis Amulet", "狙い", "12", "Amulets", "33", "40", "120", "3 div", "h", "o", "5", "2"]);
  });
});
