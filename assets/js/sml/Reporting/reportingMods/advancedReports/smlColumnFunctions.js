
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
/**
 * Functions for columns of ccAdvancedReports.js
 */

import { openReportingConfigModal } from "../../smlReportingShared.js";
import { jmlToHtml } from "/js/global/sml/smlUtils.js";

    //==============================================BUILDERS===================================================

    /**
     * Generates and Opens the Add Columns Tool (modal)
     *
     * @memberof ccAdvancedReports
     */
    export async function addColumns(){
        let ccas=this;
        await openReportingConfigModal({
            id: ccas.ccr.id + "ColumnAddTool",
            dialogSize: "25",
            headerJML: {i: ccas.ccr.id + "ColumnAddToolHeaderContainer"
                        ,c:"modal-header justify-content-center opacity-75 bg-lightgrey"
                        ,s: "background-color:#c6c8ca"
                        ,b: [
                            {t: "Add Column Tool"
                            ,role:"heading", alvl:"1"
                            , c: "modal-title fs-4 text-center fw-bold"}
                            ,{n:"button", i: ccas.ccr.id + "ColumnAddToolCloseButton"
                            ,c:"btn-close", ttl:"Close Column Tool", role: "dialog"
                            ,"aria-label":"Close"}
                        ]},
            bodyJML: {i: ccas.ccr.id + "ColumnAddToolBody"
                        ,c: "modal-body text-start fs-5"
                        ,b: [{i: ccas.ccr.id + "ColumnAddToolBodyContainer"}]},
            footerJML: {i: "ModalFooter",c: "modal-footer text-center small p-2"
                        ,b: [{i: ccas.ccr.id + "ColumnAddToolFooterContainer"}]}
            ,hasOverlay: true
            ,closeOnBackgroundClick: false
        });
        let modalBody=document.querySelector("#ColumnAddToolBodyContainer");
        let columnTools={i: ccas.ccr.id + "ColumnSelectContainer",c:"container-fluid",b:[]};
        ccas.ccr.upgradeButtons(modalBody.closest(".modal") || modalBody);
        let colHeaderBtnsRow={c:"d-flex justify-content-left sticky-top opacity-75 bg-lightgrey",b:[
            {n:"button",i:ccas.ccr.id + "ColumnSelectContBtnToolAllNone",type:"button"
            ,c:"btn btn-sm btn-success",t:"Select All"
            ,alab:"Select all available columns" 
            ,ttl:"Select all available columns"},
            {n:"button",i:ccas.ccr.id + "ColumnSelectContBtnToolAccept",type:"button"
                ,c:"btn btn-sm btn-primary ms-5",t:"Accept"
                ,alab:"Accept all selected"
                ,ttl:"Accept all selected"},
        ]};
        columnTools.b.push(colHeaderBtnsRow);
        modalBody.insertAdjacentHTML("beforeend",jmlToHtml(columnTools));
        let columnSelectContainer=document.querySelector("#" + ccas.ccr.id + "ColumnSelectContainer");
        let columnsSelectedListDiv=document.querySelector("#" + ccas.ccr.id + "ColumnsSelectedListDiv");
        let columnsUsed=Array.from(columnsSelectedListDiv.querySelectorAll("div[data-column='true']")).map(c=>c.dataset.property);
        let reportName=document.querySelector("#" + ccas.ccr.id + "ReportingSystemReportNameInput").value;
        if(reportName) {
            let rpt=ccas.ccr.reports.find(r=>r.reportName===reportName);
            if(rpt){
                ccas.ccr.report=rpt;
            }
        }
        let rptInfo=ccas.ccr.report;
        if(!rptInfo.columnPropertiesString){
            ccas.ccr.report.columnPropertiesString=ccas.ccr.originalReport.columnPropertiesString;
            rptInfo.columnPropertiesString=ccas.ccr.originalReport.columnPropertiesString;
        } 
        if(ccas.reportColumns.length<1) ccas.reportColumns=ccas.reportColumns=rptInfo.columnPropertiesString.split(',');
        //for(const prop of rptInfo.modelProperties.filter(p=> ccas.reportColumns.includes(p.name) && !columnsUsed.includes(p.name))){
        if(!rptInfo?.modelProperties)rptInfo.modelProperties=ccas.ccr.reports[0].modelProperties;
        for(const prop of rptInfo.modelProperties){
            if(ccas.reportColumns.includes(prop.name) && !columnsUsed.includes(prop.name)){
                let columnToolRow={i:ccas.ccr.id + "ColumnAddToolRow" + prop.name,c:"row mt-1",b:[]}
                let columnToolCol1={n:"button",type:"button"
                                        ,i:ccas.ccr.id + "ColumnAddToolRowCol" + prop.name
                                        ,c:"btn btn-light btn-sm"
                                        ,"data-property":prop.name
                                        ,ttl: prop.name + " not selected"
                                        ,alab: "Select " + prop.name + "(select properties you want to be on the report)"
                                        ,t:prop.name
                                    }
                columnToolRow.b.push(columnToolCol1);
                columnSelectContainer.insertAdjacentHTML("beforeend",jmlToHtml(columnToolRow));
                ccas.ccr.upgradeButtons(columnSelectContainer);
                //Select default
                document.querySelector("#" + ccas.ccr.id + "ColumnAddToolRowCol" + prop.name).addEventListener("click",async (e)=> {
                    ccas.columnSelect(e);
                })
            }
        }
        if(ccas.ccr.originalReport?.query?.displayColumns && ccas.ccr.originalReport.query.displayColumns.length>0){
            for(let col of ccas.ccr.originalReport?.query?.displayColumns){
                document.querySelector("#" + ccas.ccr.id + "ColumnAddToolRowCol" + col.fieldName).click();
            }
        }else{
            if(rptInfo.columns && rptInfo.columns.length>0){
                for(let col of rptInfo.columns){
                    document.querySelector("#" + ccas.ccr.id + "ColumnAddToolRowCol" + col.fieldName).click();
                }                
            }
        }
        await ccas.wireAddColumnTool();
    }
    //==============================================BUILDERS END===============================================

    //==============================================WIRES======================================================


    /**
     * Wires functions to the Add Column Tool
     *
     * @memberof ccAdvancedReports
     */
    export function wireAddColumnTool(){
        let ccas=this;
        //let modalHeader=document.querySelector("#" + ccas.ccr.id + "ColumnAddToolBodyContainer");
        let modalCloseButton=document.querySelector("#" + ccas.ccr.id + "ColumnAddToolCloseButton");
        //let modalBody=document.querySelector("#" + ccas.ccr.id + "ColumnAddToolBodyContainer");
        //let modalFooter=document.querySelector("#" + ccas.ccr.id + "ColumnAddToolBodyContainer");
        let modalColumnAddTool=document.querySelector("#" + ccas.ccr.id + "ColumnAddTool");
        let allOrNoneBtn=document.querySelector("#" + ccas.ccr.id + "ColumnSelectContBtnToolAllNone");
        let acceptChoicesBtn=document.querySelector("#" + ccas.ccr.id + "ColumnSelectContBtnToolAccept");


        modalCloseButton.addEventListener("click", async ()=> {
			modalColumnAddTool.closeForConfig();
        });
        
        allOrNoneBtn.addEventListener("click",async ()=>{
            let columnSelects=document.querySelector("#" + ccas.ccr.id + "ColumnSelectContainer").querySelectorAll("button[data-property]");
            if(allOrNoneBtn.classList.contains("btn-success")){
                allOrNoneBtn.classList.remove("btn-success");
                allOrNoneBtn.classList.add("btn-danger");
                allOrNoneBtn.innerText="Select None";
                allOrNoneBtn.title="UnSelect all available columns";
                allOrNoneBtn["aria-label"]="UnSelect all available columns";
                columnSelects.forEach(c=>{c.classList.remove("btn-light"); c.classList.add("btn-dark");});
            }else{
                allOrNoneBtn.classList.remove("btn-danger");
                allOrNoneBtn.classList.add("btn-success");
                allOrNoneBtn.innerText="Select All";
                allOrNoneBtn.title="Select all available columns";
                allOrNoneBtn["aria-label"]="UnSelect all available columns";
                columnSelects.forEach(c=>{c.classList.remove("btn-dark"); c.classList.add("btn-light");});
            }
        });        

        acceptChoicesBtn.addEventListener("click",()=>{
            let columnSelectContainer=document.querySelector("#" + ccas.ccr.id + "ColumnSelectContainer");
            let selected=Array.from(columnSelectContainer.querySelectorAll(".btn-dark"));
            modalColumnAddTool.closeForConfig();
            ccas.makeReportColumns(selected);
        });
    }

    //==============================================WIRES END==================================================

    //==============================================FUNCTIONS==================================================


    /**
     * handles column selections for the add columns tool
     *
     * @param {*} e
     * @memberof ccAdvancedReports
     */
    export function columnSelect(e){
        let ccas=this;
        let col=e.target;
        let propName=col.dataset.property;
        if(col.classList.contains("btn-dark")){
            col.classList.remove("btn-dark");
            col.classList.add("btn-light");
            col.title=propName + " not selected";
        }else{
            col.classList.remove("btn-light");
            col.classList.add("btn-dark");
            col.title=propName + " selected";
        }
    }
        /**
     * Handles column sorting selection for the add report columns
     *
     * @param {*} e
     * @memberof ccAdvancedReports
     */
        export function columnSortSelect(e){
            let ccas=this;
            let sortColIco=e.target;
            let propName=sortColIco.dataset.property;
            let col=ccas.reportBuilder.columns.find(c=>c.name==propName);
            let dropClass=sortColIco.className;
            let dropTitle=sortColIco.title;
            col.sortDirection=dropClass.includes("bi-sort-down-alt")
                ?"ASC":(dropClass.includes("bi-sort-down")
                    ?"DESC":"");
            let currSortCols=ccas.reportBuilder.columns.filter(f=>f.sortDirection!="");
            let currSortHasOrdinal=currSortCols.filter(f=>f.sortOrdinal !== null && f.sortOrdinal !== undefined && f.sortOrdinal >= 0);
            let sortSort=currSortHasOrdinal.sort((a,b)=>a.sortOrdinal-b.sortOrdinal).map(m=>m.name);

            if(!sortSort.includes(propName))sortSort.push(propName);
            for(let cc of ccas.reportBuilder.columns){
                if(cc.sortOrdinal===null || cc.sortOrdinal===undefined) cc.sortOrdinal=-1;
                if(sortSort.includes(cc.name)){
                    cc.sortOrdinal=sortSort.findIndex(f=>f==cc.name);
                }else{
                    cc.sortOrdinal=-1;
                }
            }
            ccas.renderColumnsStructure();      
        }
    
    /**
     * Handles column movement for the add report columns
     *
     * @param {*} e
     * @memberof ccAdvancedReports
     */
    export function columnMoveSelect(e){
        let ccas=this;
        let moveColIco=e.target;
        let propName=moveColIco.dataset.property;
        let dropBtn=moveColIco;//document.querySelector("#" + ccas.ccr.id + "colDivMoveDrop" + propName);
        let columnEle=dropBtn.parentElement.parentElement;
        let columnsSelectedListDiv=document.querySelector("#" + ccas.ccr.id + "ColumnsSelectedListDiv");
        let columnsArr=Array.from(columnsSelectedListDiv.children);
        let columnNum=columnsArr.findIndex(c=>c.dataset.property==propName);

        switch(moveColIco.title){
            case "Move to the beginning":
                //columnsSelectedListDiv.insertAdjacentElement("afterbegin",column);
                ccas.moveItem(ccas.reportBuilder.columns,columnNum,0);
                break;
            case "Move Back 1":
                //column.previousSibling.insertAdjacentElement("beforebegin",column);
                let toBck=columnNum===0?columnsArr.length-1:columnNum-1;
                ccas.moveItem(ccas.reportBuilder.columns,columnNum,toBck);
                break;
            case "Move Forward 1":
                let toFwd=(columnNum===(columnsArr.length-1))?0:columnNum+1;
                ccas.moveItem(ccas.reportBuilder.columns,columnNum,toFwd);
                break;
            default:
                //move to end
                ccas.moveItem(ccas.reportBuilder.columns,columnNum,columnsArr.length-1);
                break;
        }
        ccas.renderColumnsStructure(); 
    }

    export function moveItem(arr, from, to) {
        arr=arr.splice(to, 0, arr.splice(from, 1)[0]);
        return arr;
    }

    export function makeReportColumns(selected){
        let ccas=this;

        for(const sc of selected){
            let property=ccas.ccr.report.modelProperties.find(p=>p.name==sc.dataset.property);
            let sortCols=originalReport.query.displayColumns.filter(c=>c.sortDirection!="").sort((ca, cb) => ca.sortOrdinal - cb.sortOrdinal);
            // was above but something is altering the ccas.ccr.originalReoprt?? ccas.ccr.originalReport.query.displayColumns.filter(c=>c.sortDirection!="").sort((ca, cb) => ca.sortOrdinal - cb.sortOrdinal);
            if(ccas.reportBuilder.columns.map(m=>m.name).includes(property.name)) continue;
            ccas.reportBuilder.columns.push(property);
            if(sortCols.length>0){
                let sortCol=sortCols.find(c=>c.fieldName==property.name);
                if(sortCol){
                    property.sortDirection=sortCol.sortDirection;
                    property.sortOrdinal=sortCol.sortOrdinal;
                }
            }
            
        }
        ccas.renderColumnsStructure();
    }



    export function renderColumnsStructure(){
        let ccas=this;
        let columnsSelectedListDiv=document.querySelector("#" + ccas.ccr.id + "ColumnsSelectedListDiv");
        columnsSelectedListDiv.innerHTML="";
        let colCount=0;
        for(const sc of ccas.reportBuilder.columns){
            if(!sc.name) sc.name=sc.fieldName;
            if(!sc.label) sc.label=sc.title;
            if(!sc.sortDirection) sc.sortDirection="";
            let sortClass=sc.sortDirection===""?"up-down-arrow":(sc.sortDirection==="ASC"
                                    ?"bi bi-sort-down-alt":"bi bi-sort-down");
            let sortTitle=sc.sortDirection===""?"No Sorting this column":(sc.sortDirection==="ASC"
                                    ?"Sort Ascending this column":"Sort Descending this column")
            let column={i:ccas.ccr.id + "colDiv" + sc.name
                        ,"data-property":sc.name
                        ,"data-column":"true"
                        ,"data-sort-ordinal":((sc.sortOrdinal === null || sc.sortOrdinal === undefined) ? -1 : sc.sortOrdinal)
                        ,c:"d-flex flex-column border border-1 border-dark p-1 text-nowrap"
                        //,s:"min-height: 40px;max-height: 40px;"
                        ,b:[
                {i:ccas.ccr.id + "colDivName" + sc.name +"DivTop",c:"m-1 p-1 shadow-lg shadow-dark"
                    ,"data-sort-direction":"",b:[
                    {i:ccas.ccr.id + "colDivName" + sc.name,c:"bg-lightgrey text-center",t:sc.label},
                ]},
                {i:ccas.ccr.id + "colDivSort" + sc.name,role:"group",c:"d-flex flex-justify-center m-0 p-0",b:[
                    {n:"button",type:"button",i: ccas.ccr.id + "colDivMoveUL" + sc.name + "Begin",c:"btn-sm bi bi-skip-backward-fill btn-lightgrey border border-1 col-move-btn",ttl:"Move to the beginning","data-property":sc.name}
                    ,{n:"button",type:"button",i: ccas.ccr.id + "colDivMoveUL" + sc.name + "Back",c:"bi bi-skip-start-fill border border-1 btn-lightgrey col-move-btn",ttl:"Move Back 1","data-property":sc.name}
                    ,{n:"button", type:"button",i: ccas.ccr.id + "colDivSortDrop" + sc.name,
                        c:"btn btn-lightgrey border border-1 border-secondary p-1","data-bs-toggle": "dropdown","aria-expanded": false,
                        s:"min-width:26px;",
                        title: sortTitle,b:[
                            {c:sortClass}
                    ]},
                    {n:"ul",i: ccas.ccr.id + "colDivSortUL" + sc.name,c:"dropdown-menu mx-1 px-1",s:"min-width:26px;",b:[
                        {n:"li",b:[{i: ccas.ccr.id + "colDivSortUL" + sc.name + "SortNone",c:"up-down-arrow",ttl:"No Sorting this column","data-property":sc.name}]}
                        ,{n:"li",b:[{i: ccas.ccr.id + "colDivSortUL" + sc.name + "SortAsc",c:"bi bi-sort-down-alt",ttl:"Sort Ascending this column","data-property":sc.name}]}
                        ,{n:"li",b:[{i: ccas.ccr.id + "colDivSortUL" + sc.name + "SortDesc",c:"bi bi-sort-down",ttl:"Sort Descending this column","data-property":sc.name}]}
                    ]}
                    ,{n:"button",type:"button",i: ccas.ccr.id + "colDivMoveUL" + sc.name + "Next",c:"bi bi-skip-end-fill border border-1 btn-lightgrey col-move-btn",ttl:"Move Forward 1","data-property":sc.name}
                    ,{n:"button",type:"button",i: ccas.ccr.id + "colDivMoveUL" + sc.name + "Last",c:"btn-sm bi bi-skip-forward-fill border border-1 btn-lightgrey col-move-btn",ttl:"Move to End","data-property":sc.name}
                    ,{n:"button", type:"button",i: ccas.ccr.id + "colCanIt" + sc.name,c:"btn btn-sm btn-secondary border border-1 border border-1 border-dark p-0",b:[{c:"bi bi-x",ttl:"Remove Column"}]}
                ]},
            ]}
            columnsSelectedListDiv.insertAdjacentHTML("beforeend",jmlToHtml(column));
            document.querySelector("#" + ccas.ccr.id + "colDivSortUL" + sc.name)
                .querySelectorAll("[data-property]")
                .forEach((button)=>button.addEventListener("click",async (e)=>{
                    ccas.columnSortSelect(e);
                }));
            document.querySelector("#" + ccas.ccr.id + "colCanIt" + sc.name).addEventListener("click",async (e)=>{
                let col=e.target;
                let column=col.parentElement.parentElement;
                let removeItem=ccas.reportBuilder.columns.findIndex(c=>c.name==column.dataset.property);
                ccas.reportBuilder.columns.splice(removeItem, 1);
                ccas.renderColumnsStructure(); 
            })
            colCount++;
        }
        document.querySelectorAll(".col-move-btn").forEach((button)=>button.addEventListener("click",async (e)=>{
            ccas.columnMoveSelect(e);
        }));        
    }




    //==============================================FUNCTIONS END==============================================




    

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^