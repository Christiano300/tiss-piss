<template>
    <div class="flex gap-5 flex-wrap items-center">
        <span class="font-semibold">{{ locale === "de" ? "Anmeldestatus:" : "Enrolment status:" }}</span>
        <label v-for="status in enrolmentStatuses" :key="status" class="inline-flex items-center gap-1 cursor-pointer">
            <input type="checkbox" :checked="selectedStatuses.has(status)" @change="toggleStatus(status)"
                style="margin-right: .1em !important">
            <span>{{ enrolmentStatusName(status, locale ?? "en") }}</span>
        </label>
        <!-- Sector (Week) selection -->
    </div>
    <div class="w-full flex gap-2 flex-wrap justify-start">
        <div v-for="(sector, index) in props.sectorClusterings" :style="{ flex: sector.length }"
            class="min-w-fit text-center border-2 border-slate-600 rounded-sm cursor-pointer" @click="currentSectorIdx = index"
            :class="{ 'bg-sky-500 text-white': currentSectorIdx === index }">
            <span v-if="sector.startWeek !== sector.endWeek">KW {{ sector.startWeek }} - {{ sector.endWeek }}</span>
            <span v-else>KW {{ sector.startWeek }}</span>
        </div>
    </div>
    <!-- Clustering for the current sector (week) -->
    <div class="flex gap-2 flex-wrap">
        <span v-for="cluster in getClusteredSector(currentSectorIdx)?.clusters ?? []"
            class="rounded-2xl px-2" :style="{
                backgroundColor: cluster.color,
                color: textColor(cluster.color)
            }">
            {{cluster.groups.map(idx => props.groups[idx]?.name || idx).join(", ")}}
        </span>
    </div>
    <!-- Calendar for the current Week -->
    <div class="grid" :style="{ gridTemplateColumns: gridTemplateColumns, gridTemplateRows: 'auto repeat(17, 1fr)' }">
        <!-- Hour "header" -->
        <div v-for="hour in 17" :style="{
            gridRow: hour + 1,
            gridColumn: 1,
        }">{{ hour + 8 }}:00</div>
        <!-- For every day -->
        <template v-for="day in 7" :key="day">
            <!-- Day header -->
            <div :style="{
                gridColumnStart: (cumulativeColumn[day - 1] ?? 0) + 2,
                gridColumnEnd: (cumulativeColumn[day] ?? 0) + 2,
                gridRow: 1
            }" class="border-2 border-slate-600">
                <span>{{ weekdayNames[day - 1] }}</span>
            </div>
            <div v-for="entry in currentCalendar?.days[day - 1]?.entries" :style="{
                color: textColor(currentCalendar?.colorMap?.get(entry.cluster)!),
                backgroundColor: currentCalendar?.colorMap?.get(entry.cluster),
                gridRowStart: entry.startHour - 7,
                gridRowEnd: entry.endHour - 7,
                gridColumnStart: (cumulativeColumn[day - 1] ?? 0) + entry.slot + 2,
                gridColumnEnd: (cumulativeColumn[day - 1] ?? 0) + entry.slot + 3
            }" class="border-2 border-slate-600">
                <span>Cluster {{ entry.cluster }} ({{ entry.startHour }} - {{ entry.endHour }})</span>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import type { AllCalendars, InfoClusteredSector } from './groupRender';
import { GroupEnrolStatus, enrolmentStatusName, type Group, type WeekClustering } from './groups';

const gcd = (a: number, b: number): number => (!b ? a : gcd(b, a % b));
const lcm = (x: number, y: number) => (x * y) / gcd(x, y);

const currentSectorIdx = ref(0);

const locale = window.PISSLocale ?? "en";

const props = defineProps<{
    groups: Group[];
    sectorClusterings: WeekClustering[];
    clusteredSectors: InfoClusteredSector[];
    allCalendars: AllCalendars;
}>();

const enrolmentStatuses = Object.values(GroupEnrolStatus).filter(
    (status): status is GroupEnrolStatus => typeof status === "number"
);

const selectedStatuses = ref((() => {
    const statuses = new Set(enrolmentStatuses);
    statuses.delete(GroupEnrolStatus.NOT_POSSIBLE);
    return statuses;
})());

function toggleStatus(status: GroupEnrolStatus) {
    const nextStatuses = new Set(selectedStatuses.value);
    if (nextStatuses.has(status)) {
        nextStatuses.delete(status);
    } else {
        nextStatuses.add(status);
    }
    selectedStatuses.value = nextStatuses;
}

const visibleGroupIndices = computed(() => new Set(
    props.groups
        .filter(group => selectedStatuses.value.has(group.status))
        .map(group => group.index)
));

const filteredClusteredSectors = computed(() => {
    return props.clusteredSectors.map(infoSector => ({
        ...infoSector,
        clusters: infoSector.clusters
            .map(cluster => ({ ...cluster, groups: cluster.groups.filter(groupIndex => visibleGroupIndices.value.has(groupIndex)) }))
            .filter(cluster => cluster.groups.length > 0)
    }));
});

const filteredCalendars = computed(() => {
    const calendars: AllCalendars = new Map();
    for (const [sectorIdx, calendar] of props.allCalendars) {
        const infoSector = filteredClusteredSectors.value.find((candidate) =>
            sectorIdx >= candidate.startIdx && sectorIdx <= candidate.endIdx
        );
        const visibleClusterIndices = new Set(infoSector?.clusters.map(cluster => cluster.idx));
        const days = calendar.days.map(day => {
            const entries = day.entries.filter(entry => visibleClusterIndices.has(entry.cluster));
            return {
                ...day,
                entries,
                slots: Math.max(...entries.map(entry => entry.slot), 0) + 1
            };
        });
        calendars.set(sectorIdx, {
            days,
            colorMap: new Map(
                [...calendar.colorMap].filter(([clusterIdx]) => visibleClusterIndices.has(clusterIdx))
            )
        });
    }
    return calendars;
});

const currentCalendar = computed(() => {
    return filteredCalendars.value.get(currentSectorIdx.value);
});

const gridTemplateColumns = computed(() => {
    const columnLcm = currentCalendar.value?.days.reduce((acc, day) => lcm(acc, day.slots), 1) ?? 1;
    return "auto " + (currentCalendar.value?.days.map(day => `repeat(${day.slots}, ${columnLcm / (day.slots)}fr)`).join(' ') ?? '');
});

const weekdayNames = window.PISSLocale === "de" ?
    ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] :
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const cumulativeColumn = computed(() => {
    const cumulative: number[] = [];
    let sum = 0;
    for (const day of currentCalendar.value?.days ?? []) {
        cumulative.push(sum);
        sum += day.slots;
    }
    cumulative.push(sum); // Add the total sum as the last element
    return cumulative;
});

function getClusteredSector(sectorIdx: number): InfoClusteredSector | undefined {
    return filteredClusteredSectors.value.find((infoSector) => sectorIdx >= infoSector.startIdx && sectorIdx <= infoSector.endIdx);
}

/**
 * Calculte WCAG relative luminance of a color given in hex format.
 */
function luminance(hex: string) {
    const linLightFromSRGB = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const [r, g, b] = [1, 3, 5].map((i) => linLightFromSRGB(parseInt(hex.slice(i, i + 2), 16) / 255));
    if (typeof r !== "number" || typeof g !== "number" || typeof b !== "number") {
        return 0;
    }
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function textColor(bgHex: string) {
    const L = luminance(bgHex);
    const contrastWhite = 1.05 / (L + 0.05);
    const contrastBlack = (L + 0.05) / 0.05;
    return contrastBlack > contrastWhite ? "#111" : "#eef";
}
</script>