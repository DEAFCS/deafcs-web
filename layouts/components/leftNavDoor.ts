import type { Component } from "vue";

export interface LeftNavDoor {
  key: string;
  label: string;
  to: string | Record<string, unknown>;
  icon: Component;
  active: boolean;
  badge?: number | string | null;
  badgeTone?: "live" | "count";
}
