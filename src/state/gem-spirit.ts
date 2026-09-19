/**
 * gem-spirit.ts — そのジェムが「スピリットをリザーブするか」を実データで覚える (2026-09-19)
 *
 * オーナー「カルグールスキルは原石が違うよね」。原石の種類 (スキルジェムの原石 /
 * スピリットジェムの原石) は、これまでクライアントの GemTags に `persistent` が
 * あるかどうかという**推定**で決めていた。レムナントオブカルグールはその推定では
 * スピリット扱いになるが、クライアントの表からは ヘラルドオブアイス と区別が付かず、
 * 判定の根拠になる CraftingLevel は書き出しが古くて当てにならなかった。
 *
 * 決め手は出品そのものにある。取得済みの出品 (app_data/trade2-debug.json) を見ると:
 *   アーク       … Cost ['90 Mana']              → スキルジェムの原石
 *   アーチメイジ … リザーブ ['100[Spirit|スピリット]'] → スピリットジェムの原石
 * リザーブの行はコラプト済みの出品にも出るので、**いま取っている売値の応答から
 * そのまま読める** (新しいリクエストは 1 本も要らない)。
 *
 * ここはその結果を覚えておく場所。読めた物は実測を、まだ読めていない物は
 * クライアントの推定 (gems-client.json の spirit) を使う。
 */
const KEY = "exiledesk.gem.spirit";

type Book = Record<string, boolean>;

function load(): Book {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Book;
  } catch {
    return {};
  }
}

let book: Book | null = null;

function all(): Book {
  if (book == null) book = load();
  return book;
}

/** 出品から読めた結果を覚える (null = 読めなかったので触らない) */
export function noteSpiritGem(nameEn: string | null | undefined, reserves: boolean | null): void {
  if (!nameEn || reserves == null) return;
  const b = all();
  if (b[nameEn] === reserves) return;
  b[nameEn] = reserves;
  try {
    localStorage.setItem(KEY, JSON.stringify(b));
  } catch {
    /* 保存できなくてもその場の判定には使える */
  }
}

/** 実測があればそれを、無ければクライアントの推定を返す */
export function isSpiritGem(nameEn: string | null | undefined, fallback: boolean): boolean {
  if (!nameEn) return fallback;
  const v = all()[nameEn];
  return typeof v === "boolean" ? v : fallback;
}

/** その判定が実測か推定か (画面の説明に出す) */
export function spiritGemMeasured(nameEn: string | null | undefined): boolean {
  return !!nameEn && typeof all()[nameEn] === "boolean";
}
