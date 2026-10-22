// scripts/_tree-patterns-probe.test.ts を回すだけの設定 (tests/ の自動テストには入れない)
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["scripts/_tree-patterns-probe.test.ts"], environment: "node", testTimeout: 3_600_000 } });
