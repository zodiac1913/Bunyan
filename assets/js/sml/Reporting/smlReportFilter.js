//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
"use strict";
import { guid } from '../../sml/smlUtils.js';
import smlReportFilterForeignKey from './smlReportFilterForeignKey.js';
export default class smlReportFilter {
  constructor(cfg) {
    let reportFilter = this;
    if(cfg){
      if(typeof(cfg)==="string") cfg=JSON.parse(cfg);
      reportFilter.encapsulation=cfg.encapsulation||false;
      reportFilter.preoperation=cfg.preoperation||"";
      reportFilter.operation=cfg.operation||"Contains";
      if(typeof(cfg.property)==="string"){
        reportFilter.property=cfg.property===""?"":JSON.parse(cfg.property)||"";
      } else{
        reportFilter.property=cfg.property||{};
      }
      reportFilter.value=cfg.value||"";
      reportFilter.formField=cfg.formField;
      reportFilter.preop=cfg.preop||"";
      reportFilter.innerFilters=[];
      if(!cfg.innerFilters) cfg.innerFilters=[];  
      if(cfg.innerFilters !== undefined && cfg.innerFilters.length>0){
        cfg.innerFilters.forEach(function(f){
          reportFilter.innerFilters.push(new smlReportFilter(f));
        });
      }
      reportFilter.fk=cfg.fk?new smlReportFilterForeignKey(cfg.fk):null;
    }
    reportFilter.guid=guid().replaceAll("-","");
  }
  static documentation() {
    return {
      class: "smlReportFilter",
      namespace: "sml.Reporting.Filter",
      source: "smlReportFilter.js",
      description: "Represents a report filter, including nested filters and foreign-key metadata."
    };
  }
}



//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^