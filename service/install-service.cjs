// 把本应用安装为 Windows 服务（开机自启、崩溃自动重启）
// 需以「管理员身份」运行：  node service/install-service.cjs
const path = require("path");
const { Service } = require("node-windows");

const svc = new Service({
  name: "CHKC ShopInfo Reminder",
  description: "商场商铺数据监控：定时抓取商铺数据、比对变动并通过邮件 / Lark 通知。",
  script: path.join(__dirname, "..", "src", "server.js"),
  // 服务以何 node 运行：使用当前 node
  nodeOptions: [],
  env: [{ name: "PORT", value: process.env.PORT || "3000" }],
  // 崩溃后重启策略
  wait: 2,
  grow: 0.5,
  maxRestarts: 10,
});

svc.on("install", () => {
  console.log("✅ 服务已安装，正在启动…");
  svc.start();
});
svc.on("alreadyinstalled", () => {
  console.log("ℹ️ 服务已存在。若要重装，请先运行：npm run service:uninstall");
});
svc.on("start", () => {
  console.log(`✅ 服务已启动：「${svc.name}」`);
  console.log("   配置界面： http://localhost:" + (process.env.PORT || "3000"));
  console.log("   之后开机会自动运行，无需再手动 npm start。");
});
svc.on("error", (err) => {
  console.error("❌ 出错：", err);
  console.error("   若提示权限不足，请用「管理员身份」打开 PowerShell 再运行本命令。");
});

console.log("正在安装 Windows 服务（需要管理员权限）…");
svc.install();
