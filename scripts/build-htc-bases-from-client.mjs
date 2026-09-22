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
import { resolve } from "node:path";
import { ROOT, OUT, rj, rows } from "./_htc-client-tables.mjs";
import { CLASS_TAGS, RUNE_POOLS, weightOn, familyOf, signature, signatureTags, ROW_NAME, verifyRuneTags, isSkippedBase } from "./_htc-base-tags.mjs";
import { makeModBuilder } from "./_htc-mod-build.mjs";
import { buildModTags, buildModSides, buildDropOnly } from "./_htc-mod-tags.mjs";
import { report } from "./_htc-report.mjs";

const VERIFY = process.argv.includes("--verify");

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

  /**
   * ベース名 -> そのベースでの枠 (プレフィックス / サフィックス)。
   *
   * **同梱エンジンはクラス単位でしか枠を持っていません** (`ItemBase.limits`)。ところが実際は
   * **ベースの暗黙 MOD が枠を増減させます** ── 「不在のアミュレット」は -1 プレフィックス /
   * -1 サフィックスで **2/2**、4 MOD で満杯になります。アミュレットだけで 9 種類あり、
   * +2/-2 まで振れるので、ここを見ないと解が丸ごと変わります。
   *
   * `AmuletImplicitPrefixSuffixAllowed*` / `RingImplicitPrefixSuffixAllowed*` などの
   * `local_maximum_prefixes_allowed_+` / `local_maximum_suffixes_allowed_+` を素の 3/3 に足す。
   * 書き出しが無い時は空にする (その時は今まで通りクラス既定の 3/3)。
   */
  const baseLimits = {};
  /**
   * ベース名 -> そのベースの素性 (種別 / 必要レベル / 枠 / 暗黙の効果)。
   *
   * **暗黙の効果はベース選びそのもの**です。アミュレットなら「トリニティ」「クリティカル時に発動」
   * のような付与スキルが暗黙に乗っていて、何を作るかで選ぶベースが変わります。枠の増減
   * (`local_maximum_prefixes_allowed_+`) も暗黙の 1 つで、同じ表から取れます。
   *
   * 文言は `mods.en/ja.json` の `text` をそのまま (数値の範囲つき)。
   */
  /**
   * ゲームの文言に混ざる `[キー|表示]` を表示側だけにする。
   *
   * クライアントの文言はリンク用の印を持っていて (`全ての[Attributes|能力値] +(8-12)`)、
   * そのまま出すと画面に `[Attributes|` が漏れます。暗黙 291 行のうち **200 行**が該当。
   * 縦棒が無い `[キー]` はキーがそのまま表示される形なので、括弧だけ落とします。
   */
  const stripTags = (t) => String(t).replace(/\[([^\]|]*)\|([^\]]*)\]/g, "$2").replace(/\[([^\]]*)\]/g, "$1");

  const baseInfo = {};
  try {
    const dir = resolve(ROOT, "data-cache/client-export-implicits/tables");
    const rdi = async (lang, n) => {
      const j = JSON.parse(await readFile(resolve(dir, lang, `${n}.json`), "utf8"));
      return Array.isArray(j) ? j : j.rows;
    };
    const [BI, BJ, MDI, ICI] = await Promise.all([
      rdi("English", "BaseItemTypes"), rdi("Japanese", "BaseItemTypes"),
      rdi("English", "Mods"), rdi("English", "ItemClasses"),
    ]);
    const MJ = await rj(resolve(ROOT, "data-cache/mods.ja.json")).catch(() => ({}));
    for (let i = 0; i < BI.length; i++) {
      const r = BI[i];
      if (!r.Name) continue;
      const cid = (ICI[r.ItemClass] || {}).Id;
      if (!CLASS_TAGS[cid]) continue; // 装備以外は持たない
      let dp = 0;
      let ds = 0;
      const implicits = [];
      for (const k of r.Implicit_Mods || []) {
        const mid = (MDI[k] || {}).Id;
        const m = MODS[mid];
        if (!m) continue;
        for (const st of m.stats || []) {
          if (st.id === "local_maximum_prefixes_allowed_+") dp += st.min ?? 0;
          if (st.id === "local_maximum_suffixes_allowed_+") ds += st.min ?? 0;
        }
        if (m.text) implicits.push({ en: stripTags(m.text), ja: stripTags(MJ[mid]?.text ?? m.text) });
      }
      if (dp !== 0 || ds !== 0) baseLimits[r.Name] = { prefixes: 3 + dp, suffixes: 3 + ds };
      baseInfo[r.Name] = {
        cls: ROW_NAME[cid] || cid.replace(/\s+/g, "_"),
        ja: BJ[i]?.Name ?? r.Name,
        lvl: r.DropLevel ?? 0,
        ...(dp !== 0 || ds !== 0 ? { limits: { prefixes: 3 + dp, suffixes: 3 + ds } } : {}),
        ...(implicits.length ? { implicits } : {}),
      };
    }
  } catch (e) {
    console.log(`暗黙 MOD の書き出しが読めません (${e.message})。枠の増減と暗黙の効果は飛ばします。`);
  }

  /**
   * ベースに元から乗っている**付与スキル** (`scripts/build-granted-skills-poe2db.mjs` が poe2db から取る)。
   *
   * クラフトでは変えられないので、**ベースを選んだ時点で決まる条件**として扱います
   * (オーナー方針 2026-09-22)。「不在のアミュレット」は 7 種類から 1 つがランダムで乗るので、
   * 狙いのスキルの物を買うところからになります。
   *
   * クライアントの `ItemInherentSkills` は行はあるのに参照先が解決できない (スキーマのずれ) ので、
   * ここだけ poe2db 由来です。書き出しが無ければ飛ばします。
   */
  /**
   * ベースの**素の防御値 / 武器性能**。白いベースに元から付いている数字で、
   * 品質はここに効きます (MOD の値ではなく)。
   *
   *   最終 ES = (素の ES + フラット ES の MOD) × (1 + %ES の MOD 合計 + 品質 + ルーン)
   *
   * これが無いと「ES 533 の兜を作る」という目標の立て方ができません (MOD 単位でしか指定できない)。
   */
  try {
    const dir = resolve(ROOT, "data-cache/client-export-defences/tables/English");
    const rdd = async (n) => {
      const j = JSON.parse(await readFile(resolve(dir, `${n}.json`), "utf8"));
      return Array.isArray(j) ? j : j.rows;
    };
    const [AT, WT, BD] = await Promise.all([rdd("ArmourTypes"), rdd("WeaponTypes"), rdd("BaseItemTypes")]);
    const num = (v) => (typeof v === "number" && v > 0 ? v : undefined);
    for (const r of AT) {
      const nm = (BD[r.BaseItemType] || {}).Name;
      if (!nm || !baseInfo[nm]) continue;
      const d = {
        ...(num(r.Armour) ? { ar: r.Armour } : {}),
        ...(num(r.Evasion) ? { ev: r.Evasion } : {}),
        ...(num(r.EnergyShield) ? { es: r.EnergyShield } : {}),
        ...(num(r.Ward) ? { ward: r.Ward } : {}),
        ...(num(r.IncreasedMovementSpeed) ? { ms: r.IncreasedMovementSpeed } : {}),
      };
      if (Object.keys(d).length) baseInfo[nm].defence = d;
    }
    // 武器は**生値が千分率**なので、画面に出せる単位へ直してから入れる (2026-09-22)。
    //   Speed      … 1 回の攻撃にかかるミリ秒。**秒あたりの攻撃回数 = 1000 ÷ Speed**
    //                (実データは 588〜1000 で、割ると 1.00〜1.70 の 0.05 刻みちょうど)
    //   CritChance … 100 分の 1 パーセント。**% = CritChance ÷ 100**
    //                (実データは 500〜1200 で、割ると 5.00〜12.00% ちょうど)
    // 生値のまま持つと、使う側が毎回この変換を思い出す羽目になる。
    for (const r of WT) {
      const nm = (BD[r.BaseItemType] || {}).Name;
      if (!nm || !baseInfo[nm]) continue;
      const w = {
        ...(num(r.DamageMin) ? { dmgMin: r.DamageMin } : {}),
        ...(num(r.DamageMax) ? { dmgMax: r.DamageMax } : {}),
        ...(num(r.CritChance) ? { critPct: Math.round(r.CritChance) / 100 } : {}),
        ...(num(r.Speed) ? { aps: Math.round((1000 / r.Speed) * 100) / 100 } : {}),
      };
      if (Object.keys(w).length) baseInfo[nm].weapon = w;
    }
  } catch (e) {
    console.log(`防御値の書き出しが読めません (${e.message})。素の防御値は飛ばします。`);
  }

  let granted = {};
  try {
    granted = (await rj(resolve(ROOT, "data-cache/poe2db-granted-skills.json"))).granted ?? {};
  } catch {
    console.log("付与スキル (data-cache/poe2db-granted-skills.json) がありません。飛ばします。");
  }
  let grantedN = 0;
  for (const [name, skills] of Object.entries(granted)) {
    if (!baseInfo[name] || !Array.isArray(skills) || !skills.length) continue;
    baseInfo[name].grants = skills;
    grantedN++;
  }

  const payload = {
    generated: new Date().toISOString().slice(0, 10),
    familyTexts,
    baseLimits,
    baseInfo,
    familyStats,
    modTags,
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
