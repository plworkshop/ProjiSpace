import type {
  AccentColor,
  AssistantOperation,
  AssistantPlan,
  AssistantStatus,
  Appearance,
  PickerTheme,
  PlanningEntry,
  Project,
  Reference,
  Workspace,
} from "./types";
import { getLanguage } from "./i18n";
import type { ImageMark } from "./annotations";
import type { Language } from "./translations.mjs";
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...init?.headers, "Accept-Language": getLanguage() },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.error || "Не удалось сохранить изменения. Попробуйте ещё раз.",
    );
  return body;
}
const json = (method: string, body: unknown) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
export const api = {
  storageStatus: () => request<StorageStatus>("/api/storage"),
  chooseStorage: () => request<StorageStatus>("/api/storage", { method: "POST" }),
  cancelStorage: () => request<StorageStatus>("/api/storage", { method: "DELETE" }),
  assistantStatus: (signal?: AbortSignal) =>
    request<AssistantStatus>("/api/assistant", { signal }),
  assistantSetup: (action: "runtime" | "model", model?: string) =>
    request<AssistantStatus>("/api/assistant/setup", json("POST", { action, model })),
  assistantSetupCancel: () =>
    request<AssistantStatus>("/api/assistant/setup", { method: "DELETE" }),
  assistantModel: (model: string) =>
    request<AssistantStatus>("/api/assistant/model", json("PATCH", { model })),
  assistantPlan: (
    body: {
      message: string;
      history: { role: "user" | "assistant"; content: string }[];
      selected: string | null;
      date: string;
    },
    signal: AbortSignal,
  ) =>
    request<AssistantPlan>("/api/assistant/plan", {
      ...json("POST", body),
      signal,
    }),
  assistantApply: (id: string) =>
    request<{ operations: AssistantOperation[] }>(
      `/api/assistant/plans/${id}`,
      { method: "POST" },
    ),
  assistantDiscard: (id: string) =>
    request(`/api/assistant/plans/${id}`, { method: "DELETE" }),
  load: () => request<Workspace>("/api/projects"),
  reorderProjects: (ids: string[]) =>
    request("/api/projects/order", json("PATCH", { ids })),
  pickerTheme: (pickerTheme: PickerTheme) =>
    request("/api/preferences", json("PATCH", { pickerTheme })),
  accentColor: (accentColor: AccentColor) =>
    request("/api/preferences", json("PATCH", { accentColor })),
  appearance: (appearance: Appearance) =>
    request("/api/preferences", json("PATCH", { appearance })),
  language: (language: Language) =>
    request("/api/preferences", json("PATCH", { language })),
  panelCollapsed: (
    key: "projectsPanelCollapsed" | "planCollapsed",
    value: boolean,
  ) => request("/api/preferences", json("PATCH", { [key]: value })),
  panelWidth: (side: "projects" | "references", width: number) =>
    request(
      "/api/preferences",
      json("PATCH", {
        [side === "projects" ? "projectsPanelWidth" : "referencePanelWidth"]:
          width,
      }),
    ),
  create: (body: Partial<Project>) =>
    request<Project>("/api/projects", json("POST", body)),
  update: (id: string, body: Partial<Project>) =>
    request<Project>(`/api/projects/${id}`, json("PATCH", body)),
  remove: (id: string) => request(`/api/projects/${id}`, { method: "DELETE" }),
  createPlanning: (
    projectId: string,
    body: Omit<PlanningEntry, "id" | "projectId" | "completed"> & {
      completed?: boolean;
    },
  ) =>
    request<PlanningEntry>(
      `/api/projects/${projectId}/planning`,
      json("POST", body),
    ),
  updatePlanning: (
    id: string,
    body: Partial<Pick<PlanningEntry, "date" | "title" | "completed">>,
  ) => request<PlanningEntry>(`/api/planning/${id}`, json("PATCH", body)),
  removePlanning: (id: string) =>
    request(`/api/planning/${id}`, { method: "DELETE" }),
  link: (id: string, title: string, url: string) =>
    request<Reference>(
      `/api/projects/${id}/links`,
      json("POST", { title, url }),
    ),
  image: (id: string, file: File) =>
    request<Reference>(`/api/projects/${id}/images`, {
      method: "POST",
      headers: {
        "Content-Type": file.type,
        "x-file-name": encodeURIComponent(file.name),
      },
      body: file,
    }),
  removeRef: (id: string) =>
    request(`/api/references/${id}`, { method: "DELETE" }),
  annotations: (id: string, signal: AbortSignal) => request<ImageMark[]>(`/api/references/${id}/annotations`, { signal }),
  saveAnnotations: (id: string, annotations: ImageMark[]) => request(`/api/references/${id}/annotations`, json("PUT", { annotations })),
};
export interface StorageStatus {
  available: boolean;
  currentPath: string;
  pendingPath: string | null;
}
