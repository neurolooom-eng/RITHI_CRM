// ---------------------------------------------------------------------------
// WHAT A DOCUMENT'S FILENAME ALREADY TELLS YOU.
//
// The browser hands over four things about a file it is given — name, size,
// type and last-modified — and nothing whatever from inside the document. But
// the name is not nothing: this project's own manuals are filed as
//
//     SM-SER-XT Rev.05.pdf
//
// which is the document number and the revision, the two fields most worth
// having and the two most often left blank or mistyped.
//
// SUGGESTIONS, NEVER FACTS. A filename is a convention, not a guarantee, so
// what this returns fills EMPTY fields only, is shown as having been suggested,
// and is overwritten by whatever the person types. A wrong guess therefore
// costs a keystroke, which is why the patterns can afford to be generous.
//
// Deliberately NOT guessed:
//   * the effective date — a date in a filename is as often the day somebody
//     saved it as the day the document came into force, and writing the wrong
//     one into a controlled field is worse than leaving it empty
//   * the title — a real title ("Extend-XT Maintenance Manual") is usually not
//     in the filename at all
// ---------------------------------------------------------------------------

export interface DocNameMeta { docNo: string; revision: string }

// The revision token, in the shapes a service department actually uses. Each
// keeps the word so the field reads as it was written — "Rev.05", not "05".
// `\b` is no use as the left edge: `_` is a word character, so `QMS-014_Rev-3`
// has no boundary before `Rev` and went unmatched. The edge is "start, or a
// character that is not a letter or digit" instead — the separator is outside
// the capture, and the document number has its trailing separators trimmed.
const SEP = '(?:^|[^A-Za-z0-9])';
const REVISION = [
  new RegExp(`${SEP}(rev(?:ision)?[.\\s_-]*\\d+(?:\\.\\d+)?)`, 'i'),   // Rev.05  Rev 05  Rev-05  Rev05  Revision 2
  new RegExp(`${SEP}(v(?:er(?:sion)?)?[.\\s_-]*\\d+(?:\\.\\d+)+)`, 'i'), // v1.2  Ver 2.0  Version 1.10
  new RegExp(`${SEP}(v(?:er(?:sion)?)?[.\\s_-]*\\d+)\\b`, 'i'),          // v2  Ver 3
  new RegExp(`${SEP}(iss(?:ue)?[.\\s_-]*\\d+)`, 'i'),                    // Issue 3  Iss.2
  // A bare `R05` only after a SPACE or underscore, never after a hyphen: a
  // hyphen is what document codes are built from, and `SM-R05-XT` is one code,
  // not a code and a revision.
  /(?:^|[\s_])(r\d+)\b/i,
];

export function metaFromFileName(fileName: string): DocNameMeta {
  const stem = String(fileName ?? '').replace(/\.[^.]+$/, '').trim();
  if (!stem) return { docNo: '', revision: '' };

  for (const re of REVISION) {
    const m = stem.match(re);
    if (!m || m.index === undefined) continue;
    const revision = m[1].trim();
    // The document number is what stands BEFORE the revision — but only when
    // there is a revision to stand before. Without that split point, anything
    // taken from the name is a guess about a guess, so nothing is suggested.
    const docNo = stem.slice(0, m.index).replace(/[\s._-]+$/, '').trim();
    return { docNo, revision };
  }
  return { docNo: '', revision: '' };
}
