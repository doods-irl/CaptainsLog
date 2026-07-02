document.addEventListener("DOMContentLoaded", () => {
  if (!window.hostAPI) {
    document.body.textContent = "Captain's Log could not start: host API is unavailable.";
    return;
  }

  const closeButton = document.getElementById("close-button");
  const openConfigButton = document.getElementById("open-config");
  const openLogsButton = document.getElementById("open-logs");

  let trimmedConfigPath = "";
  let trimmedLogPath = "";

  closeButton.addEventListener("click", () => {
    window.hostAPI.closeWindow();
  });

  document.querySelectorAll(".accent-palette").forEach((button) => {
    button.style.backgroundColor = button.id;
    button.addEventListener("click", () => {
      window.hostAPI.sendColor(button.id);
    });
  });

  document.querySelectorAll(".theme-palette").forEach((button) => {
    button.style.backgroundColor = button.id === "light" ? "#EEE" : "#111";
    button.addEventListener("click", () => {
      window.hostAPI.sendTheme(button.id);
    });
  });

  openConfigButton.addEventListener("click", () => {
    if (trimmedConfigPath) {
      window.hostAPI.openExplorer(trimmedConfigPath);
    }
  });

  openLogsButton.addEventListener("click", () => {
    if (trimmedLogPath) {
      window.hostAPI.openExplorer(trimmedLogPath);
    }
  });

  window.hostAPI.onData(({ configPath, filePath }) => {
    trimmedConfigPath = trimFilename(configPath);
    trimmedLogPath = trimFilename(filePath);

    document.getElementById("config-path").textContent = configPath;
    document.getElementById("logs-path").textContent = filePath;
  });

  window.hostAPI.requestData();
});

function trimFilename(targetPath) {
  const lastBackslashIndex = Math.max(
    targetPath.lastIndexOf("\\"),
    targetPath.lastIndexOf("/")
  );

  if (lastBackslashIndex === -1) {
    return targetPath;
  }

  return targetPath.substring(0, lastBackslashIndex);
}
