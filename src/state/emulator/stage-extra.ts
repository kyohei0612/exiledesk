/**
 * stage-extra.ts — 動画用の別の画面 (URL の view=) の型。state/craft-stage.ts から分けた (2026-10-16、500 行の決まり)
 */
import { type CraftStagePlan, type PobBlock, DEF } from "../../services/craft-stage/engine";
import type { PobStat } from "../../services/craft-stage/stage-pob";
import { monsterAccuracy, type DamageKind, type Defender, type Outcome } from "../../services/craft-stage/defence";

/**
 * 動画用の別の画面 (POE2Tube 要望 ⑪、2026-09-29)。URL の view= で開く (手順は要らない):
 *   view=tiers&base=<英語のベース名>&mod=<MOD の id か系統>&ilvl=N … 段の表
 *   view=compare&a=<手順 JSON>&b=<手順 JSON>[&a_step=N&b_step=N] … 2 つのアイテムを並べて違いを出す
 */
export type StageExtra =
  // hl = false: 答えの金の段を出さない (&hl=0、POE2Tube 要望 ⑯「ネタバレは避けたい」)
  | { kind: "tiers"; base: string; mod: string; ilvl: number | null; hl: boolean; floor: number | null }
  // aPob / bPob: 結果 JSON の pob (要望 ⑰-3、&a_pob= / &b_pob=)。あれば真ん中の差に DPS の差も出す
  | { kind: "compare"; a: CraftStagePlan; b: CraftStagePlan; aStep: number; bStep: number; aPob: PobBlock | null; bPob: PobBlock | null }
  // 耐性の画面 (要望 ⑰-4): r = craft-stage-run.mjs --resists の結果、act = どのペナルティを出すか、penalty = false でペナルティ後を出さない
  | { kind: "resists"; r: ResistsBlock; act: number | null; penalty: boolean }
  // 倒すまでの時間 (要望 ⑰-15): a / b = 結果 JSON の pob、step = どの手の武器か、label = 左右の札
  | { kind: "ttk"; a: PobBlock; aStep: number; aLabel: string; b: PobBlock | null; bStep: number; bLabel: string }
  // 受けるダメージ (要望 ⑰-16): pob のその手のキャラのライフ、elem の一撃、res = 左右の耐性 (%)、dmg = 一撃の指定 (無ければ PoB の既定)
  | { kind: "hit"; pob: PobBlock; step: number; elem: string; res: number[]; dmg: number | null }
  // DPS の内訳 (要望 ⑰-5)
  | { kind: "dps"; pob: PobBlock; step: number }
  // 防御の仕組み (要望 ㉒-B): ダメージが減る順番 / アーマーのグラフ / 回避と受け流し / ES とライフ / 防具のベース
  | { kind: "layers"; d: Defender; hit: number; dmgKind: DamageKind; acc: number; outcome: Outcome; red: boolean; lvl: number | null }
  | { kind: "armour"; ar: number[]; labels: string[]; max: number | null; hit: number | null }
  | { kind: "evasion"; ev: number; deflect: number; acc: number; lvl: number | null; n: number; red: boolean }
  | { kind: "es"; life: number; es: number; dmg: number; hits: number[]; esKind: "phys" | "chaos" | "bleed"; until: number }
  | { kind: "bases"; slot: string; early: number; late: number }
  // エッセンスの強さの比べ (要望 ㉔-6): name = Essence of ○○ の ○○、part = 強調する部位の言葉
  | { kind: "essence"; name: string; part: string | null };
/** craft-stage-run.mjs --resists の結果 (耐性の画面に URL で渡す) */
export interface ResistsBlock {
  version: string;
  items: Array<{ name: string; base: string; rarity: string }>;
  /** 装備だけの耐性の合計 (アイテム無しとの差) */
  equip?: Record<"fire" | "cold" | "lightning" | "chaos", number>;
  rows: Array<{
    penalty: number;
    label: string;
    resists: PobStat["resists"];
    /** 内訳 (要望 ⑳): 元の値 (ペナルティ) / クエストの報酬 / 装備 (どれも PoB の値) */
    parts?: Record<"fire" | "cold" | "lightning" | "chaos", { base: number; quests: number; equip: number }>;
  }>;
  /** 使った前提 (要望 ⑳): 設定の言葉と入れたクエストの報酬 */
  config_ja?: string;
  quests?: Array<{ act: number; area: string; stat: string; on: boolean }>;
}

/**
 * 防御の画面 (要望 ㉒-B) の URL → 中身。キャラは &pob=<結果 JSON の pob>&step=N (ライフ・ES・アーマー・回避力・耐性) を元に、
 * &life= &es= &armour= &evasion= &deflect= &block= &res= で上書き。敵は &lvl= (命中力・一撃の表)、&acc= / &dmg= で上書き
 */
function defenceView(view: string, q: URLSearchParams): StageExtra {
  const num = (k: string): number | null => (q.get(k) != null && q.get(k) !== "" && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : null);
  const list = (k: string): number[] => (q.get(k) ? q.get(k)!.split(",").filter((x) => x.trim() !== "").map(Number).filter((x) => Number.isFinite(x)) : []);
  const pobBlock = q.get("pob") ? (JSON.parse(q.get("pob")!) as PobBlock) : null;
  const st = pobBlock?.steps?.[Math.min(num("step") ?? 9999, (pobBlock.steps?.length ?? 1) - 1)] ?? null;
  const lvl = num("lvl") ?? pobBlock?.enemy?.level ?? null;
  const acc = num("acc") ?? (lvl ? monsterAccuracy(lvl) : 0);
  if (view === "armour") return { kind: "armour", ar: list("ar").length ? list("ar") : [st?.armour ?? 1000], labels: (q.get("labels") ?? "").split(",").filter(Boolean), max: num("max"), hit: num("hit") };
  if (view === "evasion") return { kind: "evasion", ev: num("ev") ?? st?.evasion ?? 0, deflect: num("deflect") ?? 0, acc, lvl, n: num("n") ?? 10, red: q.get("red") !== "0" };
  if (view === "bases") return { kind: "bases", slot: q.get("slot") ?? "body", early: num("early") ?? 1, late: num("late") ?? 80 };
  const life = num("life") ?? Math.round(st?.life ?? 1000);
  const es = num("es") ?? Math.round(st?.es ?? 0);
  if (view === "es") {
    const hits = list("hits");
    const kind = q.get("kind");
    return { kind: "es", life, es, dmg: num("dmg") ?? 200, hits: hits.length ? hits : [0.8, 1.6, 2.4], esKind: kind === "chaos" || kind === "bleed" ? kind : "phys", until: num("until") ?? 12 };
  }
  const kinds: DamageKind[] = ["physical", "fire", "cold", "lightning", "chaos"];
  const dmgKind = (kinds.includes(q.get("kind") as DamageKind) ? q.get("kind") : "physical") as DamageKind;
  const outcomes: Outcome[] = ["hit", "evade", "deflect", "block"];
  const outcome = (outcomes.includes(q.get("outcome") as Outcome) ? q.get("outcome") : "hit") as Outcome;
  const resist = num("res") ?? (dmgKind === "physical" ? 0 : (st?.resists?.[dmgKind]?.value ?? 0));
  const d: Defender = { life, es, armour: num("armour") ?? Math.round(st?.armour ?? 0), evasion: num("evasion") ?? Math.round(st?.evasion ?? 0), deflection: num("deflect") ?? 0, block: num("block") ?? 0, resist };
  const hit = num("dmg") ?? pobBlock?.enemy?.hit ?? (lvl ? Math.round((DEF.monsterDamage[lvl - 1] ?? 0) * 1.5) : 500);
  return { kind: "layers", d, hit, dmgKind, acc, outcome, red: q.get("red") === "1", lvl };
}

/** URL の view= から動画用の別の画面を組む (無ければ null) */
export function extraFromUrl(q: URLSearchParams): StageExtra | null {
  const view = q.get("view");
  if (view === "tiers") {
    const ilvl = Number(q.get("ilvl"));
    return { kind: "tiers", base: q.get("base") ?? "", mod: q.get("mod") ?? "", ilvl: Number.isFinite(ilvl) && ilvl > 0 ? ilvl : null, hl: q.get("hl") !== "0", floor: Number(q.get("floor")) > 0 ? Number(q.get("floor")) : null };
  } else if (view === "compare") {
    const num = (k: string) => (q.get(k) != null ? Number(q.get(k)) : 9999);
    const pj = (k: string) => (q.get(k) ? (JSON.parse(q.get(k)!) as PobBlock) : null);
    return { kind: "compare", a: JSON.parse(q.get("a") ?? "{}") as CraftStagePlan, b: JSON.parse(q.get("b") ?? "{}") as CraftStagePlan, aStep: num("a_step"), bStep: num("b_step"), aPob: pj("a_pob"), bPob: pj("b_pob") };
  } else if (view === "ttk") {
    const num = (k: string) => (q.get(k) != null ? Number(q.get(k)) : 9999);
    return { kind: "ttk", a: JSON.parse(q.get("a_pob") ?? "{}") as PobBlock, aStep: num("a_step"), aLabel: q.get("a_label") ?? "A", b: q.get("b_pob") ? (JSON.parse(q.get("b_pob")!) as PobBlock) : null, bStep: num("b_step"), bLabel: q.get("b_label") ?? "B" };
  } else if (view === "hit") {
    const res = (q.get("res") ?? "50,75").split(",").map(Number).filter((x) => Number.isFinite(x));
    return { kind: "hit", pob: JSON.parse(q.get("pob") ?? "{}") as PobBlock, step: q.get("step") != null ? Number(q.get("step")) : 9999, elem: q.get("elem") ?? "fire", res, dmg: q.get("dmg") != null ? Number(q.get("dmg")) : null };
  } else if (view === "dps") {
    return { kind: "dps", pob: JSON.parse(q.get("pob") ?? "{}") as PobBlock, step: q.get("step") != null ? Number(q.get("step")) : 9999 };
  } else if (view === "layers" || view === "armour" || view === "evasion" || view === "es" || view === "bases") {
    return defenceView(view, q);
  } else if (view === "essence") {
    return { kind: "essence", name: q.get("name") ?? "body", part: q.get("part") };
  } else if (view === "resists") {
    const act = q.get("act");
    return { kind: "resists", r: JSON.parse(q.get("r") ?? "{}") as ResistsBlock, act: act != null ? Number(act) : null, penalty: q.get("penalty") !== "0" };
  }
  return null;
}

/** 動画モードの見せ方 (URL の video=1 と一緒に) */
export interface StageVideo { from: number; autoplay: boolean; controls: boolean; layout?: "default" | "clip"; offers?: boolean; animT?: number | "end" | "pick" | null }
export function videoFromUrl(q: URLSearchParams, step: number, logLength: number): StageVideo {
    const at = q.get("anim_t");
    // &offers=1 (発現の 3 択の静止画) は、同じ手つきを 3 択が出そろった瞬間 (pick_ms) で止めた絵 (POE2Tube 要望 ㉗: 静止画と手つきの
    // 切り替わりで絵が飛ばないように)
    const animT: number | "end" | "pick" | null = at != null
      ? at === "end" ? "end" : Number.isFinite(Number(at)) ? Math.max(0, Number(at)) : null
      : q.get("offers") === "1" ? "pick" : null;
    return {
      // 手つきを時刻で止める時は 1 つ前の手から始めて、step 手目を打つ
      from: Math.max(0, Math.min(step, logLength) - (animT != null ? 1 : 0)),
      animT,
      autoplay: q.get("autoplay") === "1",
      controls: q.get("controls") !== "0",
      layout: q.get("layout") === "clip" ? "clip" : "default",
      offers: q.get("offers") === "1",
    };
}
