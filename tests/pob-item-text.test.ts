import { describe, expect, it } from "vitest";
import { linesToJa, rareNameEn, rareNameJa, toPobItem } from "../src/services/pob-check/item-text";

const NL = String.fromCharCode(10);

// オーナーの実物 (イージスクォータースタッフ、2026-09-22。scripts/check-htc-paste.mjs と同じ)
const STAFF = [
  "アイテムクラス: クォータースタッフ",
  "レアリティ: レア",
  "亀裂のあるポスト",
  "イージスクォータースタッフ",
  "--------",
  "品質: +20%",
  "物理ダメージ: 70-116",
  "クリティカルヒット率: 10.00%",
  "秒間アタック回数: 1.40",
  "--------",
  "アイテムレベル: 83",
  "--------",
  "ブロック率 +17%",
  "--------",
  "150から221の火ダメージを追加する",
  "6から342の雷ダメージを追加する",
  "全ての近接スキルのレベル +5",
  "倒した敵1体ごとに77のライフを獲得する",
  "この武器でキリングヒット時に20%の確率で猛攻を獲得する",
  "アタックスキルによる元素ダメージが128%増加する",
].join(NL);

/** レアの兜の頭 (アイテムレベルまで)。塊の並びを変えて使う */
const HELM_HEAD = ["アイテムクラス: 兜", "レアリティ: レア", "復讐の拍車", "ルーンマスターの装甲帽子", "--------", "アイテムレベル: 80"];

describe("火力チェック: 日本語のアイテム → PoB の文面", () => {
  it("レアの武器を英語にする (暗黙と明示を分ける)", async () => {
    const it = await toPobItem(STAFF);
    expect(it.base).toBe("Aegis Quarterstaff");
    expect(it.ambiguous).toEqual([]);
    expect(it.unread).toEqual([]);
    const lines = it.text.split(NL);
    expect(lines.slice(0, 6)).toEqual(["Rarity: Rare", "Rift Post", "Aegis Quarterstaff", "Item Level: 83", "Quality: 20", "Implicits: 1"]);
    expect(lines).toContain("Adds 150 to 221 Fire Damage");
    expect(lines).toContain("Adds 6 to 342 Lightning Damage");
    expect(lines).toContain("+5 to Level of all Melee Skills");
    expect(lines).toContain("128% increased Elemental Damage with Attacks");
    expect(it.lines.filter((l) => l.kind === "implicit").map((l) => l.ja)).toEqual(["ブロック率 +17%"]);
  });

  it("英語のコピーはそのまま", async () => {
    const en = ["Item Class: Rings", "Rarity: Rare", "Doom Loop", "Ruby Ring", "--------", "Item Level: 80", "--------", "+30% to Fire Resistance"].join(NL);
    const it = await toPobItem(en);
    expect(it.english).toBe(true);
    expect(it.text).toBe(en);
    expect(it.base).toBe("Ruby Ring");
  });

  it("PoB の英語の行を日本語で出す", async () => {
    const ja = await linesToJa(["Adds 150 to 221 Fire Damage", "+5 to Level of all Melee Skills", "+17% Chance to Block", "no such line"]);
    expect(ja).toEqual(["150から221の火ダメージを追加する", "全ての近接スキルのレベル +5", "ブロック率 +17%", "no such line"]);
  });

  it("レアの名前 (Words の前の言葉 + 後ろの言葉)", () => {
    expect(rareNameJa("Vengeance Spur")).toBe("復讐の拍車");
    expect(rareNameJa("Brood Gorget")).toBe("思案する喉当て");
    expect(rareNameEn("亀裂のあるポスト")).toBe("Rift Post");
  });

  // 行末の注記が有る文面 (取引所の日本語: " (implicit)" " (rune)" は英語のまま)。注記が有る時は注記で分類する
  it("注記つき (implicit / rune) の日本語の行", async () => {
    const text = [
      ...HELM_HEAD,
      "--------",
      "最大ライフ +30 (rune)",
      "絆 投射物ダメージが20%増加する (rune)",
      "--------",
      "回避力が98%増加する (implicit)",
      "--------",
      "最大マナ +136",
      "冷気耐性 +58%",
      "--------",
      "コラプト状態",
    ].join(NL);
    const it = await toPobItem(text);
    expect(it.unread).toEqual([]);
    expect(it.lines.map((l) => l.kind)).toEqual(["rune", "rune", "implicit", "explicit", "explicit"]);
    const lines = it.text.split(NL);
    expect(lines).toContain("Implicits: 3");
    // 取引所の日本語の絆 (2026-10-02 エンジン点検で読めていなかった)
    expect(lines).toContain("{rune}Bonded: 20% increased Projectile Damage");
    expect(lines).toContain("{rune}+30 to maximum Life");
    expect(lines).toContain("98% increased Evasion Rating");
    expect(lines).toContain("+136 to maximum Mana");
    expect(lines.at(-1)).toBe("Corrupted");
  });

  // (1) 塊の中の行が 1 つも辞書に当たらなくても塊は残す (黙って捨てると塊の数が減って暗黙が明示に化けた)
  it("全部読めない塊は unread に出し、塊の数に数える (暗黙が明示に化けない)", async () => {
    const text = [...HELM_HEAD, "--------", "辞書に無い暗黙の行 12", "--------", "最大マナ +136", "冷気耐性 +58%"].join(NL);
    const it = await toPobItem(text);
    expect(it.unread).toEqual(["辞書に無い暗黙の行 12"]);
    expect(it.lines.map((l) => l.kind)).toEqual(["explicit", "explicit"]);
    expect(it.text.split(NL)).toContain("Implicits: 0");
  });

  it("ユニークのフレーバーテキストだけ捨てる (数字が無く、どの行も当たらない / フレーバーの辞書にある行)", async () => {
    const text = [
      "アイテムクラス: アミュレット",
      "レアリティ: ユニーク",
      "アストラメンティス",
      "星のアミュレット",
      "--------",
      "アイテムレベル: 80",
      "--------",
      "最大マナ +136",
      "冷気耐性 +58%",
      "--------",
      "「星々の中に、我らの未来が見える。私の計画は星座を繋ぐ",
      "線のように完成している。」",
      "--------",
      "コラプト状態",
    ].join(NL);
    const it = await toPobItem(text);
    expect(it.unread).toEqual([]);
    expect(it.name).toBe("アストラメンティス");
    expect(it.lines.map((l) => l.kind)).toEqual(["explicit", "explicit"]);
    expect(it.text.split(NL).slice(0, 3)).toEqual(["Rarity: Unique", "Astramentis", "Stellar Amulet"]);
  });

  // (2) スキル付与 (ClientStrings ItemDisplayGrantedSkill「スキルを付与: レベル {1} {0}」)。PoB はこれで item.grantedSkills を作りミニオンのスキル組の元にする
  it("スキル付与の行を Grants Skill にする", async () => {
    const text = [
      "アイテムクラス: セプター",
      "レアリティ: レア",
      "亀裂のあるポスト",
      "お告げのセプター",
      "--------",
      "アイテムレベル: 80",
      "--------",
      "スキルを付与: レベル 20 ボーンブラスト",
      "--------",
      "最大マナ +136",
    ].join(NL);
    const it = await toPobItem(text);
    expect(it.unread).toEqual([]);
    expect(it.lines[0]).toMatchObject({ en: "Grants Skill: Level 20 Bone Blast", kind: "implicit" });
    expect(it.text.split(NL)).toContain("Grants Skill: Level 20 Bone Blast");
    // レベル無し (NoScaling「付与するスキル: {0}」) と、以前 linesToJa が作っていた形も受ける
    const noLevel = await toPobItem([...HELM_HEAD, "--------", "付与するスキル: パリィ", "--------", "最大マナ +136"].join(NL));
    expect(noLevel.lines[0]!.en).toBe("Grants Skill: Parry");
    const old = await toPobItem([...HELM_HEAD, "--------", "スキル付与: ボーンブラスト Lv 20", "--------", "最大マナ +136"].join(NL));
    expect(old.lines[0]!.en).toBe("Grants Skill: Level 20 Bone Blast");
    // 逆方向はゲームの表記で出す
    expect(await linesToJa(["Grants Skill: Level 20 Bone Blast", "Grants Skill: Parry"])).toEqual(["スキルを付与: レベル 20 ボーンブラスト", "付与するスキル: パリィ"]);
  });

  // (3) 品質の種類 (カタリスト)。PoB は `Quality (Attack Modifiers): +20%` を Item.lua:558 で catalyst として読む
  it("品質 (アタックモッド) は Quality (Attack Modifiers) にする", async () => {
    const text = ["アイテムクラス: 指輪", "レアリティ: レア", "亀裂のあるポスト", "ルビーの指輪", "--------", "品質 (アタックモッド): +20%", "--------", "アイテムレベル: 80", "--------", "最大マナ +136"].join(NL);
    const it = await toPobItem(text);
    const lines = it.text.split(NL);
    expect(lines).toContain("Quality (Attack Modifiers): +20%");
    expect(lines).not.toContain("Quality: 20");
    // 空白の揺れ (クライアントは「品質(防御力モッド)」とも書く)
    const def = await toPobItem(text.replace("品質 (アタックモッド)", "品質(防御力モッド)"));
    expect(def.text.split(NL)).toContain("Quality (Defence Modifiers): +20%");
  });

  // (4) 日本語の型にリテラルの「-」がある組 (「静止中の混沌耐性 -{0}%」↔「{0}% to Chaos Resistance while stationary」)
  it("負号が落ちない (順方向) / 二重にならない (逆方向)", async () => {
    const it = await toPobItem([...HELM_HEAD, "--------", "最大マナ +136", "静止中の混沌耐性 -15%"].join(NL));
    expect(it.unread).toEqual([]);
    expect(it.text.split(NL)).toContain("-15% to Chaos Resistance while stationary");
    const ja = await linesToJa(["-15% to Chaos Resistance while stationary", "-20 to Deflection Rating per 10 maximum Runic Ward", "-5 to Evasion Rating while you have Phasing"]);
    expect(ja).toEqual(["静止中の混沌耐性 -15%", "最大ルーンワード10ごとに受け流し力 -20", "透明化中の回避力 -5"]);
  });

  // (5) 日本語が同じベース (神秘の装束 = Arcane Raiment / Mystic Raiment)
  it("衝突するベース名は 文面の手がかりで絞り、絞れなければ ambiguous", async () => {
    const body = (props: string[]) => ["アイテムクラス: 鎧", "レアリティ: レア", "亀裂のあるポスト", "神秘の装束", "--------", ...props, "--------", "アイテムレベル: 80", "--------", "最大マナ +136"].join(NL);
    // エナジーシールドの値が Arcane Raiment の素 (138) より小さい → Mystic Raiment
    const byEs = await toPobItem(body(["エナジーシールド: 120"]));
    expect(byEs.base).toBe("Mystic Raiment");
    expect(byEs.ambiguous).toEqual([]);
    // 要求レベルが Arcane Raiment の 73 より低い → Mystic Raiment
    const byLevel = await toPobItem(body(["エナジーシールド: 300", "--------", "装備要求:", "レベル: 60", "知性: 100"]));
    expect(byLevel.base).toBe("Mystic Raiment");
    // どちらとも取れる → 候補を出し、先頭を使う
    const amb = await toPobItem(body(["エナジーシールド: 300"]));
    expect(amb.ambiguous).toEqual(["Arcane Raiment", "Mystic Raiment"]);
    expect(amb.base).toBe("Arcane Raiment");
    // 種類の違う衝突 (整列のフォーカス = Array Buckler / Arrayed Focus) はアイテムクラスで
    const focus = await toPobItem(["アイテムクラス: フォーカス", "レアリティ: レア", "亀裂のあるポスト", "整列のフォーカス", "--------", "アイテムレベル: 80", "--------", "最大マナ +136"].join(NL));
    expect(focus.base).toBe("Arrayed Focus");
    expect(focus.ambiguous).toEqual([]);
  });

  // (6) ベースの辞書は PoB の itemBases にある物だけ (「ゴールド」= 通貨を拾わない)
  it("ベースでない物 (通貨) を includes で拾わない", async () => {
    const text = ["アイテムクラス: アミュレット", "レアリティ: レア", "亀裂のあるポスト", "ゴールドアミュレット", "--------", "アイテムレベル: 80", "--------", "最大マナ +136"].join(NL);
    await expect(toPobItem(text)).rejects.toThrow("ベースの名前が読めません");
    // 本当のベース名なら読める
    const ok = await toPobItem(text.replace("ゴールドアミュレット", "金のアミュレット"));
    expect(ok.base).toBe("Gold Amulet");
  });

  // (7) 詳細コピー (Ctrl+Alt+C): 見出し `{ … }` と「30(20-40)」の範囲の表示
  it("詳細コピーの範囲の括弧は注記ではない (外の数値だけで読む)、見出しで種類が決まる", async () => {
    const text = [
      ...HELM_HEAD,
      "--------",
      "{ 暗黙モッド }",
      "冷気耐性 +35(30-40)%",
      "--------",
      "{ プレフィックスモッド「健康な」 (ティア: 3) — ライフ }",
      "最大ライフ +30(20-40)",
      "{ フラクチャー サフィックスモッド 「マナの」 (ティア: 2) — マナ }",
      "最大マナ +136(130-139)",
    ].join(NL);
    const it = await toPobItem(text);
    expect(it.unread).toEqual([]);
    expect(it.lines.map((l) => [l.en, l.kind])).toEqual([
      ["+35% to Cold Resistance", "implicit"],
      ["+30 to maximum Life", "explicit"],
      ["+136 to maximum Mana", "fractured"],
    ]);
    const lines = it.text.split(NL);
    expect(lines).toContain("Implicits: 1");
    expect(lines).toContain("{fractured}+136 to maximum Mana");
  });

  // (8) 未鑑定 / ミラー状態 / 聖別化 (ClientStrings ItemPopupUnidentified / ItemPopupMirrored / ItemPopupSanctified)
  it("未鑑定は unidentified で返し PoB には暗黙だけ、ミラー状態と聖別化は PoB の行", async () => {
    const unid = await toPobItem(["アイテムクラス: 兜", "レアリティ: レア", "ルーンマスターの装甲帽子", "--------", "アイテムレベル: 80", "--------", "回避力が98%増加する", "--------", "未鑑定"].join(NL));
    expect(unid.unidentified).toBe(true);
    expect(unid.unread).toEqual([]);
    expect(unid.text.split(NL)).toEqual(["Rarity: Rare", "Runemastered Armoured Cap", "Item Level: 80", "Implicits: 1", "98% increased Evasion Rating"]);
    const mir = await toPobItem([...HELM_HEAD, "--------", "最大マナ +136", "--------", "コラプト状態", "--------", "ミラー状態", "--------", "聖別化"].join(NL));
    expect(mir.unidentified).toBe(false);
    expect(mir.unread).toEqual([]);
    expect(mir.text.split(NL).slice(-3)).toEqual(["Corrupted", "Mirrored", "Sanctified"]);
  });

  // (9) 注記が無く、ルーンの塊が明示より後ろに来る並び。行が全部ルーンの効果の文面 (stage-runes.json) ならルーン
  it("注記なしでルーンの塊が後ろにあっても 明示が暗黙に化けない", async () => {
    const text = [
      "アイテムクラス: クォータースタッフ",
      "レアリティ: レア",
      "亀裂のあるポスト",
      "イージスクォータースタッフ",
      "--------",
      "ソケット: S S",
      "--------",
      "アイテムレベル: 83",
      "--------",
      "ブロック率 +17%",
      "--------",
      "全ての近接スキルのレベル +5",
      "アタックスキルによる元素ダメージが128%増加する",
      "--------",
      "4から6の火ダメージを追加する",
    ].join(NL);
    const it = await toPobItem(text);
    expect(it.unread).toEqual([]);
    expect(it.lines.map((l) => l.kind)).toEqual(["implicit", "explicit", "explicit", "rune"]);
    const lines = it.text.split(NL);
    expect(lines).toContain("Sockets: S S");
    expect(lines).toContain("Implicits: 2");
    expect(lines).toContain("{rune}Adds 4 to 6 Fire Damage");
    expect(lines.indexOf("{rune}Adds 4 to 6 Fire Damage")).toBeLessThan(lines.indexOf("+5 to Level of all Melee Skills"));
  });

  // (10) fractured / desecrated / crafted の注記 → PoB の {fractured} 等 (Item.lua の lineFlags)。明示側なので Implicits: に数えない
  it("fractured などの注記は PoB の印にする", async () => {
    const text = [...HELM_HEAD, "--------", "回避力が98%増加する (implicit)", "--------", "最大マナ +136 (fractured)", "冷気耐性 +58% (desecrated)", "最大ライフ +30 (クラフト)"].join(NL);
    const it = await toPobItem(text);
    expect(it.unread).toEqual([]);
    expect(it.lines.map((l) => l.kind)).toEqual(["implicit", "fractured", "desecrated", "crafted"]);
    const lines = it.text.split(NL);
    expect(lines).toContain("Implicits: 1");
    expect(lines.slice(lines.indexOf("Implicits: 1"))).toEqual(["Implicits: 1", "98% increased Evasion Rating", "{fractured}+136 to maximum Mana", "{desecrated}+58% to Cold Resistance", "{crafted}+30 to maximum Life"]);
  });
});
