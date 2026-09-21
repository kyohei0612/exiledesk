/**
 * trade2 API 関連のマジック文字列定数を集約する。
 *
 * Data-L9 (2026-05-22): 旧コードは `"securable"` / `"rare"` / `"unique"` / `"divine"`
 * などのリテラルがあちこちに散在し、typo 一発で trade2 API が 400 を返す高リスクだった。
 * 主要なステータス / レアリティ / 売却形態の option 値だけまずここに集める。
 *
 * 公式 API 仕様参考:
 *   - https://www.pathofexile.com/trade2/api/ (POE2)
 *   - filters.type_filters.filters.rarity.option: "rare" / "unique" / ...
 *   - query.status.option: "online" / "onlineleague" / "securable" / "any"
 *   - filters.trade_filters.filters.sale_type.option: null = "Buyout or Fixed Price"
 *     (= INSTANT BUYOUT 相当)。フィールド自体を省略すると同じ挙動になる (JSON null は
 *     `Invalid value` 扱いされるので、デフォルト挙動時は send しないこと)。
 *
 * Data-M6 補強:
 *   `SecurityStatus.Securable` は GGG が POE2 trade2 に追加した独自オプションで
 *   「3 時間以内かつオフライン時間が短いリスティング」を意味する (公式 API ドキュメント
 *   `https://www.pathofexile.com/developer/docs/reference#trade` の status option を参照、
 *   POE2 では `online` / `onlineleague` / `securable` / `any` の 4 値)。
 */

/** `query.status.option` 値の代表セット。 */
export const SecurityStatus = {
  /** 直近接続中のプレイヤー (旧来の "online") */
  Online: "online",
  /** リーグ内の online (実質 online 互換) */
  OnlineLeague: "onlineleague",
  /**
   * **インスタントバイアウト** (即時購入できる出品だけ)。
   *
   * トレードサイトのドロップダウンとの対応 (2026-09-17 に実機で確定):
   *   available    … インスタントバイアウトおよび対面トレード (サイトの既定)
   *   securable    … インスタントバイアウト  ← これ
   *   onlineleague … 対面トレード (リーグにオンライン)
   *   online       … 対面トレード (オンライン)
   *   any          … 指定なし (オフラインの出品も全部)
   *
   * ジェムの売値と捌き速度の追跡は両方これを使う (母集団を 1 つに固定するため)。
   */
  Securable: "securable",
  /** 全て (オフライン含む) */
  Any: "any",
} as const;
/** `type_filters.filters.rarity.option` の代表値。 */
export const Rarity = {
  Normal: "normal",
  Magic: "magic",
  Rare: "rare",
  Unique: "unique",
  /** 旧 POE1 互換、POE2 でも `nonunique` などが使われる場合あり */
  NonUnique: "nonunique",
} as const;
