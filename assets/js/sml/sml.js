//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
/* eslint-disable no-undef */
/* eslint-disable no-console */
"use strict";

import { jmlToHtml } from "./smlUtils.js";
import "./smlEngine.js";
import "./Form/smlForm.js";
import "./Table/smlTable.js";
import "./Table/smlTableExport.js";
import "./smlReactiveButton.js";

export default class Sml {
  constructor() {
    this.attachStyles();
  }

  attachStyles() {
    const sml = this;
    const head = document.getElementsByTagName("head")[0];
    if (!document.getElementById("smly-css")) {
      head.insertAdjacentHTML("beforeend", jmlToHtml({
        n: "link", id: "smly-css", rel: "stylesheet", type: "text/css",
        href: new URL("./sml.css", import.meta.url).href, media: "all"
      }));
    }

    if (!document.getElementById("smly-sidebar-css")) {
      head.insertAdjacentHTML("beforeend", jmlToHtml({
        n: "link", id: "smly-sidebar-css", rel: "stylesheet", type: "text/css",
        href: new URL("./Page/smlSidebar.css", import.meta.url).href, media: "all"
      }));
    }

    sml.removeLegacyScripts();
  }

  removeLegacyScripts() {
    document.querySelectorAll("script[src*='jquery']").forEach(script => script.remove());
    document.querySelectorAll("script[src*='CATS.js']").forEach(script => script.remove());
  }

  renderPlaceholder(message) {
    return jmlToHtml({ n: "div", c: "sml-placeholder", t: message });
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  globalThis.host = location.origin;
  globalThis._ = document;
  globalThis.smelly = new Sml();
  smelly.pageWrapper = document.querySelector("#pageContentWrapper");
  globalThis.jQuery = undefined;
  globalThis.$ = undefined;
  if (globalThis.jQuery && typeof globalThis.jQuery.fn === "object") {
    Object.keys(globalThis.jQuery.fn).forEach(fn => delete globalThis.jQuery.fn[fn]);
  }
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^