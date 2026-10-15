//! Inline styles and embedded artwork keep the binary self-contained.

pub const CSS: &str = r#"
:root { --bg:#f7f5f0; --card:#fff; --ink:#1f2937; --muted:#6b7280; --line:#e5e7eb; --accent:#8b5e34; }
* { box-sizing: border-box; }
body { margin:0; font:14px/1.45 -apple-system, "Segoe UI", Roboto, Ubuntu, sans-serif; background:var(--bg); color:var(--ink); isolation:isolate; }
/* Fade only the artwork; text, controls, and white reading surfaces stay opaque. */
body::before { content:""; position:fixed; inset:0; z-index:-1; background:url("/assets/bunyan.jpeg") center / cover no-repeat; opacity:0.08; pointer-events:none; }
.skip-link:focus { position:fixed; top:8px; left:8px; z-index:1100; padding:8px 12px; background:var(--card); color:var(--ink); outline:2px solid var(--accent); }
header.top { background:#3b2a1a; color:#fff; padding:10px 24px; display:flex; gap:24px; align-items:center; }
header.top .brand { font-weight:700; font-size:18px; letter-spacing:.5px; }
header.top nav { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
header.top nav .bunyan-reactive { color:#f3e3cf; background:transparent; border-color:transparent; }
header.top nav .bunyan-reactive.active { color:#fff; border-bottom:2px solid #deb887; }
header.top .bunyan-reactive:focus-visible { outline-color:#deb887; }
header.top { flex-wrap:wrap; }
.header-account { margin-left:auto; display:flex; align-items:center; }
.login-panel { max-width:480px; margin:8vh auto; }
.login-panel form { display:grid; gap:10px; }
.login-panel label { font-weight:600; }
.login-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:8px; }
main { padding:20px 24px; max-width:1400px; margin:0 auto; }
h1 { font-size:22px; margin:4px 0 12px; } h2 { font-size:16px; margin:0 0 10px; }
a { color:var(--accent); }
.toolbar { display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin-bottom:16px; }
.tabs a { padding:6px 14px; border:1px solid var(--line); background:#fff; text-decoration:none; color:var(--ink); }
.tabs a:first-child { border-radius:6px 0 0 6px; } .tabs a:last-child { border-radius:0 6px 6px 0; }
.tabs a.active { background:var(--accent); color:#fff; border-color:var(--accent); }
.tabs .bunyan-reactive { background:#fff; color:var(--ink); border-color:var(--line); }
.tabs .bunyan-reactive.active { background:var(--accent); color:#fff; border-color:var(--accent); }
.nav a { padding:6px 10px; text-decoration:none; }
form.inline { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
input, select, button { font:inherit; padding:5px 8px; border:1px solid #cbd5e1; border-radius:6px; background:#fff; }
button { background:var(--accent); color:#fff; border-color:var(--accent); cursor:pointer; }
.bunyan-reactive { display:inline-block; font:inherit; padding:5px 8px; border:1px solid var(--accent); border-radius:6px; background:var(--accent); color:#fff; cursor:pointer; }
.bunyan-reactive:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.bunyan-reactive[disabled] { cursor:not-allowed; }
.cards { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px,1fr)); gap:12px; margin-bottom:16px; }
.card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px 16px; }
.card .k { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.4px; }
.card .v { font-size:26px; font-weight:700; }
.delta.up { color:#b91c1c; } .delta.down { color:#047857; } .delta { font-size:12px; color:var(--muted); }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }
@media (max-width: 1000px) { .grid2 { grid-template-columns:1fr; } }
.panel { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px 16px; margin-bottom:16px; overflow-x:auto; }
svg.chart { width:100%; height:auto; display:block; }
svg .axis { font-size:11px; fill:var(--muted); } svg .value { font-size:11px; fill:var(--ink); }
svg .grid { stroke:var(--line); stroke-width:1; }
.legend { display:flex; flex-wrap:wrap; gap:14px; margin-top:6px; font-size:12px; color:var(--muted); }
.swatch { display:inline-block; width:10px; height:10px; border-radius:2px; margin-right:5px; vertical-align:middle; }
table { border-collapse:collapse; width:100%; }
th, td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
th { font-size:12px; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:.3px; }
th.severity-row { font-size:inherit; color:var(--ink); font-weight:400; text-transform:none; letter-spacing:normal; }
td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; }
.badge { display:inline-block; padding:1px 7px; border-radius:999px; font-size:11px; color:#fff; white-space:nowrap; }
.badge.new { background:#7c3aed; } .badge.fix { background:#047857; }
.muted { color:var(--muted); } .small { font-size:12px; }
.ai-model-notice { background:rgba(255,255,255,0.85); color:var(--ink); padding:10px 14px; border-radius:8px; }
code, pre { font-family: ui-monospace, Menlo, Consolas, monospace; font-size:12px; }
pre { background:#f8fafc; border:1px solid var(--line); border-radius:6px; padding:10px; white-space:pre-wrap; word-break:break-word; max-height:480px; overflow:auto; }
details.exception > summary { cursor:pointer; color:var(--accent); border:1px solid var(--line); border-radius:6px; padding:6px 10px; width:fit-content; margin:8px 0; }
.suggestion { white-space:pre-wrap; background:#f0fdf4; border-color:#bbf7d0; }
dl.facts { display:grid; grid-template-columns:max-content 1fr; gap:4px 16px; margin:0; }
dl.facts dt { color:var(--muted); } dl.facts dd { margin:0; }
.status-ok { color:#047857; } .status-failed { color:#b91c1c; } .status-running { color:#b45309; }
.flash { padding:10px 14px; border-radius:8px; background:#fef3c7; border:1px solid #fde68a; margin-bottom:14px; }
"#;
