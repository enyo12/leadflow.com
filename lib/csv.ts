/**
 * Minimal RFC 4180 CSV writer.
 *
 * Hand-rolled rather than pulling in a library: the whole format is "quote it
 * if it is ambiguous, double the quotes", and the escaping rules are the part
 * worth being able to read and test. A dependency would add supply-chain
 * surface for ~40 lines of logic.
 *
 * Everything written here is untrusted text — company names from a public
 * provider, summaries from a language model — so nothing is passed through
 * unescaped.
 */

/**
 * Characters that spreadsheets treat as the start of a formula.
 *
 * A cell beginning with `=`, `+`, `-` or `@` is evaluated when the file is
 * opened in Excel, Sheets or LibreOffice, so a company named
 * `=HYPERLINK("http://evil","click")` would execute on the user's machine.
 * Prefixing with an apostrophe forces the cell to be read as text.
 *
 * Tab and CR are included because they are stripped by some importers before
 * the following character is evaluated, which would defeat the check.
 */
const RISKY_LEADING = new Set(["=", "+", "-", "@", "\t", "\r"]);

/** RFC 4180 uses CRLF; Excel, Sheets and Numbers all accept it. */
const ROW_SEPARATOR = "\r\n";

/**
 * Escapes one field.
 *
 * Quoting is applied when the value contains a delimiter, a quote, or a line
 * break — the cases that would otherwise corrupt the row structure — and also
 * when it has leading or trailing whitespace, which would be silently trimmed
 * by some importers.
 */
export function escapeCsvField(value: string): string {
  let field = value;

  if (field.length > 0 && RISKY_LEADING.has(field[0])) {
    field = `'${field}`;
  }

  const needsQuotes = /[",\r\n]/.test(field) || field !== field.trim();
  if (!needsQuotes) return field;

  return `"${field.replace(/"/g, '""')}"`;
}

/**
 * Serialises a header row and body rows.
 *
 * Throws when a row's length does not match the header. That is a programming
 * error rather than a data error, and failing loudly is better than emitting a
 * file whose columns silently shift.
 */
export function toCsv(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  for (const [index, row] of rows.entries()) {
    if (row.length !== headers.length) {
      throw new Error(
        `CSV row ${index} has ${row.length} fields, expected ${headers.length}`,
      );
    }
  }

  const lines = [headers, ...rows].map((row) =>
    row.map((field) => escapeCsvField(field)).join(","),
  );

  // Trailing newline: POSIX text files end with one, and it keeps the last row
  // from being dropped by tools that read lines greedily.
  return `${lines.join(ROW_SEPARATOR)}${ROW_SEPARATOR}`;
}

/**
 * Byte-order mark.
 *
 * Excel on Windows assumes the system ANSI codepage for a CSV unless a BOM says
 * otherwise, which turns accented company names into mojibake. The BOM is what
 * makes "UTF-8" true in practice rather than only in the Content-Type header,
 * and every other spreadsheet application ignores it.
 */
export const UTF8_BOM = "﻿";
