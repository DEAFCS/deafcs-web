export function isNuxtDirectoryPath(pathname: string): boolean {
  return pathname === "/_nuxt" || pathname === "/_nuxt/";
}
