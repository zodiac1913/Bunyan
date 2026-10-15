

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
/**
 * Functions for filtering of ccAdvancedReports.js
 */
import { guid } from "../../../../sml/smlUtils.js"
import { showReportingMessage } from "../../smlReportingShared.js";

    /**
     * This handles clearing up the boar if all thats left is an encapsulation
     * and calls cleanUpEmptyEncapse
     *
     * @export
     * @param {*} filterListDiv
     */
    export function cleanUp(filterListDiv) {
        let ccas=this;
        ccas.reportBuilder.advancedFilters=ccas.cleanUpEmptyEncapse(ccas.reportBuilder.advancedFilters);
        ccas.reportBuilder.advancedFilters=ccas.cleanUpLeftOpNotNeeded(ccas.reportBuilder.advancedFilters);
        if (ccas.reportBuilder.advancedFilters.length < 1) {
            filterListDiv.innerHTML = "";
        }
    }

    /**
     * This clears any empty Encapsulations
     *
     * @export
     * @param {*} filters
     */
    export function cleanUpEmptyEncapse(filters){
        let ccas=this;
        //Clear empty encapse
        for(let i=0;i<filters.length;i++){
            let filter=filters[i];
            if(filter.encapsulation && filter.innerFilters.length<1){
                filters.splice(i,1);
            }else{
                if(filter.innerFilters.length>0){
                    filter.innerFilters=ccas.cleanUpEmptyEncapse(filter.innerFilters);
                }
            }
        }
        return filters;
    }

    export function cleanUpLeftOpNotNeeded(filters){
        let ccas=this;
        //Clear empty encapse
        for(let i=0;i<filters.length;i++){
            let filter=filters[i];
            let filterInfo=ccas.getFilterAndPathByGuid(filter.guid);
            let rightFilter = ccas.findRightFilter(filterInfo.path);
            let leftFilter = ccas.findLeftFilter(filterInfo.path);
            if(!leftFilter && filter.preop.length>0){
                filter.preop="";
            }else{
                if(filter.innerFilters.length>0){
                    filter.innerFilters=ccas.cleanUpLeftOpNotNeeded(filter.innerFilters);
                }
            }
        }
        return filters;
    }
    /**
     * Clears the Advanced Reports Panel for different panes (ie. List reports, create reports, etc.)
     *
     * @memberof ccAdvancedReports
     */
    export function clearReportsTable(){
        let ccas=this;
        let advReportsContainerDiv = document.querySelector("#" + ccas.ccr.id + "AdvReportsContainerDiv");
        advReportsContainerDiv.innerHTML="";
    }
        /**
     * Searches the advanced reports list for the search term
     *
     * @memberof ccAdvancedReports
     */
        export function searchAdvReports(){
            let ccas=this;
            let searchInput=document.querySelector("#" + ccas.ccr.id + "AdvancedSearchInput");
            let search=searchInput.value.toLowerCase();
            let advancedReportsTBody=document.querySelector("#" + ccas.ccr.id + "AdvancedReportsTBody");
            let trs=advancedReportsTBody.querySelectorAll("tr");
            for (const tr of trs) {
                let recordData=ccas.ccrs.getReport(tr.dataset.reportIdentifier);
                if(recordData.reportName.toLowerCase().includes(search) || recordData.description.toLowerCase().includes(search)){
                    tr.classList.remove("d-none");
                }else{
                    tr.classList.add("d-none");
                }
            }
        }
    

    export function encapsulateLeft(e){
        let ccas=this;
        let filterListDiv=document.querySelector("#" + ccas.ccr.id + "CriteriaListDiv");
        //encapsulate to the left
        let rightEncap=e.currentTarget.closest("ul").closest("div[data-guid]");//e.currentTarget.closest("ul").previousSibling.parentNode;
        let path=ccas.getFilterIndex(ccas.reportBuilder.advancedFilters,rightEncap.dataset.guid);
        let filter=ccas.getFilterByIndices(path);
        let filterLeftObj=ccas.findLeftFilter(path);
        let filterLeftPath=ccas.getFilterIndex(ccas.reportBuilder.advancedFilters,filterLeftObj.guid);
        if(!filterLeftObj){ 
              showReportingMessage("There is no criteria to the left","Error");
        }else{
            if((filter?.preop||"").length>0){
                filter.innerFilters[0].preop=filter.preop;
                filter.preop="";
            }
            if(filterLeftObj.preop!=""){
                 filter.preop=filterLeftObj.preop;
                 filterLeftObj.preop="";
            }
            filter.innerFilters.splice(0,0,filterLeftObj);
            ccas.reportBuilder.advancedFilters.splice(filterLeftPath[path.length - 1],1);
            ccas.advancedFilters=ccas.reportBuilder.advancedFilters;

            filterListDiv.innerHTML="";    
            ccas.renderFilters(ccas.reportBuilder.advancedFilters);
        }
    
    }

    export function encapsulateRemove(e){
        //encapsulate remove
        let ccas=this;
        let filterListDiv=document.querySelector("#" + ccas.ccr.id + "CriteriaListDiv");
        let leftencap=e.currentTarget.closest("ul").closest("div[data-guid]");
        //let filterDiv=encapseEle.querySelector(".filterdiv");

        let path=ccas.getFilterIndex(ccas.reportBuilder.advancedFilters,leftencap.dataset.guid);
        let filter=ccas.getFilterByIndices(path,true);
        if(!filter){
            if(path.length<1){
                document.querySelector("#" + ccas.ccr.id + "FilterDivEncapsulate" + leftencap.dataset.guid).remove();
            }
        }else{
            if(filter.preop && !filter.innerFilters[0].preop) filter.innerFilters[0].preop=filter.preop;
            let bufferEncapse=[];
            let encapsePath=path;
            for(let innerFilter of filter.innerFilters){
                bufferEncapse.push(innerFilter);
                ccas.pushFilterByIndices(encapsePath,innerFilter);
                encapsePath[encapsePath.length - 1] += 1;
            }

            // filter=filter.innerFilters[0];
            // filter.preop=filterPreop;
            // for(let innerFilter of filter.innerFilters){
            //     if(innerFilter.guid!==ccas.reportBuilder.advancedFilters[idx].guid){
            //         ccas.reportBuilder.advancedFilters.splice(idx+1,0,innerFilter);
            //     }
            // }
            //ccas.pushFilterByIndices(path,filter);
            filterListDiv.innerHTML="";    
            ccas.renderFilters(ccas.reportBuilder.advancedFilters);
        }
        ccas.cleanUp(filterListDiv);
    }


    export function encapsulateRight(e){
        let ccas=this;
        let filterListDiv=document.querySelector("#" + ccas.ccr.id + "CriteriaListDiv");
        //encapsulate to the right
        let leftEncap=e.currentTarget.closest("ul").closest("div[data-guid]");//e.currentTarget.closest("ul").previousSibling.parentNode;
        let path=ccas.getFilterIndex(ccas.reportBuilder.advancedFilters,leftEncap.dataset.guid);
        let filter=ccas.getFilterByIndices(path);
        //let rightSiblingPath=[path[path.length - 1] += 1];
        let filterRightObj=ccas.findRightFilter(path);
        let filterRightPath=ccas.getFilterIndex(ccas.reportBuilder.advancedFilters,filterRightObj.guid);
        if(!filterRightObj){ 
              showReportingMessage("There is no criteria to the right","Error");
        }else{
            //filterRight=ccas.getFilterByIndices(filterRightPath,true);
            if((filter?.preop||"").length>0){
                //filter.innerFilters[0].preop=filter.preop;
                //filter.preop="";
            }
            filter.innerFilters.splice((filterRightPath[path.length - 1] +1),0,filterRightObj);
            ccas.reportBuilder.advancedFilters.splice(filterRightPath[path.length - 1],1);
            ccas.advancedFilters=ccas.reportBuilder.advancedFilters;
            filterListDiv.innerHTML="";    
            ccas.renderFilters(ccas.reportBuilder.advancedFilters);
        }

    }

    export function findLeftFilter(path){
        let ccas=this;
        let leftSibling=null;
        //let levels=path.length;
        let highLevel=path.length-1;
        for(let l=highLevel;l>=0;l--){
            if(!Array.isArray(path)) path = [path];
            let leftPath=path[path.length - 1] -= 1;
            if(!Array.isArray(leftPath)) leftPath=[leftPath];
            let leftSibling=ccas.getFilterByIndices(leftPath);
            if(leftSibling){
                //leftSibling=ccas.reportBuilder.advancedFilters.getFilterByIndices(leftPath);
                return leftSibling;
            }else{
                leftSibling=null;
            }
        }
        return null;
    }

    export function findRightFilter(path){
        let ccas=this;
        let rightSibling=null;
        //let levels=path.length;
        let highLevel=path.length-1;
        for(let l=highLevel;l>=0;l--){
            if(!Array.isArray(path)) path = [path];
            let rightPath=path.filter(p=>true);
            rightPath[path.length - 1] += 1;
            if(!Array.isArray(rightPath)) rightPath = [rightPath];
            let rightSibling=ccas.getFilterByIndices(rightPath);
            if(rightSibling){
                return rightSibling;
            }else{
                rightSibling=null;
            }
        }
        return null;
    }

    export async function editCriteria(e){
        let ccas=this;
        let criteriaGuid=e.currentTarget.closest("ul").closest("div[data-guid]").dataset.guid;
        let indices=ccas.getFilterIndex(ccas.reportBuilder.advancedFilters,criteriaGuid);
        let filter=ccas.getFilterByIndices(indices);
        await ccas.addFilters(filter.guid);
        let filterPreOp=document.querySelector("#" + ccas.ccr.id + "FilterPreOpSelect");
        let filterProperty=document.querySelector("#" + ccas.ccr.id + "FilterPropertySelect");
        let filterOperator=document.querySelector("#" + ccas.ccr.id + "FilterOperandSelect");
        let filterValue=document.querySelector("#" + ccas.ccr.id + "FilterValueInput");
        let filterEncapsulate=document.querySelector("#" + ccas.ccr.id + "FilterEncapsulateCheck");
        filterPreOp.value=filter.preop;
        filterProperty.value=filter.property.name;
        filterOperator.value=filter.operation;
        filterValue.value=filter.value;
        filterEncapsulate.checked=filter.encapsulation;
        let filterEditHeading=document.querySelector("#" + ccas.ccr.id + "FilterAddToolHeaderContainerHeader");
        filterEditHeading.innerText="Edit Filter";
        let filterButton=document.querySelector("#"  + ccas.ccr.id +  "FilterAddButton");
        filterButton.innerText="Save";
        let modalCLoseButton=document.querySelector("#" + ccas.ccr.id + "ColumnFilterToolAdd");
        modalCLoseButton.addEventListener("click",()=>{
            modalCLoseButton.closeForConfig();
        });
        filterButton.addEventListener("click",()=>{
            ccas.editCriteriaSubmit(filter);
        });
    }
    
    export function editCriteriaSubmit(filter){
        let ccas=this;      
        let encapseStatus=filter.encapsulation===true;
        //let editCritForm=document.querySelector("#" + ccas.ccr.id + "FilterAddToolHeaderContainer");        
        filter.preop=document.querySelector("#" + ccas.ccr.id + "FilterPreOpSelect").value;
        let prop=document.querySelector("#" + ccas.ccr.id + "FilterPropertySelect").value;
        if(!ccas?.ccr?.report?.modelProperties) ccas.ccr.report.modelProperties=originalReport.modelProperties;
        let property=ccas.ccr.report.modelProperties.find(p=>p.name==prop);
        filter.property=property;
        filter.operation=document.querySelector("#" + ccas.ccr.id + "FilterOperandSelect").value;
        filter.value=document.querySelector("#" + ccas.ccr.id + "FilterValueInput").value;
        filter.encapsulation=document.querySelector("#" + ccas.ccr.id + "FilterEncapsulateCheck").checked;
        if(encapseStatus!==filter.encapsulation){
            if(filter.encapsulation){
                //Encapsulate
                let filterCopy=JSON.parse(JSON.stringify(filter));
                filterCopy.encapsulation=false;
                filter.preop=filterCopy.preop;
                filterCopy.preop="";
                filter.innerFilters=[filterCopy];
                filter.guid=guid();
                filter.operation="";
                filter.value="";
                filter.property=null;
            }else{
                //Remove Encapsulate
                let innerFilters=filter.innerFilters;
                let primaryFilter=innerFilters.shift();
                let newIdx=getFilterIndex(ccas.reportBuilder.advancedFilters, primaryFilter.guid);
                newIdx.pop();
                if(innerFilters){
                    primaryFilter.encapsulation=false;
                    primaryFilter.guid=filter.guid;
                    primaryFilter.operation=primaryFilter.operation;
                    primaryFilter.preop=primaryFilter.preop;
                    primaryFilter.value=primaryFilter.value;
                    primaryFilter.property=primaryFilter.property;
                    filter=primaryFilter;
                    if(innerFilters.length>1){
                        let newLayer=newIdx.length>1
                            ?ccas.getFilterByIndices(newIdx) //innerFilters
                            :0;//ccas.reportBuilder.filters; //top level
                        let layerdIdx=newIdx;
                        let layerObj=ccas.getFilterByIndices(layerdIdx);
                        for(let fltr=1;fltr<filter.innerFilters.length;fltr++){
                            if(newLayer===0){
                                ccas.reportBuilder.advancedFilters.splice(newIdx++,0,fltr);
                            }else{
                                layerObj.push(filter.innerFilters[fltr]);
                            }
                        }
                    }
    
                }
            }
        }
        let modalCLoseButton=document.querySelector("#" + ccas.ccr.id + "ColumnFilterToolEdit").closeForConfig();
        let filterListDiv=document.querySelector("#" + ccas.ccr.id + "CriteriaListDiv");
        filterListDiv.innerHTML="";    
        ccas.renderFilters(ccas.reportBuilder.advancedFilters);
    }

    export function removeCriteria(e){
        let ccas=this;
        let closeButton=document.querySelector("#" + ccas.ccr.id + "FilterAddToolCloseButton");
        let modalCLoseButton=document.querySelector("#" + ccas.ccr.id + "ColumnFilterToolAdd");
        if(!modalCLoseButton){
            let modalCLoseButton=document.querySelector("#" + ccas.ccr.id + "ColumnFilterToolEdit");
        }
        
        closeButton.addEventListener("click", async ()=> {
			modalCLoseButton.closeForConfig();
        });
        let filterListDiv=document.querySelector("#" + ccas.ccr.id + "CriteriaListDiv");
        let criteria=e.currentTarget.closest("ul").closest("div[data-guid]");
        const idx = ccas.getFilterIndex(ccas.reportBuilder.advancedFilters,criteria.dataset.guid);
        let filter=ccas.getFilterByIndices(idx);
        if(filter){
            let idxRight=idx.filter(i=>true);
            let rightFilter=ccas.findRightFilter(idxRight);
            if(rightFilter){
                if(rightFilter?.preop){
                    filter.preop=rightFilter.preop;
                    //Sure this might be needed but not sure why cause now its
                    //causing an issue with in a group of 3 results in no
                    //operator on the item right of the deleted
                    //rightFilter.preop="";
                }
            }
            //ccas.reportBuilder.advancedFilters.splice(idx,1);
            let killFilter=ccas.getFilterByIndices(idx,true);
        }else{
            if(!ccas.reportBuilder.advancedFilters) ccas.reportBuilder.advancedFilters=[];
        }
        ccas.cleanUp(ccas, filterListDiv);
        filterListDiv.innerHTML="";    
        ccas.renderFilters(ccas.reportBuilder.advancedFilters);
    }

    export function changeOperation(e){
        let ccas=this;
        let currentButton=e.currentTarget;
        let currentFilter=currentButton.closest("ul").closest("div[data-guid]");
        let path=ccas.getFilterIndex(ccas.reportBuilder.advancedFilters,currentFilter.dataset.guid);
        let filter=ccas.getFilterByIndices(path);
        filter.preop=currentButton.innerText;
        let filterListDiv=document.querySelector("#" + ccas.ccr.id + "CriteriaListDiv");
        filterListDiv.innerHTML="";    
        ccas.renderFilters(ccas.reportBuilder.advancedFilters);
    }

    /**
     * This gets the path to an index based on an array of numbers.  So it could 
     * be [0,1,1] indicating its the child of the base, and the child of the second
     * item in base, and its the second child of that child.
     *
     * @export
     * @param {*} filters the filters you wish to search
     * @param {*} guid the guid of the filter you want the path for.
     * @return {*} 
     */
    export function getFilterIndex(filters, guid){
        let ccas=this;
        let idxArray=[];
        if(!filters){
            return idxArray;
        }
        for(let i=0;i<filters.length;i++){
            if(filters[i].guid===guid){
                return [i];
            }
            if(filters[i].innerFilters){
                let idxArray=ccas.getFilterIndex(filters[i].innerFilters,guid);
                if(idxArray.length>0){
                    idxArray.splice(0,0,i);
                    return idxArray;
                }
            }
        }
        return [];
    }
    
    /**
     * Gets the filter based on its path(indices)
     *
     * @export
     * @param {*} indices the path to the filter
     * @param {boolean} [remove=false] if you want to remove the filter from the array(for moving or removing)
     * @return {*} The filter asked for
     */
    export function getFilterByIndices(indices,remove=false) {
        let ccas=this;
        if(!Array.isArray(indices)) indices = [indices];
        let path=[...indices];
        let lastIdx=path.pop();
        let currentFilter = ccas.reportBuilder.advancedFilters;
        for (const index of path) {
          if (currentFilter[index]) {
            currentFilter = currentFilter[index].innerFilters;
          } else {
            // Handle invalid indices (out of bounds)
            return null;
          }
        }
        if(remove){
            return currentFilter.splice(lastIdx,1)[0]; // The filter at the specified path
        }
        if(!currentFilter) return null;
        return currentFilter[lastIdx]; // The filter at the specified path
      }

      export function pushFilterByIndices(indices,filter) {
        let ccas=this;
        let path=[...indices];
        let lastIdx=path.pop();
        let currentFilter = ccas.reportBuilder.advancedFilters;
        for (const index of path) {
          if (currentFilter[index]) {
            currentFilter = currentFilter[index].innerFilters;
          } else {
            // Handle invalid indices (out of bounds)
            return null;
          }
        }
        ccas.reportBuilder.advancedFilters.splice(lastIdx,0,filter);
      }


      //-----------Compound getFilter Functions

      export function getFilterAndPathByGuid(guid){
        let ccas=this;
        let path=ccas.getFilterIndex(ccas.reportBuilder.advancedFilters,guid);
        let filter=ccas.getFilterByIndices(path);
        return {filter:filter,path:path};
      }








      

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^