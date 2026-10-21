# 部下に「配信の跡を消す書き直し」を頼む時の頼み (記事編集長、2026-10-22)

Owner decision (10-22): articles must not be based on, or mention, streamers, streams, their videos or what they said. You are rewriting ONE existing article pair `src/data/blog/<slug>.ja.md` and `.en.md` (edit in place) so that no trace of a stream / streamer / video / captions / "the video's route" remains, while keeping the article's substance. Work in C:\Users\kyohei\ExileDesk. Do NOT commit, push, deploy, start servers or browsers. Do not edit other files.

Rules:
1. Remove or reword every mention of: 配信・配信者・動画・字幕・実況・ある配信で作られていた・動画に近い打ち方, and English stream / streamer / video / captions / VOD. Search both files for these words before you finish and make sure none remain (also in front matter title/description/tags, tables, chart labels, boxes, sources section).
2. Replace the example item with a neutral description of the SAME item, e.g. 「ある知性の手袋 (サフィックスに全ての投射物スキルのレベル +2 がフラクチャー済み)」 — describe it only by facts already in the article. "A route close to the video" → 「人の勘に近い打ち方 (カオス + 左側の抹消のお告げ)」 or similar, using the moves already described.
3. If an opening hook was built on a stream quote, rewrite the hook around the finding itself (what we measured / what surprised us). If a whole section exists only to discuss what a stream/video said, delete that section (and any numbers that only belong to it).
4. Do NOT change any other number or ExileDesk-side source. In the sources section, replace stream/video sources with nothing (drop the line) if the number was from the stream; keep engine / poe2db / CoE / owner records. If removing a source leaves a number without a source, remove that number too.
5. Keep the house form: front matter, first paragraph answer-first with the main keyword, summary box, ≤6 h2 (including 数字の出どころ and 自分で試してみる), boxes, related posts at the end. Keep both languages consistent.

Reply in Japanese, 3-5 lines: what you removed (sections / sentences), how you described the item instead, and any number you dropped.
