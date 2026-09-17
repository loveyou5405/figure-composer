import { createStableId } from "./id";
import { getCollectiveBounds } from "./layout";
import type { PageDefinition } from "./page";
import { roundMm, type Panel, type PanelGeometry } from "./panel";
import {
  createA4Page,
  type FigurePage,
  type FigureProject,
} from "./project";

export type AutoLayoutMode = "balanced" | "compact" | "equal-rows";
export type AutoLayoutTarget = "selection" | "page" | "project";

export interface LayoutRegion {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface AutoLayoutSettings {
  readonly mode: AutoLayoutMode;
  readonly horizontalGapMm: number;
  readonly verticalGapMm: number;
  readonly allowMinorScaling: boolean;
  readonly maxCandidates: number;
}

export interface AutoLayoutScoreBreakdown {
  readonly unusedHorizontalSpace: number;
  readonly rowWidthImbalance: number;
  readonly rowHeightVariation: number;
  readonly rowCountVariation: number;
  readonly orphanRow: number;
  readonly usedHeight: number;
  readonly movement: number;
  readonly scaling: number;
}

export interface AutoLayoutRow {
  readonly panelIds: readonly string[];
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface AutoLayoutCandidate {
  readonly placements: ReadonlyMap<string, PanelGeometry>;
  readonly rows: readonly AutoLayoutRow[];
  readonly scaleFactor: number;
  readonly score: number;
  readonly scoreBreakdown: AutoLayoutScoreBreakdown;
  readonly key: string;
}

export interface AutoArrangeOptions extends Partial<AutoLayoutSettings> {
  readonly target: AutoLayoutTarget;
  readonly activePageId: string;
  readonly selectedPanelIds?: ReadonlySet<string>;
  readonly autoPaginate?: boolean;
  readonly pageIdFactory?: (pageNumber: number) => string;
}

export interface AutoLayoutTransaction {
  readonly kind: "auto-layout";
  readonly target: AutoLayoutTarget;
  readonly before: FigureProject;
  readonly after: FigureProject;
  readonly affectedPanelIds: readonly string[];
  readonly createdPageIds: readonly string[];
}

export interface AutoArrangeResult {
  readonly applied: boolean;
  readonly project: FigureProject;
  readonly affectedPanelIds: readonly string[];
  readonly createdPageIds: readonly string[];
  readonly candidates: readonly AutoLayoutCandidate[];
  readonly error?: string;
  readonly transaction?: AutoLayoutTransaction;
}

export const DEFAULT_AUTO_LAYOUT_SETTINGS: AutoLayoutSettings = Object.freeze({
  mode: "balanced",
  horizontalGapMm: 3,
  verticalGapMm: 3,
  allowMinorScaling: false,
  maxCandidates: 3,
});

const MAX_BEAM_STATES = 512;
const MIN_MINOR_SCALE = 0.95;
const SCALE_STEPS = [1, 0.99, 0.98, 0.97, 0.96, MIN_MINOR_SCALE] as const;

interface PartitionRow {
  readonly panelIndexes: readonly number[];
  readonly widthMm: number;
  readonly heightMm: number;
}

interface PartitionState {
  readonly rows: readonly PartitionRow[];
  readonly usedHeightMm: number;
}

interface ScoreWeights {
  readonly unusedHorizontalSpace: number;
  readonly rowWidthImbalance: number;
  readonly rowHeightVariation: number;
  readonly rowCountVariation: number;
  readonly orphanRow: number;
  readonly usedHeight: number;
  readonly movement: number;
  readonly scaling: number;
}

const SCORE_WEIGHTS: Record<AutoLayoutMode, ScoreWeights> = Object.freeze({
  balanced: Object.freeze({
    unusedHorizontalSpace: 1.2,
    rowWidthImbalance: 2,
    rowHeightVariation: 0.4,
    rowCountVariation: 0.5,
    orphanRow: 30,
    usedHeight: 0.2,
    movement: 0.1,
    scaling: 25,
  }),
  compact: Object.freeze({
    unusedHorizontalSpace: 0.4,
    rowWidthImbalance: 0.5,
    rowHeightVariation: 0.2,
    rowCountVariation: 0.2,
    orphanRow: 12,
    usedHeight: 2.5,
    movement: 0.05,
    scaling: 25,
  }),
  "equal-rows": Object.freeze({
    unusedHorizontalSpace: 0.8,
    rowWidthImbalance: 2.5,
    rowHeightVariation: 0.5,
    rowCountVariation: 6,
    orphanRow: 25,
    usedHeight: 0.3,
    movement: 0.05,
    scaling: 25,
  }),
});

export function getSafeLayoutRegion(page: PageDefinition): LayoutRegion {
  return {
    xMm: page.marginMm,
    yMm: page.marginMm,
    widthMm: roundMm(page.widthMm - page.marginMm * 2),
    heightMm: roundMm(page.heightMm - page.marginMm * 2),
  };
}

export function generateAutoLayoutCandidates(
  panels: readonly Panel[],
  region: LayoutRegion,
  settings: Partial<AutoLayoutSettings> = {},
): AutoLayoutCandidate[] {
  if (panels.length === 0) return [];
  const resolved = resolveSettings(settings);
  validateRegion(region);

  const unscaled = generateCandidatesAtScale(panels, region, resolved, 1);
  if (unscaled.length > 0 || !resolved.allowMinorScaling) {
    return unscaled.slice(0, resolved.maxCandidates);
  }

  const scaled: AutoLayoutCandidate[] = [];
  for (const factor of SCALE_STEPS.slice(1)) {
    scaled.push(...generateCandidatesAtScale(panels, region, resolved, factor));
  }
  return sortAndDedupeCandidates(scaled).slice(0, resolved.maxCandidates);
}

export function autoArrangeProject(
  project: FigureProject,
  options: AutoArrangeOptions,
): AutoArrangeResult {
  const settings = resolveSettings(options);
  const activePageIndex = project.pages.findIndex((page) => page.id === options.activePageId);
  if (activePageIndex < 0) return failed(project, "The active page no longer exists.");
  const activePage = project.pages[activePageIndex];

  if (options.target === "selection") {
    const selectedIds = options.selectedPanelIds ?? new Set<string>();
    const selected = activePage.panels.filter((panel) => selectedIds.has(panel.id));
    if (selected.length < 2) return failed(project, "Select at least two panels to arrange.");
    const safe = getSafeLayoutRegion(activePage.definition);
    const bounds = getCollectiveBounds(selected);
    const preferred = clampRegionToSafe({
      xMm: Math.max(bounds.left, safe.xMm),
      yMm: Math.max(bounds.top, safe.yMm),
      widthMm: bounds.width,
      heightMm: bounds.height,
    }, safe);
    let candidates = preferred.widthMm > 0 && preferred.heightMm > 0
      ? generateAutoLayoutCandidates(selected, preferred, settings)
      : [];
    if (candidates.length === 0) {
      const fallback = {
        xMm: preferred.xMm,
        yMm: preferred.yMm,
        widthMm: roundMm(safe.xMm + safe.widthMm - preferred.xMm),
        heightMm: roundMm(safe.yMm + safe.heightMm - preferred.yMm),
      };
      candidates = generateAutoLayoutCandidates(selected, fallback, settings);
    }
    if (candidates.length === 0) {
      return failed(project, "The selected panels do not fit inside the available safe area.");
    }
    const arranged = applyCandidate(activePage.panels, candidates[0], activePage.id);
    const nextProject = {
      ...project,
      pages: project.pages.map((page) => page.id === activePage.id ? { ...page, panels: arranged } : page),
    };
    return completed(project, nextProject, options.target, selected.map((panel) => panel.id), [], candidates);
  }

  const autoPaginate = options.autoPaginate !== false;
  if (options.target === "page") {
    const sourcePanels = activePage.panels;
    if (sourcePanels.length === 0) return failed(project, "There are no panels on this page to arrange.");
    if (!autoPaginate) {
      const candidates = generateAutoLayoutCandidates(
        sourcePanels,
        getSafeLayoutRegion(activePage.definition),
        settings,
      );
      if (candidates.length === 0) {
        return failed(project, "The page panels do not fit inside the safe area. Enable Auto Pagination to continue.");
      }
      const nextProject = {
        ...project,
        pages: project.pages.map((page) => page.id === activePage.id
          ? { ...page, panels: applyCandidate(page.panels, candidates[0], page.id) }
          : page),
      };
      return completed(project, nextProject, options.target, sourcePanels.map((panel) => panel.id), [], candidates);
    }
    return arrangePageWithOverflow(project, activePageIndex, sourcePanels, settings, options);
  }

  const allPanels = project.pages.flatMap((page) => page.panels);
  if (allPanels.length === 0) return failed(project, "There are no project panels to arrange.");
  if (!autoPaginate) return arrangeExistingProjectPages(project, settings, options);
  return arrangeWholeProject(project, allPanels, settings, options);
}

function arrangeExistingProjectPages(
  project: FigureProject,
  settings: AutoLayoutSettings,
  options: AutoArrangeOptions,
): AutoArrangeResult {
  const candidatesByPage = new Map<string, readonly AutoLayoutCandidate[]>();
  for (const page of project.pages) {
    if (page.panels.length === 0) continue;
    const candidates = generateAutoLayoutCandidates(page.panels, getSafeLayoutRegion(page.definition), settings);
    if (candidates.length === 0) {
      return failed(project, `${page.name} panels do not fit inside its safe area. Enable Auto Pagination to continue.`);
    }
    candidatesByPage.set(page.id, candidates);
  }
  const nextProject = {
    ...project,
    pages: project.pages.map((page) => {
      const candidates = candidatesByPage.get(page.id);
      return candidates ? { ...page, panels: applyCandidate(page.panels, candidates[0], page.id) } : page;
    }),
  };
  const affected = project.pages.flatMap((page) => page.panels.map((panel) => panel.id));
  return completed(
    project,
    nextProject,
    options.target,
    affected,
    [],
    candidatesByPage.values().next().value ?? [],
  );
}

function arrangePageWithOverflow(
  project: FigureProject,
  activePageIndex: number,
  panels: readonly Panel[],
  settings: AutoLayoutSettings,
  options: AutoArrangeOptions,
): AutoArrangeResult {
  const sourcePage = project.pages[activePageIndex];
  const groups = paginatePanels(panels, sourcePage.definition, settings);
  if (!groups) return failed(project, "At least one panel is too large for the A4 safe area.");
  const createdPages: FigurePage[] = [];
  for (let index = 1; index < groups.length; index += 1) {
    const pageNumber = project.pages.length + createdPages.length + 1;
    createdPages.push(createA4Page(pageNumber, options.pageIdFactory?.(pageNumber) ?? createStableId("page")));
  }
  const targetPages = [sourcePage, ...createdPages];
  const arrangedTargets = targetPages.map((page, index) => ({
    ...page,
    panels: applyCandidate(groups[index].panels, groups[index].candidate, page.id),
  }));
  const nextPages = project.pages.map((page, index) => index === activePageIndex ? arrangedTargets[0] : page);
  nextPages.push(...arrangedTargets.slice(1));
  const nextProject = { ...project, pages: nextPages };
  return completed(
    project,
    nextProject,
    options.target,
    panels.map((panel) => panel.id),
    createdPages.map((page) => page.id),
    groups[0].candidates,
  );
}

function arrangeWholeProject(
  project: FigureProject,
  panels: readonly Panel[],
  settings: AutoLayoutSettings,
  options: AutoArrangeOptions,
): AutoArrangeResult {
  const pageDefinition = project.pages[0].definition;
  const groups = paginatePanels(panels, pageDefinition, settings);
  if (!groups) return failed(project, "At least one panel is too large for the A4 safe area.");
  const pages = [...project.pages];
  const createdPageIds: string[] = [];
  while (pages.length < groups.length) {
    const pageNumber = pages.length + 1;
    const page = createA4Page(pageNumber, options.pageIdFactory?.(pageNumber) ?? createStableId("page"));
    pages.push(page);
    createdPageIds.push(page.id);
  }
  const nextPages = pages.map((page, index) => index < groups.length
    ? { ...page, panels: applyCandidate(groups[index].panels, groups[index].candidate, page.id) }
    : { ...page, panels: [] });
  const nextProject = { ...project, pages: nextPages };
  return completed(
    project,
    nextProject,
    options.target,
    panels.map((panel) => panel.id),
    createdPageIds,
    groups[0].candidates,
  );
}

interface PageGroup {
  readonly panels: readonly Panel[];
  readonly candidate: AutoLayoutCandidate;
  readonly candidates: readonly AutoLayoutCandidate[];
}

function paginatePanels(
  panels: readonly Panel[],
  page: PageDefinition,
  settings: AutoLayoutSettings,
): PageGroup[] | null {
  const groups: PageGroup[] = [];
  let cursor = 0;
  const region = getSafeLayoutRegion(page);
  while (cursor < panels.length) {
    let match: PageGroup | null = null;
    for (let end = panels.length; end > cursor; end -= 1) {
      const slice = panels.slice(cursor, end);
      const candidates = generateAutoLayoutCandidates(slice, region, settings);
      if (candidates.length === 0) continue;
      match = { panels: slice, candidate: candidates[0], candidates };
      cursor = end;
      break;
    }
    if (!match) return null;
    groups.push(match);
  }
  return groups;
}

function generateCandidatesAtScale(
  panels: readonly Panel[],
  region: LayoutRegion,
  settings: AutoLayoutSettings,
  scaleFactor: number,
): AutoLayoutCandidate[] {
  const sizes = panels.map((panel) => ({
    widthMm: roundMm(panel.geometry.widthMm * scaleFactor),
    heightMm: roundMm(panel.geometry.heightMm * scaleFactor),
  }));
  if (sizes.some((size) => size.widthMm > region.widthMm || size.heightMm > region.heightMm)) return [];

  let states: PartitionState[] = [{ rows: [], usedHeightMm: 0 }];
  for (let panelIndex = 0; panelIndex < panels.length; panelIndex += 1) {
    const size = sizes[panelIndex];
    const next: PartitionState[] = [];
    for (const state of states) {
      const last = state.rows.at(-1);
      if (last) {
        const widthMm = roundMm(last.widthMm + settings.horizontalGapMm + size.widthMm);
        const heightMm = Math.max(last.heightMm, size.heightMm);
        const usedHeightMm = roundMm(state.usedHeightMm - last.heightMm + heightMm);
        if (widthMm <= region.widthMm && usedHeightMm <= region.heightMm) {
          next.push({
            rows: [
              ...state.rows.slice(0, -1),
              { panelIndexes: [...last.panelIndexes, panelIndex], widthMm, heightMm },
            ],
            usedHeightMm,
          });
        }
      }

      const usedHeightMm = roundMm(
        state.usedHeightMm
          + (state.rows.length > 0 ? settings.verticalGapMm : 0)
          + size.heightMm,
      );
      if (size.widthMm <= region.widthMm && usedHeightMm <= region.heightMm) {
        next.push({
          rows: [...state.rows, { panelIndexes: [panelIndex], ...size }],
          usedHeightMm,
        });
      }
    }
    states = prunePartitionStates(next, region, settings.mode);
    if (states.length === 0) return [];
  }

  return sortAndDedupeCandidates(states.map((state) => buildCandidate(
    panels,
    state,
    region,
    settings,
    scaleFactor,
  )));
}

function prunePartitionStates(
  states: readonly PartitionState[],
  region: LayoutRegion,
  mode: AutoLayoutMode,
): PartitionState[] {
  const unique = new Map<string, PartitionState>();
  states.forEach((state) => {
    const key = state.rows.map((row) => row.panelIndexes.length).join("-");
    if (!unique.has(key)) unique.set(key, state);
  });
  return [...unique.values()]
    .sort((a, b) => partialPartitionScore(a, region, mode) - partialPartitionScore(b, region, mode)
      || partitionKey(a).localeCompare(partitionKey(b)))
    .slice(0, MAX_BEAM_STATES);
}

function partialPartitionScore(
  state: PartitionState,
  region: LayoutRegion,
  mode: AutoLayoutMode,
): number {
  const unused = state.rows.reduce((sum, row) => sum + region.widthMm - row.widthMm, 0);
  if (mode === "compact") return state.usedHeightMm * 10 + unused;
  if (mode === "equal-rows") return unused + variance(state.rows.map((row) => row.panelIndexes.length)) * 100;
  return unused + variance(state.rows.map((row) => row.widthMm)) * 2 + state.usedHeightMm;
}

function buildCandidate(
  panels: readonly Panel[],
  state: PartitionState,
  region: LayoutRegion,
  settings: AutoLayoutSettings,
  scaleFactor: number,
): AutoLayoutCandidate {
  const placements = new Map<string, PanelGeometry>();
  const rows: AutoLayoutRow[] = [];
  let yMm = region.yMm;
  state.rows.forEach((row) => {
    const xMm = settings.mode === "compact"
      ? region.xMm
      : roundMm(region.xMm + (region.widthMm - row.widthMm) / 2);
    let cursorX = xMm;
    row.panelIndexes.forEach((panelIndex) => {
      const panel = panels[panelIndex];
      const widthMm = roundMm(panel.geometry.widthMm * scaleFactor);
      const heightMm = roundMm(panel.geometry.heightMm * scaleFactor);
      placements.set(panel.id, { xMm: roundMm(cursorX), yMm: roundMm(yMm), widthMm, heightMm });
      cursorX += widthMm + settings.horizontalGapMm;
    });
    rows.push({
      panelIds: row.panelIndexes.map((index) => panels[index].id),
      xMm,
      yMm: roundMm(yMm),
      widthMm: row.widthMm,
      heightMm: row.heightMm,
    });
    yMm += row.heightMm + settings.verticalGapMm;
  });

  const scoreBreakdown = calculateScoreBreakdown(panels, state, placements, region, scaleFactor);
  const score = calculateWeightedScore(scoreBreakdown, SCORE_WEIGHTS[settings.mode]);
  return {
    placements,
    rows,
    scaleFactor,
    score: roundMm(score),
    scoreBreakdown,
    key: partitionKey(state),
  };
}

function calculateScoreBreakdown(
  panels: readonly Panel[],
  state: PartitionState,
  placements: ReadonlyMap<string, PanelGeometry>,
  region: LayoutRegion,
  scaleFactor: number,
): AutoLayoutScoreBreakdown {
  const widths = state.rows.map((row) => row.widthMm);
  const heights = state.rows.map((row) => row.heightMm);
  const counts = state.rows.map((row) => row.panelIndexes.length);
  const diagonal = Math.max(1, Math.hypot(region.widthMm, region.heightMm));
  const movement = panels.reduce((sum, panel) => {
    const placement = placements.get(panel.id)!;
    return sum + Math.hypot(placement.xMm - panel.geometry.xMm, placement.yMm - panel.geometry.yMm);
  }, 0) / panels.length / diagonal * 100;
  return {
    unusedHorizontalSpace: widths.reduce((sum, width) => sum + (region.widthMm - width) / region.widthMm * 100, 0),
    rowWidthImbalance: normalizedStandardDeviation(widths, region.widthMm),
    rowHeightVariation: normalizedStandardDeviation(heights, region.heightMm),
    rowCountVariation: normalizedStandardDeviation(counts, Math.max(1, panels.length)),
    orphanRow: panels.length > 2 && counts.at(-1) === 1 ? 1 : 0,
    usedHeight: state.usedHeightMm / region.heightMm * 100,
    movement,
    scaling: roundMm((1 - scaleFactor) * 100),
  };
}

function calculateWeightedScore(
  breakdown: AutoLayoutScoreBreakdown,
  weights: ScoreWeights,
): number {
  return Object.entries(weights).reduce((sum, [key, weight]) => (
    sum + breakdown[key as keyof AutoLayoutScoreBreakdown] * weight
  ), 0);
}

function applyCandidate(
  panels: readonly Panel[],
  candidate: AutoLayoutCandidate,
  pageId: string,
): Panel[] {
  return panels.map((panel) => {
    const geometry = candidate.placements.get(panel.id);
    if (!geometry) return panel;
    const nextScale = candidate.scaleFactor < 1
      ? roundMm((panel.layoutScaleFactor ?? 1) * candidate.scaleFactor)
      : panel.layoutScaleFactor;
    return {
      ...panel,
      pageId,
      geometry,
      layoutScaleFactor: nextScale,
    };
  });
}

function completed(
  before: FigureProject,
  after: FigureProject,
  target: AutoLayoutTarget,
  affectedPanelIds: readonly string[],
  createdPageIds: readonly string[],
  candidates: readonly AutoLayoutCandidate[],
): AutoArrangeResult {
  return {
    applied: true,
    project: after,
    affectedPanelIds,
    createdPageIds,
    candidates,
    transaction: {
      kind: "auto-layout",
      target,
      before,
      after,
      affectedPanelIds,
      createdPageIds,
    },
  };
}

function failed(project: FigureProject, error: string): AutoArrangeResult {
  return {
    applied: false,
    project,
    affectedPanelIds: [],
    createdPageIds: [],
    candidates: [],
    error,
  };
}

function resolveSettings(settings: Partial<AutoLayoutSettings>): AutoLayoutSettings {
  const resolved = { ...DEFAULT_AUTO_LAYOUT_SETTINGS, ...settings };
  if (![resolved.horizontalGapMm, resolved.verticalGapMm].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error("Auto-layout gaps must be non-negative finite millimeter values.");
  }
  if (!Number.isInteger(resolved.maxCandidates) || resolved.maxCandidates < 1) {
    throw new Error("Auto-layout must retain at least one candidate.");
  }
  return resolved;
}

function validateRegion(region: LayoutRegion): void {
  if (![region.xMm, region.yMm, region.widthMm, region.heightMm].every(Number.isFinite)
    || region.widthMm <= 0
    || region.heightMm <= 0) {
    throw new Error("Auto-layout region must use finite positive millimeter dimensions.");
  }
}

function clampRegionToSafe(region: LayoutRegion, safe: LayoutRegion): LayoutRegion {
  const xMm = Math.min(Math.max(region.xMm, safe.xMm), safe.xMm + safe.widthMm);
  const yMm = Math.min(Math.max(region.yMm, safe.yMm), safe.yMm + safe.heightMm);
  return {
    xMm: roundMm(xMm),
    yMm: roundMm(yMm),
    widthMm: roundMm(Math.max(0, Math.min(region.widthMm, safe.xMm + safe.widthMm - xMm))),
    heightMm: roundMm(Math.max(0, Math.min(region.heightMm, safe.yMm + safe.heightMm - yMm))),
  };
}

function sortAndDedupeCandidates(candidates: readonly AutoLayoutCandidate[]): AutoLayoutCandidate[] {
  const unique = new Map<string, AutoLayoutCandidate>();
  candidates.forEach((candidate) => {
    const key = `${candidate.scaleFactor}:${candidate.key}`;
    const current = unique.get(key);
    if (!current || candidate.score < current.score) unique.set(key, candidate);
  });
  return [...unique.values()].sort((a, b) => a.score - b.score
    || b.scaleFactor - a.scaleFactor
    || a.key.localeCompare(b.key));
}

function partitionKey(state: PartitionState): string {
  return state.rows.map((row) => row.panelIndexes.length).join("-");
}

function normalizedStandardDeviation(values: readonly number[], denominator: number): number {
  if (values.length < 2) return 0;
  return Math.sqrt(variance(values)) / Math.max(1, denominator) * 100;
}

function variance(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}
