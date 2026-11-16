// scripts/_tree-old-recipe-probe.test.ts を回すだけの設定 (tests/ の自動テストには入れない)。木の組み方の版を仮に "v-now" に埋める (S-104e の確かめ)
import { defineConfig } from "vitest/config";

export default defineConfig({ define: { __TREE_BUILD__: JSON.stringify("v-now") }, test: { include: ["scripts/_tree-old-recipe-probe.test.ts"], environment: "node", testTimeout: 600_000 } });
