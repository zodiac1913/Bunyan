//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

"use strict";
import smlReportColumn from "./smlReportColumn.js";
import { firstDefined, parseModelConfig } from "./smlReportingModelUtils.js";

export default class smlReportQuery {
  constructor(cfg) {
    this.reset();
    if (cfg) {
      this.hydrate(cfg);
    }
  }

  get requestType() {
    return this._action;
  }

  set requestType(value) {
    this._action = value;
  }

  
  reset() {
    this.id = undefined;
    this.parentId = -1;
    this.parentColumn = "";
    this.tableKey = "";
    this.displayColumns = [];
    this.queryCriteria = [];
    this.queryActions = [];
    this.forms = [];
    // 0 means no limit. Pages that need one set maxTake on their security contract.
    this.take = 0;
    this.skip = 0;
    this.action = "getConfig";
    this.callAction = "getConfig";
    this.searchString = "";
    this.searchFields = [];
    this.additionalFields = [];
    this.formDataJson = "";
    this.overrideKey = "";
    this.tableHasCounts = false;
    this.tableHasPagination = false;
    this.tableHasQuickSearch = true;
  }

  hydrate(cfg) {
    const queryConfig = parseModelConfig(cfg);
    if (!queryConfig) {
      return this;
    }

    const displayColumns = firstDefined(queryConfig.displayColumns, queryConfig.DisplayColumns, []);

    this.id = firstDefined(queryConfig.id, queryConfig.Id, this.id);
    this.parentId = firstDefined(queryConfig.parentId, queryConfig.ParentId, this.parentId);
    this.parentColumn = firstDefined(queryConfig.parentColumn, queryConfig.ParentColumn, this.parentColumn);
    this.tableKey = firstDefined(queryConfig.tableKey, queryConfig.TableKey, this.tableKey);
    this.displayColumns = Array.isArray(displayColumns)
      ? displayColumns.map((col) => new smlReportColumn(col))
      : [];
    this.queryCriteria = firstDefined(queryConfig.queryCriteria, queryConfig.QueryCriteria, []);
    this.queryActions = firstDefined(queryConfig.queryActions, queryConfig.QueryActions, []);
    this.forms = firstDefined(queryConfig.forms, queryConfig.Forms, []);
    this.take = firstDefined(queryConfig.take, queryConfig.Take, this.take);
    this.skip = firstDefined(queryConfig.skip, queryConfig.Skip, this.skip);
    this.action = firstDefined(queryConfig.action, queryConfig.Action, this.action);
    this.callAction = firstDefined(queryConfig.callAction, queryConfig.CallAction, this.action);
    this.searchString = firstDefined(queryConfig.searchString, queryConfig.SearchString, this.searchString);
    this.searchFields = firstDefined(queryConfig.searchFields, queryConfig.SearchFields, []);
    this.additionalFields = firstDefined(queryConfig.additionalFields, queryConfig.AdditionalFields, []);
    this.formDataJson = firstDefined(queryConfig.formDataJson, queryConfig.FormDataJson, this.formDataJson);
    this.overrideKey = firstDefined(queryConfig.overrideKey, queryConfig.OverrideKey, this.overrideKey);
    this.tableHasCounts = Boolean(firstDefined(queryConfig.tableHasCounts, queryConfig.TableHasCounts, this.tableHasCounts));
    this.tableHasPagination = Boolean(firstDefined(queryConfig.tableHasPagination, queryConfig.TableHasPagination, this.tableHasPagination));
    this.tableHasQuickSearch = Boolean(firstDefined(queryConfig.tableHasQuickSearch, queryConfig.TableHasQuickSearch, this.tableHasQuickSearch));

    return this;
  }

  updateConfig(cfg){
    this.reset();
    return this.hydrate(cfg);
  }
  static documentation() {
    return {
      class: "smlReportQuery",
      namespace: "sml.Reporting.Query",
      source: "smlReportQuery.js",
      description: "Represents the server query shape used by SML reporting."
    };
  }
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

