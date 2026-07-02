document.addEventListener("DOMContentLoaded", () => {
  if (!window.hostAPI) {
    document.body.textContent = "Captain's Log could not start: host API is unavailable.";
    return;
  }

  const closeButton = document.getElementById("close-button");

  closeButton.addEventListener("click", () => {
    window.hostAPI.closeWindow();
  });
});
