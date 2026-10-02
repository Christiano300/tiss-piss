<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import {
  getNavFavorites,
  type NavCategory,
  type NavFavorite,
} from '@/entrypoints/tiss.content/navFavorites';

const favorites = ref<NavFavorite[]>([]);
const loadError = ref(false);

onMounted(async () => {
  try {
    favorites.value = await getNavFavorites();
  } catch {
    loadError.value = true;
    favorites.value = [];
  }
});

const GROUP_ORDER: NavCategory[] = ['education', 'organization', 'research', 'general'];

const GROUP_LABELS: Record<NavCategory, string> = {
  education: 'Education',
  organization: 'Organization',
  research: 'Research',
  general: 'General',
};

const groups = computed(() =>
  GROUP_ORDER.map((category) => ({
    category,
    label: GROUP_LABELS[category],
    items: favorites.value.filter((f) => f.category === category),
  })).filter((g) => g.items.length > 0),
);
</script>

<template>
  <div id="piss-dashboard">
    <h1>Dashboard</h1>
    <p v-if="loadError" class="piss-dashboard-hint">
      Could not load your pinned pages. Star pages in the left navigation to pin them here.
    </p>
    <p v-else-if="favorites.length === 0" class="piss-dashboard-hint">
      No pinned pages yet. Star pages in the left navigation to pin them here.
    </p>
    <section v-for="group in groups" :key="group.category" class="piss-dashboard-group">
      <h2>{{ group.label }}</h2>
      <div class="piss-dashboard-grid">
        <a
          v-for="item in group.items"
          :key="item.href"
          :href="item.href"
          class="piss-dashboard-card"
        >
          {{ item.label }}
        </a>
      </div>
    </section>
  </div>
</template>

<style scoped>
#piss-dashboard {
  padding: 8px 0 24px;
}

#piss-dashboard h1 {
  margin: 0 0 4px;
}

.piss-dashboard-hint {
  color: var(--text-muted);
}

.piss-dashboard-group {
  margin-top: 20px;
}

.piss-dashboard-group h2 {
  margin: 0 0 10px;
  font-size: 1.1em;
}

.piss-dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.piss-dashboard-card {
  display: block;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  text-decoration: none;
}

.piss-dashboard-card:hover {
  background: var(--surface-2);
  text-decoration: none;
}
</style>
