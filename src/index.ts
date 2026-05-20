import { Client, GatewayIntentBits } from "discord.js";
import { loadConfig, type Config, type RepoConfig } from "./config.ts";
import { StateStore } from "./state.ts";
import { fetchReleases, fetchRepo, type Release } from "./github.ts";
import { postRelease } from "./discord.ts";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN env var is required");
  process.exit(1);
}

const config = await loadConfig();
const state = await StateStore.load();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", (c) => {
  console.log(`[discord] logged in as ${c.user.tag}`);
  console.log(`[bot] tracking ${config.repos.length} repo(s)`);
});

await client.login(token);
await new Promise<void>((resolve) => client.once("clientReady", () => resolve()));

let stopping = false;

async function pollRepo(entry: RepoConfig, cfg: Config): Promise<void> {
  void cfg;
  const prev = state.get(entry.repo);
  let result;
  try {
    result = await fetchReleases(entry.repo, prev.etag);
  } catch (err) {
    console.error(`[poll] ${entry.repo}: ${(err as Error).message}`);
    return;
  }

  if (result.kind === "not_modified") {
    if (result.etag && result.etag !== prev.etag) {
      state.set(entry.repo, { ...prev, etag: result.etag });
    }
    return;
  }

  const stable = result.releases.filter((r) => !r.draft && !r.prerelease);
  if (stable.length === 0) {
    state.set(entry.repo, { ...prev, etag: result.etag });
    return;
  }

  stable.sort((a, b) => {
    const ta = Date.parse(a.published_at ?? a.created_at);
    const tb = Date.parse(b.published_at ?? b.created_at);
    return ta - tb;
  });

  if (prev.last_release_id === undefined) {
    const newest = stable[stable.length - 1]!;
    state.set(entry.repo, {
      etag: result.etag,
      last_release_id: newest.id,
      last_published_at: newest.published_at ?? newest.created_at,
    });
    console.log(`[poll] ${entry.repo}: first sight, baselining at ${newest.tag_name}`);
    return;
  }

  const baseline = prev.last_published_at ? Date.parse(prev.last_published_at) : 0;
  const fresh: Release[] = stable.filter((r) => {
    const t = Date.parse(r.published_at ?? r.created_at);
    return r.id !== prev.last_release_id && t > baseline;
  });

  if (fresh.length === 0) {
    state.set(entry.repo, { ...prev, etag: result.etag });
    return;
  }

  let repoInfo;
  try {
    repoInfo = await fetchRepo(entry.repo);
  } catch (err) {
    console.error(`[poll] ${entry.repo}: repo fetch failed: ${(err as Error).message}`);
    return;
  }

  let newestSent = prev.last_release_id;
  let newestSentTs = prev.last_published_at;
  for (const release of fresh) {
    try {
      await postRelease(client, entry.channel_id, repoInfo, release);
      console.log(`[post] ${entry.repo} ${release.tag_name} -> #${entry.channel_id}`);
      newestSent = release.id;
      newestSentTs = release.published_at ?? release.created_at;
    } catch (err) {
      console.error(
        `[post] ${entry.repo} ${release.tag_name} failed: ${(err as Error).message}`,
      );
    }
  }

  state.set(entry.repo, {
    etag: result.etag,
    last_release_id: newestSent,
    last_published_at: newestSentTs,
  });
}

async function tick(): Promise<void> {
  await Promise.all(config.repos.map((r) => pollRepo(r, config)));
  await state.flush();
}

console.log(`[bot] polling every ${config.poll_interval_seconds}s`);
await tick();

const interval = setInterval(() => {
  if (stopping) return;
  tick().catch((err) => console.error(`[tick] ${(err as Error).message}`));
}, config.poll_interval_seconds * 1000);

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`[bot] ${signal} received, shutting down`);
  clearInterval(interval);
  try {
    await state.flush();
  } catch (err) {
    console.error(`[shutdown] flush failed: ${(err as Error).message}`);
  }
  client.destroy();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
