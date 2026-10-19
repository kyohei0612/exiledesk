/**
 * share.ts — エミュレーターの手順を URL で渡す (2026-10-12 オーナー「このエミュレーターの手順を共有」)。
 * 手順 (craft-stage-plan/1、手ごとの seed 入り) を縮めて URL の # に全部乗せる。# はサーバーに送られないので、
 * サーバーの負荷も KV も一切使わない (オーナー: KV は絶対に触らない)。受け取った人は再生 (loadReplay) で同じ結果を見る。
 *
 * 共有できる決まり: 最初のカレンシーを打った後に、手で MOD を足して (force: の手) いないこと。
 * 打つ前に手で足した MOD は「始めのベース」として手順に入れたまま渡す (再生でも同じ seed で同じ MOD・同じ値になる)
 */
import { isForce } from "./apply-force";
import { IMPLICIT_SET, isCatalystSet, isQualitySet, ITEM_LEVEL_SET, QUALITY_CAP } from "./apply-currency";
import type { CraftStagePlan } from "./contract";
import type { StartSpec } from "./run-plan";
import { tr } from "../../i18n/lang";

/** URL の # の頭 */
export const SHARE_PREFIX = "#share=";
/**
 * 共有を出すか。2026-10-12 オーナー「共有は一旦なくそう、まだチェックしてないし内容決まってなかった」で止めている (ボタンも #share= の読み込みも)。
 * 仕組みとテストは残すので、中身が決まったら true に戻す
 */
export const SHARE_ENABLED = false;

/** 品質を手で合わせる手は「打った」に数えない (始めのベースの側) */
const isSetting = (key: string): boolean => isQualitySet(key) || isCatalystSet(key) || key.startsWith(QUALITY_CAP) || key.startsWith(IMPLICIT_SET) || key.startsWith(ITEM_LEVEL_SET);

/** 共有できない理由 (できるなら null)。steps = 打った手の currency と手の番号 */
export function shareBlock(steps: ReadonlyArray<{ currency: string; index: number }>): string | null {
  if (!steps.length || steps.every((s) => isForce(s.currency) || isSetting(s.currency))) return tr("まだカレンシーを打っていない", "No currency used yet");
  // Web は 50 手より前を消すので、始めから全部そろっていないと同じ結果にならない
  if (steps[0]!.index !== 1) return tr("最初の手が消えている (50 手より前)", "Early steps were dropped (over 50 steps)");
  const first = steps.findIndex((s) => !isForce(s.currency) && !isSetting(s.currency));
  if (steps.slice(first + 1).some((s) => isForce(s.currency))) return tr("打ち始めた後に MOD を手で足している", "A mod was added by hand after crafting started");
  return null;
}

/** 縮めた形: [版, ベース, iLv, seed, 始め | 0, [[カレンシー, 手の seed (無ければ 0 = 前の手順 JSON の seed + 手の番号), お告げ?, 回数?], ...]] */
type PackedStep = [string, number] | [string, number, string | 0] | [string, number, string | 0, number];
type Packed = [1, string, number, number, StartSpec | 0, PackedStep[]];

function pack(plan: CraftStagePlan): Packed {
  const start = (plan as { start?: StartSpec }).start;
  return [1, plan.base, plan.item_level ?? 80, plan.seed, start ?? 0, plan.steps.map((s): PackedStep => {
    const seed = (s as { seed?: number }).seed ?? 0;
    const times = s.times ?? 1;
    if (times !== 1) return [s.currency, seed, s.omen ?? 0, times];
    return s.omen ? [s.currency, seed, s.omen] : [s.currency, seed];
  })];
}
function unpack(p: Packed): CraftStagePlan {
  if (!Array.isArray(p) || p[0] !== 1 || typeof p[1] !== "string" || !Array.isArray(p[5])) throw new Error(tr("共有の手順が読めない", "Couldn't read the shared steps"));
  return {
    schema: "craft-stage-plan/1",
    title: null,
    base: p[1],
    item_level: Number(p[2]),
    start_rarity: "normal",
    start_paste: null,
    ...(p[4] ? { start: p[4] } : {}),
    seed: Number(p[3]),
    steps: p[5].map((s) => ({ currency: String(s[0]), omen: s[2] ? String(s[2]) : null, times: s[3] ? Number(s[3]) : 1, note: null, ...(s[1] ? { seed: Number(s[1]) } : {}) })),
  } as CraftStagePlan;
}

const toB64url = (u8: Uint8Array): string => {
  let bin = "";
  for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode(...u8.subarray(i, i + 8192));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
};
async function pipe(u8: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([u8 as BlobPart]).stream().pipeThrough(t)).arrayBuffer());
}

/** JSON に出来る物 → 縮めた文字 (deflate + base64url)。シミュレーターのレシピの URL (views/craft-stage/recipe-share.ts) でも使う */
export async function packJson(v: unknown): Promise<string> {
  return toB64url(await pipe(new TextEncoder().encode(JSON.stringify(v)), new CompressionStream("deflate-raw")));
}
/** 縮めた文字 → JSON の中身 (読めなければ例外) */
export async function unpackJson(code: string): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await pipe(fromB64url(code), new DecompressionStream("deflate-raw"))));
}
/** 手順 → URL の # の中身 (deflate + base64url) */
export async function encodeShare(plan: CraftStagePlan): Promise<string> {
  return toB64url(await pipe(new TextEncoder().encode(JSON.stringify(pack(plan))), new CompressionStream("deflate-raw")));
}
/** URL の # の中身 → 手順 */
export async function decodeShare(code: string): Promise<CraftStagePlan> {
  const json = new TextDecoder().decode(await pipe(fromB64url(code), new DecompressionStream("deflate-raw")));
  return unpack(JSON.parse(json) as Packed);
}
/** 今の URL の # から共有の手順の中身を取り出す (無ければ null) */
export function shareCodeOf(hash: string): string | null {
  const m = /^#share=([A-Za-z0-9_-]+)$/.exec(hash);
  return m ? m[1]! : null;
}
/** 共有の URL。アプリ (Tauri) からは Web 版のアドレスで */
export function shareUrl(code: string, inApp: boolean): string {
  const base = inApp ? "https://exiledesk.com/" : `${location.origin}${location.pathname}`;
  return `${base}${SHARE_PREFIX}${code}`;
}
/** X に投稿する画面 */
export function xIntentUrl(url: string): string {
  const text = tr("ExileDesk のクラフトステージで作った手順", "My crafting steps on ExileDesk Craft Stage");
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}
