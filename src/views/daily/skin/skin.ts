/**
 * skin.ts — 皮 (D-60)。色は下の表の 1 行から全部決まる。1 行足せば 1 つ増える。部品は --skin-* と --exile-* を読むだけで、色を直書きしない。
 * h = 地の色相、s = 鮮やかさ (0〜100)、d = 暗さ (0〜1、1 が一番暗い)、g = 光の強さ (0〜1)、a = 見出しの色相、f = 時間の光の色相。
 * 要素の style に skinVars の答えを渡すだけで効くので、シミュの画面からも読める (D-60c)。字と枠も皮の変数で持つ
 */
export type Skin = { id: string; ja: string; en: string; h: number; s: number; d: number; g: number; a: number; f: number };

export const SKINS: readonly Skin[] = [
  { id: "ember", ja: "残り火", en: "Embers", h: 24, s: 16, d: 0.9, g: 0.8, a: 40, f: 20 },
  { id: "abyss", ja: "奈落", en: "Abyss", h: 95, s: 14, d: 0.92, g: 0.6, a: 80, f: 95 },
  { id: "eclipse", ja: "月蝕", en: "Eclipse", h: 228, s: 34, d: 0.92, g: 0.6, a: 222, f: 218 },
  { id: "desecrate", ja: "紫の冒涜", en: "Desecration", h: 282, s: 30, d: 0.9, g: 0.75, a: 290, f: 300 },
  { id: "blood", ja: "血の聖別", en: "Blood rite", h: 356, s: 34, d: 0.92, g: 0.9, a: 12, f: 2 },
  { id: "noble", ja: "金の高貴", en: "Exalted gold", h: 44, s: 26, d: 0.85, g: 0.7, a: 46, f: 48 },
  { id: "frost", ja: "氷の霜", en: "Hoarfrost", h: 192, s: 34, d: 0.88, g: 0.6, a: 188, f: 186 },
  { id: "storm", ja: "雷の紫電", en: "Thunderhead", h: 252, s: 30, d: 0.92, g: 1, a: 58, f: 56 },
  { id: "venom", ja: "毒の沼", en: "Venom mire", h: 130, s: 26, d: 0.93, g: 0.7, a: 100, f: 110 },
  { id: "sand", ja: "砂の塔", en: "Sand tower", h: 36, s: 20, d: 0.8, g: 0.45, a: 34, f: 26 },
  { id: "deep", ja: "深海", en: "Deep sea", h: 204, s: 56, d: 0.93, g: 0.65, a: 174, f: 176 },
  { id: "ash", ja: "灰", en: "Ash", h: 30, s: 4, d: 0.9, g: 0.35, a: 36, f: 30 },
];

const hsl = (h: number, s: number, l: number, a = 1): string => `hsl(${h} ${s.toFixed(1)}% ${l.toFixed(1)}% / ${a})`;
/** 地の明るさ。暗さ 1 で 2%、0 で 10% */
const baseL = (k: Skin): number => 2 + (1 - k.d) * 8;

/** 皮の 1 行 → CSS の変数の全部 */
export function skinVars(k: Skin): Record<string, string> {
  const L = baseL(k), tint = k.s * 0.5;
  const bg = hsl(k.h, tint, L), panel = hsl(k.h, tint, L + 2.5), raise = hsl(k.h, tint, L + 5), line = hsl(k.h, tint, L + 14);
  const title = hsl(k.a, 30 + k.s, 74), text = hsl(k.h, tint * 0.8, 80), dim = hsl(k.h, tint * 0.8, 60);
  return {
    "--skin-bg": bg, "--skin-panel": panel, "--skin-raise": raise, "--skin-line": line,
    "--skin-title": title, "--skin-text": text, "--skin-dim": dim,
    "--skin-fire": hsl(k.f, 100, 62), "--skin-fire-core": hsl(k.f, 100, 88), "--skin-fire-dim": hsl(k.f, 40, 36),
    "--skin-glow": hsl(k.f, 100, 60, 0.55 * k.g), "--skin-stripe": hsl(k.h, 30, 80, 0.035), "--skin-hover": hsl(k.h, 30, 80, 0.07),
    "--skin-font-head": "var(--exile-font-family-brush, serif)", "--skin-font-name": "var(--exile-font-family-antique, serif)",
    // ゲームの絵 (枠・帯・札) を皮の色へ寄せる。絵の元の色相は真鍮の 40 くらい
    "--skin-art": `hue-rotate(${k.a - 40}deg) saturate(${Math.min(1.8, 0.35 + k.s / 25).toFixed(2)}) brightness(${(1.25 - k.d * 0.5).toFixed(2)})`,
    // 部品の方の色も同じ値へ (シミュの部品はこの名前を読む)
    "--exile-color-bg-canvas": bg, "--exile-color-bg-surface": panel, "--exile-color-bg-elevated": raise, "--exile-color-border-subtle": line,
    "--exile-color-text-title": title, "--exile-color-text-primary": text, "--exile-color-text-secondary": dim,
  };
}

function hslRgb(h: number, s: number, l: number): [number, number, number] {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number): number => { const t = (n + h / 30) % 12; return l / 100 - a * Math.max(-1, Math.min(t - 3, 9 - t, 1)); };
  return [f(0), f(8), f(4)];
}
const lum = (c: [number, number, number]): number => { const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number]; return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** 文字の濃さの見張り: 薄い字と地の比。4.5 未満は回さない (D-60a) */
export function skinContrast(k: Skin): number {
  const L = baseL(k), tint = k.s * 0.5;
  return ratio(lum(hslRgb(k.h, tint * 0.8, 60)), lum(hslRgb(k.h, tint, L + 5)));
}
export const SKIN_MIN = 4.5;
export const usableSkins = (): Skin[] => SKINS.filter((k) => skinContrast(k) >= SKIN_MIN);

/** その日の皮 (日付で順に回る。7:00 JST 区切りの日の番号を渡す) */
export function skinOfDay(dayNo: number): Skin {
  const list = usableSkins();
  return list[((dayNo % list.length) + list.length) % list.length]!;
}
export const skinById = (id: string | null): Skin | null => SKINS.find((k) => k.id === id) ?? null;
