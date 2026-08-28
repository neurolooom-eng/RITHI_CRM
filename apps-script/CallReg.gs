/**
 * CallReg — RITHI CRM bridge for the Field / Installation Call Register.
 *
 * This is a STANDALONE Google Apps Script project (named "CallReg"), pasted
 * separately — it is NOT bound to the spreadsheet. Because there is no "active
 * spreadsheet", it opens the Call Register by ID (SPREADSHEET_ID below).
 *
 * Deploy it as a Web App (see DEPLOY.md). The RITHI CRM web app then reads and
 * writes calls through the single Web App URL — the Sheet stays the one source
 * of truth.
 *
 * Endpoints (all on the same /exec URL):
 *   GET  ?action=ping                       -> { ok, sheet, headers, count }
 *   GET  ?action=list[&type=FIELD][&limit=] -> { ok, rows: [ {header: value} ] }
 *   POST { action:'add', call:{...} }        -> { ok, ucn, row }
 *   POST { action:'update', ucn, patch:{} }  -> { ok, ucn }
 *
 * The POST body is sent as text/plain (JSON string) so browsers treat it as a
 * "simple" request and skip the CORS pre-flight that Apps Script cannot answer.
 */

// The Call Register spreadsheet this bridge talks to. Take it from the sheet
// URL: https://docs.google.com/spreadsheets/d/<THIS IS THE ID>/edit
var SPREADSHEET_ID = '1aMSnQV4TIWC2FuZfXxBIcLTxTk_I52wRr6AZgNIFv_I';

// The column that holds the Unique Call Number, and the value written into the
// Call Type column for calls raised from the Field Call screen.
var UCN_HEADER = 'UC Number';
var CALLTYPE_HEADER = 'Call Type';
var REGDATE_HEADER = 'Call Registeration Date';

// ---------------------------------------------------------------------------
// HTTP entry points
// ---------------------------------------------------------------------------
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'ping';
    if (action === 'ping') return _json(_ping());
    if (action === 'list') {
      return _json({ ok: true, rows: _list(e.parameter.type, Number(e.parameter.limit) || 0) });
    }
    return _json({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
    var action = body.action || 'add';
    if (action === 'add') return _json(_addCall(body.call || {}));
    if (action === 'update') return _json(_updateCall(body.ucn, body.patch || {}));
    return _json({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------
function _ping() {
  var sheet = _registerSheet();
  var headers = _headers(sheet);
  return { ok: true, sheet: sheet.getName(), headers: headers, count: Math.max(0, sheet.getLastRow() - 1) };
}

function _list(type, limit) {
  var sheet = _registerSheet();
  var headers = _headers(sheet);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var values = sheet.getRange(2, 1, last - 1, headers.length).getValues();
  var typeIdx = headers.indexOf(CALLTYPE_HEADER);
  var out = [];
  for (var i = values.length - 1; i >= 0; i--) {
    var r = values[i];
    if (type && typeIdx >= 0 && String(r[typeIdx]).toUpperCase().indexOf(type.toUpperCase()) === -1) continue;
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = _cell(r[c]);
    out.push(obj);
    if (limit && out.length >= limit) break;
  }
  return out;
}

function _addCall(call) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000); // serialise UCN assignment
  try {
    var sheet = _registerSheet();
    var headers = _headers(sheet);
    var now = new Date();
    var callType = call[CALLTYPE_HEADER] || 'FIELD';
    var ucn = _nextUcn(sheet, headers, callType, now);

    var record = {};
    for (var k in call) record[k] = call[k];
    record[UCN_HEADER] = ucn;
    record[CALLTYPE_HEADER] = callType;
    if (!record[REGDATE_HEADER]) record[REGDATE_HEADER] = _fmt(now, 'dd-MMM-yyyy HH:mm:ss');

    var row = headers.map(function (h) { return record[h] != null ? record[h] : ''; });
    sheet.appendRow(row);

    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = _cell(row[c]);
    return { ok: true, ucn: ucn, row: obj };
  } finally {
    lock.releaseLock();
  }
}

function _updateCall(ucn, patch) {
  if (!ucn) return { ok: false, error: 'ucn required' };
  var sheet = _registerSheet();
  var headers = _headers(sheet);
  var ucnIdx = headers.indexOf(UCN_HEADER);
  var last = sheet.getLastRow();
  var col = sheet.getRange(2, ucnIdx + 1, last - 1, 1).getValues();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]) === String(ucn)) {
      var rowNum = i + 2;
      for (var h in patch) {
        var ci = headers.indexOf(h);
        if (ci >= 0) sheet.getRange(rowNum, ci + 1).setValue(patch[h]);
      }
      return { ok: true, ucn: ucn };
    }
  }
  return { ok: false, error: 'UCN not found: ' + ucn };
}

// ---------------------------------------------------------------------------
// UCN — 26 + monthLetter(A=Jan..L=Dec) + DD + typeLetter(F/I) + 4-digit seq
// The sequence resets per calendar day + call type, matching the existing sheet.
// ---------------------------------------------------------------------------
function _nextUcn(sheet, headers, callType, when) {
  var yy = _fmt(when, 'yy');
  var monthLetter = String.fromCharCode(65 + when.getMonth()); // 0=Jan -> 'A'
  var dd = _fmt(when, 'dd');
  var typeLetter = _typeLetter(callType);
  var prefix = yy + monthLetter + dd + typeLetter; // e.g. 26A02F
  var ucnIdx = headers.indexOf(UCN_HEADER);
  var last = sheet.getLastRow();
  var max = 0;
  if (last >= 2 && ucnIdx >= 0) {
    var col = sheet.getRange(2, ucnIdx + 1, last - 1, 1).getValues();
    for (var i = 0; i < col.length; i++) {
      var v = String(col[i][0]);
      if (v.indexOf(prefix) === 0) {
        var n = parseInt(v.substring(prefix.length), 10);
        if (!isNaN(n) && n > max) max = n;
      }
    }
  }
  return prefix + _pad(max + 1, 4);
}

function _typeLetter(callType) {
  var t = String(callType || '').toUpperCase();
  if (t.indexOf('INSTALL') === 0) return 'I';
  if (t.indexOf('FIELD') === 0) return 'F';
  return t.charAt(0) || 'F';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function _registerSheet() {
  // Standalone script: open the Call Register by ID (no active spreadsheet).
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheets = ss.getSheets();
  // Prefer the tab whose header row contains the UCN column.
  for (var i = 0; i < sheets.length; i++) {
    var h = _headers(sheets[i]);
    if (h.indexOf(UCN_HEADER) >= 0) return sheets[i];
  }
  return ss.getActiveSheet();
}

function _headers(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
}

function _cell(v) {
  if (v instanceof Date) return _fmt(v, 'dd-MMM-yyyy HH:mm:ss');
  return v == null ? '' : v;
}

function _fmt(d, pattern) {
  return Utilities.formatDate(d, Session.getScriptTimeZone() || 'Asia/Kolkata', pattern);
}

function _pad(n, width) {
  var s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
