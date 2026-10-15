//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! Jesu, Juva !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//     *          |¯¯¯¯¯¯¯|       †          _____          ↑
//   _____        |  o o o |      /|\      (     )         ↑
//  /  ^  \       | o o o o |    / | \     (       )       / \ 
// /_/___\_\      |_____________|    /  |  \     (]¯¯¯[)      /   \ 
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
/* eslint-disable no-undef */
/* eslint-disable no-console */
/*!
 * smlTable --- sml Table hydrator for HTML tables and JSON model lists
 * Public Domain Licensed Copyright Law of the United States of America, Section 105 (https://www.copyright.gov/title17/92chap1.html#105)
 * Published by: Dominic Roche of OIT/IUSG/DASM on 5/18/2026
 * @class smlTable
 * @extends {HTMLElement}
 */
// תהילתו. לא שלי
import { apiPost, apiPostDirect, clip, functionCall, guid, isSmlClientOwned, jmlToHtml, modalBox, receiptCheckGood, smlClientOrFetch, unobtrusiveWait, unobtrusiveWaitOff } from '../smlUtils.js';
import { smlModalConfigOpen } from '../smlModal.js';
import { resolveTableActions } from './smlTableActions.js';
import { applyTableOwnership, applyTotalLoadConfigToHost } from './smlTableOwn.js';
import { hydrateTableCells as hydrateSmlTableCells } from './smlTableCell.js';
import smlForm from '../Form/smlForm.js';
import { applyRptSecurityToPayload } from '../Reporting/smlReportingModelUtils.js';
import {
  camelCase as jsonCamelCase,
  prettyColumnName as jsonPrettyColumnName,
  getColumnKey as jsonGetColumnKey,
  readJsonPayload as readSmlJsonPayload,
  readJsonRows as readSmlJsonRows,
  renderTableFromRows,
  resolveCellValue as jsonResolveCellValue,
  resolveColumns as jsonResolveColumns,
  extractRowsFromPayload,
  mergeTablePayload,
  normalizeTablePayload
} from './smlTableJson.js';

/** Opens an SML modal with the supplied content, title, and originating element. */
function openSmlModal(content, title, origin) {
  void smlModalConfigOpen({
    titleText: title,
    messageText: typeof content === "string" || typeof content === "number" ? String(content) : "",
    bodyJML: content && typeof content === "object" ? content : undefined,
    origin,
    addCloseButton: true,
    shellStyle: "width: fit-content; max-width: min(20vw, calc(100vw - 2rem));",
    bodyStyle: "white-space: normal; overflow-wrap: anywhere; word-break: break-word;"
  });
}

/** Selects the most useful displayable message from an action result. */
function resolveActionResultModalContent(actionResult) {
  if (!actionResult || typeof actionResult !== "object" || Array.isArray(actionResult)) {
    return actionResult;
  }

  const preferredMessage = actionResult.message
    || actionResult.successMessage
    || actionResult.resultMessage
    || actionResult.description
    || actionResult.detail;

  if (typeof preferredMessage === "string" && preferredMessage.trim()) {
    return preferredMessage;
  }

  return actionResult;
}

/** Normalizes an action type or name to a supported CRUD action category. */
function normalizeActionType(actionType) {
  const token = String(actionType || "").toLowerCase().trim();
  if (!token) return "";
  if (["read", "view"].includes(token) || token.includes("read") || token.includes("view")) return "read";
  if (["delete", "remove", "deassign", "unassign"].includes(token) || token.includes("delete") || token.includes("remove") || token.includes("deassign") || token.includes("unassign")) return "delete";
  if (["create", "add"].includes(token) || token.includes("create") || token.includes("add")) return "create";
  if (["import", "importemployee"].includes(token) || token.includes("import")) return "create";
  if (["update", "edit"].includes(token) || token.includes("update") || token.includes("edit")) return "update";
  return "update";
}

/** Determines whether a successful action should refresh the table data. */
function shouldRefreshAfterActionSuccess(actionType, actionResult) {
  if (actionResult?.shouldRefreshTable === true
    || actionResult?.refreshTable === true
    || actionResult?.reloadTable === true
    || actionResult?.refresh === true) {
    return true;
  }

  return normalizeActionType(actionType) !== "read";
}

function cloneJsonCompatible(value) {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

// Retained because several existing endpoints still expose the reporting-search suffix.
const SEARCH_ENDPOINT_SUFFIX = /(SimpleSearch|RptReportingSearch|TableRows)$/i;
const LOADING_PLACEHOLDER_SELECTOR = ".sml-table-loading-placeholder";

class smlTable extends HTMLElement {
  /** Initializes the table component's hydration, data, API, and loading state. */
  constructor() {
    super();
    let smlt = this;
    smlt._hydrated = false;
    smlt._initScheduled = false;
    smlt._initAttempts = 0;
    smlt._table = null;
    smlt._rowsData = [];
    smlt._tableConfig = null;
    smlt._apiLoading = false;
    smlt._apiAbortController = null;
    smlt._apiRequestSerial = 0;
    smlt._suppressAttributeHydrate = false;
    smlt._bootstrapping = true;
    smlt._pendingActionKey = "";
    smlt._apiLoadPromise = null;
    smlt._loaderId = "";
    smlt._chunkChromeRefreshPending = false;
  }

  /** Aborts any pending API request and clears the component's loading state. */
  cancelPendingApiLoad() {
    let smlt = this;
    if (smlt._apiAbortController) {
      try {
        smlt._apiAbortController.abort();
      } catch {
        // no-op
      }
      smlt._apiAbortController = null;
    }
    smlt._apiLoading = false;
  }

  static observedAttributes = ["data-json-data", "data-json", "data-table-class", "data-columns", "data-api", "data-search-api", "data-api-forward", "data-api-body"];

  /** Reports whether a parent reporting component owns this table's data loading. */
  isReportingManaged() {
    let smlt = this;
    const explicit = String(smlt.dataset.reportingManaged || "").trim().toLowerCase();
    if (explicit === "true" || explicit === "1" || explicit === "yes") return true;
    if (explicit === "false" || explicit === "0" || explicit === "no") return false;

    const parent = smlt.parentElement;
    if (!parent) return false;
    return !!parent.querySelector("sml-reporting, cc-reporting");
  }

  /** True when this table waits on sml-engine instead of talking to the server itself. */
  isClientOwned() {
    return isSmlClientOwned(this);
  }

  /** Schedules table initialization when the custom element is connected to the document. */
  connectedCallback() {
    let smlt = this;
    if (smlt._hydrated || smlt._initScheduled) return;
    smlt._initScheduled = true;
    smlt._bootstrapping = true;
    smlt.ensureLoaderIdentity();
    globalThis[smlt.id] = smlt;
    smlt.ensureLoadingState();
    queueMicrotask(() => {
      smlt.tryInitialize();
      smlt._bootstrapping = false;
    });
  }

  /** Ensures the table and its loading indicator have stable unique identifiers. */
  ensureLoaderIdentity() {
    let smlt = this;
    smlt.id = smlt.id || "smlt" + clip(guid(true), 15);
    if (!String(smlt._loaderId || "").trim()) {
      smlt._loaderId = `${smlt.id}LoadingState`;
    }
  }

  /** Returns whether this component currently contains a rendered table element. */
  hasRenderedTable() {
    let smlt = this;
    return !!(smlt.querySelector("table") || (smlt.tagName === "TABLE" ? smlt : null));
  }

  /** Adds the initial loading placeholder when one is not already present. */
  addLoadingPlaceholder() {
    let smlt = this;
    if (smlt.querySelector(LOADING_PLACEHOLDER_SELECTOR)) return;

    const loadingJml = {
      n: "div",
      i: smlt._loaderId,
      c: "sml-table-loading-placeholder alert alert-warning my-2",
      role: "status",
      "aria-live": "polite",
      b: [
        {
          c: "progress",
          s: "height: 60px;",
          b: [
            {
              c: "progress-bar progress-bar-striped progress-bar-animated progress-bg-warning text-dark",
              role: "progressbar",
              "aria-valuemin": "0",
              "aria-valuemax": "100",
              "aria-valuenow": "100",
              style: "width:100%",
              b: [
                { c: "text-white text-center h2", t: "Table Loading Please Wait" }
              ]
            }
          ]
        }
      ]
    };

    smlt.replaceChildren();
    smlt.insertAdjacentHTML("beforeend", jmlToHtml(loadingJml));
  }

  /** Ensures an unrendered table displays its loading state. */
  ensureLoadingState() {
    let smlt = this;
    smlt.ensureLoaderIdentity();
    if (smlt.hasRenderedTable()) return;

    const existingLoader = smlt.querySelector(`#${smlt._loaderId}`);
    if (existingLoader) return;

    smlt.addLoadingPlaceholder();
  }

  /** Attempts hydration until table markup or row data becomes available. */
  tryInitialize() {
    let smlt = this;
    if (!smlt.isConnected || smlt._hydrated) return;

    smlt.hydrateOrRender();
    smlt.own();

    const hasTable = !!(smlt.querySelector("table") || (smlt.tagName === "TABLE" ? smlt : null));
    const hasRows = Array.isArray(smlt.readJsonRows()) && smlt.readJsonRows().length > 0;

    if (hasTable || hasRows) {
      smlt._hydrated = true;
      return;
    }

    smlt._initAttempts += 1;
    if (smlt._initAttempts < 10) {
      requestAnimationFrame(() => smlt.tryInitialize());
      return;
    }

    // Give up retries but allow attribute changes to trigger future hydration attempts.
    smlt._initScheduled = false;
  }


  /** Applies table-owned controls and behavior to the current table element. */
  own(){
    let smlt = this;
    const existingTable = smlt.querySelector("table") || (smlt.tagName === "TABLE" ? smlt : null);
    applyTableOwnership(smlt, existingTable);
  }

  /** Tracks chunk-loading progress and refreshes table chrome only when useful. */
  setChunkLoadingState(isLoading, loadedRows = 0) {
    let smlt = this;
    const normalizedRows = Number.parseInt(String(loadedRows || 0), 10) || 0;
    const previousLoading = ["true", "1", "yes"].includes(String(smlt.dataset.chunkLoading || "").toLowerCase());
    const previousRows = Number.parseInt(String(smlt.dataset.chunkLoadedRows || "0"), 10) || 0;

    if (isLoading) {
      smlt.dataset.chunkLoading = "true";
      smlt.dataset.chunkLoadedRows = String(normalizedRows);
    } else {
      delete smlt.dataset.chunkLoading;
      delete smlt.dataset.chunkLoadedRows;
    }

    // Avoid forcing a full table chrome rebuild on every chunk.
    const loadingChanged = previousLoading !== !!isLoading;
    const rowsChangedEnough = Math.abs(normalizedRows - previousRows) >= 250;
    if (loadingChanged || !isLoading || rowsChangedEnough) {
      if (!smlt._chunkChromeRefreshPending) {
        smlt._chunkChromeRefreshPending = true;
        smlt._chunkChromeRefreshFrame = requestAnimationFrame(() => {
          smlt._chunkChromeRefreshFrame = null;
          smlt._chunkChromeRefreshPending = false;
          smlt.own();
        });
      }
    }
  }

  /** Resolves column keys from the active configuration or existing table headers. */
  getExistingTableColumnKeys(table) {
    let smlt = this;
    let configuredColumns = [];

    if (Array.isArray(smlt?._tableConfig?.columns) && smlt._tableConfig.columns.length > 0) {
      configuredColumns = smlt._tableConfig.columns;
    } else if (Array.isArray(smlt?._tableConfig?.query?.displayColumns) && smlt._tableConfig.query.displayColumns.length > 0) {
      configuredColumns = smlt._tableConfig.query.displayColumns;
    }

    if (configuredColumns.length > 0) {
      return configuredColumns.map((column) => jsonGetColumnKey(column));
    }

    const headerCells = Array.from(table.querySelectorAll("thead th"));
    return headerCells.map((headerCell) => String(headerCell?.dataset?.field || "").trim());
  }

  /** Fills empty existing cells with matching values from the supplied row data. */
  backfillExistingTableCells(table, rows) {
    let smlt = this;
    if (!table || !Array.isArray(rows) || rows.length < 1) return;

    const tableRows = Array.from(table.querySelectorAll("tbody tr"));
    if (tableRows.length < 1) return;

    const columnKeys = smlt.getExistingTableColumnKeys(table);

    tableRows.forEach((tableRow, rowIndex) => {
      const row = rows[rowIndex];
      if (!row) return;

      const cells = Array.from(tableRow.querySelectorAll("td"));
      cells.forEach((cell, columnIndex) => {
        if (!cell) return;

        const existingText = String(cell.textContent || "").trim();
        if (existingText.length > 0) return;

        const fieldKey = String(cell.dataset.field || columnKeys[columnIndex] || "").trim();
        if (!fieldKey) return;

        const value = smlt.resolveCellValue(row, fieldKey);
        if (value === null || value === undefined || value === "") return;
        if (Array.isArray(value) || typeof value === "object") return;

        cell.dataset.field = fieldKey;
        cell.dataset.text = String(value);
        cell.textContent = String(value);
      });
    });
  }

  /** Rehydrates the connected component when a supported data attribute changes. */
  attributeChangedCallback(name, oldValue, newValue) {
    let smlt = this;
    if (oldValue === newValue) return;
    if (!smlt.isConnected || smlt._bootstrapping) return;
    if (smlt._suppressAttributeHydrate) return;

    if (name === "data-json-data" || name === "data-json" || name === "data-table-class" || name === "data-columns"
      || name === "data-api" || name === "data-search-api" || name === "data-api-forward" || name === "data-api-body") {
      smlt._hydrated = false;
      smlt._rowsData = [];
      smlt._tableConfig = null;
      smlt.hydrateOrRender();
      smlt.own();
      smlt._hydrated = true;
    }
  }

  /** Hydrates an existing table or renders one from payload, cached rows, or an API source. */
  hydrateOrRender() {
    let smlt = this;
    const existingTable = smlt.querySelector("table") || (smlt.tagName === "TABLE" ? smlt : null);
    if (existingTable) {
      smlt.hydrateExistingTable(existingTable);
      return;
    }

    smlt.renderFromAvailableSource();
  }

  /** Applies configuration, rows, decoration, and cell behavior to an existing table element. */
  hydrateExistingTable(existingTable) {
    let smlt = this;
    smlt._table = existingTable;

    const payload = smlt.readJsonPayload();
    const normalizedPayload = payload ? smlt.normalizeApiResponse(payload) : null;
    if (normalizedPayload && typeof normalizedPayload === "object" && !Array.isArray(normalizedPayload)) {
      smlt._tableConfig = normalizedPayload;
      smlt.applyConfigToDataset(normalizedPayload);
    }

    const payloadRows = extractRowsFromPayload(normalizedPayload) || [];
    if (payloadRows.length > 0) {
      smlt._rowsData = payloadRows;
      smlt.backfillExistingTableCells(existingTable, payloadRows);
    } else if (smlt.dataset.api && !smlt._apiLoading && !smlt.isReportingManaged() && !smlt.isClientOwned()) {
      smlt.loadDataFromApi();
    }

    smlt.decorateTableElement(existingTable);
    smlt.own();
    smlt.hydrateTableCells(existingTable);
    smlt.notifyRenderFinished(smlt._rowsData);
  }

  /** Renders from configured payload or cached rows and otherwise starts unmanaged API loading. */
  renderFromAvailableSource() {
    let smlt = this;
    smlt.ensureLoadingState();

    const payload = smlt.readJsonPayload();
    if (payload) {
      const normalizedPayload = smlt.normalizeApiResponse(payload);
      const hasApiSource = !!String(smlt.dataset.searchApi || smlt.dataset.api || "").trim();
      const hasConfiguredColumns = smlt.payloadHasConfiguredColumns(normalizedPayload);

      // Avoid rendering transient raw-key tables for API-backed components.
      if (hasApiSource && !hasConfiguredColumns) {
        smlt._rowsData = extractRowsFromPayload(normalizedPayload) || [];
        if (!smlt._apiLoading && !smlt.isReportingManaged() && !smlt.isClientOwned()) {
          smlt.loadDataFromApi();
        }
        return;
      }

      smlt.setPayload(normalizedPayload);
      return;
    }

    if (Array.isArray(smlt._rowsData) && smlt._rowsData.length > 0) {
      smlt.renderFromRows(smlt._rowsData);
      return;
    }

    if (smlt.dataset.api && !smlt._apiLoading && !smlt.isReportingManaged() && !smlt.isClientOwned()) {
      smlt.loadDataFromApi();
    }
  }

  /** Parses nested JSON strings and normalizes the resulting table payload. */
  normalizeApiResponse(apiResponse) {
    let normalized = apiResponse;

    while (typeof normalized === "string") {
      try {
        normalized = JSON.parse(normalized);
      } catch {
        break;
      }
    }

    return normalizeTablePayload(normalized);
  }

  /** Returns whether a payload defines at least one display column. */
  payloadHasConfiguredColumns(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;

    const directColumns = payload.columns || payload.Columns;
    if (Array.isArray(directColumns) && directColumns.length > 0) return true;

    const query = payload.query || payload.Query;
    if (!query || typeof query !== "object" || Array.isArray(query)) return false;

    const queryColumns = query.displayColumns || query.DisplayColumns;
    return Array.isArray(queryColumns) && queryColumns.length > 0;
  }

  /** Reads and normalizes the table's JSON payload from its configured data source. */
  readJsonPayload() {
    let smlt = this;
    return readSmlJsonPayload(smlt);
  }

  /** Copies supported table configuration values into component data attributes. */
  applyConfigToDataset(config) {
    let smlt = this;
    if (!config || typeof config !== "object" || Array.isArray(config)) return;

    smlt._suppressAttributeHydrate = true;
    try {
      if (config.api) smlt.dataset.api = String(config.api);
      if (config.searchApi) smlt.dataset.searchApi = String(config.searchApi);
      if (config.modelKey || config.ModelKey) smlt.dataset.modelKey = String(config.modelKey || config.ModelKey);
      const textIdentifier = config.textIdentifier || config.TextIdentifier;
      if (textIdentifier) smlt.dataset.textIdentifier = String(textIdentifier);
      if (config.pageLengthMenu || config.tablePageLengthMenu) smlt.dataset.pageLengthMenu = String(config.pageLengthMenu || config.tablePageLengthMenu);
      if (config.hasPagination !== undefined) smlt.dataset.hasPagination = String(config.hasPagination);
      if (config.hasSearch !== undefined || config.tableHasQuickSearch !== undefined) smlt.dataset.hasSearch = String(config.hasSearch ?? config.tableHasQuickSearch);
      if (config.hasCounts !== undefined) smlt.dataset.hasCounts = String(config.hasCounts);
      const totalLoad = config.totalLoad ?? config.query?.totalLoad;
      if (totalLoad !== undefined && totalLoad !== null && `${totalLoad}` !== "") {
        smlt.dataset.totalLoad = String(totalLoad);
      }
      applyTotalLoadConfigToHost(smlt);
    } finally {
      smlt._suppressAttributeHydrate = false;
    }
  }

  /** Loads table data from the configured API and applies the normalized response. */
  async loadDataFromApi() {
    let smlt = this;
    const searchApi = (smlt.dataset.searchApi || smlt.dataset.api || "").trim();
    if (!searchApi) return;
    if (smlt._apiLoading) return smlt._apiLoadPromise || undefined;

    const reportHost = smlt.parentElement?.querySelector?.("sml-reporting, cc-reporting");
    if (typeof reportHost?.cancelActiveSearch === "function") {
      reportHost.cancelActiveSearch();
    }

    const requestSerial = (smlt._apiRequestSerial || 0) + 1;
    smlt._apiRequestSerial = requestSerial;
    smlt.cancelPendingApiLoad();
    smlt._apiLoading = true;
    const abortController = new AbortController();
    smlt._apiAbortController = abortController;
    let payloadApplied = false;
    smlt.ensureLoadingState();
    smlt._apiLoadPromise = (async () => {
      try {
        const bodyPayload = smlt.buildApiRequestBody();
        const apiResponse = await smlt.requestApiPayload(searchApi, bodyPayload, abortController.signal);
        if (apiResponse?.aborted === true) {
          return;
        }

        const forwardedResponse = smlt.forwardApiPayload(apiResponse);
        const mergedPayload = mergeTablePayload(forwardedResponse, apiResponse);
        smlt.setPayload(mergedPayload);
        payloadApplied = true;
      } catch (err) {
        console.warn("smlTable: Unable to load data from API.", err);
      } finally {
        if (smlt._apiRequestSerial === requestSerial) {
          smlt._apiLoading = false;
          smlt._apiLoadPromise = null;
          if (payloadApplied) smlt.notifyRenderFinished(smlt._rowsData);
        }
        if (smlt._apiAbortController === abortController) {
          smlt._apiAbortController = null;
        }
      }
    })();
    return smlt._apiLoadPromise;
  }

  /** Builds the configured API request body and adds a numeric parent key when available. */
  buildApiRequestBody() {
    let smlt = this;
    let bodyPayload = {};
    const configuredBody = (smlt.dataset.apiBody || "").trim();

    if (configuredBody) {
      try {
        bodyPayload = JSON.parse(configuredBody);
      } catch {
        bodyPayload = smlt.dataset.apiBody;
      }
    }

    if (smlt.dataset.parentKeyValue && bodyPayload && typeof bodyPayload === "object" && !Array.isArray(bodyPayload)) {
      const parsedParentKeyValue = Number.parseInt(smlt.dataset.parentKeyValue, 10);
      if (!Number.isNaN(parsedParentKeyValue)) {
        bodyPayload.parentKeyValue = parsedParentKeyValue;
      }
    }

    if (bodyPayload && typeof bodyPayload === "object" && !Array.isArray(bodyPayload)) {
      const host = smlt.closest("[data-configs-page='true'], [data-sml-generated-page='true'], sml-page");
      const security = smlt.localConfig?.security
        || host?.config?.security
        || smlt.closest("sml-reporting")?.localConfig?.security
        || smlt.closest("sml-reporting")?.report?.security
        || null;
      bodyPayload = applyRptSecurityToPayload(bodyPayload, security);
    }

    return bodyPayload;
  }

  /** Posts a request to the configured API form and normalizes its response. */
  async requestApiPayload(apiUrl, bodyPayload, signal) {
    let smlt = this;
    const apiResponse = await smlClientOrFetch(smlt, {
      kind: "table-search",
      api: apiUrl,
      body: bodyPayload,
      signal
    }, () => (apiUrl.includes("/")
      ? apiPostDirect(apiUrl, bodyPayload, "json", { signal })
      : apiPost(apiUrl, bodyPayload)));
    const normalizedResponse = smlt.normalizeApiResponse(apiResponse);
    const clientActions = Array.isArray(bodyPayload?.query?.queryActions)
      ? bodyPayload.query.queryActions
      : (Array.isArray(bodyPayload?.actions) ? bodyPayload.actions : null);

    if (normalizedResponse && typeof normalizedResponse === "object" && !Array.isArray(normalizedResponse)
        && Array.isArray(clientActions) && clientActions.length > 0) {
      normalizedResponse.query = normalizedResponse.query && typeof normalizedResponse.query === "object"
        ? normalizedResponse.query
        : {};
      normalizedResponse.query.queryActions = clientActions;
      normalizedResponse.actions = clientActions;
    }

    return normalizedResponse;
  }

  /** Runs the configured response forwarder and normalizes the forwarded payload. */
  forwardApiPayload(apiResponse) {
    let smlt = this;
    const forwardName = (smlt.dataset.apiForward || "").trim();
    const forwardFn = forwardName ? globalThis[forwardName] : null;
    const forwardedResponse = typeof forwardFn === "function"
      ? forwardFn(apiResponse, smlt)
      : apiResponse;
    return smlt.normalizeApiResponse(forwardedResponse);
  }

  /** Reads the current row collection from the table's JSON data. */
  readJsonRows() {
    let smlt = this;
    return readSmlJsonRows(smlt);
  }

  /** Normalizes and applies a payload while preserving prior columns and actions when needed. */
  setPayload(payload) {
    let smlt = this;
    const previousConfig = smlt._tableConfig;
    const normalizedPayload = smlt.normalizeApiResponse(payload);
    let nextConfig =
      normalizedPayload && typeof normalizedPayload === "object" && !Array.isArray(normalizedPayload)
        ? normalizedPayload
        : null;

    if (nextConfig && smlt.isClientOwned() && smlt._clientPresentation) {
      const approved = smlt._clientPresentation;
      const approvedQuery = approved.query || approved.Query || {};
      const nextQuery = nextConfig.query || nextConfig.Query || {};
      nextConfig = {
        ...nextConfig,
        columns: approved.columns || approved.Columns || approvedQuery.displayColumns || [],
        modelKey: approved.modelKey || nextConfig.modelKey,
        query: {
          ...nextQuery,
          displayColumns: approvedQuery.displayColumns || approvedQuery.DisplayColumns || [],
          queryActions: approvedQuery.queryActions || approvedQuery.QueryActions || [],
          forms: approvedQuery.forms || approvedQuery.Forms || []
        }
      };
    }

    // Buttons are presentation, so an authored set outranks whatever the reply carried.
    const authoredActions = resolveTableActions(smlt.localConfig);
    if (nextConfig && authoredActions.length > 0) {
      const nextQuery = nextConfig.query || nextConfig.Query || {};
      nextConfig = { ...nextConfig, query: { ...nextQuery, queryActions: authoredActions } };
    }

    const nextMissingConfiguredColumns = !smlt.payloadHasConfiguredColumns(nextConfig);
    const previousHasConfiguredColumns = smlt.payloadHasConfiguredColumns(previousConfig);
    if (nextConfig && nextMissingConfiguredColumns && previousConfig && previousHasConfiguredColumns) {
      const previousQuery = previousConfig.query || previousConfig.Query || {};
      const nextQuery = nextConfig.query || nextConfig.Query || {};
      const previousActions = resolveTableActions(previousConfig);
      const nextActions = resolveTableActions(nextConfig);
      nextConfig = {
        ...nextConfig,
        columns: nextConfig.columns || nextConfig.Columns || previousConfig.columns || previousConfig.Columns || previousQuery.displayColumns || previousQuery.DisplayColumns || [],
        query: {
          ...previousQuery,
          ...nextQuery,
          displayColumns: nextQuery.displayColumns || nextQuery.DisplayColumns || previousQuery.displayColumns || previousQuery.DisplayColumns || [],
          queryActions: previousActions.length > 0 ? previousActions : nextActions,
          forms: nextQuery.forms || nextQuery.Forms || previousQuery.forms || previousQuery.Forms || []
        }
      };
    }

    smlt._tableConfig = normalizeTablePayload(nextConfig);

    smlt.applyConfigToDataset(smlt._tableConfig);
    smlt._rowsData = extractRowsFromPayload(normalizedPayload) || [];
    smlt._hydrated = false;
    smlt.renderFromRows(smlt._rowsData);
    smlt._hydrated = true;
  }

  /** Replaces the current payload with a plain row array and rerenders the table. */
  setData(rows) {
    let smlt = this;
    smlt._tableConfig = null;
    smlt._rowsData = Array.isArray(rows) ? rows : [];
    smlt._hydrated = false;
    smlt.renderFromRows(smlt._rowsData);
    smlt._hydrated = true;
  }

  /** Parses and applies JSON table data supplied as a string, array, or object. */
  loadJsonData(jsonData) {
    let smlt = this;
    if (typeof jsonData === "string") {
      try {
        smlt.setPayload(JSON.parse(jsonData));
        return;
      } catch (err) {
        console.warn("smlTable: loadJsonData received invalid JSON.", err);
        return;
      }
    }

    if (Array.isArray(jsonData) || (jsonData && typeof jsonData === "object")) {
      smlt.setPayload(jsonData);
    }
  }

  /** Renders a table from rows and reapplies decoration and ownership behavior. */
  renderFromRows(rows) {
    const smlt = this;
    if (smlt._chunkChromeRefreshFrame) {
      cancelAnimationFrame(smlt._chunkChromeRefreshFrame);
      smlt._chunkChromeRefreshFrame = null;
      smlt._chunkChromeRefreshPending = false;
    }
    renderTableFromRows(smlt, rows, {
      decorateTableElement: (table) => smlt.decorateTableElement(table),
      applyOwnership: (host, table) => applyTableOwnership(host, table)
    });
    smlt.notifyRenderFinished(rows);
  }

  /** Invokes the post-render callback and event after caption, ownership, and cells are ready. */
  notifyRenderFinished(rows) {
    const smlt = this;
    const chunkLoading = ["true", "1", "yes"].includes(String(smlt.dataset.chunkLoading || "").toLowerCase());
    if (chunkLoading || smlt._apiLoading) return;

    smlt.ensureLoaderIdentity();
    smlt._hydrated = true;
    const table = smlt._table;
    const renderedRows = Array.isArray(smlt._rowsData) ? smlt._rowsData : rows;
    smlt.classList.remove("table-striped");
    smlt.classList.add("table-striped");
    const detail = {
      host: smlt,
      table,
      caption: table?.querySelector("caption") || null,
      rows: Array.isArray(renderedRows) ? renderedRows : [],
      rowCount: Array.isArray(renderedRows) ? renderedRows.length : 0,
      config: smlt._tableConfig
    };
    smlt.classList.remove("table-striped");
    smlt.classList.add("table-striped");
    functionCall("smlTableFinished", detail);
  }

  /** Adds configured CSS classes to the rendered table element. */
  decorateTableElement(table) {
    let smlt = this;
    const classes = (smlt.dataset.tableClass || "table table-sm").split(/\s+/).filter(Boolean);
    classes.forEach((cssClass) => table.classList.add(cssClass));
  }

  /** Hydrates table cells with shared formatting and API interaction helpers. */
  hydrateTableCells(table) {
    let smlt = this;
    hydrateSmlTableCells(smlt, table, {
      clip,
      guid,
      jmlToHtml,
      apiCall: async (cell) => smlt.apiCall(cell)
    });
  }

  /** Resolves the columns to render for the supplied rows. */
  resolveColumns(rows) {
    let smlt = this;
    return jsonResolveColumns(smlt, rows);
  }

  /** Resolves a row value for the specified column key. */
  resolveCellValue(row, columnKey) {
    return jsonResolveCellValue(row, columnKey);
  }

  /** Converts a column key into a readable display label. */
  prettyColumnName(columnKey) {
    return jsonPrettyColumnName(columnKey);
  }

  /** Converts a string to the shared JSON camel-case format. */
  camelCase(str) {
    return jsonCamelCase(str);
  }

  /** Shows or hides the table or its configured parent container. */
  async toggleTable(onOff) {
    let smlt = this;
    const parent = document.querySelector("#" + smlt.dataset.tableParent);
    const target = parent || smlt;
    target.classList.toggle("d-none", !onOff);
  }

  /** Builds the endpoint URL for a row action from the table's base API URL. */
  resolveActionApiUrl(baseApiUrl, requestType, actionType, actionLabel) {
    let apiUrl = String(baseApiUrl || "").trim();
    if (!apiUrl) return requestType;

    const lastSlash = apiUrl.lastIndexOf("/");
    const prefix = lastSlash > -1 ? apiUrl.substring(0, lastSlash + 1) : "";
    const endpoint = lastSlash > -1 ? apiUrl.substring(lastSlash + 1) : apiUrl;
    const baseEndpoint = endpoint.replace(SEARCH_ENDPOINT_SUFFIX, "");

    if (endpoint.startsWith("Api") && endpoint.endsWith(requestType)) {
      return apiUrl;
    }

    const normalizedBaseEndpoint = baseEndpoint.startsWith("Api") ? baseEndpoint.substring(3) : baseEndpoint;
    if (!normalizedBaseEndpoint) {
      return apiUrl;
    }

    if (actionType === "Create") {
      const normalizedActionLabel = String(actionLabel || "").trim();
      return `${prefix}Api${normalizedBaseEndpoint}${normalizedActionLabel}${requestType}`;
    }

    return `${prefix}Api${normalizedBaseEndpoint}${requestType}`;
  }

  /** Executes a row action, displays its result or form, and refreshes data when required. */
  async handleActionButton(button, e) {
    let smlt = this;
    const { actionName, actionType, actionLabel, actionPayload } = smlt.buildActionRequest(button);
    const actionKey = `${String(actionType || actionName || "").toLowerCase()}:${String(actionPayload?.keyValue ?? actionPayload?.action?.id ?? "")}`;
    if (smlt._pendingActionKey && smlt._pendingActionKey === actionKey) {
      return;
    }
    smlt._pendingActionKey = actionKey;

    if (button.dataset.href) {
      window.location.href = button.dataset.href;
      smlt._pendingActionKey = "";
      return;
    }

    unobtrusiveWait("Please Wait", "Getting Form Data");
    let actionResult = null;
    try {
      const buttonApi = String(button.dataset.api || "").trim();
      const apiUrl = buttonApi || smlt.resolveActionApiUrl(smlt.dataset.api || "", actionPayload.requestType, actionType, actionLabel);

      actionResult = await smlClientOrFetch(smlt, {
        kind: "table-action",
        api: apiUrl,
        body: actionPayload
      }, () => apiPostDirect(apiUrl, JSON.stringify(actionPayload)));
      actionResult = smlt.normalizeActionResult(actionResult);
      await smlt.presentActionResult(actionResult, apiUrl, e);
    } finally {
      const openedForm = !!actionResult?.action;
      const refreshAfterDelete = String(button.dataset.refreshAfterDelete || "").toLowerCase() === "true"
        && normalizeActionType(actionType || actionName) === "delete";
      const shouldRefreshTable = shouldRefreshAfterActionSuccess(actionType || actionName, actionResult)
        || refreshAfterDelete;

      if (shouldRefreshTable && !openedForm) {
        await smlt.loadDataFromApi();
      }
      unobtrusiveWaitOff();
      if (smlt._pendingActionKey === actionKey) {
        smlt._pendingActionKey = "";
      }
    }
  }

  /** Builds the API payload and action metadata for a row-action button. */
  buildActionRequest(button) {
    let smlt = this;
    const row = button.closest("tr");
    const rowId = row?.dataset?.rowId || button.dataset.rowId;
    const actionName = button.dataset.action || "";
    const actionType = button.dataset.type || "";
    const actionLabel = (button.dataset.text || button.innerText || "").replace(/[^a-zA-Z0-9]/g, "");
    const actionPayload = { requestType: "Form" + actionName + "Action" };

    if (rowId || actionName) {
      if (rowId && !String(rowId).includes(".")) {
        const parsedRowId = Number.parseInt(rowId, 10);
        actionPayload.action = { type: actionName, id: parsedRowId };
        if (!Number.isNaN(parsedRowId)) {
          actionPayload.keyValue = parsedRowId;
        }
      } else if (rowId) {
        const parsedRowId = Number.parseInt(rowId, 10);
        actionPayload.action = { type: actionName, idAsText: parsedRowId };
        if (!Number.isNaN(parsedRowId)) {
          actionPayload.keyValue = parsedRowId;
        }
      }
    }

    if (smlt.dataset.parentKeyValue) {
      actionPayload.parentKeyValue = Number.parseInt(smlt.dataset.parentKeyValue, 10);
    }

    return { actionName, actionType, actionLabel, actionPayload };
  }

  /** Normalizes an action response and applies temporary server compatibility fields. */
  normalizeActionResult(actionResult) {
    let smlt = this;
    const normalizedResult = smlt.normalizeApiResponse(actionResult);

    if (normalizedResult?.buttonType && !normalizedResult?.title) {
      normalizedResult.title = normalizedResult.buttonType;
    }
    if (normalizedResult?.ErrorObject && !normalizedResult?.errorObject) {
      normalizedResult.errorObject = normalizedResult.ErrorObject;
    }

    return normalizedResult;
  }

  getConfiguredForms() {
    const smlt = this;

    // The page owns its form contracts. Server replies carry records only, and they
    // replace _tableConfig on every load, so the authored config is asked first.
    const authored = smlt._clientPresentation || smlt.localConfig;
    const authoredForms = authored?.query?.forms || authored?.query?.Forms || authored?.forms;
    if (Array.isArray(authoredForms) && authoredForms.length > 0) {
      return authoredForms;
    }

    const config = smlt._tableConfig || {};
    const query = config.query || config.Query || {};

    if (Array.isArray(config.forms)) {
      return config.forms;
    }

    if (Array.isArray(query.forms)) {
      return query.forms;
    }

    if (Array.isArray(query.Forms)) {
      return query.Forms;
    }

    return [];
  }

  resolveClientFormContract(actionResult, fallbackActionType) {
    const forms = this.getConfiguredForms();
    if (forms.length < 1) {
      return null;
    }

    const requestedName = String(actionResult?.formName || actionResult?.name || "").trim().toLowerCase();
    const requestedType = String(actionResult?.action || fallbackActionType || "").trim().toLowerCase();

    return forms.find((form) => {
      const candidateName = String(form?.name || "").trim().toLowerCase();
      const candidateType = String(form?.type || form?.action || "").trim().toLowerCase();

      if (requestedName && candidateName === requestedName) {
        return true;
      }

      return requestedType && candidateType === requestedType;
    }) || null;
  }

  /** Record values arrive on data, or on the fields of the server's own copy of the form. */
  resolveActionRecord(actionResult) {
    if (actionResult?.data && typeof actionResult.data === "object") {
      return actionResult.data;
    }

    const record = {};
    for (const field of Array.isArray(actionResult?.fields) ? actionResult.fields : []) {
      const propertyName = String(field?.propertyName || field?.name || "").trim();
      if (!propertyName) continue;
      record[propertyName] = field?.defaultValue ?? field?.value ?? "";
    }

    return record;
  }

  hydrateClientFormContract(formContract, actionResult, apiUrl) {
    const smlt = this;
    const hydrated = cloneJsonCompatible(formContract);
    const record = smlt.resolveActionRecord(actionResult);
    const lowerRecordEntries = Object.entries(record).map(([key, value]) => [String(key).toLowerCase(), value]);
    const lowerRecord = Object.fromEntries(lowerRecordEntries);
    const modelKey = String(smlt?._tableConfig?.modelKey || smlt?._tableConfig?.query?.tableKey || "").trim();
    const modelKeyLookup = modelKey.toLowerCase();

    hydrated.action = actionResult?.action || hydrated.action || hydrated.type || "Read";
    hydrated.type = hydrated.type || hydrated.action || "Read";
    hydrated.name = hydrated.name || actionResult?.formName || "ClientHydratedForm";
    hydrated.title = hydrated.title || actionResult?.title || hydrated.name;
    hydrated.actionApi = hydrated.actionApi || apiUrl;
    hydrated.submitApi = hydrated.submitApi || actionResult?.submitApi || "";
    hydrated.id = actionResult?.keyValue
      ?? actionResult?.id
      ?? (modelKeyLookup ? lowerRecord[modelKeyLookup] : undefined)
      ?? hydrated.id
      ?? -1;
    hydrated.fields = Array.isArray(hydrated.fields) ? hydrated.fields : [];

    hydrated.fields = hydrated.fields.map((field) => {
      const hydratedField = { ...field };
      const propertyName = String(hydratedField.propertyName || hydratedField.name || "").trim();
      const lookupKey = propertyName.toLowerCase();

      if (lookupKey && Object.prototype.hasOwnProperty.call(lowerRecord, lookupKey)) {
        const rawValue = lowerRecord[lookupKey];
        hydratedField.defaultValue = rawValue == null ? "" : String(rawValue);
      }

      const selectTextProperty = String(hydratedField.sfSelectTextProperty || "").trim();
      if (selectTextProperty) {
        const selectText = lowerRecord[selectTextProperty.toLowerCase()];
        if (selectText != null) {
          hydratedField.sfDefaultValueShow = String(selectText);
        }
      }

      return hydratedField;
    });

    return hydrated;
  }

  /** Presents an action response as a form, redirect, error, or shared SML modal. */
  async presentActionResult(actionResult, apiUrl, e) {
    let smlt = this;
    const formAction = actionResult?.action;
    const modalOrigin = actionResult?.origin || actionResult?.dataOrigin;

    // The page owns the form. A reply that carries its own fields is still only a record
    // source, so the authored contract is asked first and the server copy is the fallback.
    if (actionResult && typeof actionResult === "object" && (actionResult?.formName || formAction)) {
      const clientForm = smlt.resolveClientFormContract(actionResult, formAction);
      if (clientForm) {
        const hydratedForm = smlt.hydrateClientFormContract(clientForm, actionResult, apiUrl);
        const openedBySmlForm = await smlForm.openFromParent(smlt, e, hydratedForm, hydratedForm?.action || formAction);
        if (!openedBySmlForm) {
          openSmlModal("smlForm could not render this form payload.", "SML Form Error");
        }
        return;
      }
    }

    if (actionResult && typeof actionResult === "object" && formAction) {
      actionResult.actionApi = apiUrl;
      if (actionResult.parentId === -1) actionResult.parentId = smlt.dataset.parentKeyValue;
      const openedBySmlForm = await smlForm.openFromParent(smlt, e, actionResult, formAction);
      if (!openedBySmlForm) {
        openSmlModal("smlForm could not render this form payload.", "SML Form Error");
      }
      return;
    }

    if (actionResult?.message?.length > 0 && actionResult?.title?.length > 0) {
      openSmlModal(actionResult.message, actionResult.title, modalOrigin);
    } else if (actionResult?.redirect) {
      window.location.href = actionResult.redirect;
    } else if (actionResult?.errorObject || actionResult?.ErrorObject) {
      const errorMessage = actionResult.errorObject || actionResult.ErrorObject;
      openSmlModal("Failed to retrieve data. Error " + errorMessage, "Page Error!!", modalOrigin);
    } else if (actionResult) {
      const modalTitle = String(actionResult?.title || actionResult?.buttonType || "").trim() || "Success";
      openSmlModal(resolveActionResultModalContent(actionResult), modalTitle, modalOrigin);
    }
  }

  /** Calls an element's configured API and forwards a successful receipt response. */
  async apiCall(sourceEle) {
    let smlt = this;
    const src = sourceEle || smlt;
    if (!src.dataset.api) return;

    unobtrusiveWait("Processing " + (src.dataset.text || src.textContent || ""));
    try {
      const apiUrl = (src.dataset.api || "").trim();
      const postData = await smlClientOrFetch(smlt, {
        kind: "table-api-call",
        api: apiUrl,
        body: { forward: src.dataset.apiForward }
      }, () => (apiUrl.includes("/")
        ? apiPostDirect(apiUrl, { forward: src.dataset.apiForward })
        : apiPost(apiUrl, { forward: src.dataset.apiForward })));
      if (postData?.receipt && await receiptCheckGood(postData.receipt)) {
        globalThis[src.dataset.apiForward]?.(postData);
      } else {
        console.log("smlTable: API Call failed for " + src.dataset.api);
      }
    } finally {
      unobtrusiveWaitOff();
    }
  }
}

if (!customElements.get("sml-table")) {
  customElements.define("sml-table", smlTable);
}

export default smlTable;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! Soli Deo Gloria !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~