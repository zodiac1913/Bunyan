//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! J.J. !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//     *          |¯¯¯¯¯¯¯¯¯¯¯¯¯¯¯|       †          _____          ↑
//   _____        |  o o o o o o  |      /|\        (     )         ↑
//  /  ^  \       | o o o o o o o |     / | \      (       )       / \
// /_/___\_\      |_______________|    /  |  \      (]¯¯¯[)       /   \
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
/* eslint-disable no-undef */
/* eslint-disable no-console */
/*!
 * smlPage --- sml Page module for Encapsulating the page and ensuring a navbar and sidebar are present
 * Public Domain Licensed Copyright Law of the United States of America, Section 105 (https://www.copyright.gov/title17/92chap1.html#105)
 * Et qui me misit, mecum est: non reliquit me solum Pater, quia ego semper quae placita sunt ei, facio!
 * Published by: Dominic Roche of OIT/IUSG/DASM on 3/11/2026
 * @class smlPage
 * @extends {HTMLElement}
 */
// תהילתו. לא שלי
import sml from '../sml.js';
import { clip, guid, jmlToHtml } from '../smlUtils.js';
"use strict";
class smlPage extends HTMLElement {
  constructor() {
        super();
        let sp = this;
  }
  static observedAttributes=["data-api"];

    // connect component
  async connectedCallback() {
    let sp = this;
    sp.id = sp.id || "sp"+clip(guid(true),20);
    sp.noHandRails = sp.hasAttribute("no-handrails");
    if(!sp.noHandRails){sp.takeOutTheGarbage();}
    if(sp.className=="") sp.className="smlPage m-0 p-0 d-flex";
    sp.dataset.api = sp.getAttribute("data-api") || "";
    sp.dataset.home=(sp.dataset.home || "/");
    sp.dataset.homeTitle=(sp.dataset.homeTitle || "Home");
    //sp.innerHTML='';
    sp.handleInnards();
    sp.wire();
  }

  /**
   * @description This is where the page content should be added.  
   */
  async handleInnards(){
    let sp = this;
    sp.dataset.idPrefix=sp.id.length>20? sp.id.substring(0,20) : sp.id;

    sp.pw=document.querySelector("#pageContentWrapper");
    if(!sp.pw) {
      const pageWrap={i: "pageContentWrapper",c: "flex-column text-left", 
        "data-page-type": "list","data-id-prefix": sp.dataset.idPrefix};
      sp.innerHTML+="<!--********************Inside Body Section**************************** -->"
      sp.insertAdjacentHTML("beforeend",jmlToHtml(pageWrap));
      sp.pw=document.querySelector("#pageContentWrapper");
    }else{
      sp.insertAdjacentElement("beforeend",sp.pw);
    }

    sp.smlNavbar=sp.querySelector("sml-navbar");
    if(sp.smlNavbar===null){
      const navbar={n:"sml-navbar",i: sp.dataset.idPrefix+"Navbar", c: "mb-2","data-home": sp.dataset.home, 
                    "data-home-title": sp.dataset.homeTitle || "Home"  };
      sp.insertAdjacentHTML("afterBegin",jmlToHtml(navbar));
    }else{
      if(sp.smlNavbar.id=="") { sp.smlNavbar.id= sp.dataset.idPrefix+"Navbar"; }
    }
    sp.smlNavbar=sp.querySelector("sml-navbar");

    sp.smlSidebar=sp.querySelector("sml-sidebar");
    if(sp.smlSidebar===null){
      const sidebar={n:"sml-sidebar",i: sp.dataset.idPrefix+"Sidebar", c: "me-2"};
      sp.smlNavbar.insertAdjacentHTML("afterEnd",jmlToHtml(sidebar));
    }else{
      if(sp.smlSidebar.id=="") { sp.smlSidebar.id= sp.dataset.idPrefix +"Sidebar"; }
    }

  }

  wire(){
    let sp=this;
    window.pageSmlPage=sp;
  }






  takeOutTheGarbage(){
    let sp=this;
    sp.removeScriptByUrl("jquery");
    sp.removeScriptByUrl("datatables");
    sp.removeStyleByUrl("jquery");
    sp.removeStyleByUrl("datatables");
  }

  removeScriptByUrl(keyword){
    document.querySelectorAll(`script[src*="${keyword}"]`)?.forEach(el => el.remove());
  }
  removeStyleByUrl(keyword){
    document.querySelectorAll(`link[href*="${keyword}"]`)?.forEach(el => el.remove());
  }


}

customElements.define("sml-page", smlPage);
export default smlPage;
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^