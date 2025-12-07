import { ModuleObject } from "../../types";
import { getStoreValue } from "../../util/dataStore";
import { DisClient } from "./client";

export const DiscordSendMessage: ModuleObject = {
  name: "discord.sendMessage",
  description: "Send a message to the current Discord channel. Selecting a discord channel is required before sending messages. This can be done using the discord.switchChannel tool.",
  execute: async (payload: Record<string, any>) => {
    const channelId = getStoreValue("discord.currentChannelId");
    if (!channelId) {
      return {
        ok: false,
        output: "No channel selected. Please use the discord.switchChannel tool to select a channel first.",
      };
    }
    const channel = DisClient.channels.cache.get(channelId);
    if (channel === undefined || !channel.isText()) {
      return {
        ok: false,
        output: "Selected channel is invalid or not a text channel.",
      };
    }
    try {
      const sentMessage = await channel.send(payload.message);
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