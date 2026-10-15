/* eslint-disable no-console */

import { decorateSortableHeaders } from "./smlTableOwnSort.js";
import { openTableExportMenu } from "./smlTableExport.js";

const TABLE_CFG_STORAGE_KEY = "smlTableCfg";

/** Reads the table configuration from localStorage. */
function readTableConfig() {
  try {
    const raw = globalThis.localStorage?.getItem(TABLE_CFG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Writes table configuration updates to localStorage. */
function writeTableConfig(update) {
  const current = readTableConfig();
  const next = { ...current, ...update };
  try {
    globalThis.localStorage?.setItem(TABLE_CFG_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore localStorage failures and continue with in-memory state.
  }
  return next;
}

/** Gets the maximum number of records to load before truncating the table. */
function getMaxAllRecords(host) {
  if (isTotalLoadEnabled(host)) {
    const cap = Number.parseInt(String(host?.dataset?.totalLoadCap || host?.dataset?.totalLoadValue || ""), 10);
    if (Number.isFinite(cap) && cap > 0) return cap;
  }

  // No cap unless a dev opts into one via data-max-all-records or total load.
  const parsed = Number.parseInt(host?.dataset?.maxAllRecords || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.POSITIVE_INFINITY;
}

/** Constructs API URL for row/table-level actions (Create, Edit, Delete, etc.). */
function buildExplicitActionApiUrl(baseApiUrl, action) {
  const explicitApi = [action?.api, action?.Api].find((value) => typeof value === "string" && value.trim().length > 0);
  if (explicitApi) return explicitApi.trim();

  const apiUrl = String(baseApiUrl || "").trim();
  const actionType = String(action?.type || "").trim();
  const actionName = String(action?.name || actionType || "").trim();

  if (!apiUrl || !actionName || actionType === "Export") return "";

  const lastSlash = apiUrl.lastIndexOf("/");
  const prefix = lastSlash > -1 ? apiUrl.substring(0, lastSlash + 1) : "";
  const endpoint = lastSlash > -1 ? apiUrl.substring(lastSlash + 1) : apiUrl;
  const stem = endpoint
    .replace(/(?:RptReportingSearch|SimpleSearch)$/u, "")
    .replace(/^Api/u, "")
    .trim();

  if (!stem) return "";

  if (actionType === "Create") {
    return `${prefix}Api${stem}AddForm${actionName}Action`;
  }

  return `${prefix}Api${stem}Form${actionName}Action`;
}

function isTruthyConfigFlag(value) {
  return ["true", "1", "yes"].includes(String(value || "").trim().toLowerCase());
}

/** Returns whether the table shows a user-chosen total-load cap. */
function isTotalLoadEnabled(host) {
  const raw = String(host?.dataset?.totalLoad || "").trim();
  if (isTruthyConfigFlag(raw)) return true;
  return raw.includes(",");
}

/** Builds the allowed total-load menu (default 1000-20000 by 1000). */
function getTotalLoadMenu(host) {
  const raw = String(host?.dataset?.totalLoad || "").trim();
  let numbers = [];
  if (raw.includes(",")) {
    numbers = raw
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value) && value >= 1000 && value <= 20000);
  }

  if (numbers.length < 1) {
    for (let value = 1000; value <= 20000; value += 1000) {
      numbers.push(value);
    }
  }

  return [...new Set(numbers)].sort((left, right) => left - right);
}

function getStoredTotalLoad(tableId) {
  const cfg = readTableConfig();
  const map = cfg.totalLoad && typeof cfg.totalLoad === "object" ? cfg.totalLoad : {};
  return Number.parseInt(String(map[tableId] || ""), 10);
}

function persistTotalLoad(host, value) {
  if (!host) return;
  const tableId = host.id || "smlTable";
  const next = Number.parseInt(String(value), 10);
  if (!Number.isFinite(next) || next < 1) return;

  host.dataset.totalLoadCap = String(next);
  host.dataset.totalLoadValue = String(next);
  host.dataset.maxAllRecords = String(next);
  const cfg = readTableConfig();
  const map = { ...(cfg.totalLoad && typeof cfg.totalLoad === "object" ? cfg.totalLoad : {}) };
  map[tableId] = next;
  writeTableConfig({ totalLoad: map });
}

/** Restores or initializes the selected total-load cap on the host. */
export function applyTotalLoadConfigToHost(host) {
  if (!host || !isTotalLoadEnabled(host)) return 0;

  const menu = getTotalLoadMenu(host);
  const tableId = host.id || "smlTable";
  const stored = getStoredTotalLoad(tableId);
  const current = Number.parseInt(String(host.dataset.totalLoadCap || host.dataset.totalLoadValue || stored || menu[0] || 1000), 10);
  const next = menu.includes(current) ? current : (menu[0] || 1000);
  host.dataset.totalLoadCap = String(next);
  if (!String(host.dataset.totalLoadValue || "").trim()) {
    host.dataset.totalLoadValue = String(next);
  }
  return next;
}

export function clearTrueRecordCount(host) {
  if (!host?.dataset) return;
  delete host.dataset.trueRecordCount;
}

export function setTrueRecordCount(host, count) {
  if (!host?.dataset || !isTotalLoadEnabled(host)) return;
  const found = Number.parseInt(String(count), 10);
  if (!Number.isFinite(found) || found < 1) {
    clearTrueRecordCount(host);
    return;
  }
  host.dataset.trueRecordCount = String(found);
}

function buildTotalLoadSelectHtml(host, prefix) {
  if (!isTotalLoadEnabled(host)) return "";

  applyTotalLoadConfigToHost(host);
  const tableId = host.id || "smlTable";
  const menu = getTotalLoadMenu(host);
  const found = Number.parseInt(String(host.dataset.trueRecordCount || ""), 10);
  const cap = Number.parseInt(String(host.dataset.totalLoadCap || host.dataset.totalLoadValue || ""), 10);
  const values = [...menu];
  const hasFoundCount = Number.isFinite(found) && found > 0;
  if (hasFoundCount && !values.includes(found)) {
    values.push(found);
    values.sort((left, right) => left - right);
  }

  const selected = Number.isFinite(cap) ? cap : (hasFoundCount ? found : values[0]);
  const options = values
    .map((value) => {
      const isTrueCount = hasFoundCount && value === found && !menu.includes(found);
      const selectedAttr = value === selected ? " selected" : "";
      const trueCountAttr = isTrueCount ? " data-sml-true-record-count=\"true\"" : "";
      return `<option value="${value}"${selectedAttr}${trueCountAttr}>${value}</option>`;
    })
    .join("");

  return `<select id="${tableId}TotalLoad${prefix}" class="form-select form-select-sm sml-total-load-select" title="Choose how many records to load from the server. Larger values take longer." aria-label="Records to load" style="width:auto;min-width:4.75rem;background-color:LightCyan;">${options}</select>`;
}

function emitTotalLoadRequest(host, totalLoad) {
  if (!host) return;
  host.dispatchEvent(new CustomEvent("sml:table-total-load-request", {
    bubbles: true,
    composed: true,
    detail: {
      hostId: host.id || "",
      totalLoad
    }
  }));
}

/** Gets the page size menu options for the table's pagination control. */
function getPageLengthMenu(host) {
  const raw =
    host?.dataset?.pageLengthMenu
    || host?.dataset?.tablePageLengthMenu
    || "10,50,100";

  const numbers = String(raw)
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);

  const unique = [...new Set(numbers)];
  return unique.length > 0 ? unique : [10, 50, 100];
}

/** Validates and returns a safe page size from host configuration or defaults. */
function getSafePageSize(host) {
  const menu = getPageLengthMenu(host);
  return Math.max(...menu);
}

/** Checks if quick search is locked on the host. */
function isChunkQuickSearchLocked(host) {
  const hasChunkPaginationUi = ["true", "1", "yes"].includes(String(host?.dataset?.chunkPaginationUi || "").toLowerCase());
  if (!hasChunkPaginationUi) return false;
  return ["true", "1", "yes"].includes(String(host?.dataset?.chunkLoading || "").toLowerCase());
}

/** Synchronizes quick search lock state with the UI. */
function syncQuickSearchLockState(host, quickSearch) {
  if (!quickSearch) return;

  const isLocked = isChunkQuickSearchLocked(host);
  if (isLocked) {
    quickSearch.disabled = true;
    quickSearch.setAttribute("aria-disabled", "true");
    quickSearch.dataset.smlLocked = "true";
    quickSearch.dataset.smlPlaceholder = quickSearch.dataset.smlPlaceholder || quickSearch.placeholder || "";
    quickSearch.placeholder = "Loading records... quick search unlocks when load completes";
    quickSearch.title = "Quick search is temporarily disabled while records are loading";
    return;
  }

  const hadLock = quickSearch.dataset.smlLocked === "true";
  quickSearch.disabled = false;
  quickSearch.removeAttribute("aria-disabled");
  quickSearch.dataset.smlLocked = "false";
  if (hadLock && (quickSearch.dataset.smlPlaceholder || "").length > 0) {
    quickSearch.placeholder = quickSearch.dataset.smlPlaceholder;
  }
}

/** Checks if server-side pagination is enabled. */
function isServerPagingEnabled(host) {
  const token = String(host?.dataset?.serverPaging || "").toLowerCase().trim();
  return token === "true" || token === "1" || token === "yes";
}

/** Emits a custom event requesting server-side page data. */
function emitServerPageRequest(host, state) {
  if (!host || !state || !isServerPagingEnabled(host)) return;
  if (state.pageSize === "All") return;

  const take = Number.parseInt(String(state.pageSize || "0"), 10);
  if (!Number.isFinite(take) || take < 1) return;

  const pageStart = Number.parseInt(String(state.pageStart || "1"), 10);
  const skip = Math.max(0, (Number.isFinite(pageStart) ? pageStart : 1) - 1);

  host.dispatchEvent(new CustomEvent("sml:table-page-request", {
    bubbles: true,
    composed: true,
    detail: {
      hostId: host.id || "",
      searchApi: host.dataset.searchApi || host.dataset.api || "",
      skip,
      take,
      pageStart: skip + 1
    }
  }));
}

/** Gets the configured row and table-level actions. */
function getTableActions(host) {
  const actions = host?._tableConfig?.actions || host?._tableConfig?.query?.queryActions;
  return Array.isArray(actions) ? actions : [];
}

/** Extracts column key from various column config formats. */
function getColumnKey(column) {
  if (!column) return "";

  if (typeof column === "string") return column.trim();
  if (typeof column !== "object") return "";

  const candidates = [
    column.FieldName,
    column.fieldName,
    column.PropertyName,
    column.propertyName,
    column.Name,
    column.name
  ];

  const match = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  if (match) return match.trim();

  if (column.property && typeof column.property === "object") {
    const nested = [column.property.Name, column.property.name]
      .find((value) => typeof value === "string" && value.trim().length > 0);
    if (nested) return nested.trim();
  }

  return "";
}

/** Converts a value to human-readable display label. */
function toDisplayLabel(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolves the display name for a table from host or configuration. */
function resolveTableName(host, table) {
  const configured = [
    host?.dataset?.tableName,
    host?.getAttribute?.("data-table-name"),
    host?._tableConfig?.tableName,
    host?._tableConfig?.TableName,
    host?._tableConfig?.name,
    host?._tableConfig?.Name,
    host?._tableConfig?.query?.tableName,
    host?._tableConfig?.query?.TableName,
    host?._tableConfig?.query?.name,
    host?._tableConfig?.query?.Name,
    host?.getAttribute?.("name"),
    table?.getAttribute?.("name"),
    host?.id,
    table?.id
  ].find((candidate) => typeof candidate === "string" && candidate.trim().length > 0);

  const baseName = configured || "table";
  return toDisplayLabel(baseName) || "table";
}

/** Normalizes an entity name for use in table captions. */
function normalizeCaptionEntityName(rawName) {
  const cleaned = toDisplayLabel(rawName)
    .replace(/\btable\b\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "Records";
}

/** Gets column headers/labels from a rendered table. */
function getTableColumnLabels(table) {
  if (!table) return [];

  const headerCells = Array.from(table.querySelectorAll("thead th"));
  const labels = headerCells
    .map((cell) => toDisplayLabel(cell?.textContent || ""))
    .filter(Boolean)
    .filter((label) => label.toLowerCase() !== "actions");

  const unique = [];
  labels.forEach((label) => {
    if (!unique.some((existing) => existing.toLowerCase() === label.toLowerCase())) {
      unique.push(label);
    }
  });

  return unique;
}

/** Builds an auto-generated caption text for the table. */
function buildAutoCaptionText(host, table) {
  const tableName = normalizeCaptionEntityName(resolveTableName(host, table));
  const columns = getTableColumnLabels(table);

  if (columns.length < 1) {
    return `${tableName} records.`;
  }

  const visibleColumns = columns.slice(0, 8);
  const suffix = columns.length > visibleColumns.length ? ", and additional columns" : "";
  return `${tableName} records. Columns include ${visibleColumns.join(", ")}${suffix}.`;
}

/** Ensures the table has a caption element for accessibility. */
function ensureTableCaption(host, table) {
  if (!table) return;

  const existingCaption = table.querySelector(":scope > caption");
  const captionText = buildAutoCaptionText(host, table);
  if (existingCaption && existingCaption.dataset.smlAutoCaption !== "true" && String(existingCaption.textContent || "").trim().length > 0) {
    return;
  }

  const captionElement = existingCaption || document.createElement("caption");
  captionElement.textContent = captionText;
  captionElement.dataset.smlAutoCaption = "true";
  captionElement.classList.add("fw-bold", "text-center", "text-dark");
  captionElement.style.captionSide = "top";
  captionElement.style.backgroundColor = "gold";
  captionElement.style.borderStyle = "solid";
  captionElement.style.borderColor = "goldenrod";
  captionElement.style.borderWidth = "2px 3px";
  table.dataset.smlCaptionSource = "auto";

  if (!existingCaption) {
    table.insertBefore(captionElement, table.firstChild);
  }

}

/** Gets the configured display columns from host configuration. */
function getConfiguredDisplayColumns(host) {
  if (Array.isArray(host?._tableConfig?.columns) && host._tableConfig.columns.length > 0) {
    return host._tableConfig.columns;
  }

  if (Array.isArray(host?._tableConfig?.Columns) && host._tableConfig.Columns.length > 0) {
    return host._tableConfig.Columns;
  }

  if (Array.isArray(host?._tableConfig?.query?.displayColumns) && host._tableConfig.query.displayColumns.length > 0) {
    return host._tableConfig.query.displayColumns;
  }

  if (Array.isArray(host?._tableConfig?.query?.DisplayColumns) && host._tableConfig.query.DisplayColumns.length > 0) {
    return host._tableConfig.query.DisplayColumns;
  }

  if (Array.isArray(host?._tableConfig?.Query?.displayColumns) && host._tableConfig.Query.displayColumns.length > 0) {
    return host._tableConfig.Query.displayColumns;
  }

  if (Array.isArray(host?._tableConfig?.Query?.DisplayColumns) && host._tableConfig.Query.DisplayColumns.length > 0) {
    return host._tableConfig.Query.DisplayColumns;
  }

  return [];
}

/** Gets the configured sort state for a specific field. */
export function getConfiguredSortState(host, field) {
  const normalizedField = String(field || "").trim().toLowerCase();
  if (!normalizedField) return { sort: "", ord: -1 };

  const column = getConfiguredDisplayColumns(host)
    .find((candidate) => getColumnKey(candidate).toLowerCase() === normalizedField);
  if (!column) return { sort: "", ord: -1 };

  const rawSort = String(column?.SortDirection ?? column?.sortDirection ?? "").trim().toUpperCase();
  const sort = rawSort === "ASC" || rawSort === "DESC" ? rawSort : "";
  const ord = Number.parseInt(String(column?.sortOrdinal ?? column?.SortOrdinal ?? ""), 10);

  return {
    sort,
    ord: sort && Number.isFinite(ord) && ord >= 0 ? ord : -1
  };
}

/** Gets the final list of display columns after applying overrides and filters. */
function getRenderedDisplayColumns(host) {
  const configuredColumns = getConfiguredDisplayColumns(host);
  const hasConfiguredColumns = configuredColumns.length > 0;
  const requestedColumns = String(host?.dataset?.columns || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const hasRequestedColumns = requestedColumns.length > 0;
  const overrideToken = String(host?.dataset?.overrideServer || "").trim().toLowerCase();
  const overrideServer = overrideToken === "true" || overrideToken === "1" || overrideToken === "yes";

  if (hasConfiguredColumns && (!hasRequestedColumns || !overrideServer)) {
    return configuredColumns;
  }

  if (hasRequestedColumns) {
    if (hasConfiguredColumns) {
      return requestedColumns.map((name) =>
        configuredColumns.find((column) => getColumnKey(column).toLowerCase() === name.toLowerCase()) || name
      );
    }

    return requestedColumns;
  }

  return configuredColumns;
}

/** Reads the truncation permission flag from a column configuration. */
function readAllowTruncate(column) {
  if (!column || typeof column !== "object") return null;

  const candidates = [column.AllowTruncate, column.allowTruncate];
  const match = candidates.find((value) => typeof value === "boolean");
  return typeof match === "boolean" ? match : null;
}

/** Creates a plan for applying text truncation across table columns. */
function getTruncationPlan(host) {
  const columns = getRenderedDisplayColumns(host);
  const truncateFlags = columns.map((column) => readAllowTruncate(column));

  return {
    columns,
    truncateFlags,
    hasExplicitConfig: truncateFlags.some((value) => typeof value === "boolean")
  };
}

/** Gets the rendered width of a table column. */
function getRenderedColumnWidth(table, columnIndex) {
  const headerCell = table.querySelector(`thead tr th:nth-child(${columnIndex + 1})`);
  const sampleCell = table.querySelector(`tbody tr td:nth-child(${columnIndex + 1})`);
  const headerWidth = Math.round(headerCell?.getBoundingClientRect().width || 0);
  const sampleWidth = Math.round(sampleCell?.getBoundingClientRect().width || 0);
  const resolvedWidth = headerWidth || sampleWidth;
  return Math.max(resolvedWidth, 0);
}

/** Constrains a value within min and max bounds. */
function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** Delays function execution until after a specified wait period. */
function debounce(func, wait = 250) {
  let timeoutId;
  return (...args) => {
    globalThis.clearTimeout(timeoutId);
    timeoutId = globalThis.setTimeout(() => func(...args), wait);
  };
}

/** Closes the floating action menu and clears references. */
function closeFloatingActionMenu(host) {
  const openMenu = host?._smlFloatingActionMenu;
  if (!openMenu) return;

  const trigger = host?._smlFloatingActionTrigger;
  if (trigger) trigger.setAttribute("aria-expanded", "false");

  openMenu.classList.remove("show");
  openMenu.style.display = "none";
  host._smlFloatingActionMenu = null;
  host._smlFloatingActionTrigger = null;
}

/** Positions the floating action menu avoiding viewport edges. */
function positionFloatingActionMenu(host, trigger, menu) {
  if (!trigger || !menu) return;

  const triggerRect = trigger.getBoundingClientRect();
  menu.style.position = "fixed";
  menu.style.top = "0px";
  menu.style.left = "0px";
  menu.style.visibility = "hidden";
  menu.style.display = "block";

  const menuRect = menu.getBoundingClientRect();
  const viewportWidth = globalThis.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = globalThis.innerHeight || document.documentElement.clientHeight || 0;
  const gap = 4;

  let left = triggerRect.left - menuRect.width - gap;
  if (left < gap) {
    left = triggerRect.right + gap;
  }
  if ((left + menuRect.width) > (viewportWidth - gap)) {
    left = Math.max(gap, viewportWidth - menuRect.width - gap);
  }

  let top = triggerRect.top;
  if ((top + menuRect.height) > (viewportHeight - gap)) {
    top = Math.max(gap, viewportHeight - menuRect.height - gap);
  }

  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
  menu.style.visibility = "visible";
}

/** Attaches event listeners to a floating action menu. */
function wireFloatingActionMenu(host, trigger, menu) {
  if (!host || !trigger || !menu) return;
  if (menu.dataset.smlFloatingMenuWired === "true") return;

  if (!menu.parentElement || menu.parentElement !== document.body) {
    document.body.appendChild(menu);
  }

  menu.dataset.smlFloatingMenuWired = "true";
  menu.classList.remove("dropstart", "dropend");
  menu.style.position = "fixed";
  menu.style.display = "none";
  menu.style.zIndex = "6001";
  if (menu.classList.contains("sml-table-action-drop-menu")) {
    menu.style.maxWidth = "600px";
    menu.style.width = "auto";
    menu.style.overflowX = "hidden";
  }

  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const isCurrentMenuOpen = host._smlFloatingActionMenu === menu && menu.classList.contains("show");
    closeFloatingActionMenu(host);
    if (isCurrentMenuOpen) return;

    host._smlFloatingActionMenu = menu;
    host._smlFloatingActionTrigger = trigger;
    menu.style.display = "block";
    menu.classList.add("show");
    positionFloatingActionMenu(host, trigger, menu);
    trigger.setAttribute("aria-expanded", "true");
  });

  menu.addEventListener("click", (event) => {
    const actionElement = event.target.closest("a, button, sml-reactive-button");
    if (!actionElement) return;
    closeFloatingActionMenu(host);
  });

  if (host._smlFloatingActionDocWired !== "true") {
    document.addEventListener("click", (event) => {
      const openMenu = host._smlFloatingActionMenu;
      const openTrigger = host._smlFloatingActionTrigger;
      if (!openMenu || !openTrigger) return;
      if (openMenu.contains(event.target) || openTrigger.contains(event.target)) return;
      closeFloatingActionMenu(host);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeFloatingActionMenu(host);
    });

    globalThis.addEventListener("resize", () => {
      const openMenu = host._smlFloatingActionMenu;
      const openTrigger = host._smlFloatingActionTrigger;
      if (openMenu && openTrigger) positionFloatingActionMenu(host, openTrigger, openMenu);
    });

    document.addEventListener("scroll", () => {
      const openMenu = host._smlFloatingActionMenu;
      const openTrigger = host._smlFloatingActionTrigger;
      if (openMenu && openTrigger) positionFloatingActionMenu(host, openTrigger, openMenu);
    }, true);

    host._smlFloatingActionDocWired = "true";
  }
}

/** Adopts pre-rendered row action flyouts into the shared floating menu system. */
function adoptRenderedFloatingActionMenus(host, table) {
  if (!host || !table) return;

  Array.from(table.querySelectorAll("td.sml-table-action-col .sml-table-action-flyout")).forEach((flyout, index) => {
    const trigger = flyout.querySelector(":scope > button, :scope > sml-reactive-button, :scope > a");
    const menu = flyout.querySelector(":scope > .sml-table-action-drop-menu, :scope > .dropdown-menu");
    if (!trigger || !menu) return;

    trigger.removeAttribute("data-bs-toggle");
    trigger.setAttribute("aria-expanded", trigger.getAttribute("aria-expanded") || "false");
    if (!trigger.id) {
      trigger.id = `${table.id || "smlTable"}ActionsMenuAdopted_${index + 1}`;
    }

    if (!menu.getAttribute("aria-label")) {
      menu.setAttribute("aria-label", `${trigger.id} menu`);
    }

    wireFloatingActionMenu(host, trigger, menu);
  });
}

/** Gets all table body rows. */
function getTableRows(table) {
  return Array.from(table.querySelectorAll("tbody tr"));
}

/** Parses a search query into individual search terms. */
function parseSearchTerms(query) {
  const text = String(query || "").trim();
  if (!text) return [];

  const quoted = text.match(/"[^"]+"/g) || [];
  const terms = quoted.map((item) => item.replaceAll('"', "").trim()).filter(Boolean);
  let residual = text;
  quoted.forEach((item) => {
    residual = residual.replace(item, " ");
  });

  residual
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => terms.push(item));

  return terms.map((item) => item.toLowerCase());
}

/** Checks if a row matches a search query. */
function rowMatchesSearch(row, query) {
  const terms = parseSearchTerms(query);
  if (terms.length < 1) return true;

  const haystack = String(row?.dataset?.rowSearch || row?.textContent || "").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** Normalizes and validates the page size against configured limits. */
function normalizePageSize(host, totalRecords) {
  const cfg = readTableConfig();
  const maxAllRecords = getMaxAllRecords(host);
  const safePageSize = getSafePageSize(host);
  const pageMenu = getPageLengthMenu(host);
  const fallback = pageMenu[0] || 10;
  let pageSize = cfg.numRecs;

  if (pageSize === "All") {
    if (totalRecords > maxAllRecords) {
      pageSize = safePageSize;
      writeTableConfig({ numRecs: safePageSize });
    }
    return pageSize;
  }

  const parsed = Number.parseInt(String(pageSize || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    pageSize = fallback;
    writeTableConfig({ numRecs: fallback });
    return pageSize;
  }

  pageSize = parsed;
  if (!pageMenu.includes(pageSize)) {
    pageSize = fallback;
    writeTableConfig({ numRecs: fallback });
  }
  return pageSize;
}

/** Gets or creates the chrome container (pagination, search) for the table. */
function getOrCreateChrome(host, table) {
  const tableId = host.id || "smlTable";
  const tableScroller = table.parentElement?.classList.contains("sml-table-scroller")
    ? table.parentElement
    : table;

  let topRow = host.querySelector(`#${tableId}HeadUberRow`);
  if (!topRow) {
    topRow = document.createElement("div");
    topRow.id = `${tableId}HeadUberRow`;
    topRow.className = "d-flex flex-wrap bg-PaleTurquoise border border-2 border-primary shadow shadow-primary pt-1 pb-0 my-0 mx-0";
    tableScroller.parentNode?.insertBefore(topRow, tableScroller);
  }

  let bottomRow = host.querySelector(`#${tableId}FootUberRow`);
  if (!bottomRow) {
    bottomRow = document.createElement("div");
    bottomRow.id = `${tableId}FootUberRow`;
    bottomRow.className = "d-flex flex-wrap mx-0 py-0 bg-PaleTurquoise border border-2 border-primary shadow shadow-primary";
    if (tableScroller.nextSibling) {
      tableScroller.parentNode?.insertBefore(bottomRow, tableScroller.nextSibling);
    } else {
      tableScroller.parentNode?.appendChild(bottomRow);
    }
  }

  if (!topRow.dataset.smlChromeInitialized) {
    topRow.innerHTML = `
      <div id="${tableId}NumRecsDiv" class="flex-grow-0">
        <div id="${tableId}ShowNumRecsUpper" class="my-0 py-0" style="padding:0 !important; --bs-alert-padding-y:0rem;">
          <div class="d-flex justify-content-between mt-2">
            <label for="${tableId}PageLengthSelectUpper" class="pt-2 px-1 label flex-fill d-none d-md-none d-lg-inline" title="Drop down select for number of records to show at a time">Show</label>
            <select id="${tableId}PageLengthSelectUpper" class="form-select form-select-sm sml-table-pagination-select" title="Number of Records to show on page"></select>
            <span class="pt-2 ps-2 pe-1 d-none d-md-none d-lg-inline label flex-fill">records</span>
          </div>
        </div>
      </div>
      <div id="${tableId}UberCellUpper" class="bg-PaleTurquoise text-dark mt-2 ms-3">
        <div id="${tableId}UpperPaginationGroup" class="mx-2 px-2 d-flex flex-row border border-1 justify-content-end border-primary"></div>
      </div>
      <div id="${tableId}HeadSearchDiv" role="search" class="flex-fill d-flex justify-content-center p-2">
        <input id="${tableId}QuickSearch" class="pt-1 mt-1" type="search" placeholder="🔎 Quick Search (Client)" 
           title="Search on current data on client (FAST) Use the search current records. You can activate the search by typing in this text box" 
           aria-label="Search on current data on client (FAST) Use the search current records. You can activate the search by typing in this text box" />
      </div>
      <div id="${tableId}HeadButtonsDiv" class="flex-fill d-flex justify-content-start justify-content-md-end align-items-start p-2">
        <div id="${tableId}TopActionButtons" class="btn-group flex-fill justify-content-start justify-content-md-end" role="group" title="Create/Export Buttons Area"></div>
      </div>
    `;
    topRow.dataset.smlChromeInitialized = "true";
  }

  if (!bottomRow.dataset.smlChromeInitialized) {
    bottomRow.innerHTML = `
      <div id="${tableId}ShowNumRecsLower" class="my-0 py-0" style="padding:0 !important; --bs-alert-padding-y:0rem;">
        <div class="d-flex justify-content-between mt-2">
          <label for="${tableId}PageLengthSelectLower" class="pt-2 px-1 label flex-fill d-none d-md-none d-lg-inline" title="Drop down select for number of records to show at a time">Show</label>
          <select id="${tableId}PageLengthSelectLower" class="form-select form-select-sm sml-table-pagination-select" title="Number of Records to show on page"></select>
          <span class="pt-2 ps-2 pe-1 d-none d-md-none d-lg-inline label flex-fill">records</span>
        </div>
      </div>
      <div id="${tableId}UberCellLower" class="d-flex flex-fill justify-content-end bg-PaleTurquoise text-dark mt-2 ms-3 pb-3 pt-2">
        <div id="${tableId}LowerPaginationGroup" class="mx-2 px-2 d-flex flex-row border border-1 justify-content-end border-primary"></div>
      </div>
    `;
    bottomRow.dataset.smlChromeInitialized = "true";
  }

  return {
    topRow,
    bottomRow,
    upperSelect: host.querySelector(`#${tableId}PageLengthSelectUpper`),
    lowerSelect: host.querySelector(`#${tableId}PageLengthSelectLower`),
    quickSearch: host.querySelector(`#${tableId}QuickSearch`),
    upperGroup: host.querySelector(`#${tableId}UpperPaginationGroup`),
    lowerGroup: host.querySelector(`#${tableId}LowerPaginationGroup`),
    topActionButtons: host.querySelector(`#${tableId}TopActionButtons`),
    headButtonsDiv: host.querySelector(`#${tableId}HeadButtonsDiv`)
  };
}

/** Creates a button element for a top-level table action. */
function createTopActionElement(host, action) {
  const actionType = String(action?.type || "");
  const isExportAction = actionType.toLowerCase() === "export";
  const actionElementName = action?.eventBypass && !isExportAction ? "a" : "sml-reactive-button";
  const labelText = String(action?.label || actionType || "Action");
  const actionName = String(action?.name || actionType || "Action");
  const titleText = String(action?.title || (actionType === "Create" ? "Create a new record" : "Export the current records"));
  const element = document.createElement(actionElementName);
  const authoredClass = String(action?.htmlClass || "").trim();

  element.className = authoredClass || (actionType === "Create"
    ? "flex-fill float-md-end btn btn-sm btn-success border-1 border-warning me-3 text-nowrap text-truncate sml-table-action-button"
    : isExportAction
      ? "flex-fill btn btn-MidnightBlue me-3 text-nowrap text-truncate sml-table-action-button"
      : "flex-fill btn btn-primary me-3 text-nowrap text-truncate sml-table-action-button");
  element.setAttribute("role", "button");
  element.setAttribute("title", titleText);
  element.setAttribute("aria-label", titleText);
  element.dataset.table = host.id || "";
  element.dataset.rowId = "-1";
  element.dataset.action = actionName;
  element.dataset.type = actionType;
  element.dataset.refreshAfterDelete = action?.refreshAfterDelete ? "true" : "false";
  element.style.maxWidth = "9em";
  if (typeof action?.style === "string" && action.style.trim().length > 0) {
    element.style.cssText += `;${action.style.trim()}`;
  }

  if (isExportAction) {
    element.type = "button";
    element.setAttribute("tabindex", "0");
    element.setAttribute("aria-haspopup", "menu");
    element.setAttribute("aria-expanded", "false");
    element.dataset.exportAction = "true";
    element.dataset.apiMode = "table-action";
    element.dataset.icon = String(action?.icon || "bi bi-file-arrow-down-fill").trim();
    element.dataset.text = labelText;
    element.addEventListener("click", () => openTableExportMenu(host, element, action));
    element.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
      event.preventDefault();
      openTableExportMenu(host, element, action);
    });
  } else if (action?.eventBypass) {
    element.href = String(action.eventBypass);
    element.dataset.href = String(action.eventBypass);

    const icon = document.createElement("span");
    icon.className = actionType === "Create" ? "bi bi-plus-circle-fill" : "";
    element.appendChild(icon);

    const text = document.createElement("span");
    text.className = "ms-2 d-none d-md-none d-lg-inline-flex text-nowrap text-truncate";
    text.style.minWidth = "3em";
    text.style.maxWidth = "4em";
    text.textContent = labelText;
    element.appendChild(text);
  } else {
    element.dataset.api = buildExplicitActionApiUrl(host.dataset.api || "", action) || host.dataset.api || "";
    element.dataset.apiMode = "table-action";
    element.dataset.buttonType = "command";
    element.dataset.icon = actionType === "Create" ? "bi bi-plus-circle-fill" : "bi bi-file-arrow-down-fill";
    element.dataset.text = labelText;
  }

  return element;
}

/** Renders table-level action buttons in the top chrome. */
function renderTopActionButtons(host, chrome) {
  const container = chrome?.topActionButtons;
  const wrapper = chrome?.headButtonsDiv;
  if (!container || !wrapper) return;

  const actions = getTableActions(host).filter((action) => {
    const actionType = String(action?.type || "").toLowerCase();
    return actionType === "create" || actionType === "export";
  });
  container.innerHTML = "";

  if (actions.length < 1) {
    wrapper.classList.add("d-none");
    return;
  }

  wrapper.classList.remove("d-none");
  actions.forEach((action) => {
    container.appendChild(createTopActionElement(host, action));
  });
}

/** Renders pagination controls showing page numbers or "All" status. */
function renderPaginationGroup(host, sectionName, pageStart, pageEnd, totalRecords, isAll) {
  const tableId = host.id || "smlTable";
  const tenPer = Math.max(1, Math.floor(totalRecords * 0.1));
  const visibleRecordCount = Math.max(1, pageEnd - pageStart + 1);
  const maxStart = Math.max(1, totalRecords - visibleRecordCount + 1);
  const prefix = sectionName === "Upper" ? "Upper" : "Lower";
  const hasChunkPaginationUi = ["true", "1", "yes"].includes(String(host?.dataset?.chunkPaginationUi || "").toLowerCase());
  const isChunkLoading = hasChunkPaginationUi && ["true", "1", "yes"].includes(String(host?.dataset?.chunkLoading || "").toLowerCase());
  const loadedRowsRaw = Number.parseInt(String(host?.dataset?.chunkLoadedRows || ""), 10);
  const loadedRows = Number.isFinite(loadedRowsRaw) && loadedRowsRaw >= 0 ? loadedRowsRaw : Math.max(totalRecords, 0);
  const expectedRowsRaw = Number.parseInt(String(host?.dataset?.chunkExpectedRows || ""), 10);
  const expectedRows = Number.isFinite(expectedRowsRaw) && expectedRowsRaw > 0 ? expectedRowsRaw : null;
  const loadingText = expectedRows ? `Loading ${loadedRows} of ${expectedRows}` : `Loading records from 1 to ${loadedRows}`;
  const loadingSpinner = isChunkLoading
    ? `
      <span class="d-inline-flex align-items-center ms-2" title="${loadingText}" aria-label="${loadingText}">
        <div class="spinner-border spinner-border-sm text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <span class="ms-1 small text-muted">${loadingText}</span>
      </span>
    `
    : "";

  const totalLoadControl = buildTotalLoadSelectHtml(host, prefix);
  const ofAmount = totalLoadControl ? `&nbsp;${totalLoadControl}` : `&nbsp;&nbsp;${totalRecords}`;

  if (totalRecords < 1) {
    return `
      <span id="${tableId}${prefix}PaginationGroupShowing" class="pe-1 d-none d-md-none d-lg-none d-xl-inline text-nowrap fw-bold" title="Showing records 0 to 0 of 0">
        Showing&nbsp;&nbsp;0&nbsp;&nbsp;to&nbsp;&nbsp;0&nbsp;&nbsp;of&nbsp;&nbsp;0
      </span>
      ${loadingSpinner}
    `;
  }

  if (isAll) {
    return `
      <span id="${tableId}${prefix}PaginationGroupShowing" class="pe-1 d-none d-md-none d-lg-none d-xl-inline text-nowrap fw-bold" title="Showing records 1 to ${pageEnd} of ${totalRecords}">
        Showing&nbsp;&nbsp;1&nbsp;&nbsp;to&nbsp;&nbsp;${pageEnd}&nbsp;&nbsp;of&nbsp;&nbsp;${totalRecords}
      </span>
      ${loadingSpinner}
    `;
  }

  return `
    <span id="${tableId}${prefix}PaginationGroupShowing" class="pe-1 d-none d-md-none d-lg-none d-xl-inline text-nowrap fw-bold" title="Showing records ${pageStart} to ${pageEnd} of ${totalRecords}">Showing&nbsp;&nbsp;</span>
    ${loadingSpinner}
    <button type="button" id="${tableId}GoAlpha${prefix}" class="px-0 btn btn-sm btn-dark text-warning sml-pagination-alpha sml-pagination-icon-only" title="Go to the beginning" aria-label="Go to the beginning"><i class="bi bi-skip-backward-fill"></i></button>
    <button type="button" id="${tableId}PageDownTenPer${prefix}" class="px-0 btn btn-sm btn-secondary sml-pagination-tenper sml-pagination-icon-only" data-dir="down" title="Go back ${tenPer} records" aria-label="Go back ${tenPer} records"><i class="bi bi-chevron-double-left"></i></button>
    <input type="number" id="${tableId}PageInput${prefix}" class="form-control form-control-sm text-center sml-pagination-input" min="1" max="${maxStart}" value="${pageStart}" aria-valuenow="${pageStart}" aria-valuemin="1" aria-valuemax="${maxStart}" title="Showing records ${pageStart} to ${pageEnd} of ${totalRecords}" style="min-width:40px;" />
    <button type="button" id="${tableId}PageUpTenPer${prefix}" class="px-0 btn btn-sm btn-secondary sml-pagination-tenper sml-pagination-icon-only" data-dir="up" title="Go forward ${tenPer} records" aria-label="Go forward ${tenPer} records"><i class="bi bi-chevron-double-right"></i></button>
    <button type="button" id="${tableId}GoOmega${prefix}" class="px-0 btn btn-sm btn-dark text-warning sml-pagination-omega sml-pagination-icon-only" title="Go to the end" aria-label="Go to the end"><i class="bi bi-skip-forward-fill"></i></button>
    <span id="${tableId}PaginateSuffixInfo${prefix}" class="pe-1 fw-bold text-nowrap d-none d-xl-inline-flex align-items-center" title="Showing records ${pageStart} to ${pageEnd} of ${totalRecords}">&nbsp;&nbsp;to&nbsp;&nbsp;${pageEnd}&nbsp;&nbsp;of${ofAmount}</span>
  `;
}

/** Applies pagination by hiding/showing rows based on page state. */
function applyPaginationRows(host, table, state) {
  const rows = getTableRows(table);
  const filteredRows = rows.filter((row) => rowMatchesSearch(row, state.searchQuery));
  state.totalRecords = filteredRows.length;

  if (state.totalRecords < 1) {
    state.pageStart = 0;
    state.pageEnd = 0;
    rows.forEach((row) => {
      row.classList.add("d-none");
    });
    return;
  }

  const maxAllRecords = getMaxAllRecords(host);
  if (state.pageSize === "All" && state.totalRecords > maxAllRecords) {
    state.pageSize = getSafePageSize(host);
    writeTableConfig({ numRecs: state.pageSize });
  }

  if (state.pageSize === "All") {
    state.pageStart = 1;
    state.pageEnd = state.totalRecords;
    // Set membership rather than Array.includes: the linear scan per row made this
    // quadratic, which locks the tab on large tables.
    const visibleRows = new Set(filteredRows);
    rows.forEach((row) => {
      if (visibleRows.has(row)) {
        row.classList.remove("d-none");
      } else {
        row.classList.add("d-none");
      }
    });
    return;
  }

  const pageSizeNumber = Number.parseInt(String(state.pageSize), 10);
  state.pageSize = Number.isFinite(pageSizeNumber) && pageSizeNumber > 0 ? pageSizeNumber : 10;

  const maxStart = Math.max(1, state.totalRecords - state.pageSize + 1);
  state.pageStart = clamp(Number.parseInt(String(state.pageStart || 1), 10) || 1, 1, maxStart);
  state.pageEnd = Math.min(state.totalRecords, state.pageStart + state.pageSize - 1);

  rows.forEach((row) => {
    row.classList.add("d-none");
  });

  filteredRows.forEach((row, index) => {
    const rowNumber = index + 1;
    if (rowNumber >= state.pageStart && rowNumber <= state.pageEnd) {
      row.classList.remove("d-none");
    } else {
      row.classList.add("d-none");
    }
  });
}

/** Populates page length select with configured options. */
function fillPageLengthSelect(select, pageSize, totalRecords, host) {
  if (!select) return;

  const pageMenu = getPageLengthMenu(host);
  const maxAllRecords = getMaxAllRecords(host);
  select.innerHTML = "";

  pageMenu.forEach((value) => {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = String(value);
    if (String(pageSize) === String(value)) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  if (totalRecords <= maxAllRecords) {
    const allOption = document.createElement("option");
    allOption.value = "All";
    allOption.textContent = "All";
    if (pageSize === "All") {
      allOption.selected = true;
    }
    select.appendChild(allOption);
  }
}

/** Wires event listeners for pagination, search, and chrome controls. */
function wireChromeControls(host, table, chrome, state) {
  if (!host || !table) return;
  const tableId = host.id || "smlTable";
  const quickSearchId = `${tableId}QuickSearch`;

  const syncSelects = (value) => {
    if (chrome.upperSelect) chrome.upperSelect.value = String(value);
    if (chrome.lowerSelect) chrome.lowerSelect.value = String(value);
  };

  const rerender = () => {
    syncQuickSearchLockState(host, chrome.quickSearch);
    applyPaginationRows(host, table, state);
    const isChunkLoading = ["true", "1", "yes"].includes(String(host?.dataset?.chunkLoading || "").toLowerCase());
    if (!isChunkLoading) {
      setTrueRecordCount(host, state.totalRecords);
    }
    fillPageLengthSelect(chrome.upperSelect, state.pageSize, state.totalRecords, host);
    fillPageLengthSelect(chrome.lowerSelect, state.pageSize, state.totalRecords, host);
    syncSelects(state.pageSize);

    if (chrome.upperGroup) {
      chrome.upperGroup.innerHTML = renderPaginationGroup(host, "Upper", state.pageStart, state.pageEnd, state.totalRecords, state.pageSize === "All");
    }
    if (chrome.lowerGroup) {
      chrome.lowerGroup.innerHTML = renderPaginationGroup(host, "Lower", state.pageStart, state.pageEnd, state.totalRecords, state.pageSize === "All");
    }

    const pageInputs = host.querySelectorAll(`#${tableId}PageInputUpper, #${tableId}PageInputLower`);
    pageInputs.forEach((input) => {
      input.addEventListener("change", (event) => {
        const maxStart = state.pageSize === "All"
          ? 1
          : Math.max(1, state.totalRecords - state.pageSize + 1);
        const next = Number.parseInt(event.target.value || "1", 10);
        state.pageStart = clamp(Number.isFinite(next) ? next : 1, 1, maxStart);
        rerender();
        emitServerPageRequest(host, state);
      }, { once: true });
    });

    const alphaButtons = host.querySelectorAll(`#${tableId}GoAlphaUpper, #${tableId}GoAlphaLower`);
    alphaButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.pageStart = 1;
        rerender();
        emitServerPageRequest(host, state);
      }, { once: true });
    });

    const omegaButtons = host.querySelectorAll(`#${tableId}GoOmegaUpper, #${tableId}GoOmegaLower`);
    omegaButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (state.pageSize === "All") {
          state.pageStart = 1;
        } else {
          state.pageStart = Math.max(1, state.totalRecords - state.pageSize + 1);
        }
        rerender();
        emitServerPageRequest(host, state);
      }, { once: true });
    });

    const tenPerButtons = host.querySelectorAll(`#${tableId}PageDownTenPerUpper, #${tableId}PageDownTenPerLower, #${tableId}PageUpTenPerUpper, #${tableId}PageUpTenPerLower`);
    tenPerButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (state.pageSize === "All") {
          state.pageStart = 1;
          rerender();
          emitServerPageRequest(host, state);
          return;
        }

        const step = Math.max(1, Math.floor(state.totalRecords * 0.1));
        const maxStart = Math.max(1, state.totalRecords - state.pageSize + 1);
        if (button.dataset.dir === "down") {
          state.pageStart = clamp(state.pageStart - step, 1, maxStart);
        } else {
          state.pageStart = clamp(state.pageStart + step, 1, maxStart);
        }
        rerender();
        emitServerPageRequest(host, state);
      }, { once: true });
    });

    const totalLoadSelects = host.querySelectorAll(`#${tableId}TotalLoadUpper, #${tableId}TotalLoadLower`);
    totalLoadSelects.forEach((select) => {
      select.addEventListener("change", (event) => {
        event.stopPropagation();
        const option = event.target.selectedOptions?.[0];
        if (option?.dataset?.smlTrueRecordCount === "true") return;
        const next = Number.parseInt(event.target.value || "", 10);
        if (!Number.isFinite(next) || next < 1) return;
        persistTotalLoad(host, next);
        totalLoadSelects.forEach((other) => {
          other.value = String(next);
        });
        emitTotalLoadRequest(host, next);
      }, { once: true });
    });
  };

  const onChangeSelect = (event) => {
    const value = event.target.value || "10";
    state.pageSize = value === "All" ? "All" : Number.parseInt(value, 10) || 10;
    state.pageStart = 1;
    writeTableConfig({ numRecs: value === "All" ? "All" : state.pageSize });
    rerender();
    emitServerPageRequest(host, state);
  };

  const applySearchValue = (value) => {
    if (isChunkQuickSearchLocked(host)) return;
    state.searchQuery = String(value || "").trim();
    state.pageStart = 1;
    rerender();
  };

  if (chrome.upperSelect && chrome.upperSelect.dataset.smlBound !== "true") {
    chrome.upperSelect.addEventListener("change", onChangeSelect);
    chrome.upperSelect.dataset.smlBound = "true";
  }

  if (chrome.lowerSelect && chrome.lowerSelect.dataset.smlBound !== "true") {
    chrome.lowerSelect.addEventListener("change", onChangeSelect);
    chrome.lowerSelect.dataset.smlBound = "true";
  }

  const onSearchInput = debounce((event) => {
    applySearchValue(event?.target?.value || "");
  }, 250);

  if (host._smlQuickSearchInputTableId !== quickSearchId) {
    if (host._smlQuickSearchInputHandler) {
      host.removeEventListener("input", host._smlQuickSearchInputHandler);
    }

    host._smlQuickSearchInputHandler = debounce((event) => {
      if (event?.target?.id !== quickSearchId) return;
      applySearchValue(event.target.value || "");
    }, 250);
    host._smlQuickSearchInputTableId = quickSearchId;
    host.addEventListener("input", host._smlQuickSearchInputHandler);
  }

  if (host._smlQuickSearchCommitTableId !== quickSearchId) {
    if (host._smlQuickSearchSearchHandler) {
      host.removeEventListener("search", host._smlQuickSearchSearchHandler);
    }
    if (host._smlQuickSearchKeyupHandler) {
      host.removeEventListener("keyup", host._smlQuickSearchKeyupHandler);
    }

    host._smlQuickSearchSearchHandler = (event) => {
      if (event?.target?.id !== quickSearchId) return;
      applySearchValue(event.target.value || "");
    };
    host._smlQuickSearchKeyupHandler = (event) => {
      if (event?.target?.id !== quickSearchId) return;
      applySearchValue(event.target.value || "");
    };

    host._smlQuickSearchCommitTableId = quickSearchId;
    host.addEventListener("search", host._smlQuickSearchSearchHandler);
    host.addEventListener("keyup", host._smlQuickSearchKeyupHandler);
  }

  if (chrome.quickSearch && chrome.quickSearch.dataset.smlBound !== "true") {
    syncQuickSearchLockState(host, chrome.quickSearch);
    chrome.quickSearch.addEventListener("input", onSearchInput);
    chrome.quickSearch.addEventListener("search", (event) => {
      applySearchValue(event?.target?.value || "");
    });
    chrome.quickSearch.dataset.smlBound = "true";
  }

  // Ensure controls are rendered with active handlers on first paint.
  rerender();
}

/** Ensures chrome is created and wired for the table. */
export function ensureTableChrome(host, table) {
  if (!host || !table) return;

  ensureTableCaption(host, table);

  const rows = getTableRows(table);
  const totalRecords = rows.length;
  const pageSize = normalizePageSize(host, totalRecords);
  const state = host._smlWindowState || {};

  state.pageSize = pageSize;
  state.pageStart = Number.parseInt(String(state.pageStart || 1), 10) || 1;
  state.totalRecords = totalRecords;
  state.searchQuery = String(state.searchQuery || "").trim();
  host._smlWindowState = state;

  applyTotalLoadConfigToHost(host);

  const chrome = getOrCreateChrome(host, table);
  renderTopActionButtons(host, chrome);
  if (chrome.quickSearch) chrome.quickSearch.value = state.searchQuery;
  wireChromeControls(host, table, chrome, state);
  wireActionColumnPositionByOverflow(host, table);
}

/** Applies text truncation to body cells based on column configuration. */
function applyBodyCellTruncation(host, table) {
  if (!host || !table) return;

  const truncationPlan = getTruncationPlan(host);
  const hasConfiguredTruncation = truncationPlan.hasExplicitConfig;
  const renderedColumnWidths = truncationPlan.columns.map((_, columnIndex) => getRenderedColumnWidth(table, columnIndex));

  const headerCount = table.querySelectorAll("thead th").length || 1;
  const viewportWidth = globalThis.screen?.width || globalThis.innerWidth || 1200;
  const fairColSize = viewportWidth / headerCount;
  const bodyRows = Array.from(table.querySelectorAll("tbody tr"));

  bodyRows.forEach((row) => {
    const cells = Array.from(row.querySelectorAll("td, th"));
    cells.forEach((cell, columnIndex) => {
      if (cell.classList.contains("sml-table-action-col")) return;

      const textValue = (cell.textContent || "").trim();

      if (hasConfiguredTruncation) {
        if (truncationPlan.truncateFlags[columnIndex] !== true) {
          if (cell.style.maxWidth) {
            cell.style.removeProperty("max-width");
          }
          cell.classList.remove("text-truncate");
          return;
        }

        const columnWidth = renderedColumnWidths[columnIndex] || Math.max(Math.round(fairColSize), 48);
        cell.style.maxWidth = `${columnWidth}px`;
        cell.classList.add("text-truncate");
        return;
      }

      if (!textValue) return;

      if (fairColSize < textValue.length * 12) {
        cell.style.maxWidth = `${fairColSize}px`;
        cell.classList.add("text-truncate");
      } else if (cell.style.maxWidth) {
        cell.style.removeProperty("max-width");
        cell.classList.remove("text-truncate");
      }
    });
  });
}

/** Renders row action buttons with inline/dropdown layout based on action count. */
export function decorateActionColumn(host, table) {
  if (!host || !table) return;

  const headerCells = Array.from(table.querySelectorAll("thead th"));
  if (headerCells.length < 1) return;

  let actionIndex = headerCells.findIndex((headerCell) =>
    (headerCell.textContent || "").trim().toLowerCase() === "actions"
  );

  if (actionIndex < 0) {
    actionIndex = headerCells.length - 1;
  }

  const actionHeader = headerCells[actionIndex];
  actionHeader?.classList.add("sml-table-action-col");

  const actionTypeClassMap = {
    read: "btn btn-sm btn-secondary",
    view: "btn btn-sm btn-secondary",
    vcard: "btn btn-sm btn-primary text-white",
    update: "btn btn-sm btn-primary",
    edit: "btn btn-sm btn-primary",
    delete: "btn btn-sm btn-danger text-white",
    remove: "btn btn-sm btn-danger text-white",
    create: "btn btn-sm btn-success",
    add: "btn btn-sm btn-success",
    export: "btn btn-sm btn-primary text-warning"
  };

  const buttonVariantClasses = [
    "btn-primary", "btn-secondary", "btn-success", "btn-danger", "btn-warning", "btn-info",
    "btn-light", "btn-dark", "btn-link", "btn-outline-primary", "btn-outline-secondary",
    "btn-outline-success", "btn-outline-danger", "btn-outline-warning", "btn-outline-info",
    "btn-outline-light", "btn-outline-dark", "text-white", "text-warning"
  ];

  const inferActionType = (element, label, title) => {
    const tokens = [
      element?.dataset?.type || "",
      element?.dataset?.action || "",
      label || "",
      title || ""
    ]
      .join(" ")
      .toLowerCase();

    if (tokens.includes("delete") || tokens.includes("remove")) return "delete";
    if (tokens.includes("edit") || tokens.includes("update")) return "update";
    if (tokens.includes("vcard") || tokens.includes("person vcard") || tokens.includes("address card")) return "vcard";
    if (tokens.includes("read") || tokens.includes("view")) return "read";
    if (tokens.includes("create") || tokens.includes("add")) return "create";
    if (tokens.includes("export")) return "export";
    return "action";
  };

  const setActionElementContent = (element, iconClass, labelText) => {
    if (!element) return;

    if (element.tagName === "SML-REACTIVE-BUTTON") {
      if (iconClass) {
        element.dataset.icon = iconClass;
      } else {
        delete element.dataset.icon;
      }
      element.dataset.text = labelText;
      return;
    }

    element.innerHTML = "";
    const text = document.createElement("span");
    text.className = iconClass ? "d-none d-xl-inline" : "";
    text.textContent = labelText;

    if (iconClass) {
      const icon = document.createElement("i");
      icon.className = `${iconClass} me-1`;
      icon.setAttribute("aria-hidden", "true");
      element.appendChild(icon);
    }
    element.appendChild(text);
  };

  const getRowActionRecordLabel = (row) => {
    const cells = Array.from(row.querySelectorAll("td, th"));
    const firstTextCell = cells.find((cell, index) => index !== actionIndex && (cell.textContent || "").trim().length > 0);
    return (firstTextCell?.textContent || row.dataset?.rowSearch || "Record").trim();
  };

  const decorateActionElement = (element, rowId, index) => {
    const label = (element.dataset?.text || element.textContent || "Action").trim() || "Action";
    const existingTitle = (element.getAttribute("title") || "").trim();
    const actionType = inferActionType(element, label, existingTitle);
    const existingIcon = element.querySelector("i, b, span[class*='bi bi-'], span[class*='bi-']");
    const existingIconClass = String(existingIcon?.className || "").trim();
    const explicitIconClass = String(element.dataset?.icon || "").trim();
    const iconClass = explicitIconClass || existingIconClass;
    const explicitButtonClass = String(element.dataset?.htmlClass || "").trim();
    const buttonClass = explicitButtonClass || actionTypeClassMap[actionType] || "btn btn-sm btn-primary text-warning";
    const titleText = existingTitle || `${label} record`;

    element.classList.remove(...buttonVariantClasses);
    element.classList.add(...buttonClass.split(" ").filter(Boolean), "sml-table-action-button", "text-start");
    if (element.tagName === "BUTTON") {
      element.setAttribute("type", element.getAttribute("type") || "button");
    }

    element.setAttribute("title", titleText);
    element.setAttribute("aria-label", titleText);
    if (!element.id) {
      element.id = `${table.id || "smlTable"}ActionButton${rowId}_${index}`;
    }

    element.style.maxWidth = "7em";
    element.style.width = "auto";
    element.style.display = "inline-flex";
    element.style.flexWrap = "nowrap";
    element.style.alignItems = "center";

    setActionElementContent(element, iconClass, label);
    return element;
  };

  const bodyRows = Array.from(table.querySelectorAll("tbody tr"));
  bodyRows.forEach((row, rowIndex) => {
    const cells = row.querySelectorAll("td, th");
    const actionCell = cells[actionIndex];
    actionCell?.classList.add("sml-table-action-col", "text-center");

    if (!actionCell || actionCell.dataset.smlActionsDecorated === "true") return;

    const actionCandidates = Array.from(actionCell.querySelectorAll("a, button, sml-reactive-button"))
      .filter((element) => !element.closest(".dropdown-menu"));

    if (actionCandidates.length < 1) {
      actionCell.dataset.smlActionsDecorated = "true";
      return;
    }

    const rowId = row.dataset?.rowId || String(rowIndex + 1);
    const normalizedActions = actionCandidates.map((element, idx) => decorateActionElement(element, rowId, idx + 1));
    const recordLabel = getRowActionRecordLabel(row);

    const useDropdownOnly = normalizedActions.length > 2;
    const directActions = useDropdownOnly ? [] : normalizedActions;
    const overflowActions = useDropdownOnly ? normalizedActions : [];

    actionCell.innerHTML = "";
    directActions.forEach((element) => {
      actionCell.appendChild(element);
    });

    if (overflowActions.length > 0) {
      const dropdown = document.createElement("div");
      dropdown.className = "sml-table-action-flyout d-inline-block";

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "btn btn-primary text-start";
      trigger.id = `${table.id || "smlTable"}ActionsMenu_${rowId}`;
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-haspopup", "true");
      trigger.setAttribute("title", `Actions for ${recordLabel}`);
      trigger.setAttribute("aria-label", `Actions for ${recordLabel}`);

      const triggerIcon = document.createElement("i");
      triggerIcon.className = "bi bi-list-ul p-0 me-1";
      triggerIcon.setAttribute("aria-hidden", "true");

      const triggerText = document.createElement("span");
      triggerText.className = "d-none d-xl-inline";
      triggerText.textContent = "Actions";

      trigger.appendChild(triggerIcon);
      trigger.appendChild(triggerText);

      const menu = document.createElement("ul");
      menu.className = "dropdown-menu px-2 mx-0 bg-dark sml-table-action-drop-menu";
      menu.setAttribute("aria-label", `${trigger.id} menu`);
      menu.style.zIndex = "6001";
      menu.style.maxWidth = "600px";
      menu.style.width = "auto";
      menu.style.overflowX = "hidden";

      const recordHeader = document.createElement("li");
      recordHeader.className = "alert alert alert-info text-center fs-6 fw-bold li-header";
      recordHeader.textContent = "Record:";
      recordHeader.title = recordLabel;
      menu.appendChild(recordHeader);

      const recordInfo = document.createElement("li");
      recordInfo.className = "alert alert alert-primary text-center fs-6 fw-bold li-header-info overflow-hidden";
      recordInfo.title = recordLabel;
      const recordInfoIcon = document.createElement("span");
      recordInfoIcon.className = "bi bi-card-heading float-start";
      recordInfoIcon.title = recordLabel;
      const recordInfoText = document.createElement("span");
      recordInfoText.className = "ms-1 d-inline-block text-truncate overflow-hidden align-middle";
      recordInfoText.textContent = recordLabel;
      recordInfoText.title = recordLabel;
      recordInfoText.style.maxWidth = "100%";
      recordInfoText.style.width = "calc(100% - 1.5rem)";
      recordInfo.appendChild(recordInfoIcon);
      recordInfo.appendChild(recordInfoText);
      menu.appendChild(recordInfo);

      overflowActions.forEach((element) => {
        const item = document.createElement("li");
        item.className = "w-100";

        element.classList.add("w-100", "d-flex", "align-items-center", "justify-content-start", "text-start");
        element.classList.add("text-truncate", "overflow-hidden");
        element.style.display = "flex";
        element.style.maxWidth = "100%";
        element.style.width = "100%";
        element.style.whiteSpace = "nowrap";
        element.style.flexWrap = "nowrap";

        item.appendChild(element);
        menu.appendChild(item);
      });

      dropdown.appendChild(trigger);
      actionCell.appendChild(dropdown);
      wireFloatingActionMenu(host, trigger, menu);
    }

    actionCell.dataset.smlActionsDecorated = "true";
  });
}

function ensureActionColumnCells(table) {
  let actionCells = table.querySelectorAll("td.sml-table-action-col, th.sml-table-action-col");
  if (actionCells.length > 0) return actionCells;

  const headerCells = Array.from(table.querySelectorAll("thead th"));
  let actionIndex = headerCells.findIndex((headerCell) =>
    (headerCell.textContent || "").trim().toLowerCase() === "actions"
  );

  if (actionIndex < 0) {
    const sampleRowCells = Array.from(table.querySelectorAll("tbody tr:first-child td, tbody tr:first-child th"));
    actionIndex = sampleRowCells.findIndex((cell) => !!cell.querySelector("a, button, sml-reactive-button"));
  }

  if (actionIndex < 0) return actionCells;

  if (headerCells[actionIndex]) {
    headerCells[actionIndex].classList.add("sml-table-action-col");
  }

  Array.from(table.querySelectorAll("tbody tr")).forEach((row) => {
    const cells = row.querySelectorAll("td, th");
    const cell = cells[actionIndex];
    if (cell) {
      cell.classList.add("sml-table-action-col", "text-nowrap");
    }
  });

  return table.querySelectorAll("td.sml-table-action-col, th.sml-table-action-col");
}

function isActionColumnDebugEnabled(host) {
  return host?.dataset?.actionColumnDebug === "true";
}

function logActionColumnDebug(host, message, details = null) {
  if (!isActionColumnDebugEnabled(host)) return;
  const hostId = host?.id || host?.dataset?.tableName || "unknown-host";
  const prefix = `[sml-table][action-column][${hostId}] ${message}`;
  if (details) {
    console.info(prefix, details);
    return;
  }
  console.info(prefix);
}

function resolveShouldUseLeftMode(host, tableScroller) {
  const hasHorizontalOverflow = (tableScroller.scrollWidth - tableScroller.clientWidth) > 2;
  const mobileTabletBreakpoint = Number.parseFloat(host.dataset.mobileTabletBreakpoint || "1200");
  const widthBreakpoint = Number.isFinite(mobileTabletBreakpoint) && mobileTabletBreakpoint > 0
    ? mobileTabletBreakpoint
    : 991.98;
  const viewportWidth = Number(globalThis.visualViewport?.width)
    || Number(globalThis.innerWidth)
    || Number(globalThis.screen?.width)
    || 1920;
  const mediaQueryMatch = typeof globalThis.matchMedia === "function"
    && globalThis.matchMedia(`(max-width: ${widthBreakpoint}px)`).matches;
  const widthMatch = viewportWidth <= widthBreakpoint;
  const isMobileOrTabletViewport = mediaQueryMatch || widthMatch;
  const shouldUseLeftMode = hasHorizontalOverflow || isMobileOrTabletViewport;
  return {
    shouldUseLeftMode,
    hasHorizontalOverflow,
    mobileTabletBreakpoint,
    widthBreakpoint,
    viewportWidth,
    mediaQueryMatch,
    widthMatch,
    isMobileOrTabletViewport,
    scrollWidth: tableScroller.scrollWidth,
    clientWidth: tableScroller.clientWidth
  };
}

function shouldRepositionActionCells(host, table, shouldUseLeftMode) {
  const isLeftMode = host.classList.contains("sml-table-actions-left");
  if (isLeftMode !== shouldUseLeftMode) return true;

  const sampleRow = table.querySelector("tbody tr, tr");
  const sampleActionCell = sampleRow?.querySelector(".sml-table-action-col") || null;
  if (!sampleRow || !sampleActionCell) return false;

  return shouldUseLeftMode
    ? sampleActionCell !== sampleRow.firstElementChild
    : sampleActionCell !== sampleRow.lastElementChild;
}

/** Applies positioning logic to action column based on table overflow. */
function applyActionColumnPositionByOverflow(host, table) {
  if (!host || !table) return;

  const tableScroller = table.parentElement?.classList.contains("sml-table-scroller")
    ? table.parentElement
    : null;
  if (!tableScroller) return;

  const actionCells = ensureActionColumnCells(table);
  if (actionCells.length < 1) {
    return;
  }

  const leftModeDecision = resolveShouldUseLeftMode(host, tableScroller);
  const shouldUseLeftMode = leftModeDecision.shouldUseLeftMode;

  const currentMode = host.classList.contains("sml-table-actions-left") ? "left" : "right";
  const desiredMode = shouldUseLeftMode ? "left" : "right";
  if (currentMode !== desiredMode) {
    logActionColumnDebug(host, "mode-change", {
      from: currentMode,
      to: desiredMode,
      reason: leftModeDecision
    });
  }

  if (shouldRepositionActionCells(host, table, shouldUseLeftMode)) {
    let movedRows = 0;
    Array.from(table.querySelectorAll("tr")).forEach((row) => {
      const actionCell = row.querySelector(".sml-table-action-col");
      if (!actionCell) return;

      if (shouldUseLeftMode) {
        if (actionCell !== row.firstElementChild) {
          row.prepend(actionCell);
          movedRows += 1;
        }
      } else if (actionCell !== row.lastElementChild) {
        row.append(actionCell);
        movedRows += 1;
      }
    });

    if (movedRows > 0) {
      logActionColumnDebug(host, "repositioned-action-cells", {
        movedRows,
        mode: desiredMode
      });
    }
  }

  Array.from(table.querySelectorAll("td.sml-table-action-col .sml-table-action-flyout")).forEach((dropDown) => {
    dropDown.classList.toggle("dropend", shouldUseLeftMode);
    dropDown.classList.toggle("dropstart", !shouldUseLeftMode);
  });

  host.classList.toggle("sml-table-actions-left", shouldUseLeftMode);
  host.classList.toggle("sml-table-actions-right", !shouldUseLeftMode);
}

/** Wires event listener for dynamic action column position changes. */
function wireActionColumnPositionByOverflow(host, table) {
  if (!host || !table) return;

  if (host._smlActionColumnResizeObserver) {
    host._smlActionColumnResizeObserver.disconnect();
    host._smlActionColumnResizeObserver = null;
  }

  if (host._smlActionColumnResizeHandler) {
    globalThis.removeEventListener("resize", host._smlActionColumnResizeHandler);
    host._smlActionColumnResizeHandler = null;
  }

  if (host._smlActionColumnMutationObserver) {
    host._smlActionColumnMutationObserver.disconnect();
    host._smlActionColumnMutationObserver = null;
  }

  const rerun = debounce(() => {
    adoptRenderedFloatingActionMenus(host, table);
    applyBodyCellTruncation(host, table);
    applyActionColumnPositionByOverflow(host, table);
  }, 120);

  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => rerun());
    const tableScroller = table.parentElement?.classList.contains("sml-table-scroller")
      ? table.parentElement
      : null;
    if (tableScroller) observer.observe(tableScroller);
    observer.observe(table);
    host._smlActionColumnResizeObserver = observer;
  } else {
    host._smlActionColumnResizeHandler = rerun;
    globalThis.addEventListener("resize", rerun);
  }

  if (typeof MutationObserver === "function") {
    const mutationObserver = new MutationObserver((mutationList) => {
      const hasRowMutations = mutationList.some((mutation) => {
        if (mutation.type !== "childList") return false;
        const targetTag = mutation.target?.tagName;
        if (targetTag === "TBODY" || targetTag === "THEAD" || targetTag === "TR") return true;
        return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
      });

      if (hasRowMutations) {
        rerun();
      }
    });

    mutationObserver.observe(table, {
      childList: true,
      subtree: true
    });

    host._smlActionColumnMutationObserver = mutationObserver;
  }

  adoptRenderedFloatingActionMenus(host, table);
  applyBodyCellTruncation(host, table);
  applyActionColumnPositionByOverflow(host, table);
}

/** Master initialization function orchestrating full table setup and chrome. */
export function applyTableOwnership(host, table) {
  if (!host) return;

  host.dataset.tableSource = table ? "razor" : "json";

  if (!host.classList.contains("sml-table-actions-left") && !host.classList.contains("sml-table-actions-right")) {
    host.classList.add("sml-table-actions-right");
  }

  if (!table) return;

  const defaultClasses = ["table", "table-sm", "table-striped", "table-hover"];
  const configuredClasses = (host.dataset.tableClass || "").split(/\s+/).filter(Boolean);
  const resolvedClasses = configuredClasses.length > 0 ? configuredClasses : defaultClasses;
  resolvedClasses.forEach((cssClass) => table.classList.add(cssClass));
  table.classList.add("mb-0", "pb-0");

  const thead = table.querySelector("thead");
  if (thead) {
    thead.classList.add("table-dark", "small");
  }

  decorateSortableHeaders(table);
  applyBodyCellTruncation(host, table);

  const needsWrapper = !(table.parentElement?.classList.contains("sml-table-scroller") ?? false);
  if (needsWrapper && table !== host) {
    const wrapper = document.createElement("div");
    wrapper.className = "sml-table-scroller table-responsive w-100";
    table.parentNode?.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  }

  ensureTableChrome(host, table);
}
