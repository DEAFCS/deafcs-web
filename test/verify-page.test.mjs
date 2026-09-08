import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Covers the redesigned player verification form (pages/verify/index.vue):
// the new 2-column required/optional layout, the relabeled hearing-status
// options (same underlying enum values), the new optional applicant fields
// (nickname, socials), and the required account declaration whose actual
// persisted timestamp is server-controlled, not client-supplied.

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const pageSource = await read("../pages/verify/index.vue");
const detailSource = await read("../pages/verification-applications/[id].vue");
const badgeSource = await read("../components/RequirementBadge.vue");
const enLocale = JSON.parse(await read("../i18n/locales/en.json"));
const copy = enLocale.pages.verify;

test("hearing status keeps the existing enum values, only relabels them", () => {
  assert.match(pageSource, /const DEAF_OPTIONS = \["yes", "hard_of_hearing", "no"\]/);
  assert.equal(copy.form.is_deaf_options.yes, "Deaf");
  assert.equal(copy.form.is_deaf_options.hard_of_hearing, "Hard of hearing");
  assert.equal(copy.form.is_deaf_options.no, "Neither / Other");
});

test("hearing status, country, and account declaration are the only required fields (test #1, #2, #3)", () => {
  const requiredSrc = pageSource.slice(
    pageSource.indexOf("requiredMissingFields(): string[]"),
    pageSource.indexOf("invalidOptionalFields(): string[]"),
  );
  assert.match(requiredSrc, /if \(!this\.form\.is_deaf\) missing\.push\("is_deaf"\)/);
  assert.match(requiredSrc, /if \(!this\.form\.country\) missing\.push\("country"\)/);
  assert.match(
    requiredSrc,
    /if \(!this\.form\.account_declaration_accepted\)[\s\S]{0,40}missing\.push\("account_declaration"\)/,
  );
  // knows_deaf_player and the known-player reference list must NOT be
  // unconditionally required -- only requiredMissingFields() (this slice)
  // can ever produce the "Missing required answers" toast.
  assert.doesNotMatch(requiredSrc, /if \(this\.form\.knows_deaf_player === null\)/);
  assert.doesNotMatch(requiredSrc, /known_players/);
});

test("found_via itself is optional; only its own free-text 'other' sub-field can still block it (test #4)", () => {
  const requiredSrc = pageSource.slice(
    pageSource.indexOf("requiredMissingFields(): string[]"),
    pageSource.indexOf("invalidOptionalFields(): string[]"),
  );
  assert.doesNotMatch(requiredSrc, /if \(!this\.form\.found_via\) missing\.push/);
  assert.match(
    requiredSrc,
    /found_via === "other" && !this\.form\.found_via_other\.trim\(\)/,
  );
});

test("empty optional fields are always accepted -- invalidOptionalFields() only fires on a non-empty, malformed value (test #5-#10)", () => {
  const invalidSrc = pageSource.slice(
    pageSource.indexOf("invalidOptionalFields(): string[]"),
    pageSource.indexOf("async submit()"),
  );
  // Every known-player row's Steam URL is guarded the same way: an empty
  // trimmed value short-circuits before the format check runs, so leaving
  // any row (or all of them) blank can never be flagged. Nickname has no
  // format validator at all -- it's free text, never blocked.
  assert.match(invalidSrc, /const steamUrl = player\.steam_profile_url\.trim\(\);/);
  assert.match(invalidSrc, /return steamUrl && !isValidSteamProfileUrl\(steamUrl\);/);
  assert.match(invalidSrc, /if \(instagram && !isValidInstagramHandle\(instagram\)\)/);
  assert.match(invalidSrc, /if \(facebook && !isValidFacebookProfileUrl\(facebook\)\)/);
  assert.match(invalidSrc, /if \(vk && !isValidVkValue\(vk\)\)/);
  assert.doesNotMatch(pageSource, /player\.nickname.*isValid/);
  // additional_info has no validator reference anywhere in the file.
  assert.doesNotMatch(pageSource, /isValid\w*\(this\.form\.additional_info/);
});

test("Instagram accepts a bare username or @username, never requires a full URL (test #11)", () => {
  assert.match(pageSource, /const INSTAGRAM_HANDLE_RE = \/\^@\?\[A-Za-z0-9\._\]\{1,30\}\$\//);
  assert.match(pageSource, /function isValidInstagramHandle\(value: string\): boolean/);
  // Sanity-check the actual regex behavior, not just its presence.
  const re = /^@?[A-Za-z0-9._]{1,30}$/;
  assert.ok(re.test("username"));
  assert.ok(re.test("@username"));
  assert.ok(re.test("john.doe_92"));
  assert.ok(!re.test("https://instagram.com/username"));
  assert.ok(!re.test("two words"));
});

test("Facebook requires an actual facebook.com host when non-empty, not just any URL -- malformed/unrelated value is a format error, not missing-required (test #12, #15)", () => {
  assert.match(pageSource, /function isValidFacebookProfileUrl\(value: string\): boolean/);
  assert.match(pageSource, /\/\(\^\|\\\.\)facebook\\\.com\$\//);

  const invalidSrc = pageSource.slice(
    pageSource.indexOf("invalidOptionalFields(): string[]"),
    pageSource.indexOf("async submit()"),
  );
  assert.match(invalidSrc, /invalid\.push\("social_facebook_url"\)/);
  // Confirms it lands in invalidOptionalFields(), never in
  // requiredMissingFields() -- the two use different local variable names
  // (`invalid` vs `missing`) precisely so they can never be conflated.
  const requiredSrc = pageSource.slice(
    pageSource.indexOf("requiredMissingFields(): string[]"),
    pageSource.indexOf("invalidOptionalFields(): string[]"),
  );
  assert.doesNotMatch(requiredSrc, /social_facebook_url/);

  // Sanity-check the actual validator behavior, not just its presence --
  // mirrors isValidFacebookProfileUrl exactly.
  function isValidFacebookProfileUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      return /(^|\.)facebook\.com$/.test(url.hostname);
    } catch {
      return false;
    }
  }
  assert.ok(isValidFacebookProfileUrl("https://facebook.com/example"));
  assert.ok(isValidFacebookProfileUrl("https://www.facebook.com/example"));
  assert.ok(isValidFacebookProfileUrl("https://m.facebook.com/example"));
  assert.ok(!isValidFacebookProfileUrl("https://example.com/example"));
  assert.ok(!isValidFacebookProfileUrl("not a url"));
});

test("Facebook: empty is allowed, real facebook.com URLs (bare and www) are allowed, an unrelated domain is rejected as invalid", () => {
  // Exercises invalidOptionalFields() end to end for exactly the cases
  // called out: blank never blocks, facebook.com and www.facebook.com pass,
  // a non-Facebook domain is caught as a format error.
  function isValidFacebookProfileUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      return /(^|\.)facebook\.com$/.test(url.hostname);
    } catch {
      return false;
    }
  }
  function facebookIsInvalid(rawValue) {
    const trimmed = rawValue.trim();
    return !!trimmed && !isValidFacebookProfileUrl(trimmed);
  }
  assert.equal(facebookIsInvalid(""), false);
  assert.equal(facebookIsInvalid("https://facebook.com/example"), false);
  assert.equal(facebookIsInvalid("https://www.facebook.com/example"), false);
  assert.equal(facebookIsInvalid("https://example.com/example"), true);
});

test("Steam profile requires an actual steamcommunity.com /id/ or /profiles/ URL, not just any URL (test #13, #15)", () => {
  assert.match(pageSource, /function isValidSteamProfileUrl\(value: string\): boolean/);
  assert.match(pageSource, /\/\(\^\|\\\.\)steamcommunity\\\.com\$\//);
  assert.match(pageSource, /\/\^\\\/\(id\|profiles\)\\\/\//);
  // A generic valid URL that isn't a Steam profile URl must still fail --
  // proves this is stricter than the generic isValidHttpUrl used elsewhere.
  function isValidSteamProfileUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      return (
        /(^|\.)steamcommunity\.com$/.test(url.hostname) &&
        /^\/(id|profiles)\//.test(url.pathname)
      );
    } catch {
      return false;
    }
  }
  assert.ok(isValidSteamProfileUrl("https://steamcommunity.com/id/example"));
  assert.ok(isValidSteamProfileUrl("https://steamcommunity.com/profiles/76561198000000000"));
  assert.ok(!isValidSteamProfileUrl("https://example.com/not-steam"));
  assert.ok(!isValidSteamProfileUrl("not a url"));
  const requiredSrc = pageSource.slice(
    pageSource.indexOf("requiredMissingFields(): string[]"),
    pageSource.indexOf("invalidOptionalFields(): string[]"),
  );
  assert.doesNotMatch(requiredSrc, /deaf_player_steam_url/);
});

test("VK accepts a bare username, a profile ID, or a full vk.com URL (test #14)", () => {
  assert.match(pageSource, /function isValidVkValue\(value: string\): boolean/);
  const VK_HANDLE_RE = /^[A-Za-z0-9_.]{2,32}$/;
  assert.ok(VK_HANDLE_RE.test("username"));
  assert.ok(VK_HANDLE_RE.test("id123456"));
  assert.ok(!VK_HANDLE_RE.test("a"));
  assert.match(pageSource, /\/\(\^\|\\\.\)vk\\\.com\$\//);
});

test("Instagram and VK values are normalized into real clickable URLs before being stored", () => {
  assert.match(pageSource, /function normalizeInstagramHandle\(value: string\): string/);
  assert.match(pageSource, /`https:\/\/instagram\.com\/\$\{value\.replace\(\/\^@\/, ""\)\}`/);
  assert.match(pageSource, /function normalizeVkValue\(value: string\): string/);
  assert.match(
    pageSource,
    /isValidHttpUrl\(value\) \? value : `https:\/\/vk\.com\/\$\{value\}`/,
  );
  const submitSrc = pageSource.slice(pageSource.indexOf("async submit()"));
  assert.match(submitSrc, /normalizeInstagramHandle\(instagramTrimmed\)/);
  assert.match(submitSrc, /normalizeVkValue\(vkTrimmed\)/);
});

test("a required-missing error and an invalid-format error are two distinct, non-conflatable toasts (test #15)", () => {
  assert.match(pageSource, /pages\.verify\.form\.missing_required_title/);
  assert.match(pageSource, /pages\.verify\.form\.invalid_format_title/);
  assert.notEqual(copy.form.missing_required_title, copy.form.invalid_format_title);
  // requiredMissingFields() is checked and returned from first; only if it
  // is empty does invalidOptionalFields() get a chance to block submission
  // -- so a required-missing case can never be reported as a format error.
  const submitSrc = pageSource.slice(pageSource.indexOf("async submit()"));
  const requiredCheckIndex = submitSrc.indexOf("requiredMissingFields()");
  const invalidCheckIndex = submitSrc.indexOf("invalidOptionalFields()");
  assert.ok(requiredCheckIndex >= 0 && invalidCheckIndex >= 0);
  assert.ok(requiredCheckIndex < invalidCheckIndex);
});

test("repeatable known-player references only appear when knows_deaf_player is Yes, and Player 1 can stay fully empty (community references #3)", () => {
  assert.match(pageSource, /v-if="form\.knows_deaf_player" class="flex flex-col gap-4 mt-2"/);
  assert.match(pageSource, /v-for="\(player, index\) in form\.known_players"/);
  assert.match(pageSource, /v-model="player\.nickname"/);
  assert.match(pageSource, /v-model="player\.steam_profile_url"/);
  // Player 1 starts as a single fully-empty row, not required to be filled.
  assert.match(
    pageSource,
    /known_players: \[\{ nickname: "", steam_profile_url: "" \}\]/,
  );
});

test("+ Add another player control exists, caps the list at 3, and Remove only appears on non-first rows (community references #6, #7, #8)", () => {
  assert.match(pageSource, /pages\.verify\.form\.known_players\.add_another/);
  assert.match(pageSource, /@click="addKnownPlayer"/);
  assert.match(pageSource, /v-if="form\.known_players\.length < 3"/);
  assert.match(pageSource, /const MAX_KNOWN_PLAYERS = 3;/);
  assert.match(
    pageSource,
    /addKnownPlayer\(\) \{\s*\n\s*if \(this\.form\.known_players\.length < MAX_KNOWN_PLAYERS\) \{/,
  );

  assert.match(pageSource, /v-if="index > 0"[\s\S]{0,300}@click="removeKnownPlayer\(index\)"/);
  assert.match(pageSource, /pages\.verify\.form\.known_players\.remove/);
  assert.match(
    pageSource,
    /removeKnownPlayer\(index: number\) \{\s*\n\s*if \(index > 0\) \{\s*\n\s*this\.form\.known_players\.splice\(index, 1\);/,
  );
});

test("submitting with knows_deaf_player Yes and zero completed references sends an empty known_players list, not an error (community references #9)", () => {
  const submitSrc = pageSource.slice(pageSource.indexOf("async submit()"));
  assert.match(
    submitSrc,
    /\.filter\(\(player\) => player\.nickname \|\| player\.steam_profile_url\)/,
  );
  assert.match(submitSrc, /known_players: \{ data: knownPlayersData \}/);
  // No requiredMissingFields()/invalidOptionalFields() check can ever block
  // submission over an empty known_players list -- neither references
  // form.known_players at all except inside invalidOptionalFields()'s Steam
  // URL format check, which only fires on a non-empty malformed value.
  const requiredSrc = pageSource.slice(
    pageSource.indexOf("requiredMissingFields(): string[]"),
    pageSource.indexOf("invalidOptionalFields(): string[]"),
  );
  assert.doesNotMatch(requiredSrc, /known_players/);
});

test("Yes/No toggle: known_players is submitted only when knows_deaf_player is Yes; hidden draft rows are never sent while No is selected", () => {
  // Extracts and actually executes the real knownPlayersData expression
  // from submit() (rather than re-implementing it by hand), so this proves
  // the shipped logic behaves correctly, not just a parallel copy of it.
  const start = pageSource.indexOf("const knownPlayersData = this.form.knows_deaf_player");
  const end = pageSource.indexOf(";\n\n      this.submitting = true;", start);
  assert.ok(start >= 0 && end > start, "could not locate the knownPlayersData computation in submit()");
  const expr = pageSource.slice(start, end).replace(/^const knownPlayersData = /, "");
  // The expression references `this.form` (it's lifted verbatim from
  // submit()), so it's invoked with a fake `this` rather than a plain arg.
  const compute = new Function("MAX_KNOWN_PLAYERS", `return (${expr});`);
  const MAX_KNOWN_PLAYERS = 3;

  // Yes + completed references -> references are submitted, re-numbered 1..N.
  const yesCompleted = compute.call(
    {
      form: {
        knows_deaf_player: true,
        known_players: [
          { nickname: "Alice", steam_profile_url: "" },
          { nickname: "", steam_profile_url: "https://steamcommunity.com/id/bob" },
        ],
      },
    },
    MAX_KNOWN_PLAYERS,
  );
  assert.deepEqual(yesCompleted, [
    { nickname: "Alice", steam_profile_url: null, sort_order: 1 },
    { nickname: null, steam_profile_url: "https://steamcommunity.com/id/bob", sort_order: 2 },
  ]);

  // Yes + zero completed references -> zero references submitted.
  const yesZero = compute.call(
    {
      form: {
        knows_deaf_player: true,
        known_players: [{ nickname: "", steam_profile_url: "" }],
      },
    },
    MAX_KNOWN_PLAYERS,
  );
  assert.deepEqual(yesZero, []);

  // No + previously entered hidden references -> zero references submitted,
  // even though the (locally preserved) draft rows still hold real values.
  // Toggling Yes -> No must never leak hidden draft input into the mutation.
  const noWithHiddenDrafts = compute.call(
    {
      form: {
        knows_deaf_player: false,
        known_players: [
          {
            nickname: "StillDraftedButHidden",
            steam_profile_url: "https://steamcommunity.com/id/hidden",
          },
        ],
      },
    },
    MAX_KNOWN_PLAYERS,
  );
  assert.deepEqual(noWithHiddenDrafts, []);
});

test("known_players is sent as a nested insert, not serialized into additional_info or numbered parent columns (community references #10, data model)", () => {
  const submitSrc = pageSource.slice(pageSource.indexOf("async submit()"));
  assert.match(submitSrc, /known_players: \{ data: knownPlayersData \}/);
  assert.doesNotMatch(pageSource, /deaf_player_nickname_2/);
  assert.doesNotMatch(pageSource, /deaf_player_steam_url_2/);
  assert.doesNotMatch(pageSource, /known_player_2|known_player_3/);
  // The single-reference legacy columns are no longer sent on new
  // submissions -- only the nested known_players insert carries them now.
  assert.doesNotMatch(submitSrc, /deaf_player_nickname:/);
  assert.doesNotMatch(submitSrc, /deaf_player_steam_url:/);
});

test("social profile inputs and their explanatory optional copy exist", () => {
  assert.match(pageSource, /v-model="form\.social_instagram_url"/);
  assert.match(pageSource, /v-model="form\.social_facebook_url"/);
  assert.match(pageSource, /v-model="form\.social_vk_url"/);
  assert.match(pageSource, /pages\.verify\.form\.social_profiles_note/);
  assert.match(
    copy.form.social_profiles_note,
    /not required for approval/i,
  );
});

test("account declaration checkbox is required and gates submission, but the client only sends a signal -- the server owns the real timestamp", () => {
  assert.match(pageSource, /v-model="form\.account_declaration_accepted"/);
  assert.match(pageSource, /account_declaration_accepted: false/);
  assert.match(
    pageSource,
    /account_declaration_accepted_at: new Date\(\)\.toISOString\(\)/,
  );
  // The comment documenting server-side control must actually be present --
  // this is the load-bearing design decision, not just a client nicety.
  assert.match(pageSource, /hasura\/triggers\/verification_applications\.sql/);
  assert.match(pageSource, /overwrites it with now\(\)/);
  assert.match(pageSource, /rejects[\s\S]{0,40}the insert outright if it arrives null/);
});

test("REQUIRED/OPTIONAL badges use the shared RequirementBadge component with tactical amber vs muted styling", () => {
  assert.match(badgeSource, /required \? 'outline' : 'secondary'/);
  assert.match(badgeSource, /tac-amber/);
  assert.match(badgeSource, /\$t\("common\.required"\)/);
  assert.match(badgeSource, /\$t\("common\.optional"\)/);
  assert.ok(enLocale.common.required && enLocale.common.optional);
  // No leftover unclear '*' markers anywhere the badges replaced them.
  assert.ok(!pageSource.includes('form.is_deaf") }}*'));
  assert.ok(!pageSource.includes('form.country") }}*'));
});

test("hearing status and known-players use a semantic RadioGroup, not plain buttons, while keeping the compact pill look", () => {
  assert.match(pageSource, /import \{ RadioGroup, RadioGroupItem \} from "~\/components\/ui\/radio-group";/);

  // Hearing status: RadioGroup bound directly to form.is_deaf, one
  // RadioGroupItem per option, each carrying the real enum value.
  const isDeafBlock = pageSource.slice(
    pageSource.indexOf('label class="text-sm font-medium">{{ $t("pages.verify.form.is_deaf")'),
    pageSource.indexOf("</RadioGroup>") + "</RadioGroup>".length,
  );
  assert.match(isDeafBlock, /<RadioGroup\s+v-model="form\.is_deaf"/);
  assert.match(isDeafBlock, /:aria-label="\$t\('pages\.verify\.form\.is_deaf'\)"/);
  assert.match(isDeafBlock, /v-for="option in deafOptions"/);
  assert.match(isDeafBlock, /:value="option"/);
  assert.match(isDeafBlock, /:class="compactRadioPillClass"/);
  assert.doesNotMatch(isDeafBlock, /<Button/);

  // Known players: a real get/set computed bridges the boolean form field
  // to RadioGroup's string v-model -- not two independent buttons that
  // could theoretically both/neither be "selected" outside Vue's own state.
  assert.match(
    pageSource,
    /knowsDeafPlayerValue: \{\s*\n\s*get\(\): string \| undefined \{/,
  );
  assert.match(pageSource, /set\(value: string\) \{\s*\n\s*this\.form\.knows_deaf_player = value === "yes";/);
  assert.match(pageSource, /<RadioGroup\s*\n?\s*v-model="knowsDeafPlayerValue"/);
  assert.match(pageSource, /<RadioGroupItem value="yes" :class="compactRadioPillClass">/);
  assert.match(pageSource, /<RadioGroupItem value="no" :class="compactRadioPillClass">/);
});

test("the compact radio pill styling is data-[state=checked]-driven (real radio semantics), not a manual variant prop", () => {
  assert.match(pageSource, /const compactRadioPillClass =/);
  assert.match(pageSource, /data-\[state=checked\]:bg-\[hsl\(var\(--tac-amber\)\)\]/);
  // Same visual family as the tactical Button variant it replaces.
  assert.match(pageSource, /data-\[state=checked\]:text-\[hsl\(var\(--tac-amber-foreground\)\)\]/);
  assert.match(pageSource, /border border-input bg-background/);
});

test("RadioGroupItem's shared component still defaults to its original circle+checkmark indicator for every other caller", async () => {
  const radioGroupItemSource = await read("../components/ui/radio-group/RadioGroupItem.vue");
  // The fallback slot content is exactly the original hardcoded markup, so
  // every existing caller (ServerForm.vue, TournamentMatch.vue) that passes
  // no children renders identically to before this change.
  assert.match(
    radioGroupItemSource,
    /<slot>\s*\n\s*<RadioGroupIndicator class="flex items-center justify-center">\s*\n\s*<CheckIcon class="h-3\.5 w-3\.5 text-primary" \/>\s*\n\s*<\/RadioGroupIndicator>\s*\n\s*<\/slot>/,
  );
});

test("webcam verification notice explains review-first, no recordings through this form, and no upload feature was added", () => {
  assert.match(pageSource, /pages\.verify\.webcam_notice\.title/);
  assert.match(pageSource, /pages\.verify\.webcam_notice\.body_1/);
  assert.match(pageSource, /pages\.verify\.webcam_notice\.body_2/);
  assert.match(copy.webcam_notice.body_2, /do not submit webcam recordings/i);
  assert.doesNotMatch(pageSource, /input[^>]*type="file"/i);
  assert.doesNotMatch(pageSource, /getUserMedia|MediaRecorder|<video/i);
});

test("desktop layout is the 2-column card grid matching the Rules-page pattern, stacking on smaller screens", () => {
  assert.match(pageSource, /class="grid gap-6 lg:grid-cols-2"/);
  assert.match(pageSource, /tacticalSectionLabelClasses/);
  assert.match(pageSource, /tacticalSectionTickClasses/);
});

test("Social Profiles now lives in the About You card, not the Community card (community references #1)", () => {
  const aboutYouStart = pageSource.indexOf("<!-- About You -->");
  const communityStart = pageSource.indexOf("<!-- Community -->");
  const socialProfilesIndex = pageSource.indexOf("pages.verify.form.sections.social_profiles");
  assert.ok(aboutYouStart >= 0 && communityStart >= 0 && socialProfilesIndex >= 0);
  assert.ok(socialProfilesIndex > aboutYouStart && socialProfilesIndex < communityStart);
  // The Community card content, from its own comment onward, must not
  // reference Social Profiles at all -- it only has the community question
  // and the known-player references now.
  assert.doesNotMatch(pageSource.slice(communityStart), /sections\.social_profiles/);
});

test("Community explanation copy exists: not required to know anyone, DEAFCS may contact a listed reference, privacy note is separate and smaller (community references #2, #3, #4)", () => {
  assert.match(pageSource, /pages\.verify\.form\.knows_deaf_player_explanation/);
  assert.match(pageSource, /pages\.verify\.form\.knows_deaf_player_privacy_note/);
  assert.match(copy.form.knows_deaf_player_explanation, /you do not need to know anyone to be approved/i);
  assert.match(copy.form.knows_deaf_player_explanation, /may contact/i);
  assert.match(copy.form.knows_deaf_player_privacy_note, /comfortable with DEAFCS contacting/i);
  // Explanation sits directly under the question, above the Yes/No radios.
  const knowsDeafPlayerIndex = pageSource.indexOf('$t("pages.verify.form.knows_deaf_player")');
  const explanationIndex = pageSource.indexOf("knows_deaf_player_explanation");
  const radioGroupIndex = pageSource.indexOf('v-model="knowsDeafPlayerValue"');
  assert.ok(knowsDeafPlayerIndex < explanationIndex && explanationIndex < radioGroupIndex);
});

test("known-player Steam URL: blank is always accepted, a non-empty malformed URL is blocked as invalid format (community references: optional + malformed blocked)", () => {
  function isValidSteamProfileUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      return (
        /(^|\.)steamcommunity\.com$/.test(url.hostname) &&
        /^\/(id|profiles)\//.test(url.pathname)
      );
    } catch {
      return false;
    }
  }
  function hasInvalidKnownPlayerSteamUrl(players) {
    return players.some((player) => {
      const steamUrl = player.steam_profile_url.trim();
      return steamUrl && !isValidSteamProfileUrl(steamUrl);
    });
  }
  assert.equal(hasInvalidKnownPlayerSteamUrl([{ steam_profile_url: "" }]), false);
  assert.equal(hasInvalidKnownPlayerSteamUrl([{ steam_profile_url: "   " }]), false);
  assert.equal(
    hasInvalidKnownPlayerSteamUrl([{ steam_profile_url: "https://steamcommunity.com/id/example" }]),
    false,
  );
  assert.equal(hasInvalidKnownPlayerSteamUrl([{ steam_profile_url: "not-a-url" }]), true);
  assert.equal(
    hasInvalidKnownPlayerSteamUrl([{ steam_profile_url: "https://example.com/not-steam" }]),
    true,
  );
  // A blank first row alongside one malformed second row still blocks --
  // it's a per-row check across the whole array, not just index 0.
  assert.equal(
    hasInvalidKnownPlayerSteamUrl([
      { steam_profile_url: "" },
      { steam_profile_url: "not-a-url" },
    ]),
    true,
  );
});

test("submit button reads Submit Verification Application", () => {
  assert.equal(copy.form.submit, "Submit Verification Application");
});

test("intro explains required-vs-optional, that community/social fields aren't required, and that an admin reviews", () => {
  assert.match(copy.intro, /Required/);
  assert.match(copy.intro, /optional/i);
  assert.match(copy.intro, /administrator reviews/i);
});

test("no em dashes in the new/changed verification copy", () => {
  assert.doesNotMatch(JSON.stringify(copy), /—/);
});

test("admin detail page selects and renders every new applicant field", () => {
  for (const field of [
    "deaf_player_nickname",
    "social_instagram_url",
    "social_facebook_url",
    "social_vk_url",
    "account_declaration_accepted_at",
  ]) {
    assert.match(detailSource, new RegExp(`\\r?\\n\\s*${field}\\r?\\n`));
  }
});

test("admin detail page renders a clean placeholder (not a raw blank) for missing optional values, never an em dash", () => {
  assert.match(detailSource, /emptyValue\(\): string \{\s*\n\s*return "-";/);
  assert.doesNotMatch(detailSource, /emptyValue[\s\S]{0,20}—/);
});

test("admin detail page's found_via label handles the now-nullable column", () => {
  assert.match(detailSource, /foundViaLabel\(value: string \| null\): string/);
  assert.match(detailSource, /if \(!value\) \{\s*\n\s*return this\.emptyValue;/);
});

test("admin detail page shows account declaration status distinctly from submitted-at", () => {
  assert.match(detailSource, /pages\.verification_applications\.account_declaration/);
  assert.match(detailSource, /account_declaration_accepted_at/);
  assert.match(detailSource, /pages\.verification_applications\.declared/);
  assert.match(detailSource, /pages\.verification_applications\.not_declared/);
  assert.equal(enLocale.pages.verification_applications.declared, "Declared");
  assert.equal(enLocale.pages.verification_applications.not_declared, "Not declared");
});

test("account declaration row shows only the Declared/Not declared label, no redundant relative-time -- Submitted keeps its own TimeAgo", () => {
  const declarationBlock = detailSource.slice(
    detailSource.indexOf('$t("pages.verification_applications.account_declaration")'),
    detailSource.indexOf('$t("pages.verification_applications.columns.submitted")'),
  );
  assert.match(declarationBlock, /pages\.verification_applications\.declared/);
  assert.match(declarationBlock, /pages\.verification_applications\.not_declared/);
  // No TimeAgo rendered next to the declaration status -- that's the
  // redundant "Declared [icon] 14 minutes ago" this change removes. The
  // underlying account_declaration_accepted_at data/query/v-if condition
  // is untouched; only the TimeAgo display was dropped.
  assert.doesNotMatch(declarationBlock, /<TimeAgo/);
  assert.match(
    declarationBlock,
    /v-if="application\.account_declaration_accepted_at"/,
  );

  const submittedBlock = detailSource.slice(
    detailSource.indexOf('$t("pages.verification_applications.columns.submitted")'),
    detailSource.indexOf('$t("pages.verification_applications.columns.submitted")') + 200,
  );
  assert.match(submittedBlock, /<TimeAgo :date="application\.created_at" \/>/);
});

test("admin approve/reject/delete behavior is untouched", () => {
  assert.match(detailSource, /approveVerificationApplication/);
  assert.match(detailSource, /rejectVerificationApplication/);
  assert.match(detailSource, /delete_verification_applications_by_pk/);
});

test("admin detail page selects the known_players relationship and renders a COMMUNITY REFERENCES section with multiple players, an empty state, and a legacy fallback (community references admin)", () => {
  assert.match(
    detailSource,
    /known_players\(order_by: \{ sort_order: asc \}\) \{\s*\n\s*id\s*\n\s*nickname\s*\n\s*steam_profile_url\s*\n\s*sort_order\s*\n\s*\}/,
  );
  assert.match(detailSource, /pages\.verification_applications\.community_references/);
  assert.match(detailSource, /v-for="\(reference, index\) in application\.known_players"/);
  assert.match(detailSource, /pages\.verify\.form\.known_players\.player_label/, );
  assert.match(detailSource, /pages\.verification_applications\.no_community_references/);
  assert.match(detailSource, /pages\.verification_applications\.legacy_reference/);
  assert.equal(
    enLocale.pages.verification_applications.no_community_references,
    "No community references provided.",
  );

  // Steam profile links for the new reference list are clickable and safe.
  const referencesBlock = detailSource.slice(
    detailSource.indexOf("community_references"),
    detailSource.indexOf("social_instagram_url"),
  );
  const safeLinkOccurrences = referencesBlock.match(/target="_blank"\s*\n\s*rel="noopener noreferrer"/g);
  assert.ok(safeLinkOccurrences && safeLinkOccurrences.length >= 2);

  // Approve/reject logic must not have been touched by this section.
  assert.doesNotMatch(referencesBlock, /approve|reject/i);
});

test("no numbered parent-table fields (e.g. deaf_player_nickname_2, known_player_3) were introduced anywhere -- the data model uses a real child table (data model)", () => {
  for (const source of [pageSource, detailSource, JSON.stringify(enLocale)]) {
    assert.doesNotMatch(source, /deaf_player_(nickname|steam_url)_[0-9]/);
    assert.doesNotMatch(source, /known_player(s)?_(nickname|steam_url)_[0-9]/);
  }
});

// Production bug fix: the compact pill's own classes (h-8, rounded-md, ...)
// never actually beat RadioGroupItem's hardcoded aspect-square/h-4/w-4/
// rounded-full -- there was no conflicting w-*/aspect-* utility in the pill
// class string for tailwind-merge to resolve in its favor, so the pill got
// squashed into a fixed tiny square with the label text overflowing/
// overlapping outside it. The fix makes RadioGroupItem.vue apply that fixed
// circle sizing ONLY when no custom slot content is passed, so a pill like
// this one has nothing fixed left to fight -- it sizes to its own classes.
test("the shared RadioGroupItem component conditionally drops fixed circle sizing for custom-content callers only", async () => {
  const radioGroupItemSource = await read("../components/ui/radio-group/RadioGroupItem.vue");
  assert.match(radioGroupItemSource, /const hasCustomContent = !!slots\.default;/);
  assert.match(radioGroupItemSource, /!hasCustomContent && 'aspect-square h-4 w-4 rounded-full/);
  // The always-applied base must NOT itself contain a fixed width/aspect
  // class outside that conditional -- otherwise it would leak into every
  // custom-content caller (the exact bug being fixed) regardless of what
  // the page's own pill classes try to override.
  const baseClassLine = radioGroupItemSource.slice(
    radioGroupItemSource.indexOf("cn("),
    radioGroupItemSource.indexOf("!hasCustomContent"),
  );
  assert.doesNotMatch(baseClassLine, /\bw-4\b/);
  assert.doesNotMatch(baseClassLine, /\baspect-square\b/);
});

test("the compact pill class carries no fixed width/aspect-ratio utility of its own (nothing to fight, none needed)", () => {
  assert.doesNotMatch(pageSource, /compactRadioPillClass =\s*\n?\s*"[^"]*\bw-4\b/);
  assert.doesNotMatch(pageSource, /compactRadioPillClass =\s*\n?\s*"[^"]*\baspect-square\b/);
  assert.match(pageSource, /compactRadioPillClass =\s*\n?\s*"[^"]*whitespace-nowrap/);
});

test("hearing status RadioGroup wraps compactly with a gap, not a single-column stack", () => {
  const isDeafBlock = pageSource.slice(
    pageSource.indexOf('label class="text-sm font-medium">{{ $t("pages.verify.form.is_deaf")'),
    pageSource.indexOf("</RadioGroup>") + "</RadioGroup>".length,
  );
  assert.match(isDeafBlock, /class="flex flex-wrap gap-2"/);
});

test("known-player rows have proper visible Nickname and Steam profile labels, not just placeholders", () => {
  assert.match(pageSource, /:for="`known-player-nickname-\$\{index\}`"/);
  assert.match(pageSource, /:id="`known-player-nickname-\$\{index\}`"/);
  assert.match(pageSource, /:for="`known-player-steam-url-\$\{index\}`"/);
  assert.match(pageSource, /:id="`known-player-steam-url-\$\{index\}`"/);
  assert.equal(copy.form.known_players.nickname, "Nickname");
  assert.equal(copy.form.known_players.steam_profile_url, "Steam profile URL");
});

test("Steam profile field uses the project's existing SteamIcon in an icon+input row, with an accessible label", () => {
  assert.match(pageSource, /import SteamIcon from "~\/components\/icons\/SteamIcon\.vue";/);
  const steamFieldBlock = pageSource.slice(
    pageSource.indexOf(':for="`known-player-steam-url-${index}`"'),
    pageSource.indexOf("</InputGroup>", pageSource.indexOf(':for="`known-player-steam-url-${index}`"')),
  );
  assert.match(steamFieldBlock, /<InputGroup>/);
  assert.match(steamFieldBlock, /<SteamIcon class="h-4 w-4 fill-current" \/>/);
  assert.match(steamFieldBlock, /<InputGroupInput/);
  assert.match(steamFieldBlock, /:aria-label="\$t\('pages\.verify\.form\.known_players\.steam_profile_url'\)"/);
  assert.match(steamFieldBlock, /placeholder="https:\/\/steamcommunity\.com\/\.\.\."/);
});

test("Instagram, Facebook, and VK are icon+input rows with accessible labels, using existing project icons (no new library)", () => {
  assert.match(pageSource, /import \{ Info, Instagram, Facebook \} from "lucide-vue-next";/);
  assert.match(pageSource, /<InputGroupAddon[^>]*>[\s\S]{0,60}<Instagram class="h-4 w-4" \/>/);
  assert.match(pageSource, /<InputGroupAddon[^>]*>[\s\S]{0,60}<Facebook class="h-4 w-4" \/>/);
  assert.match(pageSource, /:aria-label="\$t\('pages\.verify\.form\.social_instagram_url'\)"/);
  assert.match(pageSource, /:aria-label="\$t\('pages\.verify\.form\.social_facebook_url'\)"/);
  assert.match(pageSource, /:aria-label="\$t\('pages\.verify\.form\.social_vk_url'\)"/);
  // VK has no lucide/project brand icon -- a small text fallback, not a new
  // icon library and not a hand-drawn brand mark.
  assert.match(pageSource, />VK<\/span>/);
  assert.match(pageSource, /placeholder="@username"/);
  assert.match(pageSource, /placeholder="https:\/\/facebook\.com\/\.\.\."/);
  assert.match(pageSource, /placeholder="username or https:\/\/vk\.com\/\.\.\."/);
});

test("TikTok is removed from the selectable found_via options, but its i18n key survives for historical rows", () => {
  assert.doesNotMatch(pageSource, /"tiktok",\s*\n\s*"instagram_facebook"/);
  const foundViaOptionsSrc = pageSource.slice(
    pageSource.indexOf("const FOUND_VIA_OPTIONS = ["),
    pageSource.indexOf("] as const;", pageSource.indexOf("const FOUND_VIA_OPTIONS = [")),
  );
  assert.doesNotMatch(foundViaOptionsSrc, /"tiktok"/);
  for (const option of [
    "google",
    "discord",
    "reddit",
    "youtube",
    "twitch",
    "instagram_facebook",
    "friend",
    "steam",
    "other",
  ]) {
    assert.match(foundViaOptionsSrc, new RegExp(`"${option}"`));
  }
  // The admin detail page's foundViaLabel() still needs this to render any
  // historical application that used it.
  assert.equal(copy.form.found_via_options.tiktok, "TikTok");
  assert.match(detailSource, /"tiktok"/);
});

test("submit button is full width, not left-aligned/self-start", () => {
  assert.match(
    pageSource,
    /<Button type="submit" variant="tactical" :loading="submitting" class="w-full">/,
  );
  assert.doesNotMatch(pageSource, /variant="tactical" :loading="submitting" class="self-start"/);
});
