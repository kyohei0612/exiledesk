/** paste.ts から切り出し (2026-09-26): 読んだアイテムをソルバの目標に直す (targetsFor・段の割り出し・創生の樹の MOD) */
import { bridgeMods, sideLimits } from "./bridge";
import { balanceSides, hybridLineParts } from "./paste-sides";
import { matchKey } from "./bridge-index";
import { htcBaseInfo, htcDropOnly, htcModSides, type DropOnlyInfo, type DropOnlyTier } from "./patch";
import { boostedBy, rawValue } from "./quality";
import type { TierTarget } from "../../vendor/poe2htc/optimizer/optimize";
import type { Mod, PatchData } from "../../vendor/poe2htc/engine/types";
import { stripMarkers, type PastedItem, type PastedLine } from "./paste-parse";

/**
 * 創生の樹のタグ → 画面に出す名前。**DB の見出しに合わせています**
 * (「創生の樹 キャスター プレフィックス」など)。
 */
const TREE_JA: Readonly<Record<string, string>> = {
  genesis_tree_caster: "創生の樹 キャスター",
  genesis_tree_minion: "創生の樹 ミニオン",
  breach_desecration: "創生の樹 (異界の MOD)",
  tower_augment_breach: "創生の樹 (タワー)",
};

/**
 * 転がった値がその MOD のどのティアに収まるか。収まらなければ最上位。
 *
 * **底上げされた MOD は帯で見ます。**画面の値は `素 × (1 + 品質)` を**切り捨てた**物なので、
 * 素は `[表示 / (1+品質), (表示+1) / (1+品質))` のどこかです。表示 4・品質 41% なら
 * `[2.84, 3.55)` で、ティア `3-3` が入ります。
 *
 * **帯を「戻した値 〜 表示の値」にしてはいけません。**それだと底上げ前と後の両方のティアに
 * 掛かって、高いほうを拾います (2026-09-23 に実測: キャストスピード 23% が、素の 16-18 では
 * なく底上げ後の 22-24 に当たっていた)。
 */
/** 創生の樹の MOD 1 行 (買うしかない物) */
export interface DropOnlyRow {
  text: string;
  tag: string;
  tagJa: string;
  name: string;
  stats: string[];
  /** 乗っている段 (品質を外した後の値で決める)。段が引けなければ無し */
  tier?: { index: number; name: string; min: number; max: number; of: number };
  /** 品質を外した素の値 */
  raw?: number;
  /** 品質を外したか */
  deboosted?: boolean;
  /** 選べる段 (低い方から) */
  tiers?: DropOnlyTier[];
  /** どちら側の枠か (クライアント由来の表。引けなければ無し) */
  side?: "P" | "S";
}

/**
 * 創生の樹の MOD の段を、**品質を外した値**で決める。
 *
 * エンジンに無い MOD なので `tierIndexFor` は使えません。代わりにクライアントの段の表
 * (`htcDropOnly().tiers`) を直に引きます。割り戻し方はエンジン側と同じで、表示は
 * `floor(素 × (1+q))` なので素は `[表示/(1+q), (表示+1)/(1+q))` の帯。その帯が入る段を取ります。
 *
 * 実例: 死体の円環のマナコスト効率 29% / 品質 40% → 素 20.7 → Sagacious (19-22)、6 段中の 5 段目。
 * 品質を外さないと 29 は最上段 (23-26) すら超えてしまうので、外すのが正しいという裏取りにもなる。
 */
function treeTierOf(
  info: DropOnlyInfo,
  shown: number | undefined,
  item: PastedItem,
): Pick<DropOnlyRow, "tier" | "raw" | "deboosted" | "tiers"> {
  const tiers = info.tiers ?? [];
  if (shown == null || tiers.length === 0) return tiers.length ? { tiers } : {};
  const boost = !!(item.quality && item.catalystTag && (info.qualityTags ?? []).includes(item.catalystTag));
  const lo = boost ? rawValue(shown, item.quality!) : shown;
  const hi = boost ? rawValue(shown + 1, item.quality!) - 1e-9 : shown;
  // 帯と重なる段のうち一番高い物 (エンジン側の tierIndexFor と同じ選び方)
  let index = -1;
  for (let i = tiers.length - 1; i >= 0; i--) {
    const t = tiers[i]!;
    if (t.min <= hi && lo <= t.max) { index = i; break; }
  }
  if (index < 0) return { tiers, raw: lo, deboosted: boost };
  const t = tiers[index]!;
  return {
    tiers,
    raw: lo,
    deboosted: boost,
    tier: { index, name: t.name, min: t.min, max: t.max, of: tiers.length },
  };
}

function tierIndexFor(mod: Mod, lo: readonly number[], hi: readonly number[], level: number): number {
  for (let i = mod.tiers.length - 1; i >= 0; i--) {
    const t = mod.tiers[i];
    if (!t || t.ilvl > level) continue;
    const ranges = t.ranges ?? [];
    if (ranges.length !== lo.length) continue;
    // 範囲 [r0, r1] と幅 [lo, hi] が重なるか
    if (ranges.every((r, k) => hi[k]! >= Number(r[0]) && lo[k]! <= Number(r[1]))) return i;
  }
  // どの段にも合わない時は、その ilvl で出る一番上の段 (2026-09-26: ilvl 79 の指輪に混沌耐性 +33% (T1 は ilvl 81) を貼ると
  // 最上段のまま狙いになり、出る重みが 0 で自動の組み立てとシミュレーションが延々と回って画面が固まった)
  for (let i = mod.tiers.length - 1; i >= 0; i--) if ((mod.tiers[i]?.ilvl ?? 0) <= level) return i;
  return mod.tiers.length - 1;
}

/**
 * 読んだアイテムを**ソルバに渡す目標**に変える。
 *
 * 値からティアまで決めるので、利用者が選ぶ手間がありません。
 *
 * 落ちた行は 2 つに分けます。**この違いが画面で効きます**:
 *   - `implicits` … そのベースの暗黙の効果。**作る対象ではない** (ベースを選んだ時点で決まる)
 *   - `skipped`   … **そのベースでは作れない行。**どのプールもその MOD を出さないという意味なので、
 *                   狙いから外して解くと**別のアイテムの手順**が出ます。画面で必ず断ること。
 *                   オーナー方針 2026-09-22:「作れない奴は物理的に買う方向でいい」。
 *
 *                   実例: ニーモニックリングの「スペルのマナコスト効率」。クライアントに
 *                   `Verisium` (プレフィックス 18-29%) として在るが **spawn_weights が全部 0**。
 *                   **これはデータの穴ではありません** ── オーナー確認 2026-09-23:
 *                   「ブリーチの樹からドロップした指輪にしかつかない」。つまり**ドロップ限定**で、
 *                   重み 0 はそれを正しく表しています。こういう MOD は買うしかなく、
 *                   **その分だけ枠が埋まっている**ことにも注意 (指輪なら残りのプレフィックスは 2 つ)
 */
export function targetsFor(
  data: PatchData,
  item: PastedItem,
): {
  targets: TierTarget[];
  texts: string[];
  skipped: string[];
  /**
   * 繋がらなかった行のうち、**創生の樹からしか出ない**と分かった物。
   * 「クラフトでは付かない」だけでなく**どこから出るか**まで言えます。
   */
  dropOnly: DropOnlyRow[];
  /**
   * 繋がらなかった行が**どちら側の枠をいくつ食っているか**。
   *
   * クラフトでは付かない MOD (ブリーチの樹の指輪など) も枠は使います。数えずに解くと
   * 「まだ 3 枠空いている」と思い込んで、実際には入らない構成を「作れます」と言います。
   * `either` は側が決まらなかった分 (両側に同じ文面がある物)。
   */
  skippedSides: { prefixes: number; suffixes: number; either: number };
  implicits: string[];
  /** 固定済みの行 (画面用) */
  fractured: string[];
  /**
   * 固定済みの目標。**`fracturedStart` に渡すと開始状態になります。**
   * 固定された MOD は消去でも消えないので「もう手に入っている」扱いにでき、そこから解くと
   * 道順が桁違いに短くなります (実測: 素から 9,780 神 → 固定済みから 148 神)。
   */
  fracturedTargets: TierTarget[];
} {
  if (!item.baseType) {
    return {
      targets: [], texts: [], skipped: item.lines.map((l) => l.text), implicits: [],
      fractured: [], fracturedTargets: [], dropOnly: [], skippedSides: { prefixes: 0, suffixes: 0, either: 0 },
    };
  }
  const level = item.itemLevel ?? 100;

  // **暗黙の効果を先に抜く。**注記があればそれに従い、無ければベースの表から当てます。
  // あとで抜こうとすると手遅れです: 「ブロック率 +17%」は
  // 冒涜プールの `AdditionalBlock` (of Amanamu 20-25) に文面だけ当たってしまい、
  // 範囲の外 (17) なのに目標として通ってしまいました (実物で踏んだ)。
  // 暗黙はベースを選んだ時点で決まっているので、そもそも作る対象ではありません。
  const bare = (t: string): string => stripMarkers(t).replace(/[0-9()+\-]+/g, "").trim();
  // **暗黙 1 つにつき 1 行だけ落とす。**同じ文面が暗黙にも通常 MOD にも出ることがあり、
  // 全部消すと本物の目標まで巻き添えになる。実物で踏んだ (2026-09-22 ニーモニックリング):
  // 暗黙が「最大マナが8%増加する」で、プレフィックスにも同じ行がある。両方落として目標が 1 個減った。
  const implicits: string[] = [];
  const fractured: string[] = [];
  const rollable: PastedLine[] = [];

  if (item.annotated) {
    // **注記があるなら推測しない。**poe.ninja が種類を書いてくれている
    for (const l of item.lines) {
      // ルーンとアノイントは作る対象ではない (オーナー指示 2026-09-23「ルーンとかは全無視でいい」)
      if (l.kind === "rune" || l.kind === "enchant") continue;
      if (l.kind === "implicit") { implicits.push(l.text); continue; }
      // 固定済みは**もう手に入っている**。目標には入れるが、開始状態に置ける印を返す
      if (l.kind === "fractured") fractured.push(l.text);
      rollable.push(l);
    }
  } else {
    // 注記が無い (ゲームの表示をそのまま貼った) 時だけ、ベースの表から暗黙を当てる。
    // **暗黙 1 つにつき 1 行だけ落とす。**同じ文面が暗黙にも通常 MOD にも出ることがあり、
    // 全部消すと本物の目標まで巻き添えになる (2026-09-22 ニーモニックリングで踏んだ)
    const quota = new Map<string, number>();
    for (const im of htcBaseInfo()[item.baseType]?.implicits ?? []) {
      const k = bare(im.ja);
      quota.set(k, (quota.get(k) ?? 0) + 1);
    }
    for (const l of item.lines) {
      const k = bare(l.text);
      const left = quota.get(k) ?? 0;
      if (left > 0) {
        quota.set(k, left - 1);
        implicits.push(l.text);
      } else {
        rollable.push(l);
      }
    }
  }

  // 素のベースから作る話なので、ルーン由来の MOD は混ぜない
  const bridged = bridgeMods(data, item.baseType, rollable.map((l) => l.template), "exclude");
  // 繋がらなかった物を**符号違いで**もう一度引く。`mod-text-ja.json` は
  // 「# to Level of all Melee Skills」、エンジンは「+# to Level of all Melee Skills」で、
  // 先頭の `+` を数値側に取り込むか文面側に残すかが辞書ごとに違う (実物で踏んだ)
  const retryAt = bridged.mods
    .map((b, i) => (!b.mod && rollable[i]!.template.startsWith("#") ? i : -1))
    .filter((i) => i >= 0);
  if (retryAt.length) {
    const again = bridgeMods(data, item.baseType, retryAt.map((i) => "+" + rollable[i]!.template), "exclude");
    retryAt.forEach((i, k) => {
      const got = again.mods[k];
      if (got?.mod) bridged.mods[i] = got;
    });
  }
  const hybridParts = hybridLineParts(bridged.mods);
  // 繋がらない行 (樹 MOD など、買うしかない物) が使う枠も数えてから振り分ける
  const sideTable = htcModSides();
  const takenBy = { prefix: 0, suffix: 0 };
  bridged.mods.forEach((b, i) => {
    if (b.mod || hybridParts.has(i)) return;
    const v = sideTable[matchKey(rollable[i]!.template)];
    if (v === "P") takenBy.prefix++; else if (v === "S") takenBy.suffix++;
  });
  balanceSides(data, bridged.mods, takenBy, sideLimits(data, item.baseType));

  const targets: TierTarget[] = [];
  /** `targets` と同じ並びの、貼り付けの文面。画面に日本語のまま出すため */
  const texts: string[] = [];
  const skipped: string[] = [];
  bridged.mods.forEach((b, i) => {
    const line = rollable[i]!;
    if (hybridParts.has(i)) return; // 複合 MOD のもう 1 行 (狙いは複合 MOD の方で数える)
    if (!b.mod || b.viaRune) { skipped.push(line.text); return; }
    // **ティアを読む前に品質を外す。**装飾品の品質はその種類のタグを持つ MOD の値を
    // 押し上げるので、画面の数字のまま読むとティアを高く見積もります。実物で踏んだ:
    // 「品質 (マナモッド) +20%」の最大マナ +183 は、素だと 152.5 で 1 段下のティア。
    const boost = item.quality && item.catalystTag && boostedBy(b.mod, item.catalystTag);
    // 切り捨ての分だけ帯になる。底上げが無ければ幅ゼロ (表示がそのまま素)
    const lo = boost ? line.values.map((v) => rawValue(v, item.quality!)) : line.values;
    const hi = boost ? line.values.map((v) => rawValue(v + 1, item.quality!) - 1e-9) : line.values;
    targets.push({ modId: b.mod.id, minTierIndex: tierIndexFor(b.mod, lo, hi, level) });
    texts.push(line.text);
  });
  // 繋がらなかった行の側を、クライアント由来の表から引く ([[patch.ts]] の `htcModSides`)
  const sides = htcModSides();
  const tree = htcDropOnly();
  const dropOnlyRows: DropOnlyRow[] = [];
  const skippedSides = { prefixes: 0, suffixes: 0, either: 0 };
  for (const l of rollable) {
    if (!skipped.includes(l.text)) continue;
    const k = matchKey(l.template);
    const t2 = tree[k];
    const v = sides[k];
    // stats まで持って回る。**ここで引けたのに後で引き直す**と、文面の正規化が
    // 1 箇所ずれただけで「買うしかない MOD なのに検索も組めない」に落ちます (2026-09-23 に実際そうなった)
    if (t2) {
      dropOnlyRows.push({
        text: l.text, tag: t2.tag, tagJa: TREE_JA[t2.tag] ?? t2.tag, name: t2.name, stats: t2.stats ?? [],
        ...treeTierOf(t2, l.values[0], item),
        ...(v === "P" || v === "S" ? { side: v } : {}),
      });
    }
    if (v === "P") skippedSides.prefixes++;
    else if (v === "S") skippedSides.suffixes++;
    else skippedSides.either++;
  }
  const fracturedSet = new Set(fractured);
  const fracturedTargets = targets.filter((_, i) => fracturedSet.has(texts[i] ?? ""));
  return { targets, texts, skipped, implicits, fractured, fracturedTargets, dropOnly: dropOnlyRows, skippedSides };
}
