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

// Spare Request Register (26_SpareRequest) — engineers raise spare requests
// (Call Based, linked to a UC Number). v2_ORReq-All is the intake; v2_OR_Req is
// the exploded per-part status view (approval + dispatch chain).
var SPAREREQ_ID = '1ABx7lfLGH24-btRauO56btlPLFMC0BQyUsdN5ss8uDU';
var SPAREREQ_INTAKE_TAB = 'v2_ORReq-All';
var SPAREREQ_STATUS_TAB = 'v2_OR_Req';

// Report-time captures — standalone spreadsheets (NOT tabs of the Call Register).
// Spare consumption and customer feedback from the call report land here.
var CONSUMPTION_ID = '1j1IHT3PL4Ott19wbmKt59JPS-Z66CYYt1PSL2JgdG7o';
var FEEDBACK_ID = '1Mi-b-JYebEnO7wlg8kgOVSgyN7g9-44hHDpplk-nqXc';

// ITEM Master — the spare/part list (Item Details = "Code|Name"); Active only.
var ITEMMASTER_ID = '1253ilQjQWUsy801PA2Jt6PQOX5dhJOU6BYrxhjOj6r8';

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
  if (action === 'list') return { ok: true, rows: _list(e.parameter.type, Number(e.parameter.limit) || 0, tab, e.parameter.book) };
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
  // Drive upload hand-off: read back the link for a POSTed file by its ref.
  if (action === 'driveref') return _getRef(e.parameter.ref);
  // Bulk report mapping: resolve AppSheet file names to Drive links (read-only).
  if (action === 'drivefind') return _driveFind(e.parameter.names, e.parameter.folderId);
  // Serve a document the app uploaded, so the app can SHOW it (see _driveFile).
  if (action === 'drivefile') return _driveFile(e.parameter.id);
  // DCCR mirror, run by hand. The four time-driven triggers call dccrMirror()
  // directly; this is how somebody fires one now and SEES the answer, which
  // the trigger log does not make easy. Gated by ACCESS_TOKEN like everything
  // else here.
  if (action === 'dccrmirror') return dccrMirror();
  if (action === 'dccrinstall') return installDccrMirror();
  if (action === 'dccrremove') return removeDccrMirror();
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
  // Master lists (Party / Product / Standard Complaint / Call Type ...): the
  // distinct values of a configured master column, for form dropdowns.
  if (action === 'master') return _master(e.parameter.name, Number(e.parameter.limit) || 0);
  if (action === 'masters') return { ok: true, registry: _masters() };
  if (action === 'setmasters') return _setMasters(_parse(e.parameter.data));
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
    if (action === 'driveupload') return _json(_driveUpload(body));
    if (action === 'master') return _json(_master(body.name, Number(body.limit) || 0));
    if (action === 'masters') return _json({ ok: true, registry: _masters() });
    if (action === 'setmasters') return _json(_setMasters(body.data || {}));
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

function _list(type, limit, tab, book) {
  var sheet = book ? _bookSheet(book, tab) : _registerSheet(tab);
  var headers = _headers(sheet);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  var typeIdx = headers.indexOf(CALLTYPE_HEADER);
  // Without a type filter, read only the newest `limit` rows instead of the
  // whole tab — keeps reads fast when a register holds thousands of rows.
  var startRow = 2, numRows = last - 1;
  if (!type && limit && numRows > limit) { numRows = limit; startRow = last - limit + 1; }
  var values = sheet.getRange(startRow, 1, numRows, headers.length).getValues();
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
// Resolve a book name to a spreadsheet: a CFG_KEYS entry (register / prodmaster /
// partymaster / usermaster / crn / sparereq / consumption / feedback), else a
// cfg_<book> script property, else the Call Register.
function _bookSS(book) {
  if (book && CFG_KEYS[book]) return SpreadsheetApp.openById(_cfg(book));
  var pid = book ? PropertiesService.getScriptProperties().getProperty('cfg_' + book) : '';
  return pid ? SpreadsheetApp.openById(pid) : SpreadsheetApp.openById(_cfg('register'));
}

function _bookSheet(book, tab) {
  var ss = _bookSS(book);
  if (tab) {
    var s = ss.getSheetByName(tab);
    if (!s) throw new Error('Tab "' + tab + '" not found in the ' + (book || 'register') + ' book.');
    return s;
  }
  // No tab given: prefer a sheet whose name hints at the book (e.g. a
  // "…Consumption…"/"…Feedback…" tab), else the first sheet.
  var sheets = ss.getSheets();
  if (book) {
    var hint = String(book).toLowerCase();
    for (var i = 0; i < sheets.length; i++) {
      if (String(sheets[i].getName()).toLowerCase().indexOf(hint) >= 0) return sheets[i];
    }
  }
  return sheets[0];
}

function _tabMeta(tab, book) {
  if (!tab && !book) return { ok: false, error: 'tab or book required' };
  return { ok: true, headers: _headers(_bookSheet(book, tab)) };
}

function _tabAppend(tab, data, book) {
  if (!tab && !book) return { ok: false, error: 'tab or book required' };
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
// Master value lists — the distinct values of a configured column, used to fill
// form dropdowns (Party, Product, Standard Complaint, Call Type, ...). The
// registry lives in a single script property `cfg_MASTERS` (JSON) so masters
// can be pointed at any sheet/tab/column from Admin Config without a redeploy:
//   { "complaint": { "id":"<sheetId>", "tab":"...", "col":"Standard Complaint" },
//     "calltype":  { "id":"<sheetId>", "tab":"...", "col":"Call Type" } }
// Each entry may use `id` (explicit spreadsheet id) or `book` (a cfg key such as
// partymaster / prodmaster / register). Party & Product work by default.
// ---------------------------------------------------------------------------
function _masters() {
  var raw = PropertiesService.getScriptProperties().getProperty('cfg_MASTERS');
  var reg = {};
  try { reg = raw ? JSON.parse(raw) : {}; } catch (e) { reg = {}; }
  if (!reg.party) reg.party = { book: 'partymaster', col: PARTY_NAME_HEADER };
  if (!reg.product) reg.product = { book: 'prodmaster', col: 'Item Name' };
  // Masters that live in "200 All Masters" (each identified by its column header;
  // the tab is located automatically when no tab is given).
  var ALLM = '1bhpInqMlfmbsqtWm6s6CwOhTHdGruDAe672I275xGEE';
  if (!reg.complaint) reg.complaint = { id: ALLM, tab: 'Standard Complaint', col: 'Complaint Name' };
  if (!reg.calltype) reg.calltype = { id: ALLM, col: 'Call Type' };
  if (!reg.pendingreason) reg.pendingreason = { id: ALLM, col: 'Call Pending Reason Name' };
  if (!reg.cancelreason) reg.cancelreason = { id: ALLM, col: 'Call Cancel Reason Name' };
  // Spare parts list from ITEM Master — "Item Details" (Code|Name), Active only.
  if (!reg.spare) reg.spare = { book: 'itemmaster', tab: 'ITEM Master', col: 'Item Details', whereCol: 'Active/Inactive?', whereVal: 'Active' };
  // Customer feedback rating scale (Excellent / Good / Average / Poor).
  if (!reg.feedbackrating) reg.feedbackrating = { id: ALLM, tab: 'Feedback', col: 'Feedback' };
  return reg;
}

function _setMasters(data) {
  // Merge the provided entries into the registry (empty/absent entries kept).
  var reg = _masters();
  for (var k in data) { if (data[k]) reg[k] = data[k]; }
  PropertiesService.getScriptProperties().setProperty('cfg_MASTERS', JSON.stringify(reg));
  return { ok: true, registry: reg };
}

function _masterSS(m) {
  if (m.id) return SpreadsheetApp.openById(m.id);
  if (m.book) {
    if (CFG_KEYS[m.book]) return SpreadsheetApp.openById(_cfg(m.book));
    var pid = PropertiesService.getScriptProperties().getProperty('cfg_' + m.book);
    if (pid) return SpreadsheetApp.openById(pid);
  }
  return SpreadsheetApp.openById(_cfg('register'));
}

function _master(name, limit) {
  if (!name) return { ok: false, error: 'name required' };
  var m = _masters()[name];
  if (!m || !m.col) return { ok: false, error: 'Master not configured: ' + name };
  var ss = _masterSS(m);
  var sheet = m.tab ? ss.getSheetByName(m.tab) : null;
  if (m.tab && !sheet) return { ok: false, error: 'Tab "' + m.tab + '" not found for master ' + name };
  if (!sheet) {
    // No tab given: pick the first sheet that has the column.
    var all = ss.getSheets();
    for (var i = 0; i < all.length; i++) { if (_headers(all[i]).indexOf(m.col) >= 0) { sheet = all[i]; break; } }
    if (!sheet) sheet = ss.getActiveSheet();
  }
  var headers = _headers(sheet);
  var ci = headers.indexOf(m.col);
  if (ci < 0) return { ok: false, error: 'Column "' + m.col + '" not found for master ' + name };
  var last = sheet.getLastRow();
  if (last < 2) return { ok: true, values: [], col: m.col };
  // Optional filter: only rows where whereCol == whereVal (e.g. Active items).
  var wi = m.whereCol ? headers.indexOf(m.whereCol) : -1;
  var want = String(m.whereVal == null ? '' : m.whereVal).trim().toLowerCase();
  var vals = sheet.getRange(2, 1, last - 1, headers.length).getValues();
  var seen = {}, out = [];
  for (var r = 0; r < vals.length; r++) {
    if (wi >= 0 && want && String(vals[r][wi]).trim().toLowerCase() !== want) continue;
    var v = String(vals[r][ci]).trim();
    if (v && !seen[v]) { seen[v] = 1; out.push(v); }
  }
  out.sort();
  if (limit && out.length > limit) out = out.slice(0, limit);
  return { ok: true, values: out, col: m.col };
}

// ---------------------------------------------------------------------------
// Manual report upload — store the file in Drive and write its link into the
// report's column on Reporting-N (keyed by UCN). POSTed as base64 so the file
// travels in the request body. The browser can't read this response (opaque
// cross-origin), so the app confirms by re-reading the report afterwards.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// WHERE A FILE GOES — one shared drive, five folders, chosen by what the file IS.
//
// The user, 2026-09-20: "RE-route the File Storage ... Map it to the appropriate
// folders". Everything used to land in ONE flat folder, which is why a Field
// report, an Installation KYC and a PM report were indistinguishable the moment
// they were uploaded. Storage is now the AIR LIQUIDE "Reports" shared drive and
// each kind of document gets the folder that already exists for it.
//
// RESOLVED BY NAME, NOT BY A PASTED ID, and that is the load-bearing decision:
// a shared drive's subfolder ids cannot be read from outside the drive, so an
// id copied off a screenshot is a GUESS — and a wrong one does not fail, it
// files the document somewhere nobody thinks to look. The names below are the
// folders as that drive lists them. Each id is resolved once and remembered in
// script properties, so this costs one lookup per folder per deployment, and a
// remembered id that stops resolving (folder moved, renamed, deleted) is
// dropped and looked up again rather than trusted.
//
// A KEY THAT CANNOT BE RESOLVED FALLS BACK TO THE DRIVE ROOT — never to an
// error and never to nothing. Losing an engineer's signed report is worse than
// filing it one level up, and the root is still inside the shared drive.
// ---------------------------------------------------------------------------
var DRIVE_ROOT_ID = '0AEcWDaijkhs_Uk9PVA';   // "Reports" shared drive (AIR LIQUIDE)

var DRIVE_FOLDERS = {
  field:        'Field Reports',          // a Field call's service report
  installation: 'Installation Reports',   // an Installation call's report
  pm:           'PM Reports',             // a PM call's report
  kyc:          'KYC',                    // Call Request -> KYC
  additional:   'Additional Reports'      // Call Request -> Installation Report
};

// The flat folder everything went to before today. STILL READ, NEVER WRITTEN:
// every report uploaded until now lives in it, and dropping it from here would
// make all of them unservable through `drivefile` — see _isAppDocument.
var REPORT_FOLDER_ID = '1-46Ud9j3mXnInzlYr_zfFGEL-xx4z2La';

function _legacyFolder() {
  try { return DriveApp.getFolderById(REPORT_FOLDER_ID); }
  catch (e) {
    var name = 'RITHI Manual Reports';
    var it = DriveApp.getFoldersByName(name);
    return it.hasNext() ? it.next() : DriveApp.createFolder(name);
  }
}

function _driveRoot() {
  try { return DriveApp.getFolderById(DRIVE_ROOT_ID); } catch (e) { return null; }
}

// The id of one mapped folder, remembered between runs. '' when the drive or
// the folder is out of reach — the caller falls back, it does not throw.
function _folderIdFor(key) {
  var name = DRIVE_FOLDERS[key];
  if (!name) return '';
  var props = null, cached = '';
  try { props = PropertiesService.getScriptProperties(); cached = props.getProperty('folder_' + key) || ''; }
  catch (e) { /* properties optional */ }
  if (cached) {
    try { DriveApp.getFolderById(cached); return cached; }
    catch (e) { try { if (props) props.deleteProperty('folder_' + key); } catch (e2) { /* ignore */ } }
  }
  var root = _driveRoot();
  if (!root) return '';
  var it = root.getFoldersByName(name);
  if (!it.hasNext()) return '';
  var id = it.next().getId();
  try { if (props) props.setProperty('folder_' + key, id); } catch (e) { /* properties optional */ }
  return id;
}

// The named folder, else the drive root, else the flat folder this system used
// before — in that order, so an upload is never lost.
function _driveFolder(key) {
  var id = key ? _folderIdFor(key) : '';
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* fall through */ } }
  return _driveRoot() || _legacyFolder();
}

// WHICH FOLDER A VISIT REPORT BELONGS IN, read off the UCN. `next_ucn` builds
// <YY><MonthLetter><DD><TypeLetter><nnnn>, so the SIXTH character is the type:
// I installation, P PM, anything else field. Mirrors call_table_for() in SQL.
function _folderKeyForUcn(ucn) {
  var t = String(ucn || '').charAt(5).toUpperCase();
  if (t === 'I') return 'installation';
  if (t === 'P') return 'pm';
  return 'field';
}

function _uploadReport(body) {
  var ucn = body.ucn;
  var column = body.column || 'Manual Report';
  var b64 = body.dataBase64 || '';
  if (!ucn || !b64) return { ok: false, error: 'ucn and file required' };
  var bytes = Utilities.base64Decode(b64);
  var blob = Utilities.newBlob(bytes, body.mimeType || 'application/octet-stream', body.filename || ('report-' + ucn));
  // The caller may name the folder; otherwise the UCN says which call this is.
  var file = _driveFolder(body.folder || _folderKeyForUcn(ucn)).createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* domain policy may forbid */ }
  var url = file.getUrl();
  var patch = {}; patch[column] = url;
  _saveReport(ucn, patch); // link the file into the report row
  return { ok: true, url: url };
}

// ---------------------------------------------------------------------------
// Generic Drive upload — stores a file and returns its link WITHOUT writing to
// a sheet. Used by Request Call Registration (Installation Report / KYC), which
// has no UCN yet. The browser can't read the POST response, so the client sends
// a `ref` and picks the link up afterwards with the `driveref` GET action.
// ---------------------------------------------------------------------------
// A folder that overrides the mapping entirely, for a deployment that wants one
// place for the request documents. Empty is the normal case: `body.folder`
// decides, and Request Call Registration sends 'kyc' or 'additional'.
var REQUEST_DOC_FOLDER_ID = '';

function _driveUpload(body) {
  var b64 = body.dataBase64 || '';
  if (!b64) return { ok: false, error: 'file required' };
  var name = body.filename || ('upload-' + Date.now());
  if (body.prefix) name = String(body.prefix).replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) + ' - ' + name;
  var bytes = Utilities.base64Decode(b64);
  var blob = Utilities.newBlob(bytes, body.mimeType || 'application/octet-stream', name);
  // WHICH FOLDER: whatever the caller asked for. An unknown key is not an
  // error — _driveFolder falls back to the drive root rather than refusing a
  // document somebody is standing there waiting to attach.
  var folder = REQUEST_DOC_FOLDER_ID
    ? (function () { try { return DriveApp.getFolderById(REQUEST_DOC_FOLDER_ID); } catch (e) { return _driveFolder(body.folder); } })()
    : _driveFolder(body.folder);
  var file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* domain policy may forbid */ }
  var url = file.getUrl();
  if (body.ref) _putRef(String(body.ref), url);
  return { ok: true, url: url, name: name };
}

// ---------------------------------------------------------------------------
// SERVE A DOCUMENT THE APP UPLOADED, so the app can SHOW it.
//
// The user, 2026-09-08: "my org doesn't allow anyone with link can view" — so
// the setSharing() call above has been failing all along (it is wrapped in a
// catch precisely because a domain policy can forbid it), and a report is
// readable only by somebody who already has access to the folder. Embedding the
// Drive preview therefore shows Google's "you need access" page to everybody
// else, and — because the frame is cross-origin — the app cannot even tell.
//
// THIS SCRIPT ALREADY HAS THE ACCESS THE BROWSER LACKS. It is deployed
// "Execute as: Me" (DEPLOY.md), which is how it writes into the folder in the
// first place; so it can read back out of it and hand the bytes to the app.
// Nothing about the file's sharing changes, and the engineer needs no Google
// account at all.
//
// ONLY THE APP'S OWN FOLDERS. `_isAppDocument` walks the file's parents and
// refuses anything that is not in the reports folder (or the request-documents
// folder where one is configured). Without that check this action is a reader
// for the whole of the deploying account's Drive — a far larger thing than the
// service reports it exists to show. It is the one guard here that must not be
// relaxed.
//
// AND IT IS STILL AN OPEN ENDPOINT. Whoever can reach the /exec URL can ask for
// a file if they know its id — which is, in effect, the "anyone with the link"
// the domain policy forbids, arrived at from another direction. That is a
// decision for whoever owns this system rather than a detail: setting the
// ACCESS_TOKEN script property (see _authOk above) puts every request behind a
// shared secret if an open endpoint is not acceptable.
//
// BASE64 IN JSON, because ContentService cannot return arbitrary binary — the
// same shape the upload uses in the other direction. The app decodes it to a
// blob and renders that.
// ---------------------------------------------------------------------------
var DRIVE_SERVE_MAX_BYTES = 10 * 1024 * 1024;   // the upload cap, mirrored

function _driveFile(id) {
  if (!id) return { ok: false, error: 'file id required' };
  var file;
  try { file = DriveApp.getFileById(String(id)); }
  catch (err) { return { ok: false, error: 'not found, or this account cannot open it' }; }
  if (!_isAppDocument(file)) return { ok: false, error: 'not a document this app uploaded' };
  // A Google-native file (Doc/Sheet) has no original bytes; getBlob() gives a
  // PDF rendering of it, which is what a reader wants anyway.
  var size = 0;
  try { size = file.getSize(); } catch (err) { size = 0; }
  if (size > DRIVE_SERVE_MAX_BYTES) {
    return { ok: false, error: 'too large to show here (' + Math.round(size / 1024 / 1024) + ' MB) — open it in Drive' };
  }
  var blob = file.getBlob();
  return {
    ok: true,
    name: file.getName(),
    mimeType: blob.getContentType() || 'application/octet-stream',
    size: size,
    dataBase64: Utilities.base64Encode(blob.getBytes())
  };
}

// Is this file one of ours? PARENTS, not names: a name can be anything, and the
// folder a file sits in is the only thing that says the app put it there.
function _isAppDocument(file) {
  var want = {};
  // EVERY folder this app writes to, and the one it used to write to. Leaving
  // the old one out would refuse every report uploaded before the re-route —
  // they would stop opening in the app with no error to explain it.
  try { want[_legacyFolder().getId()] = true; } catch (err) { /* folder unreachable */ }
  try { var r = _driveRoot(); if (r) want[r.getId()] = true; } catch (err) { /* drive unreachable */ }
  for (var key in DRIVE_FOLDERS) {
    var id = _folderIdFor(key);
    if (id) want[id] = true;
  }
  if (REQUEST_DOC_FOLDER_ID) want[REQUEST_DOC_FOLDER_ID] = true;
  try {
    var it = file.getParents();
    while (it.hasNext()) { if (want[it.next().getId()]) return true; }
  } catch (err) { /* no access to the parents = not ours */ }
  return false;
}

// ---------------------------------------------------------------------------
// Drive lookup by FILE NAME — for the bulk report -> call mapping, which is
// recovering visit history whose attachments are still AppSheet references
// (`Reports_Images/foo.png`) rather than Drive links.
//
// Read-only, and served over GET because a GET response IS readable
// cross-origin — no ref/poll dance needed, unlike the uploads above.
//
// `names` is a newline-separated batch, so a few hundred rows resolve in a
// handful of calls instead of one call each. An AMBIGUOUS name (the same file
// name in more than one place) comes back as an empty string rather than a
// guess: attaching the wrong photo to a service record is worse than attaching
// none, and the import shows it as unresolved for a human to settle.
// ---------------------------------------------------------------------------
function _driveFind(namesRaw, folderId) {
  var names = String(namesRaw || '').split('\n')
    .map(function (n) { return n.trim(); })
    .filter(function (n) { return n.length; })
    .slice(0, 200);                       // one batch; the client pages
  if (!names.length) return { ok: false, error: 'names required' };

  var root = null;
  if (folderId) { try { root = DriveApp.getFolderById(folderId); } catch (e) { return { ok: false, error: 'folder not found: ' + folderId }; } }

  var out = {}, ambiguous = [];
  for (var i = 0; i < names.length; i++) {
    var n = names[i];
    var it = root ? root.getFilesByName(n) : DriveApp.getFilesByName(n);
    var found = [];
    while (it.hasNext() && found.length < 3) found.push(it.next());
    // A folder search only sees that folder's own files, so fall back to a
    // whole-Drive search by name when a folder was given and came up empty --
    // AppSheet nests its image folders one level down.
    if (!found.length && root) {
      var g = DriveApp.getFilesByName(n);
      while (g.hasNext() && found.length < 3) found.push(g.next());
    }
    if (found.length === 1) {
      try { found[0].setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* domain policy may forbid */ }
      out[n] = found[0].getUrl();
    } else if (found.length > 1) {
      out[n] = '';
      ambiguous.push(n);
    } else {
      out[n] = '';
    }
  }
  return { ok: true, links: out, ambiguous: ambiguous };
}

// ref -> url hand-off. Cached for 15 min; the property copy is the fallback and
// is deleted once the client has read it, so nothing accumulates.
function _putRef(ref, url) {
  try { CacheService.getScriptCache().put('ref_' + ref, url, 900); } catch (e) { /* cache optional */ }
  try { PropertiesService.getScriptProperties().setProperty('ref_' + ref, url); } catch (e) { /* props optional */ }
}

function _getRef(ref) {
  if (!ref) return { ok: false, error: 'ref required' };
  var url = null;
  try { url = CacheService.getScriptCache().get('ref_' + ref); } catch (e) { /* cache optional */ }
  var props = PropertiesService.getScriptProperties();
  if (!url) { try { url = props.getProperty('ref_' + ref); } catch (e) { /* props optional */ } }
  if (!url) return { ok: false, error: 'pending' };
  try { props.deleteProperty('ref_' + ref); } catch (e) { /* best effort */ }
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
  sparereq: 'SPAREREQ_ID',
  consumption: 'CONSUMPTION_ID',
  feedback: 'FEEDBACK_ID',
  itemmaster: 'ITEMMASTER_ID',
};
var CFG_DEFAULTS = {
  register: SPREADSHEET_ID,
  prodmaster: PRODMASTER_ID,
  partymaster: PARTYMASTER_ID,
  usermaster: USERMASTER_ID,
  crn: CRN_ID,
  sparereq: SPAREREQ_ID,
  consumption: CONSUMPTION_ID,
  feedback: FEEDBACK_ID,
  itemmaster: ITEMMASTER_ID,
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

// ===========================================================================
// DCCR MIRROR — the Daily Complaint Review Register, written to a Google Sheet.
//
//   The user, 2026-09-24: "The DCCR Register should be written to the Google
//   Sheet ... Tab 'DCCR_Mirror' ; Frequency : every 6 hrs ; Starting today by
//   10PM", and then: "DCCR - Update the CallReg google script".
//
// WHY IT LIVES HERE AND NOT IN THE APP. A browser cannot run on a schedule. The
// register lives in Supabase and the destination is a Google Sheet, so the one
// thing that can sit between them on a timer, with rights to both, is this
// script -- which already holds this operation's Sheets credentials and nothing
// else does.
//
// ----------------------------------------------------------------------------
// WHAT TO PUT IN SCRIPT PROPERTIES  (Project Settings -> Script Properties)
//
//   SUPABASE_URL        https://<project>.supabase.co
//   SUPABASE_ANON_KEY   the publishable anon key (the same one the web app
//                       ships; it is public by design and enforces nothing on
//                       its own)
//
//   ...and then ONE of these two, and the FIRST is strongly preferred:
//
//   (a)  DCCR_EMAIL / DCCR_PASSWORD
//        A REAL SUPABASE LOGIN, made for this job and nothing else, on a role
//        that can read the review register and write nothing. The script signs
//        in, gets a short-lived token, and reads AS THAT USER -- so row-level
//        security applies exactly as it does on screen, and the worst a leak of
//        this property can do is what that one account can do. Revoking it is
//        deactivating a user.
//
//   (b)  SUPABASE_SERVICE_KEY
//        The service_role key. IT BYPASSES ROW-LEVEL SECURITY ENTIRELY and can
//        read and WRITE every table in the project. This script will use it if
//        it is set, because a mirror that cannot read is useless -- but it is a
//        master key sitting in a Google project, and (a) exists so it does not
//        have to. The web app has never carried this key and must not.
//
// The script's TIMEZONE decides what "10 PM" means: set it to Asia/Kolkata in
// Project Settings, or the four runs land on somebody else's clock.
// ----------------------------------------------------------------------------
var DCCR_MIRROR_ID  = '1AclacXLGRxn21NT5JdrB1wWMsdiqJPU-K-MBlDc_gaI';
var DCCR_MIRROR_TAB = 'DCCR_Mirror';
// One small tab beside it, because a mirror nobody can tell has stopped is a
// mirror nobody can trust: it says when it last ran, how many rows it wrote and
// what went wrong if anything did. Newest first, capped.
var DCCR_STATUS_TAB = 'DCCR_Mirror_Status';
var DCCR_STATUS_KEEP = 200;
// EVERY SIX HOURS FROM 10 PM. Apps Script cannot anchor `everyHours(6)` to a
// clock time -- it starts counting from whenever the trigger was made -- so the
// schedule is four DAILY triggers instead. Apps Script fires a time-driven
// trigger within about an hour of the stated one; these are the hours it aims
// at, not a guarantee to the minute.
var DCCR_HOURS = [22, 4, 10, 16];
// PostgREST answers at most 1,000 rows however large a range asks for, and a
// FULL page says nothing about whether another exists -- so the loop below ends
// on a SHORT one. Same rule as the app's own pager, for the same reason.
var DCCR_PAGE = 1000;
// The view the Daily Complaint Review Register itself reads, in the order that
// screen reads it, so the sheet is the register and not a second opinion.
var DCCR_VIEW  = 'field_call_review';
var DCCR_ORDER = 'reg_date.desc.nullslast,id.desc';

// THE COLUMNS, AND THEY ARE A COPY. `DCCR_EXPORT_COLUMNS` in src/lib/dccr.ts is
// the original -- the WRR-2026 shape, so an export pastes into that workbook
// without shifting a column -- and `npm run check:ui` compares this list with
// it KEY FOR KEY AND HEADING FOR HEADING on every run. Change one, change both;
// the check is what stops the sheet and the CSV drifting into two registers.
var DCCR_COLUMNS = [
  ['updated_by', 'Updated By'],
  ['updated_date', 'Updated Date'],
  ['sl_no', 'Sl. NO'],
  ['reg_date', 'CALL DATE'],
  ['complaint_date', 'COMPLAINT DATE'],
  ['call_number', 'Call Number'],
  ['ucn', 'UC Number'],
  ['party_name', 'CUSTOMER NAME'],
  ['city', 'PLACE'],
  ['product_name', 'PRODUCT'],
  ['serial', 'SERIAL No.'],
  ['call_type', 'CALL TYPE'],
  ['standard_complaint', 'Standard Complaint'],
  ['complaint_reported', 'NATURE OF COMPLAINT'],
  ['item_status', 'EQUIP. STATUS'],
  ['allocated_to', 'ENGINEER'],
  ['call_status', 'CALL STATUS'],
  ['pending_reason', 'CALL PENDING REASON'],
  ['warranty_number', 'WARRANTY NO'],
  ['warranty_start', 'WARRANTY START DATE'],
  ['call_details', 'CALL DETAILS'],
  ['visit_remarks', 'VISIT REMARKS'],
  ['change_product', 'CHANGE PRODUCT?'],
  ['public_health_threat', 'Public Health Threat?'],
  ['death', 'Death?'],
  ['serious_incident', 'Serious Incident?'],
  ['review1_at', 'DATE OF REVIEW 1'],
  ['review1_completed', 'Review1 Completed'],
  ['risk_to_patient', 'RISK TO PATIENT/ANY CLINICAL IMPACT'],
  ['warranty_failure', 'WARRANTY FAILURE (1YR)'],
  ['frequent_failure', 'FREQUENT FAILURE'],
  ['review2_at', 'DATE OF REVIEW 2'],
  ['review2_completed', 'Review2 Completed'],
  ['any_potential_effect', 'ANY POTENTIAL EFFECT'],
  ['action_taken', 'ACTION TAKEN'],
  ['service_observation', 'Service Dept Observation'],
  ['complaint_grouping', 'COMPLAINT GROUPING'],
  ['root_cause_keyword', 'ROOT CAUSE KEY WORD'],
  ['spare_category', 'SPARE / CONSUMABLE / CORRECTION / CALIBRATION'],
  ['review3_at', 'DATE OF REVIEW 3'],
  ['review3_completed', 'Review3 Completed'],
  ['review_status', 'Review Status'],
  ['send_email_defective_spare', 'SEND EMAIL FOR DEFECTIVE SPARE'],
  ['current_call_status', 'CURRENT CALL STATUS'],
  ['last_visit_at', 'Call Solved Date & Time'],
  ['visit_details', 'VISIT REMARKS (Reporting)'],
  ['spares_consumed', 'SPARES CONSUMED'],
  ['sw_version', 'SW Version'],
  ['sl_no_t', 'SL NO(T)'],
  ['complaint', 'Complaint'],
  ['age_days', 'Failure within how many days/yrs'],
  ['age_group', 'Failure Within Grouping'],
  ['dummy_column', 'DUMMY COLUMN'],
];

// BLANK ON PURPOSE, not "not implemented": these hold the WRR-2026 shape so a
// paste lands in the right columns. The app's own export leaves exactly these
// empty, and the two must agree.
var DCCR_BLANK = ['updated_by', 'updated_date', 'call_details', 'visit_remarks',
                  'change_product', 'send_email_defective_spare', 'sl_no_t',
                  'complaint', 'dummy_column'];

// A REAL DATE, NOT THE TEXT OF ONE. A string Excel and Sheets cannot sort,
// filter by month or subtract is the fault this project has fixed twice in the
// downloads; a mirror is read the same way. The value written is a Date and the
// COLUMN carries the format, which is the standing rule -- dd-MMM-yyyy, month
// NAMED so it cannot be read the other way round.
var DCCR_DATE_COLS = ['reg_date', 'complaint_date', 'warranty_start',
                      'review1_at', 'review2_at', 'review3_at'];
var DCCR_DATETIME_COLS = ['last_visit_at'];

/** The entry point the time-driven triggers call. */
function dccrMirror() {
  var started = new Date();
  try {
    var rows = _dccrFetchAll();
    var written = _dccrWrite(rows);
    _dccrStatus('OK', written, started, '');
    return { ok: true, rows: written };
  } catch (err) {
    // RECORDED, NOT SWALLOWED. A mirror that fails silently is worse than one
    // that does not exist: the sheet still holds yesterday's rows and reads as
    // current.
    _dccrStatus('FAILED', 0, started, String(err));
    throw err;
  }
}

/** Create the four daily triggers. Run this ONCE, by hand, from the editor. */
function installDccrMirror() {
  var made = [];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dccrMirror') ScriptApp.deleteTrigger(t);
  });
  DCCR_HOURS.forEach(function (h) {
    ScriptApp.newTrigger('dccrMirror').timeBased().atHour(h).nearMinute(0).everyDays(1).create();
    made.push(h + ':00');
  });
  return { ok: true, hours: made, timezone: Session.getScriptTimeZone() };
}

/** Remove them again. */
function removeDccrMirror() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dccrMirror') { ScriptApp.deleteTrigger(t); n++; }
  });
  return { ok: true, removed: n };
}

// ---- reading Supabase ------------------------------------------------------

function _dccrProp(name) {
  return String(PropertiesService.getScriptProperties().getProperty(name) || '').trim();
}

/**
 * The Authorization the reads will carry.
 *
 * A SIGN-IN IS TRIED FIRST, so the mirror reads under row-level security as one
 * named account rather than past it. The service key is the fallback and says
 * so in the status tab, because "which of the two is in use" is a thing
 * somebody must be able to find out without reading the properties.
 */
function _dccrAuth() {
  var url = _dccrProp('SUPABASE_URL');
  var anon = _dccrProp('SUPABASE_ANON_KEY');
  if (!url) throw new Error('Script Property SUPABASE_URL is not set.');
  if (!anon) throw new Error('Script Property SUPABASE_ANON_KEY is not set.');

  var email = _dccrProp('DCCR_EMAIL');
  var pass = _dccrProp('DCCR_PASSWORD');
  if (email && pass) {
    var res = UrlFetchApp.fetch(url + '/auth/v1/token?grant_type=password', {
      method: 'post',
      contentType: 'application/json',
      headers: { apikey: anon },
      payload: JSON.stringify({ email: email, password: pass }),
      muteHttpExceptions: true,
    });
    var body = _parse(res.getContentText()) || {};
    if (res.getResponseCode() !== 200 || !body.access_token) {
      throw new Error('DCCR_EMAIL could not sign in: '
        + (body.error_description || body.msg || res.getContentText()).toString().slice(0, 200));
    }
    return { url: url, apikey: anon, bearer: body.access_token, as: 'signed in as ' + email };
  }

  var svc = _dccrProp('SUPABASE_SERVICE_KEY');
  if (svc) return { url: url, apikey: svc, bearer: svc, as: 'service key (bypasses row-level security)' };

  throw new Error('Set DCCR_EMAIL + DCCR_PASSWORD (preferred), or SUPABASE_SERVICE_KEY.');
}

function _dccrFetchAll() {
  var auth = _dccrAuth();
  _dccrAuthUsed = auth.as;
  var out = [];
  for (var from = 0; ; from += DCCR_PAGE) {
    var to = from + DCCR_PAGE - 1;
    var res = UrlFetchApp.fetch(
      auth.url + '/rest/v1/' + DCCR_VIEW + '?select=*&order=' + encodeURIComponent(DCCR_ORDER),
      {
        method: 'get',
        headers: {
          apikey: auth.apikey,
          Authorization: 'Bearer ' + auth.bearer,
          Range: from + '-' + to,
          'Range-Unit': 'items',
        },
        muteHttpExceptions: true,
      });
    var code = res.getResponseCode();
    if (code !== 200 && code !== 206) {
      throw new Error('Supabase answered ' + code + ': ' + res.getContentText().slice(0, 300));
    }
    var page = _parse(res.getContentText()) || [];
    out = out.concat(page);
    // THE ONLY END-OF-DATA SIGNAL THERE IS. A full page may be the last one or
    // may not; a short one cannot be anything else.
    if (page.length < DCCR_PAGE) break;
    // A guard, not a limit: 200 pages is 200,000 review rows.
    if (from / DCCR_PAGE > 200) break;
  }
  return out;
}
var _dccrAuthUsed = '';

// ---- shaping ---------------------------------------------------------------

var DCCR_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A Date where the value is one, the value itself where it is not. */
function _dccrDate(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  var d = new Date(s);
  return isNaN(d.getTime()) ? s : d;
}

function _dccrText(v) { return v == null ? '' : v; }

/** ONE ROW, shaped exactly as toExportRow() in src/lib/dccr.ts shapes it. */
function _dccrRow(r, index) {
  var o = {};
  DCCR_BLANK.forEach(function (k) { o[k] = ''; });
  o.sl_no = index + 1;
  o.reg_date = _dccrDate(r.reg_date);
  o.complaint_date = _dccrDate(r.complaint_date);
  o.call_number = _dccrText(r.call_number);
  o.ucn = _dccrText(r.ucn);
  o.party_name = _dccrText(r.party_name);
  o.city = _dccrText(r.city);
  o.product_name = _dccrText(r.product_name);
  o.serial = _dccrText(r.serial);
  o.call_type = _dccrText(r.call_type);
  o.standard_complaint = _dccrText(r.standard_complaint);
  o.complaint_reported = _dccrText(r.complaint_reported);
  o.item_status = _dccrText(r.item_status);
  o.allocated_to = _dccrText(r.allocated_to);
  o.call_status = r.last_status || r.status || '';
  o.pending_reason = _dccrText(r.pending_reason);
  o.warranty_number = _dccrText(r.warranty_number);
  o.warranty_start = _dccrDate(r.warranty_start);
  o.public_health_threat = _dccrText(r.public_health_threat);
  o.death = _dccrText(r.death);
  o.serious_incident = _dccrText(r.serious_incident);
  o.review1_at = _dccrDate(r.review1_at);
  o.review1_completed = r.review1_done ? 'Yes' : 'No';
  o.risk_to_patient = _dccrText(r.risk_to_patient);
  o.warranty_failure = _dccrText(r.warranty_failure);
  o.frequent_failure = _dccrText(r.frequent_failure);
  o.review2_at = _dccrDate(r.review2_at);
  o.review2_completed = r.review2_done ? 'Yes' : 'No';
  o.any_potential_effect = _dccrText(r.any_potential_effect);
  o.action_taken = _dccrText(r.action_taken);
  o.service_observation = _dccrText(r.service_observation);
  o.complaint_grouping = _dccrText(r.complaint_grouping);
  o.root_cause_keyword = _dccrText(r.root_cause_keyword);
  o.spare_category = _dccrText(r.spare_category);
  o.review3_at = _dccrDate(r.review3_at);
  o.review3_completed = r.review3_done ? 'Yes' : 'No';
  o.review_status = _dccrText(r.review_status);
  o.current_call_status = r.open_state || r.last_status || r.status || '';
  o.last_visit_at = _dccrDate(r.last_visit_at);
  o.visit_details = _dccrText(r.visit_details);
  o.spares_consumed = _dccrText(r.spares_consumed);
  o.sw_version = _dccrText(r.sw_version);
  o.age_days = _dccrText(r.age_days);
  o.age_group = _dccrText(r.age_group);
  return o;
}

// ---- writing the sheet -----------------------------------------------------

function _dccrSheet(id, name) {
  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function _dccrWrite(rows) {
  var sh = _dccrSheet(DCCR_MIRROR_ID, DCCR_MIRROR_TAB);
  var heads = DCCR_COLUMNS.map(function (c) { return c[1]; });
  var keys = DCCR_COLUMNS.map(function (c) { return c[0]; });

  var grid = [heads];
  for (var i = 0; i < rows.length; i++) {
    var o = _dccrRow(rows[i], i);
    var line = [];
    for (var c = 0; c < keys.length; c++) line.push(o[keys[c]] === undefined ? '' : o[keys[c]]);
    grid.push(line);
  }

  // CLEARED AND REWRITTEN WHOLE, never appended: the register is corrected in
  // place -- a review answered today changes a row that already exists -- so an
  // append would leave two versions of one call in the sheet and no way to say
  // which is current.
  //
  // CLEARED FIRST, and only the range that HAD content, so a run that returns
  // fewer rows than the last does not leave the tail of the old one behind
  // reading as live data.
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow > 0 && lastCol > 0) sh.getRange(1, 1, lastRow, Math.max(lastCol, heads.length)).clearContent();

  // ONE setValues FOR THE WHOLE GRID. Written cell by cell, four thousand rows
  // is tens of thousands of calls across the Apps Script boundary and the run
  // hits the six-minute ceiling long before it finishes.
  sh.getRange(1, 1, grid.length, heads.length).setValues(grid);

  // THE COLUMN CARRIES THE FORMAT, so the value stays a real date and still
  // READS dd-MMM-yyyy -- the standing rule, in the one place a mirror can obey
  // it. Applied to the body only; row 1 is the heading.
  if (grid.length > 1) {
    keys.forEach(function (k, idx) {
      var fmt = DCCR_DATE_COLS.indexOf(k) >= 0 ? 'dd-mmm-yyyy'
              : DCCR_DATETIME_COLS.indexOf(k) >= 0 ? 'dd-mmm-yyyy hh:mm:ss' : '';
      if (fmt) sh.getRange(2, idx + 1, grid.length - 1, 1).setNumberFormat(fmt);
    });
  }
  sh.setFrozenRows(1);
  return rows.length;
}

function _dccrStatus(outcome, rows, started, err) {
  try {
    var sh = _dccrSheet(DCCR_MIRROR_ID, DCCR_STATUS_TAB);
    if (sh.getLastRow() === 0) {
      sh.appendRow(['Run at', 'Outcome', 'Rows written', 'Seconds', 'Read as', 'Error']);
      sh.setFrozenRows(1);
    }
    var secs = Math.round((new Date().getTime() - started.getTime()) / 100) / 10;
    // NEWEST FIRST: the answer to "did it run?" is the top of the sheet, not the
    // bottom of four hundred rows.
    sh.insertRowAfter(1);
    sh.getRange(2, 1, 1, 6).setValues([[
      Utilities.formatDate(started, Session.getScriptTimeZone(), 'dd-MMM-yyyy HH:mm:ss'),
      outcome, rows, secs, _dccrAuthUsed || '(not reached)', err || '',
    ]]);
    var extra = sh.getLastRow() - (DCCR_STATUS_KEEP + 1);
    if (extra > 0) sh.deleteRows(DCCR_STATUS_KEEP + 2, extra);
  } catch (e) {
    // The status tab failing must not take the mirror down with it.
  }
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
