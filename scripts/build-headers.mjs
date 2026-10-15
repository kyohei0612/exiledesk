// public/_headers を server/web/security-headers.js から作る (2026-10-16)。ヘッダーを変えたら `node scripts/build-headers.mjs`
import { writeFileSync } from "node:fs";
import { headersFileText } from "../server/web/security-headers.js";

writeFileSync(new URL("../public/_headers", import.meta.url), headersFileText());
console.log("public/_headers を書きました");
