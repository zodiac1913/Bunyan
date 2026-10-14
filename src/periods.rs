//! Calendar math for the Day / Week (ISO, Monday start) / Month views and their trend buckets.
//! All ranges are half-open `[start, end)` over calendar dates.

use chrono::{Datelike, Duration, NaiveDate};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Period {
    Day,
    Week,
    Month,
}

impl Period {
    pub fn parse(s: &str) -> Self {
        match s {
            "week" => Period::Week,
            "month" => Period::Month,
            _ => Period::Day,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Period::Day => "day",
            Period::Week => "week",
            Period::Month => "month",
        }
    }

    /// First date of the period containing `d`.
    pub fn start_of(self, d: NaiveDate) -> NaiveDate {
        match self {
            Period::Day => d,
            Period::Week => d - Duration::days(d.weekday().num_days_from_monday() as i64),
            Period::Month => d.with_day(1).expect("day 1 exists"),
        }
    }

    /// Start of the period after the one containing `d`.
    pub fn next_start(self, d: NaiveDate) -> NaiveDate {
        let s = self.start_of(d);
        match self {
            Period::Day => s + Duration::days(1),
            Period::Week => s + Duration::days(7),
            Period::Month => add_months(s, 1),
        }
    }

    /// Start of the period before the one containing `d`.
    pub fn prev_start(self, d: NaiveDate) -> NaiveDate {
        let s = self.start_of(d);
        match self {
            Period::Day => s - Duration::days(1),
            Period::Week => s - Duration::days(7),
            Period::Month => add_months(s, -1),
        }
    }

    pub fn range(self, d: NaiveDate) -> (NaiveDate, NaiveDate) {
        (self.start_of(d), self.next_start(d))
    }

    pub fn label(self, d: NaiveDate) -> String {
        let (s, e) = self.range(d);
        match self {
            Period::Day => s.format("%A, %B %-d, %Y").to_string(),
            Period::Week => format!(
                "Week {} — {} to {}",
                s.iso_week().week(),
                s.format("%b %-d"),
                (e - Duration::days(1)).format("%b %-d, %Y")
            ),
            Period::Month => s.format("%B %Y").to_string(),
        }
    }

    /// Short label for a trend bucket starting at `s`.
    pub fn bucket_label(self, s: NaiveDate) -> String {
        match self {
            Period::Day => s.format("%m/%d").to_string(),
            Period::Week => format!("W{} {}", s.iso_week().week(), s.format("%m/%d")),
            Period::Month => s.format("%b %y").to_string(),
        }
    }

    /// How many periods the trend chart shows, ending with the selected one.
    pub fn trend_len(self) -> usize {
        match self {
            Period::Day => 30,
            Period::Week => 12,
            Period::Month => 12,
        }
    }

    /// Bucket starts for the trend window ending with the period containing `d` (oldest first).
    pub fn trend_buckets(self, d: NaiveDate) -> Vec<NaiveDate> {
        let mut out = Vec::with_capacity(self.trend_len());
        let mut cur = self.start_of(d);
        for _ in 0..self.trend_len() {
            out.push(cur);
            cur = self.prev_start(cur);
        }
        out.reverse();
        out
    }
}

fn add_months(d: NaiveDate, months: i32) -> NaiveDate {
    let total = d.year() * 12 + d.month0() as i32 + months;
    NaiveDate::from_ymd_opt(total.div_euclid(12), total.rem_euclid(12) as u32 + 1, 1)
        .expect("valid month")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    #[test]
    fn week_starts_monday() {
        assert_eq!(
            Period::Week.range(d("2026-10-14")),
            (d("2026-10-12"), d("2026-10-19"))
        );
        assert_eq!(
            Period::Week.range(d("2026-10-18")),
            (d("2026-10-12"), d("2026-10-19"))
        );
    }

    #[test]
    fn month_wraps_years() {
        assert_eq!(
            Period::Month.range(d("2026-12-31")),
            (d("2026-12-01"), d("2027-01-01"))
        );
        assert_eq!(Period::Month.prev_start(d("2026-01-15")), d("2025-12-01"));
    }

    #[test]
    fn trend_ends_with_current_period() {
        let b = Period::Month.trend_buckets(d("2026-10-14"));
        assert_eq!(b.len(), 12);
        assert_eq!(*b.last().unwrap(), d("2026-10-01"));
        assert_eq!(b[0], d("2025-11-01"));
    }
}
