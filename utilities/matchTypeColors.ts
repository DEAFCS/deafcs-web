export const MATCH_TYPE_RGB: Record<string, string> = {
  Competitive: "249 158 47",
  Wingman: "217 70 239",
  Duel: "34 211 238",
};

export const MATCH_TYPE_LABELS: Record<string, string> = {
  Competitive: "5V5",
  Wingman: "2V2",
  Duel: "1V1",
};

export const matchTypeRgb = (type?: string | null): string =>
  MATCH_TYPE_RGB[type ?? ""] ?? MATCH_TYPE_RGB.Competitive;

export const matchTypeLabel = (type?: string | null): string | null =>
  type ? (MATCH_TYPE_LABELS[type] ?? type.toUpperCase()) : null;

export const matchTypeColorStyle = (
  type?: string | null,
): Record<string, string> => ({
  "--mode-rgb": matchTypeRgb(type),
});
