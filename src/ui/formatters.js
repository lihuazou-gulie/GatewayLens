const numberFormatter = new Intl.NumberFormat("zh-CN");
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function number(value) {
  const parsed = numeric(value);
  return parsed === null ? "—" : numberFormatter.format(parsed);
}

export function compactNumber(value) {
  const parsed = numeric(value);
  if (parsed === null) return "—";
  if (parsed >= 1_000_000) return `${(parsed / 1_000_000).toFixed(parsed >= 10_000_000 ? 0 : 1)}M`;
  if (parsed >= 1_000) return `${(parsed / 1_000).toFixed(parsed >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(parsed));
}

export function percent(value, digits = 1) {
  const parsed = numeric(value);
  return parsed === null ? "—" : `${parsed.toFixed(digits)}%`;
}

export function duration(ms) {
  const parsed = numeric(ms);
  if (parsed === null) return "—";
  return parsed < 1_000 ? `${Math.round(parsed)} ms` : `${(parsed / 1_000).toFixed(1)} s`;
}

export function bytes(value) {
  const parsed = numeric(value);
  if (parsed === null || parsed < 0) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let size = parsed;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  const digits = index === 0 || size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[index]}`;
}

export function timestamp(value, fallback = "暂无") {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : dateFormatter.format(date);
}

export function timeOnly(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      });
}

export function uptime(seconds) {
  const parsed = numeric(seconds);
  if (parsed === null) return "—";
  const value = Math.max(0, Math.floor(parsed));
  const days = Math.floor(value / 86_400);
  const hours = Math.floor((value % 86_400) / 3_600);
  const minutes = Math.floor((value % 3_600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  return `${minutes} 分钟`;
}

export function rangeLabel(value, range) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  if (range === "24h")
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", hourCycle: "h23" });
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}
