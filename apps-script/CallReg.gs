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

// The Product Master ("ProdMaster") spreadsheet used to look up an item when
// registering a call (party, product, warranty, contract auto-fill).
var PRODMASTER_ID = '1mJvWGE7Ixn39vTfYm2RMYp52eGyvM98gRVkJ2ghBIXM';
var PROD_SERIAL_HEADER = 'Item Serial Number';
// Columns a product search query is matched against.
var PROD_SEARCH_HEADERS = ['Item Serial Number', 'Item Code', 'Item Name', 'Party Name'];

// The Party Master spreadsheet — source of the full party list for the cascade.
var PARTYMASTER_ID = '1wdd2LpVTDbsYuxUdX5N3d_hKkIlMAiNq5hzvy8KWFrQ';
var PARTY_NAME_HEADER = 'Party Name';

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
    if (!_authOk(e, null)) return _reply(e, { ok: false, error: 'unauthorized' });
    return _reply(e, _dispatchGet(e));
  } catch (err) {
    return _reply(e, { ok: false, error: String(err) });
  }
}

// Optional shared-secret gate. If a Script Property named ACCESS_TOKEN is set,
// every request must carry a matching ?token= (or body.token). If it is not
// set, the endpoint is open (URL acts as the secret). This lets the app gate
// the data without a redeploy — just set the property and the token in Settings.
function _authOk(e, body) {
  var need = PropertiesService.getScriptProperties().getProperty('ACCESS_TOKEN');
  if (!need) return true;
  var got = (e && e.parameter && e.parameter.token) || (body && body.token) || '';
  return String(got) === String(need);
}

function _dispatchGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'ping';
  var tab = e.parameter.tab || '';
  if (action === 'ping') return _ping(tab);
  if (action === 'tabs') return { ok: true, tabs: _tabs() };
  if (action === 'list') return { ok: true, rows: _list(e.parameter.type, Number(e.parameter.limit) || 0, tab) };
  if (action === 'parties') return { ok: true, values: _distinctFrom(_partySheet(), PARTY_NAME_HEADER) };
  if (action === 'products') return { ok: true, values: _distinctWhere('Item Name', 'Party Name', e.parameter.party) };
  if (action === 'items') return { ok: true, rows: _items(e.parameter.party, e.parameter.product, Number(e.parameter.limit) || 200) };
  if (action === 'prodsearch') return { ok: true, rows: _searchProducts(e.parameter.q, Number(e.parameter.limit) || 100) };
  return { ok: false, error: 'Unknown action: ' + action };
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
    var action = body.action || 'add';
    if (action === 'add') return _json(_addCall(body.call || {}, body.tab || ''));
    if (action === 'update') return _json(_updateCall(body.ucn, body.patch || {}, body.tab || ''));
    return _json({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

// ---------------------------------------------------------------------------
// Core operations
// ---------------------------------------------------------------------------
function _ping(tab) {
  var sheet = _registerSheet(tab);
  var headers = _headers(sheet);
  return {
    ok: true,
    sheet: sheet.getName(),
    headers: headers,
    count: Math.max(0, sheet.getLastRow() - 1),
    tabs: _tabNames(),
  };
}

// All tab names + headers + row counts (introspection, for picking the right tab).
function _tabs() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheets = ss.getSheets();
  var out = [];
  for (var i = 0; i < sheets.length; i++) {
    out.push({ name: sheets[i].getName(), rows: Math.max(0, sheets[i].getLastRow() - 1), headers: _headers(sheets[i]) });
  }
  return out;
}

function _tabNames() {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheets().map(function (s) { return s.getName(); });
}

function _list(type, limit, tab) {
  var sheet = _registerSheet(tab);
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

function _addCall(call, tab) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000); // serialise UCN assignment
  try {
    var sheet = _registerSheet(tab);
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

function _updateCall(ucn, patch, tab) {
  if (!ucn) return { ok: false, error: 'ucn required' };
  var sheet = _registerSheet(tab);
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
// Product Master lookup — match a query against serial / code / name / party
// and return up to `limit` matching product rows (keyed by header).
// ---------------------------------------------------------------------------
function _searchProducts(q, limit) {
  q = String(q || '').trim().toLowerCase();
  if (!q) return [];
  limit = limit || 10;
  var sheet = _prodSheet();
  var headers = _headers(sheet);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var nRows = last - 1;

  // ProdMaster is large (tens of thousands of rows), so scan only the search
  // columns to find matching rows, then read the full row for each match.
  var searchCols = PROD_SEARCH_HEADERS
    .map(function (h) { return headers.indexOf(h); })
    .filter(function (i) { return i >= 0; });
  var colData = {};
  for (var s = 0; s < searchCols.length; s++) {
    colData[searchCols[s]] = sheet.getRange(2, searchCols[s] + 1, nRows, 1).getValues();
  }

  var out = [];
  for (var i = 0; i < nRows; i++) {
    var hit = false;
    for (var s2 = 0; s2 < searchCols.length; s2++) {
      var ci = searchCols[s2];
      if (String(colData[ci][i][0]).toLowerCase().indexOf(q) !== -1) { hit = true; break; }
    }
    if (!hit) continue;
    var rowVals = sheet.getRange(i + 2, 1, 1, headers.length).getValues()[0];
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = _cell(rowVals[c]);
    out.push(obj);
    if (out.length >= limit) break;
  }
  return out;
}

function _prodSheet() {
  var ss = SpreadsheetApp.openById(PRODMASTER_ID);
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (_headers(sheets[i]).indexOf(PROD_SERIAL_HEADER) >= 0) return sheets[i];
  }
  return ss.getActiveSheet();
}

function _partySheet() {
  var ss = SpreadsheetApp.openById(PARTYMASTER_ID);
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (_headers(sheets[i]).indexOf(PARTY_NAME_HEADER) >= 0) return sheets[i];
  }
  return ss.getActiveSheet();
}

// Distinct non-empty values of one column in the given sheet.
function _distinctFrom(sheet, header) {
  var headers = _headers(sheet);
  var ci = headers.indexOf(header);
  var last = sheet.getLastRow();
  if (ci < 0 || last < 2) return [];
  var col = sheet.getRange(2, ci + 1, last - 1, 1).getValues();
  var seen = {}, out = [];
  for (var i = 0; i < col.length; i++) {
    var v = String(col[i][0]).trim();
    if (v && !seen[v]) { seen[v] = 1; out.push(v); }
  }
  out.sort();
  return out;
}

// Distinct values of `header` where `whereHeader` == whereVal (Product for a Party).
function _distinctWhere(header, whereHeader, whereVal) {
  whereVal = String(whereVal || '').trim();
  var sheet = _prodSheet();
  var headers = _headers(sheet);
  var ci = headers.indexOf(header), wi = headers.indexOf(whereHeader);
  var last = sheet.getLastRow();
  if (ci < 0 || wi < 0 || last < 2 || !whereVal) return [];
  var n = last - 1;
  var colV = sheet.getRange(2, ci + 1, n, 1).getValues();
  var colW = sheet.getRange(2, wi + 1, n, 1).getValues();
  var seen = {}, out = [];
  for (var i = 0; i < n; i++) {
    if (String(colW[i][0]).trim() !== whereVal) continue;
    var v = String(colV[i][0]).trim();
    if (v && !seen[v]) { seen[v] = 1; out.push(v); }
  }
  out.sort();
  return out;
}

// Full product rows for a Party (+ optional Product), for the Serial dropdown.
function _items(party, product, limit) {
  party = String(party || '').trim();
  product = String(product || '').trim();
  limit = limit || 200;
  var sheet = _prodSheet();
  var headers = _headers(sheet);
  var pi = headers.indexOf('Party Name'), ni = headers.indexOf('Item Name');
  var last = sheet.getLastRow();
  if (pi < 0 || last < 2 || !party) return [];
  var n = last - 1;
  var colP = sheet.getRange(2, pi + 1, n, 1).getValues();
  var colN = ni >= 0 ? sheet.getRange(2, ni + 1, n, 1).getValues() : null;
  var out = [];
  for (var i = 0; i < n; i++) {
    if (String(colP[i][0]).trim() !== party) continue;
    if (product && colN && String(colN[i][0]).trim() !== product) continue;
    var rowVals = sheet.getRange(i + 2, 1, 1, headers.length).getValues()[0];
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = _cell(rowVals[c]);
    out.push(obj);
    if (out.length >= limit) break;
  }
  return out;
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
function _registerSheet(tab) {
  // Standalone script: open the Call Register by ID (no active spreadsheet).
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  // If a specific tab is requested, use it.
  if (tab) {
    var named = ss.getSheetByName(tab);
    if (named) return named;
  }
  var sheets = ss.getSheets();
  // Otherwise prefer the tab whose header row contains the UCN column.
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

// GET reply that supports JSONP when a ?callback= is supplied. JSONP lets the
// browser read the response cross-origin without CORS headers (which Apps
// Script cannot set), so reads work reliably from the hosted app.
function _reply(e, obj) {
  var cb = e && e.parameter && e.parameter.callback;
  if (cb) {
    return ContentService
      .createTextOutput(cb + '(' + JSON.stringify(obj) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return _json(obj);
}
