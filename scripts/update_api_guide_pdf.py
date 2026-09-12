from __future__ import annotations

from html import escape
from pathlib import Path
import re

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
MARKDOWN_PATH = ROOT / "public" / "docs" / "PaySME_Payment_Modal_API_Integration.md"
PDF_PATH = ROOT / "public" / "docs" / "PaySME_Payment_Modal_API_Integration.pdf"

PAGE_WIDTH, PAGE_HEIGHT = A4
LEFT_MARGIN = 18 * mm
RIGHT_MARGIN = 18 * mm
CONTENT_WIDTH = PAGE_WIDTH - LEFT_MARGIN - RIGHT_MARGIN


def ascii_text(value: str) -> str:
    replacements = {
        "\u2014": "-",
        "\u2013": "-",
        "\u2011": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2026": "...",
        "\u00b7": "-",
        "\u2192": "->",
        "\u25ba": "->",
        "\u2260": "!=",
        "\u2502": "|",
        "\u251c": "+",
        "\u2514": "+",
        "\u2500": "-",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    return value


def inline_markup(value: str) -> str:
    value = escape(ascii_text(value), quote=False)
    value = re.sub(r"`([^`]+)`", r'<font name="Courier">\1</font>', value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", value)
    value = re.sub(
        r"&lt;(https?://[^&]+)&gt;",
        lambda match: f'<link href="{match.group(1)}" color="#996F00">{match.group(1)}</link>',
        value,
    )
    return value


def page_frame(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#17211A"))
    canvas.rect(0, PAGE_HEIGHT - 22 * mm, PAGE_WIDTH, 22 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#F0B429"))
    canvas.rect(0, PAGE_HEIGHT - 24 * mm, PAGE_WIDTH, 2 * mm, fill=1, stroke=0)
    canvas.setFont("Helvetica-Bold", 14)
    canvas.setFillColor(colors.white)
    canvas.drawString(LEFT_MARGIN, PAGE_HEIGHT - 14 * mm, "PaySME API Integration Guide")
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#667069"))
    canvas.drawString(LEFT_MARGIN, 9 * mm, "PaySME Payment Modal and SDK")
    canvas.drawRightString(PAGE_WIDTH - RIGHT_MARGIN, 9 * mm, f"Page {doc.page}")
    canvas.restoreState()


def make_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "GuideTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            textColor=colors.HexColor("#17211A"),
            spaceAfter=7 * mm,
        ),
        "h2": ParagraphStyle(
            "GuideH2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=18,
            textColor=colors.HexColor("#17211A"),
            spaceBefore=5 * mm,
            spaceAfter=2.5 * mm,
            keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "GuideH3",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=11.5,
            leading=15,
            textColor=colors.HexColor("#243128"),
            spaceBefore=3.5 * mm,
            spaceAfter=2 * mm,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "GuideBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=13,
            textColor=colors.HexColor("#303A33"),
            spaceAfter=2.5 * mm,
        ),
        "note": ParagraphStyle(
            "GuideNote",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.7,
            leading=12.5,
            textColor=colors.HexColor("#332A10"),
            backColor=colors.HexColor("#FFF6D8"),
            borderColor=colors.HexColor("#F0B429"),
            borderWidth=0.8,
            borderPadding=7,
            spaceBefore=2 * mm,
            spaceAfter=3 * mm,
        ),
        "code": ParagraphStyle(
            "GuideCode",
            parent=base["Code"],
            fontName="Courier",
            fontSize=6.7,
            leading=9,
            textColor=colors.HexColor("#1F2A23"),
            backColor=colors.HexColor("#EEF2EF"),
            borderPadding=7,
            leftIndent=0,
            rightIndent=0,
            spaceBefore=1.5 * mm,
            spaceAfter=3 * mm,
        ),
        "table": ParagraphStyle(
            "GuideTable",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=10,
            textColor=colors.HexColor("#263029"),
        ),
        "table_header": ParagraphStyle(
            "GuideTableHeader",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.7,
            leading=10,
            textColor=colors.white,
        ),
    }


def table_widths(column_count: int):
    if column_count == 2:
        return [CONTENT_WIDTH * 0.34, CONTENT_WIDTH * 0.66]
    if column_count == 3:
        return [CONTENT_WIDTH * 0.18, CONTENT_WIDTH * 0.31, CONTENT_WIDTH * 0.51]
    return [CONTENT_WIDTH / column_count] * column_count


def parse_table(lines: list[str], styles):
    rows = []
    for line in lines:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-{3,}:?", cell or "") for cell in cells):
            continue
        row_index = len(rows)
        style = styles["table_header"] if row_index == 0 else styles["table"]
        rows.append([Paragraph(inline_markup(cell), style) for cell in cells])

    column_count = max(len(row) for row in rows)
    for row in rows:
        row.extend([Paragraph("", styles["table"])] * (column_count - len(row)))

    table = Table(rows, colWidths=table_widths(column_count), repeatRows=1, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#27352C")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#C9D0CB")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F4F7F5")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def is_special(line: str) -> bool:
    stripped = line.strip()
    return bool(
        not stripped
        or stripped == "---"
        or stripped.startswith("#")
        or stripped.startswith("```")
        or stripped.startswith("|")
        or stripped.startswith(">")
        or re.match(r"^(?:\d+\.|[-*])\s+", stripped)
    )


def markdown_story(markdown: str, styles):
    lines = markdown.splitlines()
    story = []
    index = 0

    while index < len(lines):
        raw = lines[index]
        stripped = raw.strip()

        if not stripped:
            index += 1
            continue

        if stripped == "---":
            story.extend([Spacer(1, 1 * mm), HRFlowable(width="100%", thickness=0.6, color=colors.HexColor("#D5DBD7")), Spacer(1, 1 * mm)])
            index += 1
            continue

        heading = re.match(r"^(#{1,3})\s+(.+)$", stripped)
        if heading:
            level = len(heading.group(1))
            style = styles["title"] if level == 1 else styles["h2"] if level == 2 else styles["h3"]
            story.append(Paragraph(inline_markup(heading.group(2)), style))
            index += 1
            continue

        if stripped.startswith("```"):
            index += 1
            code_lines = []
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code_lines.append(ascii_text(lines[index]).replace("\t", "  "))
                index += 1
            if index < len(lines):
                index += 1
            story.append(Preformatted("\n".join(code_lines), styles["code"], maxLineLength=105))
            continue

        if stripped.startswith("|"):
            table_lines = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                table_lines.append(lines[index])
                index += 1
            story.extend([parse_table(table_lines, styles), Spacer(1, 2.5 * mm)])
            continue

        if stripped.startswith(">"):
            note_lines = []
            while index < len(lines) and lines[index].strip().startswith(">"):
                note_lines.append(lines[index].strip()[1:].strip())
                index += 1
            story.append(Paragraph(inline_markup(" ".join(note_lines)), styles["note"]))
            continue

        list_match = re.match(r"^(\d+\.|[-*])\s+(.+)$", stripped)
        if list_match:
            ordered = list_match.group(1).endswith(".") and list_match.group(1)[0].isdigit()
            items = []
            while index < len(lines):
                match = re.match(r"^(\d+\.|[-*])\s+(.+)$", lines[index].strip())
                if not match:
                    break
                items.append(ListItem(Paragraph(inline_markup(match.group(2)), styles["body"]), leftIndent=3 * mm))
                index += 1
            story.append(
                ListFlowable(
                    items,
                    bulletType="1" if ordered else "bullet",
                    start="1" if ordered else "-",
                    leftIndent=7 * mm,
                    bulletFontName="Helvetica",
                    bulletFontSize=8,
                    bulletColor=colors.HexColor("#9A7300"),
                    spaceAfter=2 * mm,
                )
            )
            continue

        paragraph_lines = [stripped]
        index += 1
        while index < len(lines) and not is_special(lines[index]):
            paragraph_lines.append(lines[index].strip())
            index += 1
        story.append(Paragraph(inline_markup(" ".join(paragraph_lines)), styles["body"]))

    return story


def build_pdf():
    styles = make_styles()
    markdown = MARKDOWN_PATH.read_text(encoding="utf-8")
    doc = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=A4,
        leftMargin=LEFT_MARGIN,
        rightMargin=RIGHT_MARGIN,
        topMargin=31 * mm,
        bottomMargin=17 * mm,
        title="PaySME Payment Modal API Integration Guide",
        author="PaySME",
        subject="Merchant SDK and API integration",
    )
    doc.build(markdown_story(markdown, styles), onFirstPage=page_frame, onLaterPages=page_frame)
    print(PDF_PATH)


if __name__ == "__main__":
    build_pdf()
