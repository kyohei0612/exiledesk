/**
 * 指名で MOD を付ける手 (手で打つ画面の「このベースに付く MOD」の「付ける」。2026-10-08 オーナー「クラフト途中でも MOD 付けれるようにして、
 * ただ基本的な事は抑えて: サフィ満杯の時にはサフィに付けれない」「エッセンスとか全 MOD がそのまま MOD 選択で付けれるか確認して」)。
 *
 * 鍵: `force:<modId>|<段 (T2 など、空なら一番上)>|<種類>`。種類は n = 普通 / e = エッセンス (クラフト MOD) / d = 冒涜 / f = フラクチャー。
 * 1 手として log に入り (1 手戻す・再生・手順 JSON の currency にそのまま入る)、費用は 0。
 *
 * 守る決まり (ゲームと同じ):
 *   - ノーマルに付けたらマジック。マジックはプレ 1・サフィ 1 (3 つ目は王者でレアにしてから)。レアは側ごとの枠 (ベースの limits)
 *   - 同じ系統の MOD が付いていれば付かない
 *   - 冒涜の MOD はアイテムに 1 つまで、フラクチャーは 1 つまで。どちらもレアにだけ
 *   - エッセンス (クラフト MOD) は 1 つまで (アストリッドの創造性で 2 つ)、同じ系統との重なりはエッセンスの決まり
 *   - ルーンの MOD (特殊 MOD のルーン) はそのルーンを差していないと付かない
 *   - 段のアイテムレベルがアイテムレベルを超える物は付かない (エッセンスは制限なし)
 */
import { applyRune, runeKeyForId } from "./stage-runes";
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { essenceClash, familyBlocked } from "../mods/mod-rules";
import { craftedLimitOf, normalTierOf } from "./apply-essence";
import { allMods, makeStageMod, room, skip, stageRuneIds, takenFamilies, takenCraftedFamilies, withMod } from "./stage-core";
import type { StageApply, StageItem, StageSide } from "./types";
import { tr } from "../../i18n/lang";

export type ForceFlag = "n" | "e" | "d" | "f" | "x";
export const isForce = (key: string): boolean => key.startsWith("force:");
export const forceKey = (modId: string, rank: string | null, flag: ForceFlag): string => `force:${modId}|${rank ?? ""}|${flag}`;
export function parseForce(key: string): { modId: string; rank: string | null; flag: ForceFlag } | null {
  if (!isForce(key)) return null;
  const [modId, rank, flag] = key.slice("force:".length).split("|");
  if (!modId) return null;
  const f = (["n", "e", "d", "f", "x"] as const).find((x) => x === flag) ?? "n";
  return { modId, rank: rank || null, flag: f };
}
const SIDE_JA: Record<StageSide, string> = { prefix: "プレフィックス", suffix: "サフィックス" };

export function applyForce(data: PatchData, item: StageItem, key: string, rng: () => number): StageApply {
  const p = parseForce(key);
  if (!p) return skip(item, tr("指名の形が違う", "Invalid forced mod"));
  const mod = data.mods.get(p.modId);
  if (!mod) return skip(item, tr(`${p.modId} という MOD が無い`, `No mod named ${p.modId}`));
  const side: StageSide = mod.type === "suffix" ? "suffix" : "prefix";
  // x: アイテムのカードの × で外す (費用 0、1 手戻すで戻る。2026-10-08 オーナー「アイテムの所で × あったら消せるように」)
  if (p.flag === "x") {
    const have = allMods(item).find((m) => m.modId === p.modId);
    if (!have) return skip(item, tr("その MOD は付いていない", "That mod isn't on the item"));
    const drop = (ms: StageItem["prefixes"]): StageItem["prefixes"] => ms.filter((m) => m !== have);
    return { applied: true, item: { ...item, prefixes: drop(item.prefixes), suffixes: drop(item.suffixes) }, added: [], removed: [have] };
  }
  // ユニークには足せない (2026-10-08 使い倒しテスト)
  if (item.rarity === "unique") return skip(item, tr("ユニークには MOD を足せない", "Can't add mods to a Unique"));
  // ノーマルに付けたらマジック。エッセンスの MOD は必ずレア (普通のエッセンス = ノーマル / マジック → レア、パーフェクト = レアだけ)
  const perfect = mod.source === "perfect_essence";
  if (p.flag === "e" && perfect && item.rarity !== "rare") return skip(item, tr("パーフェクトエッセンスはレアにだけ (先に王者か錬金でレアに)", "Perfect Essences: Rares only (Regal or Alchemy first)"));
  let it: StageItem = p.flag === "e" ? (item.rarity === "rare" ? item : { ...item, rarity: "rare" }) : item.rarity === "normal" ? { ...item, rarity: "magic" } : item;
  // マジックで同じ側が埋まっていたら、王者を打った事にしてレアに (1 つずつ止まらない。2026-10-08 オーナー)
  if (it.rarity === "magic" && p.flag === "n" && !room(it, side)) it = { ...it, rarity: "rare" };
  if ((p.flag === "d" || p.flag === "f") && it.rarity !== "rare") return skip(item, tr(`${p.flag === "d" ? "冒涜" : "フラクチャー"}の MOD はレアにだけ (先に王者か錬金でレアに)`, `${p.flag === "d" ? "Desecrated" : "Fractured"} mods: Rares only (Regal or Alchemy first)`));
  // 冒涜で付けられるのは冒涜の MOD だけ (2026-10-08 オーナー「冒涜 MOD しか冒涜は付けれない」)
  if (p.flag === "d" && mod.source !== "desecrated" && ![...(it.cls.pools.otherworldly?.prefixes ?? []), ...(it.cls.pools.otherworldly?.suffixes ?? [])].includes(p.modId)) return skip(item, tr("冒涜で付くのは冒涜の MOD だけ", "Only Desecrated mods can be added by Desecration"));
  // フラクチャー: 同じ MOD が付いていればそれを固定する (付け直さない)
  if (p.flag === "f") {
    if (allMods(it).some((m) => m.fractured)) return skip(item, tr("フラクチャーは 1 つまで", "Only 1 Fractured mod"));
    const have = allMods(it).find((m) => m.modId === p.modId);
    if (have) {
      // エッセンス・発現済みの冒涜の MOD も固定できる (オーブと同じ。2026-10-10 オーナー確認)。未発現は固定されない
      if (have.unrevealed) return skip(item, tr("未発現の冒涜 MOD は固定できない", "Unrevealed Desecrated mods can't be Fractured"));
      const fixed = { ...have, fractured: true };
      const swap = (ms: StageItem["prefixes"]): StageItem["prefixes"] => ms.map((m) => (m === have ? fixed : m));
      return { applied: true, item: { ...it, prefixes: swap(it.prefixes), suffixes: swap(it.suffixes) }, added: [fixed], removed: [] };
    }
  }
  // 同じ系統が先 (枠より分かりやすい理由)
  if (familyBlocked(mod, takenFamilies(data, it))) return skip(item, tr("同じ系統の MOD が付いている", "A mod of the same group is already on the item"));
  if (!room(it, side)) return skip(item, it.rarity === "magic"
    ? tr(`マジックは${SIDE_JA[side]} 1 つまで (同じ側の 2 つ目は王者でレアにしてから)`, `Magic: 1 ${side} max (Regal it to Rare for a second)`)
    : tr(`${SIDE_JA[side]}の枠が埋まっている`, `${side === "prefix" ? "Prefixes" : "Suffixes"} are full`));
  if (p.flag === "d" && allMods(it).some((m) => m.desecrated)) return skip(item, tr("冒涜の MOD はアイテムに 1 つまで", "Only 1 Desecrated mod per item"));
  if (p.flag === "f" && allMods(it).some((m) => m.fractured)) return skip(item, tr("フラクチャーは 1 つまで", "Only 1 Fractured mod"));
  // 固定で付ける冒涜 / エッセンスの MOD は、その印も付ける (冒涜は 1 つまで・エッセンスは上限まで。2026-10-10 要望「創生の樹・冒涜もフラクチャーできるように」)
  const otherworldly = [...(it.cls.pools.otherworldly?.prefixes ?? []), ...(it.cls.pools.otherworldly?.suffixes ?? [])].includes(p.modId);
  const asDesecrated = p.flag === "d" || (p.flag === "f" && (mod.source === "desecrated" || (otherworldly && !(it.cls.pools.normal[side === "prefix" ? "prefixes" : "suffixes"] ?? []).includes(p.modId))));
  const asCrafted = p.flag === "e" || (p.flag === "f" && (mod.source === "essence" || mod.source === "perfect_essence"));
  if (p.flag === "f" && asDesecrated && allMods(it).some((m) => m.desecrated)) return skip(item, tr("冒涜の MOD はアイテムに 1 つまで", "Only 1 Desecrated mod per item"));
  if (asCrafted) {
    const limit = craftedLimitOf(it);
    if (allMods(it).filter((m) => m.crafted).length >= limit) return skip(item, limit > 1 ? tr("クラフト MOD はアストリッドの創造性込みで 2 つまで", "Max 2 crafted mods (with Astrid's Creativity)") : tr("エッセンスの MOD はアイテムに 1 つまで (アストリッドの創造性で 2 つ)", "Only 1 Essence mod per item (2 with Astrid's Creativity)"));
    if (essenceClash(mod, takenCraftedFamilies(data, it))) return skip(item, tr("エッセンスの MOD どうしで系統が重なる", "Essence mods share the same group"));
  }
  // 特殊 MOD のルーン: 差していなければ先に差す (2026-10-09 オーナー「手動で付けた場合はルーン勝手にはめておｋ、セットで」)
  let socketed: StageApply["augment"] | undefined;
  if (mod.rune && !stageRuneIds(it).includes(mod.rune)) {
    const key = runeKeyForId(mod.rune);
    const r = key ? applyRune(it, key, data) : null;
    if (!r?.applied) return skip(item, tr(`このルーンを差せない (${r?.reason ?? "ルーンが見つからない"})`, `Can't socket this rune (${r?.reason ?? "rune not found"})`));
    it = r.item;
    socketed = r.augment;
  }
  // 段 (T1 = 一番上)。指定が無ければ一番上
  const n = p.rank ? Number(/^T(\d+)$/i.exec(p.rank)?.[1]) : 1;
  const tierIndex = mod.tiers.length - n;
  const tier = mod.tiers[tierIndex];
  if (!tier) return skip(item, tr(`${p.rank ?? "T1"} という段が無い`, `No tier ${p.rank ?? "T1"}`));
  if (!asCrafted && tier.ilvl > it.itemLevel) return skip(item, tr(`${p.rank ?? "T1"} はアイテムレベル ${tier.ilvl} から (今は ${it.itemLevel})`, `${p.rank ?? "T1"} needs Item Level ${tier.ilvl} (now ${it.itemLevel})`));
  const sm = {
    ...makeStageMod(mod, side, tierIndex, rng),
    ...(asCrafted ? { ...normalTierOf(data, it, mod, tier), crafted: true } : {}),
    ...(asDesecrated ? { desecrated: true } : {}),
    ...(p.flag === "f" ? { fractured: true } : {}),
  };
  return { applied: true, item: withMod(it, sm), added: [sm], removed: [], ...(socketed ? { augment: socketed } : {}) };
}
