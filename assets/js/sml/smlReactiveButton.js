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
 * smlReactiveButton --- sml Reactive Button module for SML Reactive Buttons
 * Public Domain Licensed Copyright Law of the United States of America, Section 105 (https://www.copyright.gov/title17/92chap1.html#105)
 * Et qui me misit, mecum est: non reliquit me solum Pater, quia ego semper quae placita sunt ei, facio!
 * Published by: Dominic Roche of OIT/IUSG/DASM on 12/30/2025
 * @class smlReactiveButton
 * @extends {HTMLElement}
 */
// תהילתו. לא שלי
import sml from './sml.js';
import { apiPostDirect, clip, guid, jmlToHtml, receiptCheckGood, unobtrusiveWait, unobtrusiveWaitOff } from './smlUtils.js';
"use strict";
class smlReactiveButton extends HTMLElement {
  static observedAttributes=["data-api","data-toggler-done","data-active","disabled"];

  get disabled() {
    const srb = this;
    return srb.hasAttribute("disabled");
  }

  set disabled(value) {
    const srb = this;
    srb.toggleAttribute("disabled", Boolean(value));
  }

  isTableActionMode(){
    return (this.dataset.apiMode || "").toLowerCase() === "table-action";
  }

    // connect component
  async connectedCallback() {
    let srb = this;
    srb.initializeBaseAttributes();
    srb.normalizeApiMetadata();

    // Table action buttons can appear in very large counts; keep init minimal.
    if (srb.isTableActionMode()) {
      if (!srb.dataset.text) {
        srb.dataset.text = srb.textContent.trim() || "Action";
      }
      if ((srb.dataset.icon || "").trim().length > 0) {
        srb.buildButtonMarkup();
      } else if (!srb.textContent.trim()) {
        srb.textContent = srb.dataset.text;
      }
      srb.ensureBaseClasses();
      srb.syncDisabledState();
      srb.wire();
      return;
    }

    srb.normalizeButtonTypeMetadata();
    srb.normalizeAuthorInnerText();
    srb.normalizeActiveMetadata();
    srb.applyButtonTypeIntentDefaults();
    srb.warnButtonTypeConflicts();
    srb.applyUrlActiveState();
    if (srb.hasManagedActiveState()) {
      srb.setAttribute("aria-pressed", srb.dataset.active === "true");
    } else {
      srb.removeAttribute("aria-pressed");
    }
    if ((srb.dataset.apiMode || "").toLowerCase() === "table-action") {
      srb.dataset.icon = srb.dataset.icon || "";
    } else {
      srb.dataset.icon = srb.dataset.icon || "bi bi-question-circle";
    }
    if(!srb.dataset.text) {
      srb.dataset.text = srb.textContent.trim() || "Whats this do?";
    }
    srb.buildButtonMarkup();
    srb.ensureBaseClasses();
    srb.syncDisabledState();
    srb.wire();
    srb.applyActiveStyling();
  }

  normalizeAuthorInnerText() {
    let srb = this;
    if (srb.dataset.authorTextNormalized === "true") return;

    const authoredInnerText = Array.from(srb.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => (node.textContent || "").trim())
      .filter(text => text.length > 0)
      .join(" ")
      .trim();
    if (!authoredInnerText) return;

    const existingDataText = (srb.dataset.text || "").trim();
    if (!existingDataText) {
      srb.dataset.text = authoredInnerText;
      srb.dataset.authorTextNormalized = "true";
      return;
    }

    if (existingDataText === authoredInnerText) {
      srb.dataset.authorTextNormalized = "true";
      return;
    }

    const combinedText = (existingDataText + " " + authoredInnerText)
      .replaceAll(/\s+/g, " ")
      .trim();
    srb.dataset.text = combinedText;
    srb.dataset.authorTextNormalized = "true";
  }

  initializeBaseAttributes() {
    let srb = this;
    srb.id = srb.id || "SRB"+clip(guid(true),20);
    if(!srb.type) srb.type="button";
    if(!srb.role) srb.role="button";
    if(!srb.hasAttribute("tabindex")) srb.tabIndex = 0;
    
    // WCAG Fix #14: Use data-text as fallback for aria-label, not generic error message
    const dataText = srb.dataset.text || "";
    if(!srb.title) srb.title=dataText || "Button";
    if(!srb.ariaLabel) srb.ariaLabel=srb.title;
    
    // Log error if button has no descriptive text
    if (!dataText && !srb.ariaLabel) {
      console.error("smlReactiveButton: Button ID " + srb.id + " has no aria-label, title, or data-text attribute. Provide at least one for accessibility.");
    }
    
    if(srb.className=="") srb.className="smlRB btn btn-outline-primary border-0 text-white text-nowrap text-truncate";
    
    // WCAG Fix: Add destructive label suffix for danger buttons unless explicitly disabled.
    const allowDestructiveLabelSuffix = (srb.dataset.destructiveLabelSuffix || "true").toLowerCase() !== "false";
    if (allowDestructiveLabelSuffix && (srb.classList.contains("btn-danger") || srb.classList.contains("btn-outline-danger"))) {
      if (!srb.ariaLabel.includes("destructive")) {
        srb.ariaLabel = srb.ariaLabel + " (destructive action)";
      }
    }
  }

  normalizeApiMetadata() {
    let srb = this;
    srb.dataset.api = srb.dataset.api || "";
    if(srb.dataset.api && !srb.dataset.apiForward) {
      srb.dataset.apiForward = srb.dataset.api.replaceAll("/","_").replaceAll("?","_").replaceAll("&","_").replaceAll("=","_");
      //console.log("smlReactiveButton: Setting apiForward to "+srb.dataset.apiForward);
    }
  }

  normalizeActiveMetadata() {
    let srb = this;
    const hasDataActive = srb.dataset.active !== undefined;
    if (!hasDataActive) {
      delete srb.dataset.active;
      return;
    }
    const isActive = (srb.dataset.active || "false").toString().toLowerCase() === "true";
    srb.dataset.active = isActive ? "true" : "false";
  }

  getSupportedButtonTypes() {
    return ["stateless", "toggle", "link", "command", "menu", "destructive"];
  }

  inferButtonType() {
    let srb = this;
    if ((srb.dataset.apiMode || "").toLowerCase() === "change-role") return "command";
    if ((srb.dataset.apiMode || "").toLowerCase() === "table-action") return "command";
    if (srb.dataset.handlePeers === "true" || srb.dataset.active !== undefined || srb.dataset.toggles === "true") return "toggle";
    if ((srb.dataset.url || "") !== "" && (srb.dataset.url || "") !== "null") return "link";
    if ((srb.dataset.api || "") !== "") return "command";
    if (srb.dataset.menu === "true" || srb.getAttribute("aria-haspopup") === "true") return "menu";
    if (srb.classList.contains("btn-danger") || srb.classList.contains("btn-outline-danger")) return "destructive";
    return "stateless";
  }

  normalizeButtonTypeMetadata() {
    let srb = this;
    const supported = srb.getSupportedButtonTypes();
    const rawType = (srb.dataset.buttonType || "").toString().trim().toLowerCase();
    const normalizedType = rawType || srb.inferButtonType();

    if (rawType && !supported.includes(rawType)) {
      if (srb.dataset.buttonTypeWarned !== "true") {
        console.warn("smlReactiveButton: Unsupported data-button-type='" + rawType + "'. Falling back to inferred type.", srb.id || srb);
        srb.dataset.buttonTypeWarned = "true";
      }
      srb.dataset.buttonType = srb.inferButtonType();
      return;
    }

    srb.dataset.buttonType = normalizedType;
  }

  applyButtonTypeIntentDefaults() {
    let srb = this;
    const buttonType = (srb.dataset.buttonType || "stateless").toLowerCase();
    if (buttonType === "toggle" && srb.dataset.active === undefined && srb.dataset.toggles === undefined) {
      srb.dataset.toggles = "true";
    }
    if (buttonType === "menu" && !srb.hasAttribute("aria-haspopup")) {
      srb.setAttribute("aria-haspopup", "true");
      srb.setAttribute("aria-expanded", "false");  // WCAG Fix: Initialize expanded state for menu buttons
    }
  }

  warnButtonTypeConflicts() {
    let srb = this;
    if (srb.dataset.buttonTypeConflictWarned === "true") return;

    const buttonType = (srb.dataset.buttonType || "stateless").toLowerCase();
    const hasUrl = !!(srb.dataset.url && srb.dataset.url !== "" && srb.dataset.url !== "null");
    const hasApi = !!(srb.dataset.api && srb.dataset.api !== "");
    const hasManagedToggle = srb.dataset.active !== undefined || srb.dataset.toggles === "true";
    const apiMode = (srb.dataset.apiMode || "").toLowerCase();

    if (buttonType === "link" && !hasUrl) {
      console.warn("smlReactiveButton: data-button-type='link' without data-url.", srb.id || srb);
    }
    if (buttonType === "toggle" && !hasManagedToggle) {
      console.warn("smlReactiveButton: data-button-type='toggle' has no managed active metadata.", srb.id || srb);
    }
    if (buttonType === "stateless" && (hasUrl || hasApi || hasManagedToggle || apiMode === "change-role")) {
      console.warn("smlReactiveButton: data-button-type='stateless' conflicts with interactive action/state metadata.", srb.id || srb);
    }
    if (buttonType === "menu" && (hasUrl || hasApi || apiMode === "change-role")) {
      console.warn("smlReactiveButton: data-button-type='menu' should not mix with API/URL action wiring.", srb.id || srb);
    }

    srb.dataset.buttonTypeConflictWarned = "true";
  }

  buildButtonMarkup() {
    let srb = this;
    const isIconOnly = srb.dataset.iconOnly === "true" || srb.classList.contains("sml-icon-only");
    
    // WCAG Fix #6: Require data-text for icon-only buttons
    if (isIconOnly && !srb.dataset.text) {
      console.error("smlReactiveButton: Icon-only button missing data-text attribute. Button ID: " + srb.id + ". Provide descriptive text for accessibility.");
      srb.dataset.text = "Icon button";
    }
    
    //build reactive button
    srb.innerHTML='';
    //outer span
    let outerSpan = {n:"span",c: srb.dataset.icon + " p-0", b:[]};
    // For icon-only buttons, keep hidden text for assistive tech.
    if(isIconOnly){
      outerSpan.b.push({
        n: "span",
        c: "sr-only visually-hidden",
        s: "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;",
        t: srb.dataset.text
      });
    }else{
      // For text buttons, render a single visible label to avoid duplicate-name scanners.
      let innerSpan = {n:"span",c:"ms-2 smlRBText hideOnMediumOrLessWindow",t:srb.dataset.text};
      outerSpan.b.push(innerSpan);
    }
    srb.insertAdjacentHTML("afterbegin",jmlToHtml(outerSpan));
  }

  ensureBaseClasses() {
    let srb = this;
    if(!srb.classList.contains("smlRB")) srb.classList.add("smlRB");
    if(!srb.classList.contains("text-truncate")) srb.classList.add("text-truncate");
    if(!srb.classList.contains("text-nowrap")) srb.classList.add("text-nowrap");
  }

  // attribute change handler
  /**
   * This updates class properties based on html tags being altered
   *
   * @param {*} name name of element tag
   * @param {*} oldValue old value for reference of element tag
   * @param {*} newValue new value of element tag
   * @memberof smlReactiveButton
   */
  attributeChangedCallback(name, oldValue, newValue) {
      let srb=this;
      if (oldValue === newValue) return;
      switch(name){
              case "data-api":
            srb.api=newValue || "";
                  break;
            case "data-active":
          if (newValue === null || newValue === undefined) {
            delete srb.dataset.active;
          } else {
            srb.dataset.active = (newValue + "").toLowerCase() === "true" ? "true" : "false";
          }
          // WCAG Fix #12: Update aria-pressed whenever data-active changes
          if (srb.hasManagedActiveState?.()) {
            srb.setAttribute("aria-pressed", srb.dataset.active === "true" ? "true" : "false");
          }
              srb.applyActiveStyling();
              break;
            case "data-text":
              // WCAG Fix #22: Re-validate icon-only buttons if data-text changes
              if (srb.dataset.iconOnly === "true") {
                if (!newValue) {
                  console.error("smlReactiveButton: Icon-only button ID " + srb.id + " had data-text removed. Provide descriptive text for accessibility.");
                  srb.dataset.text = "Icon button";
                } else {
                  // Update aria-label with new text
                  srb.ariaLabel = newValue;
                  srb.title = newValue;
                  const textSpan = srb.querySelector(".smlRBText");
                  if (textSpan) textSpan.textContent = newValue;
                }
              }
              break;
              case "disabled":
              srb.syncDisabledState();
              break;
              default: //WATDUH!
                  //console.log(`smlReactiveButton: What you talking bout Willis? for attribute change ${name} from ${oldValue} to ${newValue}`);
                  break;
      }
  }

  syncDisabledState() {
    let srb = this;
    const isDisabled = srb.hasAttribute("disabled") || srb.dataset.disabled === "true";
    if (isDisabled) {
      srb.setAttribute("aria-disabled", "true");
      srb.disabled = true;
      srb.tabIndex = -1;
      srb.style.setProperty("opacity", "0.65");
      // WCAG Fix #9: Add secondary visual indicator (strikethrough pattern) for color-blind users
      srb.style.setProperty("text-decoration", "line-through");
      srb.style.setProperty("text-decoration-color", "rgba(255, 0, 0, 0.3)");
      // Don't use pointer-events: none as it can interfere with keyboard event propagation
      return;
    }

    srb.removeAttribute("aria-disabled");
    srb.disabled = false;
    srb.tabIndex = 0;
    srb.style.removeProperty("opacity");
    srb.style.removeProperty("text-decoration");
    srb.style.removeProperty("text-decoration-color");
  }

  wire() {
      let srb = this;
      if (srb.dataset.formWired !== "true") {
        // Custom elements are not native submitters. A temporary submit input preserves form
        // validation, submitter name/value, and form overrides without submitting twice.
        srb.addEventListener("click", (event) => {
          if (srb.disabled || srb.dataset.disabled === "true") {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        }, true);
        srb.addEventListener("click", (event) => {
          if (event.defaultPrevented || srb.getAttribute("type") !== "submit") return;
          const form = srb.hasAttribute("form")
            ? document.getElementById(srb.getAttribute("form"))
            : srb.closest("form");
          if (!form) {
            console.error("smlReactiveButton: Submit button has no associated form.", srb.id);
            return;
          }
          const submitterId = `${srb.id}-submitter`;
          const submitterJml = { n: "input", type: "submit", hidden: true, id: submitterId };
          for (const name of ["name", "value", "formaction", "formmethod", "formenctype", "formtarget"]) {
            if (srb.hasAttribute(name)) submitterJml[name] = srb.getAttribute(name);
          }
          if (srb.hasAttribute("formnovalidate")) submitterJml.formnovalidate = true;
          form.insertAdjacentHTML("beforeend", jmlToHtml(submitterJml));
          const submitter = document.getElementById(submitterId);
          try {
            form.requestSubmit(submitter);
          } finally {
            submitter.remove();
          }
        });
        srb.dataset.formWired = "true";
      }
      const ownerForm = srb.hasAttribute("form")
        ? document.getElementById(srb.getAttribute("form"))
        : srb.closest("form");
      if (ownerForm && ownerForm.dataset.reactiveSubmitWired !== "true") {
        // Custom submitters do not participate in a browser's implicit Enter-key submission.
        ownerForm.addEventListener("keydown", (event) => {
          if (event.defaultPrevented || event.isComposing || event.key !== "Enter") return;
          const input = event.target;
          if (input.tagName !== "INPUT"
              || !["text", "search", "url", "tel", "email", "password", "number", "date", "datetime-local", "month", "week", "time"].includes(input.type)) return;
          const submitter = ownerForm.querySelector('sml-reactive-button[type="submit"]');
          if (!submitter) return;
          event.preventDefault();
          if (!submitter.disabled && submitter.dataset.disabled !== "true") submitter.click();
        });
        ownerForm.dataset.reactiveSubmitWired = "true";
      }
      const wasPreviouslyWired = srb.dataset.wired === "true";
      const isManualWire = srb.dataset.manualWire === "true";
      const skipApiWiring = wasPreviouslyWired || isManualWire;
      const hasApi = !!(srb.dataset.api && srb.dataset.api !== "");
      const hasUrl = !!(srb.dataset.url && srb.dataset.url !== "" && srb.dataset.url !== "null");

      //For API Calls
      if(!skipApiWiring && hasApi && !hasUrl && srb.dataset.apiWired!=="true") {
          srb.addEventListener("click", async (e) => { srb.apiCall(e);});
          srb.dataset.apiWired="true";
          srb.dataset.wcagClick="1";
      }
      //For Url (Navigation)
      if(hasUrl && srb.dataset.urlWired!=="true") {
          srb.addEventListener("click", async (e) => {
            if (hasApi) {
              await srb.apiCall(e);
            }
            // WCAG Fix: Check if link is external or opens in new tab
            const isExternal = srb.dataset.target === "_blank" || (srb.dataset.url || "").includes("://") && !srb.dataset.url.startsWith(location.origin);
            if (isExternal) {
              unobtrusiveWait("Opening link in new tab...");
              window.open(srb.dataset.url, "_blank");
            } else {
              unobtrusiveWait("Going to " + e.currentTarget.dataset.url);
              globalThis.location.href=srb.dataset.url;
            }
          });
          if (hasApi) srb.dataset.apiWired="true";
          srb.dataset.urlWired="true";
          srb.dataset.wcagClick="1";
          
          // WCAG Fix: Add external link indication to aria-label
          const isExternal = srb.dataset.target === "_blank" || (srb.dataset.url || "").includes("://") && !srb.dataset.url.startsWith(location.origin);
          if (isExternal && !srb.ariaLabel.includes("opens in new tab")) {
            srb.ariaLabel = srb.ariaLabel + " (opens in new tab)";
          }
      }else{
          //console.log("Not wiring url. url:" + srb.dataset.url + " wired:" + srb.dataset.wired);
      }
      srb.syncDisabledState();

      if(srb.dataset.keyWired!=="true"){
        srb.addEventListener("keydown", (e) => {
          if (srb.hasAttribute("disabled") || srb.dataset.disabled === "true") return;
          
          // WCAG Fix: Handle Escape key for close/cancel buttons
          const isCloseButton = srb.dataset.buttonRole === "close" || srb.dataset.cancel === "true" || srb.classList.contains("btn-close");
          if (e.key === "Escape" && isCloseButton) {
            e.preventDefault();
            srb.click();
            return;
          }
          
          // Handle Enter/Space activation
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            srb.click();
            return;
          }
          
          // WCAG Fix: Handle arrow keys for menu navigation
          if ((srb.dataset.buttonType || "").toLowerCase() === "menu" && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            srb.handleMenuKeyboardNavigation(e.key);
          }
        });
        srb.dataset.keyWired="true";
        srb.dataset.wcagKeyDown="1";
      }

      if(srb.dataset.activeClickWired!=="true") {
        srb.addEventListener("click", () => {
          srb.toggleActiveStateOnClick();
        });
        srb.dataset.activeClickWired = "true";
        srb.dataset.wcagClick="1";
      }

      srb.applyUrlActiveState();
      srb.applyActiveStyling();
  srb.dataset.wired = "true";
      
  }

  shouldAutoActivateByUrl() {
    let srb = this;
    if (!srb.dataset.url || srb.dataset.url === "" || srb.dataset.url === "null") return false;
    if (srb.dataset.activeByUrl === "false") return false;
    if (srb.dataset.activeByUrl === "true") return true;
    return srb.classList.contains("sidebarRelatedBtns");
  }

  normalizePath(pathValue) {
    let path = (pathValue || "/").toString().trim();
    if (path.length < 1) path = "/";
    path = path.replace(/\/+$/, "");
    if (path.length < 1) path = "/";
    return path.toLowerCase();
  }

  normalizeQueryParamKey(paramKey) {
    return (paramKey || "").toString().trim().toLowerCase();
  }

  normalizeQueryParamValue(paramValue) {
    return (paramValue ?? "").toString().trim();
  }

  collectQueryParams(searchParams) {
    let paramsMap = new Map();
    searchParams.forEach((value, key) => {
      const normalizedKey = this.normalizeQueryParamKey(key);
      const normalizedValue = this.normalizeQueryParamValue(value);
      if (!paramsMap.has(normalizedKey)) paramsMap.set(normalizedKey, []);
      paramsMap.get(normalizedKey).push(normalizedValue);
    });
    return paramsMap;
  }

  hasQuerySubset(targetParams, currentParams) {
    if (targetParams.size === 0) return true;

    for (let [key, targetValues] of targetParams.entries()) {
      const currentValues = currentParams.get(key) || [];
      if (currentValues.length < targetValues.length) return false;

      let counts = new Map();
      for (let value of currentValues) {
        counts.set(value, (counts.get(value) || 0) + 1);
      }

      for (let value of targetValues) {
        const remaining = counts.get(value) || 0;
        if (remaining < 1) return false;
        counts.set(value, remaining - 1);
      }
    }

    return true;
  }

  applyUrlActiveState() {
    let srb = this;
    if (!srb.shouldAutoActivateByUrl()) return;
    
    // WCAG Fix #18: Debug URL matching when data-debug-url-active is set
    const debugMode = srb.dataset.debugUrlActive === "true";

    try {
      const targetUrl = new URL(srb.dataset.url, location.origin);
      const currentUrl = new URL(location.href);
      const targetPath = srb.normalizePath(targetUrl.pathname);
      const currentPath = srb.normalizePath(currentUrl.pathname);

      if (targetPath !== currentPath) {
        if (debugMode) console.log(`smlReactiveButton ${srb.id}: Path mismatch. Target: ${targetPath}, Current: ${currentPath}`);
        srb.dataset.active = "false";
        return;
      }

      const targetQueryParams = srb.collectQueryParams(targetUrl.searchParams);
      if (targetQueryParams.size === 0) {
        if (debugMode) console.log(`smlReactiveButton ${srb.id}: No query params required, activating.`);
        srb.dataset.active = "true";
        return;
      }

      const currentQueryParams = srb.collectQueryParams(currentUrl.searchParams);
      const hasSubset = srb.hasQuerySubset(targetQueryParams, currentQueryParams);
      if (debugMode) {
        console.log(`smlReactiveButton ${srb.id}: Query param check. Target:`, targetQueryParams, `Current:`, currentQueryParams, `Match: ${hasSubset}`);
      }
      srb.dataset.active = hasSubset ? "true" : "false";
    } catch (err) {
      if (debugMode) console.error(`smlReactiveButton ${srb.id}: URL parsing error:`, err);
      srb.dataset.active = "false";
    }
  }

  applyActiveStyling() {
    let srb = this;
    if (!srb.hasManagedActiveState()) {
      srb.style.removeProperty("background-color");
      srb.style.removeProperty("border-color");
      srb.style.removeProperty("box-shadow");
      srb.style.removeProperty("color");
      srb.removeAttribute("aria-current");
      srb.removeAttribute("aria-pressed");
      return;
    }

    const isActive = (srb.dataset.active || "false").toLowerCase() === "true";
    srb.setAttribute("aria-pressed", isActive ? "true" : "false");

    if (!isActive) {
      srb.style.removeProperty("background-color");
      srb.style.removeProperty("border-color");
      srb.style.removeProperty("box-shadow");
      srb.style.removeProperty("color");
      srb.removeAttribute("aria-current");
      return;
    }

    const activeStyleMode = (srb.dataset.activeStyleAuto || "").toLowerCase();
    const shouldAutoRestyle = activeStyleMode === "true"
      || (activeStyleMode !== "false" && srb.shouldHandlePeers());

    // Keep default buttons visually stable unless the button explicitly opts in
    // or belongs to a peer-managed/sidebar group that needs selected-state chrome.
    if (!shouldAutoRestyle) {
      srb.setAttribute("aria-current", "page");
      srb.style.removeProperty("background-color");
      srb.style.removeProperty("border-color");
      srb.style.removeProperty("box-shadow");
      srb.style.removeProperty("color");
      return;
    }

    // WCAG Fix #7: Respect prefers-reduced-motion - skip animations/transitions for users with motion sensitivity
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const computedStyle = globalThis.getComputedStyle(srb);
    const currentBackground = srb.resolveCssColor(computedStyle.backgroundColor || "transparent");
    const hasSolidButtonFill = currentBackground !== null && currentBackground.a > 0;

    if (hasSolidButtonFill) {
      srb.style.removeProperty("background-color");
      srb.style.removeProperty("border-color");
      srb.style.removeProperty("color");
      if (!prefersReducedMotion) {
        srb.style.setProperty("box-shadow", "inset 0 3px 5px rgba(0, 0, 0, 0.18)", "important");
      }
      srb.setAttribute("aria-current", "page");
      return;
    }
    
    const minContrast = srb.resolveContrastTarget();
    const textColor = srb.resolveCssColor(computedStyle.color || "#ffffff");
    const inverseColor = srb.invertColor(textColor);
    const activeBg = srb.findClosestContrastColor(inverseColor, textColor, minContrast);
    const borderSeed = srb.mixColor(activeBg, textColor, 0.18);
    const borderColor = srb.findClosestContrastColor(borderSeed, textColor, 3);

    srb.style.setProperty("background-color", srb.rgbToCss(activeBg), "important");
    srb.style.setProperty("border-color", srb.rgbToCss(borderColor), "important");
    srb.style.setProperty("color", srb.rgbToCss(textColor), "important");
    
    // WCAG Fix #7: Only apply box-shadow if user hasn't disabled motion
    if (!prefersReducedMotion) {
      srb.style.setProperty("box-shadow", "inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 0 0 1px rgba(255, 255, 255, 0.10)", "important");
    }
    srb.setAttribute("aria-current", "page");
  }

  hasManagedActiveState() {
    let srb = this;
    return srb.dataset.active !== undefined || srb.dataset.toggles === "true" || srb.shouldAutoActivateByUrl();
  }

  shouldHandlePeers() {
    let srb = this;
    if (srb.dataset.handlePeers === "true") return true;
    if (srb.dataset.handlePeers === "false") return false;
    return srb.classList.contains("sidebarRelatedBtns");
  }

  toggleActiveStateOnClick() {
    let srb = this;
    const apiMode = (srb.dataset.apiMode || "").toLowerCase();
    if (!srb.hasManagedActiveState()) return;
    if (apiMode === "change-role") return;

    const wasActive = (srb.dataset.active || "false").toLowerCase() === "true";
    if (srb.shouldHandlePeers()) {
      srb.handlePeerManagedClick(wasActive);
    } else {
      srb.dataset.active = wasActive ? "false" : "true";
    }

    // WCAG Fix #21: Update aria-expanded for menu buttons
    if (srb.getAttribute("aria-haspopup") === "true") {
      srb.setAttribute("aria-expanded", srb.dataset.active === "true" ? "true" : "false");
    }

    srb.applyActiveStyling();
  }

  handlePeerManagedClick(wasActive) {
    let srb = this;
    const peerGroup = srb.resolvePeerGroup();
    if (!peerGroup) {
      if (srb.dataset.handlePeers === "true") srb.warnMissingPeerGroup();
      srb.dataset.active = wasActive ? "false" : "true";
      return;
    }

    // Highlander mode: exactly one active in the peer group.
    if (wasActive) {
      srb.dataset.active = "true";
      return;
    }

    srb.deactivatePeerButtonsInGroup(peerGroup);
    srb.dataset.active = "true";
    
    // WCAG Fix: Announce peer state change to screen readers
    const announcement = document.createElement("div");
    announcement.setAttribute("role", "status");
    announcement.setAttribute("aria-live", "polite");
    announcement.className = "visually-hidden";
    announcement.textContent = `Selected ${srb.ariaLabel || srb.dataset.text}. Other options deselected.`;
    document.body.append(announcement);
    setTimeout(() => announcement.remove(), 2000);
  }

  resolvePeerGroup() {
    let srb = this;
    return srb.closest(".btn-group-vertical, .btn-group, [role='group']");
  }

  warnMissingPeerGroup() {
    let srb = this;
    if (srb.dataset.peerGroupWarned === "true") return;
    console.warn("smlReactiveButton: data-handle-peers='true' but no nearest .btn-group/.btn-group-vertical/[role='group'] was found.", srb.id || srb);
    srb.dataset.peerGroupWarned = "true";
  }

  deactivatePeerButtonsInGroup(parentGroup) {
    let srb = this;
    if (!parentGroup) return;

    const siblings = Array.from(parentGroup.querySelectorAll("sml-reactive-button"));
    for (let sibling of siblings) {
      if (sibling === srb) continue;
      if (!sibling.hasManagedActiveState?.()) continue;
      sibling.dataset.active = "false";
      if (typeof sibling.applyActiveStyling === "function") sibling.applyActiveStyling();
    }
  }
  
  handleMenuKeyboardNavigation(direction) {
    let srb = this;
    // WCAG Fix: Find menu items associated with this button for keyboard navigation
    const menuId = srb.getAttribute("aria-controls");
    let menuItems = [];
    
    if (menuId) {
      const menu = document.getElementById(menuId);
      if (menu) {
        menuItems = Array.from(menu.querySelectorAll("[role='menuitem'], a, button")).filter(item => {
          return item.offsetParent !== null;  // Visible items only
        });
      }
    }
    
    if (menuItems.length === 0) return;
    
    const currentFocused = document.activeElement;
    const currentIndex = menuItems.indexOf(currentFocused);
    
    let nextIndex;
    if (direction === "ArrowDown") {
      nextIndex = (currentIndex + 1) % menuItems.length;
    } else {
      nextIndex = (currentIndex - 1 + menuItems.length) % menuItems.length;
    }
    
    menuItems[nextIndex].focus();
  }

  resolveContrastTarget(){
    // Default is Section 508 / WCAG AA contrast for normal text.
    const defaultContrast=4.5;
    const aaaContrast=7;
    const parentSidebar = this.closest("sml-sidebar");

    const buttonMin=Number.parseFloat(this.dataset?.contrastMin || "");
    if(Number.isFinite(buttonMin)) return this.clampContrastValue(buttonMin);

    const sidebarMin=Number.parseFloat(parentSidebar?.dataset?.contrastMin || "");
    if(Number.isFinite(sidebarMin)) return this.clampContrastValue(sidebarMin);

    const preference=((this.dataset?.contrastStandard || parentSidebar?.dataset?.contrastStandard || "") + "")
      .trim()
      .toUpperCase();
    if(preference==="AAA") return aaaContrast;
    if(preference==="AA" || preference==="508" || preference==="SECTION508" || preference==="WCAG-AA") {
      return defaultContrast;
    }

    return defaultContrast;
  }

  clampContrastValue(value){
    return Math.max(1, Math.min(21, value));
  }

  resolveCssColor(colorValue){
    let srb=this;
    let parsed=srb.parseColorValue(colorValue);
    if(parsed) return parsed;

    let probe=document.createElement("span");
    probe.style.color=colorValue;
    probe.style.display="none";
    document.body.appendChild(probe);
    let resolved=globalThis.getComputedStyle(probe).color;
    probe.remove();
    return srb.parseColorValue(resolved)||{r:255,g:255,b:255};
  }

  parseColorValue(colorValue){
    if(!colorValue || typeof colorValue!=="string") return null;
    const rgbRegex=/^rgba?\(([^)]+)\)$/i;
    const rgbMatch=rgbRegex.exec(colorValue.trim());
    if(rgbMatch){
      let parts=rgbMatch[1].split(",").map(p=>Number.parseFloat(p.trim()));
      if(parts.length>=3){
        return {
          r: Math.max(0, Math.min(255, Math.round(parts[0]))),
          g: Math.max(0, Math.min(255, Math.round(parts[1]))),
          b: Math.max(0, Math.min(255, Math.round(parts[2])))
        };
      }
    }

    if(colorValue.startsWith("#")){
      let hex=colorValue.slice(1).trim();
      if(hex.length===3){
        hex=hex.split("").map(h=>h+h).join("");
      }
      if(hex.length===6){
        return {
          r: Number.parseInt(hex.slice(0,2),16),
          g: Number.parseInt(hex.slice(2,4),16),
          b: Number.parseInt(hex.slice(4,6),16)
        };
      }
    }
    return null;
  }

  invertColor(color){
    // WCAG Fix #19: Respect prefers-color-scheme when inverting colors
    const prefersDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
    
    if (prefersDarkMode) {
      // In dark mode, use a more subtle inversion that works on dark backgrounds
      return {
        r: Math.round(255 - (color.r * 0.7)),
        g: Math.round(255 - (color.g * 0.7)),
        b: Math.round(255 - (color.b * 0.7))
      };
    }
    
    // Light mode: standard inversion
    return {
      r: 255-color.r,
      g: 255-color.g,
      b: 255-color.b
    };
  }

  mixColor(a,b,t){
    return {
      r: Math.round(a.r + (b.r-a.r)*t),
      g: Math.round(a.g + (b.g-a.g)*t),
      b: Math.round(a.b + (b.b-a.b)*t),
    };
  }

  rgbToCss(color){
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
  }

  channelToLinear(channel){
    let c=channel/255;
    return c<=0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
  }

  relativeLuminance(color){
    return (0.2126* this.channelToLinear(color.r))
      + (0.7152* this.channelToLinear(color.g))
      + (0.0722* this.channelToLinear(color.b));
  }

  contrastRatio(a,b){
    let l1=this.relativeLuminance(a);
    let l2=this.relativeLuminance(b);
    let high=Math.max(l1,l2);
    let low=Math.min(l1,l2);
    return (high+0.05)/(low+0.05);
  }

  colorDistance(a,b){
    let dr=a.r-b.r;
    let dg=a.g-b.g;
    let db=a.b-b.b;
    return (dr*dr)+(dg*dg)+(db*db);
  }

  findClosestContrastColor(startColor, textColor, minContrast){
    if(this.contrastRatio(startColor, textColor)>=minContrast) return startColor;

    const black={r:0,g:0,b:0};
    const white={r:255,g:255,b:255};
    const towardBlack=this.searchTowardsContrast(startColor, black, textColor, minContrast);
    const towardWhite=this.searchTowardsContrast(startColor, white, textColor, minContrast);

    if(towardBlack && towardWhite){
      return this.colorDistance(startColor, towardBlack) <= this.colorDistance(startColor, towardWhite)
        ? towardBlack
        : towardWhite;
    }
    if(towardBlack) return towardBlack;
    if(towardWhite) return towardWhite;

    // WCAG Fix #15: If no sufficient contrast found, fall back to guaranteed high-contrast pair
    const blackContrast = this.contrastRatio(black, textColor);
    const whiteContrast = this.contrastRatio(white, textColor);
    return blackContrast >= whiteContrast ? black : white;
  }

  searchTowardsContrast(startColor, targetColor, textColor, minContrast){
    if(this.contrastRatio(targetColor, textColor)<minContrast) return null;

    let low=0;
    let high=1;
    let best=null;
    for(let i=0;i<24;i++){
      let mid=(low+high)/2;
      let candidate=this.mixColor(startColor, targetColor, mid);
      if(this.contrastRatio(candidate, textColor)>=minContrast){
        best=candidate;
        high=mid;
      }else{
        low=mid;
      }
    }
    return best;
  }

  async apiCall() {
    let srb = this;
    if (srb.hasAttribute("disabled") || srb.dataset.disabled === "true") return;
    if ((srb.dataset.apiMode || "").toLowerCase() === "change-role") {
      await srb.apiCallChangeRole();
      return;
    }
    if ((srb.dataset.apiMode || "").toLowerCase() === "table-action") {
      await srb.apiCallTableAction();
      return;
    }
    
    // WCAG Fix: API call with accessibility announcements
    srb.setAttribute("aria-busy", "true");
    
    // WCAG Fix #17: Optional loading state text update (disable by setting data-skip-loading-text="true")
    const originalText = srb.dataset.text;
    const skipLoadingText = srb.dataset.skipLoadingText === "true";
    if (!skipLoadingText) {
      srb.dataset.text = "Loading...";
      const textSpan = srb.querySelector(".smlRBText");
      if (textSpan) textSpan.textContent = "Loading...";
    }
    
    const announcement = document.createElement("div");
    announcement.setAttribute("role", "status");
    announcement.setAttribute("aria-live", "polite");
    announcement.className = "visually-hidden";
    announcement.textContent = `Processing ${originalText}. Please wait.`;
    document.body.append(announcement);
    
    unobtrusiveWait("Processing " + originalText);
    let postData=await apiPostDirect(srb.dataset.api, { forward: srb.dataset.apiForward });
    unobtrusiveWaitOff();
    srb.removeAttribute("aria-busy");
    
    // Restore original text
    if (!skipLoadingText) {
      srb.dataset.text = originalText;
      const textSpan = srb.querySelector(".smlRBText");
      if (textSpan) textSpan.textContent = originalText;
    }
    
    if (postData?.receipt && receiptCheckGood(postData.receipt)) {
        // Success logic
        announcement.textContent = `Successfully processed ${originalText}.`;
      globalThis[srb.dataset.apiForward](postData);
    } else {
        // Failure logic
        announcement.textContent = `Failed to process ${originalText}. Please try again.`;
        srb.setAttribute("aria-invalid", "true");
        setTimeout(() => srb.removeAttribute("aria-invalid"), 5000);
        console.warn("smlReactiveButton: API Call failed for "+srb.dataset.api);
    }
    setTimeout(() => announcement.remove(), 3000);
  }

  async apiCallTableAction() {
    let srb = this;
    const tableId = srb.dataset.table || "";
    const ownerTable = srb.closest("sml-table, cc-table") || globalThis[tableId];

    if (!ownerTable || typeof ownerTable.handleActionButton !== "function") {
      console.warn("smlReactiveButton: table-action mode could not find owning table component.", srb.id || srb);
      return;
    }

    await ownerTable.handleActionButton(srb, { currentTarget: srb, target: srb });
  }

  async apiCallChangeRole() {
    let srb = this;
    const appSecurity = globalThis.appSec;
    const appContext = globalThis.cso;
    const showModal = globalThis.modalBox;
    let newRole = srb.dataset.rolename;
    let newElementText = srb.dataset.elementtext || srb.dataset.text || newRole;
    const controllerName = appContext?.CurrentApp?.ControllerName;

    if (!newRole) {
      console.warn("smlReactiveButton.changeRole: Missing data-rolename.");
      return;
    }

    if (newRole === appSecurity?.currentRole) {
      if (typeof showModal === "function") {
        showModal(
          "You are already configured for " + newElementText + " role!",
          "Already in Role"
        );
      }
      return;
    }

    const dataUp = {
      roleName: newRole,
      userIdentifier: appContext?.UserIdentifier,
      controllerAction: "ChangeRole",
      controllerName: controllerName,
    };

    unobtrusiveWait("Changing your role to " + newElementText + ". Please wait!",
      srb.id + "changeRole", srb.id);
    const api = srb.dataset.api || ("/" + controllerName + "/ChangeRole/");
    const data = await apiPostDirect(api, JSON.stringify(dataUp), "json");
    unobtrusiveWaitOff();

    if (!(await receiptCheckGood(data)) || data?.hasOwnProperty("redirect")) return;

    if (data?.hasOwnProperty("errorObject")) {
      console.warn("smlReactiveButton.changeRole: API returned errorObject.", data.errorObject);
      return;
    }

    const roleButtonGroup = srb.closest(".btn-group-vertical");
    const buttons = Array.from((roleButtonGroup || document).querySelectorAll(".sidebarRoleBtns"));
    const oldButton = buttons.find(b => b.classList.contains("btn-primary"));
    if (oldButton && oldButton !== srb) {
      oldButton.classList.remove("btn-primary");
      oldButton.classList.add("btn-outline-primary");
      oldButton.dataset.active = "false";
    }

    srb.classList.remove("btn-outline-primary");
    srb.classList.add("btn-primary");
    srb.dataset.active = "true";
    if (appSecurity) appSecurity.currentRole = newRole;

    const action = srb.dataset.action || data?.rolesComponent?.roles?.find(r => r.roleName === newRole)?.action;
    const dataControllerName = data?.currentApp?.ControllerName || controllerName;
    if (!action || !dataControllerName) {
      location.reload();
      return;
    }

    unobtrusiveWait("Changing your role to " + newRole + ". Please wait!",
      srb.id + "changeRole", srb.id);
    const hostRoot = (typeof globalThis.host === "string" && globalThis.host.length > 0) ? globalThis.host : location.origin;
    location.href = hostRoot + "/" + dataControllerName + "/" + action;
  }




}

customElements.define("sml-reactive-button", smlReactiveButton);

export default smlReactiveButton;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^