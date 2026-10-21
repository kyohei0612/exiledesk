// build-htc-bases-from-client.mjs のベースの素性 (枠の増減・暗黙・防御値・付与スキル) と暗黙が足すタグ (2026-10-22 に移した、中身はそのまま)
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ROOT, rj } from "./_htc-client-tables.mjs";
import { CLASS_TAGS, ROW_NAME } from "./_htc-base-tags.mjs";

/** ベース名 -> 暗黙 MOD が足すタグ (genesis_tree_* を除く)。書き出し (data-cache/client-export-implicits) が無ければ空 */
export async function readImplicitTags(MODS) {
  const out = new Map();
  const dir = resolve(ROOT, "data-cache/client-export-implicits/tables/English");
  let BI, MI;
  try {
    const rd = async (n) => { const j = JSON.parse(await readFile(resolve(dir, `${n}.json`), "utf8")); return Array.isArray(j) ? j : j.rows; };
    [BI, MI] = await Promise.all([rd("BaseItemTypes"), rd("Mods")]);
  } catch {
    console.log("暗黙 MOD の書き出し (data-cache/client-export-implicits) がありません。暗黙が足すタグは見ません。");
    return out;
  }
  for (const r of BI) {
    if (!r.Name) continue;
    for (const i of r.Implicit_Mods || []) {
      const add = ((MODS[(MI[i] || {}).Id] || {}).adds_tags || []).filter((t) => !t.startsWith("genesis_tree"));
      if (!add.length) continue;
      const set = out.get(r.Name) ?? new Set();
      for (const t of add) set.add(t);
      out.set(r.Name, set);
    }
  }
  return out;
}

/** MODS = クライアントの mods.en.json。返すのは { baseLimits, baseInfo, grantedN } */
export async function buildBaseInfo(MODS) {
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
  return { baseLimits, baseInfo, grantedN };
}
