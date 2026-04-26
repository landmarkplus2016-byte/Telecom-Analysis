/* =========================================================
   parser2.js — Telecom Analysis
   Parses the "POC3 Tracking" sheet from the BH Sites workbook.
   Scans the first 30 rows to find the header row (identified by
   the presence of an "Inst Contractor" column), then returns
   each data row as a plain object keyed by the header names.
   Exposes: window.Parser2.parseSheet(workbook) → Array
   ========================================================= */

window.Parser2 = (function () {

  function parseSheet(workbook) {
    var TARGET = 'POC3 Tracking';
    var sheet = workbook.Sheets[TARGET];
    if (!sheet) {
      var found = workbook.SheetNames.find(function (n) {
        return n.trim().toLowerCase() === TARGET.toLowerCase();
      });
      if (found) sheet = workbook.Sheets[found];
    }
    if (!sheet) {
      throw new Error('Sheet "' + TARGET + '" not found. Available: ' + workbook.SheetNames.join(', '));
    }

    var allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    // Scan first 30 rows for the header row (must contain "inst contractor")
    var headerIdx = -1;
    for (var i = 0; i < Math.min(30, allRows.length); i++) {
      if (allRows[i].some(function (c) {
        return String(c || '').trim().toLowerCase() === 'inst contractor';
      })) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      throw new Error(
        'Header row not found in "POC3 Tracking" sheet. ' +
        'Expected a column named "Inst Contractor" within the first 30 rows.'
      );
    }

    var headers = allRows[headerIdx].map(function (h) {
      return String(h || '').trim();
    });

    var result = [];
    for (var i = headerIdx + 1; i < allRows.length; i++) {
      var row = allRows[i];
      if (!row) continue;
      // Skip fully blank rows
      if (row.every(function (c) { return c === null || c === undefined || c === ''; })) continue;
      var obj = {};
      headers.forEach(function (h, idx) {
        obj[h] = (row[idx] !== null && row[idx] !== undefined) ? row[idx] : '';
      });
      result.push(obj);
    }

    if (!result.length) {
      throw new Error('No data rows found in "POC3 Tracking" sheet after the header row.');
    }

    return result;
  }

  return { parseSheet: parseSheet };

})();
