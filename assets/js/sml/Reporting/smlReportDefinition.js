//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
"use strict";
import smlReportFilter from './smlReportFilter.js';
import smlReportQuery from './smlReportQuery.js';
import smlReportColumn from './smlReportColumn.js';
import { guid } from '../../sml/smlUtils.js';
import { firstDefined, parseListValue, parseModelConfig, toModelList } from './smlReportingModelUtils.js';

function normalizeQuery(cfg) {
  if (!cfg) {
    return null;
  }

  const existingQuery = firstDefined(cfg.query, cfg.Query);
  if (existingQuery) {
    return existingQuery;
  }

  const columns = firstDefined(cfg.columns, cfg.Columns);
  if (!Array.isArray(columns)) {
    return null;
  }

  return {
    id: firstDefined(cfg.id, cfg.Id),
    parentId: firstDefined(cfg.parentId, cfg.ParentId),
    parentColumn: firstDefined(cfg.parentColumn, cfg.ParentColumn),
    tableKey: firstDefined(cfg.tableKey, cfg.TableKey, cfg.modelKey, cfg.ModelKey, ""),
    displayColumns: columns,
    queryCriteria: firstDefined(cfg.queryCriteria, cfg.QueryCriteria, []),
    queryActions: firstDefined(cfg.actions, cfg.queryActions, cfg.QueryActions, []),
    forms: firstDefined(cfg.forms, cfg.Forms, []),
    take: firstDefined(cfg.take, cfg.Take, 0),
    skip: firstDefined(cfg.skip, cfg.Skip, 0),
    action: firstDefined(cfg.action, cfg.Action, cfg.callAction, cfg.CallAction, "ReportList"),
    callAction: firstDefined(cfg.callAction, cfg.CallAction, cfg.action, cfg.Action, "ReportList"),
    searchString: firstDefined(cfg.searchString, cfg.SearchString, ""),
    searchFields: firstDefined(cfg.searchFields, cfg.SearchFields, []),
    additionalFields: firstDefined(cfg.additionalFields, cfg.AdditionalFields, []),
    overrideKey: firstDefined(cfg.overrideKey, cfg.OverrideKey, ""),
    formDataJson: firstDefined(cfg.formDataJson, cfg.FormDataJson, ""),
    tableHasCounts: firstDefined(cfg.hasCounts, cfg.tableHasCounts, cfg.TableHasCounts, false),
    tableHasPagination: firstDefined(cfg.hasPagination, cfg.tableHasPagination, cfg.TableHasPagination, false),
    tableHasQuickSearch: firstDefined(cfg.hasSearch, cfg.tableHasQuickSearch, cfg.TableHasQuickSearch, true),
    tablePageLengthMenu: firstDefined(cfg.pageLengthMenu, cfg.tablePageLengthMenu, cfg.TablePageLengthMenu, "10,50,100")
  };
}

export default class smlReportDefinition {
  constructor(cfg) {
    this.reset();
    if (cfg) {
      this.hydrate(cfg);
    }
  }

  reset() {
    this.accessModifier = "";
    this.addTimeStamp = new Date();
    this.addUserIdentifier = -1;
    this.addUserName = "";
    this.alias = "";
    this.appIdentifier = -1;
    this.caller = guid().replaceAll("-", "");
    this.columnPropertiesString = undefined;
    this.description = "";
    this.filterPropertiesString = undefined;
    this.filters = [];
    this.advancedFilters = [];
    this.columns = [];
    this.hasCreateAdvancedReportTab = true;
    this.hasReportsTab = false;
    this.isAdvanced = false;
    this.isAutoRun = false;
    this.isDefault = false;
    this.isFavorite = false;
    this.lastUpdateTimeStamp = new Date();
    this.lastUpdateUserIdentifier = -1;
    this.lastUpdateUserName = "";
    this.modelProperties = undefined;
    this.reportIdentifier = -1;
    this.reportName = "";
    this.requestId = guid();
    this.roleAccess = "";
    this.userIdentifier = -1;
    this.quickSearch = "";
    this.requiresRefresh = false;
    this.requiresListRefresh = false;
    this.data = "";
    this.tableConfig = null;
    this.textIdentifier = undefined;
    this.modelKey = undefined;
    this.modelType = undefined;
    this.quickSearchFields = undefined;
    this.sortPropertiesString = undefined;
    this.security = null;
    this.list = [];
    this.query = null;
  }

  hydrate(cfg) {
    const reportConfig = parseModelConfig(cfg);
    if (!reportConfig) {
      return this;
    }

    const rawList = firstDefined(
      reportConfig.list,
      reportConfig.List,
      reportConfig.listData,
      reportConfig.ListData,
      reportConfig.data,
      reportConfig.Data,
      []
    );
    const normalizedQuery = normalizeQuery(reportConfig);
    const columns = firstDefined(reportConfig.columns, reportConfig.Columns, []);
    const filters = firstDefined(reportConfig.filters, reportConfig.Filters, []);
    const advancedFilters = firstDefined(reportConfig.advancedFilters, reportConfig.AdvancedFilters, []);
    const modelProperties = firstDefined(reportConfig.modelProperties, reportConfig.ModelProperties);

    this.accessModifier = firstDefined(reportConfig.accessModifier, reportConfig.AccessModifier, this.accessModifier);
    this.addTimeStamp = firstDefined(reportConfig.addTimeStamp, reportConfig.AddTimeStamp, this.addTimeStamp);
    this.addUserIdentifier = firstDefined(reportConfig.addUserIdentifier, reportConfig.AddUserIdentifier, this.addUserIdentifier);
    this.addUserName = firstDefined(reportConfig.addUserName, reportConfig.AddUserName, this.addUserName);
    this.alias = firstDefined(reportConfig.alias, reportConfig.Alias, this.alias);
    this.appIdentifier = firstDefined(reportConfig.appIdentifier, reportConfig.AppIdentifier, this.appIdentifier);
    this.caller = firstDefined(reportConfig.caller, reportConfig.Caller, this.caller);
    this.columnPropertiesString = firstDefined(reportConfig.columnPropertiesString, reportConfig.ColumnPropertiesString, this.columnPropertiesString);
    this.description = firstDefined(reportConfig.description, reportConfig.Description, this.description);
    this.filterPropertiesString = firstDefined(reportConfig.filterPropertiesString, reportConfig.FilterPropertiesString, this.filterPropertiesString);
    this.hasCreateAdvancedReportTab = firstDefined(reportConfig.hasCreateAdvancedReportTab, reportConfig.HasCreateAdvancedReportTab, this.hasCreateAdvancedReportTab);
    this.hasReportsTab = firstDefined(reportConfig.hasReportsTab, reportConfig.HasReportsTab, this.hasReportsTab);
    this.isAdvanced = firstDefined(reportConfig.isAdvanced, reportConfig.IsAdvanced, this.isAdvanced);
    this.isAutoRun = firstDefined(reportConfig.isAutoRun, reportConfig.IsAutoRun, this.isAutoRun);
    this.isDefault = firstDefined(reportConfig.isDefault, reportConfig.IsDefault, this.isDefault);
    this.isFavorite = firstDefined(reportConfig.isFavorite, reportConfig.IsFavorite, this.isFavorite);
    this.lastUpdateTimeStamp = firstDefined(reportConfig.lastUpdateTimeStamp, reportConfig.LastUpdateTimeStamp, this.lastUpdateTimeStamp);
    this.lastUpdateUserIdentifier = firstDefined(reportConfig.lastUpdateUserIdentifier, reportConfig.LastUpdateUserIdentifier, this.lastUpdateUserIdentifier);
    this.lastUpdateUserName = firstDefined(reportConfig.lastUpdateUserName, reportConfig.LastUpdateUserName, this.lastUpdateUserName);
    this.reportIdentifier = firstDefined(reportConfig.reportIdentifier, reportConfig.ReportIdentifier, this.reportIdentifier);
    this.reportName = firstDefined(reportConfig.reportName, reportConfig.ReportName, this.reportName);
    this.requestId = firstDefined(reportConfig.requestId, reportConfig.RequestId, this.requestId);
    this.roleAccess = firstDefined(reportConfig.roleAccess, reportConfig.RoleAccess, this.roleAccess);
    this.userIdentifier = firstDefined(reportConfig.userIdentifier, reportConfig.UserIdentifier, this.userIdentifier);
    this.quickSearch = firstDefined(reportConfig.quickSearch, reportConfig.QuickSearch, this.quickSearch);
    this.data = firstDefined(reportConfig.data, reportConfig.Data, reportConfig.listData, reportConfig.ListData, this.data);
    this.tableConfig = firstDefined(reportConfig.tableConfig, reportConfig.TableConfig, this.tableConfig);
    this.textIdentifier = firstDefined(reportConfig.textIdentifier, reportConfig.TextIdentifier, this.textIdentifier);
    this.modelKey = firstDefined(reportConfig.modelKey, reportConfig.ModelKey, this.modelKey);
    this.modelType = firstDefined(reportConfig.modelType, reportConfig.ModelType, this.modelType);
    this.quickSearchFields = firstDefined(reportConfig.quickSearchFields, reportConfig.QuickSearchFields, this.quickSearchFields);
    this.sortPropertiesString = firstDefined(reportConfig.sortPropertiesString, reportConfig.SortPropertiesString, this.sortPropertiesString);
    this.security = firstDefined(reportConfig.security, reportConfig.Security, this.security);
    this.query = normalizedQuery ? new smlReportQuery(normalizedQuery) : null;
    this.columns = toModelList(columns, smlReportColumn);
    this.filters = toModelList(filters, smlReportFilter);
    this.advancedFilters = toModelList(advancedFilters, smlReportFilter);
    this.list = parseListValue(rawList);
    this.modelProperties = Array.isArray(modelProperties) && modelProperties.length > 0
      ? this.getDistinctObjectsByName(modelProperties)
      : modelProperties;

    return this;
  }

  fillFromReportDefinition(cfg){
    this.reset();
    return this.hydrate(cfg);
  }
  
  getDistinctObjectsByName(arr) {
    const uniqueObjects = new Map();
    arr.forEach(obj => {
      uniqueObjects.set(obj.name, obj);
    });
    return Array.from(uniqueObjects.values());
  }

  /**
   * Static documentation method for smlReportDefinition class
   * @return {Object} Comprehensive documentation object for smlReportDefinition
   */
  static documentation() {
    return {
      class: "smlReportDefinition",
      namespace: "sml.Reporting.Definition",
      source: "smlReportDefinition.js",
      description: "Represents an SML report definition, including filters, columns, metadata, and query settings."
    };
  }
}


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
