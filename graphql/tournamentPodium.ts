// Adapted from 5Stack WEB 45a580e0; MIT Copyright (c) 2025 5Stack.gg; see LICENSE.
import { $ } from "~/generated/zeus";
import { typedGql } from "~/generated/zeus/typedDocumentNode";

// The finished tournament's placements (api#588). Run with
// `context: { optional: true }`, so an api without the field only loses them.
export const tournamentPodiumQuery = typedGql("query")({
  tournaments_by_pk: [
    { id: $("tournamentId", "uuid!") },
    { id: true, podium: true } as any,
  ],
});

// DEAFCS: placements are only used when they name a champion. An old
// tournament whose final has no recorded winner would otherwise get a podium
// of 3rd places only; it keeps the standings it showed before.
export function usablePodiumSteps(steps: unknown): Array<any> | null {
  if (!Array.isArray(steps)) {
    return null;
  }
  return steps.some((step: any) => Number(step?.placement) === 1)
    ? steps
    : null;
}
