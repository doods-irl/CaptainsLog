const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require("electron");
const path = require('path');
const fs = require('fs');

// try {
//     require('electron-reloader')(module, {
//       watchRenderer: true,
//       watchExtensions: ['js', 'html', 'css'],
//     });
//   } catch (_) {}

let win;
let miniHeight = 90;
let bigHeight = 800;
const filePath = path.join(__dirname, 'captainsLogs.json');

app.on('ready', () => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    win = new BrowserWindow({
        width: 800,
        height: miniHeight,
        x: width - 820,
        y: 20,
        frame: false,
        resizable: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
        },
        skipTaskbar: true,
    });

    win.loadFile("public/index.html");
    registerShortcuts();
    checkJSON();

    win.on('blur', () => {
        win.webContents.executeJavaScript('clearText()');
        win.webContents.executeJavaScript('showAllCategories()');
        win.hide();
    });

    win.on('hide', () => {
        win.setResizable(true);
        win.setSize(800, 70);
        win.setResizable(false);
    });
});

function registerShortcuts() {
    const miniEditorShortcut = 'CommandOrControl+Alt+K';
    const bigEditorShortcut = 'CommandOrControl+Alt+L';
    const escapeShortcut = 'Escape';

    globalShortcut.register(miniEditorShortcut, () => {
        if (!win.isVisible()) {
            showMiniEditor();
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
    win.webContents.executeJavaScript('clearText()');
    win.show();
    win.setSize(800, miniHeight);
    win.webContents.executeJavaScript('focusText()');
}

function showBigEditor() {
    win.webContents.executeJavaScript('clearText()');
    win.show();
    win.setSize(800, bigHeight);
    win.webContents.executeJavaScript('focusText()');
}

function checkJSON() {
    const filePath = path.join(__dirname, 'captainsLogs.json');
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '{}');
    }
}

function serveLogs() {
    // Read the file content
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading the file:', err);
            return;
        }
  
        win.webContents.executeJavaScript(`renderLogs(${data})`);
    });
}

ipcMain.on('refresh-logs', (event) => {
    serveLogs();
});

ipcMain.on('text-submitted', (event, formData) => {
    // Handle window blur based on size
    let size = win.getSize();
    if (size[0] === 800 && size[1] === 90) {
        win.blur(); // Blurs the window
    }

    // Read the existing JSON data
    fs.readFile(filePath, (err, data) => {
        if (err && err.code === 'ENOENT') {
            var json = { categories: [] };
        } else if (err) {
            throw err;
        } else {
            var json = JSON.parse(data);
        }

        // Initialize categories array if it doesn't exist
        if (!json.categories) {
            json.categories = [];
        }

        // Determine the category and content
        let category = "Notes";
        let content = formData;
        if (formData.startsWith('/')) {
            const splitData = formData.split(' ');
            category = splitData[0].substring(1); // Remove the leading '/'
            content = splitData.slice(1).join(' ');
        }

        // Find or create the category in the JSON
        let categoryObj = json.categories.find(cat => cat.name === category);
        if (!categoryObj) {
            categoryObj = {
                name: category.toLowerCase(),
                logs: []
            };
            json.categories.push(categoryObj);
        }

        // Add the new log entry
        const newLog = {
            id: categoryObj.logs.length + 1, // Incremental ID, might need more sophisticated logic in a real app
            content: content,
            status: 'active'
        };
        categoryObj.logs.push(newLog);
        console.log(json);

        // Write the updated JSON data to the file
        fs.writeFile(filePath, JSON.stringify(json, null, 2), (err) => {
            if (err) throw err;
            console.log('Data written to file');
        });
    });

    setTimeout(() => {
        serveLogs();
    }, 10);
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});