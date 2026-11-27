import { isFastingDate } from "@/lib/scoring.js";
export const TIME_ZONE = "Africa/Algiers";

export function algeriaDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function formatArabicDate(value: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("ar-DZ", { timeZone: TIME_ZONE, ...options }).format(new Date(`${value}T12:00:00+01:00`));
}

export function daysBetweenInclusive(start: string, end: string) {
  const a = new Date(`${start}T12:00:00Z`).getTime();
  const b = new Date(`${end}T12:00:00Z`).getTime();
  return Math.max(0, Math.floor((b - a) / 86400000) + 1);
}

export function daysUntil(start: string, end: string) {
  const a = new Date(`${start}T12:00:00Z`).getTime();
  const b = new Date(`${end}T12:00:00Z`).getTime();
  return Math.max(0, Math.floor((b - a) / 86400000));
}

export function isFastingDay(value: string) {
  return isFastingDate(value);
}

export function isWithin(value: string, start: string, end: string) {
  return value >= start && value <= end;
}

export function startOfWeekMonday(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}
