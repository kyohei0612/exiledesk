#!/usr/bin/env node
/**
 * parse-stat-descriptions.mjs
 * --------------------------------------------------------------
 * GGG クライアントの `Data/StatDescriptions/stat_descriptions.csd` を解析し、
 * stat ID → 言語別の文言テンプレートを引けるようにする。
 *
 * PoB-PoE2 の `src/Export/statdesc.lua` (Lua) を JS に移植したもの。
 * PoB は英語しか出力しないが、同じファイルに `lang "Japanese"` ブロックが
 * 全 stat 分入っている (2026-09-07 実測: 10,776 description 中 10,770)。
 *
 * ファイル形式 (実機 2026-09-07):
 *
 *   description                              ← ブロック開始 (`description <name>` の場合あり)
 *   	1 base_maximum_life                    ← <stat 数> <stat ID...>
 *   	1                                      ← 英語の行数
 *   		# "{0:+d} to maximum Life"           ← <limit...> "<text>" <token...>
 *   	lang "Japanese"                        ← 言語切替
 *   	1
 *   		# "最大ライフ {0:+d}"
 *
 *   - limit は stat ごとに 1 つ: `#` (任意) / `5` (固定) / `1|#` (範囲) / `!0` (否定)
 *   - text の `{0}` `{0:+d}` `{0:d}` `{0:-d}` が stat 値のプレースホルダ
 *   - token は表示前の値変換: negate / divide_by_one_hundred / per_minute_to_per_second /
 *     milliseconds_to_seconds / double / times_twenty ... (`canonical_line` はフラグ)
 *
 * 入出力:
 *   UTF-16LE (BOM 付き) をそのまま渡してよい (自動判定)。
 *
 * Usage (自己診断):
 *   node scripts/parse-stat-descriptions.mjs <csd path> [stat_id ...]
 *
 * @date 2026-09-07
 */

import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// デコード
// ---------------------------------------------------------------------------
export function decodeCsd(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buf.subarray(2));
  }
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString("utf8");
  }
  return buf.toString("utf8");
}

// ---------------------------------------------------------------------------
// パース
// ---------------------------------------------------------------------------
const RE_DESCRIPTION = /^description(?:\s+(\S+))?\s*$/;
const RE_NO_DESCRIPTION = /^no_description\s+(\S+)/;
const RE_LANG = /^lang\s+"([^"]+)"/;
const RE_STATS = /^(\d+)\s+(.+?)\s*$/;
const RE_COUNT = /^\d+$/;
// limits (stat ごと) → 任意の修飾子 (gem_quality 等) → "text" → tokens
const RE_LINE = /^([!\d#|\-\s]+?)\s*([A-Za-z_]\w*)?\s*"(.*)"\s*(.*)$/;

function parseLimit(token) {
  if (token === "#") return ["#", "#"];
  if (/^-?\d+$/.test(token)) {
    const n = Number(token);
    return [n, n];
  }
  const neg = token.match(/^!(-?\d+)$/);
  if (neg) return ["!", Number(neg[1])];
  const range = token.match(/^([\d\-#]+)\|([\d\-#]+)$/);
  if (range) {
    const a = range[1] === "#" ? "#" : Number(range[1]);
    const b = range[2] === "#" ? "#" : Number(range[2]);
    return [a, b];
  }
  return ["#", "#"];
}

function parseTokens(rest) {
  const words = rest.trim().split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === "canonical_line") {
      out.push({ k: w, v: true });
      continue;
    }
    const next = words[i + 1];
    if (next !== undefined) {
      out.push({ k: w, v: /^-?\d+(?:\.\d+)?$/.test(next) ? Number(next) : next });
      i++;
    } else {
      out.push({ k: w, v: true });
    }
  }
  return out;
}

/**
 * @returns {{ descriptors: Descriptor[], byStat: Map<string, Descriptor> }}
 * Descriptor = { name?: string, stats: string[], langs: Record<string, Line[]> }
 * Line = { limits: Array<[number|string, number|string]>, text: string, tokens: {k,v}[], quality?: string }
 */
export function parseStatDescriptions(text) {
  const descriptors = [];
  const byStat = new Map();
  let cur = null;
  let curLang = "English";

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    let m;
    if ((m = line.match(RE_NO_DESCRIPTION))) {
      const d = { name: undefined, stats: [m[1]], langs: {}, noDescription: true };
      descriptors.push(d);
      byStat.set(m[1], d);
      cur = null;
      continue;
    }
    if ((m = line.match(RE_DESCRIPTION))) {
      cur = { name: m[1], stats: null, langs: { English: [] } };
      curLang = "English";
      descriptors.push(cur);
      continue;
    }
    if (!cur) continue;

    if (cur.stats === null) {
      if ((m = line.match(RE_STATS))) {
        cur.stats = m[2].split(/\s+/).filter(Boolean);
        for (const s of cur.stats) byStat.set(s, cur);
      }
      continue;
    }
    if ((m = line.match(RE_LANG))) {
      curLang = m[1];
      if (!cur.langs[curLang]) cur.langs[curLang] = [];
      continue;
    }
    if (RE_COUNT.test(line)) continue; // 行数宣言
    if (line.startsWith("include ")) continue; // PoE2 の stat_descriptions.csd には無い

    if ((m = line.match(RE_LINE))) {
      const limits = m[1]
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(parseLimit);
      const entry = {
        limits,
        text: m[3].replace(/\\n/g, "\n"),
        tokens: parseTokens(m[4] || ""),
      };
      if (m[2]) entry.quality = m[2];
      cur.langs[curLang].push(entry);
    }
  }
  return { descriptors, byStat };
}

// ---------------------------------------------------------------------------
// 描画 (stat 値 → 表示文字列)
// ---------------------------------------------------------------------------
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

/** token による値変換。未知 token は無視 (表示用途なので致命ではない)。 */
function applyTokens(v, tokens) {
  let x = v;
  let decimals = null;
  for (const { k } of tokens) {
    switch (k) {
      case "negate":
        x = -x;
        break;
      case "negate_and_double":
        x = -x * 2;
        break;
      case "double":
        x = x * 2;
        break;
      case "divide_by_two_0dp":
        x = x / 2;
        decimals = 0;
        break;
      case "divide_by_five":
        x = x / 5;
        break;
      case "divide_by_ten_0dp":
        x = x / 10;
        decimals = 0;
        break;
      case "divide_by_ten_1dp":
      case "divide_by_ten_1dp_if_required":
        x = x / 10;
        decimals = 1;
        break;
      case "divide_by_twelve":
        x = x / 12;
        break;
      case "divide_by_fifteen_0dp":
        x = x / 15;
        decimals = 0;
        break;
      case "divide_by_twenty_then_double_0dp":
        x = (x / 20) * 2;
        decimals = 0;
        break;
      case "divide_by_one_hundred":
      case "divide_by_one_hundred_2dp":
      case "divide_by_one_hundred_2dp_if_required":
        x = x / 100;
        decimals = k.includes("2dp") ? 2 : decimals;
        break;
      case "divide_by_one_thousand":
        x = x / 1000;
        break;
      case "milliseconds_to_seconds":
      case "milliseconds_to_seconds_0dp":
      case "milliseconds_to_seconds_1dp":
      case "milliseconds_to_seconds_2dp":
      case "milliseconds_to_seconds_2dp_if_required":
        x = x / 1000;
        decimals = k.endsWith("0dp") ? 0 : k.includes("1dp") ? 1 : k.includes("2dp") ? 2 : decimals;
        break;
      case "per_minute_to_per_second":
      case "per_minute_to_per_second_0dp":
      case "per_minute_to_per_second_1dp":
      case "per_minute_to_per_second_2dp":
      case "per_minute_to_per_second_2dp_if_required":
        x = x / 60;
        decimals = k.endsWith("0dp") ? 0 : k.includes("1dp") ? 1 : k.includes("2dp") ? 2 : decimals;
        break;
      case "times_twenty":
        x = x * 20;
        break;
      case "times_one_point_five":
        x = x * 1.5;
        break;
      case "multiply_by_four":
        x = x * 4;
        break;
      case "deciseconds_to_seconds":
        x = x / 10;
        break;
      default:
        break; // reminderstring / canonical_line / passive_hash ... は表示に影響しない
    }
  }
  if (decimals !== null) {
    const r = Number(x.toFixed(decimals));
    // "_if_required" は整数なら小数を出さない、という意味なので Number() 化で自然に満たす
    x = r;
  } else if (!Number.isInteger(x)) {
    x = Number(x.toFixed(2));
  }
  return x;
}

function fmtValue(v, spec) {
  const s = Number.isInteger(v) ? String(v) : String(v);
  if (spec === "+d" && v > 0) return "+" + s;
  return s;
}

/**
 * 1 stat の (a, b) レンジを RePoE 風テンプレに描画する。a / b は Mods テーブルの
 * 格納順 (Stat1Value の [0], [1]) を token 変換した値で、**並べ替えない**。
 * RePoE も格納順のまま出すため、negate 系では "(25-17)% reduced ..." のように
 * 大きい方が先に来ることがある (2026-09-07: 旧 bundle との一致率を上げるため準拠)。
 *   a === b → "12"  /  それ以外 → "(10-19)"  /  +d 書式で正 → "+(10-19)"  /  両方負 → "-(5-3)"
 */
function fmtRange(a, b, spec) {
  if (a === b) return fmtValue(a, spec);
  if (a < 0 && b < 0) return `-(${Math.abs(a)}-${Math.abs(b)})`;
  const sign = spec === "+d" && a >= 0 && b >= 0 ? "+" : "";
  return `${sign}(${a}-${b})`;
}

/**
 * stat 値 (各 stat の {min,max}) から言語別の文言を描画する。
 * 行の選択は PoB と同じく min 値で limit を判定する。
 * @param {Descriptor} d
 * @param {string} lang
 * @param {Array<{min:number,max:number}>} values  d.stats と同順
 * @returns {string|null}
 */
export function renderDescriptor(d, lang, values) {
  const lines = d.langs?.[lang];
  if (!lines || lines.length === 0) return null;
  const mins = values.map((v) => v.min);
  const line = lines.find((l) => matchLimits(l, mins)) ?? lines[0];
  // プレースホルダは `{0}` `{1:+d}` のほか、添字なしの `{}` もある (1 stat 行に多い)。
  // 添字なしは出現順に 0, 1, ... を割り当てる。
  let bare = 0;
  return line.text.replace(/\{(\d*)(?::([^}]*))?\}/g, (_, idx, spec) => {
    const i = idx === "" ? bare++ : Number(idx);
    const v = values[i] ?? { min: 0, max: 0 };
    const a = applyTokens(v.min, line.tokens);
    const b = applyTokens(v.max, line.tokens);
    return fmtRange(a, b, spec);
  });
}

// ---------------------------------------------------------------------------
// CLI 自己診断
// ---------------------------------------------------------------------------
if (import.meta.url === new URL(process.argv[1], "file://").href || process.argv[1]?.endsWith("parse-stat-descriptions.mjs")) {
  const [, , file, ...ids] = process.argv;
  if (!file) {
    console.error("usage: node scripts/parse-stat-descriptions.mjs <stat_descriptions.csd> [stat_id ...]");
    process.exit(1);
  }
  const text = decodeCsd(readFileSync(file));
  const { descriptors, byStat } = parseStatDescriptions(text);
  const langs = new Set();
  for (const d of descriptors) for (const l of Object.keys(d.langs || {})) langs.add(l);
  console.log(`descriptors: ${descriptors.length}, stat ids: ${byStat.size}, languages: ${[...langs].join(", ")}`);
  const probe = ids.length ? ids : ["base_maximum_life", "local_minimum_added_physical_damage", "life_regeneration_rate_per_minute_%"];
  for (const id of probe) {
    const d = byStat.get(id);
    if (!d) {
      console.log(`  ${id}: (not found)`);
      continue;
    }
    const vals = d.stats.map((_, i) => (i === 0 ? { min: 10, max: 19 } : { min: 20, max: 30 }));
    console.log(`  ${id}  stats=[${d.stats.join(", ")}]`);
    console.log(`    EN: ${renderDescriptor(d, "English", vals)}`);
    console.log(`    JA: ${renderDescriptor(d, "Japanese", vals)}`);
  }
}
