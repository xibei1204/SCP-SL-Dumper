#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path

import frida


def find_process(device, name):
    lowered = name.lower()
    matches = [p for p in device.enumerate_processes() if p.name.lower() == lowered]
    if not matches:
        raise RuntimeError(f"process not found: {name}")
    return max(matches, key=lambda p: p.pid)


def main():
    parser = argparse.ArgumentParser(description="Dump IL2CPP metadata through exported runtime APIs.")
    parser.add_argument("--exe", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--warmup", type=int, default=20)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--spawn", action="store_true")
    mode.add_argument("--attach", action="store_true")
    mode.add_argument("--pid", type=int)
    args = parser.parse_args()

    exe = args.exe.resolve()
    output = args.output.resolve()
    script_path = Path(__file__).resolve().parent.parent / "il2cpp" / "runtime_dumper.js"
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary_output = output.with_name(
        f".{output.name}.{time.strftime('%Y%m%d-%H%M%S')}.{os.getpid()}.tmp"
    )
    temporary_output.unlink(missing_ok=True)

    device = frida.get_local_device()
    spawned_pid = None
    session = None
    handle = temporary_output.open("w", encoding="utf-8", newline="\n")
    stats = {"chunks": 0, "bytes": 0, "progress": None}
    dump_succeeded = False

    def on_message(message, data):
        if message.get("type") != "send":
            print(json.dumps(message, ensure_ascii=True), file=sys.stderr, flush=True)
            return

        payload = message.get("payload", {})
        event = payload.get("type")
        if event == "dump_chunk":
            text = payload.get("text", "")
            handle.write(text)
            stats["chunks"] += 1
            stats["bytes"] += len(text.encode("utf-8"))
        elif event == "progress":
            stats["progress"] = payload
            print(
                f"[{payload.get('classesDone', 0)}/{payload.get('classesTotal', 0)}] "
                f"{payload.get('image', '')}",
                flush=True,
            )
        elif event == "warning":
            print(f"warning: {payload.get('message', '')}", file=sys.stderr, flush=True)

    try:
        if args.spawn:
            spawned_pid = device.spawn([str(exe)], stdio="inherit")
            pid = spawned_pid
            print(f"Spawned temporary client PID {pid}", flush=True)
        elif args.pid:
            pid = args.pid
        else:
            pid = find_process(device, exe.name).pid

        session = device.attach(pid)
        script = session.create_script(script_path.read_text(encoding="utf-8"))
        script.on("message", on_message)
        script.load()

        if spawned_pid is not None:
            device.resume(spawned_pid)

        print(f"Waiting {args.warmup}s for IL2CPP initialization...", flush=True)
        time.sleep(max(0, args.warmup))
        summary = script.exports_sync.dump()
        handle.flush()
        dump_succeeded = True
    finally:
        handle.close()
        if spawned_pid is not None:
            try:
                device.kill(spawned_pid)
            except frida.ProcessNotFoundError:
                pass
        if session is not None:
            try:
                session.detach()
            except frida.InvalidOperationError:
                pass
        if not dump_succeeded:
            temporary_output.unlink(missing_ok=True)

    if not temporary_output.exists() or temporary_output.stat().st_size < 1024:
        temporary_output.unlink(missing_ok=True)
        raise RuntimeError("dump.cs was not produced or is unexpectedly small")

    if output.exists():
        backup = output.with_name(f"{output.stem}.{time.strftime('%Y%m%d-%H%M%S')}{output.suffix}")
        backup.write_bytes(output.read_bytes())
        print(f"Backed up previous dump to {backup}", flush=True)
    temporary_output.replace(output)

    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    result = {
        "pid": pid,
        "spawned": spawned_pid is not None,
        "output": str(output),
        "size": output.stat().st_size,
        "sha256": digest,
        "transport": stats,
        "runtime": summary,
    }
    print(json.dumps(result, indent=2, ensure_ascii=True), flush=True)


if __name__ == "__main__":
    main()
