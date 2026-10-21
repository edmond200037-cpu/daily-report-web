/** Plain decimal notation; preserve the caller's quantity string. */
export const isPositiveDecimal = (value: string): boolean => /^\d+(?:\.\d+)?$/.test(value.trim()) && Number.isFinite(Number(value)) && Number(value) > 0;
