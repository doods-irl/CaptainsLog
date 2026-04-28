export const state = {
  logs: { categories: [] },
  theme: { accentColor: "tomato", themeColor: "light" },
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
  pomodoro: {
    timerId: null,
    timeLeftInSeconds: 0,
    isPaused: false,
    category: null,
  },
};

export const dom = {};

export function cacheDom() {
  dom.textbox = document.getElementById("textbox");
  dom.textForm = document.getElementById("text-form");
  dom.categoryContainer = document.getElementById("category-container");
  dom.logContainer = document.getElementById("log-container");
  dom.errorMessage = document.getElementById("error-message");
  dom.timerDisplay = document.getElementById("timer-display");
}
