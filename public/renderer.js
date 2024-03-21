let categories;
let currentCategory;
let currentSelectedLog = null;
let keysPressed = {};
let selectedIndex;
let debounceTimer;

function focusText() {
  const textbox = document.getElementById("textbox");
  unselectAllLogs();
  scrollToTopOfLog();
  if (textbox) {
    textbox.focus();
  }
}

function clearText() {
  const textbox = document.getElementById("textbox");
  if (textbox) {
    textbox.value = "";
  }
}

function setTheme(accentColor, themeColor) {
  document.documentElement.style.setProperty("--theme-color", `${accentColor}`);
  document.documentElement.setAttribute("data-theme", themeColor);
}

document.addEventListener("DOMContentLoaded", () => {
  window.electronAPI.refreshLogs();
  initialiseForm();
});

window.addEventListener("keydown", function (event) {
  keysPressed[event.key] = true;

  if (!keysPressed["Shift"] && !currentSelectedLog && event.key === "ArrowRight") {
    selectNav(1);
  } else if (!keysPressed["Shift"] && !currentSelectedLog && event.key === "ArrowLeft") {
    selectNav(-1);
  }

  if (event.key === "Backspace") {
    const textbox = document.getElementById("textbox");

    const categoryWithSubcategoryRegex = /^\/\w+:([^ ]+)?$/;

    const categoryWithOneWordRegex = /^\/\w+:[^ ]+ $/;
    const categoryRegex = /^\/\w+ $/;

    if (textbox.value === "delete:" || textbox.value === "empty:") {
      textbox.value = "";
      showAllCategories();
    }

    if (categoryWithOneWordRegex.test(textbox.value)) {
      textbox.value = textbox.value.substring(
        0,
        textbox.value.lastIndexOf(":") + 1
      );
      setTimeout(() => {
        selectNav(0);
      }, 20);
      Array.from(document.getElementsByClassName("nav-element")).forEach(
        (nav) => {
          nav.style.backgroundColor = "";
          nav.style.color = "";
        }
      );
    } else if (
      categoryWithSubcategoryRegex.test(textbox.value) ||
      categoryRegex.test(textbox.value)
    ) {
      textbox.value = textbox.value.replace(/ [^ ]+$/, "");
      showAllCategories();
      setTimeout(() => {
        selectNav(0);
      }, 20);
    }
  }

  if (event.key === "Enter" && !currentSelectedLog) {
    const textbox = document.getElementById("textbox");
    const categoryRegex = /^\/\w+ $/;
    if (categoryRegex.test(textbox.value)) {
      textbox.value = "";
      showAllCategories();
      selectNav(1);
    }
  }

  if (keysPressed["Shift"] && event.key == "Tab") {
    event.preventDefault();
    focusText();
    selectNav(-1);
  } else if (event.key === "Tab") {
    event.preventDefault();
    focusText();
    selectNav(1);
  }

  if (event.key === ":") {
    const categoryRegex = /^\/\w+ $/;
    if (categoryRegex.test(textbox.value)) {
      subcatValue = textbox.value.replace(" ", "");
      textbox.value = subcatValue;
    }
  }

  if (window.innerHeight > 200) {
    if (!keysPressed["Shift"] && event.key === "ArrowDown" || !keysPressed["Shift"] && event.key === "ArrowUp") {
      selectLog(event.key === "ArrowDown");
    } else if (keysPressed["Shift"] && event.key === "ArrowUp") {
      focusText();
    } else if (keysPressed["Shift"] && event.key === "ArrowDown") {
      selectBoundingLog(false);
    }else if (keysPressed["Shift"] && event.key === "Enter" && currentSelectedLog) {
      markDone();
    } else if (keysPressed["Shift"] && event.key === "Delete" && currentSelectedLog) {
      deleteLog();
    }
  }

  if (event.key === " ") {
    const textbox = document.getElementById("textbox");
    const categoryRegex = /^\/(\w+)(?::(\w+))?$/;
    const match = categoryRegex.exec(textbox.value);

    if (match) {
      let potentialCategory = match[1];

      if (match[2]) {
        potentialCategory += ":" + match[2];
      }

      const isCategory = categories.some(
        (category) => category.name === potentialCategory
      );

      textbox.value = textbox.value.toLowerCase().replace(" ", "");

      if (isCategory) {
        currentCategory = null;
        setTimeout(() => {
          selectNav(0);
        }, 20);
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

  let categoryNavNotes = document.getElementById(`category-nav-notes`);
  if (!categoryNavNotes) {
    categoryNavNotes = document.createElement("div");
    categoryNavNotes.id = `category-nav-notes`;
    categoryNavNotes.classList.add("nav-element");
    categoryNavNotes.setAttribute("data-category-nav", "notes");
    categoryNavNotes.innerHTML = "notes";
    categoryContainer.appendChild(categoryNavNotes);
  }

  let categoryNotesContainer = document.getElementById(`category-logs-notes`);
  if (!categoryNotesContainer) {
    categoryNotesContainer = document.createElement("div");
    categoryNotesContainer.id = `category-logs-notes`;
    categoryNotesContainer.classList.add("category-log-container");
    logContainer.appendChild(categoryNotesContainer);
  }

  if (!logs.categories || logs.categories.length === 0) {
    return;
  }

  logs.categories.forEach((category) => {
    if (!categories.includes(category)) {
      categories.push(category);
    }

    let lcCategory = category.name.toLowerCase();
    let categoryNav = document.getElementById(`category-nav-${lcCategory}`);
    if (!categoryNav) {
      categoryNav = document.createElement("div");
      categoryNav.id = `category-nav-${lcCategory}`;
      categoryNav.classList.add("nav-element");
      categoryNav.setAttribute("data-category-nav", lcCategory);
      categoryNav.innerHTML = `${category.name}`;
      categoryContainer.appendChild(categoryNav);
    }

    let categoryLogsContainer = document.getElementById(
      `category-logs-${lcCategory}`
    );
    if (!categoryLogsContainer) {
      categoryLogsContainer = document.createElement("div");
      categoryLogsContainer.id = `category-logs-${lcCategory}`;
      categoryLogsContainer.classList.add("category-log-container");
      logContainer.appendChild(categoryLogsContainer);
    }

    if (category.logs.length === 0) {
      return;
    } else {
      const sortedLogs = category.logs.slice().sort((a, b) => {
        if (a.status === "active" && b.status !== "active") {
          return -1;
        } else if (a.status !== "active" && b.status === "active") {
          return 1;
        }
        return 0;
      });

      sortedLogs.forEach((log) => {
        if (log.status === "deleted") {
          return;
        }

        let logItem = document.getElementById(`${lcCategory}-log-${log.id}`);
        if (logItem) {
          logItem.remove();
        }

        logItem = document.createElement("input");
        logItem.type = 'text';
        logItem.value = log.content;
        logItem.id = `${lcCategory}-log-${log.id}`;
        logItem.classList.add("log-item");
        logItem.setAttribute("data-category", lcCategory);
        logItem.setAttribute("data-log-id", log.id);
        logItem.setAttribute("data-log-status", log.status);
        if(log.status == 'done') {
          logItem.disabled = true;
        }
        categoryLogsContainer.appendChild(logItem);
      });
    }
  });
  selectNav(-1);
}

function displayError(err) {
  const errorMessage = document.getElementById("error-message");
  errorMessage.textContent = err;
  errorMessage.style.display = "flex";
  textbox.focus();

  setTimeout(() => {
    errorMessage.style.display = "none";
  }, 4000);
}

function initialiseForm() {
  const textForm = document.getElementById("text-form");
  const textbox = document.getElementById("textbox");
  const errorMessage = document.getElementById("error-message");
  let category;

  textForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const textbox = document.getElementById("textbox");
    const textboxValue = textbox.value.trim();

    const invalidCategoryRegex = /^\/\s/;
    const isInvalidCategory = invalidCategoryRegex.test(textboxValue);

    if (isInvalidCategory) {
      displayError("A blank category name? Not allowed I'm afraid.");

      return;
    } else {
      errorMessage.style.display = "none";
    }

    if (textboxValue.startsWith("delete:")) {
      let categoryToDelete = textboxValue.substring(7).toLowerCase();
      if (categoryToDelete === "notes") {
        displayError("You can't delete the notes category!");
        return;
      }
      let categoryExists = categories.some(
        (cat) => cat.name === categoryToDelete
      );
      if (categoryExists) {
        window.electronAPI.deleteCategory(categoryToDelete);
        document.getElementById(`category-nav-${categoryToDelete}`).remove();
        document.getElementById(`category-logs-${categoryToDelete}`).remove();
        textbox.value = "delete:";
      } else {
        displayError(`Category '${categoryToDelete}' not found.`);
      }
    } else if (textboxValue.startsWith("empty:")) {
      let categoryToEmpty = textboxValue.substring(6).toLowerCase();
      let categoryExists = categories.some(
        (cat) => cat.name === categoryToEmpty
      );
      if (categoryExists) {
        window.electronAPI.emptyCategory(categoryToEmpty);
        document.getElementById(`category-logs-${categoryToEmpty}`).remove();
        textbox.value = "empty:";
      } else {
        displayError(`Category '${categoryToEmpty}' not found.`);
      }
    } else if (textboxValue.startsWith("/")) {
      const splitData = textboxValue.split(" ");
      category = splitData[0].substring(1);
      content = splitData.slice(1).join(" ");
      if (content == "/d") {
        window.electronAPI.deleteCategory(category);
        document.getElementById(`category-nav-${category}`).remove();
        document.getElementById(`category-logs-${category}`).remove();
        textbox.value = "";
        filterCategories("");
      } else if (content == "/e") {
        window.electronAPI.emptyCategory(category);
        document
          .querySelectorAll(`[id^='${category}-log-']`)
          .forEach((element) => {
            element.remove();
          });
        textbox.value = `/${category} `;
      } else if (content.startsWith("/m")) {
        const mRegex = /^\/m(\d+)$/;
        const match = content.match(mRegex);
        if (match && match[1]) {
          const number = parseInt(match[1], 10);
          window.electronAPI.moveCategory(category, number);
          location.reload();
        } else {
          console.log("No valid number found after '/m'");
        }
      } else {
        window.electronAPI.sendText(textboxValue);
        textbox.value = `/${category} `;
      }
    } else {
      window.electronAPI.sendText(textboxValue);
      textbox.value = ``;
    }
    setTimeout(() => {
      selectNav(0);
    }, 5);
  });

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
  });
}

function filterCategories(partialCategory) {
  const navElements = document.getElementsByClassName("nav-element");
  const searchPattern = `category-nav-${partialCategory.toLowerCase()}`;

  Array.from(navElements).forEach((nav) => {
    if (!nav.id.toLowerCase().includes(searchPattern)) {
      nav.classList.add("hidden");
      currentCategory = null;
    } else {
      nav.classList.remove("hidden");
    }
  });
}

function showAllCategories() {
  const navElements = document.getElementsByClassName("nav-element");

  Array.from(navElements).forEach((nav) => {
    nav.classList.remove("hidden");
  });

  selectNav(-currentCategory);
}

function selectNav(direction) {
  const navElements = document.querySelectorAll(".nav-element:not(.hidden)");
  const logContainers = document.querySelectorAll(".category-log-container");
  const textbox = document.getElementById("textbox");
  textbox.style.color = "var(--text-color)";
  unselectAllLogs();

  if (currentCategory == null) {
    currentCategory = 0;
  } else {
    if (
      currentCategory + direction >= navElements.length ||
      currentCategory + direction < 0
    ) {
      return;
    } else {
      currentCategory = currentCategory + direction;
    }
  }

  navElements.forEach((div) => {
    div.style.backgroundColor = "";
    div.style.color = "";
  });

  if (navElements[currentCategory]) {
    navElements[currentCategory].style.backgroundColor = "var(--theme-color)";
    navElements[currentCategory].style.color = "white";

    navElements[currentCategory].scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });

    let categoryName =
      navElements[currentCategory].getAttribute("data-category-nav");
    let currentLogContainer = document.getElementById(
      `category-logs-${categoryName}`
    );
    logContainers.forEach((div) => {
      div.classList.add("hidden");
    });
    currentLogContainer.classList.remove("hidden");

    if (categoryName != "notes") {
      textbox.value = "";
      textbox.value = `/${categoryName} `;
      setTimeout(() => {
        textbox.selectionStart = textbox.selectionEnd = textbox.value.length;
      }, 3);
    } else {
      textbox.value = "";
    }
  } else {
    setTimeout(() => {
      selectNav(0);
    }, 20);
  }

  focusText();
}

function scrollToTopOfLog() {
  const logContainer = document.getElementById("log-container");
  logContainer.scrollTo(0,0);
}

function selectLog(down) {
  const textbox = document.getElementById("textbox");

  let logs = document.querySelectorAll(
    `.category-log-container:not(.hidden) input`
  );
  if (logs.length === 0) {
    return;
  }

  textbox.blur();

  selectedIndex = currentSelectedLog
    ? Array.from(logs).indexOf(currentSelectedLog)
    : -1;

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
    setTimeout(() => {
      textbox.selectionStart = textbox.selectionEnd = textbox.value.length;
    }, 10);
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
      const rightEdge =
        currentSelectedLog.offsetLeft + currentSelectedLog.offsetWidth;
      const scrollRightEdge =
        scrollableContainer.scrollLeft + scrollableContainer.offsetWidth;

      if (rightEdge > scrollRightEdge) {
        scrollableContainer.scrollLeft =
          rightEdge - scrollableContainer.offsetWidth + buffer;
      }
    }
  }, 20);
}

function selectBoundingLog(top) {
  const textbox = document.getElementById("textbox");

  let logs = document.querySelectorAll(
    `.category-log-container:not(.hidden) input`
  );
  if (logs.length === 0) {
    return;
  }

  textbox.blur();

  if (currentSelectedLog) {
    currentSelectedLog.removeEventListener("input", editLogHandler);
    currentSelectedLog.classList.remove("selected");
    currentSelectedLog.blur();
  }

  
  // Select the last log
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

    // Adjust scrolling if necessary
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

  // Clear the existing timer if it exists
  if (debounceTimer) clearTimeout(debounceTimer);

  // Set a new timer
  debounceTimer = setTimeout(() => {
    editLog(content, category, id);
  }, 500); // Delay in milliseconds, adjust as needed
}

function editLog(content, category, id) {
  let logData = [];
  logData.push({ content, category, id });
  window.electronAPI.editLog(logData);
}

function unselectAllLogs() {
  currentSelectedLog = null;
  let selectedLogs = document.querySelectorAll(".log-item.selected");
  selectedLogs.forEach((log) => {
    log.classList.remove("selected");
  });
}

function deleteLog() {
  let selectedLogs = document.querySelectorAll(".log-item.selected");
  let logData = [];

  selectedLogs.forEach((log) => {
    let logCategory = log.getAttribute("data-category");
    let logId = log.getAttribute("data-log-id");
    logData.push({ logCategory, logId });
    let logs = document.querySelectorAll(
      `.log-item[data-category="${logCategory}"]`
    );
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
  let selectedLog = document.querySelector(".log-item.selected");
  let logData = [];

    let logCategory = selectedLog.getAttribute("data-category");
    let logId = parseInt(selectedLog.getAttribute("data-log-id"));
    logData.push({ logCategory, logId });

    let logStatus = selectedLog.getAttribute("data-log-status");

    let doneLogs = Array.from(
      document.querySelectorAll(
        `.log-item[data-category="${logCategory}"][data-log-status="done"]`
      )
    );
    let activeLogs = Array.from(
      document.querySelectorAll(
        `.log-item[data-category="${logCategory}"][data-log-status="active"]`
      )
    );

    if (logStatus === "active") {
      selectedLog.disabled = true;
      let isLastActiveLog =
        logStatus === "active" && selectedLog === activeLogs[activeLogs.length - 1];
      let firstDoneLog = document.querySelector(
        `.log-item[data-category="${logCategory}"][data-log-status="done"]`
      );
      let firstDoneLogId = firstDoneLog
        ? parseInt(firstDoneLog.getAttribute("data-log-id"))
        : Infinity;

      if (!(isLastActiveLog && logId < firstDoneLogId)) {
        selectLog(true);
      }
    }

    if (logStatus === "done") {
      selectedLog.disabled = false;
      let isFirstDoneLog = logStatus === "done" && selectedLog === doneLogs[0];
      let lastActiveLog =
        activeLogs.length > 0 ? activeLogs[activeLogs.length - 1] : null;
      let lastActiveLogId = lastActiveLog
        ? parseInt(lastActiveLog.getAttribute("data-log-id"))
        : -Infinity;

      if (!(isFirstDoneLog && logId > lastActiveLogId)) {
        selectLog(false);
      }
    }

    selectedLog.setAttribute(
      "data-log-status",
      logStatus === "active" ? "done" : "active"
    );

    reorderLogsInCategory(logCategory);

  let postActionLog = document.querySelector(".log-item.selected");
  setTimeout(() => {
    postActionLog.focus();
    postActionLog.selectionStart = postActionLog.selectionEnd = postActionLog.value.length;
  }, 10);

  window.electronAPI.markDone(logData);
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
