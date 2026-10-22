/**
 * topic-steps.ts — コースの手を書く小物 (topic-courses・-adv・-guide で同じ。2026-10-22 code-audit 2 節)。
 * topic-courses が -adv・-guide を import するので、ここは型だけを topic-courses から読む (値を読むと読み込みの輪で落ちる)
 */
import type { JaEn } from "./quiz-tutorials";
import { type StageItem } from "../craft-stage/engine";
import type { TopicStep } from "./topic-courses";

/** 打つだけの手 */
export const S = (use: string, note: JaEn, omens?: string[]): TopicStep => ({ use, note, ...(omens ? { omens } : {}) });
/** 打ち方の説明 (how) 付きの手。prep は先に打っておく物、文字ならその稀少度から */
export const H = (use: string, note: JaEn, how: JaEn[], prep?: string[] | StageItem["rarity"]): TopicStep =>
  ({ use, note, how, ...(typeof prep === "string" ? { start: prep } : prep ? { prep } : {}) });
/** 打てても毎回 prep から始める手 (消去・フラクチャーは MOD 4 つから) */
export const ALWAYS = (st: TopicStep): TopicStep => ({ ...st, prepAlways: true });
