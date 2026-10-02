import { createApp } from 'vue';
import Dashboard from '@/components/Dashboard.vue';

export function mountDashboard(container: Element): void {
  const host = document.createElement('div');
  host.id = 'piss-dashboard-host';
  try {
    createApp(Dashboard).mount(host);
  } catch (err) {
    console.error('[tiss-piss] failed to mount dashboard', err);
    return;
  }
  container.replaceChildren(host);
}
