# 商场商铺数据监控提醒 (CHKC ShopInfo Reminder)

接入 **CHKC 商场数据开放接口**，定时抓取商铺信息，比对出 **新增 / 修改 / 删除** 的变动，并通过邮件发送变动报告。配套一个可视化网页，用于设置发送周期与收件邮箱。

## 功能

1. **接入接口**：自动按文档规则生成签名 token（`md5(api_key,api_secret,app_date)`），POST 调用 `getshop` 获取实时商铺数据。
2. **变动比对**：以商铺 `id` 为主键，对比上一次快照，得出新增、被修改（精确到字段的「原值 → 新值」）、被删除的商铺。
3. **多通道通知**：变动可同时推送到两个独立通道（任选其一或都开）——
   - **邮件**：美观的 HTML 邮件发送给配置的收件人（需 SMTP）；
   - **Lark 机器人**：以交互卡片推送到 Lark 群（仅需群自定义机器人的 Webhook，无需账号密码，可选签名校验）。
   - 可选「无变动也发送」。
4. **可视化配置页**：
   - 发送周期：**按间隔**（每 N 分钟）或 **每天定时**（HH:MM）
   - 收件邮箱（支持多个）
   - 发件 SMTP 服务器
   - 一键「检测接口连通」「立即抓取并预览变动」「发送测试邮件」
   - 当前商铺数据列表与运行历史

## 运行

```bash
npm install
npm start
```

启动后打开 <http://localhost:3000> 进行配置。端口可用环境变量覆盖：`PORT=8080 npm start`。

## 使用步骤

1. 打开配置页，点击 **检测接口连通** 确认接口正常（接口凭据已内置在默认配置中，可在 `data/config.json` 中修改）。
2. 在 **通信配置** 里选择通知通道（两者可任选/都开）：
   - **邮件 (SMTP)**：点「配置发件服务器」，填发件邮箱账号。例：QQ 邮箱 `smtp.qq.com:465` 勾 SSL，密码填**授权码**；Gmail `smtp.gmail.com:465` 用应用专用密码。填好后点「发送测试邮件」。收件箱在「收件邮箱」里填（可多个）。
   - **Lark 机器人**：在 Lark 群里添加「自定义机器人 (Custom Bot)」获取 Webhook 地址 → 点「配置 Lark 机器人」，勾选启用并粘贴 Webhook（若机器人开启了签名校验，再填 Secret）→ 点「发送测试消息」验证。
3. 在 **发送周期** 选择间隔或每天定时，勾选 **开启定时任务**，点 **保存发送周期**。

> 第一次运行时还没有历史快照，首次检查会把当前全部商铺存为基准（首次默认视为「无新增」，之后的变动才会逐条上报）。

## 接口说明（来自文档）

- 服务器：`http://hkchkc.yzt3d.com/`
- 鉴权：`token = 大写( md5(api_key + "," + api_secret + "," + app_date) )`，`app_date` 为 `date('Y-m-d H')`（小时粒度），POST 提交。
- 接口：`Home/public/test`（校验）、`Home/public/getshop`（商铺数据）。
- 注：接口返回的 JSON 含未转义控制字符，程序内已做容错解析。

## 项目结构

```
src/
  api.js         接口客户端（签名、请求、对照表、字段标签）
  store.js       配置/快照/历史 的 JSON 持久化
  diff.js        商铺数据比对
  mailer.js      邮件构建与发送 (nodemailer)
  lark.js        Lark 机器人卡片构建与推送 (Webhook)
  scheduler.js   定时调度（间隔 / 每天定时）+ 多通道推送
  server.js      Express 服务与 REST 接口
public/          可视化配置页
data/            运行时生成：config.json / snapshot.json / history.json
```

## 数据存储

全部为本地 JSON 文件（`data/` 目录），无需数据库。SMTP 密码以明文存于 `data/config.json`，该文件已加入 `.gitignore`，请勿提交或外泄。
