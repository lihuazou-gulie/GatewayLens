export function finite(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = Number(value); return Number.isFinite(number) ? number : fallback;
}
