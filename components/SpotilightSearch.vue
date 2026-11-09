<template>
    <div v-if="visible"
        class="bg-slate-700/40 backdrop-blur-md rounded-xl p-4 fixed left-0 right-0 w-fit mx-auto max-h-3/4 mt-32 z-100 flex flex-col">
        <input type="text" v-model="search" placeholder="Search..." ref="input"
        @blur="visible = false"
            class="w-full text-3xl p-5 rounded-lg bg-transparent bg-none border-none outline-none text-white" />
        <div
            class="py-2 overflow-y-scroll scrollbar-thin scrollbar-gutter-both scrollbar-thumb-slate-300/40 scrollbar-track-transparent">
            <div v-for="value, idx in filteredValues" :key="value.id"
                class="rounded-xl my-1 px-3 py-1 hover:bg-slate-400/20 cursor-pointer"
                :class="{ 'bg-slate-400/40!': idx === selectedIdx }"
                @pointerdown="selectedIdx = idx; submit();">
                <p class="text-white text-3xl my-1">{{ value.name }}</p>
                <p class="text-gray-300 text-lg my-1">{{ value.description }}</p>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
const props = defineProps<{ values: { name: string, description: string, id: string, url: string }[] }>();

const inputElement = useTemplateRef("input");

const emit = defineEmits<{
    select: [id: string]
}>();
const visible = ref(false);

const search = ref('');
const filteredValues = computed(() => {
    return props.values.filter((value) => {
        return value.name.toLowerCase().includes(search.value.toLowerCase());
    });
});

const selectedIdx = ref(0);

onMounted(() => {
    window.addEventListener("keydown", handleKeydown);
});

onUpdated(() => {
    if (visible.value) {
        inputElement.value?.focus();
    }
});

function handleKeydown(ev: KeyboardEvent) {
    if (!visible.value) {
        if (ev.key === " " && ev.altKey) {
            ev.preventDefault();
            visible.value = true;
            search.value = '';
            selectedIdx.value = 0;
        }
        return;
    }
    if (ev.key === 'ArrowDown') {
        selectedIdx.value = Math.min(selectedIdx.value + 1, filteredValues.value.length - 1);
    } else if (ev.key === 'ArrowUp') {
        selectedIdx.value = Math.max(selectedIdx.value - 1, 0);
    } else if (ev.key === 'Escape') {
        visible.value = false;
    } else if (ev.key === 'Enter') {
        submit();
    }
}

function submit() {
    const selectedValue = filteredValues.value[selectedIdx.value];
    if (selectedValue) {
        visible.value = false;
        window.location.href = selectedValue.url;
    }
}
</script>

<style lang="css" scoped>
.text-lg\! {
    font-size: var(--text-lg) !important;
}
</style>