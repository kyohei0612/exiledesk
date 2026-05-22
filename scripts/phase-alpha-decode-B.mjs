#!/usr/bin/env node
/**
 * Phase α: poe.ninja /poe2/api/builds/{version}/search の protobuf decode PoC (B 案: 簡易抽出)
 *
 * 設計方針:
 *   - 公式 .proto 未公開のため、protobuf wire format を最低限解釈しつつ
 *     **printable ASCII 文字列のみを順序を保って抽出**する。
 *   - account-discriminator パターン (`<英数字>-<4桁数字>`) を検出し、
 *     その直後に現れる文字列を characterName として採用する。
 *   - スキーマ変更耐性が高い (フィールド ID が動いても動く)、依存ゼロ。
 *
 * 流れ:
 *   1. GET /poe2/api/data/index-state               → version, snapshotName を動的解決
 *   2. GET /poe2/api/builds/{version}/search?...    → application/x-protobuf
 *   3. wire format をスキャンして文字列列 (length-delimited, wire_type=2) を取り出す
 *   4. account-discriminator + name のペアを上位 50 件抽出
 *   5. JSON で stdout に出力
 *
 * 実行: node scripts/phase-alpha-decode-B.mjs
 *
 * @author engineering-B
 * @date 2026-05-22
 */

import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

// -------- 設定 --------
const NINJA = "https://poe.ninja";
const TARGET_CLASS = "Blood Mage"; // PoC 固定
const SORT_KEY = "dps";
const TOP_N = 50;
const USER_AGENT = "ExileDesk/0.1.4-alpha (phase-alpha-decode-B; contact: nekodori0612@gmail.com)";

// -------- ユーティリティ --------
function log(...args) {
  process.stderr.write(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ") + "\n");
}

async function httpJson(url) {
  log(`[fetch JSON] ${url}`);
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function httpBinary(url) {
  log(`[fetch bin ] ${url}`);
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/x-protobuf" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  log(`[fetch bin ] -> ${buf.length} bytes (Content-Type=${res.headers.get("content-type")})`);
  return buf;
}

// -------- protobuf wire format パーサ (最低限) --------
//
// wire format:
//   各レコード = タグ(varint) + ペイロード
//   タグ = (field_number << 3) | wire_type
//   wire_type:
//     0 = varint                    (1 byte ~ 10 bytes)
//     1 = 64-bit fixed              (8 bytes)
//     2 = length-delimited          (varint length + bytes)
//     5 = 32-bit fixed              (4 bytes)
//   3, 4 (group start/end) は廃止扱い、無視
//
// B 案では length-delimited (wire_type=2) のペイロードを集め、その「並び」と
// 「親フィールドの直前にある printable ASCII ラベル」を手がかりに
// account/characterName を抽出する。
//
// 実機観測 (snapshot fate-of-the-vaal / Blood Mage / sort=dps) から判明した構造:
//   1. 親メッセージに "name" というラベル文字列フィールドが現れる
//   2. その後に **characterName の連続配列** が parentField=2, depth=3 で並ぶ
//   3. 次に "account" ラベル
//   4. その後に **account-discriminator の連続配列** (同じシグネチャ) が並ぶ
//   5. 次に "class" など別フィールドのラベル
//
// → ラベル→連続ブロック→ラベル の構造を検出して同順序でペアリングする。
//   両配列は同サイズの想定 (= search topK 件数、~96)。
//
// 安全装置: 不正なデータでも壊れず止まるよう、各 read 関数は範囲外で null を返す。

/** varint を読む。{ value: bigint, next: number } を返す。失敗時 null。 */
function readVarint(buf, offset) {
  let result = 0n;
  let shift = 0n;
  let i = offset;
  while (i < buf.length) {
    const b = buf[i++];
    result |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) {
      return { value: result, next: i };
    }
    shift += 7n;
    if (shift > 63n) return null; // varint 長すぎ
  }
  return null;
}

/** printable ASCII (0x20-0x7e) + tab のみで構成されているか */
function isPrintableAscii(buf) {
  if (buf.length === 0) return false;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    // 0x20-0x7E printable, 0x09 tab は許容しない (文字列だけ取りたい)
    if (b < 0x20 || b > 0x7e) return false;
  }
  return true;
}

/**
 * バイト列が「ネストした protobuf message」っぽいかをラフ判定。
 * 先頭タグの wire_type が 0/2/5 のいずれかで、長さが妥当ならネスト試行する。
 * これは「文字列でないバイト列」がたまたま printable じゃないだけで
 * 内部にさらに文字列を含むケースを掘り下げるため。
 */
function looksLikeMessage(buf) {
  if (buf.length < 2) return false;
  // 先頭タグを試しに読んで、wire_type が 0/1/2/5 のいずれかか
  const v = readVarint(buf, 0);
  if (!v) return false;
  const tag = Number(v.value);
  const wt = tag & 0x7;
  return wt === 0 || wt === 1 || wt === 2 || wt === 5;
}

/**
 * protobuf message を再帰スキャンし、length-delimited フィールドのうち
 * printable ASCII のものを「文字列レコード」として集める。
 *
 * 各レコードには以下のメタを付ける:
 *   - offset: 親メッセージのルートからのバイト位置 (ペア判定で順序保証に使う)
 *   - field:  自分のフィールド番号
 *   - parent: 自分が入っていた親メッセージのフィールド番号 (-1 = ルート)
 *   - depth:  ルートからの深さ
 *
 * @param {Buffer} buf
 * @param {number} baseOffset 親メッセージ内での開始オフセット (出力に加算する)
 * @param {Array} out
 * @param {number} depth 安全のための再帰深度ガード
 * @param {number} parentField 親メッセージの field 番号
 */
function scanMessage(buf, baseOffset, out, depth, parentField) {
  if (depth > 8) return;
  let i = 0;
  while (i < buf.length) {
    const tagRead = readVarint(buf, i);
    if (!tagRead) return;
    const tag = Number(tagRead.value);
    const wt = tag & 0x7;
    const fn = tag >> 3;
    i = tagRead.next;

    if (wt === 0) {
      const v = readVarint(buf, i);
      if (!v) return;
      i = v.next;
    } else if (wt === 1) {
      i += 8;
      if (i > buf.length) return;
    } else if (wt === 5) {
      i += 4;
      if (i > buf.length) return;
    } else if (wt === 2) {
      const lenRead = readVarint(buf, i);
      if (!lenRead) return;
      const len = Number(lenRead.value);
      i = lenRead.next;
      if (len < 0 || i + len > buf.length) return;
      const slice = buf.subarray(i, i + len);
      const sliceOffset = baseOffset + i;
      if (isPrintableAscii(slice)) {
        out.push({
          offset: sliceOffset,
          text: slice.toString("ascii"),
          field: fn,
          parent: parentField,
          depth,
        });
      } else if (looksLikeMessage(slice)) {
        scanMessage(slice, sliceOffset, out, depth + 1, fn);
      }
      i += len;
    } else {
      return;
    }
  }
}

// -------- ペア抽出ロジック --------
//
// account-discriminator: poe.ninja の表示形式は `<accountName>-<4桁数字>` (例: AsmodeusPOE-0579)
// account の直後にネストメッセージとして characterName が並んでいる、というのが
// リサーチ A の実測 (printable string 抽出だけで取れる) からの仮定。

const ACCOUNT_RE = /^[A-Za-z0-9_]{2,32}-\d{4}$/;

// メタデータ系の文字列 (search レスポンスにスキーマ定義として埋まっている、
// リサーチ A.md の §3 で列挙されたフィールド名一覧) は除外する。
const META_WORDS = new Set([
  // 処理段階名
  "Start Search", "ApplyFilters", "ApplyIntegerFilters", "ApplyFloatFilters",
  "ApplySearchFilters", "SelectTopK", "PopulateValues", "PopulateDimensionCounts",
  "PopulateIntegerDimensionMetadata", "PopulateFloatDimensionMetadata",
  "BuildResult", "End Search",
  // スキーマフィールド名
  "class", "weaponmode", "items", "skills", "keypassives", "anointed", "allskills",
  "level", "life", "energyshield", "mana", "spirit", "movementspeed", "liferegen",
  "itemrarity", "fireres", "coldres", "lightningres", "chaosres",
  "echarges", "fcharges", "pcharges", "armour", "evasion", "deflect", "block",
  "phystakenas", "uequip", "mequip", "mweapons", "marmours",
  "physicalmax", "firemax", "coldmax", "lightningmax", "chaosmax", "lowestmax",
  "dps", "ehp", "name", "account",
]);

/**
 * search レスポンスでは、ラベル文字列 (例: `name`, `account`, `class`) が
 * 「フィールド名スキーマ」として埋め込まれており、その直後に当該フィールドの
 * **値の連続配列** が同じ (parent, depth) シグネチャで並んでいる構造。
 *
 * → ラベルから次のラベルまでの間に出現する文字列を「そのフィールドの値配列」
 *   として切り出す。
 *
 * @param {Array} strings scanMessage の出力 (offset 順)
 * @param {string} labelText 切り出したいラベル名 (例: "account")
 * @returns {string[]} 値配列
 */
// 実機観測 (2026-05-22 / Blood Mage / fate-of-the-vaal):
//   ラベル文字列のシグネチャ: parent=5, depth=2
//   値配列のシグネチャ:       parent=2, depth=3
// これらは snapshot ごとにはほぼ不変だが、構造的に正しいのは
// 「ラベルの直後から、次のラベル (= parent=5, depth=2) の直前まで」を
// その配列とすること。シグネチャ判定はバックアップに使う。
function sliceBlockAfterLabel(strings, labelText) {
  const LABEL_PARENT = 5;
  const LABEL_DEPTH = 2;

  const labelIdx = strings.findIndex(
    (s) => s.text === labelText && s.parent === LABEL_PARENT && s.depth === LABEL_DEPTH,
  );
  if (labelIdx < 0) return [];

  const block = [];
  for (let i = labelIdx + 1; i < strings.length; i++) {
    const s = strings[i];
    // 次のラベル (= 同じシグネチャの単一英単語) で打ち切り
    if (s.parent === LABEL_PARENT && s.depth === LABEL_DEPTH) break;
    // depth=3 / parent=2 が値配列のシグネチャ。それ以外 (異なる depth/parent の
    // ノイズ) は無視。
    if (s.parent !== 2 || s.depth !== 3) continue;
    block.push(s.text);
  }
  return block;
}

function extractPairs(strings, topN) {
  const accounts = sliceBlockAfterLabel(strings, "account");
  const names = sliceBlockAfterLabel(strings, "name");

  // PoC: 同 index ペアリング。accounts のほうが多い場合 (printable 判定で
  // name が脱落するケース) は短い方に合わせる。
  const n = Math.min(accounts.length, names.length);
  const pairs = [];
  for (let i = 0; i < n && pairs.length < topN; i++) {
    const acct = accounts[i];
    const nm = names[i];
    // 軽い妥当性チェック
    if (!ACCOUNT_RE.test(acct)) continue;
    if (META_WORDS.has(nm)) continue;
    pairs.push({ account: acct, name: nm });
  }
  return { pairs, accountsTotal: accounts.length, namesTotal: names.length };
}

// -------- メイン --------

async function main() {
  // 1. index-state で version / snapshotName を動的解決
  const indexState = await httpJson(`${NINJA}/poe2/api/data/index-state`);
  const economy = indexState.economyLeagues?.[0];
  const snap = indexState.snapshotVersions?.[0];
  if (!economy || !snap) {
    throw new Error("index-state にリーグ/スナップショット情報が見つからない");
  }
  const version = snap.version;
  const snapshotName = snap.snapshotName;
  log(`[resolve] league=${economy.url} snapshotName=${snapshotName} version=${version}`);

  // 2. search を叩いて protobuf バイナリ取得
  const searchUrl = new URL(`${NINJA}/poe2/api/builds/${version}/search`);
  searchUrl.searchParams.set("overview", snapshotName);
  searchUrl.searchParams.set("class", TARGET_CLASS); // URLSearchParams は ' ' を '+' エンコードする
  searchUrl.searchParams.set("sort", SORT_KEY);
  const buf = await httpBinary(searchUrl.toString());

  // 3. wire format をスキャンして文字列を取り出す
  const strings = [];
  scanMessage(buf, 0, strings, 0, -1);
  log(`[decode] extracted ${strings.length} printable strings`);

  // 4. ラベルベース順序ペアリングで account / name を抽出
  const { pairs, accountsTotal, namesTotal } = extractPairs(strings, TOP_N);
  log(`[extract] accountsBlockSize=${accountsTotal} namesBlockSize=${namesTotal} paired=${pairs.length}`);

  // 5. JSON で stdout に出す
  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      league: economy.url,
      leagueName: economy.name,
      snapshotName,
      version,
      class: TARGET_CLASS,
      sort: SORT_KEY,
      searchUrl: searchUrl.toString(),
      decoder: "engineering-B simple-extract (no protobufjs)",
      payloadBytes: buf.length,
      stringsExtracted: strings.length,
      accountsBlockSize: accountsTotal,
      namesBlockSize: namesTotal,
      pairsExtracted: pairs.length,
    },
    results: pairs,
  };
  process.stdout.write(JSON.stringify(output, null, 2) + "\n");

  // おまけ: data-cache 配下にも保存しておく (後段でレポートに引用するため)
  try {
    const cacheDir = resolve(ROOT, "data-cache", "phase-alpha");
    await mkdir(cacheDir, { recursive: true });
    await writeFile(
      resolve(cacheDir, "decode-B-result.json"),
      JSON.stringify(output, null, 2),
      "utf8",
    );
    log(`[save] -> data-cache/phase-alpha/decode-B-result.json`);
  } catch (e) {
    log(`[save] skipped: ${e?.message ?? e}`);
  }
}

main().catch((e) => {
  log("[fatal]", e?.stack ?? String(e));
  process.exit(1);
});
