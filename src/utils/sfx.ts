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

/**
 * カレンシーのキー → 音のファイル。ゲームの FMOD/Desktop/ItemDrops.bank の使う音 (OrbUse_* など) をそのまま (2026-10-16 取り直し、オーナー
 * 「クライアントで SE もっかい出した方が良いかも」: 前は 7 種類だけ割り当てて、砥石・端材・彫刻針・飾り玉・熟練工・お告げ・ルーンなども共通の OrbUse_01 だった)。
 * 骨はゲームと同じく Abyss_UI_CurrencyUse_01〜05 から毎回ランダム、発現は Abyss_UI_UnveilLayer_01、ヒネコラは Currency_Use.bank の TotA_UI_HinekorasUse。
 * 専用の音が無い物 (増強・神・熟練工のオーブ・エッセンス・触媒など) は OrbUse_01
 */
const BONES = 5;
export function sfxOf(key: string): string {
  if (key.startsWith("transmute")) return "transmute";
  if (key.startsWith("alchemy")) return "alchemy";
  if (key.startsWith("regal")) return "regal";
  if (key.startsWith("exalt")) return "exalt";
  if (key.startsWith("chaos")) return "chaos";
  if (key.startsWith("annul")) return "annul";
  if (key.startsWith("fracture")) return "fracture";
  if (key === "whetstone") return "whetstone";
  if (key === "scrap") return "scrap";
  if (key === "etcher") return "etcher";
  if (key === "bauble") return "bauble";
  if (key === "gemcutter") return "gemcutter";
  if (key === "jeweller_lesser") return "jeweller-lesser";
  if (key === "jeweller_greater") return "jeweller-greater";
  if (key.startsWith("jeweller")) return "jeweller";
  if (key === "hinekora") return "hinekora";
  if (key.startsWith("vaal_infuser")) return "vaal-infuser";
  if (key.startsWith("rune:")) return /Soul Core/i.test(key) ? "soulcore" : "rune";
  // 骨 (5 通りからランダム) と発現 (アビスの UI の音)
  if (key.startsWith("desecrate")) return `bone-${1 + Math.floor(Math.random() * BONES)}`;
  if (key.startsWith("reveal:")) return "reveal";
  return "orb";
}

let ctx: AudioContext | null = null;
const ALL = ["orb", "transmute", "alchemy", "regal", "exalt", "chaos", "annul", "fracture", "vaal-infuser", "rare",
  "whetstone", "scrap", "etcher", "bauble", "gemcutter", "jeweller-lesser", "jeweller", "jeweller-greater", "hinekora", "rune", "soulcore", "reveal", "omen",
  ...Array.from({ length: BONES }, (_, i) => `bone-${i + 1}`)];
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
  // 寝ている (suspended)・電話などで止められた (Safari の interrupted) 時は、次に触った時に起こし直す
  // Esc・修飾キーだけはブラウザが「使う人の操作」に数えないので起こさない (起こすと毎回「The AudioContext was not allowed to start」の警告。モンキーテスト 10-23 の 11)
  const wake = (e: Event): void => {
    if (e instanceof KeyboardEvent && (e.key === "Escape" || e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta")) return;
    // 指 (タッチ・ペン) は pointerdown ではまだ操作に数えられず、pointerup から (マウスは逆に pointerdown から)。モンキーテスト 10-23 の 9
    if (e instanceof PointerEvent && (e.type === "pointerdown") !== (e.pointerType === "mouse")) return;
    if (ctx && ctx.state !== "running" && ctx.state !== "closed") void ctx.resume();
  };
  // iPhone の Safari は pointerdown では音の出口を起こさせてくれない (touchend・click が要る。2026-10-16 オーナー「音が出ない」)
  for (const ev of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) window.addEventListener(ev, wake, { capture: true, passive: true });
}
const buffers = new Map<string, Promise<AudioBuffer | null>>();
/**
 * 聞き心地 (2026-10-16 オーナー「音が不快、見直した方が良い」)。ゲームの音はファイルごとに大きさが 6 dB ほど違い、ほとんどが 0 dB まで振れていて、
 * 1 個 1.7〜3.1 秒あるので続けて打つと前の音に重なって濁っていた。
 *   - 大きさをそろえる: 読んだ時に音の平均の大きさ (RMS) を測り、TARGET_DB にそろえる倍率を掛ける (ピークは 0.9 を超えない)
 *   - 重ねない: 次の音を鳴らす時、前の音は FADE_PREV 秒で消す (1 つだけ鳴る)
 *   - 短く: TAIL_AT 秒から TAIL_LEN 秒で消す (残響の尾を切る)
 */
const TARGET_DB = -24;
const FADE_PREV = 0.06;
const TAIL_AT = 0.9;
const TAIL_LEN = 0.35;
const levels = new Map<string, number>();
function levelOf(buf: AudioBuffer): number {
  const d = buf.getChannelData(0);
  let sum = 0, peak = 0;
  for (let i = 0; i < d.length; i++) { const v = d[i]!; sum += v * v; const a = Math.abs(v); if (a > peak) peak = a; }
  const rmsDb = 20 * Math.log10(Math.sqrt(sum / Math.max(1, d.length)) || 1e-6);
  const k = 10 ** ((TARGET_DB - rmsDb) / 20);
  return peak > 0 ? Math.min(k, 0.9 / peak) : 1;
}
let voice: { src: AudioBufferSourceNode; gain: GainNode; name: string } | null = null;
const decoded = new Map<string, AudioBuffer>();
function load(name: string): Promise<AudioBuffer | null> {
  let p = buffers.get(name);
  if (!p) {
    p = fetch(`/sfx/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => ctx!.decodeAudioData(b))
      .then((buf) => { decoded.set(name, buf); levels.set(name, levelOf(buf)); return buf; })
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
    // 電話の後などは Safari が interrupted のまま止めるので、running でなければ起こし直す
    if (c.state !== "running" && c.state !== "closed") void c.resume();
    const play = (buf: AudioBuffer | null): void => {
      if (!buf) return;
      const now = c.currentTime;
      // 前の音は短く消す (重ねない)
      // 神の音は次の手で切らない
      if (voice && voice.name !== "rare") {
        const old = voice;
        try { old.gain.gain.cancelScheduledValues(now); old.gain.gain.setValueAtTime(old.gain.gain.value, now); old.gain.gain.linearRampToValueAtTime(0, now + FADE_PREV); old.src.stop(now + FADE_PREV + 0.01); } catch { /* 止まっていてよい */ }
      }
      const src = c.createBufferSource();
      const gain = c.createGain();
      // 珍しい段の音 (神) は前のまま (2026-10-16 オーナー「神は 100 点」)。大きさのそろえ・尾の切りは打った時の音だけ
      const v = VOLUME * loud * (name === "rare" ? 1 : levels.get(name) ?? 1);
      gain.gain.setValueAtTime(v, now);
      // 尾を切る
      // 珍しい段の音 (しゃきぃん → ぽーん) は最後まで鳴らす
      const cut = name !== "rare" && buf.duration > TAIL_AT + TAIL_LEN;
      if (cut) {
        gain.gain.setValueAtTime(v, now + TAIL_AT);
        gain.gain.linearRampToValueAtTime(0, now + TAIL_AT + TAIL_LEN);
      }
      src.buffer = buf;
      src.connect(gain).connect(c.destination);
      src.start(now);
      if (cut) src.stop(now + TAIL_AT + TAIL_LEN + 0.02);
      voice = { src, gain, name };
      src.onended = () => { if (voice?.src === src) voice = null; };
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
