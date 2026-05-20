import { ChannelType, EmbedBuilder, type Client } from "discord.js";
import type { Release, Repo } from "./github.ts";

const DESCRIPTION_LIMIT = 4000;
const COLOR_STABLE = 0x2ecc71;

function truncateBody(body: string | null, releaseUrl: string, budget: number): string {
  if (!body || !body.trim()) return `[View release on GitHub](${releaseUrl})`;
  const cleaned = body.replace(/\r\n/g, "\n").trim();
  if (cleaned.length <= budget) return cleaned;
  const suffix = `\n\n[… view full release notes on GitHub](${releaseUrl})`;
  const head = cleaned.slice(0, budget - suffix.length).trimEnd();
  return `${head}${suffix}`;
}

export function buildReleaseEmbed(repo: Repo, release: Release): EmbedBuilder {
  const title = release.name?.trim() || release.tag_name;
  const tagPrefix = title === release.tag_name ? "" : `\`${release.tag_name}\`\n\n`;
  const body = truncateBody(release.body, release.html_url, DESCRIPTION_LIMIT - tagPrefix.length);

  const embed = new EmbedBuilder()
    .setColor(COLOR_STABLE)
    .setTitle(title)
    .setURL(release.html_url)
    .setDescription(`${tagPrefix}${body}`)
    .setAuthor({
      name: repo.full_name,
      iconURL: repo.owner.avatar_url,
      url: repo.html_url,
    });

  const ts = release.published_at ?? release.created_at;
  if (ts) embed.setTimestamp(new Date(ts));

  return embed;
}

export async function postRelease(
  client: Client,
  channelId: string,
  repo: Repo,
  release: Release,
): Promise<void> {
  const channel = await client.channels.fetch(channelId);
  if (!channel) throw new Error(`channel ${channelId} not found`);
  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildAnnouncement &&
    channel.type !== ChannelType.PublicThread &&
    channel.type !== ChannelType.PrivateThread &&
    channel.type !== ChannelType.AnnouncementThread
  ) {
    throw new Error(`channel ${channelId} is not a sendable text channel`);
  }
  const embed = buildReleaseEmbed(repo, release);
  await channel.send({ embeds: [embed] });
}
