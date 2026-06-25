import { brittenProject } from "./britten";
import { cutroomProject } from "./cutroom";
import { cropcheckProject } from "./cropcheck";
import type { Project } from "./types";

export type { Project } from "./types";
export {
  loadDynamicProjects,
  saveDynamicProjects,
  seedBuiltinsIntoRegistry,
  hasSeededOnce,
  markSeeded,
  createBlankProject,
  createProjectFromScan,
  parseImportedProject,
  exportProjectJson,
  downloadProjectJson,
  uniqueId,
} from "./dynamicStore";

/** The original built-in examples. Used as a seed source + a "Restore examples" fallback. */
export const BUILTIN_EXAMPLES: ReadonlyArray<Project> = [brittenProject, cutroomProject, cropcheckProject];

export const DEFAULT_PROJECT_ID = brittenProject.id;

export function findProject(id: string, projects: ReadonlyArray<Project>): Project | undefined {
  return projects.find(p => p.id === id);
}

export function getProject(id: string, projects: ReadonlyArray<Project>): Project {
  return findProject(id, projects) ?? projects[0] ?? brittenProject;
}
