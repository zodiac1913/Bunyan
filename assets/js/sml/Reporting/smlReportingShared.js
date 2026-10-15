"use strict";

import { ensureSmlModalHelpers, modalBox } from "../smlUtils.js";

function normalizeButtonText(button) {
  const rawText = (button.textContent || "").replace(/\s+/g, " ").trim();
  if (rawText.length > 0) return rawText;
  return (button.getAttribute("aria-label") || button.getAttribute("title") || button.id || "Action").trim();
}

function normalizeButtonIcon(button) {
  const iconNode = button.querySelector("[class*='bi-']");
  if (iconNode?.className) {
    return String(iconNode.className)
      .split(/\s+/)
      .filter((className) => className.startsWith("bi"))
      .join(" ")
      .trim();
  }

  if (button.classList.contains("btn-close")) {
    return "bi bi-x-lg";
  }

  return "";
}

export function upgradeButtonsIn(root) {
  const scope = root?.querySelectorAll ? root : document;
  const buttons = Array.from(scope.querySelectorAll("button"));

  buttons.forEach((button) => {
    if (!button || button.closest("sml-reactive-button")) return;

    const replacement = document.createElement("sml-reactive-button");
    Array.from(button.attributes).forEach((attribute) => {
      replacement.setAttribute(attribute.name, attribute.value);
    });

    replacement.className = button.className;
    replacement.id = button.id;
    replacement.dataset.manualWire = replacement.dataset.manualWire || "true";

    const iconClass = normalizeButtonIcon(button);
    const text = normalizeButtonText(button);
    if (iconClass) replacement.dataset.icon = iconClass;
    replacement.dataset.text = text;

    if (!button.getAttribute("title") && text) {
      replacement.setAttribute("title", text);
    }
    if (!button.getAttribute("aria-label") && text) {
      replacement.setAttribute("aria-label", text);
    }

    const isIconOnly = button.classList.contains("btn-close")
      || button.classList.contains("dropdown-toggle-split")
      || ((button.textContent || "").trim().length < 1);
    if (isIconOnly) {
      replacement.dataset.iconOnly = "true";
    }

    if (button.disabled) {
      replacement.setAttribute("disabled", "disabled");
      replacement.dataset.disabled = "true";
    }

    button.replaceWith(replacement);
  });
}

export async function showReportingMessage(message, title = "Message") {
  return modalBox(message, title);
}

export async function openReportingConfigModal(cfg) {
  const openModal = ensureSmlModalHelpers();

  const modalHandle = await openModal(cfg);
  const modalRoot = document.getElementById(cfg?.id || "") || document.body;
  upgradeButtonsIn(modalRoot);
  return modalHandle;
}

export function queryInteractiveButtons(root, selector = "button, sml-reactive-button") {
  if (!root?.querySelectorAll) return [];
  return Array.from(root.querySelectorAll(selector));
}