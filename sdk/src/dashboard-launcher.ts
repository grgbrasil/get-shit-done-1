export interface DashboardCliOptions {
  port: number;
  dev: boolean;
}

export async function launchDashboard(options: DashboardCliOptions): Promise<void> {
  // Dynamic import with variable to prevent tsc from resolving across rootDir boundary.
  // The dashboard server has its own tsconfig and compiles separately.
  const serverPath = '../dashboard/server/index.js';
  const mod = await import(serverPath) as { startDashboard: (opts: DashboardCliOptions) => Promise<void> };
  await mod.startDashboard(options);

  if (options.dev) {
    console.log(`Dev mode: run 'cd sdk/dashboard/ui && npm run dev' for hot reload`);
  }

  // Keep process alive
  await new Promise(() => {});
}
