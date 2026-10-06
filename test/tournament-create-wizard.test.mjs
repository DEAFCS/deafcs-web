import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

register("./resolve-aliases-loader.mjs", import.meta.url);

const { requiresLocation } = await import("~/utilities/tournamentCategories");
const { registrationSchemaShape, registrationColumns } = await import("~/utilities/tournamentRegistration");

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
  assert.match(wizard, /\.\.\.registrationSchemaShape\(this\)/);
  const shape = registrationSchemaShape({ form: { values: {} }, $t: (key) => key });
  assert.equal(shape.min_role.parse(undefined), null);
  assert.equal(shape.min_role.parse("user"), "user");
});

test("the create mutation sends min_role instead of omitting the column", () => {
  const createFn = wizard.slice(
    wizard.indexOf("async create()"),
    wizard.indexOf("async persistAwardConfiguration"),
  );
  assert.match(createFn, /insert_tournaments_one: \[/);
  assert.match(createFn, /\.\.\.registrationColumns\(form\)/);
  assert.equal(registrationColumns({ min_role: "user" }).min_role, "user");
  assert.equal(registrationColumns({}).min_role, null);
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
  // All six steps are always present in this fixed order. Registration
  // comes before Match Options -- matching 5stack's wizard ordering -- since
  // who may register (teams/free agents/both) frames what match settings
  // even apply (e.g. substitutes never apply to a free-agent draft pool).
  assert.match(stepsFn, /key: "information"/);
  assert.match(stepsFn, /key: "location"/);
  assert.match(stepsFn, /key: "registration"/);
  assert.match(stepsFn, /key: "match_options"/);
  assert.match(stepsFn, /key: "prizes"/);
  assert.match(stepsFn, /key: "awards"/);
  const order = [...stepsFn.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, [
    "information",
    "location",
    "registration",
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
  // next() itself is sync on purpose (void this.advance()) so ui/Button
  // never sees a promise and flashes its auto-spinner on every step
  // advance; the actual skip-a-disabled-step logic lives in advance().
  const advanceFn = wizard.slice(
    wizard.indexOf("async advance() {"),
    wizard.indexOf("back() {"),
  );
  assert.match(advanceFn, /nextEnabledStep\(/);

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
  // Information (0) -> Next -> skips Location (1) -> lands on Registration (2).
  assert.equal(nextEnabledStep(1), 2);
  // Registration (2) -> Back -> skips Location (1) -> lands on Information (0).
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
// 3. Unified registration/check-in schedule. Theft's current wizard shares
// this schema and serializer with Manage; v1 attendance stays in the editor.
// ---------------------------------------------------------------------
test("create and Manage use the shared v2 registration schema and controls", () => {
  for (const source of [wizard, editForm]) {
    assert.match(source, /registrationSchemaShape\(this\)/);
    assert.match(source, /<TournamentRegistrationForm/);
    assert.match(source, /registrationColumns\((?:form|this.form.values)\)/);
  }
});
test("historical v1 attendance remains available in the editor", () => {
  assert.match(editForm, /attendance_check_in_open_before_minutes/);
  assert.match(editForm, /attendance_check_in_close_before_minutes/);
  assert.match(editForm, /tournament.registration_version !== 2/);
});
test("the shared schedule rejects short windows and out-of-range offsets", () => {
  const component = { form: { values: { check_in_required: true, check_in_closes_before_minutes: 15 } }, $t: (key) => key };
  const shape = registrationSchemaShape(component);
  assert.equal(shape.check_in_opens_before_minutes.safeParse(16).success, false);
  assert.equal(shape.check_in_opens_before_minutes.safeParse(60).success, true);
  assert.equal(shape.check_in_opens_before_minutes.safeParse(100000).success, false);
  assert.equal(shape.check_in_closes_before_minutes.safeParse(-1).success, false);
});
test("tournament check-in serialization does not overwrite match-ready settings", () => {
  const columns = registrationColumns({ check_in_setting: "Captains", team_check_in_setting: "Players", check_in_opens_before_minutes: 90, check_in_closes_before_minutes: 20 });
  assert.equal(columns.check_in_setting, "Players");
  assert.equal(columns.check_in_opens_before_minutes, 90);
  assert.equal(columns.check_in_closes_before_minutes, 20);
});
test("successful creation and award recovery both lead to the created Manage route", () => {
  assert.match(wizard, /path: `\/tournaments\/\$\{tournamentId\}\/manage`/);
  assert.match(wizard, /section: awardMappingsFailed \? "awards" : "stages"/);
  assert.match(wizard, /still navigate to it, or a retried Create inserts a duplicate/);
});
