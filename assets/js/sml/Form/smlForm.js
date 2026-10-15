//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
/* eslint-disable no-console */
"use strict";

import "./smlFormField.js";
import {
  alterEncapse,
  apiPostDirect,
  asBool,
  functionCall,
  isSmlClientOwned,
  jmlToHtml,
  modalBox,
  smlClientOrFetch,
  unobtrusiveWait,
  unobtrusiveWaitOff,
  toTitle,
  unAlterEncapse
} from "../smlUtils.js";
import Yeshua from "./Yeshua.js";
import "../Table/smlTable.js";
import "./smlToggler.js";

class smlForm extends HTMLElement {
  static observedAttributes = ["data-form-config"];

  static normalizeFieldInputType(inputType) {
    const normalized = String(inputType || "text").toLowerCase().trim();
    if (normalized.endsWith("autocomplete") && normalized !== "smlautocomplete") {
      return "smlautocomplete";
    }
    return normalized;
  }

  static normalizeActionType(actionType) {
    const token = String(actionType || "").toLowerCase().trim();
    if (!token) return "";
    if (["read", "view"].includes(token) || token.includes("read") || token.includes("view")) return "read";
    if (["delete", "remove", "deassign", "unassign"].includes(token) || token.includes("delete") || token.includes("remove") || token.includes("deassign") || token.includes("unassign")) return "delete";
    if (["create", "add"].includes(token) || token.includes("create") || token.includes("add")) return "create";
    if (["import", "importemployee"].includes(token) || token.includes("import")) return "create";
    if (["update", "edit"].includes(token) || token.includes("update") || token.includes("edit")) return "update";
    return "update";
  }

  static shouldRefreshAfterSuccess(actionType, actionResult) {
    if (actionResult?.shouldRefreshTable === true
      || actionResult?.refreshTable === true
      || actionResult?.reloadTable === true
      || actionResult?.refresh === true) {
      return true;
    }

    return smlForm.normalizeActionType(actionType) !== "read";
  }

  static getDefaultSuccessMessage(actionType) {
    const normalizedAction = smlForm.normalizeActionType(actionType);
    if (normalizedAction === "create") return "Record was created.";
    if (normalizedAction === "update") return "Record was updated.";
    if (normalizedAction === "delete") return "Record was removed.";
    return "Request completed successfully.";
  }

  static shouldHandle(formData, actionType) {
    const normalizedAction = smlForm.normalizeActionType(actionType)
      || smlForm.normalizeActionType(formData?.type)
      || smlForm.normalizeActionType(formData?.action);

    if (!["create", "read", "update", "delete"].includes(normalizedAction)) {
      return false;
    }

    const fields = Array.isArray(formData?.fields) ? formData.fields : [];
    if (fields.length < 1 && normalizedAction !== "delete") {
      return false;
    }

    const supportedInputTypes = new Set([
      "checkbox",
      "cctable",
      "cctoggler",
      "date",
      "datetime",
      "display",
      "email",
      "hidden",
      "number",
      "output",
      "phone",
      "select",
      "smlautocomplete",
      "smltable",
      "text",
      "textbox",
      "textarea"
    ]);

    return fields.every((field) => {
      const inputType = smlForm.normalizeFieldInputType(field?.inputType);
      return supportedInputTypes.has(inputType);
    });
  }

  static buildHostJml(formData, actionType, keyId, parentId, refreshAfterDelete, parentElement, triggerElement) {
    const focusId = String(
      formData?.focusId
      || triggerElement?.dataset?.focusId
      || (formData?.name === "CreateExecutiveOfficer" ? `${formData.name}UserIdentifierFormFieldTextSearch` : "")
    ).trim();

    return {
      n: "sml-form",
      i: formData.name + "SmlForm",
      c: "d-block w-100",
      "data-action": actionType,
      "data-key-value": keyId,
      "data-parent-key-value": parentId > -1 ? parentId : "",
      "data-refresh-after-delete": refreshAfterDelete ? "true" : "false",
      "data-parent-id": parentElement?.id || "",
      "data-parent-api": parentElement?.dataset?.api || "",
      "data-action-api": formData?.actionApi || triggerElement?.dataset?.api || "",
      "data-submit-api": formData?.submitApi || "",
      "data-focus-id": focusId,
      "data-form-config": JSON.stringify(formData)
    };
  }

  static async openFromParent(parentElement, evt, formData, actionType) {
    if (!smlForm.shouldHandle(formData, actionType)) {
      return false;
    }

    const triggerElement = evt?.currentTarget || evt?.target?.closest("button, sml-reactive-button, a") || evt?.target || null;
    const refreshAfterDelete = formData.refreshAfterDelete === true
      || formData.refreshAfterDelete === "true"
      || triggerElement?.dataset?.refreshAfterDelete === "true";

    if (typeof parentElement?.toggleTable === "function") {
      parentElement.toggleTable(0);
    } else {
      parentElement?.classList?.add("d-none");
    }

    const formCard = {
      i: formData.name + "FormCard",
      c: "card border-0 bg-lightgrey p-3 rounded-3 ccFormCard",
      "data-action": actionType,
      "data-refresh-after-delete": refreshAfterDelete ? "true" : "false",
      b: []
    };
    const formCardBody = { i: formData.name + "FormCardBody", c: "card-body container-fluid mb-0 pb-0", b: [] };
    const formCloseX = {
      n: "button",
      role: "button",
      c: "btn btn-secondary float-end formCloseButtonX",
      i: formData.name + "formCloseButtonX",
      "data-form": formData.name + "FormCard",
      "aria-label": "Close Form",
      b: [{ n: "span", c: "bi bi-x-square", "aria-hidden": "true" }]
    };
    const formCardBodyHead = { i: formData.name + "formHead", c: "row border-bottom border-dark border-1", b: [] };
    const formCardBodyHeadTitle = {
      i: "TitleDiv",
      c: "col text-center h3",
      s: "text-shadow: 1px 1px 1px navy;",
      t: formData.title
    };

    formCardBody.b.push(formCloseX);
    formCardBodyHead.b.push(formCardBodyHeadTitle);
    formCardBody.b.push(formCardBodyHead);
    formCard.b.push(formCardBody);
    formCard.b.push({ i: "RequiredLegend", c: "d-flex justify-content-center fw-bolder uc-astred", t: " Denotes Required Field →" });

    let keyId = formData.id || -1;
    if (keyId < 0) {
      keyId = triggerElement?.dataset?.rowId || -1;
    }

    let parentId = Number.parseInt(formData.parentId, 10) || -1;
    if (parentId < 0) {
      parentId = Number.parseInt(parentElement?.dataset?.parentKeyValue, 10) || -1;
    }

    formCard.b.push(smlForm.buildHostJml(formData, actionType, keyId, parentId, refreshAfterDelete, parentElement, triggerElement));

    const existingForm = document.querySelector("#" + formData.name + "FormCard");
    if (existingForm) {
      const existingHost = existingForm.querySelector("sml-form");
      const priorOwner = existingHost?.parentController?.closest?.(".ccFormCard")
        || existingForm.parentElement?.closest?.(".ccFormCard");
      existingForm.remove();
      smlForm.unlockOwningFormActions(priorOwner);
    }

    const insertionParent = parentElement?.dataset?.tableParent
      ? document.querySelector("#" + parentElement.dataset.tableParent)
      : parentElement;
    insertionParent?.insertAdjacentHTML("afterEnd", jmlToHtml(formCard));

    await Promise.resolve();
    const formElement = document.querySelector("#" + formData.name + "SmlForm");
    if (formElement) {
      if (isSmlClientOwned(parentElement)) {
        formElement.dataset.client = "true";
        if (parentElement.dataset.engine) {
          formElement.dataset.engine = parentElement.dataset.engine;
        }
      }
      formElement.initializeLifecycle(parentElement, triggerElement, formData, actionType);
    }
    const owningFormCard = parentElement?.closest?.(".ccFormCard");
    smlForm.lockOwningFormActions(owningFormCard);
    if (formData?.hideParent === true && owningFormCard) {
      const childCard = document.querySelector("#" + formData.name + "FormCard");
      owningFormCard.insertAdjacentElement("afterend", childCard);
      owningFormCard.classList.add("d-none");
      owningFormCard.dataset.smlHiddenForChild = "true";
    } else if (formData?.freezeParent === true) {
      smlForm.freezeOwningFormFields(owningFormCard);
    }
    functionCall(formData.name + "OpenForm", { evt, fd: formData, action: actionType });
    if (formElement && typeof formElement.focusConfiguredTarget === "function") {
      formElement.focusConfiguredTarget();
    }
    unobtrusiveWaitOff();
    return true;
  }

  connectedCallback() {
    this._formReady = true;
    this.render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this._formReady) return;
    if (name === "data-form-config" && oldValue !== newValue && this.isConnected) {
      this.render();
    }
  }

  get formConfig() {
    const rawConfig = this.getAttribute("data-form-config") || "{}";
    try {
      return JSON.parse(rawConfig);
    } catch (error) {
      try {
        return JSON.parse(unAlterEncapse(rawConfig));
      } catch {
        console.error("smlForm failed to parse form config", error);
        return {};
      }
    }
  }

  render() {
    const sform = this;
    const formData = sform.formConfig;
    if (!formData?.name || !Array.isArray(formData.fields)) {
      return;
    }

    const configKey = sform.getAttribute("data-form-config") || "";
    if (sform._renderedConfigKey === configKey && sform.querySelector("[data-sml-form-root='true']")) {
      return;
    }

    sform._renderedConfigKey = configKey;
    sform.classList.add("d-block", "w-100");
    sform.innerHTML = jmlToHtml(sform.buildFormJml(formData));
  }

  initializeLifecycle(parentElement, triggerElement, formData, actionType) {
    this.parentController = parentElement;
    this.triggerElement = triggerElement;
    this.formDataStore = formData;
    this.actionType = actionType;
    this.formCard = this.closest(".ccFormCard");
    this.formElement = this.querySelector("[data-sml-form-root='true']") || this;
    this.validator = new Yeshua({ formConfig: formData, formElement: this.formElement, actionType });
    this.wireLifecycle();
  }

  isVisibleFocusable(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.hasAttribute("disabled")) return false;
    if (element.getAttribute("type") === "hidden") return false;
    if (element.closest("[hidden], .d-none")) return false;
    return true;
  }

  focusConfiguredTarget() {
    const focusId = String(this.dataset.focusId || "").trim();
    if (!focusId) {
      this.focusInitialField();
      return;
    }

    const tryFocusByDomId = () => {
      const target = document.getElementById(focusId)
        || this.querySelector(`#${CSS.escape(focusId)}`);

      if (!this.isVisibleFocusable(target)) return false;
      target.focus();
      return document.activeElement === target;
    };

    const attemptFocus = (attemptsRemaining = 30) => {
      if (tryFocusByDomId() || attemptsRemaining < 1) return;
      requestAnimationFrame(() => {
        attemptFocus(attemptsRemaining - 1);
      });
    };

    requestAnimationFrame(() => {
      attemptFocus();
    });
  }

  focusInitialField() {
    const formName = String(this.formDataStore?.name || "").trim();
    const preferredProperties = formName === "CreateExecutiveOfficer"
      ? ["UserIdentifier"]
      : [];

    const tryFocus = () => {
      for (const propertyName of preferredProperties) {
        const autoCompleteInput = this.querySelector(
          `sml-form-field[data-sml-property="${propertyName}"] sml-auto-complete input[type="search"]`
        );
        if (this.isVisibleFocusable(autoCompleteInput)) {
          autoCompleteInput.focus();
          return true;
        }

        const standardInput = this.querySelector(
          `input[data-sml-property="${propertyName}"]:not([type="hidden"]), textarea[data-sml-property="${propertyName}"], select[data-sml-property="${propertyName}"]`
        );
        if (this.isVisibleFocusable(standardInput)) {
          standardInput.focus();
          return true;
        }
      }

      return false;
    };

    const attemptFocus = (attemptsRemaining = 12) => {
      if (tryFocus() || attemptsRemaining < 1) return;
      requestAnimationFrame(() => {
        attemptFocus(attemptsRemaining - 1);
      });
    };

    requestAnimationFrame(() => {
      attemptFocus();
    });
  }

  wireLifecycle() {
    const sform = this;
    if (!sform.formCard || sform.dataset.lifecycleWired === "true") {
      return;
    }

    sform.dataset.lifecycleWired = "true";
    const closeButtons = sform.formCard.querySelectorAll(".formCloseButtonX, [id$='formCloseButton']");
    closeButtons.forEach(button => {
      button.addEventListener("click", (evt) => {
        evt.preventDefault();
        sform.closeForm();
      });
    });

    const resetButton = sform.formCard.querySelector("[id$='formResetButton']");
    resetButton?.addEventListener("click", (evt) => {
      evt.preventDefault();
      sform.resetForm();
    });

    const submitButton = sform.formCard.querySelector("[id$='formSubmitButton']");
    submitButton?.addEventListener("click", async (evt) => {
      evt.preventDefault();
      await sform.submitForm();
    });

    const deleteButton = sform.formCard.querySelector("[id$='formDeleteButton']");
    deleteButton?.addEventListener("click", async (evt) => {
      evt.preventDefault();
      const mode = String(sform.actionType || sform.dataset.action || "").toLowerCase();
      if (mode === "read") {
        await sform.closeForm();
        await smlForm.openFromParent(
          sform.parentController,
          { currentTarget: sform.triggerElement, target: sform.triggerElement },
          sform.formDataStore,
          "Delete"
        );
        return;
      }

      await sform.submitForm();
    });

  }

  wireValidity() {
    const sform = this;
    const requiredFields = sform.querySelectorAll("sml-form-field[data-is-required='true']");
    requiredFields.forEach(field => {
      const input = sform.resolveFieldInput(field);
      if (!input || input.dataset.smlFormWired === "true") {
        return;
      }
      input.dataset.smlFormWired = "true";
      const validate = () => sform.validateField(field);
      input.addEventListener("change", validate);
      input.addEventListener("input", validate);
      input.addEventListener("blur", validate);
    });
  }

  resolveFieldInput(field) {
    return field.querySelector("input[data-sml-property], textarea[data-sml-property], select[data-sml-property], input[data-cc-property], textarea[data-cc-property], select[data-cc-property]")
      || field.querySelector("input, textarea, select");
  }

  getFieldValue(input) {
    if (!input) {
      return "";
    }
    if (input.type === "checkbox") {
      return input.checked ? "true" : "false";
    }
    return String(input.value ?? "").trim();
  }

  validateField(field) {
    const sform = this;
    const input = sform.resolveFieldInput(field);
    const isRequired = field?.dataset?.isRequired === "true";
    if (!input || !isRequired) {
      return true;
    }

    const isValid = sform.getFieldValue(input) !== "";
    input.classList.toggle("is-invalid", !isValid);
    field.classList.toggle("smlInvalid", !isValid);
    return isValid;
  }

  async validateForm() {
    const sform = this;
    if (sform.validator?.validateForm) {
      return sform.validator.validateForm();
    }

    const requiredFields = Array.from(sform.querySelectorAll("sml-form-field[data-is-required='true']"));
    return requiredFields.every(field => sform.validateField(field));
  }

  collectFormData() {
    const sform = this;
    const record = {};
    const messages = [];
    const selectTextMappings = [];
    const inputs = sform.querySelectorAll("input[data-sml-property], textarea[data-sml-property], select[data-sml-property], input[data-cc-property], textarea[data-cc-property], select[data-cc-property]");

    const upsertFormDataMessage = (name, details) => {
      const existing = messages.find(msg => msg.type === "FormData" && msg.name === name);
      if (existing) {
        existing.details = details;
        return;
      }
      messages.push({ type: "FormData", name, details });
    };

    inputs.forEach(input => {
      const fieldName = input.dataset.smlProperty || input.dataset.ccProperty;
      if (!fieldName) {
        return;
      }

      const inputHost = input.closest("sml-input");
      const hostType = String(inputHost?.dataset?.type || "").toLowerCase();

      const value = sform.getFieldValue(input);
      record[fieldName] = value;
      messages.push({ type: "FormData", name: fieldName, details: value });

      let selectedText = "";
      if (input.tagName === "SELECT") {
        selectedText = String(input.selectedOptions?.[0]?.text || "").trim();
      } else if (hostType === "select") {
        const facadeSelect = inputHost?.querySelector("select");
        selectedText = String(facadeSelect?.selectedOptions?.[0]?.text || "").trim();
      } else if (hostType === "smlautocomplete") {
        const autoComplete = inputHost?.querySelector("sml-auto-complete");
        selectedText = String(autoComplete?.textInput?.value || "").trim();
      }

      if (selectedText) {
        messages.push({ type: "FormData", name: fieldName + "Text", details: selectedText });

        const mappedTextFieldName = String(
          input.dataset.selectTextProperty
          || inputHost?.dataset?.selectTextProperty
          || input.closest("sml-form-field")?.dataset?.selectTextProperty
          || ""
        ).trim();
        if (mappedTextFieldName) {
          selectTextMappings.push({ fieldName: mappedTextFieldName, selectedText });
        }
      }
    });

    selectTextMappings.forEach(({ fieldName, selectedText }) => {
      record[fieldName] = selectedText;
      upsertFormDataMessage(fieldName, selectedText);
    });

    const togglers = sform.querySelectorAll("sml-toggler[data-sml-property], sml-toggler[data-cc-property]");
    togglers.forEach((toggler) => {
      const fieldName = toggler.dataset.smlProperty || toggler.dataset.ccProperty;
      if (!fieldName) {
        return;
      }

      const togglerData = Array.from(toggler.querySelectorAll("table input[type='checkbox']")).map((check) => ({
        type: "TogglerData",
        name: check.dataset.pkid,
        value: check.checked,
        altText: check.dataset.privilegeName
      }));

      const togglerValue = alterEncapse(JSON.stringify(togglerData));
      record[fieldName] = togglerValue;
      messages.push({ type: "FormData", name: fieldName, details: togglerValue });
    });

    return { record, messages };
  }

  resolveReportingSecurity(){
    const owner = this.parentController;
    // A table nested inside another form carries its own record type, so the page contract
    // describes the parent's fields and would strip every child field it does not name.
    if (owner?.closest?.("sml-form")) {
      return owner.localConfig?.security || owner._tableConfig?.security || null;
    }

    const page = this.closest("sml-page");
    const host = this.closest("[data-configs-page='true'], [data-sml-generated-page='true']");
    const reporting = this.closest("sml-reporting") || page?.querySelector("sml-reporting");
    return reporting?.report?.security
      || reporting?.localConfig?.security
      || host?.config?.security
      || page?.config?.security
      || null;
  }

  applyFormSecurity(record, messages){
    const security = this.resolveReportingSecurity();
    const actionType = String(this.actionType || this.dataset.action || "").toLowerCase();
    const allowedFields = actionType === "update"
      ? (Array.isArray(security?.allowedUpdateFields) && security.allowedUpdateFields.length > 0
          ? security.allowedUpdateFields
          : security?.allowedCreateFields)
      : security?.allowedCreateFields;
    const allowedCreate = Array.isArray(allowedFields) ? allowedFields : [];
    if(allowedCreate.length < 1){
      return { record, messages };
    }

    const allowed = new Set(allowedCreate.map((name)=>String(name || "").trim().toLowerCase()).filter(Boolean));
    const keepName = (name)=>{
      const key = String(name || "").trim().toLowerCase();
      if(!key) return false;
      if(allowed.has(key)) return true;
      if(key.endsWith("text")){
        return allowed.has(key.slice(0, -4));
      }
      return false;
    };

    const nextRecord = {};
    Object.entries(record || {}).forEach(([name, value])=>{
      if(keepName(name)) nextRecord[name] = value;
    });

    const nextMessages = (Array.isArray(messages) ? messages : []).filter((message)=>keepName(message?.name));
    return { record: nextRecord, messages: nextMessages };
  }

  resolveSubmitUrl() {
    const sform = this;
    const explicitSubmitApi = String(sform.dataset.submitApi || sform.formDataStore?.submitApi || "").trim();
    if (explicitSubmitApi) {
      return explicitSubmitApi;
    }

    const baseApiUrl = sform.dataset.actionApi || sform.formDataStore?.actionApi || sform.dataset.parentApi || sform.parentController?.dataset?.api || "";
    const requestType = sform.getRequestType();

    const apiUrl = String(baseApiUrl || "").trim();
    if (!apiUrl) {
      return requestType;
    }

    const endpointOnly = apiUrl.split("/").filter(Boolean).pop() || apiUrl;
    if (endpointOnly.startsWith("Api") && endpointOnly.endsWith(requestType)) {
      return apiUrl;
    }

    const lastSlash = apiUrl.lastIndexOf("/");
    const prefix = lastSlash > -1 ? apiUrl.substring(0, lastSlash + 1) : "";
    const endpoint = lastSlash > -1 ? apiUrl.substring(lastSlash + 1) : apiUrl;
    const actionMatch = endpoint.match(/^Api([A-Za-z0-9]+?)(AddForm[A-Za-z0-9]+Action|Form[A-Za-z0-9]+Action|Form[A-Za-z0-9]+FormSubmit|Form[A-Za-z0-9]+FormDelete)$/i);
    if (actionMatch) {
      return `${prefix}Api${actionMatch[1]}${requestType}`;
    }

    const baseEndpoint = endpoint.replace(/(SimpleSearch|RptReportingSearch|TableRows)$/i, "");
    return `${prefix}${baseEndpoint}${requestType}`;
  }

  getRequestType() {
    const sform = this;
    const actionType = String(sform.actionType || sform.dataset.action || "");
    const actionTypeLower = actionType.toLowerCase();
    const formName = String(sform.formConfig?.name || "");

    if (actionTypeLower === "create" && formName) {
      return formName.toLowerCase().endsWith("form")
        ? `Form${formName}Submit`
        : `Form${formName}FormSubmit`;
    }

    if (actionTypeLower === "update") {
      return "FormUpdateFormSubmit";
    }

    if (actionTypeLower === "delete") {
      if (formName.toLowerCase().startsWith("delete")) {
        return "FormDeleteFormDelete";
      }
      return "FormReadFormDelete";
    }

    return `Form${actionType}FormSubmit`;
  }

  async submitForm() {
    const sform = this;
    if (!(await sform.validateForm())) {
      return;
    }

    const collected = sform.collectFormData();
    const actionType = String(sform.actionType || "").toLowerCase();
    const { record, messages } = (actionType === "create" || actionType === "update")
      ? sform.applyFormSecurity(collected.record, collected.messages)
      : collected;
    const keyValue = Number.parseInt(sform.formElement?.dataset?.keyValue || "-1", 10);
    const actionObj = {
      requestType: sform.getRequestType(),
      action: { type: sform.actionType, id: keyValue, otherData: JSON.stringify(record) },
      messages
    };
    if (sform.formElement?.dataset?.parentKeyValue) {
      actionObj.parentKeyValue = sform.formElement.dataset.parentKeyValue;
    }

    functionCall((sform.formConfig?.name || "") + "PreSubmitForm", sform.formElement);
    unobtrusiveWait("Please Wait -- Saving your data. Please wait");
    try {
      const submitUrl = sform.resolveSubmitUrl();
      let actionResult = await smlClientOrFetch(sform, {
        kind: "form-submit",
        api: submitUrl,
        body: actionObj
      }, () => apiPostDirect(submitUrl, JSON.stringify(actionObj)));
      if (typeof actionResult === "string") {
        try {
          actionResult = JSON.parse(actionResult);
        } catch {
          // leave as-is for modal fallback
        }
      }

      // Temporary server-compat shim: keep until endpoints return title consistently.
      if (actionResult?.buttonType && !actionResult?.title) {
        actionResult.title = actionResult.buttonType;
      }
      if (actionResult?.ErrorObject && !actionResult?.errorObject) {
        actionResult.errorObject = actionResult.ErrorObject;
      }

      const errorMessage = actionResult?.errorObject || actionResult?.ErrorObject;

      if (errorMessage && actionResult?.buttonType) {
        const modalTitle = String(actionResult?.buttonType || "").trim() || "Page Error!!";

        const modalOrigin = String(actionResult?.origin || actionResult?.dataOrigin || "").trim();

        await modalBox(
          errorMessage,
          modalTitle,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          false,
          undefined,
          undefined,
          undefined,
          modalOrigin
        );
        return;
      }

      if (errorMessage && !actionResult?.buttonType) {
        const modalOrigin = String(actionResult?.origin || actionResult?.dataOrigin || "").trim();
        const errorModal = await modalBox(
          errorMessage,
          "Page Error!!",
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          false,
          undefined,
          undefined,
          undefined,
          modalOrigin
        );
        if (modalOrigin && errorModal?.dataset) {
          errorModal.dataset.origin = modalOrigin;
        }
        return;
      }

      const usedFallbackMessage = !(typeof actionResult?.message === "string" && actionResult.message.trim());
      const baseMessage = usedFallbackMessage
        ? smlForm.getDefaultSuccessMessage(sform.actionType || sform.dataset.action)
        : actionResult.message;

      // The server rejects fields the form never offered, and says so here.
      const securityNotice = String(actionResult?.securityNotice || actionResult?.SecurityNotice || "").trim();
      const message = securityNotice ? `${baseMessage} ${securityNotice}` : baseMessage;
      const modalTitle = String(actionResult?.buttonType || "").trim() || "Record Updated";

      const modalOrigin = String(actionResult?.origin || actionResult?.dataOrigin || "").trim();

      const modal = await modalBox(
        message,
        modalTitle,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        undefined,
        modalOrigin
      );
      if (modalOrigin && modal?.dataset) {
        modal.dataset.origin = modalOrigin;
      }
      await sform.closeForm();
      const shouldRefreshTable = smlForm.shouldRefreshAfterSuccess(sform.actionType || sform.dataset.action, actionResult)
        || (String(sform.dataset.refreshAfterDelete || "").toLowerCase() === "true"
          && smlForm.normalizeActionType(sform.dataset.action) === "delete");

      if (shouldRefreshTable) {
        await sform.parentController?.loadDataFromApi?.();
      }
    } finally {
      unobtrusiveWaitOff();
    }
  }

  async closeForm() {
    const sform = this;
    const owningFormCard = sform.parentController?.closest?.(".ccFormCard");
    sform.formCard?.remove();
    if (owningFormCard?.dataset.smlHiddenForChild === "true") {
      owningFormCard.classList.remove("d-none");
      delete owningFormCard.dataset.smlHiddenForChild;
    }
    smlForm.thawOwningFormFields(owningFormCard);
    smlForm.unlockOwningFormActions(owningFormCard);
    if (typeof sform.parentController?.toggleTable === "function") {
      await sform.parentController.toggleTable(1);
    } else {
      sform.parentController?.classList?.remove("d-none");
    }
  }

  static getOwnFormActionButtons(formCard) {
    if (!formCard || typeof formCard.querySelectorAll !== "function") {
      return [];
    }

    return Array.from(formCard.querySelectorAll(".formCloseButtonX, [id$='formCloseButton'], [id$='formSubmitButton'], [id$='formDeleteButton']"))
      .filter((button) => button.closest(".ccFormCard") === formCard);
  }

  static setOwningFormActionsDisabled(formCard, disabled) {
    smlForm.getOwnFormActionButtons(formCard).forEach((button) => {
      button.disabled = disabled;
      button.setAttribute("aria-disabled", disabled ? "true" : "false");
      if (disabled) {
        button.dataset.smlNestedFormLocked = "true";
      } else {
        delete button.dataset.smlNestedFormLocked;
      }
    });
  }

  static freezeOwningFormFields(formCard) {
    if (!formCard) return;
    formCard.querySelectorAll("input, select, textarea").forEach((control) => {
      if (control.closest(".ccFormCard") !== formCard || control.dataset.smlFrozen === "true") return;
      control.dataset.smlFrozen = "true";
      control.dataset.smlWasDisabled = control.disabled ? "true" : "false";
      control.disabled = true;
    });
  }

  static thawOwningFormFields(formCard) {
    if (!formCard) return;
    formCard.querySelectorAll("[data-sml-frozen='true']").forEach((control) => {
      if (control.closest(".ccFormCard") !== formCard) return;
      control.disabled = control.dataset.smlWasDisabled === "true";
      delete control.dataset.smlFrozen;
      delete control.dataset.smlWasDisabled;
    });
  }

  static lockOwningFormActions(formCard) {
    if (!formCard) return;
    const lockCount = Number.parseInt(String(formCard.dataset.smlChildFormLocks || "0"), 10) || 0;
    formCard.dataset.smlChildFormLocks = String(lockCount + 1);
    smlForm.setOwningFormActionsDisabled(formCard, true);
  }

  static unlockOwningFormActions(formCard) {
    if (!formCard) return;
    const lockCount = Number.parseInt(String(formCard.dataset.smlChildFormLocks || "0"), 10) || 0;
    const nextCount = Math.max(0, lockCount - 1);
    formCard.dataset.smlChildFormLocks = String(nextCount);
    if (nextCount < 1) {
      smlForm.setOwningFormActionsDisabled(formCard, false);
      delete formCard.dataset.smlChildFormLocks;
    }
  }

  buildFormJml(formData) {
    const sform = this;
    const actionType = sform.dataset.action || formData.action || formData.type || "Create";
    const actionTypeLower = String(actionType).toLowerCase();
    const readOnly = actionTypeLower === "read" || actionTypeLower === "delete";
    const keyValue = sform.dataset.keyValue || formData.id || -1;
    const parentKeyValue = sform.dataset.parentKeyValue;
    const visibleFields = [];
    const hiddenFields = [];
    const seenFieldKeys = new Set();

    for (const field of formData.fields) {
      const fieldKey = String(field?.propertyName || field?.name || "").trim().toLowerCase();
      if (fieldKey && seenFieldKeys.has(fieldKey)) {
        continue;
      }

      if (sform.isHiddenField(field, formData)) {
        if (fieldKey) {
          seenFieldKeys.add(fieldKey);
        }
        hiddenFields.push(sform.buildHiddenFieldJml(formData, field));
        continue;
      }

      const visibleField = sform.buildVisibleFieldJml(formData, field, readOnly, keyValue);
      if (visibleField) {
        if (fieldKey) {
          seenFieldKeys.add(fieldKey);
        }
        visibleFields.push(visibleField);
      }
    }

    const formJml = {
      n: "div",
      i: formData.name + "Form",
      role: "group",
      c: "form container-fluid",
      "data-action": actionType,
      "data-refresh-after-delete": sform.dataset.refreshAfterDelete || "false",
      "data-key-value": keyValue,
      "data-sml-form-root": "true",
      b: [
        { i: formData.name + "visibleFieldsCard", c: "d-flex flex-wrap bg-lightgrey", b: visibleFields },
        { i: "inVisibleFieldsCard", c: "d-none", b: hiddenFields },
        sform.buildButtonBarJml(formData, actionType)
      ]
    };

    if (parentKeyValue !== undefined && parentKeyValue !== null && String(parentKeyValue) !== "") {
      formJml["data-parent-key-value"] = parentKeyValue;
    }

    return formJml;
  }

  // A field on a form is a field the config asked for. Hiding one is what the Hidden input
  // type is for; nothing is inferred from the field's name.
  isHiddenField(field) {
    return smlForm.normalizeFieldInputType(field?.inputType) === "hidden";
  }

  buildVisibleFieldJml(formData, field, readOnly, keyValue) {
    const inputType = smlForm.normalizeFieldInputType(field?.inputType);
    switch (inputType) {
      case "smlautocomplete":
        return this.buildAutocompleteFieldJml(formData, field, readOnly);
      case "cctoggler":
        return this.buildCcTogglerFieldJml(formData, field, readOnly);
      case "select":
        return this.buildSelectFieldJml(formData, field, readOnly);
      case "checkbox":
        return this.buildCheckboxFieldJml(formData, field, readOnly);
      case "cctable":
        return this.buildCcTableFieldJml(formData, field, keyValue);
      case "phone":
      case "email":
      case "textbox":
      case "text":
      case "textarea":
      case "number":
      case "date":
      case "datetime":
      case "display":
      default:
        return this.buildStandardFieldJml(formData, field, readOnly);
    }
  }

  buildStandardFieldJml(formData, field, readOnly) {
    const inputType = this.normalizeInputType(field.inputType, readOnly);
    const fieldJml = this.buildBaseFieldJml(formData, field, inputType);
    const rawInputType = String(field.inputType || "text").toLowerCase();
    if (inputType === "output") {
      let outputType = rawInputType === "textbox" ? "text" : rawInputType;
      if (outputType === "text") {
        const propName = String(field?.propertyName || field?.name || "").toLowerCase();
        const label = String(field?.label || "").toLowerCase();
        // Preserve long-text semantics for read-only fields that historically arrive as Display.
        if (propName.includes("exception") || propName.includes("detail") || label.includes("details")) {
          outputType = "textarea";
        }
      }
      fieldJml["data-output-type"] = outputType;
      if (outputType === "textarea") {
        fieldJml["data-force-textarea"] = "true";
        fieldJml["data-output-textarea"] = "true";
      }
    }
    if (rawInputType === "textarea") {
      fieldJml["data-force-textarea"] = "true";
    }
    fieldJml["data-text"] = field.defaultValue || "";
    fieldJml["data-default-value"] = field.defaultValue || "";
    if (field.sfDefaultValueShow) {
      fieldJml["data-sf-default-value-show"] = field.sfDefaultValueShow;
    }
    if (readOnly) {
      fieldJml["data-readonly"] = "true";
    }
    return fieldJml;
  }

  buildSelectFieldJml(formData, field, readOnly) {
    const fieldJml = this.buildBaseFieldJml(formData, field, "select");
    fieldJml["data-dropdown"] = field.sfDropDownJson || "[]";
    fieldJml["data-default-value"] = field.defaultValue || "";
    if (field.sfSelectTextProperty) {
      fieldJml["data-select-text-property"] = field.sfSelectTextProperty;
    }
    if (field.sfDefaultValueShow) {
      fieldJml["data-sf-default-value-show"] = field.sfDefaultValueShow;
    }
    if (readOnly) {
      fieldJml["data-readonly"] = "true";
    }
    return fieldJml;
  }

  buildCheckboxFieldJml(formData, field, readOnly) {
    const inputType = readOnly ? "output" : "checkbox";
    const fieldJml = this.buildBaseFieldJml(formData, field, inputType);
    const normalizedValue = asBool(field.defaultValue) ? "true" : "false";
    fieldJml["data-default-value"] = normalizedValue;
    fieldJml["data-text"] = normalizedValue;
    if (readOnly) {
      fieldJml["data-output-type"] = "checkbox";
    }
    if (readOnly) {
      fieldJml["data-readonly"] = "true";
    }
    return fieldJml;
  }

  buildAutocompleteFieldJml(formData, field, readOnly) {
    const fieldJml = this.buildBaseFieldJml(formData, field, readOnly ? "output" : "smlautocomplete");
    fieldJml["data-api"] = field.sfApiCall || "";
    fieldJml["data-api-value"] = field.selectText || field.sfSelectTextProperty || "text";
    fieldJml["data-api-id"] = field.selectId || "id";
    if (field.sfSelectTextProperty) {
      fieldJml["data-select-text-property"] = field.sfSelectTextProperty;
    }
    if (field.sfApiMinLengthForCall !== undefined && field.sfApiMinLengthForCall !== null && field.sfApiMinLengthForCall !== "") {
      fieldJml["data-min-chars"] = String(field.sfApiMinLengthForCall);
    }
    if (field.sfPropsDown) {
      fieldJml["data-api-props-down"] = field.sfPropsDown;
    }
    if (field.sfPropsUp) {
      fieldJml["data-api-filters-up"] = field.sfPropsUp;
    }
    fieldJml["data-default-value"] = field.defaultValue || "";
    fieldJml["data-text"] = field.defaultValue || "";
    if (readOnly) {
      fieldJml["data-readonly"] = "true";
    }
    return fieldJml;
  }

  buildCcTogglerFieldJml(formData, field, readOnly) {
    const propertyName = field.propertyName || field.name || "";
    const fieldName = field.name || propertyName || "Toggler";
    return {
      i: formData.name + fieldName + "FormGroup",
      c: "form-floating border border-1 border-dark m-2 p-2 w-75 center mx-auto",
      b: [
        {
          i: formData.name + fieldName + "Envelope",
          c: "flex-row",
          b: [
            {
              n: "sml-toggler",
              i: field.fieldId || (formData.name + fieldName + "Toggler"),
              c: "w-100",
              title: field.title || field.label || "Toggle Field",
              "data-sml-property": propertyName,
              "data-cc-property": propertyName,
              "data-api": field.sfApiCall || "",
              "data-key-value": this.dataset.keyValue || formData.id || "",
              "data-parent-key-value": this.dataset.parentKeyValue || formData.parentId || "",
              "data-display-only": readOnly ? "true" : "false"
            }
          ]
        }
      ]
    };
  }

  buildCcTableFieldJml(formData, field, keyValue) {
    const tableId = field.fieldId || `${formData.name}${field.name || field.propertyName || "Child"}Table`;
    const searchApi = this.resolveChildTableSearchApi(field.sfApiCall || "");
    return {
      i: formData.name + (field.name || field.propertyName || "Child") + "FormGroup",
      c: "form-floating border border-1 border-dark m-2 p-2 w-100",
      b: [
        {
          i: formData.name + (field.name || field.propertyName || "Child") + "Envelope",
          c: "flex-row",
          b: [
            {
              n: "sml-table",
              i: tableId,
              c: "w-100",
              title: field.title || field.label || "Child Table",
              "data-sml-property": field.propertyName || field.name || "",
              "data-cc-property": field.propertyName || field.name || "",
              "data-api": searchApi || field.sfApiCall || "",
              "data-search-api": searchApi || field.sfApiCall || "",
              "data-parent-key-value": keyValue > -1 ? keyValue : "",
              ...(isSmlClientOwned(this) ? { "data-client": "true" } : {})
            }
          ]
        }
      ]
    };
  }

  resolveChildTableSearchApi(apiUrl) {
    const normalizedApiUrl = String(apiUrl || "").trim().replace(/^~(?=\/)/, "");
    const pathMatch = normalizedApiUrl.match(/^(\/[^/]+)\/([A-Za-z0-9_]+API)$/);
    if (!pathMatch) {
      return "";
    }

    return `${pathMatch[1]}/Api${pathMatch[2]}SimpleSearch`;
  }

  buildHiddenFieldJml(formData, field) {
    const propertyName = field.propertyName || field.name;
    const fieldName = field.name || propertyName;
    const value = field.defaultValue || "";
    const hiddenField = this.buildBaseFieldJml(formData, field, "hidden");
    const hiddenInput = {
      n: "sml-input",
      i: formData.name + fieldName + "FormFieldInput",
      title: field.title || field.label || propertyName,
      "data-type": "hidden",
      "data-text": value,
      "data-default-value": value,
      "data-sml-property": propertyName,
      "data-cc-property": propertyName
    };
    hiddenField.c = "d-none";
    hiddenField["data-text"] = value;
    hiddenField["data-default-value"] = value;
    hiddenField.b = [hiddenInput];

    if (field.isKey) {
      hiddenInput["data-key"] = "true";
    }
    if (field.isPIIorPHI) {
      hiddenInput["data-pii"] = "true";
    }
    if (field.isParentKey) {
      hiddenInput["data-parent-key"] = "true";
    }
    return hiddenField;
  }

  buildBaseFieldJml(formData, field, inputType) {
    const propertyName = field.propertyName || field.name;
    const label = field.label || toTitle(propertyName);
    const title = field.title || label;
    const propertyType = this.resolvePropertyType(formData, field);
    const fieldJml = {
      n: "sml-form-field",
      i: formData.name + field.name + "FormField",
      title,
      "data-label": label,
      "data-icon": field.icon || "",
      "data-sml-property": propertyName,
      "data-input-type": inputType,
      "data-is-required": field.isRequired ? "true" : "false"
    };
    // An authored class replaces the field's default styling, the same way query actions work.
    const authoredClass = String(field.htmlClass || "").trim();
    if (authoredClass) {
      fieldJml.c = authoredClass;
    }
    if (formData?.name === "CreateExecutiveOfficer" && propertyName === "UserIdentifier") {
      fieldJml["data-initial-focus"] = "true";
    }
    const configuredSecondaryFocus = String(field?.secondaryFocus || field?.focusSecondary || "").trim();
    if (configuredSecondaryFocus) {
      fieldJml["data-secondary-focus"] = configuredSecondaryFocus;
    } else if (formData?.name === "CreateExecutiveOfficer" && propertyName === "UserIdentifier") {
      fieldJml["data-secondary-focus"] = "RoleIdentifier";
    }
    if (propertyType) {
      fieldJml["data-property-type"] = propertyType;
    }
    if (field.sfNumberLowRange !== undefined && field.sfNumberLowRange !== null && field.sfNumberLowRange !== "") {
      fieldJml["data-sf-number-low-range"] = field.sfNumberLowRange;
    }
    if (field.sfNumberHighRange !== undefined && field.sfNumberHighRange !== null && field.sfNumberHighRange !== "") {
      fieldJml["data-sf-number-high-range"] = field.sfNumberHighRange;
    }
    if (field.minLength !== undefined && field.minLength !== null && field.minLength !== "") {
      fieldJml["data-min-length"] = field.minLength;
    }
    if (field.maxLength !== undefined && field.maxLength !== null && field.maxLength !== "") {
      const parsedMaxLength = Number(field.maxLength);
      if (Number.isFinite(parsedMaxLength) && parsedMaxLength > 0) {
        fieldJml["data-max-length"] = parsedMaxLength;
      }
    }
    if (field.pattern !== undefined && field.pattern !== null && field.pattern !== "") {
      fieldJml["data-pattern"] = field.pattern;
    }
    if (field.placeholder !== undefined) {
      fieldJml["data-placeholder"] = field.placeholder;
    }
    return fieldJml;
  }

  resolvePropertyType(formData, field) {
    const directType = String(field?.simpleType || field?.type || field?.propertyType || "").trim();
    if (directType) {
      return directType;
    }

    const propertyName = String(field?.propertyName || field?.name || "").toLowerCase();
    if (!propertyName) {
      return "";
    }

    const properties = Array.isArray(formData?.properties) ? formData.properties : [];
    const matchedProperty = properties.find((prop) => String(prop?.name || "").toLowerCase() === propertyName);
    return String(matchedProperty?.simpleType || matchedProperty?.type || matchedProperty?.PropertyType || "").trim();
  }

  normalizeInputType(inputType, readOnly) {
    const normalized = smlForm.normalizeFieldInputType(inputType);
    if (readOnly) {
      if (normalized === "textarea") {
        return "textarea";
      }
      return "output";
    }

    switch (normalized) {
      case "textbox":
        return "text";
      case "display":
        return "output";
      default:
        return normalized;
    }
  }

  resetForm() {
    this.querySelectorAll("sml-input").forEach((input) => {
      input.value = input.dataset.defaultValue || "";
    });
    this.querySelectorAll("sml-auto-complete").forEach((autoComplete) => {
      if (autoComplete.textInput) autoComplete.textInput.value = "";
    });
  }

  buildButtonBarJml(formData, actionType) {
    const buttonBar = {
      i: formData.name + "ButtonBar",
      c: "py-2 border-top border-1 border-dark shadow shadow-lg shadow-dark d-flex justify-content-evenly rounded-3",
      b: []
    };

    const customButtons = Array.isArray(formData.buttons) ? formData.buttons : [];
    if (customButtons.length > 0) {
      customButtons.forEach((label) => {
        const name = String(label || "").trim();
        if (name === "Back" || name === "Cancel" || name === "Close") {
          buttonBar.b.push({ n: "button", role: "button", type: "button", c: "btn btn-lg btn-secondary", i: formData.name + "formCloseButton", "data-form": formData.name + "FormCard", t: name });
        } else if (name === "Reset") {
          buttonBar.b.push({ n: "button", role: "button", type: "button", c: "btn btn-lg btn-outline-secondary", i: formData.name + "formResetButton", t: "Reset" });
        } else if (name === "Save") {
          buttonBar.b.push({ n: "button", role: "button", type: "button", c: "btn btn-lg btn-success", i: formData.name + "formSubmitButton", t: "Save" });
        }
      });
      return buttonBar;
    }

    switch (String(actionType)) {
      case "Read":
        buttonBar.b.push({ n: "button", role: "button", type: "button", c: "btn btn-lg btn-secondary", i: formData.name + "formCloseButton", "data-form": formData.name + "FormCard", t: "Close" });
        if (formData.allowDelete) {
          buttonBar.b.push({ n: "button", role: "button", type: "button", c: "btn btn-lg btn-danger", i: formData.name + "formDeleteButton", "data-form": formData.name + "FormCard", t: "Delete" });
        }
        break;
      case "Delete":
        buttonBar.b.push({ n: "button", role: "button", type: "button", c: "btn btn-lg btn-secondary", i: formData.name + "formCloseButton", "data-form": formData.name + "FormCard", t: "Cancel" });
        buttonBar.b.push({ n: "button", role: "button", type: "button", c: "btn btn-lg btn-danger", i: formData.name + "formDeleteButton", "data-form": formData.name + "FormCard", t: "Delete" });
        break;
      default:
        buttonBar.b.push({ n: "button", role: "button", type: "button", c: "btn btn-lg btn-secondary", i: formData.name + "formCloseButton", "data-form": formData.name + "FormCard", t: "Cancel" });
        buttonBar.b.push({ n: "button", role: "button", type: "button", c: "btn btn-lg btn-success", i: formData.name + "formSubmitButton", t: "Save" });
        break;
    }

    return buttonBar;
  }
}

if (!customElements.get("sml-form")) {
  customElements.define("sml-form", smlForm);
}

export default smlForm;
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^