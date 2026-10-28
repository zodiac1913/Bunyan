//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
/* eslint-disable no-undef */
/* eslint-disable no-console */
"use strict";

import { jmlToHtml } from "../smlUtils.js";
import SmlDocsData from "./smlDocsData.js";

/**
 * Left-side namespace browser for the docs page.
 */
export default class SmlDocsNamespace extends HTMLElement {
  /**
   * Renders the namespace search box and collapsible class list.
   */
  async connectedCallback() {
    this.render();
    await this.ensureMarkdownComponent();
  }

  /**
   * Ensures the markdown component exists in the same left panel.
   */
  async ensureMarkdownComponent() {
    const panel = this.closest(".smlDocsPanel") || this.parentElement;
    if (!panel) return;
    if (panel.querySelector("sml-docs-markdown")) return;

    try {
      await import("./smlDocsMarkdown.js?v=20260421b");
      const markdown = globalThis.document.createElement("sml-docs-markdown");
      this.insertAdjacentElement("afterend", markdown);
    } catch (error) {
      console.error("Unable to load sml-docs-markdown component:", error);
    }
  }

  /**
   * Builds the namespace browser markup and wires its interactions.
   */
  render() {
    const namespaces = SmlDocsData.getNamespaces();
    this.innerHTML = jmlToHtml({
      n: "div",
      c: "smlDocsNamespaceRoot",
      b: [
        { n: "div", c: "p-2 border-bottom text-center catsDocTitle", t: "Namespaces" },
        { n: "div", c: "fs-6 mb-3 text-start docsSubTitle", t: "Browse the CATS Documentation namespaces, then choose a class." },
            {
              n: "section",
              c: "smlDocsSection mb-2 rounded",
              b: [
                {
                  n: "div",
                  c: "smlDocsSectionToggle btn w-100 text-start d-flex justify-content-between align-items-center",
                  b: [
                    { n: "span", c: "smlDocsSectionName text-White", t: "Quick Links" },
                    { n: "span", c: "smlDocsSectionCount", t: "2" }
                  ]
                },
                {
                  n: "div",
                  c: "smlDocsSectionBody",
                  b: [
                    {
                      n: "button",
                      type: "button",
                      c: "smlDocsClassBtn btn btn-link d-block w-100 text-start text-decoration-none",
                      "data-doc-link": "/smlTableOwnExample.html",
                      b: [{ n: "span", c: "smlDocsClassName", t: "SML Table Own Example" }]
                    },
                    {
                      n: "button",
                      type: "button",
                      c: "smlDocsClassBtn btn btn-link d-block w-100 text-start text-decoration-none",
                      "data-doc-link": "/tzedek/compliance-demo.html",
                      b: [{ n: "span", c: "smlDocsClassName", t: "Tzedek Compliance Demo" }]
                    }
                  ]
                }
              ]
            },
        { c: "mb-3", role: "search", b: [
          { n: "input", i: "smlDocsSearch", c: "form-control smlDocsSearch mb-3", type: "search", placeholder: "Search classes", "aria-label": "Search documentation classes" }
        ] },
        { n: "div", i: "smlDocsNamespaceList", b: namespaces.map(namespace => ({
          n: "section",
          c: "smlDocsSection mb-2 rounded",
          "data-namespace": namespace.namespace,
          b: [
            {
              n: "button",
              type: "button",
              c: "smlDocsSectionToggle btn w-100 text-start d-flex justify-content-between align-items-center",
              "aria-expanded": "false",
              "data-namespace": namespace.namespace,
              b: [
                { n: "span", c: "smlDocsSectionName", t: namespace.name },
                { n: "span", c: "smlDocsSectionCount", t: String(namespace.classes?.length || 0) }
              ]
            },
            {
              n: "div",
              c: "smlDocsSectionBody d-none",
              "data-namespace-body": namespace.namespace,
              b: (namespace.classes || []).map(cls => ({
                n: "button",
                type: "button",
                c: "smlDocsClassBtn btn btn-link d-block w-100 text-start text-decoration-none",
                "data-class": cls.name,
                "data-namespace": namespace.namespace,
                b: [{ n: "span", c: "smlDocsClassName", t: cls.name }]
              }))
            }
          ]
        })) }
      ]
    });

    const search = this.querySelector("#smlDocsSearch");
    const namespaceList = this.querySelector("#smlDocsNamespaceList");

    search?.addEventListener("input", event => this.filter(event.target.value));

    namespaceList?.addEventListener("click", event => {
      const toggle = event.target.closest("button.smlDocsSectionToggle");
      if (toggle) {
        const namespaceName = toggle.dataset.namespace || "";
        const section = this.querySelector(`[data-namespace='${namespaceName}']`);
        const body = section?.querySelector(".smlDocsSectionBody");
        if (!body) return;
        const willOpen = body.classList.contains("d-none");
        const sectionBodies = this.querySelectorAll(".smlDocsSectionBody");
        sectionBodies.forEach(otherBody => {
          if (otherBody !== body) {
            otherBody.classList.add("d-none");
          }
        });
        body.classList.toggle("d-none", !willOpen);
        toggle.setAttribute("aria-expanded", String(willOpen));
        return;
      }

      const button = event.target.closest("button[data-class]");
      if (!button) return;
      globalThis.smlDocsRender?.showClass(button.dataset.class || "");
    });

    this.addEventListener("click", event => {
      const quickLinkButton = event.target.closest("button[data-doc-link]");
      if (!quickLinkButton) return;

      const href = quickLinkButton.dataset.docLink || "";
      if (!href) return;
      globalThis.location.assign(href);
    });
  }

  /**
   * Filters the visible class buttons by search text.
   *
   * @param {string} searchText Text entered into the search box.
   */
  filter(searchText) {
    const query = (searchText || "").trim().toLowerCase();
    const sections = this.querySelectorAll(".smlDocsSection");

    sections.forEach(section => {
      const classButtons = section.querySelectorAll("button[data-class]");
      let hasMatch = false;

      classButtons.forEach(button => {
        const match = !query || button.dataset.class.toLowerCase().includes(query);
        button.classList.toggle("d-none", !match);
        if (match) hasMatch = true;
      });

      section.classList.toggle("d-none", !hasMatch);

      const body = section.querySelector(".smlDocsSectionBody");
      const toggle = section.querySelector(".smlDocsSectionToggle");
      if (body && toggle) {
        if (query === "") {
          body.classList.add("d-none");
          toggle.setAttribute("aria-expanded", "false");
        } else {
          body.classList.toggle("d-none", false);
          toggle.setAttribute("aria-expanded", "true");
        }
      }
    });
  }
}

if (!customElements.get("sml-docs-namespace")) {
  customElements.define("sml-docs-namespace", SmlDocsNamespace);
}
