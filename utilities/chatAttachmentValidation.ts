export const MAX_CHAT_ATTACHMENT_BYTES = 200 * 1024 * 1024;

export const ALLOWED_CHAT_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

export type ChatAttachmentRejection = "unsupported_type" | "too_large";

// Same copy everywhere a file is rejected, regardless of whether it came
// from the file picker, a paste, or a drag-and-drop.
export function describeChatAttachmentRejection(
  rejection: ChatAttachmentRejection,
): { title: string; description: string } {
  if (rejection === "unsupported_type") {
    return {
      title: "Unsupported file type",
      description:
        "Attach an image (PNG/JPEG/WEBP/GIF) or a video (MP4/WEBM/MOV).",
    };
  }
  return {
    title: "File too large",
    description: "Attachments are limited to 200 MB.",
  };
}

// Shared by the file picker, paste, and drag-and-drop entry points so all
// three enforce exactly the same rules.
export function validateChatAttachment(
  file: File,
): ChatAttachmentRejection | null {
  if (!ALLOWED_CHAT_ATTACHMENT_TYPES.includes(file.type)) {
    return "unsupported_type";
  }
  if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
    return "too_large";
  }
  return null;
}
