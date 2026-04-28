const fs = require("fs/promises");
const path = require("path");
const { pathToFileURL } = require("url");

const MANIFEST_PATTERN = /<script[^>]*id=["']captainslog-plugin["'][^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i;

async function discoverPlugins(rootDir) {
  const pluginsDir = path.join(rootDir, "plugins");

  let entries = [];
  try {
    entries = await fs.readdir(pluginsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const plugins = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".plugin.html")) {
      continue;
    }

    const absolutePath = path.join(pluginsDir, entry.name);
    const html = await fs.readFile(absolutePath, "utf8");
    const manifest = parseManifest(html);

    if (!manifest || !manifest.id || !manifest.name) {
      continue;
    }

    plugins.push({
      id: manifest.id,
      name: manifest.name,
      command: manifest.command || manifest.id,
      aliases: Array.isArray(manifest.aliases) ? manifest.aliases : [],
      version: manifest.version || "1.0.0",
      description: manifest.description || "",
      capabilities: Array.isArray(manifest.capabilities) ? manifest.capabilities : [],
      defaultSize: manifest.defaultSize || "big",
      src: pathToFileURL(absolutePath).href,
    });
  }

  plugins.sort((left, right) => left.name.localeCompare(right.name));
  return plugins;
}

function parseManifest(html) {
  const match = MANIFEST_PATTERN.exec(html);

  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

module.exports = {
  discoverPlugins,
};
