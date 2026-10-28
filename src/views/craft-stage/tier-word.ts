/**
 * tier-word.ts — エミュの画面に出す「段」の言葉 (emu.md M-49、オーナー 10-28「おｋ」= ゲームの言葉の「ティア」に揃える)。
 * 本番は OK までの間「段」のまま (release-flags の tierWord)。英語は Tier のまま。
 */
import { flag } from "../../web/release-flags";

export const TIER = flag("tierWord") ? "ティア" : "段";
