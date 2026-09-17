import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { ImportedAsset } from "./domain/asset";
import {
  autoArrangeProject,
  type AutoLayoutMode,
  type AutoLayoutTarget,
} from "./domain/autoLayout";
import type { EditorDocument } from "./domain/editorDocument";
import {
  canRedo,
  canUndo,
  commitHistory,
  createHistory,
  finalizePreviewHistory,
  previewHistory,
  redoHistory,
  replaceHistory,
  undoHistory,
} from "./domain/history";
import { createStableId } from "./domain/id";
import {
  applyDefaultOffsetsToAutomaticLabels,
  autoLabelPanels,
  createDefaultPanelLabel,
  resetPanelLabelOffset,
  updatePanelLabelOffset,
  updatePanelLabelText,
  updatePanelLabelVisibility,
  type LabelSequenceMode,
  type ManualLabelPolicy,
  type ProjectLabelSettings,
} from "./domain/labels";
import {
  alignSelectedPanels,
  distributeSelectedPanels,
  equalizeSelectedPanelSize,
  getCollectiveBounds,
  moveSelectedPanels,
  setSelectedPanelGap,
  type AlignmentGuide,
  type AlignmentOperation,
  type AlignmentTarget,
  type DistributionAxis,
  type EqualSizeOperation,
} from "./domain/layout";
import {
  getDefaultImportAnchor,
  getInitialPanelSizeMm,
  placePanelGeometry,
  duplicateSelectedPanels,
  resizePanelGeometry,
  type Panel,
  type PanelGeometry,
  type PointMm,
} from "./domain/panel";
import {
  appendA4Page,
  deleteProjectPage,
  duplicateProjectPage,
  getAllProjectPanels,
  mapProjectPanels,
  movePanelsToPage,
  reorderProjectPage,
  updateProjectPagePanels,
  type FigurePage,
} from "./domain/project";
import { deserializeProjectFile, serializeProjectFile } from "./domain/projectFile";
import {
  refreshAssetSource,
  relinkAssetSource,
  replacePanelSource,
  type SourceSizingMode,
} from "./domain/source";
import {
  clearPanelSelection,
  EMPTY_SELECTION,
  normalizeMarqueeGeometry,
  selectAllPanels,
  selectOnlyPanel,
  selectPanelsIntersectingMarquee,
  togglePanelSelection,
  type PanelSelection,
} from "./domain/selection";
import {
  applyManualScaleToPanel,
  applyPresetToPanel,
  applyPresetUpdateToPanels,
  applyTypeToPanels,
  createCustomTypeAndPreset,
  derivePresetSizeMm,
  getPanelScalePercent,
  getPresetForType,
  inferPanelTypeIdFromFilename,
  isPanelFollowingPreset,
  markPanelManualResize,
  resetPanelToPreset,
  type PanelPreset,
  type PanelTypeDefinition,
  type PresetUpdateMode,
} from "./domain/preset";
import {
  calculateFitZoom,
  getViewportMetrics,
  MAX_ZOOM_PERCENT,
  MIN_ZOOM_PERCENT,
  screenPixelsToMm,
} from "./domain/viewport";
import {
  movePanelInsideSafeMargin,
  reviewDocument,
  summarizeReview,
  type ReviewFinding,
} from "./domain/validation";
import { loadImportedAsset, loadImportedAssetBatch } from "./services/assetImport";
import {
  isDesktopRuntime,
  pickDesktopAssets,
  pickDesktopProject,
  pickDesktopSource,
  readDesktopPath,
  saveDesktopBlob,
  saveDesktopText,
} from "./services/desktopIo";
import { createDemoProject } from "./services/demoProject";
import {
  createEditorDocumentFromSettings,
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
} from "./services/appSettings";
import {
  readProjectText,
  saveProjectDocument,
  type ProjectFileHandle,
} from "./services/projectFileIo";
import {
  AUTOSAVE_DELAY_MS,
  clearRecovery,
  readRecovery,
  scheduleRecovery,
} from "./services/recovery";
import {
  PptxExportError,
  downloadPptx,
  exportPptx,
  type PptxExportScope,
} from "./services/pptxExport";
import {
  checkAssetSources,
  createSnapshotSourceBinding,
  summarizeSourceChecks,
  type SourceBinding,
  type SourceCheckResult,
  type SourceCheckSummary,
} from "./services/sourceTracking";
import { APP_DISPLAY_VERSION, APP_NAME_WITH_VERSION } from "./version";

type SidebarTab = "Assets" | "Presets" | "Layout" | "Review";
type FitMode = "page" | "width" | null;

interface MoveInteraction {
  readonly kind: "move";
  readonly selectedPanelIds: ReadonlySet<string>;
  readonly startPanels: readonly Panel[];
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly pixelsPerMm: number;
  readonly historyStart: EditorDocument;
}

interface ResizeInteraction {
  readonly kind: "resize";
  readonly panelId: string;
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startGeometry: PanelGeometry;
  readonly pixelsPerMm: number;
  readonly aspectRatioLocked: boolean;
  readonly historyStart: EditorDocument;
}

interface MarqueeInteraction {
  readonly kind: "marquee";
  readonly pointerId: number;
  readonly startXmm: number;
  readonly startYmm: number;
  readonly initialSelection: PanelSelection;
}

type PointerInteraction = MoveInteraction | ResizeInteraction | MarqueeInteraction;

interface PresetDraft {
  readonly presetId: string;
  readonly typeId: string;
  readonly name: string;
  readonly scalePercent: number;
  readonly lockAspectRatio: boolean;
}

interface PendingPresetEdit {
  readonly typeId: string;
  readonly name: string;
  readonly preset: PanelPreset;
}

interface PendingRelabel {
  readonly target: "page" | "selection";
  readonly policy: ManualLabelPolicy;
}

type SourceActionKind = "replace" | "refresh" | "relink";

interface PendingSourceAction {
  readonly kind: SourceActionKind;
  readonly panelId: string;
  readonly assetId: string;
}

interface PendingSourceChange {
  readonly action: PendingSourceAction;
  readonly file: File;
  readonly asset: ImportedAsset;
  readonly sizingMode: SourceSizingMode;
}

export function App() {
  const [initialAppSettings] = useState(() => loadAppSettings(localStorage));
  const [zoom, setZoom] = useState(initialAppSettings.preferences.zoomPercent);
  const [fitMode, setFitMode] = useState<FitMode>("page");
  const [activeTab, setActiveTab] = useState<SidebarTab>("Assets");
  const [showGrid, setShowGrid] = useState(initialAppSettings.preferences.showGrid);
  const [showMargins, setShowMargins] = useState(initialAppSettings.preferences.showMargins);
  const [isDragOver, setIsDragOver] = useState(false);
  const [history, setHistory] = useState(() => createHistory(createEditorDocumentFromSettings(initialAppSettings)));
  const document = history.present;
  const { project, assets, types, presets, layoutSettings } = document;
  const [savedDocument, setSavedDocument] = useState<EditorDocument | null>(history.present);
  const [activePageId, setActivePageId] = useState(() => project.pages[0].id);
  const [selection, setSelection] = useState<PanelSelection>(EMPTY_SELECTION);
  const [alignmentTarget, setAlignmentTarget] = useState<AlignmentTarget>("selection");
  const [horizontalGapMm, setHorizontalGapMm] = useState(2);
  const [verticalGapMm, setVerticalGapMm] = useState(2);
  const [autoLayoutStatus, setAutoLayoutStatus] = useState<string | null>(null);
  const [alignmentGuides, setAlignmentGuides] = useState<readonly AlignmentGuide[]>([]);
  const [marqueeGeometry, setMarqueeGeometry] = useState<PanelGeometry | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [presetDraft, setPresetDraft] = useState<PresetDraft | null>(null);
  const [pendingPresetEdit, setPendingPresetEdit] = useState<PendingPresetEdit | null>(null);
  const [presetError, setPresetError] = useState<string | null>(null);
  const [pendingRelabel, setPendingRelabel] = useState<PendingRelabel | null>(null);
  const [saveStatus, setSaveStatus] = useState("Saved");
  const [projectFileError, setProjectFileError] = useState<string | null>(null);
  const [pendingRecovery, setPendingRecovery] = useState<EditorDocument | null>(null);
  const [pendingPageDeleteId, setPendingPageDeleteId] = useState<string | null>(null);
  const [pageActionError, setPageActionError] = useState<string | null>(null);
  const [pendingSourceAction, setPendingSourceAction] = useState<PendingSourceAction | null>(null);
  const [pendingSourceChange, setPendingSourceChange] = useState<PendingSourceChange | null>(null);
  const [sourceActionError, setSourceActionError] = useState<string | null>(null);
  const [sourceCheckResults, setSourceCheckResults] = useState<readonly SourceCheckResult[]>([]);
  const [isCheckingSources, setIsCheckingSources] = useState(false);
  const [pendingPptxExport, setPendingPptxExport] = useState(false);
  const [pptxExportScope, setPptxExportScope] = useState<PptxExportScope>("all");
  const [isExportingPptx, setIsExportingPptx] = useState(false);
  const [pptxExportError, setPptxExportError] = useState<string | null>(null);
  const [pptxExportStatus, setPptxExportStatus] = useState<string | null>(null);
  const [pendingAppClose, setPendingAppClose] = useState(false);
  const [isClosingApp, setIsClosingApp] = useState(false);
  const [saveHandle, setSaveHandle] = useState<ProjectFileHandle | null>(null);
  const [nativeProjectPath, setNativeProjectPath] = useState<string | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceActionInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const fitModeRef = useRef<FitMode>("page");
  const interactionRef = useRef<PointerInteraction | null>(null);
  const objectUrlsRef = useRef(new Set<string>());
  const sourceBindingsRef = useRef(new Map<string, SourceBinding>());
  const placementIndexRef = useRef(new Map<string, number>());
  const isDirtyRef = useRef(false);
  const isExportingRef = useRef(false);

  const commitDocument = useCallback((label: string, update: (current: EditorDocument) => EditorDocument) => {
    setHistory((current) => commitHistory(current, update(current.present), label));
  }, []);
  const previewDocument = useCallback((update: (current: EditorDocument) => EditorDocument) => {
    setHistory((current) => previewHistory(current, update(current.present)));
  }, []);
  const updateActivePagePanels = useCallback((
    update: (current: readonly Panel[]) => readonly Panel[],
    label = "Edit panels",
  ) => {
    commitDocument(label, (current) => ({
      ...current,
      project: updateProjectPagePanels(current.project, activePageId, update),
    }));
  }, [activePageId, commitDocument]);

  const activePageIndex = Math.max(0, project.pages.findIndex((page) => page.id === activePageId));
  const activePage = project.pages[activePageIndex];
  const pageDefinition = activePage.definition;
  const panels = activePage.panels;
  const allPanels = useMemo(() => getAllProjectPanels(project), [project]);
  const metrics = useMemo(() => getViewportMetrics(pageDefinition, zoom), [pageDefinition, zoom]);
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const typesById = useMemo(() => new Map(types.map((type) => [type.id, type])), [types]);
  const presetsById = useMemo(() => new Map(presets.map((preset) => [preset.id, preset])), [presets]);
  const sourceChecksByAssetId = useMemo(
    () => new Map(sourceCheckResults.map((result) => [result.assetId, result])),
    [sourceCheckResults],
  );
  const sourceCheckSummary = useMemo(() => summarizeSourceChecks(sourceCheckResults), [sourceCheckResults]);
  const reviewFindings = useMemo(() => reviewDocument(document, sourceCheckResults), [document, sourceCheckResults]);
  const reviewSummary = useMemo(() => summarizeReview(reviewFindings), [reviewFindings]);
  const selectedPanelIds = useMemo(() => new Set(selection.selectedPanelIds), [selection.selectedPanelIds]);
  const selectedPanels = selection.selectedPanelIds
    .map((id) => panels.find((panel) => panel.id === id))
    .filter((panel): panel is Panel => Boolean(panel));
  const selectedPanel = selectedPanels.length === 1 ? selectedPanels[0] : null;
  const anchorPanel = selection.anchorPanelId
    ? panels.find((panel) => panel.id === selection.anchorPanelId) ?? null
    : null;
  const anchorAsset = anchorPanel ? assetsById.get(anchorPanel.assetId) ?? null : null;
  const selectedBounds = selectedPanels.length > 1 ? getCollectiveBounds(selectedPanels) : null;
  const selectedAsset = selectedPanel ? assetsById.get(selectedPanel.assetId) ?? null : null;
  const selectedSourceCheck = selectedAsset ? sourceChecksByAssetId.get(selectedAsset.id) ?? null : null;
  const selectedType = selectedPanel ? typesById.get(selectedPanel.typeId) ?? null : null;
  const selectedPreset = selectedPanel ? presetsById.get(selectedPanel.presetId) ?? null : null;
  const selectedFollowsPreset = selectedPanel && selectedPreset
    ? isPanelFollowingPreset(selectedPanel, selectedPreset)
    : false;
  const isDirty = savedDocument !== document;
  const appSettings = useMemo<AppSettings>(() => ({
    schemaVersion: "1",
    preferences: { showGrid, showMargins, zoomPercent: zoom },
    panelTypes: types,
    panelPresets: presets,
    manuscriptStyleProfiles: [project.labelSettings],
    recentSettings: {
      layout: layoutSettings,
      label: project.labelSettings,
    },
  }), [layoutSettings, presets, project.labelSettings, showGrid, showMargins, types, zoom]);
  const autoLayoutMode = layoutSettings.mode;
  const autoLayoutGapMm = layoutSettings.gapMm;
  const autoPagination = layoutSettings.autoPagination;
  const allowMinorScaling = layoutSettings.allowMinorScaling;

  useEffect(() => {
    window.document.title = APP_NAME_WITH_VERSION;
  }, []);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    isExportingRef.current = isExportingPptx;
  }, [isExportingPptx]);

  useEffect(() => {
    try {
      saveAppSettings(localStorage, appSettings);
    } catch (error) {
      setProjectFileError(error instanceof Error ? `Settings could not be saved: ${error.message}` : "Settings could not be saved.");
    }
  }, [appSettings]);

  useEffect(() => {
    setSelection(clearPanelSelection());
    setAlignmentGuides([]);
    setMarqueeGeometry(null);
  }, [activePageId]);

  useEffect(() => {
    if (!project.pages.some((page) => page.id === activePageId)) {
      setActivePageId(project.pages[0].id);
    }
  }, [activePageId, project.pages]);

  useEffect(() => {
    try {
      setPendingRecovery(readRecovery(localStorage, assets));
    } catch (error) {
      setProjectFileError(error instanceof Error ? `Recovery data could not be read: ${error.message}` : "Recovery data could not be read.");
      clearRecovery(localStorage);
    }
    // Recovery is intentionally checked once on application startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isDirty) {
      setSaveStatus("Saved");
      return;
    }
    setSaveStatus("Saving recovery…");
    return scheduleRecovery(
      localStorage,
      document,
      () => setSaveStatus("Unsaved changes"),
      (error) => {
        setSaveStatus("Recovery unavailable");
        setProjectFileError(error instanceof Error ? error.message : "Recovery storage is unavailable.");
      },
      AUTOSAVE_DELAY_MS,
    );
  }, [document, isDirty]);

  const resetTransientEditorState = useCallback((next: EditorDocument) => {
    setActivePageId(next.project.pages[0].id);
    setSelection(clearPanelSelection());
    setAlignmentGuides([]);
    setMarqueeGeometry(null);
    setAutoLayoutStatus(null);
    setPresetDraft(null);
    setPendingPresetEdit(null);
    setPendingRelabel(null);
    setPendingSourceAction(null);
    setPendingSourceChange(null);
    setSourceActionError(null);
    setSourceCheckResults([]);
  }, []);

  const performUndo = useCallback(() => {
    setHistory((current) => undoHistory(current));
    setSelection(clearPanelSelection());
    setAlignmentGuides([]);
  }, []);

  const performRedo = useCallback(() => {
    setHistory((current) => redoHistory(current));
    setSelection(clearPanelSelection());
    setAlignmentGuides([]);
  }, []);

  const saveProject = useCallback(async (saveAs = false) => {
    setProjectFileError(null);
    try {
      if (isDesktopRuntime()) {
        const result = await saveDesktopText(
          serializeProjectFile(document),
          `${safeFileStem(document.project.title)}.figproj`,
          nativeProjectPath,
          saveAs,
        );
        if (result.cancelled) return false;
        setNativeProjectPath(result.path);
        setSavedDocument(document);
        clearRecovery(localStorage);
        setSaveStatus("Saved");
        return true;
      }
      const result = await saveProjectDocument(document, saveHandle, saveAs);
      if (result.cancelled) return false;
      setSaveHandle(result.handle);
      setSavedDocument(document);
      clearRecovery(localStorage);
      setSaveStatus(result.usedDownloadFallback ? "Saved as download" : "Saved");
      return true;
    } catch (error) {
      setProjectFileError(error instanceof Error ? error.message : "The project could not be saved.");
      setSaveStatus("Save failed");
      return false;
    }
  }, [document, nativeProjectPath, saveHandle]);

  const flushAppSettings = useCallback(() => {
    saveAppSettings(localStorage, appSettings);
  }, [appSettings]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    let unlisten: (() => void) | undefined;
    let disposed = false;
    if (isDesktopRuntime()) {
      void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
        const stopListening = await getCurrentWindow().onCloseRequested((event) => {
          if (!isDirtyRef.current && !isExportingRef.current) {
            flushAppSettings();
            return;
          }
          event.preventDefault();
          setPendingAppClose(true);
        });
        if (disposed) stopListening();
        else unlisten = stopListening;
      }).catch((error) => {
        setProjectFileError(error instanceof Error ? `Shutdown protection could not start: ${error.message}` : "Shutdown protection could not start.");
      });
    }

    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [flushAppSettings]);

  const completeAppClose = useCallback(async (choice: "save" | "discard" | "cancel") => {
    if (choice === "cancel") {
      setPendingAppClose(false);
      return;
    }
    if (isExportingRef.current) return;
    setIsClosingApp(true);
    try {
      if (choice === "save" && isDirtyRef.current) {
        const saved = await saveProject(false);
        if (!saved) return;
      } else if (choice === "discard") {
        clearRecovery(localStorage);
      }
      flushAppSettings();
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().destroy();
    } catch (error) {
      setProjectFileError(error instanceof Error ? `Figure Composer could not close safely: ${error.message}` : "Figure Composer could not close safely.");
    } finally {
      setIsClosingApp(false);
    }
  }, [flushAppSettings, saveProject]);

  const openProjectFile = useCallback(async (file: File, nativePath: string | null = null) => {
    setProjectFileError(null);
    try {
      let loaded = deserializeProjectFile(await readProjectText(file), assets);
      if (isDesktopRuntime()) {
        const restoredAssets = await Promise.all(loaded.assets.map(async (asset) => {
          if (!asset.sourceReference || asset.sourceReference.startsWith("bundled-demo://")) return asset;
          try {
            const picked = await readDesktopPath(asset.sourceReference, asset.mimeType);
            const restored = await loadImportedAsset(picked.file);
            objectUrlsRef.current.add(restored.previewUrl);
            sourceBindingsRef.current.set(asset.id, createSnapshotSourceBinding(picked.file));
            return { ...restored, id: asset.id, sourceReference: asset.sourceReference, missing: false };
          } catch {
            return asset;
          }
        }));
        loaded = { ...loaded, assets: restoredAssets };
      }
      setHistory(replaceHistory(loaded));
      setSavedDocument(loaded);
      setSaveHandle(null);
      setNativeProjectPath(nativePath);
      clearRecovery(localStorage);
      resetTransientEditorState(loaded);
      setSaveStatus("Saved");
    } catch (error) {
      setProjectFileError(error instanceof Error ? error.message : "The project could not be opened.");
    }
  }, [assets, resetTransientEditorState]);

  const requestOpenProject = useCallback(async () => {
    if (!isDesktopRuntime()) {
      projectInputRef.current?.click();
      return;
    }
    try {
      const picked = await pickDesktopProject();
      if (picked) await openProjectFile(picked.file, picked.path);
    } catch (error) {
      setProjectFileError(error instanceof Error ? error.message : "The project could not be opened.");
    }
  }, [openProjectFile]);

  const handleProjectFileInput = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void openProjectFile(file);
    event.target.value = "";
  }, [openProjectFile]);

  const applyFit = useCallback((mode: Exclude<FitMode, null>) => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    setZoom(calculateFitZoom(
      pageDefinition,
      workspace.clientWidth,
      workspace.clientHeight,
      mode,
    ));
  }, [pageDefinition]);

  const fit = useCallback((mode: Exclude<FitMode, null>) => {
    fitModeRef.current = mode;
    setFitMode(mode);
    applyFit(mode);
  }, [applyFit]);

  const setManualZoom = useCallback((value: number | ((current: number) => number)) => {
    fitModeRef.current = null;
    setFitMode(null);
    setZoom(value);
  }, []);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const observer = new ResizeObserver(() => {
      const currentMode = fitModeRef.current;
      if (currentMode) applyFit(currentMode);
    });
    observer.observe(workspace);
    applyFit("page");
    return () => observer.disconnect();
  }, [applyFit]);

  useEffect(() => () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
  }, []);

  const importFiles = useCallback(async (
    fileList: FileList | File[],
    dropPoint?: PointMm,
    sourceReferences: ReadonlyMap<File, string> = new Map(),
  ) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setActiveTab("Assets");
    setImportErrors([]);
    const placementStart = placementIndexRef.current.get(activePageId) ?? 0;
    placementIndexRef.current.set(activePageId, placementStart + files.length);
    const results = await loadImportedAssetBatch(files);
    const nextAssets: ImportedAsset[] = [];
    const nextPanels: Panel[] = [];
    const nextErrors: string[] = [];

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        nextErrors.push(`${result.file.name}: ${result.message}`);
        return;
      }

      const sourceReference = sourceReferences.get(result.file);
      const asset = sourceReference ? { ...result.asset, sourceReference } : result.asset;
      const baseSizeMm = getInitialPanelSizeMm(asset.intrinsicWidthPx, asset.intrinsicHeightPx);
      const inferredTypeId = inferPanelTypeIdFromFilename(asset.sourceName);
      const { type, preset } = getPresetForType(types, presets, inferredTypeId);
      const displaySizeMm = derivePresetSizeMm(baseSizeMm, preset);
      const anchor = dropPoint ?? getDefaultImportAnchor(pageDefinition, placementStart + index);
      const geometry = placePanelGeometry(displaySizeMm, pageDefinition, anchor, dropPoint ? index : 0);
      nextAssets.push(asset);
      nextPanels.push({
        id: createStableId("panel"),
        pageId: activePageId,
        assetId: asset.id,
        typeId: type.id,
        presetId: preset.id,
        baseSizeMm,
        geometry,
        aspectRatioLocked: preset.lockAspectRatio,
        manualScaleOverride: false,
        label: createDefaultPanelLabel(project.labelSettings),
      });
      objectUrlsRef.current.add(asset.previewUrl);
      sourceBindingsRef.current.set(asset.id, createSnapshotSourceBinding(result.file));
    });

    if (nextAssets.length > 0) {
      commitDocument("Import files", (current) => ({
        ...current,
        assets: [...current.assets, ...nextAssets],
        project: updateProjectPagePanels(
          current.project,
          activePageId,
          (currentPanels) => [...currentPanels, ...nextPanels],
        ),
      }));
      const lastPanelId = nextPanels.at(-1)?.id;
      setSelection(lastPanelId ? selectOnlyPanel(lastPanelId) : clearPanelSelection());
      setSourceCheckResults((current) => current.filter((result) => !nextAssets.some((asset) => asset.id === result.assetId)));
    }
    setImportErrors(nextErrors);
  }, [activePageId, commitDocument, pageDefinition, presets, project.labelSettings, types]);

  const requestImportFiles = useCallback(async () => {
    if (!isDesktopRuntime()) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const picked = await pickDesktopAssets(true);
      await importFiles(picked.map((item) => item.file), undefined, new Map(picked.map((item) => [item.file, item.path])));
    } catch (error) {
      setImportErrors([error instanceof Error ? error.message : "The selected files could not be imported."]);
    }
  }, [importFiles]);

  const handleFileInput = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) void importFiles(event.target.files);
    event.target.value = "";
  }, [importFiles]);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const rect = event.currentTarget.getBoundingClientRect();
    void importFiles(event.dataTransfer.files, {
      xMm: screenPixelsToMm(event.clientX - rect.left, metrics.pixelsPerMm),
      yMm: screenPixelsToMm(event.clientY - rect.top, metrics.pixelsPerMm),
    });
  }, [importFiles, metrics.pixelsPerMm]);

  const prepareSourceFile = useCallback(async (action: PendingSourceAction, file: File, sourceReference?: string) => {
    setSourceActionError(null);
    try {
      const loadedAsset = await loadImportedAsset(file);
      const asset = sourceReference ? { ...loadedAsset, sourceReference } : loadedAsset;
      if (action.kind === "relink") {
        const nextDocument = relinkAssetSource(document, action.assetId, asset);
        commitDocument("Relink source", () => nextDocument);
        objectUrlsRef.current.add(asset.previewUrl);
        sourceBindingsRef.current.set(action.assetId, createSnapshotSourceBinding(file));
        setSourceCheckResults((current) => current.filter((result) => result.assetId !== action.assetId));
        return;
      }
      setPendingSourceChange({ action, file, asset, sizingMode: "preserve-width" });
    } catch (error) {
      setSourceActionError(error instanceof Error ? error.message : "The source file could not be loaded.");
    }
  }, [commitDocument, document]);

  const requestSourceFile = useCallback(async (action: PendingSourceAction) => {
    setSourceActionError(null);
    setPendingSourceAction(action);
    if (isDesktopRuntime()) {
      try {
        const picked = await pickDesktopSource();
        if (picked) await prepareSourceFile(action, picked.file, picked.path);
      } catch (error) {
        setSourceActionError(error instanceof Error ? error.message : "The source file could not be opened.");
      } finally {
        setPendingSourceAction(null);
      }
      return;
    }
    const input = sourceActionInputRef.current;
    if (input) {
      input.value = "";
      input.click();
    }
  }, [prepareSourceFile]);

  const handleSourceFileInput = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const action = pendingSourceAction;
    const file = event.target.files?.[0];
    event.target.value = "";
    setPendingSourceAction(null);
    if (action && file) void prepareSourceFile(action, file);
  }, [pendingSourceAction, prepareSourceFile]);

  const cancelPendingSourceChange = useCallback(() => {
    if (pendingSourceChange?.asset.previewUrl) URL.revokeObjectURL(pendingSourceChange.asset.previewUrl);
    setPendingSourceChange(null);
  }, [pendingSourceChange]);

  const applyPendingSourceChange = useCallback(() => {
    if (!pendingSourceChange) return;
    try {
      const { action, asset, file, sizingMode } = pendingSourceChange;
      const nextDocument = action.kind === "replace"
        ? replacePanelSource(document, action.panelId, asset, sizingMode)
        : refreshAssetSource(document, action.assetId, asset, sizingMode);
      commitDocument(action.kind === "replace" ? "Replace source" : "Refresh source", () => nextDocument);
      objectUrlsRef.current.add(asset.previewUrl);
      const boundAssetId = action.kind === "replace" ? asset.id : action.assetId;
      sourceBindingsRef.current.set(boundAssetId, createSnapshotSourceBinding(file));
      setSourceCheckResults((current) => current.filter((result) => result.assetId !== action.assetId));
      setPendingSourceChange(null);
      setSourceActionError(null);
    } catch (error) {
      setSourceActionError(error instanceof Error ? error.message : "The source could not be updated.");
    }
  }, [commitDocument, document, pendingSourceChange]);

  const checkAllSources = useCallback(async () => {
    setIsCheckingSources(true);
    setSourceActionError(null);
    try {
      setSourceCheckResults(await checkAssetSources(assets, sourceBindingsRef.current));
    } catch (error) {
      setSourceActionError(error instanceof Error ? error.message : "Sources could not be checked.");
    } finally {
      setIsCheckingSources(false);
    }
  }, [assets]);

  const refreshChangedSources = useCallback(async () => {
    const changed = sourceCheckResults.filter((result) => result.status === "changed" && result.file);
    if (changed.length === 0) return;
    setSourceActionError(null);
    const outcomes = await loadImportedAssetBatch(changed.map((result) => result.file!));
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    if (rejected.length > 0) {
      outcomes.forEach((outcome) => {
        if (outcome.status === "accepted") URL.revokeObjectURL(outcome.asset.previewUrl);
      });
      setSourceActionError(rejected.map((outcome) => outcome.status === "rejected" ? `${outcome.file.name}: ${outcome.message}` : "").join(" "));
      return;
    }
    let nextDocument = document;
    outcomes.forEach((outcome, index) => {
      if (outcome.status !== "accepted") return;
      nextDocument = refreshAssetSource(nextDocument, changed[index].assetId, outcome.asset, "preserve-width");
      objectUrlsRef.current.add(outcome.asset.previewUrl);
    });
    commitDocument("Refresh changed sources", () => nextDocument);
    const refreshedIds = new Set(changed.map((result) => result.assetId));
    setSourceCheckResults((current) => current.map((result) => refreshedIds.has(result.assetId)
      ? { ...result, status: "unchanged" }
      : result));
  }, [commitDocument, document, sourceCheckResults]);

  const refreshSelectedSource = useCallback((panel: Panel, asset: ImportedAsset) => {
    const detected = sourceChecksByAssetId.get(asset.id);
    const action: PendingSourceAction = { kind: "refresh", panelId: panel.id, assetId: asset.id };
    if (detected?.file) void prepareSourceFile(action, detected.file);
    else requestSourceFile(action);
  }, [prepareSourceFile, requestSourceFile, sourceChecksByAssetId]);

  const deletePanels = useCallback((panelIds: ReadonlySet<string>) => {
    const deleting = panels.filter((panel) => panelIds.has(panel.id));
    if (deleting.length === 0) return;
    const deletedAssetIds = new Set(deleting.map((panel) => panel.assetId));
    const retainedAssetIds = new Set(
      allPanels.filter((panel) => !panelIds.has(panel.id)).map((panel) => panel.assetId),
    );
    const unusedAssetIds = [...deletedAssetIds].filter((assetId) => !retainedAssetIds.has(assetId));
    const unused = new Set(unusedAssetIds);
    commitDocument("Delete panels", (current) => ({
      ...current,
      assets: current.assets.filter((asset) => !unused.has(asset.id)),
      project: updateProjectPagePanels(
        current.project,
        activePageId,
        (currentPanels) => currentPanels.filter((panel) => !panelIds.has(panel.id)),
      ),
    }));
    // Object URLs remain alive until unmount so Undo can restore deleted sources.
    setSelection(clearPanelSelection());
  }, [activePageId, allPanels, commitDocument, panels]);

  const duplicateSelection = useCallback(() => {
    if (selectedPanels.length === 0) return;
    const duplicateIds = selectedPanels.map(() => createStableId("panel"));
    let idIndex = 0;
    updateActivePagePanels((current) => duplicateSelectedPanels(
      current,
      selectedPanelIds,
      pageDefinition,
      () => duplicateIds[idIndex++],
    ).panels, "Duplicate panels");
    setSelection({ selectedPanelIds: duplicateIds, anchorPanelId: duplicateIds.at(-1) ?? null });
  }, [pageDefinition, selectedPanelIds, selectedPanels, updateActivePagePanels]);

  const startNewProject = useCallback(() => {
    if (isDirty && !window.confirm("Create a new project and discard unsaved changes?")) return;
    const next = createEditorDocumentFromSettings(appSettings);
    setHistory(replaceHistory(next));
    setSavedDocument(next);
    setSaveHandle(null);
    setNativeProjectPath(null);
    clearRecovery(localStorage);
    resetTransientEditorState(next);
    setSaveStatus("Saved");
    setProjectFileError(null);
  }, [appSettings, isDirty, resetTransientEditorState]);

  const loadDemoProject = useCallback(() => {
    if (isDirty && !window.confirm("Load the bundled demo and discard unsaved changes?")) return;
    const next = createDemoProject();
    setHistory(replaceHistory(next));
    setSavedDocument(null);
    setSaveHandle(null);
    setNativeProjectPath(null);
    resetTransientEditorState(next);
    setSaveStatus("Unsaved changes");
  }, [isDirty, resetTransientEditorState]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === "n") {
        event.preventDefault();
        startNewProject();
        return;
      }
      if (modifier && key === "s") {
        event.preventDefault();
        void saveProject(event.shiftKey);
        return;
      }
      if (modifier && key === "o") {
        event.preventDefault();
        void requestOpenProject();
        return;
      }
      if (modifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) performRedo();
        else performUndo();
        return;
      }
      if (modifier && key === "y") {
        event.preventDefault();
        performRedo();
        return;
      }
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      if (modifier && key === "d") {
        event.preventDefault();
        duplicateSelection();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelection(selectAllPanels(panels));
        return;
      }
      if (event.key === "Escape") {
        setSelection(clearPanelSelection());
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedPanelIds.size === 0) return;
        event.preventDefault();
        deletePanels(selectedPanelIds);
        return;
      }
      const arrowDeltas: Record<string, readonly [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const direction = arrowDeltas[event.key];
      if (!direction || selectedPanelIds.size === 0) return;
      event.preventDefault();
      const step = event.shiftKey ? 5 : 1;
      updateActivePagePanels((current) => moveSelectedPanels(
        current,
        selectedPanelIds,
        direction[0] * step,
        direction[1] * step,
        pageDefinition,
        { snapping: false },
      ).panels, "Nudge panels");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deletePanels, duplicateSelection, pageDefinition, panels, performRedo, performUndo, requestOpenProject, saveProject, selectedPanelIds, startNewProject, updateActivePagePanels]);

  const assignSelectedType = useCallback((typeId: string) => {
    if (selectedPanelIds.size === 0) return;
    const { type, preset } = getPresetForType(types, presets, typeId);
    updateActivePagePanels((current) => applyTypeToPanels(
      current,
      selectedPanelIds,
      type,
      preset,
      pageDefinition,
    ), "Apply panel type");
  }, [pageDefinition, presets, selectedPanelIds, types, updateActivePagePanels]);

  const applySelectedManualScale = useCallback((scalePercent: number) => {
    if (!selectedPanel || !Number.isFinite(scalePercent) || scalePercent < 1 || scalePercent > 400) return;
    updateActivePagePanels((current) => current.map((panel) => panel.id === selectedPanel.id
      ? applyManualScaleToPanel(panel, scalePercent, pageDefinition)
      : panel), "Scale panel");
  }, [pageDefinition, selectedPanel, updateActivePagePanels]);

  const resetSelectedPanel = useCallback(() => {
    if (!selectedPanel || !selectedPreset) return;
    updateActivePagePanels((current) => current.map((panel) => panel.id === selectedPanel.id
      ? resetPanelToPreset(panel, selectedPreset, pageDefinition)
      : panel), "Reset panel preset");
  }, [pageDefinition, selectedPanel, selectedPreset, updateActivePagePanels]);

  const runAutoLabel = useCallback((target: "page" | "selection", policy: ManualLabelPolicy) => {
    updateActivePagePanels((current) => autoLabelPanels(current, {
      rowToleranceMm: project.labelSettings.rowToleranceMm,
      panelIds: target === "selection" ? selectedPanelIds : undefined,
      manualPolicy: policy,
    }), "Auto label panels");
    setPendingRelabel(null);
  }, [project.labelSettings.rowToleranceMm, selectedPanelIds, updateActivePagePanels]);

  const requestAutoLabel = useCallback((target: "page" | "selection") => {
    const hasManualLabels = panels.some((panel) => (
      panel.label.visible
      && panel.label.mode === "manual"
      && (target === "page" || selectedPanelIds.has(panel.id))
    ));
    if (hasManualLabels) {
      setPendingRelabel({ target, policy: "preserve" });
      return;
    }
    runAutoLabel(target, "preserve");
  }, [panels, runAutoLabel, selectedPanelIds]);

  const updateSelectedLabel = useCallback((update: (panel: Panel) => Panel) => {
    if (!selectedPanel) return;
    updateActivePagePanels((current) => current.map((panel) => panel.id === selectedPanel.id
      ? update(panel)
      : panel), "Edit panel label");
  }, [selectedPanel, updateActivePagePanels]);

  const updateLabelSettings = useCallback((update: Partial<ProjectLabelSettings>) => {
    commitDocument("Edit label settings", (current) => ({
      ...current,
      project: {
        ...current.project,
        labelSettings: { ...current.project.labelSettings, ...update },
      },
    }));
  }, [commitDocument]);

  const commitDefaultLabelOffsets = useCallback((
    defaultOffsetXmm: number,
    defaultOffsetYmm: number,
    applyToExistingAutomaticLabels: boolean,
  ) => {
    if (![defaultOffsetXmm, defaultOffsetYmm].every(Number.isFinite)) return;
    commitDocument("Edit default label offsets", (current) => {
      const labelSettings = { ...current.project.labelSettings, defaultOffsetXmm, defaultOffsetYmm };
      const withSettings = { ...current.project, labelSettings };
      return {
        ...current,
        project: applyToExistingAutomaticLabels
          ? mapProjectPanels(
              withSettings,
              (pagePanels) => applyDefaultOffsetsToAutomaticLabels(pagePanels, labelSettings),
            )
          : withSettings,
      };
    });
  }, [commitDocument]);

  const startPresetEdit = useCallback((presetId: string) => {
    const preset = presetsById.get(presetId);
    const type = types.find((candidate) => candidate.presetId === presetId);
    if (!preset || !type) return;
    setPresetDraft({
      presetId,
      typeId: type.id,
      name: type.name,
      scalePercent: preset.scalePercent,
      lockAspectRatio: preset.lockAspectRatio,
    });
    setPendingPresetEdit(null);
    setPresetError(null);
  }, [presetsById, types]);

  const applyPresetEdit = useCallback((edit: PendingPresetEdit, mode: PresetUpdateMode) => {
    commitDocument("Edit panel preset", (current) => ({
      ...current,
      types: current.types.map((type) => type.id === edit.typeId
        ? { ...type, name: edit.name }
        : type),
      presets: current.presets.map((preset) => preset.id === edit.preset.id
        ? edit.preset
        : preset),
      project: mapProjectPanels(
        current.project,
        (pagePanels, page) => applyPresetUpdateToPanels(
          pagePanels,
          edit.preset,
          mode,
          page.definition,
        ),
      ),
    }));
    setPresetDraft({
      presetId: edit.preset.id,
      typeId: edit.typeId,
      name: edit.name,
      scalePercent: edit.preset.scalePercent,
      lockAspectRatio: edit.preset.lockAspectRatio,
    });
    setPendingPresetEdit(null);
    setPresetError(null);
  }, [commitDocument]);

  const savePresetDraft = useCallback(() => {
    if (!presetDraft) return;
    const name = presetDraft.name.trim();
    if (!name) {
      setPresetError("Preset name is required.");
      return;
    }
    if (
      !Number.isFinite(presetDraft.scalePercent)
      || presetDraft.scalePercent < 1
      || presetDraft.scalePercent > 400
    ) {
      setPresetError("Scale must be between 1% and 400%.");
      return;
    }

    const currentPreset = presetsById.get(presetDraft.presetId);
    if (!currentPreset) return;
    const edit: PendingPresetEdit = {
      typeId: presetDraft.typeId,
      name,
      preset: {
        id: presetDraft.presetId,
        scalePercent: presetDraft.scalePercent,
        lockAspectRatio: presetDraft.lockAspectRatio,
      },
    };
    const behaviorChanged = currentPreset.scalePercent !== edit.preset.scalePercent
      || currentPreset.lockAspectRatio !== edit.preset.lockAspectRatio;
    const hasExistingPanels = allPanels.some((panel) => panel.presetId === edit.preset.id);
    if (behaviorChanged && hasExistingPanels) {
      setPendingPresetEdit(edit);
      setPresetError(null);
      return;
    }
    applyPresetEdit(edit, "future-only");
  }, [allPanels, applyPresetEdit, presetDraft, presetsById]);

  const addCustomPreset = useCallback(() => {
    const created = createCustomTypeAndPreset(types);
    commitDocument("Add custom preset", (current) => ({
      ...current,
      types: [...current.types, created.type],
      presets: [...current.presets, created.preset],
    }));
    setPresetDraft({
      presetId: created.preset.id,
      typeId: created.type.id,
      name: created.type.name,
      scalePercent: created.preset.scalePercent,
      lockAspectRatio: created.preset.lockAspectRatio,
    });
    setPendingPresetEdit(null);
    setPresetError(null);
  }, [commitDocument, types]);

  const applyAlignment = useCallback((operation: AlignmentOperation) => {
    if (!selection.anchorPanelId || selectedPanelIds.size < 2) return;
    updateActivePagePanels((current) => alignSelectedPanels(
      current,
      selectedPanelIds,
      selection.anchorPanelId!,
      operation,
      alignmentTarget,
      pageDefinition,
    ), "Align panels");
  }, [alignmentTarget, pageDefinition, selectedPanelIds, selection.anchorPanelId, updateActivePagePanels]);

  const applyDistribution = useCallback((axis: DistributionAxis) => {
    if (selectedPanelIds.size < 3) return;
    updateActivePagePanels((current) => distributeSelectedPanels(current, selectedPanelIds, axis), "Distribute panels");
  }, [selectedPanelIds, updateActivePagePanels]);

  const applyGap = useCallback((axis: DistributionAxis) => {
    const gap = axis === "horizontal" ? horizontalGapMm : verticalGapMm;
    if (selectedPanelIds.size < 2 || !Number.isFinite(gap) || gap < 0) return;
    updateActivePagePanels((current) => setSelectedPanelGap(
      current,
      selectedPanelIds,
      axis,
      gap,
      pageDefinition,
    ), "Set panel spacing");
  }, [horizontalGapMm, pageDefinition, selectedPanelIds, updateActivePagePanels, verticalGapMm]);

  const applyEqualSize = useCallback((operation: EqualSizeOperation) => {
    if (!selection.anchorPanelId || selectedPanelIds.size < 2) return;
    updateActivePagePanels((current) => equalizeSelectedPanelSize(
      current,
      selectedPanelIds,
      selection.anchorPanelId!,
      operation,
      pageDefinition,
    ), "Equalize panel size");
  }, [pageDefinition, selectedPanelIds, selection.anchorPanelId, updateActivePagePanels]);

  const runAutoLayout = useCallback((target: AutoLayoutTarget) => {
    if (!Number.isFinite(autoLayoutGapMm) || autoLayoutGapMm < 0) {
      setAutoLayoutStatus("Gap must be a non-negative millimeter value.");
      return;
    }
    const result = autoArrangeProject(project, {
      target,
      activePageId,
      selectedPanelIds,
      mode: autoLayoutMode,
      horizontalGapMm: autoLayoutGapMm,
      verticalGapMm: autoLayoutGapMm,
      allowMinorScaling,
      autoPaginate: autoPagination,
    });
    if (!result.applied) {
      setAutoLayoutStatus(result.error ?? "Auto Layout could not create a valid arrangement.");
      return;
    }
    const pageNote = result.createdPageIds.length > 0
      ? ` Created ${result.createdPageIds.length} additional A4 ${result.createdPageIds.length === 1 ? "page" : "pages"}.`
      : "";
    commitDocument("Auto Layout", (current) => ({ ...current, project: result.project }));
    setAutoLayoutStatus(`Arranged ${result.affectedPanelIds.length} panels.${pageNote}`);
    if (target !== "selection") setSelection(clearPanelSelection());
  }, [
    activePageId,
    allowMinorScaling,
    autoLayoutGapMm,
    autoLayoutMode,
    autoPagination,
    commitDocument,
    project,
    selectedPanelIds,
  ]);

  const updateLayoutSettings = useCallback((update: Partial<EditorDocument["layoutSettings"]>) => {
    commitDocument("Edit Auto Layout settings", (current) => ({
      ...current,
      layoutSettings: { ...current.layoutSettings, ...update },
    }));
  }, [commitDocument]);

  const navigatePage = useCallback((offset: -1 | 1) => {
    const target = project.pages[activePageIndex + offset];
    if (target) setActivePageId(target.id);
  }, [activePageIndex, project.pages]);

  const addPage = useCallback(() => {
    const pageId = createStableId("page");
    commitDocument("Add page", (current) => ({
      ...current,
      project: appendA4Page(current.project, pageId),
    }));
    setActivePageId(pageId);
    setPageActionError(null);
  }, [commitDocument]);

  const duplicateActivePage = useCallback(() => {
    const pageId = createStableId("page");
    commitDocument("Duplicate page", (current) => ({
      ...current,
      project: duplicateProjectPage(current.project, activePageId, () => pageId),
    }));
    setActivePageId(pageId);
    setPageActionError(null);
  }, [activePageId, commitDocument]);

  const deletePage = useCallback((pageId: string) => {
    const pageIndex = project.pages.findIndex((page) => page.id === pageId);
    if (pageIndex < 0) return;
    if (project.pages.length === 1) {
      setPageActionError("A project must keep at least one page.");
      return;
    }
    const targetPageId = project.pages[pageIndex + 1]?.id ?? project.pages[pageIndex - 1].id;
    commitDocument("Delete page", (current) => {
      const nextProject = deleteProjectPage(current.project, pageId);
      const retainedAssetIds = new Set(getAllProjectPanels(nextProject).map((panel) => panel.assetId));
      return {
        ...current,
        project: nextProject,
        assets: current.assets.filter((asset) => retainedAssetIds.has(asset.id)),
      };
    });
    setPendingPageDeleteId(null);
    setActivePageId(targetPageId);
    setPageActionError(null);
  }, [commitDocument, project.pages]);

  const requestDeleteActivePage = useCallback(() => {
    if (project.pages.length === 1) {
      setPageActionError("A project must keep at least one page.");
      return;
    }
    if (activePage.panels.length > 0) setPendingPageDeleteId(activePageId);
    else deletePage(activePageId);
  }, [activePage.panels.length, activePageId, deletePage, project.pages.length]);

  const reorderActivePage = useCallback((offset: -1 | 1) => {
    const targetIndex = activePageIndex + offset;
    if (targetIndex < 0 || targetIndex >= project.pages.length) return;
    commitDocument("Reorder pages", (current) => ({
      ...current,
      project: reorderProjectPage(current.project, activePageId, targetIndex),
    }));
    setPageActionError(null);
  }, [activePageId, activePageIndex, commitDocument, project.pages.length]);

  const moveSelectionToPage = useCallback((targetPageId: string) => {
    if (selectedPanelIds.size === 0 || targetPageId === activePageId) return;
    try {
      const nextProject = movePanelsToPage(project, selectedPanelIds, targetPageId);
      commitDocument("Move panels to page", (current) => ({ ...current, project: nextProject }));
      setSelection(clearPanelSelection());
      setActivePageId(targetPageId);
      setPageActionError(null);
    } catch (error) {
      setPageActionError(error instanceof Error ? error.message : "The selected panels could not be moved.");
    }
  }, [activePageId, commitDocument, project, selectedPanelIds]);

  const beginInteraction = useCallback((
    event: ReactPointerEvent<HTMLElement>,
    panel: Panel,
    kind: "move" | "resize",
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (kind === "move" && event.shiftKey) {
      setSelection((current) => togglePanelSelection(current, panel.id));
      return;
    }

    const movingIds = kind === "move" && selectedPanelIds.has(panel.id)
      ? new Set(selectedPanelIds)
      : new Set([panel.id]);
    if (!selectedPanelIds.has(panel.id) || kind === "resize") setSelection(selectOnlyPanel(panel.id));
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = kind === "move"
      ? {
          kind,
          selectedPanelIds: movingIds,
          startPanels: panels,
          pointerId: event.pointerId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          pixelsPerMm: metrics.pixelsPerMm,
          historyStart: document,
        }
      : {
          kind,
          panelId: panel.id,
          pointerId: event.pointerId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startGeometry: panel.geometry,
          pixelsPerMm: metrics.pixelsPerMm,
          aspectRatioLocked: panel.aspectRatioLocked,
          historyStart: document,
        };
  }, [document, metrics.pixelsPerMm, panels, selectedPanelIds]);

  const beginMarquee = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.currentTarget !== event.target) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const startXmm = screenPixelsToMm(event.clientX - rect.left, metrics.pixelsPerMm);
    const startYmm = screenPixelsToMm(event.clientY - rect.top, metrics.pixelsPerMm);
    const initialSelection = event.shiftKey ? selection : clearPanelSelection();
    if (!event.shiftKey) setSelection(initialSelection);
    setMarqueeGeometry({ xMm: startXmm, yMm: startYmm, widthMm: 0, heightMm: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      kind: "marquee",
      pointerId: event.pointerId,
      startXmm,
      startYmm,
      initialSelection,
    };
  }, [metrics.pixelsPerMm, selection]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.kind === "marquee") {
      const rect = event.currentTarget.getBoundingClientRect();
      const endXmm = screenPixelsToMm(event.clientX - rect.left, metrics.pixelsPerMm);
      const endYmm = screenPixelsToMm(event.clientY - rect.top, metrics.pixelsPerMm);
      const marquee = normalizeMarqueeGeometry(
        interaction.startXmm,
        interaction.startYmm,
        endXmm,
        endYmm,
      );
      setMarqueeGeometry(marquee);
      setSelection(selectPanelsIntersectingMarquee(panels, marquee, interaction.initialSelection));
      return;
    }
    const deltaXMm = screenPixelsToMm(event.clientX - interaction.startClientX, interaction.pixelsPerMm);
    const deltaYMm = screenPixelsToMm(event.clientY - interaction.startClientY, interaction.pixelsPerMm);
    if (interaction.kind === "move") {
      const result = moveSelectedPanels(
        interaction.startPanels,
        interaction.selectedPanelIds,
        deltaXMm,
        deltaYMm,
        pageDefinition,
        { snapping: !event.altKey, toleranceMm: 6 / interaction.pixelsPerMm },
      );
      previewDocument((current) => ({
        ...current,
        project: updateProjectPagePanels(current.project, activePageId, () => result.panels),
      }));
      setAlignmentGuides(result.guides);
      return;
    }
    const geometry = resizePanelGeometry(
        interaction.startGeometry,
        deltaXMm,
        deltaYMm,
        pageDefinition,
        interaction.aspectRatioLocked,
      );
    previewDocument((current) => ({
      ...current,
      project: updateProjectPagePanels(current.project, activePageId, (currentPanels) => currentPanels.map((panel) => {
        if (panel.id !== interaction.panelId) return panel;
        return markPanelManualResize(panel, geometry);
      })),
    }));
  }, [activePageId, metrics.pixelsPerMm, pageDefinition, panels, previewDocument]);

  const endInteraction = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (interaction?.pointerId === event.pointerId) {
      if (interaction.kind !== "marquee") {
        setHistory((current) => finalizePreviewHistory(
          current,
          interaction.historyStart,
          interaction.kind === "move" ? "Move panels" : "Resize panel",
        ));
      }
      interactionRef.current = null;
    }
    setAlignmentGuides([]);
    setMarqueeGeometry(null);
  }, []);

  const focusReviewFinding = useCallback((finding: ReviewFinding) => {
    if (finding.pageId) setActivePageId(finding.pageId);
    setActiveTab("Review");
    const panelId = finding.panelIds[0];
    if (panelId) window.setTimeout(() => setSelection(selectOnlyPanel(panelId)), 0);
  }, []);

  const applyReviewFix = useCallback(async (finding: ReviewFinding) => {
    const fix = finding.fix;
    if (!fix) return;
    if (fix.kind === "reset-preset" && fix.pageId && fix.panelId) {
      commitDocument("Review: reset panel preset", (current) => ({
        ...current,
        project: updateProjectPagePanels(current.project, fix.pageId!, (pagePanels) => pagePanels.map((panel) => {
          if (panel.id !== fix.panelId) return panel;
          const preset = current.presets.find((candidate) => candidate.id === panel.presetId);
          const page = current.project.pages.find((candidate) => candidate.id === fix.pageId);
          return preset && page ? resetPanelToPreset(panel, preset, page.definition) : panel;
        })),
      }));
    } else if (fix.kind === "move-inside-margin" && fix.pageId && fix.panelId) {
      commitDocument("Review: move inside margin", (current) => ({
        ...current,
        project: updateProjectPagePanels(current.project, fix.pageId!, (pagePanels) => {
          const page = current.project.pages.find((candidate) => candidate.id === fix.pageId);
          return pagePanels.map((panel) => panel.id === fix.panelId && page
            ? movePanelInsideSafeMargin(panel, page.definition)
            : panel);
        }),
      }));
    } else if (fix.kind === "relabel-page" && fix.pageId) {
      commitDocument("Review: relabel page", (current) => ({
        ...current,
        project: updateProjectPagePanels(current.project, fix.pageId!, (pagePanels) => autoLabelPanels(pagePanels, {
          rowToleranceMm: current.project.labelSettings.rowToleranceMm,
          manualPolicy: "replace",
        })),
      }));
    } else if (fix.kind === "refresh-source" && fix.assetId) {
      const check = sourceChecksByAssetId.get(fix.assetId);
      if (!check?.file) return;
      setSourceActionError(null);
      try {
        const refreshed = await loadImportedAsset(check.file);
        objectUrlsRef.current.add(refreshed.previewUrl);
        commitDocument("Review: refresh source", (current) => refreshAssetSource(current, fix.assetId!, refreshed, "preserve-width"));
        setSourceCheckResults((current) => current.map((result) => result.assetId === fix.assetId
          ? { ...result, status: "unchanged" }
          : result));
      } catch (error) {
        setSourceActionError(error instanceof Error ? error.message : "The source could not be refreshed.");
      }
    }
  }, [commitDocument, sourceChecksByAssetId]);

  const runPptxExport = useCallback(async () => {
    if (reviewSummary.errors > 0) {
      setPptxExportError(`${reviewSummary.errors} review ${reviewSummary.errors === 1 ? "error must" : "errors must"} be resolved before export.`);
      return;
    }
    setIsExportingPptx(true);
    setPptxExportError(null);
    setPptxExportStatus(null);
    try {
      const result = await exportPptx(document, {
        scope: pptxExportScope,
        activePageId,
        fileName: project.title,
      });
      if (isDesktopRuntime()) {
        const saved = await saveDesktopBlob(result.blob, result.fileName);
        if (saved.cancelled) return;
      } else {
        downloadPptx(result);
      }
      const slideCount = pptxExportScope === "all" ? project.pages.length : 1;
      setPendingPptxExport(false);
      setPptxExportStatus(`Exported ${slideCount} A4 ${slideCount === 1 ? "slide" : "slides"}${result.warnings.length ? ` with ${result.warnings.length} warning${result.warnings.length === 1 ? "" : "s"}` : ""}.`);
    } catch (error) {
      setPptxExportError(error instanceof PptxExportError
        ? error.errors.join(" ")
        : error instanceof Error ? error.message : "The PowerPoint file could not be exported.");
    } finally {
      setIsExportingPptx(false);
    }
  }, [activePageId, document, pptxExportScope, project.pages.length, project.title, reviewSummary.errors]);

  const gridStyle = showGrid
    ? {
        "--grid-step": `${metrics.pixelsPerMm}px`,
        "--major-grid-step": `${metrics.pixelsPerMm * 5}px`,
      }
    : undefined;

  return (
    <div className="app-shell">
      <input
        ref={projectInputRef}
        className="visually-hidden"
        type="file"
        accept=".figproj,application/json"
        onChange={handleProjectFileInput}
      />
      <input
        ref={sourceActionInputRef}
        className="visually-hidden"
        type="file"
        accept=".png,.jpg,.jpeg,.svg,.tif,.tiff,image/png,image/jpeg,image/svg+xml,image/tiff,image/x-tiff"
        onChange={handleSourceFileInput}
      />
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">FC</span>
          <div><strong>Figure Composer <span className="app-version">{APP_DISPLAY_VERSION}</span></strong><span>{project.title} · {saveStatus}</span></div>
        </div>
        <div className="document-actions" aria-label="Project file and history actions">
          <button onClick={startNewProject}>New</button>
          <button onClick={() => void requestOpenProject()}>Open</button>
          <button onClick={() => void saveProject(false)}>Save</button>
          <button onClick={() => void saveProject(true)}>Save As</button>
          <button aria-label="Undo" disabled={!canUndo(history)} onClick={performUndo}>Undo</button>
          <button aria-label="Redo" disabled={!canRedo(history)} onClick={performRedo}>Redo</button>
        </div>
        <div className="page-navigator" aria-label="Page navigation">
          <button aria-label="Previous page" disabled={activePageIndex === 0} onClick={() => navigatePage(-1)}>‹</button>
          <div className="page-summary" aria-label="Current page">
            <span>Page {activePageIndex + 1} / {project.pages.length}</span><small>A4 portrait · 210 × 297 mm</small>
          </div>
          <button aria-label="Next page" disabled={activePageIndex === project.pages.length - 1} onClick={() => navigatePage(1)}>›</button>
          <button className="add-page-button" aria-label="Add page" title="Add A4 page" onClick={addPage}>+</button>
        </div>
        <button
          className="primary-button"
          onClick={() => {
            setPptxExportError(null);
            setPptxExportScope("all");
            setPendingPptxExport(true);
          }}
        >Export PPTX</button>
      </header>

      <div className="workbench">
        <aside className="left-sidebar" aria-label="Tools">
          <nav className="sidebar-tabs" aria-label="Tool categories">
            {(["Assets", "Presets", "Layout", "Review"] as SidebarTab[]).map((tab) => (
              <button className={activeTab === tab ? "active" : ""} key={tab} onClick={() => setActiveTab(tab)}>
                {tab}
              </button>
            ))}
          </nav>
          <section className="sidebar-content">
            <p className="eyebrow">{activeTab}</p>
            {activeTab === "Assets" && (
              <AssetsSidebar
                assetsById={assetsById}
                importErrors={importErrors}
                isCheckingSources={isCheckingSources}
                panels={panels}
                selection={selection}
                sourceChecksByAssetId={sourceChecksByAssetId}
                sourceSummary={sourceCheckResults.length > 0 ? sourceCheckSummary : null}
                typesById={typesById}
                fileInputRef={fileInputRef}
                onFileInput={handleFileInput}
                onImport={() => void requestImportFiles()}
                onLoadDemo={loadDemoProject}
                onCheckSources={() => void checkAllSources()}
                onRefreshChanged={() => void refreshChangedSources()}
                onSelect={(panelId, additive) => setSelection((current) => additive
                  ? togglePanelSelection(current, panelId)
                  : selectOnlyPanel(panelId))}
              />
            )}
            {activeTab === "Presets" && (
              <PresetsSidebar
                types={types}
                presetsById={presetsById}
                draft={presetDraft}
                pendingEdit={pendingPresetEdit}
                error={presetError}
                onEdit={startPresetEdit}
                onDraftChange={setPresetDraft}
                onSave={savePresetDraft}
                onAdd={addCustomPreset}
                onApplyDecision={(mode) => {
                  if (pendingPresetEdit) applyPresetEdit(pendingPresetEdit, mode);
                }}
                onCancelDecision={() => setPendingPresetEdit(null)}
                onClose={() => {
                  setPresetDraft(null);
                  setPendingPresetEdit(null);
                  setPresetError(null);
                }}
              />
            )}
            {activeTab === "Layout" && (
              <AutoLayoutSidebar
                mode={autoLayoutMode}
                gapMm={autoLayoutGapMm}
                autoPagination={autoPagination}
                allowMinorScaling={allowMinorScaling}
                selectedCount={selectedPanels.length}
                pagePanelCount={panels.length}
                projectPanelCount={allPanels.length}
                status={autoLayoutStatus}
                onModeChange={(mode) => updateLayoutSettings({ mode })}
                onGapChange={(gapMm) => updateLayoutSettings({ gapMm })}
                onAutoPaginationChange={(autoPagination) => updateLayoutSettings({ autoPagination })}
                onAllowMinorScalingChange={(allowMinorScaling) => updateLayoutSettings({ allowMinorScaling })}
                onArrange={runAutoLayout}
              />
            )}
            {activeTab === "Review" && (
              <ReviewSidebar
                findings={reviewFindings}
                summary={reviewSummary}
                isCheckingSources={isCheckingSources}
                onCheckSources={() => void checkAllSources()}
                onFocus={focusReviewFinding}
                onFix={(finding) => void applyReviewFix(finding)}
              />
            )}
          </section>
        </aside>

        <main className="canvas-region" aria-label="A4 preview workspace">
          <div className="canvas-toolbar">
            <div className="segmented-control" aria-label="Canvas fitting">
              <button aria-pressed={fitMode === "page"} onClick={() => fit("page")}>Fit page</button>
              <button aria-pressed={fitMode === "width"} onClick={() => fit("width")}>Fit width</button>
            </div>
            <span className="canvas-hint">
              {selection.selectedPanelIds.length > 0
                ? `${selection.selectedPanelIds.length} selected`
                : `${panels.length} ${panels.length === 1 ? "panel" : "panels"}`}
            </span>
          </div>
          <div className="canvas-workspace" ref={workspaceRef}>
            <div
              className={`a4-page${showGrid ? " grid-visible" : ""}${isDragOver ? " drag-over" : ""}`}
              style={{ width: metrics.pageWidthPx, height: metrics.pageHeightPx, ...gridStyle }}
              data-width-mm={pageDefinition.widthMm}
              data-height-mm={pageDefinition.heightMm}
              data-page-id={activePageId}
              aria-label="A4 portrait page, 210 by 297 millimeters. Drop PNG, JPEG, SVG, or TIFF files here."
              onDragEnter={(event) => { event.preventDefault(); setIsDragOver(true); }}
              onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragOver(false);
              }}
              onDrop={handleDrop}
              onPointerDown={beginMarquee}
              onPointerMove={handlePointerMove}
              onPointerUp={endInteraction}
              onPointerCancel={endInteraction}
            >
              {showMargins && (
                <div
                  className="safe-margin"
                  style={{ inset: pageDefinition.marginMm * metrics.pixelsPerMm }}
                  aria-label="12 millimeter safe margin"
                />
              )}
              {panels.length === 0 && (
                <div className="page-placeholder" aria-hidden="true">
                  <span>Drop panels here</span><small>PNG · JPEG · SVG · TIFF</small>
                </div>
              )}
              {alignmentGuides.map((guide, index) => (
                <div
                  className={`alignment-guide ${guide.axis}`}
                  key={`${guide.axis}-${guide.positionMm}-${index}`}
                  style={guide.axis === "vertical"
                    ? { left: guide.positionMm * metrics.pixelsPerMm }
                    : { top: guide.positionMm * metrics.pixelsPerMm }}
                  aria-hidden="true"
                />
              ))}
              {selectedBounds && (
                <div
                  className="selection-bounds"
                  style={{
                    left: selectedBounds.left * metrics.pixelsPerMm,
                    top: selectedBounds.top * metrics.pixelsPerMm,
                    width: selectedBounds.width * metrics.pixelsPerMm,
                    height: selectedBounds.height * metrics.pixelsPerMm,
                  }}
                  aria-hidden="true"
                />
              )}
              {panels.map((panel) => {
                const asset = assetsById.get(panel.assetId);
                const type = typesById.get(panel.typeId);
                if (!asset || !type) return null;
                const selected = selectedPanelIds.has(panel.id);
                const anchor = selection.anchorPanelId === panel.id && selectedPanels.length > 1;
                return (
                  <div
                    className={`panel${selected ? " selected" : ""}${anchor ? " anchor" : ""}`}
                    key={panel.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${asset.sourceName} panel, type ${type.name}`}
                    aria-pressed={selected}
                    data-panel-id={panel.id}
                    data-page-id={panel.pageId}
                    data-type-id={panel.typeId}
                    data-preset-id={panel.presetId}
                    data-manual-override={panel.manualScaleOverride}
                    data-x-mm={panel.geometry.xMm}
                    data-y-mm={panel.geometry.yMm}
                    data-width-mm={panel.geometry.widthMm}
                    data-height-mm={panel.geometry.heightMm}
                    data-label-text={panel.label.text}
                    data-label-mode={panel.label.mode}
                    data-label-visible={panel.label.visible}
                    style={{
                      left: panel.geometry.xMm * metrics.pixelsPerMm,
                      top: panel.geometry.yMm * metrics.pixelsPerMm,
                      width: panel.geometry.widthMm * metrics.pixelsPerMm,
                      height: panel.geometry.heightMm * metrics.pixelsPerMm,
                    }}
                    onPointerDown={(event) => beginInteraction(event, panel, "move")}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelection((current) => event.shiftKey
                          ? togglePanelSelection(current, panel.id)
                          : selectOnlyPanel(panel.id));
                      }
                    }}
                  >
                    {asset.previewUrl && !asset.missing
                      ? <img src={asset.previewUrl} alt={asset.sourceName} draggable={false} />
                      : (
                        <div className="missing-asset-placeholder" role="img" aria-label={`${asset.sourceName} source is missing`}>
                          <strong>Missing source</strong><span>{asset.sourceName}</span>
                        </div>
                      )}
                    {panel.label.visible && panel.label.text && (
                      <span
                        className="panel-label"
                        data-offset-x-mm={panel.label.offsetXmm}
                        data-offset-y-mm={panel.label.offsetYmm}
                        style={{
                          left: panel.label.offsetXmm * metrics.pixelsPerMm,
                          top: panel.label.offsetYmm * metrics.pixelsPerMm,
                          color: project.labelSettings.color,
                          fontFamily: project.labelSettings.fontFamily,
                          fontSize: `${project.labelSettings.fontSizePt}pt`,
                          fontWeight: project.labelSettings.bold ? 700 : 400,
                          transform: "translateY(-100%)",
                        }}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setSelection(event.shiftKey
                            ? togglePanelSelection(selection, panel.id)
                            : selectOnlyPanel(panel.id));
                        }}
                      >
                        {panel.label.text}
                      </span>
                    )}
                    {selected && selectedPanels.length === 1 && (
                      <button
                        className="resize-handle"
                        aria-label={`Resize ${asset.sourceName}, aspect ratio ${panel.aspectRatioLocked ? "locked" : "unlocked"}`}
                        title={`Resize · aspect ratio ${panel.aspectRatioLocked ? "locked" : "unlocked"}`}
                        onPointerDown={(event) => beginInteraction(event, panel, "resize")}
                      />
                    )}
                  </div>
                );
              })}
              {marqueeGeometry && (
                <div
                  className="selection-marquee"
                  style={{
                    left: marqueeGeometry.xMm * metrics.pixelsPerMm,
                    top: marqueeGeometry.yMm * metrics.pixelsPerMm,
                    width: marqueeGeometry.widthMm * metrics.pixelsPerMm,
                    height: marqueeGeometry.heightMm * metrics.pixelsPerMm,
                  }}
                  aria-hidden="true"
                />
              )}
              {isDragOver && <div className="drop-overlay">Release to import</div>}
            </div>
          </div>
        </main>

        <aside className="inspector" aria-label={selectedPanels.length > 1 ? "Multiple panel inspector" : selectedPanel ? "Panel inspector" : "Page inspector"}>
          {selectedPanels.length > 1 && anchorPanel ? (
            <MultiSelectionInspector
              count={selectedPanels.length}
              anchorName={anchorAsset?.sourceName ?? anchorPanel.id}
              alignmentTarget={alignmentTarget}
              horizontalGapMm={horizontalGapMm}
              verticalGapMm={verticalGapMm}
              types={types}
              onAlignmentTargetChange={setAlignmentTarget}
              onAlign={applyAlignment}
              onDistribute={applyDistribution}
              onHorizontalGapChange={setHorizontalGapMm}
              onVerticalGapChange={setVerticalGapMm}
              onApplyGap={applyGap}
              onEqualSize={applyEqualSize}
              onApplyType={assignSelectedType}
              onAutoLabel={() => requestAutoLabel("selection")}
              pages={project.pages}
              activePageId={activePageId}
              onMoveToPage={moveSelectionToPage}
              onDelete={() => deletePanels(selectedPanelIds)}
            />
          ) : selectedPanel && selectedAsset && selectedType && selectedPreset ? (
            <>
              <p className="eyebrow">Panel</p>
              <h2 title={selectedAsset.sourceName}>{selectedAsset.sourceName}</h2>
              <p className="source-note">{selectedAsset.kind.toUpperCase()} · {selectedAsset.missing
                ? "source missing"
                : selectedSourceCheck?.status === "changed" ? "source changed"
                  : selectedSourceCheck?.status === "unavailable" ? "automatic check unavailable"
                    : "source unchanged"}</p>
              <section className="source-action-section">
                <div className="section-heading">
                  <strong>Source</strong>
                  <small>{selectedAsset.byteSize.toLocaleString()} bytes</small>
                </div>
                {selectedAsset.missing ? (
                  <button className="source-primary-action" onClick={() => requestSourceFile({
                    kind: "relink",
                    panelId: selectedPanel.id,
                    assetId: selectedAsset.id,
                  })}>Relink Source</button>
                ) : (
                  <div className="command-grid two-column">
                    <button onClick={() => requestSourceFile({
                      kind: "replace",
                      panelId: selectedPanel.id,
                      assetId: selectedAsset.id,
                    })}>Replace Source</button>
                    <button onClick={() => refreshSelectedSource(selectedPanel, selectedAsset)}>Refresh Source</button>
                  </div>
                )}
                {selectedSourceCheck?.message && <small className="source-capability-note">{selectedSourceCheck.message}</small>}
              </section>
              <div className="field-group">
                <label htmlFor="panel-type">Type</label>
                <select id="panel-type" value={selectedPanel.typeId} onChange={(event) => assignSelectedType(event.target.value)}>
                  {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                </select>
              </div>
              <dl className="property-list preset-properties">
                <div><dt>Preset</dt><dd>{selectedType.name}</dd></div>
                <div className="scale-property">
                  <dt><label htmlFor="panel-scale">Scale</label></dt>
                  <dd>
                    <input
                      id="panel-scale"
                      type="number"
                      min="1"
                      max="400"
                      step="1"
                      value={Number(getPanelScalePercent(selectedPanel).toFixed(1))}
                      onChange={(event) => applySelectedManualScale(Number(event.target.value))}
                    />%
                  </dd>
                </div>
                <div><dt>X</dt><dd>{formatMm(selectedPanel.geometry.xMm)}</dd></div>
                <div><dt>Y</dt><dd>{formatMm(selectedPanel.geometry.yMm)}</dd></div>
                <div><dt>Width</dt><dd>{formatMm(selectedPanel.geometry.widthMm)}</dd></div>
                <div><dt>Height</dt><dd>{formatMm(selectedPanel.geometry.heightMm)}</dd></div>
                <div><dt>Ratio</dt><dd>{selectedPanel.aspectRatioLocked ? "Locked" : "Unlocked"}</dd></div>
              </dl>
              <section className="label-inspector-section">
                <div className="section-heading">
                  <strong>Panel label</strong>
                  <small>{selectedPanel.label.mode === "auto" ? "Auto" : "Manual"}</small>
                </div>
                <label className="label-text-field">
                  <span>Label</span>
                  <input
                    aria-label="Panel label text"
                    maxLength={24}
                    value={selectedPanel.label.text}
                    onChange={(event) => updateSelectedLabel((panel) => updatePanelLabelText(panel, event.target.value))}
                  />
                </label>
                <label className="toggle-row compact">
                  <span><strong>Show label</strong><small>Include in auto labeling</small></span>
                  <input
                    type="checkbox"
                    checked={selectedPanel.label.visible}
                    onChange={(event) => updateSelectedLabel((panel) => updatePanelLabelVisibility(panel, event.target.checked))}
                  />
                </label>
                <details className="label-offset-details">
                  <summary>Label position</summary>
                  <div className="label-offset-grid">
                    <label>Offset X<input type="number" step="0.5" value={selectedPanel.label.offsetXmm} onChange={(event) => updateSelectedLabel((panel) => updatePanelLabelOffset(panel, Number(event.target.value), panel.label.offsetYmm))} /></label>
                    <label>Offset Y<input type="number" step="0.5" value={selectedPanel.label.offsetYmm} onChange={(event) => updateSelectedLabel((panel) => updatePanelLabelOffset(panel, panel.label.offsetXmm, Number(event.target.value)))} /></label>
                  </div>
                  <button className="reset-preset-button" onClick={() => updateSelectedLabel((panel) => resetPanelLabelOffset(panel, project.labelSettings))}>Use project offset</button>
                </details>
              </section>
              <div className={`preset-status ${selectedFollowsPreset ? "following" : "modified"}`}>
                <span>{selectedPanel.layoutScaleFactor
                  ? "Layout adjusted"
                  : selectedFollowsPreset ? "Following preset" : "Modified"}</span>
                <small>{selectedType.name} · {selectedPreset.scalePercent}%</small>
              </div>
              {!selectedFollowsPreset && (
                <button className="reset-preset-button" onClick={resetSelectedPanel}>
                  Reset to {selectedType.name} preset
                </button>
              )}
              <MoveToPageControl
                pages={project.pages}
                activePageId={activePageId}
                selectedCount={1}
                onMove={moveSelectionToPage}
              />
              <button className="delete-button" onClick={() => deletePanels(new Set([selectedPanel.id]))}>Delete panel</button>
              <p className="shortcut-hint">Delete or Backspace</p>
            </>
          ) : (
            <PageInspector
              pageName={activePage.name}
              showGrid={showGrid}
              showMargins={showMargins}
              panelCount={panels.length}
              labelSettings={project.labelSettings}
              onGridChange={setShowGrid}
              onMarginsChange={setShowMargins}
              onAutoLabel={() => requestAutoLabel("page")}
              onLabelSettingsChange={updateLabelSettings}
              onCommitDefaultOffsets={commitDefaultLabelOffsets}
              pageIndex={activePageIndex}
              pageCount={project.pages.length}
              autoPagination={autoPagination}
              onAddPage={addPage}
              onDuplicatePage={duplicateActivePage}
              onDeletePage={requestDeleteActivePage}
              onMovePageEarlier={() => reorderActivePage(-1)}
              onMovePageLater={() => reorderActivePage(1)}
            />
          )}
        </aside>
      </div>

      {pendingPptxExport && (
        <div className="dialog-backdrop" role="presentation">
          <div className="relabel-dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="pptx-export-title">
            <h2 id="pptx-export-title">Export editable PowerPoint</h2>
            <p>Each Figure Composer page becomes one A4 slide. Panels and labels stay as independent objects.</p>
            <div className={`export-review-summary${reviewSummary.errors ? " has-errors" : reviewSummary.warnings ? " has-warnings" : " passed"}`}>
              <strong>{reviewSummary.errors > 0
                ? `${reviewSummary.errors} review ${reviewSummary.errors === 1 ? "error" : "errors"}`
                : reviewSummary.warnings > 0 ? `${reviewSummary.warnings} ${reviewSummary.warnings === 1 ? "warning" : "warnings"}` : "Review passed"}</strong>
              <small>{reviewSummary.info} info</small>
            </div>
            <fieldset className="export-scope-options">
              <legend>Pages</legend>
              <label>
                <input
                  type="radio"
                  name="pptx-export-scope"
                  checked={pptxExportScope === "all"}
                  onChange={() => setPptxExportScope("all")}
                />
                <span><strong>All pages</strong><small>{project.pages.length} slides in project order</small></span>
              </label>
              <label>
                <input
                  type="radio"
                  name="pptx-export-scope"
                  checked={pptxExportScope === "current"}
                  onChange={() => setPptxExportScope("current")}
                />
                <span><strong>Current page only</strong><small>Page {activePageIndex + 1}</small></span>
              </label>
            </fieldset>
            {pptxExportError && <p className="export-dialog-error" role="alert">{pptxExportError}</p>}
            <div className="dialog-actions">
              <button className="plain" disabled={isExportingPptx} onClick={() => setPendingPptxExport(false)}>Cancel</button>
              {(reviewSummary.errors > 0 || reviewSummary.warnings > 0) && (
                <button onClick={() => { setPendingPptxExport(false); setActiveTab("Review"); }}>Review</button>
              )}
              <button className="dialog-primary" disabled={isExportingPptx || reviewSummary.errors > 0} onClick={() => void runPptxExport()}>
                {isExportingPptx ? "Exporting…" : reviewSummary.warnings > 0 ? "Export Anyway" : "Export .pptx"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingRecovery && (
        <div className="dialog-backdrop" role="presentation">
          <div className="relabel-dialog" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
            <h2 id="recovery-title">Recover unsaved project?</h2>
            <p>An autosaved working copy was found. Restoring it keeps the project unsaved until you choose Save.</p>
            <div className="dialog-actions">
              <button onClick={() => {
                setHistory(replaceHistory(pendingRecovery));
                setSavedDocument(null);
                resetTransientEditorState(pendingRecovery);
                setPendingRecovery(null);
                setSaveStatus("Unsaved changes");
              }}>Restore</button>
              <button className="plain" onClick={() => {
                clearRecovery(localStorage);
                setPendingRecovery(null);
              }}>Discard</button>
            </div>
          </div>
        </div>
      )}

      {pendingAppClose && (
        <div className="dialog-backdrop" role="presentation">
          <div className="relabel-dialog" role="dialog" aria-modal="true" aria-labelledby="unsaved-close-title">
            <h2 id="unsaved-close-title">{isDirty ? "Unsaved changes" : "Finish export before closing"}</h2>
            <p>{isExportingPptx
              ? "Figure Composer is finishing the active PowerPoint export. Closing is available when it completes."
              : "Save this project before closing Figure Composer?"}</p>
            <div className="dialog-actions">
              {isDirty && <button className="dialog-primary" disabled={isClosingApp || isExportingPptx} onClick={() => void completeAppClose("save")}>Save</button>}
              <button disabled={isClosingApp || isExportingPptx} onClick={() => void completeAppClose("discard")}>{isDirty ? "Discard" : "Close"}</button>
              <button className="plain" disabled={isClosingApp} onClick={() => void completeAppClose("cancel")}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {pendingPageDeleteId && (
        <div className="dialog-backdrop" role="presentation">
          <div className="relabel-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-page-title">
            <h2 id="delete-page-title">Delete this page?</h2>
            <p>This page contains {project.pages.find((page) => page.id === pendingPageDeleteId)?.panels.length ?? 0} panels. Deleting it removes those panels from the project and can be undone.</p>
            <div className="dialog-actions">
              <button className="plain" onClick={() => setPendingPageDeleteId(null)}>Cancel</button>
              <button className="danger" onClick={() => deletePage(pendingPageDeleteId)}>Delete page</button>
            </div>
          </div>
        </div>
      )}

      {pendingSourceChange && (
        <div className="dialog-backdrop" role="presentation">
          <div className="relabel-dialog source-change-dialog" role="dialog" aria-modal="true" aria-labelledby="source-change-title">
            <h2 id="source-change-title">{pendingSourceChange.action.kind === "replace" ? "Replace panel source?" : "Refresh linked source?"}</h2>
            <p>
              {assetsById.get(pendingSourceChange.action.assetId)?.sourceName ?? "Current source"}
              {" → "}{pendingSourceChange.asset.sourceName}
            </p>
            <fieldset className="source-sizing-options">
              <legend>Sizing after update</legend>
              <label>
                <input
                  type="radio"
                  name="source-sizing"
                  checked={pendingSourceChange.sizingMode === "preserve-width"}
                  onChange={() => setPendingSourceChange({ ...pendingSourceChange, sizingMode: "preserve-width" })}
                />
                <span><strong>Preserve displayed width</strong><small>Keep center and recalculate height from the new aspect ratio.</small></span>
              </label>
              <label>
                <input
                  type="radio"
                  name="source-sizing"
                  checked={pendingSourceChange.sizingMode === "reapply-preset"}
                  onChange={() => setPendingSourceChange({ ...pendingSourceChange, sizingMode: "reapply-preset" })}
                />
                <span><strong>Reapply panel preset</strong><small>Use the panel's current scientific type and preset.</small></span>
              </label>
            </fieldset>
            <div className="dialog-actions">
              <button className="plain" onClick={cancelPendingSourceChange}>Cancel</button>
              <button className="dialog-primary" onClick={applyPendingSourceChange}>
                {pendingSourceChange.action.kind === "replace" ? "Replace source" : "Refresh source"}
              </button>
            </div>
          </div>
        </div>
      )}

      {projectFileError && (
        <div className="file-error-banner" role="alert">
          <span>{projectFileError}</span>
          <button aria-label="Dismiss project file error" onClick={() => setProjectFileError(null)}>×</button>
        </div>
      )}

      {pageActionError && (
        <div className="file-error-banner" role="alert">
          <span>{pageActionError}</span>
          <button aria-label="Dismiss page action error" onClick={() => setPageActionError(null)}>×</button>
        </div>
      )}

      {sourceActionError && (
        <div className="file-error-banner source-error-banner" role="alert">
          <span>{sourceActionError}</span>
          <button aria-label="Dismiss source error" onClick={() => setSourceActionError(null)}>×</button>
        </div>
      )}

      {pptxExportStatus && (
        <div className="file-error-banner export-status-banner" role="status">
          <span>{pptxExportStatus}</span>
          <button aria-label="Dismiss export status" onClick={() => setPptxExportStatus(null)}>×</button>
        </div>
      )}

      {pendingRelabel && (
        <div className="dialog-backdrop" role="presentation">
          <div className="relabel-dialog" role="dialog" aria-modal="true" aria-labelledby="relabel-title">
            <h2 id="relabel-title">Manual labels detected</h2>
            <p>Choose how this explicit relabel should handle manual text.</p>
            <label><input type="radio" name="manual-policy" checked={pendingRelabel.policy === "preserve"} onChange={() => setPendingRelabel({ ...pendingRelabel, policy: "preserve" })} /> Preserve manual labels</label>
            <label><input type="radio" name="manual-policy" checked={pendingRelabel.policy === "replace"} onChange={() => setPendingRelabel({ ...pendingRelabel, policy: "replace" })} /> Replace all labels</label>
            <div className="dialog-actions">
              <button onClick={() => setPendingRelabel(null)}>Cancel</button>
              <button className="dialog-primary" onClick={() => runAutoLabel(pendingRelabel.target, pendingRelabel.policy)}>Relabel</button>
            </div>
          </div>
        </div>
      )}

      <footer className="statusbar">
        <div className="zoom-controls">
          <button aria-label="Zoom out" onClick={() => setManualZoom((value) => Math.max(MIN_ZOOM_PERCENT, value - 10))}>−</button>
          <input
            aria-label="Zoom percentage"
            type="range"
            min={MIN_ZOOM_PERCENT}
            max={MAX_ZOOM_PERCENT}
            step="1"
            value={zoom}
            onChange={(event) => setManualZoom(Number(event.target.value))}
          />
          <button aria-label="Zoom in" onClick={() => setManualZoom((value) => Math.min(MAX_ZOOM_PERCENT, value + 10))}>＋</button>
          <output>{zoom}%</output>
        </div>
        <div className="status-items">
          <span><i className="status-dot" /> Grid 1 mm</span>
          <button className={`review-status${reviewSummary.errors ? " error" : reviewSummary.warnings ? " warning" : " passed"}`} onClick={() => setActiveTab("Review")}>
            Review · {reviewSummary.errors ? `${reviewSummary.errors} error${reviewSummary.errors === 1 ? "" : "s"}` : reviewSummary.warnings ? `${reviewSummary.warnings} warning${reviewSummary.warnings === 1 ? "" : "s"}` : "Passed"}
          </button>
          {selection.selectedPanelIds.length > 0 && <span>{selection.selectedPanelIds.length} selected</span>}
          <span>{panels.length} {panels.length === 1 ? "panel" : "panels"}</span>
        </div>
      </footer>
    </div>
  );
}

interface AutoLayoutSidebarProps {
  readonly mode: AutoLayoutMode;
  readonly gapMm: number;
  readonly autoPagination: boolean;
  readonly allowMinorScaling: boolean;
  readonly selectedCount: number;
  readonly pagePanelCount: number;
  readonly projectPanelCount: number;
  readonly status: string | null;
  readonly onModeChange: (mode: AutoLayoutMode) => void;
  readonly onGapChange: (gapMm: number) => void;
  readonly onAutoPaginationChange: (enabled: boolean) => void;
  readonly onAllowMinorScalingChange: (enabled: boolean) => void;
  readonly onArrange: (target: AutoLayoutTarget) => void;
}

function AutoLayoutSidebar({
  mode,
  gapMm,
  autoPagination,
  allowMinorScaling,
  selectedCount,
  pagePanelCount,
  projectPanelCount,
  status,
  onModeChange,
  onGapChange,
  onAutoPaginationChange,
  onAllowMinorScalingChange,
  onArrange,
}: AutoLayoutSidebarProps) {
  return (
    <div className="auto-layout-controls">
      <strong>Auto Layout</strong>
      <label>
        <span>Mode</span>
        <select aria-label="Auto Layout mode" value={mode} onChange={(event) => onModeChange(event.target.value as AutoLayoutMode)}>
          <option value="balanced">Balanced</option>
          <option value="compact">Compact</option>
          <option value="equal-rows">Equal Rows</option>
        </select>
      </label>
      <label>
        <span>Gap</span>
        <span className="millimeter-input">
          <input aria-label="Auto Layout gap" type="number" min="0" step="0.5" value={gapMm} onChange={(event) => onGapChange(Number(event.target.value))} />
          <small>mm</small>
        </span>
      </label>
      <div className="auto-layout-actions">
        <button disabled={selectedCount < 2} onClick={() => onArrange("selection")}>Arrange Selection</button>
        <button disabled={pagePanelCount === 0} onClick={() => onArrange("page")}>Arrange Page</button>
        <button disabled={projectPanelCount === 0} onClick={() => onArrange("project")}>Arrange Project</button>
      </div>
      <details>
        <summary>Advanced</summary>
        <label className="toggle-row compact-toggle">
          <span><strong>Auto Pagination</strong><small>Create A4 pages instead of shrinking panels</small></span>
          <input type="checkbox" checked={autoPagination} onChange={(event) => onAutoPaginationChange(event.target.checked)} />
        </label>
        <label className="toggle-row compact-toggle">
          <span><strong>Minor scaling</strong><small>Off by default · maximum 5% smaller</small></span>
          <input type="checkbox" checked={allowMinorScaling} onChange={(event) => onAllowMinorScalingChange(event.target.checked)} />
        </label>
      </details>
      <p className="format-hint">Uses current panel order, preset sizes, and the 12 mm safe area.</p>
      {status && <p className="auto-layout-status" role="status">{status}</p>}
    </div>
  );
}

interface ReviewSidebarProps {
  readonly findings: readonly ReviewFinding[];
  readonly summary: { readonly errors: number; readonly warnings: number; readonly info: number };
  readonly isCheckingSources: boolean;
  readonly onCheckSources: () => void;
  readonly onFocus: (finding: ReviewFinding) => void;
  readonly onFix: (finding: ReviewFinding) => void;
}

function ReviewSidebar({ findings, summary, isCheckingSources, onCheckSources, onFocus, onFix }: ReviewSidebarProps) {
  return (
    <div className="review-panel">
      <div className="review-heading">
        <strong>Project Review</strong>
        <button disabled={isCheckingSources} onClick={onCheckSources}>{isCheckingSources ? "Checking…" : "Check Sources"}</button>
      </div>
      <div className="review-counts" aria-label="Review summary">
        <span className="error">{summary.errors} errors</span>
        <span className="warning">{summary.warnings} warnings</span>
        <span>{summary.info} info</span>
      </div>
      {findings.length === 0 ? (
        <div className="review-passed" role="status"><strong>Review passed</strong><p>No mechanical consistency issues were found.</p></div>
      ) : (
        <div className="review-findings" aria-live="polite">
          {findings.map((finding) => (
            <article className={`review-finding ${finding.severity}`} key={finding.id}>
              <button className="review-finding-main" onClick={() => onFocus(finding)}>
                <span aria-hidden="true">{finding.severity === "error" ? "×" : finding.severity === "warning" ? "!" : "i"}</span>
                <span><strong>{finding.severity}</strong><small>{finding.message}</small></span>
              </button>
              {finding.fix && <button className="review-fix" onClick={() => onFix(finding)}>{finding.fix.label}</button>}
            </article>
          ))}
        </div>
      )}
      <p className="format-hint">Review findings never change scientific content automatically.</p>
    </div>
  );
}

interface AssetsSidebarProps {
  readonly assetsById: ReadonlyMap<string, ImportedAsset>;
  readonly importErrors: readonly string[];
  readonly isCheckingSources: boolean;
  readonly panels: readonly Panel[];
  readonly selection: PanelSelection;
  readonly sourceChecksByAssetId: ReadonlyMap<string, SourceCheckResult>;
  readonly sourceSummary: SourceCheckSummary | null;
  readonly typesById: ReadonlyMap<string, PanelTypeDefinition>;
  readonly fileInputRef: React.RefObject<HTMLInputElement>;
  readonly onFileInput: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onImport: () => void;
  readonly onLoadDemo: () => void;
  readonly onCheckSources: () => void;
  readonly onRefreshChanged: () => void;
  readonly onSelect: (panelId: string, additive: boolean) => void;
}

function AssetsSidebar({
  assetsById,
  importErrors,
  isCheckingSources,
  panels,
  selection,
  sourceChecksByAssetId,
  sourceSummary,
  typesById,
  fileInputRef,
  onFileInput,
  onImport,
  onLoadDemo,
  onCheckSources,
  onRefreshChanged,
  onSelect,
}: AssetsSidebarProps) {
  return (
    <>
      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept=".png,.jpg,.jpeg,.svg,.tif,.tiff,image/png,image/jpeg,image/svg+xml,image/tiff,image/x-tiff"
        multiple
        onChange={onFileInput}
      />
      <button className="import-button" onClick={onImport}>＋ Import files</button>
      <p className="format-hint">PNG, JPEG, SVG, or TIFF · filename types inferred</p>
      <div className="source-check-actions">
        <button disabled={isCheckingSources || assetsById.size === 0} onClick={onCheckSources}>
          {isCheckingSources ? "Checking…" : "Check Sources"}
        </button>
        <button disabled={!sourceSummary?.changed} onClick={onRefreshChanged}>Refresh Changed</button>
      </div>
      {sourceSummary && (
        <p className="source-check-summary" role="status">
          {sourceSummary.changed} changed · {sourceSummary.missing} missing · {sourceSummary.unchanged} unchanged
          {sourceSummary.unavailable > 0 ? ` · ${sourceSummary.unavailable} unavailable` : ""}
        </p>
      )}
      {importErrors.length > 0 && (
        <div className="import-errors" role="alert">
          {importErrors.map((error) => <p key={error}>{error}</p>)}
        </div>
      )}
      {panels.length === 0 ? (
        <div className="empty-state compact">
          <span className="empty-icon" aria-hidden="true">⇩</span>
          <strong>Drop files onto the A4 page</strong>
          <p>Each file becomes a typed independent panel.</p>
          <ol className="onboarding-steps">
            <li>Import figure files</li>
            <li>Arrange and review panels</li>
            <li>Export editable PowerPoint</li>
          </ol>
          <button className="demo-project-button" onClick={onLoadDemo}>Open 3-page demo</button>
        </div>
      ) : (
        <div className="asset-list" aria-live="polite">
          {panels.map((panel) => {
            const asset = assetsById.get(panel.assetId);
            const type = typesById.get(panel.typeId);
            if (!asset || !type) return null;
            const sourceCheck = sourceChecksByAssetId.get(asset.id);
            const sourceSuffix = asset.missing || sourceCheck?.status === "missing"
              ? " · Missing source"
              : sourceCheck?.status === "changed" ? " · Source changed"
                : sourceCheck?.status === "unavailable" ? " · Check unavailable"
                  : panel.manualScaleOverride ? " · Modified" : "";
            return (
              <button
                className={`asset-row${selection.selectedPanelIds.includes(panel.id) ? " selected" : ""}${selection.anchorPanelId === panel.id && selection.selectedPanelIds.length > 1 ? " anchor" : ""}`}
                key={panel.id}
                onClick={(event) => onSelect(panel.id, event.shiftKey)}
              >
                {asset.previewUrl && !asset.missing
                  ? <img src={asset.previewUrl} alt="" />
                  : <span className="asset-missing-thumbnail" aria-hidden="true">?</span>}
                <span>
                  <strong>{asset.sourceName}</strong>
                  <small>{type.name}{sourceSuffix}</small>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

interface PresetsSidebarProps {
  readonly types: readonly PanelTypeDefinition[];
  readonly presetsById: ReadonlyMap<string, PanelPreset>;
  readonly draft: PresetDraft | null;
  readonly pendingEdit: PendingPresetEdit | null;
  readonly error: string | null;
  readonly onEdit: (presetId: string) => void;
  readonly onDraftChange: (draft: PresetDraft) => void;
  readonly onSave: () => void;
  readonly onAdd: () => void;
  readonly onApplyDecision: (mode: PresetUpdateMode) => void;
  readonly onCancelDecision: () => void;
  readonly onClose: () => void;
}

function PresetsSidebar({
  types,
  presetsById,
  draft,
  pendingEdit,
  error,
  onEdit,
  onDraftChange,
  onSave,
  onAdd,
  onApplyDecision,
  onCancelDecision,
  onClose,
}: PresetsSidebarProps) {
  return (
    <>
      <div className="preset-list">
        {types.map((type) => {
          const preset = presetsById.get(type.presetId);
          if (!preset) return null;
          return (
            <button
              className={draft?.presetId === preset.id ? "selected" : ""}
              key={type.id}
              onClick={() => onEdit(preset.id)}
            >
              <span>{type.name}</span><strong>{preset.scalePercent}%</strong>
            </button>
          );
        })}
      </div>
      <button className="new-preset-button" onClick={onAdd}>＋ New preset</button>
      {draft && (
        <div className="preset-editor">
          <div className="editor-heading"><strong>Edit preset</strong><button aria-label="Close preset editor" onClick={onClose}>×</button></div>
          <label>
            <span>Name / type</span>
            <input
              aria-label="Preset name"
              value={draft.name}
              onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
            />
          </label>
          <label>
            <span>Scale</span>
            <span className="percent-input">
              <input
                aria-label="Preset scale percentage"
                type="number"
                min="1"
                max="400"
                step="1"
                value={draft.scalePercent}
                onChange={(event) => onDraftChange({ ...draft, scalePercent: Number(event.target.value) })}
              />%
            </span>
          </label>
          <label className="preset-lock-row">
            <span>Lock aspect ratio</span>
            <input
              aria-label="Preset aspect ratio lock"
              type="checkbox"
              checked={draft.lockAspectRatio}
              onChange={(event) => onDraftChange({ ...draft, lockAspectRatio: event.target.checked })}
            />
          </label>
          {error && <p className="preset-error" role="alert">{error}</p>}
          {!pendingEdit && <button className="save-preset-button" onClick={onSave}>Save preset</button>}
          {pendingEdit && (
            <div className="preset-decision" role="alert">
              <strong>Apply updated {pendingEdit.name} preset to existing panels?</strong>
              <button onClick={() => onApplyDecision("apply-all")}>Apply to all</button>
              <button onClick={() => onApplyDecision("future-only")}>Future panels only</button>
              <button className="plain" onClick={onCancelDecision}>Cancel</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

interface MultiSelectionInspectorProps {
  readonly count: number;
  readonly anchorName: string;
  readonly alignmentTarget: AlignmentTarget;
  readonly horizontalGapMm: number;
  readonly verticalGapMm: number;
  readonly types: readonly PanelTypeDefinition[];
  readonly onAlignmentTargetChange: (target: AlignmentTarget) => void;
  readonly onAlign: (operation: AlignmentOperation) => void;
  readonly onDistribute: (axis: DistributionAxis) => void;
  readonly onHorizontalGapChange: (value: number) => void;
  readonly onVerticalGapChange: (value: number) => void;
  readonly onApplyGap: (axis: DistributionAxis) => void;
  readonly onEqualSize: (operation: EqualSizeOperation) => void;
  readonly onApplyType: (typeId: string) => void;
  readonly onAutoLabel: () => void;
  readonly pages: readonly FigurePage[];
  readonly activePageId: string;
  readonly onMoveToPage: (pageId: string) => void;
  readonly onDelete: () => void;
}

function MultiSelectionInspector({
  count,
  anchorName,
  alignmentTarget,
  horizontalGapMm,
  verticalGapMm,
  types,
  onAlignmentTargetChange,
  onAlign,
  onDistribute,
  onHorizontalGapChange,
  onVerticalGapChange,
  onApplyGap,
  onEqualSize,
  onApplyType,
  onAutoLabel,
  pages,
  activePageId,
  onMoveToPage,
  onDelete,
}: MultiSelectionInspectorProps) {
  const [applyTypeId, setApplyTypeId] = useState(types[0]?.id ?? "");
  return (
    <>
      <p className="eyebrow">Multiple panels</p>
      <h2>{count} selected</h2>
      <p className="source-note" title={anchorName}>Anchor: {anchorName}</p>

      <button className="auto-label-button" onClick={onAutoLabel}>Auto Label Selection</button>

      <section className="multi-inspector-section">
        <div className="section-heading">
          <strong>Align</strong>
          <select
            aria-label="Align to"
            value={alignmentTarget}
            onChange={(event) => onAlignmentTargetChange(event.target.value as AlignmentTarget)}
          >
            <option value="selection">Selection</option>
            <option value="page">Page</option>
          </select>
        </div>
        <div className="command-grid three-column">
          <button onClick={() => onAlign("left")}>Left</button>
          <button onClick={() => onAlign("horizontal-center")}>H Center</button>
          <button onClick={() => onAlign("right")}>Right</button>
          <button onClick={() => onAlign("top")}>Top</button>
          <button onClick={() => onAlign("vertical-center")}>V Center</button>
          <button onClick={() => onAlign("bottom")}>Bottom</button>
        </div>
      </section>

      <section className="multi-inspector-section">
        <strong>Distribute</strong>
        <div className="command-grid two-column">
          <button disabled={count < 3} onClick={() => onDistribute("horizontal")}>Horizontal</button>
          <button disabled={count < 3} onClick={() => onDistribute("vertical")}>Vertical</button>
        </div>
      </section>

      <section className="multi-inspector-section">
        <strong>Spacing</strong>
        <div className="gap-command">
          <label htmlFor="horizontal-gap">Horizontal</label>
          <input id="horizontal-gap" type="number" min="0" step="0.5" value={horizontalGapMm} onChange={(event) => onHorizontalGapChange(Number(event.target.value))} />
          <span>mm</span>
          <button onClick={() => onApplyGap("horizontal")}>Set</button>
        </div>
        <div className="gap-command">
          <label htmlFor="vertical-gap">Vertical</label>
          <input id="vertical-gap" type="number" min="0" step="0.5" value={verticalGapMm} onChange={(event) => onVerticalGapChange(Number(event.target.value))} />
          <span>mm</span>
          <button onClick={() => onApplyGap("vertical")}>Set</button>
        </div>
      </section>

      <section className="multi-inspector-section">
        <strong>Size</strong>
        <div className="command-grid two-column">
          <button onClick={() => onEqualSize("width")}>Equal Width</button>
          <button onClick={() => onEqualSize("height")}>Equal Height</button>
        </div>
      </section>

      <section className="multi-inspector-section">
        <strong>Type / preset</strong>
        <div className="apply-preset-row">
          <select aria-label="Preset for selected panels" value={applyTypeId} onChange={(event) => setApplyTypeId(event.target.value)}>
            {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
          <button onClick={() => onApplyType(applyTypeId)}>Apply</button>
        </div>
      </section>

      <MoveToPageControl
        pages={pages}
        activePageId={activePageId}
        selectedCount={count}
        onMove={onMoveToPage}
      />

      <button className="delete-button" onClick={onDelete}>Delete selected panels</button>
      <p className="shortcut-hint">Arrows 1 mm · Shift+Arrows 5 mm · Alt disables snap</p>
    </>
  );
}

interface PageInspectorProps {
  readonly pageName: string;
  readonly panelCount: number;
  readonly showGrid: boolean;
  readonly showMargins: boolean;
  readonly labelSettings: ProjectLabelSettings;
  readonly onGridChange: (value: boolean) => void;
  readonly onMarginsChange: (value: boolean) => void;
  readonly onAutoLabel: () => void;
  readonly onLabelSettingsChange: (update: Partial<ProjectLabelSettings>) => void;
  readonly onCommitDefaultOffsets: (
    defaultOffsetXmm: number,
    defaultOffsetYmm: number,
    applyToExistingAutomaticLabels: boolean,
  ) => void;
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly autoPagination: boolean;
  readonly onAddPage: () => void;
  readonly onDuplicatePage: () => void;
  readonly onDeletePage: () => void;
  readonly onMovePageEarlier: () => void;
  readonly onMovePageLater: () => void;
}

function PageInspector({
  pageName,
  panelCount,
  showGrid,
  showMargins,
  labelSettings,
  onGridChange,
  onMarginsChange,
  onAutoLabel,
  onLabelSettingsChange,
  onCommitDefaultOffsets,
  pageIndex,
  pageCount,
  autoPagination,
  onAddPage,
  onDuplicatePage,
  onDeletePage,
  onMovePageEarlier,
  onMovePageLater,
}: PageInspectorProps) {
  const [offsetDraft, setOffsetDraft] = useState(() => ({
    xMm: labelSettings.defaultOffsetXmm,
    yMm: labelSettings.defaultOffsetYmm,
  }));
  useEffect(() => {
    setOffsetDraft({
      xMm: labelSettings.defaultOffsetXmm,
      yMm: labelSettings.defaultOffsetYmm,
    });
  }, [labelSettings.defaultOffsetXmm, labelSettings.defaultOffsetYmm]);
  const offsetChanged = offsetDraft.xMm !== labelSettings.defaultOffsetXmm
    || offsetDraft.yMm !== labelSettings.defaultOffsetYmm;
  return (
    <>
      <p className="eyebrow">Page</p>
      <h2>{pageName} · A4 Portrait</h2>
      <dl className="property-list">
        <div><dt>Width</dt><dd>210 mm</dd></div>
        <div><dt>Height</dt><dd>297 mm</dd></div>
        <div><dt>Margins</dt><dd>12 mm</dd></div>
        <div><dt>Grid</dt><dd>1 mm</dd></div>
      </dl>
      <button className="auto-label-button" disabled={panelCount === 0} onClick={onAutoLabel}>Auto Label Page</button>
      <section className="page-actions-section">
        <div className="section-heading"><strong>Page actions</strong><small>Auto Pagination {autoPagination ? "On" : "Off"}</small></div>
        <div className="command-grid two-column">
          <button onClick={onAddPage}>Add Page</button>
          <button onClick={onDuplicatePage}>Duplicate</button>
          <button disabled={pageIndex === 0} onClick={onMovePageEarlier}>Move Earlier</button>
          <button disabled={pageIndex === pageCount - 1} onClick={onMovePageLater}>Move Later</button>
        </div>
        <button className="page-delete-button" disabled={pageCount === 1} onClick={onDeletePage}>Delete Page</button>
      </section>
      <div className="inspector-section">
        <label className="toggle-row">
          <span><strong>Safe margins</strong><small>12 mm on every edge</small></span>
          <input type="checkbox" checked={showMargins} onChange={(event) => onMarginsChange(event.target.checked)} />
        </label>
        <label className="toggle-row">
          <span><strong>Grid</strong><small>1 mm with 5 mm majors</small></span>
          <input type="checkbox" checked={showGrid} onChange={(event) => onGridChange(event.target.checked)} />
        </label>
      </div>
      <details>
        <summary>Label settings</summary>
        <div className="label-settings-grid">
          <label>
            Font
            <select
              aria-label="Label font"
              value={labelSettings.fontFamily}
              onChange={(event) => onLabelSettingsChange({ fontFamily: event.target.value })}
            >
              <option value="Arial">Arial</option>
              <option value="Times New Roman">Times New Roman</option>
            </select>
          </label>
          <label>Size<input type="number" min="6" max="72" step="1" value={labelSettings.fontSizePt} onChange={(event) => onLabelSettingsChange({ fontSizePt: Number(event.target.value) })} /></label>
          <label className="settings-check"><span>Bold</span><input type="checkbox" checked={labelSettings.bold} onChange={(event) => onLabelSettingsChange({ bold: event.target.checked })} /></label>
          <label>Offset X<input aria-label="Default label offset X" type="number" step="0.5" value={offsetDraft.xMm} onChange={(event) => setOffsetDraft((current) => ({ ...current, xMm: Number(event.target.value) }))} /></label>
          <label>Offset Y<input aria-label="Default label offset Y" type="number" step="0.5" value={offsetDraft.yMm} onChange={(event) => setOffsetDraft((current) => ({ ...current, yMm: Number(event.target.value) }))} /></label>
          <label className="settings-wide">Sequence<select value={labelSettings.sequenceMode} onChange={(event) => onLabelSettingsChange({ sequenceMode: event.target.value as LabelSequenceMode })}><option value="continuous">Continuous across project</option><option value="restart-per-page">Restart each page</option></select></label>
        </div>
        {offsetChanged && (
          <div className="preset-decision label-offset-decision" role="alert">
            <strong>Apply changed default offsets?</strong>
            <button onClick={() => onCommitDefaultOffsets(offsetDraft.xMm, offsetDraft.yMm, true)}>Apply to automatic labels</button>
            <button onClick={() => onCommitDefaultOffsets(offsetDraft.xMm, offsetDraft.yMm, false)}>Future automatic labels only</button>
            <button className="plain" onClick={() => setOffsetDraft({ xMm: labelSettings.defaultOffsetXmm, yMm: labelSettings.defaultOffsetYmm })}>Cancel</button>
          </div>
        )}
      </details>
    </>
  );
}

interface MoveToPageControlProps {
  readonly pages: readonly FigurePage[];
  readonly activePageId: string;
  readonly selectedCount: number;
  readonly onMove: (pageId: string) => void;
}

function MoveToPageControl({ pages, activePageId, selectedCount, onMove }: MoveToPageControlProps) {
  const activeIndex = pages.findIndex((page) => page.id === activePageId);
  const targets = useMemo(() => pages.filter((page) => page.id !== activePageId), [activePageId, pages]);
  const [targetPageId, setTargetPageId] = useState(targets[0]?.id ?? "");
  useEffect(() => {
    if (!targets.some((page) => page.id === targetPageId)) setTargetPageId(targets[0]?.id ?? "");
  }, [targetPageId, targets]);
  const previous = pages[activeIndex - 1];
  const next = pages[activeIndex + 1];
  return (
    <section className="move-page-section">
      <div className="section-heading"><strong>Move to page</strong><small>{selectedCount} selected</small></div>
      <div className="move-page-row">
        <select aria-label="Target page" value={targetPageId} disabled={targets.length === 0} onChange={(event) => setTargetPageId(event.target.value)}>
          {targets.map((page) => {
            const index = pages.findIndex((candidate) => candidate.id === page.id);
            return <option key={page.id} value={page.id}>Page {index + 1}</option>;
          })}
        </select>
        <button disabled={!targetPageId} onClick={() => onMove(targetPageId)}>Move</button>
      </div>
      <div className="command-grid two-column">
        <button disabled={!previous} onClick={() => previous && onMove(previous.id)}>Previous Page</button>
        <button disabled={!next} onClick={() => next && onMove(next.id)}>Next Page</button>
      </div>
      {targets.length === 0 && <small className="move-page-hint">Add another page to move this selection.</small>}
    </section>
  );
}

function formatMm(value: number): string {
  return `${value.toFixed(1).replace(/\.0$/, "")} mm`;
}

function safeFileStem(value: string): string {
  return value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-") || "Untitled figure";
}
