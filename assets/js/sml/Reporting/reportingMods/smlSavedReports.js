//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
/* eslint-disable no-undef */
/* eslint-disable no-console */
/*!
 * smlSavedReports --- SML reporting module for Reports Tab functions
 * Public Domain
 * Licensed Copyright Law of the United States of America, Section 105 (https://www.copyright.gov/title17/92chap1.html#105)
 * Per hoc, facies, scietis quod ille miserit me ut facerem universa quae cernitis et factis: Non est mecum!
 * Published by: Dominic Roche of OIT/IUSG/DASM on 04/18/2026
 */
"use strict";
import smlReportDefinition from '../smlReportDefinition.js';
import { openReportingConfigModal, queryInteractiveButtons, showReportingMessage } from '../smlReportingShared.js';
import { apiPost, jmlToHtml, receiptCheckGood, unobtrusiveWait, unobtrusiveWaitOff } from '../../../sml/smlUtils.js';
export default class smlSavedReports {

    constructor(ccr) {
        let smlsr = this;
        smlsr.ccr=ccr;
        smlsr.api = smlsr.ccr.api; //'/' + ccr.dataset.idPrefix + '/' + ccr.dataset.idPrefix 
        //             + (ccr.dataset.roleApiAddon?ccr.dataset.roleApiAddon:"")
        //             + 'ReportingQ/'
        smlsr.ccas=ccr.ccas;
        smlsr.reportsFilterButtons=undefined;
        smlsr._gettingReports=false;
        smlsr._getReportsPromise=null;
        smlsr._reportsHydrated=false;
        smlsr.unobtrusiveWait=unobtrusiveWait;
        smlsr.unobtrusiveWaitOff=unobtrusiveWaitOff;
    }

    normalizeReportDescription(description){
        let normalizer=this.ccr?.ccss?.normalizeQueryDescription;
        if(typeof normalizer!=="function") return description||"";
        return normalizer.call(this.ccr.ccss,description||"");
    }

    applyNormalizedDescription(rpt){
        if(!rpt) return rpt;
        rpt.description=this.normalizeReportDescription(rpt.description);
        return rpt;
    }
    
    
    //==============================================BUILDERS===================================================
    async buildReportsTabContent(){
        let smlsr=this;
        let reportsElement=document.querySelector("#" + smlsr.ccr.id + "ReportsContent");
        let reportsMainContent=document.querySelector("#" + smlsr.ccr.id +  "ReportsMainContent");
        //let reportsMainContent={i: smlsr.ccr.id + "ReportsMainContent",c:"container-fluid p-0 m-0",b:[]};
        //reports actions (search and such)
        let reportActionBar=document.querySelector("#" + smlsr.ccr.id + "ReportActionBar");
        if(!reportActionBar){
            let reportActionBar={i: smlsr.ccr.id + "ReportActionBar",
                c:"d-flex justify-content-between bg-light p-1 border-bottom border-3 border-dark",b:[]};
            let reportActionSearch={i: smlsr.ccr.id + "ReportActionSearch",c:"d-flex",b:[
                {n:"input",i:smlsr.ccr.id + "RASSearch",c:"form-control",type:"search"
                 ,ttl: "Search for Reports",alab: "Search for Reports"
                 ,p:"🔎 Search Reports"},
                {n:"button",i:smlsr.ccr.id + "RASSearchPrivate",c:"btn btn-sm btn-light border-dark border-1","data-access":"Private","data-icon":"bi bi-incognito",type:"button",ttl:"Private"},
                {n:"button",i:smlsr.ccr.id + "RASSearchPublic",c:"btn btn-sm btn-light border-dark border-1","data-access":"Public",type:"button","data-icon":"bi bi-globe",ttl:"Public"},
                {n:"button",i:smlsr.ccr.id + "RASSearchAll",c:"btn btn-sm btn-dark border-dark border-1","data-access":"all",type:"button","data-icon":"bi bi-thermometer-high",ttl:"All"},
            ]};
            let reportDisplayButtons={i: smlsr.ccr.id + "ReportDisplayButtons",role:"group",c:"ms-3 btn-group",b:[]};
            //this will need a field in RptReport like defaultReportDisplay to allow user control
            let dummyReportDefault="buttons";
            let buttonsChoiceButton={n:"button",type:"button",i: smlsr.ccr.id + "ReportDisplayChoice",c:"btn btn-light fw-bolder",title:"Display Reports",alab:"Display Reports","data-bs-toggle":"dropdown","aria-expanded":"false","data-display":"buttons",b:[{c:"bi bi-menu-button float-start"}]};
            let tableChoiceButton={n:"button",type:"button",i: smlsr.ccr.id + "ReportDisplayChoice",c:"btn btn-light fw-bolder",title:"Display Reports",alab:"Display Reports","data-bs-toggle":"dropdown","aria-expanded":"false","data-display":"table",b:[{c:"bi bi-table float-start"}]};
            let reportDisplayChoice=(dummyReportDefault==="buttons"?buttonsChoiceButton:tableChoiceButton);
            reportDisplayButtons.b.push(reportDisplayChoice);
            let buttonsChoiceUl={n:"ul",i: smlsr.ccr.id + "ReportDisplayChoiceUl",c:"dropdown-menu",b:[]};
            buttonsChoiceUl.b.push({n:"li",s:"min-width: 0;",b:[{n:"button",type:"button",i: smlsr.ccr.id + "ReportDisplayChooseButtons",c:"dropdown-item btn btn-lightgrey w-100",
            "data-display":"buttons",t:"As Buttons",b:[{c:"bi bi-menu-button float-start me-2"}]}]});
            buttonsChoiceUl.b.push({n:"li",s:"min-width: 0;",b:[{n:"button",type:"button",i: smlsr.ccr.id + "ReportDisplayChooseTable",c:"dropdown-item btn btn-lightgrey w-100",
            "data-display":"table",t:"As Table",b:[{c:"bi bi-table float-start me-2"}]}]});
            reportDisplayButtons.b.push(buttonsChoiceUl);
            let reportActionSpacer={i: smlsr.ccr.id + "ReportActionSpacer",c:"w-25",b:[
                //This was to fix the records
                //{n:"button",i:smlsr.ccr.id + "FixDataIds",c:"btn btn-sm btn-warning text-dark border-dark border-1",type:"button",t:"Fix Ids"},
            ]};
            let reportUberFunctions={i: smlsr.ccr.id + "ReportUberFunctions",c:"flex-fill",b:[]}
            reportActionBar.b.push(reportActionSearch,reportDisplayButtons,reportActionSpacer,reportUberFunctions);
            //reportsMainContent.b.push(reportActionBar);
            reportsMainContent.insertAdjacentHTML("beforeend",jmlToHtml(reportActionBar));
            //reports report info and actions bar
            let currentReportBar={i: smlsr.ccr.id + "CurrentReportBar",c:"d-none justify-content-between p-1 border border-4 border-dark",
                                    "data-report-identifier":"-1",s:"background: Gainsboro;",b:[]};
            currentReportBar.b.push({i: smlsr.ccr.id + "CurrentReportBarTitleEnv",c: "d-inline",s: "min-width:20%;",b:[
                {i: smlsr.ccr.id + "CurrentReportBarTitleLabel",c:"float-start m-0 py-1 px-2 fw-bolder text-center", t:"Title: "},
                {i: smlsr.ccr.id + "CurrentReportBarTitle",c:"float-end m-0 py-1 px-2 border-2 border-end border-secondary h5 text-center"}
            ]});
            currentReportBar.b.push({i: smlsr.ccr.id + "CurrentReportBarDescEnv",s: "min-width:40%;",c: "d-inline",b:[
                {i: smlsr.ccr.id + "CurrentReportBarDescLabel",c:"float-start m-0 py-1 px-2 fw-bolder",t:"Description: "},
                {i: smlsr.ccr.id + "CurrentReportBarDesc",c:"float-end m-0 py-1 px-2 border-2 border-end border-secondary"}
            ]});
            let currentReportBarFunctions={i: smlsr.ccr.id + "CurrentReportBarFunctions",c:"m-0 py-0 px-2",b:[]};            
            currentReportBar.b.push(currentReportBarFunctions)
            //reportsMainContent.b.push(currentReportBar);
            reportsMainContent.insertAdjacentHTML("beforeend",jmlToHtml(currentReportBar));
            let reportsListContainer={i: smlsr.ccr.id + "ReportsListContainer",s: "overflow: scroll;max-height:250px;table-layout:fixed;",c:"d-flex justify-content-start flex-wrap p-0 m-0",b:[]};
            //reportsMainContent.b.push(reportsListContainer);
            reportsMainContent.insertAdjacentHTML("beforeend",jmlToHtml(reportsListContainer));
            smlsr.ccr.upgradeButtons(reportsMainContent);

        }
        smlsr.wireReports();
    }

    async buildSaveReportForm(formType){
        let smlsr=this;
        if(!formType) formType="Create";
        let formFunction=formType==="Create"?"Save":"Update";
        let reportsElement=document.querySelector("#" + smlsr.ccr.id + "ReportsContent");
        let reportsMainContent=document.querySelector("#" + smlsr.ccr.id +  "ReportsMainContent");
        reportsMainContent.classList.add("d-none");

        let saveReportFormContainer={i: smlsr.ccr.id + "SaveReportFormContainer",c:"container-fluid p-0 m-0",b:[]};
        let saveReportForm={i: smlsr.ccr.id + "SaveReportForm",c:"form",b:[]};
        let formTitleDiv={i: smlsr.ccr.id + "SaveReportRow",c:"d-flex",b:[
            {i: smlsr.ccr.id + "SaveReportFormName",c:"flex-fill p-2 h3 text-center border-1 border-dark shadow-lg",t:formFunction+" Your Report"},
            {i: smlsr.ccr.id + "SaveReportFormClose",c:"p-2",
                    b:[{n:"button",i: smlsr.ccr.id + formType + "ReportFormCloseButton",c:"btn btn-sm btn-secondary",
                        b:[{c:"bi bi-x-square"}]}]}
        ]};
        //Start Columns
        let formNameDiv={i: smlsr.ccr.id + "SaveReportFormName",c:"d-flex p-1 border-2 border-top border-dark",b:[]};
        let formNameLabel={n:"label",i: smlsr.ccr.id + "SaveReportFormNameLabel",s:"text-align:right;background-color: Gainsboro;",
                            c:"w-25 fw-bolder form-label pt-1 pe-2 me-2",t:"Report Name"};
        let formNameInput={n:"input",i: smlsr.ccr.id + "SaveReportFormNameInput",c:"form-control",type:"text",placeholder:"Enter Report Name"};
        formNameDiv.b.push(formNameLabel,formNameInput);
        let formDescriptionDiv={i: smlsr.ccr.id + "SaveReportFormDescription",c:"d-flex p-1 border-2 border-top border-dark",b:[]};
        let formDescriptionLabel={n:"label",i: smlsr.ccr.id + "SaveReportFormDescriptionLabel",s:"text-align:right;background-color: Gainsboro;",
                                    c:"w-25 fw-bolder form-label pt-1 pe-2 me-2",t:"Report Description"};
        let formDescriptionInput={n:"textarea",i: smlsr.ccr.id + "SaveReportFormDescriptionInput",c:"flex-fill form-control",
                                    type:"text",placeholder:"Enter Report Description",
                                    t: ""};
        formDescriptionDiv.b.push(formDescriptionLabel,formDescriptionInput);
        let formAccessDiv={i: smlsr.ccr.id + "SaveReportFormAccess",c:"d-flex p-1 border-2 border-top border-dark",b:[]};
        let formAccessLabel={n:"label",i: smlsr.ccr.id + "SaveReportFormAccessLabel",s:"text-align:right;background-color: Gainsboro;",
                                c:"w-25 fw-bolder form-label pt-1 pe-2 me-2",t:"Access Modifier"};
        let formAccessInput={n:"select",i: smlsr.ccr.id + "SaveReportFormAccessInput",c:"flex-fill form-select",b:[
            {n:"option",i: smlsr.ccr.id + "SaveReportFormAccessInputSelect",c:"form-select",value:"",t:" ~~SELECT~~"},
            {n:"option",i: smlsr.ccr.id + "SaveReportFormAccessInputPrivate",c:"form-select",value:"Private",t:"Private"},
            {n:"option",i: smlsr.ccr.id + "SaveReportFormAccessInputPublic",c:"form-select",value:"Public",t:"Public"},
        ]}
        formAccessDiv.b.push(formAccessLabel,formAccessInput);
        let formSaveButtonDiv={i: smlsr.ccr.id + "SaveReportFormSaveButtonDiv",c:"d-flex p-1 justify-content-center",b:[]};
        let formSaveButton={n:"button",i: smlsr.ccr.id + "SaveReportFormSaveButton",c:"btn btn-sm btn-dark",t: formType + " Report"};
        formSaveButtonDiv.b.push(formSaveButton);
        saveReportForm.b.push(formTitleDiv,formNameDiv,formDescriptionDiv,formAccessDiv,formSaveButtonDiv);
        saveReportFormContainer.b.push(saveReportForm);
        reportsElement.insertAdjacentHTML("beforeend",jmlToHtml(saveReportFormContainer));
        smlsr.ccr.upgradeButtons(reportsElement);
    }

    fillSaveReportForm(formType,data){
        let smlsr=this;
        let saveReportFormNameInput=document.querySelector("#" + smlsr.ccr.id + "SaveReportFormNameInput");
        let saveReportFormDescriptionInput=document.querySelector("#" + smlsr.ccr.id + "SaveReportFormDescriptionInput");
        let saveReportFormAccessInput=document.querySelector("#" + smlsr.ccr.id + "SaveReportFormAccessInput");
        let currentQueryDescription=smlsr.normalizeReportDescription(smlsr.ccr.ccss.getQueryText());
        if(formType==="Create"){
            saveReportFormNameInput.value="";
            saveReportFormDescriptionInput.value=currentQueryDescription;
            saveReportFormAccessInput.value="";
        }else{
            saveReportFormNameInput.value=data.reportName;
            saveReportFormDescriptionInput.value=currentQueryDescription;
            saveReportFormAccessInput.value=data.accessModifier;
        }
    }

    //==============================================BUILDERS END===============================================

    //==============================================WIRES======================================================

    async wireReports(){
        let smlsr=this;
        let reportsElement=document.querySelector("#" + smlsr.ccr.id + "ReportsContent");
        let reportActionBar=document.querySelector("#" + smlsr.ccr.id + "ReportActionBar");
        let reportActionSearch=document.querySelector("#" + smlsr.ccr.id + "RASSearch");
        let reportActionSearchPrivate=document.querySelector("#" + smlsr.ccr.id + "RASSearchPrivate");
        let reportActionSearchPublic=document.querySelector("#" + smlsr.ccr.id + "RASSearchPublic");
        let reportActionSearchAll=document.querySelector("#" + smlsr.ccr.id + "RASSearchAll");
        let reportDisplayChoice=document.querySelector("#" + smlsr.ccr.id + "ReportDisplayChoice");
        let reportDisplayChooseButtons=document.querySelector("#" + smlsr.ccr.id + "ReportDisplayChooseButtons");
        let reportDisplayChooseTable=document.querySelector("#" + smlsr.ccr.id + "ReportDisplayChooseTable");
        let fixIdsButton=document.querySelector("#" + smlsr.ccr.id + "FixDataIds");
        if(!smlsr.reportsFilterButtons) smlsr.reportsFilterButtons=Array.from(document.querySelectorAll("#" + smlsr.ccr.id + "ReportActionSearch>button, #" + smlsr.ccr.id + "ReportActionSearch>sml-reactive-button"));
        for(let btn of smlsr.reportsFilterButtons){
            btn.addEventListener("click",async (e)=>{
                smlsr.reportsFilterButtonsAction(e);
                smlsr.searchReports();
            })
        }
        //Search Reports
        let rASSearch=document.querySelector("#" + smlsr.ccr.id + "RASSearch");
        rASSearch.addEventListener("keyup",async function(){
            smlsr.searchReports();
        });
        rASSearch.addEventListener("search",async function(){
            smlsr.searchReports();
        });
        
        reportDisplayChooseButtons.addEventListener("click",async (e)=>{
            if(reportDisplayChoice.firstChild.classList.contains("bi-table")){
                reportDisplayChoice.firstChild.classList.remove("bi-table");
                reportDisplayChoice.firstChild.classList.add("bi-menu-button");
                reportDisplayChoice.dataset.display="buttons";
                smlsr.displayReportsByButtons();
            }
        });

        reportDisplayChooseTable.addEventListener("click",async (e)=>{
            if(reportDisplayChoice.firstChild.classList.contains("bi-menu-button")){
                reportDisplayChoice.firstChild.classList.remove("bi-menu-button");
                reportDisplayChoice.firstChild.classList.add("bi-table");
                reportDisplayChoice.dataset.display="table";
                smlsr.displayReportsByTable();
            }
        });
    }

    async wireSaveReportForm(formType,data){
        let smlsr=this;
        let saveReportFormSaveButton=document.querySelector("#" + smlsr.ccr.id + "SaveReportFormSaveButton");
        let reportFormCloseButton=document.querySelector("#" + smlsr.ccr.id + formType + "ReportFormCloseButton");
        saveReportFormSaveButton.addEventListener("click",async ()=>{
            saveReportFormSaveButton.disabled=true;
            smlsr.saveReport(formType,data)
        });
        reportFormCloseButton.addEventListener("click",async ()=>{
            let reportForm= document.querySelector("#" + smlsr.ccr.id + "SaveReportForm");
            let reportFormContainer=document.querySelector("#" + smlsr.ccr.id + "SaveReportFormContainer");
            let reportsElement=document.querySelector("#" + smlsr.ccr.id + "ReportsContent");
            let reportsMainContent=document.querySelector("#" + smlsr.ccr.id +  "ReportsMainContent");
            reportsMainContent.classList.remove("d-none");
            if(reportFormContainer){
                reportFormContainer.remove();
            }else{
                reportForm.remove();
            }
            let rptUberFuncs=document.querySelector("#" + smlsr.ccr.id + "ReportUberFunctions");
            rptUberFuncs.innerHTML="";

        })


    }

    //==============================================WIRES END==================================================

    
    //==============================================FUNCTIONS==================================================


    //----------------------------------------------------Reports Bar Stuff


    /**
     * Handles making the active button dark
     *
     * @param {*} e event
     * @memberof ccReports
     */
    reportsFilterButtonsAction(e){
        let smlsr=this;
        if(!smlsr.reportsFilterButtons) smlsr.reportsFilterButtons=Array.from(document.querySelectorAll("#" + smlsr.ccr.id + "ReportActionSearch>button, #" + smlsr.ccr.id + "ReportActionSearch>sml-reactive-button"));
        //console.log(e.currentTarget);
        for(let btn of smlsr.reportsFilterButtons){
            if(btn.id===e.currentTarget.id){
                btn.classList.remove("btn-light","text-dark");
                btn.classList.add("btn-dark","text-light");
            }else{
                btn.classList.add("btn-light","text-dark");
                btn.classList.remove("btn-dark","text-light");
            }
        }
    }

    //----------------------------------------------------Reports Bar Stuff END

    //----------------------------------------------------Save Reports
    async openSaveReportForm(formType,data){
        let smlsr=this;
        smlsr.buildSaveReportForm(formType);
        smlsr.fillSaveReportForm(formType,data);
        smlsr.wireSaveReportForm(formType,data);

    }


    async saveReport(formType,rpt){
        let smlsr=this;
        if(!rpt) rpt={};
        let saveReportFormSaveButton=document.querySelector("#" + smlsr.ccr.id + "SaveReportFormSaveButton");
        saveReportFormSaveButton.disabled=true;
        let saveButton=document.querySelector("#" + smlsr.ccr.id + "OpenSaveReportFormButton");
        saveButton.setAttribute("disabled", "");
        let reportForm= document.querySelector("#" + smlsr.ccr.id + "SaveReportForm");
        let reportFormContainer=document.querySelector("#" + smlsr.ccr.id + "SaveReportFormContainer");
        let reportName=document.querySelector("#" + smlsr.ccr.id + "SaveReportFormNameInput").value;
        let reportDescription=smlsr.normalizeReportDescription(document.querySelector("#" + smlsr.ccr.id + "SaveReportFormDescriptionInput").value);
        let reportAccess=document.querySelector("#" + smlsr.ccr.id + "SaveReportFormAccessInput").value;
        let quickSearch=document.querySelector("#" + smlsr.ccr.id + "QuickSearch").value;
        for(let input of smlsr.getSimpleSearchInputs()){
            smlsr.updateReportFilterValue(rpt,input);
        }
        let report=new smlReportDefinition({"reportName":reportName,
                                 "quickSearch": quickSearch,
                                 "description": reportDescription,
                                 "accessModifier":reportAccess,
                                 "addUserIdentifier": cso.UserIdentifier,
                                 "addUserName": cso.CurrentEmployee.Moniker,
                                 "alias": smlsr.ccr?.dataset?.idPrefix || smlsr.ccr?.id || "",
                                 "appIdentifier": cso.CurrentApp.AppIdentifier,
                                 "reportIdentifier": formType==="Create"?-1:rpt.reportIdentifier,
                                 filters: rpt.filters,
                                });
        report.requestId = smlsr.ccr.id;
        report.requestType=formType==="Create"?"ReportSave":"ReportUpdate";
        delete report.list
        //delete report.filters;
        console.log(report);
        smlsr.ccr.unobtrusiveWait("Please Wait", "Searching");
        let data = await apiPost(smlsr.api,JSON.stringify(report),"JSON")
        smlsr.ccr.report.requiresRefresh=true;
        if (await receiptCheckGood(data)) {
            //all good
            let reportsElement=document.querySelector("#" + smlsr.ccr.id + "ReportsContent");
            let reportsMainContent=document.querySelector("#" + smlsr.ccr.id +  "ReportsMainContent");
            let reportTitle=document.querySelector("#" + smlsr.ccr.id + "CurrentReportBarTitle");
            let reportDesc=document.querySelector("#" + smlsr.ccr.id + "CurrentReportBarDesc");
            data.description=smlsr.normalizeReportDescription(data.description);
            reportsMainContent.classList.remove("d-none");
            reportTitle.textContent = data.reportName;
            reportDesc.textContent = data.description;
            if(reportFormContainer){
                reportFormContainer.remove();
            }else{
                reportForm.remove();
            }
            await smlsr.loadReports();
            if(formType==="Update" && rpt?.reportIdentifier>0){
                smlsr.refreshCurrentReportBar(rpt.reportIdentifier);
            }
            let rptUberFuncs=document.querySelector("#" + smlsr.ccr.id + "ReportUberFunctions");
            rptUberFuncs.innerHTML="";
        }else{
            saveButton.removeAttribute("disabled");
            await showReportingMessage(data.errorObject, "Error");
        }
        smlsr.ccr.unobtrusiveWaitOff();
    }

    //----------------------------------------------------Save Reports END

    
    async changeFavorite(rpt){
        let smlsr=this;
        smlsr.ccr.unobtrusiveWait("Toggling Favorite", "Deleting");
        let report=new smlReportDefinition({"appIdentifier": cso.CurrentApp.AppIdentifier});
        delete rpt.list;
        report.fillFromReportDefinition(rpt);
        report.requestId = smlsr.ccr.id + rpt.reportIdentifier;
        report.requestType="ReportUpdate";
        report.reportIdentifier=rpt.reportIdentifier;
        report.isFavorite=report.isFavorite?false:true;
        rpt.isFavorite=report.isFavorite;
        delete report.list;
        delete report.List;
        report.filters=rpt.filters;
        let data = await apiPost(smlsr.api, JSON.stringify(report), "json");
        smlsr.ccr.report.requiresRefresh=true;
        if (await smlsr.ccr.receiptCheckGood(data)) {
            //all good
            smlsr.reportExit();
            await smlsr.loadReports();
            let rptUberFuncs=document.querySelector("#" + smlsr.ccr.id + "ReportUberFunctions");
            rptUberFuncs.innerHTML="";

            let reportDisplayChoice=document.querySelector("#" + smlsr.ccr.id + "ReportDisplayChoice");
            let ico=report.isFavorite?"bi bi-star-fill":"bi bi-star";
            if(reportDisplayChoice.dataset.display==="buttons"){
                let favIcon=document.querySelector("#" + smlsr.ccr.id + "FavReportCardButton" + rpt.reportIdentifier);
                favIcon.class=ico;
            }else{

            }

            smlsr.ccr.unobtrusiveWaitOff();
        }else{
            await showReportingMessage(data.errorObject, "Error");
            smlsr.ccr.unobtrusiveWaitOff();
        }


    }



    //----------------------------------------------------Load Reports


    /**
     * This simply pulls the reports from the server.  It was separated because the 
     * Advanced Reports needs this as well
     *
     * @memberof ccReports
     */
    async getReports(){
        let smlsr=this;
        if (smlsr._getReportsPromise) {
            await smlsr._getReportsPromise;
            return;
        }

        const requiresRefresh=!!smlsr.ccr?.report?.requiresRefresh;
        if(!smlsr._reportsHydrated || requiresRefresh){
            smlsr._getReportsPromise=(async ()=>{
            smlsr._gettingReports=true;
            try {
                let reportsMainContent=document.querySelector("#" + smlsr.ccr.id +  "ReportsMainContent");
                let dataUp={};
                dataUp.requestId = smlsr.ccr.id;
                dataUp.requestType="ReportsLoad";
                smlsr.ccr.loadingSwitch(true);
                let data = await apiPost(smlsr.api,JSON.stringify(dataUp),"JSON")
                if(typeof data==="string") data=JSON.parse(data);
                if (await receiptCheckGood(data)) {
                    if(reportsMainContent) reportsMainContent.classList.remove("d-none");
                }else{
                    await showReportingMessage(data.errorObject, "Error");
                    smlsr.ccr.loadingSwitch(false);
                    smlsr.ccr.reports=[];
                    smlsr._reportsHydrated=false;
                    return;
                }
                // Successful load response means cache is current, even if list is empty.
                if(smlsr.ccr?.report) smlsr.ccr.report.requiresRefresh=false;
                smlsr._reportsHydrated=true;
                smlsr.ccr.loadingSwitch(false);
                //SO the Report Table is just the container.   Actual data is part of data.data
                const reportRows = Array.isArray(data)
                    ? data
                    : (Array.isArray(data?.data) ? data.data : (Array.isArray(data?.Data) ? data.Data : []));
                if (!Array.isArray(reportRows) || reportRows.length < 1) {
                    smlsr.ccr.reports=[];
                    return;
                }
                let dataData=[];
                for(let report of reportRows){
                    let rptData=JSON.parse(report.Data||report.data||"{}");
                    rptData.reportRecord={};
                    rptData.reportRecord.reportIdentifier=report.ReportIdentifier
                    rptData.reportRecord.name=report.Name
                    rptData.reportRecord.description=report.Description
                    rptData.reportRecord.taskDefinitionIdentifier=report.TaskDefinitionIdentifier
                    rptData.reportRecord.alias=report.Alias
                    rptData.reportRecord.accessModifier=report.AccessModifier
                    rptData.reportRecord.roleName=report.RoleName
                    rptData.reportRecord.isFavorite=report.IsFavorite
                    rptData.reportRecord.isDefault=report.IsDefault
                    rptData.reportRecord.isAutoRun=report.IsAutoRun
                    rptData.reportRecord.isAdvanced=report.IsAdvanced
                    rptData.reportRecord.addTimeStamp=report.AddTimeStamp
                    rptData.reportRecord.addUserIdentifier=report.AddUserIdentifier
                    rptData.reportRecord.lastUpdateTimeStamp=report.LastUpdateTimeStamp
                    rptData.reportRecord.lastUpdateUserIdentifier=report.LastUpdateUserIdentifier
                    let reportClass=new smlReportDefinition(rptData);
                    smlsr.applyNormalizedDescription(reportClass);
                    dataData.push(reportClass);
                }
                smlsr.ccr.reports=dataData;
            } finally {
                smlsr._gettingReports=false;
                smlsr._getReportsPromise=null;
            }
            })();
            await smlsr._getReportsPromise;
        }
    }

    
    /**
     * Get a report by identifier
     *
     * @memberof ccReports
     */
    getReport(reportIdentifier){
        let smlsr=this;
        if(typeof reportIdentifier==="string") reportIdentifier=parseInt(reportIdentifier);
        smlsr.ccr.currentReport=smlsr.ccr.reports.find(r=>r.reportIdentifier===reportIdentifier)
        return smlsr.ccr.currentReport;
    }

    /**
     * Loads reports and shows them in the reports tab
     *
     * @memberof ccReports
     */
    async loadReports(){
        let smlsr=this;
        let reportsContentEle=document.querySelector("#" + smlsr.ccr.id + "ReportsContent");
        let reportsTabLink=document.querySelector("#" + smlsr.ccr.id + "ReportsTab");
        await smlsr.getReports();
        //Fav dropdowns
        let qsbtnGroup=document.querySelector("#" + smlsr.ccr.id + "QuickSearchButtonGroup");
        let myFavs=smlsr.ccr.reports.filter(r=> r.isFavorite);
        let facChoiceButtonGroup=document.querySelector("#" + smlsr.ccr.id + "FavChoiceButtonGroup");
        if(facChoiceButtonGroup) facChoiceButtonGroup.remove();
        if(myFavs.length>0){
            let qsBg={i: smlsr.ccr.id + "FavChoiceButtonGroup",c:"btn-group",role:"group",b:[]}
            let favChoiceButton={i: smlsr.ccr.id + "FavChoiceButton",c:"btn btn-sm alert alert-info mb-2 py-0",title:"My Favorite Reports","data-bs-toggle":"dropdown","aria-expanded":"false",b:[{c:"bi bi-bookmark-heart-fill mt-1"}]};
            let favChoiceUl={n:"ul",i: smlsr.ccr.id + "FavChoiceUl",c:"dropdown-menu bg-dark",b:[]};  
            for(let fr of myFavs){
                let favChoiceLi={n:"li",i: smlsr.ccr.id + "FavChoiceLi" + fr.reportIdentifier,c:"bg-dark px-1 pt-1",b:[
                    {n: "button",type:"button",i: smlsr.ccr.id + "FavChoiceBtn" + fr.reportIdentifier,
                        c:"btn btn-sm btn-info p-0 mt-0 mb-0 w-100 text-dark",t:fr.reportName.length>16?fr.reportName.utlClip(16)+"...":fr.reportName,
                            title: fr.reportName + " searches on " + fr.description,b:[{c:"float-start bi bi-clipboard2-heart-fill"}]}
                ]};
                favChoiceUl.b.push(favChoiceLi);
            }
            qsBg.b.push(favChoiceButton,favChoiceUl);
            qsbtnGroup.insertAdjacentHTML("beforeend",jmlToHtml(qsBg));
            for(let fr of myFavs){
                let favChoiceBtn=document.querySelector("#" + smlsr.ccr.id + "FavChoiceBtn" + fr.reportIdentifier);
                favChoiceBtn.addEventListener("click",async ()=>{
                    smlsr.runReport(fr);
                });

            }
        }
        //reportsContentEle.innerText=reportsContentEle.innerText.replaceAll("Loading....Please Wait","");
        await smlsr.buildReportsTabContent();
        let reportsListContainer=document.querySelector("#" + smlsr.ccr.id + "ReportsListContainer");
        if(reportsListContainer!==null) reportsListContainer.innerHTML="";
        let reportDisplayChoice=document.querySelector("#" + smlsr.ccr.id + "ReportDisplayChoice");
        if(smlsr.ccr.reports.length>0){
            if(reportDisplayChoice.dataset.display==="buttons"){
                await smlsr.displayReportsByButtons();
            }else{
                await smlsr.displayReportsByTable();
            }
        }
        let normReports=smlsr.ccr.reports.filter(r=>r.isAdvanced!==true);
        if(normReports.length<1){
            let noReports={i:smlsr.ccr.id + "NoReportsDiv",c:"w-100"
                ,b:[
                    {i: smlsr.ccr.id + "NoReports"
                    ,c:"d-flex justify-content-evenly p-0 m-0"
                    ,b:[{i: smlsr.ccr.id + "NoReportsMessage",c:"fw-bolder ribbon ribbon-sm ribbon-warning",
                            t:"No Reports Found"}]}
            ]};
            reportsListContainer.insertAdjacentHTML("beforeend",jmlToHtml(noReports));
        }

        smlsr.ccr.unobtrusiveWaitOff();

    }

    showReportsLoading(){
        let smlsr=this;
        let reportsContentEle=document.querySelector("#" + smlsr.ccr.id + "ReportsContent");
        let reportsHeadSearchRow=document.querySelector("#" + smlsr.ccr.id + "HeadSearchRow");
        reportsContentEle.classList.add("loading-reports","progress-bar", "progress-bar-striped", "progress-bar-animated");//.setAttribute("class","progress-bar progress-bar-striped progress-bar-animated");
        reportsHeadSearchRow.classList.add("loading-reports-center-no-blowup","progress-bar", "progress-bar-striped", "progress-bar-animated"
            ,"text-start","loading-flexdirrow");
    }

    showReportsLoaded(){
        let smlsr=this;
        let reportsContentEle=document.querySelector("#" + smlsr.ccr.id + "ReportsContent");
        let reportsTab=document.querySelector("#" + smlsr.ccr.id + "ReportsTab");
        let reportsHeadSearchRow=document.querySelector("#" + smlsr.ccr.id + "HeadSearchRow");
        reportsContentEle.className="tab-pane fade p-2";
        reportsHeadSearchRow.className="bg-info py-1 px-2 d-flex justify-content-between text-start";
        let activTab=smlsr.ccr.getActiveTab();
        if(activTab.id===smlsr.ccr.id + "ReportsTab"){
            let rptTab = new bootstrap.Tab(reportsTab)
            rptTab.show();
            reportsContentEle.classList.add("show","active");
        }
        //let reportsContentTab = new bootstrap.Tab(reportsContentEle)
        reportsContentEle.style.background="Silver";
    }

    async displayReportsByButtons(){
        let smlsr=this;
        let reportsListContainer=document.querySelector("#" + smlsr.ccr.id + "ReportsListContainer");
        reportsListContainer.innerHTML="";
        let normReports=smlsr.ccr.reports.filter(r=>r.isAdvanced!==true);
        for(let rpt of normReports){
            let reportDiv={i: smlsr.ccr.id + "ReportButtonGroup" + rpt.reportIdentifier,
                s: "max-height: 35px;",c:"btn-group m-1",role:"group",b:[]};
            let reportClass=rpt.accessModifier==="Public"?"btn btn-primary":"btn btn-info";
            reportDiv.b.push({n:"button",i: smlsr.ccr.id + "ReportCardButton" + rpt.reportIdentifier,
                                c: reportClass,title: rpt.reportName + " searches for "  
                                + rpt.description,"data-access":rpt.accessModifier,t:rpt.reportName.length>16?rpt.reportName.utlClip(16)+"...":rpt.reportName});
            reportsListContainer.insertAdjacentHTML("beforeend",jmlToHtml(reportDiv));
            smlsr.ccr.upgradeButtons(reportsListContainer);
            let reportButton=document.querySelector("#" + smlsr.ccr.id + "ReportCardButton" + rpt.reportIdentifier);
            reportButton.dataset.reportIdentifier=rpt.reportIdentifier;
            reportButton.dataset.addUserIdentifier=rpt.addUserIdentifier;
            reportButton.dataset.accessModifier=rpt.accessModifier;
            reportButton.addEventListener("click",async (e)=>{smlsr.queueReport(e);});
            reportButton.addEventListener("contextmenu",async (e)=>{e.preventDefault();smlsr.queueAndRunReport(e);});
        }
    }

    async displayReportsByTable(){
        let smlsr=this;
        let reportsListContainer=document.querySelector("#" + smlsr.ccr.id + "ReportsListContainer");
        reportsListContainer.innerHTML="";
        smlsr.reportClear();
        let reportsTable={n:"table",i: smlsr.ccr.id + "ReportsTable",c:"table table-striped table-hover table-bordered table-responsive w-100",s:"",b:[]};
        let reportsTableHead={n:"thead",i: smlsr.ccr.id + "ReportsTableHead",c:"table-secondary",b:[]};
        reportsTableHead.b.push({n:"tr",b:[
            {n:"th",t:"Report Name"},
            {n:"th",t:"Description"},
            {n:"th",t:"Access"},
            {n:"th",t:"Favorite"},
            {n:"th",t:"Actions"},
        ]});
        reportsTable.b.push(reportsTableHead);
        let reportsTableBody={n:"tbody",i: smlsr.ccr.id + "ReportsTableBody",b:[]};
        reportsTable.b.push(reportsTableBody);
        reportsListContainer.insertAdjacentHTML("beforeend",jmlToHtml(reportsTable));
        let tableHeadBody=document.querySelector("#" + smlsr.ccr.id + "ReportsTableBody");
        
        for(let rpt of smlsr.ccr.reports.filter(r=>r.isAdvanced===false)){
            //let jsRptData=JSON.parse(rpt.Data);
            //jsRpt.fillFromCCReport(jsRptData);
            //jsRpt.reportIdentifier=rpt.reportIdentifier;
            let reportClass=rpt.accessModifier==="Public"
                        ?(rpt.addUserIdentifier===cso.UserIdentifier?"alert alert-primary":"alert alert-dark")
                        :(rpt.addUserIdentifier===cso.UserIdentifier?"alert alert-info":"alert alert-secondary");
            let rowX={n:"tr",i: smlsr.ccr.id + "ReportsTableRow" + rpt.reportIdentifier
                        ,c:"" + reportClass,"data-rec-id":rpt.reportIdentifier
                        ,"data-report-identifier":rpt.reportIdentifier
                        ,"data-add-user-identifier":rpt.addUserIdentifier
                        ,"data-access-modifier":rpt.accessModifier
                        ,b:[]};
            rowX.b.push({n:"td",t:rpt.reportName});
            rowX.b.push({n:"td",t:rpt.description});
            rowX.b.push({n:"td",t:rpt.accessModifier==="Private"?"Private":rpt.accessModifier});            
            rowX.b.push({n:"td",t:rpt.isFavorite?"Yes":"No"});
            let rowXFuncsJML={i: smlsr.ccr.id + "ReportsTableRow" + rpt.reportIdentifier + "Funcs",n:"td",b:[]};
            let rowXBtnGroup={i: smlsr.ccr.id + "CRBFButtonGroup" + rpt.reportIdentifier,s: "max-height: 35px;",c:"btn-group m-0",role:"group",b:[]};
            rowXBtnGroup.b.push({n:"button",type: "button",i: smlsr.ccr.id + "FavReportCardButton" + rpt.reportIdentifier,
            c:"btn btn-outline-danger p-1 me-3",title: rpt.isFavorite?"Remove Favorite":"Make Favorite", b: [{c: rpt.isFavorite?"bi bi-star-fill":"bi bi-star"}]});
            rowXBtnGroup.b.push({n:"button",type: "button",i: smlsr.ccr.id + "CRBFReportCardButton" + rpt.reportIdentifier,
            c:"btn btn-secondary p-1",title: rpt.reportName + " searches for "  
            + rpt.description,t:"Run"});
            if(rpt.addUserIdentifier===cso.UserIdentifier){
                let functionBtnGrp={i:smlsr.ccr.id + "CRBFButtonDropGroup" + rpt.reportIdentifier,
                    role:"group",c:"btn-group",b:[]};
                functionBtnGrp.b.push({n:"button", type:"button",
                    i: smlsr.ccr.id + "CRBFCardButtonDrop" + rpt.reportIdentifier,
                    c:"btn btn-secondary p-1","data-bs-toggle": "dropdown","aria-expanded": false,
                    title: "Report Functions",b:[{c:"bi bi-caret-down-square"}
                    ]});
                let funcBtnsUl={n:"ul",i: smlsr.ccr.id + "ReportFunctionsUl" + rpt.reportIdentifier,c:"dropdown-menu",b:[]};
                //default buttons up here
                funcBtnsUl.b.push({n:"li",c:"bg-dark px-1 pt-1 text-center text-warning",t:"-Owner-"});
                funcBtnsUl.b.push({n:"li",i: smlsr.ccr.id + "ReportFunctionsEditLi" + rpt.reportIdentifier,
                                    c:"bg-dark px-1 pt-1",b:[
                                        {n: "button",type:"button",i: smlsr.ccr.id + "ReportFunctionsEditBtn" + 
                                        rpt.reportIdentifier,
                                        c:"w-100 btn btn-sm btn-primary p-0",t:"Edit"}]});
                funcBtnsUl.b.push({n:"li",c:"bg-dark px-1 py-1",i: smlsr.ccr.id + 
                                        "ReportFunctionsDeleteLi" + rpt.reportIdentifier,b:[
                                    {n: "button",type:"button",i: smlsr.ccr.id + "ReportFunctionsDeleteBtn" + 
                                    rpt.reportIdentifier,
                                    c:"w-100 btn btn-sm btn-danger p-0",t:"Delete"}]});
                functionBtnGrp.b.push(funcBtnsUl);
                rowXBtnGroup.b.push(functionBtnGrp);
            }
            rowXFuncsJML.b.push(rowXBtnGroup);
            rowX.b.push(rowXFuncsJML);
            
            tableHeadBody.insertAdjacentHTML("beforeend",jmlToHtml(rowX));
            let rowXele=document.querySelector("#" + smlsr.ccr.id + "ReportsTableRow" + rpt.reportIdentifier);
            smlsr.ccr.upgradeButtons(rowXele);
            rowXele.dataset.reportIdentifier=rpt.reportIdentifier;
            rowXele.dataset.addUserIdentifier=rpt.addUserIdentifier;
            rowXele.dataset.accessModifier=rpt.accessModifier;
            rowXele.dataset.reportName=rpt.reportName;
            rowXele.dataset.description=rpt.description;
            //rowXele.data=jsRpt;

            let rowXRunEle = document.querySelector("#" + smlsr.ccr.id + "CRBFReportCardButton" + rpt.reportIdentifier);
            //rowXRunEle.data=jsRpt;
            rowXRunEle.dataset.reportIdentifier=rpt.reportIdentifier;
            rowXRunEle.dataset.addUserIdentifier=rpt.addUserIdentifier;
            rowXRunEle.dataset.accessModifier=rpt.accessModifier;

                rowXRunEle.addEventListener("click",async (e)=>{
                    let reportPass=new smlReportDefinition(smlsr.getReport(e.target.dataset.reportIdentifier));
                    smlsr.runReport(reportPass);
                });
            if(rpt.addUserIdentifier===cso.UserIdentifier){
                let editButton=document.querySelector("#" + smlsr.ccr.id + "ReportFunctionsEditBtn" + rpt.reportIdentifier);
                let deleteButton=document.querySelector("#" + smlsr.ccr.id + "ReportFunctionsDeleteBtn" + rpt.reportIdentifier);
                let favButton=document.querySelector("#" + smlsr.ccr.id + "FavReportCardButton" + rpt.reportIdentifier)
                deleteButton.addEventListener("click",async ()=>{smlsr.deleteAsk(rpt);});
                editButton.addEventListener("click",async ()=>{smlsr.openSaveReportForm("Update",rpt);});
                
            }
            let favButton=document.querySelector("#" + smlsr.ccr.id + "FavReportCardButton" + rpt.reportIdentifier)
            favButton.addEventListener('click',async ()=>{
                smlsr.changeFavorite(rpt)
            });

        }

    }

    //----------------------------------------------------Load Reports END

    getSimpleSearchInputs(){
        let smlsr=this;
        let filtersEnv=document.querySelector("#" + smlsr.ccr.id + "SimpleSearchContent");
        if(!filtersEnv) return [];
        return Array.from(filtersEnv.querySelectorAll("input, select, checkbox, textarea, sml-auto-complete"))
            .filter((input)=>{
                if(input.nodeName==="SML-AUTO-COMPLETE") return true;
                return !input.closest("sml-auto-complete");
            });
    }

    getReportFilterKey(input){
        if(!input) return "";
        if(input.nodeName==="SML-AUTO-COMPLETE"){
            let hiddenInput=input.querySelector("input[type='hidden'][data-sml-property]")||input.querySelector("input[data-sml-property]");
            return hiddenInput?.dataset.smlProperty||input.dataset.smlProperty||input.id||"";
        }
        return input.dataset.smlProperty||input.id||"";
    }

    getReportFilter(rpt,input){
        let smlsr=this;
        let filterKey=smlsr.getReportFilterKey(input);
        if(!filterKey || !rpt?.filters?.length) return undefined;
        return rpt.filters.find((f)=>f?.property?.name===filterKey || f?.formField?.name===filterKey);
    }

    setReportInputValue(input,cf){
        let smlsr=this;
        if(!input || !cf) return;
        if(input.nodeName==="SML-AUTO-COMPLETE"){
            let hiddenInput=input.querySelector("input[type='hidden'][data-sml-property]")||input.querySelector("input[data-sml-property]");
            let searchInput=input.querySelector("input[type='search']");
            let filterValue=cf?.property?.value??cf?.value??"";
            if(hiddenInput) hiddenInput.value=filterValue;
            if(searchInput) searchInput.value=cf?.textValue??"";
            return;
        }
        if(input.type?.toLowerCase()==="checkbox"){
            input.checked=cf?.value===true || cf?.value==="true" || cf?.value==="on";
            return;
        }
        if(input.multiple){
            let selectedValues=(cf?.value??"").toString().split(",").map((value)=>value.trim()).filter((value)=>value.length>0);
            Array.from(input.options).forEach((option)=>{
                option.selected=selectedValues.includes(option.value);
            });
            return;
        }
        input.value=cf?.value??"";
    }

    updateReportFilterValue(rpt,input){
        let smlsr=this;
        let cf=smlsr.getReportFilter(rpt,input);
        if(!cf) return;
        if(input.nodeName==="SML-AUTO-COMPLETE"){
            let hiddenInput=input.querySelector("input[type='hidden'][data-sml-property]")||input.querySelector("input[data-sml-property]");
            let searchInput=input.querySelector("input[type='search']");
            let filterValue=hiddenInput?.value??"";
            cf.value=filterValue;
            cf.property.value=filterValue;
            cf.textValue=searchInput?.value??"";
            return;
        }
        if(input.type?.toLowerCase()==="checkbox"){
            cf.value=input.checked;
            cf.property.value=input.checked;
            return;
        }
        if(input.multiple){
            const selectedOptions=Array.from(input.selectedOptions).map((option)=>option.value);
            cf.value=selectedOptions.join(", ");
            cf.property.value=cf.value;
            return;
        }
        cf.value=input.value;
        cf.property.value=input.value;
    }

    runReport(rpt){
        let smlsr=this;
        let quickSearch=document.querySelector("#" + smlsr.ccr.id + "QuickSearch");
        quickSearch.value=rpt.quickSearch;
        for(let input of smlsr.getSimpleSearchInputs()){
            let cf=smlsr.getReportFilter(rpt,input);
            smlsr.setReportInputValue(input,cf);
        }
        let rptUberFuncs=document.querySelector("#" + smlsr.ccr.id + "ReportUberFunctions");
        rptUberFuncs.innerHTML="";
        smlsr.ccr.ccas.unSetCurrentAdvancedReport();
        smlsr.ccr.ccss.simpleSearch();

    }

    setCurrentReportBar(rpt){
        let smlsr=this;
        let reportBar=document.querySelector("#" + smlsr.ccr.id + "CurrentReportBar");
        let reportBarTitle=document.querySelector("#" + smlsr.ccr.id + "CurrentReportBarTitle");
        let reportBarDesc=document.querySelector("#" + smlsr.ccr.id + "CurrentReportBarDesc");
        let reportBarFunctions=document.querySelector("#" + smlsr.ccr.id + "CurrentReportBarFunctions");
        if(!reportBar || !reportBarTitle || !reportBarDesc || !reportBarFunctions || !rpt) return;

        reportBarTitle.textContent=rpt.reportName ?? "";
        reportBarDesc.textContent=rpt.description ?? "";
        reportBarFunctions.innerHTML="";
        reportBar.dataset.reportIdentifier=rpt.reportIdentifier;

        let reportDiv={i: smlsr.ccr.id + "CRBFButtonGroup" + rpt.reportIdentifier,
        s: "max-height: 35px;",c:"btn-group m-0",role:"group",b:[]};
        reportDiv.b.push({n:"button",type: "button",i: smlsr.ccr.id + "CurrentFavReportCardButton" + rpt.reportIdentifier,
        c:"btn btn-outline-danger p-1 me-3",title: rpt.isFavorite?"Remove Favorite":"Make Favorite", b: [{c: rpt.isFavorite?"bi bi-star-fill":"bi bi-star"}]});

        reportDiv.b.push({n:"button",type: "button",i: smlsr.ccr.id + "CurrentCRBFReportCardButton" + rpt.reportIdentifier,
        c:"btn btn-secondary p-1",title: rpt.reportName + " searches for "  
        + rpt.description,t:"Run"});

        let functionBtnGrp={i:smlsr.ccr.id + "CRBFButtonDropGroup" + rpt.reportIdentifier,
            role:"group",c:"btn-group",b:[]};
        functionBtnGrp.b.push({n:"button", type:"button",
            i: smlsr.ccr.id + "CRBFCardButtonDrop" + rpt.reportIdentifier,
            c:"btn btn-secondary p-1","data-bs-toggle": "dropdown","aria-expanded": false,
            title: "Report Functions",b:[{c:"bi bi-caret-down-square"}
            ]});
        let funcBtnsUl={n:"ul",i: smlsr.ccr.id + "ReportFunctionsUl" + rpt.reportIdentifier,c:"dropdown-menu",b:[]};
        funcBtnsUl.b.push({n:"li",c:"bg-dark px-1 pt-1 text-center text-warning",t:"-Owner-"});
        funcBtnsUl.b.push({n:"li",i: smlsr.ccr.id + "ReportFunctionsEditLi" + rpt.reportIdentifier,
                            c:"bg-dark px-1 pt-1",b:[
                                {n: "button",type:"button",i: smlsr.ccr.id + "CurrentReportFunctionsEditBtn" + 
                                rpt.reportIdentifier,
                                c:"w-100 btn btn-sm btn-primary p-0",t:"Edit"}]});
        funcBtnsUl.b.push({n:"li",c:"bg-dark px-1 py-1",i: smlsr.ccr.id + 
                                "ReportFunctionsDeleteLi" + rpt.reportIdentifier,b:[
                            {n: "button",type:"button",i: smlsr.ccr.id + "CurrentReportFunctionsDeleteBtn" + 
                            rpt.reportIdentifier,
                            c:"w-100 btn btn-sm btn-danger p-0",t:"Delete"}]});
        functionBtnGrp.b.push(funcBtnsUl);
        reportDiv.b.push(functionBtnGrp);
        reportDiv.b.push({n:"button",type: "button",i: smlsr.ccr.id + "CurrentCRBFReportExitButton" + rpt.reportIdentifier,
        c:"btn btn-secondary p-1",title: "Close This Report",b:[{c: "bi bi-x-square"}]});
        reportBarFunctions.insertAdjacentHTML("beforeend",jmlToHtml(reportDiv));
        smlsr.ccr.upgradeButtons(reportBarFunctions);
        document.querySelector("#" + smlsr.ccr.id + "CurrentCRBFReportExitButton" + rpt.reportIdentifier).data=rpt;
        reportBar.classList.remove("d-none");
        reportBar.classList.add("d-flex");
        smlsr.queueReportWire(rpt);
    }

    refreshCurrentReportBar(reportIdentifier){
        let smlsr=this;
        let reportBar=document.querySelector("#" + smlsr.ccr.id + "CurrentReportBar");
        if(!reportBar) return;
        if(reportBar.dataset.reportIdentifier.toString()!==reportIdentifier.toString()) return;
        let rpt=smlsr.getReport(reportIdentifier);
        if(!rpt){
            smlsr.reportClear();
            return;
        }
        smlsr.setCurrentReportBar(rpt);
    }



    //----------------------------------------------------Queue Report (Reports Buttons)


    async queueReport(e){
        let smlsr=this;
        let reportBar=document.querySelector("#" + smlsr.ccr.id + "CurrentReportBar");
        let rpt=smlsr.getReport(e.target.dataset.reportIdentifier);
        if(reportBar.dataset.reportIdentifier.toString()===rpt.reportIdentifier.toString()){
            smlsr.reportClear(rpt);
        }else{
            smlsr.setCurrentReportBar(rpt);
            let quickSearch=document.querySelector("#" + smlsr.ccr.id + "QuickSearch");
            quickSearch.value=rpt.quickSearch;
            for(let input of smlsr.getSimpleSearchInputs()){
                let cf=smlsr.getReportFilter(rpt,input);
                smlsr.setReportInputValue(input,cf);
            }
            let rptUberFuncs=document.querySelector("#" + smlsr.ccr.id + "ReportUberFunctions");
            rptUberFuncs.innerHTML="";
        }
    }


    queueReportWire(rpt){
        let smlsr=this;
        rpt=smlsr.getReport(rpt.reportIdentifier); //Update the report for Edit
        let rptRun=document.querySelector("#" + smlsr.ccr.id + "CurrentCRBFReportCardButton" + rpt.reportIdentifier);
        let rptEdit=document.querySelector("#" + smlsr.ccr.id + "CurrentReportFunctionsEditBtn" + rpt.reportIdentifier);
        let rptDelete=document.querySelector("#" + smlsr.ccr.id + "CurrentReportFunctionsDeleteBtn" + rpt.reportIdentifier);
        let rptExit=document.querySelector("#" + smlsr.ccr.id + "CurrentCRBFReportExitButton" + rpt.reportIdentifier);
        let favButton=document.querySelector("#" + smlsr.ccr.id + "CurrentFavReportCardButton" + rpt.reportIdentifier)
        rptRun.addEventListener("click",async ()=>{smlsr.runReport(rpt);});
        rptExit.addEventListener("click",async ()=>{smlsr.reportExit(rpt);});
        rptDelete.addEventListener("click",async ()=>{smlsr.deleteAsk(rpt);});
        rptEdit.addEventListener("click",async ()=>{smlsr.openSaveReportForm("Update",rpt);});
        favButton.addEventListener('click',async ()=>{
            smlsr.changeFavorite(rpt)
        });

    }

    queueAndRunReport(e){
        let smlsr=this;
        smlsr.queueReport(e);
        smlsr.runReport(e.target.data);
    }
    //----------------------------------------------------Queue Report (Reports Buttons)


    //----------------------------------------------------Exit/Clear Reports


    reportClear(rpt){
        let smlsr=this;
        let reportBar=document.querySelector("#" + smlsr.ccr.id + "CurrentReportBar");
        let reportBarTitle=document.querySelector("#" + smlsr.ccr.id + "CurrentReportBarTitle");
        let reportBarDesc=document.querySelector("#" + smlsr.ccr.id + "CurrentReportBarDesc");
        let reportBarFunctions=document.querySelector("#" + smlsr.ccr.id + "CurrentReportBarFunctions");
        reportBar.classList.add("d-none");
        reportBar.classList.remove("d-flex");
        reportBarTitle.textContent="";
        reportBarDesc.textContent="";
        reportBarFunctions.innerHTML="";
        reportBar.dataset.reportIdentifier=-1;
    }

    reportExit(rpt){
        let smlsr=this;
        smlsr.reportClear(rpt);
        smlsr.ccr.ccss.resetFilters();
    }
    //----------------------------------------------------Exit/Clear Reports END


    //----------------------------------------------------Delete Report

    async deleteAsk(act){
        let smlsr=this;
        smlsr.unobtrusiveWaitOff();
        let cfg={id: "DeleteRec",titleText: "Delete Record", 
                            messageText2: "Are you sure you want to delete this record?", 
                            buttons: [{i: "deleteTaskAssignmentYes", t: "Yes", c: "btn btn-danger rptDelete"}
                                        ,{n:"button",type:"button",c:"btn btn-secondary",i:"deleteTaskAssignmentClose","data-bs-dismiss":"modal",t:"Close"}
                                    ]};
        let content={c: "container-fluid",b:[]};
        let reportId=document.querySelector("#" + smlsr.ccr.id + "CurrentReportBar").dataset.reportIdentifier;
        content.b.push({n: "div", c: "row", b: [{n: "div", c: "col-4", t: document.querySelector("#" + smlsr.ccr.id + "CurrentReportBarTitle").innerText}]});
        content.b.push({n: "div", c: "row", b: [{n: "div", c: "col-4", t: document.querySelector("#" + smlsr.ccr.id + "CurrentReportBarDesc").innerText}]});
        let dataId=act.reportIdentifier||reportId;
        cfg.hasCloseXButton=true;
        cfg.AddCloseButton=true;
        cfg.messageText=content;                    
        let smlsrModal=await openReportingConfigModal(cfg);
        document.querySelector("#deleteTaskAssignmentYes").addEventListener("click",async ()=>{ smlsr.deleteReport(dataId,smlsrModal);});
        document.querySelector("#deleteTaskAssignmentClose").addEventListener("click",async ()=>{ smlsrModal.closeForConfig();});
    }

    async deleteReport(reportId,smlsrModal){
        let smlsr=this;
        smlsr.ccr.unobtrusiveWait("Deleting Report Please Wait", "Deleting");
        smlsr.ccr.ccas.unSetCurrentAdvancedReport();
        let report=smlsr.getReport(reportId);
        smlsr.ccr.report.requiresRefresh=true;
        //let reportInfoData=JSON.parse(reportInfo.data);
        report.requestId = smlsr.ccr.id;
        report.requestType="ReportDelete";
        report.reportIdentifier=reportId;
        delete report.list;
        smlsrModal.closeForConfig();
        let data = await apiPost(smlsr.api, JSON.stringify(report), "json", "POST");
        if (await receiptCheckGood(data)) {
            //all good
            if(report.isAdvanced){
                await smlsr.loadReports();
                smlsr.ccr.ccas.clearReportsTable();
                await smlsr.ccr.ccas.buildAdvancedReportsTabContent(); 
                smlsr.ccr.ccas.buildReportsTable();
                let filterRowDiv=document.querySelector("#" + smlsr.ccr.id + "FilterRowDiv");
                filterRowDiv.classList.remove("d-none");

            }else{
                smlsr.reportExit();
                await smlsr.loadReports();
                let rptUberFuncs=document.querySelector("#" + smlsr.ccr.id + "ReportUberFunctions");
                rptUberFuncs.innerHTML="";
            }
            smlsr.ccr.unobtrusiveWaitOff();
        }else{
            await showReportingMessage(data.errorObject, "Error");
            smlsr.ccr.unobtrusiveWaitOff();
        }
    }
    //----------------------------------------------------Delete Report END



    //==============================================FUNCTIONS END==============================================    
    
    //==============================================REPORT SEARCH==============================================    

    async searchReports(){
        let smlsr=this;
        let reportDisplay=document.querySelector("#" + smlsr.ccr.id + "ReportDisplayChoice");
        let rasDiv=document.querySelector("#" + smlsr.ccr.id + "ReportActionSearch");
        let reportsContainer=document.querySelector("#" + smlsr.ccr.id + "ReportsListContainer");
        let searchString=document.querySelector("#" + smlsr.ccr.id + "RASSearch").value;
        let activeButtonFilter=rasDiv.querySelector(".btn-dark").dataset.access;
        let tableBody=document.querySelector("#" +smlsr.ccr.id +  "ReportsTableBody");

        let reports=reportDisplay.dataset.display==="buttons"
            ?queryInteractiveButtons(reportsContainer)
            :Array.from(tableBody.querySelectorAll("tr"));
        //get the button access filter
        for(let rpt of reports){rpt.classList.remove("d-none");}
        switch(activeButtonFilter){
            case "Private":
                for(let rpt of reports)
                { 
                    if(rpt.dataset.accessModifier!=="Private") rpt.classList.add("d-none");
                }
                break;
            case "Public":
                for(let rpt of reports)
                { 
                    if(rpt.dataset.accessModifier!=="Public") rpt.classList.add("d-none");
                }
                break;
            default:
                //set above so no need here for(let rpt of reports){rpt.classList.remove("d-none");}
                break;
        }
        let reportsAccessFiltered=reportDisplay.dataset.display==="buttons"
                                ?reports.filter(r=> !r.classList.contains("d-none"))
                                :reports.filter(r=> !r.classList.contains("d-none"));
        if(searchString!=="") {
            if(reportDisplay.dataset.display==="buttons"){
                for(let rpt of reportsAccessFiltered){
                    if(!rpt.textContent.toLowerCase().includes(searchString.toLowerCase()) && !rpt.title.toLowerCase().includes(searchString.toLowerCase())) rpt.classList.add("d-none");
                }
            }else{
                //Table style
                for(let rpt of reportsAccessFiltered){
                    if(!rpt.dataset.reportName.toLowerCase().includes(searchString.toLowerCase()) && !rpt.dataset.description.toLowerCase().includes(searchString.toLowerCase())) rpt.classList.add("d-none");
                }
            }

        }
    }
    //==============================================REPORT SEARCH END==========================================    

    /**
     * Static documentation method for ccReports class
     * @return {Object} Comprehensive documentation object for ccReports
     * @static
     * @memberof ccReports
     */
    static documentation() {
        return {
            class: "ccReports",
            type: "Class",
            namespace: "SML.Reporting.ReportsTab",
            namespaceUrl: "/js/global/sml/Reporting/reportingMods/smlSavedReports.js",
            source: "ccReports.js",
            sourceUrl: "/js/global/sml/Reporting/reportingMods/smlSavedReports.js",
            description: "The `ccReports` class manages the Reports Tab in the CATS system, including building the reports UI, handling report actions, filtering, and integrating with modal dialogs and utility functions.",
            inherits: null,
            language: "JavaScript",
            attributes: [
                { name: "ccr", description: "Reference to the reporting context/root element.", type: "object" },
                { name: "api", description: "API endpoint for reporting actions.", type: "string" },
                { name: "ccas", description: "Reference to the advanced reports instance.", type: "object" },
                { name: "reportsFilterButtons", description: "Filter buttons for report access modifiers.", type: "array|undefined" },
                { name: "unobtrusiveWait", description: "Reference to unobtrusiveWait utility function.", type: "function" },
                { name: "unobtrusiveWaitOff", description: "Reference to unobtrusiveWaitOff utility function.", type: "function" },
                { name: "modal", description: "Instance of ccModal for modal dialogs.", type: "object" }
            ],
            methods: [
                { name: "constructor", description: "Initializes the ccReports instance and sets up references.", params: [{ name: "ccr", type: "object" }], returns: "ccReports" },
                { name: "buildReportsTabContent", description: "Builds the reports tab content, including search, display options, and report actions.", params: [], returns: "Promise<void>" }
            ],
            properties: [
                { name: "ccr", description: "Reporting context/root element.", type: "object" },
                { name: "api", description: "API endpoint for reporting actions.", type: "string" },
                { name: "ccas", description: "Advanced reports instance.", type: "object" },
                { name: "reportsFilterButtons", description: "Filter buttons for report access modifiers.", type: "array|undefined" },
                { name: "unobtrusiveWait", description: "Reference to unobtrusiveWait utility function.", type: "function" },
                { name: "unobtrusiveWaitOff", description: "Reference to unobtrusiveWaitOff utility function.", type: "function" },
                { name: "modal", description: "Instance of ccModal for modal dialogs.", type: "object" }
            ],
            events: [],
            observedAttributes: [],
            dependencies: [
                "ccReport.js, ccModal.js, ccUtilities.js"
            ],
            exampleUsage: `<cc-reports id=\"myReportsTab\"></cc-reports>`,
            notes: [
                "Manages the Reports Tab UI and actions in the CATS system.",
                "Integrates with modal dialogs and utility functions for report management.",
                "Provides search, filtering, and display options for reports."
            ]
        };
    }

}




//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
