/**
 * poe.ninja の search の返り (protobuf) から列を読む。アプリの `src-tauri/src/poe_ninja_client/protobuf.rs` (PbReader・parse_search_column・extract_search_columns) と
 * `search.rs` の is_valid_account をそのまま移した物 (設計図 D-80b「取り方はアプリのまま」)。
 * スキーマを持たず、「f1 = 列 ID の文字、f7 = 値の文字 (行の数だけ)」の形の message を深さ 6 まで探す (2026-09 のリーグ替わりで番号が変わった時の直し)。
 */

type PbValue = { bytes: Uint8Array } | { varint: number } | null;

function readVarint(buf: Uint8Array, offset: number): [number, number] | null {
  let result = 0, mul = 1, i = offset;
  while (i < buf.length) {
    const b = buf[i++]!;
    result += (b & 0x7f) * mul;
    if ((b & 0x80) === 0) return [result, i];
    mul *= 128;
    if (mul > 2 ** 63) return null;
  }
  return null;
}

/** フィールド番号と値の並び。壊れたバイト列に当たったらそこで打ち切る */
function* fields(buf: Uint8Array): Generator<[number, PbValue]> {
  let pos = 0;
  while (pos < buf.length) {
    const tag = readVarint(buf, pos);
    if (!tag) return;
    const wire = tag[0] % 8, no = Math.floor(tag[0] / 8);
    pos = tag[1];
    if (wire === 0) {
      const v = readVarint(buf, pos);
      if (!v) return;
      pos = v[1];
      yield [no, { varint: v[0] }];
    } else if (wire === 1) {
      if (pos + 8 > buf.length) return;
      pos += 8;
      yield [no, null];
    } else if (wire === 2) {
      const len = readVarint(buf, pos);
      if (!len || len[1] + len[0] > buf.length) return;
      const slice = buf.subarray(len[1], len[1] + len[0]);
      pos = len[1] + len[0];
      yield [no, { bytes: slice }];
    } else if (wire === 5) {
      if (pos + 4 > buf.length) return;
      pos += 4;
      yield [no, null];
    } else return;
  }
}

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
const str = (b: Uint8Array): string | null => {
  try {
    return utf8.decode(b);
  } catch {
    return null;
  }
};

/** 列の message を 1 件読む。ID か値が無ければ null (= 列ではない) */
function parseColumn(buf: Uint8Array): [string, string[]] | null {
  let id: string | null = null;
  const values: string[] = [];
  for (const [no, v] of fields(buf)) {
    if (!v || !("bytes" in v)) continue;
    if (no === 1 && id === null) id = str(v.bytes);
    else if (no === 7) {
      const s = str(v.bytes);
      if (s !== null) values.push(s);
    }
  }
  return id !== null && values.length ? [id, values] : null;
}

/** 返り全体から 列 ID → 値の列。同じ ID は最初 (= 一番浅い) の物 */
export function extractSearchColumns(buf: Uint8Array): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const walk = (b: Uint8Array, depth: number): void => {
    if (depth > 6) return;
    for (const [, v] of fields(b)) {
      if (!v || !("bytes" in v)) continue;
      const col = parseColumn(v.bytes);
      if (col && !out.has(col[0])) out.set(col[0], col[1]);
      walk(v.bytes, depth + 1);
    }
  };
  walk(buf, 0);
  return out;
}

/** `<名前>-<4 桁>` の形か (中国語・韓国語の名前も通す、search.rs と同じ) */
export function isValidAccount(s: string): boolean {
  const m = /^(.+)-(\d{4})$/u.exec(s);
  if (!m) return false;
  const head = [...m[1]!];
  return head.length >= 1 && head.length <= 32 && !head.some((c) => /\p{Cc}/u.test(c));
}

export interface Ref {
  account: string;
  name: string;
}

/** search の返りから上位 n 人。name・account の列が無ければ形が変わったとして投げる (アプリと同じ) */
export function searchRefs(buf: Uint8Array, n = 100): Ref[] {
  const cols = extractSearchColumns(buf);
  const names = cols.get("name") ?? [], accounts = cols.get("account") ?? [];
  if (!names.length || !accounts.length) throw new Error(`search: name/account 列が取れない (name=${names.length}, account=${accounts.length}, 列=[${[...cols.keys()].join(", ").slice(0, 200)}])`);
  const out: Ref[] = [];
  for (let i = 0; i < Math.min(names.length, accounts.length, n); i++) if (isValidAccount(accounts[i]!)) out.push({ account: accounts[i]!, name: names[i]! });
  return out;
}
