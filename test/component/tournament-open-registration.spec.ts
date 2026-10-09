import { describe, expect, it } from "vitest";
import { openRegistrationBlockedByStart } from "../../utilities/tournamentOpenRegistration";

const NOW = Date.parse("2026-10-09T12:00:00.000Z");
const base = {
  is_organizer: true,
  can_open_registration: false,
  status: "Setup",
  start: "2026-10-09T11:59:00.000Z",
};

describe("open registration blocked by the start time", () => {
  it("explains a reset tournament whose start has passed", () => {
    expect(openRegistrationBlockedByStart(base, NOW)).toBe(true);
    expect(
      openRegistrationBlockedByStart({ ...base, status: "CancelledMinTeams" }, NOW),
    ).toBe(true);
  });

  it("says nothing once the start is in the future (the backend then allows it)", () => {
    expect(
      openRegistrationBlockedByStart(
        { ...base, start: "2026-10-09T12:05:00.000Z", can_open_registration: true },
        NOW,
      ),
    ).toBe(false);
    expect(
      openRegistrationBlockedByStart({ ...base, start: "2026-10-09T12:05:00.000Z" }, NOW),
    ).toBe(false);
  });

  it("never replaces the real action, and is for organizers of reopenable states only", () => {
    expect(openRegistrationBlockedByStart({ ...base, can_open_registration: true }, NOW)).toBe(false);
    expect(openRegistrationBlockedByStart({ ...base, is_organizer: false }, NOW)).toBe(false);
    expect(openRegistrationBlockedByStart({ ...base, status: "Live" }, NOW)).toBe(false);
    expect(openRegistrationBlockedByStart(null, NOW)).toBe(false);
  });
});
