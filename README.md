# AI Daily

每日自动聚合 AI 前沿资讯的静态网页。RSS 抓取 → 去重排序 → 生成 JSON → 静态页面渲染，历史存档可回溯。

## 本地预览

```bash
python3 -m http.server 8080
# 打开 http://localhost:8080
```

## 手动更新一次数据

```bash
pip install -r scripts/requirements.txt
python3 scripts/fetch_news.py
```

会生成/更新：
- `data/archive/<分类>/<日期>.json`：当天该分类的精选条目
- `data/latest.json`：每个分类最新日期
- `data/archive/index.json`：每个分类的历史日期列表

## 部署到 GitHub Pages（每天自动更新）

1. 在 GitHub 新建一个仓库（public 或 private 均可，Pages 免费版需要 public，或 private + GitHub Pro）。
2. 把本目录内容推送上去：
   ```bash
   git init
   git add .
   git commit -m "init: AI Daily"
   git branch -M main
   git remote add origin <你的仓库地址>
   git push -u origin main
   ```
3. 打开仓库 **Settings → Pages**，Source 选择 `Deploy from a branch`，分支选 `main`，目录选 `/ (root)`，保存。几分钟后即可通过 `https://<你的用户名>.github.io/<仓库名>/` 访问。
4. 打开仓库 **Settings → Actions → General**，把 "Workflow permissions" 设为 **Read and write permissions**（否则自动更新后 Action 无法推送提交）。
5. 完成。`.github/workflows/update-news.yml` 里配置的定时任务会每天 UTC 22:00（即北京时间 06:00）自动抓取、生成新数据并提交，Pages 会随之自动重新部署。

也可以随时去 Actions 页面手动点 "Run workflow" 立即触发一次更新。

> 注：GitHub Actions 的 `schedule` 触发在仓库长期无任何活动（约 60 天没有 push）时会被自动暂停，需要手动跑一次或推送一次代码来重新激活。

## 修改每天更新的时间

编辑 `.github/workflows/update-news.yml` 里的 cron 表达式（**GitHub Actions 的 cron 使用 UTC 时间**）：

```yaml
schedule:
  - cron: "0 22 * * *"   # UTC 22:00 = 北京时间次日 06:00
```

换算公式：`目标北京时间 - 8 小时 = 该填的 UTC 小时`（例如想要北京时间 08:00 更新，就填 `0 0 * * *`）。

## 增加/开启新分类（如游戏、科学）

编辑 `config/categories.json`：

```json
{
  "id": "games",
  "name": "游戏",
  "enabled": true,
  "topCount": 10,
  "maxPerSource": 2,
  "feeds": [
    { "source": "IGN", "url": "https://feeds.ign.com/ign/all" }
  ]
}
```

- `enabled: true` 才会被抓取和展示。
- `feeds` 可以填任意标准 RSS/Atom 地址，抓取脚本会自动去重、按时间和来源多样性排序，取前 `topCount` 条。
- `maxPerSource` 控制单个来源最多能占多少条，避免某个高产来源（比如 arXiv）刷屏。
- 网页顶部的分类切换标签会在检测到多个分类已有数据时自动出现，无需改前端代码。

## 目录结构

```
ai-daily/
├── index.html / style.css / script.js   前端页面
├── config/categories.json               分类与 RSS 源配置
├── data/                                自动生成的数据（latest.json、archive/）
├── scripts/fetch_news.py                抓取与生成脚本
└── .github/workflows/update-news.yml    每日定时任务
```
