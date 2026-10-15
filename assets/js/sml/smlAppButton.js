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
 * smlReactiveButton --- sml Reactive Button module for SML Reactive Buttons
 * Public Domain Licensed Copyright Law of the United States of America, Section 105 (https://www.copyright.gov/title17/92chap1.html#105)
 * Et qui me misit, mecum est: non reliquit me solum Pater, quia ego semper quae placita sunt ei, facio!
 * Published by: Dominic Roche of OIT/IUSG/DASM on 12/30/2025
 * @class smlAppButton
 * @extends {HTMLElement}
 */
// תהילתו. לא שלי
import sml from './sml.js';
import { apiPostDirect, clip, ensureSmlModalHelpers, guid, jmlToHtml, receiptCheckGood, unobtrusiveWait, unobtrusiveWaitOff } from './smlUtils.js';
"use strict";

function isIconClassName(value) {
    const text = String(value || "").trim();
    if (!text) return false;

    return /(?:^|\s)(?:bi\s+bi-[\w-]+|fa[srldb]?\s+fa-[\w-]+|bi-[\w-]+|fa-[\w-]+)(?:\s|$)/i.test(text);
}

function normalizeIconClass(value) {
    const text = String(value || "").trim();
    if (!text) return "";

    const tokens = text.split(/\s+/).filter(Boolean);
    const normalizedTokens = [];

    tokens.forEach((token) => {
        if (/^bi-[\w-]+$/i.test(token)) {
            if (!normalizedTokens.includes("bi")) normalizedTokens.push("bi");
            normalizedTokens.push(token);
            return;
        }

        const faMatch = token.match(/^(fa|fas|far|fal|fab|fad)-([\w-]+)$/i);
        if (faMatch) {
            if (!normalizedTokens.includes(faMatch[1].toLowerCase())) normalizedTokens.push(faMatch[1].toLowerCase());
            normalizedTokens.push(`fa-${faMatch[2]}`);
            return;
        }

        normalizedTokens.push(token);
    });

    return normalizedTokens.filter((token, index) => normalizedTokens.indexOf(token) === index).join(" ").trim();
}

function isImageFileName(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    return /\.(?:png|jpe?g|gif|svg|webp|bmp|ico)(?:[?#].*)?$/i.test(text);
}

class smlAppButton extends HTMLElement {

    /* -~~--~~--~~--~~--~~--~~--~~--~~-- Init Lifecycle -~~--~~--~~--~~--~~--~~--~~- */ 

    static observedAttributes=["data-api","data-toggler-done","data-active"];

    async connectedCallback() {
        let sab = this;
        sab.initializeBaseAttributes();
        sab.currApp=(globalThis.cso?.MyApps || []).find(x=>x.AppAssignedIdentifier==sab.dataset.appAssn);
        sab.hasRoleBtn=(sab.currApp?.AppDescription || "").includes("(Role Based)");
        sab.buttonApps=[];
        const ab = sab.buildButton();
        sab.innerHTML = ab;
        sab.wire();
    }

    buildButton(){
        let sab = this;
        const url=sab.currApp?.Url.replaceAll("~",location.origin);
        const currAppIdSuffix=sab.currApp?.AppAssignedIdentifier ? ("_" + sab.currApp.AppAssignedIdentifier +"_"+ sab.currApp.AppIdentifier) : ("_"+ sab.currApp.AppIdentifier);
        sab.buttonApps.push(sab.currApp);
        let container = {i:"AppButton" + currAppIdSuffix,c:"d-flex flex-column mt-n1", 
            s:"width: 9rem; height: 9rem;",b:[]};
        let bigBtn={n:"a",type:"button",c:"btn btn-outline-dark border-top-1 rounded-top-2 rounded-bottom-0",href:url
                     ,title: sab.title? sab.title : sab.currApp.AppName.replaceAll("", "") +
                     sab.currApp.AppDescription,b:[]};
        let appTitle = {c:"text-nowrap text-truncate small",t: sab.currApp.AppTitle};
        bigBtn.b.push(appTitle);
        let appIconValue = String(sab.currApp.AppIcon || "").trim();
        let appIcon = isIconClassName(appIconValue)
            ? { n: "span", c: `${normalizeIconClass(appIconValue)} fs-1 lh-1`, s: "width: 5rem; height: 5rem" }
            : { n: "img", src: isImageFileName(appIconValue) ? `/images/Apps/${appIconValue}` : appIconValue, c: "img-fluid", s: "width: 5rem; height: 5rem" };
        bigBtn.b.push(appIcon);
        container.b.push(bigBtn);   
        //Lower Buttons
        let bottomBtns = {c:"d-flex flex-row align-items-stretch rounded-bottom-2",b:[]};

        if(sab.hasRoleBtn){
            let rolesBtn = {
                i: "rolesButton_" + sab.currApp.AppIdentifier,
                c: "dropdown d-inline-flex",
                b: [
                    {
                        n: "button",
                        type: "button",
                        i: "rolesButton_" + sab.currApp.AppIdentifier + "Toggle",
                        title: "View Roles for " + sab.currApp.AppName,
                        c: "btn btn-success btn-sm border-dark rounded-top-0 border-top-0 small",
                        s: sab.getBottomButtonCornerStyle(true, false),
                        "data-bs-toggle": "dropdown",
                        "aria-expanded": "false",
                        b: [
                            { n: "span", c: "bi bi-stack", s: "width: fit-content; height: fit-content", ttl: "Roles for " + sab.currApp.AppName }
                        ]
                    },
                    {
                        n: "ul",
                        i: "rolesButton_" + sab.currApp.AppIdentifier + "Menu",
                        c: "dropdown-menu dropdown-menu-end p-1 shadow",
                        "aria-labelledby": "rolesButton_" + sab.currApp.AppIdentifier + "Toggle",
                        b: [
                            { n: "li", b: [{ n: "span", c: "dropdown-item-text small text-muted", t: "Loading roles..." }] }
                        ]
                    }
                ]
            };
            bottomBtns.b.push(rolesBtn);
        }
        let infoBtn = {n:"button",type:"button",c:"flex-fill btn btn-success btn-sm border-dark rounded-top-0 border-top-1 small"
            ,s: sab.getBottomButtonCornerStyle(!sab.hasRoleBtn, !sab.hasSettingsBtn)
            ,i:"infoButton_" + sab.currApp.AppIdentifier,title:"Get App Information for " + sab.currApp.AppName
            //,onclick:`getTaskInformation('${sab.currApp.AppIdentifier}','${sab.currApp.AppAssignedIdentifier}',this)`
            ,t:"Info"};
        bottomBtns.b.push(infoBtn);
        let settingsBtn = {n:"button",type:"button",c:"btn btn-success btn-sm border-dark rounded-top-0 border-top-0 small"
            ,s: sab.getBottomButtonCornerStyle(false, true)
            ,i:"settingsButton_" + sab.currApp.AppIdentifier,title:"Settings for " + sab.currApp.AppName
            ,b:[{n:"span",c:"bi bi-gear",s:"width: fit-content; height: fit-content"}]};
        if(sab.hasSettingsBtn){
            bottomBtns.b.push(settingsBtn);
        }
        container.b.push(bottomBtns);               


        return jmlToHtml(container); 
    }

    async ensureModalHelpers(){
        ensureSmlModalHelpers();
    }

    getBottomButtonCornerStyle(roundLeft, roundRight){
        const radius = "0.375rem";
        return "border-top-left-radius: 0; border-top-right-radius: 0; border-bottom-left-radius: " + (roundLeft ? radius : "0") + "; border-bottom-right-radius: " + (roundRight ? radius : "0") + ";";
    }


    /* -~~--~~--~~--~~--~~--~~--~~--~~-- END Init Lifecycle -~~--~~--~~--~~--~~--~~--~~- */ 


    /* -~~--~~--~~--~~--~~--~~--~~--~~-- Setup Calls -~~--~~--~~--~~--~~--~~--~~- */ 

    initializeBaseAttributes() {
        let sab = this;
        sab.id = sab.id || "sab"+clip(guid(true),20);
        if(!sab.role) sab.role="button";
        if(!sab.title) sab.title="sml App Button not explained, ask DASM to fix this";
        if(!sab.ariaLabel) sab.ariaLabel=sab.title;
        if(sab.className=="") sab.className="";//"border-0 text-white text-nowrap text-truncate";
        sab.hasSettingsBtn = (sab.dataset?.hasSettings||false);
        sab.appSecLoaded = false;
        sab.pendingAppSecLoad = null;
    }

    /* -~~--~~--~~--~~--~~--~~--~~--~~-- End Setup Calls -~~--~~--~~--~~--~~--~~--~~- */ 

    /* -~~--~~--~~--~~--~~--~~--~~--~~-- Event Calls -~~--~~--~~--~~--~~--~~--~~- */ 

    async wire(){
        let sab = this;
        const infoBtn = sab.querySelector("#infoButton_" + sab.currApp.AppIdentifier);
        const settingsBtn = sab.querySelector("#settingsButton_" + sab.currApp.AppIdentifier);
        const rolesMenu = sab.querySelector("#rolesButton_" + sab.currApp.AppIdentifier + "Menu");
        const rolesToggle = sab.querySelector("#rolesButton_" + sab.currApp.AppIdentifier + "Toggle");


        infoBtn?.addEventListener("click", async (e)=>{
            await sab.infoModal();
        });

        settingsBtn?.addEventListener("click", async (e)=>{
            await sab.setupModal();
        });

        if (sab.hasRoleBtn) {
            const loadRoles = async () => {
                const loaded = await sab.ensureAppSecurityLoaded();
                if (!loaded && rolesMenu) {
                    rolesMenu.innerHTML = '<li><span class="dropdown-item-text small text-muted">No roles available</span></li>';
                }
            };

            rolesToggle?.addEventListener("click", loadRoles);

            const robAcceptedFlag = document.querySelector("#robAcceptedFlag");
            if (sab.isRobAccepted()) {
                await loadRoles();
            } else {
                robAcceptedFlag?.addEventListener("change", async () => {
                    if (sab.isRobAccepted()) {
                        await loadRoles();
                    }
                }, { once: true });

                document.addEventListener("cats:rob-accepted", async () => {
                    await loadRoles();
                }, { once: true });
            }
        }

    }

    isRobAccepted(){
        const robAcceptedFlag = document.querySelector("#robAcceptedFlag");
        return (robAcceptedFlag?.value || "false") === "true";
    }

    getAppSecRoles(){
        let sab = this;
        return sab.appSec?.roles || sab.appSec?.rolesComponent?.roles || [];
    }

    async ensureAppSecurityLoaded(){
        let sab = this;
        if (sab.appSecLoaded) return true;
        if (sab.pendingAppSecLoad) return await sab.pendingAppSecLoad;

        sab.pendingAppSecLoad = (async () => {
            let dataUpParsed = JSON.stringify({ data: "appSec" });
            let apiUrl = location.origin + "/" + sab.currApp.ControllerName + "/ApiGetAppSecurityConfig";
            let data = await apiPostDirect(apiUrl, dataUpParsed, "json");
            if (receiptCheckGood(data)) {
                sab.appSec = data;
                sab.appSecLoaded = true;
                sab.populateRoleDropdown();
                sab.pendingAppSecLoad = null;
                return true;
            }

            sab.pendingAppSecLoad = null;
            return false;
        })();

        return await sab.pendingAppSecLoad;
    }

    populateRoleDropdown(){
        let sab = this;
        const rolesMenu = sab.querySelector("#rolesButton_" + sab.currApp.AppIdentifier + "Menu");
        const rolesToggle = sab.querySelector("#rolesButton_" + sab.currApp.AppIdentifier + "Toggle");
        if (!rolesMenu || !rolesToggle) return;

        const roles = sab.getAppSecRoles().filter(role => role?.hasRole && role?.action);
        rolesMenu.innerHTML = "";
        let rolesBtn=document.querySelector("#rolesButton_" + sab.currApp.AppIdentifier + "Toggle");
        //if((sab.appSec?.rolesComponent?.roles.length||0)<2){
            //rolesBtn.classList.add("d-none");
        //}else{
            if (roles.length === 0) {
                rolesMenu.innerHTML = '<li><span class="dropdown-item-text small text-muted">No accessible roles</span></li>';
                rolesToggle.disabled = true;
                return;
            }

            for (const role of roles) {
                if(role.hasRole){
                const menuItem = document.createElement("li");
                const roleButton = document.createElement("button");
                roleButton.type = "button";
                roleButton.className = "dropdown-item small text-nowrap text-truncate";
                roleButton.textContent = role.elementText || role.roleName || role.action;
                roleButton.title = role.elementTitle || role.elementText || role.roleName || role.action;
                if ((sab.appSec?.currentRole || sab.appSec?.rolesComponent?.currentRole || "") === role.roleName) {
                    roleButton.classList.add("active");
                }
                roleButton.addEventListener("click", async () => {
                    await sab.changeRole(role);
                });
                menuItem.appendChild(roleButton);
                rolesMenu.appendChild(menuItem);
                }
            //}
            //rolesBtn.classList.remove("d-none");
        }
    }

    async changeRole(role){
        let sab = this;
        const controllerName = sab.appSec?.currentApp?.ControllerName || sab.currApp?.ControllerName;
        const payload = {
            roleName: role.roleName,
            userIdentifier: globalThis.cso?.UserIdentifier,
            controllerAction: "ChangeRole",
            controllerName: controllerName,
        };
        const api = location.origin + "/" + controllerName + "/ChangeRole/";
        unobtrusiveWait("Please wait. Redirecting to " + role.roleName);
        const data = await apiPostDirect(api, JSON.stringify(payload), "json");

        if (!receiptCheckGood(data) || data?.errorObject) {
            console.warn("smlAppButton.changeRole: role change failed.", data?.errorObject || data);
            return;
        }

        const nextController = data?.currentApp?.ControllerName || controllerName;
        const nextAction = role.action || data?.rolesComponent?.roles?.find(r => r.roleName === role.roleName)?.action;
        if (!nextController || !nextAction) {
            location.reload();
            return;
        }

        location.href = location.origin + "/" + nextController + "/" + nextAction;
        unobtrusiveWaitOff();
    }

    async infoModal(){
        ensureSmlModalHelpers();
        if (globalThis.smlModalConfigOpen) {
        //     headerBackgroundClass: "bg-light border-primary",
        }
        //     hideClosingX: false,
        //     modalSize: 'medium'
        // });





        const cfg = {
                id: `AppSettingsModal` + sab.currApp.AppAssignedIdentifier,
                addCloseButton: true,
                closeOnBackgroundClick: true,
                dialogSize: "",
                contentJML: { i: `AppDetails`, c: "modal-content text-start border-3 border-dark shadow shadow-xl rounded-3 p-3 m-5", b: [] },
                headerJML: {
                    c: "card-header text-center p-2",
                    s: "background-color: #00539b",
                    i: `DIV` +appName,
                    b: [{
                        s: "height: 35px; width: 75px;",
                        src: "/images/cms_logo_header.png",
                        alt: "Centers for Medicare & Medicaid Logo",
                        ttl: "Centers for Medicare & Medicaid Logo",
                        n: "img",
                        i: `IMG` + appName
                    }]
                },
                bodyJML:{c:"modal-body",b:[
                    {n:"span",i:"MessageModalBody"+appName,c:"h5",b:[
                            {c:"row",b:[
                                {c:"col-md-4 text-right fw-bolder",t:"App Title:"},
                                {c:"col-md-8",t:sab.currApp.AppTitle}
                            ]},
                            {c:"row",b:[
                                {c:"col-md-4 text-right fw-bolder",t:"App Description:"},
                                {c:"col-md-8",t:sab.currApp.AppDescription}
                            ]},
                            {c:"row",b:[
                                {c:"col-md-4 text-right fw-bolder",t:"Is App Delegatable:"},
                                {c:"col-md-8",t:sab.currApp?.IsDelegatable ? "Yes" : "No"}
                            ]},
                            {c:"row",b:[
                                {c:"col-md-12 text-right fw-bolder",t:"Subject Matter Expert(s):"},
                            ]},
                            {c:"row",b:[
                                {c:"col text-center",b:[]}
                            ]},             
                        ]}
                    ]},
                    hasOverlay: true
                };
        await globalThis.smlModalConfigOpen(cfg);
    }

    async setupModal(){
        let sab = this;
        await sab.ensureModalHelpers();
        let appName=sab.currApp.AppName.replaceAll(" ", "");
        console.log(sab.currApp);
        const cfg = {
                id: `AppSettingsModal` + sab.currApp.AppAssignedIdentifier,
                addCloseButton: true,
                closeOnBackgroundClick: true,
                dialogSize: "",
                contentJML: { i: `AppDetails`, c: "modal-content text-start border-3 border-dark shadow shadow-xl rounded-3 p-3 m-5", b: [] },
                headerJML: {
                    c: "card-header text-center p-2",
                    s: "background-color: #00539b",
                    i: `DIV` +appName,
                    b: [{
                        s: "height: 35px; width: 75px;",
                        src: "/images/cms_logo_header.png",
                        alt: "Centers for Medicare & Medicaid Logo",
                        ttl: "Centers for Medicare & Medicaid Logo",
                        n: "img",
                        i: `IMG` + appName
                    }]
                },
                bodyJML:{c:"modal-body",b:[
                    {n:"span",i:"MessageModalBody"+appName,c:"h5",b:[
                            {c:"row",b:[
                                {c:"col-md-4 text-right fw-bolder",t:"App Title:"},
                                {c:"col-md-8",t:sab.currApp.AppTitle}
                            ]},
                            {c:"row",b:[
                                {c:"col-md-4 text-right fw-bolder",t:"App Description:"},
                                {c:"col-md-8",t:sab.currApp.AppDescription}
                            ]},
                            {c:"row",b:[
                                {c:"col-md-4 text-right fw-bolder",t:"Is App Delegatable:"},
                                {c:"col-md-8",t:sab.currApp?.IsDelegatable ? "Yes" : "No"}
                            ]},
                            {c:"row",b:[
                                {c:"col-md-12 text-right fw-bolder",t:"Subject Matter Expert(s):"},
                            ]},
                            {c:"row",b:[
                                {c:"col text-center",b:[]}
                            ]},             
                        ]}
                    ]},
                    hasOverlay: true
                };
                await globalThis.smlModalConfigOpen(cfg);
            };
    /* -~~--~~--~~--~~--~~--~~--~~--~~-- END Event Calls -~~--~~--~~--~~--~~--~~--~~- */ 
    }




customElements.define("sml-app-button", smlAppButton);

export default smlAppButton;
