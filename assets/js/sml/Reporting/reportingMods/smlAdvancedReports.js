//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

/**
 * Class for Creating, Storing, Recalling, and Running Advanced Reports
 * Public Domain
 * Licensed Copyright Law of the United States of America, Section 105 (https://www.copyright.gov/title17/92chap1.html#105)
 * Per hoc, facies, scietis quod ille miserit me ut facerem universa quae cernitis et factis: Non est mecum!
 * Published by: Dominic Roche of OIT/IUSG/DASM on 03/13/2026
 * @class smlAdvancedReports
 */
"use strict";
import smlReportDefinition from '../smlReportDefinition.js';
import smlReportFilter from '../smlReportFilter.js';
import smlReportColumn from '../smlReportColumn.js';
import { openReportingConfigModal, showReportingMessage } from '../smlReportingShared.js';
import { apiPost, asInt, camelToTitle, guid, jmlToHtml, unobtrusiveWait, unobtrusiveWaitOff } from '/js/global/sml/smlUtils.js';
import {changeOperation,cleanUp,cleanUpEmptyEncapse,cleanUpLeftOpNotNeeded,clearReportsTable
    ,encapsulateLeft,encapsulateRemove,encapsulateRight,editCriteria,editCriteriaSubmit
    ,findLeftFilter,findRightFilter,getFilterAndPathByGuid,getFilterByIndices,getFilterIndex
    ,pushFilterByIndices,removeCriteria,searchAdvReports} 
    from './advancedReports/smlFilterFunctions.js'
import {addColumns,columnSelect,columnMoveSelect,columnSortSelect,makeReportColumns
    ,moveItem,renderColumnsStructure,wireAddColumnTool} 
    from './advancedReports/smlColumnFunctions.js'
export default class smlAdvancedReports {
    constructor(ccr) {
        let smlas = this;
        smlas.api = ccr.api;
        smlas.ccr=ccr;
        smlas.ccrs = ccr.ccrs;
        smlas.reportColumns = []; //records columns used in the add columns system
        smlas.reportBuilder = new smlReportDefinition();
        smlas.guid=guid();

        this.wireFilterFunctions(smlas, ccr);
    }
    
    /**
     * Static documentation method for ccAdvancedReports class
     * @return {Object} Comprehensive documentation object for ccAdvancedReports
     * @static
     * @memberof ccAdvancedReports
     */
    static documentation() {
        return {
            class: "ccAdvancedReports",
            type: "Class",
            namespace: "SML.Reporting.AdvancedReports",
            namespaceUrl: "/js/global/sml/Reporting/reportingMods/smlAdvancedReports.js",
            source: "ccAdvancedReports.js",
            sourceUrl: "/js/global/sml/Reporting/reportingMods/smlAdvancedReports.js",
            description: "The `ccAdvancedReports` class manages the creation, storage, recall, and execution of advanced reports in the CATS system. It provides UI builders, filter and column management, and integrates with supporting modules for report configuration and execution.",
            inherits: null,
            language: "JavaScript",
            attributes: [
                { name: "api", description: "API endpoint for advanced reporting actions.", type: "string" },
                { name: "ccr", description: "Reference to the reporting context/root element.", type: "object" },
                { name: "ccrs", description: "Reference to the reporting system/service.", type: "object" },
                { name: "reportColumns", description: "Array of columns used in the add columns system.", type: "array" },
                { name: "reportBuilder", description: "Instance of ccReport for building reports.", type: "object" },
                { name: "guid", description: "Unique identifier for the advanced report instance.", type: "string" }
            ],
            methods: [
                { name: "constructor", description: "Initializes the ccAdvancedReports instance and wires filter/column functions.", params: [{ name: "ccr", type: "object" }], returns: "ccAdvancedReports" },
                { name: "buildAdvancedReportsTabContent", description: "Builds the advanced search tab content, including header, create report button, and container.", params: [], returns: "Promise<void>" },
                { name: "wireFilterFunctions", description: "Wires filter and column functions to the instance for advanced report management.", params: [{ name: "smlas", type: "object" }, { name: "ccr", type: "object" }], returns: "void" }
            ],
            properties: [
                { name: "api", description: "API endpoint for advanced reporting actions.", type: "string" },
                { name: "ccr", description: "Reporting context/root element.", type: "object" },
                { name: "ccrs", description: "Reporting system/service.", type: "object" },
                { name: "reportColumns", description: "Columns used in the add columns system.", type: "array" },
                { name: "reportBuilder", description: "Instance of ccReport for building reports.", type: "object" },
                { name: "guid", description: "Unique identifier for the advanced report instance.", type: "string" }
            ],
            events: [],
            observedAttributes: [],
            dependencies: [
                "ccReport.js, ccFilter.js, ccColumn.js, ccUtilities.js, filterFunctions.js, columnFunctions.js"
            ],
            exampleUsage: `<cc-advanced-reports id=\"myAdvancedReports\"></cc-advanced-reports>`,
            notes: [
                "Manages advanced report creation, configuration, and execution in the CATS system.",
                "Integrates with filter and column utility modules for dynamic report building.",
                "Provides UI builders and event wiring for advanced reporting workflows."
            ]
        };
    }

    //==============================================BUILDERS===================================================

    /**
     * Build the advanced search Tab innards
     * (including Header Search input, Create Report button, and the Advanced Reports table div container)
     * (The reports are not built here, just the container for them)
     *
     * @memberof ccReporting
     */
    async buildAdvancedReportsTabContent(){
        let smlas=this;
        let reportsContentEle=document.querySelector("#" + smlas.ccr.id + "AdvancedSearchContent");
        let advSearchDiv=document.querySelector("#" + smlas.ccr.id + "AdvancedSearchDiv");
        await smlas.ccr.ccrs.getReports();
        let advSearchTabButton=document.querySelector("#" + smlas.ccr.id + "AdvancedSearchButton");
        //reportsContentEle.innerHTML="";
        let filterRowDivEle=document.querySelector("#" + smlas.ccr.id + "FilterRowDiv");
        let advReportsContainerDivEle=document.querySelector("#" + smlas.ccr.id + "AdvReportsContainerDiv");
        if(!filterRowDivEle){
            let filterRowDiv={n:"div",i: smlas.ccr.id + "FilterRowDiv"
            ,c:"d-flex justify-content-left mb-2",b:[
                {n:"input",i: smlas.ccr.id + "SearchAdvReportsInput"
                    ,i: smlas.ccr.id + "AdvancedSearchInput",type:"text",c:"form-control rounded-pill flex-fill w-75 ps-3"
                    ,ttl: "Search for Advanced Reports",alab: "Search for Advanced Reports",p:"Search"}
                ,{n:"button",i: smlas.ccr.id + "CreateAdvReportButton"
                ,c:"btn btn-success rounded-pill ms-3 shadow shadow-lg shadow-dark",t:"Create Report"
                ,b:[{c:"bi bi-plus-lg float-start fw-bolder me-2"}]}
            ]};
            advSearchDiv.insertAdjacentHTML("beforeend",jmlToHtml(filterRowDiv));
        }
        if(!advReportsContainerDivEle){
            let advReportsContainerDiv={n:"div",i: smlas.ccr.id + "AdvReportsContainerDiv",c:"container-fluid",b:[]};
            advSearchDiv.insertAdjacentHTML("beforeend",jmlToHtml(advReportsContainerDiv));
        }
        let advReportsCurrentReportDivEle=document.querySelector("#" + smlas.ccr.id + "AdvReportsCurrentReportDiv");
        if(!advReportsCurrentReportDivEle){
            let advReportsCurrentReportDiv={n:"div",i: smlas.ccr.id + "AdvReportsCurrentReportDiv"
                ,c:"d-flex","data-events":"setCurrentAdvancedReport,",b:[]};
            advSearchDiv.insertAdjacentHTML("beforeend",jmlToHtml(advReportsCurrentReportDiv));
        }

        if(!advSearchTabButton || smlas.ccr.report.requiresRefresh){
            smlas.ccr.upgradeButtons(advSearchDiv);
            smlas.wireAdvSearchTab();
        }
    }

    /**
     * Builds the list of Advanced Reports to rerun, delete, edit, etc.
     *
     * @memberof ccAdvancedReports
     */
    buildReportsTable() {
        let smlas=this;
        let advReportsContainerDiv = document.querySelector("#" + smlas.ccr.id + "AdvReportsContainerDiv");
        advReportsContainerDiv.innerHTML="";
        let reportsTableDiv = {i: smlas.ccr.id + "ReportsTableDiv", c: "d-flex"
                                //,s:"max-height:350px;overflow-y: auto;"
                                , b: []};
        let reportsTable = { n: "table", i: smlas.ccr.id + "ReportsTable"
                            ,c: "table table-hover table-striped flex-fill", b: [] };
        reportsTable.b.push({n: "caption",s:"caption-side: top;",t:"Advanced Reports Table"});               
        let thead = {n: "thead",s:"position: sticky;top: 0px;background-color: white;z-index: 1024;"
                        ,b: [{n: "tr", 
                            b: [
                                { n: "th",scope:"col",t: "Name" }
                                ,{ n: "th",scope:"col", t: "Description" }
                                ,{ n: "th",scope:"col", t: "Actions" }        
                            ]}
                    ]};
        let tbody = { n: "tbody",i:smlas.ccr.id + "AdvancedReportsTBody",c:"mb-5 pb-5", b: [] };
        reportsTable.b.push(thead);
        reportsTable.b.push(tbody);
        reportsTableDiv.b.push(reportsTable);
        advReportsContainerDiv.insertAdjacentHTML("beforeend", jmlToHtml(reportsTableDiv));
        //add reports
        let advReportsTBody=advReportsContainerDiv.querySelector("#" + smlas.ccr.id + "AdvancedReportsTBody");
        let advancedReports=smlas.ccr.reports.filter(r=>r.isAdvanced===true);
        let arc=advancedReports.length;
        let cb=0;
        for (const rpt of advancedReports) {
            let btnGrpClass=cb=arc?"btn-group dropup ":"btn-group ";
            let tr = {n: "tr",i: smlas.ccr.id + "AdvReportTR" + rpt.reportIdentifier,"data-report-identifier": rpt.reportIdentifier
                        ,"data-description": rpt.description,"data-report-name": rpt.reportName
                        , b: [
                            { n: "td", t: rpt.reportName }
                            ,{ n: "td", t: rpt.description }
                            ,{n: "td", b: [
                                {i: smlas.ccr.id + "AdvReportId" + rpt.reportIdentifier
                                    ,c: btnGrpClass + "bg-transparent",b:[
                                        { n: "button",i: smlas.ccr.id + "AdvReportId" + rpt.reportIdentifier
                                        ,c: "btn btn-light rounded-circle dropdown-toggle-split","data-bs-toggle": "dropdown"
                                        ,"data-id": rpt.reportIdentifier,"data-reference":"parent"
                                        ,"data-report-identifier": rpt.reportIdentifier
                                        ,"data-add-user-identifier": rpt.addUserIdentifier
                                        ,"data-access-modifier": rpt.accessModifier
                                        //,s:"z-index : 99999;"
                                        ,b: [{n: "i", c: "bi bi-three-dots-vertical"}]}
                                        ,{n:"ul",i:"AdvReportId" + rpt.reportIdentifier + "ButtonGroupUl",
                                            c:"dropdown-menu mx-1 p-1 w-100"
                                            //,s:"position:static;"
                                            ,b:[]}
                                    ]}
                            ]}
                    ]};
            advReportsTBody.insertAdjacentHTML("beforeend", jmlToHtml(tr));
            document.querySelector("#" + smlas.ccr.id + "AdvReportTR" + rpt.reportIdentifier).reportData=rpt;
            cb++;
        }
        if(advancedReports.length<1){
            let noReports=
            {n: "tr",i: smlas.ccr.id + "AdvReportTRNA","data-report-identifier": "N/A"
                        ,"data-description": "No Reports Found","data-report-name": "No Reports Ribbon"
                        , b: [
                            { n: "td",colspan:"3", b:[
                                {i:smlas.ccr.id + "NoAdvancedReportsDiv",c:"w-100"
                                    ,b:[
                                        {i: smlas.ccr.id + "NoReports"
                                            ,c:"d-flex justify-content-evenly p-0 m-0"
                                            ,b:[{i: smlas.ccr.id + "NoReportsMessage",c:"fw-bolder ribbon ribbon-sm ribbon-warning",
                                            t:"No Reports Found"}]}
                                ]}
                            ]}
                        ]};
                        advReportsTBody.insertAdjacentHTML("beforeend",jmlToHtml(noReports));
        }

                smlas.ccr.upgradeButtons(advReportsContainerDiv);
        smlas.wireReportsTable();
    }

    /**
     * Generates and Opens the Create Advanced Report tool
     *
     * @memberof ccAdvancedReports
     */
    createReport(){
        let smlas=this;
        let advReportsContainerDiv=document.querySelector("#" + smlas.ccr.id + "AdvReportsContainerDiv");
        let filterRowDiv=document.querySelector("#" + smlas.ccr.id + "FilterRowDiv");
        smlas.reportBuilder.advancedFilters=[];
        filterRowDiv.classList.add("d-none");
        smlas.clearReportsTable();
        advReportsContainerDiv.innerHTML="";
        smlas.resetCurrentAdvancedReportDiv();
        //columns
        let createPane={i: smlas.ccr.id + "CreatePane",c:"container-fluid bg-light p-3",b:[]};
        let paneHeader={c:"row",b:[
                                    {t:"Create Advanced Report",c:"text-center h3"
                                        ,role: "heading",alvl:"2"
                                        ,b:[
                                            {n: "button"
                                            ,i: smlas.ccr.id + "CreateAdvReportCloseButton"
                                            ,role:"button",c:"btn btn-sm btn-secondary float-end"
                                            ,ttl:"Close(Cancel) Create Advanced Report",b:[
                                                {c:"bi bi-x float-start"}]}
                                    ]}
                        ]}
        createPane.b.push(paneHeader);
        //Report Name Input
        let reportNameRow={c:"row",b:[ 
            {c:"col-12",b:[
                {n:"input",i:smlas.ccr.id + "ReportNameInput"
                    ,c:"form-control",ttl:"Name of the Report",alab:"Name of the Report"
                    ,areq:"true",p:"Name of the Report"}
                ,{i:smlas.ccr.id + "ReportNameInputValidation",c:"d-none"}
            ]}
        ]};
        createPane.b.push(reportNameRow);
        let columnsHeader={c:"row h4",role: "heading",alvl:"3",t:"Report Columns"};
        createPane.b.push(columnsHeader);
        let columnsRow={c:"row",b:[
            {c:"col-11 h6",t:"Choose Columns to show on report"}
            ,{i:smlas.ccr.id + "ReportColumnsValidation",c:"d-none"}
            ,{c:"col-1",b:[
                {n: "button",role:"button",c:"btn btn-success btn-sm float-end"
                    ,i: smlas.ccr.id + "AddColumnButton"
                    ,ttl:"Add Column",t:"Add",b:[
                        {c:"bi bi-plus float-start"}
                    ]}
                ]}
        ]};
        createPane.b.push(columnsRow);
        let columnsListDiv={i:smlas.ccr.id + "ColumnsSelectedListDiv",c:"d-flex flex-nowrap flex-justify-center align-items-start shadow shadow-secondary p-2",s: "overflow-x: scroll;min-height:175px;",b:[]};
        let columnsSeparatorRow={c:"row my-3"};
        createPane.b.push(columnsListDiv,columnsSeparatorRow);

        //criteria
        let criteriaHeader={c:"row h4",role: "heading",alvl:"3",t:"Report Criteria"};
        createPane.b.push(criteriaHeader);
        let criteriaRow={c:"row",b:[
            {c:"col-9 h6",t:"Generate Criteria for this report"}
            ,{i:smlas.ccr.id + "ReportCriteriaValidation",c:"d-none"}
            ,{c:"col-3",b:[
                {n: "button",role:"button",c:"btn btn-success btn-sm float-end"
                    ,i: smlas.ccr.id + "AddCriteriaButton",ttl:"Add Criteria",t:"Add",b:[
                        {c:"bi bi-plus float-start"}
                    ]}
                ]}
        ]};
        createPane.b.push(criteriaRow);
        let criteriaListDiv={i:smlas.ccr.id + "CriteriaListDiv"
                                ,c:"p-1 d-flex justify-content-center align-items-start shadow shadow-secondary"
                                ,s: "min-height:100px;",b:[]};
        let criteriaSeparatorRow={c:"row my-3"};
        createPane.b.push(criteriaListDiv,criteriaSeparatorRow);

        createPane.b.push({c:"d-flex flex-row-reverse",b:[
            {n: "button",i:smlas.ccr.id + "SaveReportButton",role:"button",c:"btn btn-success btn-sm me-2",t:"Save Report"},
            {n: "button",i:smlas.ccr.id + "TestRunButton",role:"button",c:"btn btn-primary btn-sm me-2",t:"Test Run"}
        ]})


        advReportsContainerDiv.insertAdjacentHTML("beforeend",jmlToHtml(createPane));
        smlas.ccr.upgradeButtons(advReportsContainerDiv);
        smlas.wireCreateReport();
    }

    showAdvancedReportsLoading(){
        let smlas=this;
        if(smlas.ccr.report.hasCreateAdvancedReportTab){
            let reportsContentEle=document.querySelector("#" + smlas.ccr.id + "AdvancedSearchContent");
            let advReportsContainerDiv=document.querySelector("#" + smlas.ccr.id + "AdvReportsContainerDiv");
            reportsContentEle.classList.add("loading-reports","progress-bar", "bg-info", "progress-bar-striped", "progress-bar-animated");//.setAttribute("class","progress-bar progress-bar-striped progress-bar-animated");
        }
    }

    showAdvancedReportsLoaded(){
        let smlas=this;
        if(smlas.ccr.report.hasCreateAdvancedReportTab){
            let reportsContentEle=document.querySelector("#" + smlas.ccr.id + "AdvancedSearchContent");
            let advReportsTab=document.querySelector("#" + smlas.ccr.id + "AdvancedSearchTab");
            reportsContentEle.className="tab-pane fade p-2";
            let activTab=smlas.ccr.getActiveTab();
            if(activTab.id===smlas.ccr.id + "AdvancedSearchTab"){
                let advRptTab = new bootstrap.Tab(advReportsTab)
                advRptTab.show();
                reportsContentEle.classList.add("show","active");
            }        
            reportsContentEle.style.background="Silver";
        }
    }
    
    async addFilters(editGuid){
        let smlas=this;
        let filterListDiv=document.querySelector("#" + smlas.ccr.id + "CriteriaListDiv");
        smlas.addFilterModal=await openReportingConfigModal({
            id: smlas.ccr.id + "ColumnFilterTool" + (editGuid?"Edit":"Add"),
            "data-guid": editGuid||"",
            dialogSize: "50",
            headerJML: {i: smlas.ccr.id + "FilterAddToolHeaderContainer"
                        ,c:"modal-header justify-content-center bg-lightgrey"
                        ,b: [
                            {t: "Add Filter Tool",i: smlas.ccr.id + "FilterAddToolHeaderContainerHeader"
                            ,role:"heading", alvl:"1"
                            , c: "modal-title fs-4 text-center fw-bold"}
                            ,{n:"button", i: smlas.ccr.id + "Filter" + (editGuid?"Edit":"Add") + "ToolCloseButton"
                            ,c:"btn-close", ttl:"Close Filter Tool", role: "modal"
                            ,"aria-label":"Close"}
                        ]},
            bodyJML: {i: smlas.ccr.id + "FilterAddToolBody"
                        ,c: "modal-body text-start fs-5 bg-lightgrey"
                        ,b: [{i: smlas.ccr.id + "FilterAddToolBodyContainer"}]},
            footerJML: {i: "ModalFooter",c: "modal-footer text-center small p-2 bg-lightgrey"
                        ,b: [{i: smlas.ccr.id + "FilterAddToolFooterContainer"}]}
            ,hasOverlay: true
            ,closeOnBackgroundClick: false
        });        
        let modalBody=document.querySelector("#" + smlas.ccr.id + "FilterAddToolBodyContainer");
        let filterTool={i: smlas.ccr.id + "FilterTool",c:"container-fluid",b:[]};
        let filterHeaderRow={c:"row",b:[
            {c:"col-12 h6",t:"Choose Criteria to filter report"},
        ]};
        filterTool.b.push(filterHeaderRow);
        let rptInfo=smlas.ccr.report;
        if(!rptInfo.filterPropertiesString){
            smlas.ccr.report.filterPropertiesString=smlas.ccr.originalReport.filterPropertiesString;
            rptInfo.filterPropertiesString=smlas.ccr.originalReport.filterPropertiesString;
        } 
        //make filtering
        if(filterListDiv.innerText.length>0){
            let filterListDiv0={c:"d-flex flex-justify-left shadow shadow-secondary",b:[]};
            let filterPreOpRow={c:"form-floating w-100 mb-4",b:[]};
            let preop={n:"select",i:smlas.ccr.id + "FilterPreOpSelect"
                ,ttl: "Select Operation (ie And,Or,etc)",alab: "Select Operation (ie And,Or,etc)"
                ,areq: "true"
                ,c:"form-select",b:[
                {n:"option",t:"",v:""}
                ,{n:"option",t:"And",v:"And"}
                ,{n:"option",t:"Or",v:"Or"}
            ]};
            filterPreOpRow.b.push(preop);
            filterPreOpRow.b.push({n:"label","for":smlas.ccr.id + "FilterPreOpSelect",t:"Select Pre-Operation"});
            filterListDiv0.b.push(filterPreOpRow);
            filterTool.b.push(filterListDiv0);
        }
        let filterListDiv1={c:"d-flex flex-justify-left shadow shadow-secondary",b:[]};
        let filterSeparatorRow={c:"form-floating w-100",b:[]};
        let filterPropSelect={n:"select",i:smlas.ccr.id + "FilterPropertySelect"
                                    ,c:"form-select"
                                    ,ttl: "Select Property",alab: "Select Property"
                                    ,areq: "true"
                                    ,b:[
                                        {n:"option",t:"",v:""}
                                    ]};
        for(const prop of rptInfo.filterPropertiesString.split(',')){
            filterPropSelect.b.push({n:"option",t:prop,v:prop});
        }
        filterSeparatorRow.b.push(filterPropSelect);
        filterSeparatorRow.b.push({n:"label","for":smlas.ccr.id + "FilterPropertySelect",t:"Select Property"})
        filterListDiv1.b.push(filterSeparatorRow);


        let filterListDiv2={c:"d-flex flex-justify-left shadow shadow-secondary",b:[]};
        let filterOperatorRow={c:"form-floating w-100 mt-4",b:[]};
        //make filtering
        let filterOperatorSelect={n:"select",i:smlas.ccr.id + "FilterOperandSelect"
                                    ,c:"form-select"
                                    ,ttl: "Select Operand (ie Contains, Equals,etc)",alab: "Select Operand (ie Contains, Equals,etc)"
                                    ,areq: "true"
                                    ,b:[
                                        {n:"option",t:"",v:""}
                                        ,{n:"option",t:"Contains",v:"Contains"}
                                        ,{n:"option",t:"Equals",v:"Equals"}
                                        ,{n:"option",t:"GreaterThan",v:"GreaterThan"}
                                        ,{n:"option",t:"GreaterThanOrEqual",v:"GreaterThanOrEqual"}
                                        ,{n:"option",t:"LessThanOrEqual",v:"LessThanOrEqual"}
                                        ,{n:"option",t:"NotContains",v:"NotContains"}
                                        ,{n:"option",t:"NotEquals",v:"NotEquals"}
                                        ,{n:"option",t:"StartsWith",v:"StartsWith"}
                                        ,{n:"option",t:"NotStartsWith",v:"NotStartsWith"}
                                        ,{n:"option",t:"EndsWith",v:"EndsWith"}
                                        ,{n:"option",t:"NotEndsWith",v:"NotEndsWith"}
                                        
                                    ]};
        filterOperatorRow.b.push(filterOperatorSelect);
        filterOperatorRow.b.push({n:"label","for":smlas.ccr.id + "FilterOperandSelect",t:"Select Operation"})
        filterListDiv2.b.push(filterOperatorRow);


        let filterListDiv3={c:"d-flex flex-justify-left shadow shadow-secondary",b:[]};
        let filterValueRow={c:"form-floating w-100 mt-4",b:[]};
        let filterValueInput={n:"input",type:"text",i:smlas.ccr.id + "FilterValueInput"
                                    ,c:"form-control",ttl: "Value to compare with"
                                    ,alab: "Value to compare with"
                                    ,areq: "true"};
        filterValueRow.b.push(filterValueInput);
        filterValueRow.b.push({n:"label","for":smlas.ccr.id + "FilterValueInput",t:"Give Value"})
        filterListDiv3.b.push(filterValueRow);
                            

        let filterListDiv4={c:"d-flex flex-justify-left shadow shadow-secondary",b:[]};
        let filterCheckAndOutRow={c:"mt-4 form-check",b:[]};
        filterCheckAndOutRow.b.push({n:"input",type:"checkbox"
                                        ,i:smlas.ccr.id + "FilterEncapsulateCheck"
                                        ,c:"form-check-input",ttl:"Encapsulate this filter"
                                        ,ttl: "Encapsulate this criteria [ie (x=7) instead of x=7]"
                                        ,alab: "Encapsulate this criteria [ie (x=7) instead of x=7]"
                                        //,"checked":"checked"
                                    });
        filterCheckAndOutRow.b.push({n:"label","for":smlas.ccr.id + "FilterEncapsulateCheck"
                                        ,t:"Encapsulate",c:"form-check-label me-5"
                                        ,ttl:"This wil encapsulate this filter in parenthesis.  You will be able to move them"});
                
        filterCheckAndOutRow.b.push({n:"button",type:"button"
                                        ,i:smlas.ccr.id + "FilterAddButton"
                                        ,c:"btn btn-success ms-5",ttl:"Add this to the query"
                                        ,t:"Add"});
        filterListDiv4.b.push(filterCheckAndOutRow);

        filterTool.b.push(filterListDiv1);
        filterTool.b.push(filterListDiv2);
        filterTool.b.push(filterListDiv3);
        filterTool.b.push(filterListDiv4);
        
        modalBody.insertAdjacentHTML("beforeend",jmlToHtml(filterTool));
        await smlas.wireAddFilterTool(editGuid);
    }

    /**
     * Builds the display/editor for displaying and altering the Report query
     *
     * @memberof ccAdvancedReports
     */
    renderFilters(advancedFilters){
        let smlas=this;
        let filterListDiv=document.querySelector("#" + smlas.ccr.id + "CriteriaListDiv");
        for(const filter of advancedFilters){
            if(filter.encapsulation){
                let primeEncapFilter=smlas.renderEncapsulatedFilter(filter);
                filterListDiv.insertAdjacentHTML("beforeend",jmlToHtml(primeEncapFilter));
            }else{
                let filterEle=smlas.renderNonEncapsulatedFilter(filter);                 
                filterListDiv.insertAdjacentHTML("beforeend",jmlToHtml(filterEle));
            }
        }
        smlas.wireFilterActions(filterListDiv);
    }

    renderEncapsulatedFilter(filter){
        let smlas=this;
        let encapseEle={i:smlas.ccr.id + "FilterDivEncapsulate"
         + (filter.property?.Name||filter?.innerFilters[0]?.property?.Name
            ||(filter?.preop + filter?.guid)||"Unknown")
         ,"data-property":filter.property?.Name||""
         ,"data-operator":filter.operation||""
         ,"data-value":filter.value||""
         ,c:"d-flex bg-transparent text-dark p-1 border-bottom border-2 border-dark flex-wrap"
         ,"data-guid": filter.guid
         ,b:[]};

         //Prefix And/Or/etc if there is an operator
        if(filter.preop) encapseEle.b.push(smlas.makeOperandButtonGroup(filter));
        encapseEle.b.push(smlas.makeEncapsulateControl(filter,"open"));
        if(!filter.encapsulation){
            encapseEle.b.push({i:smlas.ccr.id + "FilterDivName" + filter?.property?.Name||filter?.preop||"",c:"me-1 pt-2",t:filter?.property?.Name||""});
            encapseEle.b.push({i:smlas.ccr.id + "FilterDivOperator" + filter?.property?.Name||filter?.preop||"",c:"mx-1 pt-2",t:filter?.operation||""});
            encapseEle.b.push({i:smlas.ccr.id + "FilterDivValue" + filter?.property?.Name||filter?.preop||"",c:"pt-2",t:filter?.value||""});
        }
        for(const innerFilter of filter.innerFilters){
            if(innerFilter.encapsulation){
                let primeEncapFilter=smlas.renderEncapsulatedFilter(innerFilter);
                encapseEle.b.push(primeEncapFilter);
            }else{
                let innardsEle=smlas.renderNonEncapsulatedFilter(innerFilter);
                encapseEle.b.push(innardsEle);                  
            }
        }
        encapseEle.b.push(smlas.makeEncapsulateControl(filter,"close"));
        return encapseEle;
    }

    renderNonEncapsulatedFilter(filter){
        let smlas=this;
        let filterEle={i:smlas.ccr.id + "FilterDiv" + (filter.property?.Name||filter.innerFilters[0].property.Name)
        ,c:"d-flex bg-transparent text-dark p-1 border-bottom border-2 border-dark filterdiv"
           
        ,"data-property":filter.property?.Name||""
        ,"data-operator":filter.operation
        ,"data-value":filter.value
        ,"data-guid": filter.guid
        ,b:[]};
        if(filter.preop) filterEle.b.push(smlas.makeOperandButtonGroup(filter));
        filterEle.b.push(smlas.makeNonEncapsulatedControlButton(filter,"open"));
        filterEle.b.push({i:smlas.ccr.id + "FilterDivName" + filter.property.Name,c:"me-1 pt-2",t:filter.property.Name});
        filterEle.b.push({i:smlas.ccr.id + "FilterDivOperator" + filter.property.Name,c:"mx-1 pt-2",t:filter.operation});
        filterEle.b.push({i:smlas.ccr.id + "FilterDivValue" + filter.property.Name,c:"pt-2",t:filter.value});
        if(filter.innerFilters){
            for(const innerFilter of filter.innerFilters){
                if(innerFilter.encapsulation){
                    let primeEncapFilter=smlas.renderEncapsulatedFilter(innerFilter);
                    filterEle.b.push(primeEncapFilter);
                }else{
                    let innardsEle=smlas.renderNonEncapsulatedFilter(innerFilter);
                    filterEle.b.push(innardsEle);                  
                }
            }
        }
        filterEle.b.push(smlas.makeNonEncapsulatedControlButton(filter,"close"));
        return filterEle;
    }

    makeOperandButtonGroup(filter){
        let smlas=this;
        let filterPreopButtonGroup={n:"div",i: smlas.ccr.id + "FilterDivPreOp" 
                            + filter.preop + smlas.guid.replaceAll("-","") + "BtnGroup",
                            c:"btn-group d-flex",b:[]}; 
        let filterPreop={n:"button", type:"button"
            ,i: smlas.ccr.id + "FilterDivPreOp" + filter.preop + smlas.guid.replaceAll("-","")
            ,c:"mx-2 btn btn-primary operandcontrol"
            ,"data-bs-toggle": "dropdown"
            ,s:"text-shadow: 2px 2px 5px navy;"
            ,"data-guid": filter.guid
            ,t: filter.preop};
        filterPreopButtonGroup.b.push(filterPreop);
        let btnGroupUl={n:"ul",i:smlas.ccr.id + "FilterDivPreOp" 
        + filter.preop + smlas.guid.replaceAll("-","") + "ButtonGroupUl",
                        c:"dropdown-menu mx-1 p-1 alert alert-secondary w-100",b:[]};
        btnGroupUl.b.push({n:"li",i:smlas.ccr.id + "FilterDivPreOp" 
        + filter.preop + smlas.guid.replaceAll("-","") + "LiAND",b:[
            {n:"button",type:"button",c:"btn btn-secondary btn-sm w-100 opselectbutton",i:smlas.ccr.id + "FilterDivPreOp" 
            + filter.preop + smlas.guid.replaceAll("-","") + "AND",t:"And"
            ,ttl:"Make this operand And"}
        ]});
        btnGroupUl.b.push({n:"li",i:smlas.ccr.id + "FilterDivPreOp" 
        + filter.preop + smlas.guid.replaceAll("-","") + "LiAND",b:[
            {n:"button",type:"button"
            ,c:"btn btn-secondary btn-sm w-100 opselectbutton",i:smlas.ccr.id + "FilterDivPreOp" 
            + filter.preop + smlas.guid.replaceAll("-","") + "OR",t:"Or"
            ,ttl:"Make this operand Or"}
        ]});
        filterPreopButtonGroup.b.push(btnGroupUl);
        return filterPreopButtonGroup;
    }

    makeEncapsulateControl(filter,type){
        let smlas=this;
        let jmlObject={};
        if(type==="open"){
            if(filter.encapsulation || filter?.innerFilters?.find(i=>true)?.encapsulation){
                jmlObject=smlas.makeEncapsulateControlButton(filter,type);
            }else{
                jmlObject=smlas.makeNonEncapsulatedControlButton(filter,type);
            }
        }else{ //close
            if(filter.encapsulation){
                jmlObject=smlas.makeEncapsulateControlButton(filter,type);
            }else{
                jmlObject=smlas.makeNonEncapsulatedControlButton(filter,type);
            }
        }
        return jmlObject;
    }

    makeEncapsulateControlButton(filter,type){
        let smlas=this;
        let leftRight=type==="open"?"left":"right";
        let idGeneric= smlas.ccr.id + "FilterDivEncapsulate" 
            + leftRight + (filter.property?.Name
                ||filter?.innerFilters[0]?.property?.Name||filter?.guid);
        let btnGroup={n:"div",i:idGeneric + "ButtonGroup",c:"btn-group bg-info",b:[]};
        let dataLeftRightParen=type==="open"?"data-left-paren":"data-right-paren";
        let buttonIcon=type==="open"?"&#xFF08;":"&#xFF09;";
        let btnDrop={n:"button",type:"button"
            ,i: idGeneric + "Drop","data-bs-toggle": "dropdown"
            ,c:"mx-1 btn btn-light border border-2 border-dark p-1 parencontrol"
            ,s:"text-shadow: 2px 2px 5px black;"
            ,"data-guid": filter.guid
            ,t:buttonIcon};
        btnDrop[dataLeftRightParen]=true;
        btnGroup.b.push(btnDrop);
        let btnGroupUl={n:"ul",i:idGeneric + "ButtonGroupUl",
                        c:"dropdown-menu mx-1 p-1 alert alert-secondary w-100",b:[]};
        btnGroupUl.b.push({n:"li",i:idGeneric + "LiEncapsulateLeft",b:[
            {n:"button",type:"button",c:"btn btn-secondary btn-sm w-100 encapleft",i:idGeneric + "EncapsulateLeft",t:"Encapsulate Left",ttl:"Grab the left criteria and encapsulate it with this one"}
        ]});
        btnGroupUl.b.push({n:"li",i:idGeneric + "LiEncapsulateRight",b:[
            {n:"button",type:"button",c:"btn btn-secondary btn-sm w-100 encapright",i:idGeneric + "EncapsulateRight",t:"Encapsulate Right",ttl:"Grab the right criteria and encapsulate it with this one"}
        ]});
        btnGroupUl.b.push({n:"li",i:idGeneric + "Li",b:[
            {n:"button",type:"button",c:"btn btn-secondary btn-sm w-100 encapremove",i:idGeneric + "RemoveEncapsulation",t:"Remove Encapsulation",ttl:"Remove Encapsulation(Pulls out all criteria)"}
        ]});
        btnGroup.b.push(btnGroupUl);
        return btnGroup;
    }


    makeNonEncapsulatedControlButton(filter,type){
        let smlas=this;
        let leftRight=type==="open"?"left":"right";
        let icon="&#x22C5;";
        let idGeneric= smlas.ccr.id + "FilterDivNonEncapsulate" + leftRight + (filter.property?.Name||filter.innerFilters[0].property.Name);
        let btnGroup={n:"div",i:idGeneric + "ButtonGroup",c:"btn-group bg-info",b:[]};
        let dataLeftRightParen=type==="open"?"data-left-dot":"data-right-dot";
        let btnDrop={n:"button",type:"button"
            ,i: idGeneric + "Drop","data-bs-toggle": "dropdown"
            ,c:"mx-1 btn btn-light border border-2 border-dark p-1"
            ,s:"text-shadow: 2px 2px 5px black;"
            ,t: icon};
        btnDrop[dataLeftRightParen]="true";
        btnGroup.b.push(btnDrop);
        let btnGroupUl={n:"ul",i:idGeneric + "ButtonGroupUl"
                        //,s: "min-width: 150px;"
                        ,c:"dropdown-menu mx-1 p-1 alert alert-info",b:[]};
        // btnGroupUl.b.push({n:"li",i:idGeneric + "LiEncapsulateLeft",b:[
        //     {n:"button",type:"button",c:"btn btn-info btn-sm w-100",i:idGeneric + "EncapsulateLeft"
        //         ,t:"Encapsulate Left",ttl:"Grab the left criteria and encapsulate it with this one"}
        // ]});
        // btnGroupUl.b.push({n:"li",i:idGeneric + "LiEncapsulateRight",b:[
        //     {n:"button",type:"button",c:"btn btn-info btn-sm w-100",i:idGeneric + "EncapsulateRight"
        //         ,t:"Encapsulate Right",ttl:"Grab the right criteria and encapsulate it with this one"}
        // ]});
        btnGroupUl.b.push({n:"li",i:idGeneric + "LiEdit",b:[
            {n:"button",type:"button",c:"btn btn-info btn-sm w-100 criteriaEdit",i:idGeneric + "EditCriteria"
                ,t:"Edit Criteria",ttl:"Edit this Criteria",alab:"Edit this Criteria"}
        ]});
        btnGroupUl.b.push({n:"li",i:idGeneric + "Li",b:[
            {n:"button",type:"button",c:"btn btn-danger text-light btn-sm w-100 criteriaRemove",i:idGeneric + "RemoveCriteria"
                ,t:"Remove Criteria",ttl:"Remove this Criteria item.",alab:"Remove this Criteria item."}
        ]});

        btnGroup.b.push(btnGroupUl);
        return btnGroup;
    }




    //==============================================BUILDERS END===============================================

    //==============================================WIRES======================================================
    
    /**
     * Wires functions to the Advanced Reports Search. Searches for reports in the report list
     *
     * @memberof ccAdvancedReports
     */
    wireAdvSearchTab(){
        let smlas=this;
        let searchInput=document.querySelector("#" + smlas.ccr.id + "AdvancedSearchInput");
        let createButton=document.querySelector("#" + smlas.ccr.id + "CreateAdvReportButton");
        searchInput.addEventListener("keyup", ()=> { smlas.searchAdvReports() });
        createButton.addEventListener("click", ()=> { smlas.createReport() });
    }


    wireReportsTable(){
        let smlas=this;
        let advReportsTBody=document.querySelector("#" + smlas.ccr.id + "AdvancedReportsTBody");
        let tableButtons=advReportsTBody.querySelectorAll("button, sml-reactive-button");
        tableButtons.forEach((button)=>button.addEventListener("click",async (event)=>{
            smlas.advancedReportButtonsBuild(event);
        }));
    }

    /**
     * Wires functions to the Create Report Tool
     *
     * @memberof ccAdvancedReports
     */
    async wireCreateReport(){
        let smlas=this;
        let createAdvReportCloseButton=document.querySelector("#" + smlas.ccr.id + "CreateAdvReportCloseButton");
        let addColumnButton=document.querySelector("#" + smlas.ccr.id + "AddColumnButton");
        let addCriteriaButton=document.querySelector("#" + smlas.ccr.id + "AddCriteriaButton");
        let testRunButton=document.querySelector("#" + smlas.ccr.id + "TestRunButton");
        let saveReportButton=document.querySelector("#" + smlas.ccr.id + "SaveReportButton");
        createAdvReportCloseButton.addEventListener("click", async ()=> { 
            smlas.clearReportsTable();
            if(smlas.ccr.report.hasCreateAdvancedReportTab){
                await smlas.buildAdvancedReportsTabContent(); 
                smlas.buildReportsTable();
            }
            let filterRowDiv=document.querySelector("#" + smlas.ccr.id + "FilterRowDiv");
            filterRowDiv.classList.remove("d-none");
        });

        addColumnButton.addEventListener("click", async ()=> {
            smlas.addColumns();
        })


        addCriteriaButton.addEventListener("click", async ()=> {
            smlas.addFilters();
        })

        testRunButton.addEventListener("click", async ()=> {
            smlas.testOrSaveAdvancedReport();
        })

        saveReportButton.addEventListener("click", async ()=> {
            await smlas.testOrSaveAdvancedReport(true);
        });
        
        //TEST BUTTONS!!! NOT FOR PROD
        // let test1Btn=document.querySelector("#" + smlas.ccr.id + "Test1");
        // let test2Btn=document.querySelector("#" + smlas.ccr.id + "Test2");
        // test1Btn.addEventListener("click", async ()=> {
        //     CCXOReportingSystem.smlas.reportBuilder.filters=smlas.reportBuilder.filters;
        //     CCXOReportingSystem.smlas.reportBuilder.advancedFilters=[...CCXOReportingSystem.smlas.reportBuilder.advancedFilters,...[{"guid":"7d00ac67-f640-e563-76e4-9c87711dbb97","encapsulation":true,"innerFilters":[{"encapsulation":false,"preoperation":"","operation":"Contains","property":{"name":"Office","helpText":"The Office name of this official","isKey":false,"isRequired":false,"isNeeded":true,"label":"Office","maxLength":-1,"Name":"Office","sortDirection":null,"sortOrder":0,"tipText":"The Office name of this official","type":"System.String","value":null,"PropertyType":"System.String, mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089","Type":"String","fkTable":null,"fkSchema":null,"fkColumn":null,"fkRelationship":null,"formField":null},"value":"/CM","preop":"","innerFilters":[],"guid":"ce9e8d9b-adbd-6af7-1848-d9d037198bf8"}]},{"guid":"d9e6500d-46d6-3942-17d3-283a67118baf","encapsulation":false,"preop":"And","property":{"name":"PublishedPhone","helpText":"Phone number of this official","isKey":false,"isRequired":true,"isNeeded":true,"label":"Published Phone","maxLength":-1,"Name":"PublishedPhone","sortDirection":"","sortOrder":0,"tipText":"Phone number of this official","type":"System.String","value":null,"PropertyType":"System.String, mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089","Type":"String","fkTable":null,"fkSchema":null,"fkColumn":null,"fkRelationship":null,"formField":null},"operation":"Contains","value":"786"}]];
        //     let filterListDiv=document.querySelector("#" + smlas.ccr.id + "CriteriaListDiv");
        //     filterListDiv.innerHTML="";    
        //     await smlas.renderFilters(smlas.reportBuilder.advancedFilters);
    
        // })

        

        
        // test2Btn.addEventListener("click", async ()=> {
        //     CCXOReportingSystem.smlas.reportBuilder.filters=smlas.reportBuilder.filters;
        //     CCXOReportingSystem.smlas.reportBuilder.advancedFilters=[...CCXOReportingSystem.smlas.reportBuilder.advancedFilters,...[{"encapsulation":true,"preoperation":"","operation":"","property":null,"value":"","preop":"","innerFilters":[{"encapsulation":false,"preoperation":"","operation":"Contains","property":{"name":"Office","helpText":"The Office name of this official","isKey":false,"isRequired":false,"isNeeded":true,"label":"Office","maxLength":-1,"Name":"Office","sortDirection":null,"sortOrder":0,"tipText":"The Office name of this official","type":"System.String","value":null,"PropertyType":"System.String, mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089","Type":"String","fkTable":null,"fkSchema":null,"fkColumn":null,"fkRelationship":null,"formField":null},"value":"/CM","preop":"","innerFilters":[],"guid":"ce9e8d9b-adbd-6af7-1848-d9d037198bf8"},{"guid":"d9e6500d-46d6-3942-17d3-283a67118baf","encapsulation":false,"preop":"And","property":{"name":"Office","helpText":"The Office name of this official","isKey":false,"isRequired":false,"isNeeded":true,"label":"Office","maxLength":-1,"Name":"Office","sortDirection":"","sortOrder":0,"tipText":"The Office name of this official","type":"System.String","value":null,"PropertyType":"System.String, mscorlib, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089","Type":"String","fkTable":null,"fkSchema":null,"fkColumn":null,"fkRelationship":null,"formField":null},"operation":"Equals","value":"CMS/OIT"}],"guid":"12754663-6ec8-82f7-39e4-cd9fe0cdf088"}]];
        //     let filterListDiv=document.querySelector("#" + smlas.ccr.id + "CriteriaListDiv");
        //     filterListDiv.innerHTML="";    
        //     await smlas.renderFilters(smlas.reportBuilder.advancedFilters);
        //     })


    }



    wireAddFilterTool(editGuid){
        let smlas=this;
        let closeButton=document.querySelector("#" + smlas.ccr.id + "Filter" + (editGuid?"Edit":"Add") + "ToolCloseButton");
        let modalCloseButton=document.querySelector("#" + smlas.ccr.id + "ColumnFilterTool" + (editGuid?"Edit":"Add"));
        closeButton.addEventListener("click", async ()=> {
			smlas.addFilterModal.closeForConfig();
        });
        let addFilterButton=document.querySelector("#" + smlas.ccr.id + "FilterAddButton");
        if(!editGuid){ //For Adding new only
            addFilterButton.addEventListener("click",async ()=>{
                let filterPreOp=document.querySelector("#" + smlas.ccr.id + "FilterPreOpSelect").value;
                let filterProperty=document.querySelector("#" + smlas.ccr.id + "FilterPropertySelect").value;
                let filterOperator=document.querySelector("#" + smlas.ccr.id + "FilterOperandSelect").value;
                let filterValue=document.querySelector("#" + smlas.ccr.id + "FilterValueInput").value;
                let filterEncapsulate=document.querySelector("#" + smlas.ccr.id + "FilterEncapsulateCheck").checked;
                let prop=smlas.ccr.report.modelProperties.find(p=>p.name===filterProperty);
                let filter= new smlReportFilter();
                filter.encapsulation=filterEncapsulate;
                if(filter.encapsulation){
                    filter.preop=filterPreOp;
                    filter.innerFilters=[
                        new smlReportFilter({//"preop": filterPreOp
                            "property": prop
                            ,"operation":filterOperator,"value":filterValue})];
                }else{
                    filter.preop=filterPreOp;
                    filter.property=prop;  
                    filter.operation=filterOperator;
                    filter.value=filterValue;
                }        
                
                smlas.reportBuilder.advancedFilters.push(filter);
                smlas.addFilterModal.closeForConfig();
                let filterListDiv=document.querySelector("#" + smlas.ccr.id + "CriteriaListDiv");
                filterListDiv.innerHTML="";    
                smlas.renderFilters(smlas.reportBuilder.advancedFilters);
            });
        }
    }

    wireFilterActions(filterListDiv){
        let smlas=this;
        //encaps functions
        let leftBtns=filterListDiv.querySelectorAll("button.parencontrol[data-left-paren]");
        leftBtns.forEach((button)=>{
            button.addEventListener("mouseover",async (e)=>{  
                let filterDiv=document.querySelector("#" + e.target.id.replace("Encapsulateleft","Encapsulateright") + "[data-guid='" + e.target.dataset.guid + "']");
                filterDiv.classList.add("bg-info");
                e.target.classList.add("bg-info");
            });
            button.addEventListener("mouseout",async (e)=>{  
                let filterDiv=document.querySelector("#" + e.target.id.replace("Encapsulateleft","Encapsulateright") + "[data-guid='" + e.target.dataset.guid + "']");
                filterDiv.classList.remove("bg-info");
                e.target.classList.remove("bg-info");
            });
        });

        let rightBtns=filterListDiv.querySelectorAll("button.parencontrol[data-right-paren]");
        rightBtns.forEach((button)=>{
            button.addEventListener("mouseover",async (e)=>{  
                let filterDiv=document.querySelector("#" + e.target.id.replace("Encapsulateright","Encapsulateleft") + "[data-guid='" + e.target.dataset.guid + "']");
                filterDiv.classList.add("bg-info");
                e.target.classList.add("bg-info");
            });
            button.addEventListener("mouseout",async (e)=>{  
                let filterDiv=document.querySelector("#" + e.target.id.replace("Encapsulateright","Encapsulateleft") + "[data-guid='" + e.target.dataset.guid + "']");
                filterDiv.classList.remove("bg-info");
                e.target.classList.remove("bg-info");
            });
        });
        filterListDiv.querySelectorAll(".encapleft").forEach((button)=>button.addEventListener("click",async (e)=>{smlas.encapsulateLeft(e);}));
        filterListDiv.querySelectorAll(".encapright").forEach((button)=>button.addEventListener("click",async (e)=>{smlas.encapsulateRight(e);}));
        filterListDiv.querySelectorAll(".encapremove").forEach((button)=>button.addEventListener("click",async (e)=>{smlas.encapsulateRemove(e);}));
        //criteria functions
        filterListDiv.querySelectorAll(".criteriaEdit").forEach((button)=>button.addEventListener("click",async (e)=>{smlas.editCriteria(e);}));
        filterListDiv.querySelectorAll(".criteriaRemove").forEach((button)=>button.addEventListener("click",(e)=>{smlas.removeCriteria(e);}));
        //operand functions
        filterListDiv.querySelectorAll(".opselectbutton").forEach((button)=>button.addEventListener("click",(e)=>{smlas.changeOperation(e);}));


    }




    //==============================================WIRES END==================================================

    //==============================================FUNCTIONS==================================================
    async advancedReportButtonsBuild(event){
        let smlas=this;
        let button=event.target;
        if(button.nodeName==='I') button=event.target.parentElement;
        let buttonHtmlId=button.id;
        let buttonId=asInt(button.dataset.id);
        let currentReport=smlas.ccr.reports.find(f=>f.reportIdentifier===buttonId);
        let buttonUl=document.querySelector("#AdvReportId" + buttonId + "ButtonGroupUl");
        buttonUl.innerHTML="";
        let runButton={n:"li",c:"",b:[
            {n:"button",i:"AdvReportId" + buttonId + "RunButton",c:"btn btn-primary btn-sm w-100",t:"Run"}
        ]}
        buttonUl.insertAdjacentHTML("beforeend",jmlToHtml(runButton));
        if(currentReport.addUserIdentifier==cso.UserIdentifier){
            let editButton={n:"li",c:"",b:[
                {n:"button",i:"AdvReportId" + buttonId + "EditButton",c:"btn btn-success btn-sm w-100",t:"Edit"}
            ]}
            buttonUl.insertAdjacentHTML("beforeend",jmlToHtml(editButton));

            let deleteButton={n:"li",c:"",b:[
                {n:"button",i:"AdvReportId" + buttonId + "DeleteButton",c:"btn btn-danger btn-sm w-100",t:"Delete"}
            ]}
            buttonUl.insertAdjacentHTML("beforeend",jmlToHtml(deleteButton));
        }
        document.querySelector("#AdvReportId" + buttonId + "RunButton").addEventListener("click",async (e)=>{
            smlas.advancedSearch(buttonId);
        });
        
        document.querySelector("#AdvReportId" + buttonId + "EditButton").addEventListener("click",async (e)=>{
            await smlas.editAdvancedReport(buttonId);
        });

        if(currentReport.addUserIdentifier==cso.UserIdentifier){
            document.querySelector("#AdvReportId" + buttonId + "DeleteButton").addEventListener("click",async (e)=>{
                smlas.ccr.unobtrusiveWait("Please Wait", "Deleting Advanced Report");
                let jsRpt=new smlReportDefinition(currentReport.Data);
                jsRpt.reportIdentifier=buttonId;
                smlas.ccrs.deleteAsk(jsRpt);
            });
    
        }
    }

    async advancedSearch(id){
        let smlas=this;
        await smlas.ccrs.getReports();
        let currReport=smlas.ccrs.getReport(id);
        let dataUp=currReport;
        smlas.unSetCurrentAdvancedReport();
        smlas.setCurrentAdvancedReport(currReport);
        dataUp.list=[];
        dataUp.advancedFilters=currReport.advancedFilters;
        dataUp.isAdvanced=true;
        dataUp.requestId = id;
        dataUp.columns=currReport.query.displayColumns;
        dataUp.requestType="AdvancedSearch";
        dataUp.quickSearch = document.querySelector("#" + smlas.ccr.id + "QuickSearch").value;
        let searchTabContent=document.querySelector("#" + smlas.ccr.id + "SimpleSearchContent");
        if(searchTabContent && smlas.ccr.report.filters.length>0){
            let searchInputs=searchTabContent.querySelectorAll("input, select, checkbox, textarea");
            searchInputs.forEach((input)=>{
               let fltr={};
                if(input.hasAttribute("data-is-sml-auto-complete")){
                    let smlAutoComplete=document.querySelector("sml-auto-complete[data-sml-property='" + input.dataset.smlProperty + "']");
                    let filterKey=smlAutoComplete?.id||input.dataset.smlProperty||input.id;
                    fltr=smlas.ccr.report.filters.find((f)=>{return f.property.name==filterKey;})||new smlReportFilter();
                    if(input.id.endsWith("Id") || input.id.endsWith("Hidden")){
                        fltr.property.value=input.value;
                    }else{
                        fltr.value=input.value;
                    }
                }else{
                    fltr=dataUp.filters.find((f)=>{return f.property.name==input.id;});
                    if(fltr){
                        fltr.value=input.value;
                        switch(input.type.toLowerCase()){
                            case "checkbox":
                                fltr.property.value=input.checked;
                                fltr.value=input.checked;
                                break;
                            case "select":
                                fltr.property.value=input.value;
                                fltr.value=input.checked;
                                break;
                            default:
                                fltr.property.value=input.value;
                                break;                    
                        }
                    }
                }
            });
        }
        smlas.ccr.unobtrusiveWait("Please Wait", "Searching");
        let dataUpString=JSON.stringify(dataUp);
        let data = await apiPost(smlas.ccr.dataset.api, dataUpString, "json");
        if(typeof data==="string") data=JSON.parse(data);
        if (await smlas.ccr.receiptCheckGood(data)) {
            smlas.ccr.report=new smlReportDefinition(data);
            let query=smlas.ccr.report.query;
            smlas.ccr.report.query={};
            let list=smlas.ccr.report.list;
            smlas.ccr.report.list=[];
            await smlas.ccr.buildTableFromReportList(query,list);
        }else{
            await showReportingMessage(data.errorObject, "Error");
        }
        smlas.ccr.unobtrusiveWaitOff();
    }

    async resetCurrentAdvancedReportDiv(){
        let smlas=this;
        let currAdvReportDiv=document.querySelector("#" + smlas.ccr.id + "AdvReportsCurrentReportDiv");
        if(!currAdvReportDiv) return;
        currAdvReportDiv.classList.add("d-none");
        currAdvReportDiv.innerHTML="";
    }

    async setCurrentAdvancedReport(currentReport){
        let smlas=this;
        let currAdvReportDiv=document.querySelector("#" + smlas.ccr.id + "AdvReportsCurrentReportDiv");
        if(!currAdvReportDiv) return;
        currAdvReportDiv.classList.remove("d-none");
        currAdvReportDiv.classList.add("border", "border-2", "border-dark", "bg-light", "p-1", "bg-grey-300",
            "shadow", "rounded", "text-dark", "text-center", "m-1");
        let titleLabel={i: smlas.ccr.id + "AdvReportsCurrentReportTitleLabel", c:"ms-1 me-3 text-shadow", t:"Current Report:"};
        currAdvReportDiv.insertAdjacentHTML("beforeend",jmlToHtml(titleLabel));
        let titleName={i: smlas.ccr.id + "AdvReportsCurrentReportName", c:"flex-fill fw-bold text-start", t:currentReport.reportName};
        currAdvReportDiv.insertAdjacentHTML("beforeend",jmlToHtml(titleName));
        let queryText={i: smlas.ccr.id + "AdvReportsCurrentQueryText", c:"flex-fill fw-bold text-start", t:smlas.renderTextFilters(currentReport)};
        currAdvReportDiv.insertAdjacentHTML("beforeend",jmlToHtml(queryText));
    }

    
    /**
     * Builds the text query for display
     *
     * @param {*} currentReport
     * @return {*} 
     * @memberof ccAdvancedReports
     */
    renderTextFilters(currentReport){
        let smlas=this;
        let queryText="Records where ";

        for(const filter of currentReport.advancedFilters){
            if(filter.encapsulation){
                let primeEncapFilter=smlas.renderEncapsulatedFilterText(filter);
                queryText += primeEncapFilter;
            }else{
                let primeFilter=smlas.renderNonEncapsulatedFilterText(filter);                 
                queryText += primeFilter;
            }
        }


        return queryText;
    }
    
    renderEncapsulatedFilterText(filter){
        let smlas=this;
        let queryText="";
         //Prefix And/Or/etc if there is an operator
        if(filter.preop) queryText+=" " + filter.preop;
        //encapseEle.b.push(smlas.makeEncapsulateControl(filter,"open"));
        if(!filter.encapsulation){
            queryText+=" " +filter?.property?.Name||"";
            queryText+=" " + camelToTitle(filter?.operation)||"";
            queryText+=" `" + (filter?.value||"") + "`";
        }
        for(const innerFilter of filter.innerFilters){
            if(innerFilter.encapsulation){
                let primeEncapFilter=smlas.renderEncapsulatedFilterText(innerFilter);
                queryText+=" " +primeEncapFilter;
            }else{
                let innardsEle=smlas.renderNonEncapsulatedFilterText(innerFilter);
                queryText+=" " +innardsEle;
            }
        }
        return queryText;
    }

    renderNonEncapsulatedFilterText(filter){
        let smlas=this;
        let queryText="";
        if(filter.preop) queryText+=" " + filter.preop;
        queryText+=" " +filter?.property?.Name||"";
        queryText+=" " + camelToTitle(filter?.operation)||"";
        queryText+=" `" + (filter?.value||"") + "`";
        if(filter.innerFilters){
            for(const innerFilter of filter.innerFilters){
                if(innerFilter.encapsulation){
                    let primeEncapFilter=smlas.renderEncapsulatedFilterText(innerFilter);
                    queryText+=" " +primeEncapFilter;
                }else{
                    let innardsEle=smlas.renderNonEncapsulatedFilterText(innerFilter);
                    queryText+=" " +innardsEle;                  
                }
            }
        }
        return queryText;
    }


    async unSetCurrentAdvancedReport(){
        let smlas=this;
        let currAdvReportDiv=document.querySelector("#" + smlas.ccr.id + "AdvReportsCurrentReportDiv");
        if(!currAdvReportDiv) return;
        currAdvReportDiv.classList.add("d-none");
        currAdvReportDiv.innerHTML="";
    }


    //------------------------------------------------------------------------------------------------------
    //                           Test or Save Advanced Reports
    //------------------------------------------------------------------------------------------------------
   

    /**
     * Sends to save or test
     *
     * @param {boolean} [saveReport=false]
     * @memberof ccAdvancedReports
     */
    async testOrSaveAdvancedReport(saveReport=false){
        let smlas=this;
        let validObj=smlas.validateAdvancedReport();
        let reportIdInput=_.querySelector("#" + smlas.ccr.id + "ReportId");
        let reportId=-1;
        if(reportIdInput!==null){
            reportId=parseInt(_.querySelector("#" + smlas.ccr.id + "ReportId").value);
        }
        if(!validObj.isValid) { await showReportingMessage(validObj.message, "Error");}
        else{
            if(saveReport){
                smlas.ccr.report.requiresRefresh=true;
                await smlas.saveAdvancedReport(reportId);
                smlas.clearReportsTable();
                await smlas.ccr.ccrs.loadReports();
				await smlas.buildAdvancedReportsTabContent(); 
				smlas.buildReportsTable();
                smlas.ccr.unobtrusiveWaitOff();
            }else{
                await smlas.testAdvancedReport(reportId);
                smlas.ccr.unobtrusiveWaitOff();
            }
        }
    }

    /**
     * Tests the report generaing data to verify
     *
     * @param {*} reportId
     * @memberof ccAdvancedReports
     */
    async testAdvancedReport(reportId){
        let smlas=this;
        //Build dataUp for send to server
        let callType="TestRunAdvancedReport";
        let dataUp=await smlas.testSaveReportSetup(reportId,callType);
        smlas.ccr.unobtrusiveWait("Please Wait", "Running Test");
        let data = await apiPost(smlas.ccr.dataset.api, JSON.stringify(dataUp), "json");
        if (await smlas.ccr.receiptCheckGood(data)) {
            smlas.ccr.report=new smlReportDefinition(data);
            let query=smlas?.report?.query||smlas?.ccr?.originalReport?.query;
            smlas.ccr.report.requiresRefresh=true;
            smlas.ccr.report.query=query||{};
        }else{
            await showReportingMessage(data.errorObject, "Error");
        }
        await smlas.testSaveReportShow(data,callType)            
    }

    /**
     * Saves the report
     *
     * @param {*} reportId
     * @memberof ccAdvancedReports
     */
    async saveAdvancedReport(reportId){
        let smlas=this;
        //Build dataUp for send to server
        let callType="SaveAdvancedReport";
        let dataUp=await smlas.testSaveReportSetup(reportId,callType);
        smlas.ccr.unobtrusiveWait("Please Wait", "Running Test");
        let data = await apiPost(smlas.ccr.dataset.api, JSON.stringify(dataUp), "json");
        if (await smlas.ccr.receiptCheckGood(data)) {
            smlas.ccr.report.requiresRefresh=true;
            smlas.ccr.report=new smlReportDefinition(data);
            let query=smlas?.report?.query||smlas?.ccr?.originalReport?.query;
            smlas.ccr.report.requiresRefresh=true;
            smlas.ccr.report.query=query||{};
            let filterRowDiv=document.querySelector("#" + smlas.ccr.id + "FilterRowDiv");
            filterRowDiv.classList.remove("d-none");
            smlas.ccr.unobtrusiveWaitOff();
            await showReportingMessage("Report Saved", "Success");
        }else{
            await showReportingMessage(data.errorObject, "Error");
        }
        await smlas.testSaveReportShow(data,callType)            
    }

    
    /**
     * Generates the data to go up to the server for saving and testing reports
     *
     * @param {*} reportId
     * @param {*} requestType
     * @return {*} 
     * @memberof ccAdvancedReports
     */
    async testSaveReportSetup(reportId,requestType){
        let smlas=this;
        smlas.ccr.report=smlas.ccr.reports.find(rpt=>rpt.reportIdentifier=reportId)||smlas.ccr.originalReport;
        let dataUp = smlas.ccr.report;
        if(dataUp.tableConfig) delete dataUp.tableConfig;
        dataUp.isAdvanced=true;
        dataUp.advancedFilters=smlas.reportBuilder.advancedFilters;
        smlas.reportBuilder.filters=[];
        let filters=_.querySelector("#" + smlas.ccr.id + "SimpleSearchContent").querySelectorAll("input, select, checkbox, textarea");
        //let filtersEnv=document.querySelector("#" + smlas.ccr.id + "SimpleSearchContent");
        for(let input of filters){
                
            if(input.hasAttribute("data-is-sml-auto-complete")){
                let smlAutoComplete=document.querySelector("sml-auto-complete[data-sml-property='" + input.dataset.smlProperty + "']");
                let filterKey=smlAutoComplete?.id||input.dataset.smlProperty||input.id;
                let cf=smlas.ccr.report.filters.find((f)=>{return f.property.name==filterKey;})||new smlReportFilter();
                if(input.id.endsWith("Id") || input.id.endsWith("Hidden")){
                    cf.property.value=input.value;
                }else{
                    cf.value=input.value;
                    smlas.reportBuilder.filters.push(cf);
                }
            }else{
                let cf=smlas.ccr.report.filters.find((f)=>{return f.property.name==input.id;})||new smlReportFilter();
                cf.value=input.value;
                smlas.reportBuilder.filters.push(cf);

            }
        }
        dataUp.reportIdentifier=reportId;
        dataUp.filters=smlas.reportBuilder.filters;
        let newColumns=await smlas.testSaveReportGetNewColumns();
        dataUp.name=document.querySelector("#" + smlas.ccr.id + "ReportNameInput").value;
        dataUp.reportName=dataUp.name;
        dataUp.query.displayColumns=newColumns;
        dataUp.columns=newColumns;
        dataUp.requestId = smlas.ccr.id;
        dataUp.modelProperties=dataUp.modelProperties.filter((value, index, self) => index === self.findIndex((t) => t.name === value.name));
        dataUp.requestType=requestType;
        delete dataUp.list;
        delete dataUp.tableConfig;
        return dataUp;
    }

    /**
     * Builds the column info for the report
     *
     * @return {*} 
     * @memberof ccAdvancedReports
     */
    async testSaveReportGetNewColumns(){
        let smlas=this;
        let newColumns=[];//smlas.reportBuilder.columns;
        for(let col=0;col<smlas.reportBuilder.columns.length;col++){
            let currCol=smlas.reportBuilder.columns[col];
            newColumns.push({
                dataType: currCol.type,
                fieldName: currCol.name||currCol.fieldName,
                format: smlas.divineColumnType(currCol.type),
                ordinal: col,
                sortDirection: currCol.sortDirection||currCol.SortDirection,
                sortOrdinal: ((currCol.sortOrdinal!==null 
                                && currCol.sortOrdinal!==undefined)?currCol.sortOrdinal:-1) ,
                title: currCol.label||currCol.Label,
            })
        }
        if(newColumns.length===0) {
            await showReportingMessage("No columns selected to display", "Error");
            return;
        }
        return newColumns;        
    }
    
    /**
     * Calls the ccReporting or ccTable to render a table of data
     *
     * @param {*} data
     * @memberof ccAdvancedReports
     */
    async testSaveReportShow(data,callType){
        let smlas=this;
        if(callType==="SaveAdvancedReport"){
            await smlas.reportEditClose();
            smlas.ccr.report=new smlReportDefinition(JSON.parse(data).Data);
        }else{
            smlas.ccr.report=new smlReportDefinition(data);
        }
        let query=smlas?.report?.query||originalReport?.query;
        if(smlas.ccr.hasCcTable){
            smlas.ccr.report.requiresRefresh=true;
            smlas.ccr.report.query=query||{};
            if(smlas.ccr.hasCcTable){
                if(!smlas?.ccr?.report?.list) smlas.ccr.report.list=JSON.parse(data).Data.list;
                await smlas.ccr.buildTableFromReportList(query,smlas.ccr.report.list);
            }
        }
        smlas.resetCurrentAdvancedReportDiv();
        smlas.setCurrentAdvancedReport(smlas.ccr.report);
        let filterRowDiv=document.querySelector("#" + smlas.ccr.id + "FilterRowDiv");
        filterRowDiv.classList.remove("d-none");
        if(callType==="SaveAdvancedReport") {
            smlas.clearReportsTable();
            await smlas.buildAdvancedReportsTabContent();            
            await smlas.buildReportsTable();
        }
        smlas.ccr.unobtrusiveWaitOff();
    }
    //------------------------------------------------------------------------------------------------------
    // END                       Test or Save Advanced Reports END
    //------------------------------------------------------------------------------------------------------

    async editAdvancedReport(id){
        let smlas=this;
        let report=smlas.ccr.reports.find((r)=>{return r.reportIdentifier==id});
        smlas.reportBuilder=new smlReportDefinition();
        for(const r of report.filters){
            smlas.reportBuilder.filters.push(new smlReportFilter(r));
        }
        for(const c of report?.query?.displayColumns||[]){
            smlas.reportBuilder.columns.push(new smlReportColumn(c));
        }
        for(const af of report.advancedFilters){
            smlas.reportBuilder.advancedFilters.push(new smlReportFilter(af));
        }
        let filterRowDiv=document.querySelector("#" + smlas.ccr.id + "FilterRowDiv");
        filterRowDiv.classList.add("d-none");
        let filterListDiv=document.querySelector("#" + smlas.ccr.id + "CriteriaListDiv");
        filterListDiv.innerHTML="";
        let advReportsContainerDiv=document.querySelector("#" + smlas.ccr.id + "AdvReportsContainerDiv");
        smlas.clearReportsTable();
        
        //columns
        let editPane={i: smlas.ccr.id + "EditPane",c:"container-fluid bg-light p-3",b:[]};
        let paneHeader={c:"row",b:[
                                    {t:"Edit Advanced Report",c:"text-center h3"
                                        ,role: "heading",alvl:"2"
                                        ,b:[
                                            {n: "button"
                                            ,i: smlas.ccr.id + "EditAdvancedReportCloseButton"
                                            ,role:"button",c:"btn btn-sm btn-secondary float-end"
                                            ,ttl:"Close(Cancel) Edit Advanced Report",b:[
                                                {c:"bi bi-x float-start"}]}
                                    ]}
                        ]}
        editPane.b.push(paneHeader);
        //Report Name Input
        let reportNameRow={c:"row",b:[ 
            {c:"col-12",b:[
                {n:"input",i:smlas.ccr.id + "ReportId",type:"hidden",v:report.reportIdentifier},
                {n:"input",i:smlas.ccr.id + "ReportNameInput"
                    ,c:"form-control",ttl:"Name of the Report",alab:"Name of the Report"
                    ,areq:"true",p:"Name of the Report"}
                ,{i:smlas.ccr.id + "ReportNameInputValidation",c:"d-none"}
            ]}
        ]};
        editPane.b.push(reportNameRow);
        let columnsHeader={c:"row h4",role: "heading",alvl:"3",t:"Report Columns"};
        editPane.b.push(columnsHeader);
        let columnsRow={c:"row",b:[
            {c:"col-11 h6",t:"Choose Columns to show on report"}
            ,{i:smlas.ccr.id + "ReportColumnsValidation",c:"d-none"}
            ,{c:"col-1",b:[
                {n: "button",role:"button",c:"btn btn-success btn-sm float-end"
                    ,i: smlas.ccr.id + "AddColumnButton"
                    ,ttl:"Add Column",t:"Add",b:[
                        {c:"bi bi-plus float-start"}
                    ]}
                ]}
        ]};
        editPane.b.push(columnsRow);
        let columnsListDiv={i:smlas.ccr.id + "ColumnsSelectedListDiv",c:"d-flex flex-nowrap flex-justify-center align-items-start shadow shadow-secondary p-2",s: "overflow-x: scroll;min-height:175px;",b:[]};
        let columnsSeparatorRow={c:"row my-3"};
        editPane.b.push(columnsListDiv,columnsSeparatorRow);

        //criteria
        let criteriaHeader={c:"row h4",role: "heading",alvl:"3",t:"Report Criteria"};
        editPane.b.push(criteriaHeader);
        let criteriaRow={c:"row",b:[
            {c:"col-9 h6",t:"Generate Criteria for this report"}
            ,{i:smlas.ccr.id + "ReportCriteriaValidation",c:"d-none"}
            ,{c:"col-3",b:[
                {n: "button",role:"button",c:"btn btn-success btn-sm float-end"
                    ,i: smlas.ccr.id + "EditCriteriaButton",ttl:"Add Criteria",t:"Add",b:[
                        {c:"bi bi-plus float-start"}
                    ]}
                ]}
        ]};
        editPane.b.push(criteriaRow);
        let criteriaListDiv={i:smlas.ccr.id + "CriteriaListDiv"
                                ,c:"p-1 d-flex justify-content-center align-items-start shadow shadow-secondary flex-wrap"
                                ,s: "min-height:100px;",b:[]};
        let criteriaSeparatorRow={c:"row my-3"};
        editPane.b.push(criteriaListDiv,criteriaSeparatorRow);

        editPane.b.push({c:"d-flex flex-row-reverse",b:[
            {n: "button",i:smlas.ccr.id + "SaveReportButton",role:"button",c:"btn btn-success btn-sm me-2",t:"Save Report"},
            {n: "button",i:smlas.ccr.id + "TestRunButton",role:"button",c:"btn btn-primary btn-sm me-2",t:"Test Run"}
        ]})
        advReportsContainerDiv.insertAdjacentHTML("beforeend",jmlToHtml(editPane));
        //Fill Form
        document.querySelector("#" + smlas.ccr.id + "ReportNameInput").value=report.reportName;
        smlas.renderColumnsStructure();
        filterListDiv.innerHTML="";    
        smlas.renderFilters(smlas.reportBuilder.advancedFilters);
        smlas.wireEditAdvancedReport();
    }

    wireEditAdvancedReport(){
        let smlas=this;
        let editAdvReportCloseButton=document.querySelector("#" + smlas.ccr.id + "EditAdvancedReportCloseButton");
        let addColumnButton=document.querySelector("#" + smlas.ccr.id + "AddColumnButton");
        let addCriteriaButton=document.querySelector("#" + smlas.ccr.id + "EditCriteriaButton");
        let testRunButton=document.querySelector("#" + smlas.ccr.id + "TestRunButton");
        let saveReportButton=document.querySelector("#" + smlas.ccr.id + "SaveReportButton");
        editAdvReportCloseButton.addEventListener("click", async ()=> { await smlas.reportEditClose(); });

        addColumnButton.addEventListener("click", async ()=> {
            smlas.addColumns();
        })

        addCriteriaButton.addEventListener("click", async ()=> {
            smlas.addFilters();
        })

        testRunButton.addEventListener("click", async ()=> {
            smlas.testOrSaveAdvancedReport();
        })

        saveReportButton.addEventListener("click", async ()=> {
            await smlas.testOrSaveAdvancedReport(true);
        });



    }

    async reportEditClose(){
        let smlas=this;
        smlas.clearReportsTable();
        smlas.resetCurrentAdvancedReportDiv();
        await smlas.buildAdvancedReportsTabContent();            
        await smlas.buildReportsTable();
        let filterRowDiv=document.querySelector("#" + smlas.ccr.id + "FilterRowDiv");
        filterRowDiv.classList.remove("d-none");

    }

    validateAdvancedReport(){
        let smlas=this;
        let validObj={};
        validObj.isValid=true;
        let msg={n:"ul",c:"list-group",b:[]};
        let reportName=document.querySelector("#" + smlas.ccr.id + "ReportNameInput").value;
        if(reportName.length===0){
            msg.b.push({n:"li",c:"list-group-item list-group-item-danger",t:"Report Name is Required"});
            validObj.isValid=false;
        }
        if(smlas.reportBuilder.columns.length===0){
            msg.b.push({n:"li",c:"list-group-item list-group-item-danger",t:"No Columns Selected"});
            validObj.isValid=false;
        }
        if(smlas.reportBuilder.advancedFilters.length===0){
            msg.b.push({n:"li",c:"list-group-item list-group-item-danger",t:"No Criteria Selected"});
            validObj.isValid=false;
        }
        validObj.message=msg;
        return validObj;
    }

    divineColumnType(type){
        let smlas=this;
        switch(type.toLowerCase()){
            default:
                return "Text";
        }

    }

    wireFilterFunctions(smlas, ccr) {
        smlas.changeOperation = changeOperation;
        smlas.cleanUp = cleanUp;
        smlas.cleanUpEmptyEncapse = cleanUpEmptyEncapse;
        smlas.cleanUpLeftOpNotNeeded = cleanUpLeftOpNotNeeded;
        smlas.clearReportsTable = clearReportsTable;
        smlas.columnSelect = columnSelect;
        smlas.columnMoveSelect = columnMoveSelect;
        smlas.columnSortSelect = columnSortSelect;
        smlas.encapsulateLeft = encapsulateLeft;
        smlas.encapsulateRemove = encapsulateRemove;
        smlas.encapsulateRight = encapsulateRight;
        smlas.editCriteria = editCriteria;
        smlas.editCriteriaSubmit = editCriteriaSubmit;
        smlas.findLeftFilter = findLeftFilter;
        smlas.findRightFilter = findRightFilter;
        smlas.removeCriteria = removeCriteria;
        smlas.searchAdvReports = searchAdvReports;
        smlas.getFilterAndPathByGuid = getFilterAndPathByGuid;
        smlas.getFilterIndex = getFilterIndex;
        smlas.getFilterByIndices = getFilterByIndices;
        smlas.pushFilterByIndices = pushFilterByIndices;
        smlas.wireAddColumnTool = wireAddColumnTool;
        smlas.addColumns = addColumns;
        smlas.makeReportColumns = makeReportColumns;
        smlas.renderColumnsStructure = renderColumnsStructure;
        smlas.moveItem = moveItem;
        //smlas.reportBuilder.filters = ccr.report.filters;
    }
    //==============================================FUNCTIONS END==============================================

}




//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^