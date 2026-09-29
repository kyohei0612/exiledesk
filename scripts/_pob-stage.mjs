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
    if (name && !byName.has(name)) byName.set(name, { gameId: m[1], effect });
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
