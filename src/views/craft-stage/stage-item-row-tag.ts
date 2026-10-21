/** StageItemCard の MOD の行に出す札 (props.rowTags の値。キーは modId)。tone: bad = 赤・warn = 橙・good = 緑・info = 青 */
export interface RowTag {
  text: string;
  tone: "bad" | "warn" | "good" | "info";
  /** 乗せた時の説明 (無くてよい) */
  title?: string;
}
