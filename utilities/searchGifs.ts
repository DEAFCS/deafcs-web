export type GifSearchResult = {
  id: string;
  previewUrl: string;
  sendUrl: string;
  width: number;
  height: number;
};

// Proxies through our own API (src/giphy in api-deafcs) rather than calling
// GIPHY directly -- keeps the API key server-side only. Empty query returns
// trending GIFs, matching the picker's default view before typing anything.
export async function searchGifs(query: string): Promise<GifSearchResult[]> {
  const apiDomain = useRuntimeConfig().public.apiDomain as string;
  const response = await fetch(
    `https://${apiDomain}/chat/gif-search?q=${encodeURIComponent(query)}`,
    { credentials: "include" },
  );
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const body = (await response.json()) as { results: GifSearchResult[] };
  return body.results;
}
