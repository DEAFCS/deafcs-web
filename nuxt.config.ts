// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from "node:url";
import federation from "@originjs/vite-plugin-federation";
import {
  HOMEPAGE_DESCRIPTION,
  HOMEPAGE_TITLE,
  HOMEPAGE_URL,
  SITE_LOGO_URL,
  SITE_NAME,
} from "./utilities/seo";

const sw = process.env.SW === "true";

export default defineNuxtConfig({
  ssr: false,

  // Pin the shadcn `cn` helper to a real committed module. shadcn-nuxt
  // otherwise aliases @/lib/utils to a virtual template that Vite can drop
  // during dep re-optimization → runtime "cn is not a function".
  alias: {
    "@/lib/utils": fileURLToPath(new URL("./lib/utils.ts", import.meta.url)),
  },

  app: {
    head: {
      charset: "utf-8",
      viewport:
        "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
      title: HOMEPAGE_TITLE,
      meta: [
        { name: "color-scheme", content: "dark" },
        { name: "theme-color", content: "#0a0a0b" },
        { name: "robots", content: "index, follow" },
        { name: "title", content: HOMEPAGE_TITLE },
        { name: "description", content: HOMEPAGE_DESCRIPTION },
        { name: "site_name", content: SITE_NAME },

        { property: "og:locale", content: "en" },
        { property: "og:type", content: "website" },

        { property: "og:title", content: HOMEPAGE_TITLE },
        { property: "og:description", content: HOMEPAGE_DESCRIPTION },
        { property: "og:site_name", content: SITE_NAME },

        { property: "og:url", content: HOMEPAGE_URL },
        { property: "og:image", content: SITE_LOGO_URL },
        { property: "og:image:alt", content: SITE_NAME },

        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: HOMEPAGE_TITLE },
        { name: "twitter:description", content: HOMEPAGE_DESCRIPTION },
        { name: "twitter:image", content: SITE_LOGO_URL },
      ],
      link: [
        {
          rel: "icon",
          type: "image/x-icon",
          href: "/favicon.ico?v=deafcs-1",
        },
        {
          rel: "shortcut icon",
          type: "image/x-icon",
          href: "/favicon.ico?v=deafcs-1",
        },
        {
          rel: "icon",
          type: "image/png",
          sizes: "64x64",
          href: "/favicon/64.png?v=deafcs-1",
        },
        {
          rel: "icon",
          type: "image/png",
          sizes: "192x192",
          href: "/favicon/192.png?v=deafcs-1",
        },
        {
          rel: "apple-touch-icon",
          sizes: "192x192",
          href: "/favicon/192.png?v=deafcs-1",
        },
      ],
      htmlAttrs: {
        class: "dark",
        style: "background-color: hsl(240 10% 3.9%)",
      },
      bodyAttrs: {
        class: "pre-loader",
      },
      style: [
        {
          innerHTML: `
            .pre-loader::before {
              content: '';
              box-sizing: border-box;
              border: 4px solid rgba(255, 255, 255, 0.3);
              border-top: 4px solid white;
              border-radius: 50%;
              width: 50px;
              height: 50px;
              animation: spin 1s linear infinite;
            }
            .pre-loader {
              margin: 0;
              background-color: hsl(240 10% 3.9%);
              background-image: url("/topo-preloader.svg");
              background-size: cover;
              background-position: center;
              background-repeat: no-repeat;
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              display: flex;
              align-items: center;
              justify-content: center;
              z-index: 9999;
              transition: opacity 0.3s;
            }
            .pre-loader--fade {
              opacity: 0;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `,
        },
      ],
    },
  },

  experimental: {
    defaults: {
      nuxtLink: {
        prefetchOn: {
          visibility: false,
          interaction: true,
        },
      },
    },
  },

  i18n: {
    strategy: "no_prefix",
    bundle: {
      optimizeTranslationDirective: false,
    },
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: "i18n_redirected",
      redirectOn: "root",
      fallbackLocale: "en",
    },
    locales: [
      { code: "en", name: "English", file: "en.json", flag: "🇬🇧" },
      { code: "ar", name: "العربية", file: "ar_SA.json", flag: "🇸🇦" }, // Arabic
      { code: "da", name: "Dansk", file: "da_DK.json", flag: "🇩🇰" }, // Danish
      { code: "de", name: "Deutsch", file: "de_DE.json", flag: "🇩🇪" }, // German
      { code: "es", name: "Español", file: "es_ES.json", flag: "🇪🇸" }, // Spanish
      { code: "fr", name: "Français", file: "fr_FR.json", flag: "🇫🇷" }, // French
      { code: "it", name: "Italiano", file: "it_IT.json", flag: "🇮🇹" }, // Italian
      { code: "ja", name: "日本語", file: "ja_JP.json", flag: "🇯🇵" }, // Japanese
      { code: "ko", name: "한국어", file: "ko_KR.json", flag: "🇰🇷" }, // Korean
      { code: "pl", name: "Polski", file: "pl_PL.json", flag: "🇵🇱" }, // Polish
      {
        code: "pt",
        name: "Português (Brasil)",
        file: "pt_BR.json",
        flag: "🇧🇷",
      }, // Brazilian Portuguese
      { code: "ru", name: "Русский", file: "ru_RU.json", flag: "🇷🇺" }, // Russian
      { code: "sv", name: "Svenska", file: "sv_SE.json", flag: "🇸🇪" }, // Swedish
      { code: "tr", name: "Türkçe", file: "tr_TR.json", flag: "🇹🇷" }, // Turkish
      { code: "uk", name: "Українська", file: "uk_UA.json", flag: "🇺🇦" }, // Ukrainian
      {
        code: "zh-Hans",
        name: "中文 (简体)",
        file: "zh_Hans.json",
        flag: "🇨🇳",
      }, // Simplified Chinese
      {
        code: "zh-Hant",
        name: "中文 (繁體)",
        file: "zh_Hant.json",
        flag: "🇨🇳",
      }, // Traditional Chinese
    ],
    lazy: true,
    defaultLocale: "en",
  },

  runtimeConfig: {
    public: {
      apiDomain: "",
      wsDomain: "",
      webDomain: "",
      demosDomain: "",
      relayDomain: "",
      // CDN base for 3D-replay collision meshes (.tri). Pin the awpy build tag so
      // the URL is immutable/cache-forever. Override with NUXT_PUBLIC_MAP_MESH_CDN
      // to swap to cdn.5stack.gg (R2) later — no code change needed.
      mapMeshCdn:
        "https://cdn.jsdelivr.net/gh/5stackgg/replay-map-meshes@17595823-5",
    },
  },

  modules: [
    "@nuxtjs/apollo",
    "@pinia/nuxt",
    "@nuxtjs/tailwindcss",
    "@nuxtjs/color-mode",
    "shadcn-nuxt",
    "@nuxt/image",
    "@vite-pwa/nuxt",
    "@nuxtjs/i18n",
  ],

  pwa: {
    injectRegister: "auto",
    registerType: "autoUpdate",
    client: {
      installPrompt: true,
    },
    workbox: {
      // Plain JS file (not part of the Workbox precache/build pipeline)
      // that adds `push` / `notificationclick` listeners to the
      // generated service worker — see public/sw-push.js. This stays
      // on the default generateSW strategy rather than switching to
      // injectManifest just to get a custom SW file.
      importScripts: ["/sw-push.js"],
      cleanupOutdatedCaches: true,
      maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
      // Do not precache every Nuxt chunk during service-worker install.
      // Runtime caching below stores route assets only after a visited page needs them.
      globPatterns: [],
      // No precache manifest, so disable the navigate fallback —
      // otherwise workbox calls createHandlerBoundToURL('/') and throws non-precached-url.
      navigateFallback: null,
      navigateFallbackDenylist: [
        /^\/auth/,
        /^\/discord-invite/,
        /^\/discord-bot/,
      ],
      runtimeCaching: [
        {
          urlPattern: ({ url }: { url: URL }) =>
            url.pathname.startsWith("/_nuxt/"),
          handler: "CacheFirst",
          options: {
            cacheName: "nuxt-assets",
            expiration: {
              maxEntries: 300,
              maxAgeSeconds: 60 * 60 * 24 * 30,
            },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          urlPattern: /\.(?:png|svg|webp|ico)$/i,
          handler: "CacheFirst",
          options: {
            cacheName: "images",
            expiration: {
              maxEntries: 200,
              maxAgeSeconds: 60 * 60 * 24 * 30,
            },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          urlPattern: /\.(?:ttf|woff|woff2)$/i,
          handler: "CacheFirst",
          options: {
            cacheName: "fonts",
            expiration: {
              maxEntries: 10,
              maxAgeSeconds: 60 * 60 * 24 * 365,
            },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          urlPattern: /\/v1\/graphql/,
          handler: "NetworkOnly",
        },
      ],
    },
    devOptions: {
      enabled: sw,
      suppressWarnings: true,
    },
    manifest: {
      name: "DEAFCS",
      short_name: "DEAFCS",
      icons: [
        {
          src: "/favicon/64.png?v=deafcs-1",
          sizes: "64x64",
          type: "image/png",
        },
        {
          src: "/favicon/192.png?v=deafcs-1",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "/favicon/512.png?v=deafcs-1",
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
      ],
      theme_color: "#000000",
      background_color: "#000000",
      display: "standalone",
    },
  },

  colorMode: {
    classSuffix: "",
    preference: "dark",
  },

  devtools: {
    enabled: true,

    timeline: {
      enabled: true,
    },
  },

  // disable auto imports for components
  components: {
    dirs: [],
  },

  css: ["~/assets/css/tailwind.css"],

  postcss: {
    plugins: {
      "tailwindcss/nesting": "postcss-nesting",
      tailwindcss: {},
      autoprefixer: {},
    },
  },

  shadcn: {
    /**
     * Prefix for all the imported component
     */
    prefix: "",
    /**
     * Directory that the component lives in.
     * @default "./components/ui"
     */
    componentDir: "./components/ui",
  },

  apollo: {
    proxyCookies: true,
    clients: {
      default: {
        httpEndpoint: `https://temp/v1/graphql`,
      },
    },
  },

  compatibilityDate: "2024-07-15",

  vite: {
    optimizeDeps: {
      include: ["monaco-editor"],
    },
    // Plugins host: enables the `__federation__` virtual module so
    // `pages/apps/[slug].vue` can register + load plugin remotes at runtime.
    // Every real remote is added dynamically from the custom_pages registry, so
    // new plugins need no web rebuild.
    plugins: [
      federation({
        name: "host",
        remotes: {
          // NOT optional, and never actually loaded. vite-plugin-federation
          // decides `isHost` from `remotes` being non-empty, and only a host
          // gets `__rf_placeholder__shareScope` in the `__federation__` virtual
          // module substituted with the real shared-scope map. With `remotes:
          // {}` the production bundle ships that placeholder as a bare
          // identifier, so the moment `wrapShareScope()` runs — i.e. the first
          // time any plugin remote loads — it throws "__rf_placeholder__shareScope
          // is not defined". Dev is unaffected (its transform isn't gated on
          // isHost), so this only ever shows up in a built deploy.
          __federation_host_placeholder__: {
            external: "http://localhost/__federation_placeholder__.js",
            format: "esm",
            from: "vite",
          },
        },
        // Deliberately empty — do NOT add packages here.
        //
        // Every entry makes vite-plugin-federation rewrite that package's
        // imports into `await importShared(...)`, turning most of the app into
        // async modules (it was 308 of 474 chunks). Safari then throws
        // "Cannot access '<x>' before initialization" whenever several modules
        // import the same top-level-await module at once — WebKit bug 242740,
        // fixed only in STP 243+, so shipping iOS Safari still has it. Upstream
        // has no fix either: originjs/vite-plugin-federation#403 is the same
        // catch-22, open with no root-cause response.
        //
        // Remotes get the panel's Vue from `window.__5stack_shared__` instead —
        // see plugins/shared-globals.client.ts and docs/plugins.md. `remotes`
        // above stays non-empty purely so this build still counts as a host.
        shared: {},
      }),
    ],
    build: {
      target: "esnext",
    },
  },
});
