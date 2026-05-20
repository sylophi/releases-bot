import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const files: Array<[string, string]> = [
  [".env", "DISCORD_TOKEN=\n"],
  ["config.json", `${JSON.stringify({ poll_interval_seconds: 60, repos: [] }, null, 2)}\n`],
];

for (const [name, contents] of files) {
  const abs = resolve(name);
  if (existsSync(abs)) {
    console.log(`skip  ${name} (already exists)`);
    continue;
  }
  await writeFile(abs, contents, "utf8");
  console.log(`wrote ${name}`);
}

console.log("\nNext: fill in .env and add repos to config.json, then run `bun run start`.");
