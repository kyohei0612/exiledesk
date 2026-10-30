/**
 * store.mjs — 実験の記録 (log.jsonl) と途中の形の保存 (saves/) (S-175)。置き場は data-cache/ai-tree (AI_TREE_DIR で替えられる)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DIR = process.env.AI_TREE_DIR ?? "data-cache/ai-tree";
const LOG = path.join(DIR, "log.jsonl");
const saveFile = (name) => {
  if (!/^[\w.-]+$/.test(name)) throw new Error(`保存の名前に使えない文字: ${name}`);
  return path.join(DIR, "saves", `${name}.json`);
};

export function readLog() {
  if (!fs.existsSync(LOG)) return [];
  return fs.readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

const commit = () => {
  try { return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(); } catch { return null; }
};

export function appendLog(rec) {
  fs.mkdirSync(DIR, { recursive: true });
  const id = `r${readLog().length + 1}`;
  const row = { id, at: new Date().toISOString(), commit: commit(), ...rec };
  fs.appendFileSync(LOG, JSON.stringify(row) + "\n");
  return row;
}

export const findRun = (id) => {
  const r = readLog().find((x) => x.id === id);
  if (!r) throw new Error(`記録に無い: ${id}`);
  return r;
};

export function writeSave(name, save) {
  fs.mkdirSync(path.join(DIR, "saves"), { recursive: true });
  fs.writeFileSync(saveFile(name), JSON.stringify({ name, at: new Date().toISOString(), ...save }));
}

/** solve の答えの手順 */
export function writeSolved(name, recipe) {
  fs.mkdirSync(path.join(DIR, "solved"), { recursive: true });
  const file = path.join(DIR, "solved", `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(recipe, null, 1));
  return file;
}

/** 考える工程の記録 (think.html が読む) */
export function writeThink(name, think) {
  fs.mkdirSync(path.join(DIR, "think"), { recursive: true });
  fs.writeFileSync(path.join(DIR, "think", `${name}.json`), JSON.stringify(think));
}

export function readSave(name) {
  if (!fs.existsSync(saveFile(name))) throw new Error(`保存に無い: ${name}`);
  return JSON.parse(fs.readFileSync(saveFile(name), "utf8"));
}
