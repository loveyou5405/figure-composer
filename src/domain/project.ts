import { createStableId } from "./id";
import { DEFAULT_LABEL_SETTINGS, type ProjectLabelSettings } from "./labels";
import { A4_PORTRAIT, getPageMargins, setPageMargins, type PageDefinition, type PageMargins } from "./page";
import { roundMm, snapMm, type Panel, type PanelGeometry } from "./panel";

export interface FigurePage {
  readonly id: string;
  readonly figureId: string;
  readonly name: string;
  readonly definition: PageDefinition;
  readonly panels: readonly Panel[];
}

export interface ProjectFigure {
  readonly id: string;
  readonly pages: readonly FigurePage[];
}

export interface FigureProject {
  readonly id: string;
  readonly title: string;
  readonly pages: readonly FigurePage[];
  readonly labelSettings: ProjectLabelSettings;
}

export function createA4Page(
  pageNumber: number,
  id = createStableId("page"),
  figureId = createStableId("figure"),
): FigurePage {
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    throw new Error("Page number must be a positive integer.");
  }
  return {
    id,
    figureId,
    name: `Page ${pageNumber}`,
    definition: A4_PORTRAIT,
    panels: [],
  };
}

export function createInitialProject(title = "Untitled figure"): FigureProject {
  const figureId = createStableId("figure");
  return {
    id: createStableId("project"),
    title,
    pages: [createA4Page(1, undefined, figureId)],
    labelSettings: DEFAULT_LABEL_SETTINGS,
  };
}

export function appendA4Page(project: FigureProject, id?: string): FigureProject {
  const figureId = project.pages.at(-1)?.figureId ?? createStableId("figure");
  return {
    ...project,
    pages: normalizePageNames([
      ...project.pages,
      createA4Page(project.pages.length + 1, id, figureId),
    ]),
  };
}

export function appendPageToFigure(
  project: FigureProject,
  figureId: string,
  id = createStableId("page"),
): FigureProject {
  let lastFigurePageIndex = -1;
  project.pages.forEach((page, index) => {
    if (page.figureId === figureId) lastFigurePageIndex = index;
  });
  if (lastFigurePageIndex < 0) throw new Error(`Unknown figure: ${figureId}`);
  const pages = [...project.pages];
  pages.splice(lastFigurePageIndex + 1, 0, createA4Page(project.pages.length + 1, id, figureId));
  return { ...project, pages: normalizePageNames(pages) };
}

export function appendNewFigure(
  project: FigureProject,
  pageId = createStableId("page"),
  figureId = createStableId("figure"),
): FigureProject {
  if (project.pages.some((page) => page.figureId === figureId)) {
    throw new Error("New figure must receive a unique ID.");
  }
  return {
    ...project,
    pages: normalizePageNames([
      ...project.pages,
      createA4Page(project.pages.length + 1, pageId, figureId),
    ]),
  };
}

export function getProjectFigures(project: Pick<FigureProject, "pages">): ProjectFigure[] {
  const figures: ProjectFigure[] = [];
  project.pages.forEach((page) => {
    const current = figures.at(-1);
    if (current?.id === page.figureId) {
      figures[figures.length - 1] = { ...current, pages: [...current.pages, page] };
    } else {
      figures.push({ id: page.figureId, pages: [page] });
    }
  });
  return figures;
}

export function normalizeProjectFigureIds(project: FigureProject): FigureProject {
  const firstKnownFigureId = project.pages
    .map((page) => (page as FigurePage & { figureId?: unknown }).figureId)
    .find((figureId): figureId is string => typeof figureId === "string" && Boolean(figureId.trim()));
  let currentFigureId = firstKnownFigureId ?? `${project.id || "project"}-figure-1`;
  const pages = project.pages.map((page) => {
    const candidate = (page as FigurePage & { figureId?: unknown }).figureId;
    if (typeof candidate === "string" && candidate.trim()) currentFigureId = candidate;
    return page.figureId === currentFigureId ? page : { ...page, figureId: currentFigureId };
  });
  return pages.every((page, index) => page === project.pages[index]) ? project : { ...project, pages };
}

export function deleteProjectPage(project: FigureProject, pageId: string): FigureProject {
  if (project.pages.length <= 1) throw new Error("A project must keep at least one page.");
  if (!project.pages.some((page) => page.id === pageId)) throw new Error(`Unknown page: ${pageId}`);
  return {
    ...project,
    pages: normalizePageNames(project.pages.filter((page) => page.id !== pageId)),
  };
}

export function duplicateProjectPage(
  project: FigureProject,
  pageId: string,
  pageIdFactory: () => string = () => createStableId("page"),
  panelIdFactory: () => string = () => createStableId("panel"),
): FigureProject {
  const sourceIndex = project.pages.findIndex((page) => page.id === pageId);
  if (sourceIndex < 0) throw new Error(`Unknown page: ${pageId}`);
  const source = project.pages[sourceIndex];
  const duplicateId = pageIdFactory();
  if (!duplicateId || project.pages.some((page) => page.id === duplicateId)) {
    throw new Error("Duplicate page must receive a new unique ID.");
  }
  const existingPanelIds = new Set(getAllProjectPanels(project).map((panel) => panel.id));
  const createdPanelIds = new Set<string>();
  const duplicate: FigurePage = {
    ...source,
    id: duplicateId,
    panels: source.panels.map((panel) => {
      const panelId = panelIdFactory();
      if (!panelId || existingPanelIds.has(panelId) || createdPanelIds.has(panelId)) {
        throw new Error("Duplicated panels must receive new unique IDs.");
      }
      createdPanelIds.add(panelId);
      return { ...panel, id: panelId, pageId: duplicateId };
    }),
  };
  const pages = [...project.pages];
  pages.splice(sourceIndex + 1, 0, duplicate);
  return { ...project, pages: normalizePageNames(pages) };
}

export function reorderProjectPage(
  project: FigureProject,
  pageId: string,
  targetIndex: number,
): FigureProject {
  const sourceIndex = project.pages.findIndex((page) => page.id === pageId);
  if (sourceIndex < 0) throw new Error(`Unknown page: ${pageId}`);
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= project.pages.length) {
    throw new Error("Target page index is outside the project.");
  }
  if (sourceIndex === targetIndex) return project;
  if (project.pages[targetIndex].figureId !== project.pages[sourceIndex].figureId) {
    throw new Error("Pages can only be reordered within the same figure.");
  }
  const pages = [...project.pages];
  const [page] = pages.splice(sourceIndex, 1);
  pages.splice(targetIndex, 0, page);
  return { ...project, pages: normalizePageNames(pages) };
}

export function movePanelsToPage(
  project: FigureProject,
  panelIds: ReadonlySet<string>,
  targetPageId: string,
): FigureProject {
  if (panelIds.size === 0) return project;
  const targetPage = project.pages.find((page) => page.id === targetPageId);
  if (!targetPage) throw new Error(`Unknown target page: ${targetPageId}`);
  const selected = project.pages.flatMap((page) => page.panels.filter((panel) => panelIds.has(panel.id)));
  if (selected.length !== panelIds.size) throw new Error("One or more selected panels do not exist.");
  const sourcePageIds = new Set(selected.map((panel) => panel.pageId));
  if (sourcePageIds.size !== 1) throw new Error("Cross-page movement requires panels from one source page.");
  if (sourcePageIds.has(targetPageId)) return project;

  const left = Math.min(...selected.map((panel) => panel.geometry.xMm));
  const top = Math.min(...selected.map((panel) => panel.geometry.yMm));
  const right = Math.max(...selected.map((panel) => panel.geometry.xMm + panel.geometry.widthMm));
  const bottom = Math.max(...selected.map((panel) => panel.geometry.yMm + panel.geometry.heightMm));
  const width = roundMm(right - left);
  const height = roundMm(bottom - top);
  const margins = getPageMargins(targetPage.definition);
  const safeWidth = targetPage.definition.widthMm - margins.leftMm - margins.rightMm;
  const safeHeight = targetPage.definition.heightMm - margins.topMm - margins.bottomMm;
  if (width > safeWidth || height > safeHeight) {
    throw new Error("The selected panel group is larger than the target page safe area.");
  }
  const desiredLeft = clamp(
    snapMm(left, targetPage.definition.gridMm),
    margins.leftMm,
    targetPage.definition.widthMm - margins.rightMm - width,
  );
  const desiredTop = margins.topMm;
  const deltaX = roundMm(desiredLeft - left);
  const deltaY = roundMm(desiredTop - top);
  const moved = selected.map((panel) => ({
    ...panel,
    pageId: targetPageId,
    geometry: {
      ...panel.geometry,
      xMm: roundMm(panel.geometry.xMm + deltaX),
      yMm: roundMm(panel.geometry.yMm + deltaY),
    },
  }));
  return {
    ...project,
    pages: project.pages.map((page) => {
      const retained = page.panels.filter((panel) => !panelIds.has(panel.id));
      return page.id === targetPageId ? { ...page, panels: [...retained, ...moved] } : { ...page, panels: retained };
    }),
  };
}

export function updateProjectPagePanels(
  project: FigureProject,
  pageId: string,
  update: (panels: readonly Panel[]) => readonly Panel[],
): FigureProject {
  let pageFound = false;
  const pages = project.pages.map((page) => {
    if (page.id !== pageId) return page;
    pageFound = true;
    const panels = update(page.panels);
    panels.forEach((panel) => {
      if (panel.pageId !== pageId) {
        throw new Error(`Panel ${panel.id} must reference its owning page ${pageId}.`);
      }
    });
    return { ...page, panels };
  });
  if (!pageFound) throw new Error(`Unknown page: ${pageId}`);
  return { ...project, pages };
}

export function updateProjectPageMargins(
  project: FigureProject,
  pageId: string,
  margins: PageMargins,
): FigureProject {
  let pageFound = false;
  const pages = project.pages.map((page) => {
    if (page.id !== pageId) return page;
    pageFound = true;
    return { ...page, definition: setPageMargins(page.definition, margins) };
  });
  if (!pageFound) throw new Error(`Unknown page: ${pageId}`);
  return { ...project, pages };
}

export function mapProjectPanels(
  project: FigureProject,
  update: (panels: readonly Panel[], page: FigurePage) => readonly Panel[],
): FigureProject {
  return {
    ...project,
    pages: project.pages.map((page) => {
      const panels = update(page.panels, page);
      panels.forEach((panel) => {
        if (panel.pageId !== page.id) {
          throw new Error(`Panel ${panel.id} must reference its owning page ${page.id}.`);
        }
      });
      return { ...page, panels };
    }),
  };
}

export function movePanelToPage(
  project: FigureProject,
  panelId: string,
  targetPageId: string,
  geometry: PanelGeometry,
): FigureProject {
  const sourcePage = project.pages.find((page) => page.panels.some((panel) => panel.id === panelId));
  const targetPage = project.pages.find((page) => page.id === targetPageId);
  if (!sourcePage) throw new Error(`Unknown panel: ${panelId}`);
  if (!targetPage) throw new Error(`Unknown target page: ${targetPageId}`);

  const panel = sourcePage.panels.find((candidate) => candidate.id === panelId)!;
  return {
    ...project,
    pages: project.pages.map((page) => {
      const withoutPanel = page.panels.filter((candidate) => candidate.id !== panelId);
      return page.id === targetPageId
        ? { ...page, panels: [...withoutPanel, { ...panel, pageId: targetPageId, geometry }] }
        : { ...page, panels: withoutPanel };
    }),
  };
}

export function getAllProjectPanels(project: FigureProject): readonly Panel[] {
  return project.pages.flatMap((page) => page.panels);
}

export function getProjectOwnershipErrors(project: FigureProject): string[] {
  const errors: string[] = [];
  const pageIds = new Set<string>();
  const panelIds = new Set<string>();
  const completedFigureIds = new Set<string>();
  let currentFigureId: string | null = null;

  if (project.pages.length === 0) errors.push("Project must contain at least one page.");
  project.pages.forEach((page) => {
    if (!page.id || pageIds.has(page.id)) errors.push(`Duplicate or empty page ID: ${page.id || "(empty)"}.`);
    pageIds.add(page.id);
    if (!page.figureId) errors.push(`Page ${page.id} must belong to a figure.`);
    if (page.figureId !== currentFigureId) {
      if (currentFigureId) completedFigureIds.add(currentFigureId);
      if (completedFigureIds.has(page.figureId)) errors.push(`Figure ${page.figureId} pages must stay contiguous.`);
      currentFigureId = page.figureId;
    }
    if (
      page.definition.widthMm !== A4_PORTRAIT.widthMm
      || page.definition.heightMm !== A4_PORTRAIT.heightMm
    ) errors.push(`Page ${page.id} must use A4 dimensions.`);
    try {
      setPageMargins(page.definition, getPageMargins(page.definition));
    } catch (error) {
      errors.push(`Page ${page.id} has invalid safe margins: ${error instanceof Error ? error.message : "invalid values"}`);
    }
    page.panels.forEach((panel) => {
      if (panelIds.has(panel.id)) errors.push(`Panel ${panel.id} appears on more than one page.`);
      panelIds.add(panel.id);
      if (panel.pageId !== page.id) {
        errors.push(`Panel ${panel.id} references ${panel.pageId} but is owned by ${page.id}.`);
      }
    });
  });
  return errors;
}

function normalizePageNames(pages: readonly FigurePage[]): FigurePage[] {
  return pages.map((page, index) => page.name === `Page ${index + 1}`
    ? page
    : { ...page, name: `Page ${index + 1}` });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return roundMm(Math.min(Math.max(value, minimum), maximum));
}
