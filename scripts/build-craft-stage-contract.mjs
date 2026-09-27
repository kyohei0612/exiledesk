// クラフトステージの受け渡しの型を、POE2Tube の schema から作り直す (2026-09-27)
// 正は POE2Tube: C:/Users/kyohei/POE2Tube/contracts/craft-stage-result.schema.json (plan も $defs に入っている)
// 出力: src/services/craft-stage/contract.ts (手で直さない)
//   node scripts/build-craft-stage-contract.mjs [schema のパス]
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = process.argv[2] ?? "C:/Users/kyohei/POE2Tube/contracts/craft-stage-result.schema.json";
const out = join(root, "src/services/craft-stage/contract.ts");
const banner = "/* 自動生成: POE2Tube contracts/craft-stage-result.schema.json から json-schema-to-typescript で作る (手で直さない)。作り直しは scripts/build-craft-stage-contract.mjs */";
execFileSync("npx", ["-y", "json-schema-to-typescript@15", "-i", schema, "-o", out, "--bannerComment", banner], { stdio: "inherit", shell: true });
console.log(`-> ${out}`);
