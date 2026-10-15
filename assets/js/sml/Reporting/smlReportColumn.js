//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
"use strict";
import { camelToTitle, guid, isNumeric } from '../../sml/smlUtils.js';
import { firstDefined, parseModelConfig } from './smlReportingModelUtils.js';

export default class smlReportColumn {
  constructor(cfg) {
    this.reset();
    if (cfg) {
      this.hydrate(cfg);
    }
  }

  reset() {
    this.guid = guid();
    this.ordinal = -1;
    this.fieldName = "";
    this.title = "";
    this.dataType = "";
    this.format = "Text";
    this.sortDirection = "";
    this.sortOrdinal = -1;
  }

  hydrate(cfg) {
    const columnConfig = parseModelConfig(cfg);
    if (!columnConfig) {
      return this;
    }

    const fieldName = firstDefined(columnConfig.fieldName, columnConfig.FieldName, "NoNameGiven");
    const sortOrdinal = firstDefined(columnConfig.sortOrdinal, columnConfig.SortOrdinal);

    this.ordinal = firstDefined(columnConfig.ordinal, columnConfig.Ordinal, this.ordinal);
    this.fieldName = fieldName;
    this.title = firstDefined(
      columnConfig.title,
      columnConfig.Title,
      camelToTitle(fieldName),
      camelToTitle(columnConfig.Name),
      "NoTitleGiven"
    );
    this.dataType = firstDefined(columnConfig.dataType, columnConfig.DataType, columnConfig.type, "String");
    this.format = firstDefined(columnConfig.format, columnConfig.Format, "Text");
    this.sortDirection = firstDefined(columnConfig.sortDirection, columnConfig.SortDirection, "");
    this.sortOrdinal = isNumeric(sortOrdinal) ? sortOrdinal : -1;

    return this;
  }

  fillFromReportColumn(cfg){
    this.reset();
    return this.hydrate(cfg);
  }

  // Guid property
  get Guid() { return this.guid; }
  set Guid(value) { this.guid = value; }

  // Ordinal property
  get Ordinal() { return this.ordinal; }
  set Ordinal(value) { this.ordinal = value || -1; }

  // FieldName property (you already have Name)
  get FieldName() { return this.fieldName; }
  set FieldName(value) { this.fieldName = value || ""; }

  // Title property
  get Title() { return this.title; }
  set Title(value) { this.title = value || ""; }

  // DataType property (you already have Type)
  get DataType() { return this.dataType; }
  set DataType(value) { this.dataType = value || "String"; }

  // Format property
  get Format() { return this.format; }
  set Format(value) { this.format = value || "Text"; }

  // SortDirection property
  get SortDirection() { return this.sortDirection; }
  set SortDirection(value) { this.sortDirection = value || ""; }

  // SortOrdinal property
  get SortOrdinal() { return this.sortOrdinal; }
  set SortOrdinal(value) {
    this.sortOrdinal = (value === null || value === undefined) ? -1 : value;
  }


  static documentation() {
    return {
      class: "smlReportColumn",
      namespace: "sml.Reporting.Column",
      source: "smlReportColumn.js",
      description: "Represents a report column with title, type, format, and sort metadata."
    };
  }
}

