/**
 * For this purpose, we will use the following definitions:
 * - A "group" is a set of dates and times that a student can enroll in.
 * - A "sector" is a range of weeks where all groups have the same date and time within a week.
 * - A "cluster" is a combination of groups that have completely overlapping times within a sector.
 * - A "clustering" is a set of clusters that contain all groups within a sector.
 * - A "clustering sector" is a range of sectors where all clusterings are the same.
 */

import {
    type CalendarDate,
    type CalendarDateTime,
    type WeekDateTime,
    compareDates,
    getWeek,
    toWeekDateTime,
    weekIter,
} from "./date";
import { renderGroups } from "./groupRender";

export enum GroupEnrolStatus {
    ENROLLED,
    POSSIBLE,
    NOT_POSSIBLE,
    OVER,
    UNKNOWN
}

export type Group = {
    name: string;
    status: GroupEnrolStatus;
    dates: CalendarDateTime[];
    weekDates: WeekDateTime[];
    index: number;
}

export type GroupTimeEntry = { groupIdx: number; startHour: number; endHour: number; day: number };

export type Sector = {
    startWeek: number;
    endWeek: number;
    length: number;
    idx: number;
    entries: GroupTimeEntry[];
}

export type WeekClustering = { startWeek: number; endWeek: number, clusters: number[][], length: number };

export type ClusteringSector = { startIdx: number; endIdx: number; clusters: number[][]; length: number };

export function enrolmentStatusName(status: GroupEnrolStatus, locale: string): string {
    if (locale.startsWith("de")) {
        switch (status) {
            case GroupEnrolStatus.ENROLLED: return "angemeldet";
            case GroupEnrolStatus.POSSIBLE: return "Anmeldung möglich";
            case GroupEnrolStatus.NOT_POSSIBLE: return "Anmeldung nicht möglich";
            case GroupEnrolStatus.OVER: return "Anmeldung vorbei";
            case GroupEnrolStatus.UNKNOWN: return "Unbekannt";
        }
    } else {
        switch (status) {
            case GroupEnrolStatus.ENROLLED: return "registered";
            case GroupEnrolStatus.POSSIBLE: return "application possible";
            case GroupEnrolStatus.NOT_POSSIBLE: return "application not possible";
            case GroupEnrolStatus.OVER: return "application over";
            case GroupEnrolStatus.UNKNOWN: return "unknown";
        }
    }
}

export function parseGroupList(): Group[] {
    const groupElements = document.querySelectorAll(".groupWrapper");
    return Array.from(groupElements).map((groupEl, index) => {
        // parse group name, remove "Gruppe " with optional space after"
        const name = groupEl.querySelector(".titleCol span.bold")?.textContent?.trim()?.replaceAll(/Gruppe( )?/g, "");
        if (name === undefined) {
            console.warn("[tiss-piss] no group name found at", groupEl);
        }
        const enrolStatus = groupEl.querySelector(".header_element:nth-child(2) span.bold")?.textContent?.trim()?.toLowerCase();
        if (enrolStatus === undefined) {
            console.warn("[tiss-piss] no enrol status found at", groupEl);
        }
        const status = parseEnrolmentStatus(enrolStatus);
        if (status === GroupEnrolStatus.UNKNOWN) {
            console.warn("[tiss-piss] unknown enrol status", enrolStatus, "at", groupEl);
        }
        const tableBody = groupEl.querySelector(".listTable table tbody");
        if (!tableBody) {
            console.warn("[tiss-piss] no table found at", groupEl);
            return null;
        };
        const dates: CalendarDateTime[] = [];

        for (const row of tableBody.querySelectorAll("tr")) {
            const cells = row.querySelectorAll("td");
            if (cells.length < 3) {
                console.warn("[tiss-piss] not enough cells in row", row);
                continue;
            }
            const dateText = cells[0]?.textContent?.trim();
            const startTimeText = cells[1]?.textContent?.trim();
            const endTimeText = cells[2]?.textContent?.trim();

            if (!dateText || !startTimeText || !endTimeText) {
                console.warn("[tiss-piss] missing date or time in row", row);
                continue;
            }

            const dateMatch = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(dateText);
            const startTimeMatch = /(\d{1,2}):(\d{2})/.exec(startTimeText);
            const endTimeMatch = /(\d{1,2}):(\d{2})/.exec(endTimeText);

            if (!dateMatch || !startTimeMatch || !endTimeMatch) {
                console.warn("[tiss-piss] invalid date or time format in row", row);
                continue;
            }

            const [_, day, month, year] = dateMatch.map(Number);
            const [__, startHour, startMinute] = startTimeMatch.map(Number);
            const [___, endHour, endMinute] = endTimeMatch.map(Number);

            dates.push({
                day: day!,
                month: month!,
                year: year!,
                startHour: startHour! + startMinute! / 60,
                endHour: endHour! + endMinute! / 60,
            });
        }

        dates.sort((a, b) => {
            return compareDates(a, b) || a.startHour - b.startHour;
        });

        return {
            name: name ?? "Unknown",
            status,
            dates,
            weekDates: dates.map(toWeekDateTime),
            index
        };
    }).filter(g => g !== null);
}

const statusMap: Record<string, GroupEnrolStatus> = {
    "anmeldung möglich": GroupEnrolStatus.POSSIBLE,
    "anmeldung nicht möglich": GroupEnrolStatus.NOT_POSSIBLE,
    "angemeldet": GroupEnrolStatus.ENROLLED,
    "anmeldung vorbei": GroupEnrolStatus.OVER,
    "application possible": GroupEnrolStatus.POSSIBLE,
    "application not possible": GroupEnrolStatus.NOT_POSSIBLE,
    "application over": GroupEnrolStatus.OVER,
    "registered": GroupEnrolStatus.ENROLLED,

    "": GroupEnrolStatus.UNKNOWN,
}

function parseEnrolmentStatus(statusText: string | undefined): GroupEnrolStatus {
    if (!statusText) return GroupEnrolStatus.UNKNOWN;
    const status = statusMap[statusText.toLowerCase()] ?? null;
    if (statusText.startsWith("anmeldung ab") || statusText.startsWith("application starts with")) {
        return GroupEnrolStatus.POSSIBLE;
    }
    return status ?? GroupEnrolStatus.UNKNOWN;
}

function getMinMaxDate(groups: Group[]): [CalendarDate, CalendarDate] | null {
    const allDates = groups.flatMap(group => group.dates);
    if (allDates.length === 0) {
        return null;
    }
    let min = allDates[0]!;
    let max = allDates[0]!;
    for (const date of allDates) {
        if (compareDates(date, min) < 0) {
            min = date;
        }
        if (compareDates(date, max) > 0) {
            max = date;
        }
    }
    return [min, max];
}

function entriesEqual(a: GroupTimeEntry[], b: GroupTimeEntry[]): boolean {
    if (a.length !== b.length) return false;
    a = structuredClone(a).sort((x, y) => x.groupIdx - y.groupIdx || x.day - y.day || x.startHour - y.startHour || x.endHour - y.endHour);
    b = structuredClone(b).sort((x, y) => x.groupIdx - y.groupIdx || x.day - y.day || x.startHour - y.startHour || x.endHour - y.endHour);
    for (let i = 0; i < a.length; i++) {
        const entryA = a[i]!;
        const entryB = b[i]!;
        if (entryA.groupIdx !== entryB.groupIdx || entryA.startHour !== entryB.startHour || entryA.endHour !== entryB.endHour || entryA.day !== entryB.day) {
            return false;
        }
    }
    return true;
}

function calcGroupSectors(groups: Group[], startDate: CalendarDate, endDate: CalendarDate) {
    const [startWeek, endWeek] = [getWeek(startDate), getWeek(endDate)];
    const weekCollections: Record<number, GroupTimeEntry[]> = {};
    for (const week of weekIter(startDate, endDate)) {
        weekCollections[week] = [];
    }

    for (const group of groups) {
        for (const weekDate of group.weekDates) {
            const dates = weekCollections[weekDate.week];
            if (!dates) {
                console.warn("[tiss-piss] weekDate out of range", weekDate, startWeek, endWeek, group);
                continue;
            }
            dates.push({ startHour: weekDate.startHour, endHour: weekDate.endHour, day: weekDate.weekDay, groupIdx: group.index });
        }
    }

    const weeks = Array.from(weekIter(startDate, endDate));
    for (const i of weeks) {
        const dates = weekCollections[i]!;
        dates.sort((a, b) => {
            return a.groupIdx - b.groupIdx || a.day - b.day || a.startHour - b.startHour || a.endHour - b.endHour;
        });
    }

    const sectors: Sector[] = [];
    let runStartWeek = startWeek;

    for (let i = 0; i < weeks.length - 1; i++) {
        const week = weeks[i]!;
        const nextWeek = weeks[i + 1]!;
        const entries = weekCollections[week]!;
        const nextEntries = weekCollections[nextWeek]!;
        if (entriesEqual(entries, nextEntries)) {
            continue;
        }
        sectors.push({ startWeek: runStartWeek, endWeek: week, entries, length: i - weeks.indexOf(runStartWeek) + 1, idx: sectors.length });
        runStartWeek = nextWeek;
    }
    const lastWeek = weeks.at(-1);
    if (lastWeek !== undefined) {
        sectors.push({ startWeek: runStartWeek, endWeek: lastWeek, entries: weekCollections[lastWeek]!, length: weeks.length - weeks.indexOf(runStartWeek), idx: sectors.length });
    }
    return sectors;
}

function perSectorClustering(sector: Sector): WeekClustering {
    const clusters: number[][] = [];
    const clusterHours: Record<number, { day: number, startHour: number, endHour: number }[]> = {};
    const groups = Array.from(new Set(sector.entries.map(e => e.groupIdx)));
    groups.sort((a, b) => a - b);
    for (const groupIndex of groups) {
        const entries = sector.entries.filter(e => e.groupIdx === groupIndex);
        let placed = false;
        for (let i = 0; i < clusters.length; i++) {
            const cluster = clusters[i]!;
            const clusterEntries = clusterHours[i] ?? [];
            if (entries.every(e => clusterEntries.some(ce => e.day === ce.day && !(e.endHour <= ce.startHour || e.startHour >= ce.endHour)))) {
                cluster.push(groupIndex);
                clusterHours[i] = [...clusterEntries, ...entries.map(e => ({ day: e.day, startHour: e.startHour, endHour: e.endHour }))];
                placed = true;
                break;
            }
        }
        if (!placed) {
            clusters.push([groupIndex]);
            clusterHours[clusters.length - 1] = entries.map(e => ({ day: e.day, startHour: e.startHour, endHour: e.endHour }));
        }
    }
    return { clusters, startWeek: sector.startWeek, endWeek: sector.endWeek, length: sector.length };
}

function clustersEqual(a: number[][], b: number[][]): boolean {
    if (a.length !== b.length) return false;
    const sortedA = a.map(cluster => [...cluster].sort((x, y) => x - y)).sort((x, y) => x[0]! - y[0]!);
    const sortedB = b.map(cluster => [...cluster].sort((x, y) => x - y)).sort((x, y) => x[0]! - y[0]!);
    for (let i = 0; i < sortedA.length; i++) {
        const clusterA = sortedA[i]!;
        const clusterB = sortedB[i]!;
        if (clusterA.length !== clusterB.length) return false;
        for (let j = 0; j < clusterA.length; j++) {
            if (clusterA[j] !== clusterB[j]) return false;
        }
    }
    return true;
}

function calcClusterSectors(clusters: WeekClustering[]): ClusteringSector[] {
    const clusterSecors = [];
    let runStartIdx = 0;
    for (let i = 0; i < clusters.length - 1; i++) {
        const cluster = clusters[i]!;
        const nextCluster = clusters[i + 1]!;
        if (clustersEqual(cluster.clusters, nextCluster.clusters)) {
            continue;
        }
        clusterSecors.push({ startIdx: runStartIdx, endIdx: i, clusters: cluster.clusters, length: i - runStartIdx + 1 });
        runStartIdx = i + 1;
    }
    const lastCluster = clusters.at(-1);
    if (lastCluster !== undefined) {
        clusterSecors.push({ startIdx: runStartIdx, endIdx: clusters.length - 1, clusters: lastCluster.clusters, length: clusters.length - runStartIdx });
    }
    return clusterSecors;
}

export function runGroupListScript() {
    const courseNr = new URLSearchParams(window.location.search).get("courseNr");
    if (!courseNr) {
        console.warn("[tiss-piss] no courseNr found in URL");
        return;
    }
    const groups = parseGroupList();
    console.log("[tiss-piss] parsed groups", groups);

    const dateRange = getMinMaxDate(groups);
    if (!dateRange) {
        console.warn("[tiss-piss] no dates found in groups");
        return;
    }
    const [minDate, maxDate] = dateRange;
    const sectors = calcGroupSectors(groups, minDate, maxDate);
    console.log("[tiss-piss] calculated sectors", sectors);

    const sectorClusterings = sectors.map(sector => perSectorClustering(sector));
    console.log("[tiss-piss] calculated sector clusterings", sectorClusterings);

    const clusteringSectors = calcClusterSectors(sectorClusterings);
    console.log("[tiss-piss] calculated clustering sectors", clusteringSectors);

    renderGroups(groups, sectors, sectorClusterings, clusteringSectors);
}