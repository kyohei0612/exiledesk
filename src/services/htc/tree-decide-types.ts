/** tree-decide.ts から切り出し (2026-09-26): 相場・出品・候補の型 (DecidePrices / TreeListing / Candidate) */
export interface DecidePrices {
  orb: number;
  annul: number;
  /** 冒涜の骨 (装飾品は鎖骨) */
  bone: number;
  /** 右側ネクロマンシーのお告げ (冒涜をサフィックスに寄せる)。相場に無ければ null */
  necro: number | null;
  /** 高貴なオーブ */
  exalt: number;
  /** 右側の高貴なお告げ (高貴をサフィックスに寄せる = サフィを確定で 1 個足す)。無ければ null */
  dextralExalt: number | null;
  /** 王者のオーブ (マジックをレアにして 1 個足す)。無ければ高貴と同じ値段とみなす */
  regal?: number | null;
}

/** 取引所から返ってきた 1 件 */
export interface TreeListing {
  /** どの検索から来たか */
  source: "fractured" | "strict" | "loose";
  /** 値段 (神) */
  price: number;
  /** 樹 MOD を含むプレフィックスの数 */
  prefixes: number;
  suffixes: number;
  /**
   * マジックか (取引所の frameType / rarity)。分からなければ null で、2 MOD 以下はマジックとみなす
   * (レアで 1〜2 MOD はほぼ無い。マジックには高貴が打てないので、先に王者のオーブが要る)
   */
  magic?: boolean | null;
  /** 画面の見出し (出品者や名前など、呼ぶ側が決める) */
  label?: string;
}

/** 1 件を「1 回分の費用と成功率」に直した物 */
export interface Candidate {
  listing: TreeListing;
  /** どうやって固定するか */
  how: "buy" | "necro-desecrate" | "desecrate" | "direct" | "reduce";
  /** 1 回試すのにかかる期待費用 (神)。物の値段込み */
  perTry: number;
  hit: number;
  /** 成功 1 回あたりの期待費用。これの小さい順に試す */
  perSuccess: number;
}
