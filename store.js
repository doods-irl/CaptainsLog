const fs = require("fs/promises");

const DEFAULT_LOGS = { categories: [] };

class JsonStore {
  constructor(filePath, fallbackValue = DEFAULT_LOGS) {
    this.filePath = filePath;
    this.fallbackValue = fallbackValue;
    this.queue = Promise.resolve();
  }

  enqueue(work) {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => {});
    return next;
  }

  async ensureFile() {
    try {
      await fs.access(this.filePath);
    } catch {
      await this.write(this.cloneFallback());
    }
  }

  async read() {
    await this.ensureFile();
    const raw = await fs.readFile(this.filePath, "utf8");

    if (!raw.trim()) {
      return this.cloneFallback();
    }

    const parsed = JSON.parse(raw);

    if (!parsed.categories || !Array.isArray(parsed.categories)) {
      parsed.categories = [];
    }

    return parsed;
  }

  async write(value) {
    await fs.writeFile(this.filePath, JSON.stringify(value, null, 2), "utf8");
  }

  async get() {
    return this.enqueue(async () => this.read());
  }

  async update(mutator) {
    return this.enqueue(async () => {
      const data = await this.read();
      await mutator(data);
      await this.write(data);
      return data;
    });
  }

  cloneFallback() {
    return JSON.parse(JSON.stringify(this.fallbackValue));
  }
}

module.exports = {
  JsonStore,
  DEFAULT_LOGS,
};
