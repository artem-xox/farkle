/*
 * The per-personality blurbs that used to live here are gone: they were only
 * ever rendered inside a native `<select>`, where they truncated on a phone
 * rather than explaining anything. The personality shapes they described are
 * in docs/DESIGN.md §6, and the replacement that shipped is an icon per
 * playstyle — setup/PersonalityGallery.tsx shows each bot's hand-drawn icon
 * and a one-line pitch on a floating card instead of a sentence per option.
 */
export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
