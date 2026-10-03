// Chat badges come in two colours, and every unread message is counted in
// exactly one of them:
//   urgent (red)   -- private messages, announcements, and @-mentions of me
//   calm (amber)   -- everything else
// Private messages and announcements are urgent as a whole tab; in any other
// tab only the unread messages that @-tag me are urgent.
export const URGENT_CHAT_TYPES = ["direct", "announcement"];

export interface TabBadge {
  calm: number;
  urgent: number;
}

export function isUrgentChatType(type?: string): boolean {
  return !!type && URGENT_CHAT_TYPES.includes(type);
}

export function splitTabBadge(
  unread: number | undefined,
  mentions: number | undefined,
  type?: string,
): TabBadge {
  const total = Math.max(0, unread || 0);
  if (isUrgentChatType(type)) {
    return { calm: 0, urgent: total };
  }
  // Mentions are a subset of unread, so never more urgent than unread.
  const urgent = Math.min(Math.max(0, mentions || 0), total);
  return { calm: total - urgent, urgent };
}

export function totalBadgeCounts(
  unreadCounts: Record<string, number>,
  mentionCounts: Record<string, number>,
  typeOf: (tabId: string) => string | undefined,
): TabBadge {
  const result: TabBadge = { calm: 0, urgent: 0 };
  for (const [id, unread] of Object.entries(unreadCounts)) {
    const badge = splitTabBadge(unread, mentionCounts[id], typeOf(id));
    result.calm += badge.calm;
    result.urgent += badge.urgent;
  }
  return result;
}
