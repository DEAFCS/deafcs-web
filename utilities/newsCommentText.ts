/**
 * DEAFCS-only: splits a News comment into plain text and web links, so the
 * comment can be rendered with text interpolation only (never v-html). HTML
 * a player types shows as the characters they typed.
 */
/**
 * The page a NewsCommentReply notification opens. The API sets entity_id to
 * "news_comment:<article slug>:<reply id>".
 */
export function newsCommentNotificationPath(
  entityId: string | null | undefined,
): string | null {
  const match = /^news_comment:([^:]+):([^:]+)$/.exec(entityId ?? "");
  if (!match) {
    return null;
  }
  return `/news/${encodeURIComponent(match[1])}#comment-${encodeURIComponent(match[2])}`;
}

export interface CommentTextPart {
  text: string;
  href?: string;
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;
// Punctuation that usually ends the sentence, not the link.
const TRAILING = /[.,!?;:)\]]+$/;

export function linkifyCommentText(text: string): CommentTextPart[] {
  const parts: CommentTextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    let url = match[0];
    const trailing = url.match(TRAILING)?.[0] ?? "";
    if (trailing) {
      url = url.slice(0, -trailing.length);
    }
    if (start > last) {
      parts.push({ text: text.slice(last, start) });
    }
    parts.push({ text: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) {
    parts.push({ text: text.slice(last) });
  }
  return parts;
}
