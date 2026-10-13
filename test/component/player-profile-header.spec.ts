import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { compile, defineComponent, h } from "vue";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parse } from "@vue/compiler-sfc";
import PlayerHeroActions from "../../components/player/PlayerHeroActions.vue";
import { TooltipProvider } from "../../components/ui/tooltip";
import PlayerTwitchLink from "../../components/player/PlayerTwitchLink.vue";
import en from "../../i18n/locales/en.json";

const t = (key: string, args: Record<string, unknown> = {}) => {
  const value =
    key.split(".").reduce((obj: any, part) => obj?.[part], en) ?? key;
  return String(value).replace(/\{(\w+)\}/g, (_, name) =>
    String(args[name] ?? `{${name}}`),
  );
};
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t }) }));
const source = fs.readFileSync(path.resolve("pages/players/[id].vue"), "utf8");
const script = parse(source).descriptor.script!.content;
const ast = ts.createSourceFile(
  "profile.ts",
  script,
  ts.ScriptTarget.Latest,
  true,
);
const options = (
  ast.statements.find(ts.isExportAssignment) as ts.ExportAssignment
).expression as ts.ObjectLiteralExpression;
// Exercise the page's actual Options methods without mounting its unrelated
// statistics/Apollo page. This also tests the permissions that build the menu.
function pageMethod(
  section: string,
  name: string,
  dependencies: Record<string, unknown> = {},
) {
  const group = options.properties.find(
    (p) => p.name?.getText(ast) === section,
  ) as ts.PropertyAssignment;
  const method = (
    group.initializer as ts.ObjectLiteralExpression
  ).properties.find((p) => p.name?.getText(ast) === name)!;
  const javascript = ts.transpileModule(`return ({${method.getText(ast)}});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function(...Object.keys(dependencies), javascript)(
    ...Object.values(dependencies),
  )[name];
}
let wrapper: VueWrapper | undefined;
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});
const defaults = {
  actions: [],
  relationship: "none",
  canAddFriend: true,
  canMessage: true,
  isBlocked: false,
  isSelf: false,
  pending: false,
};
function actions(props = {}, stubs = {}) {
  wrapper = mount(
    defineComponent({
      render: () =>
        h(
          TooltipProvider,
          {},
          { default: () => h(PlayerHeroActions, { ...defaults, ...props }) },
        ),
    }),
    {
      attachTo: document.body,
      global: { mocks: { $t: t }, stubs },
    },
  );
  return wrapper;
}
const iconDeps = Object.fromEntries(
  ["Pencil", "UserX", "UserCheck", "Ban", "Video"].map((key) => [key, key]),
);
function profile(overrides: Record<string, unknown> = {}) {
  return {
    me: { steam_id: "1" },
    player: { steam_id: "2", name: "A very long player name" },
    isSelfProfile: false,
    isFriend: false,
    isBlockedByMe: false,
    peerAllowsMessageRequests: true,
    ...overrides,
  };
}
describe("upstream compact profile actions", () => {
  it("adds a friend from an accessible compact icon", async () => {
    const w = actions();
    const add = w.get('button[aria-label="Add as friend"]');
    expect(add.classes()).toContain("w-9");
    await add.trigger("click");
    expect(w.findComponent(PlayerHeroActions).emitted("add")).toHaveLength(1);
  });
  it.each([
    ["incoming", "Accept", "accept"],
    ["outgoing", "Cancel Request", "cancel"],
  ])(
    "%s uses the existing friend event",
    async (relationship, label, event) => {
      const w = actions({ relationship, canAddFriend: false });
      await w.get(`button[aria-label="${label}"]`).trigger("click");
      expect(w.findComponent(PlayerHeroActions).emitted(event)).toHaveLength(1);
    },
  );
  it("disables mutations in flight", async () => {
    const w = actions({ pending: true });
    await w.get('button[aria-label="Add as friend"]').trigger("click");
    expect(w.findComponent(PlayerHeroActions).emitted("add")).toBeUndefined();
  });
  it("own and guest profiles do not show relationship or messaging controls", () => {
    expect(
      actions({ isSelf: true, canAddFriend: false, canMessage: false }).findAll(
        "button",
      ),
    ).toHaveLength(0);
  });
  it("blocked state hides adding and disables Message with guidance", async () => {
    const w = actions({
      isBlocked: true,
      canMessage: false,
      showMessage: true,
      messageLabel: "Blocked",
    });
    expect(w.find('button[aria-label="Add as friend"]').exists()).toBe(false);
    const message = w.get('button[aria-label="Blocked"]');
    expect(message.attributes("title")).toBe("Blocked");
    await message.trigger("click");
    expect(
      w.findComponent(PlayerHeroActions).emitted("message"),
    ).toBeUndefined();
  });
  it("pending Message still opens the existing read-only conversation", async () => {
    const w = actions({
      canAddFriend: false,
      messageLabel: "Waiting for a reply",
    });
    await w.get('button[aria-label="Waiting for a reply"]').trigger("click");
    expect(w.findComponent(PlayerHeroActions).emitted("message")).toHaveLength(
      1,
    );
  });
  it("a single secondary action runs directly with its busy guard", async () => {
    const run = vi.fn();
    const w = actions({
      isSelf: true,
      actions: [{ key: "edit", label: "Edit Profile", run, busy: false }],
    });
    await w.get('button[aria-label="Edit Profile"]').trigger("click");
    expect(run).toHaveBeenCalledOnce();
  });
  it("groups multiple secondary actions in the upstream dropdown", async () => {
    const run = vi.fn();
    const passthrough = defineComponent({ template: "<div><slot /></div>" });
    const w = actions(
      {
        actions: [
          { key: "remove", label: "Remove friend", run },
          { key: "block", label: "Block player", run: vi.fn() },
        ],
      },
      {
        DropdownMenu: passthrough,
        DropdownMenuContent: passthrough,
        DropdownMenuItem: defineComponent({
          template: "<button><slot /></button>",
        }),
        DropdownMenuTrigger: passthrough,
      },
    );
    expect(w.get('button[aria-label="More actions"]').exists()).toBe(true);
    await w
      .findAll("button")
      .find((button) => button.text() === "Remove friend")!
      .trigger("click");
    expect(run).toHaveBeenCalledOnce();
  });
});
describe("profile Message Requests state uses the committed policy", () => {
  it.each([
    ["opt-in", {}, false, false, true],
    ["opt-out", { peerAllowsMessageRequests: false }, false, false, false],
    [
      "friend opt-out",
      { peerAllowsMessageRequests: false, isFriend: true },
      false,
      false,
      true,
    ],
    [
      "accepted opt-out",
      { peerAllowsMessageRequests: false },
      true,
      false,
      true,
    ],
    [
      "incoming pending after opt-out",
      { peerAllowsMessageRequests: false },
      false,
      true,
      true,
    ],
    ["blocked accepted", { isBlockedByMe: true }, true, false, false],
    ["self", { isSelfProfile: true }, false, false, false],
    ["guest", { me: null }, false, false, false],
  ])("%s", (_, overrides, conversation, request, expected) => {
    const policy = {
      hasConversation: vi.fn(() => conversation),
      isRequest: vi.fn(() => request),
    };
    const fn = pageMethod("computed", "canMessagePlayer", {
      useMessageRequests: () => policy,
      directChatId: () => "1:2",
    });
    expect(fn.call(profile(overrides))).toBe(expected);
  });
  it.each([
    [false, false, "Message"],
    [
      true,
      false,
      "Waiting for A very long player name to reply to your message request.",
    ],
    [
      false,
      true,
      "A very long player name isn't your friend. Reply to accept their message request, or deny it.",
    ],
  ])(
    "provides guidance from authoritative request state",
    (awaiting, incoming, label) => {
      const fn = pageMethod("computed", "profileMessageLabel", {
        useMessageRequests: () => ({
          isAwaitingReply: () => awaiting,
          isRequest: () => incoming,
        }),
        directChatId: () => "1:2",
      });
      expect(fn.call(profile({ canMessagePlayer: true, $t: t }))).toBe(label);
    },
  );
  it("disabled Message cannot dispatch a conversation", () => {
    const openDirectMessage = vi.fn();
    const fn = pageMethod("methods", "messagePlayer", { openDirectMessage });
    fn.call(profile({ canMessagePlayer: false }));
    expect(openDirectMessage).not.toHaveBeenCalled();
    fn.call(profile({ canMessagePlayer: true }));
    expect(openDirectMessage).toHaveBeenCalledWith(profile().player);
  });
});
describe("profile authorization and preserved DEAFCS integrations", () => {
  const build = pageMethod("computed", "heroActions", iconDeps);
  it.each([false, true])(
    "webcam action is Administrator-only: %s",
    (isAdmin) => {
      const rows = build.call(
        profile({
          isAdmin,
          canOpenEditPlayer: isAdmin,
          canShowBlockAction: true,
          $t: t,
        }),
      );
      expect(rows.some((row: any) => row.key === "webcam")).toBe(isAdmin);
      expect(rows.some((row: any) => row.key === "edit")).toBe(isAdmin);
    },
  );
  it("self-profile offers edit without block or webcam", () => {
    const rows = build.call(
      profile({
        isAdmin: true,
        isSelfProfile: true,
        canOpenEditPlayer: true,
        canShowBlockAction: false,
        $t: t,
      }),
    );
    expect(rows.map((row: any) => row.key)).toEqual(["edit"]);
  });
  it("friend removal and block/unblock reuse the original handlers", () => {
    const removeFriendClick = vi.fn(),
      requestBlockPlayer = vi.fn(),
      unblockPlayerClick = vi.fn();
    const ctx = profile({
      isFriend: true,
      canShowBlockAction: true,
      removeFriendClick,
      requestBlockPlayer,
      unblockPlayerClick,
      $t: t,
    });
    const rows = build.call(ctx);
    rows.find((r: any) => r.key === "remove").run();
    rows.find((r: any) => r.key === "block").run();
    expect(removeFriendClick).toHaveBeenCalledOnce();
    expect(requestBlockPlayer).toHaveBeenCalledOnce();
    build
      .call({ ...ctx, isBlockedByMe: true })
      .find((r: any) => r.key === "block")
      .run();
    expect(unblockPlayerClick).toHaveBeenCalledOnce();
  });
  it("webcam method refuses unauthorized and own-profile calls before ringing", async () => {
    const ringAdminCallPlayer = vi.fn();
    const fn = pageMethod("methods", "startAdminCall", { ringAdminCallPlayer });
    await fn.call(profile({ isAdmin: false }));
    await fn.call(profile({ isAdmin: true, isSelfProfile: true }));
    expect(ringAdminCallPlayer).not.toHaveBeenCalled();
  });
  it("Twitch uses its original validated URL and accessible label", () => {
    wrapper = mount(PlayerTwitchLink, {
      props: { channel: "tricoN", live: false },
      global: { mocks: { $t: t } },
    });
    expect(wrapper.get("a").attributes("href")).toBe(
      "https://www.twitch.tv/tricoN",
    );
    expect(wrapper.get("a").attributes("aria-label")).toBeTruthy();
  });
  it("Twitch is absent without a channel", () => {
    wrapper = mount(PlayerTwitchLink, { props: { channel: null } });
    expect(wrapper.find("a").exists()).toBe(false);
  });
  it("keeps the upstream mobile grid, wrapping and balanced footer", () => {
    expect(source).toContain("max-md:grid-cols-[auto_minmax(0,1fr)]");
    expect(source).toContain("[overflow-wrap:anywhere]");
    expect(source).toContain("max-md:col-span-2");
    expect(source).toContain("mt-auto flex flex-col gap-4 pt-5");
    expect(source).not.toContain("playerHeroActionsRowLeftClasses");
  });
  it("preserves country, team, sanction and Steam data; Twitch follows Steam", () => {
    const header = source.slice(
      source.indexOf('<header :class="playerHeroClasses">'),
      source.indexOf("</header>"),
    );
    for (const field of [
      "playerAvatarSrc",
      "player.name",
      "player.country",
      "player.steam_id",
      "player.profile_url",
      "player.teams",
      "SanctionStatusBadge",
      "PlayerSanctions",
      "recentForm",
    ])
      expect(header).toContain(field);
    expect(header.match(/<SteamIcon/g)).toHaveLength(1);
    expect(header.match(/<PlayerTwitchLink/g)).toHaveLength(1);
    expect(header).toMatch(
      /<SteamIcon[^]*?<\/a>\s*<\/template>\s*<PlayerTwitchLink/,
    );
    expect(header).toContain(
      ":aria-label=\"$t('ui.tooltips.view_steam_profile')\"",
    );
  });
  it("preserves every DEAFCS ELO mode rather than porting upstream data queries", () => {
    for (const mode of ["Competitive", "Wingman", "Duel"])
      expect(source).toContain(mode);
  });
  it("renders actual header identity, social links and recent form for a long name", () => {
    const setupSource = parse(source).descriptor.scriptSetup!.content;
    const constants = setupSource.slice(
      setupSource.indexOf("const playerHeroClasses ="),
    );
    const names = [...constants.matchAll(/const (playerHero\w+) =/g)].map(
      (match) => match[1],
    );
    const styles = new Function(`${constants}; return {${names.join(",")}};`)();
    const header = source.slice(
      source.indexOf('<header :class="playerHeroClasses">'),
      source.indexOf("</header>") + 9,
    );
    const player = {
      steam_id: "76561198000000000",
      name: "A long player name that must wrap safely on mobile",
      country: "DK",
      role: "user",
      profile_url: "https://steamcommunity.com/profiles/76561198000000000",
      teams: [{ id: "team-1", short_name: "TEST", name: "Test Team" }],
    };
    wrapper = mount(
      defineComponent({
        render: compile(header),
        setup: () => ({
          ...styles,
          player,
          playerId: player.steam_id,
          playerAvatarSrc: null,
          activeSanctionType: null,
          showNameGhost: false,
          playerHeroNameSizeClasses: "text-xl",
          twitch: { channel: "tricon", live: false },
          canEditRole: false,
          recentForm: {
            wins: 3,
            losses: 2,
            net: 25,
            dots: [{ key: "one", result: "win" }],
          },
          RECENT_FORM_COUNT: 12,
          isSelfProfile: false,
          heroActionsBind: {},
          addAsFriend: vi.fn(),
          acceptFriendRequest: vi.fn(),
          cancelRequestClick: vi.fn(),
          messagePlayer: vi.fn(),
        }),
      }),
      {
        global: {
          mocks: { $t: t },
          components: { PlayerTwitchLink },
          stubs: {
            PlayerHeroActions: true,
          SteamIcon: true,
          PlayIcon: true,
            TimezoneFlag: true,
            PlayerRoleForm: true,
            PlayerSanctions: true,
            SanctionStatusBadge: true,
            NuxtLink: defineComponent({
              props: ["to"],
              template: '<a :href="to"><slot /></a>',
            }),
          },
        },
      },
    );
    expect(wrapper.get("h1").text()).toBe(player.name);
    expect(wrapper.text()).toContain(player.steam_id);
    expect(wrapper.text()).toContain("TEST");
    expect(
      wrapper.get(`a[href="${player.profile_url}"]`).attributes("aria-label"),
    ).toBeTruthy();
    expect(
      wrapper.get('[data-testid="player-twitch-link"]').attributes("href"),
    ).toBe("https://www.twitch.tv/tricon");
    expect(wrapper.text()).toContain("3–2");
    expect(wrapper.text()).toContain("25");
    expect(wrapper.text()).not.toContain("player_roles.");
  });
});
