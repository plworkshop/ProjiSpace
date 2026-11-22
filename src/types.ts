import type { Language } from "./translations.mjs";
export type Art =
  | "orbit"
  | "layers"
  | "bloom"
  | "arch"
  | "chip"
  | "circuit"
  | "server"
  | "network";
export type ProjectStatus = "planned" | "in_progress" | "paused" | "completed";
export interface Project {
  id: string;
  parentId: string | null;
  name: string;
  description: string;
  descriptionHtml: string | null;
  category: string;
  art: Art;
  status: ProjectStatus;
  pinned: boolean;
  coverId: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface Reference {
  id: string;
  projectId: string;
  kind: "image" | "link";
  title: string;
  url: string;
  fileName: string | null;
  mime: string | null;
  size: number | null;
  clip?: { text: string; capturedAt: string };
}
export type PlanningKind = "start" | "milestone" | "deadline" | "note";
export interface PlanningEntry {
  id: string;
  projectId: string;
  kind: PlanningKind;
  date: string;
  title: string;
  completed: boolean;
}
export type PickerTheme = "game" | "tech";
export type AccentColor = "blue";
export type Appearance = "dark" | "light";
export interface AssistantOperation {
  tool:
    | "create_project"
    | "create_subproject"
    | "update_project"
    | "add_plan_entry"
    | "add_link"
    | "open_project";
  projectId: string;
  projectName: string;
  before: Record<string, string | boolean | null> | null;
  changes: Record<string, string | boolean | null>;
}
export interface AssistantPlan {
  id: string | null;
  text: string;
  operations: AssistantOperation[];
}
export interface AssistantStatus {
  ready: boolean;
  model: string;
  error?: string;
  runtime?: { installed: boolean; running: boolean; canInstall: boolean };
  models?: { id: string; sizeBytes: number; installed: boolean; supported: boolean; recommended: boolean; reason?: "tools" | "remote" | "unavailable" }[];
  task?: {
    phase: "starting" | "downloading_runtime" | "verifying" | "installing" | "downloading_model" | "checking" | "cancelled" | "error" | "complete";
    model?: string;
    completed: number;
    total: number;
    error?: string;
    cancellable: boolean;
  } | null;
}
export interface Workspace {
  projects: Project[];
  references: Reference[];
  planningEntries: PlanningEntry[];
  storagePath: string;
  referencePanelWidth: number;
  projectsPanelWidth: number | null;
  projectsPanelCollapsed: boolean;
  planCollapsed: boolean;
  pickerTheme: PickerTheme;
  accentColor: AccentColor;
  appearance: Appearance;
  language: Language;
}
