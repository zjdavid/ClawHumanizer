# 🐾 Claw Humanizer

**OpenClaw plugin that makes AI responses feel human.**

Dynamic inbound delays + chunked outbound sending = natural conversation rhythm.

---

## ✨ Features

### Inbound Delay (Dynamic Modes)

| Mode | Trigger | Delay | Behavior |
|------|---------|-------|----------|
| 🟢 **Attention** | Last contact < 10min | 2–10s | Normal response |
| 🟡 **Awake** | Last contact ≥ 10min + daytime | 10s–5min | Slow response |
| 🔴 **Sleep** | Last contact ≥ 10min + nighttime | — | Auto-reply "I'm sleeping"; 3 messages to wake |

```
              ┌──────────────────────────────────┐
              │       State Machine              │
              │                                  │
   idle>10m   │  ┌───────┐   awake hrs  ┌──────┐ │
  ────────────┼─►│ Check │────────────►│ Awake │ │
              │  │Schedule│             └──────┘ │
              │  │       │   sleep hrs  ┌──────┐ │
              │  │       │────────────►│ Sleep │ │
              │  └───────┘             └──┬───┘ │
              │                    ≥3 msg │     │
   idle<10m   │  ┌──────────┐◄───────────┘     │
  ────────────┼─►│Attention │                   │
              │  └──────────┘                   │
              └──────────────────────────────────┘
```

### Outbound Chunking

Long AI responses are automatically split into multiple messages:
- Split at natural boundaries (paragraphs → sentences → hard limit)
- Each chunk sent with a simulated typing delay
- Pause between chunks for natural conversation flow

---

## 📦 Installation

### Option A: Link for development

```bash
openclaw plugins install -l /path/to/ClawHumanizer
```

### Option B: Copy install

```bash
openclaw plugins install /path/to/ClawHumanizer
```

### Option C: npm (once published)

```bash
openclaw plugins install claw-humanizer
```

Then restart the Gateway.

---

## ⚙️ Configuration

Add to your `openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "claw-humanizer": {
        "enabled": true,
        "config": {
          "enabled": true,
          "inbound": {
            "idleThreshold": 600000,
            "attention": { "minDelay": 2000, "maxDelay": 10000 },
            "awake": { "minDelay": 10000, "maxDelay": 300000 },
            "sleep": {
              "autoReplyText": "我已经睡了，连发三条消息可以唤醒我",
              "wakeUpCount": 3
            },
            "schedule": {
              "awakeStart": "08:00",
              "awakeEnd": "23:00",
              "timezone": "Asia/Shanghai"
            }
          },
          "outbound": {
            "charsPerChunk": 80,
            "delayPerChar": 50,
            "chunkDelay": 1500,
            "maxChunks": 10
          }
        }
      }
    }
  }
}
```

### Config Reference

| Key | Default | Description |
|-----|---------|-------------|
| `enabled` | `true` | Global on/off switch |
| `inbound.idleThreshold` | `600000` | Idle time (ms) before switching to Awakening mode |
| `inbound.attention.minDelay` | `2000` | Attention mode min delay (ms) |
| `inbound.attention.maxDelay` | `10000` | Attention mode max delay (ms) |
| `inbound.awake.minDelay` | `10000` | Awake mode min delay (ms) |
| `inbound.awake.maxDelay` | `300000` | Awake mode max delay (ms) |
| `inbound.sleep.autoReplyText` | `"我已经睡了..."` | Auto-reply text during sleep |
| `inbound.sleep.wakeUpCount` | `3` | Messages needed to wake from sleep |
| `inbound.schedule.awakeStart` | `"08:00"` | Awake period start (HH:MM) |
| `inbound.schedule.awakeEnd` | `"23:00"` | Awake period end (HH:MM) |
| `inbound.schedule.timezone` | `"Asia/Shanghai"` | IANA timezone |
| `outbound.charsPerChunk` | `80` | Max characters per message chunk |
| `outbound.delayPerChar` | `50` | Typing delay per character (ms) |
| `outbound.chunkDelay` | `1500` | Pause between chunks (ms) |
| `outbound.maxChunks` | `10` | Maximum number of chunks |

---

## 🎮 Commands

| Command | Description |
|---------|-------------|
| `/humanizer` | Show plugin status |
| `/humanizer status` | Show detailed status with sender states |
| `/humanizer on` | Enable the plugin |
| `/humanizer off` | Disable the plugin |
| `/humanizer reset` | Reset all sender states |

---

## 🏗️ Project Structure

```
ClawHumanizer/
├── package.json            # npm package config
├── tsconfig.json           # TypeScript config
├── openclaw.plugin.json    # OpenClaw plugin manifest
├── README.md               # This file
└── src/
    ├── index.ts            # Plugin entry point
    ├── types.ts            # Type definitions & defaults
    ├── delay-engine.ts     # Pure utility functions
    ├── state-manager.ts    # Per-sender state machine
    ├── inbound-queue.ts    # Inbound delay handler
    └── outbound-sender.ts  # Outbound chunk sender
```

---

## License

MIT

---

---

# 🐾 Claw Humanizer（中文文档）

**OpenClaw 插件 —— 让 AI 回复的节奏像真人一样。**

通过动态入站延迟 + 出站分段发送，模拟自然的对话节奏。

---

## ✨ 功能特性

### 入站延迟（动态模式）

| 模式 | 触发条件 | 延迟 | 行为 |
|------|---------|------|------|
| 🟢 **关注模式** | 距上次联系 < 10分钟 | 2–10秒 | 正常响应 |
| 🟡 **唤醒-清醒** | 距上次联系 ≥ 10分钟 + 白天 | 10秒–5分钟 | 慢速响应 |
| 🔴 **唤醒-睡眠** | 距上次联系 ≥ 10分钟 + 夜间 | — | 自动回复"我睡了"；连发3条可唤醒 |

**状态转移逻辑：**

1. 收到消息时，计算与上次联系的时间间隔
2. 间隔 < 10分钟 → **关注模式**（2–10秒延迟）
3. 间隔 ≥ 10分钟 → 查看当前时段：
   - 在清醒时段（默认 08:00–23:00）→ **唤醒-清醒**（10秒–5分钟延迟）
   - 在睡眠时段 → **唤醒-睡眠**：
     - 累积消息 < 3条 → 自动回复"我已经睡了，连发三条消息可以唤醒我"
     - 累积消息 ≥ 3条 → 切换到**关注模式**，正常响应

### 出站分段发送

长回复自动拆分为多条消息：
- 按自然断点拆分（段落 → 句子 → 固定字数）
- 每段发送前模拟打字延迟（延迟 = 字数 × 每字延迟）
- 段间有自然停顿

---

## 📦 安装

### 方式一：开发模式链接

```bash
openclaw plugins install -l /path/to/ClawHumanizer
```

### 方式二：复制安装

```bash
openclaw plugins install /path/to/ClawHumanizer
```

### 方式三：npm 安装（发布后）

```bash
openclaw plugins install claw-humanizer
```

安装后重启 Gateway 即可生效。

---

## ⚙️ 配置

在 `openclaw.json` 中添加：

```json
{
  "plugins": {
    "entries": {
      "claw-humanizer": {
        "enabled": true,
        "config": {
          "enabled": true,
          "inbound": {
            "idleThreshold": 600000,
            "attention": { "minDelay": 2000, "maxDelay": 10000 },
            "awake": { "minDelay": 10000, "maxDelay": 300000 },
            "sleep": {
              "autoReplyText": "我已经睡了，连发三条消息可以唤醒我",
              "wakeUpCount": 3
            },
            "schedule": {
              "awakeStart": "08:00",
              "awakeEnd": "23:00",
              "timezone": "Asia/Shanghai"
            }
          },
          "outbound": {
            "charsPerChunk": 80,
            "delayPerChar": 50,
            "chunkDelay": 1500,
            "maxChunks": 10
          }
        }
      }
    }
  }
}
```

### 配置参考

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `enabled` | `true` | 全局开关 |
| `inbound.idleThreshold` | `600000` | 空闲阈值（毫秒），超过则进入唤醒模式 |
| `inbound.attention.minDelay` | `2000` | 关注模式最小延迟（毫秒） |
| `inbound.attention.maxDelay` | `10000` | 关注模式最大延迟（毫秒） |
| `inbound.awake.minDelay` | `10000` | 清醒模式最小延迟（毫秒） |
| `inbound.awake.maxDelay` | `300000` | 清醒模式最大延迟（毫秒） |
| `inbound.sleep.autoReplyText` | `"我已经睡了..."` | 睡眠时自动回复文本 |
| `inbound.sleep.wakeUpCount` | `3` | 唤醒所需消息数 |
| `inbound.schedule.awakeStart` | `"08:00"` | 清醒时段开始（HH:MM） |
| `inbound.schedule.awakeEnd` | `"23:00"` | 清醒时段结束（HH:MM） |
| `inbound.schedule.timezone` | `"Asia/Shanghai"` | 时区 |
| `outbound.charsPerChunk` | `80` | 每段最大字符数 |
| `outbound.delayPerChar` | `50` | 每字符打字延迟（毫秒） |
| `outbound.chunkDelay` | `1500` | 段间停顿（毫秒） |
| `outbound.maxChunks` | `10` | 最大分段数 |

---

## 🎮 命令

| 命令 | 说明 |
|------|------|
| `/humanizer` | 显示插件状态 |
| `/humanizer status` | 显示详细状态（含每个发送者的模式） |
| `/humanizer on` | 启用插件 |
| `/humanizer off` | 禁用插件 |
| `/humanizer reset` | 重置所有发送者状态 |

---

## 🏗️ 项目结构

```
ClawHumanizer/
├── package.json            # npm 包配置
├── tsconfig.json           # TypeScript 配置
├── openclaw.plugin.json    # OpenClaw 插件清单
├── README.md               # 本文件
└── src/
    ├── index.ts            # 插件入口
    ├── types.ts            # 类型定义 & 默认值
    ├── delay-engine.ts     # 纯函数工具库
    ├── state-manager.ts    # 状态机（关注/唤醒/睡眠）
    ├── inbound-queue.ts    # 入站延迟处理
    └── outbound-sender.ts  # 出站分段发送
```

---

## 许可证

MIT
