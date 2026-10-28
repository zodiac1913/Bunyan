export const ISSUE_GUIDE_DETAILS_BY_TITLE = {
  "Missing Page Title": {
    overview: "This finding appears when the page has no meaningful document title in the browser tab.",
    whyItMatters: [
      "Screen reader users often hear the page title before they hear the page body.",
      "A missing or useless title makes browser tabs, history, bookmarks, and task switching much harder.",
      "The page title is one of the fastest orientation cues users get."
    ],
    reviewChecklist: [
      "Make sure the page has one title element in the head.",
      "Use the actual page topic, task, or record name in the title.",
      "Keep repeated site branding secondary to the page-specific part of the title."
    ]
  },
  "Missing Language Declaration": {
    overview: "This finding appears when the page does not declare its primary language on the html element.",
    whyItMatters: [
      "Screen readers use the page language to choose the correct pronunciation and speech rules.",
      "A missing language declaration can make otherwise readable text sound broken or misleading.",
      "Translation and accessibility tools also depend on a trustworthy language baseline."
    ],
    reviewChecklist: [
      "Set the lang attribute on the html element, not just on body.",
      "Use the actual primary language of the page, such as en or en-US.",
      "If only a subsection changes language, keep the page-level lang and mark the changed subsection separately."
    ]
  },
  "Missing Level 1 Heading": {
    overview: "This finding appears when the page has headings but no clear top-level page heading.",
    whyItMatters: [
      "Users often rely on the first heading to confirm that they reached the correct page or step.",
      "A missing h1 weakens the document outline and makes major sections harder to interpret.",
      "A strong page heading helps both navigation and content scanning."
    ],
    reviewChecklist: [
      "Add one clear page heading near the top of the main content.",
      "Use the page topic, record name, or task name as the heading text.",
      "Demote supporting headings to h2 and below instead of using multiple h1 elements."
    ]
  },
  "Heading Level Skip": {
    overview: "This finding appears when the heading order jumps past a level, such as H1 straight to H3 or H2 straight to H4.",
    whyItMatters: [
      "Many users navigate by heading level and expect the structure to step down one level at a time.",
      "When a level is skipped, users can lose the relationship between sections and subsections.",
      "A logical heading outline makes large pages faster to scan, understand, and trust."
    ],
    reviewChecklist: [
      "Check the heading immediately before the flagged one and compare their levels.",
      "If the flagged heading belongs directly under the previous section, demote it to the next level only, such as h3 to h2.",
      "If an intermediate heading is truly missing, add that missing section heading instead of leaving the jump in place.",
      "Apply the same one-level-at-a-time rule to role=heading aria-level patterns as well as native h1-h6 elements."
    ]
  },
  "Missing Alt Text": {
    overview: "This finding appears when an image conveys information but does not provide alternative text.",
    whyItMatters: [
      "Blind and low-vision users may never get the meaning of the image.",
      "Images that act like status, instruction, evidence, or navigation need a text alternative to stay usable.",
      "When the image is meaningful, silence is not neutral; it is lost content."
    ],
    reviewChecklist: [
      "Decide whether the image is meaningful or decorative.",
      "If it is meaningful, describe the content or purpose in alt text.",
      "If it is decorative, use empty alt text instead of leaving alt off entirely."
    ]
  },
  "Accessible Name Does Not Include Visible Label": {
    overview: "This finding appears when the words users see on a control do not match the words assistive technology announces.",
    whyItMatters: [
      "People often talk about controls using the visible text they can see on the screen.",
      "If the screen reader name leaves those visible words out, voice control and screen reader users can have trouble finding or activating the same control.",
      "Keeping the visible words inside the accessible name reduces confusion for mixed-input teams and users."
    ],
    reviewChecklist: [
      "Compare the visible label, button text, or link text to the accessible name.",
      "Keep the visible words intact inside aria-label or aria-labelledby output.",
      "Only add extra context after the visible words, not instead of them."
    ]
  },
  "Link Missing Text": {
    overview: "This finding appears when a link has no reliable accessible name from visible text or labeling.",
    whyItMatters: [
      "Users can discover the link but still have no idea where it goes or what it does.",
      "Unnamed links create major confusion in link lists, screen reader navigation, and voice control.",
      "A link without a name is effectively missing its destination description."
    ],
    reviewChecklist: [
      "Prefer visible link text that describes the destination or action.",
      "If the link is icon-only, make sure the accessible name is still meaningful.",
      "Avoid relying on surrounding paragraph text to carry all the meaning."
    ]
  },
  "Vague Link Text": {
    overview: "This finding appears when link text is too generic to explain the destination by itself.",
    whyItMatters: [
      "Users often hear or scan links out of context.",
      "Repeated generic text like 'read more' or 'click here' forces users to guess which link is which.",
      "Descriptive link names make the page faster to navigate and easier to trust."
    ],
    reviewChecklist: [
      "Replace generic phrases with the actual destination or action.",
      "If short visible text must stay, add context to the accessible name.",
      "Check repeated links together so they are still distinguishable from one another."
    ]
  },
  "Ambiguous Link Text": {
    overview: "This finding appears when a link name does not make enough sense on its own, even if it is not purely generic.",
    whyItMatters: [
      "Users often navigate by hearing only the link text, without the surrounding paragraph.",
      "A label that depends too heavily on nearby context can leave users guessing what the link really means.",
      "Ambiguous names slow down navigation and make the page feel less trustworthy."
    ],
    reviewChecklist: [
      "Read the link text by itself and ask whether the destination is still understandable.",
      "Add the missing topic, record name, or action directly into the link name.",
      "If surrounding context must stay visible, keep the visible label short but strengthen the accessible name."
    ]
  },
  "Duplicate Link Text, Different Destination": {
    overview: "This finding appears when two or more links use the same name but lead to different destinations.",
    whyItMatters: [
      "Users may hear identical links in a list and have no reliable way to choose the correct one.",
      "Duplicate names create unnecessary guesswork for screen reader, voice control, and keyboard users.",
      "When link text repeats, users expect the destination or action to repeat too."
    ],
    reviewChecklist: [
      "Differentiate the links with the destination name, action, or item being opened.",
      "Review repeated cards, tables, and search results where duplicate labels are common.",
      "If the destinations are truly the same, consider whether the duplication is intentional or can be simplified."
    ]
  },
  "Broken Fragment Link": {
    overview: "This finding appears when a same-page link points to a fragment target that does not exist.",
    whyItMatters: [
      "Skip links, table-of-contents links, and jump links stop being trustworthy when they do nothing.",
      "Keyboard and screen reader users may depend on these shortcuts more than pointer users do.",
      "Broken in-page navigation makes large pages much harder to move through."
    ],
    reviewChecklist: [
      "Verify that the href fragment exactly matches a real element id.",
      "Check casing and spelling, not just approximate text.",
      "If the target was removed, either restore it or remove the broken jump link."
    ]
  },
  "Broken Same-Origin Link": {
    overview: "This finding appears when a link points to another page or file in the same app, but that destination could not be reached during checking.",
    whyItMatters: [
      "Users expect same-site navigation to be stable and predictable.",
      "Broken internal links can strand users in dead ends or block critical tasks entirely.",
      "Accessibility suffers when navigation reliability breaks, even if the markup itself looks fine."
    ],
    reviewChecklist: [
      "Verify the href path against the actual routed page, file, or endpoint.",
      "Check for stale paths after route renames, file moves, or deployment changes.",
      "Confirm the link works without relying on a session-specific state that most users will not have."
    ]
  },
  "Same-Origin Link Redirects": {
    overview: "This finding appears when an internal link reaches the final destination only after one or more redirects.",
    whyItMatters: [
      "Redirects can hide outdated paths and make maintenance problems easy to miss.",
      "Extra hops may slow navigation, complicate testing, or obscure where users will actually land.",
      "A redirect is not always wrong, but it is often a sign that the visible link target should be updated."
    ],
    reviewChecklist: [
      "Point the link directly to the final destination when that destination is known and stable.",
      "Check whether the redirect exists only for legacy compatibility and should not be used in current markup.",
      "If the redirect is intentional, verify that the final destination still matches the link's promise."
    ]
  },
  "Same-Origin Link Requires Authentication": {
    overview: "This finding appears when an internal link leads to content that requires sign-in or permission the current user may not have.",
    whyItMatters: [
      "Users can be sent toward content they cannot access, which breaks task flow and trust.",
      "Protected destinations may be valid for some audiences but confusing for others if the page gives no warning.",
      "Access barriers are especially disruptive when the link sounds like a normal next step."
    ],
    reviewChecklist: [
      "Decide whether the protected destination is appropriate for every user who sees the link.",
      "Warn users when sign-in, role membership, or another permission step is expected.",
      "If a public alternative exists, consider linking there instead of sending users into an access wall."
    ]
  },
  "Link Opens in New Window": {
    overview: "This finding appears when a link opens a new tab or window without making that behavior clear to users.",
    whyItMatters: [
      "Unexpected context changes can disorient users and make it harder to return to their previous place.",
      "Some users depend on predictable browser history and back-button behavior during complex tasks.",
      "If a new window is necessary, users deserve advance notice."
    ],
    reviewChecklist: [
      "Prefer opening in the same tab unless there is a strong product or workflow reason not to.",
      "If a new window is intentional, say so in the visible text or accessible name.",
      "Check icon-only new-window hints to make sure the behavior is also announced programmatically."
    ]
  },
  "Missing Skip to Main Content Link": {
    overview: "This finding appears when the page has repeated navigation or chrome but no dependable shortcut to jump straight to main content.",
    whyItMatters: [
      "Keyboard users may have to tab through the same menus and controls on every page load.",
      "A skip-to-main link is one of the fastest ways to reduce repeated navigation burden.",
      "Large headers, banners, and app shells make this shortcut more important, not less."
    ],
    reviewChecklist: [
      "Prefer a native main element with a stable id such as maincontent.",
      "Add a skip link near the start of the page that points to that main element id, such as href=#maincontent.",
      "If older markup cannot use a native main element, use role=main on the main content container and give it the same target id.",
      "Make sure the link becomes visible when focused and actually works from the keyboard.",
      "Verify that the target is a real main region or another dependable landing point."
    ]
  },
  "Missing Skip Link": {
    overview: "This finding appears when the page structure suggests keyboard users need a skip mechanism, but none is available.",
    whyItMatters: [
      "Repeated navigation without a shortcut creates unnecessary effort on every visit.",
      "Skip links help users bypass headers, menus, and other repeated interface regions quickly.",
      "They are especially valuable on app-like pages with dense top-of-page controls."
    ],
    reviewChecklist: [
      "Provide a keyboard-reachable skip link before repeated page chrome when appropriate.",
      "Point the skip link to the primary content region or another meaningful destination.",
      "Check that the link is discoverable on focus and not hidden in a way that breaks use."
    ]
  },
  "Button Missing Text": {
    overview: "This finding appears when a button has no reliable visible or programmatic label.",
    whyItMatters: [
      "Users may reach the control and still not know what action it performs.",
      "Unnamed buttons are especially confusing in toolbars, dialogs, and forms with multiple actions.",
      "Buttons need a clear action label, not just visual styling or an icon."
    ],
    reviewChecklist: [
      "Prefer visible button text whenever there is room.",
      "If the button is icon-only, add an accurate accessible name.",
      "Make sure the label describes the action, not just the control type."
    ]
  },
  "Button Role Missing Keyboard Handler": {
    overview: "This finding appears when a custom control uses button semantics but does not reliably activate with Enter and Space.",
    whyItMatters: [
      "Keyboard users expect button behavior to work with standard keys, not only pointer clicks.",
      "Missing key activation can block critical actions for users who cannot use a mouse or trackpad.",
      "Screen reader and voice users are more likely to rely on native keyboard patterns to complete actions." 
    ],
    reviewChecklist: [
      "Prefer a native button element for page actions whenever possible.",
      "If role=button is kept, support Enter and Space consistently and prevent unwanted page scroll on Space.",
      "Validate runtime listeners in DevTools, and check delegated handlers on ancestors, document, and window.",
      "Remember that static scans may still flag custom controls even when runtime behavior is correct; use a native button or a documented waiver pattern where required."
    ]
  },
  "Button Role Not Focusable": {
    overview: "This finding appears when a custom button-like control cannot be reached with normal keyboard tab navigation.",
    whyItMatters: [
      "If the control cannot receive focus, many users cannot discover or activate it at all.",
      "Focusable controls are a prerequisite for predictable keyboard interaction and assistive technology use.",
      "Focusability and key handling must both be present for a custom button pattern to be usable."
    ],
    reviewChecklist: [
      "Prefer a native button element for actions to get built-in focus and activation behavior.",
      "If role=button is kept, add tabindex=0 and test keyboard focus order in the real UI.",
      "Verify where listeners are attached at runtime, including delegated listeners on ancestors.",
      "When static scanners and runtime behavior disagree, prioritize native controls or use approved exception documentation."
    ]
  },
  "Button Role Keyboard Handler Not Statically Verifiable": {
    overview: "This finding appears when static markup does not show keyboard handlers for a custom button pattern, but runtime delegation or component internals may still provide support.",
    whyItMatters: [
      "Static checks cannot always see delegated or framework-managed keyboard handlers.",
      "Users still need predictable Enter and Space activation for button behavior.",
      "A runtime verification step prevents both false confidence and false alarms."
    ],
    reviewChecklist: [
      "Inspect runtime listeners in DevTools with getEventListeners on the control and its ancestors.",
      "Verify both Enter and Space activate the same action without side effects.",
      "Confirm keyboard focus can reach the control before activation tests.",
      "Prefer a native button when possible to satisfy both runtime behavior and static rule expectations."
    ]
  },
  "Duplicate SR-Only Button Label": {
    overview: "This finding appears when a non-icon sml-reactive-button renders the same label twice: once as visible button text and again as screen-reader-only text.",
    whyItMatters: [
      "This is a real component defect, not just a style choice, because the button is rendering duplicate label sources for one control.",
      "Non-icon buttons should expose one label source so the DOM stays simpler and less fragile during rendering and hydration.",
      "If the source already renders only one label source but the browser DOM still shows both, the client may be running stale JavaScript or stale hydrated markup."
    ],
    reviewChecklist: [
      "Confirm the button is a non-icon sml-reactive-button, not an icon-only button that still needs a programmatic name.",
      "Remove the duplicate screen-reader-only label or the duplicate visible label so only one source remains for the non-icon button text.",
      "If the component source already does that, refresh or rebuild the client bundle before concluding the component is still broken."
    ]
  },
  "Form Should Be Labeled": {
    overview: "This finding appears when a form region has no dependable accessible name describing what the form is for.",
    whyItMatters: [
      "Users may understand the individual fields but still not know the purpose of the form as a whole.",
      "Named forms are easier to find in assistive technology region lists and complex application screens.",
      "A form label helps distinguish one form from another when a page has more than one input workflow."
    ],
    reviewChecklist: [
      "Give the form an accessible name with aria-label or aria-labelledby when the purpose is not already obvious.",
      "Use the actual task name, such as employee search, password reset, or benefits enrollment.",
      "Avoid generic names like 'form' or 'submit form'."
    ]
  },
  "Grouped Choices Missing Fieldset": {
    overview: "This finding appears when related radio buttons or checkboxes answer one question but are not grouped as one labeled set.",
    whyItMatters: [
      "Users may hear the available answers without hearing the question that gives those answers meaning.",
      "A missing group label makes repeated yes/no or multi-option controls hard to interpret.",
      "Fieldset and legend keep the group question attached to every option."
    ],
    reviewChecklist: [
      "Wrap the full choice set in a fieldset when the options belong to one question.",
      "Put the question text in a legend, not only in a nearby paragraph.",
      "Check that the same group name is not being reused for unrelated option sets."
    ]
  },
  "Input Missing Label": {
    overview: "This finding appears when a form field has no dependable programmatic label.",
    whyItMatters: [
      "Users may reach the field without hearing what information is expected.",
      "Placeholder text is not a reliable label replacement and often disappears while typing.",
      "Well-labeled fields are essential for forms, filters, and search interfaces."
    ],
    reviewChecklist: [
      "Prefer a real label element tied to the control.",
      "If the visible label is elsewhere, tie it in with aria-labelledby.",
      "Do not rely on placeholder, title, or nearby layout alone to do label work."
    ]
  },
  "Required Field Not Indicated": {
    overview: "This finding appears when a required field is not clearly marked for both visual and assistive technology users.",
    whyItMatters: [
      "Users can submit the form without realizing a field was mandatory until they hit an error.",
      "A field can be technically required in code while still failing to communicate that requirement in the UI.",
      "Good required-state signaling reduces preventable validation failures."
    ],
    reviewChecklist: [
      "Show the required state visually, such as with an asterisk or explicit text.",
      "Make sure the programmatic state is also exposed with required or aria-required when appropriate.",
      "Keep the required cue close to the field label, not buried in a page-wide note."
    ]
  },
  "Invalid Input Not Described": {
    overview: "This finding appears when a field is marked invalid but the error text is not programmatically tied to the field.",
    whyItMatters: [
      "A screen reader may announce that the field is invalid without ever telling the user what went wrong.",
      "Users can get stuck retrying the same field because the validation message is visible but not announced.",
      "Tying the field to its error text keeps the spoken and visible experience aligned."
    ],
    reviewChecklist: [
      "Look for aria-describedby or aria-errormessage on the invalid field.",
      "Make sure the referenced error element really exists once on the page.",
      "If the message updates dynamically, confirm the new text is still tied to the same field."
    ]
  },
  "Search Input Role Missing": {
    overview: "This finding appears when a search field is not exposed as search-related markup, even though the control is clearly acting like a search box.",
    whyItMatters: [
      "Search is a common landmarked task, and users benefit when it is announced as such.",
      "Treating a search control like a generic text field hides useful intent from assistive technology.",
      "Named search patterns are easier to discover in complex headers, toolbars, and dashboards."
    ],
    reviewChecklist: [
      "Use a search input pattern or a labeled search form when the control is genuinely for search.",
      "Give the field or form a meaningful search label, not just the word 'search'.",
      "Do not force search semantics onto fields that are really filters, lookups, or freeform text entry."
    ]
  },
  "Missing Error Message Element": {
    overview: "This finding appears when a field references error or help text that is supposed to exist, but the actual message element is missing.",
    whyItMatters: [
      "The field may point to a helper or error id that no longer exists in the DOM.",
      "Users can hear that more context should exist while never receiving the missing text itself.",
      "Broken description references often show up after markup refactors, partial rendering, or conditional validation states."
    ],
    reviewChecklist: [
      "Verify that the referenced error or help element actually exists on the page.",
      "Check that the id matches exactly, including casing and suffix conventions.",
      "If the message is conditional, make sure it is rendered whenever the field points to it."
    ]
  },
  "Empty ARIA Label": {
    overview: "This finding appears when aria-label is present but empty, leaving the element with a broken or misleading naming strategy.",
    whyItMatters: [
      "An empty aria-label can override otherwise useful text and leave the control unnamed.",
      "It often indicates a templating bug, a missing translation value, or a bad fallback chain.",
      "A blank label is worse than no label when it suppresses better native naming behavior."
    ],
    reviewChecklist: [
      "If the control already has good visible text, remove the empty aria-label entirely.",
      "If aria-label is the intended naming path, supply the actual label text.",
      "Check whether a localization token, template value, or dynamic property is resolving to empty text."
    ]
  },
  "Disabled State Not Announced": {
    overview: "This finding appears when a control looks disabled but does not expose that disabled state clearly to assistive technology.",
    whyItMatters: [
      "Users may try to interact with a control that seems unavailable without being told why.",
      "Custom controls often style themselves as disabled but forget to expose the same state programmatically.",
      "State mismatches create confusion between what sighted users see and what assistive technology announces."
    ],
    reviewChecklist: [
      "If the control is truly disabled, expose that state with the appropriate native or ARIA mechanism.",
      "Check custom button-like patterns separately from native controls.",
      "Avoid styling a control as disabled when it is still fully interactive."
    ]
  },
  "Missing Focus Indicator": {
    overview: "This finding appears when a focusable element does not show a clear visible focus state for keyboard users.",
    whyItMatters: [
      "Keyboard users can lose track of where they are on the page.",
      "A weak or missing focus style can make a page feel broken even when tabbing technically still works.",
      "Focusable controls need a visible location cue that survives real-world themes and states."
    ],
    reviewChecklist: [
      "Tab through the page and look for a clearly visible focus ring or highlight.",
      "Check links, buttons, inputs, custom widgets, and disabled-looking controls separately.",
      "Make sure hover styles are not being mistaken for focus styles."
    ]
  },
  "Low Color Contrast": {
    overview: "This finding appears when foreground and background colors are too similar for reliable reading or control recognition.",
    whyItMatters: [
      "Low-vision users may not be able to read the text or recognize the control state.",
      "Color contrast failures are especially punishing on buttons, helper text, placeholder text, and muted secondary content.",
      "A design can look polished and still fail basic readability if the contrast is too weak."
    ],
    reviewChecklist: [
      "Check both text and its effective background, not just the nearest CSS rule.",
      "Review hover, focus, disabled, and selected states separately.",
      "If brand colors are weak, darken the text, lighten the background, or both."
    ]
  },
  "Missing Navigation Landmark": {
    overview: "This finding appears when the page has navigation content but does not expose a clear navigation landmark.",
    whyItMatters: [
      "Screen reader users often jump between page regions instead of linearly exploring the full page.",
      "Without a navigation landmark, repeated menus and site navigation are harder to find or skip.",
      "Clear regions reduce noise and help users get to the right part of the page faster."
    ],
    reviewChecklist: [
      "Wrap repeated navigation in a native nav element or a navigation landmark role.",
      "Give the landmark a useful label when there is more than one navigation region.",
      "Do not use generic div containers when the content is clearly navigation."
    ]
  },
  "Missing Main Landmark": {
    overview: "This finding appears when the page does not expose a clear main content region.",
    whyItMatters: [
      "Users need a fast way to bypass repeated page chrome and reach the primary content.",
      "The main landmark works with skip links, rotor views, and region navigation.",
      "A missing main region weakens orientation on content-heavy or application-like pages."
    ],
    reviewChecklist: [
      "Mark the primary content area with a native main element when possible.",
      "Keep only one main region per page view unless a special case truly requires otherwise.",
      "Make sure the main region reflects the actual page content, not only a wrapper shell."
    ]
  },
  "Iframe Missing Title": {
    overview: "This finding appears when an embedded frame has no accessible title describing what users are about to enter.",
    whyItMatters: [
      "Users may enter the frame without knowing its purpose, source, or task.",
      "Frames often create a major context switch, so naming them matters more than many authors expect.",
      "A missing frame title leaves users guessing whether the content is important, decorative, or interactive."
    ],
    reviewChecklist: [
      "Name the actual content or task inside the frame.",
      "Avoid generic titles like 'frame', 'content', or 'widget'.",
      "If the frame is interactive, mention the interaction goal, not just the container type."
    ]
  },
  "Table Missing Caption": {
    overview: "This finding appears when a data table does not include a caption explaining what the table is about.",
    whyItMatters: [
      "Users often need the table topic before they can make sense of the rows and columns.",
      "A caption gives screen reader and visual users the same quick summary of the table's purpose.",
      "Without a caption, large or complex tables can feel like unlabeled data blocks."
    ],
    reviewChecklist: [
      "Write a caption that explains the table topic, not just the word 'table'.",
      "Keep the caption close to the table so users encounter it before the cells.",
      "Use the caption for the overall table purpose, not for per-cell instructions."
    ]
  },
  "Table Missing thead": {
    overview: "This finding appears when a data table lacks a clear header section grouping the column headers.",
    whyItMatters: [
      "A header section makes the table structure more explicit for browsers, tools, and developers reviewing the markup.",
      "When headers are scattered into body rows, table relationships are easier to misunderstand or break later.",
      "A clear thead is especially useful when tables are restyled, exported, or made responsive."
    ],
    reviewChecklist: [
      "Move the real header row into a thead when the table is presenting tabular data.",
      "Keep body rows in tbody so header and data roles stay distinct.",
      "If the top row is not truly a header, reconsider whether the table is actually a data table."
    ]
  },
  "Table Missing tbody": {
    overview: "This finding appears when table body rows are not grouped into a tbody section.",
    whyItMatters: [
      "A tbody keeps data rows separate from header rows and makes the table structure easier to interpret and maintain.",
      "Clear row grouping helps when tables are restyled, manipulated by scripts, or reviewed by assistive tooling.",
      "Missing tbody is usually a structural weakness rather than an immediate blocker, but it often points to fragile markup."
    ],
    reviewChecklist: [
      "Wrap the data rows in tbody once the table has a real header section.",
      "Keep header rows in thead instead of mixing them with data rows.",
      "If different row groups serve different purposes, consider multiple tbody sections where that helps clarity."
    ]
  },
  "Table Header Missing Scope": {
    overview: "This finding appears when a table header cell does not say whether it applies to a row or a column.",
    whyItMatters: [
      "Users need the correct row or column context announced with each data cell.",
      "Missing scope becomes more confusing as tables grow wider, taller, or more irregular.",
      "Explicit scope makes simple data tables much more robust for assistive technology."
    ],
    reviewChecklist: [
      "Use scope='col' for column headers and scope='row' for row headers in simple tables.",
      "Do not rely on styling alone to imply which direction a header applies.",
      "If the table is more complex than simple row and column headers, move to explicit header associations."
    ]
  },
  "Table Missing Header Cells": {
    overview: "This finding appears when a table has data cells but no clear header cells to explain what the data means.",
    whyItMatters: [
      "Users can hear or see cell values without knowing what row or column meaning they belong to.",
      "Assistive technology relies on header relationships to announce table context correctly.",
      "A table without headers often behaves like a grid of unexplained values."
    ],
    reviewChecklist: [
      "Identify which cells are acting as column or row headers.",
      "Use th for actual headers instead of styling td cells to look like headers.",
      "If the structure is only visual layout, do not use a data table at all."
    ]
  },
  "Complex Table Missing Header Associations": {
    overview: "This finding appears when a complex table uses grouped or spanning headers but does not explicitly tie data cells to the right headers.",
    whyItMatters: [
      "In complex tables, simple reading order is not enough to tell users which headers belong to a data cell.",
      "Grouped headers, rowspan, and colspan can produce the wrong spoken context unless associations are explicit.",
      "A table can look correct visually while still announcing the wrong structure to assistive technology."
    ],
    reviewChecklist: [
      "Look for spanning headers, grouped headers, or more than one header row.",
      "Use headers/id relationships or group-level scope values when simple scope is no longer enough.",
      "Test whether each data cell can be traced back to the right full header context."
    ]
  },
  "Possible Layout Table": {
    overview: "This finding appears when a table looks like it is being used for visual layout instead of real tabular data.",
    whyItMatters: [
      "Assistive technology may still announce the structure as a data table even when no true data relationships exist.",
      "Layout tables add noise and can make simple page structure sound much more complicated than it is.",
      "Modern layout tools usually express design intent more clearly than a table used only for positioning."
    ],
    reviewChecklist: [
      "Ask whether the content really has row-and-column meaning or is only being positioned visually.",
      "If it is layout-only, replace the table with CSS layout using div, section, article, or other semantic containers.",
      "If it is actually data, add the missing caption, headers, and grouping instead of treating it like layout."
    ]
  },
  "Non-Semantic Button": {
    overview: "This finding appears when something behaves like a button but is not built as a real button or equally accessible pattern.",
    whyItMatters: [
      "Custom click targets often miss keyboard behavior, focus management, naming, or state exposure.",
      "Users should not have to guess whether an element is actionable or how to activate it.",
      "Native button behavior solves many accessibility problems before custom code even starts."
    ],
    reviewChecklist: [
      "If the control performs an action on the current page, prefer a real button element.",
      "If it actually navigates, use a real link instead of faking a button.",
      "Only keep a custom pattern when you can prove it matches native behavior for keyboard and assistive technology users."
    ]
  }
};

export function getIssueGuideDetails(title) {
  const normalizedTitle = String(title || "").trim();
  return ISSUE_GUIDE_DETAILS_BY_TITLE[normalizedTitle] || null;
}