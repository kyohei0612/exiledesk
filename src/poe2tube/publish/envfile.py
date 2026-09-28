"""`.env` の 1 行だけを書き換える (他の行・コメントはそのまま)."""

from __future__ import annotations

from pathlib import Path


def read_env(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    out: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def set_env(path: Path, key: str, value: str) -> None:
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    new = f"{key}={value}"
    for i, line in enumerate(lines):
        if line.split("=", 1)[0].strip() == key:
            lines[i] = new
            break
    else:
        lines.append(new)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
