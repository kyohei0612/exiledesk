/**
 * 規格外の賭け — レシピと選択 (素材の選択・段の条件・ベース MOD のティア・エッセンス)
 * useRareCraft.ts から切り出し (2026-09-26)。中身は変えていない。
 */
import { computed, nextTick, ref, watch } from "vue";
import {
  EXCEPTIONAL_SOCKETS,
  RECIPES,
  type BucketDef,
  type EchoId,
  type ExaltId,
  type RecipeDef,
  type RecipeId,
  type RibId,
  type SideId,
} from "./recipes";
import { DEFAULT_NORMAL_SHARE, baseModTiers, findEssence, type Metric } from "./sim";

const RECIPE_KEY = "exiledesk.rare-craft.recipe";

function loadRecipe(): RecipeId {
  try {
    const v = localStorage.getItem(RECIPE_KEY);
    if (v && RECIPES.some((r) => r.id === v)) return v as RecipeId;
  } catch {
    /* 読めなくても動く */
  }
  return "es-helmet";
}

export function useRareSelection() {
  // ---- レシピと選択 ----
  const recipeId = ref<RecipeId>(loadRecipe());
  const recipe = computed<RecipeDef>(() => RECIPES.find((r) => r.id === recipeId.value) ?? RECIPES[0]);
  const pageId = ref(recipe.value.pages[0].id);
  const page = computed(() => recipe.value.pages.find((p) => p.id === pageId.value) ?? recipe.value.pages[0]);
  const ilvl = ref(recipe.value.ilvl);
  const baseTier = ref(recipe.value.baseMod.defaultTier);
  /** 規格外 = ソケット 2 固定 (オーナー指示 2026-09-14) */
  const sockets = computed(() => EXCEPTIONAL_SOCKETS);
  const quality = ref(recipe.value.quality);
  const baseEs = ref(page.value.baseEs);
  const essenceId = ref(recipe.value.defaultEssence);
  const rib = ref<RibId>("preserved");
  const exalt = ref<ExaltId>("greater");
  const echo = ref<EchoId>("none");
  const side = ref<SideId>("any");
  const runeId = ref(recipe.value.defaultRune);
  const buckets = ref<BucketDef[]>(recipe.value.buckets.map((b) => ({ key: b.key, conds: { ...b.conds } })));
  const floorConds = ref<Partial<Record<Metric, number>>>({ ...recipe.value.floor });
  /** 冒涜の 3 択で 2 つ目・3 つ目が通常の MOD になる確率 */
  const normalShare = ref(DEFAULT_NORMAL_SHARE);

  /**
   * 一番収支がいい組み合わせを素材に自動で出す (オーナー指示 2026-09-14)。
   * 素材の選択を手で変えたら自動は切れる (比較表の「これにする」も同じ)。
   */
  const autoBest = ref(true);
  let applying = false;
  async function programmatic(fn: () => void): Promise<void> {
    applying = true;
    fn();
    await nextTick();
    applying = false;
  }

  function resetForRecipe(): void {
    const r = recipe.value;
    void programmatic(() => {
      pageId.value = r.pages[0].id;
      ilvl.value = r.ilvl;
      baseTier.value = r.baseMod.defaultTier;
      quality.value = r.quality;
      baseEs.value = r.pages[0].baseEs;
      essenceId.value = r.defaultEssence;
      runeId.value = r.defaultRune;
      buckets.value = r.buckets.map((b) => ({ key: b.key, conds: { ...b.conds } }));
      floorConds.value = { ...r.floor };
    });
  }
  function resetThresholds(): void {
    const r = recipe.value;
    buckets.value = r.buckets.map((b) => ({ key: b.key, conds: { ...b.conds } }));
    floorConds.value = { ...r.floor };
  }
  watch(recipeId, (id) => {
    try {
      localStorage.setItem(RECIPE_KEY, id);
    } catch {
      /* 保存できなくても動く */
    }
    autoBest.value = true;
    resetForRecipe();
  });
  watch(pageId, () => {
    baseEs.value = page.value.baseEs;
  });

  // ---- ベース MOD のティアとエッセンス ----
  const tiers = computed(() => baseModTiers(pageId.value, recipe.value.baseMod.family, recipe.value.baseMod.stat, ilvl.value));
  const currentTier = computed(() => tiers.value[Math.min(Math.max(1, baseTier.value), Math.max(1, tiers.value.length)) - 1] ?? null);
  const essences = computed(() =>
    recipe.value.essences.map((e) => {
      const pe = findEssence(pageId.value, e.name, e.stat);
      const clash = !!pe && pe.family === recipe.value.baseMod.family;
      return { ...e, ok: !!pe && !clash, reason: !pe ? "この装備に付かない" : clash ? "ベースの MOD と同じ系統" : "", gen: pe?.gen ?? null, range: pe?.stats.find((s) => s.id === e.stat) ?? null };
    }),
  );
  watch(
    essences,
    (list) => {
      if (!list.find((e) => e.id === essenceId.value)?.ok) {
        const first = list.find((e) => e.ok);
        if (first) void programmatic(() => (essenceId.value = first.id));
      }
    },
    { immediate: true },
  );

  return {
    recipeId,
    recipe,
    pageId,
    page,
    ilvl,
    baseTier,
    sockets,
    quality,
    baseEs,
    essenceId,
    rib,
    exalt,
    echo,
    side,
    runeId,
    buckets,
    floorConds,
    normalShare,
    autoBest,
    programmatic,
    /** programmatic の最中か (手で変えたかの判定用) */
    isApplying: (): boolean => applying,
    resetThresholds,
    tiers,
    currentTier,
    essences,
  };
}
