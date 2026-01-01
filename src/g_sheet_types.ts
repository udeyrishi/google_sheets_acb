export type SheetScalar = string | number | boolean | Date | null;

export type SheetRow = readonly SheetScalar[];

export type SheetTable = readonly SheetRow[];
