//! Server-side SVG charts rendered with `maud` (no JavaScript). Each element gets a `<title>`
//! child so browsers show native hover tooltips. SVG children always use `{}` bodies because
//! maud's `tag;` form emits an unclosed tag, which breaks inline SVG parsing.

use maud::{Markup, html};

pub struct Series {
    pub name: String,
    pub color: String,
    pub values: Vec<i64>,
}

/// Rounds up to 1/2/5 × 10^k so gridlines land on readable numbers.
fn nice_max(v: i64) -> i64 {
    if v <= 0 {
        return 1;
    }
    let mut mag = 1i64;
    while mag * 10 <= v {
        mag *= 10;
    }
    for m in [1, 2, 5, 10] {
        if m * mag >= v {
            return m * mag;
        }
    }
    10 * mag
}

pub fn fmt_num(n: i64) -> String {
    let s = n.abs().to_string();
    let mut out = String::new();
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i).is_multiple_of(3) {
            out.push(',');
        }
        out.push(c);
    }
    if n < 0 { format!("-{out}") } else { out }
}

pub fn legend(series: &[Series]) -> Markup {
    html! {
        div.legend {
            @for s in series {
                span.legend-item { span.swatch style=(format!("background:{}", s.color)) {} (s.name) }
            }
        }
    }
}

/// Horizontal bars: `(label, value, color)`.
/// Rows are `(label, value, color, optional link for the value)`.
pub fn hbars(rows: &[(String, i64, String, Option<String>)]) -> Markup {
    if rows.is_empty() {
        return html! { p.muted { "No data." } };
    }
    let (w, label_w, row_h, value_w) = (560.0, 150.0, 26.0, 70.0);
    let h = rows.len() as f64 * row_h + 4.0;
    let max = rows.iter().map(|r| r.1).max().unwrap_or(1).max(1) as f64;
    let bar_w = w - label_w - value_w;
    html! {
        svg.chart viewBox=(format!("0 0 {w} {h}")) role="img" {
            @for (i, (label, v, color, href)) in rows.iter().enumerate() {
                @let y = i as f64 * row_h + 2.0;
                @let bw = (*v as f64 / max * bar_w).max(1.0);
                text x=(label_w - 8.0) y=(y + row_h / 2.0 + 4.0) text-anchor="end" class="axis" { (label) }
                rect x=(label_w) y=(y + 3.0) width=(bw) height=(row_h - 8.0) rx="3" fill=(color) {
                    title { (label) ": " (fmt_num(*v)) }
                }
                @if let Some(href) = href {
                    a href=(href) {
                        text x=(label_w + bw + 6.0) y=(y + row_h / 2.0 + 4.0) class="value linked" { (fmt_num(*v)) }
                    }
                } @else {
                    text x=(label_w + bw + 6.0) y=(y + row_h / 2.0 + 4.0) class="value" { (fmt_num(*v)) }
                }
            }
        }
    }
}

struct Frame {
    w: f64,
    h: f64,
    left: f64,
    right: f64,
    top: f64,
    bottom: f64,
}

impl Frame {
    fn standard() -> Self {
        Self {
            w: 900.0,
            h: 260.0,
            left: 52.0,
            right: 10.0,
            top: 10.0,
            bottom: 34.0,
        }
    }
    fn plot_w(&self) -> f64 {
        self.w - self.left - self.right
    }
    fn plot_h(&self) -> f64 {
        self.h - self.top - self.bottom
    }
    fn y(&self, v: f64, max: f64) -> f64 {
        self.top + self.plot_h() - v / max * self.plot_h()
    }
}

fn axes(f: &Frame, max: i64, labels: &[String]) -> Markup {
    let step_x = f.plot_w() / labels.len().max(1) as f64;
    // Show at most ~16 x labels to avoid overlap.
    let every = labels.len().div_ceil(16).max(1);
    html! {
        @for i in 0..=4 {
            @let v = max * i / 4;
            @let y = f.y(v as f64, max as f64);
            line x1=(f.left) x2=(f.w - f.right) y1=(y) y2=(y) class="grid" {}
            text x=(f.left - 6.0) y=(y + 4.0) text-anchor="end" class="axis" { (fmt_num(v)) }
        }
        @for (i, l) in labels.iter().enumerate() {
            @if i % every == 0 {
                text x=(f.left + step_x * (i as f64 + 0.5)) y=(f.h - f.bottom + 18.0) text-anchor="middle" class="axis" { (l) }
            }
        }
    }
}

struct Segment<'a> {
    x: f64,
    y: f64,
    h: f64,
    color: &'a str,
    tip: String,
}

/// Stacked columns: one column per label, one stacked segment per series.
pub fn stacked_columns(labels: &[String], series: &[Series]) -> Markup {
    let f = Frame::standard();
    let totals: Vec<i64> = (0..labels.len())
        .map(|i| series.iter().map(|s| s.values[i]).sum())
        .collect();
    if totals.iter().all(|t| *t == 0) {
        return html! { p.muted { "No entries in this range." } };
    }
    let max = nice_max(*totals.iter().max().unwrap_or(&1));
    let step = f.plot_w() / labels.len().max(1) as f64;
    let bw = (step * 0.72).max(1.0);
    let mut segments = Vec::new();
    for (i, label) in labels.iter().enumerate() {
        let x = f.left + step * i as f64 + (step - bw) / 2.0;
        let mut acc = 0i64;
        for s in series {
            let v = s.values[i];
            if v == 0 {
                continue;
            }
            let top = f.y((acc + v) as f64, max as f64);
            let bot = f.y(acc as f64, max as f64);
            segments.push(Segment {
                x,
                y: top,
                h: (bot - top).max(0.5),
                color: &s.color,
                tip: format!(
                    "{label} — {}: {} (total {})",
                    s.name,
                    fmt_num(v),
                    fmt_num(totals[i])
                ),
            });
            acc += v;
        }
    }
    html! {
        svg.chart viewBox=(format!("0 0 {} {}", f.w, f.h)) role="img" {
            (axes(&f, max, labels))
            @for s in &segments {
                rect x=(s.x) y=(s.y) width=(bw) height=(s.h) fill=(s.color) { title { (s.tip) } }
            }
        }
        (legend(series))
    }
}

/// Multi-series line chart with point markers.
pub fn lines(labels: &[String], series: &[Series]) -> Markup {
    let f = Frame::standard();
    let peak = series
        .iter()
        .flat_map(|s| s.values.iter())
        .copied()
        .max()
        .unwrap_or(0);
    if peak == 0 {
        return html! { p.muted { "No entries in this range." } };
    }
    let max = nice_max(peak);
    let step = f.plot_w() / labels.len().max(1) as f64;
    let x = |i: usize| f.left + step * (i as f64 + 0.5);
    html! {
        svg.chart viewBox=(format!("0 0 {} {}", f.w, f.h)) role="img" {
            (axes(&f, max, labels))
            @for s in series {
                @let pts = s.values.iter().enumerate()
                    .map(|(i, v)| format!("{:.1},{:.1}", x(i), f.y(*v as f64, max as f64)))
                    .collect::<Vec<_>>().join(" ");
                polyline points=(pts) fill="none" stroke=(s.color) stroke-width="2" {}
                @for (i, v) in s.values.iter().enumerate() {
                    circle cx=(x(i)) cy=(f.y(*v as f64, max as f64)) r="3" fill=(s.color) {
                        title { (labels[i]) " — " (s.name) ": " (fmt_num(*v)) }
                    }
                }
            }
        }
        (legend(series))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nice_numbers() {
        assert_eq!(nice_max(0), 1);
        assert_eq!(nice_max(7), 10);
        assert_eq!(nice_max(130), 200);
        assert_eq!(nice_max(450), 500);
        assert_eq!(nice_max(1000), 1000);
        assert_eq!(fmt_num(1234567), "1,234,567");
    }
}
