# 部下に英語版を「合格の形」に仕上げさせる時の頼み (記事編集長、2026-10-22)

You are finishing ONE English article `src/data/blog/<slug>.en.md` in C:\Users\kyohei\ExileDesk so that it matches its approved Japanese version `src/data/blog/<slug>.ja.md` (already in the approved form). Edit ONLY the .en.md. Do NOT commit, push, deploy, start servers or browsers.

Read first: the approved Japanese file, the current .en.md (keep its front matter title/description/tags as the English SEO base), `src/data/blog/README.md` item 4b (components), and `src/i18n/GLOSSARY.md`.

Rules:
1. Front matter: keep title, description, date, tags, tree, craft, image, draft of the current .en.md; add `ready: true` right before `draft: true`. If the current English title/description says something the Japanese no longer says, align it, but keep "PoE2" and the English main keyword.
2. Same structure as the Japanese: answer-first paragraph, opening exchange, `:::summary What you'll learn`, `:::tip New to this? Words used here` (same terms, English), the body carried by `:::zundamon <表情>` / `:::metan <表情>` exchanges (the container shows the names Zundamon / Metan on English pages), word tables instead of charts (same columns, translated), `:::note fold Not yet verified (N)`, `## Where the Numbers Come From` with the list inside `:::fold Show sources (N)`, `## Try It Yourself`, `**Related posts**`, last line `VOICEVOX: Zundamon / Shikoku Metan`.
3. Write for English readers: natural short sentences, not a word-for-word translation. Each bubble 1-2 sentences. Never split a sentence across lines.
4. Game terms: the official English names as in GLOSSARY.md / poe2db (e.g. Exalted Orb, Greater Exalted Orb, Perfect Exalted Orb, Omen of Sinistral Exaltation, Orb of Annulment, Divine Orb, Quality). No Japanese in the English text. Use "div" for Divine Orbs as the current .en.md does.
5. Numbers and facts: exactly those in the Japanese version; nothing added or dropped (fold counts may differ only if the Japanese counts differ). Related-post links use `/en/blog/<slug>/`; tool links stay as in the Japanese.
6. No mention of streams, streamers, videos or captions. No charts (`:::chart` or images of charts).
7. ≤6 lines starting with `## `.

Reply in Japanese, 2-4 lines: h2 list, bubble count, anything that did not map cleanly.
