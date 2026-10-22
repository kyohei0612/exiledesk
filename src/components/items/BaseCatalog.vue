<!--
  BaseCatalog.vue — ベースを選ぶ一覧 (種類の段 → ゲーム内の絵つきのカード、名前で探す) (2026-09-29)

  クラフトステージのベース選びから切り出した共通の部品 (クラフト計算機でも使う)。中身は [[base-catalog.ts]]。
  selected: 今のベース (金の枠。その種類から開く)。extras: フラスコ・スキルジェムも出す。note: カードの下に足す 1 行 (計算機の付与スキルなど)
-->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { usePhone } from "../../utils/use-phone";
import BaseCardGrid from "./BaseCardGrid.vue";
import { baseCatalog, CATALOG_ROWS, CATALOG_ROW_EN, classEn, VARIANT_EN, type CatalogRow as CatalogRowT } from "../../services/items/base-catalog";
import { tr } from "../../i18n/lang";
import { glideBy, glideRect, scrollBoxOf } from "../../utils/keep-place";
import { baseArt } from "../../services/craft-stage/base-art";
import { gemArt } from "../../services/craft-stage/skill-art";
import { uniqueArt } from "../../services/assets/unique-art";
import FAM_GLOW from "./fam-glow.json";
import type { PatchData } from "../../vendor/poe2htc/engine/types";
import popularData from "../../data/popular-bases.json";

/** popular: 一番上に「人気のベース」の段を出す (初めての人のベース選び。2026-10-11 オーナー「解析で人気のベースをそのまま選択させる」) */
const props = defineProps<{ data: PatchData | null; selected?: string | null; extras?: boolean; note?: (en: string) => string; height?: string; popular?: boolean }>();
const emit = defineEmits<{ pick: [en: string] }>();

const all = computed(() => (props.data ? baseCatalog(props.data, !!props.extras) : []));
const count = computed(() => {
  const m = new Map<string, number>();
  for (const b of all.value) m.set(b.cls, (m.get(b.cls) ?? 0) + 1);
  return m;
});
/** 今の種類。selected が空文字 = 未選択の時は種類も選ばない (クラフトステージのシミュレーションのリセット後・最初。2026-10-05) */
const cls = ref<string | null>(all.value.find((b) => b.en === props.selected)?.cls ?? (props.selected === "" ? null : "Rings"));
const query = ref("");
/** 部位のタイルを元のベースの絵に・光と粒なし (チェック。このブラウザに覚える) */
const PLAIN_KEY = "exiledesk.baseTiles.plain";
const plainArt = ref((() => { try { return localStorage.getItem(PLAIN_KEY) === "1"; } catch { return false; } })());
watch(plainArt, (v) => { try { localStorage.setItem(PLAIN_KEY, v ? "1" : "0"); } catch { /* 覚えられなくても動く */ } });
/**
 * 人気のベース: 分析の記録でそのベースで 5 手以上打った人の数 (scripts/build-popular-bases.mjs)。部位の中では人気の物を先に、札を付ける。
 * 一番上の段は部位をまたいだ上位 (2 人以上)
 */
const POP: Readonly<Record<string, number>> = (popularData as { users: Record<string, number> }).users;
const HOT_MIN = 2;
// スマホだけ (PC はヘビーな人向けなので出さない。2026-10-11 オーナー)。並び替え・札・一番上の段の全部
const hot = computed(() => new Set(phone.value ? all.value.filter((b) => (POP[b.en] ?? 0) >= HOT_MIN).map((b) => b.en) : []));
const popularTop = computed(() => [...all.value].filter((b) => hot.value.has(b.en)).sort((a, b) => (POP[b.en] ?? 0) - (POP[a.en] ?? 0)).slice(0, 8));
/**
 * 並べるベース: 検索中は全種類から名前で、そうでなければ選んだ種類を必要レベルの高い順 (ジェムは名前順)。
 * 高い方を押したアイコンの近くに (2026-10-10 オーナー「アイコンに近い方をレベルが高い順で、近くて即押しやすい方がいい」。前は低い順)
 */
/** 札で分けずに、押したら中のベースを全部並べる部位 (2026-10-11 オーナー「ジュエル押したら全部出しておけ」)。並びは札の順 */
const JOINED = new Set(["ジュエル"]);
const joined = computed(() => !!family.value && JOINED.has(family.value.name));
const list = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (q) return all.value.filter((b) => b.ja.toLowerCase().includes(q) || b.en.toLowerCase().includes(q)).slice(0, 80);
  if (joined.value) {
    const order = family.value!.variants.map((v) => v.cls);
    return all.value.filter((b) => order.includes(b.cls)).sort((a, b) => order.indexOf(a.cls) - order.indexOf(b.cls));
  }
  const l = all.value.filter((b) => b.cls === cls.value);
  const pop = (b: CatalogRowT): number => (hot.value.has(b.en) ? POP[b.en] ?? 0 : 0);
  return cls.value === "SkillGem" ? l : [...l].sort((a, b) => pop(b) - pop(a) || b.lvl - a.lvl || a.ja.localeCompare(b.ja, "ja"));
});
/**
 * 種類の札を全部並べると壁になる (手袋(str_dex) のような札が 50 個。2026-10-08 オーナー「UI カスすぎる」)。
 * 部位 (ゲームの絵のタイル) → 属性 / 元素 (日本語の札) → ベースの 3 段。スマホは 1 段ずつ (← 部位 で戻る)、
 * PC は部位のタイルを並べたまま下に属性とベースを出す (2026-10-09 オーナー「シミュレーターで装備のアイコンでスマホ版との齟齬あるよね」: PC だけ文字の札だった)
 */
const phone = usePhone();
const ATTR_JA: Record<string, string> = { str: "筋力", dex: "器用", int: "知性", str_dex: "筋力・器用", str_int: "筋力・知性", dex_int: "器用・知性" };
/**
 * 種類の札 (手袋(str) / ワンド(火)) を「部位」と「中の札」に分ける。name は日本語 (中の目印)、en は英語の画面の名前
 * (2026-10-10 動きの揃え: 英語はクライアントの ItemClasses / ClientStrings のまま。base-catalog.ts)
 */
interface Family { name: string; en: string; variants: Array<{ cls: string; label: string; en: string }> }
const famLabel = (f: Family): string => tr(f.name, f.en);
const famLabelOf = (v: { label: string; en: string }): string => tr(v.label, v.en);
const NO_ATTR_EN = "Plain";
const families = computed((): Array<{ ja: string; en: string; fams: Family[] }> =>
  CATALOG_ROWS.map((r) => {
    const fams: Family[] = [];
    for (const [c, ja] of r.cls) {
      if (!count.value.get(c)) continue;
      const m = /^(.*?)\s*\((.*)\)$/.exec(ja);
      const name = m ? m[1]! : ja;
      const raw = m ? m[2]! : "";
      const label = raw ? (ATTR_JA[raw] ?? raw) : (m ? "無印" : name);
      const v = c.match(/_(str_dex|str_int|dex_int|str|dex|int|fire|cold|lightning|chaos|physical)$/)?.[1];
      let f = fams.find((x) => x.name === name);
      if (!f) { f = { name, en: classEn(c, false), variants: [] }; fams.push(f); }
      f.variants.push({ cls: c, label: raw ? label : "無印", en: raw && v ? VARIANT_EN[v]! : NO_ATTR_EN });
    }
    return { ja: r.ja, en: CATALOG_ROW_EN[r.ja] ?? r.ja, fams };
  }).filter((r) => r.fams.length).reduce((acc: Array<{ ja: string; en: string; fams: Family[]; names: string[]; ens: string[]; single: boolean }>, r) => {
    // 1 部位しかない段 (手袋・靴・鎧・兜) が続く時は 1 段にまとめる (縦 1 列に並んでいた。2026-10-09 オーナー「兜、鎧あたりの UI」)
    const last = acc[acc.length - 1];
    if (r.fams.length === 1 && last?.single) { last.fams.push(...r.fams); last.names.push(r.ja); last.ens.push(r.en); }
    else acc.push({ ja: r.ja, en: r.en, fams: [...r.fams], names: [r.ja], ens: [r.en], single: r.fams.length === 1 });
    return acc;
  }, []).map((r) => {
    const armour = r.names.length > 1 && r.names.every((n) => ARMOUR.has(n));
    return { ja: r.names.length > 1 ? (armour ? "防具" : r.names.join("・")) : r.ja, en: r.names.length > 1 ? (armour ? CATALOG_ROW_EN["防具"]! : r.ens.join(" · ")) : r.en, fams: r.fams };
  }));
const ARMOUR = new Set(["手袋", "靴", "鎧", "兜"]);
/** ベースの絵 (スキルジェムはジェムの絵) */
const artOf = (en: string): string | null => baseArt(en) ?? gemArt(en);
/** 部位のタイルの絵 = その部位の一番高いレベルのベースの絵 (ゲーム内の絵) */
/** 部位のタイルの絵を決めて出すベース (2026-10-12 オーナーが選んだ: ジュエル = ダイヤモンド、指輪 = ブリーチリング、ベルト = 招来、アミュレット = 不在 (コロナは指輪に見える)、バックラー = ブレードガード、フォーカス = カルト信者、盾 = 貴族のタワーシールド、スタッフ = 鐘鳴、タリスマン = 雷、セプター = ラトリング、片手メイス = フランジ) */
const FAM_ART: Record<string, string> = {
  ジュエル: "Diamond", 指輪: "Breach Ring", ベルト: "Invoking Belt", アミュレット: "Absent Amulet", バックラー: "Bladeguard Buckler", フォーカス: "Cultist Focus",
  盾: "Noble Tower Shield", スタッフ: "Chiming Staff", タリスマン: "Thunder Talisman", セプター: "Rattling Sceptre", 片手メイス: "Flanged Mace",
};
/**
 * 武器・オフハンド・防具の部位のタイルはユニークの絵 (かっこよさで。2026-10-12 オーナーが選んだ。部位を選ぶボタンなのでベースと紛れない)。
 * バックラーはユニークの絵がデータに無いのでベースの絵のまま
 */
const FAM_UNIQUE: Record<string, string> = {
  片手メイス: "Mjölner", スピア: "The Ordained", セプター: "Sacred Flame", ワンド: "Adonia's Ego", 弓: "Splinterheart", クロスボウ: "Redemption",
  スタッフ: "The Whispering Ice", 両手メイス: "Chober Chaber", クォータースタッフ: "Pillar of the Caged God", タリスマン: "Amor Mandragora",
  盾: "Svalinn", フォーカス: "Rathpith Globe", 矢筒: "Cadiro's Gambit",
  兜: "Corona of the Red Sun", 鎧: "Kaom's Heart", 手袋: "Aerisvane's Wings", 靴: "The Infinite Pursuit", ベルト: "Mageblood", アミュレット: "Eventide Petals", 指輪: "The Taming", ジュエル: "Split Personality",
};
/**
 * 絵の主な色で光らせる (2026-10-13 オーナー「アイコンに合った感じの」: 一律の琥珀色ではなく、青いミョルナーは青く、赤い物は赤く)。
 * 読み込んだ絵を小さく描いて、色の濃い (彩度の高い) 画素の平均を取り、--glow に入れる。読めなければ CSS の既定 (琥珀色) のまま
 */
function tintGlow(e: Event): void {
  const img = e.target as HTMLImageElement;
  // アプリは絵を画像パック (よそのオリジン) から読むので canvas で色を読めない → 前もって計算した色 (scripts/build-fam-glow.py、2026-10-13 オーナー「アプリだと全部黄色」)
  // アプリの URL は http://asset.localhost/C%3A%5C…%5C名前.webp (区切りが \ で符号化されている) ので、戻してから / と \ の両方で切る
  const stem = (decodeURIComponent(img.src.split(/[?#]/)[0]!).split(/[\\/]/).pop() ?? "").replace(/\.webp$/, "");
  const pre = (FAM_GLOW as Record<string, string>)[stem];
  if (pre) { (img.parentElement ?? img).style.setProperty("--glow", pre); return; }
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 24;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return;
    g.drawImage(img, 0, 0, 24, 24);
    const d = g.getImageData(0, 0, 24, 24).data;
    let r = 0, gr = 0, b = 0, w = 0;
    for (let i = 0; i < d.length; i += 4) {
      const R = d[i]!, G = d[i + 1]!, B = d[i + 2]!, A = d[i + 3]!;
      if (A < 128) continue;
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      const sat = mx ? (mx - mn) / mx : 0;
      // 暗い所・灰色は数えない (光の色にならない)。明るく色の濃い画素ほど重く
      if (mx < 60 || sat < 0.25) continue;
      const k = sat * (mx / 255);
      r += R * k; gr += G * k; b += B * k; w += k;
    }
    if (w < 1) return;
    // 光らせるので明るめに (一番明るい成分を 255 近くまで持ち上げる)
    let R = r / w, G = gr / w, B = b / w;
    const up = 235 / Math.max(R, G, B, 1);
    R = Math.min(255, R * up); G = Math.min(255, G * up); B = Math.min(255, B * up);
    // 枠 (オーラ・光の粒) と絵の両方が使うので、枠に入れる
    (img.parentElement ?? img).style.setProperty("--glow", `${Math.round(R)}, ${Math.round(G)}, ${Math.round(B)}`);
  } catch { /* 読めない絵 (よそのドメイン) は既定の色 */ }
}
/**
 * 光の粒が下から立ちのぼる (2026-10-13 オーナー「A の小だな、ランダムで行こう、アイコンごとに」: 見比べの A、粒は 2px)。
 * 粒の数は 3 つで揃え、動き (横の位置・上る高さ・横へ流れる量・速さ・始まり) だけを部位の名前から決まる乱数でタイルごとにばらばらに (描き直しても同じ)
 */
function risers(name: string): Array<Record<string, string>> {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  const rnd = (): number => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  return Array.from({ length: 3 }, () => ({
    left: `${15 + rnd() * 70}%`,
    "--up": `${-(36 + rnd() * 20)}px`,
    "--dx": `${(rnd() - 0.5) * 12}px`,
    animationDuration: `${2.8 + rnd() * 1.8}s`,
    animationDelay: `${-rnd() * 4.5}s`,
  }));
}
function famArt(f: Family): string | null {
  const u = !plainArt.value && FAM_UNIQUE[f.name] && uniqueArt(FAM_UNIQUE[f.name]!);
  if (u) return u;
  const pin = FAM_ART[f.name] && artOf(FAM_ART[f.name]!);
  if (pin) return pin;
  const cs = new Set(f.variants.map((v) => v.cls));
  const bs = all.value.filter((b) => cs.has(b.cls)).sort((a, b) => b.lvl - a.lvl);
  for (const b of bs) { const a = artOf(b.en); if (a) return a; }
  return null;
}
/** 選んだ部位 (属性の札を出す)。1 種類しかない部位はそのまま種類を選ぶ。PC は今のベースの部位から開く */
const familyOfCls = (c: string | null): Family | null => (c ? families.value.flatMap((r) => r.fams).find((f) => f.variants.some((v) => v.cls === c)) ?? null : null);
const family = ref<Family | null>(phone.value ? null : familyOfCls(cls.value));
/**
 * PC は押した部位のタイルの行のすぐ下に、属性の札とベースのカードを出す。同じタイルをもう一度押すと畳む、別のタイルならその行の下に開き直す
 * (2026-10-10 オーナー「選んだアイコンの 1 行下に表示すべき、同じアイコンクリックでたたむ、他のベースなら別の一覧がアイコンの下に」)。
 * 段 (片手武器・両手武器…) は横に流れて 2 つ並ぶ行があるので、押した段と同じ高さにある最後の段の後ろに入れる
 */
const groupEls = new Map<string, HTMLElement>();
const setGroupEl = (ja: string) => (el: unknown): void => { if (el instanceof HTMLElement) groupEls.set(ja, el); else groupEls.delete(ja); };
const insertAfter = ref<string | null>(null);
function placeUnder(f: Family | null): void {
  if (!f || phone.value) { insertAfter.value = null; return; }
  const own = families.value.find((r) => r.fams.some((x) => x.name === f.name))?.ja;
  const top = own ? groupEls.get(own)?.offsetTop : undefined;
  if (own == null || top == null) { insertAfter.value = own ?? null; return; }
  let last = own;
  for (const r of families.value) { const t = groupEls.get(r.ja)?.offsetTop; if (t != null && Math.abs(t - top) < 4) last = r.ja; }
  insertAfter.value = last;
}
/** 開いた時に送った量 (畳んだらその分だけ戻す)。0 = 送らずに開いた */
let revealed = 0;
/** 送り終わった時の位置 (その後に自分で動かしていたら、畳んでも戻さない) */
let revealedAt: number | null = null;
const scrollTopOf = (box: HTMLElement | null): number => (box ? box.scrollTop : window.scrollY);
const rootEl = ref<HTMLElement | null>(null);
/**
 * 畳む: 開いた時に送っていなければ今の位置のまま、送っていたらその分だけ戻す
 * (2026-10-12 オーナー「スクロール関係ない所で開いて、戻る時は今の位置でおｋ。アイコンもっかいクリックしたら今置いてある位置からズレる」)。
 * 一覧が消えてページが短くなると下の端に押し戻されて画面が飛ぶので、一瞬だけ高さを残し、届かなくなる分だけぬるっと上へ送ってから外す
 * (高さを残したままにすると空きが残った。2026-10-12 オーナー「謎の空きが表示されたまま、たたむ際に必ず元の状態に戻す」)
 */
function fold(): void {
  const el = rootEl.value;
  const box = el ? scrollBoxOf(el) : null;
  const before = el?.offsetHeight ?? 0;
  if (el) el.style.minHeight = `${before}px`;
  family.value = null; insertAfter.value = null;
  const back = revealed, at = revealedAt;
  revealed = 0; revealedAt = null;
  if (!el) return;
  void nextTick(async () => {
    // 高さを残さなかった時の高さ = 消えた一覧の分だけ短い
    el.style.minHeight = "";
    const lost = Math.max(0, before - el.offsetHeight);
    el.style.minHeight = `${before}px`;
    const top = scrollTopOf(box);
    const max = (box ? box.scrollHeight - box.clientHeight : document.documentElement.scrollHeight - innerHeight) - lost;
    // 開く時に送っていた分を戻す (その後に自分で動かしていなければ)。それとは別に、短くなって届かなくなる分は必ず上へ
    const want = Math.max(back > 0 && at != null && Math.abs(top - at) < 2 ? back : 0, top - max);
    if (want > 0) await glideBy(box, -want);
    el.style.minHeight = "";
  });
}
/** 一覧を開き直した回数 (BaseCardGrid の key。変えると「もっと見る」が畳んだ状態に戻る) */
const openSeq = ref(0);
function pickFamily(f: Family): void {
  // PC で開いている部位をもう一度押したら畳む
  if (!phone.value && family.value?.name === f.name) { fold(); return; }
  if (rootEl.value) rootEl.value.style.minHeight = "";
  revealed = 0;
  openSeq.value++;
  // 行の位置は開いた物を閉じてから測る (開いた一覧の分だけ下の段がずれるので)
  insertAfter.value = null;
  family.value = f;
  // 属性の札は先頭 (筋力・無印) を選んだ状態で開いて、すぐベースを出す。札は上で切り替える
  // (2026-10-10 オーナー「押したら選ばせるんじゃなく最初から筋力のページ開いて上のタブで切り替え、アイコンと文字が挟まれると目が滑る」)
  if (f.variants.length) cls.value = f.variants.some((v) => v.cls === cls.value) ? cls.value : f.variants[0]!.cls;
  void nextTick(() => { placeUnder(f); void nextTick(() => requestAnimationFrame(() => requestAnimationFrame(() => revealPanel()))); });
}
/**
 * 開いた一覧の下 (「もっと見る」の少し下) が画面から切れている時だけ、そこまで滑らせて送る。見えている時は動かさない。一覧の上が画面の上から出ない所で止める
 * (2026-10-10 オーナー「全体が見えるとこまでスクロール、スクロールしないと見れない時だけ」「高速でスライド」「やるのは全部の挙動じゃなくスクロールが必要な時だけ」)。
 * 一覧そのものはぱっと開く。測るのは中の並び (列の数) が決まった後 (1 コマ待つ)
 */
/** bottomFirst: 一覧が画面より高い時も下 (帯 + 24px) を見せる (「もっと見る」で広げた時。2026-10-14 オーナー「下 24px あけるんじゃねえの」) */
function revealPanel(bottomFirst = false): void {
  const el = document.querySelector<HTMLElement>("[data-base-panel]");
  if (!el) return;
  const box = scrollBoxOf(el);
  const r = el.getBoundingClientRect();
  const viewBottom = box ? box.getBoundingClientRect().bottom : window.innerHeight;
  const viewTop = box ? box.getBoundingClientRect().top : 0;
  // 広げた時は「たたむ」の帯の下 + 24px を見せる (2026-10-14 オーナー「たたむ見えて + 24px ね」)
  const bars = bottomFirst ? el.querySelectorAll<HTMLElement>('button[aria-expanded="true"]') : null;
  const bar = bars?.length ? bars[bars.length - 1]! : null;
  const over = (bar ? bar.getBoundingClientRect().bottom : r.bottom) + 24 - viewBottom;
  if (over <= 0) return;
  revealed = bottomFirst ? over : Math.max(0, Math.min(over, r.top - viewTop - 8));
  revealedAt = null;
  // 位置の差とスクロール量の比はその場で測って 1 回で送る (glideRect。1920 幅 (拡大 1.16) で帯が 50px ほど切れていた、2026-10-14)
  void glideRect(box, el, revealed).then(() => { revealedAt = scrollTopOf(box); });
}
onMounted(() => { void nextTick(() => placeUnder(family.value)); });
/**
 * 「もっと見る」で広げた時: 伸びた一覧の下 (たたむの帯 + 少し) が切れていれば、そこまで送る (一覧の上は画面から出さない)。
 * 2026-10-14 オーナー「もっと見る押したら全体表示しないの？」(10-10 は「開いてもスクロールはいらない」だったのを変えた)
 */
let moreFrom: number | null = null;
function revealMore(): void {
  const el = document.querySelector<HTMLElement>("[data-base-panel]");
  moreFrom = el ? scrollTopOf(scrollBoxOf(el)) : null;
  void nextTick(() => requestAnimationFrame(() => requestAnimationFrame(() => revealPanel(true))));
}
/** 「たたむ」: 広げる前の位置に戻す (2026-10-14 オーナー「畳むのときも元の画面に戻ろうか」) */
function foldMore(): void {
  const el = document.querySelector<HTMLElement>("[data-base-panel]");
  const top = moreFrom;
  moreFrom = null;
  if (!el || top == null) return;
  const box = scrollBoxOf(el);
  void nextTick(() => (box ?? window).scrollTo({ top, behavior: "smooth" }));
}
/**
 * 開き直した時 (親が畳んだ一覧をもう一度開いた時) に呼ぶ: 今のベースの部位が開いているので、その一覧の全体が見えるまで送る (見えていれば動かさない)
 * (2026-10-12 オーナー「ベースを変えるを改めて押したら今のベースが埋まる、全体を表示させた方が良い」)
 */
function reveal(): void {
  if (rootEl.value) rootEl.value.style.minHeight = "";
  revealed = 0; revealedAt = null;
  openSeq.value++;
  placeUnder(family.value);
  if (family.value) void nextTick(() => requestAnimationFrame(() => requestAnimationFrame(() => revealPanel())));
}
/** 親がベース選びを畳んだ・ベースを選んだ時: 残した高さを必ず外して元の状態に (2026-10-12 オーナー「たたむ際に必ず元の状態に戻す」) */
function release(): void {
  if (rootEl.value) rootEl.value.style.minHeight = "";
  revealed = 0; revealedAt = null;
}
defineExpose({ reveal, release });
function backToFamilies(): void { family.value = null; cls.value = null; }
</script>

<template>
  <div ref="rootEl">
    <!-- 人気のベース (初めての人のベース選び): 部位をまたいだ上位。押せばそのまま始まる -->
    <div v-if="popular && !query.trim() && popularTop.length && (!phone || !family)" class="mb-4">
      <p class="mb-1 text-[12px] text-amber-200/90 md:text-[13px]">{{ tr("人気のベース", "Popular bases") }}<span class="ml-2 text-[11px] opacity-60">{{ tr("みんながよく作っているベース", "What people craft most") }}</span></p>
      <BaseCardGrid :list="popularTop" :selected="selected" :note="note" show-cls fold @pick="(en) => emit('pick', en)" />
    </div>
    <!-- 部位 → 属性 / 元素 → ベース。スマホは 1 段ずつ、PC は部位のタイルを並べたまま、押したタイルの行の下に属性とベースを出す -->
    <template v-if="!query.trim()">
      <!-- PC は段を横に流して 2 行ほどに (縦に 1 段ずつだと、押した後の属性とベースが画面の下に押し出された) -->
      <div v-if="!phone || !family" class="mb-3" :class="phone ? 'space-y-3' : 'flex flex-wrap gap-x-5 gap-y-2'">
        <template v-for="r in families" :key="r.ja">
          <!-- 宝飾品・その他は PC では最後の行に (防具・オフハンドの行に詰めない) -->
          <div :ref="setGroupEl(r.ja)" :class="!phone && r.ja === '宝飾品・その他' ? 'basis-full' : ''">
            <p class="mb-0.5 text-[11px] opacity-50 md:text-[12px]">{{ tr(r.ja, r.en) }}</p>
            <!-- 部位のタイル: ゲームの絵 + 名前 (スマホ 3 列。2026-10-09 オーナー「各種武器はアイコン出してもいいね、装備もほかの」) -->
            <div :class="phone ? 'grid grid-cols-3 gap-1.5' : 'flex flex-wrap gap-1'">
              <button v-for="f in r.fams" :key="f.name" type="button" :data-rec="`family:${f.variants[0]?.cls.replace(/_(str_dex|str_int|dex_int|str|dex|int|fire|cold|lightning|chaos|physical)$/, '') ?? f.name}`" class="g-plain flex flex-col items-center gap-0.5 px-1 pb-1.5 pt-1 text-center active:scale-95" :class="phone ? '' : ['w-[112px] rounded', family?.name === f.name ? 'bg-[rgba(163,52,42,0.35)] ring-1 ring-[var(--exile-color-border-brass)]' : 'hover:bg-white/5']" :aria-expanded="!phone ? family?.name === f.name : undefined" @click="pickFamily(f)">
                <!-- ユニークの絵はゆっくり光る (脈打つ光 + 乗せると光が走る。2026-10-13 オーナー「光らせることできる？動きのある感じで」)。タイルごとに少しずらして一斉に光らない -->
                <span class="grid size-16 place-items-center md:size-20" :class="[family?.name === f.name && !phone ? 'g-slot on' : 'g-slot', plainArt ? '' : 'fam-slot']">
                  <template v-if="!plainArt">
                    <span class="fam-aura" aria-hidden="true" />
                    <span v-for="(m, k) in risers(f.name)" :key="k" class="fam-rise" :style="m" aria-hidden="true" />
                  </template>
                  <img v-if="famArt(f)" :key="famArt(f)!" :src="famArt(f)!" alt="" loading="lazy" class="max-h-12 max-w-12 object-contain md:max-h-16 md:max-w-16" :class="plainArt ? '' : 'fam-art'" draggable="false" @load="tintGlow" />
                </span>
                <span class="g-antique leading-tight text-[var(--exile-color-text-primary)]" :class="phone ? 'text-[13px]' : 'text-[15px]'">{{ famLabel(f) }}</span>
                <span v-if="f.variants.length > 1 && !JOINED.has(f.name)" class="text-[10px] leading-none opacity-50 md:text-[11px]">{{ tr(`${f.variants.length} 種`, `${f.variants.length} types`) }}</span>
              </button>
            </div>
          </div>
          <!-- PC: 押したタイルの行のすぐ下 (行いっぱい) -->
          <div v-if="!phone && family && insertAfter === r.ja" data-base-panel class="basis-full rounded-md bg-black/25 p-2 ring-1 ring-white/10">
            <div v-if="family.variants.length > 1 && !joined" class="mb-2 flex flex-wrap gap-2">
              <button v-for="v in family.variants" :key="v.cls" type="button" :data-rec="`variant:${v.cls}`" class="g-tab !min-h-10 !px-4 !text-[14px]" :class="cls === v.cls ? 'on' : ''" @click="cls = v.cls">{{ famLabelOf(v) }}</button>
            </div>
            <p v-if="!cls" class="py-1 text-[12px] opacity-60">{{ tr("属性を選ぶ", "Choose an attribute") }}</p>
            <!-- 開き直す・部位を選び直すたびに畳んだ状態 (2 行 + もっと見る) から (2026-10-13 オーナー「もっと見るは一番下に来るでしょ」: 前に広げたまま開いていた) -->
            <BaseCardGrid v-else :key="openSeq" :list="list" :selected="selected" :note="note" :hot="hot" fold @pick="(en) => emit('pick', en)" @expand="revealMore" @collapse="foldMore" />
          </div>
        </template>
      </div>
      <!-- スマホ: 部位 → 属性 → ベースを 1 段ずつ -->
      <div v-if="phone && family" class="mb-3">
        <div class="mb-2 flex items-center gap-2">
          <button type="button" class="min-h-11 rounded-lg border border-white/20 px-3" @click="backToFamilies">{{ tr("← 部位", "← Item class") }}</button>
          <b class="text-[15px] text-amber-100">{{ famLabel(family) }}</b>
        </div>
        <div v-if="family.variants.length > 1 && !joined" class="mb-2 flex flex-wrap gap-2">
          <button v-for="v in family.variants" :key="v.cls" type="button" :data-rec="`variant:${v.cls}`" class="g-tab !min-h-10 !px-4 !text-[13px]" :class="cls === v.cls ? 'on' : ''" @click="cls = v.cls">{{ famLabelOf(v) }}</button>
        </div>
        <p v-if="!cls" class="py-1 text-[12px] opacity-60">{{ tr("属性を選ぶ", "Choose an attribute") }}</p>
      </div>
    </template>
    <!-- ② ベースのカード: スマホ (1 段ずつの最後) と名前で探す時はここ -->
    <BaseCardGrid v-if="query.trim() || (phone && cls)" :list="list" :selected="selected" :note="note" :hot="hot" :show-cls="!!query.trim()" :fold="!query.trim()" @pick="(en) => emit('pick', en)" />
    <!-- 名前で探す欄は外した (2026-10-18 オーナー「ここで探すことは無い」)。装備 (ユニークの絵)・エフェクトを切るチェックは一番下 (同)。
         タイルを元のベースの絵にして、光と粒も出さない。このブラウザに覚える (2026-10-13 オーナー) -->
    <label class="mt-3 flex w-fit cursor-pointer items-center gap-1.5 text-[12px] text-[var(--exile-color-text-secondary)] md:text-[13px]" :title="tr('部位のタイルを元のベースの絵にして、光と動きを止める', 'Show the plain base art on the category tiles, without glow or motion')">
      <input v-model="plainArt" type="checkbox" class="accent-amber-400" />{{ tr("装備・エフェクトオフ", "Plain art, no effects") }}
    </label>
  </div>
</template>

<style scoped>
/*
 * 部位のタイルの絵: その絵の色 (--glow、tintGlow が枠に入れる) の光が動き続ける (2026-10-13 オーナー「脈打たなくていい、動いてる感じで」「アイコンに合った」)。
 * 後ろにその色のぼやっとした光 (fam-aura、動かさない)、その色の小さな光の粒が下から立ちのぼる (fam-rise、タイルごとにばらばら)。絵は同じ色でうっすら光ったまま。乗せると少し大きく明るく
 */
.fam-slot { --glow: 255, 176, 80; position: relative; overflow: hidden; }
.fam-art { position: relative; z-index: 1; filter: drop-shadow(0 0 5px rgba(var(--glow), 0.6)); transition: transform 0.25s ease-out, filter 0.25s ease-out; }
.fam-aura {
  position: absolute;
  inset: 10%;
  border-radius: 50%;
  /* 後ろのぼやっとした光は動かさない (2026-10-13 オーナー「動かんくていいな、うしろのぼやっと光は」) */
  background: radial-gradient(circle, rgba(var(--glow), 0.32) 0%, rgba(var(--glow), 0.12) 45%, transparent 70%);
  filter: blur(4px);
  pointer-events: none;
}
.fam-rise {
  position: absolute;
  bottom: 10%;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: rgba(var(--glow), 0.95);
  box-shadow: 0 0 6px 1px rgba(var(--glow), 0.8);
  opacity: 0;
  animation: fam-rise 3.4s ease-out infinite;
  pointer-events: none;
  z-index: 2;
}
/* 光の粒: 下から立ちのぼって消える (高さ・流れ・速さは粒ごと) */
@keyframes fam-rise {
  0% { transform: translate(0, 0); opacity: 0; }
  15% { opacity: 1; }
  100% { transform: translate(var(--dx), var(--up)); opacity: 0; }
}
button:hover .fam-art { transform: scale(1.08); filter: drop-shadow(0 0 8px rgba(var(--glow), 0.95)) drop-shadow(0 0 16px rgba(var(--glow), 0.45)) brightness(1.12); }
button:hover .fam-aura { background: radial-gradient(circle, rgba(var(--glow), 0.45) 0%, rgba(var(--glow), 0.18) 45%, transparent 70%); }
/* 動きを減らす設定の人には動かさない (光だけ) */
@media (prefers-reduced-motion: reduce) {
  .fam-rise { animation: none; display: none; }
}
</style>
