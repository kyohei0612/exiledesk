/**
 * daily-quality-words.ts — お題の品質 (D-03d) の字。表記はゲームの品質の欄と同じ qualityLabelOf (「品質 (マナモッド) 40% 以上」)
 */
import { qualityLabelOf } from "../../services/htc/quality";
import { tr } from "../../i18n/lang";
import type { TopicQuality } from "./daily-quality";

export const qualityWords = (q: TopicQuality): string => tr(`${qualityLabelOf(q.tag)} ${q.value}% 以上`, `${qualityLabelOf(q.tag)} ${q.value}% or more`);
