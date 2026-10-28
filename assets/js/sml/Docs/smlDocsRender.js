//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
/* eslint-disable no-undef */
/* eslint-disable no-console */
"use strict";

import { jmlToHtml, modalBox } from "../smlUtils.js";
import SmlDocsData from "./smlDocsData.js";
import SmlDocsMarkdownViewer from "./smlDocsMarkdownViewer.js";

/**
 * Finds the docs object for a class name across all registered sources.
 *
 * @param {string} className The class name to resolve.
 * @returns {object|null} The matching documentation object, or null.
 */
function findDoc(className) {
  return SmlDocsData.getDoc(className);
}

/**
 * Main documentation renderer for the center pane.
 */
export default class SmlDocsRender extends HTMLElement {
  constructor() {
    super();
    this.currentClassName = "";
  }

  /**
   * Boots the renderer, stores a global handle, and loads the requested view.
   */
  connectedCallback() {
    globalThis.smlDocsRender = this;
    this.renderShell();
    const params = new URLSearchParams(globalThis.location.search);
    let className = params.get("class") || "";
    const methodName = params.get("method") || "";
    if (!className && methodName) {
      className = this.resolveClassForMethod(methodName) || "";
    }
    if (className && methodName) {
      this.showMethod(className, methodName);
    } else if (className) {
      this.showClass(className);
    } else {
      this.showHome();
    }
  }

  resolveClassForMethod(methodName) {
    if (!methodName) return "";

    const fromSharedDocs = this.resolveClassFromSharedDocs(methodName);
    if (fromSharedDocs) return fromSharedDocs;

    return this.resolveClassFromRegistry(methodName);
  }

  resolveClassFromSharedDocs(methodName) {
    if (!methodName) return "";

    // First preference: previous docs context saved in sessionStorage.
    try {
      const shared = globalThis.sessionStorage?.getItem("sharedDocs");
      if (!shared) return "";
      const sharedDoc = JSON.parse(shared);
      const hasMethod = Array.isArray(sharedDoc?.methods)
        && sharedDoc.methods.some(item => item?.name === methodName);
      if (sharedDoc?.class && hasMethod) return sharedDoc.class;
    } catch {
      // Ignore malformed payloads and continue with registry lookup.
    }

    return "";
  }

  resolveClassFromRegistry(methodName) {
    if (!methodName) return "";

    // Fallback: walk registered namespaces/classes and find the first matching method.
    const namespaces = SmlDocsData.getNamespaces() || [];
    for (const namespace of namespaces) {
      for (const cls of (namespace?.classes || [])) {
        const doc = findDoc(cls?.name || "");
        if (!doc || !Array.isArray(doc.methods)) continue;
        const matched = doc.methods.some(item => item?.name === methodName);
        if (matched) return doc.class || cls.name || "";
      }
    }

    return "";
  }

  /**
   * Renders the outer shell used by the documentation detail view.
   */
  renderShell() {
    this.innerHTML = jmlToHtml({
      n: "div",
      c: "smlDocsRenderRoot",
      b: [{ n: "div", i: "smlDocsBody", c: "smlDocsBody" }]
    });
  }

  /**
   * Clears the detail pane and shows the default home state.
   */
  showHome() {
    const body = this.querySelector("#smlDocsBody");
    if (!body) return;
    body.innerHTML = "";
    this.currentClassName = "";
  }

  /**
   * Renders a class documentation page and its method table.
   *
   * @param {string} className The class to render.
   * @param {string} methodName Optional method name to highlight.
   */
  showClass(className) {
    const doc = findDoc(className);
    const body = this.querySelector("#smlDocsBody");
    if (!body) return;
    if (!doc) {
      body.innerHTML = jmlToHtml({ n: "div", c: "alert alert-danger bg-transparent border-danger text-light", t: `No docs found for ${className}.` });
      return;
    }
    this.currentClassName = className;

    const references = Array.isArray(doc.dependencies) && doc.dependencies.length
      ? doc.dependencies
      : [doc.source, doc.sourceUrl, doc.namespace].filter(value => typeof value === "string" && value.trim().length > 0);
    const referenceText = references.length ? [...new Set(references)].join(", ") : "Not specified";

    const methodRows = (doc.methods || []).map(method => ({
      n: "tr",
      b: [
        { n: "td", c: "text-nowrap fw-semibold", b: [{ n: "a", href: `?class=${encodeURIComponent(doc.class)}&method=${encodeURIComponent(method.name)}`, c: "methodsLink smlDocsMethodLink", "data-class": doc.class, "data-method": method.name, t: method.name }] },
        { n: "td", c: "methodWID", t: method.description || "" },
        { n: "td", c: "methodReturn text-nowrap", t: method.returns || "void" }
      ]
    }));

    body.innerHTML = jmlToHtml({
      n: "div",
      c: "smlDocsRenderCard card border-0 bg-transparent",
      b: [
        { n: "div", c: "card-body bg-transparent", b: [
          { n: "div", c: "d-flex justify-content-end", b: [
            { n: "button", type: "button", i: "smlDocsCloseClass", c: "btn btn-danger btn-sm", t: "X", ttl: "Close class details" }
          ]},
          { n: "div", c: "cc-docs-class-div",role:"heading","alvl":"2", t: `${doc.class} Class` },
          { n: "div", c: "fs-6 mb-5 text-start docsSubTitle", t: `Reference: ${referenceText}` },
          { n: "div", c: "text-white mb-3 pt-4 h2 text-start docsSubTitle", t: "Definition" },
          { n: "div", c: "row", b: [
            { n: "div", c: "col-4 docsSubTitle mb-3 pt-4 text-start", t: "Namespace:" },
            { n: "div", c: "col-8 text-danger my-1 pt-4 text-start", b: [{ n: "a", href: doc.namespaceUrl, ttl: doc.namespace, t: doc.namespace }] }
          ]},
          { n: "div", c: "row", b: [
            { n: "div", c: "col-4 docsSubTitle mb-3 pt-4 text-start", t: "Source:" },
            { n: "div", c: "col-8 text-danger mb-3 pt-4 text-start", b: [{ n: "a", href: doc.sourceUrl, target: "_top", ttl: doc.source, t: doc.source }] }
          ]},
          { n: "div", c: "text-white mb-2 fw-bold text-start classDescription", t: doc.description },
          { n: "div", c: "codeHeader d-flex bg-dark text-white p-2", b: [
            { n: "span", c: "language flex-fill", t: doc.tagName ? `<${doc.tagName}>` : `<${doc.class}>` },
            { n: "button", type: "button", c: "btn btn-dark position-relative", t: "Copy" }
          ]},
          { n: "pre", c: "bg-transparent d-flex text-light", b: [
            { n: "code", c: "text-light", b: [
              { n: "span", c: "hljs-keyword text-primary flex-row mx-1", t: doc.inherits || "HTMLElement" },
              { n: "span", c: "hljs-title text-info flex-row mx-1", t: doc.class }
            ]}
          ]},
          { n: "div", c: "text-white mt-3 mb-2 h2 text-start docsSubTitle", t: "Parameters" },
          { n: "div", i: "smlDocsParametersDiv", c: "mt-2 w-100" },
          { n: "div", c: "text-white mt-5 h3 text-start docsSubTitle", t: "Returns" },
          { n: "div", i: "smlDocsReturnsData", c: "text-warning mb-3 h3 text-start", t: "void" },
          { n: "div", i: "smlDocsReturnsDescription", c: "text-warning mb-3 text-start" },
          { n: "div", c: "table-responsive mt-4", b: [
            { n: "table", c: "table table-sm align-middle text-light bg-transparent", b: [
              { n: "caption", c: "visually-hidden", t: `Methods for ${doc.class}. Columns: Method, What it does, Returns.` },
              { n: "thead", b: [
                { n: "tr", b: [
                  { n: "th", c: "methodsHeader","scope":"col",t: "Method" },
                  { n: "th", c: "methodsHeader","scope":"col", t: "What it does" },
                  { n: "th", c: "methodsHeader","scope":"col", t: "Returns" }
                ]}
              ]},
              { n: "tbody", b: methodRows }
            ]}
          ]}
        ]}
      ]
    });

    this.wireClassActions();
  }

  /**
   * Resolves a method view for the requested class and delegates to showClass.
   *
   * @param {string} className The class to render.
   * @param {string} methodName The method to highlight.
   */
  showMethod(className, methodName) {
    const doc = findDoc(className);
    const body = this.querySelector("#smlDocsBody");
    if (!body) return;
    if (!doc) {
      modalBox(`No docs found for ${className}.`, "Error");
      return;
    }

    const method = (doc.methods || []).find(item => item.name === methodName);
    if (!method) {
      modalBox(`No method named ${methodName} found on ${className}.`, "Method not found");
      this.showClass(className);
      return;
    }

    this.currentClassName = className;
    const params = Array.isArray(method.params) ? method.params : [];
    const paramRows = params.length
      ? params.map(param => ({
        n: "tr",
        b: [
          { n: "td", c: "text-nowrap fw-semibold methodWID", t: param.name || "" },
          { n: "td", c: "methodWID", t: param.description || "" }
        ]
      }))
      : [{ n: "tr", b: [{ n: "td", c: "methodWID", colspan: "2", t: "No parameters." }] }];

    body.innerHTML = jmlToHtml({
      n: "div",
      c: "smlDocsRenderCard card border-0 bg-transparent",
      b: [
        { n: "div", c: "card-body bg-transparent", b: [
          { n: "div", c: "d-flex justify-content-end gap-2", b: [
            { n: "button", type: "button", i: "smlDocsCloseMethod", c: "btn btn-warning btn-sm", t: "X", ttl: "Close method details and return to class" },
            { n: "button", type: "button", i: "smlDocsCloseClass", c: "btn btn-danger btn-sm", t: "X", ttl: "Close class details" }
          ]},
          { n: "div", c: "cc-docs-class-div", t: `${doc.class} Method` },
          { n: "div", c: "fs-4 text-start docsSubTitle mb-3", t: method.name },
          { n: "div", c: "text-white fw-bold text-start classDescription mb-3", t: method.description || "No description available." },
          { n: "div", c: "text-white mt-3 mb-2 h3 text-start docsSubTitle", t: "Parameters" },
          { n: "div", c: "table-responsive mt-2", b: [
            { n: "table", c: "table table-sm align-middle text-light bg-transparent", b: [
              { n: "caption", c: "visually-hidden", t: `Parameters for ${method.name} on ${doc.class}. Columns: Name and What it does.` },
              { n: "thead", b: [{ n: "tr", b: [
                { n: "th", c: "methodsHeader","scope":"col", t: "Name" },
                { n: "th", c: "methodsHeader","scope":"col", t: "What it does" }
              ]}]},
              { n: "tbody", b: paramRows }
            ]}
          ]},
          { n: "div", c: "text-white mt-4 mb-2 h3 text-start docsSubTitle", t: "Returns" },
          { n: "div", c: "methodReturn mb-3 text-start", t: method.returns || "void" }
        ]}
      ]
    });

    this.wireMethodActions();
  }

  wireClassActions() {
    const closeClass = this.querySelector("#smlDocsCloseClass");
    closeClass?.addEventListener("click", () => this.showHome());

    const body = this.querySelector("#smlDocsBody");
    body?.querySelectorAll("a[data-method][data-class]").forEach(link => {
      link.addEventListener("click", event => {
        event.preventDefault();
        const className = link.dataset.class || "";
        const methodName = link.dataset.method || "";
        if (!className || !methodName) return;
        this.showMethod(className, methodName);
      });
    });
  }

  wireMethodActions() {
    const closeMethod = this.querySelector("#smlDocsCloseMethod");
    closeMethod?.addEventListener("click", () => {
      if (!this.currentClassName) {
        this.showHome();
        return;
      }
      this.showClass(this.currentClassName);
    });

    const closeClass = this.querySelector("#smlDocsCloseClass");
    closeClass?.addEventListener("click", () => this.showHome());
  }

  /**
   * Renders markdown content in the docs detail pane.
   *
   * @param {string} markdownPath Relative markdown path under content root.
   * @param {string} fileName Display filename.
   */
  async showMarkdown(markdownPath, fileName) {
    const body = this.querySelector("#smlDocsBody");
    if (!body) return;

    try {
      const data = await SmlDocsMarkdownViewer.getMarkdownContent(markdownPath || "");
      if (!data.ok) {
        body.innerHTML = jmlToHtml({
          n: "div",
          c: "alert alert-danger bg-transparent border-danger text-light",
          t: data.error || `Unable to load markdown file: ${fileName || markdownPath}`
        });
        return;
      }

      const content = data?.content || "";
      const displayName = data?.fileName || fileName || markdownPath;
      const displayPath = data?.filePath || markdownPath || "";

      body.innerHTML = jmlToHtml({
        n: "div",
        c: "smlDocsRenderCard card border-0 bg-transparent",
        b: [
          { n: "div", c: "card-body bg-transparent", b: [
            { n: "div", c: "d-flex justify-content-end", b: [
              { n: "button", type: "button", i: "smlDocsCloseMarkdown", c: "btn btn-danger btn-sm", t: "X", ttl: "Close markdown details" }
            ]},
            { n: "h2", c: "cc-docs-class-div", t: "Markdown" },
            { n: "div", c: "fs-4 text-start docsSubTitle mb-3", b: [
              { n: "span", t: displayName },
              { n: "small", c: "text-info font-monospace ms-2", t: `(${String(displayPath || "").replace(/^\//, "")})` }
            ]},
            { n: "div", i: "smlDocsMarkdownContent", c: "markdown-body bg-transparent border border-secondary rounded p-3 text-light text-start" }
          ]}
        ]
      });

      const markdownContainer = this.querySelector("#smlDocsMarkdownContent");
      await SmlDocsMarkdownViewer.renderInto(markdownContainer, content);

      const closeMarkdown = this.querySelector("#smlDocsCloseMarkdown");
      closeMarkdown?.addEventListener("click", () => this.showHome());
    } catch {
      body.innerHTML = jmlToHtml({
        n: "div",
        c: "alert alert-danger bg-transparent border-danger text-light",
        t: `Unable to load markdown file: ${fileName || markdownPath}`
      });
    }
  }
}

if (!customElements.get("sml-docs-render")) {
  customElements.define("sml-docs-render", SmlDocsRender);
}
