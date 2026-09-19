import { describe, it, expect } from "vitest";
import { classifyFriendRequestError } from "~/composables/useFriendActions";

// Real executed unit test (not a source-text regex scan): imports and calls
// the actual classifier addAsFriend() in pages/players/[id].vue and
// PlayerDisplay.vue both use to decide what to show the user for a rejected
// addFriend() mutation.
describe("classifyFriendRequestError", () => {
  it("classifies the block-guard trigger's exact exception text as 'blocked'", () => {
    const error = new Error(
      "GraphQL error: cannot create a friend relationship where a block exists",
    );
    expect(classifyFriendRequestError(error)).toBe("blocked");
  });

  it("classifies a differently-wrapped variant of the same message as 'blocked'", () => {
    // Hasura doesn't always wrap a raised exception identically -- this
    // asserts the classifier keys on the message content, not an exact
    // prefix/shape.
    const error = new Error(
      'Uncaught exception executing query: cannot create a friend relationship where a block exists (SQLSTATE 23514)',
    );
    expect(classifyFriendRequestError(error)).toBe("blocked");
  });

  it("still classifies a duplicate-key violation as 'duplicate' (unrelated behavior preserved)", () => {
    expect(
      classifyFriendRequestError(
        new Error(
          'Uniqueness violation. duplicate key value violates unique constraint "friends_pkey"',
        ),
      ),
    ).toBe("duplicate");
    expect(
      classifyFriendRequestError(new Error("Duplicate key error")),
    ).toBe("duplicate");
  });

  it("falls back to 'unknown' for anything else, including no message at all", () => {
    expect(classifyFriendRequestError(new Error("network error"))).toBe(
      "unknown",
    );
    expect(classifyFriendRequestError(new Error())).toBe("unknown");
    expect(classifyFriendRequestError(undefined)).toBe("unknown");
    expect(classifyFriendRequestError("not an Error instance")).toBe(
      "unknown",
    );
  });
});
