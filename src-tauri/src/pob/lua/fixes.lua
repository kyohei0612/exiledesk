-- fixes.lua — ExileDesk 側の PoB の補正の層 (2026-10-02)
--
-- vendor/PathOfBuilding-PoE2 (本家、submodule) のファイルは直接変えない。本家の読み方で落ちる物をここで包んで直す。
-- lua_boot.rs の boot_pob が HeadlessWrapper.lua を読んだ直後 (= ビルドの読み込みより前) に 1 回だけ流す。
-- ビルドの中のアイテムも絆を持ち得るので、pck.lua (画面が読み込みのたびに送る部品) に置くのでは遅い。
--
-- [1] 絆 (Bonded) の行が計算に乗らない本家の限界 (ModParser.lua の parseMod):
--   取引所・ゲームのコピーのルーン / ソウルコアの行は `Bonded: <効果>` の形で runeModLines に入る (Item.lua が modLine.bonded = true を立てる)。
--   本家は preFlagList の `^bonded: ` でこの接頭を外し、各 MOD に { type = "Condition", var = "CanUseBondedModifiers" } を付ける
--   (ツリーの Wisdom of the Maji「Gain the benefits of Bonded modifiers on Runes and Idols」で条件が立つ)。ただし:
--     a. specialModList (全文一致の特別な行) の照合は接頭を外す **前** に全文で行うので、
--        `Bonded: Break Armour on Critical Hit with Spells equal to 36% of Physical Damage dealt` のような行は当たらない
--     b. preFlag は 1 つしか取らないので、`Bonded: Every Rage also grants 3% increased Spell Damage` は `Bonded: ` に食われて
--        `^every rage also grants ` (Multiplier:RageEffect) に当たらない
--   → 行が `^bonded: ` で始まり、本家の結果が nil か extra (読めなかった) なら、接頭を外した行を本家の parseMod に通し、
--     返った各 MOD に本家と同じ条件タグを付けて返す。本家が読める行は本家の結果をそのまま使う (タグを二重に付けない)。
--     接頭を外しても読めない行 (Archon recovery period expires 90% faster、Fissure Skills have +3 to Limit など) は本家の結果 (読めない) のまま。
--   直した結果は本家のキャッシュ (modLib.parseModCache) に入れるので、2 回目からは本家の関数がそのまま同じ結果を返す。
--
-- ここで EXILEDESK_FIXES を立てる (確かめの Lua が「補正が入っているか」を見る印)。
EXILEDESK_FIXES = EXILEDESK_FIXES or {}

do
  local origParseMod = modLib.parseMod
  local cache = modLib.parseModCache
  -- 本家 ModParser.lua の preFlagList["^bonded: "] と同じ形
  local BONDED_TAG = { type = "Condition", var = "CanUseBondedModifiers" }

  local function hasBondedTag(mod)
    for _, tag in ipairs(mod) do
      if type(tag) == "table" and tag.type == BONDED_TAG.type and tag.var == BONDED_TAG.var then return true end
    end
    return false
  end

  modLib.parseMod = function(line, isComb)
    local modList, extra = origParseMod(line, isComb)
    -- 本家が読めた (MOD があって extra 無し) ならそのまま
    if modList and not extra then return modList, extra end
    local body = line:match("^[Bb]onded: (.+)$")
    if not body then return modList, extra end
    local innerList, innerExtra = origParseMod(body, isComb)
    -- 接頭を外しても読めない行は本家の結果のまま (画面には「読めなかった行」として出る)
    if not innerList or innerExtra then return modList, extra end
    for _, mod in ipairs(innerList) do
      if not hasBondedTag(mod) then mod[#mod + 1] = copyTable(BONDED_TAG) end
    end
    -- 本家のキャッシュに入れて、次からは本家の関数が同じ結果を返すようにする (本家は copyTable して返すので中身は守られる)
    if cache then cache[line] = { innerList, nil } end
    return copyTable(innerList), nil
  end
  EXILEDESK_FIXES.bondedParseMod = true
end
