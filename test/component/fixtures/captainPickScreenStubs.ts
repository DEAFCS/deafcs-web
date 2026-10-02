import { defineComponent, h } from "vue";

// Stand-ins for the Draft Games pieces the Captain Pick screen is built
// from (see captain-pick-screen.spec.ts), which pull in stores and GraphQL.
export const TeamPanel = defineComponent({
  name: "DraftTeamPanel",
  props: {
    title: null,
    players: null,
    perTeam: null,
    active: Boolean,
    accent: null,
    matchType: null,
    eloType: null,
    profileInNewTab: Boolean,
    linkable: Boolean,
    showRole: Boolean,
    captainSteamId: null,
    checkInBySteamId: null,
  },
  setup(props) {
    return () =>
      h("div", { "data-stub": "team" }, [
        h("span", { class: "title" }, props.title),
        ...props.players.map((p: any) =>
          h(
            "span",
            {
              class: "member",
              "data-steam": p.steam_id,
              "data-country": p.player.country ?? "",
            },
            p.player.name,
          ),
        ),
      ]);
  },
});
// Like the real card: the name only links when explicitly made linkable.
export const PlayerCard = defineComponent({
  name: "DraftPlayerCard",
  props: {
    member: null,
    accent: null,
    matchType: null,
    eloType: null,
    profileInNewTab: Boolean,
    linkable: Boolean,
    showRole: Boolean,
  },
  setup(props, { slots }) {
    return () =>
      h("div", { class: "card" }, [
        h(
          props.linkable ? "a" : "span",
          {
            class: "profile",
            href: `/players/${props.member.steam_id}`,
            target: props.profileInNewTab ? "_blank" : undefined,
            onClick: (event: Event) => event.preventDefault(),
          },
          props.member.player.name,
        ),
        h("span", { class: "body" }, "card body"),
        slots.action?.(),
      ]);
  },
});
export const TurnStatus = defineComponent({
  name: "DraftTurnStatus",
  props: ["deadline", "total", "accent", "isMine", "timeline"],
  setup(_props, { slots }) {
    return () => h("div", { "data-stub": "turn" }, slots.status?.());
  },
});
export const Log = defineComponent({
  name: "DraftLog",
  props: { picks: null, showAutoPickLabel: Boolean },
  setup() {
    return () => h("div", { "data-stub": "log" });
  },
});
export const Chat = defineComponent({
  name: "CaptainPickChat",
  props: ["draftId", "myLineup"],
  setup() {
    return () => h("div", { "data-stub": "chat" });
  },
});
export const Filters = defineComponent({
  name: "AnimatedFilters",
  props: ["modelValue", "options"],
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return () =>
      h(
        "div",
        props.options.map((option: any) =>
          h(
            "button",
            {
              type: "button",
              "data-source": option.key,
              onClick: () => emit("update:modelValue", option.key),
            },
            option.label,
          ),
        ),
      );
  },
});
export const ButtonStub = defineComponent({
  name: "Button",
  setup(_props, { slots }) {
    return () => h("button", { type: "button" }, slots.default?.());
  },
});
