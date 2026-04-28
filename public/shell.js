const state = {
  shellState: null,
  navCategories: [],
  visibleCategories: [],
  currentCategoryIndex: 0,
  currentSelectedLogId: null,
  keysPressed: {},
  debounceTimer: null,
  confirmation: {
    deletePending: false,
    deleteTimeoutId: null,
    emptyPending: false,
    emptyTimeoutId: null,
  },
  frames: new Map(),
  pluginSuggestions: [],
  pluginSuggestionIndex: 0,
  activePlugin: null,
  pluginCompletionQuery: null,
};

const dom = {
  form: document.getElementById("text-form"),
  textbox: document.getElementById("textbox"),
  categoryContainer: document.getElementById("category-container"),
  errorMessage: document.getElementById("error-message"),
  notesPlane: document.getElementById("notes-plane"),
  pluginPlane: document.getElementById("plugin-plane"),
};

window.electronAPI.onShellState((payload) => {
  state.shellState = payload;
  applyTheme();
  ensureFrames();
  render();
  broadcastState();
});

window.electronAPI.onEditorCommand((payload) => {
  broadcastMessage({
    type: "captainslog:editor-command",
    payload,
  });

  if (payload.type === "reset-input") {
    resetInput();
    render();
    return;
  }

  if (payload.type === "prepare-show") {
    resetInput();
    render();
    focusTextbox();
  }
});

window.addEventListener("message", async (event) => {
  const currentFrame = getFrameByWindow(event.source);
  if (!currentFrame || !event.data || typeof event.data !== "object") {
    return;
  }

  if (event.data.type === "captainslog:plugin-ready") {
    postStateToFrame(currentFrame);
    postPluginContextToFrame(currentFrame);
    return;
  }

  if (event.data.type !== "captainslog:call") {
    return;
  }

  const { requestId, method, params } = event.data;

  try {
    const result = await window.electronAPI.invokeHost(method, params);
    currentFrame.contentWindow.postMessage(
      {
        type: "captainslog:response",
        requestId,
        success: true,
        result,
      },
      "*"
    );
  } catch (error) {
    currentFrame.contentWindow.postMessage(
      {
        type: "captainslog:response",
        requestId,
        success: false,
        error: error?.message || String(error),
      },
      "*"
    );
  }
});

dom.form.addEventListener("submit", handleSubmit);
dom.textbox.addEventListener("input", handleTextboxInput);

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", (event) => {
  delete state.keysPressed[event.key];
});

window.electronAPI.requestShellState();

function applyTheme() {
  if (!state.shellState) {
    return;
  }

  document.documentElement.style.setProperty("--theme-color", state.shellState.theme.accentColor);
  document.documentElement.setAttribute("data-theme", state.shellState.theme.themeColor);
}

function ensureFrames() {
  if (!state.shellState) {
    return;
  }

  state.shellState.plugins.forEach((plugin) => {
    if (state.frames.has(plugin.id)) {
      return;
    }

    const frame = document.createElement("iframe");
    frame.className = "plugin-frame";
    frame.dataset.pluginId = plugin.id;
    frame.sandbox = "allow-scripts allow-forms";
    frame.src = plugin.src;
    frame.addEventListener("load", () => {
      postStateToFrame(frame);
      postPluginContextToFrame(frame);
    });

    state.frames.set(plugin.id, frame);
    dom.pluginPlane.appendChild(frame);
  });
}

function render() {
  if (!state.shellState) {
    return;
  }

  updatePluginMode();
  buildCategoryList();
  renderNav();
  renderNotesPlane();
  syncPluginFrames();
  updateTextboxColor();
  restoreFocus();
}

function updatePluginMode() {
  const pluginQuery = getPluginQuery();
  const selectedPlugin = getSelectedPluginFromInput();
  const pluginArgs = getPluginArgs();

  if (pluginQuery == null) {
    state.pluginCompletionQuery = null;
  } else if (!selectedPlugin) {
    state.pluginCompletionQuery = pluginQuery;
  } else if (pluginArgs) {
    state.pluginCompletionQuery = null;
  } else if (state.pluginCompletionQuery === null) {
    state.pluginCompletionQuery = pluginQuery;
  }

  state.pluginSuggestions = getPluginSuggestions();

  if (selectedPlugin) {
    state.activePlugin = selectedPlugin;
    state.pluginSuggestionIndex = Math.max(
      0,
      state.pluginSuggestions.findIndex((plugin) => plugin.id === selectedPlugin.id)
    );
  } else {
    state.activePlugin = null;
    if (state.pluginSuggestions.length > 0) {
      state.pluginSuggestionIndex = Math.max(
        0,
        Math.min(state.pluginSuggestionIndex, state.pluginSuggestions.length - 1)
      );
    } else {
      state.pluginSuggestionIndex = 0;
    }
  }
}

function getPluginSuggestions() {
  if (!state.shellState) {
    return [];
  }

  const query = getEffectivePluginQuery();
  if (query == null) {
    return [];
  }

  if (query === "") {
    return state.shellState.plugins.slice();
  }

  return state.shellState.plugins.filter((plugin) => {
    const haystacks = [plugin.command, ...(plugin.aliases || []), plugin.name.toLowerCase()];
    return haystacks.some((value) => value.toLowerCase().startsWith(query));
  });
}

function getPluginQuery() {
  const value = dom.textbox.value;
  if (!value.startsWith("-")) {
    return null;
  }

  return value.substring(1).split(" ")[0].toLowerCase();
}

function getPluginArgs() {
  const query = getPluginQuery();
  if (query == null) {
    return "";
  }

  return dom.textbox.value.slice(query.length + 1).trim();
}

function getEffectivePluginQuery() {
  const query = getPluginQuery();
  if (query == null) {
    return null;
  }

  if (state.activePlugin && !getPluginArgs() && state.pluginCompletionQuery !== null) {
    return state.pluginCompletionQuery;
  }

  return query;
}

function getSelectedPluginFromInput() {
  const match = /^-([\w-]+)(?:\s|$)/.exec(dom.textbox.value.trimStart());
  if (!match || !state.shellState) {
    return null;
  }

  const token = match[1].toLowerCase();
  return state.shellState.plugins.find((plugin) =>
    plugin.command.toLowerCase() === token ||
    (plugin.aliases || []).some((alias) => alias.toLowerCase() === token)
  ) || null;
}

function buildCategoryList() {
  if (state.activePlugin || state.pluginSuggestions.length > 0) {
    return;
  }

  const activeCategories = state.shellState.notes.categories.filter((category) => category.status !== "deleted");
  const notesCategory = activeCategories.find((category) => category.name.toLowerCase() === "notes") || {
    name: "notes",
    logs: [],
  };
  const grouped = new Map();

  activeCategories.forEach((category) => {
    if (category.name.toLowerCase() === "notes") {
      return;
    }

    const [mainCategory] = category.name.split(":");
    if (!grouped.has(mainCategory)) {
      grouped.set(mainCategory, []);
    }
    grouped.get(mainCategory).push(category);
  });

  const ordered = [notesCategory];
  Array.from(grouped.values()).forEach((group) => {
    group.sort((left, right) => left.name.localeCompare(right.name));
    ordered.push(...group);
  });

  state.navCategories = ordered.map((category) => ({
    name: category.name.toLowerCase(),
    displayName: category.name,
    isSubcategory: category.name.includes(":"),
  }));

  state.visibleCategories = getVisibleCategories();
  if (state.visibleCategories.length === 0) {
    state.currentCategoryIndex = 0;
  } else {
    state.currentCategoryIndex = Math.max(
      0,
      Math.min(state.currentCategoryIndex, state.visibleCategories.length - 1)
    );
  }
}

function getVisibleCategories() {
  const filter = getCategoryFilter();
  return state.navCategories.filter((category) => {
    if (!filter) {
      return !category.isSubcategory;
    }

    if (category.isSubcategory && !filter.includes(":")) {
      return false;
    }

    return category.name.startsWith(filter);
  });
}

function getCategoryFilter() {
  const trimmed = dom.textbox.value.trim();
  if (!trimmed.startsWith("/")) {
    return "";
  }

  return trimmed.substring(1).split(" ")[0].toLowerCase();
}

function renderNav() {
  dom.categoryContainer.innerHTML = "";

  if (state.activePlugin || state.pluginSuggestions.length > 0) {
    renderPluginSuggestions();
    return;
  }

  state.visibleCategories.forEach((category, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-element";
    button.textContent = hasSubcategories(category.name) && !category.isSubcategory
      ? `${category.displayName} *`
      : category.displayName;

    if (index === state.currentCategoryIndex) {
      button.classList.add("selected");
    }

    button.addEventListener("click", () => {
      state.currentCategoryIndex = index;
      state.currentSelectedLogId = null;
      syncTextboxToSelection();
      render();
      focusTextbox();
    });

    dom.categoryContainer.appendChild(button);
  });
}

function renderPluginSuggestions() {
  const suggestions = state.pluginSuggestions.length > 0
    ? state.pluginSuggestions
    : (state.activePlugin ? [state.activePlugin] : []);

  suggestions.forEach((plugin, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-element plugin-pill";
    button.textContent = `-${plugin.command}`;

    if (state.activePlugin?.id === plugin.id || index === state.pluginSuggestionIndex) {
      button.classList.add("selected");
    }

    button.addEventListener("click", () => {
      activatePluginSuggestion(plugin);
    });

    dom.categoryContainer.appendChild(button);
  });
}

function renderNotesPlane() {
  if (state.activePlugin) {
    dom.notesPlane.style.display = "none";
    return;
  }

  dom.notesPlane.style.display = "block";
  dom.notesPlane.innerHTML = "";

  const selectedCategory = getSelectedCategory();
  if (!selectedCategory) {
    return;
  }

  const container = document.createElement("div");
  container.className = "category-log-container";

  const header = document.createElement("h2");
  header.textContent = selectedCategory.name;
  container.appendChild(header);

  getSortedLogsForCategory(selectedCategory.name).forEach((log) => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = log.content;
    input.className = "log-item";
    input.dataset.category = selectedCategory.name;
    input.dataset.logId = String(log.id);
    input.dataset.logStatus = log.status;
    input.disabled = log.status === "done";

    if (state.currentSelectedLogId === log.id) {
      input.classList.add("selected");
    }

    input.addEventListener("focus", () => {
      state.currentSelectedLogId = log.id;
    });

    input.addEventListener("input", () => {
      queueLogEdit(input.value, selectedCategory.name, log.id);
    });

    container.appendChild(input);
  });

  dom.notesPlane.appendChild(container);
}

function getSelectedCategory() {
  return state.visibleCategories[state.currentCategoryIndex] || state.visibleCategories[0] || null;
}

function getSortedLogsForCategory(categoryName) {
  const category = state.shellState.notes.categories.find(
    (entry) => entry.name.toLowerCase() === categoryName && entry.status !== "deleted"
  );

  if (!category) {
    return [];
  }

  return category.logs
    .filter((log) => log.status !== "deleted")
    .slice()
    .sort((left, right) => left.status === right.status ? left.id - right.id : left.status === "active" ? -1 : 1);
}

function hasSubcategories(categoryName) {
  return state.navCategories.some((category) => category.isSubcategory && category.name.startsWith(`${categoryName}:`));
}

function syncPluginFrames() {
  dom.pluginPlane.classList.toggle("active", Boolean(state.activePlugin));

  for (const [pluginId, frame] of state.frames.entries()) {
    frame.classList.toggle("active", state.activePlugin?.id === pluginId);
    if (state.activePlugin?.id === pluginId) {
      postPluginContextToFrame(frame);
    }
  }
}

function broadcastState() {
  for (const frame of state.frames.values()) {
    postStateToFrame(frame);
    postPluginContextToFrame(frame);
  }
}

function postStateToFrame(frame) {
  if (!state.shellState || !frame.contentWindow) {
    return;
  }

  frame.contentWindow.postMessage(
    {
      type: "captainslog:state",
      payload: state.shellState,
    },
    "*"
  );
}

function postPluginContextToFrame(frame) {
  if (!frame.contentWindow) {
    return;
  }

  const pluginId = frame.dataset.pluginId;
  const plugin = state.shellState?.plugins.find((entry) => entry.id === pluginId) || null;
  const context = buildPluginContext(plugin);

  frame.contentWindow.postMessage(
    {
      type: "captainslog:plugin-context",
      payload: context,
    },
    "*"
  );
}

function buildPluginContext(plugin) {
  const rawInput = dom.textbox.value;

  if (!plugin) {
    return {
      isActive: false,
      rawInput,
      command: "",
      args: "",
    };
  }

  const prefixes = [plugin.command, ...(plugin.aliases || [])];
  const matchingPrefix = prefixes.find((prefix) =>
    rawInput.toLowerCase().startsWith(`-${prefix.toLowerCase()}`)
  ) || plugin.command;

  const args = rawInput.slice(matchingPrefix.length + 1).trimStart();

  return {
    isActive: state.activePlugin?.id === plugin.id,
    rawInput,
    command: plugin.command,
    args,
  };
}

function broadcastMessage(message) {
  for (const frame of state.frames.values()) {
    if (frame.contentWindow) {
      frame.contentWindow.postMessage(message, "*");
    }
  }
}

function getFrameByWindow(sourceWindow) {
  for (const frame of state.frames.values()) {
    if (frame.contentWindow === sourceWindow) {
      return frame;
    }
  }

  return null;
}

function handleTextboxInput() {
  if (dom.textbox.value.trim() === "") {
    state.currentCategoryIndex = 0;
    state.currentSelectedLogId = null;
  }

  render();
  broadcastState();
}

async function handleSubmit(event) {
  event.preventDefault();

  const textboxValue = dom.textbox.value.trim();
  if (!textboxValue) {
    return;
  }

  if (/^\/\s/.test(textboxValue)) {
    displayError("A blank category name? Not allowed I'm afraid.", 4000);
    return;
  }

  if (state.activePlugin) {
    submitPluginCommand();
    return;
  }

  if (textboxValue.startsWith("delete:")) {
    await submitCategoryDelete(textboxValue.substring(7).toLowerCase());
    return;
  }

  if (textboxValue.startsWith("empty:")) {
    await submitCategoryEmpty(textboxValue.substring(6).toLowerCase());
    return;
  }

  if (textboxValue.startsWith("/")) {
    await submitCategoryCommand(textboxValue);
    return;
  }

  await window.electronAPI.invokeHost("notes:add-entry", { formData: textboxValue });
  dom.textbox.value = "";

  if (state.shellState.editorMode === "mini") {
    window.electronAPI.invokeHost("shell:request-hide", {});
  }
}

function submitPluginCommand() {
  const frame = state.frames.get(state.activePlugin.id);
  if (!frame?.contentWindow) {
    return;
  }

  frame.contentWindow.postMessage(
    {
      type: "captainslog:plugin-submit",
      payload: buildPluginContext(state.activePlugin),
    },
    "*"
  );
}

async function submitCategoryDelete(categoryName) {
  if (categoryName === "notes") {
    displayError("You can't delete the notes category!", 4000);
    return;
  }

  if (!categoryExists(categoryName)) {
    displayError(`Category '${categoryName}' not found.`, 4000);
    return;
  }

  await window.electronAPI.invokeHost("notes:delete-category", { categoryName });
  dom.textbox.value = "delete:";
}

async function submitCategoryEmpty(categoryName) {
  if (!categoryExists(categoryName)) {
    displayError(`Category '${categoryName}' not found.`, 4000);
    return;
  }

  await window.electronAPI.invokeHost("notes:empty-category", { categoryName });
  dom.textbox.value = "empty:";
}

async function submitCategoryCommand(textboxValue) {
  const splitData = textboxValue.split(" ");
  const category = splitData[0].substring(1).toLowerCase();
  const content = splitData.slice(1).join(" ");

  if (content === "/d") {
    await confirmCategoryDelete(category);
    return;
  }

  if (content === "/e") {
    await confirmCategoryEmpty(category);
    return;
  }

  if (content.startsWith("/m")) {
    await moveCategory(category, content);
    return;
  }

  await window.electronAPI.invokeHost("notes:add-entry", { formData: textboxValue });
  dom.textbox.value = category ? `/${category} ` : "";

  if (state.shellState.editorMode === "mini") {
    window.electronAPI.invokeHost("shell:request-hide", {});
  }
}

async function confirmCategoryDelete(category) {
  if (!categoryExists(category)) {
    displayError("This category doesn't exist.", 4000);
    return;
  }

  if (!state.confirmation.deletePending) {
    displayError("Type /d and enter again to confirm category deletion.", 8000);
    state.confirmation.deletePending = true;
    state.confirmation.deleteTimeoutId = setTimeout(() => {
      state.confirmation.deletePending = false;
    }, 8000);
    return;
  }

  clearTimeout(state.confirmation.deleteTimeoutId);
  state.confirmation.deletePending = false;
  await window.electronAPI.invokeHost("notes:delete-category", { categoryName: category });
  resetInput();
  render();
}

async function confirmCategoryEmpty(category) {
  if (!categoryExists(category)) {
    displayError("This category doesn't exist.", 4000);
    return;
  }

  if (!state.confirmation.emptyPending) {
    displayError("Type /e and enter again to confirm category empty.", 8000);
    state.confirmation.emptyPending = true;
    state.confirmation.emptyTimeoutId = setTimeout(() => {
      state.confirmation.emptyPending = false;
    }, 8000);
    return;
  }

  clearTimeout(state.confirmation.emptyTimeoutId);
  state.confirmation.emptyPending = false;
  await window.electronAPI.invokeHost("notes:empty-category", { categoryName: category });
  dom.textbox.value = `/${category} `;
}

async function moveCategory(category, command) {
  if (!categoryExists(category)) {
    displayError("This category doesn't exist.", 4000);
    return;
  }

  const match = command.match(/^\/m(\d+)$/);
  if (!match) {
    displayError("No valid number found after '/m'.", 4000);
    return;
  }

  await window.electronAPI.invokeHost("notes:move-category", {
    categoryName: category,
    position: parseInt(match[1], 10),
  });
  resetInput();
  render();
}

function categoryExists(categoryName) {
  return state.navCategories.some((category) => category.name === categoryName);
}

function handleKeyDown(event) {
  state.keysPressed[event.key] = true;

  if (isPluginCommandMode()) {
    handlePluginNavigation(event);
    return;
  }

  if (state.currentSelectedLogId == null) {
    if (event.key === "ArrowRight" && !state.keysPressed.Shift) {
      selectCategory(1);
    } else if (event.key === "ArrowLeft" && !state.keysPressed.Shift) {
      selectCategory(-1);
    } else if (event.key === "Enter" && /^\/[\w.-]+ $/.test(dom.textbox.value)) {
      resetInput();
      render();
    }
  }

  if (event.key === "Tab") {
    event.preventDefault();
    focusTextbox();
    selectCategory(state.keysPressed.Shift ? -1 : 1);
  }

  handleTextboxShortcuts(event);
  handleLogSelection(event);
}

function isPluginCommandMode() {
  return dom.textbox.value.startsWith("-");
}

function handlePluginNavigation(event) {
  if ((event.key === "Tab" || event.key === "ArrowRight" || event.key === "ArrowLeft") && state.pluginSuggestions.length > 0) {
    event.preventDefault();
    const direction = (event.key === "ArrowLeft" || (event.key === "Tab" && state.keysPressed.Shift)) ? -1 : 1;
    state.pluginSuggestionIndex = (state.pluginSuggestionIndex + direction + state.pluginSuggestions.length) % state.pluginSuggestions.length;
    activatePluginSuggestion(state.pluginSuggestions[state.pluginSuggestionIndex]);
    return;
  }

  if (event.key === "Backspace" && dom.textbox.value.trim() === "-") {
    resetInput();
    render();
    return;
  }
}

function activatePluginSuggestion(plugin) {
  const effectiveQuery = getEffectivePluginQuery();
  const rawQuery = getPluginQuery();
  state.pluginCompletionQuery = effectiveQuery ?? rawQuery ?? plugin.command.toLowerCase();
  dom.textbox.value = `-${plugin.command} `;
  state.activePlugin = plugin;
  render();
  focusTextbox();
  broadcastState();
}

function selectCategory(direction) {
  if (state.visibleCategories.length === 0) {
    return;
  }

  state.currentSelectedLogId = null;
  state.currentCategoryIndex = Math.max(
    0,
    Math.min(state.currentCategoryIndex + direction, state.visibleCategories.length - 1)
  );
  syncTextboxToSelection();
  render();
  focusTextbox();
}

function handleTextboxShortcuts(event) {
  if (document.activeElement !== dom.textbox) {
    return;
  }

  if (event.key === "Backspace") {
    if (dom.textbox.value === "delete:" || dom.textbox.value === "empty:") {
      resetInput();
      render();
      return;
    }

    if (/^\/[\w.-]+:[^ ]+ $/.test(dom.textbox.value) || /^\/[\w.-]+:$/.test(dom.textbox.value)) {
      dom.textbox.value = `${dom.textbox.value.substring(0, dom.textbox.value.lastIndexOf(":"))} `;
      render();
      return;
    }

    if (/^\/[\w.-]+:([^ ]+)? $/.test(dom.textbox.value) || /^\/[\w.-]+ $/.test(dom.textbox.value)) {
      resetInput();
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
    if (categoryExists(potentialCategory.toLowerCase())) {
      event.preventDefault();
      dom.textbox.value = `/${potentialCategory.toLowerCase()} `;
      render();
    }
  }
}

function handleLogSelection(event) {
  if (state.shellState?.editorMode === "mini" || state.activePlugin) {
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
    focusTextbox();
    render();
    return;
  }

  if (state.keysPressed.Shift && event.key === "ArrowDown") {
    selectBoundingLog(false);
    return;
  }

  if (state.keysPressed.Shift && event.key === "Enter" && state.currentSelectedLogId != null) {
    toggleDone();
    return;
  }

  if (state.keysPressed.Shift && event.key === "Delete" && state.currentSelectedLogId != null) {
    deleteSelectedLog();
  }
}

function getCurrentRenderedLogs() {
  return Array.from(dom.notesPlane.querySelectorAll(".log-item"));
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
    focusTextbox();
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

async function deleteSelectedLog() {
  const selectedCategory = getSelectedCategory();
  if (!selectedCategory || state.currentSelectedLogId == null) {
    return;
  }

  await window.electronAPI.invokeHost("notes:delete-logs", {
    logDataArray: [{
      logCategory: selectedCategory.name,
      logId: String(state.currentSelectedLogId),
    }],
  });

  state.currentSelectedLogId = null;
}

async function toggleDone() {
  const selectedCategory = getSelectedCategory();
  if (!selectedCategory || state.currentSelectedLogId == null) {
    return;
  }

  await window.electronAPI.invokeHost("notes:toggle-done", {
    logDataArray: [{
      logCategory: selectedCategory.name,
      logId: state.currentSelectedLogId,
    }],
  });
}

function queueLogEdit(content, category, id) {
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
  }

  state.debounceTimer = setTimeout(() => {
    window.electronAPI.invokeHost("notes:edit-logs", {
      logDataArray: [{ content, category, id: String(id) }],
    });
  }, 500);
}

function restoreFocus() {
  if (state.activePlugin || state.currentSelectedLogId == null) {
    return;
  }

  const selected = dom.notesPlane.querySelector(`[data-log-id="${state.currentSelectedLogId}"]`);
  if (!selected) {
    state.currentSelectedLogId = null;
    return;
  }

  selected.focus();
  selected.selectionStart = selected.selectionEnd = selected.value.length;
}

function focusTextbox() {
  state.currentSelectedLogId = null;
  dom.textbox.focus();
  dom.textbox.selectionStart = dom.textbox.selectionEnd = dom.textbox.value.length;
}

function syncTextboxToSelection() {
  const selectedCategory = getSelectedCategory();
  dom.textbox.value = !selectedCategory || selectedCategory.name === "notes"
    ? ""
    : `/${selectedCategory.name} `;
}

function resetInput() {
  dom.textbox.value = "";
  state.currentCategoryIndex = 0;
  state.currentSelectedLogId = null;
  state.activePlugin = null;
  state.pluginSuggestions = [];
  state.pluginCompletionQuery = null;
}

function updateTextboxColor() {
  const inputValue = dom.textbox.value.trim();
  if (inputValue.startsWith("-")) {
    dom.textbox.style.color = "var(--theme-color)";
  } else if (
    inputValue.startsWith("delete:") ||
    inputValue.startsWith("empty:") ||
    /^\/[\w.-]+(:[\w.-]+)?\s*\/d$/.test(inputValue) ||
    /^\/[\w.-]+(:[\w.-]+)?\s*\/e$/.test(inputValue)
  ) {
    dom.textbox.style.color = "tomato";
  } else if (/^\/[\w.-]+(:[\w.-]+)?\s*\/m\d+$/.test(inputValue)) {
    dom.textbox.style.color = "slateblue";
  } else {
    dom.textbox.style.color = "var(--text-color)";
  }
}

function displayError(message, duration) {
  dom.errorMessage.textContent = message;
  dom.errorMessage.style.display = "block";
  focusTextbox();
  setTimeout(() => {
    dom.errorMessage.style.display = "none";
  }, duration);
}
