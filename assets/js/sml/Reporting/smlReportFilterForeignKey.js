//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
"use strict";
export default class smlReportFilterForeignKey {
  constructor(cfg) {
    const filterForeignKey = this;
    filterForeignKey.tableName = "";
    filterForeignKey.schemaName = "";
    filterForeignKey.fkName1 = "";
    filterForeignKey.fkName2 = "";
    filterForeignKey.fkName3 = "";
    filterForeignKey.fkName4 = "";
    filterForeignKey.value1 = "";
    filterForeignKey.value2 = "";
    filterForeignKey.value3 = "";
    filterForeignKey.value4 = "";
    filterForeignKey.overrideSql = "";
    if (typeof cfg === "string") cfg = JSON.parse(cfg);
    if (!cfg) return;
    filterForeignKey.tableName = cfg.tableName || "";
    filterForeignKey.schemaName = cfg.schemaName || "";
    filterForeignKey.fkName1 = cfg.fkName1 || "";
    filterForeignKey.fkName2 = cfg.fkName2 || "";
    filterForeignKey.fkName3 = cfg.fkName3 || "";
    filterForeignKey.fkName4 = cfg.fkName4 || "";
    filterForeignKey.value1 = cfg.value1 || "";
    filterForeignKey.value2 = cfg.value2 || "";
    filterForeignKey.value3 = cfg.value3 || "";
    filterForeignKey.value4 = cfg.value4 || "";
    filterForeignKey.overrideSql = cfg.overrideSql || "";
  }

  static documentation() {
    return {
      class: "smlReportFilterForeignKey",
      namespace: "sml.Reporting.FilterForeignKey",
      source: "smlReportFilterForeignKey.js",
      description: "Represents foreign-key metadata used by a report filter."
    };
  }
}


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^