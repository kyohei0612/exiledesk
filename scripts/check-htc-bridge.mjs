/**
 * check-htc-bridge.mjs — 上位 MOD → クラフトエンジンの橋渡しを検算する (2026-09-22)
 *
 * オーナー指示で取り込んだ POE2HTC のエンジン (src/vendor/poe2htc) に、
 * 上位プレイヤーMOD一覧のテンプレートが何割繋がるかを測る。上流のデータを入れ替えた時に
 * 何割落ちたかがすぐ分かるように、数字を出して閾値で落とす。
 *
 * 入力は実データ (%APPDATA%/com.kyohei.exiledesk/craft_v2_cache.json)。
 * 無ければスキップする (CI では走らない)。
 *
 *   node scripts/check-htc-bridge.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bundleEntry } from "./_bundle-ts.mjs";

const CACHE = join(process.env.APPDATA ?? "", "com.kyohei.exiledesk", "craft_v2_cache.json");
if (!existsSync(CACHE)) {
  console.log("上位プレイヤーMOD の取得結果がまだありません。この検算はスキップします。");
  process.exit(0);
}

const { loadPatchSync, bridgeMods } = await bundleEntry("scripts/_htc-bridge-entry.ts");

const data = loadPatchSync();
const cache = JSON.parse(readFileSync(CACHE, "utf8"));

/**
 * **アイテム 1 個ずつ**、そのアイテム自身のベースで引く。
 *
 * 最初はスロットごとに「いちばん使われているベース」1 つで全部を試していたが、それは間違い。
 * 同じ武器スロットにクォータースタッフも槍も弓もいるので、弓の MOD をクォータースタッフの
 * プールで探すことになり、実態より大幅に低く出る (実測 67.8%)。狙うベースは 1 個に決まるので、
 * 本番の使い方はアイテム単位。ここも合わせる。
 */
const byBase = new Map(); // baseType -> Map(template -> 人数)
const baseSlot = new Map();
const missingBase = new Map();
for (const asc of cache.ascendancies ?? []) {
  for (const ch of asc.characters ?? []) {
    const seen = new Set();
    for (const it of ch.rare_items ?? []) {
      const base = it.base_type;
      if (!base) continue;
      baseSlot.set(base, it.inventory_id ?? "?");
      if (!byBase.has(base)) byBase.set(base, new Map());
      const m = byBase.get(base);
      for (const raw of it.explicit_mods ?? []) {
        const k = `${base}::${raw}`;
        if (seen.has(k)) continue;
        seen.add(k);
        m.set(raw, (m.get(raw) ?? 0) + 1);
      }
    }
  }
}

let tplTotal = 0, tplHit = 0, wTotal = 0, wHit = 0, aliasUsed = 0, lineUsed = 0;
// ベースを知らない分は「橋渡しの作りの問題」ではなく「同梱データが古い」なので分けて数える
let kTpl = 0, kHit = 0, kW = 0, kWh = 0;
const perSlot = new Map();
const missExamples = new Map();
for (const [base, tpls] of byBase) {
  const templates = [...tpls.keys()];
  const { cls, mods } = bridgeMods(data, base, templates);
  const slot = baseSlot.get(base);
  if (!perSlot.has(slot)) perSlot.set(slot, { t: 0, h: 0, w: 0, wh: 0 });
  const acc = perSlot.get(slot);
  if (!cls) {
    let n = 0;
    for (const c of tpls.values()) n += c;
    missingBase.set(base, (missingBase.get(base) ?? 0) + n);
  }
  for (const m of mods) {
    const n = tpls.get(m.template) ?? 0;
    tplTotal++; wTotal += n; acc.t++; acc.w += n;
    if (cls) { kTpl++; kW += n; }
    if (m.mod) {
      tplHit++; wHit += n; acc.h++; acc.wh += n;
      if (cls) { kHit++; kWh += n; }
      if (m.viaAlias) aliasUsed++;
      if (m.viaLine) lineUsed++;
    } else if (cls) {
      const cur = missExamples.get(m.template) ?? { n: 0, cls: cls.id };
      cur.n += n;
      missExamples.set(m.template, cur);
    }
  }
}

const rows = [...perSlot.entries()].sort().map(([slot, a]) => ({
  slot, テンプレート: `${a.h}/${a.t}`, 割合: `${((a.h / a.t) * 100).toFixed(0)}%`, 人数: `${((a.wh / a.w) * 100).toFixed(0)}%`,
}));
console.table(rows);
const tplPct = (tplHit / tplTotal) * 100;
const wPct = (wHit / wTotal) * 100;
console.log(`テンプレート ${tplHit}/${tplTotal} = ${tplPct.toFixed(1)}% / 人数で重み付け ${wHit}/${wTotal} = ${wPct.toFixed(1)}%`);
console.log(`エンジンが知っているベースに限ると テンプレート ${((kHit / kTpl) * 100).toFixed(1)}% / 人数 ${((kWh / kW) * 100).toFixed(1)}%`);
console.log(`別名表で拾った数 ${aliasUsed} / 複合 MOD の 1 行として拾った数 ${lineUsed}`);
if (missingBase.size) {
  const top = [...missingBase.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(`エンジンが知らないベース ${missingBase.size} 種: ${top.map(([b, n]) => `${b} (${n})`).join(", ")}`);
}
const topMiss = [...missExamples.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
if (topMiss.length) {
  console.log("繋がらなかった MOD (人数順):");
  for (const [t, v] of topMiss) console.log(`   ${String(v.n).padStart(3)} 人  [${v.cls}] ${t}`);
}

/**
 * 下限。2026-09-22 の実測は 全体 86.7% / エンジンが知っているベースに限れば 94.5%。
 * 上流のデータを入れ替えた時に静かに落ちたら気づけるよう、少し下に置く。
 * 落ちたら「ベースが増えたのか、MOD の言い回しが変わったのか」を上の一覧で見る。
 */
const MIN_TPL = 82, MIN_W = 80;
if (tplPct < MIN_TPL || wPct < MIN_W) {
  console.log(`\nNG: 下限 (テンプレート ${MIN_TPL}% / 人数 ${MIN_W}%) を下回りました`);
  process.exit(1);
}
console.log("\n全部 OK");
