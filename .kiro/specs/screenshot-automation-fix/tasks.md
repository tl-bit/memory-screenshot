# Implementation Plan: Screenshot Automation Fix

## Overview

本实现计划将修复 Electron 自动化截图粘贴工具中的窗口状态管理问题，并添加下移距离配置功能。实现将按照增量方式进行，每个任务都建立在前一个任务的基础上，确保代码始终处于可工作状态。

## Tasks

- [x] 1. 修复 Main Process 窗口管理逻辑
  - 修复 `ensureOverlayClosed()` 函数，添加窗口销毁状态检查
  - 修复 `createOverlayWindow()` 函数，在创建前清理已销毁的窗口引用
  - 在所有窗口操作前添加 `isDestroyed()` 检查
  - _Requirements: 7.3, 7.5_

- [x] 2. 改进 pick-point IPC Handler 的错误处理
  - [x] 2.1 添加 Promise 缓存机制防止重复调用
    - 在 `pick-point` handler 开始时检查 `pickPointPromise` 是否存在
    - 如果存在，直接返回现有 Promise
    - _Requirements: 2.6, 3.6_

  - [x] 2.2 实现 URL 加载重试逻辑
    - 在 `overlayWindow.loadURL()` 失败时重试最多 3 次
    - 每次重试间隔 500ms
    - 在重试过程中检查窗口是否被销毁
    - _Requirements: 2.6, 3.6, 8.2_

  - [x] 2.3 添加所有错误路径的窗口状态恢复
    - 在所有 catch 块中调用 `ensureOverlayClosed()`
    - 在所有 catch 块中调用 `ensureMainWindowVisible()`
    - 向主窗口发送适当的错误状态消息
    - _Requirements: 7.5, 8.2_

  - [x] 2.4 实现 30 秒超时保护
    - 使用 `setTimeout` 设置 30 秒超时
    - 超时后清理事件监听器
    - 调用窗口恢复函数
    - 发送超时错误消息
    - _Requirements: 8.1_

- [x] 2.5 编写 pick-point 错误处理的单元测试
  - 测试超时场景
  - 测试 URL 加载失败场景
  - 测试窗口销毁场景
  - _Requirements: 2.6, 3.6, 8.1_

- [x] 3. 在 App.jsx 中添加下移距离配置
  - [x] 3.1 添加 offsetDistance 状态
    - 使用 `useState` 添加 `offsetDistance` 状态，默认值为 0
    - _Requirements: 5.3_

  - [x] 3.2 添加下移距离输入框 UI
    - 在"步骤 4: 循环次数"后添加"步骤 5: 下移距离"
    - 创建数字输入框，绑定到 `offsetDistance` 状态
    - 添加"像素"单位标签
    - _Requirements: 5.1_

  - [x] 3.3 实现下移距离输入验证
    - 在 `onChange` 事件中使用 `Math.max(0, parseInt(e.target.value) || 0)`
    - 确保值为非负整数
    - _Requirements: 5.2_

  - [x] 3.4 更新 handleStartBatch 函数
    - 在调用 `window.electronAPI.startBatch` 时传递 `offsetDistance` 参数
    - _Requirements: 5.4_

- [x] 3.5 编写下移距离输入验证的单元测试
  - **Property 4: 下移距离输入验证**
  - **Validates: Requirements 5.2**

- [x] 4. 更新 start-batch IPC Handler 实现位置下移逻辑
  - [x] 4.1 接收 offsetDistance 参数
    - 从 `config` 参数中解构 `offsetDistance`
    - _Requirements: 5.4_

  - [x] 4.2 实现循环中的位置更新逻辑
    - 在每次循环的末尾（粘贴完成后）
    - 如果 `offsetDistance > 0`，更新 `leftSourcePos.y += offsetDistance` 和 `rightSourcePos.y += offsetDistance`
    - _Requirements: 5.4, 6.5_

  - [x] 4.3 更新进度显示逻辑
    - 确保进度消息格式为 `batch-progress:${i}:${loopCount}`
    - _Requirements: 6.3_

- [x] 4.4 编写位置下移计算的单元测试
  - **Property 5: 位置下移累积计算**
  - **Validates: Requirements 5.4, 6.5**

- [x] 5. 改进 Overlay.jsx 的 pick 模式 UI
  - [x] 5.1 优化 pick 模式的视觉提示
    - 确保十字光标样式正确应用
    - 调整中央提示框的样式（大小、颜色、边框）
    - 确保提示文字清晰可见
    - _Requirements: 2.1, 2.2, 3.1, 3.2_

  - [x] 5.2 确保 ESC 键处理正确
    - 验证 ESC 键事件监听器在 pick 模式下正常工作
    - 确保事件传播正确（使用 capture phase）
    - _Requirements: 1.4, 2.5, 3.5_

- [x] 6. 测试和验证 - Checkpoint
  - 手动测试所有功能：
    1. 设置裁剪区域
    2. 设置左源位置（验证十字光标和提示）
    3. 设置右源位置（验证十字光标和提示）
    4. 设置循环次数和下移距离
    5. 执行批量任务（验证位置下移）
  - 测试错误场景：
    1. 在覆盖层打开时按 ESC
    2. 在任务执行中按 ESC 停止
    3. 验证窗口状态正确恢复
  - 确保所有测试通过，询问用户是否有问题

- [x] 7. 编写集成测试
  - [x] 7.1 测试完整工作流
    - 测试从设置到执行的完整流程
    - _Requirements: 6.2, 6.6_

  - [x] 7.2 测试窗口交互
    - 测试覆盖层窗口的打开和关闭
    - 测试主窗口和覆盖层的切换
    - _Requirements: 7.1, 7.2_

  - [x] 7.3 测试错误恢复
    - 测试各种错误场景的恢复
    - _Requirements: 7.5, 8.3_

- [x] 8. 代码清理和文档更新
  - 移除调试日志（保留关键日志）
  - 添加代码注释说明关键逻辑
  - 更新 README.md 文档，说明新增的下移距离功能
  - _Requirements: All_

## Notes

- 所有任务都是必需的，包括单元测试和集成测试
- 每个任务都引用了具体的需求编号以便追溯
- Checkpoint 任务确保增量验证
- 手动测试是必需的，因为涉及系统级操作（鼠标、键盘、截图）
- 单元测试和集成测试确保代码质量和长期可维护性
