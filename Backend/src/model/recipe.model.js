import { supabase } from '../config/supabase.js';

const RecipeModel = {
  findAll: () =>
    supabase.from('recipes')
      .select('*, products(name, category), recipe_ingredients(*)')
      .order('created_at'),

  findById: (id) =>
    supabase.from('recipes')
      .select('*, products(name, category), recipe_ingredients(*)')
      .eq('id', id)
      .single(),

  findWithIngredients: (id) =>
    supabase.from('recipes').select('recipe_ingredients(*)').eq('id', id).single(),

  create: (data) => supabase.from('recipes').insert(data).select().single(),
  update: (id, data) => supabase.from('recipes').update(data).eq('id', id).select().single(),
  delete: (id) => supabase.from('recipes').delete().eq('id', id),

  insertIngredients: (recipeId, ingredients) =>
    supabase.from('recipe_ingredients')
      .insert(ingredients.map(i => ({ ...i, recipe_id: recipeId }))),

  deleteIngredients: (recipeId) =>
    supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId),

  // Idagdag ito sa loob ng RecipeModel object
  findWithIngredientsByProductId: (productId) =>
    supabase.from('recipes')
      .select('*, recipe_ingredients(*)')
      .eq('product_id', productId)
      .single(),

  findFormulaStatusByProductIds: async (productIds = []) => {
    const ids = [...new Set((productIds || []).filter(Boolean))];
    if (ids.length === 0) return new Map();

    const { data, error } = await supabase
      .from('recipes')
      .select('id, product_id, recipe_ingredients(quantity)')
      .in('product_id', ids);

    if (error) throw error;

    return new Map((data || []).map(recipe => {
      const ingredients = Array.isArray(recipe.recipe_ingredients)
        ? recipe.recipe_ingredients
        : [];
      const hasValidIngredients = ingredients.length > 0
        && ingredients.every(ingredient => Number(ingredient.quantity) > 0);

      return [recipe.product_id, {
        recipe_id: recipe.id,
        recipe_ingredient_count: ingredients.length,
        has_production_formula: hasValidIngredients,
      }];
    }));
  },
};

export { RecipeModel };