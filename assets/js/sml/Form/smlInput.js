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
 * smlInput --- sml FormField Input module for SML FormFields
 * Public Domain Licensed Copyright Law of the United States of America, Section 105 (https://www.copyright.gov/title17/92chap1.html#105)
 * Et qui me misit, mecum est: non reliquit me solum Pater, quia ego semper quae placita sunt ei, facio!
 * Published by: Dominic Roche of OIT/IUSG/DASM on 1/5/2026
 * @class smlInput
 * @extends {HTMLElement}
 */
// תהילתו. לא שלי
import sml from '../sml.js';
import { asBool, clip, guid, jmlToHtml, replaceLast, unobtrusiveWait, unobtrusiveWaitOff } from '../smlUtils.js';
"use strict";
class smlInput extends HTMLElement {
  constructor(fld) {
    super();
    let slInp = this;
    if(fld!==undefined){
      slInp.fld=fld;
    }
    this._input = null;

    for (const prop of this.constructor.forwardedProperties) {
      const protoDescriptor = Object.getOwnPropertyDescriptor(smlInput.prototype, prop);
      if (protoDescriptor && (typeof protoDescriptor.get === "function" || typeof protoDescriptor.set === "function")) {
        continue;
      }

      Object.defineProperty(this, prop, {
        get() {
          return this._input ? this._input[prop] : this.getAttribute(prop);
        },
        set(v) {
            this.setAttribute(prop, v);
        },
      });
    }
  }
  static observedAttributes=["data-api", "data-output-textarea", "data-force-textarea", "data-output-type", "data-type", "data-disabled", "disabled"];

  _applyTextareaLayout() {
    if (!this._input || this.io !== "textarea") return;
    this.style.display = "block";
    this.style.width = "100%";
    this._input.style.width = "100%";
    this._input.style.height = "150px";
    this._input.style.minHeight = "150px";
  }

    // connect component
  async connectedCallback() {
    let slInp = this;
    const genId=clip(guid(true),10);
    slInp.id = (slInp.id || "slInp"+genId+"SmlInput");
    slInp._inputId=replaceLast(replaceLast(replaceLast(slInp.id,"SmlFFSmlInput",""),"Input",""),"Sml","");
    if(!slInp.id.endsWith("SmlInput")) slInp.id=slInp.id+"SmlInput";
    slInp.name=slInp.id;
    
    // Own form only: nearest sml-form, never the first card on the page.
    let readOnly=false;
    let formEle=slInp.closest("sml-form") || slInp.closest("[data-sml-form-root='true']") || slInp.closest(".ccFormCard");
    let formType=String(formEle?.dataset?.action || "").trim();
    if(formType.toLowerCase()==="read" || formType.toLowerCase()==="delete") readOnly=true;

    // Create the real input 
    //slInp._inputId = slInp.id + (slInp.id.includes("FormField")?"":"Input"); 
    const inputType = (slInp.dataset.type || "text").toLowerCase();
    const outputType = (slInp.dataset.outputType || "").toLowerCase();
    const outputTextarea = asBool(slInp.dataset.outputTextarea);
    const forceTextarea = asBool(slInp.dataset.forceTextarea);
    const isTextareaMode = forceTextarea || outputTextarea || inputType === "textarea" || (inputType === "output" && outputType === "textarea");
    slInp.innerHTML = isTextareaMode
      ? `<textarea id="${slInp._inputId}" style="width: 100%; height: 150px;"></textarea>`
      : `<input id="${slInp._inputId}">`;
    slInp.io = isTextareaMode ? "textarea" : "input";
    slInp._input = slInp.querySelector(slInp.io);
    slInp._input.id = slInp._inputId;
    if (slInp.io === "input") {
      slInp._input.type = "text";//slInp.dataset.type ||"text";
    }
    if(slInp.dataset.type.toLowerCase()==="hidden") {
      slInp.dataset.hidden="true";
      slInp._input.className="";
      slInp._input.style.display="none";
    }else{
      slInp._input.className = "smlInpt smlFloat flex-fill mt-4 px-2 fw-bold";
      if (isTextareaMode) {
        slInp._applyTextareaLayout();
      }
    }
    slInp._input.placeholder = " ";
    const propertyName = slInp.dataset.smlProperty || slInp.dataset.ccProperty || "Unknown";
    slInp.dataset.smlProperty = propertyName;
    slInp.dataset.ccProperty = slInp.dataset.ccProperty || propertyName;
    slInp._input.dataset.smlProperty = propertyName;
    slInp._input.dataset.ccProperty = propertyName;
    slInp._input.isRequired=asBool(slInp.dataset.isRequired)||false;
    if (!slInp.hasAttribute("title")) {
      this._input.setAttribute("title", "Form field");
      console.warn("sml Input missing title — DASM, fix your stuff.");
    }
    const initialAriaLabel = String(this._input.getAttribute("aria-label") || "").trim();
    const initialAriaLabelledBy = String(this._input.getAttribute("aria-labelledby") || "").trim();
    if (initialAriaLabel.length < 1 && initialAriaLabelledBy.length < 1) {
      this._input.setAttribute("aria-label", this._input.title);
    }
    if(slInp.className=="") slInp.className="smlInpt flex-fill";

    slInp.dataset.api = slInp.getAttribute("data-api") || "";
    if(slInp.dataset.api && !slInp.dataset.apiForward) {
      slInp.dataset.apiForward = slInp.dataset.api.replaceAll("/","_").replaceAll("?","_").replaceAll("&","_").replaceAll("=","_");
      console.log("smlInput: Setting apiForward to "+slInp.dataset.apiForward);
    }
    slInp.dataset.icon= slInp.getAttribute("data-icon") || "bi bi-question-circle";
    if (slInp.dataset.text) {
      slInp._input.value = slInp.dataset.text;
    }
    slInp.dataset.text = "";
    //Find your label
    let firstLabel = this.parentElement?.querySelector("sml-label,label");
    if (firstLabel) {
      // Ensure label has an ID
      if (!firstLabel.id) firstLabel.id = this.id + "Label";
      // Wire label to the real input
      firstLabel.setAttribute("for", slInp._input.id);
      slInp._input.setAttribute("aria-labelledby", firstLabel.id);
    }
    if(!slInp.classList.contains("smlInput")) slInp.classList.add("smlInput");
    // Forward initial attributes 
    slInp._forwardInitialAttributes();
    if (readOnly) {
      slInp._input.readOnly = true;
    }
    let fld={};
    fld.name=slInp._input.dataset.smlProperty || slInp._input.dataset.ccProperty || "Unknown";
    fld.title=slInp._input.title || "Form field";
    fld.defaultValue=slInp._input.value || "";
    fld.sfDefaultValueShow=slInp.dataset.sfDefaultValueShow || "";
    fld.isRequired=slInp._input.required || false;
    fld.label=firstLabel?.dataset?.text || firstLabel?.textContent || "Some field I didnt bother to label?";
    fld.icon=slInp.dataset.icon || "bi bi-question-circle";
    if(!slInp.type) { slInp.dataset.type="text"; }
    const isCheckedDisplayValue = (value) => {
      const token = String(value ?? "").trim().toLowerCase();
      if (token === "") return false;
      if (["\u2611", "\u2713", "\u2714", "yes", "y", "1", "true", "checked", "on"].includes(token)) {
        return true;
      }
      if (["\u2610", "\u2612", "no", "n", "0", "false", "unchecked", "off"].includes(token)) {
        return false;
      }
      return asBool(value);
    };
    const checkboxGlyph = (value) => (isCheckedDisplayValue(value) ? "\u2611" : "\u2610");
    const shouldRenderOutputAsCheckbox = (outputTypeValue) => {
      return String(outputTypeValue || "").toLowerCase() === "checkbox";
    };
    //)))))))))))))))))))))))))))))))))))))Add Facades for Input when needed(((((((((((((((((((((((((((((
    let inputFacade={};
    switch(slInp.dataset.type.toLowerCase()){ 
      case "smlautocomplete":
          // Create sml-auto-complete as facade
          const smlAc = document.createElement('sml-auto-complete');
          smlAc.id = slInp._inputId + "Facade";
          smlAc.name = smlAc.id;
          smlAc.className = "d-flex flex-column smlInput smlActiveInput smlFloat flex-fill mt-4 px-2 fw-bold sffautocomplete";
          smlAc.dataset.smlProperty = propertyName;
          smlAc.dataset.ccProperty = propertyName;
          smlAc.dataset.label = slInp.parentElement.dataset.label;
          smlAc.dataset.api = slInp.dataset.api || slInp.parentElement.dataset.api;
          smlAc.dataset.apiValue = slInp.dataset.apiValue || slInp.parentElement.dataset.apiValue;
          smlAc.dataset.apiId = slInp.dataset.apiId || slInp.parentElement.dataset.apiId;
          if (slInp.dataset.placeholder !== undefined || slInp.parentElement.dataset.placeholder !== undefined) {
              smlAc.dataset.placeholder = slInp.dataset.placeholder ?? slInp.parentElement.dataset.placeholder ?? "";
          }
          smlAc.dataset.url = slInp.dataset.url || slInp.parentElement.dataset.url || "";
          smlAc.dataset.apiPropsDown = slInp.dataset.apiPropsDown || slInp.parentElement.dataset.apiPropsDown || "";
          smlAc.dataset.apiFiltersUp = slInp.dataset.apiFiltersUp || slInp.parentElement.dataset.apiFiltersUp || "";
          smlAc.dataset.initialFocus = slInp.dataset.initialFocus || slInp.parentElement.dataset.initialFocus || "";
          smlAc.dataset.secondaryFocus = slInp.dataset.secondaryFocus || slInp.parentElement.dataset.secondaryFocus || "";
          smlAc.inputFacade=[{n:"input",type: "text",i:slInp._inputId + "FacadeTextSearch",name: slInp._inputId + "FacadeTextSearch"},
            {n:"select",i:slInp._inputId + "FacadeSelect",name: slInp._inputId + "FacadeSelect",size:5}
          ];

          slInp.parentElement.parentElement.querySelector("sml-label").style.left = ".5rem";
          slInp.parentElement.parentElement.querySelector("sml-label").style.top="-0.10rem"
          slInp.parentElement.parentElement.querySelector("sml-label").style.fontSize = ".90rem";
          slInp.parentElement.parentElement.querySelector("sml-label").style.background = "#fff";
          slInp.parentElement.parentElement.querySelector("sml-label").style.padding = "0 .15rem";
          slInp.parentElement.parentElement.querySelector("sml-label").style.color = "#495057";
          slInp.parentElement.parentElement.querySelector("sml-label").style.zIndex = "3";

          
          // Optional attributes
          if (slInp.dataset.apiPropsDown || slInp.parentElement.dataset.apiPropsDown) {
              smlAc.dataset.apiPropsDown = slInp.dataset.apiPropsDown || slInp.parentElement.dataset.apiPropsDown;
          }
          if (slInp.dataset.apiFiltersUp || slInp.parentElement.dataset.apiFiltersUp) {
              smlAc.dataset.apiFiltersUp = slInp.dataset.apiFiltersUp || slInp.parentElement.dataset.apiFiltersUp;
          }
          if (slInp.dataset.ccSelectType || slInp.parentElement.dataset.ccSelectType) {
              smlAc.dataset.ccSelectType = slInp.dataset.ccSelectType || slInp.parentElement.dataset.ccSelectType;
          }
          slInp.dataset.hasFacade = "true";
          slInp.insertAdjacentElement('afterBegin', smlAc);
          slInp._input.type = "hidden";
          break;      
      case "select":
          inputFacade={n:"select",type: slInp.dataset.type,i:slInp._inputId + "Facade",name: slInp._inputId + "Facade"
            ,c:"smlInput smlActiveInput align-items-left flex-fill form-select fw-bold mt-4 sffselect",b:[]};
          if(slInp.dataset.sfDropDownJson){
              let optionsData=JSON.parse(slInp.dataset.sfDropDownJson);
              for(let opt of optionsData){
                  inputFacade.b.push({n:"option",value:opt.id,t:opt.text||opt.value});
              }
          }
          slInp._input.type="hidden";
          slInp.dataset.hasFacade="true";
        break;
      case "textarea":
          // Use the native internal textarea as the canonical input for textarea mode.
          slInp.dataset.hasFacade="false";
          slInp._input.value = slInp.value || slInp.dataset.defaultValue || slInp._input.value || "";
          slInp._applyTextareaLayout();
          if (readOnly) {
            slInp._input.readOnly = true;
          }
        break;
      case "hidden":
          slInp.dataset.hasFacade="false";
          slInp._input.type="hidden";
        break;
      case "checkbox":
          inputFacade={n:"input",i:slInp._inputId + "Facade",name: slInp._inputId + "Facade"
              ,c:"smlInput smlActiveInput form-check-input sffcheckbox"
              ,"data-label":fld.label,"data-icon":fld.icon,"data-text":asBool(fld.defaultValue)?"true":"false"
              ,placeholder: " "
            ,"data-sml-property":fld.name
              ,"type":"checkbox"
              ,"data-is-required":fld.isRequired?"true":"false"
              ,value:asBool(fld.defaultValue)?"true":"false"
              ,title: fld.title
          };
          if (readOnly) {
            inputFacade.disabled = "true";
          }
          slInp._input.type="hidden";
          slInp.dataset.hasFacade="true";
        break;
      case "datetime":
      case "datetime-local":
      case "datetimelocal":
             inputFacade={n:"input",i:slInp._inputId + "Facade",name: slInp._inputId + "Facade"
               ,c: "smlInput smlActiveInput smlFloat smlHasValue mt-4 px-2 fw-bold sffdatetime"
               ,"data-label":fld.label,"data-icon":fld.icon
               ,"data-sml-property":fld.name
               ,style:"width:min(16em, 100%);min-width:0;max-width:100%;"
               ,"type":"datetime-local"
               ,value: fld.defaultValue
               ,title: fld.title
               ,placeholder: " "
           };
          slInp._input.type="hidden";
          slInp.dataset.hasFacade="true";
       break;
      case "output": { //Display Only
          const outputType = (slInp.dataset.outputType || "").toLowerCase();
          const boolSource = slInp.dataset.defaultValue || fld.defaultValue || slInp.dataset.text;
          const isBooleanOutput = shouldRenderOutputAsCheckbox(outputType);
          if (isBooleanOutput) {
            const normalizedBooleanValue = asBool(boolSource) ? "true" : "false";
            const displayValue = checkboxGlyph(slInp.getAttribute("value") || normalizedBooleanValue);
            inputFacade = {
              n: "input",
              type: "text",
              i: slInp._inputId + "Facade",
              name: slInp._inputId + "Facade",
              c: "smlInput smlActiveInput smlFloat flex-fill mt-4 px-2 fw-bold sffoutputbool",
              "data-output-type": "checkbox",
              value: displayValue,
              readonly: "true",
              placeholder: " ",
              title: fld.title,
            };
            slInp._input.type = "hidden";
            slInp._input.value = normalizedBooleanValue;
            slInp.dataset.hasFacade = "true";
            slInp.dataset.defaultValue = normalizedBooleanValue;
            slInp.dataset.text = normalizedBooleanValue;
          } else {
            // Generic output remains standard read-only behavior.
            slInp.dataset.hasFacade = "false";
            slInp._input.readOnly = true;
            if ((forceTextarea || outputTextarea || outputType === "textarea") && slInp.io === "textarea") {
              slInp._applyTextareaLayout();
            }
          }
        break;
      }
      default: //text, password, email, number, date, etc
            // inputFacade={n:"input",type: slInp.dataset.type,role:slInp.dataset.type
            //       ,i:slInp._inputId + "Facade",c:"smlInput smlFloat smlActiveInput fw-bold align-items-left flex-fill mt-4"
            //       ,"data-intype": slInp.dataset.type,value: fld.defaultValue
            //       ,value:slInp.value};
            //^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^Avoid Facades for normal inputs^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^            
            slInp.dataset.hasFacade="false";
        break;            
    }
    const activeInputType = (slInp.dataset.type || "text").toLowerCase();
    if(readOnly && inputFacade?.n) inputFacade.readonly="true";

    if(inputFacade?.n){
      const inpt=jmlToHtml(inputFacade);
      if(inpt) slInp.insertAdjacentHTML("afterBegin", inpt);
    }

    if(activeInputType==="text"){
      slInp._input.classList.add("smlActiveInput");
    }
    if(slInp.dataset.defaultValue && slInp.dataset.defaultValue!="") {
      const facadeInput=slInp.querySelector("#"+slInp._inputId + "Facade");
      if(facadeInput){
        const isBooleanOutput = slInp.dataset.type.toLowerCase() === "output"
          && shouldRenderOutputAsCheckbox(slInp.dataset.outputType);
        if (isBooleanOutput) {
          const normalizedBooleanValue = asBool(slInp.dataset.defaultValue) ? "true" : "false";
          const displayValue = checkboxGlyph(facadeInput.getAttribute("value") || slInp.getAttribute("value") || normalizedBooleanValue);
          slInp._input.value = normalizedBooleanValue;
          slInp.dataset.defaultValue = normalizedBooleanValue;
          slInp.dataset.text = normalizedBooleanValue;
          facadeInput.setAttribute("value", displayValue);
        } else {
          facadeInput.value=slInp.dataset.defaultValue;
        }
      }else{
        slInp._input.value=slInp.dataset.defaultValue;
      }
    }

    //)))))))))))))))))))))))))))))))))))))END Facades for Input when needed(((((((((((((((((((((((((((((
    slInp._syncDisabledState();
    slInp._ensureInternalTextareaMode();
    slInp._syncHasValueClass();
    slInp._normalizeAccessibility();
    requestAnimationFrame(() => slInp._normalizeAccessibility());
    slInp.wire();
  }

  // <div id="ReadLogLogAppFormGroup" class="form-floating border border-1 border-dark m-2 p-2" style="min-width:24em;min-height:.5em;flex-direction: column;justify-content:center;">
  //   <label for="ReadLogLogAppFormField" id="ReadLogLogAppLabel" aria-hidden="true" class="mt-0" style="padding: 0;" title="Access to the Log App" aria-label="Access to the Log App" t="Log App&nbsp;&nbsp;">
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
          case "data-output-textarea":
          case "data-force-textarea":
          case "data-output-type":
          case "data-type":
          case "data-disabled":
          case "disabled":
            cctg._ensureInternalTextareaMode();
            cctg._syncDisabledState();
            break;
              default: //WATDUH!
                  console.log(`smlInput: What you talking bout Willis? for attribute change ${name} from ${oldValue} to ${newValue}`);
                  break;
      }
  }
static get forwardedProperties() {
  return [
    "placeholder",
    "required",
    "disabled",
    "readOnly",
    "maxLength",
    "minLength",
    "pattern",
    "autocomplete",
    "name",
    "type",
    "checked",
    "selectedIndex"
  ];
}


  _forwardInitialAttributes() {
    const slInp = this;

    // Attributes we do NOT want to forward
    const blockList = new Set([
      "id",
      "class",
      "style",
      "data-api",
      "data-api-forward",
      "data-icon",
      "data-text",
      "data-disabled",
      "data-url",
      "type" // handled separately
    ]);

    for (const attr of slInp.getAttributeNames()) {
      if (!blockList.has(attr)) {
        const value = slInp.getAttribute(attr);
        slInp._input.setAttribute(attr, value);
      }
    }

    // Special case: forward type to the inner input
    if (slInp.type && slInp.io === "input") {
      slInp._input.setAttribute("type", slInp.type);
    }
    }

  _shouldUseTextareaInternal() {
    const inputType = (this.dataset.type || "text").toLowerCase();
    const outputType = (this.dataset.outputType || "").toLowerCase();
    return asBool(this.dataset.outputTextarea)
      || asBool(this.dataset.forceTextarea)
      || inputType === "textarea"
      || (inputType === "output" && outputType === "textarea");
  }

  _ensureInternalTextareaMode() {
    const slInp = this;
    if (!slInp._input) return;
    if (!slInp._shouldUseTextareaInternal()) return;
    if (slInp.io === "textarea") {
      slInp._input.readOnly = slInp._input.readOnly || asBool(slInp.getAttribute("readonly"));
      slInp._applyTextareaLayout();
      return;
    }

    const current = slInp._input;
    const next = document.createElement("textarea");

    for (const attr of current.getAttributeNames()) {
      if (attr.toLowerCase() === "type") continue;
      next.setAttribute(attr, current.getAttribute(attr));
    }
    next.id = current.id;
    next.className = current.className;
    next.setAttribute("style", "width: 100%; height: 150px;");
    next.value = current.value || current.getAttribute("value") || slInp.dataset.defaultValue || "";
    next.readOnly = true;

    current.replaceWith(next);
    slInp.io = "textarea";
    slInp._input = next;
    slInp._applyTextareaLayout();

    if (slInp._onInputChange) {
      slInp._input.addEventListener("change", slInp._onInputChange);
    }
  }

  _hasTruthyDataDisabled() {
    if (!this.hasAttribute("data-disabled")) {
      return false;
    }

    const rawValue = this.getAttribute("data-disabled");
    if (rawValue === null) {
      return true;
    }

    const token = String(rawValue).trim().toLowerCase();
    if (token === "" || token === "data-disabled") {
      return true;
    }

    return asBool(rawValue);
  }

  _syncDisabledState() {
    const slInp = this;
    const inputType = (slInp.dataset.type || "").toLowerCase();
    if (inputType !== "display") {
      return;
    }

    const shouldDisable = slInp.hasAttribute("disabled") || slInp._hasTruthyDataDisabled();

    if (slInp._input && "disabled" in slInp._input) {
      slInp._input.disabled = shouldDisable;
    }

    const facadeElement = slInp._getFacadeElement();
    if (facadeElement && "disabled" in facadeElement) {
      facadeElement.disabled = shouldDisable;
    }
  }

  _resolveFallbackA11yLabel() {
    const candidate = [
      this.dataset.label,
      this.title,
      this._input?.title,
      this.dataset.smlProperty,
      this.dataset.ccProperty,
      "Form field"
    ].find((value) => typeof value === "string" && value.trim().length > 0);

    return String(candidate || "Form field").trim();
  }

  _resolveLabelElement() {
    const labelElement = this.parentElement?.querySelector("sml-label,label") || null;
    if (!labelElement) return null;

    if (!String(labelElement.id || "").trim()) {
      labelElement.id = this.id + "Label";
    }

    return labelElement;
  }

  _hasUsableAriaLabelledBy(control) {
    const labelledBy = String(control?.getAttribute("aria-labelledby") || "").trim();
    if (!labelledBy) return false;

    const ids = labelledBy.split(/\s+/).map((id) => id.trim()).filter(Boolean);
    if (ids.length < 1) return false;

    return ids.some((id) => {
      const referenced = document.getElementById(id);
      if (!referenced) return false;
      const text = String(referenced.textContent || referenced.getAttribute("aria-label") || "").trim();
      return text.length > 0;
    });
  }

  _ensureControlAccessibility(control, labelId, fallbackLabel) {
    if (!(control instanceof HTMLElement)) return;

    const controlType = String(control.getAttribute("type") || control.type || "").toLowerCase();
    if (controlType === "search" && !String(control.getAttribute("role") || "").trim()) {
      control.setAttribute("role", "search");
    }

    const ariaLabel = String(control.getAttribute("aria-label") || "").trim();
    const hasUsableLabelledBy = this._hasUsableAriaLabelledBy(control);
    if (ariaLabel.length < 1 && control.hasAttribute("aria-label")) {
      control.removeAttribute("aria-label");
    }

    if (ariaLabel.length > 0 || hasUsableLabelledBy) {
      return;
    }

    if (labelId) {
      control.setAttribute("aria-labelledby", labelId);
      control.removeAttribute("aria-label");
      return;
    }

    control.setAttribute("aria-label", fallbackLabel);
  }

  _normalizeAccessibility() {
    const hiddenBackingInput = this._input && String(this._input.type || "").toLowerCase() === "hidden";
    if (hiddenBackingInput) {
      this._input.setAttribute("aria-hidden", "true");
      this._input.setAttribute("tabindex", "-1");
    } else if (this._input) {
      this._input.removeAttribute("aria-hidden");
      this._input.removeAttribute("tabindex");
    }

    if (hiddenBackingInput) {
      this.removeAttribute("aria-hidden");
    }

    const labelElement = this._resolveLabelElement();
    const labelId = labelElement?.id || "";
    const fallbackLabel = this._resolveFallbackA11yLabel();

    const controls = new Set();
    if (this._input) controls.add(this._input);

    const facadeElement = this._getFacadeElement();
    if (facadeElement) {
      facadeElement.removeAttribute("aria-hidden");
      if (facadeElement.getAttribute("tabindex") === "-1") {
        facadeElement.removeAttribute("tabindex");
      }
      controls.add(facadeElement);
    }

    const textElement = this._getTextElement();
    if (textElement) {
      textElement.removeAttribute("aria-hidden");
      if (textElement.getAttribute("tabindex") === "-1") {
        textElement.removeAttribute("tabindex");
      }
      controls.add(textElement);
    }

    const autoComplete = this._getAutoCompleteFacade();
    if (autoComplete) {
      autoComplete.removeAttribute("aria-hidden");
      if (autoComplete.getAttribute("tabindex") === "-1") {
        autoComplete.removeAttribute("tabindex");
      }
    }
    if (autoComplete?.textInput) {
      autoComplete.textInput.removeAttribute("aria-hidden");
      if (autoComplete.textInput.getAttribute("tabindex") === "-1") {
        autoComplete.textInput.removeAttribute("tabindex");
      }
      controls.add(autoComplete.textInput);
    }
    const autoCompleteSearch = autoComplete?.querySelector?.("input[type='search']");
    if (autoCompleteSearch) {
      autoCompleteSearch.removeAttribute("aria-hidden");
      if (autoCompleteSearch.getAttribute("tabindex") === "-1") {
        autoCompleteSearch.removeAttribute("tabindex");
      }
      controls.add(autoCompleteSearch);
    }

    Array.from(this.querySelectorAll("input, textarea, select")).forEach((control) => {
      if (control === this._input && hiddenBackingInput) {
        return;
      }
      control.removeAttribute("aria-hidden");
      if (control.getAttribute("tabindex") === "-1") {
        control.removeAttribute("tabindex");
      }
      controls.add(control);
    });

    controls.forEach((control) => this._ensureControlAccessibility(control, labelId, fallbackLabel));
  }



  wire() {
      let slInp = this;
      //For API Calls
      if(slInp.dataset.api!=="") {
          slInp.addEventListener("click", async (e) => { slInp.apiCall(e);});
      }

      //Fill in facade if input directly altered
      slInp._onInputChange = async (e) => {
          slInp.dataset.text = e.target.value;
          let facadeEle=slInp.parentNode.querySelector("#"+slInp._inputId+"Facade");
          if(!facadeEle && slInp.dataset.type.toLowerCase()==="smlautocomplete") {
            facadeEle=slInp.parentNode.querySelector("#"+slInp._inputId+"AC");
          }

          if(facadeEle){
              if(slInp.dataset.type.toLowerCase()=="checkbox"){
                  facadeEle.checked=asBool(e.target.value);
              }else if(slInp._isOutputBoolean()){
                facadeEle.value = slInp._asCheckboxGlyph(e.target.value);
              }else{
                  facadeEle.value=e.target.value;
              }
          }else{
            if (slInp._input.value && slInp._input.value.trim() !== "" && slInp._input.type.toLowerCase()!="hidden") { 
              slInp._input.classList.add("smlHasValue"); 
            } else { 
              slInp._input.classList.remove("smlHasValue"); 
            }

          }
          if(facadeEle===null){ //facade not found
            if (slInp._input.value && slInp._input.value.trim() !== "") { 
              slInp._input.classList.add("smlHasValue"); 
            } else { 
              slInp._input.classList.remove("smlHasValue"); 
            }
          }else{
            if(slInp.dataset.type.toLowerCase()==="checkbox"){
              facadeEle.classList.toggle("smlHasValue", facadeEle.checked === true);
              slInp._input.classList.remove("smlHasValue");
            }else if (facadeEle.value && facadeEle.value.trim() !== "") { 
              facadeEle.classList.add("smlHasValue"); 
            } else { 
              facadeEle.classList.remove("smlHasValue"); 
            }
         }
      };
      slInp._input.removeEventListener("change", slInp._onInputChange);
      slInp._input.addEventListener("change", slInp._onInputChange);
      slInp._input.removeEventListener("input", slInp._onInputChange);
      slInp._input.addEventListener("input", slInp._onInputChange);


      //For Url (Navigation)
      if(slInp.dataset.url) {
          slInp.addEventListener("click", async (e) => {
              unobtrusiveWait("Going to " + e.currentTarget.dataset.url);
              window.location.href=slInp.dataset.url;
              setTimeout(()=>{unobtrusiveWaitOff();},10000);
          });
      }else if(slInp.dataset.type.toLowerCase()=="select") {  //SELECT
          const selectElement = slInp.parentNode?.querySelector("select");
          if (selectElement) {
            selectElement.addEventListener("change", async (e) => {
                slInp._input.value = e.target.value;
            });
          }
      }else if(slInp.dataset.type.toLowerCase()=="checkbox") {//Checkbox
          const checkboxElement = slInp.parentNode?.querySelector("input[type=checkbox]");
          if (checkboxElement) {
            checkboxElement.addEventListener("change", async (e) => {
                slInp._input.value = asBool(e.target.checked);
            });
          }
      }else{
          const textElement = slInp._getTextElement();
          if (textElement) {
            textElement.addEventListener("change", async (e) => {
              let inputEle=e.currentTarget;
              slInp._input.value = inputEle.value;
              if(inputEle.value && inputEle.value.trim()!=="") { inputEle.classList.add("smlHasValue"); } else { inputEle.classList.remove("smlHasValue"); }
            });
          }
      }
      //Set Default Value if exists
      //--------------------------Input      
      if(slInp.dataset.defaultValue && slInp.dataset.defaultValue!="") { 
        slInp._input.value=slInp.dataset.defaultValue;
      }
      //--------------------------Facade
      let facadeEle=slInp.parentNode.querySelector("#"+slInp._inputId+"Facade");
      if(facadeEle){
          if(slInp.dataset.type.toLowerCase()=="checkbox"){
              facadeEle.checked=asBool(slInp.dataset.defaultValue);
          }else if(slInp._isOutputBoolean()){
            facadeEle.value = slInp._asCheckboxGlyph(slInp.getAttribute("value") || slInp.dataset.defaultValue);
          }else{
              facadeEle.value=slInp.dataset.defaultValue;
          }
      }

      if(slInp.dataset.type.toLowerCase()=="display"){
          slInp._input.setAttribute("readonly", "readonly");
      }
      slInp._syncHasValueClass();
  }

  async apiCall() {
    let slInp = this;
    //api call logic here
    unobtrusiveWait("Processing " + slInp.dataset.text);
    let postData=await apiPostDirect(slInp.dataset.api, { forward: slInp.dataset.apiForward });
    unobtrusiveWaitOff();
    if (postData && postData.receipt && receiptCheckGood(postData.receipt)) {
        //success logic here
        window[slInp.dataset.apiForward](postData);
    } else {
        //failure logic here
        console.log("smlInput: API Call failed for "+slInp.dataset.api);
    }
    
  }

  _getAutoCompleteFacade() {
    return this.querySelector("sml-auto-complete");
  }

  _syncHasValueClass() {
    if (this._isCheckboxInput()) {
      const facadeElement = this._getFacadeElement();
      const hasValue = facadeElement?.checked === true;
      facadeElement?.classList.toggle("smlHasValue", hasValue);
      // Keep checkbox state on the visible facade only; hidden input should not trigger floating-label selectors.
      this._input?.classList.remove("smlHasValue");
      return;
    }

    if (this._isDateTimeInput()) {
      const textElement = this._getTextElement();
      textElement?.classList.add("smlHasValue");
      this._input?.classList.remove("smlHasValue");
      return;
    }

    const textElement = this._getTextElement();
    if (!textElement || typeof textElement.value === "undefined") {
      return;
    }

    const value = (textElement.value ?? "").toString();
    const hasValue = value.trim() !== "";
    textElement.classList.toggle("smlHasValue", hasValue);

    if (this._input && this._input.type?.toLowerCase() !== "hidden") {
      this._input.classList.toggle("smlHasValue", hasValue);
    }
  }

  _getFacadeElement() {
    return this.querySelector("#" + this._inputId + "Facade");
  }

  _isCheckboxInput() {
    return (this.dataset.type || "text").toLowerCase() === "checkbox";
  }

  _isDateTimeInput() {
    const inputType = (this.dataset.type || "").toLowerCase();
    return inputType === "datetime" || inputType === "datetime-local" || inputType === "datetimelocal";
  }

  _asCheckboxValue(value) {
    return asBool(value) ? "true" : "false";
  }

  _asCheckboxGlyph(value) {
    const token = String(value ?? "").trim().toLowerCase();
    if (["\u2611", "\u2713", "\u2714", "yes", "y", "1", "true", "checked", "on"].includes(token)) {
      return "\u2611";
    }
    if (["\u2610", "\u2612", "no", "n", "0", "false", "unchecked", "off"].includes(token)) {
      return "\u2610";
    }
    return asBool(value) ? "\u2611" : "\u2610";
  }

  _isOutputBoolean() {
    const inputType = (this.dataset.type || "text").toLowerCase();
    if (inputType !== "output") {
      return false;
    }

    const outputType = (this.dataset.outputType || "").toLowerCase();
    return outputType === "checkbox";
  }

  _setCheckboxValue(value) {
    const normalizedValue = this._asCheckboxValue(value);
    if (this._input) {
      this._input.value = normalizedValue;
    } else {
      this.setAttribute("value", normalizedValue);
    }

    this._syncFacadeFromValue(normalizedValue);
    this.dataset.text = normalizedValue;
    this._syncHasValueClass();
  }

  _getTextElement() {
    const autoComplete = this._getAutoCompleteFacade();
    if (autoComplete?.textInput) {
      return autoComplete.textInput;
    }

    const facadeElement = this._getFacadeElement();
    if (facadeElement) {
      return facadeElement;
    }

    if (this._input && this._input.type.toLowerCase() !== "hidden") {
      return this._input;
    }

    return null;
  }

  _getActiveControlElement() {
    const facadeElement = this._getFacadeElement();
    if (facadeElement && this._input?.type?.toLowerCase() === "hidden") {
      return facadeElement;
    }

    return this._input || facadeElement || null;
  }

  _syncFacadeFromValue(value) {
    const facadeElement = this._getFacadeElement();
    const inputType = (this.dataset.type || "text").toLowerCase();

    if (!facadeElement) {
      return;
    }

    if (inputType === "checkbox") {
      facadeElement.checked = asBool(value);
      facadeElement.value = value;
      return;
    }

    if (this._isOutputBoolean()) {
      facadeElement.value = this._asCheckboxGlyph(value);
      return;
    }

    if (inputType !== "smlautocomplete") {
      facadeElement.value = value;
    }
  }

  // --- Core value API ---
  get value() {
    if (this._isCheckboxInput()) {
      const facadeElement = this._getFacadeElement();
      if (facadeElement) {
        return facadeElement.checked ? "true" : "false";
      }
    }

    return this._input?.value ?? this.getAttribute("value") ?? "";
  }
  set value(v) {
    const nextValue = v ?? "";
    if (this._isCheckboxInput()) {
      this._setCheckboxValue(nextValue);
      return;
    }

    if (this._input) {
      this._input.value = nextValue;
      this._syncFacadeFromValue(nextValue);
    } else {
      this.setAttribute("value", nextValue);
    }
  }

  get text() {
    const textElement = this._getTextElement();
    if (textElement && "value" in textElement && textElement.value !== undefined && textElement.value !== null && textElement.value !== "") {
      return textElement.value;
    }

    return this.value;
  }
  set text(v) {
    const nextText = v ?? "";
    this.dataset.text = nextText;

    const autoComplete = this._getAutoCompleteFacade();
    if (autoComplete?.textInput) {
      autoComplete.textInput.value = nextText;
      return;
    }

    const textElement = this._getTextElement();
    if (textElement && textElement !== this._input && "value" in textElement) {
      textElement.value = nextText;
      return;
    }

    this.value = nextText;
  }


  // --- Placeholder ---
  get placeholder() {
    return this._input?.placeholder ?? "";
  }
  set placeholder(v) {
    if (this._input) this._input.placeholder = v;
  }

  // --- Required ---
  get required() {
    return this._input?.required ?? false;
  }
  set required(v) {
    if (this._input) this._input.required = v;
  }

  // --- Disabled ---
  get disabled() {
    const activeElement = this._getActiveControlElement();
    if (activeElement && "disabled" in activeElement) {
      return activeElement.disabled;
    }

    return false;
  }
  set disabled(v) {
    const nextDisabled = asBool(v);
    if (this._input && "disabled" in this._input) {
      this._input.disabled = nextDisabled;
    }

    const facadeElement = this._getFacadeElement();
    if (facadeElement && "disabled" in facadeElement) {
      facadeElement.disabled = nextDisabled;
    }

    if (nextDisabled) {
      this.setAttribute("disabled", "true");
    } else {
      this.removeAttribute("disabled");
    }
  }

  // --- Readonly ---
  get readOnly() {
    const activeElement = this._getActiveControlElement();
    if (activeElement && "readOnly" in activeElement) {
      return activeElement.readOnly;
    }

    return false;
  }
  set readOnly(v) {
    const nextReadOnly = asBool(v);
    if (this._input && "readOnly" in this._input) {
      this._input.readOnly = nextReadOnly;
    }

    const facadeElement = this._getFacadeElement();
    if (facadeElement && "readOnly" in facadeElement) {
      facadeElement.readOnly = nextReadOnly;
    }

    if (nextReadOnly) {
      this.setAttribute("readonly", "true");
    } else {
      this.removeAttribute("readonly");
    }
  }

  // --- Maxlength ---
  get maxLength() {
    return this._input?.maxLength ?? -1;
  }
  set maxLength(v) {
    if (this._input) this._input.maxLength = v;
  }

  // --- Minlength ---
  get minLength() {
    return this._input?.minLength ?? -1;
  }
  set minLength(v) {
    if (this._input) this._input.minLength = v;
  }

  // --- Pattern ---
  get pattern() {
    return this._input?.pattern ?? "";
  }
  set pattern(v) {
    if (this._input) this._input.pattern = v;
  }

  // --- Autocomplete ---
  get autocomplete() {
    return this._input?.autocomplete ?? "";
  }
  set autocomplete(v) {
    if (this._input) this._input.autocomplete = v;
  }

  // --- Name ---
  get name() {
    return this._input?.name ?? "";
  }
  set name(v) {
    if (this._input) this._input.name = v;
  }

  // --- Type (for input elements only) ---
  get type() {
    return this._input?.type ?? "";
  }
  set type(v) {
    if (this._input && "type" in this._input) {
      this._input.type = v;
    }
  }

  // --- Checked (checkbox / radio only) ---
  get checked() {
    const facadeElement = this._getFacadeElement();
    if (facadeElement && "checked" in facadeElement) {
      return facadeElement.checked;
    }

    return this._input?.checked ?? false;
  }
  set checked(v) {
    const nextChecked = asBool(v);
    const facadeElement = this._getFacadeElement();
    if (facadeElement && "checked" in facadeElement) {
      facadeElement.checked = nextChecked;
    }

    if (this._input) {
      if ("checked" in this._input) {
        this._input.checked = nextChecked;
      }
    }

    this._setCheckboxValue(nextChecked);
  }

  // --- SelectedIndex (select only) ---
  get selectedIndex() {
    return this._input?.selectedIndex ?? -1;
  }
  set selectedIndex(v) {
    if (this._input && "selectedIndex" in this._input) {
      this._input.selectedIndex = v;
    }
  }

  // --- Options (select only) ---
  get options() {
    return this._input?.options ?? null;
  }



}

customElements.define("sml-input", smlInput);

export default smlInput;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^