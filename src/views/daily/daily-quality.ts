/**
 * daily-quality.ts — お題の品質 (D-03d、11-15)。指輪・アミュレット・ジュエルのカタリストの品質 (値と種類) をお題に持たせ、完成に「その種類で n% 以上」を足す。
 * 何も import しない (サーバー server/live と 16:00 の台本も同じここを読む)。品の品質を見る所は daily-cost.ts の qualityMet
 */

/** お題の品質 = カタリストの種類 (エンジンの CATALYSTS の tag) と % */
export type TopicQuality = { value: number; tag: string };

/** 品質の上限の目安 (ブリーチのエッセンスで +20 の 40% を超える物は読み違いとして捨てる。限界突破の品も 50% まで) */
const QUALITY_MAX = 50;

/** 送られた・置き場から読んだ形を整える。形が違う・0% 以下・種類が無い時は null (= 品質の無いお題、今までどおり) */
export function cleanQuality(v: unknown): TopicQuality | null {
  const q = v as { value?: unknown; tag?: unknown } | null;
  if (!q || typeof q !== "object") return null;
  const value = Number(q.value), tag = typeof q.tag === "string" ? q.tag.trim() : "";
  if (!Number.isInteger(value) || value <= 0 || value > QUALITY_MAX || !/^[A-Za-z_]{1,40}$/.test(tag)) return null;
  return { value, tag };
}

/**
 * お題にする品質の上限 = ブリーチのエッセンスで上げた上限 40% (E-70a の RAISED_MAX_QUALITY)。上限を超える品質 (インフューザーの 41〜50%) は棚に無い手でしか届かない (E-29a) ので、
 * お題では 40% にそろえる。40% は木で ブリーチのエッセンス → カタリスト → その MOD を消す で届く (MOD を消しても品質は残る)
 */
export const TOPIC_QUALITY_MAX = 40;
/** 品の品質 → お題の品質 (上限でそろえる) */
export const topicQuality = (q: TopicQuality | null | undefined): TopicQuality | null => (q ? { tag: q.tag, value: Math.min(q.value, TOPIC_QUALITY_MAX) } : null);

/** お題の写し (daily_topics.type_snap の JSON) から品質を読む */
export function qualityOfSnap(snap: unknown): TopicQuality | null {
  if (typeof snap !== "string" || !snap) return null;
  try {
    return cleanQuality((JSON.parse(snap) as { quality?: unknown } | null)?.quality);
  } catch {
    return null;
  }
}

/**
 * お題に品質を入れる最初のお題の日 (D-03d の日の門)。16:00 の台本は手元の本線から回るので、本番の Web とサーバーに出す前に品質つきのお題を出さない
 * (古い画面は品質を見ずに提出し、新しい検算は品質で外す = 順位から落ちる)。出した日に「出した後に最初に始まるお題の日」に直す。それまでは来ない日
 */
export const QUALITY_FROM = "2099-01-01";
/** その日 ("YYYY-MM-DD"、お題の id "dYYYY-MM-DD" も可) のお題に品質を入れるか。手元の確かめは台本に DAILY_QUALITY_ALL=1 を付ける */
export const qualityOn = (day: string, all = false): boolean => all || day.replace(/^d/, "") >= QUALITY_FROM;
