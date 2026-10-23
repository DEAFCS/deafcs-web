// Where each block of the left nav sits unless an administrator has set a number
// for it under Settings > Application > Left Bar (public.left_bar_order). Lower
// numbers come first. Doors (Play, Watch, Inventory) are sorted among
// themselves and always sit above the sections.
export const LEFT_BAR_DEFAULT_ORDER: Record<string, number> = {
  play: 1,
  watch: 2,
  inventory: 3,
  compete: 10,
  practice: 20,
  media: 30,
  roster: 40,
  social: 50,
  apps: 60,
  information: 70,
};

export function leftBarOrder(
  overrides: Record<string, number> | undefined,
  key: string,
): number {
  const value = overrides?.[key];
  // At least 1: 0 and below would float a block above the search box.
  return Math.max(
    1,
    typeof value === "number" && Number.isFinite(value)
      ? value
      : (LEFT_BAR_DEFAULT_ORDER[key] ?? 99),
  );
}
