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

--- スキルの印 (attack / bothWeaponAttack など)。PoE2 の PoB は activeSkill.skillFlags ではなく activeEffect.statSetCalcs (内訳 CALCS) /
--- statSet (MAIN) に持つ (本家 CalcOffence の頭と同じ)。2026-10-03 まで ms.skillFlags を見ていて常に空 (二刀流の ÷2 が効かなかった)
local function skillFlagsOf(ms)
  local ae = ms and ms.activeEffect
  return (ae and ((ae.statSetCalcs and ae.statSetCalcs.skillFlags) or (ae.statSet and ae.statSet.skillFlags))) or {}
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
  local flags = skillFlagsOf(ms)
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

--- 火力の中身 (2026-10-04 オーナー「基礎 DPS に関わってる主なステータス、クリ率やらダメージやらクリダメやら、自分と相手で分かりやすく」)。
--- 一番大きいダメージの種類で、そのスキルに効く 増加 (INC) の合計と 増し (MORE) の掛け算、クリティカルの増加、速度の増加を本家の ModStore から引く
local CORE_TYPES = { Physical = true, Fire = true, Cold = true, Lightning = true, Chaos = true }
--- 条件付きで、今の設定 (敵の状態など) では効いていない火力の MOD (2026-10-04 オーナー「ノードとかサポジェムに書いてあったら特殊な感じで火力伸びる奴、
--- 盲目の時とか。乗るか分からんけど相手の想定が分からんからな」)。本家の Tabulate と同じ歩き方 (ModList は self[i]、ModDB は mods[名前]、親へ) で、
--- 条件の印 (Condition / ActorCondition) が付いていて、今の計算では 0 になる物を集める
local COND_NAMES = { "Damage", "ElementalDamage", "PhysicalDamage", "FireDamage", "ColdDamage", "LightningDamage", "ChaosDamage", "CritChance", "CritMultiplier", "Speed" }
local COND_SET = {}
for _, n in ipairs(COND_NAMES) do COND_SET[n] = true end
local function inactiveConditional(ms)
  local out, seen = {}, {}
  local store, cfg = ms.skillModList, ms.skillCfg
  local flags, kw = (cfg and cfg.flags) or 0, (cfg and cfg.keywordFlags) or 0
  local function consider(mod)
    if not mod[1] or #out >= 40 then return end
    if bit.band(flags, mod.flags) ~= mod.flags or not MatchKeywordFlags(kw, mod.keywordFlags) then return end
    local cond
    for _, tag in ipairs(mod) do if tag.type == "Condition" or tag.type == "ActorCondition" then cond = tag break end end
    if not cond then return end
    local ok, v = pcall(store.EvalMod, store, mod, cfg)
    if not ok or (v and v ~= 0) then return end
    local key = table.concat({ mod.name, mod.type, tostring(mod.value), tostring(mod.source) }, "|")
    if seen[key] then return end
    seen[key] = true
    out[#out + 1] = {
      name = mod.name, kind = mod.type, value = type(mod.value) == "number" and mod.value or 0,
      var = cond.var or (cond.varList and table.concat(cond.varList, "/")) or "?", actor = cond.actor, neg = cond.neg and true or nil,
      source = tostring(mod.source or ""),
    }
  end
  local node = store
  while node do
    if node.mods then
      for _, n in ipairs(COND_NAMES) do for _, mod in ipairs(node.mods[n] or {}) do consider(mod) end end
    else
      for i = 1, #node do local mod = node[i]; if COND_SET[mod.name] then consider(mod) end end
    end
    node = node.parent
  end
  return out
end
local function coreStatsOf(o, ms, game)
  if not ms or not ms.skillModList or (game.hit or 0) <= 0 then return nil end
  local main, best = nil, 0
  for _, p in ipairs(game.parts or {}) do if p.hit > best and CORE_TYPES[p.type] then main, best = p.type, p.hit end end
  if not main then return nil end
  local m, cfg = ms.skillModList, ms.skillCfg
  local names = { "Damage", main .. "Damage" }
  if main == "Fire" or main == "Cold" or main == "Lightning" then names[#names + 1] = "ElementalDamage" end
  return {
    type = main,
    incDamage = m:Sum("INC", cfg, unpack(names)),
    moreDamage = m:More(cfg, unpack(names)),
    critChance = o.CritChance or 0,
    critMulti = o.CritMultiplier or 0,
    incCrit = m:Sum("INC", cfg, "CritChance"),
    incCritMulti = m:Sum("INC", cfg, "CritMultiplier"),
    incSpeed = m:Sum("INC", cfg, "Speed"),
    speed = o.Speed or 0,
    avg = game.avg or 0,
    hitChance = o.HitChance or 100,
    -- ゲームのスキルの詳細と同じ並びの分 (2026-10-04 オーナーの Spark の詳細の画面): 種類ごとのダメージの幅・耐性貫通・投射物
    dps = game.dps or 0,
    totalMin = o.TotalMin or 0,
    totalMax = o.TotalMax or 0,
    ranges = (function()
      local out = {}
      for _, t in ipairs(TYPES) do
        local lo, hi = o[t .. "Min"] or 0, o[t .. "Max"] or 0
        if hi > 0 then
          local pen = m:Sum("BASE", cfg, t .. "Penetration") + ((t == "Fire" or t == "Cold" or t == "Lightning") and m:Sum("BASE", cfg, "ElementalPenetration") or 0)
          out[#out + 1] = { type = t, min = lo, max = hi, pen = pen }
        end
      end
      return out
    end)(),
    projectiles = o.ProjectileCount or 0,
    incProjSpeed = m:Sum("INC", cfg, "ProjectileSpeed"),
    cond = inactiveConditional(ms),
    -- 計算に入る数値を全部 (2026-10-04 オーナー「計算に関わるやつ全部出して比較してあげるか。処刑とかアッツィリ加わるとどこ変化するかわからんけど」)。
    -- 本家の ModStore から名前ごとに 増加 (INC) / 上昇 (MORE、掛け算) / 基本 (BASE) を引く。0 の物は出さない
    calc = (function()
      local out = {}
      local function add(name, kind)
        local v = kind == "MORE" and (m:More(cfg, name) - 1) * 100 or m:Sum(kind, cfg, name)
        if math.abs(v) > 1e-6 then out[#out + 1] = { name = name, kind = kind, value = v } end
      end
      local EL = { "Physical", "Fire", "Cold", "Lightning", "Chaos" }
      for _, n in ipairs({ "Damage", "ElementalDamage", "PhysicalDamage", "FireDamage", "ColdDamage", "LightningDamage", "ChaosDamage" }) do add(n, "INC"); add(n, "MORE") end
      for _, n in ipairs({ "CritChance", "CritMultiplier", "Speed", "ProjectileSpeed", "AreaOfEffect", "Duration" }) do add(n, "INC"); add(n, "MORE") end
      for _, n in ipairs({ "ProjectileCount", "ElementalPenetration", "FirePenetration", "ColdPenetration", "LightningPenetration", "ChaosPenetration", "CritChance", "CritMultiplier" }) do add(n, "BASE") end
      for _, src in ipairs({ "", "Physical", "Fire", "Cold", "Lightning", "Chaos", "Elemental" }) do
        for _, dst in ipairs(EL) do
          if src ~= dst then
            add(src .. "DamageGainAs" .. dst, "BASE")
            if src ~= "" and src ~= "Elemental" then add(src .. "DamageConvertTo" .. dst, "BASE") end
          end
        end
      end
      return out
    end)(),
  }
end

local function gemInfo(gem)
  local ge = gem.gemData and gem.gemData.grantedEffect
  return {
    name = gem.nameSpec or (ge and ge.name) or "?",
    -- PoB の中のジェムの ID (相手の組を自分に写す時、名前の照合より確実)
    gemId = gem.gemId,
    level = gem.level or 0,
    quality = gem.quality or 0,
    corrupt = tonumber(gem.corruptLevel) or 0,
    enabled = gem.enabled ~= false,
    support = (ge and ge.support) and true or false,
    -- リネージュのサポート (ゲームのタグ Lineage。火力の差の試算はサポートのうちこれだけ出す、2026-10-04)
    lineage = (gem.gemData and gem.gemData.tags and gem.gemData.tags.lineage) and true or nil,
    -- 本家 validateGemLevel が丸める上限 (無ければ 40)
    maxLevel = (ge and ge.levels and #ge.levels > 0) and #ge.levels or (gem.gemData and gem.gemData.naturalMaxLevel) or 40,
  }
end

--- 組の中身の印 (同じ中身の組 = スキルセットの 2 重など を 1 つにまとめる鍵)。summary と plan で同じ物を使う
local function groupSig(g)
  local sig = {}
  for _, gem in ipairs(g.gemList or {}) do
    local gi = gemInfo(gem)
    sig[#sig + 1] = gi.name .. ":" .. gi.level .. ":" .. gi.quality .. ":" .. gi.corrupt .. ":" .. tostring(gi.enabled)
  end
  return table.concat(sig, "|") .. "|" .. tostring(g.slot) .. "|" .. tostring(g.enabled ~= false)
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

--- 1 スキル分の火力の中身 (core)。主スキルの選びは元に戻す
function PCK.core(i, k)
  local calcs = build.calcsTab
  alignCalcsToMain()
  local g = build.skillsTab.socketGroupList[i]
  if not g then return json.encode({ ok = false, error = "組が無い" }) end
  local origMain, origCalcs = build.mainSocketGroup, calcs.input.skill_number
  local origSkill, origSkillCalcs = g.mainActiveSkill, g.mainActiveSkillCalcs
  local ok, res = pcall(function()
    local mo, menv = evalSkill(i, k)
    local ms = menv.player.mainSkill
    local m = menv.minion
    if m then return nil end
    return coreStatsOf(mo, ms, gameNumbers(mo, ms, nil, nil))
  end)
  g.mainActiveSkill, g.mainActiveSkillCalcs = origSkill, origSkillCalcs
  build.mainSocketGroup = origMain
  calcs.input.skill_number = origCalcs
  calcs:BuildOutput()
  if not ok then return json.encode({ ok = false, error = tostring(res) }) end
  return json.encode({ ok = true, core = res })
end

--- 今のビルドの全体 (キャラ・数値・スキルの組とスキルごとの数字)。DPS 0 のスキルも行に出す (画面側で出す・出さないを決める)
--- 設定の表から自分の側の物だけ (敵 = enemy を名前に含む物は除く)。値は真偽・数・文字だけ
local function playerConfig(input)
  local out = {}
  for key, v in pairs(input or {}) do
    local tv = type(v)
    if type(key) == "string" and not key:lower():find("enemy", 1, true) and (tv == "boolean" or tv == "number" or tv == "string") then out[key] = v end
  end
  return out
end

-- light = 火力の中身 (core: 計算に関わる数値・条件付きの MOD) を出さない。core は PCK.core(i, k) で 1 スキル分だけ取れる。
-- skip = 計算を飛ばすスキル ("組|番号|名前" = true)。前の取り直しで DPS 0 だった物 (オーラ・ブリンク・発動役など) を、装備・武器セット・
-- チャージ・ツリーを変えた時に飛ばす (2026-10-04 オーナー「武器セットの切り替え重い」: 29 個のうち 20 個が DPS 0 で、1 つ 60〜190 ms)。
-- 飛ばした行は { skipped = true } で返し、画面側が前の値を使う。名前まで合わせるので、組の並びが変わった時は飛ばさない
function PCK.summary(light, skip)
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
      -- 設定の写し (自分の側だけ。敵の設定は入れない = DPS はゲーム内表記で見るので仮想敵は関係ない、2026-10-04 オーナー)。
      -- 全部まとめて真似の「+ 設定」に使う
      input = playerConfig(build.configTab.input),
      -- 敵の想定 (敵の状態の設定で、入っている物)。比べる時にどちらが何を想定しているかを出す
      enemy = (function()
        local out = {}
        for key, v in pairs(build.configTab.input or {}) do
          if type(key) == "string" and key:lower():find("enemy", 1, true) and (v == true or (type(v) == "number" and v ~= 0)) then out[key] = v end
        end
        return out
      end)(),
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
      -- source = 装備・ツリーが与えるスキルの組 ("Item:13:Adonia's Ego" / "Tree:12882")。ジェムの差やビルドプランナーでは「ジェム」として扱わない
      local gr = { i = i, label = g.label or "", enabled = g.enabled ~= false, slot = g.slot, source = g.source, gems = {}, skills = {} }
      for j, gem in ipairs(g.gemList or {}) do
        local gi = gemInfo(gem)
        gi.j = j
        gr.gems[#gr.gems + 1] = gi
      end
      local key = groupSig(g)
      if seenSig[key] then gr.duplicateOf = seenSig[key] else seenSig[key] = i end
      -- メタジェム (CoEA など) の組: 2 つ目以降のスキルはメタジェムから出る
      local first = g.displaySkillList and g.displaySkillList[1]
      local isMeta = first and first.activeEffect and first.activeEffect.grantedEffect.skillTypes and first.activeEffect.grantedEffect.skillTypes[SkillType.Meta] and true or false
      gr.meta = isMeta
      if gr.enabled and not gr.duplicateOf then
        local origSkill, origSkillCalcs = g.mainActiveSkill, g.mainActiveSkillCalcs
        for k, sk in ipairs(g.displaySkillList or {}) do
          local skName = sk.activeEffect and sk.activeEffect.grantedEffect and sk.activeEffect.grantedEffect.name or "?"
          if skip and skip[i .. "|" .. k .. "|" .. skName] then
            gr.skills[#gr.skills + 1] = { k = k, name = skName, skipped = true }
            goto continue
          end
          local mo, menv = evalSkill(i, k)
          local ms = menv.player.mainSkill
          local name = ms and ms.activeEffect and ms.activeEffect.grantedEffect and ms.activeEffect.grantedEffect.name or "?"
          local m = menv.minion
          local game = gameNumbers(mo, ms, m and m.output, m and m.minionData and m.minionData.name)
          gr.skills[#gr.skills + 1] = {
            k = k, name = name, level = ms and ms.activeEffect and ms.activeEffect.level or 0,
            triggered = (isMeta and k > 1) and true or false,
            game = game,
            core = (not m and not light) and coreStatsOf(mo, ms, game) or nil,
            -- PoB の Hit DPS (敵込み)。移動スキル等 (showAverage) は CombinedDPS が 1 発の平均になるので使わない
            pobDps = mo.TotalDPS or 0,
          }
          ::continue::
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

-- ---------------------------------------------------------------- 比べる相手の読み込みの間の退避
--- 比べる相手 (別のビルド) を同じ PoB に読み込む間、今のビルドの覚え (欄の元の物・貼って足した物・外れた欄・ツリーの元) を
--- 退避しておき、自分のビルドをコードから読み直した後に戻す (PCK は読み込みのたびに作り直されるので、別の名前に置く)。
--- アイテムの id は SaveDB → LoadDB で保たれるので、覚えの id はそのまま使える
function PCK.stash()
  EXILEDESK_KEEP = { orig = PCK.orig, added = PCK.added, displaced = PCK.displaced, treeOrig = PCK.treeOrig }
  return json.encode({ ok = true })
end
function PCK.unstash()
  local k = EXILEDESK_KEEP
  if k then
    PCK.orig, PCK.added, PCK.displaced, PCK.treeOrig = k.orig, k.added, k.displaced, k.treeOrig
  end
  EXILEDESK_KEEP = nil
  return json.encode({ ok = true, restored = k ~= nil })
end

-- ---------------------------------------------------------------- ゲームのビルドプランナーへの書き出し
--- 今のビルドをゲームのビルドプランナーの .build (JSON) の形にする (2026-10-03 オーナー「相手のビルドのビルドプランナーもそのまま使えるようにしたい」)。
--- 形は poe.ninja が書いた実物 (Documents/My Games/Path of Exile 2/BuildPlanner/*.build) に合わせた:
---   * passives: 取っているノードを文字列の ID (PassiveSkills 表の Id) で。PoB は番号しか持たないので ids ({ [番号] = "Id" }、
---     src/data/passive-ids.json) を画面から渡す。武器セットだけで取る物 (node.allocMode 1 / 2) は weapon_set を付ける。
---     クラスの始点は実物に無いので出さない (アセンダンシーの始点 AscendancySorceress1Start_ は実物にあるので出す)。
---     装備が与えるノード (「Allocates X」のアノイント・ユニーク = mainEnv.grantedPassives) も実物 (poe.ninja がキャラから書いた物) に
---     入っているので出す (タイの人の実物: Dominion のアノイント / Infused Limits / Evocational Practitioner の 3 つ)
---   * ascendancy: ツリーの internalId (Sorceress1 の形。無ければ "")
---   * skills: 使っている組 (装備が与える物 = source のある組は除く) ごとに、最初のアクティブジェムを id (ゲームの gameId、
---     Metadata/Items/Gem(s)/... の形)、残り (サポートも 2 つ目以降のアクティブも) を support_skills に。実物も CoEA の組で
---     2 つ目以降のアクティブ (Lightning Warp / Cold Snap) が support_skills 側に入っている。PoB が知らないジェムは出せない (skipped に数)。
---     同じ中身の組 (スキルセットの 2 重。summary の duplicateOf と同じ印) は 1 つだけ (オーナーのコードは全部の組が 2 重で 30 個になっていた)
---   * description = "" と inventory_slots = [] は無いとゲームの一覧に出ない (memory: build-planner-files) ので必ず入れる
function PCK.plan(name, author, ids)
  ids = ids or {}
  local ok, res = pcall(function()
    local spec = build.spec
    if not build.calcsTab.mainEnv then PCK.recalc() end
    local granted = build.calcsTab.mainEnv and build.calcsTab.mainEnv.grantedPassives or {}
    local nodeIds = {}
    for id, node in pairs(spec.allocNodes) do
      if node.type ~= "ClassStart" then nodeIds[#nodeIds + 1] = id end
    end
    for id in pairs(granted) do
      if not spec.allocNodes[id] and spec.nodes[id] then nodeIds[#nodeIds + 1] = id end
    end
    table.sort(nodeIds)
    local passives = setmetatable({}, { __jsontype = "array" })
    local unknown = {}
    for _, id in ipairs(nodeIds) do
      local sid = ids[id] or ids[tostring(id)]
      if sid then
        local p = { id = sid }
        local mode = spec.allocNodes[id] and spec.allocNodes[id].allocMode or 0
        if mode == 1 or mode == 2 then p.weapon_set = mode end
        passives[#passives + 1] = p
      else
        unknown[#unknown + 1] = id
      end
    end
    local asc = ""
    local cls = spec.tree.classes[spec.curClassId]
    if cls and spec.curAscendClassId and cls.classes[spec.curAscendClassId] then asc = cls.classes[spec.curAscendClassId].internalId or "" end
    local skills = setmetatable({}, { __jsontype = "array" })
    local skipped = 0
    local seenSig = {}
    for _, g in ipairs(build.skillsTab.socketGroupList) do
      local key = groupSig(g)
      local dup = seenSig[key]
      seenSig[key] = true
      if g.enabled ~= false and not g.source and not dup then
        local main, rest = nil, {}
        for _, gem in ipairs(g.gemList or {}) do
          local gd = gem.gemData
          if gd and gd.gameId then
            local isSupport = gd.grantedEffect and gd.grantedEffect.support
            if not main and not isSupport then main = gd.gameId else rest[#rest + 1] = { id = gd.gameId } end
          else
            skipped = skipped + 1
          end
        end
        if main then
          local s = { id = main }
          if #rest > 0 then s.support_skills = rest end
          skills[#skills + 1] = s
        else
          -- アクティブの無い組 (サポートだけ) はゲームの形にできない
          skipped = skipped + #rest
        end
      end
    end
    local plan = {
      name = name or build.buildName or "ExileDesk",
      ascendancy = asc,
      author = author or "ExileDesk",
      description = "",
      passives = passives,
      skills = skills,
      inventory_slots = setmetatable({}, { __jsontype = "array" }),
    }
    local text = json.encode(plan, { indent = true, keyorder = { "name", "ascendancy", "author", "description", "passives", "skills", "inventory_slots", "id", "weapon_set", "support_skills" } })
    return { json = text, passives = #passives, skills = #skills, unknownNodes = unknown, skippedGems = skipped }
  end)
  if not ok then return json.encode({ ok = false, error = tostring(res) }) end
  res.ok = true
  return json.encode(res)
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

--- アノイント (調合) と、ジュエルの「Allocates ○○」: エンチャントの行からノードの名前を取り、ツリーのノードの効果 (sd) を添える
--- (2026-10-05 オーナー「比較でアノイントの差も出しといて、これアノイントだ、やられた」: 相手はアミュレットに Augmented Flesh
--- = スキルの枠 +2 を付けていて、スキルの数が自分より 2 つ多かった)
local anointNodeByName
local function anointsOf(item)
  local out = {}
  for _, ml in ipairs(item.enchantModLines or {}) do
    local name = ml.line and ml.line:match("^Allocates (.+)$")
    if name then
      if not anointNodeByName then
        anointNodeByName = {}
        for _, node in pairs(build.spec.tree.nodes or {}) do
          if node.dn and not anointNodeByName[node.dn] then anointNodeByName[node.dn] = node end
        end
      end
      local node = anointNodeByName[name]
      out[#out + 1] = { name = name, sd = node and node.sd or {} }
    end
  end
  return out
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
          anoints = anointsOf(item),
          -- PoB の文面 (本家 BuildRaw)。相手の物を自分の欄に当てる試算・取り入れ (PCK.estimateItem / equip) に使う
          raw = item:BuildRaw(),
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
-- 本家のボタンは、メインの組が切り替え先の武器セットに無い時にその武器セットの最初の組へ移すだけで、戻した時に元の組へは戻さない。
-- そのため II → I と戻しても数字が戻らなかった (2026-10-04 オーナー「差し替えてセットをまた元に戻しても火力差し替えた状態のまま」、
-- マナ・ES・DPS が変わったまま)。武器セットごとに切り替える前のメインの組を覚えて、戻した時はその組に戻す
PCK.mainBySet = {} -- 読み込みのたびに部品を送り直すので、ビルドが変われば空に
function PCK.setWeaponSet(n)
  return PCK.mutate(function()
    local it = build.itemsTab
    local c = it.controls
    local from = it.activeItemSet.useSecondWeaponSet and 2 or 1
    if from == n then return end
    PCK.mainBySet[from] = build.mainSocketGroup
    local btn = n == 2 and c.weaponSwap2 or c.weaponSwap1
    btn.onClick()
    local back = PCK.mainBySet[n]
    if back and build.skillsTab.socketGroupList[back] then build.mainSocketGroup = back end
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
--- エレメンタルコンフラックスの属性 (1 = 平均 / 2 = 雷 / 3 = 冷気 / 4 = 火)。本家の設定 elementalConfluxElement と同じ番号
--- (2026-10-05 オーナー「コンフラックスの属性選べるように」: ゲームでは今の属性が順に変わる。本家の既定は平均 = 3 属性に 1/3 ずつ)
function PCK.setConflux(n)
  return PCK.mutate(function()
    local ci = build.configTab.input
    -- 平均も 1 と書く (空にすると本家は設定を当てず、平均とは違う数字になる)
    ci.elementalConfluxElement = (n and n >= 1 and n <= 4) and n or 1
    build.configTab:BuildModList()
  end)
end

--- 消費したチャージの効果が 2 倍になる確率 (Heightened Charges「20% の確率で消費の効果が 2 倍」) の扱い
--- (2026-10-05 オーナーのスパーク: ゲームのピナクルは 2 倍が出た時の 16 個分で 3.72 倍。本家は確率を平均して 1.2 倍にする)。
--- mode = "avg" (本家のまま) / "double" (2 倍が出た時) / "single" (出なかった時)。本家の設定の後に Multiplier:ConsumedPowerChargeEffect を足し引きする
PCK.chargeDouble = "avg"
local function wrapConfigForDouble()
  local ct = build.configTab
  if ct.__exiledeskWrapped then return end
  local orig = ct.BuildModList
  ct.BuildModList = function(self, ...)
    local r = orig(self, ...)
    if PCK.chargeDouble ~= "avg" then
      -- 確率 c% は平均で c を足す。2 倍 = 100、等倍 = 0 になるよう差を足す
      local c = 0
      for _, g in ipairs(build.skillsTab.socketGroupList) do
        if g.enabled ~= false then
          for _, gem in ipairs(g.gemList or {}) do
            local nm = gem.nameSpec or (gem.gemData and gem.gemData.grantedEffect and gem.gemData.grantedEffect.name)
            if gem.enabled ~= false and nm == "Heightened Charges" then c = 20 end
          end
        end
      end
      if c > 0 then
        local want = PCK.chargeDouble == "double" and 100 or 0
        self.modList:NewMod("Multiplier:ConsumedPowerChargeEffect", "BASE", want - c, "ExileDesk")
      end
    end
    return r
  end
  ct.__exiledeskWrapped = true
end
function PCK.setChargeDouble(mode)
  return PCK.mutate(function()
    wrapConfigForDouble()
    PCK.chargeDouble = (mode == "double" or mode == "single") and mode or "avg"
    build.configTab:BuildModList()
  end)
end

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
      -- g = ツリーのまとまり (group) の番号。相手が取っていて自分に無いノードを束ねる単位 (取り入れの試算)
      local e = { id = id, x = math.floor(node.x + 0.5), y = math.floor(node.y + 0.5), t = code, n = node.dn or "", sd = node.sd, l = {}, g = tonumber(node.g) }
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
  -- 属性ノードで選んだ物 (力 / 器用 / 知性)。全部まとめて真似で相手の選び方に合わせる
  local attr = {}
  for id, node in pairs(spec.hashOverrides or {}) do
    if node.isAttribute and spec.allocNodes[id] then attr[#attr + 1] = { id = id, dn = node.dn } end
  end
  return { alloc = alloc, granted = granted, jewels = jewels, attr = attr }
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

--- 試算の物差し: ヒット + 継続 + ミニオン (行の DPS と同じ中身。PoB のまま = 敵側の倍率込み)。割合で見るので画面は 行の DPS × 比
local function dpsOf(o) return (o.CombinedDPS or o.TotalDPS or 0) + ((o.Minion and (o.Minion.CombinedDPS or o.Minion.TotalDPS)) or 0) end

--- 画面の上のバーのスキル (組 i のスキル k) を主スキルにして fn(calcFunc, base) を走らせ、終わったら主スキルの選びを戻す。
--- calcFunc = 本家 getMiscCalculator (override で ビルドを変えずに「〜したら」を計算)、base = 今の出力。nodePower と取り入れの試算の共通の枠
--- 火力の差の試算の基準のツリー (2026-10-04 オーナー「基準はノード類は真似前提にしないと乗算効かんからな」)。
--- PCK.setEstimateTree(add, remove, attrs) で、試算の間だけ自分のツリーを本当に相手と同じに付け替える (取る / 外す / 属性ノードの選び方。道は見ない)。
--- 計算の上書き (addNodes) だと相手のタイムロストジュエルの範囲の効果や属性ノードの選び方が乗らなかったので本当に付け替える。
--- PCK.setEstimateTree(nil) で元に戻す (saveBuildState の形で覚えておく)。付け替えている間は内訳・ノードの寄与など他の計算をしないこと
PCK.estTree = nil
--- 相手のツリーに付け替える (estimateAll と共用)。付け替えた後に取っているノードの一覧を返す (欄を替えた後に付け直す用)
local function applyTargetTree(add, remove, attrs)
  local spec = build.spec
  for _, id in ipairs(remove or {}) do
    local node = spec.nodes[id]
    if node and node.alloc then node.alloc = false; spec.allocNodes[id] = nil end
  end
  for _, id in ipairs(add or {}) do
    local node = spec.nodes[id]
    if node and not node.alloc then node.alloc = true; spec.allocNodes[id] = node end
  end
  -- 属性ノードの選び方も相手に (2026-10-04: 写さないと相手より知性が少なくマナが 8% 少ない分、丸写ししても +7% 違った)
  for _, a in ipairs(attrs or {}) do
    local base = spec.tree.nodes[a.id]
    if base and base.isAttribute then
      for idx, opt in ipairs(base.options or {}) do
        if opt.dn == a.dn then
          spec:SwitchAttributeNode(a.id, idx)
          if spec.nodes[a.id] and spec.hashOverrides[a.id] then spec:ReplaceNode(spec.nodes[a.id], spec.hashOverrides[a.id]) end
          break
        end
      end
    end
  end
  local ids = {}
  for id in pairs(spec.allocNodes) do ids[#ids + 1] = id end
  return ids
end
--- 欄を替えると本家がつながらないノードを外す (自分のフロムナッシング・メガロマニアックを外すと、相手も取っているノードが 6 個消え、
--- 相手のタイムロストジュエルの範囲のノートの効果が半分になっていた)。付け替えたツリーを丸ごと付け直す
local function reapplyTree(ids)
  local spec = build.spec
  for _, id in ipairs(ids or {}) do
    local node = spec.nodes[id]
    if node and not node.alloc then node.alloc = true; spec.allocNodes[id] = node end
  end
end

local function withMainSkill(i, k, fn)
  local g = build.skillsTab.socketGroupList[i]
  if not g then return json.encode({ ok = false, error = "組が無い" }) end
  local origMain, origSkill = build.mainSocketGroup, g.mainActiveSkill
  build.mainSocketGroup = i
  g.mainActiveSkill = k
  local ok, res = pcall(function()
    PCK.recalc()
    local calcFunc, base = build.calcsTab.calcs.getMiscCalculator(build)
    return fn(calcFunc, base)
  end)
  build.mainSocketGroup = origMain
  g.mainActiveSkill = origSkill
  if not ok then return json.encode({ ok = false, error = tostring(res) }) end
  res.ok = true
  return json.encode(res)
end

--- ノードごとの火力への寄与 (PoB の「Node Power」と同じやり方: そのノードを外した時の計算)。
--- i, k = スキルの組とその中のスキル (画面のスキルのカード)。ids = 調べる取っているノード (画面が何回かに分けて送る)
--- 返す: { base = その時の DPS, nodes = { [id] = { single = 1 個だけ外した時の DPS, path = 外すとつながらなくなる先も込みで外した時の DPS, n = 込みの個数 } } }
--- DPS は PoB の CombinedDPS (敵側の倍率込み)。割合で見るので、ゲーム内の表記との違いは貫通などの敵側のノードだけ。
--- 本家 CalcsTab と同じく、効果の無いノード (modKey == "") と装備・ジュエルが与えるノードは飛ばす
function PCK.nodePower(i, k, ids)
  return withMainSkill(i, k, function(calcFunc, base)
    local granted = build.calcsTab.mainEnv.grantedPassives or {}
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
end

-- ---------------------------------------------------------------- 取り入れの試算 (2026-10-03)
--- オーナー「まんま真似できないけど部分的に真似できる所、ここだけ真似しようかな」: 相手との差の 1 項目 (相手の装備 1 つ / 相手の組 1 つ /
--- ツリーのまとまり 1 つ) を自分に当てた時の、上のバーのスキルの DPS と ライフ・ES・耐性 の変化。ビルドは変えない (本家 getMiscCalculator の
--- override で計算し、変えた物は元に戻す)。返す数字: base / with = DPS (dpsOf)、stats / statsWith = ライフ等
local STAT_KEYS = { "Life", "EnergyShield", "Mana", "FireResist", "ColdResist", "LightningResist", "ChaosResist" }
local function statsOf(o)
  local t = {}
  for _, k in ipairs(STAT_KEYS) do t[k] = o[k] or 0 end
  return t
end
--- 試算の物差しは行の DPS と同じ中身 (gameNumbers: ヒットは TotalDPS × 敵側の割り戻し + 継続 + その他 + ミニオン)。
--- CombinedDPS では合わなかった (2026-10-03 の確かめ: 移動スキル (showAverage) は CombinedDPS が 1 発の平均になり、詠唱速度の差が消える。
--- 指輪の試算 +6.7% に対して本当に付けると +12.6%)。主スキルは渡さない (二刀流の ÷2 は前後で同じ係数なので比には効かない)。
--- 画面は 自分の行の DPS × (with / base) で出すので、取り入れた後の行とそろう
local function estDpsOf(o) return gameNumbers(o, nil, o.Minion, nil).dps end

--- 取っているノードだけを覚えて戻す (本家の作り直し = つながらないノードを外す、を通さない)。試算の基準のツリー (setEstimateTree) を
--- 付け替えている間の行の試算用: 作り直すと相手のツリーの付け替えが崩れる (道を見ずに付けているので)
local function saveAlloc()
  local ids = {}
  for id in pairs(build.spec.allocNodes) do ids[id] = true end
  return ids
end
local function restoreAlloc(ids)
  local spec = build.spec
  for id, node in pairs(spec.nodes) do
    local want = ids[id] == true
    if node.alloc ~= want then node.alloc = want; spec.allocNodes[id] = want and node or nil end
  end
  build.buildFlag = true
end
--- 本当に入れ替える試算の前後で、ツリーと組の選択を覚えて戻す (2026-10-04: 自分のメガロマニアック・フロムナッシングを相手のジュエルに
--- 替えると、本家がつながらなくなったノード (今回は 10 個) を外し、物を戻してもノードは戻らなかった。読み込み直後の 1 回目の試算の後から
--- 自分の DPS が 2 割下がり、2 回目からの数字がずれていた)。組の選択 = 装備が出すスキルの組の mainActiveSkill (入れ替えで nil になる)
local function saveBuildState(light)
  local main = {}
  for idx, g in ipairs(build.skillsTab.socketGroupList) do main[idx] = { g = g, m = g.mainActiveSkill } end
  -- light = 取っているノードだけ (試算の基準のツリーを付け替えている間の行の試算。作り直すと付け替えが崩れる)
  if light then return { alloc = saveAlloc(), main = main } end
  return { tree = build.spec:CreateUndoState(), main = main }
end
local function restoreBuildState(state)
  if state.alloc then restoreAlloc(state.alloc) else build.spec:RestoreUndoState(state.tree) end
  for _, x in ipairs(state.main) do x.g.mainActiveSkill = x.m end
  build.buildFlag = true
end

function PCK.setEstimateTree(add, remove, attrs)
  if PCK.estTree then
    restoreBuildState(PCK.estTree.saved)
    PCK.estTree = nil
  end
  if add then
    PCK.estTree = { saved = saveBuildState() }
    PCK.estTree.ids = applyTargetTree(add, remove, attrs)
  end
  PCK.recalc()
  return json.encode({ ok = true })
end

--- 欄 slotName に raw (PoB の文面) の物を付けたら。withLines = true なら、その物の明示の行を 1 行ずつ抜いた時の DPS も (ユニークの「ここが効く」)。
--- 本家の repItem は「その欄にこの物」だけで、両手武器を持った時にオフハンドが外れる分は見ない (CalcSetup の Staff / Bow の条件は
--- item が nil のまま比べていて効かない。Two Hand Sword / Axe / Mace だけ外す)。なので両手武器 (base.tags.twohand) を Weapon 1 に当てる時は、
--- 本当に付けた時 (PCK.equip → PopulateSlots) と同じになるよう、試算の間だけ欄に入れて PopulateSlots で外れる物も外し、終わったら全部戻す
function PCK.estimateItem(i, k, slotName, raw, withLines)
  return withMainSkill(i, k, function(calcFunc, base)
    local it = build.itemsTab
    local slot = it.slots[slotName]
    if not slot then fail("欄が無い: " .. tostring(slotName)) end
    local item = new("Item", raw)
    if not item or not item.base then fail("PoB が読めない文面です") end
    if not it:IsItemValidForSlot(item, slotName) then fail("この欄には入れられない物です (" .. tostring(item.type or item.baseName) .. ")") end
    local res = { base = estDpsOf(base), stats = statsOf(base), displaced = {} }
    local twoHand = item.base.tags and item.base.tags.twohand and slotName:match("^Weapon 1") and true or false
    local function lines(cf)
      if not withLines then return nil end
      local out = {}
      for idx, ml in ipairs(item.explicitModLines or {}) do
        if ml.line and ml.line ~= "" then
          local it2 = new("Item", raw)
          table.remove(it2.explicitModLines, idx)
          it2:BuildAndParseRaw()
          out[#out + 1] = { line = ml.line, dps = estDpsOf(cf({ repSlotName = slotName, repItem = it2 }, false)) }
        end
      end
      return out
    end
    if not twoHand then
      local out = calcFunc({ repSlotName = slotName, repItem = item }, false)
      res.with = estDpsOf(out)
      res.statsWith = statsOf(out)
      res.lines = lines(calcFunc)
      return res
    end
    -- 両手武器: 試算の間だけ本当に入れる (欄の中身を全部覚えて戻す。足した物は PoB から消す)
    local before = {}
    for name, s in pairs(it.slots) do before[name] = { id = s.selItemId or 0, active = s.active } end
    local saved = saveBuildState(true)
    it:AddItem(item, true)
    local ok, err = pcall(function()
      putInSlot(slot, item.id, true)
      it:PopulateSlots()
      for name, s in pairs(it.slots) do
        if name ~= slotName and (s.selItemId or 0) ~= before[name].id then res.displaced[#res.displaced + 1] = name end
      end
      PCK.recalc()
      local cf = (build.calcsTab.calcs.getMiscCalculator(build))
      local out = cf({}, false)
      res.with = estDpsOf(out)
      res.statsWith = statsOf(out)
      res.lines = lines(cf)
    end)
    for name, s in pairs(it.slots) do
      s:SetSelItemId(before[name].id)
      if isFlaskLike(name) then s.active = before[name].active end
    end
    it:DeleteItem(item, true)
    restoreBuildState(saved)
    if not ok then error(err, 0) end
    return res
  end)
end

--- 相手の組のジェムの一覧 → PoB の gemInstance の一覧 (本家 SkillsTab の XML の読み込みと同じ項目。gemId があれば ProcessSocketGroup が
--- それで gemData を引き、無ければ nameSpec (名前) で探す)
local function newGemList(gems)
  local list = {}
  for _, g in ipairs(gems or {}) do
    local corrupt = tonumber(g.corrupt) or 0
    list[#list + 1] = {
      nameSpec = g.name or "", gemId = g.gemId, level = tonumber(g.level) or 20, quality = tonumber(g.quality) or 0,
      enabled = g.enabled ~= false, enableGlobal1 = true, enableGlobal2 = true, count = 1,
      corruptLevel = corrupt, corrupted = corrupt ~= 0, statSet = {}, statSetCalcs = {}, skillMinionSkillStatSetIndexLookup = {},
    }
  end
  return list
end
--- PoB が知らなかったジェム (名前で見つからない等) の名前
local function unknownGems(g)
  local out = {}
  for _, gem in ipairs(g.gemList or {}) do
    if gem.errMsg or not (gem.gemData or gem.grantedEffect) then out[#out + 1] = gem.nameSpec end
  end
  return out
end
--- 組 g のジェムを list に差し替える。gi = 0 なら新しい組を足す (装着先の欄は無し)。返す: 差し替えた / 足した組
local function putGems(gi, list)
  local st = build.skillsTab
  local g
  if gi > 0 then
    g = st.socketGroupList[gi]
    if not g then fail("組が無い") end
    g.gemList = list
  else
    g = { label = "", enabled = true, gemList = list, mainActiveSkill = 1, mainActiveSkillCalcs = 1 }
    table.insert(st.socketGroupList, g)
  end
  st:ProcessSocketGroup(g)
  return g
end

--- 自分の組 gi のジェムを相手の構成 gems ({ name, gemId, level, quality, corrupt, enabled }) に差し替えたら (gi = 0 は組を足したら)。
--- 差し替え → 計算 → 元の gemList に戻す。上のバーのスキルが差し替える組の中なら、同じ名前のスキルの位置に合わせる。
--- 組を足す時は、その組の最初のスキルの DPS (newDps) も返す (上のバーのスキルは変わらないことが多いので)
function PCK.estimateGems(i, k, gi, gems)
  return withMainSkill(i, k, function(calcFunc, base)
    local st = build.skillsTab
    local focus = st.socketGroupList[i]
    local focusName = focus.displaySkillList and focus.displaySkillList[k] and focus.displaySkillList[k].activeEffect.grantedEffect.name
    local saved = gi > 0 and st.socketGroupList[gi].gemList or nil
    local added -- 足した組 (失敗しても、足した時だけ外す)
    local ok, res = pcall(function()
      local g = putGems(gi, newGemList(gems))
      if gi == 0 then added = g end
      -- displaySkillList は本家の計算 (CalcSetup) が作り直す。ProcessSocketGroup では前のままなので、先に計算してから見る
      -- (2026-10-03: 先に見ていたので古い一覧で「ある」と判定し、相手のアーク×2 を当てた時にアークの DPS を出していた)
      PCK.recalc()
      -- 差し替える組が上のバーのスキルの組なら、同じ名前のスキルの位置に合わせる。無くなるなら DPS は出せない (focusLost、with = 0)
      local focusLost = false
      if gi == i and focusName then
        local found
        for idx, sk in ipairs(g.displaySkillList or {}) do
          if sk.activeEffect and sk.activeEffect.grantedEffect.name == focusName then found = idx break end
        end
        if not found then
          focusLost = true
        elseif focus.mainActiveSkill ~= found then
          focus.mainActiveSkill = found
          PCK.recalc()
        end
      end
      local out = (build.calcsTab.calcs.getMiscCalculator(build))({}, false)
      local r = { base = estDpsOf(base), with = focusLost and 0 or estDpsOf(out), stats = statsOf(base), statsWith = statsOf(out), unknown = unknownGems(g), focusLost = focusLost }
      if gi == 0 and g.displaySkillList and g.displaySkillList[1] then
        build.mainSocketGroup = #st.socketGroupList
        PCK.recalc()
        local o2 = (build.calcsTab.calcs.getMiscCalculator(build))({}, false)
        r.newDps = estDpsOf(o2)
        build.mainSocketGroup = i
      end
      return r
    end)
    if gi > 0 then
      st.socketGroupList[gi].gemList = saved
      st:ProcessSocketGroup(st.socketGroupList[gi])
    elseif added then
      for idx = #st.socketGroupList, 1, -1 do
        if st.socketGroupList[idx] == added then table.remove(st.socketGroupList, idx) break end
      end
    end
    build.buildFlag = true
    if not ok then error(res, 0) end
    return res
  end)
end

--- 取り入れる: 組 gi のジェムを本当に相手の構成にする (gi = 0 は組を足す)。返す: { i = 組の番号, unknown = PoB が知らないジェム }
function PCK.setGroupGems(gi, gems)
  return PCK.mutate(function()
    local g = putGems(gi, newGemList(gems))
    local idx = gi > 0 and gi or #build.skillsTab.socketGroupList
    return { i = idx, unknown = unknownGems(g) }
  end)
end

--- 相手が取っていて自分に無いノード ids を「全部取れたとして」足したら (本家 addNodes。つながる道は見ない = 画面に注記)
function PCK.estimateNodes(i, k, ids)
  return withMainSkill(i, k, function(calcFunc, base)
    local set, n = {}, 0
    for _, id in ipairs(ids) do
      local node = build.spec.nodes[id]
      if node and not node.alloc then
        set[node] = true
        n = n + 1
      end
    end
    if n == 0 then fail("足すノードがありません (もう取っている)") end
    local out = calcFunc({ addNodes = set }, false)
    return { base = estDpsOf(base), with = estDpsOf(out), stats = statsOf(base), statsWith = statsOf(out), n = n }
  end)
end

--- ツリーを丸ごと相手の物にしたら (2026-10-04 オーナー「ノードは振り直しで真似するから 1 つずつ出さなくていい、まとめて真似したら合計でいくら変わるか」)。
--- addIds = 相手にあって自分に無いノード、removeIds = 自分にあって相手に無いノード。つながる道は見ない (本家の Node Power と同じく計算の上書き)
function PCK.estimateTree(i, k, addIds, removeIds)
  return withMainSkill(i, k, function(calcFunc, base)
    local add, rem, na, nr = {}, {}, 0, 0
    for _, id in ipairs(addIds or {}) do
      local node = build.spec.nodes[id]
      if node and not node.alloc then add[node] = true; na = na + 1 end
    end
    for _, id in ipairs(removeIds or {}) do
      local node = build.spec.nodes[id]
      if node and node.alloc then rem[node] = true; nr = nr + 1 end
    end
    if na + nr == 0 then fail("ツリーは同じです") end
    local out = calcFunc({ addNodes = add, removeNodes = rem }, false)
    return { base = estDpsOf(base), with = estDpsOf(out), stats = statsOf(base), statsWith = statsOf(out), n = na, removed = nr }
  end)
end

--- ツリーのジュエルの穴 slotName (Jewel <ノード番号>) に相手のジュエル raw を入れたら (2026-10-04 オーナー「無いジュエルを足したら火力が変わる、
--- 心臓やらメガロやら」)。穴のノードを取っていなければ、そのノードも足して計算する (道は見ない)。範囲で効くジュエルも本家の計算どおり
function PCK.estimateJewel(i, k, slotName, raw, nodeId)
  return withMainSkill(i, k, function(_, base)
    local item = new("Item", raw)
    if not item or not item.base then fail("PoB が読めない文面です") end
    local spec, it = build.spec, build.itemsTab
    local node = spec.nodes[nodeId]
    if not node then fail("自分のツリーにこの穴がありません") end
    local socketAdded = not node.alloc
    -- 計算の上書き (repItem) だとタイムロストジュエルなどの範囲の効果が乗らない (2026-10-04: 相手の鷲の光が -4.5% に見え、行を足しても
    -- 全部まとめての「+ 装備・ジュエル」と合わなかった)。試算の間だけ本当にはめて計算し、終わったら全部戻す
    local saved = saveAlloc()
    local before = {}
    for name, sl in pairs(it.slots) do before[name] = { id = sl.selItemId or 0, active = sl.active } end
    it:AddItem(item, true)
    local ok, res = pcall(function()
      if socketAdded then node.alloc = true; spec.allocNodes[nodeId] = node end
      local sl = it.slots[slotName]
      if not sl then fail("ジュエルの穴の欄がありません: " .. tostring(slotName)) end
      putInSlot(sl, item.id, true)
      PCK.recalc()
      local _, out = build.calcsTab.calcs.getMiscCalculator(build)
      return { base = estDpsOf(base), with = estDpsOf(out), stats = statsOf(base), statsWith = statsOf(out), socketAdded = socketAdded }
    end)
    for name, sl in pairs(it.slots) do
      if before[name] then sl:SetSelItemId(before[name].id); if isFlaskLike(name) then sl.active = before[name].active end end
    end
    it:DeleteItem(item, true)
    restoreAlloc(saved)
    if not ok then error(res, 0) end
    return res
  end)
end

--- 全部まとめて真似したら (2026-10-04 オーナー「全部足したら 207% になるはずだけど、せいぜい 30%」)。順に重ねて段ごとの DPS を返す:
---   tree  = ツリーを相手と同じに (add / remove。計算の上書き)
---   items = + 中身の違う欄を全部相手の物に (raw = 相手の文面、nil = 外す。ジュエルの穴は tree で取られる)
---   gems  = + ジェムの組を相手の構成に (gi = 合わせた自分の組、0 = 足す)
--- 計算が終わったら全部元に戻す (欄の中身・足した物・組のジェム)
function PCK.estimateAll(i, k, items, add, remove, groups, config, off, attrs, lineage)
  local res = withMainSkill(i, k, function()
    local it, st = build.itemsTab, build.skillsTab
    local spec = build.spec
    local focus = st.socketGroupList[i]
    local focusName = focus.displaySkillList and focus.displaySkillList[k] and focus.displaySkillList[k].activeEffect.grantedEffect.name
    -- 段ごとの数字は行と同じ計算 (内訳 = CALCS の出力 + gameNumbers) で出す (2026-10-04: 試算の計算 (MAIN) で出すと、自分の行と 9% ずれ、
    -- 丸写ししても相手の行と +50% 違って見えた (中身は相手と同じなのに、画面は 自分の行 ÷ 試算の比 で掛けるため))
    local origCalcs, origNumber = focus.mainActiveSkillCalcs, build.calcsTab.input.skill_number
    local function step()
      if wipeGlobalCache then wipeGlobalCache() end
      local mo, menv = evalSkill(i, focus.mainActiveSkill or k)
      local ms, m = menv.player.mainSkill, menv.minion
      return gameNumbers(mo, ms, m and m.output, m and m.minionData and m.minionData.name).dps, statsOf(mo)
    end
    local out = {}
    out.cur, out.stats = step()
    local before = {}
    for name, sl in pairs(it.slots) do before[name] = { id = sl.selItemId or 0, active = sl.active } end
    local saved = saveBuildState()
    local addedItems, savedGems, addedGroups, offGroups = {}, {}, {}, {}
    local savedConfig
    local ok, err = pcall(function()
      -- ツリーは計算の上書きではなく本当に付け替える (2026-10-04: 上書きだと相手のタイムロストジュエルの範囲の効果
      -- (Spark の相手はクリティカル増加 +84%・倍率 +240%) が乗らず、全部真似しても相手と +55% 違った)。最後に saved で戻す
      local treeIds = applyTargetTree(add, remove, attrs)
      out.tree, out.statsTree = step()
      for _, x in ipairs(items or {}) do
        local sl = it.slots[x.slot]
        if sl then
          if x.raw and x.raw ~= "" then
            local item = new("Item", x.raw)
            if item and item.base then
              it:AddItem(item, true)
              addedItems[#addedItems + 1] = item
              putInSlot(sl, item.id, true)
            end
          else
            sl:SetSelItemId(0)
          end
        end
      end
      it:PopulateSlots()
      reapplyTree(treeIds)
      out.items, out.statsItems = step()
      -- 装備まで揃えた所で 1 つずつ戻す計算は外した (2026-10-04 オーナー「19/19 になってもしばらく待たされる」)。行の効きは下の
      -- 全部揃えた中で戻す leaveFull で出す
      out.leave = {}
      reapplyTree(treeIds)
      -- 相手に無い自分の組は止める (最後に戻す)
      for _, gi in ipairs(off or {}) do
        local g = st.socketGroupList[gi]
        if g and g.enabled then g.enabled = false; offGroups[#offGroups + 1] = g end
      end
      for _, g in ipairs(groups or {}) do
        local gi = tonumber(g.gi) or 0
        if gi > 0 and st.socketGroupList[gi] then savedGems[gi] = st.socketGroupList[gi].gemList end
        local grp = putGems(gi, newGemList(g.gems))
        if gi == 0 then addedGroups[#addedGroups + 1] = grp end
      end
      PCK.recalc()
      -- 上のバーのスキルの組を差し替えたなら、同じ名前のスキルの位置に合わせる
      if focusName then
        for idx, sk in ipairs(focus.displaySkillList or {}) do
          if sk.activeEffect and sk.activeEffect.grantedEffect.name == focusName then
            if focus.mainActiveSkill ~= idx then focus.mainActiveSkill = idx; PCK.recalc() end
            break
          end
        end
      end
      out.gems, out.statsGems = step()
      -- 全部相手と同じ (ツリー・装備・ジュエル・ジェム) から 1 つずつ戻す (2026-10-04 オーナー「アッツィリとかリネージュセットした場合、効く
      -- サポジェムやらノードとかで火力変わってくる。サポジェムもツリーと一緒で合わせられるからそれも前提で」)
      out.leaveFull, out.leaveLineage = {}, {}
      for _, x in ipairs(items or {}) do
        local sl = it.slots[x.slot]
        if sl then
          local cur = sl.selItemId or 0
          sl:SetSelItemId(before[x.slot] and before[x.slot].id or 0)
          reapplyTree(treeIds)
          out.leaveFull[x.slot] = (step())
          sl:SetSelItemId(cur)
        end
      end
      reapplyTree(treeIds)
      -- リネージュ: 相手の組の構成から、そのリネージュだけ外す
      for _, l in ipairs(lineage or {}) do
        local g = st.socketGroupList[tonumber(l.gi) or 0]
        if g then
          local names = {}
          for _, n in ipairs(l.names or {}) do names[n] = true end
          local keep, dropped = {}, 0
          for _, gem in ipairs(g.gemList) do
            local n = gem.nameSpec or (gem.gemData and gem.gemData.name)
            if names[n] then dropped = dropped + 1 else keep[#keep + 1] = gem end
          end
          if dropped > 0 then
            local orig = g.gemList
            g.gemList = keep
            st:ProcessSocketGroup(g)
            out.leaveLineage[l.key] = (step())
            g.gemList = orig
            st:ProcessSocketGroup(g)
          end
        end
      end
      -- ツリーとジェムだけ相手と同じ (装備・ジュエルは自分の物) = 表の行の元の DPS
      local curIds = {}
      for _, x in ipairs(items or {}) do
        local sl = it.slots[x.slot]
        if sl then curIds[x.slot] = sl.selItemId or 0; sl:SetSelItemId(before[x.slot] and before[x.slot].id or 0) end
      end
      reapplyTree(treeIds)
      out.treeGems = (step())
      for slot, id in pairs(curIds) do it.slots[slot]:SetSelItemId(id) end
      reapplyTree(treeIds)
      -- + 設定 (自分の側だけ相手の物に。敵の設定は今のまま)
      if config then
        local ci = build.configTab.input
        savedConfig = {}
        for key, v in pairs(ci) do savedConfig[key] = v end
        for key in pairs(playerConfig(ci)) do ci[key] = nil end
        for key, v in pairs(config) do ci[key] = v end
        build.configTab:BuildModList()
        out.config, out.statsConfig = step()
      end
    end)
    if savedConfig then
      local ci = build.configTab.input
      for key in pairs(ci) do ci[key] = nil end
      for key, v in pairs(savedConfig) do ci[key] = v end
      build.configTab:BuildModList()
    end
    for gi, list in pairs(savedGems) do
      st.socketGroupList[gi].gemList = list
      st:ProcessSocketGroup(st.socketGroupList[gi])
    end
    for _, g in ipairs(offGroups) do g.enabled = true end
    for _, grp in ipairs(addedGroups) do
      for idx = #st.socketGroupList, 1, -1 do
        if st.socketGroupList[idx] == grp then table.remove(st.socketGroupList, idx) break end
      end
    end
    for name, sl in pairs(it.slots) do
      sl:SetSelItemId(before[name].id)
      if isFlaskLike(name) then sl.active = before[name].active end
    end
    for _, item in ipairs(addedItems) do it:DeleteItem(item, true) end
    restoreBuildState(saved)
    focus.mainActiveSkillCalcs, build.calcsTab.input.skill_number = origCalcs, origNumber
    if not ok then error(err, 0) end
    return out
  end)
  return res
end

-- ---------------------------------------------------------------- 火力の内訳 (2026-10-03)
--- オーナー「どこの火力が乗っているから今こんな火力が出ている、という詳細が欲しい。出した数字を辿ればその数字になればクリア」。
--- 上のバーのスキル (組 i のスキル k) について、内訳 (CALCS) の出力の数字と、増加 (INC) / 増し (MORE) / 基礎 (BASE) の各 MOD を
--- 出所つき (本家 ModStore:Tabulate。計算タブの表と同じ物) で返す。式に組み立てて掛け算を確かめるのは画面側
--- (services/pob-check/breakdown.ts)。ここは PoB の中の数字を取るだけで、計算はしない (本家 CalcOffence の式をなぞった物を返す)。
---   * 手 (スペルは 1 つ、アタックは MainHand / OffHand) ごとに: 種類ごとの基礎 (SummedMin/MaxBase) と 増加 / 増し、速さ、クリ率、クリ倍率
---   * 種類ごとの MOD の名前は本家 calcDamage の damageStatsForTypes と同じ (雷 = Damage + LightningDamage + ElementalDamage)
---   * 出所 (mod.source): "Item:13:名前" → 欄と装備、"Tree:12882" → ノード、"Skill:…" → その組のジェム、"Config" → 設定。
---     装備の MOD は装備の行 (modLine.line) も探して返す (画面で日本語にする)
local MOD_NAMES_OF_TYPE = {
  Physical = { "Damage", "PhysicalDamage" },
  Lightning = { "Damage", "LightningDamage", "ElementalDamage" },
  Cold = { "Damage", "ColdDamage", "ElementalDamage" },
  Fire = { "Damage", "FireDamage", "ElementalDamage" },
  Chaos = { "Damage", "ChaosDamage" },
}
local ELEMENTAL = { Lightning = true, Cold = true, Fire = true }

--- MOD の flags / keywordFlags の名前 (本家 CalcBreakdownControl と同じ。両方が同じ値でも片方を落とさないよう別々に見る)
local function flagNames(mod)
  local out, seen = {}, {}
  local function add(flags, src)
    if not flags or flags == 0 then return end
    for name, val in pairs(src) do
      -- Spell は ModFlag と KeywordFlag の両方にあるので 1 回だけ
      if AND64(flags, val) == val and not seen[name] then
        seen[name] = true
        out[#out + 1] = name
      end
    end
  end
  add(mod.flags, ModFlag)
  add(mod.keywordFlags, KeywordFlag)
  table.sort(out)
  return out
end

--- MOD の条件 (Condition / Multiplier など) を短く。pc = パワーチャージの数で変わる MOD (画面の「0 に」のボタン用)
local function tagInfo(mod)
  local tags, pc = {}, false
  for _, tag in ipairs(mod) do
    local var = tag.var or tag.stat or tag.skillName
    if not var and tag.varList then var = table.concat(tag.varList, "/") end
    if not var and tag.statList then var = table.concat(tag.statList, "/") end
    if tag.type == "Condition" or tag.type == "ActorCondition" or tag.type == "Multiplier" or tag.type == "MultiplierThreshold" or tag.type == "PerStat" or tag.type == "StatThreshold" or tag.type == "SkillName" then
      tags[#tags + 1] = { t = tag.type, v = tostring(var or ""), neg = tag.neg and true or nil }
      if (tag.type == "Multiplier" or tag.type == "MultiplierThreshold") and tostring(var or ""):find("PowerCharge") then pc = true end
    end
  end
  return tags, pc
end

--- 装備の MOD → その装備の行 (画面で日本語にする)。名前・型・flags が同じ物。値まで同じ行があればそれ、無ければ最初の物 (品質で伸びた値など)
local function itemLineOf(item, mod)
  if not item then return nil end
  local loose
  for _, list in ipairs({ item.implicitModLines, item.runeModLines, item.explicitModLines, item.enchantModLines }) do
    for _, ml in ipairs(list or {}) do
      for _, m in ipairs(ml.modList or {}) do
        if m.name == mod.name and m.type == mod.type and (m.flags or 0) == (mod.flags or 0) and (m.keywordFlags or 0) == (mod.keywordFlags or 0) then
          if type(m.value) == "number" and type(mod.value) == "number" and math.abs(m.value - mod.value) < 1e-6 then return ml.line end
          loose = loose or ml.line
        end
      end
    end
  end
  return loose
end

--- mod.source → 画面が操作に結び付けられる形。gi = 上のバーのスキルの組 (ジェムを探す範囲)
local function resolveSource(source, gi)
  source = tostring(source or "")
  local id, name = source:match("^Item:(%d+):(.*)")
  if id then
    id = tonumber(id)
    local it = build.itemsTab
    local item = it.items[id]
    local slotName, jewel
    for _, slot in ipairs(it.orderedSlots) do
      if slot.selItemId == id then
        slotName = slot.slotName
        jewel = slot.nodeId ~= nil
        break
      end
    end
    return {
      kind = "item", id = id, label = item and (item.title or item.name) or name, base = item and item.baseName, rarity = item and item.rarity,
      slot = slotName, jewel = jewel or false, changed = (slotName ~= nil and PCK.orig[slotName] ~= nil) or false,
    }, item
  end
  local nid = source:match("^Tree:(%d+)")
  if nid then
    nid = tonumber(nid)
    local node = build.spec.nodes[nid] or (build.spec.tree.nodes and build.spec.tree.nodes[nid])
    local granted = build.calcsTab.mainEnv and build.calcsTab.mainEnv.grantedPassives and build.calcsTab.mainEnv.grantedPassives[nid] and true or false
    return { kind = "tree", id = nid, label = node and node.dn or ("#" .. nid), alloc = node and node.alloc and true or false, granted = granted, nodeType = node and node.type }
  end
  local sid = source:match("^Skill:(.+)")
  if sid then
    local sk = build.data.skills[sid]
    local r = { kind = "gem", id = sid, label = sk and sk.name or sid }
    local g = build.skillsTab.socketGroupList[gi]
    for j, gem in ipairs(g and g.gemList or {}) do
      local gd = gem.gemData
      if gd and (gd.grantedEffectId == sid or gd.secondaryGrantedEffectId == sid) then
        r.gi, r.gj = gi, j
        r.gemName = gem.nameSpec or (gd.grantedEffect and gd.grantedEffect.name)
        r.support = (gd.grantedEffect and gd.grantedEffect.support) and true or false
        r.enabled = gem.enabled ~= false
        break
      end
    end
    return r
  end
  if source == "Config" then return { kind = "config", label = "Config" } end
  if source == "Base" then return { kind = "base", label = "Base" } end
  local many = source:match("^Many Sources:(.*)")
  return { kind = "other", label = many or source }
end

--- Tabulate の 1 行 → 画面の行
local function modRow(entry, gi)
  local mod = entry.mod
  local src, item = resolveSource(mod.source, gi)
  local tags, pc = tagInfo(mod)
  local r = { value = type(entry.value) == "number" and entry.value or 0, type = mod.type, name = mod.name, flags = flagNames(mod), source = tostring(mod.source or ""), src = src, tags = tags }
  if pc then r.pc = true end
  if item then r.line = itemLineOf(item, mod) end
  return r
end
local function modRows(list, gi)
  local out = {}
  for _, e in ipairs(list) do out[#out + 1] = modRow(e, gi) end
  return out
end

--- 出力から必要な鍵だけ (数だけ。JSON を小さく)
local OUT_KEYS = {
  "TotalDPS", "AverageDamage", "AverageHit", "Speed", "HitSpeed", "CastRate", "HitChance", "AccuracyHitChance", "CritChance", "PreEffectiveCritChance",
  "CritMultiplier", "PreEffectiveCritMultiplier", "CritEffect", "DpsMultiplier", "QuantityMultiplier", "CullingDPS", "CombinedDPS", "ActionSpeedMod", "Repeats", "Cooldown",
  "ImpaleDPS", "MirageDPS", "TotalDot", "BleedDPS", "PoisonDPS", "IgniteDPS", "TotalBleedDPS", "TotalPoisonDPS", "TotalIgniteDPS", "allMult", "ScaledDamageEffect", "TotemActionSpeed",
}
local function pick(o)
  local t = {}
  for _, k in ipairs(OUT_KEYS) do
    if type(o[k]) == "number" then t[k] = o[k] end
  end
  return t
end

--- 手 1 つ分 (スペルは 1 つ、アタックは MainHand / OffHand)。src = 本家の pass.source (スペル = skillData、アタック = weaponData)
local function handBreakdown(env, ms, key, out, cfg, src, gi)
  local sm = ms.skillModList
  local sd = ms.skillData
  local skillCfg = ms.skillCfg
  local enemyDB = env.player.enemy.modDB
  local flags = skillFlagsOf(ms)
  local isAttack = flags.attack and true or false
  local h = { key = key, out = pick(out), types = {} }
  local baseMultiplier = (ms.activeEffect.grantedEffectLevel and ms.activeEffect.grantedEffectLevel.baseMultiplier) or sd.baseMultiplier or 1
  for _, t in ipairs(TYPES) do
    if (out[t .. "HitAverage"] or 0) > 0 or (out[t .. "SummedMinBase"] or 0) ~= 0 or (out[t .. "SummedMaxBase"] or 0) ~= 0 then
      local names = MOD_NAMES_OF_TYPE[t]
      -- 運の良いヒット (本家 CalcOffence: pass 2 = 非クリ)
      local lucky
      if sm:Flag(skillCfg, "LuckyHits") or (t == "Lightning" and sm:Flag(skillCfg, "LightningNoCritLucky")) or (ELEMENTAL[t] and sm:Flag(skillCfg, "ElementalLuckHits")) then
        lucky = 1
      else
        lucky = math.min(sm:Sum("BASE", skillCfg, t .. "LuckyHitsChance", "LuckyHitsChance"), 100) / 100
      end
      local critLucky
      if sm:Flag(skillCfg, "LuckyHits") or sm:Flag(skillCfg, "CritLucky") or (ELEMENTAL[t] and sm:Flag(skillCfg, "ElementalLuckHits")) then
        critLucky = 1
      else
        critLucky = math.min(sm:Sum("BASE", skillCfg, t .. "LuckyHitsChance", "LuckyHitsChance"), 100) / 100
      end
      -- 追加ダメージの出所 (Min と Max を出所ごとに 1 行に)
      local added, addedIdx = {}, {}
      for _, which in ipairs({ "Min", "Max" }) do
        for _, e in ipairs(sm:Tabulate("BASE", cfg, t .. which)) do
          local k = tostring(e.mod.source) .. "|" .. tostring(e.mod.name:gsub("M[ia][nx]$", "")) .. "|" .. tostring(e.mod.flags) .. "|" .. tostring(e.mod.keywordFlags) .. "|" .. tostring(#e.mod)
          local row = addedIdx[k]
          if not row then
            row = modRow(e, gi)
            row.min, row.max = 0, 0
            addedIdx[k] = row
            added[#added + 1] = row
          end
          if which == "Min" then row.min = row.min + (type(e.value) == "number" and e.value or 0) else row.max = row.max + (type(e.value) == "number" and e.value or 0) end
        end
      end
      h.types[#h.types + 1] = {
        type = t,
        -- 基礎 (本家の順): 武器 / スキルの基礎 + 追加 × 追加の倍率、× 基礎の倍率 → 変換 → SummedMin/MaxBase
        srcMin = src[t .. "Min"] or 0, srcMax = src[t .. "Max"] or 0, srcIsWeapon = src.type and true or false,
        bonusMin = src[t .. "BonusMin"] or 0, bonusMax = src[t .. "BonusMax"] or 0,
        addedMin = sm:Sum("BASE", cfg, t .. "Min") + enemyDB:Sum("BASE", cfg, "Self" .. t .. "Min"),
        addedMax = sm:Sum("BASE", cfg, t .. "Max") + enemyDB:Sum("BASE", cfg, "Self" .. t .. "Max"),
        addedMult = calcLib.mod(sm, cfg, "Added" .. t .. "Damage", "AddedDamage"),
        baseMultiplier = baseMultiplier,
        baseMin = out[t .. "MinBase"] or 0, baseMax = out[t .. "MaxBase"] or 0,
        convMult = ms.conversionTable and ms.conversionTable[t] and ms.conversionTable[t].mult or 1,
        summedMin = out[t .. "SummedMinBase"] or 0, summedMax = out[t .. "SummedMaxBase"] or 0,
        -- 増加 / 増し (本家 calcDamage と同じ名前の束)
        inc = sm:Sum("INC", cfg, unpack(names)), more = sm:More(cfg, unpack(names)),
        moreMin = sm:More(cfg, "Min" .. t .. "Damage"), moreMax = sm:More(cfg, "Max" .. t .. "Damage"),
        allMult = out.allMult or 1,
        lucky = lucky, critLucky = critLucky,
        -- 敵に当たる前 (Stored) と 当たった後 (HitAverage)、敵側の倍率
        storedHit = out[t .. "StoredHitAvg"] or 0, storedCrit = out[t .. "StoredCritAvg"] or 0,
        hitAvg = out[t .. "HitAverage"] or 0, critAvg = out[t .. "CritAverage"] or 0, effMult = out[t .. "EffMult"] or 1,
        incMods = modRows(sm:Tabulate("INC", cfg, unpack(names)), gi),
        moreMods = modRows(sm:Tabulate("MORE", cfg, unpack(names)), gi),
        addedMods = added,
      }
    end
  end
  -- 速さ (本家: 1 / (baseTime / round((1 + inc) × more, 2) + 追加の時間) × 行動速度。クールダウン・サーバーティックで上限)
  local castTime = ms.activeEffect.grantedEffect.castTime
  local baseTime
  if isAttack then
    baseTime = 1 / (src.AttackRate or 1) + sm:Sum("BASE", cfg, "Speed")
  else
    baseTime = (sd.castTimeOverride or castTime or 1) + sm:Sum("BASE", cfg, "Speed")
  end
  h.speed = {
    attack = isAttack, baseTime = baseTime, castTime = castTime, attackRate = src.AttackRate,
    inc = sm:Sum("INC", cfg, "Speed"), more = sm:More(cfg, "Speed"),
    extraTime = sm:Sum("BASE", cfg, "TotalAttackTime") + sm:Sum("BASE", cfg, "TotalCastTime"),
    action = (flags.selfCast and env.player.output.ActionSpeedMod) or (flags.totem and out.TotemActionSpeed) or 1,
    speed = out.Speed or 0, hitSpeed = out.HitSpeed, cooldown = out.Cooldown, repeats = out.Repeats or 1,
    -- 速さが固定 (発動・固定の詠唱時間など) なら増加 / 増しは効かない
    fixed = (castTime == 0 and not sd.castTimeOverride and not sd.triggered) or sd.timeOverride ~= nil or sd.fixedCastTime == true or (sd.triggered and (sd.triggerTime ~= nil or sd.triggerRate ~= nil)) or false,
    triggered = sd.triggered and true or false,
    incMods = modRows(sm:Tabulate("INC", cfg, "Speed"), gi),
    moreMods = modRows(sm:Tabulate("MORE", cfg, "Speed"), gi),
  }
  -- クリ率 (本家: (基礎 + 加算) × (1 + inc) × more → 上限 → 命中 → 運 → 分岐)
  local critOverride = sm:Override(cfg, "CritChance")
  h.crit = {
    baseCrit = critOverride or src.CritChance or (ms.activeEffect.grantedEffectLevel and ms.activeEffect.grantedEffectLevel.critChance) or 0,
    override = critOverride,
    base = sm:Sum("BASE", cfg, "CritChance") + (enemyDB:Sum("BASE", nil, "SelfCritChance") or 0),
    inc = sm:Sum("INC", cfg, "CritChance") + (enemyDB:Sum("INC", nil, "SelfCritChance") or 0),
    more = sm:More(cfg, "CritChance"),
    cap = sm:Override(nil, "CritChanceCap") or sm:Sum("BASE", cfg, "CritChanceCap"),
    pre = out.PreEffectiveCritChance or 0, eff = out.CritChance or 0, accuracy = out.AccuracyHitChance or 100,
    lucky = sm:Flag(cfg, "CritChanceLucky") and true or false, bifurcate = sm:Flag(cfg, "BifurcateCrit") and true or false,
    inevitable = sm:Flag(cfg, "InevitableCriticalHits") and true or false, never = sm:Flag(cfg, "NeverCrit") and true or false,
    baseMods = modRows(sm:Tabulate("BASE", cfg, "CritChance"), gi),
    incMods = modRows(sm:Tabulate("INC", cfg, "CritChance"), gi),
    moreMods = modRows(sm:Tabulate("MORE", cfg, "CritChance"), gi),
    -- 固定 (OVERRIDE) の出所 (「クリティカル率は X%」など。あると加算・増加・増しは効かない)
    overrideMods = modRows(sm:Tabulate("OVERRIDE", cfg, "CritChance"), gi),
  }
  -- クリ倍率 (本家: 1 + 追加ダメージ% × (1 + inc) × more / 100。敵側の受けるクリダメージ増加も)
  h.critMult = {
    base = sm:Sum("BASE", cfg, "CritMultiplier"), inc = sm:Sum("INC", cfg, "CritMultiplier"), more = sm:More(cfg, "CritMultiplier"),
    override = sm:Override(skillCfg, "CritMultiplier"),
    enemyBase = enemyDB:Sum("BASE", nil, "SelfCritMultiplier") or 0, enemyInc = enemyDB:Sum("INC", nil, "SelfCritMultiplier") or 0,
    value = out.CritMultiplier or 1, none = sm:Flag(cfg, "NoCritMultiplier") and true or false,
    baseMods = modRows(sm:Tabulate("BASE", cfg, "CritMultiplier"), gi),
    incMods = modRows(sm:Tabulate("INC", cfg, "CritMultiplier"), gi),
    moreMods = modRows(sm:Tabulate("MORE", cfg, "CritMultiplier"), gi),
    overrideMods = modRows(sm:Tabulate("OVERRIDE", skillCfg, "CritMultiplier"), gi),
  }
  return h
end

--- 組 i のスキル k の内訳。主スキルの選びは summary と同じ evalSkill (MAIN と CALCS を両方そろえる) で、終わったら戻す
function PCK.breakdown(i, k)
  local calcs = build.calcsTab
  local g = build.skillsTab.socketGroupList[i]
  if not g then return json.encode({ ok = false, error = "組が無い" }) end
  local origMain, origCalcs = build.mainSocketGroup, calcs.input.skill_number
  local origSkill, origSkillCalcs = g.mainActiveSkill, g.mainActiveSkillCalcs
  local ok, res = pcall(function()
    alignCalcsToMain()
    if wipeGlobalCache then wipeGlobalCache() end
    local o, env = evalSkill(i, k)
    local ms = env.player.mainSkill
    if not ms then fail("スキルが無い") end
    local sd = ms.skillData or {}
    local flags = skillFlagsOf(ms)
    local m = env.minion
    local res = {
      skill = ms.activeEffect and ms.activeEffect.grantedEffect and ms.activeEffect.grantedEffect.name or "?",
      attack = flags.attack and true or false, dual = flags.bothWeaponAttack and true or false,
      combines = sd.combinesHitsWhenDualWielding and true or false, showAverage = sd.showAverage and true or false, triggered = sd.triggered and true or false,
      out = pick(o),
      game = gameNumbers(o, ms, m and m.output, m and m.minionData and m.minionData.name),
      powerCharges = o.PowerCharges or 0,
      hands = {},
    }
    if flags.attack then
      if flags.weapon1Attack and o.MainHand then res.hands[#res.hands + 1] = handBreakdown(env, ms, "MainHand", o.MainHand, ms.weapon1Cfg, env.player.weaponData1 or {}, i) end
      if flags.weapon2Attack and o.OffHand then res.hands[#res.hands + 1] = handBreakdown(env, ms, "OffHand", o.OffHand, ms.weapon2Cfg, env.player.weaponData2 or {}, i) end
    else
      res.hands[1] = handBreakdown(env, ms, nil, o, ms.skillCfg, sd, i)
    end
    return res
  end)
  build.mainSocketGroup = origMain
  calcs.input.skill_number = origCalcs
  g.mainActiveSkill, g.mainActiveSkillCalcs = origSkill, origSkillCalcs
  calcs:BuildOutput()
  if not ok then return json.encode({ ok = false, error = tostring(res) }) end
  res.ok = true
  return json.encode(res)
end

return "ok"
