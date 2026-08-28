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

// Call Registration Request workflow spreadsheet (engineer requests + the
// transformed Data-2026 tab whose UCN-less rows are the Hotline pending list).
var CRN_ID = '1U7GRICswNErdJjacQN45QZxOI0MFh4krL-fvMDRtP7s';
var CRN_REQUEST_TAB = '2026-CRNRequest';
var CRN_DATA_TAB = 'Data-2026';
var CRN_UCN_HEADER = 'UC Number';

// The User Master spreadsheet — source of app logins.
var USERMASTER_ID = '1WUoxk_4hLlK4ZLP59SHQRSAxWqmutjcCIiFsul5r-mc';
var USER_EMAIL_HEADER = 'Email ID';   // Air Liquide login id
var USER_GMAIL_HEADER = 'GMAIL ID';   // Gmail login id
var USER_NAME_HEADER = 'User Name';
var USER_VALIDITY_HEADER = 'Validity'; // TRUE = may log in

// The column that holds the Unique Call Number, and the value written into the
// Call Type column for calls raised from the Field Call screen.
var UCN_HEADER = 'UC Number';
var CALLTYPE_HEADER = 'Call Type';
var REGDATE_HEADER = 'Call Registeration Date';

// Call reporting tab — engineers report / update a call here (keyed by UCN).
var REPORT_TAB = 'Reporting-N';

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
  if (action === 'prodsearch') return { ok: true, rows: _searchProducts(e.parameter, Number(e.parameter.limit) || 100) };
  if (action === 'auth') return _auth(e.parameter.mode, e.parameter.id, e.parameter.password);
  if (action === 'users') return { ok: true, rows: _users(e.parameter.q, Number(e.parameter.limit) || 300) };
  // Admin config — sheet links stored in the backend + verification.
  if (action === 'config') return { ok: true, config: _getConfig() };
  if (action === 'setconfig') return _setConfig(_parse(e.parameter.data));
  if (action === 'configcheck') return { ok: true, checks: _configCheck() };
  // Call Registration Request workflow (pending list + engineer requests).
  if (action === 'pending') return { ok: true, rows: _pending(Number(e.parameter.limit) || 200) };
  if (action === 'crnrequest') return _addCrn(_parse(e.parameter.data));
  if (action === 'setucn') return _setUcn(e.parameter.uid, e.parameter.ucn);
  // Shared "default for everyone" table views (admin-set), stored in script props.
  if (action === 'getview') return { ok: true, view: _getView(e.parameter.key) };
  if (action === 'setview') return _setView(e.parameter.key, e.parameter.data);
  // Writes are also accepted over GET (JSONP) so they work when the browser
  // blocks reading a cross-origin POST response.
  if (action === 'add') return _addCall(_parse(e.parameter.data), e.parameter.tab || tab);
  if (action === 'update') return _updateCall(e.parameter.ucn, _parse(e.parameter.patch), e.parameter.tab || tab);
  // Call reporting (Reporting-N tab): fetch/upsert a report by UC Number.
  if (action === 'reportget') return _getReport(e.parameter.ucn);
  if (action === 'report') return _saveReport(e.parameter.ucn, _parse(e.parameter.patch));
  // Generic tab helpers (spare consumption -> v2Consumption, feedback -> v2Feedback).
  if (action === 'tabmeta') return _tabMeta(e.parameter.tab, e.parameter.book);
  if (action === 'tabappend') return _tabAppend(e.parameter.tab, _parse(e.parameter.data), e.parameter.book);
  return { ok: false, error: 'Unknown action: ' + action };
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
    var action = body.action || 'add';
    if (action === 'add') return _json(_addCall(body.call || {}, body.tab || ''));
    if (action === 'update') return _json(_updateCall(body.ucn, body.patch || {}, body.tab || ''));
    if (action === 'reportget') return _json(_getReport(body.ucn));
    if (action === 'report') return _json(_saveReport(body.ucn, body.patch || {}));
    if (action === 'tabmeta') return _json(_tabMeta(body.tab, body.book));
    if (action === 'tabappend') return _json(_tabAppend(body.tab, body.data || {}, body.book));
    if (action === 'upload') return _json(_uploadReport(body));
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
  var ss = SpreadsheetApp.openById(_cfg('register'));
  var sheets = ss.getSheets();
  var out = [];
  for (var i = 0; i < sheets.length; i++) {
    out.push({ name: sheets[i].getName(), rows: Math.max(0, sheets[i].getLastRow() - 1), headers: _headers(sheets[i]) });
  }
  return out;
}

function _tabNames() {
  return SpreadsheetApp.openById(_cfg('register')).getSheets().map(function (s) { return s.getName(); });
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
// Call reporting (Reporting-N tab). A report is stored per call, keyed by UC
// Number. reportget returns the tab headers (so the app can build the form)
// plus the existing report row for a UCN (empty if none yet). report upserts:
// it updates the matching row in place, or appends a new row carrying the UCN.
// ---------------------------------------------------------------------------
function _reportSheet() {
  var ss = SpreadsheetApp.openById(_cfg('register'));
  var s = ss.getSheetByName(REPORT_TAB);
  if (!s) throw new Error('Reporting tab "' + REPORT_TAB + '" not found in the Call Register.');
  return s;
}

function _getReport(ucn) {
  var sheet = _reportSheet();
  var headers = _headers(sheet);
  var row = {};
  var ucnIdx = headers.indexOf(UCN_HEADER);
  var last = sheet.getLastRow();
  if (ucn && ucnIdx >= 0 && last >= 2) {
    var col = sheet.getRange(2, ucnIdx + 1, last - 1, 1).getValues();
    for (var i = 0; i < col.length; i++) {
      if (String(col[i][0]) === String(ucn)) {
        var vals = sheet.getRange(i + 2, 1, 1, headers.length).getValues()[0];
        for (var c = 0; c < headers.length; c++) row[headers[c]] = _cell(vals[c]);
        break;
      }
    }
  }
  return { ok: true, headers: headers, row: row };
}

function _saveReport(ucn, patch) {
  if (!ucn) return { ok: false, error: 'ucn required' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = _reportSheet();
    var headers = _headers(sheet);
    var ucnIdx = headers.indexOf(UCN_HEADER);
    if (ucnIdx < 0) return { ok: false, error: 'Reporting tab has no "' + UCN_HEADER + '" column.' };
    var last = sheet.getLastRow();
    if (last >= 2) {
      var col = sheet.getRange(2, ucnIdx + 1, last - 1, 1).getValues();
      for (var i = 0; i < col.length; i++) {
        if (String(col[i][0]) === String(ucn)) {
          var rowNum = i + 2;
          for (var h in patch) {
            var ci = headers.indexOf(h);
            if (ci >= 0) sheet.getRange(rowNum, ci + 1).setValue(patch[h]);
          }
          return { ok: true, ucn: ucn, mode: 'updated' };
        }
      }
    }
    // No existing report for this UCN — append a new row carrying the UCN.
    var record = {};
    for (var k in patch) record[k] = patch[k];
    record[UCN_HEADER] = ucn;
    var newRow = headers.map(function (h) { return record[h] != null ? record[h] : ''; });
    sheet.appendRow(newRow);
    return { ok: true, ucn: ucn, mode: 'appended' };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Generic tab helpers — used by the call-report sub-forms: spare consumption
// (v2Consumption) and customer feedback (v2Feedback). A `book` selects the
// spreadsheet: '' / 'register' → the Call Register; any other value resolves to
// a script-property cfg_<book> spreadsheet id if one has been set.
// ---------------------------------------------------------------------------
function _bookSheet(book, tab) {
  var ss;
  var propId = book ? PropertiesService.getScriptProperties().getProperty('cfg_' + book) : '';
  ss = propId ? SpreadsheetApp.openById(propId) : SpreadsheetApp.openById(_cfg('register'));
  var s = ss.getSheetByName(tab);
  if (!s) throw new Error('Tab "' + tab + '" not found' + (propId ? '.' : ' in the Call Register.'));
  return s;
}

function _tabMeta(tab, book) {
  if (!tab) return { ok: false, error: 'tab required' };
  return { ok: true, headers: _headers(_bookSheet(book, tab)) };
}

function _tabAppend(tab, data, book) {
  if (!tab) return { ok: false, error: 'tab required' };
  if (!data) return { ok: false, error: 'no data' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = _bookSheet(book, tab);
    var headers = _headers(sheet);
    var row = headers.map(function (h) { return data[h] != null ? data[h] : ''; });
    sheet.appendRow(row);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Manual report upload — store the file in Drive and write its link into the
// report's column on Reporting-N (keyed by UCN). POSTed as base64 so the file
// travels in the request body. The browser can't read this response (opaque
// cross-origin), so the app confirms by re-reading the report afterwards.
// ---------------------------------------------------------------------------
function _reportFolder() {
  var name = 'RITHI Manual Reports';
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function _uploadReport(body) {
  var ucn = body.ucn;
  var column = body.column || 'Manual Report';
  var b64 = body.dataBase64 || '';
  if (!ucn || !b64) return { ok: false, error: 'ucn and file required' };
  var bytes = Utilities.base64Decode(b64);
  var blob = Utilities.newBlob(bytes, body.mimeType || 'application/octet-stream', body.filename || ('report-' + ucn));
  var file = _reportFolder().createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* domain policy may forbid */ }
  var url = file.getUrl();
  var patch = {}; patch[column] = url;
  _saveReport(ucn, patch); // link the file into the report row
  return { ok: true, url: url };
}

// ---------------------------------------------------------------------------
// Product Master lookup — match a query against serial / code / name / party
// and return up to `limit` matching product rows (keyed by header).
// ---------------------------------------------------------------------------
function _searchProducts(params, limit) {
  // Accept a legacy string (global q) or a params object with explicit fields.
  if (typeof params === 'string') params = { q: params };
  params = params || {};
  limit = limit || 100;
  var q = String(params.q || '').trim().toLowerCase();
  var fParty = String(params.party || '').trim().toLowerCase();
  var fProduct = String(params.product || '').trim().toLowerCase();
  var fSerial = String(params.serial || '').trim().toLowerCase();
  var fStatus = String(params.status || '').trim().toLowerCase();

  var sheet = _prodSheet();
  var headers = _headers(sheet);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var nRows = last - 1;

  var anyFilter = q || fParty || fProduct || fSerial || fStatus;

  // No filter -> browse the first `limit` products (so the view isn't blank).
  if (!anyFilter) {
    var head = sheet.getRange(2, 1, Math.min(limit, nRows), headers.length).getValues();
    var browse = [];
    for (var b = 0; b < head.length; b++) {
      var ob = {};
      for (var bc = 0; bc < headers.length; bc++) ob[headers[bc]] = _cell(head[b][bc]);
      browse.push(ob);
    }
    return browse;
  }

  // Read only the columns we need to test (ProdMaster is large).
  var col = function (h) { var i = headers.indexOf(h); return i >= 0 ? sheet.getRange(2, i + 1, nRows, 1).getValues() : null; };
  var cParty = col('Party Name'), cName = col('Item Name'), cSerial = col('Item Serial Number'), cCode = col('Item Code'), cStatus = col('Item Status');

  var out = [];
  for (var i = 0; i < nRows; i++) {
    if (fParty && !(cParty && String(cParty[i][0]).toLowerCase().indexOf(fParty) !== -1)) continue;
    if (fProduct && !(cName && String(cName[i][0]).toLowerCase().indexOf(fProduct) !== -1)) continue;
    if (fSerial && !(cSerial && String(cSerial[i][0]).toLowerCase().indexOf(fSerial) !== -1)) continue;
    if (fStatus && !(cStatus && String(cStatus[i][0]).toLowerCase() === fStatus)) continue;
    if (q) {
      var hit = false;
      var scan = [cParty, cName, cSerial, cCode];
      for (var s = 0; s < scan.length; s++) {
        if (scan[s] && String(scan[s][i][0]).toLowerCase().indexOf(q) !== -1) { hit = true; break; }
      }
      if (!hit) continue;
    }
    var rowVals = sheet.getRange(i + 2, 1, 1, headers.length).getValues()[0];
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = _cell(rowVals[c]);
    out.push(obj);
    if (out.length >= limit) break;
  }
  return out;
}

function _prodSheet() {
  var ss = SpreadsheetApp.openById(_cfg('prodmaster'));
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (_headers(sheets[i]).indexOf(PROD_SERIAL_HEADER) >= 0) return sheets[i];
  }
  return ss.getActiveSheet();
}

function _partySheet() {
  var ss = SpreadsheetApp.openById(_cfg('partymaster'));
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
// User Master login. Passwords are stored as salted SHA-256 hashes in the
// script's private properties (never written into the sheet). Only users with
// Validity = TRUE may log in. First login (no password yet) returns
// needsPassword so the app can prompt to set one.
// ---------------------------------------------------------------------------
function _auth(mode, id, password) {
  mode = mode || 'login';
  id = String(id || '').trim().toLowerCase();
  if (!id) return { ok: false, error: 'id required' };
  var u = _findUser(id);
  if (!u) return { ok: false, error: 'not_found' };
  if (String(u[USER_VALIDITY_HEADER]).toUpperCase() !== 'TRUE') return { ok: false, error: 'inactive' };

  var props = PropertiesService.getScriptProperties();
  var key = 'pw_' + _userKey(u);
  if (mode === 'setpassword') {
    var pw = String(password || '');
    if (pw.length < 5) return { ok: false, error: 'weak' };
    props.setProperty(key, _hash(pw));
    return { ok: true, user: _userPublic(u) };
  }
  var stored = props.getProperty(key);
  if (!stored) return { ok: true, needsPassword: true, user: _userPublic(u) };
  if (_hash(String(password || '')) !== stored) return { ok: false, error: 'bad_password' };
  return { ok: true, user: _userPublic(u) };
}

// All User Master rows (irrespective of Validity), optionally filtered by q.
function _users(q, limit) {
  q = String(q || '').trim().toLowerCase();
  limit = limit || 300;
  var sheet = _userSheet();
  var headers = _headers(sheet);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var ni = headers.indexOf(USER_NAME_HEADER);
  var searchIdx = [USER_NAME_HEADER, USER_EMAIL_HEADER, USER_GMAIL_HEADER, 'REGION', 'Designation', 'RM', 'RGM']
    .map(function (h) { return headers.indexOf(h); })
    .filter(function (i) { return i >= 0; });
  var vals = sheet.getRange(2, 1, last - 1, headers.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    if (ni >= 0 && !String(vals[i][ni]).trim()) continue; // skip blank rows
    if (q) {
      var hit = false;
      for (var s = 0; s < searchIdx.length; s++) {
        if (String(vals[i][searchIdx[s]]).toLowerCase().indexOf(q) !== -1) { hit = true; break; }
      }
      if (!hit) continue;
    }
    var o = {};
    for (var c = 0; c < headers.length; c++) o[headers[c]] = _cell(vals[i][c]);
    out.push(o);
    if (out.length >= limit) break;
  }
  return out;
}

function _userSheet() {
  var ss = SpreadsheetApp.openById(_cfg('usermaster'));
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (_headers(sheets[i]).indexOf(USER_EMAIL_HEADER) >= 0) return sheets[i];
  }
  return ss.getActiveSheet();
}

function _findUser(id) {
  var sheet = _userSheet();
  var headers = _headers(sheet);
  var ei = headers.indexOf(USER_EMAIL_HEADER), gi = headers.indexOf(USER_GMAIL_HEADER);
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var vals = sheet.getRange(2, 1, last - 1, headers.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    var em = ei >= 0 ? String(vals[i][ei]).trim().toLowerCase() : '';
    var gm = gi >= 0 ? String(vals[i][gi]).trim().toLowerCase() : '';
    if (em === id || gm === id) {
      var o = {};
      for (var c = 0; c < headers.length; c++) o[headers[c]] = _cell(vals[i][c]);
      return o;
    }
  }
  return null;
}

function _userKey(u) {
  return String(u[USER_EMAIL_HEADER] || u[USER_GMAIL_HEADER] || '').trim().toLowerCase();
}

function _userPublic(u) {
  return {
    name: u[USER_NAME_HEADER] || '',
    email: u[USER_EMAIL_HEADER] || '',
    gmail: u[USER_GMAIL_HEADER] || '',
    designation: u['Designation'] || '',
    region: u['REGION'] || '',
    rm: u['RM'] || '',
    rgm: u['RGM'] || '',
  };
}

function _hash(pw) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'rithi$' + pw, Utilities.Charset.UTF_8);
  return raw.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function _registerSheet(tab) {
  // Standalone script: open the Call Register by ID (no active spreadsheet).
  var ss = SpreadsheetApp.openById(_cfg('register'));
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

function _parse(s) {
  try { return JSON.parse(s || '{}'); } catch (e) { return {}; }
}

// ---------------------------------------------------------------------------
// Backend config — sheet links stored in script properties (cfg_*), with the
// constants above as defaults. Editable + verifiable from the Admin Config UI.
// ---------------------------------------------------------------------------
var CFG_KEYS = {
  register: 'SPREADSHEET_ID',
  prodmaster: 'PRODMASTER_ID',
  partymaster: 'PARTYMASTER_ID',
  usermaster: 'USERMASTER_ID',
  crn: 'CRN_ID',
};
var CFG_DEFAULTS = {
  register: SPREADSHEET_ID,
  prodmaster: PRODMASTER_ID,
  partymaster: PARTYMASTER_ID,
  usermaster: USERMASTER_ID,
  crn: CRN_ID,
};
function _cfg(name) {
  var v = PropertiesService.getScriptProperties().getProperty('cfg_' + CFG_KEYS[name]);
  return v || CFG_DEFAULTS[name];
}
function _getConfig() {
  var o = {};
  for (var k in CFG_KEYS) o[k] = _cfg(k);
  return o;
}
function _setConfig(data) {
  var props = PropertiesService.getScriptProperties();
  for (var k in CFG_KEYS) {
    if (data[k] != null && String(data[k]).trim()) props.setProperty('cfg_' + CFG_KEYS[k], String(data[k]).trim());
  }
  return { ok: true, config: _getConfig() };
}
function _openName(id) {
  try {
    var ss = SpreadsheetApp.openById(id);
    return { ok: true, name: ss.getName(), tabs: ss.getSheets().map(function (s) { return s.getName(); }) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
function _configCheck() {
  var c = _getConfig();
  var out = {};
  for (var k in c) out[k] = _openName(c[k]);
  return out;
}

// ---------------------------------------------------------------------------
// Call Registration Request workflow.
// ---------------------------------------------------------------------------
function _crnSheet(name) {
  return SpreadsheetApp.openById(_cfg('crn')).getSheetByName(name);
}

// Data-2026 rows without a UC Number = the Hotline pending list.
function _pending(limit) {
  limit = limit || 200;
  var sheet = _crnSheet(CRN_DATA_TAB);
  if (!sheet) return [];
  var headers = _headers(sheet);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var ui = headers.indexOf(CRN_UCN_HEADER);
  var vals = sheet.getRange(2, 1, last - 1, headers.length).getValues();
  var out = [];
  for (var i = vals.length - 1; i >= 0; i--) {
    if (ui >= 0 && String(vals[i][ui]).trim() !== '') continue; // already has a UCN
    var hasData = false;
    for (var c = 0; c < headers.length; c++) { if (String(vals[i][c]).trim()) { hasData = true; break; } }
    if (!hasData) continue;
    var o = { _row: i + 2 };
    for (var c2 = 0; c2 < headers.length; c2++) o[headers[c2]] = _cell(vals[i][c2]);
    out.push(o);
    if (out.length >= limit) break;
  }
  return out;
}

function _addCrn(data) {
  var sheet = _crnSheet(CRN_REQUEST_TAB);
  if (!sheet) return { ok: false, error: 'no request tab' };
  var headers = _headers(sheet);
  if (!data['Timestamp']) data['Timestamp'] = _fmt(new Date(), 'dd-MMM-yyyy HH:mm:ss');
  var row = headers.map(function (h) { return data[h] != null ? data[h] : ''; });
  sheet.appendRow(row);
  return { ok: true };
}

// Back-fill a UC Number into a Data-2026 row (identified by its sheet row).
function _setUcn(rowNum, ucn) {
  var sheet = _crnSheet(CRN_DATA_TAB);
  if (!sheet) return { ok: false, error: 'no Data tab' };
  var headers = _headers(sheet);
  var ui = headers.indexOf(CRN_UCN_HEADER);
  if (ui < 0) return { ok: false, error: 'no UC Number column' };
  var r = Number(rowNum);
  if (!r || r < 2) return { ok: false, error: 'bad row' };
  sheet.getRange(r, ui + 1).setValue(ucn);
  return { ok: true };
}

function _getView(key) {
  if (!key) return null;
  var v = PropertiesService.getScriptProperties().getProperty('view_' + key);
  return v ? _parse(v) : null;
}

function _setView(key, data) {
  if (!key) return { ok: false, error: 'key required' };
  PropertiesService.getScriptProperties().setProperty('view_' + key, String(data || '{}'));
  return { ok: true };
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
