<!--
  ClientLog.vue — ゲームログ診断 (2026-09-10)
  PoE2 の logs/Client.txt を末尾から走査し、既知パターンで「実害あり / 既知の無害 / 未分類」に仕分ける。
  無害な CRIT が桁違いに多い (実測で 29 万件中ほぼ全部) ので、件数ではなく分類を見せるのが主目的。
    - 未分類のものは対処法が未登録なので、その場で「解決案を追加してください」と促す
    - 消し込み: 要約を履歴に残してログ本体を空にする。週 1 回は起動時に自動実行 (services/client-log.ts)
-->
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  clientLogClear,
  clientLogDiagnose,
  clientLogHistory,
  clientLogStatus,
  type Finding,
  type HistoryEntry,
  type LogDiagnosis,
  type LogStatus,
} from "../services/client-log";

const status = ref<LogStatus | null>(null);
const result = ref<LogDiagnosis | null>(null);
const history = ref<HistoryEntry[]>([]);
const running = ref(false);
const clearing = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const scanMb = ref(64);
const showNoise = ref(false);
const showHistory = ref(false);
const openAdvice = ref<Record<string, boolean>>({});
const copied = ref<string | null>(null);

const mb = (b: number) => (b / 1048576).toFixed(0);
const num = (n: number) => n.toLocaleString("ja-JP");
const shortTs = (t: string | null) => (t ? t.slice(5, 16) : "—");
const dateOf = (sec: number) => new Date(sec * 1000).toLocaleDateString("ja-JP");

const warnCount = computed(() => result.value?.findings.filter((f) => f.severity === "warn").length ?? 0);
const noiseTotal = computed(() => result.value?.noise.reduce((a, f) => a + f.count, 0) ?? 0);
/** 次回の自動消し込み予定 (最後に消し込んだ日 + 7 日) */
const nextRotate = computed(() => {
  const last = history.value.length ? history.value[history.value.length - 1].cleared_at : 0;
  return last ? new Date((last + 7 * 86400) * 1000).toLocaleDateString("ja-JP") : null;
});

async function refreshStatus(): Promise<void> {
  try {
    status.value = await clientLogStatus();
    history.value = await clientLogHistory();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function run(): Promise<void> {
  if (running.value) return;
  running.value = true;
  error.value = null;
  notice.value = null;
  try {
    result.value = await clientLogDiagnose(scanMb.value);
    await refreshStatus();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    running.value = false;
  }
}

async function clearLog(): Promise<void> {
  const d = result.value;
  if (!d || clearing.value) return;
  if (!window.confirm(`診断結果を履歴に残して、ログ本体 (${mb(d.size_bytes)} MB) を空にします。よろしいですか?`)) return;
  clearing.value = true;
  error.value = null;
  notice.value = null;
  try {
    status.value = await clientLogClear(d);
    result.value = null;
    notice.value = "消し込みました。診断結果は履歴に残っています。";
    await refreshStatus();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    clearing.value = false;
  }
}

async function copyText(text: string, key: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = key;
    setTimeout(() => (copied.value = copied.value === key ? null : copied.value), 1500);
  } catch {
    /* クリップボード権限なし */
  }
}

const dayMax = (f: Finding) => Math.max(1, ...f.daily.map((d) => d.count));

onMounted(() => {
  void refreshStatus();
});
</script>

<template>
  <section class="min-h-full flex flex-col px-6 py-4 bg-[var(--exile-color-bg-canvas)] text-[var(--exile-color-text-primary)]">
    <header class="mb-3">
      <h1 class="font-display text-xl tracking-[0.08em] text-[var(--exile-color-accent-focus)]">ゲームログ診断</h1>
      <p class="text-xs text-[var(--exile-color-text-secondary)] mt-1">
        PoE2 が書き出す Client.txt を読み、実害のあるエラーだけを抜き出します。ゲームは無害なエラーを大量に記録するので、件数ではなく分類で見てください。
        診断済みのログは週 1 回、起動時に自動で消し込みます。
      </p>
    </header>

    <!-- ログの所在 + 実行 -->
    <div class="rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] p-3 text-[12px]">
      <template v-if="status?.found">
        <div class="font-mono text-[11px] break-all text-[var(--exile-color-text-secondary)]">{{ status.path }}</div>
        <div class="mt-2 flex items-center gap-3 flex-wrap">
          <label class="text-[11px] text-[var(--exile-color-text-secondary)]">
            走査量
            <select
              v-model.number="scanMb"
              class="ml-1 px-2 py-0.5 rounded bg-[var(--exile-color-bg-canvas)] border border-[var(--exile-color-border-subtle)] text-[12px]"
            >
              <option :value="16">末尾 16 MB (直近)</option>
              <option :value="64">末尾 64 MB (既定)</option>
              <option :value="256">末尾 256 MB (全部)</option>
            </select>
          </label>
          <button
            type="button"
            @click="run"
            :disabled="running || clearing"
            class="px-4 py-1.5 rounded font-medium text-[13px] bg-[var(--exile-color-accent-focus)] text-black hover:bg-[var(--exile-color-accent-focus-hover)] disabled:opacity-50 transition"
          >
            {{ running ? "解析中…" : result ? "再診断" : "診断する" }}
          </button>
          <button
            v-if="result"
            type="button"
            @click="clearLog"
            :disabled="clearing"
            class="px-3 py-1.5 rounded border border-[var(--exile-color-border-brass)] text-[12px] text-[var(--exile-color-accent-focus)] hover:bg-[var(--exile-color-bg-elevated)] disabled:opacity-50 transition"
            title="診断結果を履歴に残してログ本体を空にします (ゲームは閉じておいてください)"
          >
            {{ clearing ? "消し込み中…" : "🧹 処理済みを消し込む" }}
          </button>
          <span class="text-[11px] text-[var(--exile-color-text-tertiary)]">
            ログ全体 {{ mb(status.size_bytes) }} MB<template v-if="nextRotate"> ／ 次回の自動消し込み {{ nextRotate }}</template>
          </span>
        </div>
      </template>
      <p v-else class="text-amber-300">
        Client.txt が見つかりません。環境変数 EXILEDESK_CLIENT_LOG にパスを設定すると読み込めます。
      </p>
      <p v-if="notice" class="mt-2 text-emerald-300">{{ notice }}</p>
      <p v-if="error" class="mt-2 text-red-200">{{ error }}</p>
    </div>

    <template v-if="result">
      <!-- 総評 -->
      <div
        class="mt-3 rounded-lg border p-3 text-[13px]"
        :class="warnCount > 0 ? 'border-amber-600/60 bg-amber-950/20' : 'border-emerald-700/50 bg-emerald-950/20'"
      >
        <div class="font-medium">
          <template v-if="warnCount > 0">⚠️ 対処した方がよい項目が {{ warnCount }} 件あります</template>
          <template v-else>✅ 実害のあるエラーは見つかりませんでした</template>
        </div>
        <div class="mt-1 text-[11px] text-[var(--exile-color-text-secondary)]">
          {{ shortTs(result.first_ts) }} 〜 {{ shortTs(result.last_ts) }} ／ {{ num(result.lines) }} 行 ({{ mb(result.scanned_bytes) }} MB) を走査
          ／ 内訳 CRIT {{ num(result.crit) }}・WARN {{ num(result.warn) }}・INFO {{ num(result.info) }}
        </div>
      </div>

      <!-- 実害あり / 注意 -->
      <div v-if="result.findings.length" class="mt-3 space-y-2">
        <div v-for="f in result.findings" :key="f.id" class="rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] p-3">
          <div class="flex items-baseline gap-2 flex-wrap">
            <span
              class="px-1.5 py-0.5 rounded text-[10px] font-bold"
              :class="f.severity === 'warn' ? 'bg-amber-900/50 text-amber-200' : 'bg-sky-900/50 text-sky-200'"
              >{{ f.severity === "warn" ? "実害あり" : "注意" }}</span
            >
            <span class="text-[13px] font-medium">{{ f.title }}</span>
            <span class="text-[12px] tabular-nums text-[var(--exile-color-text-secondary)]">{{ num(f.count) }} 件</span>
          </div>
          <p v-if="f.advice" class="mt-1.5 text-[12px] text-[var(--exile-color-text-secondary)]">→ {{ f.advice }}</p>
          <div v-if="f.daily.length" class="mt-2">
            <div class="text-[10px] uppercase tracking-wider text-[var(--exile-color-text-tertiary)] mb-1">日別</div>
            <div class="flex items-end gap-1 h-10">
              <div v-for="d in f.daily" :key="d.date" class="flex-1 flex flex-col items-center justify-end gap-0.5" :title="`${d.date} : ${d.count} 件`">
                <div
                  class="w-full rounded-sm"
                  :class="f.severity === 'warn' ? 'bg-amber-500/70' : 'bg-sky-500/70'"
                  :style="{ height: `${Math.max(6, (d.count / dayMax(f)) * 36)}px` }"
                ></div>
                <span class="text-[9px] text-[var(--exile-color-text-tertiary)] tabular-nums">{{ d.date.slice(5) }}</span>
              </div>
            </div>
          </div>
          <details class="mt-2">
            <summary class="text-[11px] text-[var(--exile-color-text-tertiary)] cursor-pointer">実際の行を見る</summary>
            <pre class="mt-1 p-2 rounded bg-[var(--exile-color-bg-canvas)] text-[10px] font-mono whitespace-pre-wrap break-all">{{ f.sample }}</pre>
          </details>
        </div>
      </div>

      <!-- 未分類: 解決案が未登録 -->
      <div v-if="result.unknown.length" class="mt-3 rounded-lg border border-[var(--exile-color-border-brass)] bg-[var(--exile-color-bg-surface)] p-3">
        <div class="text-[13px] font-medium">解決案が未登録のエラー</div>
        <p class="mt-1 text-[12px] text-amber-200">
          分類表に無いエラーです。<strong>エラー解決案を追加してください。</strong>コピーボタンで内容を控えて登録すると、次回から対処法付きで表示されます。
        </p>
        <ul class="mt-2 space-y-1">
          <li v-for="u in result.unknown" :key="u.text" class="flex items-start gap-2 text-[11px]">
            <span class="tabular-nums text-[var(--exile-color-text-secondary)] shrink-0 w-16 text-right">{{ num(u.count) }} 件</span>
            <span class="font-mono break-all flex-1">{{ u.text }}</span>
            <button
              type="button"
              @click="copyText(u.text, u.text)"
              class="shrink-0 px-2 py-0.5 rounded border border-[var(--exile-color-border-subtle)] text-[10px] hover:bg-[var(--exile-color-bg-elevated)]"
            >
              {{ copied === u.text ? "コピーしました" : "コピー" }}
            </button>
          </li>
        </ul>
      </div>

      <!-- 既知の無害 -->
      <div class="mt-3 rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] p-3">
        <button type="button" @click="showNoise = !showNoise" class="w-full flex items-center gap-2 text-left">
          <span class="text-[13px] font-medium">既知の無害なエラー</span>
          <span class="text-[12px] tabular-nums text-[var(--exile-color-text-secondary)]">{{ num(noiseTotal) }} 件 / {{ result.noise.length }} 種類</span>
          <span class="ml-auto text-[11px] text-[var(--exile-color-text-tertiary)]">{{ showNoise ? "閉じる" : "開く" }}</span>
        </button>
        <p class="mt-1 text-[11px] text-[var(--exile-color-text-tertiary)]">
          ゲームエンジンが常時出力するもので、対処は不要です。項目を押すと理由が出ます。
        </p>
        <ul v-if="showNoise" class="mt-2 space-y-1">
          <li v-for="f in result.noise" :key="f.id">
            <button
              type="button"
              @click="openAdvice[f.id] = !openAdvice[f.id]"
              class="w-full flex items-center gap-2 text-left text-[11px] px-1 py-0.5 rounded hover:bg-[var(--exile-color-bg-elevated)]"
            >
              <span class="tabular-nums text-[var(--exile-color-text-secondary)] w-20 text-right shrink-0">{{ num(f.count) }} 件</span>
              <span>{{ f.title }}</span>
            </button>
            <p v-if="openAdvice[f.id] && f.advice" class="ml-24 mb-1 text-[11px] text-[var(--exile-color-text-secondary)]">{{ f.advice }}</p>
          </li>
        </ul>
      </div>
    </template>

    <!-- 消し込み履歴 -->
    <div v-if="history.length" class="mt-3 rounded-lg border border-[var(--exile-color-border-subtle)] bg-[var(--exile-color-bg-surface)] p-3">
      <button type="button" @click="showHistory = !showHistory" class="w-full flex items-center gap-2 text-left">
        <span class="text-[13px] font-medium">消し込み履歴</span>
        <span class="text-[12px] text-[var(--exile-color-text-secondary)]">{{ history.length }} 回</span>
        <span class="ml-auto text-[11px] text-[var(--exile-color-text-tertiary)]">{{ showHistory ? "閉じる" : "開く" }}</span>
      </button>
      <p class="mt-1 text-[11px] text-[var(--exile-color-text-tertiary)]">ログを消しても、件数の推移はここに残ります。</p>
      <table v-if="showHistory" class="mt-2 w-full text-[11px]">
        <thead class="text-[10px] uppercase tracking-wider text-[var(--exile-color-text-tertiary)]">
          <tr>
            <th class="text-left font-normal py-1">消し込み日</th>
            <th class="text-left font-normal">対象期間</th>
            <th class="text-right font-normal">行数</th>
            <th class="text-right font-normal">サイズ</th>
            <th class="text-left font-normal pl-3">実害あり</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="h in [...history].reverse()" :key="h.cleared_at" class="border-t border-[var(--exile-color-border-subtle)]">
            <td class="py-1 whitespace-nowrap">{{ dateOf(h.cleared_at) }}</td>
            <td class="text-[var(--exile-color-text-secondary)] whitespace-nowrap">{{ shortTs(h.first_ts) }} 〜 {{ shortTs(h.last_ts) }}</td>
            <td class="text-right tabular-nums">{{ num(h.lines) }}</td>
            <td class="text-right tabular-nums">{{ mb(h.size_bytes) }} MB</td>
            <td class="pl-3 text-[var(--exile-color-text-secondary)]">
              {{ h.findings.filter((f) => f.severity === "warn").map((f) => `${f.title} ${num(f.count)}`).join(" / ") || "—" }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="mt-4 mb-2 text-[11px] text-[var(--exile-color-text-tertiary)] max-w-[860px]">
      走査はログの末尾からで、ゲームを起動したままでも読めます。消し込みだけはファイルをゲームが掴んでいるため、PoE2 を閉じた状態で実行してください。
    </p>
  </section>
</template>
