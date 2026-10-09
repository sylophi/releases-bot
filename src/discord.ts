import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MessageFlags,
  Routes,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type Client,
} from "discord.js";
import { parseBody, type Block } from "./body.ts";
import type { Release, Repo } from "./github.ts";

const COLOR_STABLE = 0x2ecc71;
// Discord caps a components message at 4000 characters of text and 40 components.
const TEXT_LIMIT = 4000;
const COMPONENT_LIMIT = 40;
// Container, header section (with its text and thumbnail), two separators, button row and button.
const FRAME_COMPONENTS = 8;

function header(repo: Repo, release: Release): string {
  const title = release.name?.trim() || release.tag_name;
  const linkText = title.replace(/[[\]]/g, "\\$&");
  const meta: string[] = [];
  if (title !== release.tag_name) meta.push(`\`${release.tag_name}\``);
  const ts = release.published_at ?? release.created_at;
  if (ts) meta.push(`<t:${Math.floor(Date.parse(ts) / 1000)}:D>`);
  return [
    `-# [${repo.full_name}](${repo.html_url})`,
    `## [${linkText}](${release.html_url})`,
    ...(meta.length > 0 ? [`-# ${meta.join(" · ")}`] : []),
  ].join("\n");
}

/** Keeps the blocks that fit Discord's limits, ending with a link when some had to go. */
function fitBlocks(blocks: Block[], textBudget: number, releaseUrl: string): Block[] {
  const note = `-# [… read the rest on GitHub](${releaseUrl})`;
  const fitted: Block[] = [];
  let text = 0;
  for (const [i, block] of blocks.entries()) {
    const roomForNote = i < blocks.length - 1 ? 1 : 0;
    if (fitted.length + roomForNote >= COMPONENT_LIMIT - FRAME_COMPONENTS) {
      fitted.push({ kind: "text", text: note });
      return fitted;
    }
    if (block.kind === "media") {
      fitted.push(block);
      continue;
    }
    if (text + block.text.length <= textBudget - (roomForNote ? note.length : 0)) {
      fitted.push(block);
      text += block.text.length;
      continue;
    }
    const room = Math.max(0, textBudget - text - note.length - 2);
    const cut = block.text.slice(0, room);
    const brk = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(" "));
    const head = (brk > 0 ? cut.slice(0, brk) : cut).trimEnd();
    fitted.push({ kind: "text", text: head ? `${head}\n\n${note}` : note });
    return fitted;
  }
  return fitted;
}

export function buildReleaseMessage(repo: Repo, release: Release) {
  const headerText = header(repo, release);
  const blocks = fitBlocks(parseBody(release.body), TEXT_LIMIT - headerText.length, release.html_url);

  const container = new ContainerBuilder()
    .setAccentColor(COLOR_STABLE)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(repo.owner.avatar_url)),
    );

  if (blocks.length > 0) container.addSeparatorComponents(new SeparatorBuilder());
  for (const block of blocks) {
    if (block.kind === "text") {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(block.text));
    } else {
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          block.items.map((item) => (b) => {
            b.setURL(item.url);
            if (item.description) b.setDescription(item.description);
            return b;
          }),
        ),
      );
    }
  }

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("View on GitHub").setURL(release.html_url),
      ),
    );

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container.toJSON()],
    // Release notes are other people's text; never let an @everyone in them ping the server.
    allowed_mentions: { parse: [] },
  };
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
  await client.rest.post(Routes.channelMessages(channelId), { body: buildReleaseMessage(repo, release) });
}
