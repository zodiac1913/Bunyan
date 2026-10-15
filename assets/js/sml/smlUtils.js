//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
/* eslint-disable no-undef */
/* eslint-disable no-console */
"use strict";
import { ensureSmlModalHelpers as ensureSmlModalRuntime, smlModalBox } from "./smlModal.js";

const RESERVED_JML_KEYS = new Set(["n", "b", "t", "i", "c", "s", "ttl", "html", "innerHTML", "text"]);

export function asBool(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  if (Array.isArray(value)) return false;
  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();
    if (["true", "1", "y", "yes", "on"].includes(normalizedValue)) return true;
    if (["false", "0", "n", "no", "off", ""].includes(normalizedValue)) return false;
    return Boolean(normalizedValue);
  }
  if (typeof value === "number") return value === 1;
  return Boolean(value);
}

export function clip(text, maxLength) {
  if (typeof text !== "string" || !text.trim()) return "";
  if (typeof maxLength !== "number" || maxLength < 1) return text;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export function guid(nodash = false) {
  const randomPart = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID().replaceAll("-", "");
    }
    return Math.random().toString(16).slice(2).padEnd(32, "0");
  };

  const value = randomPart().slice(0, 32);
  if (nodash) return value;
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

export function replaceLast(str, search, replacement, caseInsensitive = false) {
  if (typeof str !== "string" || typeof search !== "string" || search === "") return str;
  if (!caseInsensitive) {
    const lastIndex = str.lastIndexOf(search);
    if (lastIndex < 0) return str;
    return str.slice(0, lastIndex) + replacement + str.slice(lastIndex + search.length);
  }

  const lowerStr = str.toLowerCase();
  const lowerSearch = search.toLowerCase();
  const lastIndex = lowerStr.lastIndexOf(lowerSearch);
  if (lastIndex < 0) return str;
  return str.slice(0, lastIndex) + replacement + str.slice(lastIndex + search.length);
}

export async function dispatch(receiver, caller, job, data) {
  if (!receiver || typeof receiver[job] !== "function") {
    throw new TypeError(`Dispatch target missing method: ${job}`);
  }
  return receiver[job](data, caller);
}

export function toTitle(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function asFieldNotationString(str) {
  if (!str || typeof str !== "string") return "";
  const compact = str.replaceAll(" ", "");
  if (!compact) return "";
  if (compact.length === 1) return compact.toLowerCase();
  if (compact.substring(0, 1) === compact.substring(0, 1).toLowerCase()) return "_" + compact;
  return compact.substring(0, 1).toLowerCase() + compact.substring(1);
}

export function unAlterEncapse(str, encapseOne = "^~^", encapseOneReplace = '"') {
  if (str === null || str === undefined) return "{}";
  return String(str).replaceAll("::ALTERENCAPSE::", "").replaceAll(encapseOne, encapseOneReplace);
}

export function alterEncapse(str, encapseOne = '"', encapseOneReplace = "^~^") {
  if (str === null || str === undefined || str === "") return "{}";
  return "::ALTERENCAPSE::" + String(str).replaceAll(encapseOne, encapseOneReplace);
}


/**
 * Converts a camelCase or PascalCase string to a human-readable title.
 * - Inserts spaces before uppercase letters.
 * - Capitalizes the first character.
 * - Trims leading/trailing spaces.
 * - Returns an empty string for null/undefined/empty input.
 *
 * @export
 * @param {string} str - The camelCase or PascalCase string to convert.
 * @returns {string} The title-cased string.
 * @memberof smlUtils
 * @example
 * camelToTitle("someCoolTitle"); // "Some Cool Title"
 * camelToTitle("SomeCoolTitle"); // "Some Cool Title"
 * camelToTitle("aTitle");        // "A Title"
 * camelToTitle("");              // ""
 */
export function camelToTitle(str) {
    if (!str || typeof str !== "string") return "";
    // Insert space before each uppercase letter, capitalize first character, trim
    return str
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, s => s.toUpperCase())
        .trim();
}


export function checkSetDefault(obj, props, setTo) {
  if (!obj || !props || setTo === undefined || setTo === null) return null;
  const propList = Array.isArray(props) ? props : String(props).split(",");
  for (const prop of propList) {
    const currentValue = obj[prop];
    const isMissing = currentValue === undefined || currentValue === null;
    if (Array.isArray(setTo) && setTo.length === 0) {
      if (isMissing) obj[prop] = [];
    } else if (isMissing) {
      obj[prop] = setTo;
    }
  }
  return obj;
}

export function isJson(str) {
  if (str === null || str === undefined) return false;
  if (typeof str === "object") return true;
  if (typeof str !== "string" || !str.trim()) return false;
  try {
    JSON.parse(str.trim());
    return true;
  } catch {
    return false;
  }
}

export function isJsonRepaired(str) {
  if (str === null || str === undefined) return [false, str];
  if (typeof str === "object") return [true, str];
  if (typeof str !== "string" || !str.trim()) return [false, str];

  const potentialJson = str.trim();
  try {
    JSON.parse(potentialJson);
    return [true, potentialJson];
  } catch {
    if (potentialJson.startsWith("{") && potentialJson.endsWith("}")) {
      try {
        const repaired = potentialJson.replaceAll("'", '"').replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
        JSON.parse(repaired);
        return [true, repaired];
      } catch {
        return [false, potentialJson];
      }
    }
    return [false, potentialJson];
  }
}

export function jmlToHtml(jsonIn, tabs = 2) {
  const indent = (level) => " ".repeat(level * tabs);
  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  const ATTR_MAP = {
    c: "class",
    i: "id",
    v: "value",
    o: "onclick",
    s: "style",
    h: "href",
    r: "role",
    ttl: "title",
    p: "placeholder",
    acon: "aria-controls",
    aexp: "aria-expanded",
    ahid: "aria-hidden",
    alab: "aria-label",
    albb: "aria-labelledby",
    alvl: "aria-level",
    areq: "aria-required",
    arol: "role"
  };

  const SKIP_ATTR_KEYS = new Set([
    "nodeType", "node", "tag", "n",
    "b", "babies",
    "t", "text", "innerText", "html", "innerHTML",
    "event", "e"
  ]);

  const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

  const flattenOne = (value) => {
    if (!Array.isArray(value)) return null;
    return typeof value.flat === "function" ? value.flat(1) : [].concat(...value);
  };

  const renderNode = (node, level = 0) => {
    if (node === null || node === undefined || node === false) return "";
    if (Array.isArray(node)) return node.map(item => renderNode(item, level)).join("");
    if (typeof node === "string" || typeof node === "number") return escapeHtml(node);
    if (typeof node !== "object") return escapeHtml(String(node));

    const tagName = String(node.nodeType || node.node || node.n || node.tag || "div").toLowerCase();
    const inputType = String(node.type || "").toLowerCase();
    const isNativeButtonControl = tagName === "button" || (tagName === "input" && ["button", "submit", "reset", "image"].includes(inputType));
    const attrs = [];

    const pushAttr = (name, value) => {
      if (value === undefined || value === null || value === false) return;
      if (value === true) {
        attrs.push(name);
        return;
      }
      attrs.push(`${name}="${escapeHtml(String(value))}"`);
    };

    for (const [key, value] of Object.entries(node)) {
      if (SKIP_ATTR_KEYS.has(key) || RESERVED_JML_KEYS.has(key)) continue;

      if (key === "ahdr") {
        pushAttr("role", "heading");
        pushAttr("aria-level", value);
        continue;
      }

      if (key === "className") {
        pushAttr("class", value);
        continue;
      }

      if (key === "style" && typeof value === "object" && value !== null && !Array.isArray(value)) {
        const styleText = Object.entries(value).map(([styleKey, styleValue]) => `${styleKey}:${styleValue}`).join(";");
        pushAttr("style", styleText);
        continue;
      }

      const mappedKey = ATTR_MAP[key] || key;
      if (mappedKey === "role" && String(value || "").toLowerCase() === "button" && isNativeButtonControl) {
        continue;
      }
      pushAttr(mappedKey, value);
    }

    if (node.i) pushAttr("id", node.i);
    if (node.c) pushAttr("class", node.c);
    if (node.s) pushAttr("style", node.s);
    if (node.ttl) pushAttr("title", node.ttl);

    const titleForA11y = node.ttl !== undefined ? node.ttl : node.title;
    if (titleForA11y !== undefined && node.alab === undefined && node["aria-label"] === undefined) {
      pushAttr("aria-label", titleForA11y);
    }

    const openTag = attrs.length > 0 ? `<${tagName} ${attrs.join(" ")}>` : `<${tagName}>`;
    const nestedChildren = flattenOne(node.b) || flattenOne(node.babies);
    const childrenHtml = nestedChildren ? nestedChildren.map(child => renderNode(child, level + 1)).join("") : renderNode(node.b, level + 1);

    const innerHtml = node.html !== undefined
      ? String(node.html)
      : node.innerHTML !== undefined
        ? String(node.innerHTML)
        : [
          node.t !== undefined ? escapeHtml(node.t) : (node.text !== undefined ? escapeHtml(node.text) : (node.innerText !== undefined ? escapeHtml(node.innerText) : "")),
          childrenHtml
        ].join("");

    const endMarker = (node.id || node.i)
       ? "" //`<!-- data-end="${escapeHtml(node.id || node.i)}" -->`
       : "";

    if (!innerHtml) {
      if (VOID_ELEMENTS.has(tagName)) {
        return `${indent(level)}${openTag.slice(0, -1)}>${endMarker}`;
      }
      return `${indent(level)}${openTag}</${tagName}>${endMarker}`;
    }

    return `${indent(level)}${openTag}${innerHtml}</${tagName}>${endMarker}`;
  };

  return renderNode(jsonIn, 0);
}

export function append(element, htmlOrElement) {
  if (!element) return;
  if (typeof htmlOrElement === "string" || htmlOrElement instanceof String) {
    element.insertAdjacentHTML("beforeend", htmlOrElement);
  } else if (htmlOrElement instanceof HTMLElement) {
    element.insertAdjacentElement("beforeend", htmlOrElement);
  }
}

export function prepend(element, htmlOrElement) {
  if (!element) return;
  if (typeof htmlOrElement === "string" || htmlOrElement instanceof String) {
    element.insertAdjacentHTML("afterbegin", htmlOrElement);
  } else if (htmlOrElement instanceof HTMLElement) {
    element.insertAdjacentElement("afterbegin", htmlOrElement);
  }
}

export function elementHide(eles) {
  if (eles === undefined || eles === null) return eles;
  if (NodeList.prototype.isPrototypeOf(eles)) eles = Array.from(eles);
  if (!Array.isArray(eles)) eles = [eles];
  for (const ele of eles) {
    if (!ele) continue;
    ele.style.display = "none";
    ele.classList.add("d-none");
    if (ele.classList.contains("panel-collapse")) {
      ele.classList.add("collapse");
    }
  }
  return eles;
}

export function elementShow(eles) {
  if (eles === undefined || eles === null) return eles;
  if (NodeList.prototype.isPrototypeOf(eles)) eles = Array.from(eles);
  if (!Array.isArray(eles)) eles = [eles];
  for (const ele of eles) {
    if (!ele) continue;
    ele.style.display = "";
    ele.classList.remove("d-none", "collapse");
  }
  return eles;
}

export function getEles(src, q) {
  if (!q) {
    if (!src) return document.body;
    q = src;
    src = document;
  }
  if (q === undefined) return document;
  q = q.replaceAll(":input", "input, select, textarea");
  return src.querySelectorAll(q);
}

export function getEle(src, q) {
  if (!q) {
    if (!src) return document.body;
    q = src;
    src = document;
  }
  const result = getEles(src, q)[0];
  if (result === undefined) {
    const notFound = document.createElement("div");
    notFound.id = "ElementNotFound";
    return notFound;
  }
  return result;
}

export function getVal(ele, val) {
  if (!ele) return val === undefined ? "" : ele;
  if (val === undefined) {
    switch (ele.nodeName) {
      case "SELECT":
        if (ele.hasAttribute("multiple")) {
          return Array.from(ele.selectedOptions).map(option => option.label).join(",");
        }
        return ele.selectedIndex < 0 ? "" : ele[ele.selectedIndex].value;
      case "TEXTAREA":
        return ele.value;
      case "INPUT":
        return (ele.type || "").toUpperCase() === "CHECKBOX" ? ele.checked : ele.value;
      case "SML-FORM-FIELD":
        return ele.querySelector("input")?.value || "";
      default:
        return ele.innerHTML;
    }
  }

  switch (ele.nodeName) {
    case "SELECT":
      if (val === null || val === "") {
        ele.value = "";
      } else {
        [...ele.options].some((option, index) => {
          if (option.value == val) {
            ele.selectedIndex = index;
            return true;
          }
          return false;
        });
      }
      break;
    case "DIV":
      ele.innerHTML = val;
      break;
    default:
      if ((ele.type || "").toUpperCase() === "CHECKBOX") {
        const normalizedValue = String(val || "").toLowerCase();
        ele.checked = val === true || normalizedValue === "true" || normalizedValue === "on";
      } else {
        ele.value = val;
      }
      break;
  }

  return ele;
}

export function isCheck(ele, checkType) {
  switch (checkType) {
    case ":checked":
      return !!ele?.checked;
    case ":visible":
      if (NodeList.prototype.isPrototypeOf(ele)) ele = Array.from(ele);
      if (Array.isArray(ele)) {
        return ele.some(item => item?.style?.display !== "none"
          && !item.classList.contains("d-none")
          && !item.classList.contains("collapse"));
      }
      return ele?.style?.display !== "none"
        && !ele.classList.contains("d-none")
        && !ele.classList.contains("collapse");
    default:
      return !!ele?.nodeName && ele.nodeName.toUpperCase() === String(checkType || "").toUpperCase();
  }
}

export function on(eles, event, func) {
  if (!eles) return false;
  if (NodeList.prototype.isPrototypeOf(eles)) {
    eles = Array.from(eles);
  } else if (!Array.isArray(eles)) {
    eles = [eles];
  }
  for (const ele of eles) {
    if (ele && typeof ele.addEventListener === "function") {
      ele.addEventListener(event, func, false);
    }
  }
  return true;
}

export function off(eles, event, func) {
  if (!eles) return false;
  if (NodeList.prototype.isPrototypeOf(eles)) {
    eles = Array.from(eles);
  } else if (!Array.isArray(eles)) {
    eles = [eles];
  }
  for (const ele of eles) {
    if (ele && typeof ele.removeEventListener === "function") {
      ele.removeEventListener(event, func, false);
    }
  }
  return true;
}

export function unbind(eles) {
  if (NodeList.prototype.isPrototypeOf(eles)) {
    eles = Array.from(eles);
  } else if (!Array.isArray(eles)) {
    eles = [eles];
  }
  for (const ele of eles) {
    if (ele?.parentNode) {
      const clone = ele.cloneNode(true);
      ele.parentNode.replaceChild(clone, ele);
    }
  }
}

export function asAlphaNumeric(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[^a-zA-Z0-9_]/g, "");
}

export function asElementId(id) {
  if (!id) return "";
  let normalizedId = String(id);
  if (!normalizedId.startsWith("#")) normalizedId = `#${normalizedId}`;
  return normalizedId.replaceAll("##", "#");
}

export function isBool(obj) {
  return asBool(obj);
}

export function isElement(obj) {
  return obj instanceof HTMLElement;
}

export function isNumeric(obj) {
  return typeof obj === "number"
    ? Number.isFinite(obj)
    : typeof obj === "string" && obj.trim() !== "" && !Number.isNaN(Number(obj));
}

export function asInt(value) {
  if (!isNumeric(value)) return -1;
  return parseInt(value, 10);
}

export function debounce(func, wait) {
  let timeout;
  return function debouncedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

export function textBetween(str, start, end) {
  if (typeof str !== "string" || typeof start !== "string" || typeof end !== "string") return "";
  const startIndex = str.indexOf(start);
  if (startIndex === -1) return "";
  const endIndex = str.indexOf(end, startIndex + start.length);
  if (endIndex === -1) return "";
  return str.substring(startIndex + start.length, endIndex);
}

export function makeAlert(alert, alias, type = "info") {
  return {
    n: "div",
    class: `alert alert-${type} alert-dismissible fade show`,
    role: "alert",
    id: alias || "",
    t: alert,
    b: [
      {
        n: "button",
        type: "button",
        class: "btn-close",
        "data-bs-dismiss": "alert",
        "aria-label": "Close"
      }
    ]
  };
}

export function makeAlertJML(idAdd, text, clazz = "alert-info") {
  return {
    n: "div",
    id: idAdd || "",
    class: `alert ${clazz} alert-dismissible fade show`,
    role: "alert",
    t: text,
    b: [
      {
        n: "button",
        type: "button",
        class: "btn-close",
        "data-bs-dismiss": "alert",
        "aria-label": "Close"
      }
    ]
  };
}

export function formEnabled(form, enabled = true) {
  if (!(form instanceof HTMLElement)) return;
  const elements = form.querySelectorAll("input, select, textarea, button");
  elements.forEach(element => {
    element.disabled = !enabled;
  });
}

export function functionCall(func, data) {
  if (typeof func === "function") {
    return data === undefined ? func() : func(data);
  }
  if (typeof func === "string" && typeof window?.[func] === "function") {
    return data === undefined ? window[func]() : window[func](data);
  }
  return data;
}

export function unobtrusiveWait(message = "Please wait...") {
  if (globalThis.__smlUnobtrusiveWaitTimer) {
    clearTimeout(globalThis.__smlUnobtrusiveWaitTimer);
    globalThis.__smlUnobtrusiveWaitTimer = null;
  }

  let waitDiv = document.getElementById("smlUnobtrusiveWaitOverlay");
  if (!waitDiv) {
    waitDiv = document.createElement("div");
    waitDiv.id = "smlUnobtrusiveWaitOverlay";
    waitDiv.style.position = "fixed";
    waitDiv.style.top = "0";
    waitDiv.style.left = "0";
    waitDiv.style.width = "100vw";
    waitDiv.style.height = "100vh";
    waitDiv.style.background = "rgba(0,0,0,0.3)";
    waitDiv.style.display = "flex";
    waitDiv.style.alignItems = "center";
    waitDiv.style.justifyContent = "center";
    waitDiv.style.zIndex = "9999";
    waitDiv.style.fontSize = "2em";
    waitDiv.style.color = "#fff";
    document.body.appendChild(waitDiv);
  }
  waitDiv.textContent = message;
  waitDiv.setAttribute("role", "alert");
  waitDiv.setAttribute("aria-live", "assertive");
  waitDiv.setAttribute("aria-atomic", "true");
  waitDiv.style.display = "flex";

  // Fallback protection: clear stale overlays if a caller exits early due to an exception.
  const maxMs = Number.parseInt(String(globalThis.__smlUnobtrusiveWaitMaxMs || "30000"), 10);
  const safeMaxMs = Number.isFinite(maxMs) && maxMs > 0 ? maxMs : 30000;
  globalThis.__smlUnobtrusiveWaitTimer = setTimeout(() => {
    unobtrusiveWaitOff();
  }, safeMaxMs);
}

export function unobtrusiveWaitOff() {
  if (globalThis.__smlUnobtrusiveWaitTimer) {
    clearTimeout(globalThis.__smlUnobtrusiveWaitTimer);
    globalThis.__smlUnobtrusiveWaitTimer = null;
  }

  const waitDiv = document.getElementById("smlUnobtrusiveWaitOverlay");
  if (waitDiv) {
    waitDiv.style.display = "none";
    waitDiv.remove();
  }
}

export function saveData(key, value, bypass = false) {
  if (value === undefined || value === null) return;
  const safeKey = key || "";

  const appContext = globalThis?.cso;
  const appUrl = appContext?.CurrentApp?.Url;
  const fullKey = (!bypass && typeof appUrl === "string" && appUrl.length > 0)
    ? `${appUrl}_${safeKey}`
    : `${location.href}_${safeKey}`;

  const cleanValue = typeof value === "object" ? JSON.stringify(value) : String(value);
  try {
    localStorage.setItem(fullKey, cleanValue);
  } catch (err) {
    console.warn("SML Storage warning! Failed to save key:", fullKey, err);
  }
}

export function getData(key, bypass = false) {
  const safeKey = key || "";

  const appContext = globalThis?.cso;
  const appUrl = appContext?.CurrentApp?.Url;
  const fullKey = (!bypass && typeof appUrl === "string" && appUrl.length > 0)
    ? `${appUrl}_${safeKey}`
    : `${location.href}_${safeKey}`;

  try {
    const data = localStorage.getItem(fullKey);
    if (!data) return null;
    return isJson(data) ? JSON.parse(data) : data;
  } catch (err) {
    console.warn("SML Storage warning! Failed to read key:", fullKey, err);
    return null;
  }
}

function responseRequiresRob(responsePayload, responseHeaders) {
  const headerSignal = (responseHeaders?.get("X-CATS-FIRE-ROB") || "").toLowerCase() === "true";
  if (headerSignal) return true;

  if (!responsePayload || typeof responsePayload !== "object") return false;

  return responsePayload.rob === true
    || responsePayload.fireRob === true
    || responsePayload?.Data?.rob === true
    || responsePayload?.Data?.fireRob === true
    || responsePayload?.data?.rob === true
    || responsePayload?.data?.fireRob === true;
}

function triggerRobPrompt() {
  document.dispatchEvent(new CustomEvent("cats:rob-required"));
}

/** True when the element is client-owned and should speak through sml-engine. */
export function isSmlClientOwned(element) {
  return asBool(element?.dataset?.client);
}

/** Finds the sml-engine responsible for a client-owned element. */
export function resolveSmlEngine(element) {
  const requested = String(element?.dataset?.engine || "").trim();
  if (requested) {
    const named = globalThis[requested];
    if (named?.tagName === "SML-ENGINE" || typeof named?.ask === "function") return named;
  }

  const scope = element?.closest?.("[data-sml-page], sml-page, main, body") || document;
  return scope.querySelector?.("sml-engine") || document.querySelector("sml-engine");
}

/**
 * Posts through sml-engine when data-client=true; otherwise uses the traditional fetch path.
 * Engine buffering and correlation live in smlEngine.ask.
 */
export async function smlClientOrFetch(element, { kind = "data", api, body, signal } = {}, traditionalFetch) {
  if (!isSmlClientOwned(element)) {
    return traditionalFetch();
  }

  const engine = resolveSmlEngine(element);
  if (!engine || typeof engine.ask !== "function") {
    throw new Error("smlEngine not found for data-client request");
  }

  if (typeof engine.whenReady === "function" && !engine.ready) {
    await engine.whenReady();
  }

  let payload = body;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = { raw: payload };
    }
  }

  return engine.ask({ from: element, kind, api, body: payload ?? {}, signal });
}

/** Identical posts that are still in flight share one trip to the server. */
const smlPostsInFlight = new Map();

/**
 * Call counters for spotting wasted trips. Flip globalThis.smlTraceCalls on to log
 * repeats as they happen, or run smlCallStats.report() in the console after a page settles.
 */
export const smlCallStats = {
  total: 0,
  coalesced: 0,
  repeats: 0,
  repeatWindowMs: 2000,
  calls: new Map(),
  reset() {
    this.total = 0;
    this.coalesced = 0;
    this.repeats = 0;
    this.calls.clear();
  },
  report() {
    const rows = [...this.calls.values()]
      .filter((call) => call.count > 1 || call.coalesced > 0)
      .sort((a, b) => (b.count + b.coalesced) - (a.count + a.coalesced))
      .map((call) => ({ url: call.url, posted: call.count, coalesced: call.coalesced, repeats: call.repeats }));
    console.table(rows);
    return { total: this.total, coalesced: this.coalesced, repeats: this.repeats, rows };
  }
};
globalThis.smlCallStats = smlCallStats;

function trackSmlPost(key, url) {
  const stats = smlCallStats;
  const now = Date.now();
  stats.total += 1;

  let call = stats.calls.get(key);
  if (!call) {
    if (stats.calls.size > 250) stats.calls.delete(stats.calls.keys().next().value);
    call = { url, count: 0, coalesced: 0, repeats: 0, lastAt: 0 };
    stats.calls.set(key, call);
  }

  if (call.count > 0 && now - call.lastAt < stats.repeatWindowMs) {
    stats.repeats += 1;
    call.repeats += 1;
    if (globalThis.smlTraceCalls) {
      console.warn(`smlUtils: repeat POST to ${url} ${now - call.lastAt}ms after the last identical one.`);
    }
  }

  call.count += 1;
  call.lastAt = now;
  return call;
}

/** Joiners get their own copy so one caller's edits never reach another. */
function copySmlResponse(response) {
  if (!response || typeof response !== "object") return response;
  try {
    return structuredClone(response);
  } catch {
    try {
      return JSON.parse(JSON.stringify(response));
    } catch {
      return response;
    }
  }
}

export async function apiPostDirect(url, dataUp, messageReceiverDataType = "json", requestOptions = {}) {
  const payload = typeof dataUp === "string" ? dataUp : JSON.stringify(dataUp ?? {});

  const resolveControllerName = () => {
    const dataController = document.querySelector("sml-page")?.dataset?.controller
      || document.querySelector("cc-container")?.dataset?.controller
      || document.querySelector("[data-controller]")?.dataset?.controller;
    if (typeof dataController === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(dataController)) return dataController;

    const csoController = globalThis?.cso?.CurrentApp?.ControllerName || globalThis?.cso?.CurrentTask?.ControllerName;
    if (typeof csoController === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(csoController)) return csoController;

    const firstAlphaSegment = location.pathname.split("/").filter(Boolean).find(seg => /^[A-Za-z_][A-Za-z0-9_]*$/.test(seg));
    return firstAlphaSegment || "";
  };

  let requestUrl = url;
  if (requestUrl && requestUrl.indexOf("/") === -1) {
    const controller = resolveControllerName();
    requestUrl = controller.length > 0 ? `/${controller}/${requestUrl}` : `/${requestUrl}`;
  }

  const dedupeKey = `${messageReceiverDataType}|${requestUrl}|${payload}`;
  trackSmlPost(dedupeKey, requestUrl);

  // Aborts belong to a single caller, so signalled posts always get their own trip.
  const shareable = !requestOptions?.signal;
  if (shareable) {
    const shared = smlPostsInFlight.get(dedupeKey);
    if (shared) {
      smlCallStats.coalesced += 1;
      const call = smlCallStats.calls.get(dedupeKey);
      if (call) call.coalesced += 1;
      return copySmlResponse(await shared);
    }
  }

  const attempt = smlPostWithRetry(requestUrl, payload, messageReceiverDataType, requestOptions);
  if (shareable) {
    smlPostsInFlight.set(dedupeKey, attempt);
    attempt
      .catch(() => { /* the caller owns the failure */ })
      .finally(() => {
        if (smlPostsInFlight.get(dedupeKey) === attempt) smlPostsInFlight.delete(dedupeKey);
      });
  }

  return attempt;
}

async function smlPostWithRetry(requestUrl, payload, messageReceiverDataType, requestOptions) {
  const isTransientNetworkError = (value) => {
    const errorText = String(value || "");
    return errorText.includes("Failed to fetch")
      || errorText.includes("ERR_NETWORK_CHANGED")
      || errorText.includes("ERR_CONNECTION_REFUSED");
  };

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const retryDelaysMs = [350, 900, 1800];

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      const csrfToken = document.querySelector('input[name="__RequestVerificationToken"]')?.value;
      const headers = { "Content-Type": "application/json" };
      if (csrfToken) headers["X-CSRF-TOKEN"] = csrfToken;

      const response = await fetch(requestUrl, {
        method: "POST",
        headers,
        cache: "no-cache",
        body: payload,
        signal: requestOptions?.signal,
      });

      if (messageReceiverDataType === "text") {
        const textResponse = await response.text();
        return textResponse;
      }

      const responseText = await response.text();
      const parsedResponse = !responseText
        ? {}
        : (isJson(responseText) ? JSON.parse(responseText) : responseText);

      if (responseRequiresRob(parsedResponse, response.headers)) {
        triggerRobPrompt();
      }

      if (!response.ok) {
        const statusError = `HTTP ${response.status} from ${requestUrl}`;
        if (parsedResponse && typeof parsedResponse === "object" && !Array.isArray(parsedResponse)) {
          parsedResponse.errorObject = parsedResponse.errorObject || parsedResponse.ErrorObject || statusError;
          return parsedResponse;
        }
        return { errorObject: statusError };
      }

      return parsedResponse;
    } catch (err) {
      if (err?.name === "AbortError") {
        return { aborted: true, errorObject: "Request aborted" };
      }

      if (attempt < retryDelaysMs.length && isTransientNetworkError(err)) {
        await delay(retryDelaysMs[attempt]);
        continue;
      }

      console.log("smlUtils apiPostDirect error:", err);
      return { errorObject: String(err) };
    }
  }
}

export async function apiPost(apiPrefix, dataUp, messageReceiverDataType = "json", method = "POST") {
  const payload = typeof dataUp === "string" ? dataUp : JSON.stringify(dataUp ?? {});
  let apiSuffix = "";

  if (typeof dataUp === "string") {
    try {
      const parsed = JSON.parse(dataUp);
      apiSuffix = parsed.requestType || parsed.callAction || "";
    } catch {
      apiSuffix = "";
    }
  } else {
    apiSuffix = dataUp?.requestType || dataUp?.callAction || "";
  }

  const basePrefix = String(apiPrefix || "").split("/").filter(Boolean).pop() || "";
  const generatedUrl = `Api${basePrefix}${apiSuffix}`;

  if (String(method || "POST").toUpperCase() !== "POST") {
    return await apiPostDirect(generatedUrl, payload, messageReceiverDataType);
  }

  return await apiPostDirect(generatedUrl, payload, messageReceiverDataType);
}

export async function receiptCheckGood(data, toDb = false, call) {
  let payload = data;
  if (typeof payload === "string" && isJson(payload)) {
    payload = JSON.parse(payload);
  }
  if (payload?.Data && (payload.Data.errorObject || payload.Data.isValid || payload.Data.form)) {
    payload = payload.Data;
  }
  if (payload?.fireRob && typeof globalThis.rulesOfBehaviorShow === "function") {
    globalThis.rulesOfBehaviorShow();
  }
  const isGood = !payload?.errorObject;
  if (!isGood && typeof call === "function") {
    call(payload);
  }
  return isGood;
}

/**
 * Converts a DOM element (and its children) to a JSON Markup Language (JML) object.
 * - Captures attributes, text content, node name, and children recursively.
 * - Useful for serializing DOM structure to JSON.
 *
 * @export
 * @param {HTMLElement} htmlEle - The DOM element to convert.
 * @returns {Object} The JML representation of the element.
 * @memberof smlUtils
 * @example
 */
export function htmlToJML(htmlEle) {
    if (!(htmlEle instanceof HTMLElement)) return {};
    const jml = { b: [] };

    // Copy attributes
    for (const attr of htmlEle.attributes) {
        jml[attr.name] = attr.value || "";
    }

    // Get text content (only direct text nodes)
    const text = Array.from(htmlEle.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent)
        .join("")
        .trim();
    if (text) jml.t = text;

    // Node name
    jml.n = htmlEle.nodeName;

    // ID fallback
    if (!jml.i && !jml.id) {
        jml.i = htmlEle.id || (htmlEle.nodeName + "_" + Math.random().toString(16).slice(2));
    }

    // Children
    for (const child of htmlEle.children) {
        jml.b.push(htmlToJML(child));
    }

    return jml;
}

function cloneJml(section, fallback = null) {
  if (section && typeof section === "object") {
    return structuredClone(section);
  }
  if (fallback && typeof fallback === "object") {
    return structuredClone(fallback);
  }
  return null;
}

function appendClassName(target, className) {
  if (!target || !className) return;
  target.c = [target.c || "", className].filter(Boolean).join(" ").trim();
}

function resolveModalWidth(dialogSize) {
  if (dialogSize === undefined || dialogSize === null || dialogSize === "") return "min(42rem, calc(100vw - 2rem))";
  if (dialogSize === "large") return "min(72rem, calc(100vw - 2rem))";

  const numericSize = Number(dialogSize);
  if (Number.isFinite(numericSize) && numericSize > 0) {
    return `min(${numericSize}rem, calc(100vw - 2rem))`;
  }

  return "min(42rem, calc(100vw - 2rem))";
}

function removeModalOverlay(overlay) {
  if (!(overlay instanceof HTMLElement)) return;
  overlay.remove();
}

export function ensureSmlModalHelpers() {
  return ensureSmlModalRuntime();
}


//--------------------------------------- Outdated or Rarely Used Functions Below ---------------------------------------
/**
 * Creates and displays a custom modal box with configurable content and buttons.
 * - Not a Bootstrap modal; uses custom logic and JML.
 * - Restores focus to a specified element after closing, if provided.
 * - All parameters are optional except body.
 *
 * @export
 * @param {string|Object} body - HTML string or JML for modal body.
 * @param {string} [title="Message from CATS System"] - Modal title.
 * @param {string} [buttonLeftText] - Text for left button.
 * @param {Function} [buttonLeftCall] - Callback for left button.
 * @param {string} [buttonCenterText] - Text for center button.
 * @param {Function} [buttonCenterCall] - Callback for center button.
 * @param {string} [buttonRightText] - Text for right button.
 * @param {Function} [buttonRightCall] - Callback for right button.
 * @param {string} [headerBackgroundColor] - Header background color.
 * @param {string} [modalSize] - Modal size ("large" for wide).
 * @param {boolean} [hideClosingX=false] - Hide the closing X button.
 * @param {HTMLElement} [elem] - Element to focus after modal closes.
 * @param {string} [cloneId] - ID to clone modal from (rarely used).
 * @returns {Promise<HTMLElement>} The modal element.
 * @memberof smlUtils
 */
export async function modalBox(
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
    return smlModalBox(
    body,
    title,
    buttonLeftText,
    buttonLeftCall,
    buttonCenterText,
    buttonCenterCall,
    buttonRightText,
    buttonRightCall,
    headerBackgroundColor,
    modalSize,
    hideClosingX,
    elem,
    cloneId,
    origin
    );
}



export async function isHtml(content){
  if (content instanceof HTMLElement) return true;
  if (typeof content !== "string") return false;
  let elem = document.createElement('template');
  elem.innerHTML = content.trim();
  return elem.content.children.length > 0;
}
