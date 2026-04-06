const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface Project {
  id: string;
  name: string;
  path: string;
}

export interface PlanInfo {
  id: string;
  wave: number;
  autonomous: boolean;
  objective: string | null;
  files_modified: string[];
  task_count: number;
  has_summary: boolean;
}

export interface PhasePlanIndex {
  phase: string;
  plans: PlanInfo[];
  waves: Record<string, string[]>;
  incomplete: string[];
  has_checkpoints: boolean;
}

export interface RoadmapPhase {
  number: string;
  disk_status: string;
  roadmap_complete: boolean;
  phase_name: string;
}

export interface Overview {
  state: string | null;
  roadmap: { phases: RoadmapPhase[] } | null;
}

export interface PhaseData {
  roadmap: { phases: RoadmapPhase[] };
  phaseDetails: Record<string, PhasePlanIndex>;
}

export interface FileContent {
  path: string;
  content: string;
}

export interface SessionStatus {
  active: boolean;
  pid?: number;
  wsPort?: number;
  startedAt?: string;
}

export const api = {
  projects: {
    list: () => request<Project[]>('/projects'),
    add: (path: string) => request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
    remove: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  },
  overview: (projectId: string) => request<Overview>(`/projects/${projectId}/overview`),
  phases: {
    list: (projectId: string) => request<PhaseData>(`/projects/${projectId}/phases`),
    get: (projectId: string, phaseId: string) => request<PhasePlanIndex>(`/projects/${projectId}/phases/${phaseId}`),
  },
  files: {
    read: (projectId: string, path: string) => request<FileContent>(`/projects/${projectId}/files/${path}`),
    write: (projectId: string, path: string, content: string) => request<{ saved: boolean }>(`/projects/${projectId}/files/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  },
  session: {
    status: (projectId: string) => request<SessionStatus>(`/projects/${projectId}/session/status`),
    start: (projectId: string) => request<{ pid: number; wsPort: number }>(`/projects/${projectId}/session/start`, { method: 'POST' }),
    stop: (projectId: string) => request<void>(`/projects/${projectId}/session/stop`, { method: 'DELETE' }),
  },
};
