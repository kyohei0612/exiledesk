# 部下に記事を「合格の形」に仕上げさせる時の頼み (記事編集長、2026-10-22。合格の見本 = greater-perfect-orb-difference)

You are finishing ONE existing Japanese article `src/data/blog/<slug>.ja.md` into the owner-approved form. Work in C:\Users\kyohei\ExileDesk, edit ONLY that file (Japanese only — do not touch the .en.md). Do NOT commit, push, deploy, start servers or browsers.

Read first and copy its form exactly: `src/data/blog/greater-perfect-orb-difference.ja.md` (the approved model). Read `src/data/blog/README.md` item 4b for component syntax (:::summary, :::tip, :::note, :::fold, :::note fold, :::zundamon <表情>, :::metan <表情>; 表情 = normal / happy / surprised / troubled).

The form (all required):
1. Front matter: keep title, description, date, tags, tree, craft, image, draft exactly. Add the line `ready: true` right before `draft: true`.
2. First paragraph: keep the existing answer-first paragraph (SEO) as plain text.
3. Then 2-3 short exchanges (ずんだもん asks, めたん answers) as the hook, then `:::summary この記事で分かる事` (3 bullets), then `:::tip はじめての人へ: この記事の言葉` (4-6 terms the article uses, each one short line, Japanese only).
4. The body is carried by ずんだもん / めたん exchanges: each bubble 1-2 short sentences; ずんだもん asks / is surprised / guesses wrong, めたん explains. Plain text only as 1-2 sentences at the head of each h2 section and a 1-2 sentence wrap-up at the end. Short sentences. Never break a sentence across lines or paragraphs.
5. NO charts: remove every `:::chart` and every image of a chart (e.g. `![...](img/<slug>-*.svg)`). Put each comparison into a table that reads in words: keep the numbers and add short word columns such as 「何が起きるか」「どちらが得か」「なぜか」. Under each table, a one-line takeaway or a short exchange. Model table style: the approved article's tables.
6. NO English glosses in Japanese text (not 「高貴なオーブ (Exalted Orb)」, not 「上級 (Greater)」) — tables, glossary box and bubbles included. Game terms in Japanese only.
7. Fold: the unverified box becomes `:::note fold 確かめていない所 (N 件)`; under `## 数字の出どころ` wrap the bullet list in `:::fold 出どころを見る (N 件)` … `:::`.
8. Keep ≤6 h2 (including 数字の出どころ and 自分で試してみる). Keep 自分で試してみる (tool links only there) and **関連する記事** at the end. Last line: `VOICEVOX:ずんだもん / 四国めたん`.
9. Numbers and sources: do NOT change, add or drop any number or source. Every number in the article must still appear (in a table, bubble or text). Before finishing, compare numbers with `git show HEAD:src/data/blog/<slug>.ja.md` — no new numbers allowed. Facts you state in bubbles must come from the article itself.
10. No mention of streams, streamers, videos or captions.

Reply in Japanese, 3-5 lines: h2 list, how many bubbles, which charts became which tables, anything you could not fit.
