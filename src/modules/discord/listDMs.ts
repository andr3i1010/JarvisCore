import { DisClient } from "./client";
import { ModuleObject } from "../../types";

export const DiscordListDMs: ModuleObject = {
  name: "discord.listDMs",
  description: "List all direct message channels (DMs) the bot has with other users.",
  execute: async () => {
    let dms = DisClient.channels.cache.filter(channel => channel.type === 'DM' || channel.type === 'GROUP_DM');
    return {
      ok: true,
      payload: {
        dms: dms.map(dm => {
          return {
            id: dm.id,
            name: dm.type === 'DM' ? (dm.recipient.displayName) : dm.name || 'Group DM',
          }
        })
      }
    };
  }
}