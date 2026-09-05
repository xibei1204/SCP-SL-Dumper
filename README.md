# SCP: Secret Laboratory IL2CPP 运行时 Dumper

本项目用于从本机安装的《SCP: Secret Laboratory》客户端生成 `dump.cs`。
Dumper 通过 Frida 调用 `GameAssembly.dll` 导出的 IL2CPP 运行时 API，
枚举程序集、类型和成员信息，最终输出 C# 风格的转储文件。

采用运行时方案是因为当前客户端的元数据使用区域包含哨兵值或干扰数据，
传统的静态注册表搜索无法可靠定位 `CodeRegistration` 和
`MetadataRegistration`；运行时直接调用导出 API 则不依赖静态定位。

## 项目结构

```
SCP-SL-Dumper/
├── src/
│   ├── launcher/            # 启动模块
│   │   └── dump.ps1         # PowerShell 入口：路径与依赖检查、参数组织
│   ├── driver/              # 驱动模块
│   │   └── runtime_dumper.py# Frida 进程控制、消息接收、原子写入、旧文件备份
│   └── il2cpp/              # 枚举模块
│       └── runtime_dumper.js# IL2CPP 运行时 API 枚举与 dump.cs 文本生成
├── docs/                    # 实现报告、流程图、范围与工作记录
└── output/                  # 生成结果（不入库）
```

## 环境要求

- Windows PowerShell 5.1 或 PowerShell 7
- Python 3
- Python `frida` 包

安装 Frida：

```powershell
python -m pip install frida-tools
```

## 快速使用

```powershell
cd <项目目录>
powershell -NoProfile -ExecutionPolicy Bypass -File .\src\launcher\dump.ps1
```

默认配置：

- 游戏目录：`C:\SteamLibrary\steamapps\common\SCP Secret Laboratory`
- 输出文件：`<项目目录>\output\dump.cs`
- 初始化等待时间：20 秒
- 运行方式：Frida spawn 模式

Dumper 会启动一个临时客户端进程，完成枚举后只终止它自己创建的进程，
不会终止已经运行的其他游戏客户端。如果已有 `dump.cs`，旧文件会在新文件
成功生成后自动备份为 `dump.YYYYMMDD-HHMMSS.cs`。

## 参数说明

```powershell
# 指定游戏目录和输出文件。相对输出路径以项目目录为基准。
.\src\launcher\dump.ps1 -GamePath 'D:\Games\SCP Secret Laboratory' -OutputPath 'artifacts\dump.cs'

# 增加 IL2CPP 初始化等待时间。
.\src\launcher\dump.ps1 -WarmupSeconds 30

# 附加到指定进程。
.\src\launcher\dump.ps1 -ProcessId 1234

# 附加到当前最新的 SCPSL.exe 进程。
.\src\launcher\dump.ps1 -Attach
```

部分客户端可能拒绝较晚进行的附加，此时建议使用默认的 spawn 模式。

## 输出内容

生成的 `output\dump.cs` 包含程序集、命名空间、类、结构体、接口、枚举及
常量值、继承关系、字段偏移、属性、方法签名、参数、Token，以及位于
`GameAssembly.dll` 内的方法 RVA 和 VA。

游戏更新后应重新运行 Dumper，以生成与当前版本匹配的 `dump.cs`。

## 工作原理

三个模块的协作流程（详细流程图见 [docs/flowchart.md](docs/flowchart.md)）：

1. `dump.ps1` 校验游戏、Python 和 Frida 依赖，组织参数并启动驱动；
2. `runtime_dumper.py` 通过 Frida spawn 临时客户端（或附加到已有进程），
   等待 IL2CPP 初始化后加载枚举脚本，接收分块数据并原子写入临时文件；
3. `runtime_dumper.js` 调用 `il2cpp_domain_get_assemblies` 等导出 API，
   枚举全部类型与成员，生成 C# 风格文本并通过 Frida 消息分块回传；
4. 驱动校验输出有效性后备份旧文件并原子替换 `output\dump.cs`，
   最后仅终止自己创建的临时进程。

## 文档

| 文档 | 说明 |
| --- | --- |
| [docs/2026-08-17_reverse-scp-sl-il2cpp-report.md](docs/2026-08-17_reverse-scp-sl-il2cpp-report.md) | 逆向实现与验证报告 |
| [docs/flowchart.md](docs/flowchart.md) | Dumper 执行流程图 |
| [docs/scope.md](docs/scope.md) | 本地逆向工作的范围记录 |
| [docs/timeline.md](docs/timeline.md) | 工作时间线 |
| [docs/workitems.md](docs/workitems.md) | 工作项清单 |

## 注意事项

- Dumper 不会修改 `GameAssembly.dll` 或 `global-metadata.dat`。
- 默认流程不访问游戏服务器或其他远程服务。
- 生成期间请勿手动关闭 Dumper 创建的临时客户端。
- `output\`、`vendor\` 等生成与第三方目录已通过 `.gitignore` 排除。
