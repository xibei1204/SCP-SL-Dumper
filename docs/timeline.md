# Timeline

| 时间（Asia/Shanghai） | 阶段 | 结果 |
| --- | --- | --- |
| 2026-08-17 | Scope | 确认本机客户端、项目目录和离线/本地运行时范围 |
| 2026-08-17 | Triage | 确认 Unity IL2CPP，定位 `GameAssembly.dll` 和 `global-metadata.dat` |
| 2026-08-17 | Static | 传统静态注册表定位未能可靠处理当前元数据干扰值 |
| 2026-08-17 | Dynamic | Frida spawn 成功调用 IL2CPP 导出 API 并枚举运行时类型 |
| 2026-08-17 | Implementation | 完成 PowerShell、Python、JavaScript 三层 Dumper |
| 2026-08-17 | Validation | 生成 23,653,817 字节 `dump.cs`，SHA256 为 `B5327E...BE71A` |
| 2026-08-17 | Documentation | README 改为中英双语，补充报告和 Mermaid 流程图 |
