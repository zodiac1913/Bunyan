"use strict";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])"
].join(", ");

const activeModals = [];
// siblingState uses WeakMap to track inert/aria-hidden state of document siblings.
// WeakMap allows garbage collection of removed elements automatically.
// If an element is temporarily removed from DOM and re-added, we re-capture its state.
const siblingState = new WeakMap();
let bodyOverflowDepth = 0;
let previousBodyOverflow = "";

function asBool(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "y", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "n", "no", "off", ""].includes(normalized)) return false;
  }
  return Boolean(value);
}

function guid(nodash = false) {
  const raw = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, ch => {
      const rand = Math.floor(Math.random() * 16);
      const nibble = ch === "x" ? rand : ((rand & 0x3) | 0x8);
      return nibble.toString(16);
    });
  return nodash ? raw.replaceAll("-", "") : raw;
}

function isElement(value) {
  return value instanceof HTMLElement || value instanceof SVGElement;
}

function isHtmlString(value) {
  if (typeof value !== "string") return false;
  const template = document.createElement("template");
  template.innerHTML = value.trim();
  return template.content.childNodes.length > 0 && Array.from(template.content.childNodes).some(node => node.nodeType === Node.ELEMENT_NODE);
}

function looksLikeJml(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return ["n", "tag", "b", "t", "i", "c", "html", "innerHTML"].some((key) => Object.hasOwn(value, key));
}

function cloneValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function appendClassName(target, className) {
  if (!target || !className) return target;
  const classList = new Set(String(target.c || target.className || "").split(/\s+/).filter(Boolean));
  for (const part of String(className).split(/\s+/).filter(Boolean)) {
    classList.add(part);
  }
  target.c = Array.from(classList).join(" ");
  delete target.className;
  return target;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function jmlToHtml(node) {
  if (node === null || node === undefined || node === false) return "";
  if (Array.isArray(node)) return node.map(jmlToHtml).join("");
  if (typeof node === "string" || typeof node === "number") return escapeHtml(node);
  if (typeof node !== "object") return escapeHtml(String(node));

  const tagName = node.n || node.tag || "div";
  const attrs = [];
  const pushAttr = (name, value) => {
    if (value === null || value === undefined || value === false) return;
    if (value === true) {
      attrs.push(name);
      return;
    }
    attrs.push(`${name}="${escapeHtml(value)}"`);
  };

  for (const [key, value] of Object.entries(node)) {
    if (["n", "tag", "b", "t", "i", "c", "className", "s", "ttl", "html", "innerHTML", "text"].includes(key)) continue;
    if (key === "style" && typeof value === "object") {
      pushAttr("style", Object.entries(value).map(([styleKey, styleValue]) => `${styleKey}:${styleValue}`).join(";"));
      continue;
    }
    if (key === "alab") {
      pushAttr("aria-label", value);
      continue;
    }
    pushAttr(key, value);
  }

  if (node.i) pushAttr("id", node.i);
  if (node.c || node.className) pushAttr("class", node.c || node.className);
  if (node.s) pushAttr("style", node.s);
  if (node.ttl) pushAttr("title", node.ttl);
  if (node.role) pushAttr("role", node.role);
  if (node.type) pushAttr("type", node.type);
  if (node.name) pushAttr("name", node.name);
  if (node.for) pushAttr("for", node.for);
  if (node.value !== undefined) pushAttr("value", node.value);

  const openTag = attrs.length > 0 ? `<${tagName} ${attrs.join(" ")}>` : `<${tagName}>`;
  let innerHtml = "";
  if (node.html !== undefined) {
    innerHtml = String(node.html);
  } else if (node.innerHTML !== undefined) {
    innerHtml = String(node.innerHTML);
  } else {
    const textContent = node.t !== undefined ? escapeHtml(node.t) : node.text !== undefined ? escapeHtml(node.text) : "";
    innerHtml = `${textContent}${jmlToHtml(node.b)}`;
  }
  return `${openTag}${innerHtml}</${tagName}>`;
}

function appendStructuredContent(container, content, fallbackText = "") {
  if (!(container instanceof HTMLElement)) return;
  container.replaceChildren();
  if (content === null || content === undefined || content === "") {
    if (fallbackText) container.textContent = fallbackText;
    return;
  }

  if (isElement(content)) {
    container.append(content);
    return;
  }

  if (Array.isArray(content) || looksLikeJml(content)) {
    container.insertAdjacentHTML("beforeend", jmlToHtml(content));
    return;
  }

  if (typeof content === "object") {
    const pre = document.createElement("pre");
    pre.className = "sml-modal-json mb-0";
    pre.textContent = JSON.stringify(content, null, 2);
    container.append(pre);
    return;
  }

  if (typeof content === "string" && isHtmlString(content)) {
    container.innerHTML = content;
    return;
  }

  container.textContent = String(content);
}

/**
 * Form Field Accessibility Pattern for Modal Content
 * 
 * When including form fields in modal body content, ensure proper accessibility:
 * 
 * 1. Label Association:
 *    <label for="fieldId">Field Label</label>
 *    <input id="fieldId" type="text" aria-labelledby="fieldId" />
 * 
 * 2. Error Message Association:
 *    <input id="email" aria-describedby="email-error" />
 *    <p id="email-error" role="alert">Email is required</p>
 * 
 * 3. Required Field Indicators:
 *    <input aria-required="true" />
 *    <span aria-label="(required)">*</span>
 * 
 * 4. Form Validation Hints:
 *    <input aria-describedby="hint-1 hint-2" />
 *    <small id="hint-1">Must be 8+ characters</small>
 *    <small id="hint-2">Must include a number</small>
 */

function resolveElementReference(value) {
  if (isElement(value)) return value;
  if (value && typeof value.get === "function") {
    const candidate = value.get(0);
    return isElement(candidate) ? candidate : null;
  }
  if (value && isElement(value[0])) return value[0];
  if (typeof value === "string" && value.trim()) {
    if (value.startsWith("#")) return document.querySelector(value);
    return document.getElementById(value) || document.querySelector(value);
  }
  return null;
}

function resolveDialogWidth(dialogSize) {
  const raw = String(dialogSize || "").trim().toLowerCase();
  if (!raw || raw === "medium" || raw === "modal-md" || raw === "md") return "min(42rem, calc(100vw - 2rem))";
  if (["large", "modal-lg", "lg"].includes(raw)) return "min(72rem, calc(100vw - 2rem))";
  if (["extralarge", "xlarge", "modal-xl", "xl"].includes(raw)) return "min(88rem, calc(100vw - 2rem))";
  if (["modal-xxl", "xxl"].includes(raw)) return "min(96rem, calc(100vw - 2rem))";

  const numeric = Number(dialogSize);
  if (Number.isFinite(numeric) && numeric > 0) return `min(${numeric}rem, calc(100vw - 2rem))`;
  return "min(42rem, calc(100vw - 2rem))";
}

function normalizeCallback(callback, modalId) {
  if (typeof callback === "function") return callback;
  if (typeof callback !== "string" || !callback.trim()) return null;
  return async (event, modal) => {
    const fn = new Function("event", "modal", "modalId", callback);
    return fn.call(globalThis, event, modal, modalId);
  };
}

function createButtonConfig(button, index, modalId) {
  if (!button) return null;
  const text = button.t || button.text || button.label || button.alab || button.title || `Action ${index + 1}`;
  return {
    id: button.i || `${modalId}Action${index + 1}`,
    text,
    title: button.ttl || button.title || text,
    className: button.c || button.className || "btn btn-primary",
    type: button.type || "button",
    close: asBool(button.close) || button.dismiss === true || button.dismiss === "modal",
    callback: normalizeCallback(button.e || button.onClick || button.call || button.callback, modalId),
    raw: button
  };
}

function buildLegacyButtons(cfg, modalId) {
  const slots = [
    { text: cfg.buttonLeftText, callback: cfg.buttonLeftFunction, className: "btn btn-primary" },
    { text: cfg.buttonCenterText, callback: cfg.buttonCenterFunction, className: "btn btn-primary" },
    { text: cfg.buttonRightText, callback: cfg.buttonRightFunction, className: "btn btn-primary" }
  ];

  if ([0, 1, 2].includes(cfg.closeModalButtonPosition)) {
    const slot = slots[cfg.closeModalButtonPosition] || {};
    slot.text = slot.text || "Close";
    slot.callback = slot.callback || "modal.close('button-close')";
    slot.className = slot.className || "btn btn-outline-secondary";
    slots[cfg.closeModalButtonPosition] = slot;
  }

  return slots
    .filter(slot => slot.text)
    .map((slot, index) => createButtonConfig({
      i: `${modalId}LegacyBtn${index + 1}`,
      t: slot.text,
      c: slot.className,
      e: slot.callback
    }, index, modalId));
}

function normalizeButtons(cfg, modalId) {
  if (Array.isArray(cfg.buttons)) {
    return cfg.buttons.map((button, index) => createButtonConfig(button, index, modalId)).filter(Boolean);
  }

  if (cfg.buttons === null) return [];
  if (cfg.buttons === "close-only") {
    return [createButtonConfig({ t: "Close", c: "btn btn-secondary", close: true }, 0, modalId)];
  }

  return buildLegacyButtons(cfg, modalId);
}

function getFocusableElements(root) {
  if (!(root instanceof HTMLElement)) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(element => {
    if (!(element instanceof HTMLElement)) return false;
    if (element.hasAttribute("disabled") || element.getAttribute("aria-hidden") === "true") return false;
    return element.offsetParent !== null || element === document.activeElement;
  });
}

function lockBodyScroll() {
  if (bodyOverflowDepth === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("sml-modal-open");
  }
  bodyOverflowDepth += 1;
}

function unlockBodyScroll() {
  bodyOverflowDepth = Math.max(0, bodyOverflowDepth - 1);
  if (bodyOverflowDepth === 0) {
    document.body.style.overflow = previousBodyOverflow;
    document.body.classList.remove("sml-modal-open");
  }
}

function applyInertOutside(modalOverlay) {
  for (const child of Array.from(document.body.children)) {
    if (child === modalOverlay) continue;
    if (!siblingState.has(child)) {
      siblingState.set(child, {
        inert: child.inert,
        ariaHidden: child.getAttribute("aria-hidden")
      });
    }
    child.inert = true;
  }
}

function restoreInertOutside() {
  // Validate activeModals state to handle rapid modal transitions
  if (activeModals.length === 0) {
    // All modals closed: restore all siblings to original state
    for (const child of Array.from(document.body.children)) {
      const state = siblingState.get(child);
      if (!state) continue;
      child.inert = state.inert;
      if (state.ariaHidden === null) {
        child.removeAttribute("aria-hidden");
      } else {
        child.setAttribute("aria-hidden", state.ariaHidden);
      }
      siblingState.delete(child);
    }
    return;
  }
  
  const currentTop = activeModals.at(-1)?.overlay || null;
  for (const child of Array.from(document.body.children)) {
    const state = siblingState.get(child);
    if (!state) continue;
    child.inert = state.inert;
    if (state.ariaHidden === null) {
      child.removeAttribute("aria-hidden");
    } else {
      child.setAttribute("aria-hidden", state.ariaHidden);
    }
    siblingState.delete(child);
  }
  if (currentTop) applyInertOutside(currentTop);
}

function focusInitialTarget(modal) {
  const autoFocus = modal.surface.querySelector("[autofocus]");
  if (autoFocus instanceof HTMLElement) {
    autoFocus.focus();
    return;
  }

  const focusable = getFocusableElements(modal.surface);
  if (focusable.length > 0) {
    focusable[0].focus();
    return;
  }

  modal.surface.focus();
}

function dispatchModalEvent(target, name, detail) {
  target.dispatchEvent(new CustomEvent(name, {
    bubbles: false,
    cancelable: false,
    detail
  }));
}

function buildModalStructure(cfg) {
  const modalId = cfg.id || cfg.customId || `smlModal${guid(true)}`;
  const headerBackgroundClass = String(cfg.headerBackgroundClass || "sml-modal-header-default").trim();
  const hasDarkHeader = /(bg-(primary|secondary|dark|success|danger|info)|text-bg-(primary|secondary|dark|success|danger|info)|sml-modal-header-default)/.test(headerBackgroundClass);
  const overlay = document.createElement("div");
  overlay.id = modalId;
  overlay.className = "sml-modal-overlay";
  overlay.dataset.smlModalOverlay = "true";
  overlay.dataset.origin = cfg.origin || "smlModalConfigOpen";
  if (cfg["data-src"]) overlay.dataset.src = cfg["data-src"];
  if (cfg.class || cfg.className) overlay.classList.add(...String(cfg.class || cfg.className).split(/\s+/).filter(Boolean));
  if (asBool(cfg.hasOverlay) === false) overlay.classList.add("sml-modal-overlay-no-backdrop");
  overlay.style.zIndex = String(cfg.zIndex || 1055 + activeModals.length * 10);
  overlay.setAttribute("aria-label", "Modal dialog backdrop");

  const shell = document.createElement("div");
  shell.className = "sml-modal-shell";
  shell.style.setProperty("--sml-modal-width", resolveDialogWidth(cfg.dialogSize || cfg.modalSize));
  if (cfg.shellClass) shell.classList.add(...String(cfg.shellClass).split(/\s+/).filter(Boolean));
  if (typeof cfg.shellStyle === "string" && cfg.shellStyle.trim()) {
    shell.style.cssText += `;${cfg.shellStyle.trim()}`;
  }

  const surface = document.createElement("section");
  surface.className = "sml-modal-surface modal-content";
  surface.tabIndex = -1;
  surface.setAttribute("role", cfg.isAlert || cfg.role === "alertdialog" ? "alertdialog" : "dialog");
  if (cfg.role !== "alertdialog") {
    surface.setAttribute("aria-modal", "true");
  }

  const titleId = `${modalId}Title`;
  const descriptionId = `${modalId}Description`;
  surface.setAttribute("aria-describedby", descriptionId);

  const content = document.createElement("div");
  content.className = "sml-modal-content";

  const header = document.createElement("div");
  header.className = "sml-modal-header modal-header";
  if (headerBackgroundClass) header.classList.add(...headerBackgroundClass.split(/\s+/).filter(Boolean));

  const titleButton = cfg.titleButtonJML ? document.createElement("div") : null;
  const title = document.createElement("h2");
  title.id = titleId;
  title.className = "sml-modal-title modal-title fs-5 m-0";
  title.textContent = cfg.titleText || cfg.title || "Message from CATS System";
  surface.setAttribute("aria-labelledby", titleId);

  const shouldShowCloseX = cfg.hideClosingX !== true && cfg.hasCloseXButton !== false && cfg.buttons !== "close-only";
  const closeX = document.createElement("button");
  closeX.type = "button";
  closeX.className = "btn-close sml-modal-close-button";
  if (hasDarkHeader) closeX.classList.add("btn-close-white");
  closeX.setAttribute("aria-label", "Close modal window (Escape key)");
  closeX.title = "Close modal (Escape key)";
  closeX.innerHTML = "&times;";
  closeX.dataset.smlModalClose = "true";

  if (cfg.headerJML) {
    appendStructuredContent(header, cloneValue(cfg.headerJML));
    const heading = header.querySelector("h1, h2, h3, h4, h5, h6, [data-sml-modal-title]");
    if (heading instanceof HTMLElement) {
      heading.id ||= titleId;
      surface.setAttribute("aria-labelledby", heading.id);
    } else {
      // Fallback: prepend title if no heading found in headerJML
      header.prepend(title);
      surface.setAttribute("aria-labelledby", titleId);
    }
    if (titleButton) {
      appendStructuredContent(titleButton, cloneValue(cfg.titleButtonJML));
      header.append(titleButton);
    }
    if (shouldShowCloseX && !header.querySelector("[data-sml-modal-close='true'], .btn-close")) {
      header.append(closeX);
    }
  } else {
    header.append(title);
    if (titleButton) {
      titleButton.className = "sml-modal-title-action";
      appendStructuredContent(titleButton, cloneValue(cfg.titleButtonJML));
      header.append(titleButton);
    }
    if (shouldShowCloseX) {
      header.append(closeX);
    }
  }

  const body = document.createElement("div");
  body.id = `${modalId}Body`;
  body.className = "sml-modal-body modal-body text-break";
  if (cfg.bodyClass) body.classList.add(...String(cfg.bodyClass).split(/\s+/).filter(Boolean));
  if (typeof cfg.bodyStyle === "string" && cfg.bodyStyle.trim()) {
    body.style.cssText += `;${cfg.bodyStyle.trim()}`;
  }
  appendStructuredContent(body, cloneValue(cfg.bodyJML), cfg.messageText || cfg.message || "");

  const description = document.createElement("p");
  description.id = descriptionId;
  description.className = "visually-hidden";
  const defaultDescription = `Modal dialog: ${cfg.titleText || cfg.title || "Message"}. Use Tab to navigate, Shift+Tab to go back, and Escape to close.`;
  description.textContent = cfg.ariaDescription || defaultDescription;

  const buttons = normalizeButtons(cfg, modalId);
  const addCloseButton = cfg.addCloseButton === true || (buttons.length === 0 && cfg.buttons !== null && cfg.buttons !== "x");
  const footer = document.createElement("div");
  footer.className = "sml-modal-footer modal-footer";

  if (cfg.footerJML) {
    appendStructuredContent(footer, cloneValue(cfg.footerJML));
  }

  if (cfg.footText) {
    const footText = document.createElement("p");
    footText.className = "sml-modal-footnote me-auto mb-0 fw-semibold";
    footText.textContent = cfg.footText;
    footer.prepend(footText);
  }

  if (buttons.length > 0) {
    const legacyContainer = document.createElement("div");
    legacyContainer.className = cfg.buttonLeftText || cfg.buttonCenterText || cfg.buttonRightText ? "sml-modal-legacy-actions" : "sml-modal-actions";
    for (const button of buttons) {
      const btn = document.createElement("button");
      btn.type = button.type;
      btn.id = button.id;
      btn.className = button.className;
      btn.textContent = button.text;
      btn.title = button.title;
      btn.setAttribute("aria-label", button.title);
      if (button.close) btn.dataset.smlModalClose = "true";
      btn.dataset.smlModalAction = button.id;
      legacyContainer.append(btn);
    }
    footer.append(legacyContainer);
  }

  if (addCloseButton) {
    const closeFooterButton = document.createElement("button");
    closeFooterButton.type = "button";
    closeFooterButton.className = "btn btn-outline-secondary";
    closeFooterButton.textContent = "Close";
    closeFooterButton.title = "Close";
    closeFooterButton.setAttribute("aria-label", "Close");
    closeFooterButton.dataset.smlModalClose = "true";
    footer.append(closeFooterButton);
  }

  if (cfg.contentJML) {
    appendStructuredContent(content, cloneValue(cfg.contentJML));
    const contentRoot = content.firstElementChild instanceof HTMLElement ? content.firstElementChild : content;
    contentRoot.classList.add("sml-modal-content-root");
    if (!contentRoot.contains(header) && !cfg.headerJML) contentRoot.prepend(header);
    if (!contentRoot.contains(body)) contentRoot.append(body);
    if (!contentRoot.contains(footer) && (footer.childElementCount > 0 || footer.textContent?.trim())) contentRoot.append(footer);
    contentRoot.append(description);
    surface.append(contentRoot);
  } else {
    content.append(header, body);
    if (footer.childElementCount > 0 || footer.textContent?.trim()) content.append(footer);
    content.append(description);
    surface.append(content);
  }

  shell.append(surface);
  overlay.append(shell);

  return {
    modalId,
    overlay,
    shell,
    surface,
    title,
    body,
    footer,
    buttons
  };
}

function wireModal(modal, cfg) {
  const closeOnBackgroundClick = asBool(cfg.closeOnBackgroundClick);
  const restoreFocusTo = resolveElementReference(cfg.focusElement) || resolveElementReference(cfg.elem) || resolveElementReference(cfg.returnFocus) || document.activeElement;
  const callButton = resolveElementReference(cfg.callButtonId);
  const callbacks = new Map(modal.buttons.map(button => [button.id, button.callback]));
  const previousDisabled = callButton instanceof HTMLButtonElement || callButton instanceof HTMLInputElement ? callButton.disabled : null;
  if (callButton instanceof HTMLElement && "disabled" in callButton) callButton.disabled = true;

  const onKeyDown = async (event) => {
    // Only handle keyboard if this modal is on top of the stack
    if (activeModals.at(-1) !== modal) {
      return;  // Early return: don't handle or preventDefault
    }
    
    if (event.key === "Escape") {
      event.preventDefault();
      await modal.close("escape");
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = getFocusableElements(modal.surface);
    if (focusable.length === 0) {
      event.preventDefault();
      modal.surface.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const onOverlayMouseDown = (event) => {
    modal.pointerDownOnOverlay = event.target === modal.overlay;
  };

  const onOverlayClick = async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const closeTrigger = target.closest("[data-sml-modal-close='true'], .btn-close");
    if (closeTrigger) {
      event.preventDefault();
      await modal.close("button-close");
      return;
    }

    const actionTrigger = target.closest("[data-sml-modal-action]");
    if (actionTrigger instanceof HTMLElement) {
      const callback = callbacks.get(actionTrigger.dataset.smlModalAction || "");
      if (typeof callback === "function") {
        const result = await callback(event, modal.overlay);
        if (result !== false && actionTrigger.dataset.smlModalClose === "true") {
          await modal.close("button-action");
        }
      }
      return;
    }

    if (closeOnBackgroundClick && modal.pointerDownOnOverlay && event.target === modal.overlay) {
      await modal.close("backdrop");
    }
  };

  modal.cleanup = () => {
    modal.overlay.removeEventListener("mousedown", onOverlayMouseDown);
    modal.overlay.removeEventListener("click", onOverlayClick);
    modal.surface.removeEventListener("keydown", onKeyDown);
    if (callButton instanceof HTMLElement && "disabled" in callButton && previousDisabled !== null) callButton.disabled = previousDisabled;
    // Validate focus restoration: only focus if element is still in DOM and focusable
    if (restoreFocusTo instanceof HTMLElement && document.contains(restoreFocusTo)) {
      if (restoreFocusTo.offsetParent !== null || restoreFocusTo === document.body || restoreFocusTo.tagName === "BODY") {
        restoreFocusTo.focus();
      } else {
        // Fallback: focus first focusable element on page
        const focusable = document.body.querySelectorAll(FOCUSABLE_SELECTOR);
        if (focusable.length > 0) focusable[0].focus();
      }
    }
  };

  modal.overlay.addEventListener("mousedown", onOverlayMouseDown);
  modal.overlay.addEventListener("click", onOverlayClick);
  modal.surface.addEventListener("keydown", onKeyDown);
}

function createModalController(structure, cfg) {
  const modal = {
    ...structure,
    cfg,
    pointerDownOnOverlay: false,
    cleanup: null,
    async close(reason = "close") {
      if (!modal.overlay.isConnected) return;
      const stackIndex = activeModals.indexOf(modal);
      if (stackIndex >= 0) activeModals.splice(stackIndex, 1);
      modal.cleanup?.();
      modal.overlay.remove();
      unlockBodyScroll();
      restoreInertOutside();
      dispatchModalEvent(modal.overlay, "hidden", { id: modal.modalId, reason, modal: modal.overlay });
      if (typeof cfg.onClose === "function") {
        await cfg.onClose({ id: modal.modalId, reason, modal: modal.overlay });
      }
    }
  };

  modal.overlay.close = modal.close;
  modal.overlay.smlModal = modal;
  return modal;
}

export async function smlModalConfigOpen(inputCfg = {}) {
  const cfg = {
    addCloseButton: false,
    closeOnBackgroundClick: true,
    hasCloseXButton: true,
    hasOverlay: true,
    ...inputCfg
  };
  cfg.id = cfg.id || cfg.customId || `smlModal${guid(true)}`;
  cfg.titleText = cfg.titleText || cfg.title || "Message from CATS System";
  cfg.messageText = cfg.messageText ?? cfg.message ?? "";
  cfg.dialogSize = cfg.dialogSize || cfg.modalSize || "medium";

  document.getElementById(cfg.id)?.smlModal?.close?.("replace");
  document.getElementById(cfg.id)?.remove();

  const structure = buildModalStructure(cfg);
  const modal = createModalController(structure, cfg);
  wireModal(modal, cfg);

  document.body.append(modal.overlay);
  activeModals.push(modal);
  lockBodyScroll();
  restoreInertOutside();
  applyInertOutside(modal.overlay);
  
  // Announce modal to screen readers
  const announcement = document.createElement("div");
  announcement.setAttribute("role", "status");
  announcement.setAttribute("aria-live", "polite");
  announcement.setAttribute("aria-atomic", "true");
  announcement.className = "visually-hidden";
  announcement.textContent = `Modal dialog opened: ${cfg.titleText || cfg.title || "Dialog"}. ${activeModals.length > 1 ? "Additional dialog on top of previous." : ""}`;
  document.body.append(announcement);
  setTimeout(() => announcement.remove(), 2000);
  
  focusInitialTarget(modal);
  dispatchModalEvent(modal.overlay, "shown", { id: modal.modalId, modal: modal.overlay });
  if (typeof cfg.onShown === "function") {
    await cfg.onShown({ id: modal.modalId, modal: modal.overlay });
  }

  return modal.overlay;
}

export function ensureSmlModalHelpers() {
  globalThis.smlModalConfigOpen = smlModalConfigOpen;
  globalThis.smlModalMakeOpen = (message, title = "Message from CATS System") => smlModalBox(message, title);
  if (typeof globalThis.modalBox !== "function") {
    globalThis.modalBox = globalThis.smlModalMakeOpen;
  }
  return globalThis.smlModalConfigOpen;
}

export async function smlModalBox(
  body,
  title = "Message from CATS System",
  buttonLeftText,
  buttonLeftCall,
  buttonCenterText,
  buttonCenterCall,
  buttonRightText,
  buttonRightCall,
  headerBackgroundColor,
  modalSize,
  hideClosingX = false,
  elem,
  cloneId,
  origin
) {
  ensureSmlModalHelpers();
  const cfg = {
    id: cloneId || `modalBoxCall${guid(true)}`,
    titleText: title,
    messageText: typeof body === "string" || typeof body === "number" ? String(body) : "",
    bodyJML: body && typeof body === "object" && !isElement(body) ? cloneValue(body) : undefined,
    buttonLeftText,
    buttonLeftFunction: buttonLeftCall,
    buttonCenterText,
    buttonCenterFunction: buttonCenterCall,
    buttonRightText,
    buttonRightFunction: buttonRightCall,
    headerBackgroundClass: headerBackgroundColor || "sml-modal-header-default",
    modalSize,
    hideClosingX,
    hasCloseXButton: !hideClosingX,
    focusElement: elem,
    origin: origin || "",
    closeOnBackgroundClick: true,
    addCloseButton: !buttonLeftText && !buttonCenterText && !buttonRightText
  };

  if (typeof body === "string" && isHtmlString(body)) {
    cfg.bodyJML = undefined;
    cfg.messageText = body;
  }
  if (isElement(body)) {
    cfg.bodyJML = body.cloneNode(true);
    cfg.messageText = "";
  }
  if (title === "Your Session Has Expired!!") {
    cfg.zIndex = 6065;
  }

  return smlModalConfigOpen(cfg);
}

export default {
  ensureSmlModalHelpers,
  smlModalBox,
  smlModalConfigOpen
};