// 画面の部品 (tree-hand-plan → use-tree → web/track ほか) が読み込みの時に触るブラウザの物の代わり (node で回すためだけ。中身は空)
const g = globalThis as Record<string, unknown>;
const store = new Map<string, string>();
const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 };
const noop = (): void => {};
g.location ??= { href: "http://localhost/web.html", search: "", hash: "", pathname: "/web.html", host: "localhost", hostname: "localhost", origin: "http://localhost", protocol: "http:" };
g.localStorage ??= storage;
g.sessionStorage ??= storage;
g.navigator ??= { userAgent: "node", language: "ja", languages: ["ja"], sendBeacon: () => true };
g.document ??= { referrer: "", cookie: "", visibilityState: "visible", addEventListener: noop, removeEventListener: noop, documentElement: { style: {}, classList: { add: noop, remove: noop, toggle: noop }, setAttribute: noop, lang: "ja" }, body: { classList: { add: noop, remove: noop, toggle: noop } }, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }), head: { appendChild: noop } };
g.window ??= Object.assign(g, { addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }), innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1, history: { replaceState: noop, pushState: noop, state: null }, screen: { width: 1920, height: 1080 }, requestAnimationFrame: (f: () => void) => setTimeout(f, 0), cancelAnimationFrame: noop });
