/**
 * sfx.ts — カレンシーを使った時の音 (2026-10-16 オーナー「つける時の SE、ゲーム内と同じに。音量はめっちゃ小さくて OK、
 * カオスの確率機では出しちゃダメ」「レア MOD 時は神のオーブの音」)。
 *
 * 音はゲームのクライアント (FMOD/Desktop/ItemDrops.bank の OrbUse_* と OrbDrop_Divine_01) から取り出して mp3 にした物 (public/sfx)。
 * 珍しい段 (付いた瞬間の確率が isRareChance = 工程で黄色に出る物) が付いた時は、カレンシーの音の代わりに神のオーブが落ちた時の音。
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
const buffers = new Map<string, Promise<AudioBuffer | null>>();
function load(name: string): Promise<AudioBuffer | null> {
  let p = buffers.get(name);
  if (!p) {
    p = fetch(`/sfx/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ctx!.decodeAudioData(b))
      .catch(() => null);
    buffers.set(name, p);
  }
  return p;
}

/** 音を 1 回鳴らす (押した時の中から呼ぶ。ブラウザは押した時でないと音を出させない) */
export function playSfx(name: string): void {
  if (sfxOff.value || typeof window === "undefined") return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const c = ctx;
    void load(name).then((buf) => {
      if (!buf) return;
      const src = c.createBufferSource();
      const gain = c.createGain();
      gain.gain.value = VOLUME;
      src.buffer = buf;
      src.connect(gain).connect(c.destination);
      src.start();
    });
  } catch { /* 音が出せなくても動きは変えない */ }
}

/** 使った時: 珍しい段が付いたら神のオーブの音、それ以外はそのカレンシーの音 */
export function playUseSfx(key: string, rare: boolean): void {
  playSfx(rare ? "divine-drop" : sfxOf(key));
}
