import { Client } from "discord.js-selfbot-v13";
export const DisClient = new Client();
require("dotenv").config();

if (!process.env.DISCORD_SELF_TOKEN) {
  console.error("DISCORD_SELF_TOKEN is not set in environment variables.");
  process.exit(1);
}

DisClient.login(process.env.DISCORD_SELF_TOKEN!).catch((err) => {
  console.error("Failed to login to Discord selfbot:", err);
  process.exit(1);
});