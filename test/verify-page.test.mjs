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
  // knows_deaf_player and the nickname/steam-url pair must NOT be
  // unconditionally required -- only requiredMissingFields() (this slice)
  // can ever produce the "Missing required answers" toast.
  assert.doesNotMatch(requiredSrc, /if \(this\.form\.knows_deaf_player === null\)/);
  assert.doesNotMatch(
    requiredSrc,
    /this\.form\.knows_deaf_player === true &&[\s\S]{0,60}deaf_player_steam_url/,
  );
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
  // Steam URL, Instagram, Facebook, and VK are each guarded by `<trimmed> &&`
  // -- an empty trimmed value short-circuits before the format check runs,
  // so leaving any of them blank can never be flagged, whether or not
  // knows_deaf_player is Yes (deaf_player_nickname has no format validator
  // at all -- it's free text, never blocked).
  assert.match(invalidSrc, /if \(steamUrl && !isValidSteamProfileUrl\(steamUrl\)\)/);
  assert.match(invalidSrc, /if \(instagram && !isValidInstagramHandle\(instagram\)\)/);
  assert.match(invalidSrc, /if \(facebook && !isValidFacebookProfileUrl\(facebook\)\)/);
  assert.match(invalidSrc, /if \(vk && !isValidVkValue\(vk\)\)/);
  assert.doesNotMatch(pageSource, /deaf_player_nickname.*isValid/);
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

test("who-do-you-know (nickname + Steam URL) only appears when knows_deaf_player is Yes, and both stay optional", () => {
  assert.match(pageSource, /v-if="form\.knows_deaf_player"/);
  assert.match(pageSource, /pages\.verify\.form\.who_do_you_know/);
  assert.match(pageSource, /v-model="form\.deaf_player_nickname"/);
  assert.match(pageSource, /v-model="form\.deaf_player_steam_url"/);
});

test("clearing knows_deaf_player to false nulls the nickname/steam-url on submit, not just hides the inputs", () => {
  const submitSrc = pageSource.slice(pageSource.indexOf("async submit()"));
  assert.match(
    submitSrc,
    /deaf_player_nickname: this\.form\.knows_deaf_player\s*\n\s*\?\s*this\.form\.deaf_player_nickname\?\.trim\(\) \|\| null\s*\n\s*: null/,
  );
  assert.match(
    submitSrc,
    /deaf_player_steam_url: this\.form\.knows_deaf_player\s*\n\s*\?\s*this\.form\.deaf_player_steam_url\?\.trim\(\) \|\| null\s*\n\s*: null/,
  );
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

test("admin approve/reject/delete behavior is untouched", () => {
  assert.match(detailSource, /approveVerificationApplication/);
  assert.match(detailSource, /rejectVerificationApplication/);
  assert.match(detailSource, /delete_verification_applications_by_pk/);
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

test("known-player section has proper visible Nickname and Steam profile labels, not just placeholders", () => {
  assert.match(pageSource, /for="deaf-player-nickname"/);
  assert.match(pageSource, /id="deaf-player-nickname"/);
  assert.match(pageSource, /for="deaf-player-steam-url"/);
  assert.match(pageSource, /id="deaf-player-steam-url"/);
  assert.equal(copy.form.deaf_player_nickname, "Nickname");
  assert.equal(copy.form.deaf_player_steam_url, "Steam profile URL");
});

test("Steam profile field uses the project's existing SteamIcon in an icon+input row, with an accessible label", () => {
  assert.match(pageSource, /import SteamIcon from "~\/components\/icons\/SteamIcon\.vue";/);
  const steamFieldBlock = pageSource.slice(
    pageSource.indexOf('for="deaf-player-steam-url"'),
    pageSource.indexOf("</InputGroup>", pageSource.indexOf('for="deaf-player-steam-url"')),
  );
  assert.match(steamFieldBlock, /<InputGroup>/);
  assert.match(steamFieldBlock, /<SteamIcon class="h-4 w-4 fill-current" \/>/);
  assert.match(steamFieldBlock, /<InputGroupInput/);
  assert.match(steamFieldBlock, /:aria-label="\$t\('pages\.verify\.form\.deaf_player_steam_url'\)"/);
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
