import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { flushPromises, mount } from "@vue/test-utils";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import ReplyTemplatesDialog from "../../components/verification/ReplyTemplatesDialog.vue";

vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));

const ME = "76561190000000001";
const pass = { template: "<div><slot /></div>" };

const mountDialog = (saved: Array<{ slot: number; title: string; body: string }>) => {
  const $apollo = {
    query: vi.fn().mockResolvedValue({ data: { admin_reply_templates: saved } }),
    mutate: vi.fn().mockResolvedValue({}),
  };
  const wrapper = mount(ReplyTemplatesDialog, {
    props: { open: true },
    global: {
      config: {
        globalProperties: {
          $apollo,
          $t: (key: string, fallback?: string) => (typeof fallback === "string" ? fallback : key),
        } as any,
      },
      stubs: {
        Dialog: pass,
        DialogContent: pass,
        DialogTitle: pass,
        DialogDescription: pass,
      },
    },
  });
  return { wrapper, $apollo };
};

const buttonWithText = (wrapper: any, text: string) =>
  wrapper.findAll("button").find((b: any) => b.text() === text);

describe("ReplyTemplatesDialog", () => {
  beforeEach(() => {
    vi.stubGlobal("ref", ref);
    vi.stubGlobal("watch", watch);
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("onMounted", onMounted);
    vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
    vi.stubGlobal("useAuthStore", () => ({ me: { steam_id: ME } }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("loads the caller's texts and always shows five slots", async () => {
    const { wrapper, $apollo } = mountDialog([
      { slot: 1, title: "Webcam", body: "Please join a short webcam call." },
      { slot: 3, title: "", body: "Third text" },
    ]);
    await flushPromises();

    expect($apollo.query).toHaveBeenCalledTimes(1);
    const options = wrapper.findAll("[role=option]");
    expect(options).toHaveLength(5);
    expect(options[0].text()).toContain("Webcam");
    // No title: the start of the text is shown instead.
    expect(options[2].text()).toContain("Third text");
    expect(options[1].text()).toContain("Empty slot");
  });

  it("shows the selected text in full and inserts exactly that text", async () => {
    const body = "Hi,\n\nPlease join a short webcam call.";
    const { wrapper } = mountDialog([{ slot: 1, title: "Webcam", body }]);
    await flushPromises();

    expect(wrapper.text()).toContain("Please join a short webcam call.");
    await buttonWithText(wrapper, "Insert")!.trigger("click");

    expect(wrapper.emitted("insert")).toEqual([[body]]);
    expect(wrapper.emitted("update:open")?.at(-1)).toEqual([false]);
  });

  it("cannot insert from an empty slot", async () => {
    const { wrapper } = mountDialog([{ slot: 1, title: "A", body: "Text" }]);
    await flushPromises();

    await wrapper.findAll("[role=option]")[1].trigger("click");
    expect(buttonWithText(wrapper, "Insert")!.attributes("disabled")).toBeDefined();
    expect(wrapper.emitted("insert")).toBeUndefined();
  });

  it("saves an edited slot with an upsert and shows it", async () => {
    const { wrapper, $apollo } = mountDialog([]);
    await flushPromises();

    await wrapper.findAll("[role=option]")[1].trigger("click");
    await buttonWithText(wrapper, "Edit")!.trigger("click");
    await wrapper.get("input").setValue("  Needs webcam  ");
    await wrapper.get("textarea").setValue("  Please join a call.  ");
    await buttonWithText(wrapper, "common.save")!.trigger("click");
    await flushPromises();

    const call = $apollo.mutate.mock.calls[0][0];
    expect(call.variables).toEqual({ slot: 2, title: "Needs webcam", body: "Please join a call." });
    expect(JSON.stringify(call.mutation)).toContain("admin_reply_templates_pkey");
    expect(wrapper.findAll("[role=option]")[1].text()).toContain("Needs webcam");
  });

  it("clears a slot (delete) when its text is emptied", async () => {
    const { wrapper, $apollo } = mountDialog([{ slot: 1, title: "A", body: "Text" }]);
    await flushPromises();

    await buttonWithText(wrapper, "Edit")!.trigger("click");
    await wrapper.get("textarea").setValue("   ");
    await buttonWithText(wrapper, "common.save")!.trigger("click");
    await flushPromises();

    expect($apollo.mutate.mock.calls[0][0].variables).toEqual({ owner: ME, slot: 1 });
    expect(wrapper.findAll("[role=option]")[0].text()).toContain("Empty slot");
  });

  it("reloads from the database each time it is opened", async () => {
    const { wrapper, $apollo } = mountDialog([]);
    await flushPromises();
    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });
    await nextTick();
    expect($apollo.query).toHaveBeenCalledTimes(2);
  });
});

describe("verification application page wiring", () => {
  const page = readFileSync(
    path.resolve(__dirname, "../../pages/verification-applications/[id].vue"),
    "utf8",
  );

  // The page's real method, evaluated against a plain context.
  const insertTemplate = (reply: string, text: string) => {
    const match = page.match(/insertTemplate\(text: string\) \{([\s\S]*?)\n    \},/);
    expect(match).toBeTruthy();
    const body = match![1].replace(/: string/g, "");
    const ctx: any = { reply };
    new Function("text", body).call(ctx, text);
    return ctx.reply;
  };

  it("puts the text in an empty box", () => {
    expect(insertTemplate("", "Saved text")).toBe("Saved text");
    expect(insertTemplate("   \n", "Saved text")).toBe("Saved text");
  });

  it("keeps what was already typed and adds the text on a new line", () => {
    expect(insertTemplate("Hi Neo,", "Saved text")).toBe("Hi Neo,\nSaved text");
  });

  it("opens the dialog from the reply form and fills the reply box", () => {
    expect(page).toContain('<ReplyTemplatesDialog v-model:open="templatesOpen" @insert="insertTemplate" />');
    expect(page).toContain('@click="templatesOpen = true"');
  });
});
