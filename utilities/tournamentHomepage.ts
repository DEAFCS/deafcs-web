// A tournament homepage is only worth a link when it points somewhere other
// than DEAFCS itself. Organizers often paste deafcs.net (or the tournament's
// own page) into the field, which then showed a "Homepage" badge leading back
// to the site the player is already on.

const DEAFCS_HOSTS = ["deafcs.net"];

function isDeafcsHost(hostname: string, currentHost?: string | null): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (currentHost && host === currentHost.toLowerCase()) return true;
  return DEAFCS_HOSTS.some((base) => host === base || host.endsWith(`.${base}`));
}

/**
 * The safe, absolute URL to link as the tournament homepage, or null when
 * there is nothing external to link (empty, malformed, non-http(s), carrying
 * credentials, or pointing at DEAFCS / the current site).
 */
export function externalTournamentHomepage(
  raw: string | null | undefined,
  currentHost?: string | null,
): string | null {
  const value = raw?.trim();
  if (!value) return null;

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname || !url.hostname.includes(".")) return null;
  if (isDeafcsHost(url.hostname, currentHost)) return null;

  return url.toString();
}
