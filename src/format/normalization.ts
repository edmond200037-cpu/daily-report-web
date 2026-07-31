export const normalizeName = (value: string): string => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
export const cleanText = (value: string): string => value.trim().replace(/\s+/g, ' ');
