# About に足す文案 (記事編集長、2026-10-22、入れるのはジン部長)

今の About (public/about.html 約 1,000 字・public/en/about.html) の「できること」「確率と決まりについて」「使い方のヒント」「運営」はそのまま残し、下の 4 節を「確率と決まりについて」の後ろに足す。足す分は日本語で約 1,100 字、合わせて約 2,100 字。
事実の出どころ: 始めの commit 2026-05-08 (git log)、今の版 v0.1.589 と更新内容 141 版分 (src/data/changelog-notes.json)、確かさの区分 (docs/org/blog/README.md の決まり 5)、記事 19 本。
【オーナーに決めてほしい 1 行】作り方に AI (Claude) を使っている事を書くか。書くなら ★ の行を入れる (AdSense の決まりで禁止ではない。書いた方が信頼の面で正直、書かなくても違反ではない)。

---

## 日本語

### ExileDesk ができるまで
ExileDesk は 2026 年 5 月に、PoE2 のクラフトを試すための手元のツールとして作り始めました。カレンシーを 1 つ使うたびに「今の 1 手で何が起きたか」「次の 1 手で何が付くか」を確かめたい、というのが出発点です。その後、ブラウザだけで使える今の形 (Web 版) にし、遊んでくれる人の要望や不具合の報告を受けて直し続けています。更新内容はサイトの「更新履歴」にすべて残していて、v0.1.448 から今の v0.1.589 までで 141 回分あります。
★ 作るのにも確かめるのにも、AI (Anthropic の Claude) を道具として使っています。何を作るか・どの数字を出すかは運営が決め、数字は下の方法で確かめてから出しています。

### 数字の出どころの考え方
ExileDesk の数字には、どれも「どうやって確かめたか」の札を付けるようにしています。
- **エンジン**: ExileDesk のエミュレーター (このサイトと同じ物) で実際に何百回・何千回と打った結果。外の正解ではないので、そう書きます。
- **poe2db・Craft of Exile**: MOD の名前・段・重みは poe2db、確率の式は Craft of Exile と突き合わせています。食い違って決まらない物は poe2db に合わせます。
- **ゲーム**: 運営がゲームの中や取引所で実物を確かめた物。
- **推定**: 根拠が弱い物。推定だと分かるように書きます。
ゲームの会社が数字を出していない物 (たとえば冒涜の MOD の重み) は、決めつけずに「誰も知らない」と書き、既定の値と、それを自分で変えられる設定を置いています。

### 間違いを直す時
間違いが見つかったら、消して黙るのではなく、何が違っていて、どう分かり、何を直したかを残します。たとえば、冒涜で付いた MOD をフラクチャーで固定できると作ってしまい、ゲームで 24 回打って 0 回だったので直した事があります。品質の丸めを一度四捨五入にして、実物と合わずに切り捨てに戻した事もあります。こうした「直した話」はブログにも書いています。

### ブログ (読み物) の方針
ブログには、ExileDesk で実際に回して分かった事だけを書きます。他のサイトの言い換えや、数字の無い記事は出しません。1 本ごとに、何を調べて何が分かったか、数字の出どころと確かさ、確かめていない所を書き、自分で試せるツールの画面へのリンクを置きます。数字を直した時は更新日と直した中身を記事に残します。

---

## English

### How ExileDesk Started
ExileDesk began in May 2026 as a small tool for testing PoE2 crafts. The starting point was simple: after each currency, we wanted to see what that step did and what the next step could add. It later became the browser version you are using now, and it keeps changing based on players' requests and bug reports. Every change is listed in the site's changelog — 141 releases so far, from v0.1.448 to the current v0.1.589.
★ We use AI (Anthropic's Claude) as a tool for building and checking the site. The operator decides what to build and which numbers to publish, and numbers are checked as described below before they go out.

### Where Our Numbers Come From
Every number on ExileDesk carries a label saying how it was checked:
- **Engine**: results of crafting hundreds or thousands of times on the ExileDesk emulator (the same one on this site). This is not an outside ground truth, and we say so.
- **poe2db / Craft of Exile**: mod names, tiers and weights are checked against poe2db, and odds formulas against Craft of Exile. When they disagree and nothing settles it, we follow poe2db.
- **In game**: things the operator confirmed on real items in game or on the trade site.
- **Estimate**: weakly supported values, clearly marked as estimates.
Where the developer has not published a number (for example, Desecrated mod weights), we don't pretend to know it: we say nobody knows, provide a default, and let you change it.

### When We Get Something Wrong
When we find a mistake, we don't quietly delete it. We record what was wrong, how we found out and what we changed. For example, we once let Fracturing Orbs fix Desecrated mods; 24 in-game tries hit 0 times, so we fixed it. We also switched quality rounding to round-to-nearest, found it didn't match real items, and went back to rounding down. These corrections are written up on the blog too.

### Our Blog
The blog only covers what we actually found by running crafts on ExileDesk. No rewrites of other sites, no posts without numbers. Each post says what we examined and what we learned, where each number comes from and how certain it is, and what is still unverified, with a link to the tool so you can try it yourself. When a number changes, the post shows the update date and what changed.
