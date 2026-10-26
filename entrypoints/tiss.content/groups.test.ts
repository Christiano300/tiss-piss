// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./groupRender", () => ({ renderGroups: vi.fn() }));

import { renderGroups } from "./groupRender";
import { GroupEnrolStatus, parseGroupList, runGroupListScript, type Group } from "./groups";

type Row = [date: string, start: string, end: string];

function groupHtml(name: string, status: string, rows: Row[]): string {
    return `<div class="groupWrapper">
        <div class="groupHeader">
            <div class="header_element">Gruppe</div>
            <div class="header_element"><span class="bold">${status}</span></div>
        </div>
        <div class="titleCol"><span class="bold">Gruppe ${name}</span></div>
        <div class="listTable"><table><tbody>
            ${rows.map(([date, start, end]) => `<tr><td>${date}</td><td>${start}</td><td>${end}</td></tr>`).join("")}
        </tbody></table></div>
    </div>`;
}

function render(html: string) {
    document.body.innerHTML = html;
}

describe("parseGroupList", () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
        warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => {
        warn.mockRestore();
        document.body.innerHTML = "";
    });

    it("parses name, status, dates and times", () => {
        render(groupHtml("3", "Anmeldung möglich", [["03.03.2025", "10:00", "12:00"]]));

        expect(parseGroupList()).toEqual<Group[]>([{
            name: "3",
            status: GroupEnrolStatus.POSSIBLE,
            dates: [{ year: 2025, month: 3, day: 3, startHour: 10, endHour: 12 }],
            weekDates: [{ year: 2025, week: 10, weekDay: 1, startHour: 10, endHour: 12 }],
            index: 0,
        }]);
    });

    it("strips the German group prefix with or without a space", () => {
        render([
            groupHtml("1", "Angemeldet", []),
            `<div class="groupWrapper">
                <div class="groupHeader"><div></div><div class="header_element"><span class="bold">Angemeldet</span></div></div>
                <div class="titleCol"><span class="bold">Gruppe2</span></div>
                <div class="listTable"><table><tbody>
                    <tr><td>03.03.2025</td><td>10:00</td><td>12:00</td></tr>
                </tbody></table></div>
            </div>`,
        ].join(""));

        expect(parseGroupList().map(group => group.name)).toEqual(["1", "2"]);
    });

    it("maps all enrolment statuses, German and English", () => {
        const cases: [string, GroupEnrolStatus][] = [
            ["Angemeldet", GroupEnrolStatus.ENROLLED],
            ["registered", GroupEnrolStatus.ENROLLED],
            ["Anmeldung möglich", GroupEnrolStatus.POSSIBLE],
            ["application possible", GroupEnrolStatus.POSSIBLE],
            ["Anmeldung ab 10.03.2025", GroupEnrolStatus.POSSIBLE],
            ["Anmeldung nicht möglich", GroupEnrolStatus.NOT_POSSIBLE],
            ["application not possible", GroupEnrolStatus.NOT_POSSIBLE],
            ["Anmeldung vorbei", GroupEnrolStatus.OVER],
            ["application over", GroupEnrolStatus.OVER],
            ["something else", GroupEnrolStatus.UNKNOWN],
        ];
        render(cases.map(([status], i) => groupHtml(String(i), status, [])).join(""));

        expect(parseGroupList().map(group => group.status)).toEqual(cases.map(([, status]) => status));
    });

    it("converts times to fractional hours", () => {
        render(groupHtml("1", "Angemeldet", [["03.03.2025", "10:30", "12:45"]]));

        const [dateTime] = parseGroupList()[0]!.dates;
        expect(dateTime).toMatchObject({ startHour: 10.5, endHour: 12.75 });
    });

    it("sorts dates chronologically and by start time", () => {
        render(groupHtml("1", "Angemeldet", [
            ["10.03.2025", "14:00", "16:00"],
            ["03.03.2025", "14:00", "16:00"],
            ["03.03.2025", "10:00", "12:00"],
        ]));

        expect(parseGroupList()[0]!.dates.map(d => [d.month, d.day, d.startHour])).toEqual([
            [3, 3, 10],
            [3, 3, 14],
            [3, 10, 14],
        ]);
    });

    it("skips unparseable rows", () => {
        render(groupHtml("1", "Angemeldet", [
            ["03.03.2025", "10:00", "12:00"],
            ["kein Datum", "10:00", "12:00"],
            ["10.03.2025", "", "12:00"],
        ]));

        expect(parseGroupList()[0]!.dates).toHaveLength(1);
    });

    it("drops groups without a schedule table but keeps original indices", () => {
        render([
            `<div class="groupWrapper">
                <div class="groupHeader"><div></div><div class="header_element"><span class="bold">Angemeldet</span></div></div>
                <div class="titleCol"><span class="bold">Gruppe 1</span></div>
            </div>`,
            groupHtml("2", "Angemeldet", [["03.03.2025", "10:00", "12:00"]]),
        ].join(""));

        const groups = parseGroupList();
        expect(groups).toHaveLength(1);
        expect(groups[0]!.name).toBe("2");
        expect(groups[0]!.index).toBe(1);
    });

    it("falls back to 'Unknown' and UNKNOWN status when metadata is missing", () => {
        render(`<div class="groupWrapper">
            <div class="listTable"><table><tbody>
                <tr><td>03.03.2025</td><td>10:00</td><td>12:00</td></tr>
            </tbody></table></div>
        </div>`);

        const [group] = parseGroupList();
        expect(group!.name).toBe("Unknown");
        expect(group!.status).toBe(GroupEnrolStatus.UNKNOWN);
    });
});

describe("runGroupListScript pipeline", () => {
    const mockRender = vi.mocked(renderGroups);

    beforeEach(() => {
        mockRender.mockClear();
        window.history.replaceState({}, "", "/?courseNr=123");
        document.body.innerHTML = "";
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("parses groups and computes sectors and clusterings", () => {
        render([
            groupHtml("1", "Anmeldung möglich", [
                ["03.03.2025", "10:00", "12:00"],
                ["10.03.2025", "10:00", "12:00"],
            ]),
            groupHtml("2", "Angemeldet", [
                ["03.03.2025", "10:00", "12:00"],
                ["10.03.2025", "14:00", "16:00"],
            ]),
            groupHtml("3", "Anmeldung vorbei", [
                ["05.03.2025", "10:00", "12:00"],
                ["12.03.2025", "10:00", "12:00"],
            ]),
        ].join(""));

        runGroupListScript();

        expect(mockRender).toHaveBeenCalledTimes(1);
        const [groups, sectors, sectorClusterings, clusteringSectors] = mockRender.mock.calls[0]!;

        expect(groups.map(group => group.name)).toEqual(["1", "2", "3"]);

        // Week 10: G1 and G2 share Monday 10-12, G3 is on Wednesday.
        // Week 11: G2 moved to Monday 14-16, so every group is its own cluster.
        expect(sectors).toEqual([
            {
                startWeek: 10,
                endWeek: 10,
                length: 1,
                idx: 0,
                entries: [
                    { groupIdx: 0, startHour: 10, endHour: 12, day: 1 },
                    { groupIdx: 1, startHour: 10, endHour: 12, day: 1 },
                    { groupIdx: 2, startHour: 10, endHour: 12, day: 3 },
                ],
            },
            {
                startWeek: 11,
                endWeek: 11,
                length: 1,
                idx: 1,
                entries: [
                    { groupIdx: 0, startHour: 10, endHour: 12, day: 1 },
                    { groupIdx: 1, startHour: 14, endHour: 16, day: 1 },
                    { groupIdx: 2, startHour: 10, endHour: 12, day: 3 },
                ],
            },
        ]);

        expect(sectorClusterings).toEqual([
            { startWeek: 10, endWeek: 10, length: 1, clusters: [[0, 1], [2]] },
            { startWeek: 11, endWeek: 11, length: 1, clusters: [[0], [1], [2]] },
        ]);

        expect(clusteringSectors).toEqual([
            { startIdx: 0, endIdx: 0, length: 1, clusters: [[0, 1], [2]] },
            { startIdx: 1, endIdx: 1, length: 1, clusters: [[0], [1], [2]] },
        ]);
    });

    it("merges weeks with identical schedules into one sector", () => {
        render([
            groupHtml("1", "Angemeldet", [
                ["03.03.2025", "10:00", "12:00"],
                ["10.03.2025", "10:00", "12:00"],
            ]),
            groupHtml("2", "Angemeldet", [
                ["03.03.2025", "10:00", "12:00"],
                ["10.03.2025", "10:00", "12:00"],
            ]),
        ].join(""));

        runGroupListScript();

        const [groups, sectors, sectorClusterings, clusteringSectors] = mockRender.mock.calls[0]!;
        expect(groups).toHaveLength(2);
        expect(sectors).toEqual([{
            startWeek: 10,
            endWeek: 11,
            length: 2,
            idx: 0,
            entries: [
                { groupIdx: 0, startHour: 10, endHour: 12, day: 1 },
                { groupIdx: 1, startHour: 10, endHour: 12, day: 1 },
            ],
        }]);
        expect(sectorClusterings).toEqual([{ startWeek: 10, endWeek: 11, length: 2, clusters: [[0, 1]] }]);
        expect(clusteringSectors).toEqual([{ startIdx: 0, endIdx: 0, length: 1, clusters: [[0, 1]] }]);
    });

    it("keeps weeks distinct when the schedule crosses the year boundary", () => {
        render([
            groupHtml("1", "Angemeldet", [
                ["23.12.2024", "10:00", "12:00"],
                ["30.12.2024", "10:00", "12:00"],
                ["06.01.2025", "10:00", "12:00"],
            ]),
        ].join(""));

        runGroupListScript();

        const [, sectors, sectorClusterings] = mockRender.mock.calls[0]!;
        expect(sectors).toHaveLength(1);
        expect(sectors[0]).toMatchObject({ startWeek: 52, endWeek: 2, length: 3 });
        expect(sectors[0]!.entries.map(entry => entry.day)).toEqual([1]);
        expect(sectorClusterings).toEqual([{ startWeek: 52, endWeek: 2, length: 3, clusters: [[0]] }]);
    });

    it("does not render when the URL has no course number", () => {
        window.history.replaceState({}, "", "/");
        render(groupHtml("1", "Angemeldet", [["03.03.2025", "10:00", "12:00"]]));

        runGroupListScript();

        expect(mockRender).not.toHaveBeenCalled();
    });

    it("does not render when no group has dates", () => {
        render(groupHtml("1", "Angemeldet", []));

        runGroupListScript();

        expect(mockRender).not.toHaveBeenCalled();
    });
});
