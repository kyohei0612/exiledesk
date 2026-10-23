# モンキー 3・12・2・9 の直し → デザイン部長へ渡す (10-23、ジン部長 7 本目)

src/web・src/utils は b9aa4577 (オーナー 10-23「ジンはデータ管理」) でデザイン部長の持ち物になった。下の 3 つはその知らせより前の頼みで直して push 済み。残すか戻すかはデザイン部長が決める。確かめたのは型チェックだけで、開発版では未確認 (deploy:web-dev はオーナーが止めた)。

## 開発版 92d86753 で確かめた事 (窓なし Chrome 9333、CDP の Input.dispatchMouseEvent、1660×860、新しい profile)
- 12 manifest: 読み込みで 200、`fetch("/web/manifest.webmanifest", {credentials:"include"})` も 200、Page.getAppManifest の errors 0 → 直っている。
- 3 「← 戻る」(x1601,y83) を ?page=sim-tree で Esc の後に押す、各 3 回: ダブルクリック・0.2 秒あけて 2 回・0.3 秒あけて 2 回 → 9/9 で `/`。**8 連打 (0.06 秒ごと) は 3/3、0.45 秒あけて 2 回は 2/3 で `/blog/`**。エラー 0。
- 原因: 守りは「移った時刻から 500ms」で固定 (page.ts の MOVE_GUARD_MS)。連打が 500ms を超えると、後ろのクリックがヘッダーの「ブログ」に当たる。0.45 秒は CDP の遅れで 500ms を超えた見込み。

## push した直し
- e643ee9a (page.ts): 守っている間のクリック・pointerdown は `movedAt = e.timeStamp` で守りを延ばす。連打をやめて 0.5 秒置けば押せる。
- 96bb584d (page.ts、モンキー 2・エミュ部長の頼み): apply() で `page=routes` を URL・再読み込みからも開く。コースは抜けて、leaveSubPages() の後に openRoutes() を呼ぶ。
- a96ebff8 (sfx.ts、モンキー 9・エミュ部長の頼み): 音を起こす wake は、指 (タッチ・ペン) なら pointerup から、マウスなら pointerdown から (HTML の「操作に数える」イベントの決まり)。pointerup の listener を足した。playSfx の中の resume はそのまま。

## 確かめの手順 (開発版に出した後)
- 3: 上と同じ。8 連打で `/` に止まる事。0.6 秒あけて押した 2 回目は効く事 (守りが延びすぎない)。
- 2: `?page=routes`・`?lang=en&page=routes` を直に開く・再読み込み → スパムシミュレーターの「狙う MOD を選ぶ」が出て、URL がそのまま。
- 9: 375×812 (タッチ) で 300 回ほどタップして、AudioContext の警告が 0。PC のクリックで音が鳴る事。
- 台本: 窓なし Chrome を `--remote-debugging-port=9333 --user-data-dir=<新しい場所>` で立て、鍵の URL (`/?k=` + .dev-web-key) → ページを開き、Input.dispatchMouseEvent で押して location.pathname を見る (台本は scratchpad に置いて消した)。手元の 1440 では最初にベース選び (?page=base) へ行くので、開発版で回す。
