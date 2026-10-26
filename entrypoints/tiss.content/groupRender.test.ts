// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createApp, mount } = vi.hoisted(() => {
    const mount = vi.fn();
    const createApp = vi.fn((_component: unknown, _props: unknown) => ({ mount }));
    return { createApp, mount };
});

vi.mock("vue", () => ({ createApp }));
vi.mock("./GroupCalendar.vue", () => ({ default: { name: "GroupCalendarStub" } }));

import GroupCalendar from "./GroupCalendar.vue";
import { renderGroups, type AllCalendars, type InfoClusteredSector } from "./groupRender";
import { GroupEnrolStatus, type ClusteringSector, type Group, type Sector, type WeekClustering } from "./groups";

const groups: Group[] = [
    { name: "1", status: GroupEnrolStatus.ENROLLED, dates: [], weekDates: [], index: 0 },
    { name: "2", status: GroupEnrolStatus.ENROLLED, dates: [], weekDates: [], index: 1 },
    { name: "3", status: GroupEnrolStatus.ENROLLED, dates: [], weekDates: [], index: 2 },
];
const sectors: Sector[] = [{ startWeek: 10, endWeek: 10, length: 1, idx: 0, entries: [] }];
const sectorClusterings: WeekClustering[] = [{ startWeek: 10, endWeek: 10, length: 1, clusters: [[0, 1], [2]] }];

type MountProps = {
    groups: Group[];
    sectorClusterings: WeekClustering[];
    clusteredSectors: InfoClusteredSector[];
    allCalendars: AllCalendars;
};

function render(clusteringSectors: ClusteringSector[], sectorList: Sector[] = sectors): MountProps {
    renderGroups(groups, sectorList, sectorClusterings, clusteringSectors);
    const call = createApp.mock.calls.at(-1);
    if (!call) throw new Error("createApp was not called");
    return call[1] as MountProps;
}

const infoSector = (clusters: number[][], startIdx = 0, endIdx = 0): ClusteringSector => ({
    startIdx,
    endIdx,
    length: endIdx - startIdx + 1,
    clusters,
});

const colorMapOf = (clusteredSectors: InfoClusteredSector[], idx: number) => new Map(
    clusteredSectors[idx]!.clusters.map(cluster => [cluster.idx, cluster.color]),
);

describe("renderGroups", () => {
    let error: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        createApp.mockClear();
        mount.mockClear();
        document.body.innerHTML = `<div id="group-calendar"></div>`;
        error = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        error.mockRestore();
        document.body.innerHTML = "";
    });

    it("mounts GroupCalendar with the computed data", () => {
        const props = render([{ startIdx: 0, endIdx: 0, length: 1, clusters: [[0, 1], [2]] }]);

        expect(createApp).toHaveBeenCalledWith(GroupCalendar, {
            groups,
            sectorClusterings,
            clusteredSectors: props.clusteredSectors,
            allCalendars: props.allCalendars,
        });
        expect(mount).toHaveBeenCalledWith(document.querySelector("#group-calendar"));
    });

    it("gives identical group sets the same color across sectors, regardless of group order", () => {
        const clustered = render([
            { startIdx: 0, endIdx: 0, length: 1, clusters: [[2, 1]] },
            { startIdx: 1, endIdx: 1, length: 1, clusters: [[1, 2], [3]] },
        ]).clusteredSectors;

        const firstSlot = clustered[0]!.clusters[0]!;
        const sameSlotLater = clustered[1]!.clusters[0]!;
        const otherSlot = clustered[1]!.clusters[1]!;

        expect([...firstSlot.groups].sort()).toEqual([1, 2]);
        expect(sameSlotLater.color).toBe(firstSlot.color);
        expect(otherSlot.color).not.toBe(firstSlot.color);
    });

    it("uses palette colors for every cluster", () => {
        const clustered = render([
            { startIdx: 0, endIdx: 0, length: 1, clusters: [[0], [1], [2]] },
        ]).clusteredSectors;

        const colors = clustered.flatMap(sector => sector.clusters.map(cluster => cluster.color));
        expect(colors).toHaveLength(3);
        for (const color of colors) {
            expect(color).toMatch(/^#[0-9a-f]{6}$/i);
        }
        expect(new Set(colors).size).toBe(3);
    });

    it("does not mount when the host element is missing", () => {
        document.body.innerHTML = "";

        renderGroups(groups, sectors, sectorClusterings, [{ startIdx: 0, endIdx: 0, length: 1, clusters: [[0]] }]);

        expect(createApp).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalled();
    });
});

describe("calcCalendars (via renderGroups)", () => {
    let error: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        createApp.mockClear();
        document.body.innerHTML = `<div id="group-calendar"></div>`;
        error = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        error.mockRestore();
        document.body.innerHTML = "";
    });

    it("builds a 7-day grid and puts overlapping entries in separate slots", () => {
        const sectorList: Sector[] = [{
            startWeek: 10,
            endWeek: 10,
            length: 1,
            idx: 0,
            entries: [
                { groupIdx: 0, day: 1, startHour: 10, endHour: 12 },
                { groupIdx: 1, day: 1, startHour: 11, endHour: 13 },
                { groupIdx: 0, day: 3, startHour: 10, endHour: 12 },
                { groupIdx: 1, day: 3, startHour: 14, endHour: 16 },
            ],
        }];
        const clusters = [[0], [1]];

        const rendered = render([infoSector(clusters)], sectorList);
        const calendar = rendered.allCalendars.get(0)!;

        expect(calendar.days).toHaveLength(7);
        // Monday: 10-12 and 11-13 overlap, so the second entry moves to slot 1.
        expect(calendar.days[0]).toEqual({
            day: 1,
            slots: 2,
            entries: [
                { cluster: 0, day: 1, startHour: 10, endHour: 12, slot: 0 },
                { cluster: 1, day: 1, startHour: 11, endHour: 13, slot: 1 },
            ],
        });
        // Wednesday: 10-12 and 14-16 do not overlap, so both use slot 0.
        expect(calendar.days[2]).toEqual({
            day: 3,
            slots: 1,
            entries: [
                { cluster: 0, day: 3, startHour: 10, endHour: 12, slot: 0 },
                { cluster: 1, day: 3, startHour: 14, endHour: 16, slot: 0 },
            ],
        });
        expect(calendar.days[1]).toEqual({ day: 2, slots: 1, entries: [] });
        expect(calendar.colorMap).toEqual(colorMapOf(rendered.clusteredSectors, 0));
    });

    it("frees a slot once its entry has ended", () => {
        const sectorList: Sector[] = [{
            startWeek: 10,
            endWeek: 10,
            length: 1,
            idx: 0,
            entries: [
                { groupIdx: 0, day: 1, startHour: 8, endHour: 10 },
                { groupIdx: 0, day: 1, startHour: 10, endHour: 12 },
                { groupIdx: 1, day: 1, startHour: 9, endHour: 11 },
            ],
        }];
        const clusters = [[0], [1]];

        const monday = render([infoSector(clusters)], sectorList).allCalendars.get(0)!.days[0]!;

        expect(monday.slots).toBe(2);
        expect(monday.entries.map(entry => [entry.cluster, entry.startHour, entry.slot])).toEqual([
            [0, 8, 0],
            [0, 10, 0],
            [1, 9, 1],
        ]);
    });

    it("renders an identical meeting shared by a cluster only once", () => {
        const sectorList: Sector[] = [{
            startWeek: 10,
            endWeek: 10,
            length: 1,
            idx: 0,
            entries: [
                { groupIdx: 0, day: 2, startHour: 10, endHour: 12 },
                { groupIdx: 1, day: 2, startHour: 10, endHour: 12 },
            ],
        }];

        const tuesday = render([infoSector([[0, 1]])], sectorList).allCalendars.get(0)!.days[1]!;

        expect(tuesday.slots).toBe(1);
        expect(tuesday.entries).toEqual([
            { cluster: 0, day: 2, startHour: 10, endHour: 12, slot: 0 },
        ]);
    });

    it("builds one calendar per sector covered by a clustering sector", () => {
        const sectorList: Sector[] = [
            {
                startWeek: 10,
                endWeek: 10,
                length: 1,
                idx: 0,
                entries: [{ groupIdx: 0, day: 1, startHour: 10, endHour: 12 }],
            },
            {
                startWeek: 11,
                endWeek: 11,
                length: 1,
                idx: 1,
                entries: [
                    { groupIdx: 0, day: 1, startHour: 10, endHour: 12 },
                    { groupIdx: 1, day: 2, startHour: 10, endHour: 12 },
                ],
            },
        ];
        const clusters = [[0], [1]];

        const calendars = render([infoSector(clusters, 0, 1)], sectorList).allCalendars;

        expect([...calendars.keys()]).toEqual([0, 1]);
        expect(calendars.get(0)!.days[0]!.entries).toHaveLength(1);
        expect(calendars.get(0)!.days[1]!.entries).toHaveLength(0);
        expect(calendars.get(1)!.days[0]!.entries).toHaveLength(1);
        expect(calendars.get(1)!.days[1]!.entries).toEqual([
            { cluster: 1, day: 2, startHour: 10, endHour: 12, slot: 0 },
        ]);
        expect(calendars.get(0)!.colorMap).toEqual(calendars.get(1)!.colorMap);
    });

    it("logs and skips a cluster without groups", () => {
        const sectorList: Sector[] = [{
            startWeek: 10,
            endWeek: 10,
            length: 1,
            idx: 0,
            entries: [{ groupIdx: 0, day: 1, startHour: 10, endHour: 12 }],
        }];

        const rendered = render([infoSector([[]])], sectorList);
        const calendar = rendered.allCalendars.get(0)!;

        expect(calendar.days.every(day => day.entries.length === 0)).toBe(true);
        expect(calendar.colorMap).toEqual(colorMapOf(rendered.clusteredSectors, 0));
        expect(error).toHaveBeenCalledWith(
            "[tiss-piss] Cluster has no groups",
            expect.anything(),
            expect.anything(),
            expect.anything(),
        );
    });
});
