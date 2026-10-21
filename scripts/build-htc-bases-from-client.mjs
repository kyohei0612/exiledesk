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
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT, OUT, rj, rows } from "./_htc-client-tables.mjs";
import { CLASS_TAGS, RUNE_POOLS, weightOn, familyOf, signature, signatureTags, ROW_NAME, verifyRuneTags, isSkippedBase } from "./_htc-base-tags.mjs";
import { makeModBuilder } from "./_htc-mod-build.mjs";
import { buildModTags, buildModSides, buildDropOnly } from "./_htc-mod-tags.mjs";
import { report } from "./_htc-report.mjs";
import { buildDisplayTags } from "./_htc-display-tags.mjs";
import { buildBaseInfo, readImplicitTags } from "./_htc-base-info.mjs";

const VERIFY = process.argv.includes("--verify");
/** 変質した鎖骨が使える (鎖骨で冒涜できる) クラス = アミュレット・指輪・ベルト */
const OTHERWORLDLY_CLASSES = new Set(["Amulet", "Ring", "Belt"]);

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
  /**
   * ベースの暗黙 MOD が足すタグ (Mods の adds_tags)。グラスピングメイルの「Can roll Ring Modifiers」(ItemCanAlsoRollRingMods)
   * は ring を足す = 指輪の MOD も引ける (2026-10-16 要望 a286ced8、poe2db「Can roll Ring Modifiers」)。
   * genesis_tree_* は創生の樹の印 (通貨では付かない、special の置き場の話) なので足さない
   */
  const implicitTags = await readImplicitTags(MODS);
  const ownTags = (r) => [...(r.Tags || []).map((i) => tagIds[i]).filter(Boolean), ...(implicitTags.get(r.Name) || [])];
  const classIdOf = (r) => (C[r.ItemClass] || {}).Id;
  const byName = new Map(B.map((r) => [r.Name, r]));
  const hmods = new Map((htcMods.mods || htcMods.items || []).map((m) => [m.id, m]));

  // 画面用のタグ ([[_htc-display-tags.mjs]])
  const { modDisplayTags, statTags } = buildDisplayTags(MODS, hmods);

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
  await verifyRuneTags();
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

  // ---- 同梱の重みを family + ilvl で借りる ([[_htc-mod-build.mjs]]) ----
  const modBuilder = makeModBuilder(hmods);
  const { buildMod, ASSUMED } = modBuilder;

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
  /** 創生の樹のタグ (MOD の出現重みに出てくる genesis_tree_*) */
  const GENESIS_TAGS = [...new Set(Object.values(MODS).flatMap((m) => (m.spawn_weights || []).map((w) => w.tag)).filter((t) => t && t.startsWith("genesis_tree")))];
  /**
   * ハンドラップのベース (昇華の手袋。Id が Gloves/…Ascendancy = Fists of Stone / Runeforged Fists of Stone) の防具の種類のタグ
   * (dex_int_armour)。その行の手袋だけに足す (STR の手袋にハンドラップの ES が出ないように)
   */
  const HAND_WRAP_TAGS = new Set();
  for (const r of B) {
    if (!/\/Gloves\/[^/]*Ascendancy/.test(r.Id || "")) continue;
    for (const t of ownTags(r)) if (t.endsWith("_armour")) HAND_WRAP_TAGS.add(t);
  }
  /** ハンドラップの MOD (HandWraps*、ユニーク以外) を側 → 系統 → MOD[] に */
  const HAND_WRAPS = { prefix: new Map(), suffix: new Map() };
  for (const [id, m] of Object.entries(MODS)) {
    if (!id.startsWith("HandWraps") || m.domain !== "item" || (m.generation_type !== "prefix" && m.generation_type !== "suffix")) continue;
    const f = familyOf(m);
    if (!f) continue;
    const b = HAND_WRAPS[m.generation_type];
    if (!b.has(f)) b.set(f, []);
    b.get(f).push(m);
  }
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
        const mod = buildMod(cls.id, family, kind, list, tags, "desecrated", ASSUMED.desecrated);
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
          const mod = buildMod(cls.id, `Rune_${rp.tag}_${family}`, kind, list, new Set([...tags, rp.tag]), "normal", ASSUMED.rune);
          outMods.push({ ...mod, rune: rp.id });
          side[key].push(mod.id);
        }
      }
      if (side.prefixes.length || side.suffixes.length) rune[rp.id] = side;
    }

    // 変質した鎖骨 (Altered Collarbone) の「異界の MOD」(2026-09-27 オーナー「変質した鎖骨 MOD も全部に追加してくれ。
    // 冒涜と同じでその中に異界の MOD がつくってだけ。確率は冒涜と同じ」「ベースごとに違う MOD つくからね」)。
    // 異界の MOD の出現重みは breach_desecration のタグでだけ正 (指輪 0 / ベルト 0 など、クラスごとに行き先が違う)。
    // 冒涜のタグ集合に breach_desecration を足した時だけ出る差分を、冒涜とは別の置き場に入れる
    // (冒涜のプールに混ぜると普通の鎖骨の確率が変わる)。重みは冒涜と同じ仮の値
    const otherworldly = { prefixes: [], suffixes: [] };
    if (OTHERWORLDLY_CLASSES.has(cid)) {
      const withOw = familiesFor(new Set([...tags, "breach_desecration"]), "desecrated");
      for (const [kind, side] of [
        ["prefix", "prefixes"],
        ["suffix", "suffixes"],
      ]) {
        for (const [family, list] of withOw[kind]) {
          if (fams[kind].has(family)) continue; // 素でも冒涜で出る物は冒涜のプールの分
          const mod = buildMod(cls.id, family, kind, list, new Set([...tags, "breach_desecration"]), "desecrated", ASSUMED.desecrated);
          const id = `${cls.id}/Otherworldly_${family}`;
          outMods.push({ ...mod, id, otherworldly: true });
          otherworldly[side].push(id);
        }
      }
    }

    // 通貨では付かないが上位プレイヤーの装備には付く MOD (2026-10-05、上位 MOD 一覧をエンジン 1 か所から引くため):
    //   - 創生の樹: genesis_tree_* のタグを足した時だけ出る差分 (指輪・アミュレット等)
    //   - ハンドラップ: HandWraps* の MOD (どのタグでも重み 0。手袋の同じ系統の MOD がハンドラップではこの文面になる) を手袋の行に
    // 文面・段・側を引くだけの置き場 (special)。クラフトの抽選・ステージは読まない。系統は元の系統のまま (同じ系統は一緒に付かない)
    const special = { prefixes: [], suffixes: [] };
    const putSpecial = (kind, family, list, tagSet, tagName) => {
      const mod = buildMod(cls.id, family, kind, list, tagSet, "normal", 0);
      const sid = `${cls.id}/Special_${tagName}_${family}`;
      // 抽選には出ない (重み 0)。文面・段・側を引くだけ
      // 段で文面が変わる物 (「an additional time」→「2 additional times」) も引けるように、段ごとの文面を altTexts に
      const altTexts = [...new Set(list.map((m) => m.text).filter((t) => t && t !== mod.text))];
      outMods.push({ ...mod, id: sid, special: true, tiers: mod.tiers.map((t) => ({ ...t, weight: 0 })), weightSource: "special", ...(altTexts.length ? { altTexts } : {}) });
      special[kind === "prefix" ? "prefixes" : "suffixes"].push(sid);
    };
    for (const g of GENESIS_TAGS) {
      const withG = familiesFor(new Set([...tags, g]), "item");
      for (const kind of ["prefix", "suffix"]) {
        for (const [family, list] of withG[kind]) if (!fams0[kind].has(family)) putSpecial(kind, family, list, new Set([...tags, g]), g);
      }
    }
    if (cid === "Gloves" && [...tags].some((t) => HAND_WRAP_TAGS.has(t))) {
      for (const kind of ["prefix", "suffix"]) {
        for (const [family, list] of HAND_WRAPS[kind]) putSpecial(kind, family, list, tags, "hand_wraps");
      }
    }

    const entry = {};
    if (special.prefixes.length || special.suffixes.length) entry.special = special;
    if (add.prefixes.length || add.suffixes.length) entry.desecrated = add;
    if (Object.keys(rune).length) entry.rune = rune;
    if (otherworldly.prefixes.length || otherworldly.suffixes.length) entry.otherworldly = otherworldly;
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
          const mod = buildMod(id, family, kind, list, tags, source, source === "desecrated" ? ASSUMED.desecrated : undefined);
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
          const mod = buildMod(id, `Rune_${rp.tag}_${family}`, kind, list, new Set([...tags, rp.tag]), "normal", ASSUMED.rune);
          outMods.push({ ...mod, rune: rp.id });
          side[key].push(mod.id);
        }
      }
      if (side.prefixes.length || side.suffixes.length) rune[rp.id] = side;
    }
    if (Object.keys(rune).length) pools.rune = rune;

    // category / class は同梱の流儀に合わせる (category = `Body_Armours`、class = `Body Armours`)。
    // ここを ItemClasses.Id のままにすると `runesFor` などカテゴリで引く処理が全部外れる。
    const row = ROW_NAME[cls] || cls.replace(/\s+/g, "_");
    outItems.push({ id, name: id, bases: names.sort(), category: row, class: row.replace(/_/g, " "), pools });
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

  // ---- family ごとのタグと stat ([[_htc-mod-tags.mjs]]) ----
  const { modTags, familyStats } = buildModTags(MODS);
  // 繋がらなかった行の枠を引くための「文面 -> 側」
  const modSides = buildModSides(MODS);
  // 創生の樹からしか出ない MOD。狙いに入っていたら「買うしかない」と断るため
  const dropOnly = buildDropOnly(MODS);

  // ベースの素性: 枠の増減・暗黙・防御値・付与スキル ([[_htc-base-info.mjs]])
  const { baseLimits, baseInfo, grantedN } = await buildBaseInfo(MODS);

  const payload = {
    generated: new Date().toISOString().slice(0, 10),
    familyTexts,
    baseLimits,
    baseInfo,
    familyStats,
    modTags,
    modDisplayTags,
    statTags,
    modSides,
    dropOnly,
    source:
      "GGG クライアント (data-cache/client-export + data-cache/mods.en.json)。重みは同梱 poe2htc から family+ilvl で拝借し、借りられない分は 1 のまま (weightSource で区別)",
    addedBases: Object.fromEntries([...addedBases].map(([k, v]) => [k, v.sort()])),
    addedPools,
    items: outItems,
    mods: outMods,
  };
  await writeFile(OUT, JSON.stringify(payload, null, 1) + "\n", "utf8");

  const { borrowed, placeholder } = modBuilder.stats();
  report({ OUT, addedBases, baseInfo, baseLimits, modTags, modSides, dropOnly, familyStats, grantedN,
    outItems, outMods, addedPools, borrowed, placeholder, ASSUMED });
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
