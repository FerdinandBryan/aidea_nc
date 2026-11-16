"""Reflow a private DOCX copy, update existing TOC values, and export its PDF.

No uploaded macros, external links, or template instructions are executed.
"""
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import uuid

import uno
from com.sun.star.beans import PropertyValue


def prop(name, value):
    item = PropertyValue()
    item.Name, item.Value = name, value
    return item


def key(text):
    return " ".join(re.findall(r"\w+", unicodedata.normalize("NFKC", text).casefold()))


def chapter(text):
    match = re.match(r"^chapter\s+(\d+|[ivxlcdm]+|one|two|three|four|five)\b", key(text))
    if not match:
        return None
    number = match[1]
    return {"i": "1", "ii": "2", "iii": "3", "iv": "4", "v": "5",
            "one": "1", "two": "2", "three": "3", "four": "4", "five": "5"}.get(number, number)


def paragraphs(doc):
    result = []
    iterator = doc.Text.createEnumeration()
    while iterator.hasMoreElements():
        item = iterator.nextElement()
        if item.supportsService("com.sun.star.text.Paragraph"):
            result.append(item)
    return result


def roman(number):
    result = ""
    for value, symbol in [(1000, "m"), (900, "cm"), (500, "d"), (400, "cd"),
                          (100, "c"), (90, "xc"), (50, "l"), (40, "xl"),
                          (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")]:
        while number >= value:
            result += symbol
            number -= value
    return result


def main(binary, directory):
    pipe = "aidea_" + uuid.uuid4().hex
    profile = uno.systemPathToFileUrl(os.path.join(directory, "profile"))
    process = subprocess.Popen([binary, "--headless", "--norestore", "--nodefault", "--nofirststartwizard",
                                "-env:UserInstallation=" + profile,
                                "--accept=pipe,name=" + pipe + ";urp;StarOffice.ComponentContext"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    doc = None
    try:
        local = uno.getComponentContext()
        resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
        context = None
        for attempt in range(100):
            try:
                context = resolver.resolve("uno:pipe,name=" + pipe + ";urp;StarOffice.ComponentContext")
                break
            except Exception:
                time.sleep(0.1)
        if context is None:
            raise RuntimeError("Document renderer did not start")
        desktop = context.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", context)
        doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(os.path.join(directory, "input.docx")),
                                          "_blank", 0, (prop("Hidden", True), prop("UpdateDocMode", 0), prop("MacroExecutionMode", 0)))
        items = paragraphs(doc)
        toc = next((i for i, p in enumerate(items) if key(p.String) == "table of contents"), None)
        if toc is None:
            raise RuntimeError("No standalone Table of Contents heading was found")
        # TOC rows have tabs/leaders/page suffixes; actual Chapter 1 does not.
        first = next((i for i in range(toc + 1, len(items)) if chapter(items[i].String) == "1"
                      and not re.search(r"\t|\.{2,}|[\u2024-\u2026]", items[i].String)
                      and not re.match(r"toc", items[i].ParaStyleName, re.I)
                      and (len(key(items[i].String).split()) == 2 or items[i].OutlineLevel > 0)), None)
        if first is None:
            raise RuntimeError("Chapter 1 could not be identified unambiguously")
        styles = doc.StyleFamilies.getByName("PageStyles")
        clones = {}
        current = None
        source_names = []
        for paragraph in items[first:]:
            view = doc.CurrentController.ViewCursor
            view.gotoRange(paragraph.Start, False)
            source_names.append(view.PageStyleName)
        for index, paragraph in enumerate(items[first:]):
            source_name = source_names[index]
            if source_name not in clones:
                source = styles.getByName(source_name)
                name = "AIDEA numbered " + uuid.uuid4().hex
                clone = doc.createInstance("com.sun.star.style.PageStyle")
                styles.insertByName(name, clone)
                for info in source.PropertySetInfo.Properties:
                    if info.Attributes & 16 or info.Name in ("Name", "DisplayName", "FollowStyle") or "Text" in info.Name:
                        continue
                    try:
                        clone.setPropertyValue(info.Name, source.getPropertyValue(info.Name))
                    except Exception:
                        pass
                for region in ("HeaderText", "HeaderTextLeft", "HeaderTextRight", "HeaderTextFirst",
                               "FooterText", "FooterTextLeft", "FooterTextRight", "FooterTextFirst"):
                    try:
                        original = source.getPropertyValue(region)
                    except Exception:
                        continue
                    if original is not None:
                        clone.getPropertyValue(region).copyText(original)
                clone.FollowStyle = name
                clone.NumberingType = 4  # Arabic
                # Keep existing page fields; add one only when the style has none.
                has_page = False
                for region in ("HeaderText", "FooterText"):
                    try:
                        enum = clone.getPropertyValue(region).createEnumeration()
                        while enum.hasMoreElements():
                            para = enum.nextElement()
                            portions = para.createEnumeration()
                            while portions.hasMoreElements():
                                portion = portions.nextElement()
                                if portion.TextPortionType == "TextField" and portion.TextField.supportsService("com.sun.star.text.textfield.PageNumber"):
                                    has_page = True
                    except Exception:
                        pass
                if not has_page:
                    clone.FooterIsOn = True
                    footer = clone.FooterText
                    cursor = footer.createTextCursor()
                    cursor.gotoEnd(False)
                    if footer.String.strip():
                        footer.insertControlCharacter(cursor, 0, False)
                    cursor.ParaAdjust = 3  # centered
                    field = doc.createInstance("com.sun.star.text.textfield.PageNumber")
                    field.NumberingType = 4
                    field.SubType = uno.Enum("com.sun.star.text.PageNumberType", "CURRENT")
                    footer.insertTextContent(cursor, field, False)
                clones[source_name] = name
            if index == 0 or source_name != current:
                paragraph.PageDescName = clones[source_name]
            paragraph.PageNumberOffset = 1 if index == 0 else 0
            if index == 0:
                paragraph.BreakType = uno.Enum("com.sun.star.style.BreakType", "PAGE_BEFORE")
            current = source_name

        entries = []
        scope = None
        for paragraph in items[toc + 1:first]:
            if key(paragraph.String) in ("list of tables", "list of figures", "list of appendices"):
                break
            text = paragraph.String
            match = re.search(r"(?:\t+|\.{2,}|[\u2024-\u2026]+|\s{2,})(\d+|[ivxlcdm]+)\s*$", text, re.I)
            if not match:
                continue
            title = text[:match.start()].strip(" .\t\n\u2024\u2025\u2026")
            scope = chapter(title) or scope
            entries.append((paragraph, title, scope))

        warnings = []
        # Recalculate until changing TOC digits no longer changes target pages.
        stable = False
        for attempt in range(5):
            doc.refresh()
            doc.TextFields.refresh()
            view = doc.CurrentController.ViewCursor
            candidates = {}
            scope = None
            view.gotoRange(items[first].Start, False)
            start_page = view.getPage()
            for index, paragraph in enumerate(items):
                if toc <= index < first:
                    continue
                text = paragraph.String.strip()
                if not text:
                    continue
                if index >= first:
                    scope = chapter(text) or scope
                view.gotoRange(paragraph.Start, False)
                physical = view.getPage()
                number = str(physical - start_page + 1) if index >= first else roman(physical)
                candidates.setdefault((key(text), scope if index >= first else None), []).append(number)
                if chapter(text):
                    candidates.setdefault(("chapter " + chapter(text), scope), []).append(number)
            changes = 0
            unresolved = []
            for paragraph, title, scope in entries:
                lookup = "chapter " + chapter(title) if chapter(title) else key(title)
                values = candidates.get((lookup, scope), [])
                if not values:
                    values = [page for (label, _), pages in candidates.items() if label == lookup for page in pages]
                values = set(values)
                if len(values) != 1:
                    unresolved.append(title)
                    continue
                match = re.search(r"(\d+|[ivxlcdm]+)\s*$", paragraph.String, re.I)
                desired = next(iter(values))
                if match.group(1) == desired:
                    continue
                cursor = paragraph.Text.createTextCursorByRange(paragraph.Start)
                cursor.goRight(len(paragraph.String[:match.start(1)].encode("utf-16-le")) // 2, False)
                cursor.goRight(len(match.group(1)), True)
                cursor.String = desired
                changes += 1
            if changes == 0:
                stable = True
                break
        if not entries:
            raise RuntimeError("No supported TOC rows were found; original values were preserved")
        if not stable:
            raise RuntimeError("Pagination did not converge")
        for title in unresolved:
            warnings.append("TOC entry needs review: " + title)
        doc.storeToURL(uno.systemPathToFileUrl(os.path.join(directory, "output.docx")), (prop("FilterName", "Office Open XML Text"), prop("Overwrite", True)))
        doc.storeToURL(uno.systemPathToFileUrl(os.path.join(directory, "output.pdf")), (prop("FilterName", "writer_pdf_Export"), prop("Overwrite", True)))
        return {"status": "complete", "toc_entries": len(entries), "matched_entries": len(entries) - len(unresolved), "chapter_one_start": 1, "warnings": warnings}
    finally:
        try:
            if doc is not None:
                doc.close(True)
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    try:
        result = main(sys.argv[1], sys.argv[2])
    except Exception as error:
        result = {"status": "unresolved", "warnings": ["TOC pagination requires review: " + str(error)]}
    with open(os.path.join(sys.argv[2], "result.json"), "w", encoding="utf-8") as handle:
        json.dump(result, handle)
