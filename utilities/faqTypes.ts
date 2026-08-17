export interface FaqLink {
  to: string;
  labelKey: string;
  // Vue's dynamic slot-name syntax (#[expr]) can't contain a ternary/spaces,
  // so the target slot is precomputed here rather than derived in the template.
  slot: "link" | "link2";
}

export interface FaqItem {
  key: string;
  links?: FaqLink[];
}

export interface FaqCategory {
  key: string;
  items: FaqItem[];
}
