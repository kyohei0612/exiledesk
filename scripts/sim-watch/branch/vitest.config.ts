// scripts/sim-watch/branch/branch.test.ts を回すだけの設定 (tests/ の自動テストには入れない = push や出しのたびには回らない、S-210)
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["scripts/sim-watch/branch/branch.test.ts"], environment: "node", setupFiles: ["scripts/sim-watch/branch/setup.ts"],testTimeout: 1_800_000 } });
