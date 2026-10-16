/**
 * craft-stage-help-mods.ts — 棚のカードの「付く MOD」・短い名前・特別なエッセンス。craft-stage-help.ts から分けた (2026-10-16、500 行の決まり)
 */
import { fillModText } from "../services/htc/mod-text";
import { tierDisplayRanges } from "../services/mods/stat-scale";
import { essenceTarget } from "../services/craft-stage/apply-essence";
import { essenceLevelOf } from "../vendor/poe2htc/optimizer/cost";
import { isRune, runeEffectFor, runeOf } from "../services/craft-stage/stage-runes";
import { type PatchData } from "../vendor/poe2htc/engine/types";
import { CATALYSTS as HTC_CATALYSTS } from "../services/htc/quality";
import { enOf } from "./craft-stage-shelf";
import type { StageItem } from "../services/craft-stage/types";
import { lang, tr } from "../i18n/lang";
import { emotionNameOf, isEmotion } from "../services/craft-stage/apply-emotion";
import { jewelEmotionsOf } from "../services/htc/patch";

/** 英語の画面か (2026-10-10 英語版) */
const isEn = (): boolean => lang.value === "en";

/**
 * 付く MOD だけ (カードの上に色を変えて箇条書き、2026-10-05 オーナー「エッセンスは特に説明欄が見づらいから、ルーンとか特定の MOD が付く奴は
 * 分かりやすい色にそこだけ変えよう」「付く MOD だけ箇条書きで書いてあげたい」)。今のアイテムの部位での物。無い物は空
 */
/**
 * エッセンスの値が普通の MOD (同じ系統・同じ側) のどのティアに当たるか (2026-10-05 オーナー「エッセンスはティアも一応欲しいな、
 * ここからここまでのティアみたいな、もしティア間で被るなら」)。1 つ目の値の範囲が重なるティアを全部。T1 が一番上
 */
function essenceTierSpan(data: PatchData, item: StageItem, mod: { family: string; type: string }, range: readonly number[] | undefined): string | null {
  if (!range || range.length < 2) return null;
  const lo = Math.min(range[0]!, range[1]!), hi = Math.max(range[0]!, range[1]!);
  const pool = item.cls.pools.normal;
  const ids = mod.type === "prefix" ? pool.prefixes : pool.suffixes;
  for (const id of ids) {
    const m = data.mods.get(id);
    if (!m || m.family !== mod.family || !m.tiers.length) continue;
    const n = m.tiers.length;
    const hit: number[] = [];
    m.tiers.forEach((t, i) => {
      const r = t.ranges[0];
      if (!r || r.length < 2) return;
      const a = Math.min(r[0]!, r[1]!), b = Math.max(r[0]!, r[1]!);
      if (a <= hi && lo <= b) hit.push(n - i);
    });
    if (!hit.length) {
      const top = m.tiers[n - 1]!.ranges[0];
      return top && lo > Math.max(top[0]!, top[1]!) ? tr(`普通の MOD の T1 (全 ${n} 段) より上`, `Above normal T1 (of ${n} tiers)`) : null;
    }
    const best = Math.min(...hit), worst = Math.max(...hit);
    return tr(`普通の MOD の ${best === worst ? `T${best}` : `T${worst}〜T${best}`} 相当 (全 ${n} 段)`, `≈ normal ${best === worst ? `T${best}` : `T${worst}-T${best}`} (of ${n} tiers)`);
  }
  return null;
}

export function stageAdds(key: string, data: PatchData | null, item: StageItem | null): { head: string; lines: string[]; tier?: string | null } | null {
  if (!item) return null;
  // 液化した感情: このジュエルに付く MOD (2 つの版がある物は側ごと)
  if (isEmotion(key) && data) {
    const es = jewelEmotionsOf(item.cls.id).filter((e) => e.item === emotionNameOf(key));
    const lines = es.flatMap((e) => {
      const m = data.mods.get(e.modId);
      if (!m) return [];
      const t = m.tiers[0];
      const text = (isEn() ? m.text : fillModText(m, t ? tierDisplayRanges(t) : [])) ?? "";
      const side = e.side === "prefix" ? tr("プレ", "Prefix") : tr("サフィ", "Suffix");
      return [`${es.length > 1 ? `${side}${tr("が消えた時", " removed")}: ` : ""}${text.replace(/\n/g, " / ")}`];
    });
    if (!lines.length) return null;
    return { head: es.length > 1 ? tr("付く MOD (消えた MOD の側の版)", "Adds (version for the removed mod's side)") : tr(`付く MOD (${es[0]!.side === "prefix" ? "プレフィックス" : "サフィックス"})`, `Adds (${es[0]!.side === "prefix" ? "Prefix" : "Suffix"})`), lines };
  }
  if (isRune(key)) {
    const eff = runeEffectFor(runeOf(key)!, item.cls.category);
    return eff ? { head: tr(`付く MOD (${eff.catJa})`, `Adds (${eff.cat})`), lines: (isEn() ? eff.en : eff.ja).split("\n").map((x) => x.trim()).filter(Boolean) } : null;
  }
  if (key.startsWith("essence:") && data) {
    const t = essenceTarget(data, item, key);
    if (!t || t.mod.family === "EssenceAbyss") return null;
    const tier = t.level === "perfect" ? t.mod.tiers[0] : t.mod.tiers.find((x) => essenceLevelOf(String(x.name ?? "")) === t.level) ?? t.mod.tiers[0];
    let text = fillModText(t.mod, tier ? tierDisplayRanges(tier) : []);
    // 値の幅が無い固定の MOD (ブリーチの「+20% to Maximum Quality」等) は # が残るので、英語の文の数字で埋める
    if (text.includes("#")) {
      const nums = [...(t.mod.text ?? "").matchAll(/\d+(?:\.\d+)?/g)].map((x) => x[0]);
      text = text.replace(/#/g, () => nums.shift() ?? "#");
    }
    return { head: tr(`付く MOD (${t.side === "prefix" ? "プレフィックス" : "サフィックス"})`, `Adds (${t.side === "prefix" ? "Prefix" : "Suffix"})`), lines: text.split("\n").filter(Boolean), tier: tier ? essenceTierSpan(data, item, t.mod, tier.ranges[0]) : null };
  }
  return null;
}

/**
 * MOD の文を棚のボタン用に短く (数値・「増加する」等を外す)。「マナ自動回復レートが#%増加する」→「マナ自動回復」、「火耐性 #%」→「火耐性」、
 * 「#から#の火ダメージを追加する」→「追加火ダメージ」。2026-10-05 オーナー「金額の所、エッセンスは代わりに付く MOD を箇条書きで。マナ自動回復ならマナ自動とかで」
 */
export function shortMod(text: string): string {
  // 英語の文 (英語の画面): 数値・増加などを外して残りを短く (2026-10-10 英語版)
  if (!/[぀-ヿ一-鿿]/.test(text)) return text.split(/\s*\/\s*|\n/).map(shortModEn).filter(Boolean).join(" / ");
  return text.split(/\s*\/\s*|\n/).map((raw) => {
    let s = raw.replace(/\([^)]*\)/g, "#").replace(/\d+(\.\d+)?/g, "#").trim();
    let m: RegExpExecArray | null;
    if ((m = /^#から#の(.+)を追加する$/.exec(s))) return `追加${m[1]}`;
    if ((m = /^(.*?)ダメージの#%を追加(.+)として獲得する$/.exec(s))) return `${m[1] ? `${m[1].replace(/の$/, "")}の` : ""}${m[2]}獲得`;
    if ((m = /^受けた(.*)ダメージの#%をライフとして回収する$/.exec(s))) return `${m[1] || ""}被ダメ回収`;
    if ((m = /^#から#の(.+)$/.exec(s))) return m[1]!;
    s = s.replace(/^プレイヤーに対する(ヒットは)?/, "").replace(/の#%?を/g, "を").replace(/(が|を)?#?%?(増加|減少|上昇)する$/, "").replace(/#%?(の|個の)?/g, "").replace(/[#%+]/g, "").replace(/レート$/, "").replace(/\s+/g, "").trim();
    return s;
  }).filter(Boolean).join(" / ");
}
/** 英語の MOD の 1 行を短く (「Adds # to # Fire Damage」→「Added Fire Damage」、「#% increased Mana Regeneration Rate」→「Mana Regeneration Rate」) */
function shortModEn(raw: string): string {
  const s = raw.replace(/\([^)]*\)/g, "#").replace(/[+-]?\d+(\.\d+)?/g, "#").replace(/\s+/g, " ").trim();
  let m: RegExpExecArray | null;
  if ((m = /^Adds # to # (.+?)( to Attacks| to Spells)?$/i.exec(s))) return `Added ${m[1]}`;
  if ((m = /^Gain #%? of (.+?) as Extra (.+)$/i.exec(s))) return `Extra ${m[2]}`;
  return s
    .replace(/^[#%+]+ ?/, "")
    .replace(/^(increased|reduced|more|less|to|of) /i, "")
    .replace(/ (increased|reduced)$/i, "")
    .replace(/#%?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 特殊なエッセンス (レアだけ・MOD を 1 つ消して付ける物) の説明 (2026-10-05 オーナー「錯乱ちょっと違うかもな、ランダムなノータブルパッシブ付くし
 * 鎧だけやな。説明しっかり作ろか、細かい所」)。部位は同梱の MOD の表 (perfect_essence) で確かめた。
 * short = 棚の短い名前、groups = カードの「使える装備と付く MOD」(クライアントの文が壊れている・無い物だけ差し替え)、notes = 動きの先頭に足す
 */
const SPECIAL_ESSENCE: Record<string, { short?: string; groups?: Array<{ h: string; l: string[] }>; notes: string[] }> = {
  "Essence of Delirium": {
    short: "ランダムノータブル",
    // クライアントの文は「0 を割り当てる」(ノード名の差し込みが空) なので書き直す
    groups: [{ h: "鎧 (胴の防具) だけ", l: ["ランダムなノータブルパッシブスキルを割り当てる (プレフィックス)"] }],
    notes: [
      "**レアの胴の防具 (鎧) だけ**。他の部位には使えない",
      "付くのは「ランダムなノータブルパッシブスキルを割り当てる」。どのノータブルかはパッシブツリーのノータブルからランダムで、**選べない** (重みは公開値なし)。ゲームでは付いた後「○○を割り当てる」とノード名が出る",
      "数値の無い MOD なので神のオーブで変わらない",
    ],
  },
  "Essence of Horror": {
    short: "オーグメント効果",
    notes: [
      "**レアの手袋・靴だけ**",
      "サフィックスに「ソケットされているオーグメントの効果が 60% 増加する」(固定値)。はめたルーン・ソウルコア等の効き目が 1.6 倍になるので、ソケットの多い物ほど得",
    ],
  },
  "Essence of Hysteria": {
    notes: ["**レアだけ**。部位ごとに付く MOD が違う (下の「使える装備と付く MOD」)。武器には使えない"],
  },
  "Essence of Insanity": {
    short: "コラプトでエンチャ2",
    notes: [
      "**レアのベルトだけ**",
      "サフィックスに「コラプト時に、アイテムは 2 個のエンチャントを獲得する」。ヴァールのオーブでエンチャントが付く結果になった時、1 個ではなく 2 個付く",
    ],
  },
  "Essence of the Breach": {
    notes: ["**レアの指輪・アミュレットだけ**", "プレフィックスに「品質の最大値 +20%」。カタリストで品質を 40% まで盛れる (触媒の MOD がその分強くなる)"],
  },
  "Essence of the Abyss": {
    short: "深淵の王の印",
    groups: [{ h: "防具・装飾品・ベルト など", l: ["アビサルロードの紋章 (深淵の王の印)。次の骨で冒涜 MOD に置き換わる"] }],
    notes: [],
  },
};
/** SPECIAL_ESSENCE の英語 (英語の画面) */
const SPECIAL_ESSENCE_EN: Record<string, { short?: string; groups?: Array<{ h: string; l: string[] }>; notes: string[] }> = {
  "Essence of Delirium": {
    short: "Random Notable",
    groups: [{ h: "Body Armour only", l: ["Allocates a random Notable Passive Skill (prefix)"] }],
    notes: [
      "**Rare Body Armour only**. Can't be used on other slots",
      "Adds \"Allocates a random Notable Passive Skill\". Which Notable is random from the passive tree and **can't be chosen** (no public weights). In game the node name shows after it's added",
      "Has no values, so Divine Orbs don't change it",
    ],
  },
  "Essence of Horror": {
    short: "Augment effect",
    notes: [
      "**Rare Gloves and Boots only**",
      "Suffix \"60% increased effect of Socketed Augment Items\" (fixed). Socketed runes / Soul Cores become 1.6x as strong, so more sockets = more value",
    ],
  },
  "Essence of Hysteria": {
    notes: ["**Rares only**. The added mod depends on the slot (see \"Usable items and added mods\" below). Can't be used on weapons"],
  },
  "Essence of Insanity": {
    short: "2 enchants on corrupt",
    notes: [
      "**Rare Belts only**",
      "Suffix \"On Corruption, Item gains two Enchantments\". When a Vaal Orb adds an enchantment, it adds 2 instead of 1",
    ],
  },
  "Essence of the Breach": {
    notes: ["**Rare Rings and Amulets only**", "Prefix \"+20% to Maximum Quality\". Catalysts can then push quality to 40% (catalyst mods get stronger accordingly)"],
  },
  "Essence of the Abyss": {
    short: "Mark of the Abyssal Lord",
    groups: [{ h: "Armour, jewellery, belts etc.", l: ["Mark of the Abyssal Lord. Replaced by a Desecrated mod with the next Abyssal Bone"] }],
    notes: [],
  },
};
export function specialEssence(key: string, item: StageItem | null) {
  if (!key.startsWith("essence:")) return null;
  const en = enOf(key, item);
  return (isEn() ? SPECIAL_ESSENCE_EN[en] : null) ?? SPECIAL_ESSENCE[en] ?? null;
}

/** 棚のボタンの値段の代わりに出す、付く MOD の短い名前 (エッセンス・カタリスト)。無い物は null (値段のまま) */
export function shelfTag(key: string, data: PatchData | null, item: StageItem | null): string[] | null {
  const sp = specialEssence(key, item);
  if (sp?.short) return [sp.short];
  if (key.startsWith("essence:")) {
    const a = stageAdds(key, data, item);
    return a ? a.lines.map(shortMod) : null;
  }
  if (key.startsWith("catalyst_")) {
    const en = enOf(key, item);
    const c = HTC_CATALYSTS.find((x) => x.en === en);
    if (c && isEn()) { const e = /\((.+?)( Modifiers)?\)/.exec(c.label.en); return e ? [e[1]!] : null; }
    const m = c ? /\((.+?)(モッド)?\)/.exec(c.label.ja) : null;
    return m ? [`${m[1]}系`] : null;
  }
  return null;
}
