// スキルジェムのホバー用の日本語辞書をクライアント原本から作る (2026-09-26)
//
// オーナー:「スキルジェム関連にも同じように、名前の下に下線で詳細カード、仕組み同じにして」
//   「ゲーム内のジェムの説明と同じくらい詳しく (タグ・装備条件・コスト・クールダウン・効果の数値・品質)」
//   「品質の効果と追加品質 (別の種類の品質) の効果は分けて出して」。
// 元: data-cache/client-export-gems-detail/ (npx pathofexile-dat、config.json 参照)
//     tables/{English,Japanese}/  SkillGems / GemEffects / GemTags / SupportGems / GrantedEffects /
//       GrantedEffectsPerLevel / GrantedEffectStatSets / GrantedEffectStatSetsPerLevel / GrantedEffectLabels /
//       GrantedEffectQualityStats / Stats / CostTypes / ActiveSkills / BaseItemTypes / FlavourText / ClientStrings
//     files/Data@StatDescriptions@*.csd  (stat の文言。スキル専用ファイル → include をたどる → 一般のファイル)
//     + src/i18n/gems-client.json (コラプト対象のジェム一覧と種類・必要レベル)
// 出力: src/i18n/gem-hover-ja.json  (画面側は使う時に読み込む)。文言は [Tag|表示] の印を残す
//   キー: 英語名
//   値: { n: 日本語名, d: 説明, k: skill|meta|support, s: スピリットか, lv: 必要レベル,
//         lineage?: true, tags: [タグ], req: { lv, str, dex, int } (属性は % の配分),
//         fl?: フレーバー, at: [レベルごと], q?: [品質の効果], qh?: 見出し, q2?: [追加品質の効果], qq: 品質 %,
//         sub?: [{ n, d, at }] (付随スキル) }
//   at の 1 件: { g: ジェムレベル, req?: 必要レベル (スキルは PoB と同じ表、サポートは MinLevelReq), cost?: "8 マナ",
//         mult?: コスト倍率 %, cd?: 秒, uses?: 回数, res?: "30 スピリット", cast?: 秒, as?: アタックスピード %,
//         atk?: アタックタイム 秒, dmg?: アタックダメージ %, crit?: クリティカルヒット率 %,
//         tb?: ["項目: 値"] (ゲームの表の行), stats: [効果の行], sets?: [{ l: 見出し, crit?, dmg?, tb?, stats }] }
//   品質は 20% の時の値で書く (ゲームは今の品質で計算した値を出す。0% だと全部 0 になるため)。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeCsd, parseStatDescriptions } from "./parse-stat-descriptions.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXP = join(root, "data-cache/client-export-gems-detail");
const T = (lang, name) => JSON.parse(readFileSync(join(EXP, "tables", lang, `${name}.json`), "utf8"));
const both = (name) => [T("English", name), T("Japanese", name)];
const NL = String.fromCharCode(10);
const QUALITY = 20;

const [bitE, bitJ] = both("BaseItemTypes");
const [sgE] = both("SkillGems");
const [geE, geJ] = both("GemEffects");
const [tagE, tagJ] = both("GemTags");
const [supE] = both("SupportGems");
const [, flJ] = both("FlavourText");
const [gfE] = both("GrantedEffects");
const [gplE] = both("GrantedEffectsPerLevel");
const [ssE] = both("GrantedEffectStatSets");
const [sslE] = both("GrantedEffectStatSetsPerLevel");
const [lblE, lblJ] = both("GrantedEffectLabels");
const [qsE] = both("GrantedEffectQualityStats");
const [statE] = both("Stats");
const [costE, costJ] = both("CostTypes");
const [asE, asJ] = both("ActiveSkills");
const [csE, csJ] = both("ClientStrings");
const gemsClient = JSON.parse(readFileSync(join(root, "src/i18n/gems-client.json"), "utf8"));

const clientString = (id) => {
  const i = csE.findIndex((r) => r.Id === id);
  return i < 0 ? null : (csJ[i]?.Text ?? "");
};
const SPIRIT_FMT = clientString("SkillPopupCostValueSpirit") || "{0} スピリット";
const QUALITY_HEAD = (clientString("ItemDescriptionGemQualityStatDivider") || "")
  .replace(/<[^>]*>\{([^}]*)\}/g, "$1")
  .trim()
  .replace(/[:：]$/, "");
const clean = (t) => (t ?? "").replace(/\r/g, "").trim();
const plain = (t) => clean(t).replace(/\[([^\]|]+)\|([^\]]+)\]/g, "$2").replace(/\[([^\]]+)\]/g, "$1");

// ---------------------------------------------------------------------------
// stat の文言 (.csd)。スキル専用ファイル → include → 一般のファイル の順に探す
// ---------------------------------------------------------------------------
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
    let lang = "Japanese";
    let all = d.langs.Japanese ?? [];
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
    if (lang === "English") stats.english.push(`${d.stats.join(",")}: ${text}`);
    if (asTable) {
      const [label, value] = text.split("@");
      table.push(value !== undefined ? `${label}: ${value}` : label);
    } else lines.push(...text.split(NL).map((x) => x.trim()).filter(Boolean));
  }
  return { lines, table };
}

// ---------------------------------------------------------------------------
// ジェム 1 つ分
// ---------------------------------------------------------------------------
const perLevelByGe = new Map();
for (const r of gplE) {
  if (!perLevelByGe.has(r.GrantedEffect)) perLevelByGe.set(r.GrantedEffect, new Map());
  perLevelByGe.get(r.GrantedEffect).set(r.Level, r);
}
const setLevels = new Map();
for (const r of sslE) {
  if (!setLevels.has(r.StatSet)) setLevels.set(r.StatSet, new Map());
  setLevels.get(r.StatSet).set(r.GemLevel, r);
}
const qualityByGe = new Map(qsE.map((q) => [q.GrantedEffect, q]));
const statId = (i) => statE[i]?.Id;

/** stat set i 番目の csd。statset_0 の形なら statset_i に置き換え (無ければ 0 のまま) */
function csdFor(ge, setIndex) {
  const as = asE[ge.ActiveSkill];
  let p = as?.StatDescription || (ge.IsSupport ? "Data/StatDescriptions/gem_stat_descriptions.csd" : "Data/StatDescriptions/skill_stat_descriptions.csd");
  if (setIndex > 0 && /statset_0\.csd$/.test(p)) {
    const q = p.replace(/statset_0\.csd$/, `statset_${setIndex}.csd`);
    if (loadCsd(q)) p = q;
  }
  return p;
}

/** stat set のレベル lv の stat 一覧 (固定 + レベル別 + 小数)。追加の stat set は基本の set に上書き */
function statsOf(setIdx, lv, baseIdx) {
  const m = new Map();
  const flags = new Set();
  const add = (si) => {
    const ss = ssE[si];
    if (!ss) return;
    for (const s of ss.ImplicitStats) {
      m.set(statId(s), 1);
      flags.add(statId(s));
    }
    ss.ConstantStats.forEach((s, k) => m.set(statId(s), ss.ConstantStatsValues[k] ?? 0));
    const row = setLevels.get(si)?.get(lv);
    if (!row) return;
    row.AdditionalStats.forEach((s, k) => m.set(statId(s), row.AdditionalStatsValues[k] ?? 0));
    row.FloatStats.forEach((s, k) => {
      const r = row.BaseResolvedValues[k];
      m.set(statId(s), r !== undefined ? r : Math.round(row.FloatStatsValues[k] ?? 0));
    });
    for (const s of row.AdditionalFlags) {
      m.set(statId(s), 1);
      flags.add(statId(s));
    }
  };
  if (baseIdx !== undefined && baseIdx !== setIdx) add(baseIdx);
  add(setIdx);
  for (const [k, v] of m) if (!v) m.delete(k);
  return { m, flags, row: setLevels.get(setIdx)?.get(lv) };
}

function costText(ge, pl) {
  const out = [];
  (ge.CostTypes ?? []).forEach((ct, k) => {
    const amt = pl.CostAmounts?.[k];
    if (!amt) return;
    const c = costE[ct];
    const fmt = costJ[ct]?.FormatText || c?.FormatText || "{0}";
    const v = amt / (c?.Divisor || 1);
    out.push(fmt.replace("{0}", String(Number(v.toFixed(2)))).trim());
  });
  return out.length ? out.join(", ") : undefined;
}

// ジェムレベルごとの必要キャラクターレベル。クライアントの ActorLevel は 15 までこれと同じだが 16 から離れる
// (20 で 97)。PoB-PoE2 の Data/Skills (levelRequirement) と同じ表を使う (0 は条件なし、21 以上は 90)
const GEM_LEVEL_REQ = [0, 3, 6, 10, 14, 18, 22, 26, 31, 36, 41, 46, 52, 58, 64, 66, 72, 78, 84, 90];
const NO_DAMAGE = ["display_statset_no_hit_damage", "base_deal_no_damage"];
const dealsNoDamage = (m) => NO_DAMAGE.some((s) => m.has(s));

function levelEntry(ge, g, attackTag, fixedReq) {
  const pl = perLevelByGe.get(ge._index)?.get(g);
  const e = { g };
  const req = fixedReq ?? GEM_LEVEL_REQ[Math.min(g, GEM_LEVEL_REQ.length) - 1];
  if (req) e.req = req;
  // アタックのタグがあってもダメージを与えない物 (ウォークライなど) はキャストタイムで出す
  const isAttack = attackTag && !ge.IsSupport && !dealsNoDamage(statsOf(ge.StatSet, g).m);
  if (pl) {
    const cost = costText(ge, pl);
    if (cost) e.cost = cost;
    if (pl.CostMultiplier && pl.CostMultiplier !== 100) e.mult = pl.CostMultiplier;
    if (pl.Cooldown) e.cd = pl.Cooldown / 1000;
    if (pl.StoredUses > 1) e.uses = pl.StoredUses;
    if (pl.Reservation) e.res = SPIRIT_FMT.replace("{0}", String(pl.Reservation));
    if (isAttack) {
      if (pl.AttackSpeedMultiplier) e.as = 100 + pl.AttackSpeedMultiplier;
      if (pl.AttackTime) e.atk = pl.AttackTime / 1000;
    }
  }
  if (!ge.IsSupport && !isAttack && ge.CastTime) e.cast = ge.CastTime / 1000;
  const sets = [ge.StatSet, ...(ge.AdditionalStatSets ?? [])];
  sets.forEach((si, k) => {
    const { m, flags, row } = statsOf(si, g, k === 0 ? undefined : ge.StatSet);
    const { lines, table } = describe(m, csdFor(ge, k), "normal", flags);
    const part = {};
    if (row) {
      const crit = row.AttackCritChance || row.SpellCritChance;
      if (crit) part.crit = crit / 100;
      if ((isAttack && !dealsNoDamage(m)) || row.BaseMultiplier) part.dmg = 100 + Math.round(row.BaseMultiplier / 100);
    }
    if (table.length) part.tb = table;
    part.stats = lines;
    if (k === 0) Object.assign(e, part);
    else {
      const li = ssE[si]?.Label;
      const l = li != null ? clean(lblJ[li]?.Text || lblE[li]?.Text) : "";
      (e.sets ??= []).push({ l, ...part });
    }
  });
  return e;
}

function levelsFor(ge) {
  const lv = [...(perLevelByGe.get(ge._index)?.keys() ?? [])].sort((a, b) => a - b);
  if (!lv.length) return [1];
  const pick = [1, 20, 21].filter((x) => lv.includes(x));
  if (!pick.includes(lv[0])) pick.unshift(lv[0]);
  const top = lv.filter((x) => x <= 20).at(-1);
  if (top && !pick.includes(top)) pick.push(top);
  return [...new Set(pick)].sort((a, b) => a - b);
}

function qualityLines(ge, alt) {
  const q = qualityByGe.get(ge._index);
  if (!q) return [];
  const ids = alt ? q.AltStats : q.Stats;
  const vals = alt ? q.AltStatValuesPermille : q.StatsValuesPermille;
  const setsTo = alt ? q.AltApplyToStatSets : q.ApplyToStatSets;
  const m = new Map();
  ids.forEach((s, k) => {
    const v = Math.floor(((vals[k] ?? 0) * QUALITY) / 1000);
    if (v) m.set(statId(s), v);
  });
  if (!m.size) return [];
  const setIdx = setsTo?.[0] ?? 0;
  const { lines, table } = describe(m, csdFor(ge, setIdx), "quality");
  return [...lines, ...table];
}

const tagNames = (ids) =>
  ids
    .map((t) => plain(tagJ[t]?.Name || ""))
    .filter(Boolean);

function isAttackEffect(gemEffect) {
  return (gemEffect?.GemTags ?? []).some((t) => tagE[t]?.Id === "attack");
}

function buildGem(sg, base) {
  const gemEff = geE[sg.GemEffects[0]];
  const gemEffJ = geJ[sg.GemEffects[0]];
  const ge = gfE[gemEff?.GrantedEffect];
  const out = { ...base };
  out.tags = tagNames(gemEff?.GemTags ?? []);
  const req = { lv: sg.MinLevelReq };
  if (sg.StrengthRequirementPercent) req.str = sg.StrengthRequirementPercent;
  if (sg.DexterityRequirementPercent) req.dex = sg.DexterityRequirementPercent;
  if (sg.IntelligenceRequirementPercent) req.int = sg.IntelligenceRequirementPercent;
  out.req = req;
  if (!ge) return out;
  const isAttack = isAttackEffect(gemEff);
  if (ge.IsSupport) {
    const d = clean(gemEffJ?.SupportText);
    if (d) out.d = d;
  } else if (!out.d) {
    const d = clean(asJ[ge.ActiveSkill]?.Description);
    if (d) out.d = d;
  }
  const fixedReq = ge.IsSupport ? sg.MinLevelReq : undefined;
  out.at = levelsFor(ge).map((g) => levelEntry(ge, g, isAttack, fixedReq));
  out.qq = QUALITY;
  const q = qualityLines(ge, false);
  if (q.length) {
    out.q = q;
    if (QUALITY_HEAD) out.qh = QUALITY_HEAD;
  }
  const q2 = qualityLines(ge, true);
  if (q2.length) out.q2 = q2;
  const subs = (gemEff.AdditionalGrantedEffects ?? []).map((gi) => gfE[gi]).filter(Boolean);
  if (subs.length) {
    out.sub = subs.map((s) => {
      const lv = out.at.map((a) => a.g).filter((g) => perLevelByGe.get(s._index)?.has(g));
      const e = { n: clean(asJ[s.ActiveSkill]?.DisplayedName) || "", d: clean(asJ[s.ActiveSkill]?.Description) };
      if (!e.d || /\[DNT/.test(e.d)) delete e.d;
      if (/\[DNT/.test(e.n)) e.n = "";
      e.at = (lv.length ? lv : levelsFor(s)).map((g) => levelEntry(s, g, isAttack, fixedReq));
      return e;
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 対象: gems-client.json の 427 件 + サポートジェム全部 (リネージュは印つき)
// ---------------------------------------------------------------------------
const sgByName = new Map();
for (const sg of sgE) {
  const n = bitE[sg.BaseItemType]?.Name;
  if (!n || /\[|DNT|UNUSED/i.test(n)) continue;
  const key = n.toLowerCase();
  if (!sgByName.has(key)) sgByName.set(key, sg);
}
const supBySg = new Map(supE.map((s) => [s.SkillGem, s]));

// 旧方式の説明 (ActiveSkills の表示名で引く) — SkillGems に無い名前の保険
const oldDesc = new Map();
asE.forEach((e, i) => {
  const d = clean(asJ[i]?.Description);
  if (!e.DisplayedName || !d) return;
  const k = e.DisplayedName.toLowerCase();
  const cur = oldDesc.get(k);
  if (!cur || d.length > cur.d.length) oldDesc.set(k, { n: clean(asJ[i].DisplayedName) || e.DisplayedName, d });
});

const out = {};
let noSg = 0;
for (const g of gemsClient) {
  const sg = sgByName.get(g.en.toLowerCase()) ?? sgByName.get(`${g.en} minion`.toLowerCase());
  const hit = oldDesc.get(g.en.toLowerCase()) ?? oldDesc.get(`${g.en} minion`.toLowerCase());
  const base = { n: g.ja || (sg ? clean(bitJ[sg.BaseItemType]?.Name) : "") || hit?.n || g.en, d: "", k: g.kind, s: !!g.spirit, lv: g.minLevel ?? 0 };
  if (!sg) {
    noSg++;
    out[g.en] = { ...base, d: hit?.d ?? "" };
    continue;
  }
  const e = buildGem(sg, base);
  if (!e.d && hit?.d) e.d = hit.d;
  if (/\[DNT/.test(e.d)) e.d = ""; // 作りかけの英語の仮文は出さない
  out[g.en] = e;
}
let lineage = 0;
let dnt = 0;
let supports = 0;
for (const sg of sgE) {
  const sup = supBySg.get(sg._index);
  if (!sup) continue;
  const en = bitE[sg.BaseItemType]?.Name;
  if (!en || /\[|DNT|UNUSED/i.test(en) || out[en]) continue;
  const n = clean(bitJ[sg.BaseItemType]?.Name);
  if (!n) continue;
  const base = { n, d: "", k: "support", s: false, lv: sg.MinLevelReq ?? 0 };
  if (sup.IsLineage) base.lineage = true;
  // 説明が [DNT...] の物はゲームに出ていない作りかけ
  if (/\[DNT/.test(clean(geE[sg.GemEffects[0]]?.SupportText)) || /\[DNT/.test(clean(bitE[sg.BaseItemType]?.Name))) {
    dnt++;
    continue;
  }
  const e = buildGem(sg, base);
  const fl = sup.FlavourText != null ? clean(flJ[sup.FlavourText]?.Text) : "";
  if (fl) e.fl = fl;
  out[en] = e;
  supports++;
  if (sup.IsLineage) lineage++;
}

const json = JSON.stringify(out);
writeFileSync(join(root, "src/i18n/gem-hover-ja.json"), json + NL);

// ---------------------------------------------------------------------------
// 集計
// ---------------------------------------------------------------------------
const vals = Object.values(out);
const withStats = vals.filter((v) => v.at?.some((a) => a.stats?.length || a.sets?.some((s) => s.stats.length))).length;
const asciiLines = [];
const scan = (v, where) => {
  if (typeof v === "string") {
    const p = plain(v);
    if (/[A-Za-z]{3,}/.test(p) && !/[぀-ヿ一-鿿]/.test(p)) asciiLines.push(`${where}: ${v}`);
  } else if (Array.isArray(v)) v.forEach((x, i) => scan(x, where));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (k !== "k") scan(x, where);
};
for (const [k, v] of Object.entries(out)) scan(v, k);
console.log(`ジェム ${vals.length} 件 (一覧 ${gemsClient.length}、SkillGems に無い ${noSg}、サポート追加 ${supports}、うちリネージュ ${lineage}、作りかけ [DNT] で除外 ${dnt})`);
console.log(`効果の行あり ${withStats} 件 / 英語のままの行 ${stats.english.length} / 仮名漢字の無い行 ${asciiLines.length}`);
console.log(`文言の無い stat (延べ) ${[...stats.skipped.values()].reduce((a, b) => a + b, 0)} (種類 ${stats.skipped.size}) / 非表示指定 ${stats.hidden}`);
console.log(`出力 ${(json.length / 1024 / 1024).toFixed(2)} MB、見つからない csd ${missingFiles.size}`);
if (process.argv.includes("--verbose")) {
  console.log("英語:", stats.english.slice(0, 40));
  console.log("仮名漢字なし:", asciiLines.slice(0, 40));
  console.log("文言なし上位:", [...stats.skipped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40));
  console.log("csd なし:", [...missingFiles]);
}
