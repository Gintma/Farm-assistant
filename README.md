# Farm-assistant

Farming Season 农场助手，目前版本 **1.20.2**。包含田地、动物、作坊、次日订单备货、日常、收益进度与战斗功能。

本版战斗在页面仍可见时允许失焦继续，包含自动选卡和目标金币撤退；页面隐藏、游戏暂停、验证和手动接管仍停止自动输入。

本版新增：真实战斗结束并收到游戏服务器返回的排名结果后，页面连续5秒无手动操作，自动点击回村庄，农务按原开关继续。操作会重置倒计时，Esc 取消本局返回。页面隐藏、验证或结算未确认时等待；教程和大厅不会触发。

## 两台电脑首次安装

每台电脑各安装一次 Git，并在希望长期保存助手的位置打开终端，执行：

```sh
git clone https://github.com/Gintma/Farm-assistant.git
```

如果仓库设为私有，需要使用有访问权限的 GitHub 账号登录。不要把密码、访问令牌或钱包资料写进代码、仓库地址或说明文件。

打开 Chrome 的 `chrome://extensions`（Brave 使用 `brave://extensions`），开启开发者模式，点击“加载已解压的扩展程序”，选择下载目录里的 **extension** 文件夹。不要选择整个仓库。

从旧 ZIP 版迁移时，请先在原助手里记下开关和配置，再停用旧扩展，加载新目录。首次更换安装路径可能产生新的扩展身份，原设置不一定自动迁移；目前没有设置导入功能。迁移完成后一直保留同一个目录和扩展，不要重复删除安装。

Mac 双击“更新助手.command”可更新。如果 Finder 不允许执行，可在终端进入仓库后运行：

```sh
sh 更新助手.command
```

## 以后更新

1. Mac 双击 **更新助手.command**；其他系统在仓库里执行 `git pull --ff-only origin main`。
2. 等战斗结束、农务操作完成，在浏览器扩展管理页点击助手的“重新加载”。
3. 刷新游戏，核对版本。遇到游戏更新仍需按面板检查兼容后确认。

**Git 同步代码，不自动重新加载浏览器扩展。** 每台电脑需分别更新。后续在相同目录、相同浏览器配置下更新，账号设置保留；设置不会通过 Git 在两台电脑间同步。

一键更新仅允许 main 分支快进，有本地修改或历史分叉就停止，不强制覆盖。直接下载 GitHub ZIP 不包含 Git 历史，不能使用这个更新入口。

## 给维护者 / AI

- `src/`：15 个功能模块，编辑这里。
- `extension/`：浏览器加载的固定目录，包含已构建的启动文件。
- `scripts/build.py`：拼接模块、同步版本、生成 ZIP。
- `dist/`：本地生成的 ZIP 和独立启动脚本，不提交 Git。
- `extension/安装说明.md`：功能和运行规则说明。

修改代码后执行：

维护电脑需安装 Python 3；安装 Node.js 才能同时运行战斗回归检查，缺少 Node 时会显示跳过。使用电脑只需 Git 和浏览器。

```sh
python3 scripts/build.py
python3 -m unittest discover -s tests -v
```

发布前更新构建脚本中的版本号，并同步 README 和安装说明；提交 `src/` 与构建后的 `extension/`。其他电脑只拉取发布文件，不需要安装 Python 或 Node。

```sh
git add src extension scripts tests README.md AGENTS.md .gitignore 更新助手.command
git commit -m "Release helper update"
git push origin main
```

只上传助手自己的代码、说明和测试。不得提交账号快照、网络记录、钱包/登录数据、原游戏资源、研究抓取或浏览器配置。当前仓库不包含单独的快速战斗项目。
