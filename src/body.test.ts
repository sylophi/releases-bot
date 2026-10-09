import { describe, expect, test } from "bun:test";
import { parseBody } from "./body.ts";

const ASSET = "https://github.com/user-attachments/assets/dc1668bc-d543-48ab-a23e-bc9d5e69a7d2";

describe("parseBody", () => {
  test("puts images between the text around them", () => {
    const body = [
      "**Feature** ([#1](https://x/1))",
      "Does a thing.",
      "",
      `<img alt="The thing" src="${ASSET}" width="640">`,
      "",
      "**Next**",
    ].join("\n");
    expect(parseBody(body)).toEqual([
      { kind: "text", text: "**Feature** ([#1](https://x/1))\nDoes a thing." },
      { kind: "media", items: [{ url: ASSET, description: "The thing" }] },
      { kind: "text", text: "**Next**" },
    ]);
  });

  test("gives each standalone image its own block", () => {
    const blocks = parseBody(`<img src="${ASSET}">\n\n<img src="${ASSET}">`);
    expect(blocks.map((b) => b.kind)).toEqual(["media", "media"]);
  });

  test("turns an image table into one gallery in row order", () => {
    const body = [
      "| | Before | After |",
      "| --- | --- | --- |",
      `| Shut | <img alt="b1" src="${ASSET}"> | <img alt="a1" src="${ASSET}"> |`,
      `| Open | <img alt="b2" src="${ASSET}"> | <img alt="a2" src="${ASSET}"> |`,
    ].join("\n");
    const [block] = parseBody(body);
    expect(block?.kind === "media" && block.items.map((i) => i.description)).toEqual(["b1", "a1", "b2", "a2"]);
  });

  test("keeps tables without images as text", () => {
    expect(parseBody("| a | b |\n| - | - |")).toEqual([{ kind: "text", text: "| a | b |\n| - | - |" }]);
  });

  test("treats a bare attachment link as media", () => {
    expect(parseBody(`Watch:\n\n${ASSET}`)).toEqual([
      { kind: "text", text: "Watch:" },
      { kind: "media", items: [{ url: ASSET }] },
    ]);
  });

  test("reads markdown images and decodes alt entities", () => {
    expect(parseBody(`![A &amp; B](${ASSET})\n<img alt="&quot;q&quot;" src="${ASSET}">`)).toEqual([
      { kind: "media", items: [{ url: ASSET, description: "A & B" }] },
      { kind: "media", items: [{ url: ASSET, description: '"q"' }] },
    ]);
  });

  test("leaves non-web image sources in the text", () => {
    expect(parseBody(`<img src="docs/shot.png">`)).toEqual([{ kind: "text", text: `<img src="docs/shot.png">` }]);
  });

  test("drops the empty link a linked image leaves behind", () => {
    expect(parseBody(`[![badge](${ASSET})](https://x)\n<a href="https://x"><img src="${ASSET}"></a>`)).toEqual([
      { kind: "media", items: [{ url: ASSET, description: "badge" }] },
      { kind: "media", items: [{ url: ASSET }] },
    ]);
  });

  test("joins img tags split across lines", () => {
    expect(parseBody(`<img\n  alt="x"\n  src="${ASSET}">`)).toEqual([
      { kind: "media", items: [{ url: ASSET, description: "x" }] },
    ]);
  });

  test("strips HTML comments", () => {
    expect(parseBody("<!-- generated -->\n## What's Changed")).toEqual([{ kind: "text", text: "## What's Changed" }]);
  });

  test("caps headings at ###", () => {
    expect(parseBody("#### Deep")).toEqual([{ kind: "text", text: "### Deep" }]);
  });

  test("leaves images in code fences alone", () => {
    const body = "```html\n<img src=\"https://x/a.png\">\n```";
    expect(parseBody(body)).toEqual([{ kind: "text", text: body }]);
  });

  test("splits galleries past ten images", () => {
    const row = `| ${Array.from({ length: 12 }, () => `<img src="${ASSET}">`).join(" | ")} |`;
    expect(parseBody(row).map((b) => b.kind === "media" && b.items.length)).toEqual([10, 2]);
  });
});
