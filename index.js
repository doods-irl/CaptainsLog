const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  dialog,
  Menu,
  Tray,
} = require("electron");
const path = require("path");
const fs = require("fs");

let setupWin;
let tutorialWin;
let win;
let miniHeight = 90;
let bigHeight = 800;
let configPath;
let filePath;
let tray = null;

app.on("ready", () => {
  tray = new Tray(path.join(__dirname, 'favicon.ico'));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Mini Editor',
      click: () => { showMiniEditor(); }
    },
    {
      label: 'Big Editor',
      click: () => { showBigEditor(); }
    },
    {
      label: 'Tutorial',
      click: () => { createTutorialWindow(); }
    },
    {
      label: 'Close',
      click: () => { app.quit(); }
    }
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

  win = new BrowserWindow({
    width: 800,
    height: miniHeight,
    x: width - 820,
    y: 20,
    frame: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      devTools: false,
    },
    skipTaskbar: true,
  });

  win.loadFile("public/index.html");
  registerShortcuts();
  checkJSON();

  win.on("show", () => {
    serveLogs();
  });

  win.on("blur", () => {
    win.webContents.executeJavaScript("clearText()");
    win.webContents.executeJavaScript("showAllCategories()");
    win.hide();
    win.setResizable(true);
    win.setSize(800, 70);
    win.setResizable(false);
  });

  tray.on('click', () => showBigEditor());
}

function createSetupWindow() {
  setupWin = new BrowserWindow({
    width: 800,
    height: 197,
    frame: false,
    resizable: false,
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
    height: 800,
    frame: false,
    resizable: false,
    webPreferences: {
      contextIsolation: true,
      devTools: false,
    },
  });
  tutorialWin.loadFile("public/tutorial.html");
  tutorialWin.show();

  tutorialWin.on("blur", () => {
    win.hide();
  });
}

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
  const configData = { filePath: filePath };
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
  const editorShortcut = "CommandOrControl+Alt+L";
  const bigEditorShortcut = "CommandOrControl+Alt+K";
  const escapeShortcut = "Escape";

  globalShortcut.register(editorShortcut, () => {
    if (!win.isVisible()) {
      showMiniEditor();
    } else if (win.isVisible()) {
      showBigEditor();
    }
  });

  globalShortcut.register(bigEditorShortcut, () => {
    if (!win.isVisible()) {
      showBigEditor();
    } else {
      win.setSize(800, bigHeight);
    }
  });

  globalShortcut.register(escapeShortcut, () => {
    win.blur();
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

    win.webContents.executeJavaScript(`renderLogs(${data})`);
  });
}

ipcMain.on("refresh-logs", (event) => {
  serveLogs();
});

ipcMain.on("text-submitted", (event, formData) => {
  
  let size = win.getSize();
  if (size[0] === 800 && size[1] === 90) {
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
    let content = formData;
    if (formData.startsWith("/")) {
      const splitData = formData.split(" ");
      category = splitData[0].substring(1); 
      content = splitData.slice(1).join(" ");
    }

    
    let categoryObj = json.categories.find(
      (cat) => cat.name === category.toLowerCase()
    );
    if (!categoryObj) {
      categoryObj = {
        name: category.toLowerCase(),
        logs: [],
      };
      json.categories.push(categoryObj);
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
    });
  });

  setTimeout(() => {
    serveLogs();
  }, 10);
});

ipcMain.on("modify-log-delete", (event, logDataArray) => {
  

  fs.readFile(filePath, (err, data) => {
    if (err) throw err;

    let json = JSON.parse(data);

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

    fs.writeFile(filePath, JSON.stringify(json, null, 2), (err) => {
      if (err) throw err;
    });
  });
});

ipcMain.on("modify-log-done", (event, logDataArray) => {
  

  fs.readFile(filePath, (err, data) => {
    if (err) throw err;

    let json = JSON.parse(data);

    logDataArray.forEach((logData) => {
      let categoryObj = json.categories.find(
        (cat) => cat.name === logData.logCategory
      );
      if (categoryObj) {
        let logObj = categoryObj.logs.find(
          (log) => log.id.toString() === logData.logId
        );
        if (logObj) {
          
          logObj.status = logObj.status === "active" ? "done" : "active";
        }
      }
    });

    
    fs.writeFile(filePath, JSON.stringify(json, null, 2), (err) => {
      if (err) throw err;
    });
  });
});

ipcMain.on("modify-category-delete", (event, categoryName) => {
  fs.readFile(filePath, (err, data) => {
    if (err) throw err;

    let json = JSON.parse(data);

    
    json.categories = json.categories.filter(
      (cat) => cat.name !== categoryName
    );

    
    fs.writeFile(filePath, JSON.stringify(json, null, 2), (err) => {
      if (err) throw err;
    });
  });

  setTimeout(() => {
    serveLogs();
  }, 10);
});

ipcMain.on("modify-category-empty", (event, categoryName) => {
  fs.readFile(filePath, (err, data) => {
    if (err) throw err;

    let json = JSON.parse(data);

    
    let categoryObj = json.categories.find((cat) => cat.name === categoryName);

    if (categoryObj) {
      
      categoryObj.logs.forEach((log) => {
        log.status = "deleted";
      });
    }

    
    fs.writeFile(filePath, JSON.stringify(json, null, 2), (err) => {
      if (err) throw err;
    });
  });

  setTimeout(() => {
    serveLogs();
  }, 10);
});

ipcMain.on("modify-category-move", (event, categoryName, position) => {
  fs.readFile(filePath, (err, data) => {
    if (err) throw err;

    let json = JSON.parse(data);

    
    const categoryIndex = json.categories.findIndex(
      (cat) => cat.name === categoryName
    );

    if (categoryIndex !== -1) {
      
      const [categoryObj] = json.categories.splice(categoryIndex, 1);

      
      position = Math.max(0, Math.min(position, json.categories.length));

      
      json.categories.splice(position, 0, categoryObj);

      
      fs.writeFile(filePath, JSON.stringify(json, null, 2), (err) => {
        if (err) throw err;
      });
    } else {
    }
  });

  setTimeout(() => {
    serveLogs();
  }, 10);
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
