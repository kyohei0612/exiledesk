/**
 * daily-post-src.ts — 投稿に添える「元」(D-14c ②、スイッチ dailyPostSrc): 投稿された品が、何を貼って何と読まれた物かを後から追えるようにする。
 * 貼った品 = 貼った文 (3,000 字まで、@ の行は落とす) と読んだ結果 (揃え直す前の段。paste-log.ts の pasteAfter)、エミュで作った品 = 「エミュから」の印だけ (文は無い)。
 * サーバーは箱の投稿の品の欄の中に残すだけで、確かめ・お題・Discord の知らせには使わない。スイッチが閉じている間は添えない
 */
import { flag } from "../../web/release-flags";
import { cleanPaste } from "./paste-log";

export type PostSrc = { from: "paste"; text: string; read?: Record<string, unknown> } | { from: "emu" };

/** 投稿に添える文の上限 (字) */
export const SRC_MAX = 3000;

export function srcOfPaste(raw: string, read?: Record<string, unknown>): PostSrc | undefined {
  if (!flag("dailyPostSrc")) return undefined;
  const text = cleanPaste(raw, SRC_MAX);
  return text ? { from: "paste", text, ...(read ? { read } : {}) } : undefined;
}
export const srcOfEmu = (): PostSrc | undefined => (flag("dailyPostSrc") ? { from: "emu" } : undefined);
