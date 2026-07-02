(function () {
  const tauri = window.__TAURI__;
  const shellStateListeners = [];
  const editorCommandListeners = [];
  const settingsDataListeners = [];
  const selectedDirectoryListeners = [];
  let reportError = (source, message) => {
    console.error(`[${source}] ${message}`);
  };

  if (!tauri) {
    installUnavailableHostApi("Tauri host API was not injected into this window.");
    return;
  }

  if (!tauri.core?.invoke || !tauri.event?.listen) {
    installUnavailableHostApi("Tauri host API is incomplete in this window.");
    return;
  }

  const invoke = tauri.core.invoke;
  const listen = tauri.event.listen;
  const convertFileSrc = tauri.core.convertFileSrc || ((path) => path);
  reportError = (source, message) => {
    invoke("report_frontend_error", { source, message }).catch((error) => {
      console.error("Failed to report frontend error", error);
    });
  };

  window.addEventListener("error", (event) => {
    reportError(
      "window.error",
      `${event.message || "unknown error"} at ${event.filename || "unknown"}:${event.lineno || 0}:${event.colno || 0}`
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportError("unhandledrejection", stringifyReason(event.reason));
  });

  document.addEventListener("DOMContentLoaded", () => {
    reportError("lifecycle", `DOMContentLoaded ${window.location.href}`);
  });

  reportError("lifecycle", `tauri-api loaded ${window.location.href}`);

  listen("shell-state", (event) => {
    reportError("event", "shell-state received");
    const payload = normalizeShellState(event.payload);
    shellStateListeners.forEach((callback) => callback(payload));
  });

  listen("editor-command", (event) => {
    reportError("event", `editor-command ${JSON.stringify(event.payload)}`);
    editorCommandListeners.forEach((callback) => callback(event.payload));
  });

  listen("settings-data", (event) => {
    reportError("event", "settings-data received");
    settingsDataListeners.forEach((callback) => callback(event.payload));
  });

  window.hostAPI = {
    requestShellState: async () => {
      reportError("command", "requestShellState");
      const payload = await invoke("get_shell_state");
      shellStateListeners.forEach((callback) => callback(normalizeShellState(payload)));
    },
    requestHide: () => invoke("invoke_host", { method: "shell:request-hide", params: {} }),
    showEditor: (mode, options = {}) => invoke("show_editor", {
      mode,
      preserveInput: Boolean(options.preserveInput),
    }),
    invokeHost: (method, params) => invoke("invoke_host", { method, params }),
    onShellState: (callback) => shellStateListeners.push(callback),
    onEditorCommand: (callback) => editorCommandListeners.push(callback),

    closeWindow: () => invoke("close_window", { label: currentWindowLabel() }),
    openExplorer: (path) => invoke("open_path", { path }),
    sendColor: (colorId) => invoke("commit_color_to_config", { colorId }),
    sendTheme: (themeId) => invoke("commit_theme_to_config", { themeId }),
    requestData: async () => {
      reportError("command", "requestData");
      const payload = await invoke("get_settings_data");
      settingsDataListeners.forEach((callback) => callback(payload));
    },
    onData: (callback) => settingsDataListeners.push(callback),

    openFileDialog: async () => {
      const selected = await tauri.dialog.open({ directory: true, multiple: false });
      if (selected) {
        selectedDirectoryListeners.forEach((callback) => callback(selected));
      }
    },
    sendPath: (path) => invoke("complete_setup", { selectedPath: path }),
    receiveSelectedDirectory: (callback) => selectedDirectoryListeners.push(callback),
    getLogPath: () => invoke("get_log_path"),
  };

  function normalizeShellState(payload) {
    if (!payload || !Array.isArray(payload.plugins)) {
      return payload;
    }

    const fontAsset = payload.fontPath
      ? convertFileSrc(payload.fontPath)
      : payload.resourceBase
        ? convertFileSrc(`${payload.resourceBase.replace(/\\/g, "/")}/figtree.ttf`)
        : "assets/figtree.ttf";

    return {
      ...payload,
      fontAsset,
      plugins: payload.plugins.map(normalizePlugin),
      allPlugins: Array.isArray(payload.allPlugins)
        ? payload.allPlugins.map(normalizePlugin)
        : payload.plugins.map(normalizePlugin),
    };
  }

  function normalizePlugin(plugin) {
    return {
      ...plugin,
      src: plugin.src && !/^(https?|file|asset):/.test(plugin.src)
        ? convertFileSrc(plugin.src)
        : plugin.src,
    };
  }

  function currentWindowLabel() {
    const path = window.location.pathname.toLowerCase();
    if (path.endsWith("/settings.html")) {
      return "settings";
    }
    if (path.endsWith("/tutorial.html")) {
      return "tutorial";
    }
    if (path.endsWith("/setup.html")) {
      return "setup";
    }
    return "main";
  }

  function installUnavailableHostApi(message) {
    reportError("host-api", message);
    window.hostAPI = new Proxy({}, {
      get() {
        return () => {
          showHostError(message);
          return Promise.reject(new Error(message));
        };
      },
    });

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => showHostError(message));
    } else {
      showHostError(message);
    }
  }

  function showHostError(message) {
    let container = document.getElementById("host-error");
    if (!container) {
      container = document.createElement("div");
      container.id = "host-error";
      container.style.cssText = [
        "position:fixed",
        "inset:0",
        "z-index:99999",
        "box-sizing:border-box",
        "padding:24px",
        "background:#fff",
        "color:#111",
        "font:16px/1.4 Figtree, Segoe UI, sans-serif",
        "white-space:pre-wrap",
      ].join(";");
      document.body.appendChild(container);
    }
    container.textContent = `Captain's Log could not start.\n\n${message}`;
  }

  function stringifyReason(reason) {
    if (reason instanceof Error) {
      return `${reason.name}: ${reason.message}\n${reason.stack || ""}`;
    }

    try {
      return JSON.stringify(reason);
    } catch {
      return String(reason);
    }
  }
})();
