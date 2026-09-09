export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
export class KanbanApi {
  async request(path, { method = "GET", body, query, signal } = {}) {
    const url = new URL(`/api/${path.replace(/^\//, "")}`, window.location.origin);
    for (const [key, value] of Object.entries(query || {}))
      if (value !== undefined && value !== "") url.searchParams.set(key, value);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await fetch(url, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new ApiError(data.error || "请求失败", response.status);
      return data;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(e.name === "AbortError" ? "请求超时，请稍后刷新" : "无法连接面板服务", 0);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
}
