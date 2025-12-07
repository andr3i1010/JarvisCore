import { Client } from "discord.js-selfbot-v13";
export const DisClient = new Client();

if (!process.env.DISCORD_SELF_TOKEN) {
  console.error("DISCORD_SELF_TOKEN is not set in environment variables.");
  process.exit(1);
}

DisClient.login(process.env.DISCORD_SELF_TOKEN!);