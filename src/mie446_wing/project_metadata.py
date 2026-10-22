"""Plain project labels and portable filenames; never geometry or executable input."""

from html import escape
import re
import unicodedata


def normalize_project_name(value: str) -> str:
    """Match the browser's 80 UTF-16-unit label limit, preserving Persian text."""
    if not isinstance(value, str):
        raise ValueError("projectName must be plain text")
    if any(ord(c) < 32 or 127 <= ord(c) <= 159 or 0x202A <= ord(c) <= 0x202E
           or 0x2066 <= ord(c) <= 0x2069 or 0xD800 <= ord(c) <= 0xDFFF for c in value):
        raise ValueError("projectName contains control characters, line breaks or directional overrides")
    if len(value.encode("utf-16-le")) // 2 > 80:
        raise ValueError("projectName must be at most 80 characters")
    # ECMAScript trim includes U+FEFF, unlike Python str.strip().
    return re.sub(r"^[\s\ufeff]+|[\s\ufeff]+$", "", value)


def safe_project_stem(value: str, fallback: str = "wing") -> str:
    """Return one safe filename component, not a path; keep Unicode letters/digits."""
    def token(text):
        text = unicodedata.normalize("NFC", text)
        text = "".join(c if unicodedata.category(c)[0] in "LN" or c in "_-" else "-" for c in text)
        return re.sub("-+", "-", text).strip("-")[:64]
    stem = token(value) or token(fallback) or "wing"
    if re.fullmatch(r"con|prn|aux|nul|com[1-9]|lpt[1-9]", stem, flags=re.I):
        stem = "wing-" + stem
    return stem


def project_markdown(value: str) -> str:
    """A label remains visible literal text in notebook/report Markdown."""
    return re.sub(r"([\\`*_{}\[\]()!|])", r"\\\1", escape(value, quote=True))
