<!--
  LangAsk.vue — 初めての人の言語選び (U-37 案、スイッチ langAsk)。オーナー 11-10「始めてきた人へは言語選択させてもいいよなポップアップで」。
  初めて = この端末で言語を一度も選んでいない (?lang= で来た・上の帯で押した人は選んだ扱い)。出すのは開いてすぐ (共有レシピの URL で来た人も)。出している間は強制更新・返事 (押した時の出し物) を出さない。
  押すまで待つ (自動で消えない)。既定 (光らせて最初に選ばれている方) はブラウザの言語。× ・Esc・後ろを押すで閉じたら今の言語のまま覚えて 2 度と出さない。
  題と文はどちらの言語の人にも読めるよう日英を並べる
-->
<script setup lang="ts">
import { ref } from "vue";
import ModalShell from "../components/ui/ModalShell.vue";
import { browserLang, lang, langChosen, langFrom, setLang, type Lang } from "../i18n/lang";
import { logRecord } from "../utils/log-record";
import { noLog } from "../utils/no-log";
import { REC } from "../utils/rec-mode";
import { addPressAsker } from "./force-update";

// 開いてすぐ出す (オーナー 11-10「普通にURL踏んだ時一番最初にきけばおｋ」、最初の押しを待たない)。録画モードは出さない
const open = ref(!REC && langFrom === "browser" && !langChosen());
const def = browserLang();
// 出している間は強制更新・返事を出さない (押した時の出し物に「開いている」だけ知らせる。言語選び自身は押した時には出さない)
addPressAsker(() => false, () => open.value);

function done(pick: Lang, how: "pick" | "close"): void {
  open.value = false;
  if (!noLog()) logRecord("lang_ask", { pick, def, how });
  setLang(pick); // 同じ言語でも覚える (2 度と出さない)
}
const OPTS = [
  { v: "ja", name: "日本語" },
  { v: "en", name: "English" },
] as const;
</script>

<template>
  <ModalShell :open="open" title="言語 / Language" layer="confirm" width="w-full max-w-sm" body-class="px-4 py-4" rec="lang-ask" close-title="閉じる / Close" @close="done(lang, 'close')">
    <!-- ボタンの絵は横長の帯 1 本 (game-ui.css の .g-btn) なので 1 行の高さのまま。2 段の字で伸ばすと下の字が縁に乗ってはみ出した (オーナー 11-10「ボタンはみ出てるぞ」) -->
    <div class="flex flex-col gap-2.5">
      <p class="text-[13px] leading-snug text-[var(--exile-color-text-secondary)]">
        表示する言語を選んでください<br />
        <span class="text-[var(--exile-color-text-tertiary)]">Choose your language</span>
      </p>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="o in OPTS" :key="o.v" type="button" :data-lang-pick="o.v"
          class="g-btn" :class="o.v === def ? 'ring-1 ring-amber-300/70' : ''"
          :autofocus="o.v === def"
          @click="done(o.v, 'pick')"
        >{{ o.name }}</button>
      </div>
      <p class="text-[11px] leading-tight text-[var(--exile-color-text-tertiary)]">
        上の帯の「日本語 / EN」でいつでも変えられます<br />
        You can change it anytime from 日本語 / EN at the top
      </p>
    </div>
  </ModalShell>
</template>
