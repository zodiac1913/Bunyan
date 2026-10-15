//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
/*!
 * smlAutoComplete --- Auto-complete input component for SML
 * Can be used standalone OR as a facade inside smlInput
 * Public Domain Licensed Copyright Law of the United States of America, Section 105 (https://www.copyright.gov/title17/92chap1.html#105)
 * Published by: Dominic Roche of OIT/IUSG/DASM
 * @class smlAutoComplete
 * @extends {HTMLElement}
 */
"use strict";
import { asFieldNotationString, isJson, isJsonRepaired } from "../smlUtils.js";
import smlFormField from "./smlFormField.js";
class smlAutoComplete extends HTMLElement {
  constructor() {
    super();
    const sac = this;
    sac.abortController = null;
    sac.minChars = 3;
    sac.debounceMs = 300;
    sac.isLoading = false;
    sac.isFacade = false; // Will be true if used inside smlInput
    sac.hasValidSelection = false;
    //ids
    sac.baseId = "";
    sac.searchEle = null;
    sac.selectEle = null;
    sac.hiddenEle = null;
    sac.clearEle = null;
    sac.goButton = null;
    sac.isLone = false;
    sac.loneSubmitAction = "";
    sac.loneLabel = "";
    sac.loneGoText = "Go";
    sac.hasLoneSubmit = false;
    sac.selectNavPending = false;
    sac.repositionPopupBound = null;
    sac.dismissPopupBound = null;
  }

  disconnectedCallback() {
    const sac = this;
    sac.teardownPopupListeners();
    if (sac.selectElement?.parentElement === document.body) {
      sac.selectElement.remove();
    }
  }

  connectedCallback() {
    const sac = this;
    // Check if we're being used as a facade inside smlInput
    const parentInput = sac.closest('sml-input');
    
    sac.isFacade = !!parentInput;
    if (sac.isFacade) {
      if (!parentInput?._inputId) {
        console.error('smlAutoComplete facade mode requires parent sml-input to define _inputId');
        return;
      }
      sac.baseId = parentInput._inputId;
      sac.id = sac.baseId + "Facade";
      sac.searchEle = sac.baseId + "FacadeTextSearch";
      sac.selectEle = sac.baseId + "FacadeSelect";
      sac.hiddenEle = sac.baseId + "Hidden";
      sac.property = parentInput.dataset.smlProperty || parentInput.dataset.ccProperty;
      sac.dataset.smlAcType = "SFF";
    } else {
      if (!sac.id || sac.id.trim() === "") {
        const generatedId = "sac" + sac.generateGuid();
        console.warn('smlAutoComplete standalone mode should have an explicit id. Generated fallback id:', generatedId);
        sac.id = generatedId;
      }
      sac.classList.remove('flex-column');
      sac.classList.add('d-flex');
      sac.baseId = sac.id;
      sac.searchEle = sac.id + "TextSearch";
      sac.selectEle = sac.id + "Select";
      sac.hiddenEle = sac.id + "Hidden";
      sac.property = sac.dataset.smlProperty || sac.dataset.ccProperty;
      sac.dataset.smlAcType = "SFFAC";
    }
    const api = sac.dataset.api;
    const label = sac.dataset.label || sac.property;
    sac.isLone = String(sac.dataset.lone || "").toLowerCase() === "true";
    sac.loneSubmitAction = (sac.dataset.loneSubmit || sac.dataset.submit || "").trim();
    sac.loneLabel = (sac.dataset.loneLabel || label || sac.property || "").trim();
    sac.loneGoText = (sac.dataset.loneGo || sac.dataset.go || sac.dataset.longGo || "GO").trim() || "GO";
    sac.hasLoneSubmit = !!sac.loneSubmitAction;
    
    // Allow override of min characters
    if (sac.dataset.minChars) {
      sac.minChars = parseInt(sac.dataset.minChars);
    }
    
    // Select type: 'single' (default) or 'multiple'
    sac.selectType = sac.dataset.selectType || 'single';
    
    if (!sac.property) {
      console.error('smlAutoComplete requires data-sml-property');
      return;
    }

    if (!api) {
      console.error('smlAutoComplete requires data-api');
      return;
    }

    sac.render(sac.property, label);
    
    sac.cacheElements();
    sac.ensureInputAccessibility(label);
    sac.initializePopupSelect();
    if (sac.textInput) {
      if (sac.isFacade) {
        sac.textInput.placeholder = '';
      }
      sac.textInput.classList.add('smlFloat');
      sac.syncFloatingState();
    }
    sac.attachEvents();
    sac.applyInitialFocus();
  }

  resolveInputLabel(fallbackLabel = "") {
    const sac = this;
    const resolved = [
      sac.dataset.label,
      fallbackLabel,
      sac.title,
      sac.dataset.smlProperty,
      sac.dataset.ccProperty,
      "Search"
    ].find((value) => typeof value === "string" && value.trim().length > 0);

    return String(resolved || "Search").trim();
  }

  resolveExternalLabelId() {
    const sac = this;
    const formField = sac.closest("sml-form-field");
    if (!formField) return "";

    const selectorBase = String(sac.baseId || "").trim();
    if (!selectorBase) return "";

    const directCandidates = [
      formField.querySelector(`#${selectorBase}Label_LblText`),
      formField.querySelector(`#${selectorBase}Label`),
      formField.querySelector(`sml-label[for="${selectorBase}"]`),
      formField.querySelector(`label[for="${selectorBase}"]`),
      formField.querySelector(`sml-label[aria-controls="${selectorBase}"]`)
    ].filter(Boolean);

    const withId = directCandidates.find((element) => typeof element?.id === "string" && element.id.trim().length > 0);
    return withId?.id || "";
  }

  ensureInputAccessibility(fallbackLabel = "") {
    const sac = this;
    const input = sac.textInput;
    if (!input) return;

    if (String(input.type || "").toLowerCase() === "search" && !input.hasAttribute("role")) {
      input.setAttribute("role", "search");
    }

    const ariaLabel = String(input.getAttribute("aria-label") || "").trim();
    const ariaLabelledBy = String(input.getAttribute("aria-labelledby") || "").trim();

    if (ariaLabel.length > 0 || ariaLabelledBy.length > 0) {
      return;
    }

    const externalLabelId = sac.resolveExternalLabelId();
    if (externalLabelId.length > 0) {
      input.setAttribute("aria-labelledby", externalLabelId);
      return;
    }

    input.setAttribute("aria-label", sac.resolveInputLabel(fallbackLabel));
  }

  applyInitialFocus() {
    const sac = this;
    if (String(sac.dataset.initialFocus || '').toLowerCase() !== 'true') {
      return;
    }

    const tryFocus = () => {
      if (!(sac.textInput instanceof HTMLElement)) {
        return false;
      }
      if (sac.textInput.hasAttribute('disabled')) {
        return false;
      }
      if (sac.textInput.closest('[hidden], .d-none')) {
        return false;
      }
      sac.textInput.focus();
      return document.activeElement === sac.textInput;
    };

    const attemptFocus = (attemptsRemaining = 16) => {
      if (tryFocus() || attemptsRemaining < 1) {
        return;
      }
      requestAnimationFrame(() => attemptFocus(attemptsRemaining - 1));
    };

    requestAnimationFrame(() => attemptFocus());
  }

  generateGuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '');
    }
    return Math.random().toString(36).substring(2, 15);
  }

  render(property, label) {
    const sac = this;
    const isMultiple = sac.selectType === 'multiple';
    const multipleAttr = isMultiple ? 'multiple' : '';
    const sizeAttr = sac.isLone ? (isMultiple ? '12' : '10') : (isMultiple ? '8' : '6');
    const wrapperId = `${sac.baseId}Div`;
    let placeholder = sac.isFacade ? '' : 'Type to search...';
    if ('placeholder' in sac.dataset) {
      placeholder = sac.dataset.placeholder;
    }
    // If used as facade, don't include label or outer wrapper
    if (sac.isFacade) {
      sac.innerHTML = `
        <div class="sml-ac-input-wrap">
          <input 
            type="search" 
            id="${sac.searchEle}"
            class="sml-ac-input smlActiveInput"
            placeholder="${placeholder}"
            autocomplete="off"
          />
          <button
            type="button"
            class="sml-ac-clear hidden"
            aria-label="Clear search"
            title="Clear search"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        
        <select 
          id="${sac.selectEle}"
          class="sml-ac-select hidden"
          size="${sizeAttr}"
          ${multipleAttr}
        >
          <option value="">~~~SELECT~~~</option>
        </select>
      `;
    } else {
      // Standalone mode: include everything
      if (sac.isLone) {
        const showLoneLabel = sac.loneLabel.length > 0;
        const goText = sac.hasLoneSubmit ? sac.loneGoText : "ERROR";
        const labelTitle = (sac.dataset.loneLabelTitle || sac.title || sac.loneLabel || "").trim();
        const goTitle = sac.hasLoneSubmit
          ? ((sac.dataset.loneGoTitle || sac.loneGoText || "GO").trim())
          : "you must set data-lone-submit";
        const loneGroupLabel = (labelTitle || sac.loneLabel || sac.dataset.smlProperty || sac.dataset.ccProperty || "Autocomplete").trim();
        const loneLabelId = `${sac.baseId}LoneLabel`;
        const goClass = sac.hasLoneSubmit ? "text-dark" : "text-danger";
        const searchLabelAttribute = `aria-label="${loneGroupLabel}"`;
        const labelHtml = showLoneLabel
              ? `<div id="${loneLabelId}" class="d-flex align-items-center justify-content-center m-0 p-0 h-100 bg-body-secondary border-0 border-end border-1 border-dark text-dark fw-semibold text-uppercase small" style="margin:0;padding:0;min-height:0;line-height:1;height:100%;flex:0 0 auto;min-width:4rem;" title="${labelTitle}" aria-hidden="true">
                <i class="bi bi-person-badge sml-lone-mobile-icon m-0 p-0" aria-hidden="true"></i>
                <span class="visually-hidden sml-lone-mobile-sr" aria-hidden="true">${sac.loneLabel}</span>
                <span class="sml-lone-desktop-text m-0 p-0" aria-hidden="true">${sac.loneLabel}</span>
             </div>`
          : '<div class="d-none"></div>';
        sac.innerHTML = `
          <div class="d-flex align-items-stretch w-100 mt-1 rounded-0 border border-2 border-dark bg-light overflow-hidden" id="${wrapperId}" style="gap:0;margin:0;padding:0;" role="group" aria-label="${loneGroupLabel}">
            ${labelHtml}
            <div class="d-flex align-items-stretch flex-grow-1 min-w-0 m-0 p-0 h-100 bg-light border-0" style="margin:0;padding:0;line-height:1;height:100%;">
              <div class="position-relative flex-grow-1 m-0 p-0 h-100">
                <input 
                  type="text" 
                  id="${sac.searchEle}"
                  class="smlFloat w-100 h-100 m-0 px-1 border-0 rounded-0 bg-light text-dark"
                  style="margin:0;border:0;line-height:1;height:100%;min-height:0;min-width:60px;max-height:50px;outline:0;box-shadow:none;"
                  placeholder="${placeholder}"
                  autocomplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded="false"
                  aria-controls="${sac.selectEle}"
                  ${searchLabelAttribute}
                />
                <button
                  type="button"
                  class="sml-ac-clear hidden"
                  aria-label="Clear search"
                  title="Clear search"
                  aria-controls="${sac.searchEle}"
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              id="${sac.baseId}LoneGo"
              data-lone-go-btn="true"
              class="m-0 px-1 h-100 border-0 border-start border-1 border-dark rounded-0 d-flex align-items-center justify-content-center bg-body-secondary ${goClass} fw-semibold"
              style="margin:0;min-height:0;line-height:1;height:100%;flex:0 0 auto;min-width:3rem;"
              title="${goTitle}" aria-label="${goTitle}">
              <i class="bi bi-play-circle sml-lone-mobile-icon m-0 p-0" aria-hidden="true"></i>
              <span class="sml-lone-desktop-text m-0 p-0" aria-hidden="true">${goText}</span>
            </button>

            <select 
              id="${sac.selectEle}" 
              class="sml-ac-select hidden"
              size="${sizeAttr}"
              ${multipleAttr}
            >
              <option value="">~~~SELECT~~~</option>
            </select>

            <input 
              type="hidden" 
              id="${sac.hiddenEle}"
              name="${sac.hiddenEle}"
              data-sml-property="${property}"
              data-cc-property="${property}"
            />
          </div>
        `;
        return;
      }

      sac.innerHTML = `
        <div class="d-flex shadow shadow-navy shadow-lg rounded-2 sfftext me-0 mt-1" style="flex-wrap: wrap;" id="${wrapperId}">
          <label for="${sac.searchEle}" class="flex-column bg-light rounded pt-2 px-1" title="${sac.title || label}">${label}</label>
          <div class="flex-column">
            <input 
              type="search" 
              id="${sac.searchEle}"
              class="sml-ac-input smlFloat flex-column"
              placeholder="${placeholder}"
              autocomplete="off"
            />
            <button
              type="button"
              class="sml-ac-clear hidden"
              aria-label="Clear search"
              title="Clear search"
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          
          <select 
            id="${sac.selectEle}" 
            class="sml-ac-select hidden"
            size="${sizeAttr}"
            ${multipleAttr}
          >
            <option value="">~~~SELECT~~~</option>
          </select>
          
          <input 
            type="hidden" 
            id="${sac.hiddenEle}"
            name="${sac.hiddenEle}"
            data-sml-property="${property}"
            data-cc-property="${property}"
          />
        </div>
      `;
    }
  }

  cacheElements() {
    const sac = this;
    const prop = sac.dataset.smlProperty || sac.dataset.ccProperty || sac.dataset.property || sac.property;

    sac.textInput = sac.querySelector(`#${sac.searchEle}`);
    sac.selectElement = sac.querySelector(`#${sac.selectEle}`);
    sac.clearButton = sac.querySelector('.sml-ac-clear');
    
    // If facade, the hidden input is in the parent smlInput
    if (sac.isFacade) {
      const parentInput = sac.closest('sml-input');
      // Prefer matching the real backing input by property, then fall back to any hidden
      sac.hiddenInput = parentInput?.querySelector(
      `input[type="hidden"][data-sml-property="${prop}"], input[type="hidden"][data-cc-property="${prop}"]`
      ) || parentInput?.querySelector('input[type="hidden"]');
    }


    if (sac.isFacade) {
      const parentInput = sac.closest('sml-input');
      sac.hiddenInput = parentInput?.querySelector("input[data-sml-property], input[data-cc-property]");
    } else {
      sac.hiddenInput = sac.querySelector(`#${sac.hiddenEle}`);
    }
    sac.goButton = sac.querySelector(`#${sac.baseId}LoneGo`) || sac.querySelector('[data-lone-go-btn="true"]');
  }

  initializePopupSelect() {
    const sac = this;
    if (!sac.selectElement) {
      return;
    }

    sac.selectElement.classList.add('sml-ac-select-popup');
    if (sac.selectElement.parentElement !== document.body) {
      document.body.appendChild(sac.selectElement);
    }

    if (!sac.repositionPopupBound) {
      sac.repositionPopupBound = () => sac.positionPopup();
    }
    if (!sac.dismissPopupBound) {
      sac.dismissPopupBound = (event) => {
        if (sac.selectElement?.classList.contains('hidden')) {
          return;
        }

        const clickedPopup = sac.selectElement?.contains(event.target);
        const clickedComponent = sac.contains(event.target);
        if (!clickedPopup && !clickedComponent) {
          sac.hideSelect();
        }
      };
    }
  }

  positionPopup() {
    const sac = this;
    if (!sac.textInput || !sac.selectElement || sac.selectElement.classList.contains('hidden')) {
      return;
    }

    const rect = sac.textInput.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const contentWidth = sac.estimateOptionContentWidth();
    const popupWidth = Math.min(Math.max(rect.width, contentWidth), Math.max(viewportWidth - 16, rect.width));
    const left = Math.max(8, Math.min(rect.left, viewportWidth - popupWidth - 8));
    const defaultVisible = sac.isLone ? 10 : 6;
    const visibleOptions = Math.max(1, Math.min(sac.selectElement.size || defaultVisible, sac.selectElement.options.length || 1));
    const rowHeight = sac.isLone ? 32 : 28;
    const estimatedHeight = Math.max(72, (visibleOptions * rowHeight) + 18);
    const showAbove = rect.bottom + estimatedHeight > window.innerHeight - 8 && rect.top > estimatedHeight;
    const top = showAbove
      ? Math.max(8, rect.top - estimatedHeight - 4)
      : Math.min(window.innerHeight - estimatedHeight - 8, rect.bottom + 4);

    sac.selectElement.style.left = `${left}px`;
    sac.selectElement.style.top = `${top}px`;
    sac.selectElement.style.width = `${popupWidth}px`;
  }

  estimateOptionContentWidth() {
    const sac = this;
    if (!sac.selectElement) {
      return 0;
    }

    const probe = document.createElement('canvas');
    const ctx = probe.getContext('2d');
    if (!ctx) {
      return 0;
    }

    const inputStyle = globalThis.getComputedStyle(sac.textInput || sac.selectElement);
    ctx.font = `${inputStyle.fontWeight} ${inputStyle.fontSize} ${inputStyle.fontFamily}`;

    let widest = 0;
    for (const option of sac.selectElement.options) {
      const text = (option.textContent || '').trim();
      if (!text) continue;
      widest = Math.max(widest, ctx.measureText(text).width);
    }

    // Include left/right padding, borders, and space for scrollbar.
    return Math.ceil(widest + 48);
  }

  teardownPopupListeners() {
    const sac = this;
    if (!sac.repositionPopupBound || !sac.dismissPopupBound) {
      return;
    }

    window.removeEventListener('resize', sac.repositionPopupBound);
    window.removeEventListener('scroll', sac.repositionPopupBound, true);
    document.removeEventListener('mousedown', sac.dismissPopupBound, true);
  }

  attachEvents() {
    const sac = this;
    let debounceTimer;
    // Debounced search on input
    sac.textInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      const value = e.target.value.trim();
      sac.syncValueState();
      
      // If cleared, reset everything
      if (value === '') {
        sac.reset();
        return;
      }

      sac.syncClearButton();
      
      // Wait for minimum characters
      if (value.length < sac.minChars) {
        sac.hideSelect();
        return;
      }
      
      debounceTimer = setTimeout(() => sac.search(value), sac.debounceMs);
    });

    // Handle selection from select
    sac.selectElement.addEventListener('change', (e) => {
      if (sac.selectType === 'multiple') {
        sac.handleMultipleSelection(e);
      } else {
        if (sac.selectNavPending) {
          return;
        }
        sac.handleSingleSelection(e);
      }
    });

    // Hide select when both input and select lose focus
    sac.textInput.addEventListener('blur', () => {
      setTimeout(() => {
        if (document.activeElement !== sac.selectElement && 
            document.activeElement !== sac.textInput) {
          sac.hideSelect();
        }
      }, 150);
    });

    sac.selectElement.addEventListener('blur', () => {
      setTimeout(() => {
        if (document.activeElement !== sac.selectElement && 
            document.activeElement !== sac.textInput) {
          sac.hideSelect();
        }
      }, 150);
    });

    // Allow keyboard navigation: ArrowDown to move to select
    sac.textInput.addEventListener('keydown', (e) => {
      if (sac.isLone && e.key === 'Enter') {
        e.preventDefault();
        sac.handleLoneSubmit();
        return;
      }

      if (e.key === 'ArrowDown' && !sac.selectElement.classList.contains('hidden')) {
        e.preventDefault();
        sac.selectElement.focus();
        if (sac.selectElement.options.length > 1) {
          sac.selectElement.selectedIndex = 1;
        }
      }
    });

    // Allow keyboard navigation: ArrowUp to move back to input
    sac.selectElement.addEventListener('keydown', (e) => {
      if (sac.selectType === 'single') {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          sac.selectNavPending = true;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          sac.selectNavPending = false;
          sac.handleSingleSelection({ target: sac.selectElement });
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          sac.selectNavPending = false;
          sac.hideSelect();
          sac.textInput.focus();
          return;
        }
      }

      if (e.key === 'ArrowUp' && sac.selectElement.selectedIndex === 0) {
        e.preventDefault();
        sac.selectNavPending = false;
        sac.textInput.focus();
      }
    });

    sac.selectElement.addEventListener('click', () => {
      sac.selectNavPending = false;
    });

    sac.clearButton?.addEventListener('click', (e) => {
      e.preventDefault();
      sac.clearSelection();
    });

    sac.goButton?.addEventListener('click', (e) => {
      e.preventDefault();
      sac.handleLoneSubmit();
    });

    sac.syncClearButton();
    sac.syncValueState();
  }

  syncValueState() {
    const sac = this;
    const hasText = (sac.textInput?.value || '').trim() !== '';
    const hasStoredValue = (sac.hiddenInput?.value || '').trim() !== '';
    const hasValue = hasText || hasStoredValue || sac.hasValidSelection;
    sac.classList.toggle('smlHasValue', hasValue);
    sac.syncFloatingState();
  }

  syncFloatingState() {
    const sac = this;
    if (!sac.textInput) {
      return;
    }

    const hasText = (sac.textInput.value || '').trim() !== '';
    sac.textInput.classList.toggle('smlHasValue', hasText);
  }

  syncClearButton() {
    const sac = this;
    if (!sac.clearButton) {
      return;
    }

    const hasText = (sac.textInput?.value || '').trim() !== '';
    sac.clearButton.classList.toggle('hidden', !hasText);
  }

  async search(query) {
    const sac = this;
    // Cancel previous request
    sac.abortController?.abort();
    sac.abortController = new AbortController();

    // Show loading state
    sac.showLoading();

    try {
      const data = await sac.fetchResults(query, sac.abortController.signal);
      sac.populateSelect(data);
      sac.showSelect();
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Search failed:', err);
      sac.showError(err.message);
    } finally {
      sac.isLoading = false;
    }
  }

  async fetchResults(query, signal) {
    const sac = this;
    const apiUrl = sac.dataset.api;
    const property = sac.dataset.smlProperty || sac.dataset.ccProperty;
    
    const payload = {
      searchString: query,
      codeCaller: 'smlAutoComplete',
      callerProperty: property
    };

    // SEND UP: Add filter values from other form fields
    if (sac.dataset.apiFiltersUp) {
      const filters = sac.dataset.apiFiltersUp.split(',').map(f => f.trim());
      filters.forEach(filter => {
        const filterEl = document.querySelector(`[data-sml-property="${filter}"], [data-cc-property="${filter}"]`);
        if (filterEl) {
          payload[filter] = filterEl.value;
        }
      });
    }

    // SEND UP: Tell API which properties we want back
    if (sac.dataset.apiPropsDown) {
      const [isValid, repaired] = isJsonRepaired(sac.dataset.apiPropsDown);
      if (isValid) {
        const propsDown = JSON.parse(repaired);
        payload.requestedProperties = Object.values(propsDown);
      } else {
        //Assuming comma delimited list of properties
        payload.requestedProperties = sac.dataset.apiPropsDown;
      }


    }
    const dataUp=JSON.stringify(payload);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: dataUp,
      signal
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    sac.data = await response.json();
    
    if (sac.data.errorObject) {
      throw new Error(data.errorObject);
    }
    
    return sac.data;
  }

  populateSelect(data) {
    const sac = this;
    // Always start with ~~~SELECT~~~ option
    sac.selectElement.innerHTML = '<option value="">~~~SELECT~~~</option>';
    
    if (!data || data.length === 0) {
      const noResults = document.createElement('option');
      noResults.textContent = 'No results found';
      noResults.disabled = true;
      sac.selectElement.appendChild(noResults);
      return;
    }

    const apiValue = sac.dataset.apiValue || 'text';
    const apiId = sac.dataset.apiId || 'id';

    data.forEach(item => {
      const option = document.createElement('option');
      option.value = apiId ? item[apiId] : item[apiValue];
      option.textContent = item[apiValue];
      
      if (apiId && item[apiId]) {
        option.dataset.id = item[apiId];
      }
      
      // SEND DOWN PREP: Store properties as data attributes
      if (sac.dataset.apiPropsDown) {
        const [isValid, repaired] = isJsonRepaired(sac.dataset.apiPropsDown);
        if(!isValid) {
          const propsDown = sac.dataset.apiPropsDown;

        }else { //Probably not going to use this...list of property names is simpler
          const propsDown = JSON.parse(repaired);
          Object.entries(propsDown).forEach(([formField, apiProperty]) => {
            if (item[apiProperty] !== undefined && item[apiProperty] !== null) {
              option.dataset[sac.camelCase(apiProperty)] = item[apiProperty];
            }
          });
        }
      }
      sac.selectElement.appendChild(option);
    });
  }

  showLoading() {
    const sac = this;
    sac.isLoading = true;
    sac.selectElement.innerHTML = `
      <option value="">~~~SELECT~~~</option>
      <option disabled>⏳ Loading results...</option>
    `;
    sac.showSelect();
  }

  showError(message) {
    const sac = this;
    sac.selectElement.innerHTML = `
      <option value="">~~~SELECT~~~</option>
      <option disabled>❌ Error: ${message}</option>
    `;
    sac.showSelect();
  }

  showSelect() {
    const sac = this;
    sac.selectElement.classList.remove('hidden');
    sac.textInput?.setAttribute('aria-expanded', 'true');
    sac.positionPopup();
    window.addEventListener('resize', sac.repositionPopupBound);
    window.addEventListener('scroll', sac.repositionPopupBound, true);
    document.addEventListener('mousedown', sac.dismissPopupBound, true);
  }

  hideSelect() {
    const sac = this;
    sac.selectElement.classList.add('hidden');
    sac.selectNavPending = false;
    sac.textInput?.setAttribute('aria-expanded', 'false');
    sac.teardownPopupListeners();
    
    // Trigger validation if text exists but no valid selection
    if (!sac.hasValidSelection && sac.textInput.value.trim() !== '') {
      if (sac.hiddenInput) {
        sac.hiddenInput.value = ''; // Clear to make it invalid
        sac.hiddenInput.dispatchEvent(new Event('blur', { bubbles: true }));
      }
    }
  }

  reset() {
    const sac = this;
    sac.hasValidSelection = false;
    if (sac.hiddenInput) {
      sac.hiddenInput.value = '';
    }
    if (sac.textInput) {
      sac.textInput.value = '';
    }
    sac.hideSelect();
    sac.selectElement.innerHTML = '<option value="">~~~SELECT~~~</option>';
    sac.syncClearButton();
    sac.syncValueState();
  }


  clearSelection() {
    const sac = this;
    sac.hasValidSelection = false;
    if (sac.hiddenInput) {
      sac.hiddenInput.value = '';
      delete sac.hiddenInput.dataset.selectedId;
      sac.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    sac.textInput.value = '';
    sac.selectElement.innerHTML = '<option value="">~~~SELECT~~~</option>';
    sac.hideSelect();
    sac.syncClearButton();
    sac.syncValueState();
    sac.textInput.focus();
    
    // Clear related fields
    if (sac.dataset.apiPropsDown) {
      const propsDown = JSON.parse(sac.dataset.apiPropsDown);
      Object.keys(propsDown).forEach(formField => {
        const targetField = sac.findTargetByProperty(formField);
        sac.applyValueToTarget(targetField, '');
      });
    }
  }

  resolveWritableTarget(targetField) {
    if (!targetField) return null;

    if (targetField._input) {
      return targetField._input;
    }

    if ("value" in targetField) {
      return targetField;
    }

    const nestedInput = targetField.querySelector('input, textarea, select');
    if (nestedInput && ("value" in nestedInput)) {
      return nestedInput;
    }

    return null;
  }

  findTargetByProperty(propertyName) {
    if (!propertyName) return null;

    const selectors = [
      `sml-input[data-sml-property="${propertyName}"], sml-input[data-cc-property="${propertyName}"]`,
      `input[data-sml-property="${propertyName}"], input[data-cc-property="${propertyName}"]`,
      `textarea[data-sml-property="${propertyName}"], textarea[data-cc-property="${propertyName}"]`,
      `select[data-sml-property="${propertyName}"], select[data-cc-property="${propertyName}"]`,
      `[data-sml-property="${propertyName}"], [data-cc-property="${propertyName}"]`
    ];

    for (const selector of selectors) {
      const candidate = document.querySelector(selector);
      if (!candidate) continue;
      if (candidate.tagName === 'SML-LABEL') continue;
      return candidate;
    }

    return null;
  }

  applyValueToTarget(targetField, value) {
    const sac = this;
    const targetInput = sac.resolveWritableTarget(targetField);
    if (!targetInput) return;

    targetInput.value = value;
    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
    targetInput.dispatchEvent(new Event('change', { bubbles: true }));

    const smlInputHost = targetField?.tagName === 'SML-INPUT'
      ? targetField
      : targetField?.closest?.('sml-input');

    if (smlInputHost && typeof smlInputHost._syncHasValueClass === 'function') {
      smlInputHost._syncHasValueClass();
    }
  }

  populateRelatedFields(selectedOption) {
    const sac = this;
    if (!sac.dataset.apiPropsDown) return;
    

    const [isValid, repaired] = isJsonRepaired(sac.dataset.apiPropsDown);
    if(!isValid) {
      const propsDown = sac.dataset.apiPropsDown;
      propsDown.split(',').forEach(prop => {
        if (prop !== undefined) {
          const targetField = sac.findTargetByProperty(prop);

          sac.applyValueToTarget(targetField, sac.data[sac.selectElement.selectedIndex - 1][asFieldNotationString(prop)] || '');
        }
      });
    }else{
      const propsDown = JSON.parse(repaired);
      //Object.entries(propsDown).forEach(([formField, apiProperty]) => {
        for(let [formField, apiProperty] of Object.entries(propsDown)) {
        const dataKey = sac.camelCase(apiProperty);
        const value = selectedOption.dataset[dataKey];
        if (value !== undefined) {
          const targetField = sac.findTargetByProperty(formField);
          sac.applyValueToTarget(targetField, value);
        }
      };
    }
  }

  getSecondaryFocusProperty() {
    return String(this.dataset.secondaryFocus || "").trim();
  }

  focusFieldByProperty(propertyName) {
    const sac = this;
    const targetField = sac.findTargetByProperty(propertyName);
    const resolveFocusableTarget = (field) => {
      if (!field) return null;

      if (field.matches?.("input:not([type='hidden']), textarea, select")) {
        return field;
      }

      if (field.tagName === "SML-INPUT") {
        return field.querySelector("sml-auto-complete input[type='search']")
          || field.querySelector("select")
          || field.querySelector("textarea")
          || field.querySelector("input:not([type='hidden'])");
      }

      return field.querySelector?.("sml-auto-complete input[type='search'], select, textarea, input:not([type='hidden'])") || null;
    };

    const targetInput = resolveFocusableTarget(targetField);
    if (!targetInput) return false;
    if (targetInput.hasAttribute("disabled")) return false;
    if ((targetInput.getAttribute("type") || "").toLowerCase() === "hidden") return false;

    try {
      targetInput.focus({ focusVisible: true });
    } catch {
      targetInput.focus();
    }

    return document.activeElement === targetInput;
  }

  focusSecondaryAfterPopulate(propertyName) {
    const sac = this;
    const attemptFocus = (remaining = 20) => {
      if (sac.focusFieldByProperty(propertyName) || remaining < 1) return;
      requestAnimationFrame(() => attemptFocus(remaining - 1));
    };

    requestAnimationFrame(() => attemptFocus());
  }

  restoreTextFocusAfterSelection() {
    const sac = this;
    requestAnimationFrame(() => {
      if (sac.textInput && !sac.textInput.disabled) {
        try {
          sac.textInput.focus({ preventScroll: true });
        } catch {
          sac.textInput.focus();
        }
      }
    });
  }

  camelCase(str) {
    return str.replace(/[-_](.)/g, (_, char) => char.toUpperCase());
  }

handleSingleSelection(e) {
  const sac = this;
  const selectedOption = e.target.options[e.target.selectedIndex];
 
  if (selectedOption.value === '') {
    sac.clearSelection();
    sac.hasValidSelection = false;
    return;
  }
  
  sac.hasValidSelection = true;
  
  // Update visible text input
  sac.textInput.value = selectedOption.textContent;
  sac.syncClearButton();
  sac.syncValueState();
  
  // Update hidden input
  if (sac.dataset.smlAcType === "SFFAC") {
      sac.hiddenInput = sac?.querySelector("input[data-sml-property], input[data-cc-property]");
      if(!sac.hiddenInput) {
        const parentInput = sac.closest('sml-input');
        sac.hiddenInput = parentInput?.querySelector("input[data-sml-property], input[data-cc-property]");
      }
  }else{
      sac.hiddenInput = sac?.querySelector("input[data-sml-property], input[data-cc-property]");
      if(!sac.hiddenInput) {
        const parentInput = sac.closest('sml-input');
        sac.hiddenInput = parentInput?.querySelector("input[data-sml-property], input[data-cc-property]");
      }
  }
  if (sac.hiddenInput) {
    sac.hiddenInput.value = selectedOption.value;
    
    if (selectedOption.dataset.id) {
      sac.hiddenInput.dataset.selectedId = selectedOption.dataset.id;
    }
    
    // Trigger smlInput's change handler to add smlHasValue class
    sac.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
  
  if(sac.selectType==="single") sac.hideSelect();

  // SEND DOWN: Populate other fields
  sac.populateRelatedFields(selectedOption);
  const secondaryFocusProperty = sac.getSecondaryFocusProperty();
  if (secondaryFocusProperty) {
    sac.focusSecondaryAfterPopulate(secondaryFocusProperty);
  } else {
    sac.restoreTextFocusAfterSelection();
  }
  
  // Dispatch event
  sac.dispatchEvent(new CustomEvent('sml-selected', {
    detail: {
      value: selectedOption.value,
      text: selectedOption.textContent,
      data: selectedOption.dataset
    },
    bubbles: true
    }));
  }

  handleMultipleSelection(e) {
    const sac = this;
    const selectedOptions = Array.from(e.target.selectedOptions)
      .filter(opt => opt.value !== '');
    
    if (selectedOptions.length === 0) {
      sac.clearSelection();
      return;
    }
    
    const texts = selectedOptions.map(opt => opt.textContent).join(', ');
    sac.textInput.value = texts;
    sac.syncFloatingState();
    
    const values = selectedOptions.map(opt => opt.value).join(',');
    if (sac.hiddenInput) {
      sac.hiddenInput.value = values;
      
      const ids = selectedOptions
        .map(opt => opt.dataset.id)
        .filter(id => id)
        .join(',');
      if (ids) {
        sac.hiddenInput.dataset.selectedId = ids;
      }
      
      sac.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    sac.syncClearButton();
    sac.syncValueState();

    sac.restoreTextFocusAfterSelection();
    
    sac.dispatchEvent(new CustomEvent('sml-selected', {
      detail: {
        value: values,
        text: texts,
        items: selectedOptions.map(opt => ({
          value: opt.value,
          text: opt.textContent,
          data: opt.dataset
        }))
      },
      bubbles: true
    }));
  }

  // Public API
  get value() {
    return this.hiddenInput?.value || '';
  }

  set value(value = '') {
    if (this.hiddenInput) {
      this.hiddenInput.value = value;
    }
  }

  get text() {
    return this.textInput?.value || this.value;
  }

  set text(text = '') {
    if (this.textInput) {
      this.textInput.value = text;
      this.syncClearButton();
      this.syncValueState();
      return;
    }

    this.value = text;
  }

  setValue(value = '', text = value) {
    const sac = this;
    sac.value = value;
    sac.text = text;
    sac.hideSelect();
  }

  getValue() {
    const sac = this;
    return {
      value: sac.value,
      text: sac.text,
      selectedId: sac.hiddenInput?.dataset?.selectedId || sac.value
    };
  }

  handleLoneSubmit() {
    const sac = this;
    if (!sac.hasLoneSubmit) {
      console.error('you must set data-lone-submit');
      return;
    }
    const selection = sac.getValue();
    if (!selection?.value) {
      sac.textInput?.focus();
      return;
    }

    const submitAction = sac.loneSubmitAction || "";
    sac.dispatchEvent(new CustomEvent('sml-lone-submit', {
      detail: {
        submitAction,
        ...selection,
        property: sac.dataset.smlProperty || sac.dataset.ccProperty || sac.property || "",
      },
      bubbles: true,
    }));

    if (!submitAction) return;

    if (typeof globalThis[submitAction] === 'function') {
      globalThis[submitAction]({
        submitAction,
        ...selection,
        property: sac.dataset.smlProperty || sac.dataset.ccProperty || sac.property || "",
      });
      return;
    }

    const propertyName = sac.dataset.smlProperty || sac.dataset.ccProperty || sac.property || "value";
    const urlTemplate = submitAction.includes('{id}')
      ? submitAction.replaceAll('{id}', encodeURIComponent(selection.selectedId || selection.value))
      : submitAction;

    try {
      const targetUrl = new URL(urlTemplate, globalThis.location.origin);
      if (!submitAction.includes('{id}')) {
        targetUrl.searchParams.set(propertyName, selection.value);
        targetUrl.searchParams.set('selectedId', selection.selectedId || selection.value);
        targetUrl.searchParams.set('selectedText', selection.text || '');
      }
      globalThis.location.assign(targetUrl.toString());
    } catch (err) {
      console.error('Invalid data-lone-submit URL:', err);
    }
  }
}

customElements.define('sml-auto-complete', smlAutoComplete);

export default smlAutoComplete;
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^