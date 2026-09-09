# 参与 GatewayLens

GatewayLens 是独立部署的 Sub2API 监控面板。服务端使用 Node.js 原生模块，前端使用原生 HTML、CSS 和 JavaScript，没有第三方运行依赖。

## 开始开发

使用 Node.js 22 或更新版本：

```sh
npm ci
npm run check
npm run demo
```

模拟站点与面板 URL 会在控制台显示，数据保存在系统临时目录，不连接真实 Sub2API。测试凭证只对模拟服务有效。不要将真实管理员 Key、初始化码、日志或部署数据复制到源码目录。

## 架构与目录

项目按业务模块组织服务端，采用单进程的分层结构：

```text
server/
  index.mjs                启动、TLS、退出
  app.mjs                  HTTP 服务器与路由装配
  config.mjs               环境配置
  bootstrap/               对象装配、存储初始化、版本迁移
  modules/
    identity/              初始化、登录、密码和会话
    configuration/         上游连接、站点文案、展示范围
    monitoring/            范围选择、指标聚合、公开快照
    probing/               主动探测配置、执行和结果
  shared/                  事务存储、加密、缓存、并发、HTTP 与上游客户端
src/
  api/                     同源 API 客户端
  core/                    状态与轮询
  data/                    共享模型及状态词汇
  monitor/                 监控页面与卡片编排
  settings/                管理交互
  ui/                      图表、DOM 更新、皮肤和场景
styles/                    基础样式和主题
assets/                    运行时图片及来源清单
tests/                     领域、HTTP、并发、迁移、恢复和浏览器回归
scripts/                   本地预览、检查、容器验收和运维工具
deploy/                    Nginx 与 systemd 示例
.github/                   CI、PR 模板及 README 截图
```

服务端每个模块按实际需要包含 `domain/`、`application/`、`infrastructure/` 与 `interfaces/http/`，不创建没有职责的空层。

| 层级     | 职责与依赖                                                         |
| -------- | ------------------------------------------------------------------ |
| 领域     | 校验和计算，只依赖领域代码；不依赖 HTTP、文件系统或上游 DTO        |
| 应用     | 通过注入的端口编排用例；跨模块协作使用用例或仓储端口               |
| 基础设施 | 实现文件仓储、加密、上游协议、缓存和调度                           |
| HTTP     | 鉴权、请求转换、状态码和公开错误映射                               |
| 装配入口 | `bootstrap/application.mjs` 创建对象并注入依赖，`app.mjs` 注册路由 |

`npm run check:architecture` 检查依赖方向、静态导入、前后端边界和循环依赖。它不代替代码评审。

前端复用数据请求、轮询、状态词汇和格式化模块；监控和设置分别编排 UI。默认主题与像素风共享语义 DOM，使用 `data-theme` 和浏览器本地偏好切换。像素天空由 `src/ui/sky/` 管理，按访问者当地时间计算，页面隐藏时暂停；它不请求定位、天气或真实天文数据。

## 状态与持久化

配置仓储共享 `JsonStateStore` 的单进程事务边界。每次写入基于私有副本，先原子持久化，再替换内存状态并递增 revision。写入失败丢弃副本，过期 revision 返回 409。

更换上游在同一事务中更新加密凭证、清空展示分组并重置探测目标，同时保留站点文案。移除探测所属分组会清理目标。修改密码时在事务内重新核验旧凭据，成功后撤销其他会话。

设置改变使旧快照与上游缓存失效，并取消旧版本采集。探测按目标 generation 隔离结果，旧请求的结果不会成为新目标的状态。

配置格式为 v2，启动时支持迁移 v1，并为旧配置补齐缺失的展示字段。保持 `KANBAN_*` 环境变量、`kanban_session` Cookie、主题偏好和 Compose 服务/卷名称的契约。一个数据目录只允许一个服务进程写入，完整恢复必须同时包含配置和加密密钥。

## HTTP 与数据契约

所有管理写请求需要同源 Origin、JSON 请求体和管理会话；初始化与登录有各自的权限与限速检查。

| 接口                                           | 用途                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| `GET /api/health`                              | 进程健康                                                                      |
| `GET /api/bootstrap`                           | 初始化/登录状态及白名单站点文案                                               |
| `GET /api/monitor`                             | 已授权范围的聚合快照，支持 range/scope/model/topic 筛选                       |
| `GET /api/admin/settings`                      | 管理设置，不回传 Key                                                          |
| `PUT /api/admin/site-copy`                     | 独立保存 `{ revision, siteCopy: { title, overviewTitle, overviewSubtitle } }` |
| `PUT /api/admin/display`                       | 保存 `{ revision, display }` 中的展示分组和监控内容                           |
| `GET /api/admin/catalog`                       | 上游分组目录                                                                  |
| `POST /api/admin/connection`                   | 校验并保存上游连接                                                            |
| `GET /api/admin/probe`、`PUT /api/admin/probe` | 读取/保存主动探测设置                                                         |
| `POST /api/admin/probe/run`                    | 执行一次真实探测，仅管理员可用                                                |

站点文案是公开的纯文本，按 UTF-16 长度限制为 60/80/160，拒绝空值、非字符串与内嵌控制字符。保存文案不访问上游，也不更改分组、公开开关、模块或探测目标。

Sub2API 管理接口位于其 `/api/v1` 下，凭证只在服务端通过 `X-API-Key` 使用。上游 DTO 适配在 `monitoring/infrastructure/`，业务计算在 `monitoring/domain/`。

| 上游路径                                | 用途                                     |
| --------------------------------------- | ---------------------------------------- |
| `/admin/groups/all`                     | 分组目录                                 |
| `/admin/ops/dashboard/overview`         | 分组服务质量和管理员系统采样             |
| `/admin/ops/request-errors`             | 有界聚合查询，排除调用方错误，不透传明细 |
| `/admin/ops/dashboard/throughput-trend` | 请求次数趋势                             |
| `/admin/ops/concurrency`                | 分组资源映射与并发去重                   |
| `/admin/ops/account-availability`       | 号池聚合与去重                           |
| `/admin/channel-monitor-v2/models`      | 按分组和准确模型名称获取模型统计         |

模型成功率与缓存率的上游单位为 0–1，在面板中转换为百分比。不同指标使用各自的数据口径；缺失、无样本、未知和不可用不表示零值或健康状态。P95 不跨组求平均，分组并发不等于图片任务数，图片请求次数不等于生成张数。

## 容量边界

| 边界                           | 默认值                           |
| ------------------------------ | -------------------------------- |
| 同时接受的监控请求             | 64，满载时返回可重试错误         |
| 不同监控快照缓存项（含采集中） | 32                               |
| 单个来源版本的上游缓存项       | 128                              |
| 共享上游并发 / 排队            | 4 / 64                           |
| 单次采集中的分组并发           | 4                                |
| 上游请求 / 快照总时限          | 8 秒 / 40 秒，可通过环境变量调整 |
| 上游响应 / 管理 JSON 请求体    | 8 MiB / 32 KiB                   |

相同查询合并采集；满载时不无限排队。浏览器在暂时断连时保留上次快照并注明过期，登录失效时清空私有快照。

## 验证

```sh
npm run format
npm run check
npm run check:history
npx playwright install chromium
npm run test:browser
```

浏览器脚本启动模拟服务，执行管理流程、双主题桌面/手机显示和权限回归，保存截图后退出。控制台显示证据目录，CI 通过 `BROWSER_ARTIFACT_DIR` 指定输出位置；已有 Chrome/Edge 可通过 `BROWSER_EXECUTABLE` 指定。

界面修改应检查总览、分组、模型、登录和管理设置，覆盖加载、空值、不可用、断连与权限状态。轮询应原位更新组件，保留已有节点、筛选和焦点。长文案、窄屏、键盘操作与减少动态效果也需要验证。

涉及服务端、Docker、部署或备份时，在 Linux Docker Engine 环境执行：

```sh
bash scripts/test-container.sh
```

该脚本使用独立 Compose 项目与模拟上游，检查初始化、权限、重建、完整备份恢复和失败回滚，结束后清理自己创建的测试容器与卷。不要将测试项目名称改为正式实例的名称。

## 提交贡献
  
  提交信息使用中文，简要说明行为变化。PR 请附上复现方式、修改效果和实际验证结果；涉及界面时附脱敏截图，涉及配置或数据格式时说明升级影响。
  
  素材贡献请补充 [来源声明](assets/NOTICE.md) 与文件清单。安全漏洞请通过 [安全说明](SECURITY.md) 中的私密渠道报告。
  