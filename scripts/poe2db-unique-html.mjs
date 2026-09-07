/**
 * poe2db-unique-html.mjs
 * --------------------------------------------------------------
 * POE2DB ユニーク一覧ページの HTML パース (タグ除去 / ブロック分解)。
 * build-unique-mods-ja.mjs (413 行) から切り出し (2026-09-07 R4)。
 */

/**
 * HTML 文字列から `<` `>` タグを除去してプレーンテキストに。
 * `<span class="ndash">—</span>` 等を含むので、まずタグだけ削る。
 * その後 `&amp;` `&nbsp;` `&#39;` 等の最低限の HTML エンティティを復元。
 *
 * Data-L2 修正 (2026-05-22): poe2db 側で 1 つの `<div class="explicitMod">` 内に
 * 複数の MOD 行が `<br>` 区切りで連結されているケース (例:
 *   `Accuracy Rating is Doubled<br>Never deal Critical Hits`)
 * があるため、`<br>` を強制的に改行に変換してからタグ除去する。
 * 戻り値は `splitByNewlines=true` の場合 string[] になり、呼び側で個別 MOD と
 * して使える (false 互換: 単一 string、空白圧縮で連結).
 */
export function htmlToText(html, opts = {}) {
  const splitByNewlines = opts.splitByNewlines === true;
  let s = html;
  // Data-L2: `<br>` `<br/>` `<br />` を改行マーカーに変換 (タグ除去前にやる)
  s = s.replace(/<br\s*\/?>/gi, "\n");
  // tag remove
  s = s.replace(/<[^>]+>/g, "");
  // HTML entities (最低限)
  s = s.replace(/&nbsp;/g, " ");
  s = s.replace(/&amp;/g, "&");
  s = s.replace(/&lt;/g, "<");
  s = s.replace(/&gt;/g, ">");
  s = s.replace(/&quot;/g, '"');
  s = s.replace(/&#39;/g, "'");
  s = s.replace(/&apos;/g, "'");
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
  if (splitByNewlines) {
    // 各行ごとに空白圧縮 + trim、空行除外
    return s
      .split(/\n+/)
      .map((line) => line.replace(/[\t ]+/g, " ").trim())
      .filter((line) => line.length > 0);
  }
  // 旧互換: 改行も空白扱いでまとめる
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * 1 ページ HTML を「ユニーク単位ブロック」に分解。
 *
 * 観測 (2026-05-22, /jp/Ring):
 *   <div class="d-flex border-top rounded">
 *     <div class="flex-shrink-0"><a class="UniqueItems UniqueItem" ... href="<Slug>">...</a></div>
 *     <div class="flex-grow-1 ms-2">
 *       <div><a class="UniqueItem" ... href="/<lang>/<Slug>"><span class="uniqueName">...</span> <span class="uniqueTypeLine">...</span></a></div>
 *       <div class="explicitMod">...</div>
 *       <div class="explicitMod">...</div>
 *       ...
 *     </div>
 *   </div>
 *
 * 戻り値: [{ slug, mods: [<plain text>, ...] }, ...]
 *   - slug は `<a class="UniqueItems UniqueItem" ... href="...">` の最初に出る
 *     href (バーストラ無し ナマ slug)。Sekhema's Resolve が 3 ベース分繰り返される
 *     ようなページもあるが、slug ベースなのでマージできる。
 */
export function parseUniqueBlocks(html) {
  const blocks = [];
  // d-flex border-top rounded で split (最初の要素はヘッダ部分なので捨てる)
  const parts = html.split(/<div class="d-flex border-top rounded">/);
  if (parts.length <= 1) return blocks;
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    // 次の </div></div></div></div> 系で end が来るが、ここでは
    // 同一文字列内で「class="UniqueItems UniqueItem" ... href="<slug>"」を取り、
    // 続く explicitMod を貪欲に集める (block 終端は次の "d-flex border-top rounded"
    // 分割で自然に確定するため、現在の chunk 内に閉じこめられる)
    // 2026-09-07: poe2db が 2026-05-22〜06-01 の間に class の casing を
    // "UniqueItems uniqueitem" → "UniqueItems UniqueItem" に変えており、
    // 以降この match が全ページで空振りして entries: 0 → 辞書を空で上書きしていた。
    // 再発防止として大文字小文字を無視する (i フラグ)。
    const m =
      chunk.match(/class="UniqueItems UniqueItem"[^>]*href="([^"\/]+)"/i);
    if (!m) continue;
    const slug = m[1];
    const modMatches = [
      ...chunk.matchAll(
        /<div class="explicitMod">([\s\S]*?)<\/div>(?=\s*(?:<div class="(?:explicitMod|implicitMod|enchantMod|flavourText|d-flex)|<\/div>))/g,
      ),
    ];
    // フォールバック: 上の lookahead が空振りした場合は単純 lazy match
    const fallback =
      modMatches.length === 0
        ? [...chunk.matchAll(/<div class="explicitMod">([\s\S]*?)<\/div>/g)]
        : modMatches;
    // Data-L2: 1 explicitMod の中身を `<br>` で分割可能なら個別 MOD として展開する。
    // 旧実装は htmlToText が改行を空白圧縮するため、
    // `Accuracy Rating is Doubled<br>Never deal Critical Hits` のような MOD が
    // 1 文字列に潰れて辞書キーが「Accuracy Rating is DoubledNever deal Critical Hits」
    // のような連結文字列で固定化されていた (unique-mods-ja.json の混入バグ)。
    const mods = [];
    for (const m2 of fallback) {
      const lines = htmlToText(m2[1], { splitByNewlines: true });
      for (const line of lines) {
        if (line.length > 0) mods.push(line);
      }
    }
    if (mods.length === 0) continue;
    blocks.push({ slug, mods });
  }
  return blocks;
}
