import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { log } from "./logger";
import type { ModuleObject } from "../types";

async function loadURLModule(url: string): Promise<any> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    const isJavaScript =
      contentType.includes("application/javascript") ||
      contentType.includes("text/javascript") ||
      contentType.includes("application/x-javascript") ||
      url.endsWith(".js");

    if (!isJavaScript && !url.includes("raw")) {
      throw new Error(
        `Content-Type must be JavaScript or URL must be raw/js: ${contentType}`
      );
    }

    const code = await response.text();
    const dynamicModule = await import(
      `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
    );
    return Object.values(dynamicModule)[0];
  } catch (err) {
    throw new Error(`Failed to load URL module ${url}: ${err}`);
  }
}

export async function loadModulesFromConfig(configPath: string): Promise<ModuleObject[]> {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const moduleObjects: ModuleObject[] = [];

  for (const modulePath of config.modules) {
    try {
      let moduleObj: any;
      if (modulePath.startsWith("http://") || modulePath.startsWith("https://")) {
        moduleObj = await loadURLModule(modulePath);
      } else {
        const projectRoot = path.resolve(__dirname, "../..");
        const resolvedPath = path.resolve(projectRoot, modulePath);
        const mod = await import(pathToFileURL(resolvedPath).href);
        moduleObj = Object.values(mod)[0] as any;
      }

      if (!moduleObj || typeof moduleObj.name !== "string" || typeof moduleObj.execute !== "function") {
        log("error", `Skipping invalid module at ${modulePath}. Expected { name: string, execute: function }`);
        continue;
      }

      moduleObjects.push(moduleObj as ModuleObject);
      log("info", `Loaded module: ${moduleObj.name}`);
    } catch (err) {
      log("error", `Failed to load module ${modulePath}: ${err}`);
    }
  }

  return moduleObjects;
}
