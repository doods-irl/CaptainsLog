let categories;
let currentCategory;
let currentSelectedLog = null;
let keysPressed = {};
let selectedIndex;

function focusText() {
  const textbox = document.getElementById("textbox");
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

document.addEventListener("DOMContentLoaded", () => {
  window.electronAPI.refreshLogs();
  initialiseForm();
});

window.addEventListener("keydown", function (event) {
  keysPressed[event.key] = true;

  if (!keysPressed["Shift"] && event.key === "ArrowRight") {
    selectNav(1);
  } else if (!keysPressed["Shift"] && event.key === "ArrowLeft") {
    selectNav(-1);
  }

  if (event.key === "Backspace") {
    const textbox = document.getElementById("textbox");
    const categoryWithSubcategoryRegex = /^\/\w+:.+ $/;
    const categoryWithColonRegex = /^\/\w+:$/;
    const categoryRegex = /^\/\w+ $/;

    if (textbox.value === "delete:" || textbox.value === "empty:") {
      textbox.value = "";
      showAllCategories();
    }

    if (categoryWithSubcategoryRegex.test(textbox.value)) {
      textbox.value = textbox.value.substring(
        0,
        textbox.value.lastIndexOf(":") + 2
      );
      Array.from(document.getElementsByClassName("nav-element")).forEach(
        (nav) => {
          nav.style.backgroundColor = "";
          nav.style.color = "";
        }
      );
    } else if (
      categoryWithColonRegex.test(textbox.value) ||
      categoryRegex.test(textbox.value)
    ) {
      textbox.value = "";
      showAllCategories();
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
    selectNav(-1);
  } else if (event.key === "Tab") {
    event.preventDefault();
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
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      selectLog(event.key === "ArrowDown");
    } else if (event.key === "Enter" && currentSelectedLog) {
      markDone();
    } else if (event.key === "Delete" && currentSelectedLog) {
      deleteLog();
    }
  }

  if (event.key === " ") {
    const textbox = document.getElementById("textbox");
    const categoryRegex = /^\/(\w+)$/;
    const match = categoryRegex.exec(textbox.value);

    if (match && match[1]) {
      const potentialCategory = match[1];
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

        logItem = document.createElement("p");
        logItem.textContent = log.content;
        logItem.id = `${lcCategory}-log-${log.id}`;
        logItem.classList.add("log-item");
        logItem.setAttribute("data-category", lcCategory);
        logItem.setAttribute("data-log-id", log.id);
        logItem.setAttribute("data-log-status", log.status);
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
      displayError("A blank category? Not allowed I'm afraid.");

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
      textbox.style.color = "black";
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
  textbox.style.color = "black";
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
    navElements[currentCategory].style.backgroundColor = "tomato";
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

function selectLog(down) {
  const textbox = document.getElementById("textbox");

  let logs = document.querySelectorAll(
    `.category-log-container:not(.hidden) p`
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

  if (currentSelectedLog) currentSelectedLog.classList.remove("selected");
  currentSelectedLog = logs[selectedIndex];
  currentSelectedLog.classList.add("selected");

  currentSelectedLog.scrollIntoView({
    behavior: "smooth",
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
  }, 100);
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
  let selectedLogs = document.querySelectorAll(".log-item.selected");
  let logData = [];

  selectedLogs.forEach((log) => {
    let logCategory = log.getAttribute("data-category");
    let logId = log.getAttribute("data-log-id");
    logData.push({ logCategory, logId });

    let logStatus = log.getAttribute("data-log-status");
    log.setAttribute(
      "data-log-status",
      logStatus === "active" ? "done" : "active"
    );

    let container = log.parentElement;
    let activeLogs = container.querySelectorAll(
      '.log-item[data-log-status="active"]'
    );
    let lastActiveLog = activeLogs[activeLogs.length - 1];

    if (lastActiveLog) {
      let logs = document.querySelectorAll(
        `.log-item[data-category="${logCategory}"]`
      );
      if (selectedIndex + 1 === logs.length) {
        selectLog(false);
      } else {
        selectLog(true);
        selectedIndex--;
      }
      lastActiveLog.after(log);
    }
  });

  window.electronAPI.markDone(logData);
}
