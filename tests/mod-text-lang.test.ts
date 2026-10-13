/**
 * 付いた MOD の textJa は画面の言語によらず日本語 (2026-10-13: 英語の画面で打った MOD は、日本語に戻しても英語のままだった)
 */
import { afterEach, describe, expect, it } from "vitest";
import { lang } from "../src/i18n/lang";
import { jaOfMod, jaOfModAlways } from "../src/services/htc/mod-text";
import type { Mod } from "../vendor/poe2htc/engine/types";

const mod = { id: "IncreasedLife", family: "IncreasedLife", text: "+(10-19) to maximum Life", tiers: [] } as unknown as Mod;

describe("MOD の日本語は言語によらない", () => {
  afterEach(() => { lang.value = "ja"; });
  it("英語の画面: jaOfMod は英語、jaOfModAlways は日本語", () => {
    lang.value = "en";
    expect(jaOfMod(mod)).toBe("+# to maximum Life");
    expect(jaOfModAlways(mod)).toMatch(/[ぁ-んァ-ヶ一-龠]/);
  });
  it("日本語の画面では同じ", () => {
    lang.value = "ja";
    expect(jaOfMod(mod)).toBe(jaOfModAlways(mod));
  });
});
