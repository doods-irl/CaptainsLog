import {
  buildCategoryList,
  clampSelection,
  getSelectedCategory,
  getSortedLogsForCategory,
  getVisibleCategories,
  hasSubcategories,
} from "./model.js";

export function applyTheme(state) {
  document.documentElement.style.setProperty("--theme-color", state.theme.accentColor);
  document.documentElement.setAttribute("data-theme", state.theme.themeColor);
}

export function renderApp(state, dom, handlers) {
  buildCategoryList(state);
  state.visibleCategories = getVisibleCategories(state, dom.textbox.value);
  clampSelection(state);
  renderCategories(state, dom, handlers);
  renderLogs(state, dom, handlers);
  updateTextboxColor(dom);
  restoreFocus(state, dom);
}

function renderCategories(state, dom, handlers) {
  dom.categoryContainer.innerHTML = "";

  state.visibleCategories.forEach((category, index) => {
    const categoryNav = document.createElement("button");
    categoryNav.type = "button";
    categoryNav.className = "nav-element";
    categoryNav.dataset.categoryNav = category.name;
    categoryNav.textContent = hasSubcategories(state, category.name) && !category.isSubcategory
      ? `${category.displayName} *`
      : category.displayName;

    if (index === state.currentCategoryIndex) {
      categoryNav.classList.add("selected");
    }

    categoryNav.addEventListener("click", () => {
      handlers.onCategorySelected(index);
    });

    dom.categoryContainer.appendChild(categoryNav);
  });
}

function renderLogs(state, dom, handlers) {
  dom.logContainer.innerHTML = "";

  const selectedCategory = getSelectedCategory(state);
  if (!selectedCategory) {
    return;
  }

  const categoryLogsContainer = document.createElement("div");
  categoryLogsContainer.className = "category-log-container";

  const containerHeader = document.createElement("h2");
  containerHeader.textContent = selectedCategory.name;
  categoryLogsContainer.appendChild(containerHeader);

  getSortedLogsForCategory(state, selectedCategory.name).forEach((log) => {
    const logItem = document.createElement("input");
    logItem.type = "text";
    logItem.value = log.content;
    logItem.className = "log-item";
    logItem.dataset.category = selectedCategory.name;
    logItem.dataset.logId = String(log.id);
    logItem.dataset.logStatus = log.status;
    logItem.disabled = log.status === "done";

    if (state.currentSelectedLogId === log.id) {
      logItem.classList.add("selected");
    }

    logItem.addEventListener("focus", () => {
      handlers.onLogFocused(log.id);
    });

    logItem.addEventListener("input", () => {
      handlers.onLogEdited(logItem.value, selectedCategory.name, log.id);
    });

    categoryLogsContainer.appendChild(logItem);
  });

  dom.logContainer.appendChild(categoryLogsContainer);
}

function updateTextboxColor(dom) {
  const inputValue = dom.textbox.value.trim();
  const deleteRegex = /^\/[\w.-]+(:[\w.-]+)?\s*\/d$/;
  const emptyRegex = /^\/[\w.-]+(:[\w.-]+)?\s*\/e$/;
  const moveRegex = /^\/[\w.-]+(:[\w.-]+)?\s*\/m\d+$/;

  if (
    inputValue.startsWith("delete:") ||
    inputValue.startsWith("empty:") ||
    deleteRegex.test(inputValue) ||
    emptyRegex.test(inputValue)
  ) {
    dom.textbox.style.color = "tomato";
  } else if (moveRegex.test(inputValue)) {
    dom.textbox.style.color = "slateblue";
  } else {
    dom.textbox.style.color = "var(--text-color)";
  }
}

function restoreFocus(state, dom) {
  if (state.currentSelectedLogId == null) {
    return;
  }

  const selectedLog = dom.logContainer.querySelector(`[data-log-id="${state.currentSelectedLogId}"]`);

  if (!selectedLog) {
    state.currentSelectedLogId = null;
    return;
  }

  selectedLog.focus();
  selectedLog.selectionStart = selectedLog.selectionEnd = selectedLog.value.length;
}

export function focusTextbox(state, dom) {
  state.currentSelectedLogId = null;
  dom.textbox.focus();
  dom.textbox.selectionStart = dom.textbox.selectionEnd = dom.textbox.value.length;
}

export function resetNavigationAndTextbox(state, dom) {
  dom.textbox.value = "";
  state.currentCategoryIndex = 0;
  state.currentSelectedLogId = null;
}

export function syncTextboxToSelection(state, dom) {
  const selectedCategory = getSelectedCategory(state);
  dom.textbox.value = !selectedCategory || selectedCategory.name === "notes"
    ? ""
    : `/${selectedCategory.name} `;
}

export function displayError(dom, message, duration, onFocus) {
  dom.errorMessage.textContent = message;
  dom.errorMessage.style.display = "flex";
  onFocus();

  setTimeout(() => {
    dom.errorMessage.style.display = "none";
  }, duration);
}
