/**
 * _pob-stage.mjs — クラフトステージの PoB 計算 (2026-09-29、POE2Tube 要望 ⑰-3 / ⑰-4)。craft-stage-run.mjs から使う
 *
 * スキル名 → PoB のジェム (vendor の PoB の Data/Gems.lua のゲーム内 ID) と、キャラのレベルで使える一番高いジェムレベル
 * (Data/Skills/*.lua の levels[n].levelRequirement)。計算は src-tauri/examples/stage_pob.rs を cargo で呼ぶ (通信しない)。
 */
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export function pobGems(root) {
  const data = resolve(root, "vendor/PathOfBuilding-PoE2/src/Data");
  const text = readFileSync(join(data, "Gems.lua"), "utf8");
  const byName = new Map();
  for (const m of text.matchAll(/\["(Metadata\/Items\/Gems\/[^"]+)"\] = \{([\s\S]*?)\n\t\},/g)) {
    const name = /\n\t\tname = "([^"]*)"/.exec(m[2])?.[1];
    const effect = /\n\t\tgrantedEffectId = "([^"]*)"/.exec(m[2])?.[1];
    // PoB が引くのは中の gameId の値 (build.data.gemsByGameId)。見出しの ID とはサポートで違う
    // (見出し SupportGemHeft / gameId SkillGemHeftSupport)。見出しを渡していてサポートが全部読まれていなかった (2026-09-29、要望 ⑱-6)
    const gameId = /\n\t\tgameId = "([^"]*)"/.exec(m[2])?.[1] ?? m[1];
    if (name && !byName.has(name)) byName.set(name, { gameId, effect });
  }
  // スキルの段 (parts) の名前。skill_part を名前で選ぶ時に番号 (1 から) にする
  const partsOf = new Map();
  const setsOf = new Map();
  for (const f of readdirSync(join(data, "Skills")).filter((x) => x.endsWith(".lua"))) {
    const t = readFileSync(join(data, "Skills", f), "utf8");
    for (const m of t.matchAll(/skills\["([^"]+)"\] = \{([\s\S]*?)\n\}/g)) {
      const block = /\n\tparts = \{([\s\S]*?)\n\t\},/.exec(m[2])?.[1];
      if (block && !partsOf.has(m[1])) partsOf.set(m[1], [...block.matchAll(/name = "([^"]*)"/g)].map((x) => x[1]));
      // PoE2 の PoB は段の代わりにステータスの組 (statSets) の物が多い (アイスストライクの Normal Strikes / Third Strike)
      const sets = /\n\tstatSets = \{([\s\S]*)/.exec(m[2])?.[1];
      if (sets && !setsOf.has(m[1])) setsOf.set(m[1], [...sets.matchAll(/\n\t\t\tlabel = "([^"]*)"/g)].map((x) => x[1]));
    }
  }
  // スキルごとの「ジェムレベル → 必要なキャラのレベル」
  const reqs = new Map();
  for (const f of readdirSync(join(data, "Skills")).filter((x) => x.endsWith(".lua"))) {
    const t = readFileSync(join(data, "Skills", f), "utf8");
    for (const m of t.matchAll(/skills\["([^"]+)"\] = \{([\s\S]*?)\n\}/g)) {
      const lv = [...m[2].matchAll(/\[(\d+)\] = \{[^\n]*?levelRequirement = (\d+)/g)].map((x) => [Number(x[1]), Number(x[2])]);
      if (lv.length && !reqs.has(m[1])) reqs.set(m[1], lv);
    }
  }
  return {
    gem(name) {
      const g = byName.get(name);
      if (!g) throw new Error(`PoB にスキル「${name}」が無い (英語の名前で指定)`);
      return g;
    },
    /**
     * スキルの段の選び方: 段 (parts) があれば { skill_part }、ステータスの組 (statSets) が 2 つ以上あれば { stat_set, granted_effect }。
     * part は番号 (1 から) か名前 (英語)。無ければ {} (PoB の既定 = 1 つ目)。無い名前・番号はエラー
     */
    choose(name, part) {
      if (part == null) return {};
      const g = byName.get(name);
      const parts = (g?.effect && partsOf.get(g.effect)) || [];
      const sets = (g?.effect && setsOf.get(g.effect)) || [];
      if (parts.length > 1) return { skill_part: pick(parts) };
      if (sets.length > 1) return { stat_set: pick(sets), granted_effect: g.effect };
      throw new Error(`${name} には選べる段が無い`);
      function pick(list) {
        if (typeof part === "number") {
          if (part < 1 || part > list.length) throw new Error(`${name} の段 ${part} は無い (段: ${list.join(" / ")})`);
          return part;
        }
        const i = list.findIndex((x) => x.toLowerCase() === String(part).toLowerCase());
        if (i < 0) throw new Error(`${name} に「${part}」という段は無い (段: ${list.join(" / ")})`);
        return i + 1;
      }
    },
    /** 段の名前の一覧 (段か、ステータスの組。無ければ []) */
    partNames(name) {
      const g = byName.get(name);
      const parts = (g?.effect && partsOf.get(g.effect)) || [];
      return parts.length > 1 ? parts : (g?.effect && setsOf.get(g.effect)) || [];
    },
    /** スキルの段 (1 から)。part は番号か名前 (英語)。無ければ null (PoB の既定 = 1 つ目)。無い名前はエラー */
    partIndex(name, part) {
      if (part == null) return null;
      const g = byName.get(name);
      const list = (g?.effect && partsOf.get(g.effect)) || [];
      if (typeof part === "number") {
        if (part < 1 || part > Math.max(1, list.length)) throw new Error(`${name} の段 ${part} は無い (段: ${list.join(" / ") || "1 つだけ"})`);
        return part;
      }
      const i = list.findIndex((x) => x.toLowerCase() === String(part).toLowerCase());
      if (i < 0) throw new Error(`${name} に「${part}」という段は無い (段: ${list.join(" / ") || "1 つだけ"})`);
      return i + 1;
    },
    /** スキルの段の名前 (無ければ []) */
    parts(name) {
      const g = byName.get(name);
      return (g?.effect && partsOf.get(g.effect)) || [];
    },
    /** キャラのレベルで使える一番高いジェムレベル (データが無ければ 1) */
    levelFor(name, charLevel) {
      const g = byName.get(name);
      const lv = (g?.effect && reqs.get(g.effect)) || [];
      return lv.filter(([, req]) => req <= charLevel).reduce((a, [l]) => Math.max(a, l), 1);
    },
  };
}

/**
 * 敵 (PoB の表): レベル (設定の enemyLevel、無ければキャラのレベル。上限 MaxEnemyLevel = CalcSetup.lua と同じ)、
 * 普通の敵のライフ (Data/Misc.lua の monsterLifeTable)、一撃の既定値 (ConfigOptions.lua と同じ monsterDamageTable × 1.5 × 敵の種類の倍率)
 */
export function pobEnemy(root, charLevel, config) {
  const src = resolve(root, "vendor/PathOfBuilding-PoE2/src");
  const misc = readFileSync(join(src, "Data/Misc.lua"), "utf8");
  const dataLua = readFileSync(join(src, "Modules/Data.lua"), "utf8");
  const table = (name) => (new RegExp(`data\\.${name} = \\{([^}]*)\\}`).exec(misc)?.[1] ?? "").split(",").map((x) => Number(x.trim())).filter((x) => Number.isFinite(x));
  const num = (name) => {
    const m = new RegExp(`${name} = ([\\d.]+) / ([\\d.]+)`).exec(dataLua);
    return m ? Number(m[1]) / Number(m[2]) : NaN;
  };
  const maxLevel = Number(/MaxEnemyLevel = (\d+)/.exec(dataLua)?.[1] ?? 85);
  const level = Math.min(maxLevel, Number(config.enemyLevel ?? charLevel));
  const life = table("monsterLifeTable")[level - 1] ?? 0;
  const mult = { None: num("normalEnemyDPSMult"), Boss: num("stdBossDPSMult"), Pinnacle: num("pinnacleBossDPSMult"), Uber: num("uberBossDPSMult") }[String(config.enemyIsBoss ?? "Pinnacle")] ?? num("normalEnemyDPSMult");
  const hit = Math.round((table("monsterDamageTable")[level - 1] ?? 0) * 1.5 * mult);
  return { level, life, hit, ja: `普通の敵 Lv${level} のライフ ${life}` };
}

/**
 * クエストの報酬 (要望 ⑲-6): PoB は素のキャラにもクエストの報酬 (アクト 1 のライフ +20、アクト 3 の火耐性 +10% など) を既定で入れる
 * (Modules/ConfigOptions.lua の「Quest Rewards」、チェックの既定がオン)。アクトの話と合わないので、quests_act (何アクトまで終えたか) より先の物を外せるように。
 * 戻り: [{ key (設定の鍵 = "quest" + Description + Area + Info), act, area, stat }] (チェックの物だけ。選ぶ物 (Options) は PoB の既定で「無し」)
 */
export function pobQuests(root) {
  const t = readFileSync(resolve(root, "vendor/PathOfBuilding-PoE2/src/Data/QuestRewards.lua"), "utf8");
  const out = [];
  for (const m of t.matchAll(/\n\t\{([\s\S]*?)\n\t\}/g)) {
    const s = (k) => new RegExp(`\\["${k}"\\] = "([^"]*)"`).exec(m[1])?.[1];
    const act = Number(/\["Act"\] = (\d+)/.exec(m[1])?.[1] ?? 0);
    if (/\["useConfig"\] = false/.test(m[1]) || !s("Stat")) continue;
    out.push({ key: `quest${s("Description")}${s("Area")}${s("Info")}`, act, area: s("Area"), stat: s("Stat") });
  }
  return out;
}

/** stage_pob を呼ぶ。steps は手ごとの [{ slot, text }]。戻りは stage_pob の out.json */
export function runStagePob(root, input) {
  const dir = mkdtempSync(join(tmpdir(), "exiledesk-stage-pob-"));
  try {
    const inPath = join(dir, "in.json");
    const outPath = join(dir, "out.json");
    writeFileSync(inPath, JSON.stringify(input));
    const r = spawnSync("cargo", ["run", "-q", "--example", "stage_pob", "--", inPath, outPath], { cwd: resolve(root, "src-tauri"), encoding: "utf8" });
    if (r.status !== 0) throw new Error(`stage_pob が失敗 (${r.status}): ${(r.stderr ?? "").split("\n").slice(-5).join(" ")}`);
    return JSON.parse(readFileSync(outPath, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * ゲームのデータに合わせる上書き (要望 ㉒-A、2026-09-30)。PoB 本体は触らず、設定の customMods (PoB の「Custom Modifiers」の欄) に足す。
 *   - 感電 (自分が受ける側): PoB の設定 (ConfigOptions の conditionShocked) は受けるダメージ +15% の手書き。
 *     ゲームは 20% (GameConstants.BaseShockMagnitude と感電の説明文)。差の 5% を足す (PoB の modDB で 15 → 20 を確かめた)
 * 戻り: { config (上書き後), fixes (日本語の説明の一覧) }
 */
export function gameFixes(config) {
  const add = [];
  const fixes = [];
  if (config.conditionShocked === true) {
    add.push("5% increased Damage taken");
    fixes.push("感電で受けるダメージを PoB の 15% → ゲームの 20% に");
  }
  if (!add.length) return { config, fixes };
  const cur = typeof config.customMods === "string" && config.customMods ? `${config.customMods}\n` : "";
  return { config: { ...config, customMods: cur + add.join("\n") }, fixes };
}
