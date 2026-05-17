"""Shared bootstrap + tiny table renderer for ml/eval/* CLIs.

Avoids two copies of the venv re-exec + ad-hoc table code across
`performance.py` and `sanity.py`.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Iterable, List, Sequence


def ensure_venv(module_name: str) -> None:
    """If a project venv exists and we're not in it, re-exec ourselves
    inside it. Lets `python -m ml.eval.X` work from any interpreter."""
    repo_root = Path(__file__).resolve().parents[2]
    venv_py = repo_root / "ml" / ".venv" / "bin" / "python"
    try:
        import joblib  # noqa: F401
        return
    except ModuleNotFoundError:
        pass

    in_target = Path(sys.prefix).resolve() == (repo_root / "ml" / ".venv").resolve()
    if venv_py.exists() and not in_target:
        print(f"re-exec under project venv: {venv_py}", file=sys.stderr)
        os.execv(str(venv_py), [str(venv_py), "-m", module_name, *sys.argv[1:]])
    print(
        "Missing dependency 'joblib'. Install the ML requirements first:\n"
        f"  {sys.executable} -m pip install -r {repo_root / 'ml' / 'requirements.txt'}",
        file=sys.stderr,
    )
    sys.exit(1)


# ---------------------------------------------------------------------------
# Plain ASCII table renderer. Keeps the eval output dependency-free so the
# user can pipe it into a .txt file and read it anywhere.
# ---------------------------------------------------------------------------
def render_table(
    headers: Sequence[str],
    rows: Iterable[Sequence[object]],
    align: Sequence[str] | None = None,
) -> str:
    """Render a Markdown-free ASCII table.

    `align` is per-column 'l'/'r'/'c'; defaults to 'l' for the first
    column and 'r' for the rest (which is the natural layout for
    "label, number, number, …" rows).
    """
    rows_list = [list(map(_fmt, r)) for r in rows]
    cols = list(headers)
    if align is None:
        align = ["l"] + ["r"] * (len(cols) - 1)
    widths = [len(h) for h in cols]
    for r in rows_list:
        for i, cell in enumerate(r):
            widths[i] = max(widths[i], len(cell))

    def pad(cell: str, w: int, a: str) -> str:
        if a == "r":
            return cell.rjust(w)
        if a == "c":
            return cell.center(w)
        return cell.ljust(w)

    header_line = "  ".join(pad(c, w, a) for c, w, a in zip(cols, widths, align))
    sep = "  ".join("-" * w for w in widths)
    body = "\n".join(
        "  ".join(pad(c, w, a) for c, w, a in zip(r, widths, align))
        for r in rows_list
    )
    return f"{header_line}\n{sep}\n{body}"


def _fmt(v: object) -> str:
    if v is None:
        return "—"
    if isinstance(v, float):
        if v != v:  # NaN
            return "—"
        # 4 sig figs is usually right for prevalence /1k
        if abs(v) >= 100:
            return f"{v:.1f}"
        if abs(v) >= 10:
            return f"{v:.2f}"
        return f"{v:.3f}"
    if isinstance(v, int):
        return f"{v:d}"
    return str(v)


def section(title: str) -> str:
    line = "=" * max(60, len(title) + 4)
    return f"\n{line}\n  {title}\n{line}"


def subsection(title: str) -> str:
    return f"\n--- {title} ---"
