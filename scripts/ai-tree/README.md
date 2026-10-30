# AI 自動ツリー (仮名、決まりは設計図 docs/spec/sim-tree.md の S-170〜S-176)

AI が手順を試して数字で比べ、安い・早い・完成率の高い作り方を探す内部の道具。画面は無い。出す物は JSON。打つのはエミュと同じエンジンの入口だけ (`_entry.ts`)。

## リーク無し (S-172)

材料はエミュの画面で見える物だけ。`hands` (棚と相場)・`pool` (MOD 一覧と重み)・`odds` (持った時の %)・`play` (手で打つ)。人の打ち方・動画・見本のレシピ・過去の答えは手順の材料にしない。`docs/org/math/notes/`・`scripts/analysis/*-ev.mjs`・ブログの下書きは答えなので探す時に読まない。手順は回す間に変えない。`run` の返事は集計で、1 人の道は `trace` と頼んだ時だけ。

## 使い方

```bash
node scripts/ai-tree/ai-tree.mjs hands --base "Pariah Mask" [--q exalt] [--omens 1]
node scripts/ai-tree/ai-tree.mjs pool  --base "Pariah Mask" [--ilvl 82] [--side prefix] [--group normal]
node scripts/ai-tree/ai-tree.mjs odds  --base "Pariah Mask" --use exalt_greater --omens OmenofSinistralExaltation
node scripts/ai-tree/ai-tree.mjs check scripts/ai-tree/recipes/pariah-ess.json
node scripts/ai-tree/ai-tree.mjs run   scripts/ai-tree/recipes/pariah-ess.json --n 2000 --seed 1 --note "何を試したか"
node scripts/ai-tree/ai-tree.mjs trace scripts/ai-tree/recipes/pariah-ess.json --person 3 --seed 1 --tail 20
node scripts/ai-tree/ai-tree.mjs log --tail 20
node scripts/ai-tree/ai-tree.mjs compare r1 r2
node scripts/ai-tree/ai-tree.mjs play new p1 --base "Pariah Mask" --seed 3
node scripts/ai-tree/ai-tree.mjs play use p1 alchemy
node scripts/ai-tree/ai-tree.mjs play use p1 chaos --as p1-b
node scripts/ai-tree/ai-tree.mjs play show p1
```

`hands`・`pool`・`odds` は `--base` の代わりに `--from <保存> [--index 0]` で途中の形を見られる。相場は既定で `data-cache/boot/boot-2026-10-22.json`、`--boot <path>` で替える。長い `run` は裏で回す (2 万人で約 20 秒)。記録は `data-cache/ai-tree/log.jsonl`、保存は `data-cache/ai-tree/saves/` (git に入らない)。`AI_TREE_DIR` で置き場を替えられる。

## 手順の形 (schema `ai-tree/1`)

```json
{
  "schema": "ai-tree/1",
  "name": "試しの名前",
  "base": "Pariah Mask", "itemLevel": 82, "basePrice": 0,
  "start": { "rarity": "normal" },
  "aims": {
    "life": { "mods": [{ "id": "Helmets_dex_int/IncreasedLife", "tier": 3 }] },
    "res": { "mods": ["Helmets_dex_int/FireResistance"], "tier": 2, "value": 36 }
  },
  "goal": { "life": 1, "res": 2 },
  "rules": [
    { "if": { "rarity": "normal" }, "use": "alchemy", "note": "説明" },
    { "if": { "used": "annul", "min": 30 }, "restart": true },
    { "if": { "spent": true, "min": 300 }, "stop": true },
    { "if": { "aim": "life", "max": 0 }, "use": "exalt_greater", "omens": ["OmenofSinistralExaltation"] },
    { "use": "annul" }
  ],
  "capture": [{ "if": { "aim": "life", "min": 1 }, "as": "life-done", "keep": 200 }],
  "limits": { "steps": 20000, "restarts": 100000, "budget": 0 },
  "prices": { "OmenofCorruption": 1.2 }
}
```

- 単位は全部神。`basePrice` はベース 1 個、`restart` のたびにもう 1 度払う。`prices` は相場より先に見る。値段の無い手は `check` で止まる (0 にしない)。
- 規則は上から見て最初に当たった 1 つ。`goal` が揃うと完成。規則に当たらない・打てない人は `stuck` として理由ごとに数える。
- `tier` は T の数字 (T1 が一番上)、その段以上が当たり。`value` は 1 つ目の数値の下限。
- `use` は `hands` のキー。ルーンは `rune:<英語名>`。発現は `{ "use": "reveal", "choose": ["狙いの順"] }` で、候補 3 つを見て狙いの順に選ぶ。反響のお告げを付けると、候補に狙いが無い時に引き直す。指名の手 (force・spam・qset・qcap・ilvl・iset・sset・pick・remove) は断る (S-173)。
- `start` は `startFrom` の形 (`rarity`・`mods`・`quality`・`sockets`・`runes`)。`mods` を決めるなら `basePrice` が要る。`{ "save": "名前", "carry": false }` で保存の形から始める (`base` はいらない)。`carry` の既定は true で、保存までの費用を足す。人の番号で保存の形を順に使う。
- `capture` は条件に最初に当たった時の形を `keep` 個まで保存する。

条件は `all`・`any`・`not` で組む。葉は `min` / `max` を付ける。

| 葉 | 中身 |
|---|---|
| `{ "rarity": "magic" }` | レアリティ |
| `{ "aim": "life", "min": 1 }` | 狙いの当たった MOD の数 |
| `{ "mods": "prefix" }`・`{ "open": "suffix" }`・`{ "junk": "any" }` | その側の MOD の数・空き・狙い以外の数 |
| `{ "fractured": "any" }`・`{ "unrevealed": "any" }` | 固定・未発現の数 |
| `{ "quality": true }` | 品質 |
| `{ "used": "annul" }` | 今回の作り直しの中で使った個数 |
| `{ "spent": true }`・`{ "steps": true }`・`{ "restarts": true }` | この人の累計の費用 (神)・手数・作り直しの回数 |

## 数字の読み方

- `costPerItem` = 全員の費用 ÷ 完成数。諦めた人の費用も入る。`±` は 95% の幅。
- `doneRate` は完成率、`steps.perItem` は全員の手数 ÷ 完成数。`stop` で諦める手順は完成率を見ないと安く見える。
- `compare` の `clear: true` は差が 95% の幅の外。`false` はたまたまの範囲なので勝ち負けを言わない。種を替えて確かめる。
- 同じ手順・人数・種・相場なら同じ数字になる。
