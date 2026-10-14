import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { ref, reactive, nextTick, defineComponent, h } from "vue";
import en from "../../i18n/locales/en.json";
import fs from "node:fs";
const state = vi.hoisted(() => ({
  mobile: null as any,
  restricted: null as any,
}));
vi.mock("@vueuse/core", async (original) => ({
  ...(await original<typeof import("@vueuse/core")>()),
  useMediaQuery: (query: string) => {
    expect(query).toBe("(max-width: 768px)");
    return state.mobile;
  },
}));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("vee-validate", async (original) => ({
  ...(await original<typeof import("vee-validate")>()),
  useForm: () => ({
    values: { message: "" },
    handleSubmit: (fn: Function) => fn,
    resetForm: vi.fn(),
  }),
}));
vi.mock("~/components/ui/form", async () => {
  const { defineComponent } = await import("vue");
  const Slot = (name: string) =>
    defineComponent({ name, template: "<div><slot /></div>" });
  return {
    FormControl: Slot("FormControl"),
    FormItem: Slot("FormItem"),
    FormField: defineComponent({
      name: "FormField",
      template: '<div><slot :component-field="{}" /></div>',
    }),
  };
});
import ChatInput from "../../components/chat/ChatInput.vue";
const t = (key: string, fallback?: string) =>
  key.split(".").reduce((obj: any, p) => obj?.[p], en) ?? fallback ?? key;
let wrapper: VueWrapper | undefined;
beforeEach(() => {
  state.mobile = ref(false);
  state.restricted = reactive({ isRestricted: false });
  vi.stubGlobal("useWebsiteRestrictionStore", () => state.restricted);
});
afterEach(() => {
  wrapper?.unmount();
  vi.unstubAllGlobals();
});
function composer(variant: string, placeholder?: string) {
  const Host = defineComponent({
    render: () =>
      h("div", [
        h(ChatInput, { variant, placeholder, attachmentEnabled: true }),
      ]),
  });
  wrapper = mount(Host, {
    attachTo: document.body,

    global: {
      mocks: { $t: t },
      stubs: {
        Textarea: false,
        ChatComposerMenu: {
          template:
            '<button type="button" class="h-8 w-8 shrink-0" aria-label="Add to your message">+</button>',
        },
        Button: { template: '<button type="submit" class="size-8"><slot /></button>' },
        ChatVideoComposer: true,
      },
    },
  });
  return wrapper;
}
describe("mobile-only Chat Hub composer placeholder", () => {
  it.each(["global", "embedded"])(
    "keeps desktop text and switches reactively without losing a multiline draft in %s",
    async (variant) => {
      const w = composer(variant);
      const input = w.get("textarea");
      expect(input.attributes("placeholder")).toBe("Type a message...");
      expect(input.classes()).not.toContain("w-0");
      await input.setValue("First line\nSecond line");
      state.mobile.value = true;
      await nextTick();
      expect(input.attributes("placeholder")).toBe("Message...");
      expect(input.classes()).toContain("min-w-0");
      expect(input.classes()).toContain("[&::placeholder]:whitespace-nowrap");
      expect((input.element as HTMLTextAreaElement).value).toBe(
        "First line\nSecond line",
      );
      state.mobile.value = false;
      await nextTick();
      expect(input.attributes("placeholder")).toBe("Type a message...");
      expect(input.classes()).not.toContain("w-0");
      expect((input.element as HTMLTextAreaElement).value).toBe(
        "First line\nSecond line",
      );
    },
  );
  it.each(["global", "embedded"])(
    "preserves contextual placeholders and restriction copy in %s",
    async (variant) => {
      state.mobile.value = true;
      const w = composer(variant, "Message your team...");
      expect(w.get("textarea").attributes("placeholder")).toBe(
        "Message your team...",
      );
      state.restricted.isRestricted = true;
      await nextTick();
      expect(w.get("textarea").attributes("placeholder")).toBe(
        t("account_restriction.short"),
      );
      expect(w.get("textarea").attributes("disabled")).toBeDefined();
    },
  );
  it.each(["global", "embedded"])(
    "renders one mobile input between existing buttons in %s",
    (variant) => {
      state.mobile.value = true;
      const w = composer(variant);
      const input = w.get("textarea");
      expect(input.attributes("rows")).toBe("1");
      expect(
        input.element.previousElementSibling?.getAttribute("aria-label"),
      ).toBe("Add to your message");
      expect(input.element.nextElementSibling?.getAttribute("type")).toBe(
        "submit",
      );
      expect(input.classes()).toContain("flex-1");
      expect(input.classes()).toContain("w-0");
      // Synthetic rendered fixture for local CSS geometry checks. No auth/data access.
      fs.writeFileSync(
        "node_modules/.cache/message-requests-upstream/mobile-composer-" +
          variant +
          ".html",
        w.html(),
      );
    },
  );
  it("tightens only the Chat Hub composer below 375px", () => {
    state.mobile.value = true;
    const hub = composer("embedded").get("textarea");
    expect(hub.classes()).toContain("px-3");
    expect(hub.classes()).toContain("max-[374px]:px-1.5");
    expect(hub.element.parentElement?.className).toContain(
      "gap-1.5 p-2 max-[374px]:gap-1 max-[374px]:p-1.5",
    );
    wrapper?.unmount();
    const floating = composer("global").get("textarea");
    expect(floating.classes()).not.toContain("max-[374px]:px-1.5");
  });
});
