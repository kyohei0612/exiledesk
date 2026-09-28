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
// shell: true (Windows で npx を引くため) だと空白を含む引数が割れるので、見出しはクォートして渡す (2026-09-28 に割れて落ちていた)
execFileSync("npx", ["-y", "json-schema-to-typescript@15", "-i", JSON.stringify(schema), "-o", JSON.stringify(out), "--bannerComment", JSON.stringify(banner)], { stdio: "inherit", shell: true });
console.log(`-> ${out}`);
