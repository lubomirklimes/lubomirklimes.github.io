"""Generate Docsify `_sidebar.md` files from the table of contents in each guide's README.md.

Usage:  python tools/generate_sidebars.py

Run it whenever a guide's README.md changes. Links are written as absolute
Docsify routes (`/A/Intro.md`) because the sites use `relativePath: true`,
which would otherwise resolve sidebar links relative to the current page.
"""

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
GUIDES = ["dotnet", "python"]

HEADING = re.compile(r"^#{2,6}\s+(.+?)\s*$")
LINK_ITEM = re.compile(r"^\s*(?:[-*+]|\d+\.)\s+\[(.+?)\]\((?!https?:)(.+?\.md)\)\s*$")
# Top-level sections in the READMEs are headings such as "A. Jazyk C# od začátku".
SECTION = re.compile(r"^[A-Z]\.\s")


def build_sidebar(readme: str) -> str:
    lines = ["- [Úvod a obsah](/)"]
    in_section = False
    in_subgroup = False
    pending = None

    for raw in readme.splitlines():
        if m := HEADING.match(raw):
            title = m.group(1)
            if SECTION.match(title):
                lines.append(f"- **{title}**")
                in_section, in_subgroup, pending = True, False, None
            else:
                pending = title
            continue

        if m := LINK_ITEM.match(raw):
            text, href = m.group(1), m.group(2).removeprefix("./")
            if pending is not None:
                if in_section:
                    lines.append(f"  - *{pending}*")
                    in_subgroup = True
                else:
                    lines.append(f"- **{pending}**")
                pending = None
            indent = "    " if in_subgroup else "  "
            lines.append(f"{indent}- [{text}](/{href})")

    return "\n".join(lines) + "\n"


def main() -> None:
    for guide in GUIDES:
        readme = (ROOT / guide / "README.md").read_text(encoding="utf-8-sig")
        target = ROOT / guide / "_sidebar.md"
        target.write_text(build_sidebar(readme), encoding="utf-8", newline="\n")
        print(f"Wrote {target.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main()
