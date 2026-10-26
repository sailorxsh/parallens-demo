# Parallens

面向桌面浏览器的用户与设备经营看板原型，提供经营总览、A–G 专题分析、指标筛选、图表下钻和问题登记。

**在线访问：[Parallens 数据看板](https://sailorxsh.github.io/parallens-demo/)**

## 使用说明

- 所有业务数据均为模拟数据，统计周期、指标口径和可用筛选以页面说明为准。
- 问题记录保存在当前浏览器本地，不支持跨设备同步或多人协作；清除浏览器站点数据会删除这些记录。
- 项目为静态前端，使用 HTML、CSS、JavaScript 和 ECharts，无需后端服务。

## 本地运行

在仓库根目录执行：

```sh
python3 -m http.server 8765
```

打开 [本地看板](http://localhost:8765/)。请通过 HTTP 服务访问，不直接打开 HTML 文件。

## 构建与发布

需要 Node.js 和 Python 3。修改脚本或源数据后，重新生成按页数据包并验证：

```sh
node scripts/prepare_route_data.mjs
node --check app.js
python3 scripts/verify_data.py
python3 scripts/verify_trial_facts.py
bash scripts/build-site.sh
```

构建产物位于 `dist/`。推送到 `main` 后，GitHub Actions 自动验证并部署到 GitHub Pages；分享地址保持不变。

## 项目文件

- `app.js`、`style.css`、`index.html`：页面与交互。
- `data/`：模拟数据、指标定义和筛选规则。
- `scripts/`：数据生成、验证与构建脚本。
- [设计规范](docs/design-rules.md)：统一布局、字体、配色与交互要求。
