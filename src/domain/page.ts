export interface PageMargins {
  readonly topMm: number;
  readonly rightMm: number;
  readonly bottomMm: number;
  readonly leftMm: number;
}

export interface PageDefinition {
  readonly name: string;
  readonly orientation: "portrait" | "landscape";
  readonly widthMm: number;
  readonly heightMm: number;
  /** Uniform fallback retained for projects saved before per-edge margins. */
  readonly marginMm: number;
  readonly marginsMm?: PageMargins;
  readonly gridMm: number;
}

export const DEFAULT_A4_MARGINS: PageMargins = Object.freeze({
  topMm: 12,
  rightMm: 12,
  bottomMm: 12,
  leftMm: 12,
});

export const A4_PORTRAIT: PageDefinition = Object.freeze({
  name: "A4",
  orientation: "portrait",
  widthMm: 210,
  heightMm: 297,
  marginMm: 12,
  marginsMm: DEFAULT_A4_MARGINS,
  gridMm: 1,
});

export function getPageMargins(page: PageDefinition): PageMargins {
  return page.marginsMm ?? {
    topMm: page.marginMm,
    rightMm: page.marginMm,
    bottomMm: page.marginMm,
    leftMm: page.marginMm,
  };
}

export function setPageMargins(page: PageDefinition, margins: PageMargins): PageDefinition {
  validatePageMargins(page, margins);
  return {
    ...page,
    marginMm: margins.topMm,
    marginsMm: { ...margins },
  };
}

export function validatePageMargins(page: Pick<PageDefinition, "widthMm" | "heightMm">, margins: PageMargins): void {
  const values = [margins.topMm, margins.rightMm, margins.bottomMm, margins.leftMm];
  if (!values.every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error("Safe margins must be non-negative finite millimeter values.");
  }
  if (margins.leftMm + margins.rightMm >= page.widthMm
    || margins.topMm + margins.bottomMm >= page.heightMm) {
    throw new Error("Safe margins must leave a positive layout area.");
  }
}
