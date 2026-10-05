// Adapted from 5Stack WEB d18c33db; MIT Copyright (c) 2025 5Stack.gg; see LICENSE.
// reka-ui throws on a <SelectItem value="">: an empty model value is reserved
// for "nothing selected, show the placeholder", so an explicit "none" option
// has to carry a sentinel instead. Vue swallows the setup throw and the item
// renders as "Component is missing template or render function".
export const SELECT_NONE = "__none__";
