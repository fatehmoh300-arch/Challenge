export function number(value: number) {
  return new Intl.NumberFormat("ar-DZ").format(value);
}

export function percent(value: number) {
  return `${Math.round(value)}٪`;
}

export function initials(name?: string | null) {
  return (name || "مستخدم").trim().slice(0, 1).toUpperCase();
}

export function formatArabicDate(
  value: string,
  options: Intl.DateTimeFormatOptions = {},
) {
  const date = new Date(`${value}T12:00:00+01:00`);
  return new Intl.DateTimeFormat("ar-DZ", {
    timeZone: "Africa/Algiers",
    ...options,
  }).format(date);
}
