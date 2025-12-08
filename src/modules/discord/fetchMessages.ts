import { ModuleObject } from "../../types";
import { getStoreValue } from "../../util/dataStore";
import { DisClient } from "./client";
import { Message } from "discord.js-selfbot-v13";

function formatMessageContent(msg: Message): string {
  let content = msg.content || "";

  // Replace user mentions
  msg.mentions.users.forEach((user) => {
    const display = (msg.guild?.members?.resolve(user.id)?.displayName) || user.username;
    const tag = `[MENTION:${user.id} (${display})]`;
    const patterns = [new RegExp(`<@!?${user.id}>`, "g")];
    patterns.forEach((re) => { content = content.replace(re, tag); });
  });

  // Replace role mentions
  msg.mentions.roles.forEach((role) => {
    const tag = `[ROLE:${role.id} (${role.name})]`;
    const re = new RegExp(`<@&${role.id}>`, "g");
    content = content.replace(re, tag);
  });

  // Replace channel mentions
  msg.mentions.channels.forEach((channel) => {
    const tag = `[CHANNEL:${channel.id} (${(channel as any).name || 'unknown'})]`;
    const re = new RegExp(`<#${channel.id}>`, "g");
    content = content.replace(re, tag);
  });

  // Replace custom emojis
  content = content.replace(/<a?:([A-Za-z0-9_~]+):\d+>/g, ":$1:");

  const extras: string[] = [];

  // Embeds
  if (msg.embeds?.length) {
    const embedSummaries = msg.embeds.map((e, idx) => {
      const parts: string[] = [];
      if (e.title) parts.push(`title="${e.title}"`);
      if (e.description) parts.push(`desc="${e.description}"`);
      if (e.url) parts.push(`url=${e.url}`);
      if (e.author?.name) parts.push(`author=${e.author.name}`);
      if (e.footer?.text) parts.push(`footer=${e.footer.text}`);
      return `Embed${msg.embeds.length > 1 ? `#${idx + 1}` : ""}{${parts.join("; ")}}`;
    });
    extras.push(`Embeds: ${embedSummaries.join(" | ")}`);
  }

  // Stickers
  if (msg.stickers.size > 0) {
    extras.push(`Stickers: ${msg.stickers.map(s => s.name).join(", ")}`);
  }

  // Attachments
  if (msg.attachments.size > 0) {
    extras.push(`Attachments: ${msg.attachments.map(a => `${a.name || a.url} (${a.contentType || "file"})`).join(", ")}`);
  }

  const extraText = extras.length ? ` (${extras.join("; ")})` : "";
  return `${content}${extraText}`.trim();
}

export const DiscordFetchMessages: ModuleObject = {
  name: "discord.fetchMessages",
  description: "Fetch recent messages from the current Discord channel. Use this to get context or history when needed. Returns up to the specified limit of messages, formatted for easy reading.",
  payload: {
    limit: "Number of recent messages to fetch (max 20, default 10)",
  },
  execute: async (payload: Record<string, any>) => {
    const channelId = getStoreValue("discord.currentChannelId");
    if (!channelId) {
      return {
        ok: false,
        output: "No channel selected. Please use the discord.switchChannel tool to select a channel first.",
      };
    }

    const limit = Math.min(parseInt(payload.limit) || 10, 20); // Cap at 20

    try {
      const channel = DisClient.channels.cache.get(channelId);
      if (!channel || !("messages" in channel)) {
        return {
          ok: false,
          output: "Invalid channel or not a text channel.",
        };
      }

      const messages = await (channel as any).messages.fetch({ limit });
      const formattedMessages = (Array.from(messages.values()) as Message[])
        .reverse()
        .map((msg: Message) => ({
          id: msg.id,
          author: msg.author.username,
          content: formatMessageContent(msg),
          timestamp: msg.createdTimestamp,
        }));

      return {
        ok: true,
        output: `Fetched ${formattedMessages.length} messages:\n${formattedMessages.map(m => `[${new Date(m.timestamp).toLocaleString()}] ${m.author}: ${m.content}`).join('\n')}`,
      };
    } catch (error) {
      return {
        ok: false,
        output: `Failed to fetch messages: ${error}`,
      };
    }
  },
};