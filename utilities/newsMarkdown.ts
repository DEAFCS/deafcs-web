import { marked } from "marked";
import DOMPurify from "dompurify";

// Matches a bare YouTube URL that fills a whole line, capturing the video id.
const YOUTUBE_RE =
  /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{6,15})(?:[&?]\S*)?$/i;

// Matches a bare Vimeo URL that fills a whole line, capturing the video id.
const VIMEO_RE =
  /^(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d{6,12})(?:[/?]\S*)?$/i;

// A line that's *only* a YouTube/Vimeo link becomes a responsive embed
// instead of the usual auto-linked paragraph. Anything else (a link inside a
// sentence, part of a list, etc.) is left alone.
function embedForLine(line: string): string | null {
  const trimmed = line.trim();

  const yt = YOUTUBE_RE.exec(trimmed);
  if (yt) {
    const id = yt[1];
    return `<div class="news-video-embed"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="YouTube video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
  }

  const vimeo = VIMEO_RE.exec(trimmed);
  if (vimeo) {
    const id = vimeo[1];
    return `<div class="news-video-embed"><iframe src="https://player.vimeo.com/video/${id}" title="Vimeo video" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>`;
  }

  return null;
}

function preprocessVideoLinks(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => embedForLine(line) ?? line)
    .join("\n");
}

const YOUTUBE_EMBED_SRC_RE =
  /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]+$/;
const VIMEO_EMBED_SRC_RE = /^https:\/\/player\.vimeo\.com\/video\/\d+$/;

function extractAttr(tag: string, attr: string): string {
  const match = new RegExp(`\\b${attr}="([^"]*)"`, "i").exec(tag);
  return match?.[1] ?? "";
}

// Runs on the final sanitized HTML string (not the DOM), so it works
// identically during SSR and in the browser. Anything DOMPurify let through
// under the iframe/video/source allowance still has to point at a URL we
// generated ourselves — a news author typing a raw <iframe src="evil.com">
// or <video src="evil.com"> directly gets stripped here, same as if they'd
// never typed it.
function stripDisallowedEmbeds(html: string, videoOrigin: string): string {
  const videoPrefix = `${videoOrigin}/news/video/`;

  html = html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, (tag) => {
    const src = extractAttr(tag, "src");
    const allowed =
      YOUTUBE_EMBED_SRC_RE.test(src) || VIMEO_EMBED_SRC_RE.test(src);
    return allowed ? tag : "";
  });

  html = html.replace(/<video\b[^>]*>[\s\S]*?<\/video>/gi, (tag) => {
    const src = extractAttr(tag, "src");
    return src.startsWith(videoPrefix) ? tag : "";
  });

  html = html.replace(/<source\b[^>]*\/?>/gi, (tag) => {
    const src = extractAttr(tag, "src");
    return src.startsWith(videoPrefix) ? tag : "";
  });

  return html;
}

/**
 * Renders News post markdown to sanitized HTML, with two extra abilities
 * beyond plain markdown:
 *  - a bare YouTube/Vimeo link on its own line becomes an embedded player
 *  - an uploaded video (a <video> tag pointing at our own /news/video/...
 *    URLs, inserted by the editor) is allowed through
 *
 * `videoOrigin` is the API origin (e.g. "https://api.example.com") uploaded
 * videos are served from — used to make sure a <video>/<source> src can only
 * ever point at media we hosted, never an attacker-supplied URL.
 */
export function renderNewsMarkdown(
  markdown: string | null | undefined,
  videoOrigin: string,
): string {
  if (!markdown) {
    return "";
  }

  const preprocessed = preprocessVideoLinks(markdown);
  const html = marked.parse(preprocessed, { breaks: true }) as string;
  const sanitized = DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe", "video", "source"],
    ADD_ATTR: [
      "allow",
      "allowfullscreen",
      "loading",
      "controls",
      "preload",
      "playsinline",
      "frameborder",
      "title",
    ],
  });

  return stripDisallowedEmbeds(sanitized, videoOrigin);
}
