import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import BlockActionFlow from "./fixtures/BlockActionFlow.vue";

// AlertDialogContent is portalled straight to document.body, which persists
// across tests in the same file -- unmount after each so a dialog left open
// by one test can't leak into the next test's document.body assertions.
let mounted: VueWrapper | null = null;
function mountFlow(props: InstanceType<typeof BlockActionFlow>["$props"]) {
  mounted = mount(BlockActionFlow, { attachTo: document.body, props });
  return mounted;
}
afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

// Exercises the REAL <AlertDialog> component (reka-ui, portalled to
// document.body) driven by the real requestBlockPlayer/confirmBlockPlayer
// click sequence from pages/players/[id].vue -- unlike the older
// BlockButtonArea fixture (a plain `<div v-if="showConfirm">` stand-in),
// this can actually catch a wiring bug between the click handler and the
// real dialog component, not just the interaction *contract*.
describe("Block action flow: real AlertDialog wiring", () => {
  it("clicking the Block icon opens the real confirmation dialog", async () => {
    const blockPlayer = vi.fn().mockResolvedValue(undefined);
    const unblockPlayer = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountFlow({
      isSelfProfile: false,
      isBlockedByMe: false,
      blockActionInFlight: false,
      blockPlayer,
      unblockPlayer,
    });

    expect(document.body.textContent).not.toContain("Block this player?");

    await wrapper.find('[data-testid="block-toggle"]').trigger("click");
    await new Promise((r) => setTimeout(r, 0));

    expect(document.body.textContent).toContain("Block this player?");
    expect(blockPlayer).not.toHaveBeenCalled();
  });

  it("confirming calls blockPlayer with the profile's steam_id and then closes the dialog", async () => {
    const blockPlayer = vi.fn().mockResolvedValue(undefined);
    const unblockPlayer = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountFlow({
      isSelfProfile: false,
      isBlockedByMe: false,
      blockActionInFlight: false,
      blockPlayer,
      unblockPlayer,
    });

    await wrapper.find('[data-testid="block-toggle"]').trigger("click");
    await new Promise((r) => setTimeout(r, 0));

    const confirmButton = document.body.querySelector(
      '[data-testid="confirm-block"]',
    ) as HTMLElement;
    expect(confirmButton).toBeTruthy();
    confirmButton.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(blockPlayer).toHaveBeenCalledTimes(1);
    expect(blockPlayer).toHaveBeenCalledWith("76561198000000001");
    expect(document.body.textContent).not.toContain("Block this player?");
  });

  it("clicking Unblock (already blocked) calls unblockPlayer directly, with no confirmation dialog", async () => {
    const blockPlayer = vi.fn().mockResolvedValue(undefined);
    const unblockPlayer = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountFlow({
      isSelfProfile: false,
      isBlockedByMe: true,
      blockActionInFlight: false,
      blockPlayer,
      unblockPlayer,
    });

    await wrapper.find('[data-testid="block-toggle"]').trigger("click");
    await new Promise((r) => setTimeout(r, 0));

    expect(unblockPlayer).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain("Block this player?");
  });

  it("the block button is disabled while an action is in flight, so a stray double-click cannot fire twice", async () => {
    const blockPlayer = vi.fn().mockResolvedValue(undefined);
    const unblockPlayer = vi.fn().mockResolvedValue(undefined);
    const wrapper = mountFlow({
      isSelfProfile: false,
      isBlockedByMe: false,
      blockActionInFlight: true,
      blockPlayer,
      unblockPlayer,
    });

    expect(
      (wrapper.find('[data-testid="block-toggle"]').element as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
