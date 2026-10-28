/**
 * tier-word.ts — 共有の部品に出す「段」の言葉 (shared-ui.md U-62、オーナー 10-28「おｋ」= ゲームの言葉の「ティア」に揃える。エミュの emu.md M-49 と同じ)。
 * 本番は OK までの間「段」のまま (release-flags の tierWord、エミュと 1 つのスイッチ)。英語は Tier のまま。
 */
import { flag } from "../../web/release-flags";

export const TIER = flag("tierWord") ? "ティア" : "段";
