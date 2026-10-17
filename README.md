# ExileDesk

Path of Exile 2 のクラフトを、ゲームと同じ決まりで 1 手ずつ試せる無料のエミュレーター。本番は Web (https://exiledesk.com/)。
日本語と英語。ゲームの用語はクライアントの原文。

デスクトップアプリ (Tauri) もあるが、2026-10 から当分は Web だけを更新している。アプリの説明・辞書の作り直し・PoB の同梱などの手順は docs/archive/README-app-2026-10.md。

## 技術
- Vue 3 + TypeScript + Vite (画面と計算はブラウザの中)
- Cloudflare Workers: `server/web` (Web の配信・シェアのカード)、`server/live` (チャンネル・相場・記録・要望。D1 と KV)
- アプリ: Tauri 2 + Rust (`src-tauri/`)

## 動かす
```bash
pnpm install
pnpm dev:web
```
http://localhost:1440/web.html が Web 版 (`/` はアプリの入口)。

- 型: `pnpm -s exec vue-tsc --noEmit -p tsconfig.json`
- テスト: `pnpm -s exec vitest run <ファイル>` (全部は CI)
- 本番に出す: `node scripts/bump-version.mjs patch` → `pnpm deploy:web`
- 非公開の開発版: `pnpm deploy:web-dev`

## 読む物
- 作業ごとに読む物: `CLAUDE.md`
- 全体の地図: `docs/ARCHITECTURE.md`
- 決めたこと: `docs/decisions/` (ADR-001〜004)
- 計画: `docs/roadmap-2026-10.md`
- クラフトの決まり: `docs/reviews/2026-10-17-rule-checklist.md`

## ライセンス
私用 (個人開発)。非公式のファンツール。Path of Exile 2 とゲーム内の画像・名称の権利は Grinding Gear Games に帰属します。
