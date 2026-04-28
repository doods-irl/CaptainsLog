const {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  screen,
  dialog,
  Menu,
  Tray,
  shell,
} = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const { JsonStore } = require("./store");
const { discoverPlugins } = require("./plugin-loader");

let setupWin;
let tutorialWin;
let settingsWin;
let win;
let tray;
let logStore;
let pluginStateStore;
let plugins = [];
let activePluginId = null;
let editorMode = "mini";

const WINDOW_WIDTH = 800;
const MINI_HEIGHT = 90;
const MIN_BIG_HEIGHT = 520;
const DEFAULT_THEME = { color: "tomato", theme: "light" };
const DEFAULT_PLUGIN_STATE = { plugins: {} };
const editorShortcut = "CommandOrControl+Alt+L";
const bigEditorShortcut = "CommandOrControl+Alt+K";
const escapeShortcut = "Escape";
const singleInstanceLock = app.requestSingleInstanceLock();
const appFolder = path.dirname(process.execPath);
const exeName = path.resolve(appFolder, "..", "Captain's Log.exe");

let configPath;
let filePath;
let accentColor = DEFAULT_THEME.color;
let themeColor = DEFAULT_THEME.theme;

if (!singleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  setTimeout(() => {
    showBigEditor();
  }, 100);
});

app.setLoginItemSettings({
  openAtLogin: true,
  args: ["--processStart", `"${exeName}"`, "--process-start-args", '"--hidden"'],
});

app.whenReady().then(async () => {
  tray = new Tray(path.join(__dirname, "favicon.ico"));
  tray.setToolTip("Captain's Log");
  tray.setContextMenu(buildTrayMenu());
  tray.on("click", () => showBigEditor());

  plugins = (await discoverPlugins(__dirname)).filter((plugin) => plugin.id !== "notes");
  activePluginId = null;

  const userDataPath = app.getPath("userData");
  pluginStateStore = new JsonStore(path.join(userDataPath, "plugin-state.json"), DEFAULT_PLUGIN_STATE);

  const setupComplete = loadConfigFromDisk();

  if (setupComplete) {
    logStore = new JsonStore(filePath);
    await createWindow();
  } else {
    createSetupWindow();
  }
});

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: "Mini Editor", click: () => showMiniEditor() },
    { label: "Big Editor", click: () => showBigEditor() },
    { label: "Tutorial", click: () => createTutorialWindow() },
    { label: "Settings", click: () => createSettingsWindow() },
    { label: "Close", click: () => app.quit() },
  ]);
}

function getPrimaryWorkArea() {
  return screen.getPrimaryDisplay().workArea;
}

function getEditorBounds(height) {
  const workArea = getPrimaryWorkArea();
  const width = Math.min(WINDOW_WIDTH, workArea.width);
  return {
    width,
    height: Math.min(height, workArea.height),
    x: Math.max(workArea.x, workArea.x + workArea.width - width - 20),
    y: workArea.y + 20,
  };
}

function getBigEditorHeight() {
  const workArea = getPrimaryWorkArea();
  return Math.max(MIN_BIG_HEIGHT, Math.min(workArea.height - 40, 900));
}

async function createWindow() {
  win = new BrowserWindow({
    ...getEditorBounds(MINI_HEIGHT),
    frame: false,
    resizable: true,
    minWidth: 420,
    minHeight: MINI_HEIGHT,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      devTools: !app.isPackaged,
    },
  });

  win.on("show", () => {
    globalShortcut.register(escapeShortcut, () => {
      if (win && !win.isDestroyed()) {
        win.blur();
      }
    });
  });

  win.on("blur", () => {
    if (!win || win.isDestroyed()) {
      return;
    }

    sendEditorCommand({ type: "reset-input" });
    globalShortcut.unregister(escapeShortcut);
    win.hide();
    editorMode = "mini";
    win.setBounds(getEditorBounds(MINI_HEIGHT));
  });

  win.webContents.on("did-finish-load", () => {
    pushShellState();
  });

  await win.loadFile("public/index.html");
  registerShortcuts();
  pushShellState();
}

function createSetupWindow() {
  setupWin = new BrowserWindow({
    width: 800,
    height: 197,
    frame: false,
    resizable: false,
    icon: "favicon.ico",
    webPreferences: {
      preload: path.join(__dirname, "setupPreload.js"),
      contextIsolation: true,
      devTools: !app.isPackaged,
    },
  });

  setupWin.loadFile("public/setup.html");
}

function createTutorialWindow() {
  if (tutorialWin && !tutorialWin.isDestroyed()) {
    tutorialWin.focus();
    return;
  }

  tutorialWin = new BrowserWindow({
    width: 800,
    height: 1000,
    frame: false,
    resizable: true,
    minWidth: 560,
    minHeight: 500,
    icon: "favicon.ico",
    webPreferences: {
      preload: path.join(__dirname, "tutorialPreload.js"),
      contextIsolation: true,
      devTools: !app.isPackaged,
    },
  });

  tutorialWin.on("closed", () => {
    tutorialWin = null;
  });

  tutorialWin.loadFile("public/tutorial.html");
}

function createSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    pushSettingsData();
    return;
  }

  settingsWin = new BrowserWindow({
    width: 800,
    height: 520,
    frame: false,
    resizable: true,
    minWidth: 620,
    minHeight: 420,
    icon: "favicon.ico",
    webPreferences: {
      preload: path.join(__dirname, "settingsPreload.js"),
      contextIsolation: true,
      devTools: !app.isPackaged,
    },
  });

  settingsWin.on("closed", () => {
    settingsWin = null;
  });

  settingsWin.webContents.on("did-finish-load", () => {
    pushSettingsData();
  });

  settingsWin.loadFile("public/settings.html");
}

function loadConfigFromDisk() {
  const userDataPath = app.getPath("userData");
  configPath = path.join(userDataPath, "config.json");

  if (!fs.existsSync(configPath)) {
    return false;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    filePath = config.filePath;
    accentColor = config.color || DEFAULT_THEME.color;
    themeColor = config.theme || DEFAULT_THEME.theme;
    return Boolean(filePath);
  } catch (error) {
    console.error("Error reading config file:", error);
    accentColor = DEFAULT_THEME.color;
    themeColor = DEFAULT_THEME.theme;
    return false;
  }
}

async function writeConfig(updates) {
  const nextConfig = {
    filePath,
    color: accentColor,
    theme: themeColor,
    ...updates,
  };

  filePath = nextConfig.filePath;
  accentColor = nextConfig.color;
  themeColor = nextConfig.theme;

  await fsp.writeFile(configPath, JSON.stringify(nextConfig, null, 2), "utf8");
}

async function buildShellState(notesOverride = null) {
  const notes = notesOverride || (logStore ? await logStore.get() : { categories: [] });

  return {
    hostApiVersion: 1,
    activePluginId,
    editorMode,
    plugins,
    theme: {
      accentColor,
      themeColor,
    },
    notes,
  };
}

async function pushShellState(target = win, notesOverride = null) {
  if (!target || target.isDestroyed()) {
    return;
  }

  try {
    const shellState = await buildShellState(notesOverride);
    target.webContents.send("shell-state", shellState);
  } catch (error) {
    console.error("Failed to send shell state:", error);
  }
}

function pushSettingsData() {
  if (!settingsWin || settingsWin.isDestroyed()) {
    return;
  }

  settingsWin.webContents.send("settings-data", {
    configPath,
    filePath,
    accentColor,
    themeColor,
  });
}

function sendEditorCommand(payload) {
  if (!win || win.isDestroyed()) {
    return;
  }

  win.webContents.send("editor-command", payload);
}

function registerShortcuts() {
  globalShortcut.unregister(editorShortcut);
  globalShortcut.unregister(bigEditorShortcut);

  globalShortcut.register(editorShortcut, () => {
    if (!win.isVisible()) {
      showMiniEditor();
      return;
    }

    editorMode = "big";
    win.setBounds(getEditorBounds(getBigEditorHeight()));
    pushShellState();
  });

  globalShortcut.register(bigEditorShortcut, () => {
    showBigEditor();
  });
}

async function showMiniEditor() {
  if (!win || win.isDestroyed()) {
    return;
  }

  editorMode = "mini";
  await pushShellState();
  win.setBounds(getEditorBounds(MINI_HEIGHT));
  win.show();
  sendEditorCommand({ type: "prepare-show", mode: "mini" });
}

async function showBigEditor() {
  if (!win || win.isDestroyed()) {
    return;
  }

  editorMode = "big";
  await pushShellState();
  win.setBounds(getEditorBounds(getBigEditorHeight()));
  win.show();
  sendEditorCommand({ type: "prepare-show", mode: "big" });
}

function parseEntry(formData) {
  let category = "notes";
  let subCategory = null;
  let content = formData;

  if (formData.startsWith("/")) {
    const splitData = formData.split(" ");
    const fullPath = splitData[0].substring(1);
    const pathParts = fullPath.split(":");

    category = pathParts[0].toLowerCase();

    if (pathParts.length > 1) {
      subCategory = `${category}:${pathParts[1].toLowerCase()}`;
    }

    content = splitData.slice(1).join(" ");
  }

  return { category, subCategory, content };
}

function ensureCategory(json, categoryName) {
  let categoryObj = json.categories.find((cat) => cat.name === categoryName);

  if (!categoryObj) {
    categoryObj = {
      name: categoryName,
      status: "active",
      logs: [],
    };
    json.categories.push(categoryObj);
  } else if (categoryObj.status === "deleted") {
    categoryObj.status = "active";
  }

  return categoryObj;
}

function restoreSubcategories(json, categoryName) {
  json.categories.forEach((cat) => {
    if (cat.name.startsWith(`${categoryName}:`) && cat.status === "deleted") {
      cat.status = "active";
    }
  });
}

async function addEntry(formData) {
  return logStore.update(async (json) => {
    const { category, subCategory, content } = parseEntry(formData);

    let categoryObj = ensureCategory(json, category);
    restoreSubcategories(json, category);

    if (subCategory) {
      categoryObj = ensureCategory(json, subCategory);
    }

    if (content !== "") {
      categoryObj.logs.push({
        id: categoryObj.logs.reduce((maxId, log) => Math.max(maxId, log.id || 0), 0) + 1,
        content,
        status: "active",
      });
    }
  });
}

async function editLogs(logDataArray) {
  return logStore.update(async (json) => {
    logDataArray.forEach((logData) => {
      const categoryObj = json.categories.find((cat) => cat.name === logData.category);
      const logObj = categoryObj?.logs.find((log) => log.id.toString() === logData.id);

      if (logObj) {
        logObj.content = logData.content;
      }
    });
  });
}

async function deleteLogs(logDataArray) {
  return logStore.update(async (json) => {
    logDataArray.forEach((logData) => {
      const categoryObj = json.categories.find((cat) => cat.name === logData.logCategory);
      const logObj = categoryObj?.logs.find((log) => log.id.toString() === logData.logId);

      if (logObj) {
        logObj.status = "deleted";
      }
    });
  });
}

async function toggleDone(logDataArray) {
  return logStore.update(async (json) => {
    logDataArray.forEach((logData) => {
      const categoryObj = json.categories.find((cat) => cat.name === logData.logCategory);
      const logObj = categoryObj?.logs.find((log) => log.id === parseInt(logData.logId, 10));

      if (logObj) {
        logObj.status = logObj.status === "active" ? "done" : "active";
      }
    });
  });
}

async function deleteCategory(categoryName) {
  return logStore.update(async (json) => {
    json.categories.forEach((cat) => {
      if (cat.name === categoryName || cat.name.startsWith(`${categoryName}:`)) {
        cat.status = "deleted";
      }
    });
  });
}

async function emptyCategory(categoryName) {
  return logStore.update(async (json) => {
    const categoryObj = json.categories.find((cat) => cat.name === categoryName);

    if (categoryObj) {
      categoryObj.logs.forEach((log) => {
        log.status = "deleted";
      });
    }
  });
}

async function moveCategory(categoryName, position) {
  return logStore.update(async (json) => {
    const categoryIndex = json.categories.findIndex((cat) => cat.name === categoryName);

    if (categoryIndex === -1) {
      return;
    }

    const [categoryObj] = json.categories.splice(categoryIndex, 1);
    const nextPosition = Math.max(0, Math.min(position, json.categories.length));
    json.categories.splice(nextPosition, 0, categoryObj);
  });
}

async function getPluginData(pluginId) {
  const pluginState = await pluginStateStore.get();
  return pluginState.plugins[pluginId] || {};
}

async function setPluginData(pluginId, value) {
  const updatedState = await pluginStateStore.update(async (json) => {
    json.plugins[pluginId] = value;
  });

  return updatedState.plugins[pluginId] || {};
}

async function dispatchHostCall(method, params = {}) {
  switch (method) {
    case "shell:set-active-plugin": {
      if (plugins.some((plugin) => plugin.id === params.pluginId)) {
        activePluginId = params.pluginId;
        pushShellState();
      }
      return { activePluginId };
    }
    case "shell:list-plugins":
      return plugins;
    case "shell:activate-plugin": {
      if (!plugins.some((plugin) => plugin.id === params.pluginId)) {
        throw new Error(`Unknown plugin: ${params.pluginId}`);
      }
      activePluginId = params.pluginId;
      pushShellState();
      return { activePluginId };
    }
    case "shell:activate-notes":
      activePluginId = "notes";
      pushShellState();
      return { activePluginId };
    case "shell:get-state":
      return buildShellState();
    case "shell:reset-input":
      sendEditorCommand({ type: "reset-input" });
      return { ok: true };
    case "shell:request-hide":
      if (win && !win.isDestroyed()) {
        win.blur();
      }
      return { ok: true };
    case "notes:add-entry": {
      const updatedNotes = await addEntry(params.formData);
      pushShellState(win, updatedNotes);
      return updatedNotes;
    }
    case "notes:edit-logs": {
      const updatedNotes = await editLogs(params.logDataArray || []);
      pushShellState(win, updatedNotes);
      return updatedNotes;
    }
    case "notes:delete-logs": {
      const updatedNotes = await deleteLogs(params.logDataArray || []);
      pushShellState(win, updatedNotes);
      return updatedNotes;
    }
    case "notes:toggle-done": {
      const updatedNotes = await toggleDone(params.logDataArray || []);
      pushShellState(win, updatedNotes);
      return updatedNotes;
    }
    case "notes:delete-category": {
      const updatedNotes = await deleteCategory(params.categoryName);
      pushShellState(win, updatedNotes);
      return updatedNotes;
    }
    case "notes:empty-category": {
      const updatedNotes = await emptyCategory(params.categoryName);
      pushShellState(win, updatedNotes);
      return updatedNotes;
    }
    case "notes:move-category": {
      const updatedNotes = await moveCategory(params.categoryName, params.position);
      pushShellState(win, updatedNotes);
      return updatedNotes;
    }
    case "plugin:get-data":
      return getPluginData(params.pluginId);
    case "plugin:set-data":
      return setPluginData(params.pluginId, params.data);
    case "clipboard:write-text":
      clipboard.writeText(params.text || "");
      return { ok: true };
    default:
      throw new Error(`Unknown host method: ${method}`);
  }
}

ipcMain.on("open-explorer", (_event, targetPath) => {
  shell.openPath(targetPath).then((err) => {
    if (err) {
      console.error("Error opening path:", err);
    }
  });
});

ipcMain.on("close-tutorial-window", () => {
  if (tutorialWin && !tutorialWin.isDestroyed()) {
    tutorialWin.close();
  }
});

ipcMain.on("close-settings-window", () => {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.close();
  }
});

ipcMain.on("request-shell-state", () => {
  pushShellState();
});

ipcMain.handle("shell:invoke", async (_event, payload) => {
  return dispatchHostCall(payload.method, payload.params);
});

ipcMain.on("request-settings-data", () => {
  pushSettingsData();
});

ipcMain.on("commit-color-to-config", async (_event, colorId) => {
  await writeConfig({ color: colorId });
  pushShellState();
  pushSettingsData();
});

ipcMain.on("commit-theme-to-config", async (_event, themeId) => {
  await writeConfig({ theme: themeId });
  pushShellState();
  pushSettingsData();
});

ipcMain.on("open-file-dialog", async (event) => {
  const { filePaths } = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });

  if (filePaths && filePaths.length > 0) {
    event.sender.send("selected-directory", filePaths[0]);
  }
});

ipcMain.on("receive-setup-path", async (_event, receivedPath) => {
  filePath = path.join(receivedPath, "captainsLogs.json");
  await writeConfig({ filePath, color: DEFAULT_THEME.color, theme: DEFAULT_THEME.theme });
  logStore = new JsonStore(filePath);

  if (setupWin && !setupWin.isDestroyed()) {
    setupWin.close();
    setupWin = null;
  }

  await createWindow();
  createTutorialWindow();
});

ipcMain.on("request-hide", () => {
  if (!win || win.isDestroyed()) {
    return;
  }

  const [, height] = win.getSize();

  if (height < 200) {
    win.blur();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
