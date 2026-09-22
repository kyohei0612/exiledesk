#!/usr/bin/env node
/**
 * build-htc-bases-from-client.mjs
 * --------------------------------------------------------------
 * 取り込んだクラフトエンジン (src/vendor/poe2htc) が**知らないベースとクラス**を、
 * GGG クライアントのテーブルから作って足す (2026-09-22)。
 *
 * ## なぜ要るか
 * 同梱データは patch 0.5.0 (2026-07-04 生成) で止まっていて、今リーグのベース 14 種を知らない。
 * 上流の更新を待つとリーグが変わるたびに数か月遅れる。クライアントは**パッチ当日に読める**ので、
 * ここを自前にすると鮮度で上回れる。上流の `data/` は触らず、**足す分だけ**別ファイルに出す
 * (`src/services/htc/extra-bases.json`)。`patch.ts` が読み込み時に重ねる。
 *
 * ## どう作るか
 * ゲームはアイテムのタグで「このベースにどの MOD が出るか」を決めている。MOD 側の
 * `spawn_weights` を**先頭から見て、装備タグに最初に一致した項目の重み**が出現重み (0 なら出ない)。
 * これはうちの `services/mods/tiers.ts` が既に使っている規則と同じ。
 *
 * 装備タグ = クライアントの `BaseItemTypes.Tags` + **クラス由来のタグ** (CLASS_TAGS)。
 *
 * ## 検算
 * 毎回、同梱データが既に持っている 52 クラスを同じ手順で作り直して突き合わせる。
 * 2026-09-22 の実測: **1076 / 1076 ファミリ = 100.0% 一致**。この手順は上流と同じ答えを出す。
 * 100% を割ったら生成せずに落ちる。`--verify` で検算だけ。
 *
 * ## 重み
 * クライアントの重みは全 MOD 1 なので**そのままでは期待値に使えない**。同梱データが同じ family を
 * 別クラスで既に持っていれば、その ilvl の重みを借りる。借りられない分は 1 のまま残し、
 * `weightSource: "client-placeholder"` を立てて画面で断れるようにする。
 *
 * Usage:
 *   node scripts/build-htc-bases-from-client.mjs            # 生成
 *   node scripts/build-htc-bases-from-client.mjs --verify   # 検算だけ
 * --------------------------------------------------------------
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TABLES = resolve(ROOT, "data-cache/client-export/tables/English");
const OUT = resolve(ROOT, "src/services/htc/extra-bases.json");
const VERIFY = process.argv.includes("--verify");

const rj = async (p) => JSON.parse(await readFile(p, "utf8"));
const rows = async (name) => {
  const j = await rj(resolve(TABLES, `${name}.json`));
  return Array.isArray(j) ? j : j.rows || Object.values(j);
};

/**
 * ItemClasses.Id -> そのクラスの全ベースが持つタグ。
 *
 * クライアントの `BaseItemTypes.Tags` には**クラス由来のタグが入っていない**。`helmet` も
 * `armour` も `two_hand_weapon` も、`InheritsFrom` が指す抽象アイテム側にあり、そこは .dat に
 * 行として出てこない (`Metadata/.../AbstractGloves` を引いても無い)。上流 POE2HTC も同じ理由で
 * `variants.mjs` に手書きの表を持っている。
 *
 * **勘で足さないこと。** 足したら検算の 100% が落ちないのを見る。
 * 実例: Focus に `shield` を足すと落ちる (先に `shield:0` を踏む)、`armour` は要る (耐性が出る)。
 */
const CLASS_TAGS = {
  Helmet: ["helmet", "armour"],
  "Body Armour": ["body_armour", "armour"],
  Gloves: ["gloves", "armour"],
  Boots: ["boots", "armour"],
  Ring: ["ring"],
  Amulet: ["amulet"],
  Belt: ["belt"],
  Quiver: ["quiver"],
  Focus: ["focus", "armour"],
  Shield: ["shield", "armour"],
  Buckler: ["shield", "armour"],
  Wand: ["wand", "one_hand_weapon", "weapon"],
  Sceptre: ["sceptre", "one_hand_weapon", "weapon"],
  "One Hand Mace": ["mace", "one_hand_weapon", "weapon"],
  "Two Hand Mace": ["mace", "two_hand_weapon", "weapon"],
  Bow: ["bow", "two_hand_weapon", "weapon", "ranged"],
  Crossbow: ["crossbow", "two_hand_weapon", "weapon", "ranged"],
  Staff: ["staff", "two_hand_weapon", "weapon"],
  Warstaff: ["warstaff", "staff", "two_hand_weapon", "weapon"],
  Spear: ["spear", "one_hand_weapon", "weapon"],
  Talisman: ["talisman", "two_hand_weapon", "weapon"],
};

/** ゲームと同じ判定: spawn_weights を先頭から見て、装備タグに最初に一致した項目の重み */
function weightOn(mod, tagSet) {
  for (const sw of mod.spawn_weights || []) if (tagSet.has(sw.tag)) return sw.weight;
  return 0;
}

/** family (排他グループ)。上流と同じ RePoE 流のグループ名 */
const familyOf = (m) => (m.groups || [])[0] || m.type || null;

/** クラスの持ち物を表す署名。ベース固有のタグ (産地 / ルーン鍛造) は行き先を変えないので外す */
const signatureTags = (tagSet) =>
  [...tagSet].filter((t) => !/_basetype$/.test(t) && t !== "runeforged" && t !== "default").sort();
const signature = (tagSet) => signatureTags(tagSet).join("+");

/**
 * ItemClasses.Id -> 同梱データの行の呼び方。新しいクラスの id を上流と同じ流儀で付けるため。
 * 例: Helmet + str_dex_int_armour -> `Helmets_str_dex_int` (同梱の `Helmets_str_int` と揃う)
 */
const ROW_NAME = {
  Helmet: "Helmets",
  "Body Armour": "Body_Armours",
  Gloves: "Gloves",
  Boots: "Boots",
  Shield: "Shields",
  Buckler: "Bucklers",
  Focus: "Foci",
  Ring: "Rings",
  Amulet: "Amulets",
  Belt: "Belts",
  Quiver: "Quivers",
  Wand: "Wands",
  Sceptre: "Sceptres",
  "One Hand Mace": "OneHand_Maces",
  "Two Hand Mace": "TwoHand_Maces",
  Bow: "Bows",
  Crossbow: "Crossbows",
  Staff: "Staves",
  Warstaff: "Quarterstaves",
  Spear: "Spears",
  Talisman: "Talismans",
};

/**
 * ルーンを差して初めて出る MOD のプール。`engine/runes.ts` の `RUNES` と対応させること
 * (`{ kind: 'pool', tag }` の 6 つ)。タグはクライアントの spawn_weights にそのまま出てくる
 * (`destruction` / `marksman` / `decay` / `berserking` / `soul` / `chronomancy`)。
 * categories は `runes.ts` の同名フィールドと同じで、空なら全装備。
 */
const RUNE_POOLS = [
  { id: "thruds-might", tag: "destruction", classes: ["Wand", "Sceptre", "Staff", "Bow", "Crossbow", "Warstaff", "Spear", "One Hand Mace", "Two Hand Mace", "Talisman"] },
  { id: "uhtreds-sidereus", tag: "chronomancy", classes: ["Boots"] },
  { id: "kolrs-hunt", tag: "marksman", classes: ["Gloves"] },
  { id: "katlas-gloom", tag: "decay", classes: ["Gloves"] },
  { id: "voranas-carnage", tag: "berserking", classes: ["Helmet"] },
  { id: "medveds-tending", tag: "soul", classes: ["Body Armour"] },
];

/**
 * 作らないベース。
 * - `demigods` / `not_for_sale` … デミゴッド装備。落ちも売りもせず、クラフトの対象外
 * - `[DNT]` … 開発用 (Do Not Trade)。ゲームに出ない
 */
const isSkippedBase = (name, id, tags) =>
  name.startsWith("[DNT]") || /Demigod/i.test(id || "") || tags.has("demigods") || tags.has("not_for_sale");

const main = async () => {
  const [B, T, C, MODS, htcBases, htcMods] = await Promise.all([
    rows("BaseItemTypes"),
    rows("Tags"),
    rows("ItemClasses"),
    rj(resolve(ROOT, "data-cache/mods.en.json")),
    rj(resolve(ROOT, "src/vendor/poe2htc/data/base_items.json")),
    rj(resolve(ROOT, "src/vendor/poe2htc/data/mods.json")),
  ]);
  const tagIds = T.map((t) => t.Id);
  const ownTags = (r) => (r.Tags || []).map((i) => tagIds[i]).filter(Boolean);
  const classIdOf = (r) => (C[r.ItemClass] || {}).Id;
  const byName = new Map(B.map((r) => [r.Name, r]));
  const hmods = new Map((htcMods.mods || htcMods.items || []).map((m) => [m.id, m]));

  /** ベース名の集合 -> 装備タグ。同じクラスの中ではタグ和で足りる (検算で確認済み) */
  const tagSetFor = (names) => {
    const s = new Set(["default"]);
    let cls = null;
    for (const n of names) {
      const r = byName.get(n);
      if (!r) continue;
      cls = cls || classIdOf(r);
      for (const t of ownTags(r)) s.add(t);
    }
    for (const t of CLASS_TAGS[cls] || []) s.add(t);
    return { tags: s, cls };
  };

  /** 装備タグで引ける MOD を domain ごとに集める -> { prefix: family -> MOD[], suffix: ... } */
  const familiesFor = (tagSet, domain) => {
    const out = { prefix: new Map(), suffix: new Map() };
    for (const m of Object.values(MODS)) {
      if (m.domain !== domain) continue;
      if (m.generation_type !== "prefix" && m.generation_type !== "suffix") continue;
      const f = familyOf(m);
      if (!f || weightOn(m, tagSet) <= 0) continue;
      const bucket = out[m.generation_type];
      if (!bucket.has(f)) bucket.set(f, []);
      bucket.get(f).push(m);
    }
    return out;
  };

  // ---- 検算: 同梱データが持っている 52 クラスを作り直して突き合わせる ----
  let total = 0;
  let matched = 0;
  const shortfall = [];
  for (const cls of htcBases.items) {
    const { tags, cls: cid } = tagSetFor(cls.bases || []);
    if (!cid) continue;
    const mine = familiesFor(tags, "item");
    for (const [side, kind] of [
      ["prefixes", "prefix"],
      ["suffixes", "suffix"],
    ]) {
      for (const id of cls.pools.normal[side] || []) {
        const hm = hmods.get(id);
        if (!hm) continue;
        total++;
        if (mine[kind].has(hm.family)) matched++;
        else shortfall.push(`${cls.id} ${kind} ${hm.family}`);
      }
    }
  }
  const pct = total ? (matched / total) * 100 : 0;
  console.log(`検算: 同梱 ${total} ファミリ中 ${matched} を再現 = ${pct.toFixed(1)}%`);
  for (const s of shortfall.slice(0, 12)) console.log(`   落ちた: ${s}`);
  if (pct < 100) {
    console.log("\nNG: CLASS_TAGS が実態と合っていません。上の落ちた分から足りないタグを探してください。");
    process.exit(1);
  }
  if (VERIFY) return;

  // ---- 同梱データが知らないベースを洗い出して行き先を決める ----
  const knownBase = new Set();
  for (const c of htcBases.items) for (const n of c.bases || []) knownBase.add(n);
  const bySignature = new Map();
  for (const cls of htcBases.items) {
    const { tags } = tagSetFor(cls.bases || []);
    const sig = signature(tags);
    // 同じ署名に複数クラスが来るのは元素別の派生 (Wands_fire 等)。素の行 (id が短い側) を採る
    const cur = bySignature.get(sig);
    if (!cur || cls.id.length < cur.id.length) bySignature.set(sig, cls);
  }

  const addedBases = new Map();
  const newClasses = new Map();
  for (const r of B) {
    const name = r.Name;
    if (!name || knownBase.has(name)) continue;
    const cid = classIdOf(r);
    if (!CLASS_TAGS[cid]) continue; // 装備以外 (通貨 / ジェム / 地図…)
    const tags = new Set(["default", ...ownTags(r), ...CLASS_TAGS[cid]]);
    if (isSkippedBase(name, r.Id, tags)) continue;
    const sig = signature(tags);
    const hit = bySignature.get(sig);
    if (hit) {
      if (!addedBases.has(hit.id)) addedBases.set(hit.id, []);
      addedBases.get(hit.id).push(name);
    } else {
      // 上流の流儀で id を付ける: 行の呼び方 + クラス由来でないタグ (`str_dex_int_armour` -> `str_dex_int`)
      const extra = signatureTags(tags)
        .filter((t) => !(CLASS_TAGS[cid] || []).includes(t))
        .map((t) => t.replace(/_armour$/, ""));
      const key = [ROW_NAME[cid] || cid.replace(/\s+/g, "_"), ...extra].join("_");
      if (!newClasses.has(key)) newClasses.set(key, { cls: cid, names: [], tags });
      newClasses.get(key).names.push(name);
    }
  }

  // ---- 同梱の重みを family + ilvl で借りる ----
  const borrow = new Map();
  for (const m of hmods.values())
    for (const t of m.tiers || []) {
      const k = `${m.family}@${t.ilvl}`;
      if (!borrow.has(k)) borrow.set(k, t.weight);
    }
  let borrowed = 0;
  let placeholder = 0;
  const buildMod = (classId, family, kind, list, tagSet, source) => {
    let allBorrowed = true;
    const tiers = list
      .slice()
      .sort((a, b) => (a.required_level || 0) - (b.required_level || 0))
      .map((m) => {
        const ilvl = m.required_level || 0;
        const got = borrow.get(`${family}@${ilvl}`);
        if (got == null) {
          placeholder++;
          allBorrowed = false;
        } else borrowed++;
        return {
          name: m.name || "",
          ilvl,
          weight: got != null ? got : weightOn(m, tagSet),
          ranges: (m.stats || []).map((s) => [s.min, s.max]),
        };
      });
    const tags = new Set();
    for (const m of list) for (const sw of m.spawn_weights || []) if (sw.weight > 0 && tagSet.has(sw.tag)) tags.add(sw.tag);
    return {
      id: `${classId}/${family}`,
      source,
      type: kind,
      family,
      tags: [...tags],
      text: list[0].text ?? null,
      tiers,
      weightSource: allBorrowed ? "poe2htc" : "client-placeholder",
    };
  };

  const outMods = [];
  const outItems = [];

  /**
   * 既存クラスの**冒涜プール**に、クライアントが知っていて同梱に無いファミリを足す。
   *
   * **通常プールは足しません。**検算で見た通り既存クラスの通常プールは欠けが無く、逆に
   * クライアント側が多く出る分は上流の元素別の派生 (`Wands_fire` / `Wands_cold` …) を
   * 平らに見ているせいです。そこへ足すと冷気のワンドに火の MOD が乗ってしまいます。
   * 冒涜プールは上流が poe2db から作っていて patch 0.5.0 のまま = 素直に古いので、ここだけ埋めます。
   */
  const addedPools = {};
  for (const cls of htcBases.items) {
    const { tags, cls: cid } = tagSetFor(cls.bases || []);
    if (!cid) continue;
    const have = new Set();
    for (const side of ["prefixes", "suffixes"])
      for (const id of (cls.pools.desecrated || {})[side] || []) {
        const hm = hmods.get(id);
        if (hm) have.add(hm.family);
      }
    const fams = familiesFor(tags, "desecrated");
    const add = { prefixes: [], suffixes: [] };
    for (const [kind, side] of [
      ["prefix", "prefixes"],
      ["suffix", "suffixes"],
    ]) {
      for (const [family, list] of fams[kind]) {
        if (have.has(family)) continue;
        const mod = buildMod(cls.id, family, kind, list, tags, "desecrated");
        outMods.push(mod);
        add[side].push(mod.id);
      }
    }

    // ルーンのプールも同じく古い。素のタグでは 0 で、ルーンのタグを足した時だけ出る分を採る
    const fams0 = familiesFor(tags, "item");
    const rune = {};
    for (const rp of RUNE_POOLS) {
      if (!rp.classes.includes(cid)) continue;
      const withRune = familiesFor(new Set([...tags, rp.tag]), "item");
      const side = { prefixes: [], suffixes: [] };
      for (const [kind, key] of [
        ["prefix", "prefixes"],
        ["suffix", "suffixes"],
      ]) {
        for (const [family, list] of withRune[kind]) {
          if (fams0[kind].has(family) || have.has(`Rune_${rp.tag}_${family}`)) continue;
          const mod = buildMod(cls.id, `Rune_${rp.tag}_${family}`, kind, list, new Set([...tags, rp.tag]), "normal");
          outMods.push({ ...mod, rune: rp.id });
          side[key].push(mod.id);
        }
      }
      if (side.prefixes.length || side.suffixes.length) rune[rp.id] = side;
    }

    const entry = {};
    if (add.prefixes.length || add.suffixes.length) entry.desecrated = add;
    if (Object.keys(rune).length) entry.rune = rune;
    if (Object.keys(entry).length) addedPools[cls.id] = entry;
  }
  for (const [id, { cls, names, tags }] of newClasses) {
    const pools = {
      normal: { prefixes: [], suffixes: [] },
      desecrated: { prefixes: [], suffixes: [] },
      essence: { prefixes: [], suffixes: [] },
    };
    const fams0 = familiesFor(tags, "item"); // 素のタグで出る分。ルーンの差分を採る時の引き算に使う
    for (const [domain, poolName, source] of [
      ["item", "normal", "normal"],
      ["desecrated", "desecrated", "desecrated"],
    ]) {
      const fams = domain === "item" ? fams0 : familiesFor(tags, domain);
      for (const [kind, side] of [
        ["prefix", "prefixes"],
        ["suffix", "suffixes"],
      ]) {
        for (const [family, list] of fams[kind]) {
          const mod = buildMod(id, family, kind, list, tags, source);
          outMods.push(mod);
          pools[poolName][side].push(mod.id);
        }
      }
    }
    // ルーンを差して初めて出る MOD。素のタグでは 0 なので、ルーンのタグを足した時だけ出る差分を採る
    const rune = {};
    for (const rp of RUNE_POOLS) {
      if (!rp.classes.includes(cls)) continue;
      const withRune = familiesFor(new Set([...tags, rp.tag]), "item");
      const side = { prefixes: [], suffixes: [] };
      for (const [kind, key] of [
        ["prefix", "prefixes"],
        ["suffix", "suffixes"],
      ]) {
        for (const [family, list] of withRune[kind]) {
          if (fams0[kind].has(family)) continue; // 素でも出るなら通常プールの分
          const mod = buildMod(id, `Rune_${rp.tag}_${family}`, kind, list, new Set([...tags, rp.tag]), "normal");
          outMods.push({ ...mod, rune: rp.id });
          side[key].push(mod.id);
        }
      }
      if (side.prefixes.length || side.suffixes.length) rune[rp.id] = side;
    }
    if (Object.keys(rune).length) pools.rune = rune;

    outItems.push({ id, name: id, bases: names.sort(), category: cls, class: cls, pools });
  }

  /**
   * 既存クラスの **family -> 今の文言**。同梱の MOD 文言は patch 0.5.0 のままなので、
   * あとで行が増えた MOD が上位プレイヤーの装備と突き合わない。
   *
   * 実例: 手袋の `HandWrapsGlobalMeleeSkillGemLevel2` は今 2 行
   * (`+#% to Quality of all Skills` / `+# to Level of all Melee Skills`) だが、同梱の文言には
   * 1 行目が無い。上位 39 人がこれを着けていて、全部「繋がらない」に落ちていた。
   *
   * 文言の正規化は `bridge.ts` が持っているので、ここでは**生の文言をそのまま**渡す。
   * ここで正規化すると同じ規則を 2 か所に書くことになり、片方だけ直る事故になる。
   */
  const familyTexts = {};
  for (const cls of htcBases.items) {
    const { tags, cls: cid } = tagSetFor(cls.bases || []);
    if (!cid) continue;
    const perFamily = {};
    for (const domain of ["item", "desecrated"]) {
      const fams = familiesFor(tags, domain);
      for (const kind of ["prefix", "suffix"]) {
        for (const [family, list] of fams[kind]) {
          const seen = new Set();
          const texts = [];
          for (const m of list) {
            if (!m.text) continue;
            const key = m.text.replace(/[\d.]+/g, "#"); // 数値違いは同じ文言として 1 つに畳む
            if (seen.has(key)) continue;
            seen.add(key);
            texts.push(m.text);
          }
          if (texts.length) perFamily[family] = texts;
        }
      }
    }
    if (Object.keys(perFamily).length) familyTexts[cls.id] = perFamily;
  }

  const payload = {
    generated: new Date().toISOString().slice(0, 10),
    familyTexts,
    source:
      "GGG クライアント (data-cache/client-export + data-cache/mods.en.json)。重みは同梱 poe2htc から family+ilvl で拝借し、借りられない分は 1 のまま (weightSource で区別)",
    addedBases: Object.fromEntries([...addedBases].map(([k, v]) => [k, v.sort()])),
    addedPools,
    items: outItems,
    mods: outMods,
  };
  await writeFile(OUT, JSON.stringify(payload, null, 1) + "\n", "utf8");

  const addedCount = [...addedBases.values()].reduce((a, b) => a + b.length, 0);
  console.log(`\n既存クラスに足したベース: ${addedCount} 件`);
  for (const [k, v] of addedBases) console.log(`   ${k}: ${v.length} 件 (${v.slice(0, 3).join(", ")}${v.length > 3 ? ", …" : ""})`);
  console.log(`新しいクラス: ${outItems.length} 個`);
  for (const it of outItems) {
    const n = outMods.filter((m) => m.id.startsWith(`${it.id}/`)).length;
    console.log(`   ${it.id}: ベース ${it.bases.length} 件 / MOD ${n} 件`);
  }
  const cnt = (p) => (p ? p.prefixes.length + p.suffixes.length : 0);
  const desAdds = Object.values(addedPools).reduce((a, p) => a + cnt(p.desecrated), 0);
  const runeAdds = Object.values(addedPools).reduce((a, p) => a + Object.values(p.rune ?? {}).reduce((x, q) => x + cnt(q), 0), 0);
  console.log(`既存クラスに足した MOD: 冒涜 ${desAdds} 件 / ルーン ${runeAdds} 件 (${Object.keys(addedPools).length} クラス)`);
  console.log(`重み: 同梱から借りた ${borrowed} ティア / 借りられず 1 のまま ${placeholder} ティア`);
  console.log(`-> ${OUT}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
