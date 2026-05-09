#!/usr/bin/env node
/**
 * 画像3 のエッセンス プレフィックス＆サフィックスにある項目が、
 * 修正後 bundle にどれだけ含まれているかを狙い撃ちで突合する。
 *
 * 画像3 表示:
 *   プレフィックス Total 54 件
 *     - 最大ライフ #
 *     - 最大マナ #
 *     - アビサルロードの紋章
 *
 *   サフィックス Total 60 件
 *     - 混沌耐性 #
 *     - 筋力、器用さまたは知性 # × 3 tier
 *     - マナ自動回復レートが (50-59)% 増加
 *     - アビサルロードの紋章
 *     - 火耐性 # / 冷気耐性 # / 雷耐性 #
 *     - 見つかるアイテムのレアリティが #% 増加
 */

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const BUNDLE = JSON.parse(await readFile(resolve(ROOT, "src/i18n/mods-bundle.json"), "utf-8"));

function findInBundle(predicate) {
  const hits = [];
  for (const [k, m] of Object.entries(BUNDLE)) {
    if (predicate(k, m)) hits.push({ key: k, ...m });
  }
  return hits;
}

function summary(label, hits, opts = {}) {
  const showAll = opts.showAll ?? false;
  console.log(`\n=== ${label}  total=${hits.length} ===`);
  const maxShow = showAll ? hits.length : Math.min(hits.length, 8);
  for (const h of hits.slice(0, maxShow)) {
    const kind = h.essence ? "essence" : h.corrupt ? "corrupt" : h.desecrated ? "desecr" : "normal";
    console.log(`  [${h.type}/${kind}] ${h.key}`);
    console.log(`     "${(h.text_ja ?? "").slice(0, 80)}"`);
  }
  if (hits.length > maxShow) console.log(`  ... +${hits.length - maxShow} more`);
}

console.log("##### 画像3 エッセンス プレフィックス #####");

summary(
  "最大ライフ # (含む全 prefix)",
  findInBundle((k, m) => m.type === "prefix" && /最大ライフ/.test(m.text_ja ?? "")),
);

summary(
  "最大マナ # (含む全 prefix)",
  findInBundle((k, m) => m.type === "prefix" && /最大マナ/.test(m.text_ja ?? "")),
);

summary(
  "アビサルロードの紋章 (Mark of Abyssal Lord) prefix",
  findInBundle((k, m) => m.type === "prefix" && /アビサルロード|MarkofAbyssalLord/.test(m.text_ja ?? "")),
);

console.log("\n\n##### 画像3 エッセンス サフィックス #####");

summary(
  "混沌耐性 # (suffix)",
  findInBundle((k, m) => m.type === "suffix" && /混沌耐性/.test(m.text_ja ?? "") && !/および|と/.test(m.text_ja ?? "")),
);

summary(
  "筋力、器用さまたは知性 (tri-attribute)",
  findInBundle((k, m) => /(または|or)/.test(m.text_ja ?? "") && /筋力|Strength/.test(m.text_ja ?? "") && /器用|Dexterity/.test(m.text_ja ?? "") && /知性|Intelligence/.test(m.text_ja ?? "")),
  { showAll: true },
);

summary(
  "マナ自動回復レート（全 mod、tier 範囲確認用）",
  findInBundle((k, m) => /マナ自動回復/.test(m.text_ja ?? "")),
  { showAll: true },
);

summary(
  "アビサルロードの紋章 (suffix)",
  findInBundle((k, m) => m.type === "suffix" && /アビサルロード|MarkofAbyssalLord/.test(m.text_ja ?? "")),
);

summary(
  "火耐性 # 単独 (suffix)",
  findInBundle((k, m) => m.type === "suffix" && /火.*耐性|耐性.*火/.test(m.text_ja ?? "") && !/および|と|Cold|Lightning|混沌|冷気|雷/.test(m.text_ja ?? "")),
);

summary(
  "冷気耐性 # 単独",
  findInBundle((k, m) => m.type === "suffix" && /冷気.*耐性|耐性.*冷気/.test(m.text_ja ?? "") && !/および|と|混沌|火|雷/.test(m.text_ja ?? "")),
);

summary(
  "雷耐性 # 単独",
  findInBundle((k, m) => m.type === "suffix" && /雷.*耐性|耐性.*雷/.test(m.text_ja ?? "") && !/および|と|混沌|火|冷気/.test(m.text_ja ?? "")),
);

summary(
  "見つかるアイテムのレアリティ # (suffix)",
  findInBundle((k, m) => m.type === "suffix" && /見つかるアイテムのレアリティ/.test(m.text_ja ?? "")),
);

summary(
  "アーマー、回避力またはエナジーシールドのいずれか (tri-defence)",
  findInBundle((k, m) => /または|or/.test(m.text_ja ?? "") && /アーマー|Armour/.test(m.text_ja ?? "") && /回避|Evasion/.test(m.text_ja ?? "") && /エナジーシールド|Energy Shield/.test(m.text_ja ?? "")),
  { showAll: true },
);

console.log("\n\n##### 画像3 件数 vs bundle essence kind 突合 =====");
const essenceCount = Object.values(BUNDLE).filter((m) => m.essence).length;
const desecratedCount = Object.values(BUNDLE).filter((m) => m.desecrated).length;
const normalPrefixCount = Object.values(BUNDLE).filter((m) => m.type === "prefix" && !m.essence && !m.corrupt && !m.desecrated).length;
const normalSuffixCount = Object.values(BUNDLE).filter((m) => m.type === "suffix" && !m.essence && !m.corrupt && !m.desecrated).length;
console.log(`bundle essence kind:    ${essenceCount}`);
console.log(`bundle desecrated kind: ${desecratedCount}`);
console.log(`bundle normal prefix:   ${normalPrefixCount}`);
console.log(`bundle normal suffix:   ${normalSuffixCount}`);
console.log(`\n画像3: essence prefix Total 54 / suffix Total 60`);
console.log(`画像2: 冒涜モッド suffix Total 65`);
console.log(`画像1: 基礎サフィックス Total 82`);
console.log(`\n注: 画像の Total はおそらく "それぞれのカテゴリでアミュレットなど特定スロットに乗りうる mod の総数"`);
console.log(`    なので bundle の essence kind 件数とは直接対応しない可能性が高い`);
