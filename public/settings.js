document.addEventListener("DOMContentLoaded", () => {
  const closeButton = document.getElementById("close-button");
  const openConfigButton = document.getElementById("open-config");
  const openLogsButton = document.getElementById("open-logs");

  let trimmedConfigPath = "";
  let trimmedLogPath = "";

  closeButton.addEventListener("click", () => {
    window.electronAPI.closeWindow();
  });

  document.querySelectorAll(".accent-palette").forEach((button) => {
    button.style.backgroundColor = button.id;
    button.addEventListener("click", () => {
      window.electronAPI.sendColor(button.id);
    });
  });

  document.querySelectorAll(".theme-palette").forEach((button) => {
    button.style.backgroundColor = button.id === "light" ? "#EEE" : "#111";
    button.addEventListener("click", () => {
      window.electronAPI.sendTheme(button.id);
    });
  });

  openConfigButton.addEventListener("click", () => {
    if (trimmedConfigPath) {
      window.electronAPI.openExplorer(trimmedConfigPath);
    }
  });

  openLogsButton.addEventListener("click", () => {
    if (trimmedLogPath) {
      window.electronAPI.openExplorer(trimmedLogPath);
    }
  });

  window.electronAPI.onData(({ configPath, filePath }) => {
    trimmedConfigPath = trimFilename(configPath);
    trimmedLogPath = trimFilename(filePath);

    document.getElementById("config-path").textContent = configPath;
    document.getElementById("logs-path").textContent = filePath;
  });

  window.electronAPI.requestData();
});

function trimFilename(targetPath) {
  const lastBackslashIndex = targetPath.lastIndexOf("\\");

  if (lastBackslashIndex === -1) {
    return targetPath;
  }

  return targetPath.substring(0, lastBackslashIndex);
}
