# Parallens 桌面数据看板原型

本仓库是静态网页原型，数据均为演示用模拟数据。当前分享地址：https://sailorxsh.github.io/parallens-demo/ 。

本地预览：在仓库根目录运行 `python3 -m http.server 8765`，浏览器打开 `http://127.0.0.1:8765/`。

GitHub Actions 在 `main` 分支每次推送后运行数据校验和 `bash scripts/build-site.sh`，将 `dist/` 中的网页、ECharts 和 JSON 数据发布到 GitHub Pages。原型截图和数据生成脚本不进入发布产物。仓库本身是公开的，因此源码与提交历史可供查看。原 Netlify 站点 https://parallens-demo.netlify.app/ 保留，但已停止自动构建，不再随此仓库更新。

数据校验：`python3 scripts/verify_data.py`、`python3 scripts/verify_trial_facts.py`、`node scripts/verify_projection.mjs`。#18 使用 12,000 条合成试用明细，可按国家、App/订阅平台、产品线、套餐、计费周期和成熟周交集重算；#39 使用互斥的国家×产品线×主型号样本；#02/#06 同源于互斥订阅状态；#21 使用分产品线闭合的合成订阅流水；#27 使用逐功能合成人数且保持活跃主账号分母；#29 使用最近活跃间隔分层和独立回流批次；#45/#46 使用型号×固件请求事实。其余多维交叉仍含模拟分片估算，不能把原型数值当作真实经营数据。

时间口径：完整周成熟批次为 W1–W12，截止 2026-09-13；当前经营快照截至 2026-09-24。历史经营快照是每隔7天构造的演示序列，不能当作 W1–W12 的实际批次历史。统计周仅显示在有周度事实的诊断页，不套用到快照指标。尚无可核验的任意日期区间事实，因此原型不提供自由日期范围。

`data/filter-policy.json` 是 53 项指标的业务筛选适用表：每项分别列出业务适用维度、当前演示可算维度和待补明细维度。正式账号默认排除测试账号，试用是订阅状态而非互斥用户类型；Bird 为 Free/Plus/Pro，Hunting 为 Starter/Plus/Pro。控件按页面范围、模块细分、分析视角、业务规则和成熟统计周分组。只对关联指标生效；业务适用但缺少同范围事实显示“待补数据”，真正口径排除的组合显示“不适用”。切换页面及浏览器前进后退保留有效条件。订阅页演示问题单可关联参与聚合的试用记录，保存筛选范围、基线、负责人、验收条件和复查结果，但只存于当前浏览器。真实上线还需接入可靠的数据源、共享问题单存储、权限和审计；目前没有自动计算目标是否达成。

模拟数据生成顺序：运行 `scripts/generate_data.py` 后运行 `scripts/generate_trial_facts.py`、`scripts/generate_model_market.py`、`scripts/generate_filter_policy.py`，再执行上述校验。基础生成脚本保留已人工核对的指标目录、口径表与诊断文案，不会覆盖这些文件。

`data/entity-samples.json` 只供 C 页设备和 G 页异常事件的逐条详情交互使用，不参与总体指标计算。G 页样本没有逐条筛选维度，筛选后不展示这些样本。
