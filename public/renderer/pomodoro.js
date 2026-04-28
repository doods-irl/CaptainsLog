export function startPomodoroTimer(state, dom, onTick) {
  return (durationInMinutes) => {
    if (state.pomodoro.timerId) {
      clearInterval(state.pomodoro.timerId);
    }

    state.pomodoro.timeLeftInSeconds = durationInMinutes * 60;
    state.pomodoro.isPaused = false;
    updateTimerDisplay(state, dom);
    state.pomodoro.timerId = setInterval(() => {
      updateTimerDisplay(state, dom);
      onTick();
    }, 1000);
  };
}

export function pausePomodoroTimer(state) {
  if (state.pomodoro.timerId) {
    clearInterval(state.pomodoro.timerId);
    state.pomodoro.timerId = null;
    state.pomodoro.isPaused = true;
  }
}

export function resumePomodoroTimer(state, dom, onTick) {
  if (!state.pomodoro.timerId && state.pomodoro.isPaused) {
    state.pomodoro.isPaused = false;
    state.pomodoro.timerId = setInterval(() => {
      updateTimerDisplay(state, dom);
      onTick();
    }, 1000);
  }
}

export function stopPomodoroTimer(state, dom) {
  if (state.pomodoro.timerId) {
    clearInterval(state.pomodoro.timerId);
  }

  state.pomodoro.timerId = null;
  state.pomodoro.timeLeftInSeconds = 0;
  state.pomodoro.isPaused = false;
  state.pomodoro.category = null;
  updateTimerDisplay(state, dom);
}

export function updateTimerDisplay(state, dom) {
  if (state.pomodoro.timeLeftInSeconds <= 0) {
    if (state.pomodoro.timerId) {
      clearInterval(state.pomodoro.timerId);
      state.pomodoro.timerId = null;
      playChime(state);
    }

    dom.timerDisplay.textContent = "";
    dom.timerDisplay.style.display = "none";
    return;
  }

  if (state.pomodoro.isPaused) {
    dom.timerDisplay.style.display = "flex";
    return;
  }

  const minutes = Math.floor(state.pomodoro.timeLeftInSeconds / 60);
  const seconds = state.pomodoro.timeLeftInSeconds % 60;
  const prefix = state.pomodoro.category ? `/${state.pomodoro.category} ` : "";
  dom.timerDisplay.textContent = `${prefix}${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
  dom.timerDisplay.style.display = "flex";
  state.pomodoro.timeLeftInSeconds -= 1;
}

function playChime(state) {
  const chime = new Audio("assets/chime.mp3");
  chime.play();
  state.pomodoro.category = null;
}
