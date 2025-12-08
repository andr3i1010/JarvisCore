import { ModuleObject } from "../../types";
import { getStoreValue } from "../../util/dataStore";
import { DisClient } from "./client";

export const DiscordSendMessage: ModuleObject = {
  name: "discord.sendMessage",
  description: "Send a message to the current Discord channel. Selecting a discord channel is required before sending messages. This can be done using the discord.switchChannel tool.",
  payload: {
    message: "The message content to send",
    replyTo: "Optional message ID to reply to",
  },
  execute: async (payload: Record<string, any>) => {
    const channelId = getStoreValue("discord.currentChannelId");
    if (!channelId) {
      return {
        ok: false,
        output: "No channel selected. Please use the discord.switchChannel tool to select a channel first.",
      };
    }
    // Prefer fetching the channel so we don't rely on cache; make sure it's a text channel
    const channel = await DisClient.channels.fetch(channelId).catch(() => undefined) as any;
    if (!channel || (typeof channel.send !== "function" && !channel.isText?.())) {
      return {
        ok: false,
        output: "Selected channel is invalid or not a text channel.",
      };
    }
    try {
      // Normalize message and convert mention/role/channel tokens into proper Discord mention syntax
      let content = typeof payload.message === 'string' ? payload.message : String(payload.message);
      const userIds = new Set<string>();
      const roleIds = new Set<string>();

      // Tokens like [MENTION:123456789012345678] or nested tokens like Token:[MENTION:123...]
      const mentionTokenRe = /\[MENTION:(\d+)\]/g;
      content = content.replace(mentionTokenRe, (_m, id) => {
        userIds.add(id);
        return `<@${id}>`;
      });

      // Tokens like [ROLE:123456789012345678]
      const roleTokenRe = /\[ROLE:(\d+)\]/g;
      content = content.replace(roleTokenRe, (_m, id) => {
        roleIds.add(id);
        return `<@&${id}>`;
      });

      // Tokens like [CHANNEL:123456789012345678]
      const channelTokenRe = /\[CHANNEL:(\d+)\]/g;
      content = content.replace(channelTokenRe, (_m, id) => `<#${id}>`);

      // Also detect raw mention forms <@123...> and <@!123...>
      const rawUserMentionRe = /<@!?(\d+)>/g;
      let rawMatch;
      while ((rawMatch = rawUserMentionRe.exec(content)) !== null) {
        userIds.add(rawMatch[1]);
      }

      // Detect raw role mentions <@&123...>
      const rawRoleMentionRe = /<@&(\d+)>/g;
      while ((rawMatch = rawRoleMentionRe.exec(content)) !== null) {
        roleIds.add(rawMatch[1]);
      }

      // Filter IDs to valid Discord snowflake strings to avoid 'Invalid Form Body/Snowflake' errors
      const idFilter = (id: string) => typeof id === 'string' && /^\d{17,20}$/.test(id);
      const users = Array.from(userIds).filter(idFilter);
      const roles = Array.from(roleIds).filter(idFilter);
      const allowedMentions: Record<string, any> = { parse: [] };
      if (users.length > 0) allowedMentions.users = users;
      if (roles.length > 0) allowedMentions.roles = roles;

      let sentMessage;
      // Accept both camelCase `replyTo` and lower-case `replyto` for model compatibility
      const replyId = payload.replyTo || payload.replyto;
      if (replyId) {
        // Validate replyId
        if (!/^[0-9]+$/.test(String(replyId))) {
          return {
            ok: false,
            output: `Invalid reply id provided: ${replyId}`,
          };
        }
        try {
          const toReply = await channel.messages.fetch(String(replyId));
          // If message exists, reply to it. Otherwise, fallback to sending as a non-reply message.
          sentMessage = await toReply.reply({ content, allowedMentions });
        } catch (err: any) {
          // If fetching or replying fails, attempt to send the message normally and return a warning
          try {
            const fallback = await (channel as any).send({ content, allowedMentions });
            return {
              ok: true,
              output: fallback,
              warning: `Failed to reply to message ${replyId}; message sent as normal instead: ${err.message || String(err)}`,
            };
          } catch (sendErr: any) {
            return {
              ok: false,
              output: `Failed to reply to message ${replyId} and failed to send message: ${err.message || String(err)}; / ${sendErr.message || String(sendErr)}`,
            };
          }
        }
      } else {
        sentMessage = await (channel as any).send({ content, allowedMentions });
      }
      return {
        ok: true,
        output: sentMessage,
      };
    } catch (error: any) {
      return {
        ok: false,
        output: `Failed to send message: ${error.message || String(error)}`,
      };
    }
  }
}