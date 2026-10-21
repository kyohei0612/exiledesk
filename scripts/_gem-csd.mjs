// build-gem-hover-ja.mjs の stat の文言 (.csd)。スキル専用ファイル → include → 一般のファイル の順に探す (2026-10-22 に移した、中身はそのまま)
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { decodeCsd, parseStatDescriptions } from "./parse-stat-descriptions.mjs";

/** EXP = 書き出しのフォルダー、L = 出す言語の表の名前 (English / Japanese)、EN = 英語版か、NL = 改行 */
export function makeCsd({ EXP, L, EN, NL }) {
  const csdCache = new Map();
  const missingFiles = new Set();
  function loadCsd(path) {
    if (csdCache.has(path)) return csdCache.get(path);
    const file = join(EXP, "files", path.replace(/\//g, "@"));
    let v = null;
    if (existsSync(file)) {
      const text = decodeCsd(readFileSync(file));
      const includes = [...text.matchAll(/^\s*include\s+"([^"]+)"/gm)].map((m) => m[1]);
      const { descriptors } = parseStatDescriptions(text);
      /** stat → その stat を含む記述の番号 (ファイル内の順) */
      const idx = new Map();
      descriptors.forEach((d, i) => {
        for (const s of d.stats ?? []) {
          if (!idx.has(s)) idx.set(s, []);
          idx.get(s).push(i);
        }
      });
      v = { path, descriptors, idx, includes };
    } else missingFiles.add(path);
    csdCache.set(path, v);
    return v;
  }
  /** ファイルと include を深さ優先で並べる (重複は最初の位置) */
  function chain(path) {
    const out = [];
    const seen = new Set();
    const walk = (p) => {
      if (seen.has(p)) return;
      seen.add(p);
      const f = loadCsd(p);
      if (!f) return;
      out.push(f);
      for (const inc of f.includes) walk(inc);
    };
    walk(path);
    for (const p of ["Data/StatDescriptions/skill_stat_descriptions.csd", "Data/StatDescriptions/meta_gem_stat_descriptions.csd"]) walk(p);
    return out;
  }

  // 値の変換 (csd の token。数字の引数は 1 始まりの stat 番号)
  function convert(v, k) {
    switch (k) {
      case "negate": return [-v, null];
      case "double": return [v * 2, null];
      case "negate_and_double": return [-v * 2, null];
      case "add_one": return [v + 1, null];
      case "subtract_one": return [v - 1, null];
      case "plus_two_hundred": return [v + 200, null];
      case "multiplicative_damage_modifier": return [v + 100, null];
      case "times_twenty": return [v * 20, null];
      case "times_one_point_five": return [v * 1.5, null];
      case "multiply_by_four": return [v * 4, null];
      case "multiply_by_one_hundred": return [v * 100, null];
      case "one_hundred_divide_by_value": return [v ? 100 / v : 0, "if"];
      case "divide_by_two_0dp": return [v / 2, 0];
      case "divide_by_three": return [v / 3, "if"];
      case "divide_by_four": return [v / 4, "if"];
      case "divide_by_five": return [v / 5, "if"];
      case "divide_by_ten_0dp": return [v / 10, 0];
      case "divide_by_ten_1dp": return [v / 10, 1];
      case "divide_by_ten_1dp_if_required": return [v / 10, "if1"];
      case "divide_by_twelve": return [v / 12, "if"];
      case "divide_by_fifteen_0dp": return [v / 15, 0];
      case "divide_by_twenty_then_double_0dp": return [Math.floor(v / 20) * 2, 0];
      case "divide_by_fifty": return [v / 50, "if"];
      case "divide_by_one_hundred": return [v / 100, "if"];
      case "divide_by_one_hundred_0dp": return [v / 100, 0];
      case "divide_by_one_hundred_1dp": return [v / 100, 1];
      case "divide_by_one_hundred_2dp": return [v / 100, 2];
      case "divide_by_one_hundred_2dp_if_required": return [v / 100, "if2"];
      case "divide_by_one_hundred_and_negate": return [-v / 100, "if"];
      case "divide_by_one_thousand": return [v / 1000, "if"];
      case "divide_by_ten_thousand_1dp": return [v / 10000, 1];
      case "deciseconds_to_seconds": return [v / 10, "if"];
      case "milliseconds_to_seconds": return [v / 1000, "if"];
      case "milliseconds_to_seconds_0dp": return [v / 1000, 0];
      case "milliseconds_to_seconds_1dp": return [v / 1000, 1];
      case "milliseconds_to_seconds_2dp": return [v / 1000, 2];
      case "milliseconds_to_seconds_2dp_if_required": return [v / 1000, "if2"];
      case "per_minute_to_per_second": return [v / 60, "if"];
      case "per_minute_to_per_second_0dp": return [v / 60, 0];
      case "per_minute_to_per_second_1dp": return [v / 60, 1];
      case "per_minute_to_per_second_2dp": return [v / 60, 2];
      case "per_minute_to_per_second_2dp_if_required": return [v / 60, "if2"];
      default: return null;
    }
  }
  function fmtNum(x, dp) {
    if (typeof dp === "number") return x.toFixed(dp);
    const lim = dp === "if1" ? 1 : 2;
    return String(Number(x.toFixed(lim)));
  }
  function matchLimits(line, values) {
    for (let i = 0; i < line.limits.length; i++) {
      const [lo, hi] = line.limits[i];
      const v = values[i] ?? 0;
      if (lo === "!") {
        if (v === hi) return false;
        continue;
      }
      if (hi !== "#" && v > hi) return false;
      if (lo !== "#" && v < lo) return false;
    }
    return true;
  }
  /** 1 行を描画 (値は d.stats 順の数値)。印 [Tag|表示] は残す */
  function renderLine(line, values) {
    const shown = values.map((v) => ({ v, dp: null }));
    for (const t of line.tokens) {
      if (typeof t.v !== "number") continue;
      const i = t.v - 1;
      if (!shown[i]) continue;
      const r = convert(shown[i].v, t.k);
      if (!r) continue;
      shown[i].v = r[0];
      if (r[1] !== null) shown[i].dp = r[1];
    }
    let bare = 0;
    return line.text.replace(/\{(\d*)(?::([^}]*))?\}/g, (_, idx, spec) => {
      const i = idx === "" ? bare++ : Number(idx);
      const s = shown[i] ?? { v: 0, dp: null };
      let str = fmtNum(s.v, s.dp);
      if (spec === "+d" && s.v >= 0) str = "+" + str;
      return str;
    });
  }

  const stats = { english: [], skipped: new Map(), hidden: 0 };
  /**
   * stat の集まり → 行。ゲームと同じく、記述の並び順に「まだ使っていない stat を含む記述」を 1 つずつ描画する。
   * mode: "normal" | "quality"
   * @returns {{ lines: string[], table: string[] }}
   */
  function describe(statMap, csdPath, mode = "normal", flags = new Set()) {
    const files = chain(csdPath);
    const used = new Set();
    const found = [];
    for (let fi = 0; fi < files.length; fi++) {
      const f = files[fi];
      const cands = new Set();
      for (const s of statMap.keys()) if (!used.has(s) && f.idx.has(s)) for (const i of f.idx.get(s)) cands.add(i);
      for (const i of [...cands].sort((a, b) => a - b)) {
        const d = f.descriptors[i];
        if (!d.stats.some((s) => statMap.has(s) && !used.has(s))) continue;
        for (const s of d.stats) used.add(s);
        found.push({ fi, i, d });
      }
    }
    for (const s of statMap.keys()) {
      if (used.has(s) || flags.has(s)) continue;
      stats.skipped.set(s, (stats.skipped.get(s) ?? 0) + 1);
    }
    const lines = [];
    const table = [];
    for (const { d } of found) {
      if (d.noDescription) {
        stats.hidden++;
        continue;
      }
      const values = d.stats.map((s) => statMap.get(s) ?? 0);
      let lang = L;
      let all = d.langs[L] ?? [];
      if (!all.length) {
        all = d.langs.English ?? [];
        lang = "English";
      }
      const normal = all.filter((l) => !l.quality);
      const tbl = all.filter((l) => l.quality === "table_only");
      const qual = all.filter((l) => l.quality === "gem_quality");
      let pool = mode === "quality" ? (qual.length ? qual : normal) : normal;
      let asTable = false;
      if (!pool.length && tbl.length) {
        pool = tbl;
        asTable = true;
      }
      const line = pool.find((l) => matchLimits(l, values));
      if (!line) continue;
      let text = renderLine(line, values).replace(/\r/g, "");
      if (!text.trim()) continue;
      if (lang === "English" && !EN) stats.english.push(`${d.stats.join(",")}: ${text}`);
      if (asTable) {
        const [label, value] = text.split("@");
        table.push(value !== undefined ? `${label}: ${value}` : label);
      } else lines.push(...text.split(NL).map((x) => x.trim()).filter(Boolean));
    }
    return { lines, table };
  }
  return { loadCsd, describe, stats, missingFiles };
}
