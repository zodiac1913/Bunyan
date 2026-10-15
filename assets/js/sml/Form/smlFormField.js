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
 * smlFormField --- sml FormField module for SML FormFields
 * Public Domain Licensed Copyright Law of the United States of America, Section 105 (https://www.copyright.gov/title17/92chap1.html#105)
 * Et qui me misit, mecum est: non reliquit me solum Pater, quia ego semper quae placita sunt ei, facio!
 * Published by: Dominic Roche of OIT/IUSG/DASM on 1/5/2026
 * @class smlFormField
 * @extends {HTMLElement}
 */
// תהילתו. לא שלי
import sml from '../sml.js';
import smlLabel from './smlLabel.js';
import smlInput from './smlInput.js';
import smlValid from './smlValid.js';
import { asBool, apiPostDirect, clip, guid, unAlterEncapse, unobtrusiveWait, unobtrusiveWaitOff } from '../smlUtils.js';
"use strict";
class smlFormField extends HTMLElement {
  constructor(fld) {
        super();
        let sff = this;
        if(fld!==undefined){
            sff.fld=fld;
        }
  }
  static observedAttributes=["data-api"];

    // connect component
  async connectedCallback() {
    let sff = this;
    let sffLbl={};
    let sffInpt=new smlInput();
    const propertyName = sff.dataset.smlProperty || "Unknown";
    sff.childId=(sff.id.endsWith("Env")?sff.id.replaceLast("Env",""):sff.id);
    sff.shortId=sff.childId;
    sff.id = (sff.id || ("sff"+clip(guid(true),10))) + "SmlFF";
    if(sff.childId.includes("FormFieldFormField")) sff.childId.replaceLast("FormFieldFormField","FormField");
    if(!sff.title) sff.title="sml Form Field not explained, ask DASM to fix this";
    if(!sff.ariaLabel) sff.ariaLabel=sff.title;
    if(sff.className=="") sff.className="smlFF d-flex flex-row shadow shadow-navy shadow-lg rounded-2 m-1 p-3";
    //Add input type classes for alterations
    sff.classList.add("sff" + (sff.dataset.inputType || "text").toLowerCase());
    if (asBool(sff.dataset.forceTextarea) || asBool(sff.dataset.outputTextarea)) {
      sff.classList.add("sfftextarea");
    }
    sff.style="flex-wrap: wrap;";
    sff.dataset.api = sff.getAttribute("data-api") || "";
    if(sff.dataset.api && !sff.dataset.apiForward) {
      sff.dataset.apiForward = sff.dataset.api.replaceAll("/","_").replaceAll("?","_").replaceAll("&","_").replaceAll("=","_");
      console.log("smlFormField: Setting apiForward to "+sff.dataset.apiForward);
    }
    sff.dataset.isRequired= sff.getAttribute("data-is-required") || "false";
    sff.dataset.icon= sff.getAttribute("data-icon") || "bi bi-question-circle";
    if(!sff.dataset.label) {
      sff.dataset.label = sff.textContent.trim() || "Some field I didnt bother to label?";
    }
    if(!sff.dataset.text) {
      sff.dataset.text = sff.textContent.trim() || "";
    }
    if(sff.innerHTML.trim()!=="") { //has children (check to conjure label and input)
      if(sff.querySelector("sml-label")) {
        sffLbl=sff.querySelector("sml-label");
      }else{
        sffLbl=new smlLabel();
        sffLbl.dataset.text=sff.dataset.label;
        sffLbl.dataset.icon=sff.dataset.icon;
        sffLbl.dataset.inputType=sff.dataset.inputType || "text";
        sffLbl.id=sff.childId+"Label";
        sffLbl.dataset.smlProperty=propertyName;
        sffLbl.title=sff.title;
        sffLbl.classList.add("sff" + (sff.dataset.inputType || "text").toLowerCase());
        sffLbl.dataset.isRequired=sff.dataset.isRequired;
        sff.prepend(sffLbl);
      }
      if(sff.querySelector("sml-input")) {
        sffInpt=sff.querySelector("sml-input");
        if(sff.dataset.dropdown) sffInpt.dataset.sfDropDownJson=unAlterEncapse(sff.dataset.dropdown);
      }else{
        sffInpt.dataset.text=sff.dataset.text;
        sffInpt.dataset.icon=sff.dataset.icon;
        sffInpt.dataset.isRequired=sff.dataset.isRequired;
        sffInpt.dataset.type=sff.dataset.inputType || "text";
        if(sff.dataset.placeholder!==undefined) sffInpt.dataset.placeholder=sff.dataset.placeholder;
        if(sff.dataset.hidden) sffInpt.dataset.hidden=sff.dataset.hidden;
        if(sff.dataset.dropdown) sffInpt.dataset.sfDropDownJson=unAlterEncapse(sff.dataset.dropdown);
        sffInpt.title=sff.title;
        sffInpt.id=sff.childId+(sff.childId.includes("FormField")?"":"FormField");
        sffInpt.dataset.smlProperty=propertyName;
        sffInpt.dataset.ccProperty=propertyName;
        sffInpt.dataset.propertyType = sff.dataset.propertyType || "";
        sffInpt.dataset.defaultValue=sff.dataset.defaultValue || "";
        sffInpt.dataset.sfDefaultValueShow=sff.dataset.sfDefaultValueShow || "";
        sff.appendChild(sffInpt);
      }
      sffInpt.classList.add("sff" + (sff.dataset.inputType || "text").toLowerCase());
    }else{
      sffLbl=new smlLabel();
      sffLbl.id=sff.childId+"Label";
      sffLbl.className="smlLbl fw-bold mt-1 text-break rounded-2";
      sffLbl.dataset.text=sff.dataset.label;
      sffLbl.dataset.icon=sff.dataset.icon;
      sffLbl.dataset.inputType=sff.dataset.inputType || "text";
      sffLbl.dataset.smlProperty=propertyName;
      sffLbl.title=sff.title + (asBool(sff.dataset.isRequired)?" -- This field is required!":"");
      sffLbl.classList.add("sff" + (sff.dataset.inputType || "text").toLowerCase());
      sffLbl.dataset.isRequired=sff.dataset.isRequired;
      sff.appendChild(sffLbl);

      sffInpt= new smlInput(sff.fld);
      sffInpt.dataset.type=sff.dataset.inputType || "text";
      sffInpt.id=sff.childId+(sff.childId.includes("FormField")?"":"FormField");
      sffInpt.name=sffInpt.id;
      sffInpt.value=sff.dataset.text;
      sffInpt.text=sff.dataset.text;
      sffInpt.placeholder=" ";
      sffInpt.dataset.isRequired=sff.dataset.isRequired;
      sffInpt.dataset.smlProperty=propertyName;
      sffInpt.dataset.ccProperty=propertyName;
      sffInpt.dataset.propertyType = sff.dataset.propertyType || "";
      if(sff.dataset.placeholder!==undefined) sffInpt.dataset.placeholder=sff.dataset.placeholder;
      if(sff.dataset.dropdown) sffInpt.dataset.sfDropDownJson=unAlterEncapse(sff.dataset.dropdown);
      sffInpt.title=sff.title;
      if(!!sff.dataset.readonly) {
        sffInpt.readOnly=asBool(sff.dataset.readonly);
      }
      sffInpt.classList.add("sff" + (sff.dataset.inputType || "text").toLowerCase());
      sffInpt.dataset.defaultValue=sff.dataset.defaultValue || "";
      sffInpt.dataset.sfDefaultValueShow=sff.dataset.sfDefaultValueShow || "";
      sff.appendChild(sffInpt);
    }

    if(sff?.dataset?.defaultValue && sff?.dataset?.defaultValue!="") { 
      sffInpt.dataset.defaultValue=sff.dataset.defaultValue;
    }
    if(sff?.dataset?.sfDefaultValueShow && sff?.dataset?.sfDefaultValueShow!="") { 
      sffInpt.dataset.sfDefaultValueShow=sff.dataset.sfDefaultValueShow;
    }
    if(sff?.dataset?.sfNumberLowRange && sff?.dataset?.sfNumberLowRange!="") {
      sffInpt.dataset.sfNumberLowRange=sff.dataset.sfNumberLowRange;
    }
    if(sff?.dataset?.sfNumberHighRange && sff?.dataset?.sfNumberHighRange!="") {
      sffInpt.dataset.sfNumberHighRange=sff.dataset.sfNumberHighRange;
    }
    if(sff?.dataset?.minLength && sff?.dataset?.minLength!="") {
      sffInpt.dataset.minLength=sff.dataset.minLength;
    }
    if(sff?.dataset?.maxLength && sff?.dataset?.maxLength!="") {
      sffInpt.dataset.maxLength=sff.dataset.maxLength;
    }
    if(sff?.dataset?.pattern && sff?.dataset?.pattern!="") {
      sffInpt.dataset.pattern=sff.dataset.pattern;
    }
    if(sff?.dataset?.minLength && sff?.dataset?.minLength!="") {
      const parsedMinLength = Number.parseInt(sff.dataset.minLength, 10);
      if (Number.isFinite(parsedMinLength) && parsedMinLength > -1) {
        sffInpt.minLength = parsedMinLength;
      }
    }
    if(sff?.dataset?.maxLength && sff?.dataset?.maxLength!="") {
      const parsedMaxLength = Number.parseInt(sff.dataset.maxLength, 10);
      if (Number.isFinite(parsedMaxLength) && parsedMaxLength > 0) {
        sffInpt.maxLength = parsedMaxLength;
      }
    }
    if(sff?.dataset?.pattern && sff?.dataset?.pattern!="") {
      sffInpt.pattern = sff.dataset.pattern;
    }
    if(sff?.dataset?.outputType && sff.dataset.outputType!="") {
      sffInpt.dataset.outputType = sff.dataset.outputType;
    }
    if (sff?.dataset?.forceTextarea && sff.dataset.forceTextarea != "") {
      sffInpt.dataset.forceTextarea = sff.dataset.forceTextarea;
      sff.classList.add("sfftextarea");
    }
    if (sff?.dataset?.outputTextarea && sff.dataset.outputTextarea != "") {
      sffInpt.dataset.outputTextarea = sff.dataset.outputTextarea;
      sff.classList.add("sfftextarea");
    }
    if(sff?.dataset?.propertyType && sff.dataset.propertyType!="") {
      sffInpt.dataset.propertyType = sff.dataset.propertyType;
    }
    if (sff?.dataset?.secondaryFocus && sff.dataset.secondaryFocus != "") {
      sffInpt.dataset.secondaryFocus = sff.dataset.secondaryFocus;
    }


    //Label Attributes
    sffLbl.for=sff.id;
    sffLbl.ariaLabel=sff.title;
    sffLbl.id=sff.childId+"Label";
    sffLbl.dataset.inputType=sff.dataset.inputType || "text";
    sffLbl.dataset.isRequired=sff.dataset.isRequired;

    //~~~~~~~~~~~\/~~~~~~~~~~~  <-- Input Will Handle this
    //make Valid element
    // let sffValid= new smlValid();
    // sffValid.id=sff.shortId+"Valid";
    // sffValid.for=sff.id;
    // sff.appendChild(sffValid);
    //~~~~~~~~~~~/\~~~~~~~~~~~  <-- Input Will Handle this



    //:input Attributes
    //let sffInput=

    sff.sffLbl=sffLbl;
    sff.sffInpt=sffInpt;
    if (!sff.querySelector("sml-valid") && sff.dataset.inputType !== "hidden") {
      const sffValid = new smlValid();
      sffValid.id = sff.childId + "Valid";
      sffValid.setAttribute("for", sffInpt.id);
      sffValid.setAttribute("aria-live", "polite");
      sff.appendChild(sffValid);
      sff.sffValid = sffValid;
    }
    //Outer Span
    //let outerSpan={n:"span",i:sff.id+"OuterSpan",c:"d-flex flex-row border border-1 border-dark m-2 p-2",s:"min-width:24em;min-height:.5em;flex-direction: column;justify-content:center;",b:[sffLbl,sffInpt]};
    //sff.insertAdjacentHTML("afterbegin",jmlToHtml(outerSpan));

    //Checks
    if(!sff.classList.contains("smlFF")) sff.classList.add("smlFF");
    sff.wire();
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
              default: //WATDUH!
                  console.log(`smlFormField: What you talking bout Willis? for attribute change ${name} from ${oldValue} to ${newValue}`);
                  break;
      }
  }

  wire() {
      let sff = this;
      //For API Calls
      if(sff.dataset.api!=="" && !sff.querySelector("sml-auto-complete")) {
          sff.addEventListener("click", async (e) => { sff.apiCall(e);});
      }
      //For Url (Navigation)
      if(sff.dataset.url) {
          sff.addEventListener("click", async (e) => {
              unobtrusiveWait("Going to " + e.currentTarget.dataset.url);
              window.location.href=sff.dataset.url;
              setTimeout(()=>{unobtrusiveWaitOff();},10000);
          });
      }

      // sff.sffLbl.addEventListener("click", async (e) => {
      //     sff.sffInpt.focus();
      // });

  }

  async apiCall() {
    let sff = this;
    //api call logic here
    unobtrusiveWait("Processing " + sff.dataset.text);
    let postData=await apiPostDirect(sff.dataset.api, { forward: sff.dataset.apiForward });
    unobtrusiveWaitOff();
    if (postData && postData.receipt && receiptCheckGood(postData.receipt)) {
        //success logic here
        window[sff.dataset.apiForward](postData);
    } else {
        //failure logic here
        console.log("smlFormField: API Call failed for "+sff.dataset.api);
    }
    
  }

  get value() {
    return this.sffInpt?.value ?? this.querySelector("sml-input")?.value ?? this.dataset.text ?? "";
  }
  set value(v = "") {
    const nextValue = v;
    this.dataset.text = nextValue;
    const input = this.sffInpt ?? this.querySelector("sml-input");
    if (input) {
      input.value = nextValue;
    }
  }

  get text() {
    const input = this.sffInpt ?? this.querySelector("sml-input");
    return input?.text ?? this.value;
  }
  set text(v = "") {
    const nextText = v;
    this.dataset.text = nextText;
    const input = this.sffInpt ?? this.querySelector("sml-input");
    if (input) {
      input.text = nextText;
    }
  }




}

customElements.define("sml-form-field", smlFormField);

export default smlFormField;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^