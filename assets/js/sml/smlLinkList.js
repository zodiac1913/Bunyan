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
 * smlLinkList --- sml Link List module for groups of sml Reactive Button links
 * Public Domain Licensed Copyright Law of the United States of America, Section 105 (https://www.copyright.gov/title17/92chap1.html#105)
 * Et qui me misit, mecum est: non reliquit me solum Pater, quia ego semper quae placita sunt ei, facio!
 * Published by: Dominic Roche of OIT/IUSG/DASM on 9/16/2026
 * @class smlLinkList
 * @extends {HTMLElement}
 */
// תהילתו. לא שלי
import sml from './sml.js';
import './smlReactiveButton.js';
import { apiPostDirect, asBool, clip, guid, jmlToHtml, receiptCheckGood } from './smlUtils.js';
"use strict";

class smlLinkList extends HTMLElement {

  //----------------------Lifecycle

  constructor() {
    super();
    let sll = this;
    sll.data = null;
    sll.links = [];
    sll.loadSerial = 0;
  }

  static observedAttributes = ["data-api", "data-json-data", "data-json", "data-list-class", "data-link-class",
    "data-direction", "data-block", "data-gap", "data-size", "data-variant", "data-justify"];

  /** Classes that decide the stacking, which the component renders rather than the author. */
  static layoutTokens = ["btn-group", "btn-group-vertical", "d-flex", "flex-row", "flex-column"];

  // connect component
  async connectedCallback() {
    let sll = this;
    sll.initializeBaseAttributes();
    await sll.getLinkData();
    sll.buildLinkList();
    sll.wire();
  }

  /**
   * This rebuilds the list when the html tags that feed it are altered
   *
   * @param {*} name name of element tag
   * @param {*} oldValue old value for reference of element tag
   * @param {*} newValue new value of element tag
   * @memberof smlLinkList
   */
  async attributeChangedCallback(name, oldValue, newValue) {
    let sll = this;
    if (oldValue === newValue) return;
    if (!sll.isConnected) return;

    switch (name) {
      case "data-api":
        sll.data = null;
        await sll.getLinkData();
        break;
      case "data-json-data":
      case "data-json":
        sll.data = null;
        await sll.getLinkData();
        break;
      default: //list/link classes only restyle
        break;
    }

    sll.buildLinkList();
    sll.wire();
  }

  //----------------------Lifecycle END

  //----------------------Setup Calls

  initializeBaseAttributes() {
    let sll = this;
    sll.id = sll.id || "SLL" + clip(guid(true), 20);
    if (!sll.title) sll.title = "Related links";
    if (!sll.ariaLabel) sll.ariaLabel = sll.title;
    // Peer-managed active state lives on the inner group, so the host stays presentational.
    if (!sll.hasAttribute("role")) sll.role = "presentation";
  }

  /** Link list config coming from the server, an inline payload, or a page script. */
  get api() {
    let sll = this;
    return (sll.dataset.api || sll.getAttribute("api") || "").trim();
  }

  /** Stacks the links down the page or across it. */
  get direction() {
    let sll = this;
    const direction = String(sll.data?.direction || sll.dataset.direction || "").toLowerCase();
    if (direction) return direction === "horizontal" ? "horizontal" : "vertical";

    // No direction asked for, so honor a layout class the author wrote themselves.
    const authored = sll.authoredTokens();
    if (authored.includes("btn-group") || authored.includes("flex-row")) return "horizontal";
    return "vertical";
  }

  /** Every class the author put on the group, from markup or from the served config. */
  authoredTokens() {
    let sll = this;
    return sll.mergeClasses(sll.data?.className, sll.data?.listClass, sll.dataset.listClass).split(" ").filter(Boolean);
  }

  /**
   * Author classes with the layout tokens removed. The component owns layout so an
   * authored btn-group cannot end up fighting a rendered btn-group-vertical.
   */
  authoredListClass() {
    let sll = this;
    return sll.authoredTokens().filter(token => !smlLinkList.layoutTokens.includes(token)).join(" ");
  }

  /** Makes the group and its links take the full width instead of sizing to their text. */
  get isBlock() {
    let sll = this;
    return asBool(sll.data?.block ?? sll.dataset.block ?? false);
  }

  /** Bootstrap spacing step. Anything 0 to 5 breaks the joined button group into a spaced stack. */
  get gap() {
    let sll = this;
    const gap = Number.parseInt(String(sll.data?.gap ?? sll.dataset.gap ?? ""), 10);
    return Number.isInteger(gap) && gap >= 0 && gap <= 5 ? gap : -1;
  }

  /** Bootstrap button scale: sm or lg. */
  get size() {
    let sll = this;
    const size = String(sll.data?.size || sll.dataset.size || "").toLowerCase();
    return ["sm", "lg"].includes(size) ? size : "";
  }

  /** Bootstrap button style applied to every link, such as outline-dark or primary. */
  get variant() {
    let sll = this;
    return String(sll.data?.variant || sll.dataset.variant || "outline-dark").toLowerCase();
  }

  /** Bootstrap flex distribution: start, end, center, between, around, or evenly. */
  get justify() {
    let sll = this;
    const justify = String(sll.data?.justify || sll.dataset.justify || "").toLowerCase();
    return ["start", "end", "center", "between", "around", "evenly"].includes(justify) ? justify : "";
  }

  /** Classes applied to the group that wraps every link. */
  get listClass() {
    let sll = this;
    return sll.mergeClasses(sll.layoutClass(), sll.authoredListClass());
  }

  /** Classes applied to every sml-reactive-button in the list. */
  get linkClass() {
    let sll = this;
    const fills = sll.direction === "horizontal" && sll.isBlock;
    return sll.mergeClasses(
      "btn",
      "btn-" + sll.variant,
      sll.size ? "btn-" + sll.size : "",
      fills ? "flex-fill" : "",
      sll.data?.buttonClass, sll.data?.linkClass, sll.dataset.linkClass);
  }

  /**
   * A joined Bootstrap button group unless a gap or a distribution was asked for, since
   * button groups collapse their borders together and cannot be spaced apart.
   */
  layoutClass() {
    let sll = this;
    const isVertical = sll.direction === "vertical";
    // Vertical groups have always spanned their sidebar, so they stay full width by default.
    const width = (isVertical || sll.isBlock) ? "w-100" : "";
    const gap = sll.gap;
    const justify = sll.justify;

    if (gap < 0 && !justify) return sll.mergeClasses(isVertical ? "btn-group-vertical" : "btn-group", width);

    return sll.mergeClasses(
      "d-flex",
      isVertical ? "flex-column" : "flex-row",
      gap >= 0 ? "gap-" + gap : "",
      justify ? "justify-content-" + justify : "",
      width);
  }

  /** Prefix used to name links the author did not name. */
  get idPrefix() {
    let sll = this;
    return String(sll.data?.idPrefix || sll.dataset.idPrefix || "").trim();
  }

  mergeClasses(...classNames) {
    const tokens = classNames.flatMap(className => String(className || "").split(/\s+/)).filter(Boolean);
    return [...new Set(tokens)].join(" ");
  }

  /**
   * Names a link. Authors may skip ids entirely and let sml name them, the same
   * way smlReactiveButton names itself when no id is supplied.
   */
  makeLinkId(link, index) {
    let sll = this;
    const authoredId = String(link.id || "").trim();
    if (authoredId) return authoredId;
    if (sll.idPrefix) return sll.idPrefix + "Link" + (index + 1);
    return "SLLB" + clip(guid(true), 20);
  }

  /** Keeps author supplied passthrough attributes to the data/aria surface. */
  linkExtraAttributes(link) {
    const extras = link.attributes;
    if (!extras || typeof extras !== "object" || Array.isArray(extras)) return {};

    return Object.fromEntries(Object.entries(extras).filter(([name, value]) => {
      const attributeName = String(name || "").toLowerCase();
      const isSafe = attributeName.startsWith("data-") || attributeName.startsWith("aria-");
      return isSafe && value !== undefined && value !== null;
    }));
  }

  //----------------------Setup Calls END

  //----------------------Render GUI

  buildLinkList() {
    let sll = this;
    sll.replaceChildren();
    sll.insertAdjacentHTML("beforeend", jmlToHtml(sll.makeLinkGroup()));
  }

  makeLinkGroup() {
    let sll = this;
    const linkClass = sll.linkClass;

    let group = {
      i: String(sll.data?.id || sll.dataset.listId || sll.id + "Group"),
      c: sll.listClass,
      role: "group",
      alab: String(sll.data?.ariaLabel || sll.ariaLabel),
      b: [],
    };

    if (sll.links.length < 1) {
      group.b.push(sll.makeNoLinks());
      return group;
    }

    sll.links.forEach((link, index) => group.b.push(sll.makeLink(link, index, linkClass)));

    return group;
  }

  makeLink(link, index, linkClass) {
    let sll = this;
    const text = String(link.text || "");
    const title = String(link.title || text);
    // List level defaults spare the author from repeating the same value on every link.
    const describedBy = link.ariaDescribedBy || sll.data?.ariaDescribedBy || sll.dataset.describedBy;
    const activeByUrl = link.activeByUrl ?? sll.data?.activeByUrl ?? sll.dataset.activeByUrl;

    return {
      n: "sml-reactive-button",
      i: sll.makeLinkId(link, index),
      type: "button",
      role: "button",
      c: sll.mergeClasses(linkClass, link.className),
      "data-button-type": "link",
      "data-url": String(link.url || ""),
      "data-icon": String(link.icon || ""),
      "data-text": text,
      ttl: title,
      alab: String(link.ariaLabel || title),
      "aria-describedby": describedBy,
      // jmlToHtml drops a boolean false, so an opt out has to travel as text.
      "data-active-by-url": activeByUrl === undefined || activeByUrl === null ? undefined : String(activeByUrl),
      "data-icon-only": asBool(sll.data?.iconOnly ?? sll.dataset.iconOnly ?? false) ? "true" : undefined,
      "data-target": link.target || sll.dataset.target,
      ...sll.linkExtraAttributes(link),
    };
  }

  makeNoLinks() {
    let sll = this;
    return { c: "alert alert-warning py-2 px-3 m-0", role: "alert", t: sll.dataset.emptyText || "No links are available." };
  }

  //----------------------Render GUI END

  //----------------------Wire up

  wire() {
    let sll = this;
    // smlReactiveButton wires its own navigation and url driven active state, so the
    // list only announces that its buttons are in the DOM for anything listening.
    sll.dispatchEvent(new CustomEvent("smlLinkListReady", { bubbles: true, detail: { links: sll.links } }));
  }

  //----------------------Wire up END

  //----------------------Comms

  async getLinkData() {
    let sll = this;
    if (sll.data) {
      sll.links = sll.readLinks(sll.data);
      return;
    }

    const inline = sll.readJson(sll.dataset.jsonData || sll.dataset.json || "");
    if (inline) {
      sll.setData(inline);
      return;
    }

    if (!sll.api) {
      sll.setData({});
      return;
    }

    const loadSerial = ++sll.loadSerial;
    sll.setAttribute("aria-busy", "true");
    const data = await apiPostDirect(sll.api, { data: "linkList", list: sll.dataset.list || "" }, "json");
    if (loadSerial !== sll.loadSerial) return;
    sll.removeAttribute("aria-busy");

    if (!(await receiptCheckGood(data))) {
      console.warn("smlLinkList: Unable to load links from " + sll.api, data?.errorObject || data);
      sll.setData({});
      return;
    }

    sll.setData(data);
  }

  setData(data) {
    let sll = this;
    sll.data = sll.asConfig(data);
    sll.links = sll.readLinks(sll.data);
  }

  asConfig(data) {
    if (Array.isArray(data)) return { links: data };
    return data && typeof data === "object" ? data : {};
  }

  readLinks(data) {
    const links = data?.links || data?.Links;
    if (!Array.isArray(links)) return [];
    return links.filter(link => link && typeof link === "object");
  }

  readJson(rawValue) {
    if (typeof rawValue !== "string" || rawValue.trim().length < 1) return null;

    try {
      return JSON.parse(rawValue);
    } catch (err) {
      console.warn("smlLinkList: Unable to parse data-json-data.", err);
      return null;
    }
  }

  //----------------------Comms End
}

customElements.define("sml-link-list", smlLinkList);

export default smlLinkList;

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
