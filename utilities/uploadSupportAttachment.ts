// Uploads a support request/reply attachment ahead of the actual GraphQL
// insert (the request/message row doesn't exist yet), returning the S3
// key + content type to include as attachment_url/attachment_content_type
// on whichever row gets inserted next. Mirrors the postBlob pattern used
// by RosterImageEditor.vue for roster image uploads.
export async function uploadSupportAttachment(
  file: File,
): Promise<{ path: string; contentType: string }> {
  const apiDomain = useRuntimeConfig().public.apiDomain as string;
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`https://${apiDomain}/support-requests/attachment`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as { path: string; contentType: string };
}
