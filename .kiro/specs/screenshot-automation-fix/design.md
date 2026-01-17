# Design Document

## Overview

本设计文档描述了 Electron 自动化截图粘贴工具的修复和改进方案。主要解决现有代码中的窗口状态管理问题（导致应用无响应），并添加下移距离配置功能。

核心改进包括：
- 修复覆盖层窗口的创建和销毁逻辑
- 改进 pick-point 功能的异步处理和错误恢复
- 添加下移距离（offset distance）配置
- 优化批量任务执行逻辑，支持位置动态调整

## Architecture

应用采用 Electron 架构，分为三个主要部分：

1. **Main Process (electron/main.js)**: 
   - 管理窗口生命周期（主窗口和覆盖层窗口）
   - 处理 IPC 通信
   - 执行系统级操作（截图、鼠标点击、键盘输入）
   - 管理批量任务执行

2. **Renderer Process (src/App.jsx)**:
   - 主界面 UI 和用户交互
   - 配置管理（裁剪区域、左右源位置、循环次数、下移距离）
   - 状态显示和用户反馈

3. **Overlay Window (src/Overlay.jsx)**:
   - 全屏透明覆盖层
   - 支持两种模式：裁剪模式（crop）和位置选择模式（pick）
   - 处理用户的区域选择和位置点击

## Components and Interfaces

### 1. Main Process Components

#### Window Manager
负责窗口的创建、显示、隐藏和销毁。

**关键函数：**
```javascript
// 确保主窗口可见并聚焦
function ensureMainWindowVisible()

// 确保覆盖层窗口关闭并清理
function ensureOverlayClosed()

// 创建主窗口
function createMainWindow()

// 创建覆盖层窗口
function createOverlayWindow()
```

**修复要点：**
- 在创建新覆盖层窗口前，检查并清理已销毁的窗口引用
- 在所有错误路径中调用 `ensureOverlayClosed()` 和 `ensureMainWindowVisible()`
- 添加窗口状态检查，避免操作已销毁的窗口

#### IPC Handlers

**pick-point Handler**
```javascript
ipcMain.handle('pick-point', async () => {
  // 1. 检查是否有正在进行的 pick 操作
  // 2. 创建覆盖层窗口（pick 模式）
  // 3. 加载 URL 并等待页面加载完成
  // 4. 显示覆盖层，隐藏主窗口
  // 5. 等待用户点击或超时（30秒）
  // 6. 返回位置坐标或 null
  // 7. 清理：关闭覆盖层，恢复主窗口
})
```

**修复要点：**
- 添加 Promise 缓存机制，防止重复调用
- 添加 30 秒超时保护
- 改进错误处理：URL 加载失败时重试 3 次
- 在所有错误分支中确保窗口状态恢复

**start-batch Handler**
```javascript
ipcMain.handle('start-batch', async (_event, config) => {
  // 1. 检查是否已在运行
  // 2. 读取裁剪区域配置
  // 3. 最小化主窗口
  // 4. 循环执行：
  //    a. 点击右源位置（使用当前坐标）
  //    b. 截取裁剪区域并保存到剪切板
  //    c. 点击左源位置（使用当前坐标）
  //    d. 粘贴剪切板内容
  //    e. 如果 offsetDistance > 0，更新左右源位置的 Y 坐标
  // 5. 完成后恢复主窗口
})
```

**新增功能：**
- 接收 `offsetDistance` 参数
- 在每次循环后更新左右源位置：
  ```javascript
  leftSourcePos.y += offsetDistance
  rightSourcePos.y += offsetDistance
  ```

### 2. Renderer Components

#### App Component State

```javascript
const [cropRegion, setCropRegion] = useState(null)
const [leftSourcePos, setLeftSourcePos] = useState(null)
const [rightSourcePos, setRightSourcePos] = useState(null)
const [loopCount, setLoopCount] = useState(3)
const [offsetDistance, setOffsetDistance] = useState(0) // 新增
const [isRunning, setIsRunning] = useState(false)
const [statusText, setStatusText] = useState('')
const [statusType, setStatusType] = useState('')
```

#### UI Layout

```
┌─────────────────────────────────────┐
│  批量自动化工具                      │
├─────────────────────────────────────┤
│  步骤 1: 设置裁剪区域                │
│  [设置裁剪区域] 或 [✓ 裁剪区域已设置]│
├─────────────────────────────────────┤
│  步骤 2: 设置左源位置                │
│  [设置左源位置] 或 [✓ 左源位置已设置]│
├─────────────────────────────────────┤
│  步骤 3: 设置右源位置                │
│  [设置右源位置] 或 [✓ 右源位置已设置]│
├─────────────────────────────────────┤
│  步骤 4: 循环次数  [3]               │
├─────────────────────────────────────┤
│  步骤 5: 下移距离  [0] 像素          │  ← 新增
├─────────────────────────────────────┤
│  [开始执行] 或 [停止执行 (ESC)]      │
├─────────────────────────────────────┤
│  提示：操作流程说明                  │
└─────────────────────────────────────┘
```

#### Overlay Component Modes

**Crop Mode (裁剪模式)**
- 显示可拖动和调整大小的裁剪框
- 用户可以调整位置和大小
- 点击"确定"保存裁剪区域

**Pick Mode (位置选择模式)**
- 全屏半透明遮罩（rgba(0,0,0,0.2)）
- 十字光标（cursor: crosshair）
- 屏幕中央显示大号提示："🖱️ 请点击目标位置"
- 顶部显示操作说明："点击屏幕上任意位置设置窗口焦点位置"
- 点击任意位置记录坐标并关闭

## Data Models

### Configuration Data

```typescript
interface CropRegion {
  x: number        // 裁剪区域左上角 X 坐标（DIP）
  y: number        // 裁剪区域左上角 Y 坐标（DIP）
  width: number    // 裁剪区域宽度（DIP）
  height: number   // 裁剪区域高度（DIP）
}

interface Position {
  x: number        // 屏幕坐标 X（物理像素）
  y: number        // 屏幕坐标 Y（物理像素）
}

interface BatchConfig {
  loopCount: number           // 循环次数
  leftSourcePos: Position     // 左源位置
  rightSourcePos: Position    // 右源位置
  offsetDistance: number      // 下移距离（像素）
}
```

### Status Messages

```typescript
type StatusMessage = 
  | 'capturing'                    // 处理中
  | 'copied'                       // 裁剪区域已设置
  | 'copy_failed'                  // 操作失败
  | 'cancelled'                    // 已取消
  | `batch-progress:${current}:${total}`  // 进度
  | 'batch-complete'               // 批量操作完成
  | 'batch-stopped'                // 批量操作已停止
  | `batch-error:${message}`       // 批量执行失败
  | `pick-point-failed:${message}` // 位置设置失败
```

## Correctness Properties

*属性是一个特征或行为，应该在系统的所有有效执行中保持为真——本质上是关于系统应该做什么的形式化陈述。属性作为人类可读规范和机器可验证正确性保证之间的桥梁。*

### Property 1: 裁剪区域数据持久化往返一致性
*对于任意*有效的裁剪区域配置，保存到本地存储后再读取，应该得到相同的坐标值（x, y, width, height）。
**Validates: Requirements 1.2, 1.5**

### Property 2: 位置坐标记录准确性
*对于任意*用户在覆盖层中点击的位置，系统记录的屏幕坐标应该与实际点击位置的坐标一致。
**Validates: Requirements 2.3, 3.3**

### Property 3: 循环次数输入验证
*对于任意*用户输入的循环次数值，系统应该确保最终存储的值为大于等于 1 的整数。
**Validates: Requirements 4.2**

### Property 4: 下移距离输入验证
*对于任意*用户输入的下移距离值，系统应该确保最终存储的值为大于等于 0 的整数。
**Validates: Requirements 5.2**

### Property 5: 位置下移累积计算
*对于任意*初始左右源位置、下移距离和循环次数，在执行 N 次循环后，左右源位置的 Y 坐标应该等于初始 Y 坐标加上 (N × 下移距离)。
**Validates: Requirements 5.4, 6.5**

### Property 6: 批量任务进度显示准确性
*对于任意*循环次数 N，在执行第 i 次循环时（1 ≤ i ≤ N），系统显示的进度应该为"进度: i / N"。
**Validates: Requirements 6.3**

### Property 7: 窗口引用清理一致性
*对于任意*覆盖层窗口销毁场景，系统应该正确清理窗口引用（设置为 null），并允许后续重新创建新的覆盖层窗口。
**Validates: Requirements 7.3**

### Property 8: ESC 键取消操作通用性
*对于任意*覆盖层操作模式（裁剪模式或位置选择模式），按下 ESC 键应该取消当前操作并关闭覆盖层窗口。
**Validates: Requirements 1.4, 2.5, 3.5**

### Property 9: 错误恢复窗口状态一致性
*对于任意*覆盖层操作失败场景（加载失败、超时等），系统应该清理覆盖层窗口并恢复主窗口的可见性和聚焦状态。
**Validates: Requirements 2.6, 3.6, 7.5**

## Error Handling

### 窗口管理错误
- **覆盖层窗口创建失败**: 记录错误日志，向用户显示错误提示，确保主窗口可见
- **覆盖层窗口加载超时**: 30 秒超时后自动取消操作，清理窗口，恢复主窗口
- **窗口已销毁错误**: 在所有窗口操作前检查 `isDestroyed()` 状态，避免操作已销毁的窗口

### 批量任务执行错误
- **裁剪区域未设置**: 在任务开始前验证，显示错误提示"请先设置裁剪区域"
- **位置未设置**: 在任务开始前验证，显示错误提示"请先设置左/右源位置"
- **截图失败**: 捕获异常，显示错误信息，停止任务执行
- **剪切板操作失败**: 重试最多 20 次，失败后显示错误并停止任务

### 用户输入错误
- **无效的循环次数**: 自动转换为最小值 1
- **无效的下移距离**: 自动转换为最小值 0
- **非数字输入**: 使用 `parseInt()` 转换，失败时使用默认值

### 错误恢复策略
所有错误处理路径必须确保：
1. 覆盖层窗口被正确关闭和清理
2. 主窗口恢复可见并聚焦
3. 向用户显示清晰的错误信息
4. 应用状态恢复到可操作状态

## Testing Strategy

### 单元测试
使用 Jest 或 Vitest 进行单元测试，重点测试：

1. **窗口管理函数**
   - `ensureMainWindowVisible()` 正确恢复主窗口
   - `ensureOverlayClosed()` 正确清理覆盖层窗口
   - 窗口状态检查逻辑

2. **输入验证函数**
   - 循环次数验证（边界值：0, 1, 负数）
   - 下移距离验证（边界值：0, 负数）
   - 非数字输入处理

3. **坐标计算**
   - 位置下移计算逻辑
   - DIP 到屏幕坐标转换

4. **错误处理**
   - 各种错误场景的恢复逻辑
   - 超时处理
   - 窗口销毁检查

### 集成测试
使用 Spectron 或 Playwright 进行 Electron 集成测试：

1. **完整工作流测试**
   - 设置裁剪区域 → 设置左右源位置 → 执行批量任务
   - 验证每个步骤的 UI 状态更新

2. **窗口交互测试**
   - 覆盖层窗口的打开和关闭
   - 主窗口和覆盖层窗口的切换
   - ESC 键取消操作

3. **错误场景测试**
   - 模拟覆盖层加载失败
   - 模拟超时场景
   - 验证错误恢复

### 手动测试
由于涉及系统级操作（鼠标点击、键盘输入、截图），需要进行手动测试：

1. **基本功能测试**
   - 设置裁剪区域并验证截图正确
   - 设置左右源位置并验证坐标记录
   - 执行批量任务并验证操作序列

2. **下移距离功能测试**
   - 设置不同的下移距离值（0, 50, 100）
   - 验证每次循环后位置正确下移
   - 使用 WPS 或 PowerPoint 测试实际场景

3. **边界条件测试**
   - 循环次数为 1
   - 下移距离为 0
   - 极大的循环次数（如 100）

4. **错误恢复测试**
   - 在覆盖层打开时强制关闭
   - 在任务执行中按 ESC 停止
   - 验证应用状态正确恢复

### 测试配置
- 单元测试框架：Jest 或 Vitest
- 集成测试框架：Spectron 或 Playwright for Electron
- 测试覆盖率目标：核心逻辑 > 80%
- 每个正确性属性应该有对应的测试用例

