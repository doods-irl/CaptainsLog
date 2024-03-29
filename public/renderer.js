let textbox;
let categories;
let mainCategories = {};
let currentCategory;
let currentSelectedLog = null;
let keysPressed = {};
let selectedIndex;
let debounceTimer;
let isConfirmationPending = false;
let confirmationTimeout;
let isConfirmationPendingForEmpty = false;
let confirmationTimeoutForEmpty;
let pomodoroTimerId = null;
let timeLeftInSeconds = 0;
let isTimerPaused = false;
let pomodoroCategory = null;

document.addEventListener("DOMContentLoaded", () => {
  textbox = document.getElementById("textbox");
  window.electronAPI.refreshLogs();
  initialiseForm();
  hideSubcategories();
});

function focusText() {
  unselectAllLogs();
  scrollToTopOfLog();
  if (textbox) {
    textbox.focus();
  }
}

function clearText() {
  if (textbox) {
    textbox.value = "";
  }
  filterCategories("");
  showAllCategories();
  hideSubcategories();
}

function setTheme(accentColor, themeColor) {
  document.documentElement.style.setProperty("--theme-color", `${accentColor}`);
  document.documentElement.setAttribute("data-theme", themeColor);
}

window.addEventListener("keydown", function (event) {
  keysPressed[event.key] = true;

  function resetNavigationAndTextbox() {
    clearText();
    setTimeout(() => { selectNav(0); }, 20);
  }

  function handleTabNavigation() {
    event.preventDefault();
    focusText();
    selectNav(keysPressed["Shift"] ? -1 : 1);
  }

  if (!currentSelectedLog) {
    if (event.key === "ArrowRight" && !keysPressed["Shift"]) {
      selectNav(1);
    } else if (event.key === "ArrowLeft" && !keysPressed["Shift"]) {
      selectNav(-1);
    } else if (event.key === "Enter" && textbox.value.match(/^\/\w+ $/)) {
      resetNavigationAndTextbox();
    }
  }

  if (event.key === "Backspace") {
    if (textbox.value === "delete:" || textbox.value === "empty:") {
      resetNavigationAndTextbox();
    } else if (textbox.value.match(/^\/\w+:[^ ]+ $/)) {
      const navElements = Array.from(document.querySelectorAll(".nav-element:not(.hidden)"));
      resetNavElementsStyle(navElements);
      textbox.value = textbox.value.substring(0, textbox.value.lastIndexOf(":")) + " ";
      setTimeout(() => { selectNav(0); }, 20);
    } else if (textbox.value.match(/^\/\w+:$/)) {
      textbox.value = textbox.value.substring(0, textbox.value.lastIndexOf(":")) + " ";
      setTimeout(() => { selectNav(0); }, 20);
    } else if (
      textbox.value.match(/^\/\w+:([^ ]+)? $/) ||
      textbox.value.match(/^\/\w+ $/)
    ) {
      resetNavigationAndTextbox();
    }
  }

  if (event.key === "Tab") {
    handleTabNavigation();
  }

  if (event.key === ":" && textbox.value.match(/^\/\w+ $/)) {
    textbox.value = textbox.value.replace(" ", "");
  }

  if (window.innerHeight > 200) {
    if (event.key === "ArrowDown" && !keysPressed["Shift"]) {
      selectLog(true);
    } else if (event.key === "ArrowUp" && !keysPressed["Shift"]) {
      selectLog(false);
    } else if (keysPressed["Shift"] && event.key === "ArrowUp") {
      focusText();
    } else if (keysPressed["Shift"] && event.key === "ArrowDown") {
      selectBoundingLog(false);
    } else if (
      keysPressed["Shift"] &&
      event.key === "Enter" &&
      currentSelectedLog
    ) {
      markDone();
    } else if (
      keysPressed["Shift"] &&
      event.key === "Delete" &&
      currentSelectedLog
    ) {
      deleteLog();
    }
  }

  if (event.key === " ") {
    const categoryRegex = /^\/(\w+)(?::(\w+))?$/;
    const match = categoryRegex.exec(textbox.value);
  
    if (match) {
      let potentialCategory = match[1] + (match[2] ? ":" + match[2] : "");
      
      if (Array.isArray(categories) && categories.some(category => category === potentialCategory)) {
        event.preventDefault();
        selectNav(0);
      }
    }
  }
});

window.addEventListener("keyup", (event) => {
  delete keysPressed[event.key];
});

function renderLogs(logs) {
  const categoryContainer = document.getElementById("category-container");
  const logContainer = document.getElementById("log-container");
  categories = [];

  prepareCategoryContainer("notes", categoryContainer, logContainer);

  if (!logs.categories || logs.categories.length === 0) {
    return;
  }

  const categoryGroups = groupAndSortCategories(logs.categories);

  categoryGroups.forEach(group => {
    group.forEach(category => {
      if (category.status === "deleted") { return; }

      categories.push(category.name.toLowerCase());

      let lcCategory = category.name.toLowerCase();
      let [mainCategory, subCategory] = category.name.toLowerCase().split(':');

      if (subCategory) {
        mainCategories[mainCategory] = true;
      }

      prepareCategoryNav(lcCategory, category, categoryContainer, mainCategories);
      prepareCategoryLogContainer(lcCategory, category, logContainer);
    });
  });
  markMainCategoriesWithSubcategories();
  selectNav(0);

  if(pomodoroCategory != null && pomodoroCategory != "") {
    filterCategories(pomodoroCategory);
    selectNav(1);
  }
}

function prepareCategoryContainer(categoryName, categoryContainer, logContainer) {
  let categoryNav = document.getElementById(`category-nav-${categoryName}`);
  if (!categoryNav) {
    categoryNav = document.createElement("div");
    categoryNav.id = `category-nav-${categoryName}`;
    categoryNav.classList.add("nav-element");
    categoryNav.setAttribute("data-category-nav", categoryName);
    categoryNav.innerHTML = categoryName;
    categoryContainer.appendChild(categoryNav);
  }

  let categoryLogsContainer = document.getElementById(`category-logs-${categoryName}`);
  if (!categoryLogsContainer) {
    categoryLogsContainer = document.createElement("div");
    categoryLogsContainer.id = `category-logs-${categoryName}`;
    categoryLogsContainer.classList.add("category-log-container");
    logContainer.appendChild(categoryLogsContainer);
  }
}

function prepareCategoryNav(lcCategory, category, categoryContainer, mainCategories) {
  let categoryNav = document.getElementById(`category-nav-${lcCategory}`);
  if (!categoryNav) {
    categoryNav = document.createElement("div");
    categoryNav.id = `category-nav-${lcCategory}`;
    categoryNav.classList.add("nav-element");
    categoryNav.setAttribute("data-category-nav", lcCategory);

    let isSubcategory = lcCategory.includes(':');
    let categoryName = category.name;

    categoryNav.innerHTML = categoryName;

    if (isSubcategory) {
      categoryNav.classList.add("hidden", "subcategory");
    }

    categoryContainer.appendChild(categoryNav);
  }
}

function prepareCategoryLogContainer(lcCategory, category, logContainer) {
  let categoryLogsContainer = document.getElementById(`category-logs-${lcCategory}`);
  if (!categoryLogsContainer) {
    categoryLogsContainer = document.createElement("div");
    categoryLogsContainer.id = `category-logs-${lcCategory}`;
    categoryLogsContainer.classList.add("category-log-container");
    logContainer.appendChild(categoryLogsContainer);
  }

  let containerHeader = document.getElementById(`${lcCategory}-header`);
  if (!containerHeader) {
    containerHeader = document.createElement("h2");
    containerHeader.id = `${lcCategory}-header`;
    containerHeader.textContent = `${lcCategory}`;
    categoryLogsContainer.appendChild(containerHeader);
  }

  if (category.logs.length > 0) {
    renderCategoryLogs(lcCategory, categoryLogsContainer, category.logs);
  }
}

function renderCategoryLogs(lcCategory, container, logs) {
  const sortedLogs = logs.slice().sort((a, b) => {
    return (a.status === "active" ? -1 : 1) - (b.status === "active" ? -1 : 1);
  });

  sortedLogs.forEach((log) => {
    if (log.status === "deleted") { return; }

    let logItem = document.getElementById(`${lcCategory}-log-${log.id}`);
    if (logItem) {
      logItem.remove();
    }

    logItem = document.createElement("input");
    logItem.type = "text";
    logItem.value = log.content;
    logItem.id = `${lcCategory}-log-${log.id}`;
    logItem.classList.add("log-item");
    logItem.setAttribute("data-category", lcCategory);
    logItem.setAttribute("data-log-id", log.id);
    logItem.setAttribute("data-log-status", log.status);
    if (log.status == "done") {
      logItem.disabled = true;
    }
    container.appendChild(logItem);
  });
}

function markMainCategoriesWithSubcategories() {
  let mainCategoriesWithSub = {};

  categories.forEach(category => {
    const [main, sub] = category.split(':');
    if (sub) {
      mainCategoriesWithSub[main] = true;
    }
  });

  for (let mainCategory in mainCategoriesWithSub) {
    const mainCategoryNav = document.getElementById(`category-nav-${mainCategory}`);
    if (mainCategoryNav && !mainCategoryNav.classList.contains("has-subcategory")) {
      mainCategoryNav.innerHTML += " &bull;";
      mainCategoryNav.classList.add("has-subcategory");
    }
  }
}

function groupAndSortCategories(categories) {
  let categoryGroups = {};
  categories.forEach(category => {
    let mainCategory = category.name.split(':')[0];
    if (!categoryGroups[mainCategory]) {
      categoryGroups[mainCategory] = [];
    }
    categoryGroups[mainCategory].push(category);
  });

  Object.values(categoryGroups).forEach(group => {
    group.sort((a, b) => {
      return a.name.localeCompare(b.name);
    });
  });

  return Object.values(categoryGroups);
}

function displayError(err, duration) {
  const errorMessage = document.getElementById("error-message");
  errorMessage.textContent = err;
  errorMessage.style.display = "flex";
  textbox.focus();

  setTimeout(() => { errorMessage.style.display = "none"; }, duration);
}

function initialiseForm() {
  const textForm = document.getElementById("text-form");
  const errorMessage = document.getElementById("error-message");

  let category;

  textForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const textboxValue = textbox.value.trim();

    const invalidCategoryRegex = /^\/\s/;
    const isInvalidCategory = invalidCategoryRegex.test(textboxValue);

    if (isInvalidCategory) {
      displayError("A blank category name? Not allowed I'm afraid.", 4000);
      return;
    } else {
      errorMessage.style.display = "none";
    }

    if (textboxValue.startsWith("delete:")) {
      let categoryToDelete = textboxValue.substring(7).toLowerCase();

      if (categoryToDelete === "notes") {
        displayError("You can't delete the notes category!", 4000);
        return;
      }

      let categoryExists = categories.some( (cat) => cat.name === categoryToDelete );

      if (categoryExists) {
        window.electronAPI.deleteCategory(categoryToDelete);
        removeCategoryElements(categoryToDelete);
        textbox.value = "delete:";
      } else {
        displayError(`Category '${categoryToDelete}' not found.`, 4000);
      }
    } else if (textboxValue.startsWith("empty:")) {
      let categoryToEmpty = textboxValue.substring(6).toLowerCase();
      let categoryExists = categories.includes(categoryToEmpty);
      if (categoryExists) {
        window.electronAPI.emptyCategory(categoryToEmpty);
        document.getElementById(`category-logs-${categoryToEmpty}`).remove();
        textbox.value = "empty:";
      } else {
        displayError(`Category '${categoryToEmpty}' not found.`, 4000);
      }
    } else if (textboxValue.startsWith("pom:")) {
      let pomAction = textboxValue.substring(4).toLowerCase();
      const parsedTime = parseInt(pomAction);
        if (!isNaN(parsedTime) && parsedTime > 0) {
          pomodoroCategory = category;
          startPomodoroTimer(parsedTime);
        } else if (pomAction === "pause") {
          pausePomodoroTimer();
        } else if (pomAction === "stop") {
          stopPomodoroTimer();
        } else if (pomAction === "resume") {
          resumePomodoroTimer();
        } else {
          displayError('Try "pom:[minutes]", "pom:pause", or "pom:stop".', 4000);
        }
    } else if (textboxValue.startsWith("/")) {
      const splitData = textboxValue.split(" ");
      category = splitData[0].substring(1);
      content = splitData.slice(1).join(" ");
      let categoryExists = categories.includes(category);

      if (content == "/d") {
        if (!categoryExists) {
          displayError(`This category doesn't exist.`, 4000);
          return;
        }
        if (!isConfirmationPending) {
          displayError(`Type /d and enter again to confirm category deletion.`, 8000);
          isConfirmationPending = true;
          confirmationTimeout = setTimeout(() => {
            isConfirmationPending = false;
          }, 8000);
        } else {
          clearTimeout(confirmationTimeout);
          window.electronAPI.deleteCategory(category);
          removeCategoryElements(category);
          clearText();
          isConfirmationPending = false;
        }
      } else if (content == "/e") {
        if (!categoryExists) {
          displayError(`This category doesn't exist.`, 4000);
          return;
        }
        if (!isConfirmationPendingForEmpty) {
          displayError(`Type /e and enter again to confirm category empty.`, 8000);
          isConfirmationPendingForEmpty = true;
          confirmationTimeoutForEmpty = setTimeout(() => {
            isConfirmationPendingForEmpty = false;
          }, 8000);
        } else {
          clearTimeout(confirmationTimeoutForEmpty);
          window.electronAPI.emptyCategory(category);
          document.querySelectorAll(`[id^='${category}-log-']`).forEach((element) => { element.remove(); });
          textbox.value = `/${category} `;
          isConfirmationPendingForEmpty = false;
        }
      } else if (content.startsWith("/m")) {
        if (!categoryExists) {
          displayError(`This category doesn't exist.`, 4000);
          return;
        }
        const mRegex = /^\/m(\d+)$/;
        const match = content.match(mRegex);
        
        if (match && match[1]) {
          const number = parseInt(match[1], 10);
          window.electronAPI.moveCategory(category, number);
          window.electronAPI.refreshLogs();
        } else {
          console.log("No valid number found after '/m'");
        }
      } else if (content.startsWith("pom:")) {
        if (!categoryExists) {
          displayError(`This category doesn't exist.`, 4000);
          return;
        }
        let pomAction = content.substring(4).toLowerCase();
        const parsedTime = parseInt(pomAction);
      
        if (!isNaN(parsedTime) && parsedTime > 0) {
          pomodoroCategory = category;
          startPomodoroTimer(parsedTime);
        } else if (pomAction === "pause") {
          pausePomodoroTimer();
        } else if (pomAction === "stop") {
          stopPomodoroTimer();
        } else if (pomAction === "resume") {
          resumePomodoroTimer();
        } else {
          displayError('Try "pom:[minutes]", "pom:pause", or "pom:stop".', 4000);
        }
      } else {
        window.electronAPI.sendText(textboxValue);
        setTimeout(() => {
          textbox.value = `/${category} `;
          filterCategories(category);
          selectNav(1);
        }, 50);
      }
    } else {
      window.electronAPI.sendText(textboxValue);
      textbox.value = ``;
    }
    setTimeout(() => { selectNav(0); }, 5);
  });

  function removeCategoryElements(categoryName) {
    const categoryPattern = new RegExp(
      `^category-(nav|logs)-${categoryName}(:|$)`
    );
    document.querySelectorAll("[id]").forEach((element) => {
      if (categoryPattern.test(element.id)) {
        element.remove();
      }
    });
  }

  textbox.addEventListener("input", function () {
    const inputValue = this.value.trim();
    const dRegex = /^\/[\w.-]+(:[\w.-]+)?\s*\/d$/;
    const eRegex = /^\/[\w.-]+(:[\w.-]+)?\s*\/e$/;
    const mRegex = /^\/[\w.-]+(:[\w.-]+)?\s*\/m\d+$/;

    if (inputValue.startsWith("/")) {
      const partialCategory = inputValue.substring(1).split(" ")[0];
      filterCategories(partialCategory);
    }

    if (
      inputValue.startsWith("delete:") ||
      inputValue.startsWith("empty:") ||
      dRegex.test(inputValue) ||
      eRegex.test(inputValue)
    ) {
      textbox.style.color = "tomato";
    } else if (mRegex.test(inputValue)) {
      textbox.style.color = "slateblue";
    } else {
      textbox.style.color = "var(--text-color)";
    }

    if (this.value.trim() === "") {
      hideSubcategories();
    }
  });
}

function startPomodoroTimer(durationInMinutes) {
  if (pomodoroTimerId) {
    clearInterval(pomodoroTimerId);
  }
  timeLeftInSeconds = durationInMinutes * 60;
  isTimerPaused = false;
  document.getElementById("timer-display").style.display = 'block';

  updateTimerDisplay();

  pomodoroTimerId = setInterval(updateTimerDisplay, 1000);
  window.electronAPI.requestHide();
}

function pausePomodoroTimer() {
  if (pomodoroTimerId) {
    clearInterval(pomodoroTimerId);
    pomodoroTimerId = null;
    isTimerPaused = true;
  }
  window.electronAPI.requestHide();
}

function resumePomodoroTimer() {
  if (!pomodoroTimerId && isTimerPaused) {
    isTimerPaused = false;
    pomodoroTimerId = setInterval(updateTimerDisplay, 1000);
  }
  window.electronAPI.requestHide();
}

function stopPomodoroTimer() {
  if (pomodoroTimerId) {
    clearInterval(pomodoroTimerId);
  }
  pomodoroTimerId = null;
  isTimerPaused = false;
  timeLeftInSeconds = 0;
  document.getElementById("timer-display").style.display = null;
  pomodoroCategory = null;
  window.electronAPI.requestHide();
}

function updateTimerDisplay() {
  const display = document.getElementById("timer-display");
  if (timeLeftInSeconds <= 0) {
    clearInterval(pomodoroTimerId);
    playChime();
    pomodoroTimerId = null;
    display.textContent = "";
    display.style.display = null;
  } else if (!isTimerPaused) {
    const minutes = Math.floor(timeLeftInSeconds / 60);
    const seconds = timeLeftInSeconds % 60;
    if (pomodoroCategory != null || pomodoroCategory != ""){
      display.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      display.textContent = `/${pomodoroCategory} ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    timeLeftInSeconds--;
  }
}

function playChime() {
  const chime = new Audio('assets/chime.mp3');
  chime.play();

  pomodoroCategory = null;
}

function filterCategories(partialCategory) {
  const navElements = document.getElementsByClassName("nav-element");
  const searchPattern = `category-nav-${partialCategory.toLowerCase()}`;

  Array.from(navElements).forEach((nav) => {
    const isSubcategory = nav.classList.contains("subcategory");
    const idMatches = nav.id.toLowerCase().includes(searchPattern);

    if (isSubcategory && !partialCategory.includes(":")) {
      nav.classList.add("hidden");
    } else if (idMatches) {
      nav.classList.remove("hidden");
    } else {
      nav.classList.add("hidden");
      currentCategory = null;
    }
  });
}

function showAllCategories() {
  const navElements = document.getElementsByClassName(
    "nav-element:not(.hidden)"
  );

  Array.from(navElements).forEach((nav) => { nav.classList.remove("hidden"); });
  selectNav(-currentCategory);
}

function selectNav(direction) {
  if(currentCategory == null) {
    direction = 0;
  }
  const navElements = Array.from(document.querySelectorAll(".nav-element:not(.hidden)"));
  const logContainers = Array.from(document.querySelectorAll(".category-log-container"));
  textbox.style.color = "var(--text-color)";
  unselectAllLogs();

  currentCategory = (currentCategory ?? 0) + direction;
  if (currentCategory < 0 || currentCategory >= navElements.length) return;

  resetNavElementsStyle(navElements);

  const selectedNavElement = navElements[currentCategory];
  if (selectedNavElement) {
    highlightSelectedNavElement(selectedNavElement);

    const categoryName = selectedNavElement.getAttribute("data-category-nav");
    updateLogContainersVisibility(categoryName, logContainers);

    updateTextboxForCategory(categoryName);
  } else {
    setTimeout(() => selectNav(0), 20);
  }
  focusText();
}

function resetNavElementsStyle(navElements) {
  navElements.forEach((div) => {
    div.style.backgroundColor = "";
    div.style.color = "";
  });
}

function highlightSelectedNavElement(navElement) {
  navElement.style.backgroundColor = "var(--theme-color)";
  navElement.style.color = "white";
  navElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function updateLogContainersVisibility(categoryName, logContainers) {
  logContainers.forEach((div) => div.classList.add("hidden"));
  document.getElementById(`category-logs-${categoryName}`).classList.remove("hidden");
}

function updateTextboxForCategory(categoryName) {
  textbox.value = categoryName !== "notes" ? `/${categoryName} ` : "";
  if (categoryName !== "notes") {
    setTimeout(() => { textbox.selectionStart = textbox.selectionEnd = textbox.value.length; }, 3);
  }
}

function scrollToTopOfLog() {
  const logContainer = document.getElementById("log-container");
  logContainer.scrollTo(0, 0);
}

function selectLog(down) {
  let logs = document.querySelectorAll(
    `.category-log-container:not(.hidden) input`
  );
  if (logs.length === 0) {
    return;
  }

  textbox.blur();

  selectedIndex = currentSelectedLog ? Array.from(logs).indexOf(currentSelectedLog) : -1;
  selectedIndex += down ? 1 : -1;

  if (selectedIndex < 0) {
    if (currentSelectedLog) {
      currentSelectedLog.classList.remove("selected");
      currentSelectedLog = null;
    }
    if (logs.length > 0) {
      logs[0].scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
    textbox.focus();
    setTimeout(() => { textbox.selectionStart = textbox.selectionEnd = textbox.value.length; }, 10);
    return;
  } else if (selectedIndex >= logs.length) {
    return;
  }

  if (currentSelectedLog) {
    currentSelectedLog.removeEventListener("input", editLogHandler);
    currentSelectedLog.classList.remove("selected");
    currentSelectedLog.blur();
  }
  currentSelectedLog = logs[selectedIndex];
  currentSelectedLog.classList.add("selected");
  currentSelectedLog.addEventListener("input", editLogHandler);
  currentSelectedLog.focus();
  setTimeout(() => { currentSelectedLog.selectionStart = currentSelectedLog.selectionEnd = currentSelectedLog.value.length; }, 10);

  currentSelectedLog.scrollIntoView({
    behavior: "instant",
    block: "nearest",
  });

  setTimeout(() => {
    const scrollableContainer = currentSelectedLog.parentElement;
    const buffer = 20;

    if (scrollableContainer.scrollLeft > currentSelectedLog.offsetLeft) {
      scrollableContainer.scrollLeft = currentSelectedLog.offsetLeft - buffer;
    } else {
      const rightEdge = currentSelectedLog.offsetLeft + currentSelectedLog.offsetWidth;
      const scrollRightEdge = scrollableContainer.scrollLeft + scrollableContainer.offsetWidth;

      if (rightEdge > scrollRightEdge) {
        scrollableContainer.scrollLeft = rightEdge - scrollableContainer.offsetWidth + buffer;
      }
    }
  }, 20);
}

function selectBoundingLog(top) {
  let logs = document.querySelectorAll(`.category-log-container:not(.hidden) input`);
  if (logs.length === 0) {
    return;
  }

  textbox.blur();

  if (currentSelectedLog) {
    currentSelectedLog.removeEventListener("input", editLogHandler);
    currentSelectedLog.classList.remove("selected");
    currentSelectedLog.blur();
  }

  if (top) {
    selectedIndex = 0;
  } else {
    selectedIndex = logs.length - 1;
  }
  currentSelectedLog = logs[selectedIndex];
  currentSelectedLog.classList.add("selected");
  currentSelectedLog.addEventListener("input", editLogHandler);
  currentSelectedLog.focus();
  setTimeout(() => {
    currentSelectedLog.selectionStart = currentSelectedLog.selectionEnd = currentSelectedLog.value.length;
  }, 10);

  currentSelectedLog.scrollIntoView({
    behavior: "instant",
    block: "nearest",
  });

  setTimeout(() => {
    const scrollableContainer = currentSelectedLog.parentElement;
    const buffer = 20;

    if (scrollableContainer.scrollLeft > currentSelectedLog.offsetLeft) {
      scrollableContainer.scrollLeft = currentSelectedLog.offsetLeft - buffer;
    } else {
      const rightEdge = currentSelectedLog.offsetLeft + currentSelectedLog.offsetWidth;
      const scrollRightEdge = scrollableContainer.scrollLeft + scrollableContainer.offsetWidth;

      if (rightEdge > scrollRightEdge) {
        scrollableContainer.scrollLeft = rightEdge - scrollableContainer.offsetWidth + buffer;
      }
    }
  }, 20);
}

function editLogHandler() {
  const content = this.value;
  const category = this.getAttribute("data-category");
  const id = this.getAttribute("data-log-id");

  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    editLog(content, category, id);
  }, 500);
}

function editLog(content, category, id) {
  let logData = [];
  logData.push({ content, category, id });
  window.electronAPI.editLog(logData);
}

function unselectAllLogs() {
  currentSelectedLog = null;
  let selectedLogs = document.querySelectorAll(".log-item.selected");
  selectedLogs.forEach((log) => { log.classList.remove("selected"); });
}

function deleteLog() {
  let selectedLogs = document.querySelectorAll(".log-item.selected");
  let logData = [];

  selectedLogs.forEach((log) => {
    let logCategory = log.getAttribute("data-category");
    let logId = log.getAttribute("data-log-id");
    logData.push({ logCategory, logId });
    let logs = document.querySelectorAll(`.log-item[data-category="${logCategory}"]`);
    if (selectedIndex + 1 === logs.length) {
      selectLog(false);
    } else {
      selectLog(true);
      selectedIndex--;
    }

    log.remove();
  });

  window.electronAPI.deleteLog(logData);
}

function markDone() {
  const selectedLog = document.querySelector(".log-item.selected");
  if (!selectedLog) return;

  const logCategory = selectedLog.getAttribute("data-category");
  const logId = parseInt(selectedLog.getAttribute("data-log-id"));
  const logStatus = selectedLog.getAttribute("data-log-status");
  const logData = [{ logCategory, logId }];

  selectedLog.setAttribute("data-log-status", logStatus === "active" ? "done" : "active");
  selectedLog.disabled = logStatus === "active";

  const shouldMoveSelection = shouldSelectNextLog(logCategory, logId, logStatus);
  if (shouldMoveSelection) {
    selectLog(logStatus === "active");
  }

  reorderLogsInCategory(logCategory);
  focusOnSelectedLog();
  window.electronAPI.markDone(logData);
}

function shouldSelectNextLog(logCategory, logId, currentStatus) {
  const logs = Array.from(document.querySelectorAll(`.log-item[data-category="${logCategory}"]`));
  const currentIndex = logs.findIndex((log) => parseInt(log.getAttribute("data-log-id")) === logId);

  if (currentStatus === "active") {
    return (currentIndex < logs.length - 1 || logs[currentIndex + 1].getAttribute("data-log-status") === "done"
    );
  } else {
    return ( currentIndex > 0 || logs[currentIndex - 1].getAttribute("data-log-status") === "active"
    );
  }
}

function focusOnSelectedLog() {
  const postActionLog = document.querySelector(".log-item.selected");
  if (!postActionLog) return;

  setTimeout(() => {
    postActionLog.focus();
    postActionLog.selectionStart = postActionLog.selectionEnd = postActionLog.value.length;
  }, 10);
}

function reorderLogsInCategory(category) {
  let categoryContainer = document.getElementById(`category-logs-${category}`);

  if (!categoryContainer) {
    console.error("Category container not found for", category);
    return;
  }

  let logItems = categoryContainer.querySelectorAll(".log-item");
  let logsArray = Array.from(logItems);

  logsArray.sort((a, b) => {
    let statusA = a.getAttribute("data-log-status");
    let statusB = b.getAttribute("data-log-status");
    let idA = parseInt(a.getAttribute("data-log-id"));
    let idB = parseInt(b.getAttribute("data-log-id"));

    if (statusA === statusB) {
      return idA - idB;
    } else {
      return statusA === "active" ? -1 : 1;
    }
  });

  logsArray.forEach((log) => categoryContainer.appendChild(log));
}

function hideSubcategories() {
  subcategories = document.querySelectorAll(".subcategory");
  subcategories.forEach((subCat) => { subCat.classList.add("hidden"); });
}
