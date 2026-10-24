/**
 * The page an AwardGranted notification opens. The API sets entity_id to
 * "<award id>/<occurrence key>" (the key only stops the same award being
 * announced twice), so the award's own page is the first part. 5Stack opens
 * /awards; DEAFCS opens the award itself, and falls back to /awards.
 */
export function awardNotificationPath(entityId?: string | null): string {
  const awardId = entityId?.split("/")[0] ?? "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    awardId,
  )
    ? `/awards/${awardId}`
    : "/awards";
}

/**
 * The award name in an AwardGranted notification. The API writes
 * "You were awarded <b>{name}</b>." with the name HTML-escaped
 * (NotificationsService.escapeHtml), so this reads the bold part back and
 * undoes exactly that escaping. Null when the message has no bold name.
 */
export function awardNameFromMessage(html?: string | null): string | null {
  const match = /<b>([\s\S]*?)<\/b>/i.exec(html ?? "");
  if (!match) return null;
  const name = match[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
  return name || null;
}
