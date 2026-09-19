import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import fs from "node:fs";
import path from "node:path";
import BlockButtonArea from "./fixtures/BlockButtonArea.vue";

describe("Block Player button area (interaction contract)", () => {
  it("shows an 80/20 row: Friend button (left) and Block icon (right)", () => {
    const wrapper = mount(BlockButtonArea, {
      props: {
        isSelfProfile: false,
        friendRelationship: "none",
        isBlockedByMe: false,
      },
    });
    expect(wrapper.find('[data-testid="actions-row"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="left-column"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="right-column"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-friend"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="block-toggle"]').exists()).toBe(true);
  });

  it("does not show the Block action on your own profile", () => {
    const wrapper = mount(BlockButtonArea, {
      props: {
        isSelfProfile: true,
        friendRelationship: "none",
        isBlockedByMe: false,
      },
    });
    expect(wrapper.find('[data-testid="actions-row"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="block-toggle"]').exists()).toBe(false);
  });

  it("requires confirmation before blocking -- clicking the icon does not block immediately", async () => {
    const wrapper = mount(BlockButtonArea, {
      props: {
        isSelfProfile: false,
        friendRelationship: "friend",
        isBlockedByMe: false,
      },
    });

    await wrapper.find('[data-testid="block-toggle"]').trigger("click");

    expect(wrapper.emitted("block")).toBeUndefined();
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(true);

    await wrapper.find('[data-testid="confirm-block"]').trigger("click");
    expect(wrapper.emitted("block")).toHaveLength(1);
  });

  it("cancelling the confirmation does not block", async () => {
    const wrapper = mount(BlockButtonArea, {
      props: {
        isSelfProfile: false,
        friendRelationship: "none",
        isBlockedByMe: false,
      },
    });

    await wrapper.find('[data-testid="block-toggle"]').trigger("click");
    await wrapper.find('[data-testid="confirm-cancel"]').trigger("click");

    expect(wrapper.emitted("block")).toBeUndefined();
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(false);
  });

  it("shows a Blocked badge and disables Add Friend once blocked", () => {
    const wrapper = mount(BlockButtonArea, {
      props: {
        isSelfProfile: false,
        friendRelationship: "none",
        isBlockedByMe: true,
      },
    });
    expect(wrapper.find('[data-testid="blocked-badge"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-friend"]').exists()).toBe(false);
  });

  it("unblocking does not require confirmation and fires immediately", async () => {
    const wrapper = mount(BlockButtonArea, {
      props: {
        isSelfProfile: false,
        friendRelationship: "none",
        isBlockedByMe: true,
      },
    });

    await wrapper.find('[data-testid="block-toggle"]').trigger("click");

    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(false);
    expect(wrapper.emitted("unblock")).toHaveLength(1);
  });

  it("the block toggle's accessible label changes between Block and Unblock", () => {
    const blocked = mount(BlockButtonArea, {
      props: { isSelfProfile: false, friendRelationship: "none", isBlockedByMe: true },
    });
    const notBlocked = mount(BlockButtonArea, {
      props: { isSelfProfile: false, friendRelationship: "none", isBlockedByMe: false },
    });
    expect(blocked.find('[data-testid="block-toggle"]').attributes("aria-label")).toBe(
      "Unblock player",
    );
    expect(
      notBlocked.find('[data-testid="block-toggle"]').attributes("aria-label"),
    ).toBe("Block player");
  });

  it.each([
    ["friend", "friend-badge"],
    ["outgoing", "friend-pending"],
    ["incoming", "friend-incoming"],
  ] as const)(
    "preserves the existing friend state '%s' while the Block column is still shown",
    (relationship, testId) => {
      const wrapper = mount(BlockButtonArea, {
        props: {
          isSelfProfile: false,
          friendRelationship: relationship,
          isBlockedByMe: false,
        },
      });
      expect(wrapper.find(`[data-testid="${testId}"]`).exists()).toBe(true);
      expect(wrapper.find('[data-testid="right-column"]').exists()).toBe(true);
    },
  );
});

describe("players/[id].vue source: Block Player implementation", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../pages/players/[id].vue"),
    "utf8",
  );

  it("uses an 80/20 (flex-[4] / flex-1) split for the friend/block row", () => {
    expect(source).toContain(
      'const playerHeroActionsRowLeftClasses = "flex-[4] min-w-0";',
    );
    expect(source).toContain(
      'const playerHeroActionsRowRightClasses = "flex-1 min-w-[2.75rem]";',
    );
  });

  it("uses items-stretch so both columns share equal height, and the row fills the full available width (issue #97: a max-w cap left visible dead space)", () => {
    expect(source).toContain(
      'const playerHeroActionsRowClasses = "flex w-full items-stretch gap-2";',
    );
    expect(source).not.toMatch(/playerHeroActionsRowClasses[\s\S]{0,80}max-w-\[/);
  });

  it("gives the friend-state buttons an unconditional w-full so they actually fill the flex-[4] column on desktop (not just max-md:w-full)", () => {
    for (const name of [
      "playerHeroAddFriendClasses",
      "playerHeroFriendBadgeClasses",
      "playerHeroRemoveFriendClasses",
      "playerHeroFriendPendingClasses",
      "playerHeroFriendIncomingClasses",
    ]) {
      const declStart = source.indexOf(`const ${name} =`);
      expect(declStart).toBeGreaterThan(-1);
      const declEnd = source.indexOf(";", declStart);
      const decl = source.slice(declStart, declEnd);
      expect(decl).toMatch(/inline-flex w-full items-center/);
      expect(decl).not.toContain("max-md:w-full");
    }
  });

  it("uses the Lucide Ban icon for the (not yet blocked) Block action", () => {
    expect(source).toContain(
      '@click="isBlockedByMe ? unblockPlayerClick() : requestBlockPlayer()"',
    );
    expect(source).toContain('<Ban v-else class="h-4 w-4" />');
  });

  it("does not show the block action on your own profile (canShowBlockAction requires !isSelfProfile)", () => {
    expect(source).toMatch(
      /canShowBlockAction\(\) \{\s*return !!\(this\.me && this\.player\?\.steam_id && !this\.isSelfProfile\);/,
    );
  });

  it("block requires a confirmation dialog before calling blockPlayer", () => {
    expect(source).toContain("requestBlockPlayer()");
    // Options data property (`this.showBlockConfirm`), not a bare
    // `<script setup>` ref access -- see
    // test/player-profile-block-dialog-scope.test.mjs for why the bare/`.value`
    // form is specifically wrong here (it threw a real ReferenceError).
    expect(source).toContain("this.showBlockConfirm = true");
    expect(source).toContain("async confirmBlockPlayer()");
    // The icon click never calls blockPlayer directly -- only through the
    // confirm dialog's own button.
    expect(source).not.toMatch(/@click="isBlockedByMe[\s\S]{0,5}blockPlayer\(/);
  });

  it("unblock does not go through the confirmation dialog", () => {
    expect(source).toContain("async unblockPlayerClick()");
    const unblockMethodStart = source.indexOf("async unblockPlayerClick()");
    const unblockMethodBody = source.slice(unblockMethodStart, unblockMethodStart + 400);
    expect(unblockMethodBody).not.toContain("showBlockConfirm");
  });

  it("canAddFriend and canMessagePlayer both exclude a blocked relationship", () => {
    expect(source).toMatch(/canAddFriend\(\) \{[\s\S]*?!this\.isBlockedByMe/);
    expect(source).toMatch(/canMessagePlayer\(\) \{[\s\S]*?!this\.isBlockedByMe/);
  });
});
