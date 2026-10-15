//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//     *          |¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯|       †          _____          ↑
//   _____        |  o o o o o o  |      /|\        (     )         ↑
//  /  ^  \       | o o o o o o o |     / | \      (       )       / \
// /_/___\_\      |_______________|    /  |  \      (]¯¯¯[)       /   \
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
/* eslint-disable no-undef */
/* eslint-disable no-console */
/*!
 * smlValid --- sml FormField Validation module for SML FormFields
 * Public Domain Licensed Copyright Law of the United States of America, Section 105 (https://www.copyright.gov/title17/92chap1.html#105)
 * Et qui me misit, mecum est: non reliquit me solum Pater, quia ego semper quae placita sunt ei, facio!
 * Published by: Dominic Roche of OIT/IUSG/DASM on 1/5/2026
 * @class smlValid
 * @extends {HTMLElement}
 */
// תהילתו. לא שלי
import { clip, guid, unobtrusiveWait, unobtrusiveWaitOff } from '../smlUtils.js';
"use strict";
class smlValid extends HTMLElement {
  constructor() {
        super();
        let slv = this;
        slv.validationState = {
          isValid: true,
          message: "",
          source: "init",
          fieldName: ""
        };
  }
  static observedAttributes=["data-api"];

    // connect component
  async connectedCallback() {
    let slv = this;
    slv.id = slv.id || "slv"+clip(guid(true),20);
    if(!slv.title) slv.title="sml Valid element not explained, ask DASM to fix this";
    if(!slv.ariaLabel) slv.ariaLabel=slv.title;
    if(slv.className=="") slv.className="smlValid text-danger fw-bold d-none m-2 p-2";
    slv.dataset.api = slv.getAttribute("data-api") || "";
    if(slv.dataset.api && !slv.dataset.apiForward) {
      slv.dataset.apiForward = slv.dataset.api.replaceAll("/","_").replaceAll("?","_").replaceAll("&","_").replaceAll("=","_");
      console.log("smlInput: Setting apiForward to "+slv.dataset.apiForward);
    }
    slv.dataset.icon= slv.getAttribute("data-icon") || "bi bi-question-circle";
    if(!slv.for) {
      let firstInput=slv.parentElement.querySelector("input[data-sml-property], input[data-cc-property]");
      slv.for = firstInput ? (firstInput.id || firstInput.name || "") : "";
    }
    //outer span
    if(!slv.classList.contains("smlLbl")) slv.classList.add("smlLbl");
    if(!slv.classList.contains("text-break")) slv.classList.add("text-break");
    slv.bindControl();
    slv.wire();
  }

  // <div id="ReadLogLogAppFormGroup" class="form-floating border border-1 border-dark m-2 p-2" style="min-width:24em;min-height:.5em;flex-direction: column;justify-content:center;">
  //   <label for="ReadLogLogAppFormField" id="ReadLogLogAppLabel" aria-hidden="true" class="mt-0" style="padding: 0;" title="Access to the Log App" aria-label=" the Log App" t="Log App&nbsp;&nbsp;">
  //     Log App&nbsp;&nbsp;
  //   </label>
  //   <div id="ReadLogLogAppEnvelope" class="col row">
  //   <div type="text" id="ReadLogLogAppFormField" class="mt-4 px-2 fw-bold form-control-sm pt-3" data-cc-property="LogApp" style="max-width:21.2em;" title="Access to the Log App" aria-label="Access to the Log App" placeholder="Log App" readonly="true" t="DotNetCats">
  //      DotNetCats
  //   </div>
  //  </div>
  //  <div id="ReadLogLogAppFormFieldValid" class="d-none text-danger" t="">
  //  </div>
  // </div>



  // attribute change handler
  /**
   * This updates class properties based on html tags being altered
   *
   * @param {*} name name of element tag
   * @param {*} oldValue old value for reference of element tag
   * @param {*} newValue new value of element tag
   * @memberof ccSPA
   */
  async attributeChangedCallback(name, oldValue, newValue) {
      let cctg=this;
      switch(name){
              case "data-api":
                  cctg.api=newValue;
                  break;
              default: //WATDUH!
                  console.log(`smlInput: What you talking bout Willis? for attribute change ${name} from ${oldValue} to ${newValue}`);
                  break;
      }
  }

  wire() {
      let slv = this;
      //For API Calls
      if(slv.dataset.api!=="") {
          slv.addEventListener("click", async (e) => { slv.apiCall(e);});
      }
      //For Url (Navigation)
      if(slv.dataset.url) {
          slv.addEventListener("click", async (e) => {
              unobtrusiveWait("Going to " + e.currentTarget.dataset.url);
              window.location.href=slv.dataset.url;
              setTimeout(()=>{unobtrusiveWaitOff();},10000);
          });
      }
  }

  resolveControl() {
    const slv = this;
    const field = slv.closest("sml-form-field");
    const inputId = slv.getAttribute("for") || slv.for || slv.dataset.for || "";
    let control = inputId ? document.getElementById(inputId) : null;

    if (!control && field) {
      control = field.querySelector("sml-input") || field.querySelector("input, select, textarea");
    }

    if (control?.nodeName === "SML-INPUT") {
      control = control._input || control.querySelector("input, select, textarea");
    }

    return control;
  }

  bindControl() {
    const slv = this;
    const control = slv.resolveControl();
    if (!control || control.dataset.smlValidWired === "true") {
      return;
    }

    control.dataset.smlValidWired = "true";
    ["input", "change", "blur", "keypress"].forEach(eventName => {
      control.addEventListener(eventName, () => {
        slv.validate({ source: eventName });
      });
    });
  }

  getValidationValue(control) {
    if (!control) {
      return "";
    }

    if (control.type === "checkbox") {
      return control.checked ? "true" : "false";
    }

    return String(control.value ?? "").trim();
  }

  getValidationMeta(control) {
    const field = this.closest("sml-form-field");
    const rawMaxLength = Number(control?.maxLength);
    const resolvedMaxLength = Number.isFinite(rawMaxLength) && rawMaxLength > 0 ? rawMaxLength : -1;
    return {
      label: field?.dataset?.label || control?.title || control?.getAttribute("aria-label") || this.title || "This field",
      required: control?.required === true || field?.dataset?.isRequired === "true" || this.dataset.isRequired === "true",
      type: String(field?.dataset?.inputType || control?.type || control?.dataset?.type || "text").toLowerCase(),
      lowRange: field?.dataset?.sfNumberLowRange || this.dataset.sfNumberLowRange || control?.dataset?.sfNumberLowRange || "",
      highRange: field?.dataset?.sfNumberHighRange || this.dataset.sfNumberHighRange || control?.dataset?.sfNumberHighRange || "",
      minLength: control?.minLength > -1 ? control.minLength : -1,
      maxLength: resolvedMaxLength,
      pattern: control?.pattern || ""
    };
  }

  validate({ source = "validate" } = {}) {
    const slv = this;
    const control = slv.resolveControl();
    if (!control) {
      slv.applyValidation({ isValid: true, message: "", source, fieldName: slv.getAttribute("for") || "" });
      return true;
    }

    if (control.disabled || control.readOnly || control.type === "hidden") {
      slv.clearValidation(source);
      return true;
    }

    const meta = slv.getValidationMeta(control);

    if (meta.type === "output" || meta.type === "display") {
      slv.clearValidation(source);
      return true;
    }

    const value = slv.getValidationValue(control);
    const messageParts = [];
    let isValid = true;

    if (meta.required && !value && meta.type !== "output") {
      isValid = false;
      messageParts.push(`${meta.label} field is required`);
    }

    if (meta.type === "email" && value) {
      const emailRegEx = /\S+@\S+\.\S+/;
      if (!emailRegEx.test(value)) {
        isValid = false;
        messageParts.push("This field must be a valid email address");
      }
    }

    if (meta.type === "number" && value) {
      const numericValue = Number(value);
      if (Number.isNaN(numericValue)) {
        isValid = false;
        messageParts.push("This field must be a number");
      } else {
        if (meta.lowRange !== "" && numericValue < Number(meta.lowRange)) {
          isValid = false;
          messageParts.push(`This field must be at least ${meta.lowRange}`);
        }
        if (meta.highRange !== "" && numericValue > Number(meta.highRange)) {
          isValid = false;
          messageParts.push(`This field must be at most ${meta.highRange}`);
        }
      }
    }

    if (meta.minLength > -1 && value && value.length < meta.minLength) {
      isValid = false;
      messageParts.push(`This field must be at least ${meta.minLength} characters`);
    }

    if (meta.maxLength > -1 && value && value.length > meta.maxLength) {
      isValid = false;
      messageParts.push(`This field must be at most ${meta.maxLength} characters`);
    }

    if (meta.pattern && value) {
      try {
        const patternRegEx = new RegExp(meta.pattern);
        if (!patternRegEx.test(value)) {
          isValid = false;
          messageParts.push("This field does not match the required pattern");
        }
      } catch {
        // Ignore invalid pattern metadata.
      }
    }

    slv.applyValidation({
      isValid,
      message: messageParts.join(", "),
      source,
      fieldName: slv.getAttribute("for") || control.id || ""
    });

    return isValid;
  }

  getValidationHost() {
    return this.closest("sml-form-field")
      || this.closest("sml-input")
      || this.closest(".form-floating");
  }

  applyValidation({ isValid = true, message = "", source = "unknown", fieldName = "" } = {}) {
    let slv = this;
    slv.validationState = {
      isValid,
      message,
      source,
      fieldName
    };

    const control = slv.resolveControl();

    if (isValid) {
      slv.classList.add("d-none");
      slv.innerHTML = "";
    } else {
      slv.classList.remove("d-none");
      slv.innerHTML = message || "Invalid value.";
    }

    if (control) {
      control.classList.toggle("is-invalid", !isValid);
      if (isValid) {
        control.removeAttribute("aria-invalid");
      } else {
        control.setAttribute("aria-invalid", "true");
      }

      if (!slv.id) {
        slv.id = "slv" + clip(guid(true), 20);
      }
      if (isValid) {
        const describedbyRaw = String(control.getAttribute("aria-describedby") || "").trim();
        if (describedbyRaw) {
          const tokens = describedbyRaw.split(/\s+/).filter(Boolean).filter((token) => token !== slv.id);
          if (tokens.length > 0) {
            control.setAttribute("aria-describedby", tokens.join(" "));
          } else {
            control.removeAttribute("aria-describedby");
          }
        }
      } else {
        const describedbyRaw = String(control.getAttribute("aria-describedby") || "").trim();
        const tokens = describedbyRaw ? describedbyRaw.split(/\s+/).filter(Boolean) : [];
        if (!tokens.includes(slv.id)) {
          tokens.push(slv.id);
          control.setAttribute("aria-describedby", tokens.join(" "));
        }
      }
      if (isValid) {
        control.classList.remove("smlInvalid");
      } else {
        control.classList.add("smlInvalid");
      }
    }

    const host = slv.getValidationHost();
    if (host) {
      host.classList.toggle("border-danger", !isValid);
      host.classList.toggle("border-2", !isValid);
      host.classList.toggle("alert", !isValid);
      host.classList.toggle("alert-danger", !isValid);
      host.classList.toggle("border-1", isValid);
      host.classList.toggle("border-dark", isValid);
    }

    slv.dispatchEvent(new CustomEvent("sml:validation-updated", {
      bubbles: true,
      detail: {
        ...slv.validationState
      }
    }));
  }

  clearValidation(source = "clear") {
    const control = this.resolveControl();
    if (control) {
      control.classList.remove("is-invalid", "smlInvalid");
      control.removeAttribute("aria-invalid");
    }
    this.applyValidation({ isValid: true, message: "", source });
  }

  getValidationState() {
    return { ...this.validationState };
  }

  async apiCall() {
    let slv = this;
    //api call logic here
    unobtrusiveWait("Processing " + slv.dataset.text);
    let postData=await apiPostDirect(slv.dataset.api, { forward: slv.dataset.apiForward });
    unobtrusiveWaitOff();
    if (postData && postData.receipt && receiptCheckGood(postData.receipt)) {
        //success logic here
        window[slv.dataset.apiForward](postData);
    } else {
        //failure logic here
        console.log("smlInput: API Call failed for "+slv.dataset.api);
    }
    
  }




}

customElements.define("sml-valid", smlValid);

export default smlValid;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^