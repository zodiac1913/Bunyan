//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
/**
 * Class for Creating, Storing, Recalling, and Running Reports
 * Public Domain
 * Licensed Copyright Law of the United States of America, Section 105 (https://www.copyright.gov/title17/92chap1.html#105)
 * Per hoc, facies, scietis quod ille miserit me ut facerem universa quae cernitis et factis: Non est mecum!
 * Published by: Dominic Roche of OIT/IUSG/DASM on 03/13/2026
 * @class smlReporting
 * @extends {HTMLElement}
 */
"use strict";
import smlReportDefinition from './smlReportDefinition.js';
import { upgradeButtonsIn, showReportingMessage } from './smlReportingShared.js';
import { apiPost, apiPostDirect, clip, dispatch, isSmlClientOwned, on, resolveSmlEngine, smlClientOrFetch } from '../../sml/smlUtils.js';
import { resolveTableActions } from '../Table/smlTableActions.js';
import { applyRptSecurityToPayload } from './smlReportingModelUtils.js';
class smlReporting extends HTMLElement {
    static observedAttributes=[];

    /**
     * Creates an instance of ccr.
     * @param {*} config
     * @memberof ccReporting
     */
       constructor(config) {
        super();
        let ccr = this;
        ccr.queryDescription="";
        ccr.originalReport=null;
        ccr.reports=[];
        ccr.loadingReports=false;
        ccr.currentReport=null;
        ccr.hasCcTable=false;
        ccr.ccTableId=null;
            ccr._initializing=false;
            ccr._initialized=false;
        ccr._configLoaded=false;
        ccr._searchSessionId=0;
        ccr._activeSearchAbortController=null;
        ccr._serverPagingInFlight=false;
        ccr._tablePagingBridgeBound=false;
    
    }

    readLocalReportConfig(){
        let ccr=this;
        if(ccr.localConfig && typeof ccr.localConfig === "object"){
            return structuredClone(ccr.localConfig);
        }

        const rawLocalConfig=String(ccr.dataset.localConfig || "").trim();
        if(rawLocalConfig.length < 1){
            return null;
        }

        try{
            return JSON.parse(rawLocalConfig);
        }catch(error){
            console.warn("smlReporting: unable to parse local config", error);
            return null;
        }
    }

    mergeLocalReportConfig(localConfig, responseData){
        let ccr=this;
        if(!localConfig){
            return ccr.normalizeReportingPayload(responseData);
        }

        const normalizedResponse = ccr.normalizeReportingPayload(responseData) || {};
        const responseQuery = normalizedResponse.query || normalizedResponse.Query || {};
        const localQuery = structuredClone(localConfig.query || {});
        const clientPresentation = isSmlClientOwned(ccr)
            ? {
                displayColumns: Array.isArray(localQuery.displayColumns) ? localQuery.displayColumns : [],
                queryActions: Array.isArray(localQuery.queryActions) ? localQuery.queryActions : [],
                forms: Array.isArray(localQuery.forms) ? localQuery.forms : []
            }
            : {};
        const mergedConfig = {
            ...structuredClone(localConfig),
            ...normalizedResponse,
            query: {
                ...localQuery,
                ...(responseQuery || {}),
                ...clientPresentation
            },
            security: normalizedResponse.security || localConfig.security || null
        };

        return ccr.normalizeReportingPayload(mergedConfig);
    }

    applyLocalReportConfig(responseData){
        let ccr=this;
        const localConfig = ccr.readLocalReportConfig();
        if(!localConfig){
            return ccr.normalizeReportingPayload(responseData);
        }

        return ccr.mergeLocalReportConfig(localConfig, responseData);
    }

    beginSearchSession(){
        const ccr=this;
        ccr._searchSessionId=(ccr._searchSessionId||0)+1;
        if(ccr._activeSearchAbortController){
            try{ ccr._activeSearchAbortController.abort(); }catch{ /* no-op */ }
        }
        ccr._activeSearchAbortController=new AbortController();

        const tableHost=ccr.resolveTableHost();
        if(tableHost?.dataset){
            delete tableHost.dataset.trueRecordCount;
        }
        if(typeof tableHost?.cancelPendingApiLoad === "function"){
            tableHost.cancelPendingApiLoad();
        }

        return {
            id: ccr._searchSessionId,
            signal: ccr._activeSearchAbortController.signal,
            controller: ccr._activeSearchAbortController
        };
    }

    isSearchSessionCurrent(sessionId){
        return sessionId === this._searchSessionId;
    }

    endSearchSession(session){
        const ccr=this;
        if(!session) return;
        if(ccr.isSearchSessionCurrent(session.id) && ccr._activeSearchAbortController===session.controller){
            ccr._activeSearchAbortController=null;
        }
    }

    cancelActiveSearch(){
        const ccr=this;
        ccr._searchSessionId=(ccr._searchSessionId||0)+1;
        if(ccr._activeSearchAbortController){
            try{ ccr._activeSearchAbortController.abort(); }catch{ /* no-op */ }
        }
        ccr._activeSearchAbortController=null;
        const tableHost=ccr.resolveTableHost();
        if(typeof tableHost?.setChunkLoadingState === "function"){
            tableHost.setChunkLoadingState(false, 0);
        }
    }
    //--------------------------------------------------------Methods 

    //Web Component Lifecycle
    
    /**
     * Component connected to DOM
     *
     * @memberof ccReporting
     */
    async connectedCallback() {
        let ccr=this;
        if (ccr._initialized || ccr._initializing) {
            return;
        }
        ccr._initializing=true;
        const { append, asBool, asElementId, camelToTitle, getEle, getEles, getVal, guid, isCheck, isJson,
            jmlToHtml, makeAlert, makeAlertJML, prepend, receiptCheckGood,
            unobtrusiveWait, unobtrusiveWaitOff, apiPostDirect, textBetween } = await import('../../sml/smlUtils.js');
        ccr.isJson=isJson;
        ccr.jmlToHtml=jmlToHtml;
        ccr.makeAlert=makeAlert;
        ccr.asBool=asBool;
        ccr.makeAlertJML=makeAlertJML;
        //ccr.apiPostDirect=apiPostDirect;
        ccr.receiptCheckGood=receiptCheckGood;
        ccr.unobtrusiveWait=unobtrusiveWait;
        ccr.unobtrusiveWaitOff=unobtrusiveWaitOff;
        ccr.textBetween=textBetween;
        //Check if ccTable is on page
        ccr.hasCcTable=ccr.resolveTableHost()!==null;
        let containerEle=document.querySelector("cc-container,sml-page");
        let pageContainer=globalThis.pageContainer || containerEle;
        if(globalThis.pageContainer?.id==="ElementNotFound") pageContainer=containerEle;
        //make id if missing
        if ((ccr?.id || "") === ""){
            if(pageContainer?.dataset?.idPrefix){
                ccr.dataset.idPrefix=pageContainer.dataset.idPrefix;
                ccr.id=pageContainer.dataset.idPrefix + "ReportingSystem";
            }else{
                //use guid
                let newGuid="rpt" + clip(guid(true),20);
                ccr.dataset.idPrefix=newGuid;
                if(pageContainer) pageContainer.dataset.idPrefix=newGuid;
                ccr.id="RptGuidId" + newGuid;
            }
        } 
        //make docs if requested
        //ccr.checkDocumentation();
        if (!ccr.name) ccr.name = ccr.id;
        const pageController = pageContainer?.dataset?.controller || document.querySelector("sml-page")?.dataset?.controller;
        const currentSession = globalThis.cso || null;
        let ctrl = pageController || currentSession?.CurrentApp?.ControllerName || location.pathname.split('/').filter(Boolean)[0];
        const actionPrefix = pageContainer?.dataset?.idPrefix || ccr.dataset.idPrefix || ccr.originalReport?.alias || "";
        let action = actionPrefix 
                        + (ccr.dataset.roleApiAddon?ccr.dataset.roleApiAddon:"")
                         + "ReportingQ";
        ccr.dataset.api = ccr.dataset.api||("/" + ctrl + "/" + action + "/");
        ccr.api=ccr.dataset.api;



        let collapseButton={n:"sml-reactive-button",c:"smlRB btn btn-PeachPuff text-dark border-2 border-primary shadow shadow-1 shadow-dark",
                                i:"collapseAllButton",type:"button", 
                                "data-bs-toggle": "collapse"
                                ,"data-bs-target":"#" + ccr.id + "Collapse"
                                ,aexp: false,acon: ccr.id + "Collapse"
                                ,ttl: "Report Functions",alab: "Report Functions"
                                ,"data-icon":"bi bi-search","data-text":"Report Functions"};
        let quickSearch={n:"input",c:"pt-1 mt-1",i:  ccr.id + "QuickSearch"
                            ,ttl:"Search on server (Slow) Use the search above the records for a faster search unless the data below is not all records. You can activate the search by typing in this text box"
                            ,type:"search",placeholder:"Quick Search (Server)"};



        let quickSearchButtonGroup={i: ccr.id + "QuickSearchButtonGroup",role:"group",c:"ms-0 btn-group",b:[]};
        
        let quickSearchButton={n:"sml-reactive-button",c:"btn btn-primary btn-sm fs-6 mb-2 ms-0 ccSmallScreenHide"
                                ,i:ccr.id + "QuickSearchButton"
                                ,ttl:"Search",alab:"Search"
                    ,type:"button","data-icon":"bi bi-search","data-text":"Search"};
        quickSearchButtonGroup.b.push(quickSearchButton);
        let quickSearchDiv={i:ccr.id + "HeadSearchDiv",c:"",b:[quickSearch,quickSearchButtonGroup]};
        let headerRow = {i:ccr.id + "HeadSearchRow",c:"bg-info py-1 px-2 d-flex justify-content-between text-start",b:[collapseButton,quickSearchDiv]};
        let collapseInterior={i: ccr.id + "CollapseInterior",c:"p-3 border border-3 border-secondary bg-snow",t: "",b:[]};
        let collapseDiv={i: ccr.id + "Collapse",c:"mx-0 px-0 row collapse",b:[collapseInterior]};
        
        let reportBox = {i:ccr.id + "Search",r:"search",alab:ccr.title || "Reporting search",c:"container-fluid px-0 py-0",b:[headerRow,collapseDiv]};
        if (asBool(ccr.dataset.documentation)) ccr.showDocumentation();
        if(document.getElementById(ccr.id + "HeadSearchDiv")===null){
            ccr.insertAdjacentHTML("afterbegin",jmlToHtml(reportBox));
            ccr.upgradeButtons(ccr);
            ccr.simpleSearchBtn = document.getElementById(ccr.id + "Collapse");
            ccr.simpleSearchBtn.addEventListener('shown.bs.collapse', 
            async ()=> { 
                ccr.collapseOpened();
            });
            window[ccr.id]=ccr;
            ccr.wireQuickSearch();
    
        }
        const { default: smlSimpleSearch } = await import('./reportingMods/smlSimpleSearch.js');

        ccr.smlSimpleSearchCtor = smlSimpleSearch;

        ccr.ccss=new ccr.smlSimpleSearchCtor(ccr);
        ccr.ccrs={
            showReportsLoading(){},
            showReportsLoaded(){},
            openSaveReportForm: async (...args)=>{
                const reports = await ccr.ensureSavedReportsModule();
                return await reports.openSaveReportForm(...args);
            }
        };
        ccr.ccas={
            unSetCurrentAdvancedReport(){},
            resetCurrentAdvancedReportDiv(){},
            showAdvancedReportsLoading(){},
            showAdvancedReportsLoaded(){}
        };


        if(!ccr._configLoaded) {
            ccr._configLoaded=true;
            await ccr.loadReportConfig();
            if (!ccr.report || typeof ccr.report !== "object") {
                console.warn("smlReporting: report config did not load for", ccr.dataset.api);
                ccr._configLoaded=false;
                ccr._initializing=false;
                return;
            }

            ccr.originalReport=ccr.report;
            window.originalReport=JSON.parse(JSON.stringify(ccr.originalReport || {}));
            await ccr.buildSearchTabs();
            await ccr.ccss.buildSimpleSearchTabContent();
            
            // Auto-load if loadEarly is set or if managing a reporting-controlled table
            const hasReportingTable = ccr.resolveTableHost() !== null && ccr.resolveTableHost().dataset.reportingManaged === "true";
            if ((ccr.dataset.loadEarly || hasReportingTable) && ccr._configLoadPaintedRows !== true) {
                await ccr.ccss.simpleSearch();
            }
            ccr._initialized=true;
            ccr._initializing=false;
            ccr.wireServerPagingBridge();
            ccr.wireTotalLoadBridge();
        }

    }

    disconnectedCallback() {
        let ccr=this;
        if (ccr._tablePagingBridgeHandler) {
            document.removeEventListener("sml:table-page-request", ccr._tablePagingBridgeHandler);
            ccr._tablePagingBridgeHandler=null;
            ccr._tablePagingBridgeBound=false;
        }
        if (ccr._tableTotalLoadBridgeHandler) {
            document.removeEventListener("sml:table-total-load-request", ccr._tableTotalLoadBridgeHandler);
            ccr._tableTotalLoadBridgeHandler=null;
            ccr._tableTotalLoadBridgeBound=false;
        }
    }

    /**
     * This updates class properties based on html tags being altered
     *
     * @param {*} name name of element tag
     * @param {*} oldValue old value for reference of element tag
     * @param {*} newValue new value of element tag
     * @memberof ccReporting
     */
    attributeChangedCallback(name, oldValue, newValue) {
        let ccr=this;
        switch(name){
                 case "data-documentation":
                    if(ccr.asBool){    
                        if(ccr.asBool(ccr.dataset.documentation))
                        {
                            ccr.showDocumentation()
                        }
                        else{
                            ccr.hideDocumentation();
                        }
                    }
                     break;
                default:
                    //whatimaboutadowitdat            
                    break;
        }

      
    }
    //END Web Component Lifecycle

    //User Actions Functions
    wireQuickSearch(){
        let ccr=this;
        let reportRoot = document.getElementById(ccr.id);
        if(!reportRoot) return;
        let qsBtn=document.getElementById(ccr.id + "QuickSearchButton");
        let qsInpt=document.getElementById(ccr.id + "QuickSearch");
        if(!qsBtn || !qsInpt) return;
        qsBtn.addEventListener("click",async ()=>{ ccr.ccss.simpleSearch();});
        qsInpt.addEventListener("keyup",async (e)=>{
            ccr.ccss.filtersAltered(e);
        });
    }

    upgradeButtons(root=this){
        upgradeButtonsIn(root);
    }

    resolveTableHost(){
        let ccr=this;
        const scopedContainer=ccr.closest(".card-body, .card, #reportContainer, main, cc-container, sml-page") || ccr.parentElement || document;
        const siblingTable=ccr.parentElement?.querySelector("sml-table, cc-table");
        const currentTable=siblingTable || scopedContainer.querySelector("sml-table, cc-table") || document.querySelector("sml-table, cc-table");
        ccr.hasCcTable=currentTable!==null;
        if(ccr.hasCcTable && (!ccr.cct || ccr.cctId!==currentTable.id)){
            ccr.cctId=currentTable.id;
            ccr.cct=globalThis[ccr.cctId];
        }
        return currentTable;
    }

    wireServerPagingBridge(){
        let ccr=this;
        if (ccr._tablePagingBridgeBound) return;

        ccr._tablePagingBridgeHandler=async (event)=>{
            const detail=event?.detail||{};
            const table=ccr.resolveTableHost();
            if(!table) return;
            if(detail.hostId && table.id && detail.hostId!==table.id) return;

            const take=Number.parseInt(String(detail.take||"0"),10);
            const skip=Number.parseInt(String(detail.skip||"0"),10);
            if(!Number.isFinite(take) || take<1) return;

            const detailApi=String(detail.searchApi||"").trim();
            const ccrApi=String(ccr.dataset.api||ccr.api||"").trim();
            if(detailApi && ccrApi && detailApi!==ccrApi) return;
            if(ccr._serverPagingInFlight) return;

            ccr._serverPagingInFlight=true;
            try{
                await ccr.ccss.simpleSearch({
                    skip: Number.isFinite(skip) && skip>0 ? skip : 0,
                    take
                });
            }finally{
                ccr._serverPagingInFlight=false;
            }
        };

        document.addEventListener("sml:table-page-request", ccr._tablePagingBridgeHandler);
        ccr._tablePagingBridgeBound=true;
    }

    wireTotalLoadBridge(){
        let ccr=this;
        if (ccr._tableTotalLoadBridgeBound) return;

        ccr._tableTotalLoadBridgeHandler=async (event)=>{
            const detail=event?.detail||{};
            const table=ccr.resolveTableHost();
            if(!table) return;
            if(detail.hostId && table.id && detail.hostId!==table.id) return;
            if(typeof ccr.ccss?.simpleSearch !== "function") return;
            if(ccr._totalLoadReloadInFlight) return;

            const totalLoad=Number.parseInt(String(detail.totalLoad || table.dataset.totalLoadValue || ""),10);
            if(Number.isFinite(totalLoad) && totalLoad>0){
                table.dataset.totalLoadValue=String(totalLoad);
            }

            ccr._totalLoadReloadInFlight=true;
            try{
                await ccr.ccss.simpleSearch();
            }finally{
                ccr._totalLoadReloadInFlight=false;
            }
        };

        document.addEventListener("sml:table-total-load-request", ccr._tableTotalLoadBridgeHandler);
        ccr._tableTotalLoadBridgeBound=true;
    }

    async ensureSavedReportsModule(){
        let ccr=this;
        if(!ccr.smlSavedReportsCtor){
            const { default: smlSavedReports } = await import('./reportingMods/smlSavedReports.js');
            ccr.smlSavedReportsCtor = smlSavedReports;
        }
        if(!(ccr.ccrs instanceof ccr.smlSavedReportsCtor)){
            ccr.ccrs = new ccr.smlSavedReportsCtor(ccr);
        }
        return ccr.ccrs;
    }

    async ensureAdvancedReportsModule(){
        let ccr=this;
        if(!ccr.smlAdvancedReportsCtor){
            const { default: smlAdvancedReports } = await import('./reportingMods/smlAdvancedReports.js');
            ccr.smlAdvancedReportsCtor = smlAdvancedReports;
        }
        if(!(ccr.ccas instanceof ccr.smlAdvancedReportsCtor)){
            ccr.ccas = new ccr.smlAdvancedReportsCtor(ccr);
        }
        return ccr.ccas;
    }

    async ensureReportsUiLoaded(){
        let ccr=this;
        if(ccr._reportsUiLoaded) return;
        const reports = await ccr.ensureSavedReportsModule();
        await reports.getReports();
        await reports.loadReports();
        ccr._reportsUiLoaded = true;
    }

    async ensureAdvancedUiLoaded(){
        let ccr=this;
        if(ccr._advancedUiLoaded) return;
        const advanced = await ccr.ensureAdvancedReportsModule();
        await advanced.buildAdvancedReportsTabContent();
        await advanced.buildReportsTable();
        ccr._advancedUiLoaded = true;
    }

    isEditUiActive(){
        const activeElement = globalThis?.document?.activeElement || null;
        if(activeElement?.closest?.("sml-form, form, .modal")){
            return true;
        }

        const openModal = globalThis?.document?.querySelector?.(".modal.show");
        if(openModal && openModal.querySelector("sml-form, form, input, select, textarea")){
            return true;
        }

        return false;
    }

    flushQueuedSmlTablePayload(){
        const ccr=this;
        if(ccr.isEditUiActive()) return;
        const tableHost=ccr._queuedSmlTableHost;
        const payload=ccr._queuedSmlTablePayload;
        if(tableHost?.tagName==="SML-TABLE" && typeof tableHost?.setPayload === "function" && payload){
            tableHost.setPayload(payload);
        }
        ccr._queuedSmlTableHost=null;
        ccr._queuedSmlTablePayload=null;
    }

    queueOrApplySmlTablePayload(tableHost, payload){
        const ccr=this;
        if(!(tableHost?.tagName==="SML-TABLE" && typeof tableHost?.setPayload === "function")) return;

        if(ccr.isEditUiActive()){
            ccr._queuedSmlTableHost=tableHost;
            ccr._queuedSmlTablePayload=payload;
            if(!ccr._queuedSmlPayloadWatchersBound){
                const flush=()=>{ ccr.flushQueuedSmlTablePayload(); };
                globalThis?.document?.addEventListener?.("hidden.bs.modal", flush, true);
                globalThis?.document?.addEventListener?.("focusout", flush, true);
                ccr._queuedSmlPayloadWatchersBound=true;
            }
            return;
        }

        tableHost.setPayload(payload);
    }

    buildSmlTablePayload(query,list){
        let ccr=this;
        let rpt=ccr.report || ccr.originalReport;
        const currentTable=ccr.resolveTableHost();
        const resolvedSearchApi = currentTable?.dataset?.searchApi
                                || ccr.dataset.searchApi
                                || ccr.api;
        const resolvedDisplayColumns =
            (Array.isArray(query?.displayColumns) && query.displayColumns.length > 0)
                ? query.displayColumns
                : (Array.isArray(rpt?.query?.displayColumns) ? rpt.query.displayColumns : []);
        const reportActions=resolveTableActions(ccr.report);
        const responseActions=resolveTableActions({query});
        const resolvedQueryActions=reportActions.length>0?reportActions:responseActions;
        const resolvedForms =
            (Array.isArray(query?.forms) && query.forms.length > 0)
                ? query.forms
                : (Array.isArray(rpt?.query?.forms) ? rpt.query.forms : []);
        return {
            api: ccr.api,
            searchApi: resolvedSearchApi,
            query: {
                ...(query||{}),
                displayColumns: resolvedDisplayColumns,
                queryActions: resolvedQueryActions,
                forms: resolvedForms
            },
            list: list||[],
            modelKey: rpt?.modelKey,
            textIdentifier: rpt?.textIdentifier,
            pageLengthMenu: rpt?.tablePageLengthMenu||query?.tablePageLengthMenu||"10,50,100",
            hasPagination: query?.tableHasPagination,
            hasCounts: query?.tableHasCounts,
            hasSearch: query?.tableHasQuickSearch
        };
    }

    extractReportingRows(payload){
        if(!payload) return [];
        if(Array.isArray(payload?.list)) return payload.list;
        if(Array.isArray(payload?.listData)) return payload.listData;
        if(Array.isArray(payload?.rows)) return payload.rows;
        if(Array.isArray(payload?.data)) return payload.data;
        return [];
    }

    resolveChunkLoadPageSize(tableHost){
        const internalPageSize=tableHost?._smlWindowState?.pageSize;
        if(Number.isFinite(internalPageSize) && internalPageSize>0){
            return Number.parseInt(String(internalPageSize),10);
        }

        if(typeof internalPageSize==="string" && internalPageSize.toLowerCase()==="all"){
            const menu=(tableHost?.dataset?.pageLengthMenu||tableHost?.dataset?.tablePageLengthMenu||"")
                .split(",")
                .map((part)=>Number.parseInt(String(part||"").trim(),10))
                .filter((num)=>Number.isFinite(num) && num>0);
            if(menu.length>0){
                return Math.max(...menu);
            }
        }

        const selectUpper=tableHost?.querySelector?.(`#${tableHost?.id}PageLengthSelectUpper`);
        const selectLower=tableHost?.querySelector?.(`#${tableHost?.id}PageLengthSelectLower`);
        const selectValue=selectUpper?.value || selectLower?.value || "";
        const parsedSelect=Number.parseInt(String(selectValue).trim(),10);
        if(Number.isFinite(parsedSelect) && parsedSelect>0){
            return parsedSelect;
        }

        try{
            const cfgRaw=globalThis.localStorage?.getItem("smlTableCfg") || "";
            if(cfgRaw.length>0){
                const cfg=JSON.parse(cfgRaw);
                const parsedCfg=Number.parseInt(String(cfg?.numRecs||"").trim(),10);
                if(Number.isFinite(parsedCfg) && parsedCfg>0){
                    return parsedCfg;
                }
            }
        }catch{
            // ignore local storage parse failures
        }

        return 50;
    }

    resolveChunkSize(tableHost){
        const raw=String(tableHost?.dataset?.chunkLoad || this.dataset.chunkLoad || "").trim().toLowerCase();
        if(raw.length<1) return 0;

        if(raw==="pagesize"){
            return this.resolveChunkLoadPageSize(tableHost);
        }

        const parsed=Number.parseInt(raw,10);
        return Number.isFinite(parsed) && parsed>0 ? parsed : 0;
    }

    resolveTotalLoadCap(tableHost){
        const raw=String(tableHost?.dataset?.totalLoad || "").trim();
        const enabled=["true","1","yes"].includes(raw.toLowerCase()) || raw.includes(",");
        if(!enabled) return 0;

        let parsed=Number.parseInt(String(tableHost?.dataset?.totalLoadCap || ""),10);
        if(!Number.isFinite(parsed) || parsed<1){
            try{
                const cfgRaw=globalThis.localStorage?.getItem("smlTableCfg") || "";
                if(cfgRaw.length>0){
                    const cfg=JSON.parse(cfgRaw);
                    const tableId=String(tableHost?.id || "");
                    parsed=Number.parseInt(String(cfg?.totalLoad?.[tableId] || ""),10);
                }
            }catch{
                parsed=NaN;
            }
        }

        if(Number.isFinite(parsed) && parsed>0){
            const capped=Math.min(20000, Math.max(1000, parsed));
            if(tableHost?.dataset){
                tableHost.dataset.totalLoadCap=String(capped);
            }
            return capped;
        }

        return 1000;
    }

    resolveChunkApi(tableHost){
        const explicit=String(tableHost?.dataset?.chunkApi || this.dataset.chunkApi || "").trim();
        if(explicit.length>0){
            return explicit;
        }

        const baseSearchApi=String(tableHost?.dataset?.searchApi || tableHost?.dataset?.api || "").trim();
        if(baseSearchApi.length<1){
            return "";
        }

        if(/RptReportingSearch$/i.test(baseSearchApi)){
            return baseSearchApi.replace(/RptReportingSearch$/i,"RptReportingChunkSearch");
        }

        return `${baseSearchApi.replace(/\/$/,"")}/Chunk`;
    }

    resolveChunkKeyField(tableHost, payload){
        const directCandidates=[
            tableHost?.dataset?.modelKey,
            tableHost?.dataset?.tableKey,
            payload?.modelKey,
            payload?.query?.tableKey,
            payload?.query?.TableKey,
            this?.report?.modelKey,
            this?.report?.query?.tableKey,
            this?.report?.query?.TableKey
        ];
        const direct=directCandidates.find((value)=>String(value||"").trim().length>0);
        if(direct) return String(direct).trim();

        const firstRow=this.extractReportingRows(payload)?.[0];
        if(firstRow && typeof firstRow==="object"){
            const preferred=["EmployeeIdentifier","employeeIdentifier","Id","id"];
            const found=preferred.find((field)=>Object.hasOwn(firstRow,field));
            if(found) return found;
        }

        return "";
    }

    isChunkEndpointFallbackCandidate(payload){
        const text=String(payload?.errorObject || payload?.message || payload || "").toLowerCase();
        return text.includes("404")
            || text.includes("not found")
            || text.includes("request type not supported")
            || text.includes("chunk");
    }

    resolveReportingSecurity(){
        return this?.report?.security
            || this?.originalReport?.security
            || this?.localConfig?.security
            || null;
    }

    applyReportingSecurity(dataUp){
        return applyRptSecurityToPayload(dataUp, this.resolveReportingSecurity());
    }

    async postReportingSearch(dataUp, requestOptions={}){
        const ccr = this;
        ccr._lastSearchUsedFullPost = true;
        ccr._lastSearchTruncated = false;
        const explicitSearchApi = String(ccr?.dataset?.searchApi || "").trim();
        let data = null;
        dataUp = ccr.applyReportingSecurity(dataUp);

        const apiUrl = explicitSearchApi.length > 0 ? explicitSearchApi : ccr.dataset.api;
        data = await smlClientOrFetch(ccr, {
            kind: "reporting-search",
            api: apiUrl,
            body: dataUp,
            signal: requestOptions?.signal
        }, async () => {
            if(explicitSearchApi.length > 0){
                return apiPostDirect(explicitSearchApi, JSON.stringify(dataUp), "json", requestOptions);
            }
            return apiPost(ccr.dataset.api, JSON.stringify(dataUp), "json");
        });

        if(typeof(data)==="string") data=JSON.parse(data);
        return ccr.applyLocalReportConfig(data);
    }

    async runReportingSearch(dataUp, options={}){
        const ccr=this;
        const progressive=options?.progressive===true;
        const forceFullSearch=options?.forceFullSearch===true;
        const singleChunk=options?.singleChunk===true;
        ccr._lastSearchUsedFullPost=false;
        ccr._lastSearchTruncated=false;
        const searchSession=ccr.beginSearchSession();
        const isStale=()=>!ccr.isSearchSessionCurrent(searchSession.id);
        dataUp = ccr.applyReportingSecurity(dataUp);

        try{
            if(forceFullSearch){
                const fullResponse=await ccr.postReportingSearch(dataUp, { signal: searchSession.signal });
                if(isStale() || fullResponse?.aborted === true){
                    return { aborted: true, errorObject: "Request superseded" };
                }
                return fullResponse;
            }

            const tableHost=ccr.resolveTableHost();
            const baseChunkSize=ccr.resolveChunkSize(tableHost);
            if(baseChunkSize<1){
                const fullResponse=await ccr.postReportingSearch(dataUp, { signal: searchSession.signal });
                if(isStale() || fullResponse?.aborted === true){
                    return { aborted: true, errorObject: "Request superseded" };
                }
                return fullResponse;
            }

        // Adaptive defaults: keep first paint fast and subsequent updates lighter.
        const firstChunkSize=Math.max(1, Number.parseInt(String(tableHost?.dataset?.chunkFirstLoad || ""),10)
            || (baseChunkSize > 1000 ? 1000 : baseChunkSize));
        const followChunkSize=Math.max(1, Number.parseInt(String(tableHost?.dataset?.chunkFollowLoad || ""),10)
            || (baseChunkSize > 1000 ? 750 : baseChunkSize));
        const configuredMaxProgressivePaints = Number.parseInt(String(tableHost?.dataset?.chunkProgressivePaints || ""), 10);
        const maxProgressivePaints = Number.isFinite(configuredMaxProgressivePaints) && configuredMaxProgressivePaints > 0
            ? configuredMaxProgressivePaints
            : Number.MAX_SAFE_INTEGER;

            const chunkApi=ccr.resolveChunkApi(tableHost);
            if(chunkApi.length<1){
                const fullResponse=await ccr.postReportingSearch(dataUp, { signal: searchSession.signal });
                if(isStale() || fullResponse?.aborted === true){
                    return { aborted: true, errorObject: "Request superseded" };
                }
                return fullResponse;
            }

        const totalLoadCap=ccr.resolveTotalLoadCap(tableHost);
        if(totalLoadCap>0 && tableHost?.dataset){
            tableHost.dataset.chunkExpectedRows=String(totalLoadCap);
        }

        const setChunkLoadingState=(isLoading, loadedRows=0)=>{
            if(tableHost?.tagName!=="SML-TABLE") return;
            if(typeof tableHost?.setChunkLoadingState === "function"){
                tableHost.setChunkLoadingState(isLoading, loadedRows);
                return;
            }
            if(isLoading){
                tableHost.dataset.chunkLoading="true";
                tableHost.dataset.chunkLoadedRows=String(Number.parseInt(String(loadedRows||0),10)||0);
            }else{
                delete tableHost.dataset.chunkLoading;
                delete tableHost.dataset.chunkLoadedRows;
            }
        };

        let aggregateRows=[];
        const seenRowKeys=new Set();
        let finalPayload=null;
        let skip=0;
        let noProgressChunks=0;
        const maxIterations=200;
        const chunkRequest=structuredClone(dataUp || {});
        chunkRequest.requestType="RptReportingChunkSearch";
        chunkRequest.query=chunkRequest.query || {};
        let lastProgressivePaintAt=0;
        let lastProgressivePaintRowCount=0;
        let progressivePaintCount=0;

        const shouldProgressivelyPaint=(step, totalRows)=>{
            if(progressivePaintCount>=maxProgressivePaints) return false;
            if(step===0) return true;
            const now=Date.now();
            const elapsed=now - lastProgressivePaintAt;
            const rowsDelta=totalRows - lastProgressivePaintRowCount;
            return elapsed >= 450 || rowsDelta >= 1000;
        };

        const paintProgressive=(response, totalRows, step)=>{
            if(!(progressive && tableHost?.tagName==="SML-TABLE" && typeof tableHost?.setPayload==="function")) return;
            if(!shouldProgressivelyPaint(step, totalRows)) return;

            const activeElement = globalThis?.document?.activeElement || null;
            const isPagingInteraction = !!(activeElement
                && tableHost?.contains(activeElement)
                && String(activeElement?.id || "").includes("PageInput"));
            const hasOpenActionMenu = !!tableHost?._smlFloatingActionMenu
                || !!tableHost?.querySelector(".dropdown-menu.show, .sml-table-action-drop-menu.show");
            if(isPagingInteraction || hasOpenActionMenu || ccr.isEditUiActive()) return;

            const liveQuery=response?.query || ccr?.report?.query || ccr?.originalReport?.query || {};
            const hasConfiguredColumns = Array.isArray(liveQuery?.displayColumns)
                ? liveQuery.displayColumns.length > 0
                : Array.isArray(liveQuery?.DisplayColumns) && liveQuery.DisplayColumns.length > 0;
            if(!hasConfiguredColumns) return;
            ccr.queueOrApplySmlTablePayload(tableHost, ccr.buildSmlTablePayload(liveQuery, aggregateRows));
            setChunkLoadingState(true, totalRows);
            if(totalRows > 0 && typeof ccr?.unobtrusiveWaitOff === "function"){
                ccr.unobtrusiveWaitOff();
            }
            lastProgressivePaintAt=Date.now();
            lastProgressivePaintRowCount=totalRows;
            progressivePaintCount += 1;
        };

            setChunkLoadingState(true, 0);
            try{
        for(let step=0; step<maxIterations; step+=1){
            if(isStale()){
                return { aborted: true, errorObject: "Request superseded" };
            }
            const remaining=totalLoadCap>0 ? totalLoadCap - aggregateRows.length : Number.MAX_SAFE_INTEGER;
            if(remaining<1){
                break;
            }
            const requestedChunkSize=step===0 ? firstChunkSize : followChunkSize;
            const chunkSize=Math.max(1, Math.min(requestedChunkSize, remaining));
            chunkRequest.query.take=chunkSize;
            chunkRequest.query.skip=skip;

            let response;
            try{
                response=await smlClientOrFetch(ccr, {
                    kind: "reporting-chunk",
                    api: chunkApi,
                    body: chunkRequest,
                    signal: searchSession.signal
                }, () => apiPostDirect(chunkApi, JSON.stringify(chunkRequest), "json", { signal: searchSession.signal }));
            }catch{
                return await ccr.postReportingSearch(dataUp, { signal: searchSession.signal });
            }

            if(isStale() || response?.aborted === true){
                return { aborted: true, errorObject: "Request superseded" };
            }

            if(typeof(response)==="string"){
                try{
                    response=JSON.parse(response);
                }catch{
                    return await ccr.postReportingSearch(dataUp, { signal: searchSession.signal });
                }
            }

            response=ccr.applyLocalReportConfig(response);
            const isGood=await ccr.receiptCheckGood(response);
            if(!isGood){
                if(step===0 && ccr.isChunkEndpointFallbackCandidate(response)){
                    return await ccr.postReportingSearch(dataUp, { signal: searchSession.signal });
                }
                return response;
            }

            if(!finalPayload){
                finalPayload=response;
            }

            const rows=ccr.extractReportingRows(response);
            if(rows.length<1){
                break;
            }

            const keyField=ccr.resolveChunkKeyField(tableHost,response);
            let addedCount=0;
            const rowsToAppend=rows.filter((row)=>{
                if(!keyField){
                    addedCount += 1;
                    return true;
                }

                const keyValue=row?.[keyField];
                const normalizedKey=String(keyValue ?? "");
                if(normalizedKey.length<1){
                    addedCount += 1;
                    return true;
                }

                if(seenRowKeys.has(normalizedKey)){
                    return false;
                }

                seenRowKeys.add(normalizedKey);
                addedCount += 1;
                return true;
            });

            if(addedCount<1){
                noProgressChunks += 1;
                skip += rows.length;

                // A repeated window should not immediately terminate the load.
                if(noProgressChunks >= 3 || rows.length < chunkSize){
                    break;
                }
                continue;
            }

            noProgressChunks = 0;

            aggregateRows=aggregateRows.concat(rowsToAppend);
            if(totalLoadCap>0 && aggregateRows.length>totalLoadCap){
                aggregateRows=aggregateRows.slice(0, totalLoadCap);
            }
            setChunkLoadingState(true, aggregateRows.length);
            paintProgressive(response, aggregateRows.length, step);

            if(singleChunk && step===0){
                ccr._lastSearchTruncated=rows.length>=chunkSize;
                break;
            }

            if(totalLoadCap>0 && aggregateRows.length>=totalLoadCap){
                break;
            }

            if(rows.length<chunkSize){
                break;
            }

            skip += rows.length;
        }

        const baseFinalPayload = ccr?.report && typeof ccr.report === "object"
            ? structuredClone(ccr.report)
            : (finalPayload || {});
        const normalizedFinal=ccr.normalizeReportingPayload(baseFinalPayload);
        if(!normalizedFinal?.query && ccr?.originalReport?.query){
            normalizedFinal.query=structuredClone(ccr.originalReport.query);
        }
        normalizedFinal.list=aggregateRows;
        return normalizedFinal;
        }finally{
            if(!isStale()){
                setChunkLoadingState(false, aggregateRows.length);
            }
            if(!isStale() && typeof ccr?.unobtrusiveWaitOff === "function"){
                ccr.unobtrusiveWaitOff();
            }
        }
        }finally{
            ccr.endSearchSession(searchSession);
        }
    }

    async buildTableFromReportList(query,list){
        let ccr=this;
        const currentTable=ccr.resolveTableHost();
        if(ccr.hasCcTable){
            if(!ccr.cct){
                ccr.cctId=currentTable.id;
                ccr.cct=globalThis[ccr.cctId];
            }
            if(currentTable?.tagName==="CC-TABLE"){
                let rpt=ccr.report;
                ccr.report.data=JSON.stringify(list);
                let ccTableConfig={columns: rpt.query.displayColumns,hasSort: true,
                    modelKey: rpt.modelKey,textIdentifier: rpt.textIdentifier,
                    listData: ccr.report.data,
                    actions: rpt.query.queryActions,hasCounts: rpt.query.tableHasCounts,
                    tableHasQuickSearch: rpt.query.tableHasQuickSearch, 
                    hasPagination: rpt.query.tableHasPagination,
                    pageLengthMenu: rpt.tablePageLengthMenu||"10,50,100",
                    forms: rpt.query.forms};
                await dispatch(ccr.cct,ccr,"dataFromDispatch",ccTableConfig);
                if(typeof ccr?.unobtrusiveWaitOff === "function") ccr.unobtrusiveWaitOff();
            }else if(currentTable?.tagName==="SML-TABLE"){
                currentTable.dataset.searchApi = currentTable.dataset.searchApi || ccr.dataset.searchApi || ccr.api || currentTable.dataset.api || "";
                currentTable.dataset.serverPaging = "true";
                ccr.queueOrApplySmlTablePayload(currentTable, ccr.buildSmlTablePayload(query,list));
                if(typeof ccr?.unobtrusiveWaitOff === "function") ccr.unobtrusiveWaitOff();
            }
        }else{
            let attachElement=document.querySelector("#" + ccr.dataset.idPrefix + "Table");
            attachElement.innerHTML="";
            let table={n:"table",c:"table table-striped table-hover table-bordered table-responsive",b:[]};
            let thead={n:"thead",c: "table-dark small",b: []};
            let theadRow={n:"tr",role:"row",b:[]};
            let tbody={n:"tbody",b:[]};
            let headers=Object.keys(query);
            query.displayColumns.forEach((header)=>{
                let th={n:"th",c:"",t:header.title};
                theadRow.b.push(th);
            });
            let th={n:"th",c:"text-center",t:"Actions"};
            theadRow.b.push(th);

            thead.b.push(theadRow);
            table.b.push(thead);
            list.forEach((row)=>{
                let tr={n:"tr",b:[]};
                query.displayColumns.forEach((cell)=>{
                    const rawValue=row[cell.fieldName];
                    const cellFormat=((cell?.format||cell?.Format||"")+"").toLowerCase();
                    const cellType=((cell?.dataType||cell?.DataType||cell?.type||cell?.Type||"")+"").toLowerCase();
                    const rawText=((rawValue??"")+"").trim().toLowerCase();
                    const isBoolField=cellFormat==="bool"
                                        ||cellFormat==="boolean"
                                        ||cellType==="bool"
                                        ||cellType==="boolean"
                                        ||cellType==="bit";
                    const isBoolValue=typeof(rawValue)==="boolean"
                                        ||rawText==="true"
                                        ||rawText==="false";
                    let td={n:"td",t:row[cell.fieldName]};
                    if(isBoolField || isBoolValue){
                        const isChecked=(rawValue===true || rawText==="true");
                        td={n:"td",b:[
                            {n:"span",role:"img",c:"icon-link pe-none"
                            ,ttl:"Checkbox is " + (isChecked?"selected":"not selected")
                            ,alab:"Checkbox is " + (isChecked?"selected":"not selected")
                            ,b:[
                                {n:"span",c:isChecked?"bi bi-check-square":"bi bi-square"
                                ,title:isChecked?"Is Selected":"Is Not Selected"
                                ,style:isChecked?"-webkit-text-stroke: 1px;":""}
                            ]}
                        ]};
                    }
                    tr.b.push(td);
                });
                let tdAct={n:"td",c:"text-center text-nowrap",b:[]};
                for(let action of query.queryActions){
                    let actButton={n:"a",c:action.htmlClass,
                                    ttl: action.Title,t:action.type, b:[
                                        {n:"b",c: action.icon}
                                    ]};
                    if(action.eventBypass){ 
                        if(action.eventBypass.includes("{") && action.eventBypass.includes("}")){
                            while(action.eventBypass.includes("{")){
                                let tb=ccr.textBetween(action.eventBypass,"{","}");
                                action.eventBypass=action.eventBypass.replace("{" + tb + "}",row[tb]);
                            }
                        }
                        actButton.href=action.eventBypass;
                        actButton["data-href"]=action.eventBypass;

                    }
                    tdAct.b.push(actButton);
                }
                tr.b.push(tdAct);
                tbody.b.push(tr);
            });



            table.b.push(tbody);
            attachElement.insertAdjacentHTML("afterbegin",ccr.jmlToHtml(table));
        }
    }


    //END User Actions Functions

    //Build Elements Functions

    /**
     * This runs when the main Collapse activated by the Simple Search button opens
     *
     * @memberof ccReporting
     */
    async collapseOpened(){
        let ccr=this;
        //if(check if this is already been filled)
//turned these off so loading occurs on page load (ie. connectedCallback)
        //await ccr.loadReportConfig();
        //await ccr.buildSearchTabs();
    }

    normalizeReportingPayload(data){
        let ccr=this;
        if(!data){
            return data;
        }

        const sourceQuery=data.query||data.Query;
        const hasQuery=sourceQuery&&typeof sourceQuery==="object"&&!Array.isArray(sourceQuery);
        const hasActions=Array.isArray(data.actions)||Array.isArray(data.Actions);
        if(hasQuery||hasActions){
            data.query=hasQuery?sourceQuery:{};
            const reportActions=resolveTableActions(ccr.report);
            const responseActions=resolveTableActions(data);
            const resolvedActions=reportActions.length>0?reportActions:responseActions;
            data.query.queryActions=resolvedActions;
            data.actions=resolvedActions;
            data.pageLengthMenu=data.pageLengthMenu||data?.query?.tablePageLengthMenu||"10,50,100";
            data.hasSort=true;
            data.columns=data?.query?.displayColumns||data?.columns;
            data.hasCounts=data?.query?.tableHasCounts||data?.hasCounts;
            data.tableHasQuickSearch=data?.query?.tableHasQuickSearch??data?.tableHasQuickSearch??true;
            data.hasPagination=data?.query?.tableHasPagination||data?.hasPagination;
            data.forms=data?.query?.forms||ccr?.forms||data?.forms;
        }

        if((!data.list || data.list.length<1) && data.listData){
            data.list=data.listData;
        }
        if((!data.list || data.list.length<1) && data.data){
            data.list=data.data;
        }

        return data;
    }
    
    async loadReportConfig(){
        let ccr=this;
        const suppressOverlayWait = ["true", "1", "yes"].includes(String(ccr.dataset.hideWaitOverlay || "").toLowerCase());
        const delay=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
        const isTransientNetworkReportError=(payload)=>{
            const errorText=String(payload?.errorObject||payload||"");
            return errorText.includes("Failed to fetch")
                || errorText.includes("ERR_NETWORK_CHANGED")
                || errorText.includes("ERR_CONNECTION_REFUSED");
        };

        // Client-owned pages wait for sml-engine to distribute the reviewed config.
        if (isSmlClientOwned(ccr)) {
            const engine = resolveSmlEngine(ccr);
            if (engine?.whenReady) {
                await engine.whenReady();
            }
            const localReportConfig = ccr.readLocalReportConfig()
                || (engine?.approved?.reporting ? structuredClone(engine.approved.reporting) : null);
            if (localReportConfig) {
                ccr.localConfig = localReportConfig;
                ccr.report = new smlReportDefinition(localReportConfig);
                if (!ccr.originalReport) ccr.originalReport = new smlReportDefinition(localReportConfig);
                return;
            }
            console.warn("smlReporting: data-client page has no engine-approved config yet");
            return;
        }

        const localReportConfig = ccr.readLocalReportConfig();
        //const { apiPostDirect } = await import('../ccUtilities.js');
        let dataUp = localReportConfig ? structuredClone(localReportConfig) : {};
        dataUp.requestId = ccr.id;
        dataUp.requestType="RptReportingSearch";
        if(localReportConfig){
            ccr.report = new smlReportDefinition(localReportConfig);
            if(!ccr.originalReport) ccr.originalReport = new smlReportDefinition(localReportConfig);
        }
        if (!suppressOverlayWait) {
            ccr.unobtrusiveWait("Please Wait", "Loading Report Config");
        }

        try{
            let data=null;
            for(let attempt=0; attempt<2; attempt+=1){
                data=await ccr.runReportingSearch(dataUp,{ progressive: false, singleChunk: true });

                const hasConfigColumns = Array.isArray(data?.query?.displayColumns)
                    ? data.query.displayColumns.length > 0
                    : Array.isArray(data?.query?.DisplayColumns) && data.query.DisplayColumns.length > 0;
                const hasConfigActions = Array.isArray(data?.query?.queryActions)
                    ? true
                    : Array.isArray(data?.query?.QueryActions);
                // The search already fell back to the full post, so repeating it buys nothing.
                const needsFullPost = (!hasConfigColumns || !hasConfigActions) && ccr._lastSearchUsedFullPost !== true;
                if(needsFullPost && typeof ccr.postReportingSearch === "function"){
                    const fallbackData = await ccr.postReportingSearch(dataUp);
                    if(await ccr.receiptCheckGood(fallbackData)){
                        data = fallbackData;
                    }
                }

                if(localReportConfig && data){
                    data = ccr.mergeLocalReportConfig(localReportConfig, data);
                }

                if(await ccr.receiptCheckGood(data)){
                    break;
                }

                if(attempt===0 && isTransientNetworkReportError(data)){
                    await delay(450);
                    continue;
                }
                break;
            }

            if (await ccr.receiptCheckGood(data)) {
                ccr.report=new smlReportDefinition(data);
                //ccr.report.list=JSON.parse(dataObj.list); //Done via above
                if(!ccr.originalReport) ccr.originalReport=ccr.report;
                if(ccr.hasCcTable) await ccr.buildTableFromReportList(ccr.report.query,ccr.report.list);
                // A complete, painted result set means the opening search would only repeat this trip.
                const paintedRowCount=Array.isArray(ccr.report?.list) ? ccr.report.list.length : 0;
                ccr._configLoadPaintedRows=ccr.hasCcTable && ccr._lastSearchTruncated!==true && paintedRowCount>0;
            }else{
                await showReportingMessage(data.errorObject, "Error");
            }
        }finally{
            if (!suppressOverlayWait) {
                ccr.unobtrusiveWaitOff();
            }
        }
    }


    /**
     * Builds the tabs needed for all search functions
     *
     * @memberof ccReporting
     */
    async buildSearchTabs(){
        let ccr=this;
        let collapseInterior=document.getElementById(ccr.id + "CollapseInterior");
        let simpleSearchTabId=ccr.id + "SimpleSearchTab";
        let simpleSearchContentId=ccr.id + "SimpleSearchContent";
        let reportsTabId=ccr.id + "ReportsTab";
        let reportsContentId=ccr.id + "ReportsContent";
        let advancedSearchTabId=ccr.id + "AdvancedSearchTab";
        let advancedSearchContentId=ccr.id + "AdvancedSearchContent";
        let ssTab=document.getElementById(simpleSearchTabId);
        if(!ssTab || ccr.report.requiresRefresh){
            let navTabs={i:ccr.id+"SearchTabs",n:"ul",c:"nav nav-tabs border-bottom-2 border-dark mb-3",b:[]};
            let simplerSearchTab={n:"li",c:"nav-item",b:[]};
            let SimpleSearchTabLink={n:"a",c:"nav-link sml-reporting-tab-link active",id:simpleSearchTabId
                ,href:"#" + simpleSearchContentId,role:"tab","data-bs-toggle":"tab"
                ,"aria-controls":simpleSearchContentId,"aria-selected":"true"
                ,ttl:"Open Simple Search Tab"
                ,alab:"Open Simple Search Tab (May be hidden if the SImple Search Button hasn`t been clicked"
                ,t:"Simple Search"};
            simplerSearchTab.b.push(SimpleSearchTabLink);
            navTabs.b.push(simplerSearchTab);
            if(ccr.originalReport.hasReportsTab){
                let reportsTab={n:"li",c:"nav-item",b:[]};
                let reportsTabLink={n:"a",c:"nav-link sml-reporting-tab-link",id:reportsTabId
                                        ,href:"#" + reportsContentId,role:"tab"
                                        ,"data-bs-toggle":"tab","aria-controls":reportsContentId
                                        ,ttl:"Open Reports Tab"
                                        ,alab:"Open Reports Tab (May be hidden if the SImple Search Button hasn`t been clicked"                                                        
                                        ,"aria-selected":"false",t:"Reports"};
                reportsTab.b.push(reportsTabLink);
                navTabs.b.push(reportsTab);
            }
            let advSearchTab={};
            let advSearchTabLink={};
            if(ccr.originalReport.hasCreateAdvancedReportTab){
                advSearchTab={n:"li",c:"nav-item",b:[]};
                advSearchTabLink={n:"a",c:"nav-link sml-reporting-tab-link",id:advancedSearchTabId
                                        ,href:"#" + advancedSearchContentId
                                        ,role:"tab","data-bs-toggle":"tab"
                                        ,ttl:"Advanced Reports Tab"
                                        ,alab:"Advanced Reports Tab (May be hidden if the Simple Search Button hasn`t been clicked"                                                                                            
                                        ,"aria-controls":advancedSearchContentId
                                        ,"aria-selected":"false",t:"Advanced Reports"};
                advSearchTab.b.push(advSearchTabLink);
                navTabs.b.push(advSearchTab);
            }
            navTabs.b.push({n:"li",c:"nav-item reportingClearFiltersLi mt-1 mb-2 rounded",b:[{n:"sml-reactive-button",c:"reportingClearFiltersBtn m-1 p-0",
                                                         id:ccr.id + "ResetFilters","tabindex":"0",
                                                         ttl: "Clear Filters","data-icon":"bi bi-eject-fill","data-text":"Clear Filters"}]});
            collapseInterior.insertAdjacentHTML("beforeend",ccr.jmlToHtml(navTabs));
            //Tab Content
            let tabContent={i:"searchTabContent",c:"tab-content",b:[]};
            let SimpleSearchTabContent={i:simpleSearchContentId,c:"tab-pane fade show active",
                                            role:"tabpanel","aria-labelledby":simpleSearchTabId,b:[]};
            let reportsTabContent={};
            if(ccr.originalReport.hasReportsTab){
                reportsTabContent={i:reportsContentId,c: "tab-pane fade p-2", //"tab-pane fade p-2",
                                    s: "min-height:100px;",//background-color:BlanchedAlmond;",
                                    role:"tabpanel","aria-labelledby":reportsTabId,b:[
                                        {i: ccr.id + "ReportsMainContent",c:"container-fluid p-0 m-0",b:[]}
                                    ]};
            }
            let advancedSearchTabContent
            if(ccr.report.hasCreateAdvancedReportTab){
                advancedSearchTabContent={i:advancedSearchContentId,c:"tab-pane fade",
                                            role:"tabpanel","aria-labelledby":advancedSearchTabId,b:[
                                                {n:"div",i: ccr.id + "AdvancedSearchDiv",c:"container-fluid bg-light p-2",b:[]}
                                        ]};
            }
            tabContent.b.push(SimpleSearchTabContent);
            if(ccr.originalReport.hasReportsTab)tabContent.b.push(reportsTabContent);
            if(ccr.report.hasCreateAdvancedReportTab)tabContent.b.push(advancedSearchTabContent);
            collapseInterior.insertAdjacentHTML("beforeend",ccr.jmlToHtml(tabContent));
            ccr.upgradeButtons(collapseInterior);
        }
        let tabsParent = document.getElementById(ccr.id + "SearchTabs");
        let searchTabsEle = tabsParent ? Array.from(tabsParent.querySelectorAll('a[data-bs-toggle="tab"]')) : [];
        on(searchTabsEle,'shown.bs.tab', async function (event) {
            //event.target // newly activated tab
            //event.relatedTarget // previous active tab
            if(event.target.id===reportsTabId){
                if(ccr.originalReport.hasReportsTab && !ccr._reportsUiLoaded){
                    ccr.loadingSwitch(true);
                    try{
                        await ccr.ensureReportsUiLoaded();
                    }finally{
                        ccr.loadingSwitch(false);
                    }
                }
                if(ccr.loadingReports && ccr.originalReport.hasReportsTab){ccr.ccrs.showReportsLoading();}else{ccr.ccrs.showReportsLoaded();}
            }
            if(event.target.id===advancedSearchTabId && ccr.report.hasCreateAdvancedReportTab){
                if(!ccr._advancedUiLoaded){
                    ccr.loadingSwitch(true);
                    try{
                        await ccr.ensureAdvancedUiLoaded();
                    }finally{
                        ccr.loadingSwitch(false);
                    }
                }
                if(ccr.loadingReports){ccr.ccas.showAdvancedReportsLoading();}else{ccr.ccas.showAdvancedReportsLoaded();}
            }
        })


        globalThis.catsC?.ccCompliance?.run?.();

    }

    loadingSwitch(isOn){
        let ccr=this;
        ccr.loadingReports=isOn;
        let activTab=ccr.getActiveTab();
        const hasReportsUi=!!document.querySelector("#" + ccr.id + "ReportsContent");
        const hasAdvancedUi=!!document.querySelector("#" + ccr.id + "AdvancedSearchContent");
        // switch(activTab.id){
        //     case ccr.id + "SimpleSearchTab":
        //         //isOn?ccr.ccss.showReportsLoading():ccr.ccss.showReportsLoaded();
        //         break;
        //     case ccr.id + "ReportsTab":
        //         isOn?ccr.ccrs.showReportsLoading():ccr.ccrs.showReportsLoaded();
        //         break;
        //     default: //Advanced Search
        //         isOn?ccr.ccas.showAdvancedReportsLoading():ccr.ccas.showAdvancedReportsLoaded();
        //         break;
        // }
        if(isOn){
            if(ccr.originalReport?.hasReportsTab && hasReportsUi) ccr.ccrs.showReportsLoading();
            if(hasAdvancedUi) ccr.ccas.showAdvancedReportsLoading();
        }else{
            if(ccr.originalReport?.hasReportsTab && hasReportsUi) ccr.ccrs.showReportsLoaded();
            if(hasAdvancedUi) ccr.ccas.showAdvancedReportsLoaded();
        }

    }

    getActiveTab(){
        let ccr=this;
        let tabsParent = document.getElementById(ccr.id + "SearchTabs");
        let searchTabsEle = tabsParent ? Array.from(tabsParent.querySelectorAll('a[data-bs-toggle="tab"]')) : [];
        let activeTab=null;
        searchTabsEle.forEach((tab)=>{
            if(tab.classList.contains("active")){
                activeTab=tab;
            }
        });
        return activeTab;
    }



    //END Build Elements Functions


    //Documentation Functions Functions
    /**
     * Creates the documentation card before the spa element
     *
     * @memberof ccReporting
     */
        showDocumentation(){
            let ccr=this;
            if(!document.querySelector("#reportingDocs")){
                ccr.insertAdjacentHTML('beforebegin', ccr.jmlToHtml(ccr.makeDocumentation()));
                document.querySelector("#reportingDocsButton").addEventListener("click",()=>{ ccr.hideDocumentation();});
              }
        }
    
        /**
         * Hide the Documentation (removes the documentation card)
         *
         * @memberof ccReporting
         */
        hideDocumentation(){
            let ccr=this;
            document.querySelector("#reportingDocs").remove();
        }
    /**
     * this generates the documentation for this element in the parent of the element
     *
     * @return {*} 
     * @memberof ccReporting
     */
    makeDocumentation(){
        let ccr=this;
        let docCard={i:"reportingDocs",c:"card",b:[]};
        let docCardHead={c:"card-header h3",t:"sml &lt;sml-reporting&gt; Report System Section for Creating, Storing, Recalling, and Running Reports",b:[]};
        docCardHead.b.push({n:"button",type:"button",i:"reportingDocsButton",c:"btn-close float-end","aria-label":"Close"});
        docCard.b.push(docCardHead);
        docCard.b.push(ccr.makeAlertJML("DocDisable","To remove this div remove the cc-data-documentation=\"true\" attribute from your cc-reporting element!","alert alert-info alert-dismissible fade show"))
        let docCardBody={c:"card-body",b:[]};
        let cardTitle={n:"h5",c:"card-title",t:"Element Attributes"};
        docCardBody.b.push(cardTitle);
        docCardBody.b.push({n:"p",c:"m-0 p-0",t:"&lt;cc-reporting details on tags follow:"});
        docCardBody.b.push({n:"p",c:"m-0 ms-5 p-0",t:"&Tab;&Tab; id=\"someIdName\" The base id for this reporting element. If you do not set this it will be a the container id prefix plus 'ReportingSystem'"});
        docCardBody.b.push({n:"p",c:"m-0 ms-5 p-0",t:"&Tab;&Tab;data-documentation=\"true\"  Shows the Documentation for the attributes and events of a cc-reporting "});
        docCardBody.b.push({n:"p",c:"m-0 ms-5 p-0",t:"&Tab;&Tab;data-api=this is the api to be used for the reporting system. If you do not set this it will default to " + ccr.dataset.api});
        let hr={n:"hr",style:"height: 12px;border: 0;box-shadow: inset 0 12px 12px -12px rgba(0, 0, 0, 0.5);"};
        docCardBody.b.push(hr);
        docCard.b.push(docCardBody);
        //functions
        let cardTitle2 = { n: "h5", c: "card-title", t: "Functions" };
        docCardBody.b.push(cardTitle2);
        docCardBody.b.push({n:"p",c:"m-0 ms-2 p-0",t:"&Tab;showDocumentation() -- Show the documentation for this component"});
        docCardBody.b.push({n:"p",c:"m-0 ms-2 p-0",t:"&Tab;hideDocumentation() -- Hide the documentation for this component"});
        //Stub Functions (if any)        
        docCardBody.b.push({n: "pre", c: "m-0 p-0",t: "&#64;* Stub Function(s): ",});
        docCard.b.push(docCardBody);        
        return docCard;
      }
      
    //END Documentation Functions Functions

        /**
         * Static documentation method for ccReporting class
         * @return {Object} Comprehensive documentation object for ccReporting
         * @static
         * @memberof ccReporting
         */
        static documentation() {
            return {
                class: "ccReporting",
                type: "Class",
                namespace: "SML.Reporting",
                namespaceUrl: "/js/global/sml/Reporting/smlReporting.js",
                source: "ccReporting.js",
                sourceUrl: "/js/global/sml/Reporting/smlReporting.js",
                description: "The `ccReporting` web component manages the creation, storage, recall, and execution of reports in the CATS system. It provides UI builders, event wiring, and integration with reporting, search, and advanced modules.",
                inherits: "HTMLElement",
                language: "JavaScript",
                attributes: [
                    { name: "id", description: "Unique identifier for the reporting component.", type: "string" },
                    { name: "data-documentation", description: "If true, displays documentation for the component.", type: "boolean" }
                ],
                methods: [
                    { name: "constructor", description: "Initializes the ccReporting instance and sets up references.", params: [{ name: "config", type: "object" }], returns: "ccReporting" },
                    { name: "connectedCallback", description: "Lifecycle callback fired when component is inserted into DOM. Sets up reporting, event wiring, and UI.", params: [], returns: "Promise<void>" }
                ],
                properties: [
                    { name: "queryDescription", description: "Description of the current query.", type: "string" },
                    { name: "originalReport", description: "Reference to the original report object.", type: "object|null" },
                    { name: "reports", description: "Array of report objects.", type: "array" },
                    { name: "loadingReports", description: "Whether reports are currently loading.", type: "boolean" },
                    { name: "currentReport", description: "Reference to the current report object.", type: "object|null" },
                    { name: "hasCcTable", description: "Whether a cc-table is present on the page.", type: "boolean" },
                    { name: "ccTableId", description: "ID of the cc-table element.", type: "string|null" }
                ],
                events: [],
                observedAttributes: ["data-documentation"],
                dependencies: [
                    "smlReporting.js, smlSimpleSearch.js, smlSavedReports.js, smlAdvancedReports.js, smlAutoComplete.js, smlUtils.js"
                ],
                exampleUsage: `<cc-reporting id=\"myReporting\"></cc-reporting>`,
                notes: [
                    "Manages reporting UI, event wiring, and integration with reporting modules in the CATS system.",
                    "Provides lifecycle management, documentation display, and reporting workflows.",
                    "Extends HTMLElement for use as a custom web component."
                ]
            };
        }

}


if (!customElements.get("sml-reporting")) {
    customElements.define("sml-reporting", smlReporting);
}

document.addEventListener("DOMContentLoaded",async ()=> {
    window._ = document;
});

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
