# sml-auto-complete

This document explains how to use the `sml-auto-complete` web component, with emphasis on standalone/lone action mode.

## Purpose

`sml-auto-complete` supports two common patterns:

1. Facade mode inside `sml-input`
2. Standalone mode as a direct page element

It now also supports a standalone action pattern (`data-lone="true"`) with an integrated label + input + go button layout.

## Required Attributes

- `id`: unique element id
- `data-cc-property`: bound property name
- `data-api`: API endpoint used for lookup

## Common Optional Attributes

- `data-label`: label text (general mode)
- `data-api-value`: result property used for visible option text
- `data-api-id`: result property used as selected id/value
- `data-placeholder`: search input placeholder
- `data-min-chars`: minimum chars before searching (default: `3`)
- `data-select-type`: `single` or `multiple`
- `data-api-filters-up`: comma-delimited list of filter properties to send with search payload
- `data-api-props-down`: requested/propagated property mapping for dependent fields

## Lone Mode (Standalone Action)

Enable with:

- `data-lone="true"`

When enabled, the component renders an integrated standalone control with:

- left label
- autocomplete search input
- right Go button

### Lone Mode Attributes

- `data-lone-label`: label text shown on the left
- `data-lone-submit`: action target used when Go is clicked
- `data-lone-go`: text shown on the Go button
- `data-long-go`: alias supported for compatibility (same effect as `data-lone-go`)

### Submit Behavior

When Go is clicked in lone mode:

1. The component dispatches `sml-lone-submit` with selected details.
2. If `data-lone-submit` matches a global function name, that function is invoked.
3. Otherwise `data-lone-submit` is treated as URL.

URL handling:

- If URL contains `{id}`, it is replaced with selected id/value.
- If URL does not contain `{id}`, query params are appended:
  - `<property>=<value>`
  - `selectedId=<id>`
  - `selectedText=<text>`

## Emitted Events

- `sml-selected`: fired when a user selection is made
- `sml-lone-submit`: fired when lone-mode Go is clicked

### sml-lone-submit detail payload

- `submitAction`
- `value`
- `text`
- `selectedId`
- `property`

## Example: Lone Proxy Picker

```html
<sml-auto-complete
  id="ProxySmlAutoComplete"
  data-cc-property="UserIdentifier"
  data-api="/Configurer/ApiProxyPick"
  data-api-value="moniker"
  data-api-id="userIdentifier"
  data-label="PROXY"
  data-lone="true"
  data-lone-label="PROXY"
  data-lone-submit="/Configurer/ProxyUser?id={id}"
  data-lone-go="Go">
</sml-auto-complete>
```

## Notes

- The Go button is only useful after a valid selection exists.
- If no value is selected, Go focuses the search input.
- Existing non-lone behavior remains unchanged.
