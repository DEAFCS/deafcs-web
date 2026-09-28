// Distinguishes *why* the upload failed so the caller can show a message
// that actually points at the cause instead of a generic "try again" --
// "network" with zero bytes ever sent is the signature this endpoint hit in
// production for a ~95MB video from an iPhone: the request never reached
// the server at all, most likely Safari failing to buffer a large
// multipart/form-data body in memory before it could send anything.
export type ChatAttachmentUploadError = Error & {
  kind: "network" | "timeout" | "http";
  status?: number;
  bytesSent: number;
};

// Uploads a chat attachment ahead of the actual "lobby:chat" socket send --
// the chat message doesn't exist yet at upload time, so this just stashes
// the file in S3 and returns the key + content type to include as
// `attachment` on the socket send.
//
// Sends the file as a raw binary body (Content-Type: the file's own
// mimetype) instead of wrapping it in multipart/form-data like
// uploadSupportAttachment.ts does -- multipart requires the browser to
// build one combined body from all its parts before sending, and Safari
// appears to do that fully in memory: a large video reliably failed there
// (confirmed via server logs: zero bytes ever arrived) while working fine
// on desktop browsers. A raw Blob/File body lets every browser stream it
// directly instead. See chat.module.ts for the matching raw-body parser
// this needs server-side.
//
// Uses XMLHttpRequest rather than fetch() specifically for its
// upload.onprogress event -- fetch has no cross-browser way to observe
// request body upload progress, and a 100-200MB video attachment can take
// long enough (especially on mobile) that a plain spinner with no percentage
// left people unsure whether it was still going at all.
export function uploadChatAttachment(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ path: string; contentType: string }> {
  const apiDomain = useRuntimeConfig().public.apiDomain as string;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let bytesSent = 0;
    xhr.open("POST", `https://${apiDomain}/chat/attachment`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", file.type);
    // Generous but finite -- long enough for a large file on a slow mobile
    // connection, short enough to eventually surface a stuck upload rather
    // than spinning forever.
    xhr.timeout = 10 * 60 * 1000;

    xhr.upload.onprogress = (event) => {
      bytesSent = event.loaded;
      if (!event.lengthComputable || !onProgress) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        const error = new Error(
          `${xhr.status} ${xhr.statusText}`,
        ) as ChatAttachmentUploadError;
        error.kind = "http";
        error.status = xhr.status;
        error.bytesSent = bytesSent;
        reject(error);
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch (error) {
        reject(error);
      }
    };
    xhr.ontimeout = () => {
      const error = new Error("upload timed out") as ChatAttachmentUploadError;
      error.kind = "timeout";
      error.bytesSent = bytesSent;
      reject(error);
    };
    xhr.onerror = () => {
      const error = new Error("network error") as ChatAttachmentUploadError;
      error.kind = "network";
      error.bytesSent = bytesSent;
      reject(error);
    };
    xhr.send(file);
  });
}
