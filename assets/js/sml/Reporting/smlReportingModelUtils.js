"use strict";

export function parseModelConfig(cfg) {
  if (typeof cfg === "string") {
    return JSON.parse(cfg);
  }
  return cfg || null;
}

export function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

export function toModelList(items, ModelType) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item) => new ModelType(item));
}

export function parseListValue(value) {
  if (typeof value === "string") {
    return JSON.parse(value) || [];
  }
  return Array.isArray(value) ? value : [];
}

export function applyRptSecurityToPayload(dataUp, security) {
  if (!dataUp || typeof dataUp !== "object") return dataUp;
  delete dataUp.security;
  if (!security || typeof security !== "object") return dataUp;

  const toSet = (values) => new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim().toLowerCase()).filter(Boolean));
  const allowedFilters = toSet(security.allowedFilterFields);
  const allowedList = toSet(security.allowedListFields);
  const allowedTypes = toSet(security.allowedActionTypes);
  const allowedApis = toSet(security.allowedApis);
  const allowedOps = toSet(security.allowedFilterOperations);
  const allowedRequests = toSet(security.allowedRequestTypes);
  const maxTake = Number.parseInt(String(security.maxTake || ""), 10);

  const keepFilter = (filter) => {
    if (!filter || typeof filter !== "object") return false;
    if (filter.encapsulation === true) {
      filter.innerFilters = (Array.isArray(filter.innerFilters) ? filter.innerFilters : []).filter(keepFilter);
      return filter.innerFilters.length > 0;
    }
    const name = String(filter?.property?.name || filter?.formField?.name || "").trim().toLowerCase();
    if (allowedFilters.size > 0 && !allowedFilters.has(name)) return false;
    const operation = String(filter.operation || "").trim();
    if (allowedOps.size > 0 && operation && !allowedOps.has(operation.toLowerCase())) {
      filter.operation = "Contains";
    }
    return true;
  };

  if (Array.isArray(dataUp.filters)) dataUp.filters = dataUp.filters.filter(keepFilter);
  if (Array.isArray(dataUp.advancedFilters)) dataUp.advancedFilters = dataUp.advancedFilters.filter(keepFilter);

  if (allowedRequests.size > 0) {
    const requestType = String(dataUp.requestType || "").trim().toLowerCase();
    if (!allowedRequests.has(requestType)) {
      dataUp.requestType = "RptReportingSearch";
    }
  }

  dataUp.query = dataUp.query || {};
  if (Number.isFinite(maxTake) && maxTake > 0) {
    const take = Number.parseInt(String(dataUp.query.take || ""), 10);
    if (Number.isFinite(take) && take > 0) dataUp.query.take = Math.min(take, maxTake);
  }

  if (Array.isArray(dataUp.query.displayColumns) && allowedList.size > 0) {
    dataUp.query.displayColumns = dataUp.query.displayColumns.filter((column) => {
      const name = String(column?.fieldName || column?.FieldName || "").trim().toLowerCase();
      return allowedList.has(name);
    });
  }

  if (Array.isArray(dataUp.query.additionalFields) && allowedList.size > 0) {
    dataUp.query.additionalFields = dataUp.query.additionalFields.filter((field) => allowedList.has(String(field || "").trim().toLowerCase()));
  }

  if (Array.isArray(dataUp.query.queryActions) && (allowedTypes.size > 0 || allowedApis.size > 0)) {
    dataUp.query.queryActions = dataUp.query.queryActions.filter((action) => {
      const typeOk = allowedTypes.size < 1 || allowedTypes.has(String(action?.type || "").trim().toLowerCase());
      const api = String(action?.api || "").trim().toLowerCase();
      const apiOk = allowedApis.size < 1 || api.length < 1 || allowedApis.has(api);
      return typeOk && apiOk;
    });
  }

  if (security.modelKey) {
    dataUp.modelKey = security.modelKey;
    dataUp.query.tableKey = security.modelKey;
  }

  return dataUp;
}