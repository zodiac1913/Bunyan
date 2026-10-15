import { getConfiguredSortState, ensureTableChrome } from "./smlTableOwn.js";

/** Converts text to a sortable key. */
function toSortKey(text) {
  return String(text || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "") || "column";
}

/** Gets the display label from a header cell. */
function getHeaderLabel(headerCell) {
  return (headerCell?.dataset?.label || headerCell?.textContent || "").trim();
}

/** Checks if a header cell represents the actions column. */
function isActionHeaderCell(headerCell) {
  const headerText = (headerCell?.textContent || "").trim().toLowerCase();
  return headerCell?.classList.contains("sml-table-action-col") || headerText === "actions";
}

/** Gets the field name for a header cell. */
function getHeaderField(headerCell, headerIndex) {
  const explicitField = (headerCell?.dataset?.field || "").trim();
  if (explicitField) return explicitField;

  const derivedField = toSortKey(getHeaderLabel(headerCell));
  return derivedField || `column${headerIndex + 1}`;
}

/** Gets the column head element for a data attribute. */
function getColumnHead(tableHeaderCell) {
  return tableHeaderCell?.querySelector(":scope > .sml-column-head") || null;
}

/** Gets all column head elements in the table. */
function getColumnHeads(table) {
  return Array.from(table.querySelectorAll("thead .sml-column-head"));
}

/** Gets the current sort state from a column head. */
function getHeaderSortState(columnHead) {
  const sortValue = (columnHead?.dataset?.sort || "").trim().toUpperCase();
  const ordValue = Number.parseInt(columnHead?.dataset?.ord || "", 10);
  return {
    sort: sortValue,
    ord: Number.isFinite(ordValue) && ordValue >= 0 ? ordValue : -1
  };
}

/** Sets the sort state on a column head. */
function setHeaderSortState(columnHead, sort, ord) {
  if (!columnHead) return;
  columnHead.dataset.sort = sort || "";
  columnHead.dataset.ord = Number.isFinite(ord) && ord >= 0 ? String(ord) : "";
}

/** Parses a sort value into direction and ordinal. */
function parseSortValue(rawValue) {
  const text = String(rawValue ?? "").trim();
  if (text === "") return { type: "empty", value: "" };

  const numericValue = Number(text.replaceAll(",", ""));
  if (Number.isFinite(numericValue) && text !== "true" && text !== "false") {
    return { type: "number", value: numericValue };
  }

  const dateValue = Date.parse(text);
  if (!Number.isNaN(dateValue)) {
    return { type: "date", value: dateValue };
  }

  return { type: "text", value: text.toLowerCase() };
}

/** Compares two sort values and returns comparison result. */
function compareSortValues(leftValue, rightValue) {
  const left = parseSortValue(leftValue);
  const right = parseSortValue(rightValue);

  if (left.type === "empty" && right.type !== "empty") return -1;
  if (right.type === "empty" && left.type !== "empty") return 1;

  if (left.type === right.type) {
    if (left.value < right.value) return -1;
    if (left.value > right.value) return 1;
    return 0;
  }

  return String(leftValue ?? "").localeCompare(String(rightValue ?? ""), undefined, {
    numeric: true,
    sensitivity: "base"
  });
}

/** Gets cell text content by column index. */
function getCellTextByIndex(row, columnIndex) {
  const cells = Array.from(row.querySelectorAll("td, th"));
  return (cells[columnIndex]?.textContent || "").trim();
}

/** Rebuilds the sort ordinals after a column's sort state changes. */
function rebuildHeaderSortOrder(columnHeads) {
  const activeHeads = columnHeads
    .filter((columnHead) => {
      const state = getHeaderSortState(columnHead);
      return state.sort && state.ord >= 0;
    })
    .sort((leftHead, rightHead) => getHeaderSortState(leftHead).ord - getHeaderSortState(rightHead).ord);

  activeHeads.forEach((columnHead, index) => {
    setHeaderSortState(columnHead, getHeaderSortState(columnHead).sort, index);
  });

  return activeHeads;
}

/** Gets the CSS class for a sort icon. */
function getSortIconClass(sort) {
  if (sort === "ASC") return "bi bi-sort-alpha-down text-white";
  if (sort === "DESC") return "bi bi-sort-alpha-down-alt text-white";
  return "bi bi-filter-circle text-white";
}

/** Updates the UI of a column head based on its sort state. */
function updateColumnHeadUi(columnHead) {
  if (!columnHead) return;

  const { sort } = getHeaderSortState(columnHead);
  const triggerIcon = columnHead.querySelector(":scope .dropdown > button > span");
  if (triggerIcon) {
    triggerIcon.className = getSortIconClass(sort);
  }

  const sortButtons = Array.from(columnHead.querySelectorAll(".sml-sort-col"));
  sortButtons.forEach((sortButton) => {
    if (sortButton.dataset.sort === sort) {
      sortButton.classList.add("text-warning");
    } else {
      sortButton.classList.remove("text-warning");
    }
  });
}

/** Syncs all column head UI elements with their current sort state. */
function syncSortUi(table) {
  getColumnHeads(table).forEach(updateColumnHeadUi);
}

/** Sorts table rows based on their sort state. */
function sortTableRows(table) {
  if (!table) return;

  const columnHeads = getColumnHeads(table);
  const activeHeads = rebuildHeaderSortOrder(columnHeads);
  const body = table.querySelector("tbody");
  if (!body) return;

  const rows = Array.from(body.querySelectorAll("tr"));
  if (activeHeads.length < 1) {
    const orderedRows = [...rows].sort((leftRow, rightRow) => {
      return Number.parseInt(leftRow.dataset.smlOriginalOrder || "0", 10) - Number.parseInt(rightRow.dataset.smlOriginalOrder || "0", 10);
    });
    orderedRows.forEach((row) => body.appendChild(row));
    ensureTableChrome(table.closest("sml-table"), table);
    return;
  }

  rows.sort((leftRow, rightRow) => {
    for (const columnHead of activeHeads) {
      const { sort } = getHeaderSortState(columnHead);
      const columnIndex = Number.parseInt(columnHead.dataset.columnIndex || "", 10);
      if (!Number.isFinite(columnIndex) || columnIndex < 0) continue;

      const leftValue = getCellTextByIndex(leftRow, columnIndex);
      const rightValue = getCellTextByIndex(rightRow, columnIndex);
      const comparison = compareSortValues(leftValue, rightValue);
      if (comparison !== 0) {
        return sort === "DESC" ? comparison * -1 : comparison;
      }
    }

    return 0;
  });

  rows.forEach((row) => body.appendChild(row));
  ensureTableChrome(table.closest("sml-table"), table);
}

/** Applies a sort selection to a column and updates table. */
function applySortSelection(table, clickedHead, sortType) {
  const columnHeads = getColumnHeads(table);

  if (sortType === "KILL") {
    columnHeads.forEach((columnHead) => setHeaderSortState(columnHead, "", -1));
    syncSortUi(table);
    sortTableRows(table);
    return;
  }

  const currentState = getHeaderSortState(clickedHead);
  const otherActiveHeads = columnHeads
    .filter((columnHead) => columnHead !== clickedHead)
    .filter((columnHead) => {
      const state = getHeaderSortState(columnHead);
      return state.sort && state.ord >= 0;
    })
    .sort((leftHead, rightHead) => getHeaderSortState(leftHead).ord - getHeaderSortState(rightHead).ord);

  otherActiveHeads.forEach((columnHead, index) => {
    setHeaderSortState(columnHead, getHeaderSortState(columnHead).sort, index);
  });

  if (sortType === "") {
    setHeaderSortState(clickedHead, "", -1);
  } else if (currentState.sort && currentState.ord >= 0) {
    setHeaderSortState(clickedHead, sortType, currentState.ord);
  } else {
    setHeaderSortState(clickedHead, sortType, otherActiveHeads.length);
  }

  syncSortUi(table);
  sortTableRows(table);
}

/** Captures the current row order for restoration. */
function captureOriginalRowOrder(table) {
  const body = table?.querySelector("tbody");
  if (!body) return;

  Array.from(body.querySelectorAll("tr")).forEach((row, index) => {
    if (!row.dataset.smlOriginalOrder) {
      row.dataset.smlOriginalOrder = String(index);
    }
  });
}

/** Creates a sort option button for a column head. */
function createSortOptionButton(table, field, label, sortType, iconClass, titleText, isActive) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `btn btn-secondary ${iconClass} sml-sort-col${isActive ? " text-warning" : ""}`;
  button.dataset.field = field;
  button.dataset.sort = sortType;
  button.title = titleText;
  button.setAttribute("aria-label", titleText);
  return button;
}

/** Creates a column head element with sort dropdown. */
function createColumnHead(table, field, label, headerIndex, currentState) {
  const columnHead = document.createElement("div");
  columnHead.className = "d-flex align-content-stretch flex-wrap px-0 mx-0 sml-column-head";
  columnHead.dataset.field = field;
  columnHead.dataset.columnIndex = String(headerIndex);
  setHeaderSortState(columnHead, currentState.sort, currentState.ord);

  const labelSpan = document.createElement("span");
  labelSpan.className = "p-2 fw-bolder text-warning d-block";
  labelSpan.textContent = label;

  const dropdown = document.createElement("div");
  dropdown.className = "dropdown";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "p-2 d-block btn btn-dark btn-sm";
  const tableId = table.closest("sml-table")?.id || table.id || "smlTable";
  trigger.id = `${tableId}SortButton${field}`;
  trigger.setAttribute("role", "button");
  trigger.dataset.bsToggle = "dropdown";
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", `${label} Sort Control`);
  trigger.title = "Sort Control Button";

  const triggerIcon = document.createElement("span");
  triggerIcon.className = getSortIconClass(currentState.sort);
  trigger.appendChild(triggerIcon);

  const menu = document.createElement("ul");
  menu.className = "dropdown-menu bg-gray-dark border-1 border-secondary";
  //MESSED UP TITLE!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  //menu.setAttribute("aria-label", ${label}); //trigger.id);
  menu.style.minWidth = "2rem";

  const menuItems = [
    { sort: "", icon: "bi bi-x-circle", title: "No Sort on this column" },
    { sort: "ASC", icon: "bi bi-sort-alpha-down", title: "Sort A to Z(Ascending) on this column" },
    { sort: "DESC", icon: "bi bi-sort-alpha-down-alt", title: "Sort Z to A(Descending) on this column" },
    { sort: "KILL", icon: "bi bi-filter-circle-fill", title: "Cancel ALL sorting on this table" }
  ];

  menuItems.forEach((menuItem) => {
    const li = document.createElement("li");
    li.className = "dropdown-item";
    const isActive = menuItem.sort === currentState.sort;
    li.appendChild(createSortOptionButton(table, field, label, menuItem.sort, menuItem.icon, menuItem.title, isActive));
    menu.appendChild(li);
  });

  dropdown.appendChild(trigger);
  dropdown.appendChild(menu);

  columnHead.appendChild(labelSpan);
  columnHead.appendChild(dropdown);

  return columnHead;
}

/** Closes all open sort option dropdowns. */
function collapseSortDropdowns(table) {
  if (!table) return;

  const dropdownButtons = Array.from(
    table.querySelectorAll(".sml-column-head .dropdown > button[data-bs-toggle='dropdown']")
  );

  dropdownButtons.forEach((button) => {
    if (typeof bootstrap !== "undefined" && bootstrap?.Dropdown?.getOrCreateInstance) {
      bootstrap.Dropdown.getOrCreateInstance(button).hide();
      return;
    }

    // Fallback when Bootstrap JS isn't available.
    button.setAttribute("aria-expanded", "false");
    const menu = button.parentElement?.querySelector(":scope > .dropdown-menu");
    menu?.classList.remove("show");
  });
}

/** Wires click handlers to all sort option buttons. */
function wireSortButtons(table) {
  const sortButtons = Array.from(table.querySelectorAll(".sml-sort-col"));
  sortButtons.forEach((sortButton) => {
    if (sortButton.dataset.smlSortWired === "true") return;

    sortButton.dataset.smlSortWired = "true";
    sortButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const button = event.currentTarget;
      const columnHead = button.closest(".sml-column-head");
      if (!columnHead) return;

      applySortSelection(table, columnHead, button.dataset.sort || "");
      collapseSortDropdowns(table);
    });
  });
}

/** Transforms table headers into interactive sort headers with dropdown menus. */
export function decorateSortableHeaders(table) {
  if (!table) return;

  const host = table.closest("sml-table");
  captureOriginalRowOrder(table);

  const headerCells = Array.from(table.querySelectorAll("thead th"));
  if (headerCells.length < 1) return;

  headerCells.forEach((headerCell, headerIndex) => {
    headerCell.classList.add("border-1", "border-warning");

    if (isActionHeaderCell(headerCell)) {
      headerCell.title = "Actions on these rows";
      headerCell.innerHTML = "";

      const actionWrap = document.createElement("div");
      actionWrap.className = "d-flex justify-content-between px-0 mx-0 border border-1 border-secondary";
      actionWrap.textContent = "Actions";
      headerCell.appendChild(actionWrap);
      return;
    }

    const label = getHeaderLabel(headerCell);
    const field = getHeaderField(headerCell, headerIndex);
    const existingHead = getColumnHead(headerCell);
    const currentState = existingHead
      ? getHeaderSortState(existingHead)
      : getConfiguredSortState(host, field);

    headerCell.title = label;
    headerCell.dataset.smlSortableDecorated = "true";
    headerCell.innerHTML = "";
    headerCell.appendChild(createColumnHead(table, field, label, headerIndex, currentState));
  });

  wireSortButtons(table);
  syncSortUi(table);
  sortTableRows(table);
}
