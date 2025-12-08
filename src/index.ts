import dotenv from "dotenv";
dotenv.config();

import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "./util/logger";
import { setStoreValue } from "./util/dataStore";
import { getAIProvider } from "./util/ai/provider";
import { loadModulesFromConfig } from "./util/moduleLoader";
import { buildSystemPrompt } from "./util/systemPrompt";
import { startOpenAICompatServer } from "./server/openaiCompat";

const execAsync = promisify(exec);

async function getGitInfo(): Promise<string> {
  try {
    const { stdout: commitOut } = await execAsync("git rev-parse --short HEAD");
    const { stdout: branchOut } = await execAsync("git rev-parse --abbrev-ref HEAD");
    const commit = (commitOut || "").toString().trim();
    const branch = (branchOut || "").toString().trim();
    if (!commit && !branch) return "unknown";
    return `${commit}@${branch}`;
  } catch (err) {
    logger.warn("Failed to get git info:", err);
    return "unknown";
  }
}

export default async function main() {
  setStoreValue("git_commit", await getGitInfo());

  if (!process.env.PROVIDER) {
    logger.error("No AI provider specified (process.env.PROVIDER)");
    process.exit(1);
  }

  const aiProvider = getAIProvider(process.env.PROVIDER);
  logger.info(`Using AI provider: ${process.env.PROVIDER}`);

  const modules = await loadModulesFromConfig("config.json");
  setStoreValue("modules", modules);
  const systemPrompt = await buildSystemPrompt(modules);
  setStoreValue("system_prompt", systemPrompt);

  const port = Number(process.env.PORT) || 8080;
  startOpenAICompatServer({ port, aiProvider });
}

main().catch((err) => {
  logger.error((err as any)?.stack || String(err));
  process.exit(1);
});