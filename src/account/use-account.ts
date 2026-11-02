/**
 * use-account.ts — アカウントの画面 (A-90 の 5 か所) が使う状態と操作。画面の部品はまだ無く、どこからも呼ばれていない (スイッチ account の下で置く)。
 * 画面は押した時にここの関数を呼ぶだけ。取り物は押した時の 1 回 (A-42)。出したコードはコピーするまで閉じさせない (A-13)
 */
import { computed, ref } from "vue";
import { accountDevices, createAccount, linkAccount, myAccount, reissueCode, setAccountName, unlinkAccount, type AccountLocal } from "./account-client";
import { recipeCarrier, syncCarrier } from "./account-sync";

export interface Device { label: string; created: number; seen: number; me: boolean }

const account = ref<AccountLocal | null>(myAccount());
const devices = ref<Device[]>([]);
const busy = ref(false);
/** 結果の 1 行 (④ 表示の決まり) */
const message = ref("");
/** 今だけ見せるコード (③)。copied になるまで閉じる印を出さない */
const shownCode = ref<string | null>(null);
const copied = ref(false);
const lastSync = ref<number | null>(null);

function refresh(): void { account.value = myAccount(); }
async function run<T>(f: () => Promise<T>): Promise<T | null> {
  if (busy.value) return null;
  busy.value = true; message.value = "";
  try { return await f(); } finally { busy.value = false; refresh(); }
}
function showCode(code: string): void { shownCode.value = code; copied.value = false; }

/** ② この端末でアカウントを作る (デイリーで名前を決めた時も、無ければここで作る = A-60) */
export const create = (name?: string) => run(async () => {
  const r = await createAccount(name);
  if (!r.ok) { message.value = r.error; return false; }
  showCode(r.value.code);
  return true;
});
/** ④ コードでつなぐ。つないだらすぐ 1 回同期してこの端末のレシピと合わせる */
export const link = (code: string) => run(async () => {
  const r = await linkAccount(code);
  if (!r.ok) { message.value = r.error; return false; }
  const s = await syncCarrier(recipeCarrier);
  message.value = s.ok ? `つなぎました。レシピを ${s.up} 件上げ、${s.down} 件下ろしました` : `つなぎました (同期は失敗: ${s.error})`;
  if (s.ok) lastSync.value = Date.now();
  return true;
});
/** ① 今すぐ同期 */
export const syncNow = () => run(async () => {
  const s = await syncCarrier(recipeCarrier);
  message.value = s.ok ? `${s.up} 件上げ、${s.down} 件下ろしました` : s.error;
  if (s.ok) lastSync.value = Date.now();
  return s.ok;
});
/** ① コードを作り直す (dropOthers = 漏れた時、A-14) */
export const reissue = (dropOthers = false) => run(async () => {
  const r = await reissueCode(dropOthers);
  if (!r.ok) { message.value = r.error; return false; }
  showCode(r.value.code);
  if (dropOthers) devices.value = devices.value.filter((d) => d.me);
  return true;
});
/** ① つないだ端末の一覧 (窓を開いた時ではなく、一覧を開いた時に 1 回) */
export const loadDevices = () => run(async () => {
  const r = await accountDevices();
  if (!r.ok) { message.value = r.error; return false; }
  devices.value = r.value.devices;
  return true;
});
export const rename = (name: string) => run(async () => {
  const r = await setAccountName(name);
  if (!r.ok) message.value = r.error;
  return r.ok;
});
/** ① この端末を外す (保存物は消さない) */
export const unlink = () => run(async () => {
  const r = await unlinkAccount();
  if (!r.ok) { message.value = r.error; return false; }
  devices.value = []; message.value = "この端末を外しました。レシピはこの端末に残っています";
  return true;
});

/** ③ コピーした (これで閉じられる) */
export async function copyCode(): Promise<boolean> {
  if (!shownCode.value) return false;
  try { await navigator.clipboard.writeText(shownCode.value); copied.value = true; } catch { copied.value = false; }
  return copied.value;
}
export function closeCode(): boolean {
  if (!copied.value) return false;
  shownCode.value = null; copied.value = false;
  return true;
}

/** レシピを保存・消した時に呼ぶ (5 秒まとめて 1 回、A-42)。tree-recipes.ts から呼ぶのはシミュ部長へ (A-80) */
let timer: ReturnType<typeof setTimeout> | null = null;
export function scheduleRecipeSync(): void {
  if (!myAccount()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void syncNow(); }, 5000);
}

/** ⑤ 復元の要望の context (今の要望の口 POST /feedback にそのまま乗せる、A-70) */
export function restoreContext(name: string, recipes: string[], since: string): { account: { restore: true; name?: string; recipes: string[]; since?: string } } {
  return { account: { restore: true, ...(name.trim() ? { name: name.trim().slice(0, 12) } : {}), recipes: recipes.map((r) => r.trim()).filter(Boolean).slice(0, 2), ...(since ? { since } : {}) } };
}

export function useAccount() {
  return { account, linked: computed(() => !!account.value), devices, busy, message, shownCode, copied, lastSync };
}
