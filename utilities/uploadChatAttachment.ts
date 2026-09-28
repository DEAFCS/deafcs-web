// Uploads a chat attachment ahead of the actual "lobby:chat" socket send --
// the chat message doesn't exist yet at upload time, so this just stashes
// the file in S3 and returns the key + content type to include as
// `attachment` on the socket send. Mirrors uploadSupportAttachment.ts.
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
  const formData = new FormData();
  formData.append("file", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://${apiDomain}/chat/attachment`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`${xhr.status} ${xhr.statusText}`));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => reject(new Error("network error"));
    xhr.send(formData);
  });
}
