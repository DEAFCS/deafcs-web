export function matchSeriesLabel(bestOf: number | null | undefined): string {
  const value = Number(bestOf);
  return `BO${Number.isFinite(value) && value > 0 ? value : 1}`;
}
