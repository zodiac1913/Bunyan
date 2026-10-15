/* eslint-disable no-console */
"use strict";

import { apiPost, asBool, jmlToHtml, modalBox, receiptCheckGood, toTitle } from "../smlUtils.js";

class smlToggler extends HTMLElement {
  static observedAttributes = ["data-api", "data-display-only", "data-key-value", "data-parent-key-value"];

  constructor() {
    super();
    this._loaded = false;
    this._items = [];
    this._bound = false;
  }

  async connectedCallback() {
    if (this._loaded) return;

    this.id = this.id || `smlToggler${Math.random().toString(36).slice(2, 10)}`;
    await this.load();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.isConnected || oldValue === newValue) return;
    if (["data-api", "data-key-value", "data-parent-key-value", "data-display-only"].includes(name)) {
      this._loaded = false;
      this.load();
    }
  }

  get api() {
    return String(this.dataset.api || "").trim();
  }

  get isDisplayOnly() {
    return this.dataset.displayOnly === "true";
  }

  get keyValue() {
    const explicit = this.dataset.keyValue;
    if (explicit !== undefined && explicit !== "") return explicit;
    return this.closest("[data-sml-form-root='true']")?.dataset?.keyValue || "";
  }

  get parentKeyValue() {
    const explicit = this.dataset.parentKeyValue;
    if (explicit !== undefined && explicit !== "") return explicit;
    return this.closest("[data-sml-form-root='true']")?.dataset?.parentKeyValue || "";
  }

  async load() {
    if (!this.api) {
      this.innerHTML = "";
      return;
    }

    this.renderShell();

    const payload = {
      requestType: `${this.id}GetData`,
      parentKeyValue: this.parentKeyValue || null,
      keyValue: this.keyValue || null
    };

    const response = await apiPost(this.api, JSON.stringify(payload), "json");
    const normalized = typeof response === "string" ? JSON.parse(response) : response;
    if (!(await receiptCheckGood(normalized)) || normalized?.errorObject) {
      await modalBox(`Failed to retrieve data.${normalized?.errorObject || ""}`, "Page Error!!");
      return;
    }

    this._items = Array.isArray(normalized) ? normalized : [];
    this.renderRows();
    this.bindEvents();
    this._loaded = true;
  }

  renderShell() {
    const label = this.dataset.label || this.getAttribute("aria-label") || toTitle(this.dataset.smlProperty || this.dataset.ccProperty || "Privileges");
    const headerActions = this.isDisplayOnly
      ? []
      : [
          { n: "button", type: "button", c: "dropdown-item", "data-action": "all", t: "Select All" },
          { n: "button", type: "button", c: "dropdown-item", "data-action": "none", t: "Select None" }
        ];

    const shell = {
      i: `${this.id}Envelope`,
      c: "d-flex p-2 bd-highlight shadow-lg w-100 sml-toggler-envelope",
      b: [
        {
          i: `${this.id}Card`,
          c: "card bg-light my-2 w-100 sml-toggler-card",
          b: [
            {
              i: `${this.id}Header`,
              c: "card-header fw-bolder",
              b: [{ n: "h4", i: `${this.id}CardTitle`, c: "card-title mb-0", t: label }]
            },
            {
              i: `${this.id}Body`,
              c: "card-body container-fluid sml-toggler-body",
              b: [
                {
                  n: "table",
                  i: `${this.id}Table`,
                  c: "table table-hover table-bordered table-striped mb-0 sml-toggler-table",
                  b: [
                    {
                      n: "thead",
                      c: "sticky-top alert alert-primary",
                      b: [
                        {
                          n: "tr",
                          b: [
                            {
                              n: "th",
                              colspan: "6",
                              c: "form-group",
                              b: [
                                {
                                  i: `${this.id}SearchWrap`,
                                  c: "d-flex flex-fill",
                                  b: [
                                    { i: `${this.id}SearchIcon`, c: "bi bi-search d-inline my-auto me-2" },
                                    { n: "input", type: "search", i: `${this.id}Search`, c: "border-0 form-control flex-fill", placeholder: "Search" }
                                  ]
                                }
                              ]
                            }
                          ]
                        },
                        {
                          n: "tr",
                          b: [
                            {
                              n: "th",
                              i: `${this.id}MenuCell`,
                              scope: "col",
                              b: this.isDisplayOnly
                                ? [{ n: "span", c: "fw-bold", t: "Granted" }]
                                : [{
                                    i: `${this.id}MenuDropDownDiv`,
                                    c: "dropdown",
                                    b: [
                                      { n: "button", type: "button", c: "btn btn-secondary dropdown-toggle float-start", "data-bs-toggle": "dropdown", b: [{ n: "i", c: "bi bi-list" }] },
                                      { i: `${this.id}Menu`, c: "dropdown-menu", b: headerActions }
                                    ]
                                  }]
                            },
                            { n: "th", scope: "col", colspan: "3", t: "Items" },
                            { n: "th", scope: "col", c: "text-center", b: [{ n: "i", t: "Details" }] }
                          ]
                        }
                      ]
                    },
                    { n: "tbody", i: `${this.id}TableBody`, b: [] }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    this.innerHTML = jmlToHtml(shell);
  }

  renderRows() {
    const body = this.querySelector(`#${this.id}TableBody`);
    if (!body) return;

    body.innerHTML = this._items.map((item) => jmlToHtml(this.buildRow(item))).join("");
  }

  buildRow(item) {
    const privilegeId = item.PrivilegeIdentifier;
    const granted = asBool(item.ComponentOwned ?? item.granted);
    const infoId = `${this.id}Info${privilegeId}`;

    return {
      n: "tr",
      "data-search-name": `${item.PrivilegeName || ""} ${item.PrivilegeDescription || ""}`.toUpperCase(),
      b: [
        {
          n: "td",
          c: "form-group sml-toggler-check-cell",
          b: [
            this.isDisplayOnly
              ? { n: "span", "data-pkid": privilegeId, "data-privilege-name": item.PrivilegeName, "data-privilege-description": item.PrivilegeDescription, b: [{ n: "i", c: granted ? "bi bi-check-square-fill" : "bi bi-square" }] }
              : {
                  n: "input",
                  type: "checkbox",
                  i: `${this.id}Check${privilegeId}`,
                  "data-pkid": privilegeId,
                  "data-privilege-name": item.PrivilegeName,
                  "data-privilege-description": item.PrivilegeDescription,
                  "data-task-definition-identifier": item.TaskDefinitionIdentifier,
                  "data-task-title": item.TaskTitle,
                  "data-prop-granted": String(granted),
                  checked: granted ? "checked" : undefined
                }
          ]
        },
        {
          n: "td",
          colspan: "3",
          c: "smlTogglerDataTD sml-toggler-data-cell",
          title: item.PrivilegeDescription || item.PrivilegeName || "",
          b: [
            {
              c: "d-flex flex-column",
              b: [
                { c: "p-2 fw-bold", t: item.PrivilegeName || "" },
                { i: infoId, c: "d-none p-2 alert alert-info smlTogglerInfoText", t: item.PrivilegeDescription || "" }
              ]
            }
          ]
        },
        {
          n: "td",
          c: "sml-toggler-info-cell",
          b: [
            {
              n: "button",
              type: "button",
              c: "btn btn-info smlTogglerInfo",
              "data-info-div": infoId,
              title: `${item.PrivilegeName || "Privilege"} for ${item.TaskTitle || "item"}`,
              b: [{ n: "i", c: "bi bi-info-circle-fill" }]
            }
          ]
        }
      ]
    };
  }

  bindEvents() {
    if (this._bound) return;
    this._bound = true;

    this.querySelector(`#${this.id}Search`)?.addEventListener("keyup", () => this.runSearch());
    this.querySelector(`#${this.id}Search`)?.addEventListener("search", () => this.runSearch());

    this.querySelectorAll("[data-action='all']").forEach((button) => button.addEventListener("click", () => this.setVisibleCheckboxes(true)));
    this.querySelectorAll("[data-action='none']").forEach((button) => button.addEventListener("click", () => this.setVisibleCheckboxes(false)));

    this.querySelectorAll(".smlTogglerInfo").forEach((button) => {
      button.addEventListener("click", () => this.toggleInfo(button.dataset.infoDiv));
    });
  }

  toggleInfo(infoId) {
    this.querySelectorAll(".smlTogglerInfoText").forEach((info) => {
      if (info.id === infoId) {
        info.classList.toggle("d-none");
      } else {
        info.classList.add("d-none");
      }
    });
  }

  runSearch() {
    const searchText = String(this.querySelector(`#${this.id}Search`)?.value || "").trim().toUpperCase();
    this.querySelectorAll("tbody tr").forEach((row) => {
      const haystack = String(row.dataset.searchName || "");
      row.classList.toggle("d-none", searchText.length > 0 && !haystack.includes(searchText));
    });
  }

  setVisibleCheckboxes(checked) {
    this.querySelectorAll("tbody tr:not(.d-none) input[type='checkbox']").forEach((checkbox) => {
      checkbox.checked = checked;
    });
  }
}

if (!customElements.get("sml-toggler")) {
  customElements.define("sml-toggler", smlToggler);
}

export default smlToggler;