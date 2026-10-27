#!/bin/sh
set -eu
finish() {
  if [ -t 0 ]; then
    printf '\n按回车关闭窗口。'
    read -r answer || true
  fi
}
trap finish EXIT
fail() { printf '\n更新未完成：%s\n' "$1"; exit 1; }
cd "$(dirname "$0")"
command -v git >/dev/null 2>&1 || fail '未找到 Git，请先安装 Git 或 macOS 命令行工具。'
[ "$(git rev-parse --show-prefix)" = '' ] || fail '请从仓库根目录启动。'
case "$(git remote get-url origin)" in
  https://github.com/Gintma/Farm-assistant.git|git@github.com:Gintma/Farm-assistant.git) ;;
  *) fail '仓库地址与 Farm-assistant 不符，已停止。' ;;
esac
[ "$(git branch --show-current)" = main ] || fail '当前不是 main 分支，请先处理本地开发分支。'
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail '有尚未提交的本地修改，已保留原文件；请先处理修改再更新。'
printf '正在更新农场助手……\n'
git pull --ff-only origin main || fail '请检查网络、GitHub 登录或分支历史；未执行强制覆盖。'
printf '\n代码已同步。版本：'
git log -1 --format='%h %s'
printf '\n接下来：\n1. 等当前战斗结束、农务操作完成。\n2. 打开浏览器扩展管理页，点击农场助手的“重新加载”。\n3. 刷新游戏，核对助手版本和开关。\n\n更新不删除浏览器中的账号设置。请保留原 extension 路径，不要删除后重新安装扩展。\n'
