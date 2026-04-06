export interface DashboardCliOptions {
  port: number;
  dev: boolean;
}

export async function launchDashboard(options: DashboardCliOptions): Promise<void> {
  // Dynamic import to avoid loading Express/chokidar unless dashboard is used
  const { startDashboard } = await import('../dashboard/server/index.js');
  await startDashboard(options);

  if (options.dev) {
    console.log(`Dev mode: run 'cd sdk/dashboard/ui && npm run dev' for hot reload`);
  }

  // Keep process alive
  await new Promise(() => {});
}
