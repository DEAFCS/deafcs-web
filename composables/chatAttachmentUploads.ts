// DEAFCS retains its authorized attachment endpoint and existing upload flow.
export function chatAttachmentUrl(id: string) {
  return `https://${useRuntimeConfig().public.apiDomain}/chat/attachment/${encodeURIComponent(id)}`;
}
export function chatAttachmentPosterUrl(id: string) {
  return chatAttachmentUrl(id);
}
