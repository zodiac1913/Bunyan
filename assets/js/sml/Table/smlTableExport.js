//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// smlTableExport - complete dataset export for sml-table
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
"use strict";

import { jmlToHtml, toTitle } from "../smlUtils.js";
import { getColumnKey, getColumnTitle, resolveCellValue } from "./smlTableJson.js";

const exportFormats = ["html", "ods", "xlsx", "json", "pdf", "csv", "yaml"];

function resolveExportFormats(action) {
  const configured = action?.exportFormats ?? action?.ExportFormats ?? "*";
  if (String(configured).trim() === "*") return exportFormats;
  const allowed = String(configured).split(",").map((format) => format.trim().toLowerCase()).filter((format) => exportFormats.includes(format));
  return allowed.length > 0 ? [...new Set(allowed)] : exportFormats;
}

function escapeXml(value) {
  const safeText = Array.from(String(value ?? ""))
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint === 0x9 || codePoint === 0xA || codePoint === 0xD
        || (codePoint >= 0x20 && codePoint <= 0xD7FF)
        || (codePoint >= 0xE000 && codePoint <= 0xFFFD)
        || (codePoint >= 0x10000 && codePoint <= 0x10FFFF);
    })
    .join("");

  return safeText
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function valueText(value) {
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function pdfText(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replace(/[\r\n\t]+/gu, " ")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

function truncateForWidth(value, widthPoints, fontSize = 8) {
  const text = valueText(value);
  if (!text) return "";
  const approxCharWidth = fontSize * 0.52;
  const maxChars = Math.max(1, Math.floor(widthPoints / approxCharWidth));
  if (text.length <= maxChars) return text;
  if (maxChars <= 1) return "…";
  return `${text.slice(0, maxChars - 1)}…`;
}

function paginateRows(rows, rowsPerPage) {
  const pageSize = Math.max(1, rowsPerPage || 1);
  const pages = [];
  for (let index = 0; index < rows.length; index += pageSize) {
    pages.push(rows.slice(index, index + pageSize));
  }
  if (pages.length === 0) pages.push([]);
  return pages;
}

function csvValue(value) {
  const text = valueText(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function yamlValue(value) {
  const text = valueText(value);
  if (text === "") return "\"\"";
  if (/^(true|false|null|[-+]?\d+(\.\d+)?)$/iu.test(text)) return text;
  return JSON.stringify(text);
}

function excelColumnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCodePoint(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const centralDirectory = [];
  let offset = 0;
  const write16 = (view, position, value) => view.setUint16(position, value, true);
  const write32 = (view, position, value) => view.setUint32(position, value, true);

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = file.content instanceof Uint8Array ? file.content : encoder.encode(file.content);
    const local = new ArrayBuffer(30 + name.length);
    const localView = new DataView(local);
    write32(localView, 0, 0x04034b50); write16(localView, 4, 20); write16(localView, 6, 0x800);
    write32(localView, 14, crc32(data)); write32(localView, 18, data.length); write32(localView, 22, data.length);
    write16(localView, 26, name.length); new Uint8Array(local, 30).set(name);
    chunks.push(new Uint8Array(local), data);

    const central = new ArrayBuffer(46 + name.length);
    const centralView = new DataView(central);
    write32(centralView, 0, 0x02014b50); write16(centralView, 4, 20); write16(centralView, 6, 20); write16(centralView, 8, 0x800);
    write32(centralView, 16, crc32(data)); write32(centralView, 20, data.length); write32(centralView, 24, data.length);
    write16(centralView, 28, name.length); write32(centralView, 42, offset); new Uint8Array(central, 46).set(name);
    centralDirectory.push(new Uint8Array(central)); offset += local.byteLength + data.length;
  }

  const centralOffset = offset;
  const centralSize = centralDirectory.reduce((total, item) => total + item.length, 0);
  const end = new ArrayBuffer(22);
  const endView = new DataView(end);
  write32(endView, 0, 0x06054b50); write16(endView, 8, files.length); write16(endView, 10, files.length);
  write32(endView, 12, centralSize); write32(endView, 16, centralOffset);
  return new Blob([...chunks, ...centralDirectory, new Uint8Array(end)], { type: "application/zip" });
}

class SmlTableExport extends HTMLElement {
  connectedCallback() {
    if (this.dataset.smlExportWired === "true") return;
    this.dataset.smlExportWired = "true";
    this.render();
    this.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-export-format]");
      if (button) this.export(button.dataset.exportFormat);
    });
  }

  render() {
    const selectId = `${this.id || "smlTableExport"}Format`;
    const options = exportFormats.map((format) => ({ n: "option", value: format, t: format.toUpperCase() }));
    const buttons = exportFormats.map((format) => ({ n: "button", type: "button", class: "btn btn-sm btn-outline-primary", "data-export-format": format, t: format.toUpperCase() }));
    this.insertAdjacentHTML("afterBegin", jmlToHtml({ c: "d-flex flex-wrap gap-2 align-items-center", b: [
      { n: "label", for: selectId, c: "visually-hidden", t: "Export format" },
      { n: "select", i: selectId, c: "form-select form-select-sm w-auto", "aria-label": "Export format", b: options },
      ...buttons,
    ] }));
  }

  getTable() {
    const targetId = this.dataset.tableId || this.getAttribute("for") || "";
    return targetId ? document.getElementById(targetId.replace(/^#/, "")) : this.closest("sml-table");
  }

  async getExportData(targetTable = this.getTable()) {
    const table = targetTable;
    if (!table) throw new Error("No sml-table target was found for export.");
    const rowProviderName = this.dataset.rowsProvider || table.dataset.exportRowsProvider || "";
    const rowProvider = rowProviderName ? globalThis[rowProviderName] : null;
    let providedRows = [];
    if (typeof rowProvider === "function") {
      providedRows = await rowProvider(table);
    } else if (Array.isArray(table._rowsData)) {
      providedRows = table._rowsData;
    } else if (typeof table.readJsonRows === "function") {
      providedRows = table.readJsonRows() || [];
    }
    const rows = Array.isArray(providedRows) ? providedRows : [];
    const columns = table.resolveColumns ? table.resolveColumns(rows) : Object.keys(rows[0] || {});
    return {
      title: table.title || table.id || "SML Table",
      columns: columns.map((column) => ({ key: getColumnKey(column), title: getColumnTitle(table, column) })),
      rows: rows.map((row) => columns.map((column) => resolveCellValue(row, column))),
    };
  }

  async export(format, targetTable = this.getTable()) {
    const selectedFormat = String(format || "csv").toLowerCase();
    if (!exportFormats.includes(selectedFormat)) return;
    const data = await this.getExportData(targetTable);
    const output = this.buildOutput(selectedFormat, data);
    let mime = "text/plain;charset=utf-8";
    if (selectedFormat === "xlsx") mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (selectedFormat === "ods") mime = "application/vnd.oasis.opendocument.spreadsheet";
    if (selectedFormat === "pdf") mime = "application/pdf";
    const blob = output instanceof Blob ? output : new Blob([output], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${this.safeName(data.title)}.${selectedFormat}`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
  }

  safeName(value) { return String(value || "sml-table").replace(/[^a-z0-9_-]+/giu, "-").replace(/^-+/gu, "").replace(/-+$/gu, "").toLowerCase() || "sml-table"; }

  buildOutput(format, data) {
    if (format === "json") return JSON.stringify(data, null, 2);
    if (format === "csv") return [data.columns.map((column) => csvValue(column.title)).join(","), ...data.rows.map((row) => row.map(csvValue).join(","))].join("\r\n");
    if (format === "yaml") return [`title: ${yamlValue(data.title)}`, "columns:", ...data.columns.map((column) => `  - key: ${yamlValue(column.key)}\n    title: ${yamlValue(column.title)}`), "rows:", ...data.rows.map((row) => `  - [${row.map(yamlValue).join(", ")}]`)].join("\n");
    if (format === "html") return this.buildHtml(data);
    if (format === "xlsx") return this.buildXlsx(data);
    if (format === "ods") return this.buildOds(data);
    return this.buildPdf(data);
  }

  buildHtml(data) {
    const pageHeight = 11 * 96;
    const verticalMargins = 0.75 * 96 * 2;
    const titleBarHeight = 0.48 * 96;
    const tableHeaderHeight = 0.35 * 96;
    const rowHeight = 0.3 * 96;
    const rowsPerPage = Math.max(1, Math.floor((pageHeight - verticalMargins - titleBarHeight - tableHeaderHeight - 22) / rowHeight));
    const pages = paginateRows(data.rows, rowsPerPage);
    const pageCount = pages.length;
    const headers = data.columns.map((column) => `<th scope="col">${escapeXml(toTitle(column.title || column.key))}</th>`).join("");
    const pageMarkup = pages.map((pageRows, pageIndex) => {
      const rows = pageRows
        .map((row) => `<tr>${row.map((value) => `<td>${escapeXml(valueText(value))}</td>`).join("")}</tr>`)
        .join("");
      const title = pageIndex === 0 ? data.title : `${data.title} (continued)`;
      return `<section class="export-page"><div class="export-title-bar"><h1>${escapeXml(title)}</h1><span>Page ${pageIndex + 1} of ${pageCount}</span></div><table class="export-table"><caption class="sr-only">${escapeXml(data.title)} - page ${pageIndex + 1} of ${pageCount}</caption><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></section>`;
    }).join("");

    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeXml(data.title)}</title><style>
      :root { --export-navy: #163f6a; --export-navy-dark: #0f304f; --export-zebra: #f2f6fb; --export-border: #c9d5e3; --export-text: #17212b; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; color: var(--export-text); font-family: "Segoe UI", Calibri, Arial, sans-serif; background: #f6f8fb; }
      body { padding: 0.35in; }
      .sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
      .export-page { background: #fff; border: 1px solid var(--export-border); border-radius: 8px; margin: 0 auto 0.35in auto; box-shadow: 0 2px 8px rgba(0,0,0,0.06); overflow: hidden; page-break-after: always; }
      .export-page:last-child { page-break-after: auto; margin-bottom: 0; }
      .export-title-bar { display: flex; justify-content: space-between; align-items: end; gap: 12px; padding: 12px 14px; background: linear-gradient(120deg, var(--export-navy) 0%, var(--export-navy-dark) 100%); color: #fff; }
      .export-title-bar h1 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: 0.2px; }
      .export-title-bar span { font-size: 12px; opacity: 0.95; }
      .export-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .export-table thead th { background: #e7eff8; color: #113254; font-size: 11px; font-weight: 700; text-align: left; padding: 7px 8px; border: 1px solid var(--export-border); }
      .export-table tbody td { font-size: 10.5px; padding: 6px 8px; border: 1px solid var(--export-border); vertical-align: top; overflow-wrap: anywhere; }
      .export-table tbody tr:nth-child(even) td { background: var(--export-zebra); }
      @media print {
        @page { size: Letter portrait; margin: 0.5in; }
        html, body { background: #fff; }
        body { padding: 0; }
        .export-page { margin: 0 0 0.2in 0; border: none; border-radius: 0; box-shadow: none; break-inside: avoid; }
      }
    </style></head><body><main aria-label="${escapeXml(data.title)} export">${pageMarkup}</main></body></html>`;
  }

  buildXlsx(data) {
    const rows = [data.columns.map((column) => toTitle(column.title || column.key)), ...data.rows];
    const sheetRows = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => `<c r="${excelColumnName(columnIndex)}${rowIndex + 1}" s="${rowIndex === 0 ? 1 : rowIndex % 2 === 0 ? 2 : 0}" t="inlineStr"><is><t>${escapeXml(valueText(value))}</t></is></c>`).join("")}</row>`).join("");
    const columnWidths = data.columns.map((column, index) => {
      const longest = Math.max(String(column.title || "").length, ...data.rows.map((row) => valueText(row[index]).length), 10);
      return `<col min="${index + 1}" max="${index + 1}" width="${Math.min(longest + 2, 42)}" bestFit="1" customWidth="1"/>`;
    }).join("");
    return zipStore([
      { name: "[Content_Types].xml", content: `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
      { name: "_rels/.rels", content: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: "xl/workbook.xml", content: `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Export" sheetId="1" r:id="rId1"/></sheets></workbook>` },
      { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: "xl/styles.xml", content: `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="0"/><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF2F8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="1" applyFill="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
      { name: "xl/worksheets/sheet1.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${excelColumnName(Math.max(data.columns.length - 1, 0))}${Math.max(rows.length, 1)}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${columnWidths}</cols><sheetData>${sheetRows}</sheetData></worksheet>` },
    ]);
  }

  buildOds(data) {
    const allRows = [data.columns.map((column) => toTitle(column.title || column.key)), ...data.rows];
    const rows = allRows.map((row, rowIndex) => {
      const cellStyle = rowIndex === 0 ? "HeaderCell" : rowIndex % 2 === 0 ? "AlternateCell" : "BodyCell";
      const cells = row.map((value) => `<table:table-cell table:style-name="${cellStyle}" office:value-type="string"><text:p>${escapeXml(valueText(value))}</text:p></table:table-cell>`).join("");
      return `<table:table-row>${cells}</table:table-row>`;
    }).join("");
    const columnStyles = data.columns.map((column, index) => {
      const longest = Math.max(String(column.title || "").length, ...data.rows.map((row) => valueText(row[index]).length), 10);
      const width = Math.min(longest * 0.12 + 0.35, 5).toFixed(2);
      return `<style:style style:name="Column${index + 1}" style:family="table-column"><style:table-column-properties style:column-width="${width}in"/></style:style>`;
    }).join("");
    const columns = data.columns.map((column, index) => `<table:table-column table:style-name="Column${index + 1}"/>`).join("");
    return zipStore([
      { name: "mimetype", content: "application/vnd.oasis.opendocument.spreadsheet" },
      { name: "content.xml", content: `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2"><office:automatic-styles>${columnStyles}<style:style style:name="HeaderCell" style:family="table-cell"><style:table-cell-properties fo:background-color="#1F4E78"/><style:text-properties fo:color="#FFFFFF" fo:font-weight="bold"/></style:style><style:style style:name="AlternateCell" style:family="table-cell"><style:table-cell-properties fo:background-color="#EAF2F8"/></style:style><style:style style:name="BodyCell" style:family="table-cell"/></office:automatic-styles><office:body><office:spreadsheet><table:table table:name="Export" table:expanded-column-count="${data.columns.length}" table:expanded-row-count="${allRows.length}">${columns}${rows}</table:table></office:spreadsheet></office:body></office:document-content>` },
      { name: "styles.xml", content: `<?xml version="1.0" encoding="UTF-8"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.2"><office:styles/></office:document-styles>` },
      { name: "meta.xml", content: `<?xml version="1.0" encoding="UTF-8"?><office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.2"><office:meta/></office:document-meta>` },
      { name: "settings.xml", content: `<?xml version="1.0" encoding="UTF-8"?><office:document-settings xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.2"><office:settings/></office:document-settings>` },
      { name: "META-INF/manifest.xml", content: `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:media-type="application/vnd.oasis.opendocument.spreadsheet" manifest:full-path="/"/><manifest:file-entry manifest:media-type="text/xml" manifest:full-path="content.xml"/><manifest:file-entry manifest:media-type="text/xml" manifest:full-path="styles.xml"/><manifest:file-entry manifest:media-type="text/xml" manifest:full-path="meta.xml"/><manifest:file-entry manifest:media-type="text/xml" manifest:full-path="settings.xml"/></manifest:manifest>` },
    ]);
  }

  buildPdf(data) {
    const pageWidth = 612;
    const pageHeight = 792;
    const marginLeft = 32;
    const marginRight = 32;
    const marginTop = 30;
    const marginBottom = 28;
    const titleBarHeight = 22;
    const tableHeaderHeight = 18;
    const rowHeight = 16;
    const tableWidth = pageWidth - marginLeft - marginRight;
    const rowsPerPage = Math.max(1, Math.floor((pageHeight - marginTop - marginBottom - titleBarHeight - 10 - tableHeaderHeight) / rowHeight));
    const pages = paginateRows(data.rows, rowsPerPage);
    const pageCount = pages.length;
    const objects = ["", ""];
    const pageNumbers = [];
    const contentNumbers = [];
    for (let index = 0; index < pageCount; index += 1) {
      pageNumbers.push(objects.length + 1); objects.push("");
      contentNumbers.push(objects.length + 1); objects.push("");
    }
    const fontNumber = objects.length + 1;
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[1] = `<< /Type /Pages /Kids [${pageNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pageCount} >>`;
    pages.forEach((page, index) => {
      const columnWidth = tableWidth / Math.max(data.columns.length, 1);
      const titleY = pageHeight - marginTop - titleBarHeight;
      const headerY = titleY - 10 - tableHeaderHeight;
      const commands = ["q", "0.09 0.25 0.42 rg", `${marginLeft} ${titleY} ${tableWidth} ${titleBarHeight} re f`, "Q"];
      const title = index === 0 ? data.title : `${data.title} (continued)`;
      const pageLabel = `Page ${index + 1} of ${pageCount}`;
      commands.push(`BT /F1 11 Tf 1 1 1 rg ${marginLeft + 8} ${titleY + 7} Td (${pdfText(title)}) Tj ET`);
      commands.push(`BT /F1 9 Tf 1 1 1 rg ${Math.max(marginLeft + 8, pageWidth - marginRight - (pageLabel.length * 4.8) - 6)} ${titleY + 7} Td (${pdfText(pageLabel)}) Tj ET`);

      commands.push("q", "0.9 0.94 0.98 rg", `${marginLeft} ${headerY} ${tableWidth} ${tableHeaderHeight} re f`, "Q");
      commands.push("0.7 0.78 0.87 RG", `${marginLeft} ${headerY} ${tableWidth} ${tableHeaderHeight} re S`);
      data.columns.forEach((column, columnIndex) => {
        const x = marginLeft + columnIndex * columnWidth;
        const headerText = truncateForWidth(toTitle(column.title || column.key), columnWidth - 8, 8);
        commands.push(`BT /F1 8 Tf 0.07 0.2 0.33 rg ${x + 4} ${headerY + 6} Td (${pdfText(headerText)}) Tj ET`);
        if (columnIndex > 0) {
          commands.push("0.82 0.86 0.91 RG", `${x} ${headerY} m ${x} ${headerY + tableHeaderHeight} l S`);
        }
      });

      page.forEach((row, rowIndex) => {
        const y = headerY - ((rowIndex + 1) * rowHeight);
        if (rowIndex % 2 === 1) {
          commands.push("q", "0.96 0.97 0.99 rg", `${marginLeft} ${y} ${tableWidth} ${rowHeight} re f`, "Q");
        }
        commands.push("0.82 0.86 0.91 RG", `${marginLeft} ${y} ${tableWidth} ${rowHeight} re S`);
        row.forEach((value, columnIndex) => {
          const x = marginLeft + columnIndex * columnWidth;
          const cellText = truncateForWidth(value, columnWidth - 8, 7);
          commands.push(`BT /F1 7 Tf 0 0 0 rg ${x + 4} ${y + 5} Td (${pdfText(cellText)}) Tj ET`);
          if (columnIndex > 0) {
            commands.push("0.9 0.92 0.95 RG", `${x} ${y} m ${x} ${y + rowHeight} l S`);
          }
        });
      });

      const stream = commands.join(" ");
      objects[pageNumbers[index] - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentNumbers[index]} 0 R /Resources << /Font << /F1 ${fontNumber} 0 R >> >> >>`;
      objects[contentNumbers[index] - 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });
    let pdf = "%PDF-1.4\n"; const offsets = [0];
    objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = pdf.length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([pdf], { type: "application/pdf" });
  }
}

export function openTableExportMenu(table, anchor, action = null) {
  if (!table || !anchor) return;
  const existingMenu = anchor.parentElement?.querySelector("[data-sml-export-menu]");
  if (existingMenu) {
    existingMenu.remove();
    anchor.setAttribute("aria-expanded", "false");
    return;
  }

  const menuId = `${table.id || "smlTable"}ExportMenu`;
  const allowedFormats = resolveExportFormats(action);
  anchor.setAttribute("aria-haspopup", "menu");
  anchor.setAttribute("aria-expanded", "true");
  const menu = { n: "ul", i: menuId, "data-sml-export-menu": "true", class: "dropdown-menu show p-2 text-wrap text-break overflow-hidden list-unstyled mb-0", role: "menu", s: "width:300px; max-width:600px; min-width:0; white-space:normal; overflow-wrap:anywhere; word-break:break-word; overflow-x:hidden;", b: [
    {
      n: "li",
      class: "px-2 pb-1",
      b: [
        { n: "div", class: "d-flex justify-content-between align-items-start gap-2 text-wrap text-break", b: [
          { n: "div", class: "small fw-semibold text-wrap text-break overflow-hidden flex-fill", s: "white-space:normal; overflow-wrap:anywhere; word-break:break-word; min-width:0;", t: "Export all rows" },
          { n: "button", type: "button", class: "btn btn-sm btn-link text-muted p-0 ms-2 flex-shrink-0", "data-export-close": "true", "aria-label": "Close export menu", title: "Close", t: "x" }
        ] }
      ]
    },
    ...allowedFormats.map((format) => ({ n: "li", class: "w-100", b: [{ n: "button", type: "button", class: "dropdown-item text-wrap text-break w-100", s: "white-space:normal; overflow-wrap:anywhere; word-break:break-word; min-width:0;", "data-export-format": format, t: format.toUpperCase() }] })),
  ] };
  anchor.parentElement?.insertAdjacentHTML("beforeend", jmlToHtml(menu));
  const exportMenu = anchor.parentElement?.querySelector(`#${menuId}`);
  if (!exportMenu) {
    anchor.setAttribute("aria-expanded", "false");
    return;
  }

  exportMenu.style.setProperty("width", "300px", "important");
  exportMenu.style.setProperty("max-width", "600px", "important");
  exportMenu.style.setProperty("min-width", "0", "important");
  exportMenu.style.setProperty("white-space", "normal", "important");
  exportMenu.style.setProperty("overflow-wrap", "anywhere", "important");
  exportMenu.style.setProperty("word-break", "break-word", "important");
  exportMenu.style.setProperty("overflow-x", "hidden", "important");

  const exportMenuHeader = exportMenu.firstElementChild;
  if (exportMenuHeader instanceof HTMLElement) {
    exportMenuHeader.style.setProperty("align-items", "flex-start", "important");
    exportMenuHeader.style.setProperty("gap", "0.5rem", "important");
    exportMenuHeader.style.setProperty("min-width", "0", "important");
  }

  for (const item of exportMenu.querySelectorAll(".dropdown-item, [data-export-format]")) {
    if (!(item instanceof HTMLElement)) continue;
    item.style.setProperty("white-space", "normal", "important");
    item.style.setProperty("overflow-wrap", "anywhere", "important");
    item.style.setProperty("word-break", "break-word", "important");
    item.style.setProperty("min-width", "0", "important");
    item.style.setProperty("max-width", "100%", "important");
  }

  const closeMenu = () => {
    exportMenu.remove();
    anchor.setAttribute("aria-expanded", "false");
    anchor.focus?.();
    document.removeEventListener("click", onOutsideClick, true);
    exportMenu.removeEventListener("keydown", onMenuKeydown);
  };

  const onOutsideClick = (event) => {
    if (exportMenu.contains(event.target) || anchor.contains(event.target)) return;
    closeMenu();
  };

  const onMenuKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    }
  };

  exportMenu.setAttribute("aria-label", "Export options");
  document.addEventListener("click", onOutsideClick, true);
  exportMenu.addEventListener("keydown", onMenuKeydown);

  const firstInteractive = exportMenu.querySelector("button[data-export-format], button[data-export-close='true']");
  firstInteractive?.focus?.();

  const exporter = document.createElement("sml-table-export");
  exportMenu.addEventListener("click", async (event) => {
    const closeButton = event.target.closest("button[data-export-close='true']");
    if (closeButton) {
      closeMenu();
      return;
    }

    const button = event.target.closest("button[data-export-format]");
    if (!button) return;
    closeMenu();
    await exporter.export(button.dataset.exportFormat, table);
  });
}

if (!customElements.get("sml-table-export")) customElements.define("sml-table-export", SmlTableExport);
export default SmlTableExport;
