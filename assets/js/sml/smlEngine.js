//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
/* eslint-disable no-undef */
/* eslint-disable no-console */
/*!
 * smlEngine --- client side config builder, security gate, and comms central for sml components
 * Public Domain Licensed Copyright Law of the United States of America, Section 105 (https://www.copyright.gov/title17/92chap1.html#105)
 * Et qui me misit, mecum est: non reliquit me solum Pater, quia ego semper quae placita sunt ei, facio!
 * Published by: Dominic Roche of OIT/IUSG/DASM on 9/17/2026
 * @class smlEngine
 * @extends {HTMLElement}
 */
// תהילתו. לא שלי
import { apiPostDirect, asBool, clip, guid, jmlToHtml, toTitle } from './smlUtils.js';
import { applyRptSecurityToPayload } from './Reporting/smlReportingModelUtils.js';
"use strict";

/** Suffixes that mark a stamp/audit column the author never has to describe. */
const STAMP_SUFFIX = /(TimeStamp|UserIdentifier)$/i;
/** Relay kinds that carry a reporting search payload and accept security pruning. */
const SEARCH_RELAY_KINDS = new Set(["reporting-search", "reporting-chunk", "table-search"]);
/** Operations the engine always materializes unless the seed opts out. */
const CRUDL_OPERATIONS = ["Create", "Read", "Update", "Delete"];
/** Action chrome that used to live in the server Init system. */
const ACTION_CHROME = {
  Create: { htmlClass: "flex-fill float-md-end btn btn-sm btn-success border-1 border-warning text-nowrap text-truncate sml-table-action-button", style: "margin-right: 1px;" },
  Export: { htmlClass: "flex-fill btn btn-MidnightBlue text-nowrap text-truncate sml-table-action-button", icon: "bi bi-file-arrow-down-fill", exportFormats: "*" },
  Read: { htmlClass: "btn btn-sm btn-secondary" },
  Update: { htmlClass: "btn btn-sm btn-CornflowerBlue" },
  Delete: { htmlClass: "btn btn-sm btn-danger" }
};

class smlEngine extends HTMLElement {

  //----------------------Lifecycle

  constructor() {
    super();
    let sme = this;
    sme.seed = null;
    sme.generated = null;
    sme.approved = null;
    sme.security = null;
    sme.ready = false;
    sme._readyWaiters = [];
    sme._relays = new Map();
    sme._relaysBySignature = new Map();
    sme._queue = [];
    sme._pumping = false;
    sme._relaySerial = 0;
    sme._spinSerial = 0;
    sme._spinning = false;
  }

  static observedAttributes = ["data-seed", "data-seed-ref", "data-review-api", "data-review", "data-max-relays"];

  /** Builds, reviews, and distributes the page configuration once the engine connects. */
  async connectedCallback() {
    let sme = this;
    sme.id = sme.id || "sme" + clip(guid(true), 15);
    globalThis[sme.id] = sme;
    sme.wire();
    await sme.spinUp();
  }

  disconnectedCallback() {
    let sme = this;
    document.removeEventListener("sml:engine-ask", sme._askHandler);
  }

  /** Rebuilds the page configuration when the authored seed is swapped at runtime. */
  async attributeChangedCallback(name, oldValue, newValue) {
    let sme = this;
    if (oldValue === newValue) return;
    if (!sme.isConnected) return;
    if (name !== "data-seed" && name !== "data-seed-ref") return;

    sme.ready = false;
    sme.approved = null;
    await sme.spinUp();
  }

  /** Listens for elements that ask the engine for configs or server data. */
  wire() {
    let sme = this;
    sme._askHandler = (event) => {
      const detail = event?.detail;
      if (!detail || typeof detail.reply !== "function") return;
      if (detail.engineId && detail.engineId !== sme.id) return;
      if (!sme.owns(event.target)) return;
      event.stopPropagation();
      detail.reply(sme.ask(detail));
    };
    document.addEventListener("sml:engine-ask", sme._askHandler);
  }

  //----------------------Lifecycle End

  //----------------------Spin Up

  /**
   * Generates the client configuration, has the server review it, then distributes it.
   * Nothing reaches the table or reporting until the review returns clean.
   */
  async spinUp() {
    let sme = this;
    const spinId = (sme._spinSerial || 0) + 1;
    sme._spinSerial = spinId;
    if (sme._spinning) return;
    sme._spinning = true;

    try {
      sme.seed = sme.readSeed();
      if (!sme.seed) {
        console.warn("smlEngine: no seed found for", sme.id);
        return;
      }

      sme.generated = sme.expandSeed(sme.seed);

      const reviewed = await sme.reviewGenerated(sme.generated);
      if (sme._spinSerial !== spinId) return;
      if (!reviewed) return;

      sme.approved = reviewed;
      sme.security = reviewed.security || null;
      sme.distribute(reviewed);
      sme.markReady();
    } finally {
      sme._spinning = false;
      if (sme._spinSerial !== spinId) {
        await sme.spinUp();
      }
    }
  }

  /** Reads the starved page seed from a property, a global reference, or inline JSON. */
  readSeed() {
    let sme = this;
    if (sme.config && typeof sme.config === "object") return structuredClone(sme.config);

    const seedRef = String(sme.dataset.seedRef || "").trim();
    if (seedRef && globalThis[seedRef] && typeof globalThis[seedRef] === "object") {
      return structuredClone(globalThis[seedRef]);
    }

    const rawSeed = String(sme.dataset.seed || "").trim();
    if (rawSeed.length < 1) return null;

    try {
      return JSON.parse(rawSeed);
    } catch (err) {
      console.warn("smlEngine: unable to parse data-seed.", err);
      return null;
    }
  }

  /** Releases anything waiting on the approved configuration. */
  markReady() {
    let sme = this;
    sme.ready = true;
    const waiters = sme._readyWaiters;
    sme._readyWaiters = [];
    waiters.forEach((resolve) => resolve(sme.approved));
  }

  /** Resolves when the engine has an approved configuration to hand out. */
  whenReady() {
    let sme = this;
    if (sme.ready) return Promise.resolve(sme.approved);
    return new Promise((resolve) => sme._readyWaiters.push(resolve));
  }

  //----------------------Spin Up End

  //----------------------Config Generation

  /** Expands a starved seed into the reporting config and table payload the elements expect. */
  expandSeed(seed) {
    let sme = this;
    const entity = String(seed.entity || seed.recordType || "Record").trim();
    const entityPlural = String(seed.entityPlural || seed.recordTypePlural || `${entity}s`).trim();
    const apiRoot = String(seed.apiRoot || seed.controller || "").replace(/\/+$/, "");
    const apiName = String(seed.apiName || entity).trim();
    const modelKey = String(seed.modelKey || `${entity}Identifier`).trim();
    const fields = sme.normalizeFields(seed, modelKey);

    const reporting = {
      mode: "local",
      requestType: seed.requestType || "RptReportingSearch",
      reportName: seed.reportName || `${entityPlural} Managment`,
      alias: seed.alias || `Rpt${entity}`,
      recordType: entity,
      recordTypePlural: entityPlural,
      accessModifier: seed.accessModifier || "Public",
      reportingApi: sme.apiFor(seed, "reporting", `${apiRoot}/Api${apiName}RptReportingSearch`),
      modelKey,
      textIdentifier: seed.textIdentifier || "RecordDescription",
      hasReportsTab: asBool(seed.hasReportsTab),
      hasCreateAdvancedReportTab: asBool(seed.hasCreateAdvancedReportTab),
      totalLoad: asBool(seed.totalLoad),
      query: {
        tableKey: modelKey,
        callAction: "ReportList",
        action: "ReportList",
        tableHasQuickSearch: seed.tableHasQuickSearch !== false,
        tableHasCounts: seed.tableHasCounts !== false,
        tableHasPagination: seed.tableHasPagination !== false,
        tablePageLengthMenu: seed.tablePageLengthMenu || "10,50,100",
        additionalFields: Array.isArray(seed.additionalFields) ? seed.additionalFields : [modelKey, seed.textIdentifier || "RecordDescription"],
        queryActions: sme.buildActions(seed, apiRoot, apiName),
        displayColumns: sme.buildColumns(fields),
        forms: sme.buildForms(seed, fields, entity, apiRoot, apiName)
      }
    };

    sme.applyOverrides(reporting, seed.reporting);

    return { reporting, table: sme.buildTablePayload(reporting) };
  }

  /** Normalizes authored field entries and infers everything the author left out. */
  normalizeFields(seed, modelKey) {
    let sme = this;
    const authored = Array.isArray(seed.fields) ? seed.fields : [];

    return authored.map((entry) => {
      const field = typeof entry === "string" ? { name: entry } : { ...entry };
      const name = String(field.name || field.propertyName || "").trim();
      const isKey = field.isKey === true || field.key === true || name.toLowerCase() === modelKey.toLowerCase();
      const isStamp = field.stamp === true || STAMP_SUFFIX.test(name);

      return {
        ...field,
        name,
        propertyName: field.propertyName || name,
        label: field.label || toTitle(name),
        isKey,
        isStamp,
        isRequired: field.isRequired === true || field.required === true,
        inputType: field.inputType || sme.inferInputType(name, field),
        listed: field.list !== undefined ? asBool(field.list) : !(isKey || isStamp)
      };
    }).filter((field) => field.name.length > 0);
  }

  /** Picks the editor an author would have typed out by hand for this field. */
  inferInputType(name, field) {
    if (field.sfDropDownJson || field.options) return "Select";
    const fieldName = String(name);
    if (/Email$/i.test(fieldName)) return "Email";
    if (/(Phone|Fax)$/i.test(fieldName)) return "Tel";
    if (/(Date|TimeStamp)$/i.test(fieldName)) return "DateTime";
    if (/^(Is|Has|Can)[A-Z]/.test(fieldName)) return "Select";
    if (/(Description|Notes|Comment|Remarks)$/i.test(fieldName)) return "TextArea";
    if (/(Count|Number|Quantity|Amount|Ordinal)$/i.test(fieldName)) return "Number";
    return "TextBox";
  }

  /** Builds the list columns from the fields the author allowed on the list. */
  buildColumns(fields) {
    return fields
      .filter((field) => field.listed)
      .map((field, index) => ({
        ordinal: field.ordinal || index + 1,
        fieldName: field.name,
        title: field.title || field.label,
        sortOrder: field.sortOrder || undefined,
        sortDirection: field.sortDirection || undefined
      }));
  }

  /** Builds the standard table actions plus any extra action the seed declares. */
  buildActions(seed, apiRoot, apiName) {
    const requested = Array.isArray(seed.actions) && seed.actions.length > 0
      ? seed.actions
      : ["Create", "Export", "Read", "Update", "Delete"];

    return requested.map((entry) => {
      const action = typeof entry === "string" ? { type: entry } : { ...entry };
      const type = String(action.type || action.name || "").trim();
      const chrome = ACTION_CHROME[type] || {};
      const needsApi = CRUDL_OPERATIONS.includes(type);

      return {
        label: action.label || type,
        name: action.name || type,
        type,
        title: action.title || `${type} ${seed.entity || "record"}`,
        ...chrome,
        ...(needsApi ? { api: action.api || `${apiRoot}/Api${apiName}Form${type}Action` } : {}),
        ...action
      };
    });
  }

  /** Builds the four CRUDL form contracts that used to come down from the server. */
  buildForms(seed, fields, entity, apiRoot, apiName) {
    let sme = this;
    const operations = Array.isArray(seed.operations) ? seed.operations : CRUDL_OPERATIONS;
    const overrides = seed.forms && typeof seed.forms === "object" ? seed.forms : {};

    return operations.map((operation) => {
      const authored = overrides[operation] || overrides[operation.toLowerCase()] || {};
      const form = {
        type: operation,
        action: operation,
        title: `${operation} ${entity}`,
        name: `RptForm${entity}${operation}`,
        actionApi: `${apiRoot}/Api${apiName}Form${operation}Action`,
        submitApi: operation === "Read" ? "" : `${apiRoot}/Api${apiName}Form${operation}FormSubmit`,
        fields: fields
          .filter((field) => sme.fieldBelongsOn(field, operation))
          .map((field) => sme.buildFormField(field, operation)),
        ...authored
      };

      return form;
    });
  }

  /** Decides whether a field appears on a given CRUDL form. */
  fieldBelongsOn(field, operation) {
    const flag = field[operation.toLowerCase()];
    if (flag !== undefined) return asBool(flag);
    if (operation === "Create" && field.isKey) return false;
    return true;
  }

  /** Shapes one form field, hiding keys and stamps the way the Init system used to. */
  buildFormField(field, operation) {
    let sme = this;
    const hideAlways = field.isStamp || (field.isKey && (operation === "Create" || operation === "Update"));
    let inputType = field.inputType;

    if (hideAlways) inputType = "Hidden";
    else if (operation === "Read") inputType = field.readInputType || "Display";
    else if (operation === "Delete") inputType = field.deleteInputType || "output";

    return {
      inputType,
      propertyName: field.propertyName,
      name: field.name,
      label: field.label,
      title: field.title || sme.fieldTitle(field, operation, inputType),
      ...(field.isKey ? { isKey: true } : {}),
      ...(field.isRequired && operation !== "Read" && operation !== "Delete" ? { isRequired: true } : {}),
      ...(field.maxLength ? { maxLength: field.maxLength } : {}),
      ...(field.sfDropDownJson ? { sfDropDownJson: field.sfDropDownJson } : {}),
      ...(field.ccTable ? { ccTable: field.ccTable } : {})
    };
  }

  /** Writes the help text an author would otherwise repeat on every field. */
  fieldTitle(field, operation, inputType) {
    if (inputType === "Hidden") return `${field.label} hidden value for ${operation.toLowerCase()} actions`;
    if (operation === "Read") return `${field.label} shown on the read form`;
    if (operation === "Delete") return `Confirm the ${field.label.toLowerCase()} value before removing the record`;
    return `Enter the ${field.label.toLowerCase()} value for this record`;
  }

  /** Projects the reporting config into the payload shape sml-table consumes. */
  buildTablePayload(reporting) {
    const query = reporting.query || {};
    return {
      api: reporting.reportingApi || "",
      searchApi: reporting.reportingApi || "",
      modelKey: reporting.modelKey || "",
      textIdentifier: reporting.textIdentifier || "",
      pageLengthMenu: query.tablePageLengthMenu || "10,50,100",
      hasPagination: query.tableHasPagination,
      hasCounts: query.tableHasCounts,
      hasSearch: query.tableHasQuickSearch,
      totalLoad: reporting.totalLoad === true,
      query: {
        ...query,
        displayColumns: Array.isArray(query.displayColumns) ? query.displayColumns : [],
        queryActions: Array.isArray(query.queryActions) ? query.queryActions : [],
        forms: Array.isArray(query.forms) ? query.forms : []
      },
      list: []
    };
  }

  /** Lets an author override any generated branch without restating the rest. */
  applyOverrides(target, overrides) {
    if (!overrides || typeof overrides !== "object") return target;
    Object.entries(overrides).forEach(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value) && target[key] && typeof target[key] === "object") {
        target[key] = { ...target[key], ...value };
        return;
      }
      target[key] = value;
    });
    return target;
  }

  /** Resolves a seed supplied API or falls back to the conventional route. */
  apiFor(seed, key, fallback) {
    const authored = seed.apis && typeof seed.apis === "object" ? seed.apis[key] : null;
    return String(authored || fallback || "").trim();
  }

  //----------------------Config Generation End

  //----------------------Security Review

  /**
   * Sends the generated configuration to the server for review and returns the approved copy.
   * A rejected review never reaches the table or reporting.
   */
  async reviewGenerated(generated) {
    let sme = this;
    const reviewApi = String(sme.dataset.reviewApi || sme.seed?.reviewApi || "").trim();

    if (!reviewApi) {
      if (String(sme.dataset.review || "").trim().toLowerCase() === "off") {
        console.warn("smlEngine: review is off, distributing unreviewed config for", sme.id);
        return generated;
      }
      sme.showSecurityNotice("This page is missing its configuration review API, so no data was requested.");
      return null;
    }

    let response;
    try {
      response = await apiPostDirect(reviewApi, {
        requestType: "RptConfigReview",
        requestId: sme.id,
        modelKey: generated.reporting.modelKey,
        reporting: generated.reporting,
        table: generated.table
      });
    } catch (err) {
      console.warn("smlEngine: configuration review failed.", err);
      sme.showSecurityNotice("The configuration review could not be completed, so no data was requested.");
      return null;
    }

    if (typeof response === "string") {
      try { response = JSON.parse(response); } catch { response = null; }
    }

    const errorObject = response?.errorObject || response?.ErrorObject;
    if (!response || errorObject) {
      sme.showSecurityNotice(errorObject || "The server rejected this page configuration.");
      return null;
    }

    const reporting = response.reporting || response.Reporting || generated.reporting;
    const security = response.security || response.Security || reporting.security || null;
    reporting.security = security;

    return {
      reporting,
      table: response.table || response.Table || sme.buildTablePayload(reporting),
      security
    };
  }

  /** Renders a security message in place using the standard sml alert styling. */
  showSecurityNotice(message) {
    let sme = this;
    const noticeJml = {
      n: "div",
      c: "sml-engine-notice alert alert-danger my-2",
      role: "alert",
      "aria-live": "assertive",
      b: [
        { n: "strong", c: "me-1", t: "Configuration blocked:" },
        { n: "span", t: String(message || "This page configuration was not approved.") }
      ]
    };

    sme.replaceChildren();
    sme.insertAdjacentHTML("beforeend", jmlToHtml(noticeJml));
  }

  //----------------------Security Review End

  //----------------------Distribution

  /** Hands the approved reporting and table configuration to the client owned elements. */
  distribute(approved) {
    let sme = this;
    const reportingHost = sme.findClient("sml-reporting");
    const tableHost = sme.findClient("sml-table");

    if (reportingHost) {
      reportingHost.localConfig = structuredClone(approved.reporting);
      reportingHost.dataset.api = reportingHost.dataset.api || approved.reporting.reportingApi || "";
    }

    if (tableHost && typeof tableHost.setPayload === "function") {
      tableHost.dataset.searchApi = tableHost.dataset.searchApi || approved.reporting.reportingApi || "";
      tableHost._clientPresentation = structuredClone(approved.table);
      tableHost.setPayload(structuredClone(approved.table));
    }

    sme.dispatchEvent(new CustomEvent("sml:engine-ready", {
      bubbles: true,
      detail: { engineId: sme.id, reporting: approved.reporting, table: approved.table, security: approved.security }
    }));
  }

  /** Finds a client owned element this engine is responsible for. */
  findClient(tagName) {
    let sme = this;
    const scope = sme.closest("[data-sml-page], sml-page, main, body") || document;
    const candidates = [...scope.querySelectorAll(tagName)];
    return candidates.find((candidate) => asBool(candidate.dataset.client) && sme.owns(candidate)) || null;
  }

  /** Reports whether an asking element belongs to this engine. */
  owns(element) {
    let sme = this;
    if (!element || element === sme) return true;
    const requested = String(element.dataset?.engine || "").trim();
    if (requested) return requested === sme.id;
    const scope = sme.closest("[data-sml-page], sml-page, main, body") || document;
    return scope.contains(element);
  }

  //----------------------Distribution End

  //----------------------Comms

  /**
   * Accepts a request from a client owned element, relays it to the server, and
   * returns the response to whoever asked. Requests are buffered and correlated so
   * an overlapping search, page, or form load never lands on the wrong caller.
   *
   * @param {{from:HTMLElement, kind:string, api:string, body:object}} detail the ask
   * @returns {Promise<object>} the server response for this caller
   */
  ask(detail) {
    let sme = this;
    const relayId = `${sme.id}-r${(sme._relaySerial += 1)}`;

    const relay = {
      relayId,
      from: detail?.from || null,
      kind: String(detail?.kind || "data"),
      api: String(detail?.api || "").trim(),
      body: detail?.body || {},
      signal: detail?.signal || null,
      startedAt: Date.now()
    };

    // Two elements asking for the same thing at the same time ride one relay.
    const signature = sme.signatureFor(relay);
    if (signature) {
      const twin = sme._relaysBySignature.get(signature);
      if (twin) return twin.then((response) => sme.cloneBody(response));
    }

    const pending = new Promise((resolve, reject) => {
      relay.resolve = resolve;
      relay.reject = reject;
    });

    relay.signature = signature;
    if (signature) {
      sme._relaysBySignature.set(signature, pending);
      pending
        .catch(() => { /* the caller owns the failure */ })
        .finally(() => {
          if (sme._relaysBySignature.get(signature) === pending) sme._relaysBySignature.delete(signature);
        });
    }

    sme._relays.set(relayId, relay);
    sme._queue.push(relay);
    sme.pump();

    return pending;
  }

  /** Identifies a relay by what it asks for so duplicates can share a response. */
  signatureFor(relay) {
    if (!relay?.api) return "";
    if (relay.signal) return "";
    try {
      return `${relay.kind}|${relay.api}|${JSON.stringify(relay.body ?? {})}`;
    } catch {
      return "";
    }
  }

  /** Drains the relay buffer while honoring the configured concurrency. */
  async pump() {
    let sme = this;
    if (sme._pumping) return;
    sme._pumping = true;

    try {
      while (sme._queue.length > 0) {
        const batch = sme._queue.splice(0, sme.maxRelays());
        await Promise.all(batch.map((relay) => sme.runRelay(relay)));
      }
    } finally {
      sme._pumping = false;
    }
  }

  /** Copies a relay body so security pruning never edits the caller's object. */
  cloneBody(body) {
    if (!body || typeof body !== "object") return body;
    try {
      return structuredClone(body);
    } catch {
      return JSON.parse(JSON.stringify(body));
    }
  }

  /** How many relays the engine will have in flight at once. */
  maxRelays() {
    let sme = this;
    const configured = Number.parseInt(String(sme.dataset.maxRelays || ""), 10);
    return Number.isFinite(configured) && configured > 0 ? configured : 1;
  }

  /** Runs one relay and returns the response to the element that asked for it. */
  async runRelay(relay) {
    let sme = this;
    try {
      if (!relay.api) throw new Error("smlEngine: relay is missing an api.");

      // Search pruning rewrites requestType and columns, which would wreck a form submit.
      const body = sme.security && SEARCH_RELAY_KINDS.has(relay.kind)
        ? applyRptSecurityToPayload(sme.cloneBody(relay.body), sme.security)
        : relay.body;

      let response = await apiPostDirect(relay.api, body, "json", { signal: relay.signal });
      if (typeof response === "string") {
        try { response = JSON.parse(response); } catch { /* leave as text */ }
      }

      const errorObject = response?.errorObject || response?.ErrorObject;
      if (errorObject) {
        relay.resolve({ errorObject, relayId: relay.relayId, aborted: response?.aborted === true });
        return;
      }

      relay.resolve(response);
    } catch (err) {
      console.warn("smlEngine: relay failed.", err);
      relay.reject(err);
    } finally {
      sme._relays.delete(relay.relayId);
    }
  }

  //----------------------Comms End
}

if (!customElements.get("sml-engine")) {
  customElements.define("sml-engine", smlEngine);
}

export default smlEngine;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
