# 测试指南

测试脚本会创建临时 SQLite 数据库和本地 HTTP 服务，默认不触碰开发数据库。测试之间应顺序运行，因为部分历史脚本使用固定端口。

## 命令矩阵

| 命令 | 覆盖范围 | 说明 |
| --- | --- | --- |
| `npm test` | 中文搜索 + security + regression + email | 默认搜索逻辑与 API 测试集合 |
| `npm run test:search` | 中文、拼音、多字段、输入法 | 独立 Node 测试，不启动服务或触碰数据库 |
| `npm run test:security` | 租户隔离、权限、限流、冲突、审计 | 认证和授权改动优先运行 |
| `npm run test:regression` | 认证、主数据、排班、请假、工时、报表 | 后端回归烟测 |
| `npm run test:email` | 忘记密码、邀请邮件 | 使用本地 SMTP sink，不发送真实邮件 |
| `npm run test:project` | 新建项目及权限场景 | 历史独立脚本，固定使用 `3099`，需先启动测试服务 |
| `npm run test:resource` | 协同管理、工作范围、报表导出 | 历史独立脚本，固定使用 `3099`，需先启动测试服务 |
| `npm run test:features` | 三个前端功能验证 | 需要可用的本地测试服务和测试账号 |
| `npm run test:e2e` | Playwright 全量 UI 流程 | 自动先执行 `npm run build`，使用 `e2e/.tmp/` 数据库 |
| `npm run test:all` | 默认 API 测试 + Playwright | 时间较长，适合发布前运行 |

也可以使用 `npm run test:e2e:headed` 或 `npm run test:e2e:ui` 调试浏览器流程。

`test:project` 和 `test:resource` 是早期的外部集成脚本，不会自动启动服务。需要先用临时数据库启动 `PORT=3099` 的本地服务，再顺序执行它们；不要指向生产服务。

## 测试数据位置

- `tests/test_security.js`、`tests/test_regression.js`、`tests/test_email_flows.js` 使用带时间戳的 `tests/.tmp/*.db`。
- `e2e/start-server.js` 使用 `e2e/.tmp/e2e.db`，Playwright 结束后由测试生命周期清理或覆盖。
- `e2e-report/`、`test-results/`、`playwright-report/` 等是测试输出，不提交。
- 若测试中途异常退出，先确认对应端口和 Node 进程已结束，再重新运行。

## 修改与测试对应关系

| 改动 | 最低验证 | 建议补充 |
| --- | --- | --- |
| 登录、会话、密码重置、限流 | `npm run test:security`、`npm run test:email` | `npm run test:e2e -- e2e/auth.spec.js` |
| 业务 API 或权限 | `npm run test:security`、`npm run test:regression` | 对应页面 E2E |
| 排班或工时 UI | `npm run build`、`npm run test:e2e` | 手动检查桌面与移动视图 |
| 数据库迁移 | 相关 API 测试、重启服务 | 在临时数据库上重复启动验证幂等性 |
| 邮件或企业微信 | 对应 mock/诊断脚本 | 不要在测试中使用生产密钥 |
| `deploy.sh` 或 PM2 | `bash -n deploy.sh` | 生产发布后执行健康检查 |

## E2E 调试提示

Playwright 配置在 `playwright.config.js`。它使用 `3399` 作为默认隔离端口，通过 `e2e/global-setup.js` 构建前端，再启动 `e2e/start-server.js`。如果只改了后端，不需要手动启动生产服务来跑 E2E。

### 搜索专项验证

```bash
npm run test:search
npm run test:e2e -- e2e/pinyin-search.spec.js
```

所有现有搜索框共用 `public/js/name-search.js`：中文按文字包含匹配；拼音支持全拼、连续首字母、中拼混输、多音字及 `ü/v/u:`；全角字母、数字和空格统一处理。空格分隔的关键词必须全部命中，可分别命中同一记录的不同字段，顺序不限；不会把两个字段拼成一个姓名来匹配，也不跳字匹配首字母。

- 人员管理（含存档）：姓名、团队、职位、邮箱和关联账号手机。
- 项目管理（含存档）及预订项目选择器：项目名、客户名和项目编号。
- 客户管理（含存档）：客户名及备注。
- 预订、休假及休假编辑的人员选择器：姓名、团队和职位。

E2E 同时覆盖输入法选字期间保留结果、选字结束刷新、光标保留、键盘选项、筛选后团队全选、清空搜索、移动端布局，以及拼音依赖失败重试/延迟加载。筛选只使用已获授权的 API 数据，不扩大服务端数据权限。

## 本地并发基准

```bash
npm run benchmark:concurrency
# 仅用于对照：模拟原先同步登录校验，其他代码与数据保持一致
npm run benchmark:concurrency -- --sync-login
```

脚本创建系统临时目录和 SQLite 库，生成 30 个用户/人员、20 个项目、2024–2026 年工作日的排班与工时。独立子进程使用随机端口和 `ENV_FILE=/dev/null`，不读取开发/生产数据库或真实通知配置；退出时关闭连接、子进程并删除临时库。

保持 30 条 SSE 连接，以 30 路并发测周/月排班、单人员局部排班、全年报表和工时写入；登录时额外测健康接口响应。输出 p50/p95、错误数、响应字节数、事件循环延迟和内存。测试不会触发 SSE 排班写入风暴，真实跨用户推送由 `e2e/schedule.spec.js` 覆盖。

本地回环测试不包含公网、Nginx 压缩或浏览器绘制，不能作为生产容量承诺。对照测试请顺序运行，避免其他压测或 E2E 占用 CPU；不要对测试中的绝对毫秒值设置 CI 硬阈值。
