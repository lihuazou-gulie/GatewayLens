import { compactNumber, percent, number } from "../ui/formatters.js";
export function summaryMetrics(data, modelsView) {
  const { quality: q, capacity: c, pool: p } = data.summary;
  const items = [];
  if (data.modules.quality && !modelsView)
    items.push(
      {
        key: "quality",
        label: "服务成功率",
        value: percent(q?.rate),
        note: q
          ? `${compactNumber(q.successes)} 次成功 · ${compactNumber(q.errors)} 次服务错误${q.partial ? " · 部分分组" : ""}`
          : "监控未开启或数据不可用",
        gauge: q?.rate,
      },
      {
        key: "requests",
        label: "服务请求",
        value: compactNumber(q?.requests),
        note: "排除业务限制及调用方请求错误",
        color: "cyan",
      },
    );
  if (data.modules.capacity)
    items.push({
      key: "capacity",
      label: "分组并发负载",
      value: percent(c?.percent),
      note: c
        ? `${number(c.used)} / ${number(c.max)} 并发 · ${number(c.waiting)} 排队${c.partial ? " · 部分分组" : ""}`
        : "实时监控未开启或数据不可用",
      gauge: c?.percent,
      color: "amber",
    });
  if (data.modules.pool)
    items.push({
      key: "pool",
      label: "号池可用率",
      value: percent(p?.percent),
      note: p
        ? `${number(p.available)} / ${number(p.total)} 可用${p.partial ? " · 部分分组" : ""}`
        : "实时监控未开启或数据不可用",
      gauge: p?.percent,
      color: "lime",
    });
  return items;
}
export function poolRows(pool) {
  return pool
    ? [
        ...[
          ["available", "可用"],
          ["limited", "限流"],
          ["errors", "异常"],
          ["unavailable", "不可用合计"],
        ].map(([key, label]) => ({ key, label, value: number(pool[key]) })),
        {
          key: "note",
          text: "共享账号已去重；限流和异常属于不可用原因。可用状态不代表主动调用测试通过。",
        },
      ]
    : [{ key: "note", text: "暂无号池可用性数据" }];
}
export function systemMetrics(system) {
  return system
    ? [
        { key: "cpu", label: "CPU 使用率", value: percent(system.cpu), note: "上游运行环境采样" },
        {
          key: "memory",
          label: "内存",
          value: `${number(system.memoryUsed)} MB`,
          note: `总量 ${number(system.memoryTotal)} MB`,
        },
        {
          key: "database",
          label: "数据库",
          value: system.database === null ? "未知" : system.database ? "正常" : "异常",
          note: `${number(system.dbActive)} 活跃连接`,
        },
        {
          key: "redis",
          label: "Redis",
          value: system.redis === null ? "未知" : system.redis ? "正常" : "异常",
          note: `${number(system.redisConnections)} 连接`,
        },
      ]
    : [{ key: "note", text: "上游暂未提供系统状态快照" }];
}
