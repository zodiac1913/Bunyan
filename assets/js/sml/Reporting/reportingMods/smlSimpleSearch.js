//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
/* eslint-disable no-undef */
/* eslint-disable no-console */
/*!
 * smlSimpleSearch --- SML reporting module for Simple Search functions
 * Public Domain
 * Licensed Copyright Law of the United States of America, Section 105 (https://www.copyright.gov/title17/92chap1.html#105)
 * Per hoc, facies, scietis quod ille miserit me ut facerem universa quae cernitis et factis: Non est mecum!
 * Published by: Dominic Roche of OIT/IUSG/DASM on 04/18/2026
 */
"use strict";
import smlReportDefinition from '../smlReportDefinition.js';
import { unAlterEncapse } from '../../smlUtils.js';

export default class smlSimpleSearch {
    constructor(ccr) {
        let smlss = this;
        smlss.ccr=ccr;
        smlss._filtersAlteredTimer=null;
        smlss._filtersAlteredDebounceMs=90;
    }
    //==============================================BUILDERS===================================================

    /**
     * Build the simple search Tab innards
     *
     * @memberof ccReporting
     */
    async buildSimpleSearchTabContent(){
        let smlss=this;
        let ssContentElement=document.getElementById(smlss.ccr.id + "SimpleSearchContent");
        let ssTabButton=document.getElementById(smlss.ccr.id + "SimpleSearchButton");
        if(!ssTabButton || smlss.ccr.report.requiresRefresh){
            let filters=window[smlss.ccr.id].report.filters;
            let bitLabel=['P','S'];
            let rows=Math.ceil(filters.length/2);
            let filtersClone=JSON.parse(JSON.stringify(filters)).reverse();
            for(let row=0;row<rows;row++){ 
                let filterDiv={i:"row" + row,n:"div",c:"mb-3 row",b:[]};
                let abDivs={i:"ps" + row,n:"div",c:"container-fluid row",b:[]};
                let filter=filtersClone.pop();
                //port
                abDivs.b.push(await smlss.makeInputFilter(filter,row,"Port"));
                //starboard
                filter=filtersClone.pop();
                if(filter){
                    abDivs.b.push(await smlss.makeInputFilter(filter,row,"Starboard"));
                }
                filterDiv.b.push(abDivs);
                ssContentElement.insertAdjacentHTML("beforeend",smlss.ccr.jmlToHtml(filterDiv));
            }
            //action button
            let filterSearchDiv={i:"FilterSearchDiv",n:"div",c:"d-flex justify-content-center",b:[]};
            let filterSearchButton={n:"button",c:"btn btn-primary",i: smlss.ccr.id + "SimpleSearchButton",type:"button",t:"Simple Search"};
            filterSearchDiv.b.push(filterSearchButton);
            ssContentElement.insertAdjacentHTML("beforeend",smlss.ccr.jmlToHtml(filterSearchDiv));
            smlss.ccr.upgradeButtons(ssContentElement);
            smlss.wireSimpleSearch();
        }
    }

    async makeInputFilter(filter,row,pos){
        let smlss=this;
        let prop=filter.property;
        if(filter?.formField?.inputType===undefined){
            console.log("ccSimpleSearch.makeInputFilter: Missing formField.inputType in filter payload", {
                componentId: smlss?.ccr?.id,
                row,
                pos,
                filter
            });
        }
        const visibleLabelText = filter.formField.label||prop.label;
        let FilterLabel={n:"label",c:"col-sm-3 col-form-label",for: prop.name,title: prop.helpText,
                            t: visibleLabelText};
        if(filter.formField.inputType===""){
            //use type
            return smlss.selectFilterOnPropertyType(filter,FilterLabel,row,pos,visibleLabelText)
        }else{
            //use form field
            return smlss.selectFilterOnFormField(filter,FilterLabel,row,pos,visibleLabelText);
        }
    }

    /**
     * For non-special (includes FormField) filters this uses they type
     *
     * @param {*} filter filter info from server as a CfgFilter
     * @param {*} label label jml
     * @param {*} row row number
     * @param {*} pos port or starboard
     * @param {*} visibleLabelText the visible label text to use for title and aria-label
     * @return {*} 
     * @memberof ccReporting
     */
    async selectFilterOnPropertyType(filter,label,row,pos,visibleLabelText){
        let smlss=this;
        let prop=filter.property;

        let inputDiv={n:"div",c:"col-sm-9",b:[]};
        let filterInput={};
        switch(filter.property.type){
            case "System.Boolean":
                filterInput={n:"input",type:"checkbox",c:"form-select border-2 border-info"
                                ,alab: visibleLabelText, ttl: visibleLabelText,role:"checkbox"
                                ,"data-op": filter.operation, i:prop.name};
                break;
            case "System.Int16":
            case "System.Int32":
            case "System.Int64":
                filterInput={n:"input",c:"form-control border-2 border-info",type:"number"
                                ,alab: visibleLabelText, ttl: visibleLabelText
                                ,"data-op": filter.operation,i:prop.name, placeholder: "🔎"};
            default:
                filterInput={n:"input",c:"form-control border-2 border-info",type:"search"
                                ,alab: visibleLabelText, ttl: visibleLabelText
                                ,"data-op": filter.operation, i:prop.name, placeholder: "🔎"};
                break;
        }
        inputDiv.b.push(filterInput);
        let binaryDiv={i:"row" + row + pos,n:"div",c:"col-sm-6 row",b:[]};
        binaryDiv.b.push(label,inputDiv);
        return binaryDiv;
    }

    async selectFilterOnFormField(filter,label,row,pos,visibleLabelText){
        let smlss=this;
        let prop=filter.property;
        const normalizedInputType = String(filter.formField.inputType || "").toLowerCase().trim().endsWith("autocomplete")
            ? "smlautocomplete"
            : String(filter.formField.inputType || "").toLowerCase().trim();
        let inputDivClass=normalizedInputType==="smlautocomplete"?"col-sm-12 w-100":"col-sm-9";
        let inputDiv={n:"div",c:inputDivClass,b:[]};
        let filterInput={};
        let binaryDiv={i:"row" + row + pos,n:"div",c:"col-sm-6 row",b:[]};
        switch(normalizedInputType){
            case "smlautocomplete":
                let smlStub = {n: "sml-ac-stub", c: "form-control", s: "display: none;",
                            "data-sml-property": prop.name,
                            "data-api": filter.formField.sfApiCall, "data-api-value": filter.formField.selectText,
                            "data-api-id": filter.formField.selectId, "data-label": filter.formField.label,
                            "data-min-chars": filter.formField.sfApiMinLengthForCall,
                            "data-op": filter.operation,
                            i: prop.name, title: filter.formField.title + (filter.formField.isRequired ? " -- This field is required!" : "")};
                if (filter.formField.isRequired) {
                    smlStub["data-sml-required"] = "true";
                    smlStub["data-required"] = "true";
                    smlStub["aria-required"] = "true";
                }
                if(filter.formField.sfDropDownJson) smlStub["data-data"]=JSON.parse(filter.formField.sfDropDownJson);
                if(filter.formField.sfApiDataUp) smlStub["data-api-filters-up"]=filter.formField.sfApiDataUp;
                if(filter.formField?.apiPropsDown || filter.formField?.sfPropsDown) smlStub["data-api-props-down"]=filter.formField.sfPropsDown;
                if(filter.formField?.apiPropsUp || filter.formField?.sfPropsUp) smlStub["data-api-props-up"]=filter.formField.sfPropsUp;
                //formFieldEnv.b.push(smlStub);
                //formFieldWrap.b.push(formFieldEnv);
                //formFieldWrap.b.push({i: formData.name + fld.name + "Valid", c: "d-none fw-bold text-danger validateInfo", t: ""});
                // visible.b.push(formFieldWrap);

                inputDiv.b.push(smlStub);
                binaryDiv.b.push(inputDiv);
                break;                    
            case "checkbox":
                filterInput={n:"input",type:"checkbox",c:"form-check-input"
                                ,alab: visibleLabelText, ttl: visibleLabelText
                                ,"data-op": filter.operation, i:prop.name};
                inputDiv.b.push(filterInput);
                binaryDiv.b.push(label,inputDiv);
                break;
            case "text":
            case "search":
            case "string":
                filterInput={n:"input",c:"form-control border-2 border-info",
                                type:"search"
                                ,alab: visibleLabelText, ttl: visibleLabelText
                                ,"data-op": filter.operation, i:prop.name, placeholder: "🔎"};
                inputDiv.b.push(filterInput);
                binaryDiv.b.push(label,inputDiv);
                break;
            case "checkboxselect":
                filterInput={n:"select",i:prop.name
                            ,c:"form-select px-2 fw-bold w-25",alab: visibleLabelText
                            ,ttl:visibleLabelText ,"data-op": filter.operation
                            ,b:[
                                {n:"option",value:"all",t:"All"},
                                {n:"option",value:"off",t:"Not Checked(off)"},
                                {n:"option",value:"on",t:"Checked(on)"},
                ]};
                inputDiv.b.push(filterInput);
                binaryDiv.b.push(label,inputDiv);
                break;                
            case "select":
            case "selectmultiple":
                let selectOptions=JSON.parse(unAlterEncapse(filter.formField.sfDropDownJson));
                filterInput={n:"select",c:"form-select"
                                ,alab: visibleLabelText, ttl: visibleLabelText
                                ,"data-op": filter.operation, "data-sml-property": filter.formField.name || prop.name
                                ,i:prop.name, b:[]};
                if(filter.formField.inputType.toLowerCase()==="selectmultiple") filterInput.multiple=true;
                for(let option of selectOptions){
                    if(option.id==="" && filter.formField.inputType.toLowerCase()==="selectmultiple"){
                        //skip on multiple
                    }else{
                        let optionEle={n:"option",value:option.id,t:option.text};
                        if(String(option.id)===String(filter.value||"")) optionEle.selected=true;
                        filterInput.b.push(optionEle);
                    }
                }
                inputDiv.b.push(filterInput);
                binaryDiv.b.push(label,inputDiv);
                break;    
            default:
                filterInput={n:"input",c:"form-control",s: "border: 5px dotted crimson;",
                                type:"search"
                                ,alab: visibleLabelText, ttl: visibleLabelText + "(ERROR: " 
                                +  filter.formField.inputType + " inputType not found.  Developer needs to correct!" 
                                ,"data-op": filter.operation, i:prop.name, placeholder: "🔎"};
                inputDiv.b.push(filterInput);
                binaryDiv.b.push(label,inputDiv);
                break;
        }
        return binaryDiv;
    }



    //==============================================BUILDERS END===============================================

    //==============================================WIRES======================================================
    wireSimpleSearch(){
        let smlss=this;
        let ssButton=document.getElementById(smlss.ccr.id + "SimpleSearchButton");
        let ssContent=document.getElementById(smlss.ccr.id + "SimpleSearchContent");
        if(ssContent.querySelectorAll("sml-ac-stub").length>0) {
            ssContent.querySelectorAll('sml-ac-stub').forEach(stub => {
                const smlAc = document.createElement('sml-auto-complete');
                Array.from(stub.attributes).forEach(attr => {
                    smlAc.setAttribute(attr.name, attr.value);
                });
                smlAc.style.display = '';
                stub.replaceWith(smlAc);
            });
        }
            let ssInputs=smlss.getSimpleSearchInputs();
//changes to load at connectcallback
        ssButton.addEventListener("click",async ()=>{smlss.simpleSearch();});
        ssInputs.forEach((input)=>{
            if(input.nodeName==="INPUT"){
                switch(input.type.toLowerCase()){
                    case "checkbox":
                        input.addEventListener("change",async (e)=>{smlss.filtersAltered(e);});
                        break;
                    case "search":
                        input.addEventListener("change",async (e)=>{smlss.filtersAltered(e);});
                        input.addEventListener("search",async (e)=>{smlss.filtersAltered(e);});
                        break;  
                    default:
                        input.addEventListener("keyup",async (e)=>{smlss.filtersAltered(e);});
                        break;
                }
            }else if(input.nodeName==="SELECT" || input.nodeName==="SELECTMULTIPLE"){
                input.addEventListener("change",async (e)=>{smlss.filtersAltered(e);});
            }else if(input.nodeName==="SML-AUTO-COMPLETE"){
                input.addEventListener("sml-selected",async (e)=>{smlss.filtersAltered(e);});
                let hiddenInput=input.querySelector("input[data-sml-property]");
                if(hiddenInput){
                    hiddenInput.addEventListener("change",async (e)=>{smlss.filtersAltered(e);});
                }
            }else{
                input.addEventListener("keyup",async (e)=>{smlss.filtersAltered(e);});
            }

        });

        let resetBtn=document.getElementById(smlss.ccr.id + "ResetFilters");  
        resetBtn.addEventListener("click",async ()=>{smlss.resetFilters();});
    }

    getSimpleSearchInputs(){
        let smlss=this;
        let ssContent=document.getElementById(smlss.ccr.id + "SimpleSearchContent");
        if(!ssContent) return [];
        return Array.from(ssContent.querySelectorAll("input, select, checkbox, textarea, sml-auto-complete"))
            .filter((input)=>{
                if(input.nodeName==="SML-AUTO-COMPLETE") return true;
                return input.closest("sml-auto-complete")===null;
            });
    }

    getInputQueryDescriptor(input){
        if(!input) return null;
        let generatedAutoCompleteChild=this.getGeneratedAutoCompleteChildDescriptor(input);
        if(generatedAutoCompleteChild) return generatedAutoCompleteChild;
        if(input.nodeName==="SML-AUTO-COMPLETE"){
            let hiddenInput=input.value;
            let textInput=input.text; //input.querySelector("input[type='search']");
            //let selectInput=input.querySelector("select");
            //let selectedOption=selectInput?.selectedOptions?.[0]
            //    ||(selectInput && selectInput.selectedIndex>0 ? selectInput.options[selectInput.selectedIndex] : null);
            //let textValue=(textInput?.value||"").trim();
            //let hiddenValue=(hiddenInput?.value||"").trim();
            //let selectedText=(selectedOption?.textContent||"").trim();
            if(textInput.length>0){
                return {
                    name: `${input.id}TextSearch`,
                    operation: "Equals",
                    value: textInput
                };
            }
            if(hiddenInput.length<1) return null;
            return {
                name: input.dataset.smlProperty||input.id,
                operation: input.dataset.op||"Equals",
                value: hiddenInput
            };
//}}}}}}}}}}}}>            
//}}}}}}}}}}}}>    NEED TO FINISH THIS...IT DOES NOT SAVE THE REPORT CORRECTLY BECAUSE IT DOES 
//}}}}}}}}}}}}>    NOT KNOW TO LOOK FOR THE HIDDEN INPUT VALUE, NOT THE TEXT INPUT VALUE.  
//}}}}}}}}}}}}>    ALSO NEEDS TO ACCOUNT FOR SELECTS IN SML-AUTO-COMPLETE
//}}}}}}}}}}}}>
//}}}}}}}}}}}}>
        }
        if(input.id===(this.ccr.id + "QuickSearch")){
            let value=(input.utlVal?.()||input.value||"").trim();
            if(value.length<1) return null;
            let queryConfig=this.ccr?.report?.query||this.ccr?.originalReport?.query||{};
            let searchFields=Array.isArray(queryConfig.searchFields)?queryConfig.searchFields:[];
            let fields=searchFields.length>0?searchFields.join(","):"All text fields";
            return {
                name: fields,
                operation: "Contains",
                value
            };
        }
        let value=(input.utlVal?.()||input.value||"").trim();
        if(value.length<1) return null;
        return {
            name: input.dataset.smlProperty||input.id,
            operation: input.dataset.op||"Contains",
            value
        };
    }

    getGeneratedAutoCompleteChildDescriptor(input){
        if(!input?.id) return undefined;
        if(input.closest("sml-auto-complete")===null) return undefined;
        if(input.id.endsWith("TextSearch") || input.id.endsWith("Text")){
            let value=(input.value||"").trim();
            if(value.length<1) return null;
            return {
                name: input.id,
                    operation: input.closest("sml-auto-complete")?"Equals":"=",
                value
            };
        }
        if(input.id.endsWith("Select") || input.id.endsWith("Facade") || input.id.endsWith("Hidden")){
            return null;
        }
        return null;
    }

    isGeneratedAutoCompleteChild(input){
        if(!input || !input.id) return false;
        if(input.closest("sml-auto-complete")!==null) return true;
        return ["TextSearch","Select","Facade","Hidden"].some((suffix)=>input.id.endsWith(suffix));
    }



    
    filtersAltered(event){
        let smlss=this;
        if(event?.key==='Enter'){
            smlss.simpleSearch();
            return;
        }

        if(smlss._filtersAlteredTimer){
            clearTimeout(smlss._filtersAlteredTimer);
        }

        smlss._filtersAlteredTimer=setTimeout(()=>{
            smlss._filtersAlteredTimer=null;
            requestAnimationFrame(()=>{
                smlss.applyFiltersAlteredState();
            });
        },smlss._filtersAlteredDebounceMs);
    }

    applyFiltersAlteredState(){
        let smlss=this;
        let ccrElement=document.getElementById(smlss.ccr.id);
        let qsInpt=ccrElement?.querySelector("input[id='" + smlss.ccr.id + "QuickSearch']");
        let currentReportBar=document.getElementById(smlss.ccr.id + "CurrentReportBar");
        let ssInputs=smlss.getSimpleSearchInputs();
        let rptUberFuncs=document.querySelector("#" + smlss.ccr.id + "ReportUberFunctions");
        ssInputs.push(qsInpt);
        if(!rptUberFuncs) return;

        smlss.getQueryText(ssInputs);
        //Check for report
        let isReport=ssInputs.some((input)=>{return smlss.getInputHasValue(input);});
        let saveBtnId=smlss.ccr.id + "OpenSaveReportFormButton";
        let openSaveReportFormButton=document.getElementById(saveBtnId);

        if(isReport && currentReportBar && currentReportBar.classList.contains("d-none")){
            //Set up report saving once, then only update title text on subsequent interactions.
            if(!openSaveReportFormButton){
                rptUberFuncs.innerHTML="";
                let funcs={n:"div",c:"float-end border border-2 border-primary",b:[
                    {c: "d-inline my-0 pb-2 pt-1 alert alert-info alert-dismissible fade show", title: "Use this to save your current filtering as a saved report",
                         t: "Report:"},
                    {n:"button",c:"d-inline btn btn-primary",i: saveBtnId,
                        title: "Click to open form to save for " + smlss.ccr.queryDescription,type:"button",t:"Save"}
                ]};
                rptUberFuncs.insertAdjacentHTML("beforeend",jmlToHtml(funcs));
                smlss.ccr.upgradeButtons(rptUberFuncs);
                openSaveReportFormButton=document.getElementById(saveBtnId);
                openSaveReportFormButton.addEventListener("click",async ()=>{
                    let rptNew=new smlReportDefinition();
                    rptNew.filters=[];
                    for(let ipt of ssInputs){
                        let iptRec=new smlReportFilter();
                        let iptVal=smlss.getInputValue(ipt);
                        iptRec.property={
                            name:ipt.id,
                            value:iptVal
                        };
                        iptRec.value=iptVal;
                        rptNew.filters.push(iptRec);
                    }
                    await smlss.ccr.ccrs.openSaveReportForm("Create",rptNew);
                });
            }

            if(openSaveReportFormButton){
                openSaveReportFormButton.title="Click to open form to save for " + smlss.ccr.queryDescription;
            }
        }else{
            //Clear report saving
            if(rptUberFuncs.innerHTML!="") rptUberFuncs.innerHTML="";
        }
    }

    getQueryText(inputs){
        let smlss=this;
        if(!inputs){
            let ccrElement=document.getElementById(smlss.ccr.id);
            let qsInpt=ccrElement?.querySelector("input[id='" + smlss.ccr.id + "QuickSearch']");
            inputs=smlss.getSimpleSearchInputs();
            inputs.push(qsInpt);
        } 
        let qd="";
        for(let input of inputs){
            if(input.nodeName==="SML-AUTO-COMPLETE"){
                let descriptor=smlss.getInputQueryDescriptor(input);
                if(!descriptor) continue;
                qd+=(qd.length>0?" AND (":"(") + descriptor.name + " " + descriptor.operation + " '" + descriptor.value + "')";
            }else{
                let descriptor=smlss.getInputQueryDescriptor(input);
                if(!descriptor) continue;
                qd+=(qd.length>0?" AND (":"(") + descriptor.name + " " + descriptor.operation + " '" + descriptor.value + "')";
            }
        }
        smlss.ccr.queryDescription=smlss.normalizeQueryDescription(qd);
        return smlss.ccr.queryDescription
    }

    normalizeQueryDescription(description){
        if(!description) return description;
        let clauses=Array.from(description.matchAll(/\(([^()]*)\)/g))
            .map((match)=>this.parseQueryClause(match[1]))
            .filter((clause)=>clause!==null);
        if(clauses.length<1) return description;
        let textClauseBases=new Set(
            clauses
                .filter((clause)=>clause.field.endsWith("TextSearch") || clause.field.endsWith("Text"))
                .map((clause)=>clause.field.replace(/(TextSearch|Text)$/,""))
        );
        return clauses
            .filter((clause)=>!(textClauseBases.has(clause.field) && !clause.field.endsWith("TextSearch") && !clause.field.endsWith("Text")))
            .map((clause)=>`(${clause.field} ${clause.operation} '${clause.value}')`)
            .join(" AND ");
    }

    parseQueryClause(clauseText){
        let clauseMatch=clauseText.match(/^(?<field>\S+)\s+(?<operation>.+?)\s+'(?<value>.*)'$/);
        if(!clauseMatch?.groups) return null;
        let field=clauseMatch.groups.field;
        if(field.endsWith("Select") || field.endsWith("Hidden") || field.endsWith("Facade")) return null;
        let operation=clauseMatch.groups.operation;
            if(field.endsWith("TextSearch") && (operation === "undefined" || operation === "=")){
                operation="Equals";
        }
        return {
            field,
            operation,
            value: clauseMatch.groups.value
        };
    }

    getInputValue(input){
        if(!input) return "";
        if(input.nodeName==="SML-AUTO-COMPLETE"){
            let textInput=input.querySelector("input[type='search']");
            let hiddenInput=input.querySelector("input[type='hidden'][data-sml-property]")||input.querySelector("input[data-sml-property]");
            return hiddenInput?.value||textInput?.value||"";
        }
        return input.value||"";
    }

    getInputHasValue(input){
        let val=this.getInputValue(input);
        if(typeof val!=="string") val=String(val||"");
        return val.length>0;
    }



    //=================================================WIRES END===============================================
    //==========================================FUNCTIONS======================================================

    resetFilters(){
        let smlss=this;
        let quickSearch=document.querySelector("#" + smlss.ccr.id + "QuickSearch");
        quickSearch.value="";
        let filtersEnv=document.querySelector("#" + smlss.ccr.id + "SimpleSearchContent");
        for(let input of filtersEnv.querySelectorAll("input, checkbox, textarea")){
            input.value="";
        }
        if(typeof smlss?.ccr?.ccas?.resetCurrentAdvancedReportDiv === "function"){
            smlss.ccr.ccas.resetCurrentAdvancedReportDiv();
        }
        filtersEnv.querySelectorAll("select").forEach(select => {
            if(select.multiple){
                Array.from(select.options).forEach(option => {
                    option.selected = false;
                });
            }else{
                select.selectedIndex = 0; // Reset to the first option
            }
        });
        smlss.ccr.report.advancedFilters=smlss.ccr.originalReport.advancedFilters;
        smlss.ccr.report.filters=smlss.ccr.originalReport.filters;
        for(let f of smlss.ccr.report.filters){
            f.value="";
        }
        let rptUberFuncs=document.querySelector("#" + smlss.ccr.id + "ReportUberFunctions");
        if(rptUberFuncs) rptUberFuncs.innerHTML="";

    }
    //==========================================FUNCTIONS END==================================================

    //==============================================COMMS======================================================
    async simpleSearch(pagingOptions = null){
        let smlss=this;
        let dataUp = structuredClone(smlss.ccr.report);
        const isEmployeeRoleDebug = String(smlss?.ccr?.dataset?.api || "").includes("/CCXO/EmployeeRole");
        dataUp.list=[];
        dataUp.requestId = smlss.ccr.id;
        dataUp.requestType="RptReportingSearch";
        dataUp.quickSearch = document.querySelector("#" + smlss.ccr.id + "QuickSearch").value;
        smlss.ccr.ccas.unSetCurrentAdvancedReport();
        let activeColumns = smlss?.ccr?.cct?.data?.columns || smlss?.ccr?.report?.columns || [];
        dataUp.columns = structuredClone(activeColumns);
        let searchTabContent=document.getElementById(smlss.ccr.id + "SimpleSearchContent");
        if(searchTabContent){
            let searchInputs=smlss.getSimpleSearchInputs();
            searchInputs.forEach((input)=>{
                if(input.nodeName==="SML-AUTO-COMPLETE"){
                    let inputId=input.querySelector("input[type='hidden'][data-sml-property]")||input.querySelector("input[data-sml-property]");
                    let propName=inputId?.dataset.smlProperty||input.dataset.smlProperty;
                    let fltr=dataUp.filters.find((f)=>{return f.property.name==propName;});
                    if(fltr){
                        let inputText=input.querySelector("input[type='search']");
                        let idVal=inputId?.value||"";
                        let textVal=inputText?.value||"";
                        fltr.value=idVal;
                        fltr.property.value=idVal;
                        fltr.textValue=textVal;
                        fltr.operation=input.dataset.op||fltr.operation;
                    }
                }else{
                    if(!dataUp?.filters || dataUp?.filters?.length<1){
                        dataUp.filters=smlss.ccr.originalReport.filters;
                    }
                    let fltr=dataUp.filters.find((f)=>{return f.property.name==input.id;});
                    if(fltr && input.value){
                        fltr.value=input?.value||"";
                        switch(input.type.toLowerCase()){
                            case "checkbox":
                                fltr.property.value=input.checked;
                                fltr.value=input.checked;
                                fltr.operation=input.dataset.op;
                                break;
                            case "select":
                            case "select-one":
                                fltr.property.value=input.value;
                                fltr.value=input.value;
                                fltr.operation=input.dataset.op;
                                break;
                            case "select-multiple":
                                const selectedOptions = Array.from(input.selectedOptions).map(option => option.value);
                                fltr.property.value=selectedOptions.join(", ");
                                fltr.value=selectedOptions.join(",");
                                fltr.operation=input.dataset.op;
                                break;
                            default:
                                fltr.property.value=input.value;
                                fltr.operation=input.dataset.op;
                                break;                    
                        }
                    }else if(fltr){
                        fltr.value="";
                    }
                }
            });
        }
        smlss.ccr.unobtrusiveWait("Please Wait", "Searching");
        try{
            delete dataUp.tableConfig;
            delete dataUp.data;
            delete dataUp.lastUpdateTimeStamp;
            delete dataUp.modelProperties;
            const fallbackQuery = structuredClone(smlss?.ccr?.originalReport?.query || {});
            dataUp.query = structuredClone(dataUp.query || fallbackQuery);
            if (pagingOptions && typeof pagingOptions === "object") {
                const skip = Number.parseInt(String(pagingOptions.skip ?? 0), 10);
                const take = Number.parseInt(String(pagingOptions.take ?? 0), 10);
                dataUp.query.skip = Number.isFinite(skip) && skip > 0 ? skip : 0;
                if (Number.isFinite(take) && take > 0) {
                    dataUp.query.take = take;
                }
            }
            if(isEmployeeRoleDebug){
                console.log("EmployeeRole simpleSearch request", {
                    quickSearch: dataUp.quickSearch,
                    filters: (dataUp.filters || []).map((filter)=>(
                        {
                            name: filter?.property?.name,
                            value: filter?.value,
                            propertyValue: filter?.property?.value,
                            operation: filter?.operation
                        }
                    ))
                });
            }
            const dataUpString=JSON.stringify(dataUp);
            let data;
            if(typeof smlss.ccr?.runReportingSearch === "function"){
                data = await smlss.ccr.runReportingSearch(dataUp, { progressive: true });
                const hasConfigColumns = Array.isArray(data?.query?.displayColumns)
                    ? data.query.displayColumns.length > 0
                    : Array.isArray(data?.query?.DisplayColumns) && data.query.DisplayColumns.length > 0;
                const hasConfigActions = Array.isArray(data?.query?.queryActions)
                    ? true
                    : Array.isArray(data?.query?.QueryActions);
                // The search already fell back to the full post, so repeating it buys nothing.
                const needsFullPost = (!hasConfigColumns || !hasConfigActions) && smlss.ccr?._lastSearchUsedFullPost !== true;
                if(needsFullPost && typeof smlss.ccr?.postReportingSearch === "function"){
                    const fallbackData = await smlss.ccr.postReportingSearch(dataUp);
                    if(await smlss.ccr.receiptCheckGood(fallbackData)){
                        data = fallbackData;
                    }
                }
            }else{
                data=await apiPost(smlss.ccr.dataset.api,dataUpString,"json");
                if(typeof(data)==="string") data=JSON.parse(data);
                data=smlss.ccr.normalizeReportingPayload(data);
            }
            if(isEmployeeRoleDebug){
                const responseRows = data?.list || data?.listData || data?.rows || [];
                console.log("EmployeeRole simpleSearch response", {
                    rowCount: Array.isArray(responseRows) ? responseRows.length : -1,
                    sampleNames: Array.isArray(responseRows)
                        ? responseRows.slice(0, 5).map((row)=>row?.PublishedName)
                        : []
                });
            }
            if (await smlss.ccr.receiptCheckGood(data)) {
                smlss.ccr.report=new smlReportDefinition(data);
                let query=smlss.ccr.report.query || {};
                let list=smlss.ccr.report.list;
                smlss.ccr.report.list=[];
                await smlss.ccr.buildTableFromReportList(query,list);
            }else{
                await showReportingMessage(data.errorObject, "Error");
            }
        }finally{
            smlss.ccr.unobtrusiveWaitOff();
        }
    }

    //=================================================COMMS END===============================================

        /**
         * Static documentation method for ccSimpleSearch class
         * @return {Object} Comprehensive documentation object for ccSimpleSearch
         * @static
         * @memberof ccSimpleSearch
         */
        static documentation() {
            return {
                class: "ccSimpleSearch",
                type: "Class",
                namespace: "SML.Reporting.SimpleSearch",
                namespaceUrl: "/js/global/sml/Reporting/reportingMods/smlSimpleSearch.js",
                source: "ccSimpleSearch.js",
                sourceUrl: "/js/global/sml/Reporting/reportingMods/smlSimpleSearch.js",
                description: "The `ccSimpleSearch` class manages the Simple Search tab in the CATS system, including building the UI, handling filter input, and integrating with reporting and utility modules.",
                inherits: null,
                language: "JavaScript",
                attributes: [
                    { name: "ccr", description: "Reference to the reporting context/root element.", type: "object" }
                ],
                methods: [
                    { name: "constructor", description: "Initializes the ccSimpleSearch instance and sets up references.", params: [{ name: "ccr", type: "object" }], returns: "ccSimpleSearch" },
                    { name: "buildSimpleSearchTabContent", description: "Builds the simple search tab content, including filter rows and action button.", params: [], returns: "Promise<void>" },
                    { name: "makeInputFilter", description: "Creates the input filter UI for a given filter.", params: [{ name: "filter", type: "object" }, { name: "row", type: "number" }, { name: "pos", type: "string" }], returns: "Promise<object>" }
                ],
                properties: [
                    { name: "ccr", description: "Reporting context/root element.", type: "object" }
                ],
                events: [],
                observedAttributes: [],
                dependencies: [
                    "ccReport.js, ccFilter.js, ccUtilities.js"
                ],
                exampleUsage: `<cc-simple-search id=\"mySimpleSearchTab\"></cc-simple-search>`,
                notes: [
                    "Manages the Simple Search tab UI and actions in the CATS system.",
                    "Integrates with reporting and utility modules for search and filter management.",
                    "Provides filter input, search execution, and result handling."
                ]
            };
        }


}

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
