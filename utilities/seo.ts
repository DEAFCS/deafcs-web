export const SITE_ORIGIN = "https://deafcs.net";
export const SITE_NAME = "DEAFCS";
export const HOMEPAGE_URL = `${SITE_ORIGIN}/`;
export const HOMEPAGE_TITLE =
  "DEAFCS — Competitive Counter-Strike for the Deaf Community";
export const HOMEPAGE_DESCRIPTION =
  "DEAFCS is the home of competitive Counter-Strike for the deaf community, featuring Quick Play, tournaments, cups, leagues, player statistics, rankings, and match results.";
export const SITE_LOGO_URL = `${SITE_ORIGIN}/branding/deafcs-logo.png`;

export const ORGANIZATION_ID = `${SITE_ORIGIN}/#organization`;
export const WEBSITE_ID = `${SITE_ORIGIN}/#website`;

export const HOMEPAGE_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: SITE_NAME,
      url: HOMEPAGE_URL,
      logo: SITE_LOGO_URL,
    },
    {
      "@type": "WebSite",
      "@id": WEBSITE_ID,
      name: SITE_NAME,
      alternateName: "deafcs.net",
      url: HOMEPAGE_URL,
      publisher: {
        "@id": ORGANIZATION_ID,
      },
    },
  ],
} as const;

export const STATIC_SITEMAP_PATHS = [
  "/",
  "/players",
  "/matches",
  "/tournaments",
  "/teams",
  "/news",
  "/leaderboard",
  "/league",
  "/awards",
  "/watch",
  "/stats-guide",
] as const;
