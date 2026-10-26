import { describe, expect, it } from "vitest";
import {
    areDateTimesEqual,
    compareDates,
    getWeek,
    getWeekOffset,
    toWeekDateTime,
    weekIter,
    type CalendarDate,
    type CalendarDateTime,
} from "./date";

const date = (year: number, month: number, day: number): CalendarDate => ({ year, month, day });

describe("compareDates", () => {
    it("orders by year, then month, then day", () => {
        expect(compareDates(date(2025, 3, 10), date(2025, 3, 10))).toBe(0);
        expect(compareDates(date(2024, 12, 31), date(2025, 1, 1))).toBeLessThan(0);
        expect(compareDates(date(2025, 2, 28), date(2025, 3, 1))).toBeLessThan(0);
        expect(compareDates(date(2025, 3, 2), date(2025, 3, 1))).toBeGreaterThan(0);
    });
});

describe("areDateTimesEqual", () => {
    const base: CalendarDateTime = { year: 2025, month: 3, day: 10, startHour: 10, endHour: 12 };

    it("compares date and time", () => {
        expect(areDateTimesEqual(base, { ...base })).toBe(true);
        expect(areDateTimesEqual(base, { ...base, day: 11 })).toBe(false);
        expect(areDateTimesEqual(base, { ...base, startHour: 9 })).toBe(false);
        expect(areDateTimesEqual(base, { ...base, endHour: 13 })).toBe(false);
    });
});

describe("getWeek (ISO 8601)", () => {
    it.each([
        [2025, 1, 1, 1],
        [2025, 3, 10, 11],
        [2025, 12, 28, 52],
        [2025, 12, 29, 1], // Monday belongs to ISO week 1 of 2026
        [2024, 12, 30, 1], // Monday belongs to ISO week 1 of 2025
        [2024, 2, 29, 9],
        [2023, 1, 1, 52], // Sunday belongs to ISO week 52 of 2022
    ])("%i-%i-%i is week %i", (year, month, day, week) => {
        expect(getWeek(date(year, month, day))).toBe(week);
    });
});

describe("getWeekOffset", () => {
    it("uses 1 for Monday and 7 for Sunday", () => {
        expect(getWeekOffset(date(2025, 3, 3))).toBe(1); // Monday
        expect(getWeekOffset(date(2025, 3, 7))).toBe(5); // Friday
        expect(getWeekOffset(date(2025, 3, 9))).toBe(7); // Sunday
    });
});

describe("toWeekDateTime", () => {
    it("keeps hours and maps the date to week and weekday", () => {
        expect(toWeekDateTime({ year: 2025, month: 3, day: 10, startHour: 10.5, endHour: 12 })).toEqual({
            week: 11,
            year: 2025,
            weekDay: 1,
            startHour: 10.5,
            endHour: 12,
        });
    });
});

describe("weekIter", () => {
    const isoWeeks = (start: CalendarDate, end: CalendarDate) => [...weekIter(start, end)];

    it("yields every week in the range, inclusive", () => {
        expect(isoWeeks(date(2025, 3, 3), date(2025, 3, 12))).toEqual([10, 11]);
        expect(isoWeeks(date(2025, 3, 3), date(2025, 3, 3))).toEqual([10]);
    });

    it("yields exactly one week when start and end are in the same week", () => {
        expect(isoWeeks(date(2025, 3, 3), date(2025, 3, 9))).toEqual([10]);
    });

    it("crosses the year boundary", () => {
        expect(isoWeeks(date(2024, 12, 16), date(2025, 1, 13))).toEqual([51, 52, 1, 2, 3]);
    });

    it("starts at the start week even when the start date is mid-week", () => {
        expect(isoWeeks(date(2025, 3, 5), date(2025, 3, 17))).toEqual([10, 11, 12]);
    });
});
