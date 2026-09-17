export interface PageDefinition {
  readonly name: string;
  readonly orientation: "portrait" | "landscape";
  readonly widthMm: number;
  readonly heightMm: number;
  readonly marginMm: number;
  readonly gridMm: number;
}

export const A4_PORTRAIT: PageDefinition = Object.freeze({
  name: "A4",
  orientation: "portrait",
  widthMm: 210,
  heightMm: 297,
  marginMm: 12,
  gridMm: 1,
});
