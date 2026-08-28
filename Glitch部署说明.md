# 部署到 Glitch（推荐 · 免费 · 不要信用卡）

> Glitch 是 Node.js + WebSocket 友好的免费托管平台。Render 要绑卡，Glitch 不需要。

## 一、为什么选 Glitch

- 完全免费，不要信用卡
- 原生支持 Node.js + WebSocket
- 5 分钟无活动会休眠（朋友开局时有人连着就不休眠，唤醒几秒）
- 国内访问比 Render 略慢但比 Render 强

## 二、准备

1. 你的代码已经**在本地 Git 仓库里**了（commit 4415125，分支 main）—— 已搞定 ✅
2. 需要一个 **GitHub 公开仓库**（Glitch 从 GitHub 拉代码）
3. 需要 **Glitch 账号**

## 三、推送代码到 GitHub（如果还没做）

1. 登录 <https://github.com> → 右上角 **+** → **New repository**
2. 仓库名填 `wh-baohuang`（或任意）→ **不要勾选** Add a README → Create
3. 在 `D:\WH保皇` 打开终端（不知道怎么打开？见文末），执行：

```bash
git remote add origin https://github.com/你的用户名/wh-baohuang.git
git push -u origin main
```



> 第一次 push 要登录 GitHub（现在要 Personal Access Token，不是密码；去 GitHub → Settings → Developer settings → Personal access tokens → Generate new token，勾选 `repo` 即可）

## 四、在 Glitch 部署

1. 打开 <https://glitch.com> → 用 **GitHub 一键登录**（最方便）
2. 右上角 **New Project** → 下拉到最下面 **Import from GitHub**
3. 输入你的仓库地址：`https://github.com/你的用户名/wh-baohuang.git`
4. 点 OK，Glitch 会从 GitHub 拉代码并自动 `npm install` + `npm start`
5. 等待 30-60 秒，左上角 Logs 看到「服务器已启动：<http://localhost:3000」就成功了>

## 五、开始玩

访问 Glitch 给你的链接（项目卡片右上角 **Show** → `https://你的项目名.glitch.me`）：

1. 房主打开链接 → 输入昵称 → **创建房间**
2. 把房间码 / 二维码发给 4 个朋友
3. 朋友打开链接 → 输入昵称 → **加入** → 输入房间码
4. 5 人齐 → 房主 **开始游戏**

## 六、自定义项目名（可选）

默认 Glitch 给你一个随机的英文项目名（如 `velvet-thunder`），想改成你自己的：

- 项目里点击左上角项目名 → 改为你想要的名字（影响域名）

## 七、改代码后怎么更新

```bash
git push
```

Glitch 会自动重新拉取并部署（约 30 秒）。

## 常见问题

- **唤醒慢**：休眠后第一次访问要 3-5 秒。朋友开局时一般有人连着，不会休眠。
- **国内访问**：能直连，可能不如 Render 快但比 Render 稳定（Render 国内经常连不上）。
- **Logs 看错误**：项目里点 Logs 面板，能看到 server.js 的 console.log。

## 附录：怎么在项目目录打开终端

- **方法 A（推荐）**：文件资源管理器进入 `D:\WH保皇` → 点击顶部地址栏 → 输入 `cmd` 回车
- **方法 B**：在 `D:\WH保皇` 文件夹空白处 `Shift + 右键` → 「在终端中打开」
- **方法 C**：`Win + R` → 输入 `cmd` → `cd /d D:\WH保皇`
