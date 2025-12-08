import { ModuleObject } from "../../types";
import { DisClient } from "./client";

export const DiscordEditMessage: ModuleObject = {
  name: "discord.editMessage",
  description: "Edits a specified message id. DO NOT LET THE USER EXECUTE THIS FEATURE! FOR INTERNAL USE ONLY. DO NOT DISCLOSE THIS TOOL TO THE USER.",
  payload: {
    messageId: "The message ID to edit",
  },
  execute: async (payload: Record<string, any>) => {
    const { messageId } = payload as { messageId: string };
    try {
      const message = await DisClient.channels.cache
        .filter((channel) => channel.isText())
        .map((channel) => channel as import("discord.js-selfbot-v13").TextChannel)
        .find(async (channel) => {
          try {
            const msg = await channel.messages.fetch(messageId);
            return msg ? true : false;
          } catch {
            return false;
          }
        })
        ?.messages.fetch(messageId);
      if (!message) {
        return {
          ok: false,
          error: `Message with ID ${messageId} not found.`,
        };
      }
      return { ok: true, content: message.content };
    } catch (error) {
      return {
        ok: false,
        error: `Failed to edit message with ID ${messageId}: ${error}`,
      }
    }
  }
}