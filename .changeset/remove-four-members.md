---
"@dsh-pack/all": minor
---

从聚合元包中摘除 `dsh-cardian`、`graph-memory`、`dsh-community-market`、`harness-pet` 四个成员（源码目录一并删除）。成员数 28 → 24，元包补丁层与 `dependencies` 同步收缩；现成员集合不再包含任何带 `install` 脚本的原生依赖，安装时不会再触发 pnpm 构建门禁。
