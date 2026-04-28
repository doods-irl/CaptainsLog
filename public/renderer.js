import { dom, state, cacheDom } from "./renderer/state.js";
import { categoryExists, getSelectedCategory } from "./renderer/model.js";
import { applyTheme, displayError, focusTextbox, renderApp, resetNavigationAndTextbox, syncTextboxToSelection } from "./renderer/view.js";
import { pausePomodoroTimer, resumePomodoroTimer, startPomodoroTimer, stopPomodoroTimer, updateTimerDisplay } from "./renderer/pomodoro.js";

const beginPomodoroTimer = startPomodoroTimer(state, dom, () => {});

document.addEventListener("DOMContentLoaded", () => {
  cacheDom();
  registerElectronListeners();
  registerDomListeners();
  window.electronAPI.requestAppState();
});

function registerElectronListeners() {
  window.electronAPI.onAppState((payload) => {
    state.logs = normalizeState(payload);
    state.theme = payload.theme;
    applyTheme(state);
    render();
  });

  window.electronAPI.onEditorCommand((payload) => {
    if (payload.type === "reset-input") {
      resetNavigationAndTextbox(state, dom);
      render();
      return;
    }

    if (payload.type === "prepare-show") {
      resetNavigationAndTextbox(state, dom);

      if (state.pomodoro.category) {
        dom.textbox.value = `/${state.pomodoro.category} `;
      }

      render();
      focusTextbox(state, dom);
    }
  });
}

function registerDomListeners() {
  dom.textForm.addEventListener("submit", handleSubmit);
  dom.textbox.addEventListener("input", handleTextboxInput);

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", (event) => {
    delete state.keysPressed[event.key];
  });
}

function normalizeState(payload) {
  if (!payload.logs || !Array.isArray(payload.logs.categories)) {
    return { categories: [] };
  }

  return {
    categories: payload.logs.categories.map((category) => ({
      ...category,
      logs: Array.isArray(category.logs) ? category.logs : [],
    })),
  };
}

function render() {
  renderApp(state, dom, {
    onCategorySelected(index) {
      state.currentCategoryIndex = index;
      state.currentSelectedLogId = null;
      syncTextboxToSelection(state, dom);
      render();
      focusTextbox(state, dom);
    },
    onLogFocused(logId) {
      state.currentSelectedLogId = logId;
    },
    onLogEdited(content, category, id) {
      queueLogEdit(content, category, id);
    },
  });
  updateTimerDisplay(state, dom);
}

function queueLogEdit(content, category, id) {
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
  }

  state.debounceTimer = setTimeout(() => {
    window.electronAPI.editLog([{ content, category, id: String(id) }]);
  }, 500);
}

function handleTextboxInput() {
  if (dom.textbox.value.trim() === "") {
    state.currentCategoryIndex = 0;
  }

  render();
}

function handleSubmit(event) {
  event.preventDefault();

  const textboxValue = dom.textbox.value.trim();
  if (!textboxValue) {
    return;
  }

  if (/^\/\s/.test(textboxValue)) {
    showError("A blank category name? Not allowed I'm afraid.", 4000);
    return;
  }

  if (textboxValue.startsWith("delete:")) {
    submitCategoryDelete(textboxValue.substring(7).toLowerCase());
    return;
  }

  if (textboxValue.startsWith("empty:")) {
    submitCategoryEmpty(textboxValue.substring(6).toLowerCase());
    return;
  }

  if (textboxValue.startsWith("pom:")) {
    handlePomodoroCommand(textboxValue.substring(4).toLowerCase(), "");
    return;
  }

  if (textboxValue.startsWith("/")) {
    submitCategoryCommand(textboxValue);
    return;
  }

  window.electronAPI.sendText(textboxValue);
  dom.textbox.value = "";
  state.currentSelectedLogId = null;
}

function submitCategoryDelete(categoryName) {
  if (categoryName === "notes") {
    showError("You can't delete the notes category!", 4000);
    return;
  }

  if (!categoryExists(state, categoryName)) {
    showError(`Category '${categoryName}' not found.`, 4000);
    return;
  }

  window.electronAPI.deleteCategory(categoryName);
  dom.textbox.value = "delete:";
}

function submitCategoryEmpty(categoryName) {
  if (!categoryExists(state, categoryName)) {
    showError(`Category '${categoryName}' not found.`, 4000);
    return;
  }

  window.electronAPI.emptyCategory(categoryName);
  dom.textbox.value = "empty:";
}

function submitCategoryCommand(textboxValue) {
  const splitData = textboxValue.split(" ");
  const category = splitData[0].substring(1).toLowerCase();
  const content = splitData.slice(1).join(" ");

  if (content === "/d") {
    confirmCategoryDelete(category);
    return;
  }

  if (content === "/e") {
    confirmCategoryEmpty(category);
    return;
  }

  if (content.startsWith("/m")) {
    moveCategory(category, content);
    return;
  }

  if (content.startsWith("pom:")) {
    handlePomodoroCommand(content.substring(4).toLowerCase(), category);
    return;
  }

  window.electronAPI.sendText(textboxValue);
  dom.textbox.value = category ? `/${category} ` : "";
  state.currentSelectedLogId = null;
}

function confirmCategoryDelete(category) {
  if (!categoryExists(state, category)) {
    showError("This category doesn't exist.", 4000);
    return;
  }

  if (!state.confirmation.deletePending) {
    showError("Type /d and enter again to confirm category deletion.", 8000);
    state.confirmation.deletePending = true;
    state.confirmation.deleteTimeoutId = setTimeout(() => {
      state.confirmation.deletePending = false;
    }, 8000);
    return;
  }

  clearTimeout(state.confirmation.deleteTimeoutId);
  state.confirmation.deletePending = false;
  window.electronAPI.deleteCategory(category);
  resetNavigationAndTextbox(state, dom);
  render();
}

function confirmCategoryEmpty(category) {
  if (!categoryExists(state, category)) {
    showError("This category doesn't exist.", 4000);
    return;
  }

  if (!state.confirmation.emptyPending) {
    showError("Type /e and enter again to confirm category empty.", 8000);
    state.confirmation.emptyPending = true;
    state.confirmation.emptyTimeoutId = setTimeout(() => {
      state.confirmation.emptyPending = false;
    }, 8000);
    return;
  }

  clearTimeout(state.confirmation.emptyTimeoutId);
  state.confirmation.emptyPending = false;
  window.electronAPI.emptyCategory(category);
  dom.textbox.value = `/${category} `;
}

function moveCategory(category, command) {
  if (!categoryExists(state, category)) {
    showError("This category doesn't exist.", 4000);
    return;
  }

  const match = command.match(/^\/m(\d+)$/);

  if (!match) {
    showError("No valid number found after '/m'.", 4000);
    return;
  }

  window.electronAPI.moveCategory(category, parseInt(match[1], 10));
}

function showError(message, duration) {
  displayError(dom, message, duration, () => focusTextbox(state, dom));
}

function handleKeyDown(event) {
  state.keysPressed[event.key] = true;

  handleArrowNavigation(event);
  handleTabNavigation(event);
  handleTextboxShortcuts(event);
  handleLogSelection(event);
}

function handleArrowNavigation(event) {
  if (state.currentSelectedLogId != null) {
    return;
  }

  if (event.key === "ArrowRight" && !state.keysPressed.Shift) {
    selectNav(1);
  } else if (event.key === "ArrowLeft" && !state.keysPressed.Shift) {
    selectNav(-1);
  } else if (event.key === "Enter" && /^\/[\w.-]+ $/.test(dom.textbox.value)) {
    resetNavigationAndTextbox(state, dom);
    render();
  }
}

function handleTabNavigation(event) {
  if (event.key !== "Tab") {
    return;
  }

  event.preventDefault();
  focusTextbox(state, dom);
  selectNav(state.keysPressed.Shift ? -1 : 1);
}

function handleTextboxShortcuts(event) {
  if (document.activeElement !== dom.textbox) {
    return;
  }

  if (event.key === "Backspace") {
    if (dom.textbox.value === "delete:" || dom.textbox.value === "empty:") {
      resetNavigationAndTextbox(state, dom);
      render();
      return;
    }

    if (/^\/[\w.-]+:[^ ]+ $/.test(dom.textbox.value) || /^\/[\w.-]+:$/.test(dom.textbox.value)) {
      dom.textbox.value = `${dom.textbox.value.substring(0, dom.textbox.value.lastIndexOf(":"))} `;
      render();
      return;
    }

    if (/^\/[\w.-]+:([^ ]+)? $/.test(dom.textbox.value) || /^\/[\w.-]+ $/.test(dom.textbox.value)) {
      resetNavigationAndTextbox(state, dom);
      render();
      return;
    }
  }

  if (event.key === ":" && /^\/[\w.-]+ $/.test(dom.textbox.value)) {
    dom.textbox.value = dom.textbox.value.replace(" ", "");
  }

  if (event.key === " ") {
    const match = /^\/([\w.-]+)(?::([\w.-]+))?$/.exec(dom.textbox.value);

    if (!match) {
      return;
    }

    const potentialCategory = match[1] + (match[2] ? `:${match[2]}` : "");

    if (categoryExists(state, potentialCategory.toLowerCase())) {
      event.preventDefault();
      render();
    }
  }
}

function selectNav(direction) {
  if (state.visibleCategories.length === 0) {
    return;
  }

  state.currentSelectedLogId = null;
  state.currentCategoryIndex = Math.max(
    0,
    Math.min(state.currentCategoryIndex + direction, state.visibleCategories.length - 1)
  );
  syncTextboxToSelection(state, dom);
  render();
  focusTextbox(state, dom);
}

function handleLogSelection(event) {
  if (window.innerHeight <= 200) {
    return;
  }

  if (event.key === "ArrowDown" && !state.keysPressed.Shift) {
    selectLog(true);
    return;
  }

  if (event.key === "ArrowUp" && !state.keysPressed.Shift) {
    selectLog(false);
    return;
  }

  if (state.keysPressed.Shift && event.key === "ArrowUp") {
    focusTextbox(state, dom);
    render();
    return;
  }

  if (state.keysPressed.Shift && event.key === "ArrowDown") {
    selectBoundingLog(false);
    return;
  }

  if (state.keysPressed.Shift && event.key === "Enter" && state.currentSelectedLogId != null) {
    markDone();
    return;
  }

  if (state.keysPressed.Shift && event.key === "Delete" && state.currentSelectedLogId != null) {
    deleteSelectedLog();
  }
}

function getCurrentRenderedLogs() {
  return Array.from(dom.logContainer.querySelectorAll(".log-item"));
}

function selectLog(down) {
  const logs = getCurrentRenderedLogs();

  if (logs.length === 0) {
    return;
  }

  const currentIndex = logs.findIndex((log) => Number(log.dataset.logId) === state.currentSelectedLogId);
  const nextIndex = currentIndex + (down ? 1 : -1);

  if (nextIndex < 0) {
    state.currentSelectedLogId = null;
    render();
    focusTextbox(state, dom);
    return;
  }

  if (nextIndex >= logs.length) {
    return;
  }

  state.currentSelectedLogId = Number(logs[nextIndex].dataset.logId);
  render();
}

function selectBoundingLog(top) {
  const logs = getCurrentRenderedLogs();

  if (logs.length === 0) {
    return;
  }

  state.currentSelectedLogId = Number(logs[top ? 0 : logs.length - 1].dataset.logId);
  render();
}

function deleteSelectedLog() {
  const selectedCategory = getSelectedCategory(state);

  if (!selectedCategory || state.currentSelectedLogId == null) {
    return;
  }

  window.electronAPI.deleteLog([
    {
      logCategory: selectedCategory.name,
      logId: String(state.currentSelectedLogId),
    },
  ]);

  state.currentSelectedLogId = null;
}

function markDone() {
  const selectedCategory = getSelectedCategory(state);

  if (!selectedCategory || state.currentSelectedLogId == null) {
    return;
  }

  window.electronAPI.markDone([
    {
      logCategory: selectedCategory.name,
      logId: state.currentSelectedLogId,
    },
  ]);
}

function handlePomodoroCommand(action, category) {
  const parsedTime = parseInt(action, 10);

  if (!Number.isNaN(parsedTime) && parsedTime > 0) {
    state.pomodoro.category = category || null;
    beginPomodoroTimer(parsedTime);
    window.electronAPI.requestHide();
    return;
  }

  if (action === "pause") {
    pausePomodoroTimer(state);
    window.electronAPI.requestHide();
    return;
  }

  if (action === "resume") {
    resumePomodoroTimer(state, dom, () => {});
    window.electronAPI.requestHide();
    return;
  }

  if (action === "stop") {
    stopPomodoroTimer(state, dom);
    window.electronAPI.requestHide();
    return;
  }

  showError('Try "pom:[minutes]", "pom:pause", or "pom:stop".', 4000);
}
