/**
 * Claude Code (CLI) ラッパー — Tauri invoke 経由で `claude -p <prompt>` を spawn。
 *
 * オーナー判断 (2026-05-10): API キー BYOK ではなく、Claude MAX プラン契約者の Claude Code
 * OAuth セッション経由でトークン消費する方針。フロント側に API キーを持たない。
 *
 * 前提: ユーザー環境に Claude Code (https://claude.com/code) が install 済 + `claude /login` 済。
 * API キー周りの localStorage / 設定 UI / Anthropic API 直叩きは廃止 (2026-05-10)。
 */

import { invoke } from "@tauri-apps/api/core";

/**
 * Claude Code に prompt を投げて返答テキストを取得。
 * @throws Tauri command エラー (claude 未インストール / 未ログイン / プロセス失敗 等)
 */
export async function askClaude(prompt: string): Promise<string> {
  return await invoke<string>("ask_claude_code", { prompt });
}
