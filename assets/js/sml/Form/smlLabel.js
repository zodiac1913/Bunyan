//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! Jesu, Juva !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//     *          |¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯|       †          _____          ↑
//   _____        |  o o o o o o  |      /|\        (     )         ↑
//  /  ^  \       | o o o o o o o |     / | \      (       )       / \
// /_/___\_\      |_______________|    /  |  \      (]¯¯¯[)       /   \
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
/* eslint-disable no-undef */
/* eslint-disable no-console */
/*!
 * smlLabel --- sml FormField Label module for SML FormFields
 * Public Domain Licensed Copyright Law of the United States of America, Section 105 (https://www.copyright.gov/title17/92chap1.html#105)
 * Et qui me misit, mecum est: non reliquit me solum Pater, quia ego semper quae placita sunt ei, facio!
 * Published by: Dominic Roche of OIT/IUSG/DASM on 1/5/2026
 * @class smlLabel
 * @extends {HTMLElement}
 */
// תהילתו. לא שלי
import { clip, guid, jmlToHtml, replaceLast, unobtrusiveWait, unobtrusiveWaitOff } from '../smlUtils.js';
"use strict";
class smlLabel extends HTMLElement {
  constructor() {
        super();
        let slbl = this;
  }
  static observedAttributes=["data-api"];

    // connect component
  async connectedCallback() {
    let slbl = this;
    slbl.id = slbl.id || "slbl"+clip(guid(true),20);
    slbl.inputId=replaceLast(slbl.id,"Label","");
    if(slbl.className=="") slbl.className="smlLbl fw-bold mt-1 text-break rounded-2";
    slbl.dataset.api = slbl.getAttribute("data-api") || "";
    if(slbl.dataset.api && !slbl.dataset.apiForward) {
      slbl.dataset.apiForward = slbl.dataset.api.replaceAll("/","_").replaceAll("?","_").replaceAll("&","_").replaceAll("=","_");
      console.log("smlLabel: Setting apiForward to "+slbl.dataset.apiForward);
    }
    slbl.dataset.icon= slbl.getAttribute("data-icon") || "bi bi-question-circle";
    if(!slbl.for) {
      const facade = slbl.parentElement.querySelector(':scope > [id$="Facade"]');
      if(facade){
        slbl.for = facade.id;
      }else{
        slbl.for = slbl.inputId;
      }
      let firstInput=slbl.parentElement.querySelector("input[data-sml-property], input[data-cc-property]");
      if(!slbl.for) slbl.for = firstInput ? firstInput.id : (firstInput?.name?firstInput.name:"IDunno?");
    }
    if(!slbl.title) slbl.title="sml Label not explained, ask DASM to fix this";
    if(!slbl.title.includes(" for ")) slbl.title=slbl.title + " for " + slbl.for; 
    if(!slbl.ariaLabel) slbl.ariaLabel=slbl.title;
    if(!slbl.ariaLabel.includes(" for ")) slbl.ariaLabel=slbl.title + " for " + slbl.for;
    if(!slbl.classList.contains("smlLbl")) slbl.classList.add("smlLbl");
    if(!slbl.classList.contains("text-break")) slbl.classList.add("text-break");
    slbl.setAttribute("aria-label", slbl.dataset.text || slbl.title);
    slbl.setAttribute("aria-controls", slbl.for);
    let labelIconEnvRaw={i:slbl.id + "_" + "LblEnv",c:"align-items-start",b:[]};
    labelIconEnvRaw.b.push({n:"i",i:slbl.id + "_" + "Icon",for:slbl.for,c:slbl.dataset.icon+"", "aria-hidden":"true"});
    labelIconEnvRaw.b.push({n:"label",i:slbl.id + "_" + "LblText",for:slbl.for,c:"smlLblText labelToIconMediumOrLess ms-2", title:slbl.title, "aria-label":slbl.ariaLabel, "aria-hidden":"true", t: slbl.dataset.text || slbl.title});
    labelIconEnvRaw.b.push({n:"span",i:slbl.id + "_" + "SrText",c:"sr-only",t:slbl.dataset.text || slbl.title});
    let labelIconEnv=jmlToHtml(labelIconEnvRaw);
    slbl.innerHTML = labelIconEnv;
    const lblIcon=slbl.querySelector("#" + slbl.id + "_" + "Icon");
    const lblText=slbl.querySelector("#" + slbl.id + "_" + "LblText");
    lblIcon.for=slbl.for;
    lblText.for=slbl.for;
    lblIcon.classList.add("smlLabelMobileIcon");


    if (slbl.dataset.required === "true" || slbl.dataset.isRequired==="true"){
      const target = document.getElementById(slbl.for);
      if (target) {
        target.setAttribute("aria-required", "true");
      }

      // Optionally append visually:
      const lblText = slbl.querySelector("#" + slbl.id + "_LblText");
      //lblText.textContent = lblText.textContent + " *";
      lblText.classList.add("uc-astred","mt-0");
    }

    if (slbl.dataset.describedby) {
      const target = document.getElementById(slbl.for);
      if (target) {
        const existing = target.getAttribute("aria-describedby");
        const newVal = existing ? existing + " " + slbl.dataset.describedby : slbl.dataset.describedby;
        target.setAttribute("aria-describedby", newVal);
      }
    }
    const targetLblFor = document.getElementById(slbl.for);
    if (targetLblFor) {
      const existing = targetLblFor.getAttribute("aria-labelledby");
      const newId = slbl.id + "_SrText";
      targetLblFor.setAttribute(
        "aria-labelledby",
        existing ? existing + " " + newId : newId
      );
    }
    lblIcon.setAttribute("aria-controls", slbl.for);
    slbl.wire();
  }


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
                  console.log(`smlLabel: What you talking bout Willis? for attribute change ${name} from ${oldValue} to ${newValue}`);
                  break;
      }
  }

  wire() {
    let slbl = this;

    const hasAction = !!slbl.dataset.api || !!slbl.dataset.url;

    if (hasAction) {
      slbl.tabIndex = 0;

      // If url, act like a link
      if (slbl.dataset.url) {
        slbl.setAttribute("role", "link");
        slbl.setAttribute("aria-label", slbl.dataset.text || slbl.title);

        slbl.addEventListener("click", async (e) => {
          unobtrusiveWait("Going to " + e.currentTarget.dataset.url);
          window.location.href = slbl.dataset.url;
          setTimeout(() => { unobtrusiveWaitOff(); }, 10000);
        });
      }

      // If api, act like a button
      if (slbl.dataset.api) {
        slbl.setAttribute("role", "button");
        slbl.addEventListener("click", async (e) => { slbl.apiCall(e); });
      }

      // Keyboard activation (Space/Enter)
      slbl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          slbl.click();
        }
      });
    }
  }

  disconnectedCallback() {
    const slbl = this;
  }

  async apiCall() {
    let slbl = this;
    //api call logic here
    unobtrusiveWait("Processing " + slbl.dataset.text);
    let postData=await apiPostDirect(slbl.dataset.api, { forward: slbl.dataset.apiForward });
    unobtrusiveWaitOff();
    if (postData && postData.receipt && receiptCheckGood(postData.receipt)) {
        //success logic here
        window[slbl.dataset.apiForward](postData);
    } else {
        //failure logic here
        console.log("smlLabel: API Call failed for "+slbl.dataset.api);
    }
    
  }




}

customElements.define("sml-label", smlLabel);

export default smlLabel;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! Soli Deo Gloria !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^