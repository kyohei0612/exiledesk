/**
 * _coe-load.cjs — Craft of Exile の手元の写し (data-cache/coe-beta-*.js(on)) を Node の vm の中で読み込む (解析君、2026-10-23)。
 * vm の箱には require・fs・process を渡さない (CoE のコードはファイルや外に触れない)。ブラウザの物 (document・$・localStorage) は何もしない代わりの物で埋める
 */
const fs = require("fs"), vm = require("vm");
const el = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => "" : k === "innerHTML" ? "{}" : el()), apply: () => el(), construct: () => el() });
const said = [];
const ctx = { console: { log() {}, warn() {}, error: (...a) => said.push(a.join(" ")), trace: (...a) => said.push(a.join(" ")) }, Math, JSON, Date, setTimeout, clearTimeout, setInterval, Array, Object, Number, String, Map, Set, Promise, parseInt, parseFloat, isNaN, Symbol, Error, RegExp, Boolean, Infinity, NaN, structuredClone };
ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
ctx.document = el(); ctx.$ = el(); ctx.jQuery = ctx.$;
for (const k of ["HTMLElement", "Element", "Node", "Event", "CustomEvent"]) ctx[k] = function () {};
ctx.MutationObserver = function () { return { observe() {} }; };
ctx.fetch = () => Promise.resolve(el());
ctx.localStorage = { getItem: () => null, setItem() {} }; ctx.navigator = { userAgent: "node" }; ctx.location = { search: "", hash: "", href: "" };
vm.createContext(ctx);
const read = (f, name) => vm.runInContext(fs.readFileSync(f, "utf8").replace(new RegExp(`^${name}=`), `var ${name}=`), ctx);
read("data-cache/coe-beta-data.json", "coedata");
read("data-cache/coe-beta-english.json", "coelang");
vm.runInContext(fs.readFileSync("data-cache/coe-beta-package_poe2.js", "utf8"), ctx, { timeout: 30000 });
vm.runInContext("user.getSetting = () => null; user.getData = () => null; coedata.items.craftable = CraftingHelper.getCraftableItems(coedata);", ctx);
module.exports = { ctx, said, run: (code) => vm.runInContext(code, ctx) };
