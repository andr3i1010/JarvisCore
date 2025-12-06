import dotenv from "dotenv";
dotenv.config();

import { execSync } from "child_process";
import { log } from "./util/logger";
import { setStoreValue } from "./util/dataStore";
import { getAIProvider } from "./util/ai/provider";
import { loadModulesFromConfig } from "./util/moduleLoader";
import { buildSystemPrompt } from "./util/systemPrompt";
import { startOpenAICompatServer } from "./server/openaiCompat";

function getGitInfo(): string {
  const commit = execSync("git rev-parse --short HEAD").toString().trim();
  const branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
  return `${commit}@${branch}`;
}

export default async function main() {
  setStoreValue("git_commit", getGitInfo());

  if (!process.env.PROVIDER) {
    log("error", "No AI provider specified (process.env.PROVIDER)");
    process.exit(1);
  }

  const aiProvider = getAIProvider(process.env.PROVIDER);
  log("info", `Using AI provider: ${process.env.PROVIDER}`);

  const modules = await loadModulesFromConfig("config.json");
  setStoreValue("modules", modules);
  setStoreValue("system_prompt", buildSystemPrompt(modules));

  const port = Number(process.env.PORT) || 8080;
  startOpenAICompatServer({ port, aiProvider });
}

main().catch((err) => {
  log("error", (err as any)?.stack || String(err));
  process.exit(1);
});