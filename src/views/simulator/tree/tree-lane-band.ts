/**
 * tree-lane-band.ts — 木の段の札 (TreeLaneTags、S-147f) の字の大きさと帯の幅。PC の木は帯の幅だけ木の枠を右へ寄せる (SimTreePage、11-08)
 */
import { tr } from "../../../i18n/lang";

/** 倍率 1 の時の字の大きさ (箱の幅 316 に対して) と、読める最小の大きさ */
const BASE = 28, MIN = 12;
export const laneSize = (k: number): number => Math.max(MIN, BASE * k);
export const laneLabel = (t: string): string => tr(`${t} 段目`, `Step ${t}`);
/** 字の幅の見込み (字の大きさを 1 として。数字・英字は狭く、漢字・かな・〜は 1、空白は 0.3) */
const em = (s: string): number => [...s].reduce((w, ch) => w + (/[0-9A-Za-z]/.test(ch) ? 0.62 : ch === " " ? 0.3 : 1), 0);
/** 帯の幅 (一番長い札が入る幅) */
export const laneBandW = (texts: string[], k: number): number => Math.ceil(laneSize(k) * (Math.max(...texts.map((t) => em(laneLabel(t))), 1) + 0.8));
