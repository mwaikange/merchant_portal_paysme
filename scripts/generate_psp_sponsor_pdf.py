"""Generate the downloadable PaySME PSP partnership discussion paper."""

from html import escape
from html.parser import HTMLParser
from pathlib import Path
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "supabase/functions/psp-sponsor-access/psp-sponsor.html"
OUTPUTS = [
    ROOT / "output/pdf/PaySME-Vendor-Programme-PSP-Partnership.pdf",
    ROOT / "supabase/functions/psp-sponsor-pdf/PaySME-Vendor-Programme-PSP-Partnership.pdf",
]

NAVY = colors.HexColor("#071426")
YELLOW = colors.HexColor("#F2B821")
INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#5D687A")
PALE = colors.HexColor("#F3F5F8")


class Extractor(HTMLParser):
    wanted = {"h1", "h2", "h3", "h4", "p", "li"}

    def __init__(self):
        super().__init__()
        self.active = None
        self.parts = []
        self.items = []

    def handle_starttag(self, tag, attrs):
        if tag in self.wanted and self.active is None:
            self.active = tag
            self.parts = []

    def handle_data(self, data):
        if self.active:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag != self.active:
            return
        text = " ".join("".join(self.parts).split())
        if text:
            self.items.append((tag, clean_text(text)))
        self.active = None
        self.parts = []


def clean_text(value):
    replacements = {
        "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
        "\u2013": "-", "\u2014": "-", "\u2022": "-", "\xa0": " ",
        "PaySME\ufffds": "PaySME's", "\ufffdPayment": '"Payment',
        "Act\ufffd": 'Act"',
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    value = value.replace("\ufffd", "'")
    return re.sub(r"\s+", " ", value).strip()


def parse_source():
    parser = Extractor()
    parser.feed(SOURCE.read_text(encoding="utf-8"))
    return [item for item in parser.items if item[1] != "Document Sections"]


def decorate_page(canvas, doc):
    canvas.saveState()
    width, _ = A4
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(width - 18 * mm, 10 * mm, f"Discussion paper  |  {doc.page}")
    canvas.restoreState()


def build_pdf(destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(
        str(destination), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm,
        topMargin=23 * mm, bottomMargin=18 * mm, title="PaySME Vendor Programme - PSP Partnership",
        author="PaySME",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="body")
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPageEnd=decorate_page)])

    styles = getSampleStyleSheet()
    cover_label = ParagraphStyle(
        "CoverLabel", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10,
        leading=14, textColor=YELLOW, alignment=TA_CENTER, spaceAfter=10,
    )
    cover_title = ParagraphStyle(
        "CoverTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=28,
        leading=33, textColor=NAVY, alignment=TA_CENTER, spaceAfter=12,
    )
    cover_subtitle = ParagraphStyle(
        "CoverSubtitle", parent=styles["Normal"], fontName="Helvetica", fontSize=12,
        leading=18, textColor=MUTED, alignment=TA_CENTER,
    )
    h1 = ParagraphStyle(
        "H1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=22,
        leading=27, textColor=NAVY, spaceBefore=10, spaceAfter=10, keepWithNext=True,
    )
    h2 = ParagraphStyle(
        "H2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=15,
        leading=20, textColor=NAVY, spaceBefore=14, spaceAfter=7, keepWithNext=True,
        borderPadding=(0, 0, 5, 0), borderColor=YELLOW, borderWidth=0,
    )
    h3 = ParagraphStyle(
        "H3", parent=styles["Heading3"], fontName="Helvetica-Bold", fontSize=11.5,
        leading=15, textColor=INK, spaceBefore=9, spaceAfter=4, keepWithNext=True,
    )
    h4 = ParagraphStyle(
        "H4", parent=h3, fontSize=10.5, leading=14, textColor=NAVY,
    )
    body = ParagraphStyle(
        "Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5,
        leading=14.2, textColor=INK, spaceAfter=7,
    )
    bullet = ParagraphStyle(
        "Bullet", parent=body, leftIndent=12, firstLineIndent=-8, bulletIndent=0,
        spaceAfter=4,
    )
    note = ParagraphStyle(
        "Note", parent=body, fontName="Helvetica-Oblique", textColor=MUTED,
        backColor=PALE, borderPadding=8, spaceBefore=8, spaceAfter=10,
    )

    items = parse_source()
    intro = next((text for tag, text in items if tag == "p"), "")
    story = [
        Spacer(1, 33 * mm),
        Paragraph("CONFIDENTIAL DISCUSSION PAPER", cover_label),
        Paragraph("PaySME Vendor Programme", cover_title),
        Paragraph("Settlement and Payment Processing Partnership", cover_subtitle),
        Spacer(1, 12 * mm),
        Paragraph(escape(intro), note),
        Spacer(1, 21 * mm),
        Paragraph("Prepared for prospective licensed PSP and banking partners", cover_subtitle),
        Spacer(1, 4 * mm),
        Paragraph("Namibia", cover_label),
        PageBreak(),
    ]

    first_h1 = True
    for index, (tag, text) in enumerate(items):
        if tag == "h1":
            if first_h1:
                first_h1 = False
            story.append(Paragraph(escape(text), h1))
        elif tag == "h2":
            story.append(KeepTogether([
                Spacer(1, 2 * mm),
                Paragraph(escape(text), h2),
            ]))
        elif tag == "h3":
            story.append(Paragraph(escape(text), h3))
        elif tag == "h4":
            story.append(Paragraph(escape(text), h4))
        elif tag == "li":
            story.append(Paragraph(escape(text), bullet, bulletText="-"))
        elif tag == "p":
            is_disclaimer = text.startswith("This discussion paper is")
            story.append(Paragraph(escape(text), note if is_disclaimer else body))

    doc.build(story)


if __name__ == "__main__":
    for output in OUTPUTS:
        build_pdf(output)
        print(output)
