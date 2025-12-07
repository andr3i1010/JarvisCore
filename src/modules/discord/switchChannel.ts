import { ModuleObject } from "../../types";
import { setStoreValue } from "../../util/dataStore";
import { DisClient } from "./client";

export const DiscordSwitchChannel: ModuleObject = {
  name: "discord.switchChannel",
  description: "Switch the channel context for getting, receiving and sending messages",
  payload: {
    channelId: "string"
  },
  execute: async (payload: Record<string, any>) => {
    const channel = DisClient.channels.cache.get(payload.channelId);
    if (channel === undefined) {
      return {
        ok: false,
        output: "Channel with ID " + payload.channelId + " not found.",
      };
    }
    setStoreValue("discord.currentChannelId", payload.channelId);
    return {
      ok: true,
      event: "discord.channelSwitched",
      payload: {
        fullChannelInfo: channel,
      }
    };
  }
}