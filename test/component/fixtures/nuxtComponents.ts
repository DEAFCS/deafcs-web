// Resolution target for Nuxt's virtual "#components" module in component specs
// (see vitest.config.ts). NuxtLink renders as a plain anchor.
import { defineComponent, h } from "vue";

export const NuxtLink = defineComponent({
  name: "NuxtLink",
  props: { to: { type: [String, Object], default: undefined } },
  setup(props, { slots, attrs }) {
    return () =>
      h("a", { ...attrs, href: typeof props.to === "string" ? props.to : undefined }, slots.default?.());
  },
});
