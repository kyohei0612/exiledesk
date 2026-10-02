-- pck.lua — 火力チェックの画面 (2026-10-02) が PoB の中で使う部品。PoB の計算には手を入れず、PoB の関数を呼ぶだけ。
-- 読み込んだビルドに対して 1 回送ると、グローバルの PCK が使えるようになる (画面は `return PCK.summary()` などを送る)。
--
-- 決まり (2026-10-02 の点検で本家とずれていた所を直した。直す時はここに足す):
--   * 返す物は全部 { ok = true/false, error = "…" } を持つ JSON。変える関数は PCK.mutate を通す (pcall・buildFlag・キャッシュ消し を 1 箇所で)
--   * 数字を読む前は必ず PCK.recalc() (本家の OnFrame と同じ: wipeGlobalCache → BuildOutput。これを飛ばすと段数やミニオンのトリガーが前の状態のまま)
--   * 内訳 (CALCS) の出力を読むが、本家の左のサイドバー (MAIN) と同じ物差しにそろえる: 効果の条件は Effective、
--     スタットセット・段数は MAIN 側の選び (サイドバーのプルダウンは MAIN 側しか書かない)
--   * 数字は「ゲーム内の表記」に寄せる (オーナー 2026-10-01「ゲーム内に合わせたい」「仮想ボスはいらん」):
--     PoB の 1 発 (<種類>HitAverage) は敵側の倍率 (<種類>EffMult = 耐性・呪い・露出・受けるダメージ増加) が掛かった後なので、
--     それで割り戻して「敵がいない時の 1 発」にする。継続 (出血・毒・発火・DoT) も <状態異常>EffMult / <種類>DotEffMult で割り戻す。
--     カリング・予約の倍率 (PoB の CombinedDPS に掛かる) はゲーム内の表記に無いので行の DPS に入れない (別に返す)
--   * メタジェム (CoEA など) から出るスキルは PoB がエネルギーを計算しないので、自分で撃った扱いの数字になる (PoB の限界、画面に注記)
local json = require("dkjson")
PCK = {}
local TYPES = { "Physical", "Lightning", "Cold", "Fire", "Chaos" }
local AILMENTS = { "Bleed", "Poison", "Ignite" }

--- 画面に出すエラー (Lua の位置 [string "..."]:NN: を付けない)
local function fail(msg) error(msg, 0) end

local function count(t)
  local n = 0
  for _ in pairs(t) do n = n + 1 end
  return n
end

--- 本家の Build:OnFrame の計算の部分と同じ (buildFlag → wipeGlobalCache → BuildOutput)
function PCK.recalc()
  if wipeGlobalCache then wipeGlobalCache() end
  build.calcsTab:BuildOutput()
  build.buildFlag = false
end

--- 変える関数の共通の枠: 失敗しても PoB の状態を壊さず、画面に理由を返す
function PCK.mutate(fn)
  local ok, res = pcall(fn)
  build.buildFlag = true
  if not ok then return json.encode({ ok = false, error = tostring(res) }) end
  res = res or {}
  if res.ok == nil then res.ok = true end
  return json.encode(res)
end

--- 内訳 (CALCS) の選びを MAIN と同じにする (本家 CalcSetup.lua: CALCS は statSetCalcs / skillStageCountCalcs / misc_buffMode を見る)
local function alignCalcsToMain()
  build.calcsTab.input.misc_buffMode = "EFFECTIVE"
  for _, g in ipairs(build.skillsTab.socketGroupList) do
    for _, gem in ipairs(g.gemList or {}) do
      gem.statSetCalcs = gem.statSet
      gem.skillStageCountCalcs = gem.skillStageCount
    end
  end
end

--- 1 発の合計 (種類ごとの HitAverage の和)
local function hitOf(src)
  local h = 0
  for _, t in ipairs(TYPES) do h = h + (src[t .. "HitAverage"] or 0) end
  return h
end

--- 手 (上の段 / MainHand / OffHand) 1 つ分の 1 発: 敵側を割り戻した物 (hit / crit) と PoB のまま (post)
local function handNumbers(src, o)
  local r = { hit = 0, crit = 0, post = 0, parts = {} }
  for _, t in ipairs(TYPES) do
    local eff = src[t .. "EffMult"] or o[t .. "EffMult"]
    if not eff or eff <= 0 then eff = 1 end
    local post = src[t .. "HitAverage"] or 0
    local h = post / eff
    r.hit = r.hit + h
    r.post = r.post + post
    r.crit = r.crit + (src[t .. "CritAverage"] or 0) / eff
    if h > 0 then r.parts[#r.parts + 1] = { type = t, hit = h } end
  end
  return r
end

--- 継続ダメージをゲーム内の表記に (状態異常は <状態異常>EffMult、DoT スキルは <種類>DotEffMult で割り戻す)
local function dotNumbers(o)
  local game, pob = 0, 0
  local function add(v, eff)
    v = v or 0
    if v <= 0 then return end
    pob = pob + v
    game = game + v / ((eff and eff > 0) and eff or 1)
  end
  for _, a in ipairs(AILMENTS) do add(o["Total" .. a .. "DPS"] or o[a .. "DPS"], o[a .. "EffMult"]) end
  -- DoT スキル (TotalDot) の種類は 1 つなので、出ている <種類>DotEffMult を使う
  local dotEff
  for _, t in ipairs(TYPES) do dotEff = dotEff or o[t .. "DotEffMult"] end
  add(o.TotalDot, dotEff)
  add(o.DecayDPS, o.DecayEffMult)
  add(o.CorruptingBloodDPS, o.BleedEffMult)
  add(math.max(o.BurningGroundDPS or 0, o.MirageBurningGroundDPS or 0), o.FireDotEffMult)
  add(math.max(o.CausticGroundDPS or 0, o.MirageCausticGroundDPS or 0), o.ChaosDotEffMult)
  return game, pob
end

--- o = 内訳 (CALCS) の出力、ms = そのスキル (calcsEnv.player.mainSkill)
--- アタックは 1 発の数字が武器ごと (o.MainHand / o.OffHand) に入っていて上の段に無い。二刀流 (bothWeaponAttack) は本家 CalcOffence の
--- combineStat と同じに合わせる: 1 発は両手の和 (combinesHitsWhenDualWielding でなければ ÷2)、クリ率・速さ・命中は上の段 (本家が合成済み)
local function gameNumbers(o, ms, minionOut, minionName)
  local flags = ms and ms.skillFlags or {}
  local sdata = ms and ms.skillData or {}
  local hands = {}
  if hitOf(o) > 0 then
    hands[1] = handNumbers(o, o)
  else
    for _, k in ipairs({ "MainHand", "OffHand" }) do
      if o[k] and hitOf(o[k]) > 0 then hands[#hands + 1] = handNumbers(o[k], o) end
    end
  end
  local hit, crit, post = 0, 0, 0
  local parts = {}
  for _, h in ipairs(hands) do
    hit, crit, post = hit + h.hit, crit + h.crit, post + h.post
    for _, p in ipairs(h.parts) do parts[#parts + 1] = p end
  end
  if #hands == 2 and flags.bothWeaponAttack and not sdata.combinesHitsWhenDualWielding then
    hit, crit, post = hit / 2, crit / 2, post / 2
    for _, p in ipairs(parts) do p.hit = p.hit / 2 end
  end
  -- ヒットの DPS は PoB の DPS (時間で当たるスキルや回数込み) に、敵側の倍率を割り戻した比を掛ける
  local ratio = post > 0 and hit / post or 1
  local cc = (o.CritChance or 0) / 100
  local hitDps = (o.TotalDPS or 0) * ratio
  local dot, dotPob = dotNumbers(o)
  -- インペイル・ミラージュは PoB のまま (本家の CombinedDPS の中身。敵側の倍率を分けて出せない)
  local other = (o.ImpaleDPS or 0) + (o.MirageDPS or 0)
  -- ミニオン (コンパニオン・スケルトン等): ミニオンの CombinedDPS (PoB のまま、敵込み)
  local minion = minionOut and (minionOut.CombinedDPS or minionOut.TotalDPS or 0) or 0
  return {
    hit = hit,
    crit = crit,
    critChance = o.CritChance or 0,
    speed = o.Speed or 0,
    hitChance = o.HitChance or 100,
    avg = hit * (1 - cc) + crit * cc,
    hitDps = hitDps,
    dot = dot,
    dotPob = dotPob,
    other = other,
    cull = o.CullingDPS or 0,
    minion = minion,
    minionName = minion > 0 and minionName or nil,
    dps = hitDps + dot + other + minion,
    enemyRatio = ratio,
    parts = parts,
    dualWield = (#hands == 2 and flags.bothWeaponAttack) and true or false,
  }
end

local function gemInfo(gem)
  local ge = gem.gemData and gem.gemData.grantedEffect
  return {
    name = gem.nameSpec or (ge and ge.name) or "?",
    level = gem.level or 0,
    quality = gem.quality or 0,
    corrupt = tonumber(gem.corruptLevel) or 0,
    enabled = gem.enabled ~= false,
    support = (ge and ge.support) and true or false,
    -- 本家 validateGemLevel が丸める上限 (無ければ 40)
    maxLevel = (ge and ge.levels and #ge.levels > 0) and #ge.levels or (gem.gemData and gem.gemData.naturalMaxLevel) or 40,
  }
end

--- 組 i のスキル k を内訳 (CALCS) の主スキルにして計算し、出力とスキルを返す。呼ぶ側が元に戻す
local function evalSkill(i, k)
  local calcs = build.calcsTab
  local g = build.skillsTab.socketGroupList[i]
  build.mainSocketGroup = i
  g.mainActiveSkill = k
  g.mainActiveSkillCalcs = k
  calcs.input.skill_number = i
  calcs:BuildOutput()
  return calcs.calcsOutput, calcs.calcsEnv
end

--- 今のビルドの全体 (キャラ・数値・スキルの組とスキルごとの数字)。DPS 0 のスキルも行に出す (画面側で出す・出さないを決める)
function PCK.summary()
  local calcs = build.calcsTab
  alignCalcsToMain()
  PCK.recalc()
  local env = calcs.mainEnv
  local o = calcs.mainOutput
  local spec = build.spec
  local res = {
    ok = true,
    char = { class = spec.curClass and spec.curClass.name or "", ascendancy = spec.curAscendClass and spec.curAscendClass.name or "", level = build.characterLevel },
    stats = {
      Life = o.Life, Mana = o.Mana, EnergyShield = o.EnergyShield, Ward = o.Ward,
      Spirit = o.Spirit, SpiritUnreserved = o.SpiritUnreserved,
      Str = o.Str, Dex = o.Dex, Int = o.Int,
      Armour = o.Armour, Evasion = o.Evasion, TotalEHP = o.TotalEHP,
      FireResist = o.FireResist, ColdResist = o.ColdResist, LightningResist = o.LightningResist, ChaosResist = o.ChaosResist,
      LowLife = env.player.modDB.conditions.LowLife and true or false,
      PowerCharges = o.PowerCharges, PowerChargesMax = o.PowerChargesMax,
    },
    -- 実効の数 (PoB は Min があれば 0 にしても Min 個が効く) と、設定に書いてある数
    config = {
      powerCharges = o.PowerCharges or 0,
      powerChargesInput = build.configTab.input.usePowerCharges and (build.configTab.input.overridePowerCharges or o.PowerChargesMax) or 0,
    },
    mainSocketGroup = build.mainSocketGroup,
    groups = {},
  }
  local origMain, origCalcs = build.mainSocketGroup, calcs.input.skill_number
  -- 途中で落ちても主スキルの選びを元に戻す
  local ok, err = pcall(function()
    -- 同じ中身の組 (スキルセットの 2 重など) は 1 つにまとめる。後の方は duplicateOf に元の番号
    local seenSig = {}
    for i, g in ipairs(build.skillsTab.socketGroupList) do
      local gr = { i = i, label = g.label or "", enabled = g.enabled ~= false, slot = g.slot, gems = {}, skills = {} }
      local sig = {}
      for j, gem in ipairs(g.gemList or {}) do
        local gi = gemInfo(gem)
        gi.j = j
        gr.gems[#gr.gems + 1] = gi
        sig[#sig + 1] = gi.name .. ":" .. gi.level .. ":" .. gi.quality .. ":" .. gi.corrupt .. ":" .. tostring(gi.enabled)
      end
      local key = table.concat(sig, "|") .. "|" .. tostring(g.slot) .. "|" .. tostring(gr.enabled)
      if seenSig[key] then gr.duplicateOf = seenSig[key] else seenSig[key] = i end
      -- メタジェム (CoEA など) の組: 2 つ目以降のスキルはメタジェムから出る
      local first = g.displaySkillList and g.displaySkillList[1]
      local isMeta = first and first.activeEffect and first.activeEffect.grantedEffect.skillTypes and first.activeEffect.grantedEffect.skillTypes[SkillType.Meta] and true or false
      gr.meta = isMeta
      if gr.enabled and not gr.duplicateOf then
        local origSkill, origSkillCalcs = g.mainActiveSkill, g.mainActiveSkillCalcs
        for k, _ in ipairs(g.displaySkillList or {}) do
          local mo, menv = evalSkill(i, k)
          local ms = menv.player.mainSkill
          local name = ms and ms.activeEffect and ms.activeEffect.grantedEffect and ms.activeEffect.grantedEffect.name or "?"
          local m = menv.minion
          gr.skills[#gr.skills + 1] = {
            k = k, name = name, level = ms and ms.activeEffect and ms.activeEffect.level or 0,
            triggered = (isMeta and k > 1) and true or false,
            game = gameNumbers(mo, ms, m and m.output, m and m.minionData and m.minionData.name),
            -- PoB の Hit DPS (敵込み)。移動スキル等 (showAverage) は CombinedDPS が 1 発の平均になるので使わない
            pobDps = mo.TotalDPS or 0,
          }
        end
        g.mainActiveSkill = origSkill
        g.mainActiveSkillCalcs = origSkillCalcs
      end
      res.groups[#res.groups + 1] = gr
    end
  end)
  build.mainSocketGroup = origMain
  calcs.input.skill_number = origCalcs
  calcs:BuildOutput()
  if not ok then return json.encode({ ok = false, error = tostring(err) }) end
  res.items = PCK.items()
  res.tree = PCK.treeState()
  res.weaponSet = build.itemsTab.activeItemSet.useSecondWeaponSet and 2 or 1
  return json.encode(res)
end

--- 共有 (PoB コード) の前に、画面で見ているスキルを PoB の主スキルにする (開いた人の左の数字がそのスキルになる)。
--- SaveDB が書く PlayerStat は mainOutput なので、ここで計算し直しておく (古い主スキルの数字がコードに入らないように)
function PCK.setMainSkill(i, k)
  return PCK.mutate(function()
    local g = build.skillsTab.socketGroupList[i]
    if not g then fail("組が無い") end
    build.mainSocketGroup = i
    g.mainActiveSkill = k
    g.mainActiveSkillCalcs = k
    PCK.recalc()
  end)
end

-- ---------------------------------------------------------------- 装備

local function modLines(list)
  local out = {}
  for _, ml in ipairs(list or {}) do
    if ml.line and ml.line ~= "" then out[#out + 1] = ml.line end
  end
  return out
end
--- 欄ごとの読み込んだ時の物 { id, active } (PCK.restore で戻す) と、画面から貼って足したアイテムの id (戻す・外す時に PoB から消す)
PCK.orig = PCK.orig or {}
PCK.added = PCK.added or {}

local function isFlaskLike(slotName)
  return slotName:match("Flask") or slotName:match("Charm")
end
local function rememberOrig(slot)
  if PCK.orig[slot.slotName] == nil then PCK.orig[slot.slotName] = { id = slot.selItemId or 0, active = slot.active and true or false } end
end
--- 欄に id を入れる。フラスコ・チャームは入れた時に有効に (本家は UI のチェックでしか立たず、立たないと計算に入らない)
local function putInSlot(slot, id, active)
  local it = build.itemsTab
  slot:SetSelItemId(id)
  if isFlaskLike(slot.slotName) then
    local a = id ~= 0 and (active ~= false) or false
    slot.active = a
    if it.activeItemSet[slot.slotName] then it.activeItemSet[slot.slotName].active = a end
  end
end
--- 画面から足したアイテムを PoB から消す (本家 DeleteItem。残すと共有コードに全部入る)
local function dropAdded(slotName)
  local it = build.itemsTab
  for _, id in ipairs(PCK.added[slotName] or {}) do
    local item = it.items[id]
    if item then it:DeleteItem(item, true) end
  end
  PCK.added[slotName] = nil
end
--- 両手武器を入れたら盾が外れる等、本家が UI の後処理 (PopulateSlots → IsItemValidForSlot) でやっている物。
--- 外れた欄は元に戻せるよう覚え、「どの欄に貼ったせいで外れたか」(displaced) も覚えて、その欄を元に戻す時に一緒に戻す
PCK.displaced = PCK.displaced or {}
local function settleSlots(bySlot)
  local it = build.itemsTab
  local before = {}
  for name, slot in pairs(it.slots) do before[name] = slot.selItemId or 0 end
  it:PopulateSlots()
  for name, slot in pairs(it.slots) do
    if (slot.selItemId or 0) ~= before[name] and PCK.orig[name] == nil then
      PCK.orig[name] = { id = before[name], active = slot.active and true or false }
      if bySlot then
        PCK.displaced[bySlot] = PCK.displaced[bySlot] or {}
        table.insert(PCK.displaced[bySlot], name)
      end
    end
  end
end

--- 装備の欄 (武器・防具・装飾品・フラスコ・取っているジュエルの穴) と、入っている物
function PCK.items()
  local it = build.itemsTab
  local out = {}
  for _, slot in ipairs(it.orderedSlots) do
    local name = slot.slotName
    local isJewel = slot.nodeId ~= nil
    local show = (not isJewel) or (build.spec.allocNodes[slot.nodeId] ~= nil)
    if show then
      local item = it.items[slot.selItemId]
      -- weaponSet: 武器の持ち替え (Weapon 1 Swap = 2 つ目の武器セット)。使っていない側は計算に入らない
      local e = { slot = name, jewel = isJewel, changed = PCK.orig[name] ~= nil, weaponSet = slot.weaponSet }
      if isFlaskLike(name) then e.active = slot.active and true or false end
      if item then
        e.item = {
          title = item.title or item.name, base = item.baseName, rarity = item.rarity,
          implicits = modLines(item.implicitModLines), runes = modLines(item.runeModLines),
          explicits = modLines(item.explicitModLines), corrupted = item.corrupted and true or false,
        }
      end
      -- 装備の中のジュエルの穴 (Weapon 1 Jewel Socket 1 など) は入っている時だけ
      -- 指輪 3 は一部のアセンダンシーだけ。空なら出さない
      if item or not (isJewel or name:find("Jewel Socket") or name == "Ring 3") then out[#out + 1] = e end
    end
  end
  return out
end

--- 欄に物を入れる (raw = PoB の文面)。最初に変えた時の元の物を覚えておき、PCK.restore で戻す
function PCK.equip(slotName, raw)
  return PCK.mutate(function()
    local it = build.itemsTab
    local slot = it.slots[slotName]
    if not slot then fail("欄が無い: " .. tostring(slotName)) end
    local item = new("Item", raw)
    if not item or not item.base then fail("PoB が読めない文面です") end
    -- 本家の欄の決まり (ライフフラスコはフラスコ 1 だけ、ジュエルの穴はジュエルだけ、両手武器のオフハンド等)
    if not it:IsItemValidForSlot(item, slotName) then fail("この欄には入れられない物です (" .. tostring(item.type or item.baseName) .. ")") end
    rememberOrig(slot)
    dropAdded(slotName)
    it:AddItem(item, true)
    PCK.added[slotName] = { item.id }
    putInSlot(slot, item.id, true)
    settleSlots(slotName)
    -- PoB が読めなかった行 (計算に入らない)
    local unread = {}
    for _, list in ipairs({ item.implicitModLines, item.explicitModLines, item.runeModLines }) do
      for _, ml in ipairs(list or {}) do
        if ml.extra then unread[#unread + 1] = ml.line end
      end
    end
    return { unread = unread }
  end)
end

--- 使う武器セット (1 / 2)。PoB の I / II のボタンと同じ (メインのスキルの組もその武器セットの物に寄せる)
function PCK.setWeaponSet(n)
  return PCK.mutate(function()
    local c = build.itemsTab.controls
    local btn = n == 2 and c.weaponSwap2 or c.weaponSwap1
    btn.onClick()
  end)
end

--- 欄を空にする
function PCK.unequip(slotName)
  return PCK.mutate(function()
    local slot = build.itemsTab.slots[slotName]
    if not slot then fail("欄が無い: " .. tostring(slotName)) end
    rememberOrig(slot)
    putInSlot(slot, 0)
    dropAdded(slotName)
  end)
end

--- 読み込んだ時の物に戻す (貼って足した物は PoB から消す)。この欄に貼ったせいで外れた欄 (両手武器で外れた盾など) も一緒に戻す
local function restoreSlot(slotName)
  local slot = build.itemsTab.slots[slotName]
  local o = PCK.orig[slotName]
  if not slot or o == nil then fail("戻す物がありません") end
  putInSlot(slot, o.id, o.active)
  dropAdded(slotName)
  PCK.orig[slotName] = nil
  for _, other in ipairs(PCK.displaced[slotName] or {}) do
    if PCK.orig[other] ~= nil then restoreSlot(other) end
  end
  PCK.displaced[slotName] = nil
end
function PCK.restore(slotName)
  return PCK.mutate(function()
    restoreSlot(slotName)
    settleSlots()
  end)
end

-- ---------------------------------------------------------------- ジェム・設定

--- ジェムを変える (field = level / quality / corrupt / enabled)。本家の SkillsTab と同じ付随の更新 (corrupted の印、enableGlobal) をして、
--- 本家 validateGemLevel が丸めた後の値を返す (画面の「変えた所」はこの値で書く)
function PCK.setGem(i, j, field, value)
  return PCK.mutate(function()
    local g = build.skillsTab.socketGroupList[i]
    local gem = g and g.gemList[j]
    if not gem then fail("ジェムが無い") end
    if field == "level" then
      gem.level = math.max(1, math.floor(tonumber(value) or 1))
    elseif field == "quality" then
      gem.quality = math.max(0, math.min(23, math.floor(tonumber(value) or 0)))
    elseif field == "corrupt" then
      gem.corruptLevel = math.floor(tonumber(value) or 0)
      gem.corrupted = gem.corruptLevel ~= 0
    elseif field == "enabled" then
      gem.enabled = value and true or false
      -- 本家: オンに戻す時はグローバルの効果も戻す (ヴァールジェム以外)
      if gem.enabled and not (gem.gemData and gem.gemData.vaalGem) then
        gem.enableGlobal1 = true
        gem.enableGlobal2 = true
      end
    else
      fail("知らない項目: " .. tostring(field))
    end
    build.skillsTab:ProcessSocketGroup(g)
    return { gem = gemInfo(gem) }
  end)
end

--- 組のオン・オフ
function PCK.setGroup(i, enabled)
  return PCK.mutate(function()
    local g = build.skillsTab.socketGroupList[i]
    if not g then fail("組が無い") end
    g.enabled = enabled and true or false
  end)
end

--- パワーチャージの数 (ピナクルオブパワーで注ぐ数)。0 で使わない (Min のあるビルドは PoB が Min 個を効かせる。実効値は summary の config.powerCharges)
function PCK.setPowerCharges(n)
  return PCK.mutate(function()
    local ci = build.configTab.input
    if n and n > 0 then
      ci.usePowerCharges = true
      ci.overridePowerCharges = n
    else
      ci.usePowerCharges = nil
      ci.overridePowerCharges = nil
    end
    build.configTab:BuildModList()
  end)
end

-- ---------------------------------------------------------------- ツリー

--- パッシブツリーの形 (読み込みのたびに 1 回)。位置・つながり・名前・効果 (タイムレスジュエルで変わった後の物)
--- 同じグループの同じ軌道の 2 点は円弧で結ぶので、グループの中心と半径も渡す
local TYPE_CODE = { Normal = "n", Notable = "N", Keystone = "K", Socket = "J", ClassStart = "C", AscendClassStart = "A" }
function PCK.treeStatic()
  local spec = build.spec
  local tree = spec.tree
  local asc = spec.curAscendClass and spec.curAscendClass.name or nil
  local nodes = {}
  for id, node in pairs(spec.nodes) do
    local code = TYPE_CODE[node.type]
    local keep = code and (node.ascendancyName == nil or node.ascendancyName == asc)
    if keep and node.x then
      local e = { id = id, x = math.floor(node.x + 0.5), y = math.floor(node.y + 0.5), t = code, n = node.dn or "", sd = node.sd, l = {} }
      if node.ascendancyName then e.a = 1 end
      if node.isAttribute then e.at = 1 end
      if node.group and node.orbit and node.orbit > 0 then
        e.gx = math.floor(node.group.x + 0.5)
        e.gy = math.floor(node.group.y + 0.5)
        e.r = tree.orbitRadii[node.orbit + 1]
      end
      for _, other in ipairs(node.linked or {}) do
        if other.id > id then e.l[#e.l + 1] = other.id end
      end
      nodes[#nodes + 1] = e
    end
  end
  return json.encode({ ok = true, nodes = nodes })
end

--- 取っているノードと、ジュエルの範囲 (ジュエルの穴の id・半径・名前)。granted = 装備・ジュエルが与えるノード (外せない)
function PCK.treeState()
  local spec = build.spec
  local alloc = {}
  for id in pairs(spec.allocNodes) do alloc[#alloc + 1] = id end
  local granted = {}
  for id in pairs(build.calcsTab.mainEnv and build.calcsTab.mainEnv.grantedPassives or {}) do granted[#granted + 1] = id end
  local jewels = {}
  local mult = data.gameConstants["PassiveTreeJewelDistanceMultiplier"] or 1
  for nodeId, slot in pairs(build.itemsTab.sockets) do
    local item = spec.allocNodes[nodeId] and build.itemsTab.items[slot.selItemId]
    if item then
      local ri = item.jewelRadiusIndex and data.jewelRadius[item.jewelRadiusIndex]
      jewels[#jewels + 1] = { id = nodeId, name = item.title or item.name, rarity = item.rarity, r = ri and ri.outer * mult or 0 }
    end
  end
  return { alloc = alloc, granted = granted, jewels = jewels }
end

--- ノードを取る / 外す (PoB のツリーの左クリックと同じ: 取る時は始点からの一番近い道ごと、外す時はつながらなくなる先ごと)
--- attr = 能力値のノード (筋力/器用さ/知性を選ぶ物) を取る時の選び (1 筋力 / 2 器用さ / 3 知性)
--- 返す: { ok, alloc = 取った後か, changed = 増えた (+) / 減った (-) 数 }
PCK.treeOrig = PCK.treeOrig or build.spec:CreateUndoState()
function PCK.toggleNode(id, attr)
  return PCK.mutate(function()
    local spec = build.spec
    local node = spec.nodes[id]
    if not node then fail("ノードが無い") end
    local before = count(spec.allocNodes)
    if node.alloc then
      if node.type == "ClassStart" or node.type == "AscendClassStart" then fail("始点は外せません") end
      if build.calcsTab.mainEnv and build.calcsTab.mainEnv.grantedPassives[id] then fail("装備・ジュエルが与えているノードは外せません") end
      if node.isAttribute then spec.hashOverrides[id] = nil end
      spec:DeallocNode(node)
    else
      if node.isAttribute and attr then spec.attributeIndex = attr end
      spec:AllocNode(node)
      if not node.alloc then fail("つながる道がありません (違うアセンダンシーのノードなど)") end
    end
    spec:AddUndoState()
    return { alloc = node.alloc and true or false, changed = count(spec.allocNodes) - before }
  end)
end

--- ツリーを読み込んだ時に戻す
function PCK.resetTree()
  return PCK.mutate(function() build.spec:RestoreUndoState(PCK.treeOrig) end)
end

--- ノードごとの火力への寄与 (PoB の「Node Power」と同じやり方: そのノードを外した時の計算)。
--- i, k = スキルの組とその中のスキル (画面のスキルのカード)。ids = 調べる取っているノード (画面が何回かに分けて送る)
--- 返す: { base = その時の DPS, nodes = { [id] = { single = 1 個だけ外した時の DPS, path = 外すとつながらなくなる先も込みで外した時の DPS, n = 込みの個数 } } }
--- DPS は PoB の CombinedDPS (敵側の倍率込み)。割合で見るので、ゲーム内の表記との違いは貫通などの敵側のノードだけ。
--- 本家 CalcsTab と同じく、効果の無いノード (modKey == "") と装備・ジュエルが与えるノードは飛ばす
function PCK.nodePower(i, k, ids)
  local g = build.skillsTab.socketGroupList[i]
  if not g then return json.encode({ ok = false, error = "組が無い" }) end
  local origMain, origSkill = build.mainSocketGroup, g.mainActiveSkill
  build.mainSocketGroup = i
  g.mainActiveSkill = k
  local ok, res = pcall(function()
    PCK.recalc()
    local granted = build.calcsTab.mainEnv.grantedPassives or {}
    local calcFunc, base = build.calcsTab.calcs.getMiscCalculator(build)
    -- 物差しは ヒット + 継続 + ミニオン (行の DPS と同じ中身。PoB のまま)
    local function dpsOf(o) return (o.CombinedDPS or o.TotalDPS or 0) + ((o.Minion and (o.Minion.CombinedDPS or o.Minion.TotalDPS)) or 0) end
    local out = { base = dpsOf(base), nodes = {} }
    for _, id in ipairs(ids) do
      local node = build.spec.nodes[id]
      if node and node.alloc and node.modKey ~= "" and not granted[id] then
        -- useFullDPS = false: 全スキルの合算 (FullDPS) は要らない (本家も Node Power が FullDPS の時だけ回す)
        local single = calcFunc({ removeNodes = { [node] = true } }, false)
        local e = { single = dpsOf(single), n = 1 }
        local deps = node.depends or {}
        if #deps > 1 then
          local set = {}
          for _, d in ipairs(deps) do set[d] = true end
          e.path = dpsOf(calcFunc({ removeNodes = set }, false))
          e.n = #deps
        else
          e.path = e.single
        end
        out.nodes[tostring(id)] = e
      end
    end
    return out
  end)
  build.mainSocketGroup = origMain
  g.mainActiveSkill = origSkill
  if not ok then return json.encode({ ok = false, error = tostring(res) }) end
  res.ok = true
  return json.encode(res)
end

return "ok"
