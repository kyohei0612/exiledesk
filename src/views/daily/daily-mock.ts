/**
 * デイリークラフトチャレンジの見本のデータ (2026-10-22 オーナー「まずは何も使っていない皿の状態でモックを」)。
 * サーバー・シミュレーター・エンジン・相場は使わない。全部手で書いた物で、数字に意味は無い。
 * 中身をつなぐ段 (オーナーの OK の後) で、お題はサーバーの箱、MOD の文と段はエンジンの入口、結果はシミュレーターから取る。
 * MOD の文は src/i18n/mod-lines-ja-en.json の日英をそのまま写した (推測で訳さない)。構想はメモ craft-challenge の「10-22」
 */

export type DailyMod = {
  side: "prefix" | "suffix";
  /** {0}・{1} に range を入れる (mod-lines-ja-en.json の形) */
  ja: string;
  en: string;
  range: [number, number][];
  /** お題の段の下限 (精査の時にお題ごとに緩める。T2 = T2 以上) */
  minTier: number;
  /** 創生の樹の MOD (お題に 1 つまで) */
  genesis?: boolean;
};

export type DailyResult = {
  /** 100 人回しの平均の費用 (神) */
  avg: number;
  /** 完成率 (0〜1)。0.9 以上で解決 */
  rate: number;
  /** 試した日 (M/D) */
  at: string;
  /** フラクチャーして始めた MOD (mods の番号、無し = null) */
  fractured: number | null;
};

export type DailyTopic = {
  id: string;
  /** 出た日 (M/D) */
  day: string;
  /** 投稿した人の名前 (精査の時に付ける表示名) */
  by: string;
  base: { en: string; ja: string; ilvl: number };
  mods: DailyMod[];
  /** 挑戦した人数・解決した人数 */
  tries: number;
  solved: number;
  /** 今の最安の平均 (神、解決した人の中で)。まだ誰も解決していない = null */
  best: number | null;
  /** 自分の結果 (未挑戦 = null) */
  mine: DailyResult | null;
};

const LIFE = { ja: "最大ライフ {0:+d}", en: "{0:+d} to maximum Life" };
const MANA = { ja: "最大マナ {0:+d}", en: "{0:+d} to maximum Mana" };
const CAST = { ja: "キャストスピードが{0}%増加する", en: "{0}% increased Cast Speed" };
const LIGHT = { ja: "雷耐性 {0:+d}%", en: "{0:+d}% to Lightning Resistance" };
const FIRE = { ja: "火耐性 {0:+d}%", en: "{0:+d}% to Fire Resistance" };
const COLD = { ja: "冷気耐性 {0:+d}%", en: "{0:+d}% to Cold Resistance" };
const CHAOS = { ja: "混沌耐性 {0:+d}%", en: "{0:+d}% to Chaos Resistance" };
const ALLRES = { ja: "全ての元素耐性 {0:+d}%", en: "{0:+d}% to all Elemental Resistances" };
const ASPD = { ja: "アタックスピードが{0}%増加する", en: "{0}% increased Attack Speed" };
const MOVE = { ja: "移動スピードが{0}%増加する", en: "{0}% increased Movement Speed" };
const RARITY = { ja: "見つかるアイテムのレアリティが{0}%増加する", en: "{0}% increased Rarity of Items found" };
const INT = { ja: "知性 {0:+d}", en: "{0:+d} to Intelligence" };
const DEX = { ja: "器用さ {0:+d}", en: "{0:+d} to Dexterity" };
const ACC = { ja: "命中力 {0:+d}", en: "{0:+d} to Accuracy Rating" };
const SPIRIT = { ja: "スピリット {0:+d}", en: "{0:+d} to Spirit" };
const PHYS = { ja: "{0}から{1}の物理ダメージをアタックに追加する", en: "Adds {0} to {1} Physical Damage to Attacks" };

const m = (side: DailyMod["side"], t: { ja: string; en: string }, range: [number, number][], minTier: number, genesis?: boolean): DailyMod =>
  ({ side, ...t, range, minTier, ...(genesis ? { genesis } : {}) });

/** 今日のお題 (先頭) と溜まった未解決 (古い順)。解決した物は solvedTopics */
export const DAILY_TOPICS: DailyTopic[] = [
  {
    id: "d1022", day: "10/22", by: "exile_01",
    base: { en: "Gold Ring", ja: "金の指輪", ilvl: 82 },
    mods: [
      m("prefix", MANA, [[150, 179]], 2),
      m("prefix", LIFE, [[100, 119]], 3),
      m("suffix", CAST, [[17, 20]], 2),
      m("suffix", LIGHT, [[36, 40]], 2),
      m("suffix", FIRE, [[31, 35]], 3),
    ],
    tries: 214, solved: 61, best: 38.4, mine: null,
  },
  {
    id: "d1021", day: "10/21", by: "exile_02",
    base: { en: "Stocky Mitts", ja: "がっしりとしたミット", ilvl: 81 },
    mods: [
      m("prefix", LIFE, [[120, 149]], 2),
      m("prefix", PHYS, [[8, 13], [15, 22]], 3),
      m("suffix", ASPD, [[14, 16]], 2),
      m("suffix", ACC, [[251, 325]], 3, true),
    ],
    tries: 388, solved: 140, best: 21.7,
    mine: { avg: 27.9, rate: 0.93, at: "10/21", fractured: 2 },
  },
  {
    id: "d1020", day: "10/20", by: "exile_03",
    base: { en: "Lattice Sandals", ja: "格子のサンダル", ilvl: 82 },
    mods: [
      m("prefix", MOVE, [[30, 30]], 1),
      m("prefix", LIFE, [[100, 119]], 3),
      m("suffix", ALLRES, [[13, 15]], 2),
      m("suffix", CHAOS, [[22, 27]], 3),
    ],
    tries: 502, solved: 0, best: null,
    mine: { avg: 64.2, rate: 0.71, at: "10/20", fractured: 0 },
  },
  {
    id: "d1019", day: "10/19", by: "exile_04",
    base: { en: "Gold Amulet", ja: "金のアミュレット", ilvl: 82 },
    mods: [
      m("prefix", SPIRIT, [[46, 50]], 1),
      m("prefix", LIFE, [[120, 149]], 3),
      m("suffix", INT, [[25, 27]], 2),
      m("suffix", RARITY, [[21, 25]], 3),
    ],
    tries: 177, solved: 12, best: 92.0, mine: null,
  },
  {
    id: "d1018", day: "10/18", by: "exile_05",
    base: { en: "Emerald Ring", ja: "エメラルドの指輪", ilvl: 81 },
    mods: [
      m("prefix", ACC, [[251, 325]], 2),
      m("suffix", DEX, [[25, 27]], 2),
      m("suffix", COLD, [[36, 40]], 2),
    ],
    tries: 96, solved: 31, best: 12.3, mine: null,
  },
];

/** 自分が解決したお題 (今週の分、日替わりの一覧から外れた物。DAILY_TOPICS の中で自分が解決した物も一覧では「解決したお題」へ回す) */
export const SOLVED_TOPICS: DailyTopic[] = [
  {
    id: "d1017", day: "10/17", by: "exile_01",
    base: { en: "Sapphire Ring", ja: "サファイアの指輪", ilvl: 82 },
    mods: [m("prefix", MANA, [[120, 149]], 3), m("suffix", COLD, [[31, 35]], 3), m("suffix", CAST, [[13, 16]], 3)],
    tries: 640, solved: 402, best: 4.1,
    mine: { avg: 6.8, rate: 0.98, at: "10/17", fractured: null },
  },
];

export const findTopic = (id: string | null): DailyTopic | null =>
  [...DAILY_TOPICS, ...SOLVED_TOPICS].find((t) => t.id === id) ?? null;

/** 解決の条件 (完成率 90%、オーナー 10-22) */
export const SOLVE_RATE = 0.9;

/** 次の更新 (毎朝 7 時) と週のリセット (月曜 7 時)。日本時間で数える。返すのは残りのミリ秒 */
export function untilRefresh(now = Date.now()): { daily: number; weekly: number } {
  const JST = 9 * 3600e3;
  const t = now + JST;
  const day = 24 * 3600e3;
  const seven = 7 * 3600e3;
  const sinceSeven = (((t - seven) % day) + day) % day;
  const daily = day - sinceSeven;
  // 1970-01-01 は木曜 → 月曜 7 時からの経過は (日数 + 3) % 7
  const dow = (Math.floor((t - seven) / day) + 3) % 7;
  const weekly = (6 - dow) * day + daily;
  return { daily, weekly };
}

/** MOD の文に範囲を入れる ({0:+d} は + を付ける) */
export function fillMod(text: string, range: [number, number][]): string {
  return text.replace(/\{(\d)(:\+d)?\}/g, (_, i: string, plus?: string) => {
    const [lo, hi] = range[Number(i)] ?? [0, 0];
    const v = lo === hi ? `${lo}` : `(${lo}–${hi})`;
    return plus ? `+${v}` : v;
  });
}
