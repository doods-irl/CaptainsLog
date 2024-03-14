let categories;
let currentCategory;
let lastSubmitCategory;
let currentSelectedLog = null;

function focusText() {
    const textbox = document.getElementById('textbox');
    if (textbox) {
        textbox.focus();
    }
}

function clearText() {
    const textbox = document.getElementById('textbox');
    if (textbox) {
        textbox.value = '';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.electronAPI.refreshLogs();
    initialiseForm();
});

window.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowRight') {
        selectNav (1);
    } else if (event.key === 'ArrowLeft') {
        selectNav (-1);
    }

    if (event.key === 'Backspace') {
        const textbox = document.getElementById('textbox');
        const categoryRegex = /^\/\w+ $/;
        if (categoryRegex.test(textbox.value)) {
            textbox.value = '';
            showAllCategories();
        }
    }

    if (event.key === 'Tab') {
        event.preventDefault();
        selectNav(0);
    }

    if (window.innerHeight > 200) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          selectLog(event.key === 'ArrowDown');
        } else if (event.key === 'Enter' && currentSelectedLog) {
          currentSelectedLog.click();
        } else if (event.key === 'Delete' && currentSelectedLog) {
          deleteLog();
          textbox.focus();
          setTimeout(() => {
            textbox.selectionStart = textbox.selectionEnd = textbox.value.length;
          }, 10);
        }
    }

    if (event.key === ' ') {
        const textbox = document.getElementById('textbox');
        const categoryRegex = /^\/(\w+)$/;
        const match = categoryRegex.exec(textbox.value);
    
        if (match && match[1]) {
            const potentialCategory = match[1]; // This is the category name without the slash
    
            // Check if the potentialCategory is in the categories array
            const isCategory = categories.some(category => category.name === potentialCategory);
    
            if (isCategory) {
                currentCategory = null; // It looks like there's a typo in your original code, it should be an assignment, not a comparison
                setTimeout(() => {
                    selectNav(0);
                }, 3);
            }
        }
    }
});

function renderLogs(logs) {
    const categoryContainer = document.getElementById('category-container');
    const logContainer = document.getElementById('log-container');
    categories = [];

    let categoryNavNotes = document.getElementById(`category-nav-notes`);
    if (!categoryNavNotes) {
        categoryNavNotes = document.createElement('div');
        categoryNavNotes.id = `category-nav-notes`;
        categoryNavNotes.classList.add('nav-element');
        categoryNavNotes.setAttribute('data-category-nav', 'notes'); // Set data-category attribute
        categoryNavNotes.innerHTML = 'Notes';
        categoryContainer.appendChild(categoryNavNotes);
    }

    let categoryNotesContainer = document.getElementById(`category-logs-notes`);
    if (!categoryNotesContainer) {
        categoryNotesContainer = document.createElement('div');
        categoryNotesContainer.id = `category-logs-notes`;
        categoryNotesContainer.classList.add('category-log-container');
        logContainer.appendChild(categoryNotesContainer);
    }

    selectNav(0);

    console.log(logs);
    if (!logs.categories || logs.categories.length === 0)
    {
        return;
    }

    logs.categories.forEach(category => {
        if (!categories.includes(category)) {
            categories.push(category);
        }

        let lcCategory = category.name.toLowerCase();
        let categoryNav = document.getElementById(`category-nav-${lcCategory}`);
        if (!categoryNav) {
            categoryNav = document.createElement('div');
            categoryNav.id = `category-nav-${lcCategory}`;
            categoryNav.classList.add('nav-element');
            categoryNav.setAttribute('data-category-nav', lcCategory); // Set data-category attribute
            categoryNav.innerHTML = `${category.name}`;
            categoryContainer.appendChild(categoryNav);
        }

        let categoryLogsContainer = document.getElementById(`category-logs-${lcCategory}`);
        if (!categoryLogsContainer) {
            categoryLogsContainer = document.createElement('div');
            categoryLogsContainer.id = `category-logs-${lcCategory}`;
            categoryLogsContainer.classList.add('category-log-container');
            logContainer.appendChild(categoryLogsContainer);
        }

        if(category.logs.length === 0) {
            return;
        } else {
            category.logs.forEach(log => {
                let logItem = document.getElementById(`${lcCategory}-log-${log.id}`);
                if (!logItem) {
                    logItem = document.createElement('p');
                    logItem.textContent = log.content;
                    logItem.id = `${lcCategory}-log-${log.id}`;
                    logItem.classList.add('log-item');
                    categoryLogsContainer.appendChild(logItem);
                }
            });
        }
    });

    if (!categoryNotesContainer.innerHTML)
    {
        categoryNotesContainer.textContent = 'Nothing here...';
    }
}

function initialiseForm() {
    const textForm = document.getElementById('text-form');
    const textbox = document.getElementById('textbox');
    const errorMessage = document.getElementById('error-message');
    let category;

    textForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const textbox = document.getElementById('textbox');
        const textboxValue = textbox.value.trim();

        const invalidCategoryRegex = /^\/\s/;
        const isInvalidCategory = invalidCategoryRegex.test(textboxValue);

        // Regular expression to find '/category'
        const categoryRegex = /^\/(\w+)$/;
        const isCategoryOnly = categoryRegex.test(textboxValue);

        if (isInvalidCategory) {
            errorMessage.textContent = "A blank category? Not allowed I'm afraid.";
            errorMessage.style.display = 'flex';
            textbox.focus(); // Put the focus back on the textbox
        
            // Hide the error message after 4 seconds
            setTimeout(() => {
                errorMessage.style.display = 'none';
            }, 4000);
        
            return; // Stop the form submission
        } else if (isCategoryOnly) {
            errorMessage.textContent = "Need a log to start a category!";
            errorMessage.style.display = 'flex';
            textbox.focus(); // Put the focus back on the textbox
      
            // Hide the error message after 4 seconds
            setTimeout(() => {
              errorMessage.style.display = 'none';
            }, 4000);
      
            return; // Stop the form submission
          } else {
            errorMessage.style.display = 'none'; // Hide error message if input is valid
          }

        if (textboxValue.startsWith('/')) {
            const splitData = textboxValue.split(' ');
            category = splitData[0].substring(1); // Remove the leading '/'
            content = splitData.slice(1).join(' ');
        }

        console.log(textboxValue);
        window.electronAPI.sendText(textboxValue);
        textbox.value = `/${category} `
    });

    textbox.addEventListener('input', function () {
        const inputValue = this.value.trim();
    
        // Check if the input starts with '/'
        if (inputValue.startsWith('/')) {
            const partialCategory = inputValue.substring(1).split(' ')[0];
            filterCategories(partialCategory);
        }
    });
}

function filterCategories(partialCategory) {
    const navElements = document.getElementsByClassName("nav-element");
    const searchPattern = `category-nav-${partialCategory.toLowerCase()}`; // Lowercase the partialCategory
    const logContainer = document.getElementById('log-container');
    const logContainers = document.querySelectorAll('.category-log-container');

    Array.from(navElements).forEach(nav => {
        if (!nav.id.toLowerCase().includes(searchPattern)) { // Check in a case-insensitive manner
            nav.classList.add('hidden');
            currentCategory = null;
        } else {
            nav.classList.remove('hidden'); // Optional: remove class from elements that match
        }
    });

    // logContainers.forEach(container => {
    //     if(partialCategory.length > 0) {
    //         container.classList.add('hidden');
    //     } else {
    //         container.classList.remove('hidden');
    //     }
    // });
}

function showAllCategories() {
    const navElements = document.getElementsByClassName("nav-element");

    Array.from(navElements).forEach(nav => {
            nav.classList.remove('hidden');
    });

    selectNav(-currentCategory);
}

function selectNav(direction) {
    const navElements = document.querySelectorAll('.nav-element:not(.hidden)');
    const logContainers = document.querySelectorAll('.category-log-container');

    if (currentCategory == null) {
        currentCategory = 0;
    } else {
        if (currentCategory + direction >= navElements.length || currentCategory + direction < 0) { // Check if next category exists
            return;
        } else {
            currentCategory = currentCategory + direction;
        }
    }

    navElements.forEach(div => {
      div.style.backgroundColor = '';
      div.style.color = '';
    });

    if (navElements[currentCategory])
    {
        navElements[currentCategory].style.backgroundColor = 'tomato';
        navElements[currentCategory].style.color = 'white';

        let categoryName = navElements[currentCategory].getAttribute('data-category-nav');
        let currentLogContainer = document.getElementById(`category-logs-${categoryName}`);
        logContainers.forEach(div => {
            div.classList.add('hidden');
        });
        currentLogContainer.classList.remove('hidden');

        if(categoryName != 'notes') {
            const textbox = document.getElementById('textbox');
            textbox.value = '';
            textbox.value = `/${categoryName} `;
            setTimeout(() => {
                textbox.selectionStart = textbox.selectionEnd = textbox.value.length;
            }, 3);
        } else {
            textbox.value = '';
        }
    } else {
        setTimeout(() => {
            selectNav(0);
        }, 20);
    }

    focusText();
}

function selectLog(down) {
    const textbox = document.getElementById('textbox');
    textbox.blur();

    let logs = document.querySelectorAll(`.category-log-container:not(.hidden) p`);
    if (logs.length === 0) {
      return;
    } // No logs in the current category
  
    let selectedIndex = currentSelectedLog ? Array.from(logs).indexOf(currentSelectedLog) : -1;
    console.log(selectedIndex);
    // Move the selection up or down
    selectedIndex += down ? 1 : -1;
  
    // If the index is out of bounds, unselect and return
    if (selectedIndex < 0) {
      if (currentSelectedLog) {
        currentSelectedLog.classList.remove('selected');
        currentSelectedLog = null;
      }
      textbox.focus();
      setTimeout(() => {
        textbox.selectionStart = textbox.selectionEnd = textbox.value.length;
      }, 10);
      return;
    } else if (selectedIndex >= logs.length) {
        return;
    }
  
    // Update the selected log
    if (currentSelectedLog) currentSelectedLog.classList.remove('selected');
    currentSelectedLog = logs[selectedIndex];
    currentSelectedLog.classList.add('selected');
  
    // Scroll the selected log into view
    currentSelectedLog.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  }