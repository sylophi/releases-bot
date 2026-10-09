export type MediaItem = { url: string; description?: string };

export type Block =
  | { kind: "text"; text: string }
  | { kind: "media"; items: MediaItem[] };

const GALLERY_LIMIT = 10;
const DESCRIPTION_LIMIT = 1024;

const IMG_TAG = /<img\b[^>]*>/gi;
// An <img> tag, or a markdown image capturing its alt text and URL.
const IMAGE = /<img\b[^>]*>|!\[([^\]]*)\]\(\s*<?([^\s>)]+)>?(?:\s+"[^"]*")?\s*\)/gi;
// What a linked image (a badge, say) leaves behind once the image is pulled out.
const EMPTY_LINK = /\[\s*\]\([^)]*\)|<a\b[^>]*>\s*<\/a>/gi;
const HTML_TAG = /<\/?[a-z][^>]*>/gi;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const DEEP_HEADING = /^#{4,6}(?=\s)/;
// GitHub renders a bare attachment link on its own line as inline media (usually a video).
const BARE_ASSET = /^https:\/\/github\.com\/user-attachments\/assets\/[\w-]+$/;
const FENCE = /^\s*(```|~~~)/;
const TABLE_ROW = /^\s*\|/;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (_, name: string) => ENTITIES[name]!);
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  const value = m?.[1] ?? m?.[2] ?? m?.[3];
  return value === undefined ? undefined : decodeEntities(value);
}

function mediaItem(url: string, alt: string | undefined): MediaItem {
  const description = alt?.trim().slice(0, DESCRIPTION_LIMIT);
  return description ? { url, description } : { url };
}

/** Pulls the images out of a line, returning them and whatever text is left. */
function extractImages(line: string): { items: MediaItem[]; rest: string } {
  const items: MediaItem[] = [];
  const rest = line
    .replace(IMAGE, (match, mdAlt: string | undefined, mdSrc: string | undefined) => {
      const isTag = mdSrc === undefined;
      const url = isTag ? attr(match, "src") : mdSrc;
      // Discord only takes web URLs; anything else stays in the text rather than failing the post.
      if (!url || !/^https?:\/\//i.test(url)) return match;
      items.push(mediaItem(url, isTag ? attr(match, "alt") : decodeEntities(mdAlt!)));
      return "";
    })
    .replace(EMPTY_LINK, "")
    .trim();
  return { items, rest: rest.replace(HTML_TAG, "").trim() ? rest : "" };
}

/**
 * Splits a GitHub release body into text and media blocks, in reading order,
 * so images land between the paragraphs they sit between on GitHub.
 */
export function parseBody(body: string | null): Block[] {
  if (!body) return [];
  const lines = body
    .replace(/\r\n/g, "\n")
    .replace(HTML_COMMENT, "")
    .replace(IMG_TAG, (tag) => tag.replace(/\s+/g, " "))
    .split("\n");
  const blocks: Block[] = [];
  let text: string[] = [];

  const flushText = () => {
    const joined = text.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (joined) blocks.push({ kind: "text", text: joined });
    text = [];
  };
  const pushMedia = (items: MediaItem[]) => {
    flushText();
    for (let i = 0; i < items.length; i += GALLERY_LIMIT) {
      blocks.push({ kind: "media", items: items.slice(i, i + GALLERY_LIMIT) });
    }
  };

  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (FENCE.test(line)) inFence = !inFence;
    if (inFence || FENCE.test(line)) {
      text.push(line);
      continue;
    }

    if (TABLE_ROW.test(line)) {
      const rows = [line];
      while (i + 1 < lines.length && TABLE_ROW.test(lines[i + 1]!)) rows.push(lines[++i]!);
      // Discord can't draw tables, so an image table becomes one gallery in row order.
      const items = rows.flatMap((row) => extractImages(row).items);
      if (items.length > 0) pushMedia(items);
      else text.push(...rows);
      continue;
    }

    const { items, rest } = extractImages(line);
    if (items.length > 0) {
      if (rest) text.push(rest);
      pushMedia(items);
    } else if (BARE_ASSET.test(line.trim())) {
      pushMedia([{ url: line.trim() }]);
    } else {
      // Discord's markdown stops at ###.
      text.push(line.replace(DEEP_HEADING, "###"));
    }
  }
  flushText();
  return blocks;
}
