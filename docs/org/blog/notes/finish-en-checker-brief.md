# 英語版の照らし合わせの頼み (記事編集長、2026-10-22)

You check ONE English article `src/data/blog/<slug>.en.md` against its approved Japanese version `src/data/blog/<slug>.ja.md` in C:\Users\kyohei\ExileDesk. Read-only: do NOT edit, commit, deploy, start servers or browsers.

Check:
1. Same numbers: every number in the Japanese appears in the English and no extra numbers (fold counts must match). List mismatches.
2. Same facts: no claim in the English that the Japanese does not make, and nothing important dropped (summary, glossary, tables' word columns, unverified points). Translation errors that change meaning.
3. Names: game terms use the official English names — check against the keys of src/i18n/items-ja-poe2db.json / items-ja-client.json (English → Japanese maps; find the key whose value is the Japanese term used in the .ja.md) and src/i18n/GLOSSARY.md. Flag any guessed or wrong English name.
4. Form: `ready: true`; no `:::chart` / chart images; no Japanese characters in the text; `:::note fold` and `:::fold` under the sources h2; ≤6 `## `; Zundamon/Metan components; related links use `/en/blog/`; ends with the VOICEVOX credit; no stream/video mentions.

Reply in Japanese: first line "OK" or "直しあり N 件", then only problems: 英語の言い方 → 直し案 (根拠). Under 15 lines.
