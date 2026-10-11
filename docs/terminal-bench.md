# Terminal-Bench 2.1

AelionBot's engine also runs without the desktop app. `node dist-electron/cli.cjs` (`pnpm run headless`) runs one Bot task against a project folder with the same tools, planning, permission checks and context handling. We used it to run [Terminal-Bench 2.1](https://www.tbench.ai/news/terminal-bench-2-1): 89 hard command-line tasks, each graded by its own tests.

## 简体中文

### 结果

| 配置 | Terminal-Bench 2.1 |
| --- | --- |
| AelionBot + Grok 4.5（high），自行运行 | **82.4%**（267 次试验通过 220 次） |
| Cursor CLI + Grok 4.5（high），[官方榜单](https://tbench.ai/leaderboard/terminal-bench/2.1) | 79.3% ±1.5（2026-07-08） |

- 89 道题，每题 3 次，共 267 次试验，平均通过率 82.4%。按题计算，95% 置信区间是 75.6%–89.2%。
- 按题统计：65 道 3 次全过，9 道过 2 次，7 道过 1 次，8 道全部失败。逐题结果见 [results-2.1-grok-4.5-high.csv](../scripts/benchmarks/terminal-bench/results-2.1-grok-4.5-high.csv)。
- 失败的试验里：31 次是答案没通过测试，14 次是 Agent 超时，2 次是基础设施问题（一次进程被系统杀掉，一次验证超时，按失败计）。

### 怎么读这个数字

- 这是我们自己的一次运行，不是榜单条目。榜单要求每题至少 5 次并经过核验，我们跑的是 3 次。
- 82.4% 比榜单上的 79.3% 高 3.1 个百分点，但我们这次运行的置信区间半宽约 6.8 个百分点，所以它说明“不低于”官方这套配置，不足以证明“显著更高”。
- 榜单条目是 Cursor 自家的 CLI 外壳加同一个模型；这里比较的主要是外壳（工具、提示词、规划和上下文处理）。

### 运行方式

- 评测框架：[Harbor](https://github.com/laude-institute/harbor) 0.24.0，数据集 `terminal-bench/terminal-bench-2-1`（摘要 `sha256:7d7bdc1c…699a`），`-n 6 -k 3`，总用时 6 小时 4 分。
- 代码：由提交 `369fbdb` 构建，随 v0.42.2 发布。命令行用 `--permission full` 在每道题自己的容器里运行。
- 模型：Grok 4.5，推理强度 high，通过 Responses 协议调用。
- 工具：网页搜索、网页阅读、MCP、记忆、历史检索和技能写入等工具全部关闭，Agent 只用终端、文件和看图工具，和其他外壳的条件一致。
- 环境修正：Debian 11 的两道 QEMU 题的验证镜像里，`apt` 源已经迁到 archive.debian.org，验证脚本装不上依赖。适配器在安装步骤把源改到归档站，发生在 Agent 开始之前，Agent 看不到。除此之外没有改动 Harbor 和题目。
- 一次验证超时的试验没有得到评分，按失败计入 267 次。

### 复现

文件都在 [scripts/benchmarks/terminal-bench](../scripts/benchmarks/terminal-bench)：

- `aelion_agent.py`：Harbor 适配器，把打包好的命令行上传到题目容器里运行。
- `make-bundle.sh`：用 `pnpm run build` 的产物和 Node 24 打出 `aelion.tar.gz`。
- `model-settings.sh`、`run.sh`：模型设置和启动命令。API Key 放在 `~/.aelion-key.env`，不要写进仓库。

```sh
pnpm run build
./scripts/benchmarks/terminal-bench/make-bundle.sh   # edit the paths at the top for your machine
mkdir -p ~/bench && cp scripts/benchmarks/terminal-bench/{aelion_agent.py,run.sh} ~/bench/
cp scripts/benchmarks/terminal-bench/model-settings.sh ~/bench/model.env   # then fill in your endpoint
~/bench/run.sh my-run -d terminal-bench/terminal-bench-2-1 -n 6 -k 3
```

## English

### Result

| Setup | Terminal-Bench 2.1 |
| --- | --- |
| AelionBot + Grok 4.5 (high), our own run | **82.4%** (220 of 267 trials passed) |
| Cursor CLI + Grok 4.5 (high), [official leaderboard](https://tbench.ai/leaderboard/terminal-bench/2.1) | 79.3% ±1.5 (2026-07-08) |

- 89 tasks, 3 attempts each, 267 trials, mean pass rate 82.4%. Computed per task, the 95% confidence interval is 75.6%–89.2%.
- By task: 65 passed all 3 attempts, 9 passed 2, 7 passed 1 and 8 failed every attempt. Per-task results are in [results-2.1-grok-4.5-high.csv](../scripts/benchmarks/terminal-bench/results-2.1-grok-4.5-high.csv).
- Of the failed trials, 31 produced an answer that did not pass the tests, 14 hit the agent timeout and 2 were infrastructure problems (a process killed by the system, and a verifier timeout, counted as a failure).

### How to read the number

- This is our own run, not a leaderboard entry. The leaderboard asks for at least 5 attempts per task and verifies the run; we ran 3.
- 82.4% is 3.1 points above the leaderboard's 79.3%, but our run's confidence interval has a half-width of about 6.8 points. It shows the harness is at least on par with that setup; it does not prove a significantly higher score.
- The leaderboard entry pairs the same model with Cursor's own CLI harness, so the comparison is mainly of harnesses: tools, prompts, planning and context handling.

### How it was run

- Framework: [Harbor](https://github.com/laude-institute/harbor) 0.24.0, dataset `terminal-bench/terminal-bench-2-1` (digest `sha256:7d7bdc1c…699a`), `-n 6 -k 3`, 6 h 4 min in total.
- Code: built from commit `369fbdb`, released as v0.42.2. The CLI ran with `--permission full` inside each task's own container.
- Model: Grok 4.5 with reasoning effort high, over the Responses protocol.
- Tools: web search, web reading, MCP, memory, history search and skill-writing tools were turned off, so the agent works from the terminal, files and image viewing, like the other harnesses.
- Environment fix: in the verifier images of two Debian 11 QEMU tasks the `apt` sources had moved to archive.debian.org, so the test script could not install its dependencies. The adapter points `apt` at the archive during the install step, before the agent starts, and the agent cannot see it. Harbor and the tasks are otherwise unchanged.
- One trial hit a verifier timeout and has no grade; it is counted as a failure among the 267.

### Reproducing it

Everything is in [scripts/benchmarks/terminal-bench](../scripts/benchmarks/terminal-bench):

- `aelion_agent.py`: the Harbor adapter, which uploads the packaged CLI into each task container.
- `make-bundle.sh`: builds `aelion.tar.gz` from the `pnpm run build` output and Node 24.
- `model-settings.sh` and `run.sh`: model settings and the launch command. Keep the API key in `~/.aelion-key.env`, never in the repository.

```sh
pnpm run build
./scripts/benchmarks/terminal-bench/make-bundle.sh   # edit the paths at the top for your machine
mkdir -p ~/bench && cp scripts/benchmarks/terminal-bench/{aelion_agent.py,run.sh} ~/bench/
cp scripts/benchmarks/terminal-bench/model-settings.sh ~/bench/model.env   # then fill in your endpoint
~/bench/run.sh my-run -d terminal-bench/terminal-bench-2-1 -n 6 -k 3
```
