export function number(value: number) {
  return new Intl.NumberFormat("ar-DZ").format(value);
}

export function percent(value: number) {
  return `${Math.round(value)}٪`;
}

export function initials(name?: string | null) {
  return (name || "مستخدم").trim().slice(0, 1).toUpperCase();
}
