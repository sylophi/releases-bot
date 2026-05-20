import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function ask(question: string, fallback?: string): Promise<string> {
  const suffix = fallback !== undefined ? ` [${fallback}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || fallback || "";
}

async function askYesNo(question: string, defaultYes = false): Promise<boolean> {
  const suffix = defaultYes ? "Y/n" : "y/N";
  const answer = (await rl.question(`${question} [${suffix}]: `)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer === "y" || answer === "yes";
}

async function confirmOverwrite(path: string): Promise<boolean> {
  if (!existsSync(path)) return true;
  return askYesNo(`${path} already exists. Overwrite?`, false);
}

async function setupEnv(): Promise<void> {
  const envPath = resolve(".env");
  if (!(await confirmOverwrite(envPath))) {
    console.log("Skipping .env");
    return;
  }
  console.log("\n--- .env ---");
  let discordToken = "";
  while (!discordToken) {
    discordToken = await ask("Discord bot token");
    if (!discordToken) console.log("  required.");
  }
  const githubToken = await ask("GitHub PAT (optional, leave blank for unauth)");

  const lines = [`DISCORD_TOKEN=${discordToken}`];
  if (githubToken) lines.push(`GITHUB_TOKEN=${githubToken}`);
  await writeFile(envPath, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${envPath}`);
}

const REPO_RE = /^[^/\s]+\/[^/\s]+$/;
const SNOWFLAKE_RE = /^\d{15,25}$/;

async function setupConfig(): Promise<void> {
  const cfgPath = resolve("config.json");
  if (!(await confirmOverwrite(cfgPath))) {
    console.log("Skipping config.json");
    return;
  }
  console.log("\n--- config.json ---");
  let interval = 60;
  while (true) {
    const raw = await ask("Poll interval (seconds, min 30)", "60");
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 30) {
      interval = n;
      break;
    }
    console.log("  must be a number >= 30");
  }

  const repos: Array<{ repo: string; channel_id: string }> = [];
  console.log("\nAdd repos to track. Press enter on an empty repo to stop.");
  while (true) {
    const repo = await ask(`Repo #${repos.length + 1} (owner/name, blank to finish)`);
    if (!repo) {
      if (repos.length === 0) {
        console.log("  at least one repo required.");
        continue;
      }
      break;
    }
    if (!REPO_RE.test(repo)) {
      console.log("  format must be owner/name");
      continue;
    }
    let channelId = "";
    while (!channelId) {
      const id = await ask("  Discord channel ID");
      if (!SNOWFLAKE_RE.test(id)) {
        console.log("  must be a numeric Discord snowflake (15-25 digits)");
        continue;
      }
      channelId = id;
    }
    repos.push({ repo, channel_id: channelId });
  }

  const config = { poll_interval_seconds: interval, repos };
  await writeFile(cfgPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.log(`Wrote ${cfgPath} with ${repos.length} repo(s)`);
}

try {
  console.log("releases-bot setup\n");
  await setupEnv();
  await setupConfig();
  console.log("\nDone. Run `bun run start` to launch the bot.");
} finally {
  rl.close();
}
