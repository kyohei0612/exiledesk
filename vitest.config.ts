/**
 * vitest.config.ts — 自動テスト (2026-09-29、開発側だけ。アプリの配布物には入らない)
 *
 * オーナー「テストは開発版に置こうか」。`pnpm test` で tests/**\/*.test.ts を走らせる。
 * CI は .github/workflows/tests.yml が main への push ごとに走らせる (リリースは止めない。落ちたら知らせるだけ)。
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // 計算機のエンジン (MOD 表 4 MB) を読むので少し長めに
    testTimeout: 60_000,
  },
});
