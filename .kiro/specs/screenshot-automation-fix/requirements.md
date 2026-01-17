# Requirements Document

## Introduction

本文档定义了 Electron 自动化截图粘贴工具的修复和改进需求。该工具允许用户设置裁剪区域、左右源位置，并自动执行循环操作：点击右源→截图→点击左源→粘贴。

## Glossary

- **System**: Electron 自动化截图粘贴工具
- **Crop_Region**: 用户定义的屏幕裁剪区域，用于截取特定区域的图像
- **Left_Source**: 左源位置，粘贴操作的目标位置坐标
- **Right_Source**: 右源位置，截图前需要点击的位置坐标
- **Offset_Distance**: 下移距离，每次循环后左右源位置向下移动的像素距离
- **Loop_Count**: 循环次数，自动化任务执行的重复次数
- **Overlay_Window**: 覆盖层窗口，用于用户交互选择区域或位置的全屏透明窗口

## Requirements

### Requirement 1: 设置裁剪区域

**User Story:** 作为用户，我想设置一个屏幕裁剪区域，以便后续自动截取该区域的图像并保存到剪切板。

#### Acceptance Criteria

1. WHEN 用户点击"设置裁剪区域"按钮 THEN THE System SHALL 打开全屏覆盖层窗口显示可调整的裁剪框
2. WHEN 用户在覆盖层中调整裁剪框并点击确定 THEN THE System SHALL 保存裁剪区域坐标信息到本地存储
3. WHEN 裁剪区域设置成功 THEN THE System SHALL 在按钮上显示"✓ 裁剪区域已设置"状态
4. WHEN 用户按下 ESC 键 THEN THE System SHALL 取消操作并关闭覆盖层窗口
5. WHEN 应用重新启动 THEN THE System SHALL 从本地存储加载上次保存的裁剪区域信息

### Requirement 2: 设置左源位置

**User Story:** 作为用户，我想设置左源位置（粘贴目标位置），以便自动化任务知道在哪里执行粘贴操作。

#### Acceptance Criteria

1. WHEN 用户点击"设置左源位置"按钮 THEN THE System SHALL 打开全屏覆盖层窗口并显示十字光标
2. WHEN 覆盖层窗口打开 THEN THE System SHALL 在屏幕中央显示提示文字"🖱️ 请点击目标位置"
3. WHEN 用户在覆盖层中点击任意位置 THEN THE System SHALL 记录该位置的屏幕坐标
4. WHEN 位置记录成功 THEN THE System SHALL 关闭覆盖层并在按钮上显示"✓ 左源位置已设置 (x, y)"
5. WHEN 用户按下 ESC 键 THEN THE System SHALL 取消操作并关闭覆盖层窗口
6. WHEN 覆盖层窗口加载失败或超时 THEN THE System SHALL 显示错误提示并恢复主窗口可见性

### Requirement 3: 设置右源位置

**User Story:** 作为用户，我想设置右源位置（截图前点击位置），以便自动化任务知道在截图前应该点击哪里。

#### Acceptance Criteria

1. WHEN 用户点击"设置右源位置"按钮 THEN THE System SHALL 打开全屏覆盖层窗口并显示十字光标
2. WHEN 覆盖层窗口打开 THEN THE System SHALL 在屏幕中央显示提示文字"🖱️ 请点击目标位置"
3. WHEN 用户在覆盖层中点击任意位置 THEN THE System SHALL 记录该位置的屏幕坐标
4. WHEN 位置记录成功 THEN THE System SHALL 关闭覆盖层并在按钮上显示"✓ 右源位置已设置 (x, y)"
5. WHEN 用户按下 ESC 键 THEN THE System SHALL 取消操作并关闭覆盖层窗口
6. WHEN 覆盖层窗口加载失败或超时 THEN THE System SHALL 显示错误提示并恢复主窗口可见性

### Requirement 4: 设置循环次数

**User Story:** 作为用户，我想设置自动化任务的循环次数，以便控制操作重复执行的次数。

#### Acceptance Criteria

1. THE System SHALL 提供一个数字输入框用于设置循环次数
2. WHEN 用户输入循环次数 THEN THE System SHALL 确保输入值为大于等于 1 的整数
3. THE System SHALL 默认循环次数为 3

### Requirement 5: 设置下移距离

**User Story:** 作为用户，我想设置每次循环后位置向下移动的距离，以便处理垂直排列的多个目标（如 PPT 幻灯片列表）。

#### Acceptance Criteria

1. THE System SHALL 提供一个数字输入框用于设置下移距离（像素）
2. WHEN 用户输入下移距离 THEN THE System SHALL 确保输入值为大于等于 0 的整数
3. THE System SHALL 默认下移距离为 0
4. WHEN 下移距离大于 0 THEN THE System SHALL 在每次循环完成后将左右源位置的 Y 坐标增加该距离值

### Requirement 6: 执行自动化任务

**User Story:** 作为用户，我想开始执行自动化任务，以便自动完成重复的截图粘贴操作。

#### Acceptance Criteria

1. WHEN 用户点击"开始执行"按钮且所有必需配置未完成 THEN THE System SHALL 显示错误提示并阻止执行
2. WHEN 用户点击"开始执行"按钮且所有配置已完成 THEN THE System SHALL 开始执行批量自动化任务
3. WHEN 自动化任务执行中 THEN THE System SHALL 显示当前进度"进度: X / Y"
4. WHEN 执行单次循环 THEN THE System SHALL 按顺序执行：点击右源位置 → 等待 300ms → 截取裁剪区域 → 保存到剪切板 → 等待 300ms → 点击左源位置 → 等待 300ms → 粘贴剪切板内容 → 等待 1000ms
5. WHEN 完成一次循环且下移距离大于 0 THEN THE System SHALL 将左右源位置的 Y 坐标增加下移距离值
6. WHEN 所有循环完成 THEN THE System SHALL 显示"批量操作完成"并恢复主窗口
7. WHEN 用户点击"停止执行"按钮或按下 ESC 键 THEN THE System SHALL 立即停止任务执行
8. WHEN 任务执行过程中发生错误 THEN THE System SHALL 显示错误信息并停止执行

### Requirement 7: 窗口状态管理

**User Story:** 作为用户，我希望应用窗口状态管理正确，以便在各种操作中保持良好的用户体验。

#### Acceptance Criteria

1. WHEN 打开覆盖层窗口 THEN THE System SHALL 隐藏主窗口
2. WHEN 关闭覆盖层窗口 THEN THE System SHALL 显示并聚焦主窗口
3. WHEN 覆盖层窗口已存在且被销毁 THEN THE System SHALL 清理窗口引用并允许重新创建
4. WHEN 主窗口最小化 THEN THE System SHALL 在需要时恢复并聚焦主窗口
5. WHEN 覆盖层窗口加载失败 THEN THE System SHALL 清理覆盖层窗口并恢复主窗口可见性

### Requirement 8: 错误处理和用户反馈

**User Story:** 作为用户，我希望在操作失败时能看到清晰的错误提示，以便了解问题并采取相应措施。

#### Acceptance Criteria

1. WHEN 位置选择操作超时（30秒） THEN THE System SHALL 显示"操作超时，请重试"错误提示
2. WHEN 覆盖层窗口加载失败 THEN THE System SHALL 显示具体的错误原因（如"连接服务失败，请检查开发服务器是否启动"）
3. WHEN 批量任务执行失败 THEN THE System SHALL 显示错误信息并停止执行
4. WHEN 操作成功 THEN THE System SHALL 显示成功提示并在 2-3 秒后自动隐藏
5. WHEN 操作失败 THEN THE System SHALL 显示错误提示并在 3 秒后自动隐藏
