#!/usr/bin/env node
/**
 * data-all.mjs — ゲームのデータの作り直しの 1 本道 (E-06、2026-11-12)
 *
 * 作り直しの台本は 40 本ほどあり、`pnpm data:client` (refresh-client-data.mjs) が順に回すのはクライアント由来の半分ほど。残りは順と前提が
 * 各台本の頭のコメントにしか無かった。ここに全部の順を 1 つの表で持つ。**台本の中身は変えない (呼ぶだけ)**。
 *
 *   pnpm data:all                 … 段の一覧と、今回せるか (台本が有るか・元の写しが有るか) を出すだけ。何も作り直さない
 *   pnpm data:all --run           … 上から順に回す。ネットに取りに行く段は飛ばす (手元の写しで作れる物だけ)
 *   pnpm data:all --run --net     … ネットに取りに行く段も回す (poe2db・トレード。回数は各台本の決まりのまま)
 *   pnpm data:all --run --from 12 … 12 段目から (途中で落ちた時の続き)
 *   pnpm data:all --run --only poe2db … その束だけ (client / client2 / poe2db / fixes / trade / coe / check)
 * 段ごとに「回した / 飛ばした (訳) / 落ちた」を 1 行ずつ出す。落ちたらそこで止まる (直したら --from で続き)。
 * 外の写し (data-cache/) は git に無い。取り直せない写しの控えは別の非公開の repo (exiledesk-data、pnpm data:backup)。
 * 土台の MOD の表 (src/vendor/poe2htc/data/) を作る台本は無い (上流の取り込み)。その上に下の直しを重ねる形。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const RUN = args.includes("--run");
const NET = args.includes("--net");
const val = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const FROM = Number(val("--from") ?? 1) || 1;
const ONLY = val("--only");

/**
 * 段: 束・名前・コマンド・要る写し (data-cache の下、頭が合えば有りとする)・net = ネットに取りに行く事がある。
 * 束の順 = 作り直す順: client (クライアントの表から) → client2 (同じくクライアント由来で data:client に入っていない物) →
 * poe2db (poe2db のページから) → fixes (poe2db に合わせる直し。前の束で作ったデータと比べるので後) → trade → coe → check (見張り)
 */
const n = (script, ...a) => ["node", [`scripts/${script}`, ...a]];
const STEPS = [
  { g: "client", name: "クライアント由来の 17 段 (名前・MOD の文・ベース・値段の鍵・絵・スキン・テスト)", cmd: n("refresh-client-data.mjs"), needs: ["client-export"], note: "Steam の PoE2 と ffmpeg が要る。中の段は pnpm data:client --list" },
  { g: "client2", name: "MOD の stat とタグ (mod-stats.json)", cmd: n("build-mod-stats-from-client.mjs"), needs: ["client-export-mods", "mods.en.json"] },
  { g: "client2", name: "部位のまとまり (item-classes.json)", cmd: n("build-item-classes-from-client.mjs"), needs: ["client-export-classes"] },
  { g: "client2", name: "MOD が足すタグ (spell-tags.json、E-11i)", cmd: n("build-spell-tags-from-client.mjs"), needs: ["mods.en.json"] },
  { g: "client2", name: "ルーン・ソウルコア (stage-runes.json)", cmd: n("build-stage-runes.mjs"), needs: ["client-export-stage"] },
  { g: "client2", name: "防御の数 (defence-data.json)", cmd: n("build-defence-data.mjs"), needs: ["client-export-defences"] },
  { g: "client2", name: "元素の変換の表 (フラックス・アルダー、E-73)", cmd: n("build-flux-conversions.mjs"), needs: ["client-export-flux"] },
  { g: "client2", name: "オーグメントのはめ方 (augment-rules.json、E-77)", cmd: n("build-augment-rules-from-client.mjs"), needs: ["client-export-augment-rules"], net: true },
  { g: "client2", name: "stat の並び順 (stat-order.json)", cmd: n("build-stat-order.mjs"), needs: ["client-export-gems-detail"] },
  { g: "client2", name: "ベースの説明 (base-info.json)", cmd: n("build-base-info.mjs"), needs: ["client-export-baseinfo"] },
  { g: "client2", name: "カレンシーの説明文 (日本語)", cmd: n("build-currency-hover-ja.mjs"), needs: ["client-export-currency-hover"] },
  { g: "client2", name: "カレンシーの説明文 (英語)", cmd: n("build-currency-hover-ja.mjs", "--en"), needs: ["client-export-currency-hover"] },
  { g: "client2", name: "用語集 (日本語)", cmd: n("build-keywords-ja.mjs"), needs: ["client-export-keywords"] },
  { g: "client2", name: "用語集 (英語)", cmd: n("build-keywords-ja.mjs", "--en"), needs: ["client-export-keywords"] },
  { g: "client2", name: "ジェムの文 (日本語)", cmd: n("build-gem-hover-ja.mjs"), needs: ["client-export-gems-detail"] },
  { g: "client2", name: "ジェムの文 (英語)", cmd: n("build-gem-hover-ja.mjs", "--en"), needs: ["client-export-gems-detail"] },
  { g: "client2", name: "ユニークの文", cmd: n("build-unique-hover-ja.mjs"), needs: ["client-export-uniques"] },
  { g: "client2", name: "MOD の文 (エンジンの行の日本語)", cmd: n("build-mod-text-ja-htc.mjs"), needs: ["mods.ja.json"] },
  { g: "client2", name: "スキルの絵", cmd: n("build-skill-art-from-client.mjs"), needs: ["client-export-art"] },
  { g: "client2", name: "前のリーグのルーンの絵", cmd: n("build-legacy-rune-art.mjs"), needs: ["client-export-expedition"] },
  { g: "client2", name: "画面の絵", cmd: n("build-ui-art-from-client.mjs"), needs: [] },
  { g: "poe2db", name: "ジュエルのベースと MOD (jewel-bases.json)", cmd: n("build-jewel-bases.mjs"), needs: ["poe2db-jewels"], note: "元の jewel-mods.json を取る台本は無い (控えは exiledesk-data)" },
  { g: "poe2db", name: "コラプトで付く MOD (corruption-mods.json、E-19)", cmd: n("build-corruption-mods.mjs"), needs: ["poe2db-pages"] },
  { g: "poe2db", name: "ルーンのバウンドの効き目 (rune-bonded.json)", cmd: n("build-rune-bonded-poe2db.mjs"), needs: ["poe2db-extra"], net: true },
  { g: "poe2db", name: "ルーンフォージ版 (stage-runeforged.json、E-78)", cmd: n("build-runeforged.mjs"), needs: ["poe2db-runeforged-"], net: true },
  { g: "fixes", name: "置き場・段の食い違いを見る (書かない)", cmd: n("audit-poe2db-mods.mjs"), needs: ["poe2db-pages"], soft: true },
  { g: "fixes", name: "置き場と重みの直し (poe2db-pool-fixes.json = 台本の出力。手の足しは poe2db-pool-fixes-hand.json で別)", cmd: n("build-poe2db-fixes.mjs"), needs: ["poe2db-pages"] },
  { g: "fixes", name: "タグの直し (poe2db-tag-fixes.json、E-16)", cmd: n("audit-poe2db-tags.mjs", "--write"), needs: ["poe2db-pages"] },
  { g: "fixes", name: "暗黙の直し (poe2db-implicit-fixes.json)", cmd: n("audit-poe2db-implicits.mjs", "--write"), needs: ["poe2db-pages"] },
  { g: "fixes", name: "ルーンの食い違いを見る (書かない)", cmd: n("audit-poe2db-runes.mjs"), needs: ["poe2db-extra"], net: true, soft: true },
  { g: "trade", name: "トレードに並ぶベース (tradeable-bases.json、照らすだけ = E-01)", cmd: n("build-tradeable-bases.mjs"), needs: ["trade2-items.json"], net: true },
  { g: "trade", name: "トレードの stat の対応 (取りに行く)", cmd: n("build-trade2-stat-mapping.mjs"), needs: [], net: true },
  { g: "trade", name: "トレードの stat の文", cmd: n("build-trade2-stat-text.mjs"), needs: ["trade2-stats.json"] },
  { g: "coe", name: "ルーンの特殊 MOD の重み (rune-weights.json、E-03)", cmd: n("build-rune-weights-coe.mjs"), needs: ["coe-beta-data.json"], note: "CoE の写しを取る台本は無い (控えは exiledesk-data)" },
  { g: "check", name: "直しが当て先を失っていないか (E-06)", cmd: n("check-data-fixes.mjs"), needs: [] },
  { g: "check", name: "全ベースが選び画面の札に並ぶか (E-98)", cmd: n("check-base-shelves.mjs"), needs: [] },
  { g: "check", name: "データの版の一覧 (どれが古いままか)", cmd: n("data-status.mjs"), needs: [], soft: true },
];

const cache = existsSync(resolve(ROOT, "data-cache")) ? readdirSync(resolve(ROOT, "data-cache")) : [];
const has = (need) => cache.some((d) => d === need || d.startsWith(need));
/** 今回せるか: 台本が無い・元の写しが無い・ネットが要る (--net なし) は飛ばす訳を返す */
function skipWhy(s) {
  if (ONLY && s.g !== ONLY) return `--only ${ONLY} の外`;
  if (!existsSync(resolve(ROOT, s.cmd[1][0]))) return `台本が無い ${s.cmd[1][0]}`;
  const miss = s.needs.filter((x) => !has(x));
  if (miss.length) return `元の写しが無い data-cache/${miss.join("・")}`;
  if (s.net && !NET) return "ネットに取りに行く段 (--net で回す)";
  return null;
}

const num = (i) => String(i + 1).padStart(2);
if (!RUN) {
  console.log("データの作り直しの 1 本道 (一覧だけ。回すのは --run)。束: client → client2 → poe2db → fixes → trade → coe → check\n");
  let ok = 0;
  STEPS.forEach((s, i) => {
    const why = skipWhy({ ...s, net: false }); // 一覧ではネットの段も「回せるか」を見る
    if (!why) ok++;
    console.log(`${num(i)}. [${s.g}] ${s.name}${s.net ? " 〔ネット〕" : ""}${why ? ` — 回せない: ${why}` : ""}${s.note ? ` (${s.note})` : ""}`);
  });
  console.log(`\n${STEPS.length} 段のうち今回せる ${ok} 段。ネットに取りに行く事がある段 ${STEPS.filter((s) => s.net).length} 段 (〔ネット〕)。`);
  process.exit(0);
}

const t0 = Date.now();
const done = { ran: 0, skipped: 0 };
for (let i = FROM - 1; i < STEPS.length; i++) {
  const s = STEPS[i];
  const why = skipWhy(s);
  if (why) { console.log(`- ${num(i)} 飛ばした: ${s.name} — ${why}`); done.skipped++; continue; }
  const s0 = Date.now();
  console.log(`\n=== ${i + 1}/${STEPS.length} [${s.g}] ${s.name} ===`);
  const r = spawnSync(s.cmd[0], s.cmd[1], { windowsHide: true, cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0 && !s.soft) {
    console.error(`\n× ${num(i)} 落ちた: ${s.name} (${s.cmd[0]} ${s.cmd[1].join(" ")})。直したら --run --from ${i + 1} で続きから`);
    process.exit(1);
  }
  console.log(`${r.status === 0 ? "○" : "△"} ${num(i)} 回した: ${s.name} (${((Date.now() - s0) / 1000).toFixed(0)} 秒)${r.status === 0 ? "" : " — 食い違いあり (見るだけの段なので続ける)"}`);
  done.ran++;
}
console.log(`\n済み: 回した ${done.ran} 段・飛ばした ${done.skipped} 段 (${((Date.now() - t0) / 60000).toFixed(1)} 分)。git diff で変わった所を見る`);
