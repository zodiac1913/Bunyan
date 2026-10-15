//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
/* eslint-disable no-console */
"use strict";

import { functionCall } from "../smlUtils.js";

export default class Yeshua {
  constructor(cfg = {}) {
    this.formConfig = cfg.formConfig || {};
    this.formElement = cfg.formElement || null;
    this.actionType = cfg.actionType || "";
    this.lastValidationResult = {
      isValid: true,
      invalidFields: []
    };
  }

  getValidators() {
    return Array.from(this.formElement?.querySelectorAll("sml-valid") || []);
  }

  validateField(fieldName) {
    const validator = this.getValidators().find((item) => {
      const controlId = item.getAttribute("for") || item.for || "";
      return item.id === fieldName || controlId === fieldName || controlId === `#${fieldName}`;
    });

    if (!validator?.validate) {
      return true;
    }

    return validator.validate({ source: "Yeshua" });
  }

  async validateForm() {
    const invalidFields = [];
    const validators = this.getValidators();
    let firstInvalid = null;

    for (const validator of validators) {
      const isValid = validator.validate({ source: "Yeshua" });
      if (!isValid) {
        invalidFields.push(validator.getValidationState ? validator.getValidationState() : {
          fieldName: validator.getAttribute("for") || validator.id || "",
          message: validator.innerHTML || "Invalid value."
        });
        if (!firstInvalid) {
          firstInvalid = validator;
        }
      }
    }

    this.lastValidationResult = {
      isValid: invalidFields.length === 0,
      invalidFields,
      firstInvalid
    };

    if (!this.lastValidationResult.isValid) {
      this.focusFirstInvalid();
    }

    return this.lastValidationResult.isValid;
  }

  focusFirstInvalid() {
    const validator = this.lastValidationResult?.firstInvalid;
    if (!validator) {
      return;
    }

    const control = validator.resolveControl ? validator.resolveControl() : document.getElementById(validator.getAttribute("for") || "");
    if (control?.focus) {
      control.focus();
      if (control.scrollIntoView) {
        control.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      }
      return;
    }

    validator.focus?.();
  }

  getValidationErrors() {
    return this.lastValidationResult?.invalidFields || [];
  }

  getValidationErrorHtml() {
    return this.getValidationErrors().map((error) => {
      const field = error?.fieldName || error?.label || "Field";
      const message = error?.message || "Invalid value.";
      return `<li><span class="float-start bg-AliceBlue">${field}</span>${message}</li>`;
    }).join("");
  }

  runCustomHook(hookName, payload = {}) {
    if (!hookName) {
      return;
    }

    functionCall(hookName, {
      validator: this,
      formElement: this.formElement,
      formConfig: this.formConfig,
      ...payload
    });
  }
}
