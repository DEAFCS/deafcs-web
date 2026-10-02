import { defineComponent, h } from "vue";

// PlayerDisplay's link and role contract (the real component pulls in stores
// and GraphQL): linkable renders the profile link, attrs such as target land
// on it, and showRole (default true) renders the player's role icon.
export const PlayerDisplayStub = defineComponent({
  name: "PlayerDisplay",
  inheritAttrs: false,
  props: {
    player: null,
    linkable: { type: Boolean, default: false },
    showRole: { type: Boolean, default: true },
    dense: { type: Boolean, default: false },
  },
  setup(props, { attrs, slots }) {
    return () => {
      const children = [
        h("span", { class: "name" }, props.player?.name),
        props.showRole
          ? h("span", { "data-testid": "role-icon", "data-role": props.player?.role ?? "" })
          : null,
        slots["avatar-corner"]?.(),
      ];
      return props.linkable && props.player?.steam_id
        ? h(
            "a",
            {
              "data-testid": "player-link",
              "data-dense": props.dense ? "true" : "false",
              href: `/players/${props.player.steam_id}`,
              target: attrs.target,
              rel: attrs.rel,
            },
            children,
          )
        : h("div", { "data-testid": "player-plain" }, children);
    };
  },
});
