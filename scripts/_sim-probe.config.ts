// scripts/_sim-formula-probe.test.ts を回すだけの設定 (tests/ の自動テストには入れない)
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["scripts/_sim-formula-probe.test.ts"], environment: "node", testTimeout: 600_000 } });
