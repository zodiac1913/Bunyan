//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
/* eslint-disable no-undef */
/* eslint-disable no-console */
"use strict";

import SmlDocCatsInfraStructureExtensions from "./Data/smlDocCatsInfraStructureExtensions.js";
import SmlDocSml from "./Data/smlDocsSml.js";

/**
 * Registry of docs sources used by the SML documentation browser.
 */
export const DOC_SOURCES = [
  { namespace: "Cats.Infrastructure.Extensions", source: SmlDocCatsInfraStructureExtensions },
  { namespace: "SML", source: SmlDocSml }
];