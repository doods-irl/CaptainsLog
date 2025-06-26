const {
  app,
  BrowserWindow,
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

let setupWin;
let tutorialWin;
let settingsWin;
let win;
let miniHeight = 90;
let bigHeight = 800;
let configPath;
let filePath;
let tray = null;
let accentColor;
let themeColor;
const editorShortcut = "CommandOrControl+Alt+L";
const bigEditorShortcut = "CommandOrControl+Alt+K";
const escapeShortcut = "Escape";
const singleInstanceLock = app.requestSingleInstanceLock();
const appFolder = path.dirname(process.execPath);
const exeName = path.resolve(appFolder, '..', `Captain's Log.exe`);

if (!singleInstanceLock) {
  app.quit();
}

app.on("second-instance", (event, commandLine, workingDirectory) => {
  setTimeout(() => {
    showBigEditor();
  }, 100);
});

app.setLoginItemSettings({
  openAtLogin: true,
  args: [
    '--processStart', `"${exeName}"`,
    '--process-start-args', '"--hidden"'
  ]
})

app.on("ready", () => {
  tray = new Tray(path.join(__dirname, "favicon.ico"));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Mini Editor",
      click: () => {
        showMiniEditor();
      },
    },
    {
      label: "Big Editor",
      click: () => {
        showBigEditor();
      },
    },
    {
      label: "Tutorial",
      click: () => {
        createTutorialWindow();
      },
    },
    {
      label: "Settings",
      click: () => {
        createSettingsWindow();
      },
    },
    {
      label: "Close",
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip(`Captain's Log`);
  tray.setContextMenu(contextMenu);

  let setupComplete = checkSetupComplete();

  if (setupComplete) {
    createWindow();
  } else {
    createSetupWindow();
  }
});

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  getAccentColor();

  win = new BrowserWindow({
    width: 800,
    height: 90,
    x: width - 820,
    y: 20,
    frame: false,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      devTools: true,
    },
    skipTaskbar: true,
  });

  win.loadFile("public/index.html");
  registerShortcuts();
  checkJSON();

  win.on("show", () => {
    serveLogs();
    globalShortcut.register(escapeShortcut, () => {
      win.blur();
    });
  });

  win.on("blur", () => {
    win.webContents.executeJavaScript("clearText()");
    win.webContents.executeJavaScript("showAllCategories()");
    globalShortcut.unregister(escapeShortcut);
    win.hide();
    win.setResizable(true);
    win.setSize(800, 70);
    win.setResizable(false);
  });

  tray.on("click", () => showBigEditor());
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
      devTools: false,
    },
  });
  setupWin.loadFile("public/setup.html");
}

function createTutorialWindow() {
  tutorialWin = new BrowserWindow({
    width: 800,
    height: 1000,
    frame: false,
    resizable: false,
    icon: "favicon.ico",
    webPreferences: {
      preload: path.join(__dirname, "tutorialPreload.js"),
      contextIsolation: true,
      devTools: false,
    },
  });
  tutorialWin.loadFile("public/tutorial.html");
  tutorialWin.show();
}

ipcMain.on("close-tutorial-window", (event) => {
  tutorialWin.close();
});

function createSettingsWindow() {
  const escapedConfigPath = configPath.replace(/\\/g, "\\\\");
  const escapedFilePath = filePath.replace(/\\/g, "\\\\");

  settingsWin = new BrowserWindow({
    width: 800,
    height: 456,
    frame: false,
    resizable: false,
    icon: "favicon.ico",
    webPreferences: {
      preload: path.join(__dirname, "settingsPreload.js"),
      contextIsolation: true,
      devTools: false,
    },
  });
  settingsWin.loadFile("public/settings.html");
  settingsWin.show();
  settingsWin.webContents.executeJavaScript(
    `enumerateData("${escapedConfigPath}", "${escapedFilePath}")`
  );
}

ipcMain.on("open-explorer", (event, path) => {
  shell.openPath(path).then((err) => {
    if (err) {
      console.error("Error opening path:", err);
    }
  });
});

ipcMain.on("close-settings-window", (event) => {
  settingsWin.close();
});

function checkSetupComplete() {
  const userDataPath = app.getPath("userData");
  configPath = path.join(userDataPath, "config.json");

  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      filePath = config.filePath;
      return true;
    } catch (error) {
      console.error("Error reading config file:", error);
      return false;
    }
  }
  return false;
}

function getAccentColor() {
  fs.readFile(configPath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading the file:", err);
      return;
    }

    try {
      const config = JSON.parse(data);
      accentColor = config.color;
      themeColor = config.theme;
    } catch (parseErr) {
      accentColor = "tomato";
      themeColor = "light";
      console.error("Error parsing JSON:", parseErr);
    }
  });
}

ipcMain.on("commit-color-to-config", (event, colorId) => {
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  config.color = colorId;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  accentColor = colorId;
  win.webContents.executeJavaScript(`setTheme('${accentColor}', '${themeColor}')`);
});

ipcMain.on("commit-theme-to-config", (event, themeId) => {
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  config.theme = themeId;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  themeColor = themeId;
  win.webContents.executeJavaScript(`setTheme('${accentColor}', '${themeColor}')`);
});

ipcMain.on("open-file-dialog", async (event) => {
  const { filePaths } = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  if (filePaths && filePaths.length > 0) {
    event.sender.send("selected-directory", filePaths[0]);
  }
});

ipcMain.on("receive-setup-path", (event, receivedPath) => {
  filePath = path.join(receivedPath, "captainsLogs.json");
  const configData = { filePath: filePath, color: "tomato", theme: "light" };
  fs.writeFile(configPath, JSON.stringify(configData), (err) => {
    if (err) {
      console.error("Error writing config file:", err);
      return;
    }

    if (setupWin) {
      setupWin.close();
      createWindow();
      createTutorialWindow();
    }
  });
});

function registerShortcuts() {
  globalShortcut.register(editorShortcut, () => {
    if (!win.isVisible()) {
      showMiniEditor();
    } else if (win.isVisible()) {
      win.setSize(800, bigHeight);
    }
  });

  globalShortcut.register(bigEditorShortcut, () => {
    if (!win.isVisible()) {
      showBigEditor();
    } else {
      win.setSize(800, bigHeight);
    }
  });
}

function showMiniEditor() {
  serveLogs();
  win.webContents.executeJavaScript("clearText()");
  win.show();
  win.setSize(800, miniHeight);
  win.webContents.executeJavaScript("focusText()");
}

function showBigEditor() {
  serveLogs();
  win.webContents.executeJavaScript("clearText()");
  win.show();
  win.setSize(800, bigHeight);
  win.webContents.executeJavaScript("focusText()");
}

function checkJSON() {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "{}");
  }
}

function serveLogs() {
  fs.readFile(filePath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading the file:", err);
      return;
    }
    win.webContents.executeJavaScript(`setTheme('${accentColor}', '${themeColor}')`);
    win.webContents.executeJavaScript(`renderLogs(${data})`);
  });
}

function updateLogs(modifierFn, callback) {
  fs.readFile(filePath, (err, data) => {
    if (err) throw err;

    let json = JSON.parse(data);
    modifierFn(json);

    fs.writeFile(filePath, JSON.stringify(json, null, 2), (err) => {
      if (err) throw err;
      if (callback) callback();
    });
  });
}

ipcMain.on("refresh-logs", (event) => {
  serveLogs();
});

ipcMain.on("request-hide", (event) => {
  let size = win.getSize();
  if (size[1] < 200) {
    win.blur();
  }
});

ipcMain.on("text-submitted", (event, formData) => {
  let size = win.getSize();
  if (size[1] < 200) {
    win.blur();
  }

  fs.readFile(filePath, (err, data) => {
    if (err && err.code === "ENOENT") {
      var json = { categories: [] };
    } else if (err) {
      throw err;
    } else {
      var json = JSON.parse(data);
    }

    if (!json.categories) {
      json.categories = [];
    }

    let category = "notes";
    let subCategory = null;
    let content = formData;
    if (formData.startsWith("/")) {
      const splitData = formData.split(" ");
      const fullPath = splitData[0].substring(1);
      const pathParts = fullPath.split(':');

      category = pathParts[0].toLowerCase();
      if (pathParts.length > 1) {
        subCategory = `${category}:${pathParts[1].toLowerCase()}`;
      }
      content = splitData.slice(1).join(" ");
    }

    let categoryObj = json.categories.find(cat => cat.name === category);
    if (!categoryObj) {
      categoryObj = {
        name: category,
        status: "active",
        logs: [],
      };
      json.categories.push(categoryObj);
    } else {
      if (categoryObj.status === "deleted") {
        categoryObj.status = "active";
        json.categories.forEach(cat => {
          if (cat.name.startsWith(category + ':') && cat.status === "deleted") {
            cat.status = "active";
          }
        });
      }
    }

    if (subCategory) {
      let subCategoryObj = json.categories.find(cat => cat.name === subCategory);
      if (!subCategoryObj) {
        subCategoryObj = {
          name: subCategory,
          status: "active",
          logs: [],
        };
        json.categories.push(subCategoryObj);
      } else {
        if (subCategoryObj.status === "deleted") {
          subCategoryObj.status = "active";
        }
      }
      categoryObj = subCategoryObj;
    }

    if (content != "") {
      const newLog = {
        id: categoryObj.logs.length + 1,
        content: content,
        status: "active",
      };
      categoryObj.logs.push(newLog);
    }

    fs.writeFile(filePath, JSON.stringify(json, null, 2), (err) => {
      if (err) throw err;
      serveLogs();
    });
  });
});

ipcMain.on("modify-log-edit", (event, logDataArray) => {
  updateLogs((json) => {
    logDataArray.forEach((logData) => {
      let categoryObj = json.categories.find(
        (cat) => cat.name === logData.category
      );
      if (categoryObj) {
        let logObj = categoryObj.logs.find(
          (log) => log.id.toString() === logData.id
        );
        if (logObj) {
          logObj.content = logData.content;
        }
      }
    });
  }, serveLogs);
});

ipcMain.on("modify-log-delete", (event, logDataArray) => {
  updateLogs((json) => {
    logDataArray.forEach((logData) => {
      let categoryObj = json.categories.find(
        (cat) => cat.name === logData.logCategory
      );
      if (categoryObj) {
        let logObj = categoryObj.logs.find(
          (log) => log.id.toString() === logData.logId
        );
        if (logObj) {
          logObj.status = "deleted";
        }
      }
    });
  }, serveLogs);
});

ipcMain.on("modify-log-done", (event, logDataArray) => {
  updateLogs((json) => {
    logDataArray.forEach((logData) => {
      let categoryObj = json.categories.find(
        (cat) => cat.name === logData.logCategory
      );
      if (categoryObj) {
        let logIdInt = parseInt(logData.logId);

        let logObj = categoryObj.logs.find((log) => log.id === logIdInt);
        if (logObj) {
          logObj.status = logObj.status === "active" ? "done" : "active";
        }
      }
    });
  }, serveLogs);
});

ipcMain.on("modify-category-delete", (event, categoryName) => {
  updateLogs((json) => {
    json.categories.forEach(cat => {
      if (cat.name === categoryName || cat.name.startsWith(categoryName + ':')) {
        cat.status = "deleted";
      }
    });
  }, serveLogs);
});

ipcMain.on("modify-category-empty", (event, categoryName) => {
  updateLogs((json) => {
    let categoryObj = json.categories.find((cat) => cat.name === categoryName);

    if (categoryObj) {
      categoryObj.logs.forEach((log) => {
        log.status = "deleted";
      });
    }
  }, serveLogs);
});

ipcMain.on("modify-category-move", (event, categoryName, position) => {
  updateLogs((json) => {
    const categoryIndex = json.categories.findIndex(
      (cat) => cat.name === categoryName
    );

    if (categoryIndex !== -1) {
      const [categoryObj] = json.categories.splice(categoryIndex, 1);
      position = Math.max(0, Math.min(position, json.categories.length));
      json.categories.splice(position, 0, categoryObj);
    }
  }, serveLogs);
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
