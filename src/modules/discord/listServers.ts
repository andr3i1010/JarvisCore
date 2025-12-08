import { ThreadChannelTypes } from "discord.js-selfbot-v13";
import { ModuleObject } from "../../types";
import { DisClient } from "./client";

export const DiscordListServers: ModuleObject = {
  name: "discord.listServers",
  description: "List all Discord servers (guilds) the bot is a member of. All channels within those servers will also be listed.",
  execute: async () => {
    let servers: { id: string; name: string; channels: { id: string; name: string; type: "GUILD_CATEGORY" | "GUILD_NEWS" | "GUILD_STAGE_VOICE" | "GUILD_STORE" | "GUILD_TEXT" | ThreadChannelTypes | "GUILD_VOICE" | "GUILD_FORUM" | "GUILD_MEDIA"; }[]; }[] = [];
    DisClient.guilds.cache.forEach(guild => {
      let channels: {
        id: string;
        name: string;
        type: "GUILD_CATEGORY" | "GUILD_NEWS" | "GUILD_STAGE_VOICE" | "GUILD_STORE" | "GUILD_TEXT" | ThreadChannelTypes | "GUILD_VOICE" | "GUILD_FORUM" | "GUILD_MEDIA";
      }[] = [];
      guild.channels.cache.forEach(channel => {
        channels.push({
          id: channel.id,
          name: channel.name,
          type: channel.type,
        });
      });
      servers.push({
        id: guild.id,
        name: guild.name,
        channels: channels,
      });
    })
    return {
      ok: true,
      payload: {
        servers: servers
      }
    };
  }
}