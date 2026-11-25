---
title: Obsidian 语法测试
tags:
  - markdown
  - obsidian/syntax
author: Antigravity
---

本页集中验证各项 Obsidian 特色语法在网页知识库中的渲染效果。你也可以跳回 [[欢迎使用]] 或查看 [[Cloudflare R2 架构说明]]。

## Callout 提示框演示

> [!info] 信息提示（默认展开）
> 支持 Obsidian 标准 Callout 类型，包括 `note`、`tip`、`info`、`warning`、`danger`、`example`、`quote` 等。

> [!example]- 可折叠示例（默认收起，点击展开）
> 你可以把较长的参考资料或补充说明放在 `-` 折叠块里，让手机端阅读更清爽。
> - 支持嵌套列表
> - 支持 ==高亮文字== 与行内 `code`

> [!danger] 危险/错误提示
> 检测到未配置 `ACCESS_PASSWORD` 时，服务端会自动 Fail-Closed 拒绝访问。

## 高亮与内联标签

在正文中可以使用 ==重点高亮语法== 突出关键结论，同时支持内联标签如 #灵感记录 与 #工程实践/边缘计算 。

## 代码块与防误解析

下面代码块里的 `[[不是双链]]` 与 `==不是高亮==` 会被原样保留：

```ts
export async function fetchNote(bucket: R2Bucket, key: string) {
  const object = await bucket.get(key);
  if (!object) return null;
  // [[这里不会被替换成双链]] ==也不会高亮==
  return object.text();
}
```

## 嵌入笔记卡片

![[Cloudflare R2 架构说明]]
