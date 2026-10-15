/* eslint-disable no-console */

function normalizeHintText(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getNameHintType(nameHint) {
  const hint = normalizeHintText(nameHint);
  if (!hint) return "";

  if (/\b(email|e mail|mail)\b/.test(hint)) return "email";
  if (/\b(phone|telephone|tel|mobile|cell)\b/.test(hint)) return "phone";
  if (/\b(currency|amount|price|cost|total|balance|salary|pay|pay rate|rate)\b/.test(hint)) return "currency";
  if (/\b(date|dob|birth|born|anniversary|day)\b/.test(hint)) return "date";
  if (/\b(url|link|website|web site|web)\b/.test(hint)) return "url";
  if (/\b(bool|boolean|flag|enabled|active|checked|is )\b/.test(hint)) return "boolean";

  return "";
}

function normalizeExplicitColumnType(value) {
  const token = String(value || "").trim().toLowerCase();
  if (!token) return "";

  if (["bool", "boolean"].includes(token)) return "boolean";
  if (["string", "text", "nvarchar", "varchar", "char", "nchar"].includes(token)) return "text";
  if (["date", "datetime", "datetime2", "smalldatetime"].includes(token)) return "date";
  if (["int", "int32", "int64", "long", "short", "integer"].includes(token)) return "integer";
  if (["decimal", "double", "float", "number", "numeric", "money", "smallmoney"].includes(token)) return "decimal";

  return token;
}

export function classifyValueType(rawValue, nameHint = "") {
  const hintedType = getNameHintType(nameHint);
  if (hintedType) {
    return hintedType;
  }

  const isEmail = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(rawValue);
  const isUrl = /^(https?:\/\/|www\.)\S+$/i.test(rawValue);
  const isIcon = /(?:^|\s)(?:fas|fa|bi)-[\w-]+(?:\s|$)/i.test(rawValue);
  const isPicture = /\.(?:png|jpe?g|gif|svg|webp|bmp|ico)(?:[?#].*)?$/i.test(rawValue);
  const isSlashDate = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(rawValue);
  const isDashedDate = /^\d{1,2}[.-]\d{1,2}[.-]\d{2,4}$/.test(rawValue);
  const isIsoDate = /^\d{4}[.-]\d{1,2}[.-]\d{1,2}$/.test(rawValue);
  const isNamedDate = /^[A-Z][a-z]{2,8}\s+\d{1,2},\s*\d{4}$/.test(rawValue);
  const isCurrency = /^-?\$\s?[\d,.]+$/.test(rawValue) && /\d/.test(rawValue);
  const isInteger = /^-?\d+$/.test(rawValue);
  const isDecimal = /^-?\d*\.\d+$/.test(rawValue);
  const isBoolean = /^(true|false|yes|no)$/i.test(rawValue);
  const isPhone = /^\+?[\d\s().-]{7,}$/.test(rawValue) && rawValue.replace(/\D/g, "").length >= 7;

  if (isEmail) return "email";
  if (isIcon) return "icon";
  if (isPicture) return "picture";
  if (isUrl) return "url";
  if (isSlashDate || isDashedDate || isIsoDate || isNamedDate) return "date";
  if (isCurrency) return "currency";
  if (isInteger) return "integer";
  if (isDecimal) return "decimal";
  if (isBoolean) return "boolean";
  if (isPhone) return "phone";
  return "text";
}

function normalizeImageSource(rawValue, imageFolder = "./images") {
  const value = String(rawValue || "").trim();
  if (!value) return "";

  if (/^(?:https?:)?\/\//i.test(value) || value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) {
    return value;
  }

  const baseFolder = String(imageFolder || "./images").trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedBase = baseFolder || "./images";
  return `${normalizedBase}/${value}`;
}

function formatPhoneNumber(rawValue) {
  // Extract only digits and + sign
  const cleaned = rawValue.replace(/[^\d+]/g, "");
  const digitsOnly = cleaned.replace(/\D/g, "");
  
  // Check if we have a valid phone number (7+ digits)
  if (digitsOnly.length < 7) return rawValue;
  
  // Format as (XXX) XXX-XXXX for 10 digits, or generic format for others
  if (digitsOnly.length === 10) {
    return `(${digitsOnly.slice(0, 3)}) ${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`;
  }
  
  // For international/other formats, just add basic formatting
  if (digitsOnly.length >= 11) {
    const countryCode = cleaned.startsWith("+") ? cleaned.slice(0, cleaned.indexOf(digitsOnly[0])) : "";
    return `${countryCode}${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`;
  }
  
  return rawValue;
}

export function buildDetectedType(rawValue, detectedType, imageFolder = "./images") {
  const defaultResult = { type: "text", value: rawValue, url: "", ariaLabel: rawValue, title: rawValue, icon: "bi bi-question-circle", imageSrc: "" };

  switch (detectedType) {
    case "email":
      return {
        type: detectedType,
        value: rawValue,
        url: "mailto:" + rawValue,
        ariaLabel: "Email " + rawValue,
        title: "Email " + rawValue,
        icon: "bi bi-envelope-at",
        imageSrc: ""
      };
    case "icon":
      return {
        type: detectedType,
        value: rawValue,
        url: "",
        ariaLabel: "Icon " + rawValue,
        title: "Icon " + rawValue,
        icon: rawValue,
        imageSrc: ""
      };
    case "picture":
      return {
        type: detectedType,
        value: rawValue,
        url: "",
        ariaLabel: "Picture " + rawValue,
        title: "Picture " + rawValue,
        icon: "bi bi-image",
        imageSrc: normalizeImageSource(rawValue, imageFolder)
      };
    case "phone": {
      const telValue = rawValue.replace(/[^\d+]/g, "");
      if (telValue.replace(/\D/g, "").length < 7) return defaultResult;
      const formattedValue = formatPhoneNumber(rawValue);
      return {
        type: detectedType,
        value: formattedValue,
        url: "tel:" + telValue,
        ariaLabel: "Call " + rawValue,
        title: "Call " + rawValue,
        icon: "bi bi-telephone",
        imageSrc: ""
      };
    }
    case "url": {
      const normalizedUrl = /^https?:\/\//i.test(rawValue) ? rawValue : "https://" + rawValue;
      return {
        type: detectedType,
        value: rawValue,
        url: normalizedUrl,
        ariaLabel: "Open link " + rawValue,
        title: "Open link " + rawValue,
        icon: "bi bi-link-45deg",
        imageSrc: ""
      };
    }
    case "date": {
      const dateObj = new Date(rawValue);
      const formattedValue = isNaN(dateObj.getTime()) ? rawValue : dateObj.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
      });
      return {
        type: detectedType,
        value: formattedValue,
        url: "",
        ariaLabel: "Date " + rawValue,
        title: "Date " + rawValue,
        icon: "bi bi-calendar-event",
        imageSrc: ""
      };
    }
    case "currency": {
      const numValue = parseFloat(rawValue.replace(/[$,\s]/g, ""));
      const formattedValue = isNaN(numValue) ? rawValue : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(numValue);
      return {
        type: detectedType,
        value: formattedValue,
        url: "",
        ariaLabel: "Currency " + rawValue,
        title: "Currency " + rawValue,
        icon: "bi bi-currency-dollar",
        imageSrc: ""
      };
    }
    case "integer":
      return {
        type: "integer",
        value: rawValue,
        url: "",
        ariaLabel: "Number " + rawValue,
        title: "Number " + rawValue,
        icon: "bi bi-hash",
        imageSrc: ""
      };
    case "decimal":
      return {
        type: "decimal",
        value: rawValue,
        url: "",
        ariaLabel: "Number " + rawValue,
        title: "Number " + rawValue,
        icon: "bi bi-calculator",
        imageSrc: ""
      };
    case "boolean": {
      const normalizedBoolean = rawValue.toLowerCase();
      const isOnState = normalizedBoolean === "true" || normalizedBoolean === "yes";
      return {
        type: detectedType,
        value: rawValue,
        url: "",
        ariaLabel: "Boolean " + rawValue,
        title: "Boolean " + rawValue,
        icon: isOnState ? "bi bi-toggle-on" : "bi bi-toggle-off",
        imageSrc: ""
      };
    }
    default:
      return defaultResult;
  }
}

export function dataTypeDetect(value, imageFolder = "./images", nameHint = "") {
  const rawValue = (value || "").trim();
  const defaultResult = { type: "text", value: rawValue, url: "", ariaLabel: rawValue, title: rawValue, icon: "bi bi-question-circle", imageSrc: "" };
  if (!rawValue) return defaultResult;

  const detectedType = classifyValueType(rawValue, nameHint);
  return buildDetectedType(rawValue, detectedType, imageFolder);
}

export function wireCell(cell, apiCall) {
  if (!cell) return;

  if (cell.dataset.url) {
    cell.tabIndex = 0;
    cell.setAttribute("role", "link");
    cell.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const anchor = cell.querySelector("a[href]");
        if (anchor) {
          anchor.click();
        } else {
          globalThis.location.href = cell.dataset.url;
        }
      }
    });
  }

  if (cell.dataset.api) {
    cell.tabIndex = 0;
    cell.setAttribute("role", "button");
    cell.addEventListener("click", async () => {
      await apiCall(cell);
    });
    cell.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        cell.click();
      }
    });
  }
}

export function decorateCell(host, cell, opts) {
  if (!cell || cell.dataset.smlHydrated === "true") {
    return;
  }

  const hasAuthoredContent = Array.from(cell.children).length > 0;
  const explicitIcon = (cell.dataset.icon || "").trim();
  const explicitUrl = (cell.dataset.url || "").trim();
  const explicitApi = (cell.dataset.api || "").trim();
  const sourceText = (cell.dataset.text || cell.textContent || "").trim();
  const imageFolder = (cell.dataset.imageFolder || "./images").trim();
  const explicitColumnType = normalizeExplicitColumnType(cell.dataset.columnDataType || cell.dataset.columnType);
  const nameHint = [cell.dataset.field, cell.dataset.columnTitle, cell.getAttribute("title")].filter(Boolean).join(" ");
  const detectedType = dataTypeDetect(sourceText, imageFolder, nameHint);
  
  // Override detected type with explicit column type if provided
  if (explicitColumnType) {
    if (explicitColumnType === "boolean") {
      detectedType.type = "boolean";
    } else if (explicitColumnType !== "boolean" && detectedType.type === "boolean") {
      // Detected boolean but explicit type is something else - use explicit type as text
      detectedType.type = "text";
      detectedType.url = "";
      detectedType.ariaLabel = sourceText;
      detectedType.title = sourceText;
      detectedType.icon = "bi bi-question-circle";
      detectedType.imageSrc = "";
    } else if (["phone", "email", "url", "currency", "date"].includes(explicitColumnType)) {
      // For these visual types, rebuild the detected type with the explicit type
      detectedType.type = explicitColumnType;
      // Re-detect/rebuild with the explicit type
      const rebuilt = buildDetectedType(sourceText, explicitColumnType, imageFolder);
      Object.assign(detectedType, rebuilt);
    } else {
      // For other explicit types (text, integer, decimal), just use them
      detectedType.type = explicitColumnType;
    }
  }
  const allowTruncate = cell.dataset.allowTruncate === "true";
  const hasAutoVisualType = detectedType.type !== "text" && detectedType.type !== "integer" && detectedType.type !== "decimal";
  const shouldEnhance = Boolean(explicitIcon || explicitUrl || explicitApi || hasAutoVisualType);

  if (hasAuthoredContent && !shouldEnhance) {
    cell.dataset.smlHydrated = "true";
    return;
  }

  if (!shouldEnhance) {
    cell.dataset.smlHydrated = "true";
    return;
  }

  const resolvedUrl = explicitUrl || (explicitApi ? "" : detectedType.url || "");

  const baseId = cell.id || `${host.id}_cell_${opts.clip(opts.guid(true), 10)}`;

  cell.id = baseId;
  cell.dataset.smlHydrated = "true";
  cell.dataset.valueType = detectedType.type;
  cell.dataset.icon = explicitIcon || detectedType.icon || "bi bi-question-circle";

  const cellTitle = cell.getAttribute("title") || detectedType.title || sourceText;
  if (cellTitle) {
    cell.title = cellTitle;
  }

  if (detectedType.ariaLabel) {
    cell.setAttribute("aria-label", detectedType.ariaLabel);
  }

  if (resolvedUrl && !cell.dataset.url) {
    cell.dataset.url = resolvedUrl;
  }

  const isBooleanOn = /^(true|yes)$/i.test(sourceText);
  let contentNode;
  if (detectedType.type === "icon") {
    contentNode = {
      n: "i",
      i: `${baseId}_CellIcon`,
      c: `${sourceText} ms-2`.trim(),
      title: cell.title || sourceText,
      "aria-label": detectedType.ariaLabel || sourceText || cell.title
    };
  } else if (detectedType.type === "boolean") {
    contentNode = {
      n: "input",
      i: `${baseId}_CellBool`,
      type: "checkbox",
      c: "form-check-input ms-2",
      disabled: "true",
      ...(isBooleanOn ? { checked: "checked" } : {}),
      title: detectedType.title || cell.title || sourceText,
      "aria-label": detectedType.ariaLabel || sourceText || cell.title
    };
  } else if (detectedType.type === "picture" && detectedType.imageSrc) {
    contentNode = {
      n: "img",
      i: `${baseId}_CellImage`,
      src: detectedType.imageSrc,
      c: "ms-2",
      s: "max-height:1.5rem;max-width:1.5rem;object-fit:contain;",
      alt: detectedType.ariaLabel || sourceText || cell.title,
      title: cell.title || sourceText,
      "aria-label": detectedType.ariaLabel || sourceText || cell.title
    };
  } else if (resolvedUrl) {
    contentNode = {
      n: "a",
      i: `${baseId}_Cell`,
      href: resolvedUrl,
      c: "smlTableCell hideOnMediumOrLessWindow ms-2",
      title: cell.title || sourceText,
      "aria-label": detectedType.ariaLabel || sourceText || cell.title,
      t: detectedType.value || sourceText || cell.title || ""
    };
  } else {
    contentNode = {
      n: "div",
      i: `${baseId}_Cell`,
      c: "smlTableCell labelToIconMediumOrLess ms-2",
      title: cell.title || sourceText,
      "aria-label": detectedType.ariaLabel || sourceText || cell.title,
      t: detectedType.value || sourceText || cell.title || ""
    };
  }

  let leadingIconNode = null;
  if (detectedType.type !== "icon" && detectedType.type !== "picture" && detectedType.type !== "boolean" && detectedType.type !== "currency") {
    if (resolvedUrl) {
      leadingIconNode = {
        n: "a",
        i: `${baseId}_IconLink`,
        href: resolvedUrl,
        c: "smlTableCell text-decoration-none d-inline-flex align-items-center",
        title: cell.title || sourceText,
        "aria-label": detectedType.ariaLabel || sourceText || cell.title,
        b: [
          { n: "i", i: `${baseId}_Icon`, c: cell.dataset.icon + "" }
        ]
      };
    } else {
      leadingIconNode = { n: "i", i: `${baseId}_Icon`, c: cell.dataset.icon + "" };
    }
  }

  if (allowTruncate && contentNode && (contentNode.n === "a" || contentNode.n === "div" || contentNode.n === "input")) {
    contentNode.c = `${contentNode.c || ""} text-truncate`.trim();
    contentNode.s = `${contentNode.s || ""};max-width:100%;display:inline-block;overflow:hidden;`.replace(/^;/, "");
  }

  const cellIconEnvRaw = {
    i: `${baseId}_CellEnv`,
    c: `align-items-start${allowTruncate ? " d-flex overflow-hidden" : ""}`,
    "aria-hidden": "true",
    b: [
      leadingIconNode,
      contentNode,
      { n: "i", i: `${baseId}_SROnlyIcon`, c: "sr-only", t: detectedType.ariaLabel || sourceText || cell.title || "" }
    ]
  };

  cell.innerHTML = opts.jmlToHtml(cellIconEnvRaw);
  wireCell(cell, opts.apiCall);
}

export function hydrateTableCells(host, table, opts) {
  const cells = Array.from(table.querySelectorAll("tbody td, tbody th, tfoot th"));
  cells.forEach((cell) => decorateCell(host, cell, opts));
}
