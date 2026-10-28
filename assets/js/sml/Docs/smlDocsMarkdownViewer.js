//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
/* eslint-disable no-undef */
/* eslint-disable no-console */
"use strict";

let markdownRuntimePromise = null;

function escapeHtml(value) {
  return (value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = globalThis.document.querySelector(`script[src='${src}']`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed loading ${src}`)), { once: true });
      return;
    }

    const script = globalThis.document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error(`Failed loading ${src}`)), { once: true });
    globalThis.document.head.appendChild(script);
  });
}

async function ensureMarkdownRuntime() {
  if (globalThis.marked && globalThis.DOMPurify) {
    return true;
  }

  if (!markdownRuntimePromise) {
    markdownRuntimePromise = (async () => {
      try {
        await loadScript("/lib/marked/marked.min.js");
      } catch {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/marked/15.0.12/marked.min.js");
      }

      try {
        await loadScript("/lib/dompurify/purify.min.js");
      } catch {
        await loadScript("https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.2.6/purify.min.js");
      }

      return Boolean(globalThis.marked && globalThis.DOMPurify);
    })().catch(() => false);
  }

  return markdownRuntimePromise;
}

/**
 * SML-native markdown content service and renderer.
 */
export default class SmlDocsMarkdownViewer {
  /**
   * Fetch markdown content by repository-relative path.
   *
   * @param {string} markdownPath Path from markdown file list.
   * @returns {Promise<object>} Result with ok/content/fileName/error.
   */
  static async getMarkdownContent(markdownPath) {
    const requestPath = encodeURIComponent(markdownPath || "");
    try {
      const response = await fetch(`/api/Documentation/GetMarkdownContent?path=${requestPath}`, {
        credentials: "include",
        cache: "no-store"
      });

      if (!response.ok) {
        return {
          ok: false,
          error: `Unable to load markdown file: ${markdownPath}`,
          content: "",
          fileName: markdownPath || ""
        };
      }

      const data = await response.json();
      return {
        ok: true,
        content: data?.content || "",
        fileName: data?.fileName || markdownPath || "",
        filePath: data?.filePath || markdownPath || ""
      };
    } catch (error) {
      return {
        ok: false,
        error: `Unable to load markdown file: ${markdownPath}`,
        content: "",
        fileName: markdownPath || "",
        filePath: markdownPath || "",
        exception: error
      };
    }
  }

  /**
   * Render markdown into a container as sanitized HTML, with plain-text fallback.
   *
   * @param {HTMLElement} container Render target.
   * @param {string} markdownText Markdown text.
   */
  static async renderInto(container, markdownText) {
    if (!container) return;

    const hasMarkdownRuntime = await ensureMarkdownRuntime();
    if (hasMarkdownRuntime
      && typeof globalThis.marked?.parse === "function"
      && typeof globalThis.DOMPurify?.sanitize === "function") {
      const rendered = globalThis.marked.parse(markdownText || "", { breaks: true, gfm: true });
      container.innerHTML = globalThis.DOMPurify.sanitize(rendered);
      return;
    }

    container.innerHTML = `<pre class="mb-0"><code>${escapeHtml(markdownText || "")}</code></pre>`;
  }
}
