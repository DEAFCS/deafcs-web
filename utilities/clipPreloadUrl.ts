// The hidden next-clip preloader buffers the whole file before anyone presses
// play, so it must not count as a view. noview=1 is understood by the API's
// clip stream and by the Cloudflare clip Worker; the clip that is actually
// shown keeps its plain URL and is counted.
export function clipPreloadUrl(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}noview=1`;
}
