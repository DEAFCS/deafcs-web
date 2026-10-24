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
