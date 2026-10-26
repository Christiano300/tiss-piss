// No JS Date because Temporal isn't supported piss off Date
export type CalendarDateTime = {
    day: number;
    month: number;
    year: number;
    startHour: number;
    endHour: number;
}

export type WeekDateTime = {
    week: number;
    year: number;
    startHour: number;
    endHour: number;
    weekDay: number;
}

export type CalendarDate = {
    year: number;
    month: number;
    day: number;
}

export function compareDates(a: CalendarDate, b: CalendarDate): number {
    const yearCmp = a.year - b.year;
    if (yearCmp !== 0) return yearCmp;
    const monthCmp = a.month - b.month;
    if (monthCmp !== 0) return monthCmp;
    return a.day - b.day;
}

export function areDateTimesEqual(a: CalendarDateTime, b: CalendarDateTime): boolean {
    return compareDates(a, b) === 0 && a.startHour === b.startHour && a.endHour === b.endHour;
}

export function getWeek(date: CalendarDate): number {
    const d = new Date(Date.UTC(date.year, date.month - 1, date.day));
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    // Get first day of year
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    // Calculate full weeks to nearest Thursday
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function getWeekOffset(date: CalendarDate): number {
    const d = new Date(Date.UTC(date.year, date.month - 1, date.day));
    return d.getUTCDay() || 7;
}

export function toWeekDateTime(dateTime: CalendarDateTime): WeekDateTime {
    return {
        week: getWeek(dateTime),
        weekDay: getWeekOffset(dateTime),
        year: dateTime.year,
        startHour: dateTime.startHour,
        endHour: dateTime.endHour,
    };
}

export function* weekIter(start: CalendarDate, end: CalendarDate): Generator<number> {
    const startDate = new Date(Date.UTC(start.year, start.month - 1, start.day));
    const endDate = new Date(Date.UTC(end.year, end.month - 1, end.day));
    const endWeek = getWeek(end);
    while (true) {
        const weekDate: CalendarDate = {
            year: startDate.getUTCFullYear(),
            month: startDate.getUTCMonth() + 1,
            day: startDate.getUTCDate(),
        };
        const currentWeek = getWeek(weekDate);
        if (startDate < endDate || currentWeek == endWeek) {
            yield currentWeek;
        }
        if (currentWeek == endWeek) {
            break;
        }
        startDate.setUTCDate(startDate.getUTCDate() + 7);
    }
}