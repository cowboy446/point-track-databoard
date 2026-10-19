# QuARC · Point Track Databoard

中文具身点流数据总表，入口为根目录 `index.html`。

- InternData：29,459 条，合并 node42 / node43，含 Franka 与 Split Aloha。
- LIBERO：6,500 条，Franka Panda。
- RoboTwin：11,500 条，5 种双臂本体。
- RoboCasa365：10,000 条，PandaOmron。
- 合计 57,459 条、237.18 小时、10.18 TB。
- 9 种数据集 × 本体组合，每组 5 条多视角 RGB-D 与三维点流 MP4。
- H5-v6 目录树、各字段形状 / 类型 / 属性，以及读取示例。

## 排版与文案

排版参考 https://pantheon.inc/research/argus ，使用浅灰纸面、细线分隔、大标题和左侧目录。
文案编辑使用 https://github.com/renky1025/agent-skills/tree/main/de-ai-writing 。

## GitHub Pages

仓库 Settings → Pages → Source 选择 **GitHub Actions**。
工作流 `.github/workflows/pages.yml` 将根目录静态内容部署到：

https://cowboy446.github.io/point-track-databoard/

`data/` 保存统计、抽样、视频校验与实际 H5 结构元数据；`assets/` 保存样式、脚本、MP4、封面与联系表。
