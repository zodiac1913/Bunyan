//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
/* eslint-disable no-undef */
/* eslint-disable no-console */
"use strict";

import { DOC_SOURCES } from "./smlDocsSources.js";

/**
 * Central lookup for the CATS docs sources.
 */
export default class SmlDocsData {
  /**
   * Returns the namespace metadata for every registered docs source.
   *
   * @returns {Array<object>} Namespace descriptors from each source.
   */
  static getNamespaces() {
    return DOC_SOURCES.map(item => item.source.getNamespace());
  }

  /**
   * Resolves a single class documentation object from the registered sources.
   *
   * @param {string} className The class name to look up.
   * @returns {object|null} The matching doc object, or null when not found.
   */
  static getDoc(className) {
    for (const item of DOC_SOURCES) {
      if (typeof item.source.getDoc === "function") {
        const doc = item.source.getDoc(className);
        if (doc) return doc;
      }
      if (typeof item.source[className] === "function") {
        return item.source[className]();
      }
    }
    return null;
  }

}