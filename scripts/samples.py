"""Generate the fictional demo files. Requires Node dependencies and reportlab."""
from io import BytesIO
from json import loads, dumps
from pathlib import Path
from subprocess import check_output
from xml.sax.saxutils import escape
from zipfile import ZipFile, ZIP_DEFLATED
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "samples"
WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
data = loads(check_output(
    ["node", "--import", "tsx", "--input-type=module", "-e",
     "import {demo} from './src/demo.ts'; console.log(JSON.stringify(demo))"], cwd=ROOT
))

def docx(title, lines):
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as package:
        package.writestr("[Content_Types].xml",
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            f'<Override PartName="/word/document.xml" ContentType="{TYPE}"/></Types>')
        package.writestr("_rels/.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        paragraphs = []
        for index, line in enumerate([title, *lines]):
            properties = '<w:rPr><w:b/><w:sz w:val="36"/></w:rPr>' if index == 0 else ''
            paragraphs.append(f'<w:p><w:r>{properties}<w:t>{escape(line)}</w:t></w:r></w:p>')
        package.writestr("word/document.xml",
            f'<w:document xmlns:w="{WORD}"><w:body>{"".join(paragraphs)}</w:body></w:document>')
    return buffer.getvalue()

def pdf(title, lines):
    buffer = BytesIO()
    styles = getSampleStyleSheet()
    content = [Paragraph(escape(title), styles["Title"]), Paragraph("Fictional sample for Legal Ops Workbench", styles["Italic"]), Spacer(1, 18)]
    content.extend(Paragraph(escape(line), styles["BodyText"]) for line in lines)
    SimpleDocTemplate(buffer, title=title).build(content)
    return buffer.getvalue()

OUT.mkdir(parents=True, exist_ok=True)
with ZipFile(OUT / "legal-ops-samples.zip", "w", ZIP_DEFLATED) as archive:
    for item in data["docs"]:
        lines = [f'{part["label"]}  {part["text"]}' for part in item["sources"]]
        name = item["id"] + (".pdf" if item["id"] == "terms" else ".docx")
        body = (pdf if name.endswith(".pdf") else docx)(item["name"], lines)
        archive.writestr(name, body)
        if item["id"] in ("msa", "terms"):
            (OUT / name).write_bytes(body)
    archive.writestr("case-guide.txt", "\n".join(
        [data["title"], data["description"], "", "All content is fictional.", "",
         *(f'{item["id"]}: {item["role"]} / {item["version"]}' for item in data["docs"])]
    ))
    archive.writestr("decision-history.json", dumps(data["entries"], indent=2))
    archive.write(OUT / "company-rule-template.md", "company-rule-template.md")

buffer = BytesIO()
page = canvas.Canvas(buffer)
page.rect(30, 30, 60, 60, fill=1)
page.showPage()
page.save()
(ROOT / "tests" / "no-text.pdf").write_bytes(buffer.getvalue())
