-- pck.lua — 火力チェックの画面 (2026-10-02) が PoB の中で使う部品。PoB の計算には手を入れず、PoB の関数を呼ぶだけ。
-- 読み込んだビルドに対して 1 回送ると、グローバルの PCK が使えるようになる (画面は `return PCK.summary()` などを送る)。
--
-- 数字は「ゲーム内の表記」に寄せる (オーナー 2026-10-01「ゲーム内に合わせたい」「仮想ボスはいらん」):
--   PoB の 1 発 (<種類>HitAverage / <種類>CritAverage) は敵側の倍率 (<種類>EffMult = 耐性・呪い・露出・受けるダメージ増加) が掛かった後なので、
--   それで割り戻して「敵がいない時の 1 発」にする。クリティカル率・詠唱の速さはそのまま。DPS = 平均の 1 発 × 速さ × 命中率。
--   メタジェム (CoEA など) から出るスキルは PoB がエネルギーを計算しないので、自分で撃った扱いの数字になる (PoB の限界、画面に注記)。
local json = require("dkjson")
PCK = {}
local TYPES = { "Physical", "Lightning", "Cold", "Fire", "Chaos" }

--- o = 内訳モード (CALCS) の出力。<種類>EffMult はこのモードでしか出ない (CalcOffence.lua)
local function gameNumbers(o)
  local hit, crit, hitPost = 0, 0, 0
  local parts = {}
  for _, t in ipairs(TYPES) do
    local eff = o[t .. "EffMult"]
    if not eff or eff <= 0 then eff = 1 end
    local post = o[t .. "HitAverage"] or 0
    local h = post / eff
    local c = (o[t .. "CritAverage"] or 0) / eff
    hit = hit + h
    hitPost = hitPost + post
    crit = crit + c
    if h > 0 then parts[#parts + 1] = { type = t, hit = h } end
  end
  -- DPS は PoB の DPS (時間で当たるスキルや回数込み) に、敵側の倍率を割り戻した比を掛ける
  local ratio = hitPost > 0 and hit / hitPost or 1
  local cc = (o.CritChance or 0) / 100
  return {
    hit = hit,
    crit = crit,
    critChance = o.CritChance or 0,
    speed = o.Speed or 0,
    hitChance = (o.HitChance or 100),
    avg = hit * (1 - cc) + crit * cc,
    dps = (o.TotalDPS or 0) * ratio,
    enemyRatio = ratio,
    parts = parts,
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
  }
end

--- 今のビルドの全体 (キャラ・数値・スキルの組とスキルごとの数字)
function PCK.summary()
  local calcs = build.calcsTab
  calcs:BuildOutput()
  local env = calcs.mainEnv
  local o = calcs.mainOutput
  local spec = build.spec
  local cls = spec.curClass and spec.curClass.name or ""
  local asc = spec.curAscendClass and spec.curAscendClass.name or ""
  local res = {
    char = { class = cls, ascendancy = asc, level = build.characterLevel },
    stats = {
      Life = o.Life, Mana = o.Mana, EnergyShield = o.EnergyShield, Ward = o.Ward,
      Spirit = o.Spirit, SpiritUnreserved = o.SpiritUnreserved,
      Str = o.Str, Dex = o.Dex, Int = o.Int,
      FireResist = o.FireResist, ColdResist = o.ColdResist, LightningResist = o.LightningResist, ChaosResist = o.ChaosResist,
      LowLife = env.player.modDB.conditions.LowLife and true or false,
      PowerCharges = o.PowerCharges, PowerChargesMax = o.PowerChargesMax,
    },
    config = {
      powerCharges = build.configTab.input.usePowerCharges and (build.configTab.input.overridePowerCharges or o.PowerChargesMax) or 0,
    },
    groups = {},
  }
  local origMain = build.mainSocketGroup
  local origCalcs, origCalcsActive = calcs.input.skill_number, calcs.input.skill_activeNumber
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
      for k, eff in ipairs(g.displaySkillList or {}) do
        build.mainSocketGroup = i
        g.mainActiveSkill = k
        g.mainActiveSkillCalcs = k
        -- 内訳モードのスキルの選び方は計算タブの入力 (skill_number / skill_activeNumber)
        calcs.input.skill_number = i
        calcs.input.skill_activeNumber = k
        calcs:BuildOutput()
        local mo = calcs.calcsOutput
        local ms = calcs.calcsEnv.player.mainSkill
        local name = ms and ms.activeEffect and ms.activeEffect.grantedEffect and ms.activeEffect.grantedEffect.name or "?"
        local n = gameNumbers(mo)
        if n.hit > 0 then
          gr.skills[#gr.skills + 1] = {
            k = k, name = name, level = ms.activeEffect.level,
            triggered = (isMeta and k > 1) and true or false,
            game = n, pobDps = mo.TotalDPS or 0,
          }
        end
      end
      g.mainActiveSkill = origSkill
      g.mainActiveSkillCalcs = origSkillCalcs
    end
    res.groups[#res.groups + 1] = gr
  end
  build.mainSocketGroup = origMain
  calcs.input.skill_number = origCalcs
  calcs.input.skill_activeNumber = origCalcsActive
  calcs:BuildOutput()
  res.items = PCK.items()
  return json.encode(res)
end

--- 装備の欄 (武器・防具・装飾品・フラスコ・取っているジュエルの穴) と、入っている物
local function modLines(list)
  local out = {}
  for _, ml in ipairs(list or {}) do
    if ml.line and ml.line ~= "" then out[#out + 1] = ml.line end
  end
  return out
end
PCK.orig = PCK.orig or {}
function PCK.items()
  local it = build.itemsTab
  local out = {}
  for _, slot in ipairs(it.orderedSlots) do
    local name = slot.slotName
    local isJewel = slot.nodeId ~= nil
    local show = (not isJewel) or (build.spec.allocNodes[slot.nodeId] ~= nil)
    -- 武器の持ち替え (Weapon 1 Swap など) は今は出さない
    if show and not name:find("Swap") then
      local item = it.items[slot.selItemId]
      local e = { slot = name, jewel = isJewel, changed = PCK.orig[name] ~= nil }
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
  local it = build.itemsTab
  local slot = it.slots[slotName]
  if not slot then return json.encode({ ok = false, error = "欄が無い: " .. tostring(slotName) }) end
  local item = new("Item", raw)
  if not item or not item.base then return json.encode({ ok = false, error = "PoB が読めない文面です" }) end
  if PCK.orig[slotName] == nil then PCK.orig[slotName] = slot.selItemId or 0 end
  it:AddItem(item, true)
  slot:SetSelItemId(item.id)
  build.buildFlag = true
  -- PoB が読めなかった行 (計算に入らない)
  local unread = {}
  for _, list in ipairs({ item.implicitModLines, item.explicitModLines, item.runeModLines }) do
    for _, ml in ipairs(list or {}) do
      if ml.extra then unread[#unread + 1] = ml.line end
    end
  end
  return json.encode({ ok = true, unread = unread })
end

--- 欄を空にする
function PCK.unequip(slotName)
  local slot = build.itemsTab.slots[slotName]
  if not slot then return json.encode({ ok = false }) end
  if PCK.orig[slotName] == nil then PCK.orig[slotName] = slot.selItemId or 0 end
  slot:SetSelItemId(0)
  build.buildFlag = true
  return json.encode({ ok = true })
end

--- 読み込んだ時の物に戻す
function PCK.restore(slotName)
  local slot = build.itemsTab.slots[slotName]
  local id = PCK.orig[slotName]
  if not slot or id == nil then return json.encode({ ok = false }) end
  slot:SetSelItemId(id)
  PCK.orig[slotName] = nil
  build.buildFlag = true
  return json.encode({ ok = true })
end

--- ジェムを変える (field = level / quality / corrupt / enabled)
function PCK.setGem(i, j, field, value)
  local g = build.skillsTab.socketGroupList[i]
  local gem = g and g.gemList[j]
  if not gem then return json.encode({ ok = false, error = "ジェムが無い" }) end
  if field == "level" then gem.level = value
  elseif field == "quality" then gem.quality = value
  elseif field == "corrupt" then gem.corruptLevel = value
  elseif field == "enabled" then gem.enabled = value and true or false
  end
  build.skillsTab:ProcessSocketGroup(g)
  build.buildFlag = true
  return json.encode({ ok = true })
end

--- 組のオン・オフ
function PCK.setGroup(i, enabled)
  local g = build.skillsTab.socketGroupList[i]
  if not g then return json.encode({ ok = false }) end
  g.enabled = enabled and true or false
  build.buildFlag = true
  return json.encode({ ok = true })
end

--- パワーチャージの数 (ピナクルオブパワーで注ぐ数)。0 で使わない
function PCK.setPowerCharges(n)
  local ci = build.configTab.input
  if n and n > 0 then
    ci.usePowerCharges = true
    ci.overridePowerCharges = n
  else
    ci.usePowerCharges = nil
    ci.overridePowerCharges = nil
  end
  build.configTab:BuildModList()
  build.buildFlag = true
  return json.encode({ ok = true })
end

return "ok"
