// 5Stack's utilities/badgeCount.ts, which the hub dock imports. The count
// keeps DEAFCS's own cap (formatBadgeCount.ts, "99+") rather than
// upstream's "100+".
export { formatBadgeCount } from "~/utilities/formatBadgeCount";

export const badgePopTransition = {
  enterActiveClass:
    "[transition:transform_0.3s_cubic-bezier(0.34,1.56,0.64,1),opacity_0.2s_ease] motion-reduce:[transition:none]",
  enterFromClass: "scale-0 opacity-0",
  leaveActiveClass:
    "[transition:transform_0.15s_ease-in,opacity_0.15s_ease-in] motion-reduce:[transition:none]",
  leaveToClass: "scale-0 opacity-0",
};
