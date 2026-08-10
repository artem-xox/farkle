/*
 * The per-personality blurbs that used to live here are gone: they were only
 * ever rendered inside a native `<select>`, where they truncated on a phone
 * rather than explaining anything. The personality shapes they described are
 * in docs/DESIGN.md §6, and the intended replacement is an icon per playstyle
 * rather than a sentence per option.
 */
export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
