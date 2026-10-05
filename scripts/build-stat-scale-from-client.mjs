#!/usr/bin/env node
/**
 * build-stat-scale-from-client.mjs — stat の「データの値 → 画面の値」の換算表をクライアント原本から作る (2026-10-03)
 *
 * 背景 (オーナー 2026-10-03「異界の MOD で、アミュレットなのに火スペルの MOD の中身が 400% とか」):
 *   クライアントの MOD の値は stat ごとに単位が違う。1 万分率 (permyriad: 400 → 4%)、毎分 (per_minute: 60 → 毎秒 1)、
 *   ミリ秒 (ms: 3000 → 3 秒) など。表示の時にどう割るかは stat_descriptions.csd の各行の token
 *   (divide_by_one_hundred / per_minute_to_per_second / milliseconds_to_seconds …) が決めている。
 *   今まではクラフトステージだけが id の語尾 (permyriad$ / per_minute$) で割っていて、他の画面は生の値をそのまま出していた。
 *
 * ここでは **csd の token をそのまま表にして** `src/services/mods/stat-scale.json` に書き、
 * アプリの `services/mods/stat-scale.ts` (決まりはそこ 1 つ) がこの表を引く。語尾の規則は表に無い新しい stat の保険。
 *
 * 入力:
 *   data-cache/client-export/files/Data@StatDescriptions@stat_descriptions.csd (build-mods-from-client.mjs が書き出す物)
 *   表に入れる stat id は、リポジトリのデータが実際に使っている物だけ (mods-bundle / 計算機のエンジン / extra-bases /
 *   ルーン / ヴァールのエンチャント・強化)。csd 全体 (1 万 1 千 stat) を入れると配布物が重くなるだけ。
 *
 * 出力:
 *   src/services/mods/stat-scale.json  … { generated, source, stats: { [statId]: { div, digits } } } (アプリが読む。割る stat だけ)
 *     - div    … データの値をこれで割ると画面の値 (double なら 0.5)
 *     - digits … 小数の桁 (csd の _1dp / _2dp。無い物は 2 = 「必要なら 2 桁まで」、csd の描画と同じ)
 *     割らない stat は書かない (表に無い = そのまま)。
 *   src/services/mods/stat-hidden.json … 文に値が出ない stat の id の一覧 (「25% chance to cause Bleeding」の 1 など、
 *     文の数字は定数)。点検 (check-mod-values) が照合から外すためだけの物で、アプリは読まない
 *
 * Usage: node scripts/build-stat-scale-from-client.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeCsd, parseStatDescriptions } from "./parse-stat-descriptions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CSD_PATH = resolve(ROOT, "data-cache/client-export/files/Data@StatDescriptions@stat_descriptions.csd");
const OUT = resolve(ROOT, "src/services/mods/stat-scale.json");
const OUT_HIDDEN = resolve(ROOT, "src/services/mods/stat-hidden.json");

const log = (...a) => console.log("[build-stat-scale]", ...a);
const J = async (p) => JSON.parse(await readFile(resolve(ROOT, p), "utf8"));

/**
 * token → 倍率と桁。parse-stat-descriptions.mjs の applyTokens と同じ意味 (符号は見ない: 文の「減少」は別に扱う)。
 * 知らない token は null (換算しない)
 */
export function scaleOfTokens(tokens) {
  let mul = 1;
  let digits = null;
  // 切り捨て (per_minute_to_per_second だけ: ÷60 して小数 1 桁に切り捨て。PoB の StatDescriber と同じ。
  // 2026-10-06 POE2Tube 要望 ㉜ の 1「毎秒20.8 が 20.82 になった」)
  let floor = false;
  for (const { k } of tokens) {
    switch (k) {
      case "negate_and_double": case "double": mul *= 2; break;
      case "divide_by_two_0dp": mul /= 2; digits = 0; break;
      case "divide_by_five": mul /= 5; break;
      case "divide_by_ten_0dp": mul /= 10; digits = 0; break;
      case "divide_by_ten_1dp": case "divide_by_ten_1dp_if_required": mul /= 10; digits = 1; break;
      case "divide_by_twelve": mul /= 12; break;
      case "divide_by_fifteen_0dp": mul /= 15; digits = 0; break;
      case "divide_by_twenty_then_double_0dp": mul /= 10; digits = 0; break;
      case "divide_by_one_hundred": mul /= 100; break;
      case "divide_by_one_hundred_2dp": case "divide_by_one_hundred_2dp_if_required": mul /= 100; digits = 2; break;
      case "divide_by_one_thousand": mul /= 1000; break;
      case "milliseconds_to_seconds": case "milliseconds_to_seconds_0dp": case "milliseconds_to_seconds_1dp":
      case "milliseconds_to_seconds_2dp": case "milliseconds_to_seconds_2dp_if_required":
        mul /= 1000; digits = k.endsWith("0dp") ? 0 : k.includes("1dp") ? 1 : k.includes("2dp") ? 2 : digits; break;
      case "per_minute_to_per_second": mul /= 60; digits = 1; floor = true; break;
      case "per_minute_to_per_second_0dp": case "per_minute_to_per_second_1dp":
      case "per_minute_to_per_second_2dp": case "per_minute_to_per_second_2dp_if_required":
        mul /= 60; digits = k.endsWith("0dp") ? 0 : k.includes("1dp") ? 1 : k.includes("2dp") ? 2 : digits; break;
      case "times_twenty": mul *= 20; break;
      case "times_one_point_five": mul *= 1.5; break;
      case "multiply_by_four": mul *= 4; break;
      case "deciseconds_to_seconds": mul /= 10; break;
      default: break; // negate / reminderstring / canonical_line … は値の大きさを変えない
    }
  }
  if (mul === 1) return null;
  // div は 1 / mul。浮動小数の誤差を落とす (1/(1/100) = 100.00000000000001 にならないように)
  const div = Math.round((1 / mul) * 1e6) / 1e6;
  return floor ? { div, digits: digits ?? 2, floor: true } : { div, digits: digits ?? 2 };
}

/** 行の文がその位置 (0 始まり) の stat を出すか。`{0}` `{1:+d}` のほか、添字なしの `{}` は出現順 */
function showsPosition(text, pos) {
  let bare = 0;
  for (const m of text.matchAll(/\{(\d*)(?::[^}]*)?\}/g)) {
    const i = m[1] === "" ? bare++ : Number(m[1]);
    if (i === pos) return true;
  }
  return false;
}

/**
 * 値によって文に出たり出なかったりする stat の、行ごとの「この幅なら出る / 出ない」。
 * 例: attacks_num_of_additional_chains は 1 なら「an additional time」(数字なし)、2 以上なら「{0} additional times」。
 * 文の行は上から順に、その位置の限界 (lo|hi、# は無制限) に min が入る最初の物が選ばれる (parse-stat-descriptions.mjs の matchLimits と同じ)
 */
export function partlyHiddenLines(descriptor, statId) {
  const pos = descriptor.stats.indexOf(statId);
  const lines = descriptor.langs?.English ?? [];
  if (pos < 0 || lines.length === 0) return null;
  const flags = lines.map((l) => showsPosition(l.text, pos));
  if (flags.every(Boolean) || !flags.some(Boolean)) return null;
  // 行の限界は **全部の stat の位置** について持つ (「No Physical Damage」の行は 2 つ目の stat が 1 以上の時だけ選ばれる)。
  // `#` は無制限 (null)、「!n」は n 以外
  const lim = (x) => (x[0] === "!" ? ["!", x[1]] : [x[0] === "#" ? null : x[0], x[1] === "#" ? null : x[1]]);
  return {
    pos,
    stats: [...descriptor.stats],
    lines: lines.map((l, i) => ({ lim: descriptor.stats.map((_s, p) => lim(l.limits[p] ?? ["#", "#"])), shown: flags[i] ? 1 : 0 })),
  };
}

/** 1 つの stat の換算 (全ての英語の行を見て決める)。{ div, digits } / { hidden: true } / null (そのまま) */
export function scaleOfStat(descriptor, statId) {
  const pos = descriptor.stats.indexOf(statId);
  const lines = descriptor.langs?.English ?? [];
  if (pos < 0 || lines.length === 0) return null;
  const shown = lines.filter((l) => showsPosition(l.text, pos));
  if (shown.length === 0) return { hidden: true };
  const seen = new Map();
  for (const l of shown) {
    // token の対象は 1 始まりの stat 番号。番号の無い token (`v: true`) は 1 つ目の stat
    const mine = l.tokens.filter((t) => (typeof t.v === "number" ? t.v === pos + 1 : pos === 0));
    const sc = scaleOfTokens(mine);
    seen.set(sc ? `${sc.div}/${sc.digits}${sc.floor ? "f" : ""}` : "1", sc);
  }
  if (seen.size > 1) log(`WARN: ${statId} は行ごとに換算が違う (${[...seen.keys()].join(", ")})。最初の行の物を使う`);
  return [...seen.values()][0] ?? null;
}

/** リポジトリのデータが使っている stat id を全部集める */
async function collectStatIds() {
  const ids = new Set();
  const bundle = await J("src/i18n/mods-bundle.json");
  for (const e of Object.values(bundle)) for (const s of e.stats ?? []) if (s.id) ids.add(s.id);
  const htc = await J("src/vendor/poe2htc/data/mods.json");
  for (const m of Object.values(htc.mods)) for (const t of m.tiers ?? []) for (const s of t.stats ?? []) if (s) ids.add(s);
  const extra = await J("src/services/htc/extra-bases.json");
  for (const m of extra.mods ?? []) for (const t of m.tiers ?? []) for (const s of t.stats ?? []) if (s) ids.add(s);
  for (const d of Object.values(extra.dropOnly ?? {})) for (const s of d.stats ?? []) ids.add(s);
  for (const list of Object.values(extra.familyStats ?? {})) for (const arr of Object.values(list)) for (const s of arr) ids.add(s);
  const runes = await J("src/services/craft-stage/stage-runes.json");
  for (const r of Object.values(runes.runes ?? {})) for (const e of r.effects ?? []) for (const s of e.stats ?? []) ids.add(s.id);
  for (const file of ["src/services/craft-stage/vaal-upgrades.json", "src/i18n/vaal-enchants.json"]) {
    const j = await J(file);
    for (const m of Object.values(j.mods ?? j)) for (const s of m?.stats ?? []) if (s?.id) ids.add(s.id);
  }
  return ids;
}

async function main() {
  const csd = decodeCsd(await readFile(CSD_PATH));
  const { byStat } = parseStatDescriptions(csd);
  const ids = await collectStatIds();
  const stats = {};
  const hidden = [];
  const partly = {};
  let missing = 0;
  for (const id of [...ids].sort()) {
    const d = byStat.get(id);
    if (!d) { missing++; continue; }
    const lines = partlyHiddenLines(d, id);
    if (lines) partly[id] = lines;
    const sc = scaleOfStat(d, id);
    if (!sc) continue;
    if (sc.hidden) hidden.push(id);
    else stats[id] = sc;
  }
  const generated = new Date().toISOString().slice(0, 10);
  const out = {
    generated,
    source: "GGG client Data/StatDescriptions/stat_descriptions.csd の token (scripts/build-stat-scale-from-client.mjs)。表に無い stat は割らない",
    stats,
  };
  await writeFile(OUT, JSON.stringify(out, null, 1) + "\n", "utf8");
  await writeFile(OUT_HIDDEN, JSON.stringify({
    generated,
    source: "文に値が出ない stat (scripts/build-stat-scale-from-client.mjs)。点検 (check-mod-values) だけが読む",
    hidden,
    // 値によって出たり出なかったりする stat: { pos, stats, lines: [{ lim: 位置ごとの [下限, 上限] か ["!", n], shown }] }。
    // null は無制限。上から順に、全部の位置の限界に値 (その stat は min、他は MOD にあればその min、無ければ 0) が入る最初の行
    partly,
  }, null, 1) + "\n", "utf8");
  const scaled = Object.keys(stats).length;
  log(`stat ${ids.size} 件のうち、換算する物 ${scaled}、文に出ない物 ${hidden.length}、値によって出ない物 ${Object.keys(partly).length}、csd に無い物 ${missing} → ${OUT}`);
  if (scaled < 50) {
    console.error("[build-stat-scale] 換算する stat が少なすぎる (csd の読み違い?)");
    process.exit(2);
  }
}

if (import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href || process.argv[1]?.endsWith("build-stat-scale-from-client.mjs")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
