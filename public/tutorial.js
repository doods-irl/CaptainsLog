document.addEventListener("DOMContentLoaded", () => {
  const closeButton = document.getElementById("close-button");

  closeButton.addEventListener("click", () => {
    window.electronAPI.closeWindow();
  });
});
