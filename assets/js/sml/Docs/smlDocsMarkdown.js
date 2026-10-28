//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
/* eslint-disable no-undef */
/* eslint-disable no-console */
"use strict";

import { jmlToHtml } from "../smlUtils.js";

/**
 * Left-side markdown browser displayed below Namespaces.
 */
export default class SmlDocsMarkdown extends HTMLElement {
  static markdownFilesCache = null;

  connectedCallback() {
    this.render();
  }

  async getMarkdownFiles() {
    if (Array.isArray(SmlDocsMarkdown.markdownFilesCache)) {
      return SmlDocsMarkdown.markdownFilesCache;
    }

    try {
      const response = await fetch("/api/Documentation/GetMarkdownFiles", {
        credentials: "include",
        cache: "no-store"
      });

      if (!response.ok) {
        SmlDocsMarkdown.markdownFilesCache = [];
        return SmlDocsMarkdown.markdownFilesCache;
      }

      const files = await response.json();
      if (!Array.isArray(files)) {
        SmlDocsMarkdown.markdownFilesCache = [];
        return SmlDocsMarkdown.markdownFilesCache;
      }

      SmlDocsMarkdown.markdownFilesCache = [...files].sort((a, b) => (a?.path || "").localeCompare(b?.path || ""));
      return SmlDocsMarkdown.markdownFilesCache;
    } catch {
      SmlDocsMarkdown.markdownFilesCache = [];
      return SmlDocsMarkdown.markdownFilesCache;
    }
  }

  async render() {
    const files = await this.getMarkdownFiles();
    const normalizedFiles = files.map(file => ({
      name: file?.name || file?.Name || "Unknown.md",
      path: file?.path || file?.Path || ""
    }));

    this.innerHTML = jmlToHtml({
      n: "div",
      c: "smlDocsMarkdownRoot",
      b: [
        {
          n: "section",
          c: "smlDocsSection mb-2 rounded",
          b: [
            {
              n: "button",
              type: "button",
              c: "smlDocsSectionToggle btn w-100 text-start d-flex justify-content-between align-items-center",
              "aria-expanded": "false",
              i: "smlDocsMarkdownToggle",
              b: [
                { n: "span", c: "smlDocsSectionName", t: "Markdown" },
                { n: "span", c: "smlDocsSectionCount", t: String(normalizedFiles.length) }
              ]
            },
            {
              n: "div",
              c: "smlDocsSectionBody d-none",
              i: "smlDocsMarkdownBody",
              b: [
                {
                  n: "input",
                  i: "smlDocsMarkdownSearch",
                  c: "form-control smlDocsSearch mb-2 mt-2",
                  type: "search",
                  placeholder: "Search markdown files",
                  "aria-label": "Search markdown files"
                },
                {
                  n: "div",
                  i: "smlDocsMarkdownList",
                  b: normalizedFiles.map(file => ({
                    n: "button",
                    type: "button",
                    c: "smlDocsClassBtn btn btn-link d-block w-100 text-start text-decoration-none",
                    "data-markdown-path": file.path,
                    "data-markdown-name": file.name,
                    b: [{ n: "span", c: "smlDocsClassName", t: file.name }]
                  }))
                }
              ]
            }
          ]
        }
      ]
    });

    const toggle = this.querySelector("#smlDocsMarkdownToggle");
    const body = this.querySelector("#smlDocsMarkdownBody");
    const search = this.querySelector("#smlDocsMarkdownSearch");
    const list = this.querySelector("#smlDocsMarkdownList");

    toggle?.addEventListener("click", () => {
      if (!body) return;
      const willOpen = body.classList.contains("d-none");
      body.classList.toggle("d-none", !willOpen);
      toggle.setAttribute("aria-expanded", String(willOpen));
    });

    search?.addEventListener("input", event => {
      this.filter((event?.target?.value || "").trim().toLowerCase());
    });

    list?.addEventListener("click", event => {
      const button = event.target.closest("button[data-markdown-path]");
      if (!button) return;
      const markdownPath = button.dataset.markdownPath || "";
      const markdownName = button.dataset.markdownName || "";
      if (!markdownPath) return;

      const renderHost = globalThis.smlDocsRender || globalThis.document.querySelector("sml-docs-render");
      if (renderHost && typeof renderHost.showMarkdown === "function") {
        renderHost.showMarkdown(markdownPath, markdownName);
        return;
      }

      console.error("sml-docs-render host not available for markdown render");
    });
  }

  filter(query) {
    const buttons = this.querySelectorAll("#smlDocsMarkdownList button[data-markdown-name]");
    buttons.forEach(button => {
      const name = (button.dataset.markdownName || "").toLowerCase();
      const isMatch = !query || name.includes(query);
      button.classList.toggle("d-none", !isMatch);
    });
  }
}

if (!customElements.get("sml-docs-markdown")) {
  customElements.define("sml-docs-markdown", SmlDocsMarkdown);
}
