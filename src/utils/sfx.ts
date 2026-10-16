/**
 * sfx.ts — カレンシーを使った時の音 (2026-10-16 オーナー「つける時の SE、ゲーム内と同じに。音量はめっちゃ小さくて OK、
 * カオスの確率機では出しちゃダメ」「レア MOD 時は神のオーブの音」)。
 *
 * 音はゲームのクライアント (FMOD/Desktop/ItemDrops.bank の OrbUse_* と Four_ItemFilter.bank の AlertSound_06) から取り出して mp3 にした物 (public/sfx)。
 * 珍しい段 (付いた瞬間の確率が isRareChance = 工程で黄色に出る物) が付いた時は、カレンシーの音の代わりにアイテムフィルターの通知音 6
 * (Four_ItemFilter.bank の AlertSound_06。フィルターの PlayAlertSound 6 の「しゃきぃん → ぽーん」。2026-10-16 オーナー「これこれ 6 のやつ」)。少し大きめに鳴らす。
 * iPhone の Safari は <audio> の音量を無視するので Web Audio の GainNode で絞る。オフは端末に覚える (sfx-off)
 */
import { ref } from "vue";

/** 小さめ (ゲームの音は 0 dB まで出ているので、そのままだと大きい) */
const VOLUME = 0.12;
const KEY = "sfx-off";

function readOff(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
/** 音を消している */
export const sfxOff = ref(readOff());
export function setSfxOff(v: boolean): void {
  sfxOff.value = v;
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* 覚えられなくてよい */ }
}

/** カレンシーのキー → 音のファイル (ゲームの OrbUse_* と同じ物。専用の音が無い物は OrbUse_01) */
export function sfxOf(key: string): string {
  if (key.startsWith("transmute")) return "transmute";
  if (key.startsWith("alchemy")) return "alchemy";
  if (key.startsWith("regal")) return "regal";
  if (key.startsWith("exalt")) return "exalt";
  if (key.startsWith("chaos")) return "chaos";
  if (key.startsWith("annul")) return "annul";
  if (key.startsWith("chance")) return "chance";
  if (key.startsWith("fracture")) return "fracture";
  if (key.startsWith("vaal_infuser")) return "vaal-infuser";
  if (key === "vaal" || key.startsWith("vaal_orb")) return "vaal";
  // 骨と発現 (アビスの UI の音)
  if (key.startsWith("desecrate") || key.startsWith("reveal:")) return "abyss";
  return "orb";
}

let ctx: AudioContext | null = null;
const ALL = ["orb", "transmute", "alchemy", "regal", "exalt", "chaos", "annul", "chance", "fracture", "vaal", "vaal-infuser", "abyss", "rare"];
function context(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC({ latencyHint: "interactive" });
  return ctx;
}
/**
 * 先に全部読んでおく (2026-10-16 オーナー「ちょいズレてる、付いた瞬間に」: 初めて使うカレンシーは、その時に音を取りに行って読むので遅れていた)。
 * 音の出口はブラウザが押した時まで寝かせるので、最初に触った時 (pointerdown = クリックより先) に起こしておく
 */
let preloaded = false;
export function preloadSfx(): void {
  if (preloaded || typeof window === "undefined" || !context()) return;
  preloaded = true;
  for (const n of ALL) void load(n);
  const wake = (): void => { if (ctx?.state === "suspended") void ctx.resume(); };
  window.addEventListener("pointerdown", wake, { capture: true, passive: true });
  window.addEventListener("keydown", wake, { capture: true, passive: true });
}
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const decoded = new Map<string, AudioBuffer>();
function load(name: string): Promise<AudioBuffer | null> {
  let p = buffers.get(name);
  if (!p) {
    p = fetch(`/sfx/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ctx!.decodeAudioData(b))
      .then((buf) => { decoded.set(name, buf); return buf; })
      .catch(() => null);
    buffers.set(name, p);
  }
  return p;
}

/** 音を 1 回鳴らす (押した時の中から呼ぶ。ブラウザは押した時でないと音を出させない) */
export function playSfx(name: string, loud = 1): void {
  if (sfxOff.value || typeof window === "undefined") return;
  try {
    const c = context();
    if (!c) return;
    if (c.state === "suspended") void c.resume();
    const play = (buf: AudioBuffer | null): void => {
      if (!buf) return;
      const src = c.createBufferSource();
      const gain = c.createGain();
      gain.gain.value = VOLUME * loud;
      src.buffer = buf;
      src.connect(gain).connect(c.destination);
      src.start();
    };
    // 読み終わっていれば待たずにその場で (Promise を挟むと 1 拍遅れる)
    const ready = decoded.get(name);
    if (ready) play(ready);
    else void load(name).then(play);
  } catch { /* 音が出せなくても動きは変えない */ }
}

/** 使った時: 珍しい段が付いたらフィルターの通知音 6、それ以外はそのカレンシーの音 */
export function playUseSfx(key: string, rare: boolean): void {
  if (rare) playSfx("rare", 1.5);
  else playSfx(sfxOf(key));
}
