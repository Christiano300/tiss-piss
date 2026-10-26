import type { Group, GroupTimeEntry, WeekClustering, ClusteringSector, Sector } from "./groups";
import { createApp } from 'vue';
import GroupCalendar from './GroupCalendar.vue';


export type ClusterInfo = {
    idx: number;
    color: string;
    groups: number[];
}

export type InfoClusteredSector = { startIdx: number, endIdx: number, clusters: ClusterInfo[] }

export type CalendarEntry = {
    cluster: number;
    day: number;
    startHour: number;
    endHour: number;
    slot: number;
};

export type CalendarDay = {
    day: number;
    slots: number;
    entries: CalendarEntry[];
};

export type CalendarWeek = {
    days: CalendarDay[];
    colorMap: Map<number, string>; // Map<clusterIdx, color>
};

export type AllCalendars = Map<number, CalendarWeek>; // Map<sectorIdx, CalendarWeek>

// This list has been generated and optimized to be distinct with glasbey
const COLORS = ['#d70000', '#8a3dff', '#008a00', '#00aeca', '#9eff00', '#ff7dd2', '#6d0051', '#ffa220', '#200871', '#00ffce', '#712400', '#b29eff', '#a26900', '#0075aa', '#be10ba', '#9ab245', '#590496', '#004d00', '#e77569', '#00b282', '#ef047d', '#ffeb69', '#a2394d', '#b675d2', '#4500ff', '#65e7ff', '#4192ff', '#14df65', '#aaffa2', '#82419e', '#798210', '#550014', '#79beff', '#ff00f3', '#a64104', '#c6619e', '#df6d04', '#41b200', '#e79eff', '#be9200', '#594da6', '#4d61fb', '#00cec2', '#dbbe00', '#a20071', '#9e000c', '#ff3549', '#827dd7', '#ba14ff', '#00458a']

function getClusterColors(clusteringSectors: ClusteringSector[]): InfoClusteredSector[] {
    let colorIdx = 0;
    // get the next color from the array, wrapping is intentional, more than 50 colors is cluttered either way
    function getNextColor() {
        const color = COLORS[colorIdx % COLORS.length]!;
        colorIdx++;
        return color;
    }
    const countMap = new Map<string, number>();
    for (const sector of clusteringSectors) {
        for (const cluster of sector.clusters) {
            const key = cluster.sort((a, b) => a - b).join(',');
            if (!countMap.has(key)) {
                countMap.set(key, 0);
            } else {
                countMap.set(key, countMap.get(key)! + 1);
            }
        }
    }

    // Sort stable but descending
    const groupings = Array.from(countMap.entries()).sort((a, b) => b[1] - a[1]);
    const colorAssignments = new Map<string, string>();

    // First, clusters that always have the same groups get a color and are removed from the pool
    const keySets = groupings.map(([key, _]) => new Set(key.split(',').map(Number)));

    for (let i = 0; i < groupings.length;) {
        const canditate = groupings[i];
        if (!canditate) continue;
        const [key, count] = canditate;
        const keySet = new Set(key.split(',').map(Number));

        let foundOverlap = false;
        for (let j = 0; j < keySets.length; j++) {
            if (i === j) continue;
            const otherSet = keySets[j];
            if (!otherSet) continue;
            const intersection = otherSet.intersection(keySet);
            if (intersection.size > 0) {
                foundOverlap = true;
                break;
            }
        }
        if (!foundOverlap) {
            colorAssignments.set(key, getNextColor());
            console.log(key);
            groupings.splice(i, 1);
            keySets.splice(i, 1);
        } else {
            i++;
        }
    }

    // Now, assign colors to the remaining clusters
    for (const [key, _] of groupings) {
        const keySet = new Set(key.split(',').map(Number));
        const usedColors = new Set<string>();
        for (const [assignedKey, color] of colorAssignments.entries()) {
            const assignedSet = new Set(assignedKey.split(',').map(Number));
            const intersection = assignedSet.intersection(keySet);
            if (intersection.size > 0) {
                usedColors.add(color);
            }
        }
        colorAssignments.set(key, getNextColor());
    }

    // Now, create the final list of InfoClusteredSector
    const clusteredSectors: InfoClusteredSector[] = clusteringSectors.map((sector) => {
        const clusters: ClusterInfo[] = sector.clusters.map((groupIndices, idx) => {
            const key = groupIndices.sort((a, b) => a - b).join(',');
            const color = colorAssignments.get(key) || getNextColor();
            return { idx: idx, color, groups: groupIndices };
        });
        return { startIdx: sector.startIdx, endIdx: sector.endIdx, clusters };
    });


    return clusteredSectors;
}

function calcCalendars(sectors: Sector[], clusteredSectors: InfoClusteredSector[]): AllCalendars {
    const calendars: AllCalendars = new Map();
    for (const infoSector of clusteredSectors) {
        for (const sector of sectors.slice(infoSector.startIdx, infoSector.endIdx + 1)) {
            const entries = sector.entries;
            const clusters = infoSector.clusters;
            // get the week entries for each cluster
            const weekEntries: Record<number, Omit<GroupTimeEntry, "groupIdx">[]> = {};
            const clusterExampleGroups: number[] = [];
            for (const cluster of clusters) {
                const exampleGroup = cluster.groups[0];
                if (exampleGroup === undefined) {
                    console.error("[tiss-piss] Cluster has no groups", infoSector, sector, cluster);
                    clusterExampleGroups.push(-1);
                    continue;
                }
                clusterExampleGroups.push(exampleGroup);
                const groupEntries = entries.filter((entry) => entry.groupIdx === exampleGroup);
                weekEntries[exampleGroup] = groupEntries;
            }
            // for each day
            const dayCalendars: CalendarDay[] = [];
            for (let day = 1; day <= 7; day++) {
                const slottedEntries: CalendarEntry[] = [];
                const closedSlots = new Map<number, number>();
                for (let clusterIdx = 0; clusterIdx < clusters.length; clusterIdx++) {
                    const exampleGroup = clusterExampleGroups[clusterIdx];
                    if (exampleGroup === -1 || exampleGroup === undefined) continue;
                    const groupEntries = weekEntries[exampleGroup as number];
                    if (!groupEntries) continue;
                    const dayEntries = groupEntries.filter((entry: Omit<GroupTimeEntry, "groupIdx">) => entry.day === day).sort((a: Omit<GroupTimeEntry, "groupIdx">, b: Omit<GroupTimeEntry, "groupIdx">) => a.startHour - b.startHour || a.endHour - b.endHour);
                    if (!dayEntries || dayEntries.length === 0) {
                        // The only way for this to happen is if the cluster has no groups, which gets logged earlier
                        continue;
                    }
                    for (const entry of dayEntries) {
                        for (const [closedSlot, endHour] of closedSlots.entries()) {
                            if (entry.startHour >= endHour) {
                                closedSlots.delete(closedSlot);
                            }
                        }
                        let slot = 0;
                        for (; ; slot++) {
                            if (!closedSlots.has(slot)) {
                                break;
                            }
                        }
                        closedSlots.set(slot, entry.endHour);
                        slottedEntries.push({
                            day: entry.day,
                            startHour: entry.startHour,
                            endHour: entry.endHour,
                            cluster: clusterIdx,
                            slot
                        });
                    }
                }
                dayCalendars.push({ day, entries: slottedEntries, slots: Math.max(...slottedEntries.map((e) => e.slot), 0) + 1 });
            }
            calendars.set(sector.idx, { days: dayCalendars, colorMap: new Map(clusters.map((cluster) => [cluster.idx, cluster.color])) });
        }
    }
    return calendars;
}

export function renderGroups(groups: Group[], sectors: Sector[], sectorClusterings: WeekClustering[], clusteringSectors: ClusteringSector[]) {
    const clusteredSectors = getClusterColors(clusteringSectors);
    const allCalendars = calcCalendars(sectors, clusteredSectors);
    const el = document.querySelector('#group-calendar');
    if (el) {
        createApp(GroupCalendar, { groups, sectorClusterings, clusteredSectors, allCalendars }).mount(el);
    } else {
        console.error('Could not find #group-calendar element to mount GroupCalendar component.');
    }
}