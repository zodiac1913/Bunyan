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
 * smlNavbar --- sml Navbar module for creating the App level navigation bar
 * Public Domain Licensed Copyright Law of the United States of America, Section 105 (https://www.copyright.gov/title17/92chap1.html#105)
 * Et qui me misit, mecum est: non reliquit me solum Pater, quia ego semper quae placita sunt ei, facio!
 * Published by: Dominic Roche of OIT/IUSG/DASM on 3/12/2026
 * @class smlNavbar
 * @extends {HTMLElement}
 */
// תהילתו. לא שלי
import sml from '../sml.js';
import { clip, guid, jmlToHtml, toTitle, saveData } from '../smlUtils.js';
"use strict";

function resolveIdPrefixCandidate(prefixCandidate) {
  if (prefixCandidate) return prefixCandidate;

  const smlPage = document.querySelector("sml-page");
  if (smlPage?.id) return smlPage.id;

  const pageWrapper = document.querySelector("#pageContentWrapper, #page-content-wrapper");
  if (pageWrapper?.dataset?.idPrefix) return pageWrapper.dataset.idPrefix;
  if (pageWrapper?.id) return pageWrapper.id;

  return "";
}

function normalizeIdPrefix(prefixCandidate) {
  const raw = String(resolveIdPrefixCandidate(prefixCandidate) || "").trim();
  if (!raw) return `sml${clip(guid(true), 20)}`;
  return /^[A-Za-z_]/.test(raw) ? raw : `sml${raw}`;
}

class smlNavbar extends HTMLElement {
  //----------------------Lifecycle
  constructor() {
        super();
        let snb = this;
  }

    // connect component
  async connectedCallback() {
    let snb = this;
    snb.id = snb.id || "snb"+clip(guid(true),20);
    await snb.getAppSecData(); //snb.data for data
    snb.idPrefix = normalizeIdPrefix(snb.dataset.idPrefix);

    let navbarJH = snb.makeNavbarContainer();
    snb.insertAdjacentHTML("beforeend", jmlToHtml(navbarJH));
    snb.menuToggler = snb.querySelector("#menu-toggle");
    snb.pageWrapper = document.querySelector("#pageContentWrapper");
    snb.pageSideBar = document.getElementById(snb.idPrefix + "PageSideBar");

    snb.wire();
    window.pageNavBar = snb;
    window.dispatchEvent(new CustomEvent("navbarReady"));
  }

  static observedAttributes=["data-api"];


  //----------------------Lifecycle END

  //----------------------Render GUI
  makeNavbarContainer() {
    let snb = this;
    let nbc = {
      n: "nav",
      c: "navbar navbar-expand my-0 sml-navbar justify-content-between navbar-dark bg-dark bg-gradient pt-2 pb-2 pe-2 ps-3 rounded-top",
      i: snb.idPrefix + "navbar",
      s: "--bs-bg-opacity:.86;",
      b: [],
    };
    nbc.b.push(snb.makeNavbarSidebarToggle());
    nbc.b.push(snb.makeNavbarHelp());
    return nbc;
  }

  makeNavbarSidebarToggle() {
    let snb = this;
    let nbst = {
      n: "ul",
      c: "navbar-nav",
      i: snb.idPrefix + "snbNavbarSidebarToggle",
      b: [],
    };
    nbst.b.push(snb.makeNavbarSidebarToggleItems());
    return nbst;
  }

  makeNavbarSidebarToggleItems() {
    let snb = this;
    const appContext = globalThis.cso || {};
    const currentApp = appContext.CurrentApp || {};
    const homeTitle = snb.dataset.homeTitle || "Home";
    return [
      {
        n: "li",
        c: "nav-item",
        b: [
          {i:"menuToggleGroup",c:"btn-group border border-2 border-secondary rounded",role:"group",b:[
            {
              n: "button",i: "menu-toggle",type: "button",role: "button",ttl: "Open/Close Sidebar Menu",
              c: "d-block btn btn-dark collapsed border-0 shadow-none px-2", 
              "aria-controls": snb.dataset?.toggler||(snb.idPrefix + "PageSideBarRow"),
              "aria-expanded": "true","aria-label": "Toggle navigation",
              b: [{ n: "span", c: "navbar-toggler-icon" }],
            },
            {
              n: "button",i: "smallSidebarToggle",type: "button",role: "button",ttl: "Set to mini sidebar",
              c: "ms-0 me-0 px-0 btn btn-dark", 
              b: [{ n: "span", c: "bi bi-chevron-compact-left" }],
            }],
          }],
      },
      {
        n: "li",
        c: "nav-item",
        b: [
          {
            n: "sml-reactive-button",
            type: "button",
            role: "button",
            i: (snb.idPrefix??guid(false)) + "homeButton",
              c: "btn btn-Crimson p-2 ms-3",
            "data-icon": "bi bi-house-fill",
            "data-text": homeTitle,
            "data-destructive-label-suffix": "false",
            "data-url": snb.dataset.home 
                        || location.origin + "/" + (currentApp.ControllerName || "") +
                          "/" + (currentApp.ActionName || "") +
            "?taskId=" + (currentApp.TaskIdentifier || currentApp.AppAssignedIdentifier || ""),
            ttl: homeTitle,
            "aria-label": homeTitle,
          },
        ],
      },
    ];
  }

  makeNavbarHelp() {
    let snb = this;
    return {
      n: "ul",
      c: "navbar-nav",
      b: [
        {
          n: "li",
          c: "nav-item",
          b: [
            {
              n: "sml-reactive-button",
              type: "button",
              role: "button",
              i: (snb.idPrefix??guid(false)) + "helpButton",
              c: "link-light me-1 btn-outline-primary",
              "data-icon": "bi bi-envelope-fill",
              "data-text":  "Email for help",
              "data-url": "mailto:" + (snb.dataset.ccHelpHref || "CATSHelpDesk@cms.hhs.gov"),
              ttl: snb.dataset.ccHelpText || "Email for help",
            },
          ],
        },
      ],
    };
  }

  //=================================================================================================================================================
  // mobile navbarBar
  //=================================================================================================================================================

  makeNavbarMobileContainer() {
    let snb = this;
    const currentEmployee = globalThis.cso?.CurrentEmployee || {};
    let nbmc = {
      n: "nav",                //When Done  showOnSmallScreen showOnXSScreen 
      c: "navbar navbar-expand d-xs-flex d-md-none cc-navbar justify-content-center navbar-dark bg-dark bg-gradient pt-2 pb-2 pe-2 ps-3 rounded-bottom",
      i: snb.idPrefix + "MobileNavbar",
      s: "--bs-bg-opacity:.94;height:30px;",
      b: [],
    };
    let sep={n:"span",c:"text-DarkSeaGreen pt-1 mx-2",t:"♦"};
    let nav1={n:"ul",i:snb.idPrefix + "mobNav1",c:"navbar-nav",b:[]};
    let userButtonGroup={i: snb.idPrefix + "UserButtons",c:"btn-group", role:"group", ttl:"Current User Info",b:[]};
    let userInfoSM = {n: "div",c: "m-0 w-100 text-center text-center",b: [
      {n: "span", i:"userInfoSmall",c: "fs-5  text-center pe-md-1 bi bi-person-circle border-0 text-white"
        ,ttl: "User: " + toTitle(currentEmployee.LegalFirstLastName || "")
      },
    ]};
    userButtonGroup.b.push(userInfoSM);
    nav1.b.push(userButtonGroup);

    sep.i="sep"+clip(guid(true),20);
    sep.ttl="User Info Hover over to the left and User Role buttons to the right for choosing a role";
    nav1.b.push(sep);

    let roleBtns={i: snb.idPrefix + "RoleButtons",c:"btn-group", role:"group", ttl:"Roles",b:[]};
    const currentRole = snb.data?.currentRole || snb.data?.rolesComponent?.currentRole || "";
    for(const rb of snb.data.rolesComponent.roles){
      if(rb.hasRole) {
        const isRoleActive = currentRole
          ? rb.roleName === currentRole
          : (rb.isActive === true || (typeof rb.isActive === "string" && rb.isActive.toLowerCase() === "true"));
        roleBtns.b.push({
          n:"button",i:rb.elementId,type:"button",role:"button",ttl:"Assume " + rb.action + " role for " + rb.elementTitle,
          c:"btn " + (isRoleActive?"btn-primary":"btn-outline-primary") + " btn-sm text-center text-md-start"
          + " border-0 text-white mb-md-1 shadow-none text-nowrap text-truncate","data-active": isRoleActive
          ,b:[
            {n:"span",c: rb.elementIcon + " p-0"},
          ]
        });
      }
    }
    nav1.b.push(roleBtns);        
    sep.i="sep"+clip(guid(true),20);
    sep.ttl="User Role buttons to the left for choosing a role and related links to the right";
    nav1.b.push(sep);

    let relatedLinks={i: snb.idPrefix + "RelatedLinks",c:"btn-group", role:"group", ttl:"Related Links",b:[]};
    nav1.b.push(relatedLinks);

    nbmc.b.push(nav1);
    snb.insertAdjacentHTML("beforeend", jmlToHtml(nbmc));
    snb.moveSlot();
    return nbmc;
  }



//----------------------Render GUI END

//----------------------Wire up
  /**
   * Wire up navbar
   *
   * @memberof ccNavbar
   */
  wire() {
    let snb = this;
    if (snb.menuToggler && snb.menuToggler.dataset.wired !== "true") {
      snb.menuToggler.addEventListener("click", (e) => snb.menuToggle(e));
      snb.menuToggler.dataset.wired = "true";
    }
    //wire home button
    let homeButton = document.querySelector("#homeButton");
    //if (homeButton && homeButton.dataset.wired !== "true") {
      // document.querySelector("#homeButton").addEventListener("click", (e) => {
      //   location.href =snb.dataset.ccHome ||location.origin +"/" +cso.CurrentTask.ControllerName +
      //       "/" +cso.CurrentTask.ActionName +
      //       "?taskId=" +cso.CurrentTask.TaskIdentifier;
      // });
      //homeButton.dataset.wired = "true";
    //}
    //wire small sidebar toggle
    let smallSidebarToggle = document.querySelector("#smallSidebarToggle");
    if (smallSidebarToggle && smallSidebarToggle.dataset.wired !== "true") {
      document.querySelector("#smallSidebarToggle").addEventListener("click", (e) => snb.smallSidebarToggled(e));
      smallSidebarToggle.dataset.wired = "true";
    }

    let sideBarGrouping=document.getElementById(snb.idPrefix + "PageSideBarRow");
    if (snb.menuToggler && sideBarGrouping) {
      const isOpen = !sideBarGrouping.classList.contains("sml-sidebar-hidden");
      snb.menuToggler.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }

  }

  smallSidebarToggled(e,path){
    let snb = this;
    let pageSideBarRow=document.getElementById(snb.idPrefix + "PageSideBarRow");
    if(!pageSideBarRow) return;

    let dir="";
    if(e){
      dir=e.target?.nodeName!=="BUTTON"?e.target:e.target.querySelector("span");
    }

    let usmall=document.querySelector("#usmall");
    let umedium=document.querySelector("#uimedium");
    let ubig=document.querySelector("#uilgUserInfoDiv");
    let sBarBtns=pageSideBarRow.querySelectorAll(".ccsbButtonText");
    let rolesHeaderBigScreen=document.querySelector("#rolesHeaderBigScreen");
    let sideBarButtons=pageSideBarRow.querySelectorAll(".sidebarBtns");
    if(!dir) dir=document.querySelector("#smallSidebarToggle span");
    const isCurrentlySmall = pageSideBarRow.classList.contains("sml-sidebar-mini");
    if(!path) path=(isCurrentlySmall?"standard":"small");
    const makeSmall = path === "small";

    pageSideBarRow.classList.toggle("sml-sidebar-mini", makeSmall);
    pageSideBarRow.dataset.sidebarMode = makeSmall ? "small" : "standard";

    if(dir){
      dir.classList.toggle("bi-chevron-compact-left", !makeSmall);
      dir.classList.toggle("bi-chevron-compact-right", makeSmall);
    }

    if(makeSmall){
      if(usmall)usmall.classList.remove("d-none");
      if(umedium)umedium.classList.add("d-none");
      if(ubig)ubig.classList.add("d-none");
      if(rolesHeaderBigScreen) rolesHeaderBigScreen.classList.add("d-none");
      //rolesHeaderSmallScreen.classList.remove("showOnSmallScreen,showOnXSScreen");
      for(let sbbtn of sideBarButtons){
        sbbtn.classList.remove("text-md-start");
        sbbtn.dataset.needsTextMdStart="true";
      }
      for(let spn of sBarBtns){
        spn.classList.add("d-none");
      }
      saveData("ccSidebarStyle", "small");
    }else{
      if(usmall)usmall.classList.add("d-none");
      if(umedium) umedium.classList.remove("d-none");
      if(ubig)ubig.classList.remove("d-none");
      if(rolesHeaderBigScreen) rolesHeaderBigScreen.classList.remove("d-none");
      //rolesHeaderSmallScreen.classList.add("showOnSmallScreen,showOnXSScreen");
      for(let sbbtn of sideBarButtons){
        if(sbbtn.dataset.needsTextMdStart === "true") sbbtn.classList.add("text-md-start");
        sbbtn.dataset.needsTextMdStart="false";
      }
      for(let spn of sBarBtns){
        spn.classList.remove("d-none");
      }
      saveData("ccSidebarStyle", "standard");
    }

    let smallSidebarToggle=document.querySelector("#smallSidebarToggle");
    if(smallSidebarToggle){
      let label = makeSmall ? "Set to standard sidebar" : "Set to mini sidebar";
      smallSidebarToggle.title = label;
      smallSidebarToggle.setAttribute("aria-label", label);
      smallSidebarToggle.setAttribute("aria-pressed", makeSmall ? "true" : "false");
    }
  }
  moveSlot() {
    let snb=this;
    if(snb.innerHTML.length>0){
      let babies=Array.from(document.querySelectorAll("[data-part] button, [data-part] sml-reactive-button"));
      let slotButtonsEle=document.getElementById(snb.idPrefix + "RelatedLinks");
      if(slotButtonsEle){
        for(let el of babies){
          const clone = el.cloneNode(true); // true = deep clone
          slotButtonsEle.insertAdjacentElement('beforeend', clone);
        }
      }
      let slotdiv=document.querySelector("#slotdiv");
      if(slotdiv) slotdiv.remove();
    }
  }

  menuToggle(e) {
    let snb = this;
    let sideBarGrouping=document.getElementById(snb.idPrefix + "PageSideBarRow")
    if(!sideBarGrouping) return;
    if (sideBarGrouping.classList.contains("sml-sidebar-hidden")) {
      snb.sidebarOpen();
    } else {
      snb.sideBarClosed();
   }
   const isOpen = !sideBarGrouping.classList.contains("sml-sidebar-hidden");
   if(snb.menuToggler){
    snb.menuToggler.setAttribute("aria-expanded", isOpen ? "true" : "false");
   }
   saveData("ccSidebarState", (isOpen?"open":"closed"));
  }

  sidebarOpen(){
    let snb = this;
    let sideBarGrouping=document.getElementById(snb.idPrefix + "PageSideBarRow")
    if(!sideBarGrouping) return;
    sideBarGrouping.classList.remove("sml-sidebar-hidden", "d-none");
  }
  
  sideBarClosed(){
    let snb = this;
    let sideBarGrouping=document.getElementById(snb.idPrefix + "PageSideBarRow")
    if(!sideBarGrouping) return;
    sideBarGrouping.classList.add("sml-sidebar-hidden");
  }


  //----------------------Wire up END



  
  //----------------------Comms
    async getAppSecData(){
        let snb=this;
        const data=window.appSec;
        snb.data=data;
    }
  //----------------------Comms End
}

customElements.define("sml-navbar", smlNavbar);
export default smlNavbar;
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! S.D.G !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^