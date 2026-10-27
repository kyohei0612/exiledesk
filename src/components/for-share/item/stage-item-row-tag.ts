/** StageItemCard の MOD の行に出す札 (props.rowTags の値。キーは modId)。tone: bad = 赤・warn = 橙・good = 緑・info = 青 */
export interface RowTag {
  text: string;
  tone: "bad" | "warn" | "good" | "info";
  /** 乗せた時の説明 (無くてよい) */
  title?: string;
  /** true なら MOD の文の代わりに text を行の名前として出す (札の印は出さない。シミュの外れ MOD の行) */
  replace?: boolean;
}

/**
 * StageItemCard の MOD の行の右 (札の後ろ) に置く押せる札 (props.rowToggles の値。キーは modId)。押すとカードの toggle (modId) を知らせる。
 * 中身 (何が切り替わるか) は使う画面が持つ。シミュの完成形の「途中で消える / 残る」(オーナー 10-27 夜、スイッチ rowToggle)
 */
export interface RowToggle {
  /** 札の文字 (on の時も同じ物を渡すか、画面の側で替える) */
  text: string;
  /** 押された状態 (色が付く) */
  on: boolean;
  /** 乗せた時の説明 (無くてよい) */
  title?: string;
  /** 押せない (薄く) */
  disabled?: boolean;
}
