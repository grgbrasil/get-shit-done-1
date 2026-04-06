import { createRouter, createWebHistory } from 'vue-router';

const Placeholder = { template: '<div style="padding:2rem;color:#8b949e;">Coming soon</div>' };

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: () => import('./components/ProjectOverview.vue'),
    },
    {
      path: '/project/:projectId',
      component: () => import('./components/ProjectOverview.vue'),
    },
    {
      path: '/project/:projectId/roadmap',
      component: Placeholder,
    },
    {
      path: '/project/:projectId/phases',
      component: Placeholder,
    },
    {
      path: '/project/:projectId/phase/:phaseId',
      component: Placeholder,
    },
    {
      path: '/project/:projectId/phase/:phaseId/plan/:planId',
      component: Placeholder,
    },
    {
      path: '/project/:projectId/config',
      component: Placeholder,
    },
  ],
});
