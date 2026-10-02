/**
 * クラフトステージ: エッセンスの説明の見出し (「アミュレット、靴または手袋に付く」) と部位の言葉の対応 (POE2Tube 要望 ㉔-6 の差分、2026-10-02)
 *
 * [[VideoEssence.vue]] の金の囲い (part=アミュレット でその部位に付く行を強調) は、見出しの文字列に部位の言葉が含まれるかを見ていたので
 * 「宝飾品に付く」「装備に付く」のような上位語の見出しが囲まれなかった (POE2Tube 報告)。
 * 部位 → その部位を含む上位語 (アミュレット → アミュレット / 宝飾品 / 装備) の表を 1 つ持ち、見出しを「、」「または」で部位の言葉に
 * 分けて、どれかが上位語に入っていれば「付く」とする。
 * 見出しの言葉は src/i18n/currency-hover-ja.json のエッセンス (Essence) の g[].h を全部列挙した物から取った (2026-10-02 時点 32 種):
 *   アミュレット / 指輪 / 宝飾品 / ベルト / 鎧 / 兜 / 手袋 / 靴 / 盾 / フォーカス / 防具 / 装備 / 矢筒 / 武器 / マーシャル武器 / 近接武器 /
 *   片手近接武器 / 両手近接武器 / 弓 / クロスボウ / ワンド / スタッフ / セプター (エッセンス以外の説明には キャスター武器 / クォータースタッフ /
 *   スピア / メイス / タリスマン も出る)。見出しに全角スペースが入る物 (「マーシャル武器、 手袋または矢筒に付く」) もあるので空白は取り除く
 */

/** 武器の大きな括り (マーシャル武器 = 物理で殴る・撃つ物、キャスター武器 = 杖・ワンド・セプター) */
const MARTIAL = ["マーシャル武器", "武器", "装備"];
const MELEE_1H = ["片手近接武器", "近接武器", ...MARTIAL];
const MELEE_2H = ["両手近接武器", "近接武器", ...MARTIAL];
const CASTER = ["キャスター武器", "武器", "装備"];
const ARMOUR = ["防具", "装備"];
const JEWELLERY = ["宝飾品", "装備"];

/** 部位の言葉 → その部位が含まれる見出しの言葉 (自分自身も含む)。URL の part= に書く言葉はこの鍵 */
export const PART_WORDS: Record<string, readonly string[]> = {
  アミュレット: ["アミュレット", ...JEWELLERY],
  タリスマン: ["タリスマン", "アミュレット", ...JEWELLERY],
  指輪: ["指輪", ...JEWELLERY],
  宝飾品: JEWELLERY,
  ベルト: ["ベルト", "装備"],
  胴: ["胴", "胴防具", "鎧", ...ARMOUR],
  胴防具: ["胴", "胴防具", "鎧", ...ARMOUR],
  鎧: ["胴", "胴防具", "鎧", ...ARMOUR],
  兜: ["兜", ...ARMOUR],
  手袋: ["手袋", ...ARMOUR],
  靴: ["靴", ...ARMOUR],
  盾: ["盾", ...ARMOUR],
  フォーカス: ["フォーカス", ...ARMOUR],
  防具: ARMOUR,
  矢筒: ["矢筒", "装備"],
  // 近接: メイスは片手 / 両手があるので「メイス」だけなら両方の括りに当てる。クォータースタッフは両手、スピアは片手
  メイス: ["メイス", "片手メイス", "両手メイス", "片手近接武器", "両手近接武器", "近接武器", ...MARTIAL],
  片手メイス: ["メイス", "片手メイス", ...MELEE_1H],
  両手メイス: ["メイス", "両手メイス", ...MELEE_2H],
  クォータースタッフ: ["クォータースタッフ", ...MELEE_2H],
  スピア: ["スピア", ...MELEE_1H],
  近接武器: ["近接武器", ...MARTIAL],
  片手近接武器: MELEE_1H,
  両手近接武器: MELEE_2H,
  // 遠隔のマーシャル武器
  弓: ["弓", ...MARTIAL],
  クロスボウ: ["クロスボウ", ...MARTIAL],
  マーシャル武器: MARTIAL,
  // キャスター武器
  ワンド: ["ワンド", ...CASTER],
  スタッフ: ["スタッフ", ...CASTER],
  セプター: ["セプター", ...CASTER],
  キャスター武器: CASTER,
  武器: ["武器", "装備"],
  装備: ["装備"],
};

/** 見出し「アミュレット、靴または手袋に付く」→ ["アミュレット", "靴", "手袋"] (全角・半角の空白は取り除く) */
export function headingParts(h: string): string[] {
  return h
    .replace(/[\s　]/g, "")
    .replace(/に付く$/, "")
    .split(/、|または/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** その見出しの行が part (URL の part=) の部位に付くか。表に無い言葉はその言葉そのものとだけ比べる */
export function headingHits(h: string, part: string): boolean {
  const p = part.replace(/[\s　]/g, "");
  if (!p) return false;
  const words = new Set(PART_WORDS[p] ?? [p]);
  return headingParts(h).some((w) => words.has(w));
}

/**
 * エッセンスの日本語名 (「肉体」「肉体のエッセンス」) → 英語名の「Essence of ○○」の ○○ (currencyHoverOf の潰した鍵で "thebody")。
 * currencyHoverOf は英数字以外を消すので日本語では引けない → 辞書の n (「肉体のエッセンス」など) から逆引きする。
 * 見つからなければ null。英数字の名前はそのまま返す (逆引き不要)
 */
export async function essenceNameEn(name: string): Promise<string | null> {
  const n = name.trim();
  if (!n) return null;
  if (/^[\x20-\x7e]+$/.test(n)) return n;
  const dict = (await import("../../i18n/currency-hover-ja.json")).default as unknown as Record<string, { n: string }>;
  const ja = n.replace(/の?(レッサー|グレーター|パーフェクト)?エッセンス$/, "");
  // 「レッサー / グレーター / パーフェクト」の付かない無印を優先し、無ければどれでも (ヒステリーなど無印しか無い物もある)
  const keys = Object.keys(dict).filter((k) => /^(lesser|greater|perfect)?essenceof/.test(k) && dict[k]!.n.startsWith(`${ja}の`));
  const key = keys.find((k) => k.startsWith("essenceof")) ?? keys[0];
  return key ? key.replace(/^(lesser|greater|perfect)?essenceof/, "") : null;
}
