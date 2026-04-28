export function normalizeLogs(logs) {
  if (!logs || !Array.isArray(logs.categories)) {
    return { categories: [] };
  }

  return {
    categories: logs.categories.map((category) => ({
      ...category,
      logs: Array.isArray(category.logs) ? category.logs : [],
    })),
  };
}

export function buildCategoryList(state) {
  const activeCategories = state.logs.categories.filter((category) => category.status !== "deleted");
  const notesCategory = activeCategories.find((category) => category.name.toLowerCase() === "notes") || {
    name: "notes",
    status: "active",
    logs: [],
  };
  const grouped = new Map();

  for (const category of activeCategories) {
    if (category.name.toLowerCase() === "notes") {
      continue;
    }

    const [mainCategory] = category.name.split(":");

    if (!grouped.has(mainCategory)) {
      grouped.set(mainCategory, []);
    }

    grouped.get(mainCategory).push(category);
  }

  const orderedCategories = [notesCategory];

  for (const group of grouped.values()) {
    group.sort((left, right) => left.name.localeCompare(right.name));
    orderedCategories.push(...group);
  }

  state.navCategories = orderedCategories.map((category) => ({
    name: category.name.toLowerCase(),
    displayName: category.name,
    isSubcategory: category.name.includes(":"),
  }));
}

export function getCategoryFilter(textboxValue) {
  if (/^\/[\w.-]+(:[\w.-]+)? $/.test(textboxValue)) {
    return "";
  }

  const trimmed = textboxValue.trim();

  if (!trimmed.startsWith("/")) {
    return "";
  }

  return trimmed.substring(1).split(" ")[0].toLowerCase();
}

export function getVisibleCategories(state, textboxValue) {
  const filter = getCategoryFilter(textboxValue);

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

export function clampSelection(state) {
  if (state.visibleCategories.length === 0) {
    state.currentCategoryIndex = 0;
    return;
  }

  state.currentCategoryIndex = Math.max(
    0,
    Math.min(state.currentCategoryIndex, state.visibleCategories.length - 1)
  );
}

export function getSelectedCategory(state) {
  return state.visibleCategories[state.currentCategoryIndex] || state.visibleCategories[0] || null;
}

export function hasSubcategories(state, categoryName) {
  return state.navCategories.some(
    (category) => category.isSubcategory && category.name.startsWith(`${categoryName}:`)
  );
}

export function getSortedLogsForCategory(state, categoryName) {
  const category = state.logs.categories.find(
    (entry) => entry.name.toLowerCase() === categoryName && entry.status !== "deleted"
  );

  if (!category) {
    return [];
  }

  return category.logs
    .filter((log) => log.status !== "deleted")
    .slice()
    .sort((left, right) => {
      if (left.status === right.status) {
        return left.id - right.id;
      }

      return left.status === "active" ? -1 : 1;
    });
}

export function categoryExists(state, categoryName) {
  return state.navCategories.some((category) => category.name === categoryName);
}
