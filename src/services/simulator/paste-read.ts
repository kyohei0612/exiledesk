/**
 * paste-read.ts — 取引所・poe.ninja のアイテムの貼り付けを読んで、シミュレーター ① のベースと ② の狙いを一度に決める (2026-10-20 オーナー)。
 * 入口は ① のベースを選ぶページの「貼り付け」のタイル (SimPasteRead.vue)。前の ② の「貼り付けで写す ▾」(paste-target.ts) はここに一本化した。
 *
 * 【仮】読み取りはジン部長がエンジンの入口に作っている (paste-parse のセッション、型は docs/org/emulator/notes/engine-entry.md)。
 * 来るまでは計算機の貼り付け (htc/paste の parseJaItem → targetsFor) を読み、画面の形 PasteRead に写す。入口の物が来たら readPaste の中身だけ差し替える。
 * 未発現・二重コラプト・「コラプト」の行は今の読みに無いので、ここで当たらなかった行から拾っている (【仮】入口に入ったら消す)。
 */
import { parseJaItem, targetsFor } from "../htc/paste";
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import type { SimTargets } from "../../state/simulator/sim-state";

/** 読んだ MOD の 1 行 */
export interface PasteMod {
  text: string;
  modId: string;
  /** 狙いの段 (この段以上が当たり)。tiers の並び (0 = 一番下) */
  tierIndex: number;
  /** T1 = 一番上 */
  tierRank: number;
  side: "prefix" | "suffix";
  fractured: boolean;
  desecrated: boolean;
  /** 値がどの段にも入らず、段を推し量った */
  guessed: boolean;
}
/** 読めなかった行と理由 (日本語・英語) */
export interface PasteSkip { text: string; ja: string; en: string }
export interface PasteRead {
  /** ベース (英語)。読めなければ null */
  base: string | null;
  baseText: string | null;
  itemLevel: number | null;
  quality: number | null;
  implicits: string[];
  mods: PasteMod[];
  unrevealed: { prefix: number; suffix: number };
  /** 0 = コラプトしていない、1 = コラプト、2 = 二重コラプト */
  corrupted: 0 | 1 | 2;
  skipped: PasteSkip[];
  /** ② の狙い (mods から) */
  targets: SimTargets;
}

/** MOD でない行 (名前・種類・要求・武器と防具の数値・値段・ソケットの W/P)。読めなかった行には出さない */
const NOISE = /[:：]|^~(b\/o|price)\b|^[A-Z]$/;

export function readPaste(data: PatchData, text: string): PasteRead {
  const item = parseJaItem(text);
  const out: PasteRead = {
    base: item.baseType, baseText: item.baseText, itemLevel: item.itemLevel, quality: item.quality,
    implicits: [], mods: [], unrevealed: { prefix: 0, suffix: 0 }, corrupted: item.corrupted ? 1 : 0, skipped: [], targets: [],
  };
  // 【仮】当たらなかった行から未発現・コラプトを拾い、残りの MOD らしい行を「読めない」に
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
  const head = new Set(lines.slice(0, 1));
  for (const raw of item.unmatched) {
    if (/^(未発現サフィックス|Unrevealed Suffix)$/i.test(raw)) { out.unrevealed.suffix++; continue; }
    if (/^(未発現プレフィックス|Unrevealed Prefix)$/i.test(raw)) { out.unrevealed.prefix++; continue; }
    if (/^(二重コラプト|Twice Corrupted)$/i.test(raw)) { out.corrupted = 2; continue; }
    if (raw === "コラプト") { out.corrupted = Math.max(out.corrupted, 1) as 1 | 2; continue; }
    if (head.has(raw) || NOISE.test(raw) || raw === item.baseText || /^-{3,}$/.test(raw)) continue;
    // ベースの次の行は種類の名前 (指輪・Ring)。MOD の文はたいてい数字を含む
    if (!/[0-9]/.test(raw) && raw.length <= 12) continue;
    out.skipped.push({ text: raw, ja: "MOD の文に当たらない", en: "Matches no mod text" });
  }
  if (!item.baseType) return out;
  const got = targetsFor(data, item);
  out.implicits = got.implicits;
  const kindOf = new Map(item.lines.map((l) => [l.text, l.kind]));
  const fracSet = new Set(got.fracturedTargets.map((t) => t.modId));
  got.targets.forEach((t, i) => {
    const m = data.mods.get(t.modId);
    // 複合 MOD など同じ MOD が 2 行で来た時は 1 つにまとめる
    if (!m || out.mods.some((x) => x.modId === t.modId)) return;
    const idx = t.minTierIndex ?? 0;
    const text = got.texts[i] ?? "";
    out.mods.push({
      text, modId: t.modId, tierIndex: idx, tierRank: m.tiers.length - idx, side: m.type,
      fractured: fracSet.has(t.modId), desecrated: m.source === "desecrated" || kindOf.get(text) === "desecrated", guessed: got.fits?.[i] === false,
    });
  });
  const drop = new Map(got.dropOnly.map((d) => [d.text, d]));
  for (const line of got.skipped) {
    const d = drop.get(line);
    out.skipped.push(d
      ? { text: line, ja: `${d.tagJa} のドロップ限定 (クラフトでは付かない)`, en: `Drops only from ${d.tag} (cannot be crafted)` }
      : { text: line, ja: "このベースに付く MOD に無い", en: "Not in this base's mod pool" });
  }
  out.targets = out.mods.map((x) => ({
    modId: x.modId, minTierIndex: x.tierIndex,
    ...(x.fractured ? { method: "fracture" as const } : x.desecrated ? { method: "desecrate" as const } : {}),
  }));
  return out;
}
