# Parallens 桌面数据看板原型

本仓库是静态网页原型，数据均为演示用模拟数据。当前分享地址：https://sailorxsh.github.io/parallens-demo/ 。

本地预览：在仓库根目录运行 `python3 -m http.server 8765`，浏览器打开 `http://127.0.0.1:8765/`。

GitHub Actions 在 `main` 分支每次推送后运行数据校验和 `bash scripts/build-site.sh`，将 `dist/` 中的网页、ECharts 和 JSON 数据发布到 GitHub Pages。原型截图和数据生成脚本不进入发布产物。仓库本身是公开的，因此源码与提交历史可供查看。原 Netlify 站点 https://parallens-demo.netlify.app/ 保留，但已停止自动构建，不再随此仓库更新。

数据校验：`python3 scripts/verify_data.py`、`python3 scripts/verify_trial_facts.py`。其中指标 #18 由合成试用明细按筛选重算，其他指标按模拟分片估算；不要把原型数值当作真实经营数据。

`data/entity-samples.json` 只供 C 页设备和 G 页异常事件的逐条详情交互使用，不参与总体指标计算。G 页样本没有逐条筛选维度，筛选后不展示这些样本。
