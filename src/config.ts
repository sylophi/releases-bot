import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type RepoConfig = {
  repo: string;
  channel_id: string;
};

export type Config = {
  poll_interval_seconds: number;
  repos: RepoConfig[];
};

const REPO_RE = /^[^/\s]+\/[^/\s]+$/;
const DEFAULT_POLL_INTERVAL = 60;
const MIN_POLL_INTERVAL = 30;

function normalizeConfig(value: unknown): Config {
  if (!value || typeof value !== "object") {
    throw new Error("config must be an object");
  }
  const cfg = value as Record<string, unknown>;

  let interval = DEFAULT_POLL_INTERVAL;
  if (cfg.poll_interval_seconds !== undefined) {
    if (typeof cfg.poll_interval_seconds !== "number" || cfg.poll_interval_seconds < MIN_POLL_INTERVAL) {
      throw new Error(`poll_interval_seconds must be a number >= ${MIN_POLL_INTERVAL}`);
    }
    interval = cfg.poll_interval_seconds;
  }

  const reposRaw = cfg.repos ?? [];
  if (!Array.isArray(reposRaw)) {
    throw new Error("repos must be an array");
  }
  const repos: RepoConfig[] = [];
  for (const [i, entry] of reposRaw.entries()) {
    if (!entry || typeof entry !== "object") {
      throw new Error(`repos[${i}] must be an object`);
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.repo !== "string" || !REPO_RE.test(e.repo)) {
      throw new Error(`repos[${i}].repo must be "owner/name"`);
    }
    if (typeof e.channel_id !== "string" || !/^\d+$/.test(e.channel_id)) {
      throw new Error(`repos[${i}].channel_id must be a Discord snowflake string`);
    }
    repos.push({ repo: e.repo, channel_id: e.channel_id });
  }

  return { poll_interval_seconds: interval, repos };
}

export async function loadConfig(path = "config.json"): Promise<Config> {
  const abs = resolve(path);
  let raw: string;
  try {
    raw = await readFile(abs, "utf8");
  } catch (err) {
    throw new Error(`could not read config at ${abs}: ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`config is not valid JSON: ${(err as Error).message}`);
  }
  return normalizeConfig(parsed);
}
