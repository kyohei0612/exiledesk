/**
 * support.ts — 支援 (投げ銭) のリンクと窓 (2026-10-10 オーナー「投げ銭は実装」「支援するボタンで支援方法選べるのがええ」)。
 * リンクは src/data/support-links.json。url の入っている物だけ出し、1 つも無ければボタンも出さない
 */
import { ref } from "vue";
import data from "../data/support-links.json";

export interface SupportLink { id: string; name: string; kind: string; note: string; url: string }
export const SUPPORT_LINKS: SupportLink[] = (data.links as SupportLink[]).filter((l) => /^https:\/\//.test(l.url));
export const supportOpen = ref(false);
