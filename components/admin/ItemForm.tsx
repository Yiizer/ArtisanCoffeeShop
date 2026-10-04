"use client";

export type RecipeIngredientDraft = {
  ingredientId: string;
  qty: string;
};

export type SizeRecipeIngredientDraft = {
  ingredientId: string;
  qtyDelta: string;
};

export type SizeDraft = {
  name: string;
  priceDeltaPesos: string;
  ingredients?: SizeRecipeIngredientDraft[];
};

export type AddOnDraft = {
  name: string;
  pricePesos: string;
  available: boolean;
  noIngredients?: boolean;
  ingredients?: RecipeIngredientDraft[];
};

export type ItemDraft = {
  name: string;
  description: string;
  category: string;
  basePricePesos: string;
  available: boolean;
  noIngredients: boolean;
  ingredients: RecipeIngredientDraft[];
  sizes: SizeDraft[];
  addOns: AddOnDraft[];
};
