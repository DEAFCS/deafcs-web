// Uploads a chat attachment ahead of the actual "lobby:chat" socket send --
// the chat message doesn't exist yet at upload time, so this just stashes
// the file in S3 and returns the key + content type to include as
// `attachment` on the socket send. Mirrors uploadSupportAttachment.ts.
export async function uploadChatAttachment(
  file: File,
): Promise<{ path: string; contentType: string }> {
  const apiDomain = useRuntimeConfig().public.apiDomain as string;
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`https://${apiDomain}/chat/attachment`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as { path: string; contentType: string };
}
