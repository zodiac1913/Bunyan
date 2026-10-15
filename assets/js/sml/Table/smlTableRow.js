import { jmlToHtml } from "../smlUtils.js";
import { resolveTableActions } from "./smlTableActions.js";

/** Extracts column key from various column config formats (field, Field, FieldName, etc.). */
function getColumnKey(column) {
  if (!column) return "";

  if (typeof column === "string") return column.trim();
  if (typeof column !== "object") return "";

  const candidates = [
    column.field,
    column.Field,
    column.FieldName,
    column.fieldName,
    column.columnName,
    column.ColumnName,
    column.key,
    column.Key,
    column.PropertyName,
    column.propertyName,
    column.Name,
    column.name
  ];

  const match = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  if (match) return match.trim();

  const nestedProperty =
    (column.property && typeof column.property === "object" ? column.property : null)
    || (column.Property && typeof column.Property === "object" ? column.Property : null)
    || (column.column && typeof column.column === "object" ? column.column : null)
    || (column.Column && typeof column.Column === "object" ? column.Column : null);

  if (nestedProperty) {
    const nested = [
      nestedProperty.Name,
      nestedProperty.name,
      nestedProperty.FieldName,
      nestedProperty.fieldName,
      nestedProperty.PropertyName,
      nestedProperty.propertyName
    ].find((value) => typeof value === "string" && value.trim().length > 0);

    if (nested) return nested.trim();
  }

  return "";
}

/** Checks if a column has text truncation enabled (AllowTruncate). */
function readAllowTruncate(column) {
  if (!column || typeof column !== "object") return false;

  const candidates = [column.AllowTruncate, column.allowTruncate];
  return candidates.includes(true);
}

/** Reads image folder path from column config. */
function readImageFolder(column) {
  if (!column || typeof column !== "object") return "";

  const candidates = [column.ImageFolder, column.imageFolder];
  const match = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return match ? match.trim() : "";
}

/** Normalizes image folder for use in data attributes, removing default paths. */
function resolveImageFolderTagValue(column) {
  const configured = readImageFolder(column);
  if (!configured) return "";

  const normalized = String(configured)
    .trim()
    .replaceAll("\\", "/")
    .replace(/\/+$/, "");

  if (!normalized) return "";

  const withoutRoot = normalized.replace(/^\.\//, "").replace(/^\//, "").replace(/^images\//i, "");
  if (!withoutRoot) return "";

  // Treat framework defaults as not explicitly configured.
  if (/^(?:\.?\/?images?)$/i.test(normalized)) {
    return "";
  }

  return withoutRoot;
}

/** Builds image src URL from folder and filename, handling relative and absolute paths. */
function buildImageSrcFromFolderAndFile(imageFolder, rawValue) {
  const folder = String(imageFolder || "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
  const fileName = String(rawValue || "").trim().replaceAll("\\", "/");
  if (!folder || !fileName) return "";

  const canonicalizeAppsFolder = (path) => String(path || "").replace(/^\/?images\/apps\//i, "/images/Apps/");

  if (fileName.startsWith("~/")) {
    return canonicalizeAppsFolder(`/${fileName.substring(2)}`);
  }

  if (fileName.startsWith("./")) {
    return canonicalizeAppsFolder(`/${fileName.substring(2)}`);
  }

  if (/^images\//i.test(fileName)) {
    return canonicalizeAppsFolder(`/${fileName}`);
  }

  if (fileName.includes("/") && isImageFileName(fileName)) {
    const rootedPath = fileName.startsWith("/") ? fileName : `/${fileName}`;
    return canonicalizeAppsFolder(rootedPath);
  }

  if (/^(?:https?:)?\/\//i.test(fileName) || fileName.startsWith("/")) {
    return canonicalizeAppsFolder(fileName);
  }

  const normalizedFolder = /^apps$/i.test(folder) ? "Apps" : folder;
  return canonicalizeAppsFolder(`/images/${normalizedFolder}/${fileName}`);
}

/** Normalizes Bootstrap (bi-*) and FontAwesome (fa-*) icon class strings. */
function normalizeIconClass(value) {
  const tokens = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 1) return "";

  const normalizedTokens = [];

  const hasBootstrapPrefix = tokens.includes("bi");
  const hasFontAwesomePrefix = tokens.some((token) => /^(?:fa|fas|far|fal|fab|fad)$/i.test(token));
  const hasFontAwesomeIcon = tokens.some((token) => /^fa-[\w-]+$/i.test(token));

  tokens.forEach((token) => {
    if (/^bi-[\w-]+$/i.test(token)) {
      if (!hasBootstrapPrefix && !normalizedTokens.includes("bi")) {
        normalizedTokens.push("bi");
      }
      normalizedTokens.push(token);
      return;
    }

    const shorthandFontAwesomeMatch = token.match(/^(fa|fas|far|fal|fab|fad)-([\w-]+)$/i);
    if (shorthandFontAwesomeMatch) {
      const styleToken = shorthandFontAwesomeMatch[1];
      const iconToken = `fa-${shorthandFontAwesomeMatch[2]}`;

      if (!hasFontAwesomePrefix && !normalizedTokens.includes(styleToken)) {
        normalizedTokens.push(styleToken);
      }
      if (!hasFontAwesomeIcon || !normalizedTokens.includes(iconToken)) {
        normalizedTokens.push(iconToken);
      }
      return;
    }

    normalizedTokens.push(token);
  });

  return normalizedTokens.filter((token, index) => normalizedTokens.indexOf(token) === index).join(" ").trim();
}

/** Checks if value is a valid icon class string (Bootstrap or FontAwesome). */
function isIconClassName(value) {
  const text = normalizeIconClass(value);
  if (!text) return false;

  return /(\bbi\s+bi-[\w-]+\b)|(\bfa[srbld]?\s+fa-[\w-]+\b)|(\bfab\s+fa-[\w-]+\b)/i.test(text);
}

function isImageFileName(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return /\.(?:png|jpe?g|gif|svg|webp|bmp|ico)(?:[?#].*)?$/i.test(text);
}

/** Converts camelCase property name to kebab-case data attribute name. */
function toDataAttributeName(key) {
  return String(key || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

/** Returns first non-blank value from arguments, skipping nulls and objects. */
function firstNonBlank(...values) {
  for (const candidate of values) {
    if (candidate === null || candidate === undefined) continue;
    if (typeof candidate === "object") continue;
    const text = String(candidate).trim();
    if (text !== "") return candidate;
  }

  return "";
}

/** Reads value from row element's dataset or data-* attributes. */
function readValueFromRowDataset(tableRow, columnKey) {
  if (!tableRow || !columnKey) return "";

  const dataName = toDataAttributeName(columnKey);
  if (!dataName) return "";

  // Prefer explicit data-* attribute first, then dataset camel access.
  const explicit = tableRow.getAttribute(`data-${dataName}`);
  if (explicit !== null && explicit !== undefined && String(explicit).trim() !== "") {
    return explicit;
  }

  const datasetKey = dataName.replace(/-([a-z])/g, (_, chr) => chr.toUpperCase());
  const viaDataset = tableRow.dataset?.[datasetKey];
  if (viaDataset !== null && viaDataset !== undefined && String(viaDataset).trim() !== "") {
    return viaDataset;
  }

  return "";
}

/** Decodes HTML entities in a string. */
function decodeHtmlEntities(value) {
  const text = String(value ?? "");
  if (!text.includes("&")) return text;

  const textArea = document.createElement("textarea");
  textArea.innerHTML = text;
  return textArea.value;
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

/** Heuristically detects if a column value is image-like (icon or image object/filename). */
function isImageLikeColumn(column, value) {
  if (value === null || value === undefined || value === "") return false;

  if (typeof value === "object" && !Array.isArray(value)) {
    if (value.imageSrc || value.iconClass) {
      return true;
    }
  }

  const dataType = String(column?.DataType || column?.dataType || "").toLowerCase();
  if (["image", "img", "picture", "photo", "icon"].includes(dataType)) {
    return true;
  }

  const keyHint = String(getColumnKey(column) || "").toLowerCase();
  const titleHint = String(column?.Title || column?.title || "").toLowerCase();
  const tokenSource = `${toDataAttributeName(keyHint)} ${toDataAttributeName(titleHint)}`.trim();
  if (!tokenSource) return false;

  const tokens = tokenSource
    .split(/[-\s]+/)
    .filter(Boolean);

  return tokens.some((token) => ["image", "img", "photo", "picture", "avatar", "icon", "logo"].includes(token));
}

/** Provides fallback cell values for common column names when primary value is missing. */
function resolveFallbackCellValue(row, columnKey) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return "";

  const key = String(columnKey || "").trim().toLowerCase();
  if (!key) return "";

  if (key === "assignedto") {
    const assignedTo = firstNonBlank(row.AssignedTo, row.assignedTo, row.UserName, row.userName, row.RoleName, row.roleName);
    if (assignedTo !== "") return assignedTo;
  }

  if (key === "apptitle") {
    const appTitle = firstNonBlank(row.AppTitle, row.appTitle, row.TaskTitle, row.taskTitle, row.Title, row.title);
    if (appTitle !== "") return appTitle;
  }

  if (key === "originalusername") {
    const originalUser = firstNonBlank(row.OriginalUserName, row.originalUserName, row.UserName, row.userName);
    if (originalUser !== "") return originalUser;
  }

  if (key === "accesslevel") {
    const accessLevel = firstNonBlank(row.AccessLevel, row.accessLevel, row.Level, row.level);
    if (accessLevel !== "") return accessLevel;
  }

  if (key === "status") {
    const status = firstNonBlank(row.Status, row.status);
    if (status !== "") return status;
  }

  if (Array.isArray(row.DTOMapping)) {
    const mapped = row.DTOMapping.find((item) => String(item?.DTOProp || "").toLowerCase() === key);
    if (mapped?.ModelProp) {
      const modelKey = String(mapped.ModelProp);
      const mappedValue = firstNonBlank(row[modelKey], row[modelKey.charAt(0).toLowerCase() + modelKey.slice(1)]);
      if (mappedValue !== "") return mappedValue;
    }
  }

  return "";
}

/** Gets row-level actions from config, filtering out table-level Create/Export actions. */
function getRowActions(host, row) {
  const actions = resolveTableActions(host?._tableConfig);
  if (!Array.isArray(actions)) {
    return [];
  }

  // Create and Export are table-level controls; preserve every configured row action.
  return actions.filter((action) => {
    if (!action || action.type === "Create" || action.type === "Export") return false;
    return true;
  });
}

function readRowField(row, fieldName) {
  if (!row || typeof row !== "object" || Array.isArray(row) || !fieldName) return "";

  const direct = row[fieldName];
  if (direct !== null && direct !== undefined && typeof direct !== "object" && String(direct).trim() !== "") {
    return String(direct);
  }

  const lower = String(fieldName).toLowerCase();
  const match = Object.keys(row).find((key) => String(key).toLowerCase() === lower);
  if (!match) return "";

  const value = row[match];
  if (value === null || value === undefined || typeof value === "object") return "";
  const text = String(value).trim();
  return text === "" ? "" : String(value);
}

/** Gets human-readable record description for accessibility and UI display. */
function getRecordDescription(host, row) {
  const textIdentifier = String(host?._tableConfig?.textIdentifier || host?.dataset?.textIdentifier || "RecordDescription");
  const keys = textIdentifier.split(",").map((value) => value.trim()).filter(Boolean);
  if (!keys.some((key) => key.toLowerCase() === "recorddescription")) {
    keys.push("RecordDescription");
  }

  const combined = keys
    .map((key) => readRowField(row, key))
    .filter((value) => value !== "")
    .filter((value, index, list) => list.findIndex((item) => item === value) === index)
    .join(" ");

  return decodeHtmlEntities(combined);
}

/** Gets model key value from row for record identification. */
function getModelKeyValue(row, modelKey) {
  if (!row || !modelKey) return "";

  const camelKey = modelKey.charAt(0).toLowerCase() + modelKey.slice(1);
  const value = firstNonBlank(row[modelKey], row[camelKey]);
  return value === "" ? "" : String(value);
}

/** Applies data attributes to a table row from row object properties. */
function applyRowDataAttributes(host, tableRow, row, rowIndex) {
  const modelKey = String(host?._tableConfig?.modelKey || "");
  const recordDescription = getRecordDescription(host, row);

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    tableRow.dataset.rowId = String(rowIndex + 1);
    if(tableRow.dataset.rowId%2 === 0) tableRow.classList.add("bg-Gainsboro");
    tableRow.dataset.rowSearch = String(row ?? "");
    if (recordDescription) {
      tableRow.setAttribute("data-description", recordDescription);
    }
    return;
  }

  const searchParts = [];

  Object.entries(row).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    if (typeof value === "object") return;

    const textValue = decodeHtmlEntities(value);
    const dataName = toDataAttributeName(key);
    if (dataName) {
      tableRow.setAttribute(`data-${dataName}`, textValue);
    }

    searchParts.push(textValue);
  });

  const resolvedRowId = getModelKeyValue(row, modelKey);
  const rowId = resolvedRowId || String(rowIndex + 1);

  tableRow.dataset.rowId = rowId;
  tableRow.id = `${host.id}Row${rowId}`;

  if (recordDescription) {
    tableRow.setAttribute("data-description", recordDescription);
  }

  tableRow.dataset.rowSearch = searchParts.join(" ").trim();
}

/** Sets title and aria-label on cell for accessibility. */
function setCellAccessibility(cell, recordDescription, columnTitle, value) {
  const valueText =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? decodeHtmlEntities(value.text || value.label || value.value || columnTitle || "")
        : decodeHtmlEntities(value);

  const decodedColumnTitle = decodeHtmlEntities(columnTitle);

  const titleText = recordDescription
    ? `${recordDescription} - ${decodedColumnTitle}${valueText ? `: ${valueText}` : ""}`
    : `${decodedColumnTitle}${valueText ? `: ${valueText}` : ""}`;

  if (titleText.trim().length > 0) {
    cell.title = titleText;
    cell.setAttribute("aria-label", titleText);
  }
}

/** Gets accessibility text for a cell. */
function getCellAccessibilityText(recordDescription, columnTitle, value) {
  const valueText =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? decodeHtmlEntities(value.text || value.label || value.value || columnTitle || "")
        : decodeHtmlEntities(value);

  const decodedColumnTitle = decodeHtmlEntities(columnTitle);

  return recordDescription
    ? `${recordDescription} - ${decodedColumnTitle}${valueText ? `: ${valueText}` : ""}`
    : `${decodedColumnTitle}${valueText ? `: ${valueText}` : ""}`;
}

function getActionAccessibilityText(recordDescription, actionTitle, actionLabel) {
  const decodedActionTitle = decodeHtmlEntities(actionTitle || actionLabel || "Action");
  const decodedActionLabel = decodeHtmlEntities(actionLabel || actionTitle || "Action");

  return recordDescription
    ? `${recordDescription} - ${decodedActionTitle}: ${decodedActionLabel}`
    : `${decodedActionTitle}: ${decodedActionLabel}`;
}

function resolveActionLabel(action, fallback = "Action") {
  return decodeHtmlEntities(action?.label || action?.text || action?.name || action?.type || fallback);
}

function resolveActionHref(action) {
  return String(action?.eventBypass || action?.href || action?.url || "#");
}

function isStyledActionLink(action) {
  return !!(action?.eventBypass || action?.icon || action?.htmlClass || action?.type || action?.name);
}

function buildActionLinkContentJml(action, label) {
  const iconClass = String(action?.icon || "").trim();
  if (!iconClass) {
    return label;
  }

  return [
    { n: "i", c: `${iconClass} me-1`, "aria-hidden": "true" },
    { n: "span", t: label }
  ];
}

/** Builds JML for action links (e.g., href/label/title) as linked list. */
function buildActionLinksJml(actions) {
  if (!Array.isArray(actions) || actions.length < 1) return [];

  const nodes = [];
  actions.forEach((action, index) => {
    if (index > 0) {
      nodes.push(" | ");
    }

    const href = resolveActionHref(action);
    const title = decodeHtmlEntities(action?.title || "");
    const label = resolveActionLabel(action);
    const className = isStyledActionLink(action)
      ? String(action?.htmlClass || "btn btn-sm btn-primary text-white").trim()
      : "";
    nodes.push({
      n: "a",
      href,
      ...(className ? { c: `${className} sml-table-action-button text-start`.trim() } : {}),
      ...(title ? { title, "aria-label": title } : {}),
      b: buildActionLinkContentJml(action, label)
    });
  });

  return nodes;
}

/** Builds JML for cell content (icon, image, text, link, or nested object). */
function buildCellContentJml(value, imageFolder) {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    const linkNodes = buildActionLinksJml(value);
    if (linkNodes.length > 0) return linkNodes;
    return decodeHtmlEntities(value.join(", "));
  }

  if (typeof value !== "object") {
    if (isIconClassName(value)) {
      return { n: "span", c: normalizeIconClass(value), "aria-hidden": "true" };
    }

    if (imageFolder && isImageFileName(value)) {
      const imageSrc = buildImageSrcFromFolderAndFile(imageFolder, value);
      if (imageSrc) {
        return {
          n: "img",
          src: imageSrc,
          alt: String(value || ""),
          s: "max-height:24px;"
        };
      }
    }

    return decodeHtmlEntities(value);
  }

  if (Array.isArray(value.actions)) {
    const linkNodes = buildActionLinksJml(value.actions);
    if (linkNodes.length > 0) return linkNodes;
  }

  if (value.iconClass) {
    return { n: "span", c: normalizeIconClass(value.iconClass), "aria-hidden": "true" };
  }

  if (value.imageSrc) {
    return {
      n: "img",
      src: String(value.imageSrc),
      alt: String(value.alt || ""),
      s: `max-height:${String(value.maxHeight || "24px")};`
    };
  }

  if (value.href || value.url) {
    const href = String(value.href || value.url);
    const title = value.title ? decodeHtmlEntities(value.title) : "";
    return {
      n: "a",
      href,
      ...(title ? { title, "aria-label": title } : {}),
      t: decodeHtmlEntities(value.text || value.label || value.href || value.url)
    };
  }

  return decodeHtmlEntities(value.text || value.label || value.value || "");
}

/** Builds JML for a single row action button (sml-reactive-button or anchor). */
function buildActionNodeJml(host, action, row, actionIndex, recordDescription) {
  const rowId = getModelKeyValue(row, String(host?._tableConfig?.modelKey || ""));
  const hasBypassUrl = !!action?.eventBypass;
  const actionType = String(action?.type || "");
  const actionName = String(action?.name || actionType || `Action${actionIndex}`);
  const actionLabel = resolveActionLabel(action, actionName || `Action${actionIndex}`);
  const recordLabel = decodeHtmlEntities(recordDescription || "Record");
  const actionTitleBase = decodeHtmlEntities(action?.title || actionLabel || actionType || actionName || "Action");
  const titleText = getActionAccessibilityText(recordLabel, actionTitleBase, actionLabel);
  const authoredClass = String(action?.htmlClass || "").trim();

  const inferActionIcon = () => {
    const explicit = String(action?.icon || "").trim();
    if (explicit) return explicit;

    const token = `${actionType} ${actionName} ${actionLabel}`.toLowerCase();
    if (/(delete|remove|deassign|unassign)/.test(token)) return "bi bi-trash-fill";
    if (/(reactivate|restore|enable)/.test(token)) return "bi bi-arrow-clockwise";
    if (/(deactivate|disable)/.test(token)) return "bi bi-person-dash-fill";
    if (/(create|add|new|assign)/.test(token)) return "bi bi-plus-circle-fill";
    if (/(edit|update|modify)/.test(token)) return "bi bi-pencil-square";
    if (/(read|view|details|open)/.test(token)) return "bi bi-eye-fill";
    if (/(run|start|go)/.test(token)) return "bi bi-play-fill";
    if (/(export|download)/.test(token)) return "bi bi-download";
    if (/(import|upload)/.test(token)) return "bi bi-upload";
    return "bi bi-gear-fill";
  };
  const actionIcon = inferActionIcon();

  const baseActionClasses = ["sml-table-action-button", "text-start", "btn", "btn-sm"];
  if (!hasBypassUrl) {
    baseActionClasses.push("smlRB");
  }
  const className = authoredClass
    ? `${authoredClass} ${baseActionClasses.join(" ")}`.trim()
    : baseActionClasses.join(" ");

  if (hasBypassUrl) {
    let hrefValue = String(action.eventBypass || "#");
    Object.entries(row || {}).forEach(([key, value]) => {
      hrefValue = hrefValue.replaceAll(`{${key}}`, value === null || value === undefined ? "" : String(value));
    });

    return {
      n: "a",
      href: hrefValue,
      c: className,
      title: titleText,
      "aria-label": titleText,
      "data-href": hrefValue,
      "data-table": host.id || "",
      "data-action": actionName,
      "data-type": actionType,
      "data-html-class": authoredClass,
      "data-refresh-after-delete": action?.refreshAfterDelete ? "true" : "false",
      "data-row-id": rowId,
      "data-text": actionLabel,
      "data-icon": actionIcon,
      b: [
        { n: "i", c: `${actionIcon} me-1`, "aria-hidden": "true" },
        { n: "span", c: "d-none d-xl-inline", t: actionLabel }
      ]
    };
  }

  return {
    n: "sml-reactive-button",
    type: "button",
    role: "button",
    c: className,
    title: titleText,
    "aria-label": titleText,
    "data-api": buildExplicitActionApiUrl(host.dataset.api || "", action) || host.dataset.api || "",
    "data-api-mode": "table-action",
    "data-button-type": "command",
    "data-table": host.id || "",
    "data-action": actionName,
    "data-type": actionType,
    "data-html-class": authoredClass,
    "data-refresh-after-delete": action?.refreshAfterDelete ? "true" : "false",
    "data-row-id": rowId,
    "data-text": actionLabel,
    "data-icon": actionIcon,
    t: actionLabel
  };
}

/** Builds JML for a single table row (tr with td cells and optional action cell). */
function buildRowJml(host, row, rowIndex, columns, resolveColumns, resolveCellValue) {
  const recordDescription = getRecordDescription(host, row);
  const resolvedColumns = columns.length > 0 ? columns : resolveColumns(host, [row]);
  const modelKey = String(host?._tableConfig?.modelKey || "");

  const rowAttrs = {};
  const searchParts = [];
  if (row && typeof row === "object" && !Array.isArray(row)) {
    Object.entries(row).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      if (typeof value === "object") return;
      const textValue = decodeHtmlEntities(value);
      const dataName = toDataAttributeName(key);
      if (dataName) {
        rowAttrs[`data-${dataName}`] = textValue;
      }
      searchParts.push(textValue);
    });
  }

  const resolvedRowId = getModelKeyValue(row, modelKey);
  const rowId = resolvedRowId || String(rowIndex + 1);
  const rowSearch = searchParts.length > 0 ? searchParts.join(" ").trim() : String(row ?? "");

  const cells = resolvedColumns.map((column, columnIndex) => {
    const columnKey = getColumnKey(column);
    const columnTitle = typeof column === "object"
      ? decodeHtmlEntities(column.Title || column.title || columnKey)
      : decodeHtmlEntities(columnKey);
    const allowTruncate = readAllowTruncate(column);
    const imageFolderTagValue = resolveImageFolderTagValue(column);

    let value = resolveCellValue(row, column);
    if (value === null || value === undefined || value === "") {
      value = resolveFallbackCellValue(row, columnKey);
    }

    const titleText = getCellAccessibilityText(recordDescription, columnTitle, value);
    const contentNode = buildCellContentJml(value, imageFolderTagValue);

    return {
      n: "td",
      i: `${host.id}_r${rowIndex}_c${columnIndex}`,
      ...(allowTruncate ? { c: "text-truncate sml-table-cell-truncate", "data-allow-truncate": "true" } : {}),
      ...(columnTitle ? { "data-column-title": columnTitle } : {}),
      ...(columnKey ? { "data-field": columnKey } : {}),
      ...((typeof column === "object" && String(column.DataType || column.dataType || "").trim())
        ? { "data-column-data-type": String(column.DataType || column.dataType || "").trim() }
        : {}),
      ...(imageFolderTagValue ? { "data-image-folder": imageFolderTagValue } : {}),
      ...(titleText.trim().length > 0 ? { title: titleText, "aria-label": titleText } : {}),
      b: Array.isArray(contentNode) ? contentNode : [contentNode]
    };
  });

  const rowActions = getRowActions(host, row);
  if (rowActions.length > 0) {
    // Render ALL actions - local page-specific code (e.g., ccxo.js) handles visibility
    const actionNodes = rowActions
      .map((action, index) => buildActionNodeJml(host, action, row, index + 1, getRecordDescription(host, row)));

    if (actionNodes.length > 0) {
      const recordLabel = decodeHtmlEntities(recordDescription || String(row?.RecordDescription || row?.recordDescription || "Record"));
      const useDropdownOnly = actionNodes.length > 2;

      const actionCellBody = useDropdownOnly
        ? [
          {
            n: "div",
            c: "sml-table-action-flyout d-inline-block",
            b: [
              {
                n: "button",
                type: "button",
                c: "btn btn-primary text-start",
                "data-bs-toggle": "dropdown",
                "aria-expanded": "false",
                "aria-haspopup": "true",
                title: `Actions for ${recordLabel}`,
                "aria-label": `Actions for ${recordLabel}`,
                b: [
                  { n: "i", c: "bi bi-list-ul p-0 me-1", "aria-hidden": "true" },
                  { n: "span", c: "d-none d-xl-inline", t: "Actions" }
                ]
              },
              {
                n: "ul",
                c: "dropdown-menu px-2 mx-0 bg-dark sml-table-action-drop-menu",
                title: recordLabel,
                "aria-label": `Actions menu for ${recordLabel}`,
                b: [
                  { n: "li", c: "alert alert alert-info text-center fs-6 fw-bold li-header", t: "Record:", title: recordLabel },
                  {
                    n: "li",
                    c: "alert alert alert-primary text-center fs-6 fw-bold li-header-info",
                    title: recordLabel,
                    b: [
                      { n: "span", c: "bi bi-card-heading float-start", title: recordLabel },
                      { n: "span", c: "ms-1 text-truncate", t: recordLabel, title: recordLabel }
                    ]
                  },
                  ...actionNodes.map((actionNode) => {
                    const popupActionTitle = decodeHtmlEntities(
                      actionNode?.title
                      || actionNode?.["aria-label"]
                      || `Action for ${recordLabel}`
                    );
                    const popupActionNode = {
                      ...actionNode,
                      c: `${String(actionNode?.c || "")} d-block w-100`.trim(),
                      title: popupActionTitle,
                      "aria-label": popupActionTitle
                    };
                    return { n: "li", c: "w-100", b: [popupActionNode] };
                  })
                ]
              }
            ]
          }
        ]
        : actionNodes;

      cells.push({
        n: "td",
        c: "sml-table-action-col text-center text-nowrap",
        "data-sml-actions-decorated": "true",
        b: actionCellBody
      });
    }
  }

  return {
    n: "tr",
    i: `${host.id}Row${rowId}`,
    "data-row-id": rowId,
    "data-row-search": rowSearch,
    ...(recordDescription ? { "data-description": recordDescription } : {}),
    ...rowAttrs,
    b: cells
  };
}

/** Creates a row action element (sml-reactive-button or anchor). */
function buildActionElement(host, action, row, actionIndex, recordDescription) {
  const rowId = getModelKeyValue(row, String(host?._tableConfig?.modelKey || ""));
  const hasBypassUrl = !!action?.eventBypass;
  const actionType = String(action?.type || "");
  const actionName = String(action?.name || actionType || `Action${actionIndex}`);
  const actionLabel = resolveActionLabel(action, actionName || `Action${actionIndex}`);
  const titleText = getActionAccessibilityText(recordDescription || "Record", action?.title || actionLabel, actionLabel);
  const authoredClass = String(action?.htmlClass || "").trim();

  let actionElement;

  if (hasBypassUrl) {
    actionElement = document.createElement("a");
    let hrefValue = String(action.eventBypass || "#");
    Object.entries(row || {}).forEach(([key, value]) => {
      hrefValue = hrefValue.replaceAll(`{${key}}`, value === null || value === undefined ? "" : String(value));
    });
    actionElement.href = hrefValue;
    actionElement.dataset.href = hrefValue;
  } else {
    actionElement = document.createElement("sml-reactive-button");
    actionElement.dataset.api = buildExplicitActionApiUrl(host.dataset.api || "", action) || host.dataset.api || "";
    actionElement.dataset.apiMode = "table-action";
    actionElement.dataset.buttonType = "command";
  }

  actionElement.dataset.table = host.id || "";
  actionElement.dataset.action = actionName;
  actionElement.dataset.type = actionType;
  actionElement.dataset.htmlClass = authoredClass;
  actionElement.dataset.refreshAfterDelete = action?.refreshAfterDelete ? "true" : "false";
  actionElement.dataset.rowId = rowId;
  actionElement.dataset.text = actionLabel;
  if (action?.icon) {
    actionElement.dataset.icon = String(action.icon);
  }
  const baseActionClasses = ["sml-table-action-button", "text-start", "btn", "btn-sm"];
  if (!hasBypassUrl) {
    baseActionClasses.push("smlRB");
  }

  if (authoredClass) {
    actionElement.className = `${authoredClass} ${baseActionClasses.join(" ")}`.trim();
  } else {
    actionElement.className = baseActionClasses.join(" ");
  }
  actionElement.title = decodeHtmlEntities(titleText);
  actionElement.setAttribute("aria-label", decodeHtmlEntities(titleText));
  actionElement.textContent = actionLabel;

  return actionElement;
}

/** Checks if a row action should be rendered based on action filters. */
function shouldAddRowActionButton(action, row) {
  // Evaluate backend-defined filters instead of using global visibility hooks
  if (Array.isArray(action?.filters) && action.filters.length > 0) {
    for (const filter of action.filters) {
      if (!evaluateActionFilter(filter, row)) {
        return false;
      }
    }
  }
  return true;
}

/** Evaluates a single action filter against row data. */
function evaluateActionFilter(filter, row) {
  if (!filter || !row) return true;
  
  const rowValue = row[filter.property];
  const filterOp = String(filter._operator || "").trim().toLowerCase();
  const constant = filter.constant;
  
  // Evaluate the filter condition
  let conditionResult = false;
  
  if (filterOp === "isempty") {
    conditionResult = !rowValue || rowValue === "" || rowValue === null || rowValue === 0;
  } else if (filterOp === "isnotempty") {
    conditionResult = rowValue && rowValue !== "" && rowValue !== null && rowValue !== 0;
  } else if (filterOp === "equals") {
    conditionResult = String(rowValue).trim() === String(constant).trim();
  } else if (filterOp === "notequals") {
    conditionResult = String(rowValue).trim() !== String(constant).trim();
  } else {
    // Unknown operator - default to true (show)
    return true;
  }
  
  // Apply filter type logic: hideIfFalse = show only if condition is true
  if (filter.filterType === "hideIfFalse") {
    return conditionResult;
  }
  
  // Default: return condition result
  return conditionResult;
}

/** Appends action cell to table row with action elements. */
function appendActionCell(host, tableRow, row, recordDescription) {
  const rowActions = getRowActions(host, row);
  if (rowActions.length < 1) return;

  const actionCell = document.createElement("td");
  actionCell.classList.add("sml-table-action-col", "text-center", "text-nowrap");

  // Render ALL actions - local page-specific code handles visibility via DOM manipulation or hooks
  rowActions.forEach((action, index) => {
    actionCell.appendChild(buildActionElement(host, action, row, index + 1, recordDescription));
  });

  if (actionCell.children.length < 1) {
    return;
  }

  // Treat row-level action rendering as authoritative to avoid later ownership re-decoration churn.
  actionCell.dataset.smlActionsDecorated = "true";

  if (host?.classList.contains("sml-table-actions-left")) {
    tableRow.prepend(actionCell);
  } else {
    tableRow.appendChild(actionCell);
  }
}

/** Builds table header (thead) with column headers and optional action header. */
export function renderHeader(host, columns, getColumnTitle) {
  if (!Array.isArray(columns) || columns.length < 1) {
    return null;
  }

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  columns.forEach((column) => {
    const headerCell = document.createElement("th");
    const columnKey = getColumnKey(column);
    headerCell.scope = "col";
    if (columnKey) {
      headerCell.dataset.field = columnKey;
    }
    headerCell.textContent = decodeHtmlEntities(getColumnTitle(host, column));
    headerRow.appendChild(headerCell);
  });

  // Check if there are any row actions (without filtering by row data since we're building the header)
  const actions = resolveTableActions(host?._tableConfig);
  if (Array.isArray(actions) && actions.some((action) => action && action.type !== "Create" && action.type !== "Export")) {
    const actionHeader = document.createElement("th");
    actionHeader.scope = "col";
    actionHeader.textContent = "Actions";
    if (host?.classList.contains("sml-table-actions-left")) {
      headerRow.prepend(actionHeader);
    } else {
      headerRow.appendChild(actionHeader);
    }
  }

  thead.appendChild(headerRow);
  return thead;
}

/** Appends action links to a cell as comma or pipe-separated list. */
function appendActionLinks(cell, actions) {
  if (!Array.isArray(actions) || actions.length < 1) return false;

  actions.forEach((action, index) => {
    if (index > 0) {
      cell.appendChild(document.createTextNode(" | "));
    }

    const link = document.createElement("a");
    const label = resolveActionLabel(action);
    link.textContent = label;

    const className = isStyledActionLink(action)
      ? String(action?.htmlClass || "btn btn-sm btn-primary text-white").trim()
      : "";
    if (className) {
      link.className = `${className} sml-table-action-button text-start`.trim();
    }

    link.href = resolveActionHref(action);

    const title = action?.title || "";
    if (title) {
      const decodedTitle = decodeHtmlEntities(title);
      link.title = decodedTitle;
      link.setAttribute("aria-label", decodedTitle);
    }

    const iconClass = String(action?.icon || "").trim();
    if (iconClass) {
      link.textContent = "";
      link.insertAdjacentHTML("beforeend", jmlToHtml(buildActionLinkContentJml(action, label)));
    }

    cell.appendChild(link);
  });

  return true;
}

/** Appends structured cell content to DOM element (icon, image, text, link, etc.). */
function appendStructuredCellContent(cell, value) {
  const imageFolder = String(cell?.dataset?.imageFolder || "").trim();

  if (value === null || value === undefined) {
    cell.textContent = "";
    return;
  }

  if (Array.isArray(value)) {
    if (!appendActionLinks(cell, value)) {
      cell.textContent = decodeHtmlEntities(value.join(", "));
    }
    return;
  }

  if (typeof value !== "object") {
    if (isIconClassName(value)) {
      const icon = document.createElement("span");
      icon.className = normalizeIconClass(value);
      icon.setAttribute("aria-hidden", "true");
      cell.appendChild(icon);
      return;
    }

    if (imageFolder && isImageFileName(value)) {
      const imageSrc = buildImageSrcFromFolderAndFile(imageFolder, value);
      if (imageSrc) {
        const img = document.createElement("img");
        img.src = imageSrc;
        img.alt = String(value || "");
        img.style.maxHeight = "24px";
        cell.appendChild(img);
        return;
      }
    }

    cell.textContent = decodeHtmlEntities(value);
    return;
  }

  if (appendActionLinks(cell, value.actions)) {
    return;
  }

  if (value.iconClass) {
    const icon = document.createElement("span");
    icon.className = normalizeIconClass(value.iconClass);
    icon.setAttribute("aria-hidden", "true");
    cell.appendChild(icon);
    return;
  }

  if (value.imageSrc) {
    const img = document.createElement("img");
    img.src = String(value.imageSrc);
    img.alt = String(value.alt || "");
    img.style.maxHeight = String(value.maxHeight || "24px");
    cell.appendChild(img);
    return;
  }

  if (value.href || value.url) {
    const link = document.createElement("a");
    link.href = String(value.href || value.url);
    link.textContent = decodeHtmlEntities(value.text || value.label || value.href || value.url);
    if (value.title) {
      const decodedTitle = decodeHtmlEntities(value.title);
      link.title = decodedTitle;
      link.setAttribute("aria-label", decodedTitle);
    }
    cell.appendChild(link);
    return;
  }

  cell.textContent = decodeHtmlEntities(value.text || value.label || value.value || "");
}

/**
 * Builds and renders table body (tbody) from row array using JML conversion.
 * The body is parsed as one HTML string: inserting row by row costs a parse and a
 * custom element upgrade pass each time, which stalls large tables after the data arrives.
 */
export function renderBody(host, rows, columns, resolveColumns, resolveCellValue) {
  const tbody = document.createElement("tbody");
  const rowsJml = buildTableBodyJml(host, rows, columns, resolveColumns, resolveCellValue);
  const bodyHtml = rowsJml.map((rowJml) => jmlToHtml(rowJml)).join("");

  if (bodyHtml.length > 0) {
    tbody.insertAdjacentHTML("beforeend", bodyHtml);
  }

  return tbody;
}

/** Builds entire table body as JML, managing cells and action cell logic (inline vs dropdown). */
function buildTableBodyJml(host, rows, columns, resolveColumns, resolveCellValue) {
  return (rows || []).map((row, rowIndex) => {
    if (!row || typeof row !== "object") return null;

    const modelKey = String(host?._tableConfig?.modelKey || "");
    const resolvedRowId = getModelKeyValue(row, modelKey);
    const rowId = resolvedRowId || String(rowIndex + 1);
    const recordDescription = getRecordDescription(host, row);
    const recordLabel = decodeHtmlEntities(recordDescription || "Record");

    // Helper to resolve button classes based on action type/name
    const resolveActionVariantClass = (action, isDropdown = false) => {
      const authored = String(action?.htmlClass || "").trim();
      if (authored) {
        return isDropdown 
          ? `${authored} sml-table-action-button text-start d-block w-100 text-truncate btn btn-sm`.trim()
          : `${authored} sml-table-action-button text-start smlRB btn btn-sm`.trim();
      }

      const identifier = `${action?.type || ""} ${action?.name || ""}`.toLowerCase();
      let variant = "btn-primary";
      if (identifier.includes("create") || identifier.includes("add")) variant = "btn-success";
      else if (identifier.includes("read") || identifier.includes("view")) variant = "btn-secondary";
      else if (identifier.includes("update") || identifier.includes("edit")) variant = "btn-CornflowerBlue";
      else if (identifier.includes("delete") || identifier.includes("remove")) variant = "btn-danger";

      const base = isDropdown 
        ? "sml-table-action-button text-start smlRB btn btn-sm d-block w-100 text-truncate" 
        : "sml-table-action-button text-start smlRB btn btn-sm";
      return `${base} ${variant}`.trim();
    };

    // Build row data attributes
    const rowAttrs = {};
    const searchParts = [];
    Object.entries(row).forEach(([key, value]) => {
      if (value === null || value === undefined || typeof value === "object") return;
      const textValue = decodeHtmlEntities(value);
      const dataName = toDataAttributeName(key);
      if (dataName) {
        rowAttrs[`data-${dataName}`] = textValue;
      }
      searchParts.push(textValue);
    });

    const rowSearch = searchParts.length > 0 ? searchParts.join(" ").trim() : String(row ?? "");

    // Build data cells
    const resolvedColumns = columns.length > 0 ? columns : resolveColumns(host, [row]);
    const cellsJml = resolvedColumns.map((column, columnIndex) => {
      const columnKey = getColumnKey(column);
      if (!columnKey) return null;

      const columnTitle = typeof column === "object"
        ? decodeHtmlEntities(column.Title || column.title || columnKey)
        : decodeHtmlEntities(columnKey);
      const allowTruncate = readAllowTruncate(column);
      const imageFolderTagValue = resolveImageFolderTagValue(column);

      let value = resolveCellValue(row, column);
      if (value === null || value === undefined || value === "") {
        value = resolveFallbackCellValue(row, columnKey);
      }

      const titleText = getCellAccessibilityText(recordDescription, columnTitle, value);
      const contentNode = buildCellContentJml(value, imageFolderTagValue);

      return {
        n: "td",
        i: `${host.id}_r${rowIndex}_c${columnIndex}`,
        ...(allowTruncate ? { c: "text-truncate sml-table-cell-truncate", "data-allow-truncate": "true" } : {}),
        ...(columnTitle ? { "data-column-title": columnTitle } : {}),
        ...(columnKey ? { "data-field": columnKey } : {}),
        ...((typeof column === "object" && String(column.DataType || column.dataType || "").trim())
          ? { "data-column-data-type": String(column.DataType || column.dataType || "").trim() }
          : {}),
        ...(imageFolderTagValue ? { "data-image-folder": imageFolderTagValue } : {}),
        ...(titleText.trim().length > 0 ? { title: titleText, "aria-label": titleText } : {}),
        b: Array.isArray(contentNode) ? contentNode : [contentNode]
      };
    }).filter(Boolean);

    // Build action cell
    const rowActions = getRowActions(host, row);
    let actionCellJml = null;

    if (rowActions && rowActions.length > 0) {
      const actionCount = rowActions.length;
      
      if (actionCount <= 2) {
        // INLINE: direct buttons
        actionCellJml = {
          n: "td",
          c: "sml-table-action-col text-center text-nowrap",
          "data-sml-actions-decorated": "true",
          b: rowActions.map((action, idx) => {
            if (!action) return null;
            
            const actionName = String(action?.name || action?.type || `Action${idx + 1}`);
            const actionLabel = resolveActionLabel(action, actionName || `Action${idx + 1}`);
            const actionType = String(action?.type || "");
            const actionTitleBase = decodeHtmlEntities(action?.title || actionLabel || actionType || actionName || "Action");
            const titleText = getActionAccessibilityText(recordLabel, actionTitleBase, actionLabel);
            const hasBypassUrl = !!action?.eventBypass;
            const finalClasses = resolveActionVariantClass(action, false);

            if (hasBypassUrl) {
              let hrefValue = String(action.eventBypass || "#");
              Object.entries(row || {}).forEach(([k, v]) => {
                hrefValue = hrefValue.replaceAll(`{${k}}`, v === null || v === undefined ? "" : String(v));
              });
              const actionIcon = String(action?.icon || "").trim();
              return {
                n: "a",
                h: hrefValue,
                c: finalClasses,
                ttl: titleText,
                alab: titleText,
                b: buildActionLinkContentJml(action, actionLabel),
                ...(actionIcon ? { "data-icon": actionIcon } : {})
              };
            }

            const dataApi = buildExplicitActionApiUrl(host.dataset.api || "", action) || host.dataset.api || "";
            return {
              n: "sml-reactive-button",
              type: "button",
              role: "button",
              c: finalClasses,
              ttl: titleText,
              alab: titleText,
              "data-api": dataApi,
              "data-api-mode": "table-action",
              "data-button-type": "command",
              "data-table": host.id || "",
              "data-action": actionName,
              "data-type": actionType,
              "data-refresh-after-delete": action?.refreshAfterDelete ? "true" : "false",
              "data-row-id": rowId,
              "data-text": actionLabel,
              ...(action?.icon ? { "data-icon": String(action.icon).trim() } : {}),
              t: actionLabel
            };
          }).filter(Boolean)
        };
      } else {
        // DROPDOWN: menu structure
        actionCellJml = {
          n: "td",
          c: "sml-table-action-col text-center text-nowrap",
          "data-sml-actions-decorated": "true",
          b: [{
            n: "div",
            c: "sml-table-action-flyout d-inline-block",
            b: [
              {
                n: "button",
                type: "button",
                c: "btn btn-primary text-start",
                "data-bs-toggle": "dropdown",
                "aria-expanded": "false",
                "aria-haspopup": "true",
                ttl: `Actions for ${recordLabel}`,
                alab: `Actions for ${recordLabel}`,
                b: [
                  { n: "i", c: "bi bi-list-ul p-0 me-1", "aria-hidden": "true" },
                  { n: "span", c: "d-none d-xl-inline", t: "Actions" }
                ]
              },
              {
                n: "ul",
                c: "dropdown-menu px-2 mx-0 bg-dark sml-table-action-drop-menu",
                ttl: recordLabel,
                alab: `Actions menu for ${recordLabel}`,
                b: [
                  { n: "li", c: "alert alert alert-info text-center fs-6 fw-bold li-header", t: "Record:", ttl: recordLabel },
                  {
                    n: "li",
                    c: "alert alert alert-primary text-center fs-6 fw-bold li-header-info",
                    ttl: recordLabel,
                    b: [
                      { n: "span", c: "bi bi-card-heading float-start", ttl: recordLabel },
                      { n: "span", c: "ms-1 text-truncate", t: recordLabel, ttl: recordLabel }
                    ]
                  },
                  ...rowActions.map((action, idx) => {
                    if (!action) return null;
                    
                    const actionName = String(action?.name || action?.type || `Action${idx + 1}`);
                    const actionLabel = resolveActionLabel(action, actionName || `Action${idx + 1}`);
                    const actionType = String(action?.type || "");
                    const actionTitleBase = decodeHtmlEntities(action?.title || actionLabel || actionType || actionName || "Action");
                    const titleText = getActionAccessibilityText(recordLabel, actionTitleBase, actionLabel);
                    const hasBypassUrl = !!action?.eventBypass;
                    const finalClasses = resolveActionVariantClass(action, true);

                    let buttonJml;
                    if (hasBypassUrl) {
                      let hrefValue = String(action.eventBypass || "#");
                      Object.entries(row || {}).forEach(([k, v]) => {
                        hrefValue = hrefValue.replaceAll(`{${k}}`, v === null || v === undefined ? "" : String(v));
                      });
                      const actionIcon = String(action?.icon || "").trim();
                      buttonJml = {
                        n: "a",
                        h: hrefValue,
                        c: finalClasses,
                        ttl: titleText,
                        alab: titleText,
                        b: buildActionLinkContentJml(action, actionLabel),
                        ...(actionIcon ? { "data-icon": actionIcon } : {})
                      };
                    } else {
                      const dataApi = buildExplicitActionApiUrl(host.dataset.api || "", action) || host.dataset.api || "";
                      buttonJml = {
                        n: "sml-reactive-button",
                        type: "button",
                        role: "button",
                        c: finalClasses,
                        ttl: titleText,
                        alab: titleText,
                        "data-api": dataApi,
                        "data-api-mode": "table-action",
                        "data-button-type": "command",
                        "data-table": host.id || "",
                        "data-action": actionName,
                        "data-type": actionType,
                        "data-refresh-after-delete": action?.refreshAfterDelete ? "true" : "false",
                        "data-row-id": rowId,
                        "data-text": actionLabel,
                        ...(action?.icon ? { "data-icon": String(action.icon).trim() } : {}),
                        t: actionLabel
                      };
                    }
                    
                    return { n: "li", c: "w-100", b: [buttonJml] };
                  }).filter(Boolean)
                ]
              }
            ]
          }]
        };
      }
    }

    // Build complete row
    const completeRow = {
      n: "tr",
      i: `${host.id}Row${rowId}`,
      "data-row-id": rowId,
      "data-row-search": rowSearch,
      ...(recordDescription ? { "data-description": recordDescription } : {}),
      ...rowAttrs,
      b: host?.classList.contains("sml-table-actions-left")
        ? [...(actionCellJml ? [actionCellJml] : []), ...cellsJml]
        : [...cellsJml, ...(actionCellJml ? [actionCellJml] : [])]
    };
    
    return completeRow;
  }).filter(Boolean);
}
  // return (rows || []).map((row, rowIndex) => {
  //   if (!row || typeof row !== "object") return null;

  //   const modelKey = String(host?._tableConfig?.modelKey || "");
  //   const resolvedRowId = getModelKeyValue(row, modelKey);
  //   const rowId = resolvedRowId || String(rowIndex + 1);
  //   const recordDescription = getRecordDescription(host, row);
  //   const recordLabel = decodeHtmlEntities(recordDescription || "Record");

  //   // Build row data attributes
  //   const rowAttrs = {};
  //   const searchParts = [];
  //   Object.entries(row).forEach(([key, value]) => {
  //     if (value === null || value === undefined || typeof value === "object") return;
  //     const textValue = decodeHtmlEntities(value);
  //     const dataName = toDataAttributeName(key);
  //     if (dataName) {
  //       rowAttrs[`data-${dataName}`] = textValue;
  //     }
  //     searchParts.push(textValue);
  //   });

  //   const rowSearch = searchParts.length > 0 ? searchParts.join(" ").trim() : String(row ?? "");

  //   // Build data cells
  //   const resolvedColumns = columns.length > 0 ? columns : resolveColumns(host, [row]);
  //   const cellsJml = resolvedColumns.map((column, columnIndex) => {
  //     const columnKey = getColumnKey(column);
  //     if (!columnKey) return null;

  //     const columnTitle = typeof column === "object"
  //       ? decodeHtmlEntities(column.Title || column.title || columnKey)
  //       : decodeHtmlEntities(columnKey);
  //     const allowTruncate = readAllowTruncate(column);
  //     const imageFolderTagValue = resolveImageFolderTagValue(column);

  //     let value = resolveCellValue(row, column);
  //     if (value === null || value === undefined || value === "") {
  //       value = resolveFallbackCellValue(row, columnKey);
  //     }

  //     const titleText = getCellAccessibilityText(recordDescription, columnTitle, value);
  //     const contentNode = buildCellContentJml(value, imageFolderTagValue);

  //     return {
  //       n: "td",
  //       i: `${host.id}_r${rowIndex}_c${columnIndex}`,
  //       ...(allowTruncate ? { c: "text-truncate sml-table-cell-truncate", "data-allow-truncate": "true" } : {}),
  //       ...(columnTitle ? { "data-column-title": columnTitle } : {}),
  //       ...(columnKey ? { "data-field": columnKey } : {}),
  //       ...((typeof column === "object" && String(column.DataType || column.dataType || "").trim())
  //         ? { "data-column-data-type": String(column.DataType || column.dataType || "").trim() }
  //         : {}),
  //       ...(imageFolderTagValue ? { "data-image-folder": imageFolderTagValue } : {}),
  //       ...(titleText.trim().length > 0 ? { title: titleText, "aria-label": titleText } : {}),
  //       b: Array.isArray(contentNode) ? contentNode : [contentNode]
  //     };
  //   }).filter(Boolean);

  //   // Build action cell
  //   const rowActions = getRowActions(host, row);
  //   let actionCellJml = null;

  //   if (rowActions && rowActions.length > 0) {
  //     const actionCount = rowActions.length;
      
  //     if (actionCount <= 2) {
  //       // INLINE: direct buttons
  //       actionCellJml = {
  //         n: "td",
  //         c: "sml-table-action-col text-center text-nowrap",
  //         "data-sml-actions-decorated": "true",
  //         b: rowActions.map((action, idx) => {
  //           if (!action) return null;
            
  //           const actionName = String(action?.name || action?.type || `Action${idx + 1}`);
  //           const actionLabel = resolveActionLabel(action, actionName || `Action${idx + 1}`);
  //           const actionType = String(action?.type || "");
  //           const actionTitleBase = decodeHtmlEntities(action?.title || actionLabel || actionType || actionName || "Action");
  //           const titleText = getActionAccessibilityText(recordLabel, actionTitleBase, actionLabel);
  //           const hasBypassUrl = !!action?.eventBypass;
  //           const authoredClass = String(action?.htmlClass || "").trim();

  //           if (hasBypassUrl) {
  //             let hrefValue = String(action.eventBypass || "#");
  //             Object.entries(row || {}).forEach(([k, v]) => {
  //               hrefValue = hrefValue.replaceAll(`{${k}}`, v === null || v === undefined ? "" : String(v));
  //             });
  //             const actionClass = authoredClass
  //               ? `${authoredClass} sml-table-action-button text-start btn btn-sm`.trim()
  //               : "sml-table-action-button text-start btn btn-sm btn-primary text-white";
  //             const actionIcon = String(action?.icon || "").trim();
  //             return {
  //               n: "a",
  //               h: hrefValue,
  //               c: actionClass,
  //               ttl: titleText,
  //               alab: titleText,
  //               b: buildActionLinkContentJml(action, actionLabel),
  //               ...(actionIcon ? { "data-icon": actionIcon } : {})
  //             };
  //           }

  //           const dataApi = buildExplicitActionApiUrl(host.dataset.api || "", action) || host.dataset.api || "";
  //           const baseClasses = "sml-table-action-button text-start smlRB btn btn-sm";
  //           const textWhiteClass = authoredClass.includes('btn-primary') ? 'text-white' : '';
  //           const finalClasses = authoredClass ? `${authoredClass} ${baseClasses} ${textWhiteClass}`.trim() : baseClasses;
  //           return {
  //             n: "sml-reactive-button",
  //             type: "button",
  //             role: "button",
  //             c: finalClasses,
  //             ttl: titleText,
  //             alab: titleText,
  //             "data-api": dataApi,
  //             "data-api-mode": "table-action",
  //             "data-button-type": "command",
  //             "data-table": host.id || "",
  //             "data-action": actionName,
  //             "data-type": actionType,
  //             "data-refresh-after-delete": action?.refreshAfterDelete ? "true" : "false",
  //             "data-row-id": rowId,
  //             "data-text": actionLabel,
  //             ...(action?.icon ? { "data-icon": String(action.icon).trim() } : {}),
  //             t: actionLabel
  //           };
  //         }).filter(Boolean)
  //       };
  //     } else {
  //       // DROPDOWN: menu structure
  //       actionCellJml = {
  //         n: "td",
  //         c: "sml-table-action-col text-center text-nowrap",
  //         "data-sml-actions-decorated": "true",
  //         b: [{
  //           n: "div",
  //           c: "sml-table-action-flyout d-inline-block",
  //           b: [
  //             {
  //               n: "button",
  //               type: "button",
  //               c: "btn btn-primary text-start",
  //               "data-bs-toggle": "dropdown",
  //               "aria-expanded": "false",
  //               "aria-haspopup": "true",
  //               ttl: `Actions for ${recordLabel}`,
  //               alab: `Actions for ${recordLabel}`,
  //               b: [
  //                 { n: "i", c: "bi bi-list-ul p-0 me-1", "aria-hidden": "true" },
  //                 { n: "span", c: "d-none d-xl-inline", t: "Actions" }
  //               ]
  //             },
  //             {
  //               n: "ul",
  //               c: "dropdown-menu px-2 mx-0 bg-dark sml-table-action-drop-menu",
  //               ttl: recordLabel,
  //               alab: `Actions menu for ${recordLabel}`,
  //               b: [
  //                 { n: "li", c: "alert alert alert-info text-center fs-6 fw-bold li-header", t: "Record:", ttl: recordLabel },
  //                 {
  //                   n: "li",
  //                   c: "alert alert alert-primary text-center fs-6 fw-bold li-header-info",
  //                   ttl: recordLabel,
  //                   b: [
  //                     { n: "span", c: "bi bi-card-heading float-start", ttl: recordLabel },
  //                     { n: "span", c: "ms-1 text-truncate", t: recordLabel, ttl: recordLabel }
  //                   ]
  //                 },
  //                 ...rowActions.map((action, idx) => {
  //                   if (!action) return null;
                    
  //                   const actionName = String(action?.name || action?.type || `Action${idx + 1}`);
  //                   const actionLabel = resolveActionLabel(action, actionName || `Action${idx + 1}`);
  //                   const actionType = String(action?.type || "");
  //                   const actionTitleBase = decodeHtmlEntities(action?.title || actionLabel || actionType || actionName || "Action");
  //                   const titleText = getActionAccessibilityText(recordLabel, actionTitleBase, actionLabel);
  //                   const hasBypassUrl = !!action?.eventBypass;
  //                   const authoredClass = String(action?.htmlClass || "").trim();

  //                   let buttonJml;
  //                   if (hasBypassUrl) {
  //                     let hrefValue = String(action.eventBypass || "#");
  //                     Object.entries(row || {}).forEach(([k, v]) => {
  //                       hrefValue = hrefValue.replaceAll(`{${k}}`, v === null || v === undefined ? "" : String(v));
  //                     });
  //                     const actionClass = authoredClass
  //                       ? `${authoredClass} sml-table-action-button text-start d-block w-100 text-truncate btn btn-sm`.trim()
  //                       : "sml-table-action-button text-start d-block w-100 text-truncate btn btn-sm btn-primary text-white";
  //                     const actionIcon = String(action?.icon || "").trim();
  //                     buttonJml = {
  //                       n: "a",
  //                       h: hrefValue,
  //                       c: actionClass,
  //                       ttl: titleText,
  //                       alab: titleText,
  //                       b: buildActionLinkContentJml(action, actionLabel),
  //                       ...(actionIcon ? { "data-icon": actionIcon } : {})
  //                     };
  //                   } else {
  //                     const dataApi = buildExplicitActionApiUrl(host.dataset.api || "", action) || host.dataset.api || "";
  //                     const baseClasses = "sml-table-action-button text-start smlRB btn btn-sm btn-outline-secondary d-block w-100 text-truncate";
  //                     const finalClasses = authoredClass ? `${authoredClass} d-block w-100 text-truncate ${authoredClass.includes('btn-primary') ? 'text-white' : ''}`.trim() : baseClasses;
  //                     buttonJml = {
  //                       n: "sml-reactive-button",
  //                       type: "button",
  //                       role: "button",
  //                       c: finalClasses,
  //                       ttl: titleText,
  //                       alab: titleText,
  //                       "data-api": dataApi,
  //                       "data-api-mode": "table-action",
  //                       "data-button-type": "command",
  //                       "data-table": host.id || "",
  //                       "data-action": actionName,
  //                       "data-type": actionType,
  //                       "data-refresh-after-delete": action?.refreshAfterDelete ? "true" : "false",
  //                       "data-row-id": rowId,
  //                       "data-text": actionLabel,
  //                       ...(action?.icon ? { "data-icon": String(action.icon).trim() } : {}),
  //                       t: actionLabel
  //                     };
  //                   }
                    
  //                   return { n: "li", c: "w-100", b: [buttonJml] };
  //                 }).filter(Boolean)
  //               ]
  //             }
  //           ]
  //         }]
  //       };
  //     }
  //   }

  //   // Build complete row
  //   const completeRow = {
  //     n: "tr",
  //     i: `${host.id}Row${rowId}`,
  //     "data-row-id": rowId,
  //     "data-row-search": rowSearch,
  //     ...(recordDescription ? { "data-description": recordDescription } : {}),
  //     ...rowAttrs,
  //     b: host?.classList.contains("sml-table-actions-left")
  //       ? [...(actionCellJml ? [actionCellJml] : []), ...cellsJml]
  //       : [...cellsJml, ...(actionCellJml ? [actionCellJml] : [])]
  //   };
    
  //   return completeRow;
  // }).filter(Boolean);
//}
