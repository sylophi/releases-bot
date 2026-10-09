import { REST, Routes } from "discord.js";
import { buildReleaseMessage } from "../src/discord.ts";
import { fetchRelease, fetchRepo } from "../src/github.ts";

const [repo, tag, channelId] = process.argv.slice(2);
if (!repo || !tag || !channelId) {
  console.error("usage: bun run preview <owner/name> <tag> <channel_id>");
  process.exit(1);
}
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN env var is required");
  process.exit(1);
}

const [repoInfo, release] = await Promise.all([fetchRepo(repo), fetchRelease(repo, tag)]);
const rest = new REST().setToken(token);
await rest.post(Routes.channelMessages(channelId), { body: buildReleaseMessage(repoInfo, release) });
console.log(`posted ${repo} ${tag} -> #${channelId}`);
