// 卸载本应用的 Windows 服务
// 需以「管理员身份」运行：  node service/uninstall-service.cjs
const path = require("path");
const { Service } = require("node-windows");

const svc = new Service({
  name: "CHKC ShopInfo Reminder",
  script: path.join(__dirname, "..", "src", "server.js"),
});

svc.on("uninstall", () => {
  console.log("✅ 服务已卸载。开机将不再自动运行。");
});
svc.on("error", (err) => {
  console.error("❌ 出错：", err);
});

console.log("正在卸载 Windows 服务（需要管理员权限）…");
svc.uninstall();
