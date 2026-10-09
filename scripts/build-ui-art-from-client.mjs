#!/usr/bin/env node
/**
 * build-ui-art-from-client.mjs — 画面の枠・ボタン・タブにゲームの UI の絵を使う (2026-10-09)
 *
 * オーナー「AI で作ったなってわかる」「細い金の線」「ちゃっちくならんように」→ クライアントの UI の絵を取り出す案を選んだ。見本に「めっちゃUIいいやん」。
 * 出どころは Art/Textures/Interface/2D/2DArt/UIImages/ の DDS。多くが BC7 で ffmpeg は読めないので、変換と組み立ては Pillow (scripts/ui-art-compose.py)。
 * どの絵も右と下に 8px の余白がある (切ってから使う)。
 *   out: public/ui-art/*.webp
 *   node scripts/build-ui-art-from-client.mjs   (python と Pillow が要る)
 */
import * as loaders from "../node_modules/pathofexile-dat/dist/cli/bundle-loaders.js";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STEAM = "C:/Program Files (x86)/Steam/steamapps/common/Path of Exile 2";
const UI = "Art/Textures/Interface/2D/2DArt/UIImages/";
const CM = "InGame/ConsoleNew/CharacterMenu/";
const CX = "InGame/ConsoleNew/CurrencyExchange/ggg_concept_currencyexchange_";
const FILES = [
  ...["TopLeft", "Top", "TopRight", "Left", "Right", "BottomLeft", "Bottom", "BottomRight"].map((k) => `Common/LoadingScreenBorder${k}`),
  ...["Generic", "Red"].flatMap((c) => ["Normal", "Hover", "Pressed"].flatMap((st) => ["Left", "Middle", "Right"].map((p) => `Common/Button${c}${st}${p}`))),
  ...["Left", "Middle", "Right", "CenterPiece"].map((k) => `Common/WindowTitleBar${k}`),
  "Common/FourDividerYellow",
  ...["TopLeft", "TopRight", "BottomLeft", "BottomRight"].map((k) => `Common/SelectionBorder${k}`),
  `${CM}HeaderLeft`, `${CM}HeaderRight`, `${CM}CosmeticStanderItemFrame`,
  ...["available", "hovered", "selected", "unavailable"].map((k) => `${CX}tabbutton_${k}`),
  `${CX}itemslot`, `${CX}itemslot_selected`,
  // 縦の仕切り (ログイン画面の上下が消える細い金の線) と、選んだ行 (取引所の左の絞り込みの行)。2026-10-09 オーナー「縦の枠のデザインもっとましな POE2 フレーム」→ 案 2
  "Login/VerticalSeparator", "InGame/ConsoleNew/TradeMarket/sidefilter_selected",
  // サイドバーのアイコン (キャラ画面の上の金のアイコン。通常 / hover = 選んでいる時)
  ...["HeaderIconTrade", "HeaderIconFriend", "HeaderIconAchievement", "HeaderIconShop", "HeaderIconCharacter", "HeaderIconPassive", "HeaderIconCosmetics", "HeaderAltasPoint", "HeaderAltasMap"].flatMap((k) => [`${CM}${k}`, `${CM}${k}Hover`]),
];
const tmp = join(tmpdir(), "exiledesk-ui-art");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const loader = await loaders.FileLoader.create(new loaders.CachingBundleLoader(new loaders.SteamBundleLoader(STEAM)));
for (const f of FILES) {
  const name = f.split("/").pop();
  writeFileSync(join(tmp, `${name}.dds`), Buffer.from(await loader.getFileContents(`${UI}${f}.dds`.toLowerCase())));
}
const out = resolve(ROOT, "public/ui-art");
mkdirSync(out, { recursive: true });
execFileSync("python", [resolve(ROOT, "scripts/ui-art-compose.py"), tmp, out], { stdio: "inherit" });
rmSync(tmp, { recursive: true, force: true });
