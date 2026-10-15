/**
 * 指名で MOD を付ける手 (手で打つ画面の「このベースに付く MOD」の「付ける」。2026-10-08 オーナー「クラフト途中でも MOD 付けれるようにして、
 * ただ基本的な事は抑えて: サフィ満杯の時にはサフィに付けれない」「エッセンスとか全 MOD がそのまま MOD 選択で付けれるか確認して」)。
 *
 * 鍵: `force:<modId>|<段 (T2 など、空なら一番上)>|<種類>`。種類は n = 普通 / e = エッセンス (クラフト MOD) / d = 冒涜 / f = フラクチャー。
 * 1 手として log に入り (1 手戻す・再生・手順 JSON の currency にそのまま入る)、費用は 0。
 *
 * 手で付けるのはゆるく (2026-10-11 オーナー「付けれないけど付けた時の挙動に、レアでしか使えないならレアにして付ける、シミュレーターだから親切に、ただルールは順守」)。
 * 付けられない時は、決まりを守ったまま付けられる形に寄せてから付ける: レアにする・冒涜 / エッセンスは入れ替える・同じ系統の MOD は外す (固定した物は外さない)。
 * 外した物は removed に入る (カードの打ち消し線・1 手戻すで戻る)。側の枠が埋まっている時だけは、どれを外すか決められないので止める
 *
 * 守る決まり (ゲームと同じ):
 *   - ノーマルに付けたらマジック。マジックはプレ 1・サフィ 1 (3 つ目は王者でレアにしてから)。レアは側ごとの枠 (ベースの limits)
 *   - 同じ系統の MOD が付いていれば付かない
 *   - 冒涜の MOD はアイテムに 1 つまで、フラクチャーは 1 つまで。どちらもレアにだけ。冒涜で付くのは骨の発現に出る物 (冒涜・異界・普通の MOD)
 *   - エッセンス (クラフト MOD) は 1 つまで (アストリッドの創造性で 2 つ)、同じ系統との重なりはエッセンスの決まり
 *   - ルーンの MOD (特殊 MOD のルーン) はそのルーンを差していないと付かない
 *   - 段のアイテムレベルがアイテムレベルを超える物は付かない (エッセンスは制限なし)
 */
import { applyRune, runeKeyForId } from "./stage-runes";
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import { essenceClash, familyBlocked, occupiedKeysOf } from "../mods/mod-rules";
import { craftedLimitOf, normalTierOf } from "./apply-essence";
import { allMods, effectiveCls, makeStageMod, room, skip, stageRuneIds, takenFamilies, takenCraftedFamilies, unfracturable, withMod } from "./stage-core";
import type { StageApply, StageItem, StageMod, StageSide } from "./types";
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
  // ノーマルに付けたらマジック。エッセンス・冒涜・フラクチャーはレアにだけなので、レアにしてから付ける (パーフェクトエッセンスも)
  const needsRare = p.flag === "e" || p.flag === "d" || p.flag === "f";
  let it: StageItem = needsRare ? (item.rarity === "rare" ? item : { ...item, rarity: "rare" }) : item.rarity === "normal" ? { ...item, rarity: "magic" } : item;
  // マジックで同じ側が埋まっていたら、王者を打った事にしてレアに (1 つずつ止まらない。2026-10-08 オーナー)
  if (it.rarity === "magic" && p.flag === "n" && !room(it, side)) it = { ...it, rarity: "rare" };
  /** 付けるために外した物 (固定した物は外さない) */
  const removed: StageMod[] = [];
  const drop = (m: StageMod): void => {
    const f = (ms: StageItem["prefixes"]): StageItem["prefixes"] => ms.filter((x) => x !== m);
    it = { ...it, prefixes: f(it.prefixes), suffixes: f(it.suffixes) };
    removed.push(m);
  };
  // 冒涜で付けられるのは骨の発現に出る物だけ: 冒涜の MOD・異界・普通の MOD (ルーンの特殊 MOD 込み)。始めの状態 (run-plan の startFrom) と同じ置き場
  // (2026-10-15 オーナー「MOD 一覧の付けるで 普通 / フラクチャー / 冒涜 を選べるように、途中でも冒涜で付けられるように」。10-08 の「冒涜の MOD だけ」は置き換え)
  if (p.flag === "d" && mod.source !== "desecrated" && ![...(it.cls.pools.otherworldly?.prefixes ?? []), ...(it.cls.pools.otherworldly?.suffixes ?? []), ...effectiveCls(it).pools.normal[side === "prefix" ? "prefixes" : "suffixes"]].includes(p.modId)) return skip(item, tr("冒涜では付かない MOD", "This mod can't be added by Desecration"));
  // フラクチャー: 同じ MOD が付いていればそれを固定する (付け直さない)
  if (p.flag === "f") {
    if (allMods(it).some((m) => m.fractured)) return skip(item, tr("フラクチャーは 1 つまで", "Only 1 Fractured mod"));
    const have = allMods(it).find((m) => m.modId === p.modId);
    if (have) {
      // エッセンスの MOD は固定できる。冒涜の MOD は発現済みでも未発現でも固定されない (オーブと同じ unfracturable。2026-10-10 ゲームで実測)
      if (unfracturable(data, it, have)) return skip(item, tr("冒涜の MOD はフラクチャーできない", "Desecrated mods can't be Fractured"));
      const fixed = { ...have, fractured: true };
      const swap = (ms: StageItem["prefixes"]): StageItem["prefixes"] => ms.map((m) => (m === have ? fixed : m));
      return { applied: true, item: { ...it, prefixes: swap(it.prefixes), suffixes: swap(it.suffixes) }, added: [fixed], removed: [] };
    }
  }
  // 冒涜は 1 つまで: 付いている冒涜 (未発現も) は入れ替える
  if (p.flag === "d") for (const m of allMods(it).filter((x) => x.desecrated)) drop(m);
  // 同じ系統の MOD は外して入れ替える (固定した物が塞いでいる時だけ止める)。理由は枠より先
  if (familyBlocked(mod, takenFamilies(data, it))) {
    const blockers = allMods(it).filter((m) => { const md = data.mods.get(m.modId); return !!md && familyBlocked(mod, new Set(occupiedKeysOf(md))); });
    if (blockers.some((m) => m.fractured)) return skip(item, tr("同じ系統の MOD が固定されている", "A fractured mod of the same group is on the item"));
    for (const m of blockers) drop(m);
  }
  if (p.flag === "f" && allMods(it).some((m) => m.fractured)) return skip(item, tr("フラクチャーは 1 つまで", "Only 1 Fractured mod"));
  // 固定で付けるエッセンスの MOD は、その印も付ける (上限まで。2026-10-10 要望「創生の樹もフラクチャーできるように」。冒涜は固定できない)
  const otherworldly = [...(it.cls.pools.otherworldly?.prefixes ?? []), ...(it.cls.pools.otherworldly?.suffixes ?? [])].includes(p.modId);
  // 冒涜でしか付かない MOD (冒涜専用・異界) をフラクチャーで付ける事はできない (冒涜専用の MOD は固定されない。2026-10-10)
  if (p.flag === "f" && (mod.source === "desecrated" || (otherworldly && !(it.cls.pools.normal[side === "prefix" ? "prefixes" : "suffixes"] ?? []).includes(p.modId)))) return skip(item, tr("冒涜の MOD はフラクチャーできない", "Desecrated mods can't be Fractured"));
  const asDesecrated = p.flag === "d";
  const asCrafted = p.flag === "e" || (p.flag === "f" && (mod.source === "essence" || mod.source === "perfect_essence"));
  if (asCrafted) {
    // エッセンスの MOD どうしで系統が重なる物、上限 (1 つ、アストリッドの創造性で 2 つ) を超える分は入れ替える (固定した物は外さない)
    for (const m of allMods(it).filter((x) => x.crafted && !x.fractured)) { const md = data.mods.get(m.modId); if (md && essenceClash(mod, new Set([md.family, ...(md.families ?? [])]))) drop(m); }
    if (essenceClash(mod, takenCraftedFamilies(data, it))) return skip(item, tr("エッセンスの MOD どうしで系統が重なる (固定されている)", "A fractured Essence mod shares the same group"));
    const limit = craftedLimitOf(it);
    const crafted = allMods(it).filter((m) => m.crafted);
    if (crafted.length >= limit) {
      const swap = crafted.find((m) => !m.fractured && m.side === side) ?? crafted.find((m) => !m.fractured);
      if (!swap) return skip(item, tr("エッセンスの MOD が固定されていて入れ替えられない", "The Essence mod is fractured and can't be replaced"));
      drop(swap);
    }
  }
  if (!room(it, side)) return skip(item, it.rarity === "magic"
    ? tr(`マジックは${SIDE_JA[side]} 1 つまで (同じ側の 2 つ目は王者でレアにしてから)`, `Magic: 1 ${side} max (Regal it to Rare for a second)`)
    : tr(`${SIDE_JA[side]}の枠が埋まっている`, `${side === "prefix" ? "Prefixes" : "Suffixes"} are full`));
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
  // 冒涜専用の MOD はアイテムレベルを見ない (2026-10-10 確定。骨で出る普通の MOD はアイテムレベルの決まりのまま)
  if (!asCrafted && !(asDesecrated && mod.source === "desecrated") && tier.ilvl > it.itemLevel) return skip(item, tr(`${p.rank ?? "T1"} はアイテムレベル ${tier.ilvl} から (今は ${it.itemLevel})`, `${p.rank ?? "T1"} needs Item Level ${tier.ilvl} (now ${it.itemLevel})`));
  const sm = {
    ...makeStageMod(mod, side, tierIndex, rng),
    ...(asCrafted ? { ...normalTierOf(data, it, mod, tier), crafted: true } : {}),
    ...(asDesecrated ? { desecrated: true } : {}),
    ...(p.flag === "f" ? { fractured: true } : {}),
  };
  return { applied: true, item: withMod(it, sm), added: [sm], removed, ...(socketed ? { augment: socketed } : {}) };
}
