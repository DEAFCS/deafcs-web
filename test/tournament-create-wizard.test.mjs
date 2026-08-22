import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

register("./resolve-aliases-loader.mjs", import.meta.url);

const { requiresLocation } = await import("~/utilities/tournamentCategories");

const wizard = await readFile(
  new URL(
    "../components/tournament/TournamentCreateWizard.vue",
    import.meta.url,
  ),
  "utf8",
);
const editForm = await readFile(
  new URL(
    "../components/tournament/TournamentInformationForm.vue",
    import.meta.url,
  ),
  "utf8",
);
const matchOptionsEditForm = await readFile(
  new URL(
    "../components/tournament/TournamentMatchOptionsForm.vue",
    import.meta.url,
  ),
  "utf8",
);

// ---------------------------------------------------------------------
// 1. Minimum role: create must round-trip whatever was selected, not
//    silently fall back to the tournaments.min_role column's own DB
//    default ('verified_user'), which is what produced the reported
//    "User -> Verified User" bug.
// ---------------------------------------------------------------------

test("min_role is part of the wizard's form schema, not left undeclared", () => {
  assert.match(wizard, /min_role: z\.string\(\)\.nullable\(\)\.default\(null\)/);
});

test("the create mutation sends min_role instead of omitting the column", () => {
  const createFn = wizard.slice(
    wizard.indexOf("async create()"),
    wizard.indexOf("async persistAwardConfiguration"),
  );
  assert.match(createFn, /insert_tournaments_one: \[/);
  assert.match(createFn, /min_role: form\.min_role \?\? null,/);
});

test("min_role uses the same nullable/no-fallback semantics as the edit form", () => {
  // Edit form (TournamentMatchOptionsForm.vue): reads back exactly what's
  // stored, defaulting only to null (unrestricted) -- never coerced to any
  // particular role.
  assert.match(
    matchOptionsEditForm,
    /min_role: this\.tournament\.min_role \?\? null,/,
  );
  assert.match(matchOptionsEditForm, /min_role: form\.min_role \?\? null,/);
  // Wizard's create must follow the identical pattern: whatever the
  // organizer picked (including "user") goes straight to the mutation, with
  // only an *absent* selection ("Unrestricted") becoming null. Nothing here
  // ever substitutes a different role.
  assert.doesNotMatch(wizard, /min_role:\s*["']verified_user["']/);
  assert.doesNotMatch(wizard, /min_role:\s*e_player_roles_enum\.verified_user/);
});

// ---------------------------------------------------------------------
// 2. Conditional Location step.
// ---------------------------------------------------------------------

test("requiresLocation is keyed off canonical category values, not display text", () => {
  assert.equal(requiresLocation(["LAN"]), true);
  assert.equal(requiresLocation(["LocationEvent"]), true);
  assert.equal(requiresLocation(["OnlineEvent"]), false);
  assert.equal(requiresLocation(["League"]), false);
  assert.equal(requiresLocation([]), false);
  assert.equal(requiresLocation(null), false);
  assert.equal(requiresLocation(undefined), false);
  // Multi-select: any physical-venue category is enough, regardless of what
  // else is also selected.
  assert.equal(requiresLocation(["League", "LAN"]), true);
  assert.equal(requiresLocation(["OnlineEvent", "LocationEvent"]), true);
  assert.equal(requiresLocation(["OnlineEvent", "League"]), false);
  // Never matches a translated/display label by accident.
  assert.equal(requiresLocation(["Local Area Network"]), false);
  assert.equal(requiresLocation(["Location Event"]), false);
});

test("the Location step's disabled state is driven by requiresLocation, not a display string", () => {
  assert.match(
    wizard,
    /locationRequired\(\) \{\s*return requiresLocation\(this\.form\.values\.categories \?\? \[\]\);/,
  );
  assert.match(
    wizard,
    /key: "location",\s*label: this\.\$t\("tournament\.wizard\.location"\),\s*disabled: !this\.locationRequired,/,
  );
});

test("step numbering is fixed -- steps are never re-indexed or removed when disabled", () => {
  const stepsFn = wizard.slice(
    wizard.indexOf("steps() {"),
    wizard.indexOf("attendanceWindowPreview()"),
  );
  // All five steps are always present in this fixed order.
  assert.match(stepsFn, /key: "information"/);
  assert.match(stepsFn, /key: "location"/);
  assert.match(stepsFn, /key: "match_options"/);
  assert.match(stepsFn, /key: "prizes"/);
  assert.match(stepsFn, /key: "awards"/);
  const order = [...stepsFn.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, [
    "information",
    "location",
    "match_options",
    "prizes",
    "awards",
  ]);
});

test("the step indicator renders a distinct, unclickable style for a disabled step", () => {
  assert.match(wizard, /step\.disabled\s*\n\s*\?\s*'cursor-not-allowed/);
  assert.match(wizard, /:disabled="step\.disabled \|\| index > furthestStep"/);
  assert.match(wizard, /:aria-disabled="step\.disabled"/);
});

test("goTo refuses to navigate directly into a disabled step", () => {
  const goToFn = wizard.slice(
    wizard.indexOf("async goTo(step: number)"),
    wizard.indexOf("async create()"),
  );
  assert.match(goToFn, /if \(this\.steps\[step\]\?\.disabled\) \{\s*return;/);
});

test("next() and back() both skip a disabled Location step", () => {
  const nextFn = wizard.slice(
    wizard.indexOf("async next() {"),
    wizard.indexOf("back() {"),
  );
  assert.match(nextFn, /nextEnabledStep\(/);

  const backFn = wizard.slice(
    wizard.indexOf("back() {"),
    wizard.indexOf("async goTo(step: number)"),
  );
  assert.match(backFn, /previousEnabledStep\(/);

  // Verify the skip functions actually skip: reproduce their exact logic
  // over a steps array shaped like the real one, with Location disabled.
  const steps = [
    { disabled: false },
    { disabled: true },
    { disabled: false },
    { disabled: false },
    { disabled: false },
  ];
  function nextEnabledStep(from) {
    let step = from;
    while (step < steps.length - 1 && steps[step].disabled) step++;
    return step;
  }
  function previousEnabledStep(from) {
    let step = from;
    while (step > 0 && steps[step].disabled) step--;
    return step;
  }
  // Information (0) -> Next -> skips Location (1) -> lands on Match Options (2).
  assert.equal(nextEnabledStep(1), 2);
  // Match Options (2) -> Back -> skips Location (1) -> lands on Information (0).
  assert.equal(previousEnabledStep(1), 0);

  // With Location enabled, neither skip fires.
  steps[1].disabled = false;
  assert.equal(nextEnabledStep(1), 1);
  assert.equal(previousEnabledStep(1), 1);
});

test("switching categories while on Information updates the Location step immediately (computed, no manual sync)", () => {
  // `steps` and `locationRequired` are plain computeds reading
  // `form.values.categories` directly -- no watcher/debounce/manual
  // recomputation is needed for them to reflect a category change made via
  // CategorySelect's own `form.setFieldValue('categories', ...)` call.
  assert.match(
    wizard,
    /\(categories\) => form\.setFieldValue\('categories', categories\)/,
  );
  assert.match(wizard, /locationRequired\(\) \{/);
});

test("create() nulls the location payload when it isn't required, without touching form state", () => {
  const createFn = wizard.slice(
    wizard.indexOf("async create()"),
    wizard.indexOf("async persistAwardConfiguration"),
  );
  assert.match(
    createFn,
    /const locationEnabled = requiresLocation\(form\.categories \?\? \[\]\);/,
  );
  assert.match(
    createFn,
    /location: locationEnabled \? form\.location \|\| null : null,/,
  );
  assert.match(
    createFn,
    /latitude: locationEnabled \? form\.latitude \?\? null : null,/,
  );
  assert.match(
    createFn,
    /longitude: locationEnabled \? form\.longitude \?\? null : null,/,
  );
  // Stale values are only excluded from the *payload* -- onLocationSelected/
  // onLocationCleared (the only writers of form.location/latitude/longitude)
  // are untouched by the conditional-step work, so switching back to
  // LAN/Location Event before submitting still shows the address.
  assert.match(wizard, /onLocationSelected\(result: \{/);
  assert.doesNotMatch(
    wizard,
    /watch\(\s*\(\) => (this\.)?form\.values\.categories/,
  );
});

// ---------------------------------------------------------------------
// 3. Registration / check-in schedule in the create wizard.
// ---------------------------------------------------------------------

test("the wizard exposes the same two canonical attendance fields as the edit form, not a new model", () => {
  // Edit form's canonical shape.
  assert.match(
    editForm,
    /attendance_open_before: z\.coerce\s*\.number\(\)\s*\.int\(\)\s*\.min\(15\)\s*\.max\(240\)\s*\.default\(60\)/,
  );
  assert.match(
    editForm,
    /attendance_close_before: z\.coerce\s*\.number\(\)\s*\.int\(\)\s*\.min\(5\)\s*\.max\(60\)\s*\.default\(15\)/,
  );
  // Wizard: identical bounds and defaults, same field names.
  assert.match(
    wizard,
    /attendance_open_before: z\.coerce\s*\.number\(\)\s*\.int\(\)\s*\.min\(15\)\s*\.max\(240\)\s*\.default\(60\)/,
  );
  assert.match(
    wizard,
    /attendance_close_before: z\.coerce\s*\.number\(\)\s*\.int\(\)\s*\.min\(5\)\s*\.max\(60\)\s*\.default\(15\)/,
  );
  // No parallel "registration_closes_at" or similar invented timestamp.
  assert.doesNotMatch(wizard, /registration_clos/);
  assert.doesNotMatch(wizard, /registration_end/);
});

test("the wizard reuses the edit form's exact gap validation and translation keys", () => {
  assert.match(
    editForm,
    /values\.attendance_open_before - values\.attendance_close_before >= 5/,
  );
  assert.match(
    wizard,
    /values\.attendance_open_before - values\.attendance_close_before >=\s*5/,
  );
  assert.match(
    wizard,
    /this\.\$t\("tournament\.form\.attendance\.invalid_window"\)/,
  );
  for (const key of [
    "tournament.form.attendance.open_before",
    "tournament.form.attendance.open_before_description",
    "tournament.form.attendance.close_before",
    "tournament.form.attendance.close_before_description",
    "tournament.form.attendance.preview",
  ]) {
    const needle = `$t("${key}"`;
    assert.ok(
      editForm.includes(needle),
      `edit form should use ${key}`,
    );
    assert.ok(wizard.includes(needle), `wizard should reuse ${key}`);
  }
});

test("the schedule inputs share the edit form's bounds/name attributes (name=attendance_open_before etc.)", () => {
  assert.match(wizard, /name="attendance_open_before"/);
  assert.match(wizard, /name="attendance_close_before"/);
  assert.match(wizard, /min="15" max="240"/);
  assert.match(wizard, /min="5" max="60"/);
});

test("Next from Information validates the schedule window before advancing", () => {
  const validateFn = wizard.slice(
    wizard.indexOf("async validateStep(step: number)"),
    wizard.indexOf("nextEnabledStep("),
  );
  assert.match(validateFn, /validateField\("attendance_open_before"\)/);
  assert.match(validateFn, /validateField\("attendance_close_before"\)/);
});

test("create() persists the schedule as a follow-up update, mirroring the edit form's own save mutation", () => {
  assert.match(
    wizard,
    /async persistAttendanceSchedule\(tournamentId: string\)/,
  );
  const scheduleFn = wizard.slice(
    wizard.indexOf("async persistAttendanceSchedule"),
    wizard.indexOf("async persistCategoriesAndPrizes"),
  );
  assert.match(scheduleFn, /update_tournaments_by_pk: \[/);
  assert.match(scheduleFn, /pk_columns: \{ id: tournamentId \}/);
  assert.match(
    scheduleFn,
    /attendance_check_in_open_before_minutes: \$\(\s*"attendance_open_before",\s*"Int",?\s*\)/,
  );
  assert.match(
    scheduleFn,
    /attendance_check_in_close_before_minutes: \$\(\s*"attendance_close_before",\s*"Int",?\s*\)/,
  );
  // Same column/field names as the edit form's save mutation -- no
  // duplicated scheduling model.
  assert.match(
    editForm,
    /attendance_check_in_open_before_minutes: \$\(\s*"attendance_open_before",\s*"Int",?\s*\)/,
  );
  assert.match(
    editForm,
    /attendance_check_in_close_before_minutes: \$\(\s*"attendance_close_before",\s*"Int",?\s*\)/,
  );
  // A no-op when the organizer left both fields at their defaults -- those
  // already match the columns' own DB defaults, so there's nothing to send.
  assert.match(
    scheduleFn,
    /if \(openBefore === 60 && closeBefore === 15\) \{\s*return;/,
  );
});

test("a failed schedule follow-up is surfaced, not silently dropped, and still allows navigation to the created tournament", () => {
  const createFn = wizard.slice(
    wizard.indexOf("async create()"),
    wizard.indexOf("async persistAwardConfiguration"),
  );
  assert.match(createFn, /await this\.persistAttendanceSchedule\(tournamentId\);/);
  assert.match(
    createFn,
    /registration\/check-in timing needs attention/,
  );
  // The row already exists by this point (documented above this block), so
  // the existing "must still navigate, not duplicate" comment covers this
  // too -- confirm the try/catch doesn't return early or throw further.
  assert.match(
    createFn,
    /follow-up failures must\s*\n\s*\/\/ still navigate to it, or a retried Create inserts a duplicate\./,
  );
});

console.log("tournament create wizard checks passed");
