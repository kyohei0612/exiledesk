/**
 * 人の選び方 = アプリの「上位プレイヤー MOD」のまま (設計図 D-80b)。`src-tauri/src/poe_ninja_client/builds.rs` (SkillPlan) と
 * `ascendancy_fetch.rs` (fetch_one_ascendancy) を移した物。違うのはビルドの人数だけ 10 → 3 (スキルを拾う「DPS 上位 N 人」の N も、下限も 3)。
 *
 * Worker は 1 回の起動で数本しか取れないので、選び方を「控え (memo) を見ながら頭から回し直す」形にした。
 * 控えに無い物に当たったら、それを取る頼み (Need) を返して止まる。取って控えに足し、次の起動でまた頭から回す。
 * 同じ控えなら同じ順で同じ所に来るので、アプリの順番 (DPS 順・スキルの外し方・足りないスキルは次へ) がそのまま残る。
 */
import type { Main } from "./character";
import type { Ref } from "./protobuf";

/** 上位のアセの数 (アプリの runner.ts の TOP_ASCENDANCIES) */
export const TOP_ASCENDANCIES = 7;
/** ビルドの数 */
export const BUILD_COUNT = 3;
/** 1 ビルドの人数 (スキルを拾う「DPS 上位 N 人」の N も同じ)。アプリは 10、デイリーは 3 (オーナー 11-05「そうだね3人が丸いか」) */
export const BUILD_SIZE = 3;
/** これより少ないビルドは外して次のスキルへ。アプリは 5、デイリーは 3 (D-80b「足りない時の下限も 3」) */
export const BUILD_MIN = 3;
const WINDOWS = 4;
const ROUNDS = 4;
const MISMATCH_LIMIT = 20;

/** 控え。search はキー (searchKey) → 上位の人 (null = 絞らない search が失敗 = そのアセは諦める)、char は名前 → メインスキル (null = 取れなかった) */
export interface Memo {
  search: Map<string, Ref[] | null>;
  chars: Map<string, Main | null>;
}

export type Need = { kind: "search"; asc: string; skills: string[] } | { kind: "char"; asc: string; ref: Ref };

export interface AscResult {
  asc: string;
  /** 型に使う人 (ビルド順・DPS 順。ビルドが作れなかった時は取れた人全員) と、その人のビルドのスキル */
  people: Array<{ key: string; skill: string | null }>;
}

export const charKey = (r: Ref): string => `${r.account}|${r.name}`;
export const searchKey = (asc: string, skills: string[]): string => `${asc}\n${skills.join("&")}`;

class NeedSignal {
  constructor(readonly need: Need) {}
}

/** poe.ninja の search の `skills=` (絞るスキル + 外すスキル `!`) */
const skillsParam = (include: string | null, exclude: string[]): string[] => [...(include ? [include] : []), ...exclude.map((s) => `!${s}`)];

class SkillPlan {
  chosen: string[] = [];
  dropped = new Set<string>();
  pick(top: string): void {
    if (this.chosen.length < BUILD_COUNT && !this.chosen.includes(top) && !this.dropped.has(top)) this.chosen.push(top);
  }
  excluded(): string[] {
    return [...this.chosen, ...[...this.dropped].sort()];
  }
  buildParam(k: number): string[] {
    return skillsParam(this.chosen[k] ?? null, this.chosen.slice(0, Math.min(k, this.chosen.length)));
  }
  drop(skill: string): void {
    this.chosen = this.chosen.filter((s) => s !== skill);
    this.dropped.add(skill);
  }
  full(): boolean {
    return this.chosen.length >= BUILD_COUNT;
  }
}

/** 1 アセ分を頭から回す。控えに無い物に当たったら NeedSignal を投げる。絞らない search が失敗・誰も取れない時は null */
function runAscendancy(asc: string, memo: Memo): AscResult | null {
  const base = memo.search.get(searchKey(asc, []));
  if (base === undefined) throw new NeedSignal({ kind: "search", asc, skills: [] });
  if (base === null) return null;
  const got: string[] = [];
  const getChar = (r: Ref): Main | null => {
    const k = charKey(r);
    const m = memo.chars.get(k);
    if (m === undefined) throw new NeedSignal({ kind: "char", asc, ref: r });
    if (m && !got.includes(k)) got.push(k);
    return m;
  };
  const search = (skills: string[]): Ref[] => {
    if (!skills.length) return base;
    const v = memo.search.get(searchKey(asc, skills));
    if (v === undefined) throw new NeedSignal({ kind: "search", asc, skills });
    return v ?? [];
  };

  const plan = new SkillPlan();
  let builds: Array<{ skill: string; members: string[] }> = [];
  for (let round = 0; round < ROUNDS; round++) {
    // 1. スキルを決める: DPS 上位 N 人の一番のスキル → 足りなければ拾ったスキルを外した上位 N 人 (最大 WINDOWS 回)
    for (let w = 0; w < WINDOWS; w++) {
      if (plan.full()) break;
      const refs = search(skillsParam(null, plan.excluded()));
      const before = plan.chosen.length;
      for (const r of refs.slice(0, BUILD_SIZE)) {
        const m = getChar(r);
        if (m) plan.pick(m.skills[0]!);
      }
      if (!refs.length || (plan.chosen.length === before && !plan.excluded().length)) break;
    }
    // 2. ビルド = そのスキルで絞り、前のビルドのスキルを外した DPS 上位 (一番のスキルがそれの人だけ)
    builds = [];
    let weak: string | null = null;
    for (let k = 0; k < plan.chosen.length; k++) {
      const skill = plan.chosen[k]!;
      const refs = search(plan.buildParam(k));
      const b = { skill, members: [] as string[] };
      let mismatch = 0;
      for (const r of refs) {
        if (b.members.length >= BUILD_SIZE || mismatch >= MISMATCH_LIMIT) break;
        const m = getChar(r);
        if (m && m.skills[0] === skill) {
          mismatch = 0;
          b.members.push(charKey(r));
        } else mismatch++;
      }
      if (b.members.length < BUILD_MIN) {
        weak = skill;
        break;
      }
      builds.push(b);
    }
    // 3. 人が足りないスキルは外して、次のスキルを拾い直す
    if (weak === null) break;
    plan.drop(weak);
  }

  const people: AscResult["people"] = [];
  const seen = new Set<string>();
  if (builds.length) {
    for (const b of builds) for (const key of b.members) if (!seen.has(key)) seen.add(key), people.push({ key, skill: b.skill });
  } else for (const key of got) people.push({ key, skill: null });
  return people.length ? { asc, people } : null;
}

/** 全部のアセを人気順に回す。次に取る物があれば need、全部済めば done (諦めたアセは入らない) */
export function runAll(ascs: string[], memo: Memo): { need: Need } | { done: AscResult[] } {
  const done: AscResult[] = [];
  for (const asc of ascs) {
    try {
      const r = runAscendancy(asc, memo);
      if (r) done.push(r);
    } catch (e) {
      if (e instanceof NeedSignal) return { need: e.need };
      throw e;
    }
  }
  return { done };
}
