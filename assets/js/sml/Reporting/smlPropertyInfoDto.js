//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
"use strict";
export default class smlPropertyInfoDto {
  constructor(cfg) {
    let propertyInfo = this;
    propertyInfo.helpText="";
    propertyInfo.isKey=false;
    propertyInfo.isRequired=false;
    propertyInfo.isNeeded="";
    propertyInfo.label="";
    propertyInfo.maxLength=-1;
    propertyInfo.name="";
    propertyInfo.sortDirection="";
    propertyInfo.sortOrder=null;
    propertyInfo.tipText="";
    propertyInfo.type="";
    propertyInfo.value="";
    propertyInfo.fkTable="";
    propertyInfo.fkSchema="";
    propertyInfo.fkColumn="";
    propertyInfo.fkRelationship="";
    propertyInfo.formField="";
    if(typeof(cfg)==="string") cfg=JSON.parse(cfg);
    if(!cfg) return;
    Object.assign(propertyInfo,cfg);
  }
  static documentation() {
    return {
      class: "smlPropertyInfoDto",
      namespace: "sml.Reporting.PropertyInfo",
      source: "smlPropertyInfoDto.js",
      description: "Represents reporting property metadata used by SML filters and columns."
    };
  }
}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
