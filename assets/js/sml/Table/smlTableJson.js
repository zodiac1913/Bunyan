import { asFieldNotationString } from '../smlUtils.js';
import { resolveTableActions } from './smlTableActions.js';
import { renderBody, renderHeader } from './smlTableRow.js';

function tryParseJson(rawValue) {
  if (typeof rawValue !== "string" || rawValue.trim() === "") return null;

  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

function normalizePayload(payload) {
  if (typeof payload === "string") {
    return normalizeTablePayload(tryParseJson(payload));
  }

  return normalizeTablePayload(payload ?? null);
}

export function normalizeTablePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload ?? null;
  }

  const normalizedPayload = { ...payload };
  const sourceQuery = normalizedPayload.query || normalizedPayload.Query;
  const hasQuery = sourceQuery && typeof sourceQuery === "object" && !Array.isArray(sourceQuery);
  const hasActions = Array.isArray(normalizedPayload.actions) || Array.isArray(normalizedPayload.Actions);

  if (hasQuery || hasActions) {
    const query = hasQuery ? { ...sourceQuery } : {};
    const resolvedActions = resolveTableActions(normalizedPayload);

    query.queryActions = resolvedActions;
    normalizedPayload.query = query;
    normalizedPayload.actions = resolvedActions;
    normalizedPayload.modelKey = normalizedPayload.modelKey || normalizedPayload.ModelKey || query.tableKey || query.TableKey || "";
    normalizedPayload.pageLengthMenu = normalizedPayload.pageLengthMenu || normalizedPayload.PageLengthMenu || query.tablePageLengthMenu || query.TablePageLengthMenu || "10,50,100";
    normalizedPayload.hasSort = normalizedPayload.hasSort ?? true;
    normalizedPayload.columns = normalizedPayload.columns || normalizedPayload.Columns || query.displayColumns || query.DisplayColumns || [];
    normalizedPayload.hasCounts = normalizedPayload.hasCounts ?? normalizedPayload.HasCounts ?? query.tableHasCounts ?? query.TableHasCounts ?? false;
    normalizedPayload.hasSearch = normalizedPayload.hasSearch ?? normalizedPayload.HasSearch ?? query.tableHasQuickSearch ?? query.TableHasQuickSearch ?? true;
    normalizedPayload.tableHasQuickSearch = normalizedPayload.tableHasQuickSearch ?? query.tableHasQuickSearch ?? query.TableHasQuickSearch ?? true;
    normalizedPayload.hasPagination = normalizedPayload.hasPagination ?? normalizedPayload.HasPagination ?? query.tableHasPagination ?? query.TableHasPagination ?? false;
    normalizedPayload.forms = normalizedPayload.forms || normalizedPayload.Forms || query.forms || query.Forms || [];
  }

  if ((!normalizedPayload.list || normalizedPayload.list.length < 1) && normalizedPayload.listData) {
    normalizedPayload.list = normalizedPayload.listData;
  }

  if ((!normalizedPayload.rows || normalizedPayload.rows.length < 1) && normalizedPayload.list) {
    normalizedPayload.rows = normalizedPayload.list;
  }

  if ((!normalizedPayload.rows || normalizedPayload.rows.length < 1) && normalizedPayload.data) {
    normalizedPayload.rows = normalizedPayload.data;
  }

  return normalizedPayload;
}

export function readJsonPayload(host) {
  const rawValue = host.dataset.jsonData || host.dataset.json || "";
  if (!rawValue || rawValue.trim() === "") {
    return null;
  }

  const parsed = tryParseJson(rawValue);
  if (parsed === null) {
    console.warn("smlTable: Unable to parse JSON data.");
  }

  return parsed;
}

export function extractRowsFromPayload(payload) {
  const normalizedPayload = normalizePayload(payload);
  if (!normalizedPayload) return null;

  if (Array.isArray(normalizedPayload)) return normalizedPayload;
  if (Array.isArray(normalizedPayload.rows)) return normalizedPayload.rows;
  if (Array.isArray(normalizedPayload.data)) return normalizedPayload.data;
  if (Array.isArray(normalizedPayload.results)) return normalizedPayload.results;
  if (Array.isArray(normalizedPayload.list)) return normalizedPayload.list;
  if (Array.isArray(normalizedPayload.listData)) return normalizedPayload.listData;

  const stringPayloadKeys = ["rows", "data", "results", "list", "listData"];
  for (const key of stringPayloadKeys) {
    const parsedRows = tryParseJson(normalizedPayload[key]);
    if (Array.isArray(parsedRows)) return parsedRows;
  }

  return null;
}

export function mergeTablePayload(primaryPayload, fallbackPayload) {
  const primary = normalizePayload(primaryPayload);
  const fallback = normalizePayload(fallbackPayload);

  const primaryRows = extractRowsFromPayload(primary) || [];
  const fallbackRows = extractRowsFromPayload(fallback) || [];

  let mergedRows = primaryRows;

  const canMergeRows =
    primaryRows.length > 0
    && primaryRows.length === fallbackRows.length
    && primaryRows.every((row, index) =>
      row && fallbackRows[index]
      && !Array.isArray(row)
      && !Array.isArray(fallbackRows[index])
      && typeof row === "object"
      && typeof fallbackRows[index] === "object"
    );

  if (canMergeRows) {
    mergedRows = fallbackRows.map((fallbackRow, index) => ({
      ...fallbackRow,
      ...primaryRows[index]
    }));
  } else if (primaryRows.length < 1) {
    mergedRows = fallbackRows;
  }

  if (primary && typeof primary === "object" && !Array.isArray(primary)) {
    return {
      ...(fallback && typeof fallback === "object" && !Array.isArray(fallback) ? fallback : {}),
      ...primary,
      rows: mergedRows
    };
  }

  if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
    return {
      ...fallback,
      rows: mergedRows
    };
  }

  return mergedRows;
}

export function readJsonRows(host) {
  return extractRowsFromPayload(readJsonPayload(host));
}

export function camelCase(str) {
  return String(str || "").replace(/[-_](.)/g, (_, char) => char.toUpperCase());
}

export function prettyColumnName(columnKey) {
  if (!columnKey) return "";
  return String(columnKey)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function getColumnKey(column) {
  if (!column) return "";

  if (typeof column === "string") return column.trim();
  if (typeof column !== "object") return "";

  const candidates = [
    column.field,
    column.Field,
    column.fieldName,
    column.FieldName,
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

export function getColumnTitle(host, column) {
  if (column && typeof column === "object") {
    const candidates = [column.Title, column.title, column.Label, column.label];
    const match = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
    if (match) return match.trim();
  }

  return prettyColumnName(getColumnKey(column));
}

function getConfiguredColumns(host) {
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

function shouldOverrideServerColumns(host) {
  const token = String(host?.dataset?.overrideServer || "").trim().toLowerCase();
  return token === "true" || token === "1" || token === "yes";
}

function resolveMetadataOnlyColumns(host) {
  const metadataColumns = new Set();

  const modelKey = String(
    host?._tableConfig?.modelKey
    || host?._tableConfig?.ModelKey
    || host?._tableConfig?.query?.tableKey
    || host?._tableConfig?.query?.TableKey
    || host?._tableConfig?.Query?.tableKey
    || host?._tableConfig?.Query?.TableKey
    || ""
  ).trim();
  if (modelKey) {
    metadataColumns.add(modelKey.toLowerCase());
  }

  const additionalFields =
    host?._tableConfig?.query?.additionalFields
    || host?._tableConfig?.query?.AdditionalFields
    || host?._tableConfig?.Query?.additionalFields
    || host?._tableConfig?.Query?.AdditionalFields
    || host?._tableConfig?.additionalFields
    || host?._tableConfig?.AdditionalFields;
  if (Array.isArray(additionalFields)) {
    additionalFields
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .forEach((value) => metadataColumns.add(value.trim().toLowerCase()));
  }

  const textIdentifier = String(
    host?._tableConfig?.textIdentifier
    || host?._tableConfig?.TextIdentifier
    || host?.dataset?.textIdentifier
    || "RecordDescription"
  );
  textIdentifier
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => metadataColumns.add(value.toLowerCase()));
  metadataColumns.add("recorddescription");

  return metadataColumns;
}

export function resolveColumns(host, rows) {
  const configuredColumns = getConfiguredColumns(host);
  const hasConfiguredColumns = configuredColumns.length > 0;
  const hasApiSource = !!String(host?.dataset?.searchApi || host?.dataset?.api || "").trim();
  const requestedColumns = String(host?.dataset?.columns || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const hasRequestedColumns = requestedColumns.length > 0;
  const overrideServer = shouldOverrideServerColumns(host);

  // Server-defined columns are the default source of truth.
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

  if (hasConfiguredColumns) {
    return configuredColumns;
  }

  // API-backed tables must wait for server-defined display columns.
  if (hasApiSource) {
    return [];
  }

  const firstRow = rows?.[0];
  if (!firstRow) {
    return [];
  }

  if (Array.isArray(firstRow)) {
    return firstRow.map((_, index) => String(index));
  }

  if (typeof firstRow === "object") {
    const metadataColumns = resolveMetadataOnlyColumns(host);
    return Object.keys(firstRow).filter((columnKey) => !metadataColumns.has(String(columnKey || "").trim().toLowerCase()));
  }

  return [];
}

export function resolveCellValue(row, columnKey) {
  const resolvedColumnKey = getColumnKey(columnKey);

  if (Array.isArray(row)) {
    const columnIndex = Number.parseInt(resolvedColumnKey, 10);
    return row[columnIndex] ?? "";
  }

  if (row && typeof row === "object") {
    if (Object.hasOwn(row, resolvedColumnKey)) {
      return row[resolvedColumnKey] ?? "";
    }

    // Handle typical CC/SML key-shape drift: PascalCase, camelCase, snake_case and case-only differences.
    const fieldNotation = asFieldNotationString(resolvedColumnKey);
    if (Object.hasOwn(row, fieldNotation)) {
      return row[fieldNotation] ?? "";
    }

    const camelKey = camelCase(resolvedColumnKey);
    if (Object.hasOwn(row, camelKey)) {
      return row[camelKey] ?? "";
    }

    const normalizedKey = String(resolvedColumnKey || "").replace(/[-_\s]+/g, "").toLowerCase();
    if (normalizedKey.length > 0) {
      const rowKey = Object.keys(row).find((key) =>
        String(key || "").replace(/[-_\s]+/g, "").toLowerCase() === normalizedKey
      );

      if (rowKey && Object.hasOwn(row, rowKey)) {
        return row[rowKey] ?? "";
      }
    }
  }

  return "";
}

export function renderTableFromRows(host, rows, options) {
  delete host.dataset.smlChromeWired;
  host.innerHTML = "";

  const table = document.createElement("table");
  options.decorateTableElement(table);

  const columns = resolveColumns(host, rows);
  const thead = renderHeader(host, columns, getColumnTitle);
  if (thead) {
    table.appendChild(thead);
  }

  const tbody = renderBody(host, rows, columns, resolveColumns, resolveCellValue);

  table.appendChild(tbody);
  host.appendChild(table);
  host._table = table;

  options.applyOwnership(host, table);
}
