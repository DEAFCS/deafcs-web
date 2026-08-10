import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relPath) =>
  readFile(new URL(`../${relPath}`, import.meta.url), "utf8");

// Team-page bug: the roster-image editor's replace/remove controls were only
// visible on :hover, so a player who already had a team-specific image
// (Theft, TricoN) showed no visible way to change it. Live-verified fix:
// roster-mode tiles now show the controls unconditionally.
{
  const src = await read("components/ImageUploadTile.vue");

  assert.match(
    src,
    /const alwaysShowActions = computed\(\(\) => props\.mode === "roster"\);/,
    "ImageUploadTile must always-show actions for roster-mode tiles",
  );

  // The action row's opacity must be conditional on alwaysShowActions, not a
  // bare opacity-0/group-hover pair (which was the original hover-only bug).
  assert.match(
    src,
    /alwaysShowActions\s*\n\s*\? 'opacity-100'\s*\n\s*: 'opacity-0 group-hover:opacity-100/,
  );

  // A persistent "Replace" label is shown for roster-mode tiles so the
  // control's existence never depends on discovering a hover target.
  assert.match(src, /v-if="alwaysShowActions && !disabled"/);
}

// components/teams/TeamMember.vue: the team-page dialog reuses
// ImageUploadTile with mode="roster" kind="team-roster", scoped to exactly
// this player + this team (no team selector, no bulk-teams prop).
{
  const src = await read("components/teams/TeamMember.vue");
  assert.match(src, /mode="roster"/);
  assert.match(src, /kind="team-roster"/);
  assert.doesNotMatch(
    src,
    /bulk-teams|bulk-url-builder/,
    "team-page roster editor must not expose a team selector",
  );
  assert.match(
    src,
    /avatars\/roster-teams\/\$\{member\.team_id\}\/\$\{member\.player\.steam_id\}/,
  );
}

// ---------------------------------------------------------------------------
// Bug 1 (real cause): shadcn/reka DialogContent is `display: grid`. A grid
// item with an inline-axis `auto` margin (mx-auto) disables the default
// `justify-self: stretch`, so a wrapper with `mx-auto` but no explicit width
// shrinks to its max-content size. Its `w-full` child then resolves against
// that undefined/collapsed width and computes to 0, and the aspect-ratio
// tile collapses too - exactly what production showed (ImageUploadTile
// present in the DOM, but with zero effective size).
//
// Verified empirically: an isolated static repro of this exact DOM/CSS
// shape (grid parent > wrapper with mx-auto + max-w-[12rem], no w-full >
// w-full aspect-ratio:1/1 child) measured via getBoundingClientRect:
//   mx-auto max-w-[12rem]        -> wrapper 4x4px,   tile 0x0px  (collapsed)
//   mx-auto w-full max-w-[12rem] -> wrapper 196x196px, tile 192x192px (fixed)
//
// Fix: give the wrapper an explicit width (w-full) alongside mx-auto, so it
// stops depending on grid stretch. This is the same pattern already used
// safely elsewhere in this codebase (pages/settings/application/branding.vue
// pairs an auto margin with w-full for its own ImageUploadTile wrappers).
{
  const src = await read("components/teams/TeamMember.vue");
  assert.match(
    src,
    /class="mx-auto w-full max-w-\[12rem\]"/,
    "the team-page roster-image wrapper must pair mx-auto with an explicit width (w-full) so it can't collapse inside DialogContent's grid layout",
  );
}

// Repo-wide guard: no ImageUploadTile caller may combine an auto margin
// (mx-auto) with no explicit width class on the same line - that combination
// is exactly what collapses inside any `display: grid` ancestor (shadcn
// DialogContent, but potentially other grid containers too). This protects
// every current and future caller, not just TeamMember.vue.
{
  const callers = [
    "components/teams/TeamMember.vue",
    "pages/teams/[id].vue",
    "pages/players/[id].vue",
    "pages/settings/application/branding.vue",
    "pages/news/manage/[id].vue",
    "pages/awards/manage.vue",
    "components/tournament/TournamentInformationForm.vue",
    "components/tournament/TournamentCreateWizard.vue",
  ];
  const hasWidth = /\b(w-full|w-\[|w-\d)/;
  for (const path of callers) {
    const src = await read(path);
    const classMatches = [
      ...src.matchAll(/<ImageUploadTile[\s\S]*?class="([^"]*)"/g),
    ];
    for (const [, classAttr] of classMatches) {
      if (/\bmx-auto\b/.test(classAttr)) {
        assert.ok(
          hasWidth.test(classAttr),
          `${path}: ImageUploadTile class="${classAttr}" combines mx-auto with no explicit width - this collapses inside a grid ancestor (e.g. DialogContent)`,
        );
      }
    }
  }
}

console.log("roster image editor UI checks passed");
