/* =========================================================
   parser.js — Telecom Analysis
   Parses the "Invoicing Track" sheet from a SheetJS workbook.
   Header row: index 3 (4th row, 0-based). Data rows: 4+.
   Exposes: window.Parser.parseSheet(workbook) → Array
   ========================================================= */

window.Parser = (function () {

  function makeColFinder(headers) {
    return function (name) {
      var idx = headers.indexOf(name);
      if (idx !== -1) return idx;
      var lower = name.toLowerCase();
      for (var i = 0; i < headers.length; i++) {
        if (headers[i].toLowerCase().indexOf(lower) !== -1) return i;
      }
      return -1;
    };
  }

  function get(row, col) {
    if (col === -1 || col === undefined) return '';
    var v = row[col];
    return (v === null || v === undefined) ? '' : v;
  }

  function getNum(row, col) {
    var v = get(row, col);
    if (v === '') return 0;
    var n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function normalizeStatus(raw) {
    var s = String(raw || '').trim().toLowerCase();
    if (s === 'done' || s === 'completed' || s === 'finish' || s === 'finished') return 'Done';
    if (s === 'assigned' || s === 'in progress' || s === 'active' || s === 'open') return 'Assigned';
    if (s === 'cancelled' || s === 'canceled' || s === 'cancel') return 'Cancelled';
    if (s === 'duplicated' || s === 'dublicated' || s === 'duplicate' || s === 'dup') return 'Duplicated';
    if (!s) return '';
    return 'Other';
  }

  function normalizeRegion(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  function normalizeAcceptance(raw) {
    var s = String(raw || '').trim().toUpperCase();
    if (s === 'FAC' || s === 'TOC' || s === 'PAC') return s;
    return s || '';
  }

  function formatDate(val) {
    if (val === '' || val === null || val === undefined) return '';
    if (typeof val === 'number') {
      try {
        var d = new Date(Math.round((val - 25569) * 86400 * 1000));
        return d.toLocaleDateString('en-GB');
      } catch (e) { return String(val); }
    }
    return String(val);
  }

  function parseSheet(workbook) {
    var TARGET = 'Invoicing Track';
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

    var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    if (!rows || rows.length < 5) throw new Error('Sheet has too few rows.');

    var headers = rows[3].map(function (h) { return String(h).trim(); });
    var ci = makeColFinder(headers);

    var cols = {
      id: ci('ID#'), jobCode: ci('Job Code'), txrf: ci('TX/RF'),
      vendor: ci('Vendor'), physicalSiteId: ci('Physical Site ID'),
      logicalSiteId: ci('Logical Site ID'), region: ci('Region'),
      subRegion: ci('Sub Region'), distance: ci('Distance'),
      generalStream: ci('General Stream'), taskName: ci('Task Name'),
      contractor: ci('Contractor'), lineItem: ci('Line Item'),
      newPrice: ci('New Price'), newTotalPrice: ci('New Total Price'),
      status: ci('Status'), taskDate: ci('Task Date'),
      acceptanceStatus: ci('Acceptance Status'), facDate: ci('FAC Date'),
      certificateNo: ci('Certificate #'), acceptanceWeek: ci('Acceptance Week'),
      poStatus: ci('PO status'), poNumber: ci('PO number'),
      receiving1Date: ci('1st Receiving Date'), receiving2Date: ci('2nd Receiving Date'),
      receiving1Amount: ci('1st Receiving Amount'), receiving2Amount: ci('2nd Receiving Amount'),
      remainingAmounts: ci('Remaining Amounts'), lmp: ci('LMP'),
      lmpPortion: ci('LMP Portion'), contractorPortion: ci('Contractor Portion'),
      vfInvoiceNo:             ci('VF Invoice #'),
      vfInvoiceSubmissionDate: ci('VF Invoice Submission Date'),
      cashReceivedDate:        ci('Cash Received Date'),
      contractor2:             ci('Contractor2')
    };

    var result = [];
    for (var i = 4; i < rows.length; i++) {
      var row = rows[i];
      var rawId = String(get(row, cols.id)).trim();
      if (!rawId) continue;
      if (/^(id#?|total|subtotal|grand)/i.test(rawId)) continue;
      if (!/\d/.test(rawId)) continue;

      result.push({
        id: rawId,
        jobCode: String(get(row, cols.jobCode)).trim(),
        txrf: String(get(row, cols.txrf)).trim(),
        vendor: String(get(row, cols.vendor)).trim(),
        physicalSiteId: String(get(row, cols.physicalSiteId)).trim(),
        logicalSiteId: String(get(row, cols.logicalSiteId)).trim(),
        region: normalizeRegion(get(row, cols.region)),
        subRegion: String(get(row, cols.subRegion)).trim(),
        distance: getNum(row, cols.distance),
        generalStream: String(get(row, cols.generalStream)).trim(),
        taskName: String(get(row, cols.taskName)).trim(),
        contractor: String(get(row, cols.contractor)).trim(),
        lineItem: String(get(row, cols.lineItem)).trim(),
        newPrice: getNum(row, cols.newPrice),
        newTotalPrice: getNum(row, cols.newTotalPrice),
        status: normalizeStatus(get(row, cols.status)),
        taskDate: formatDate(get(row, cols.taskDate)),
        acceptanceStatus: normalizeAcceptance(get(row, cols.acceptanceStatus)),
        facDate: formatDate(get(row, cols.facDate)),
        certificateNo: String(get(row, cols.certificateNo)).trim(),
        acceptanceWeek: String(get(row, cols.acceptanceWeek)).trim(),
        poStatus: String(get(row, cols.poStatus)).trim(),
        poNumber: String(get(row, cols.poNumber)).trim(),
        receiving1Date: formatDate(get(row, cols.receiving1Date)),
        receiving2Date: formatDate(get(row, cols.receiving2Date)),
        receiving1Amount: getNum(row, cols.receiving1Amount),
        receiving2Amount: getNum(row, cols.receiving2Amount),
        remainingAmounts: getNum(row, cols.remainingAmounts),
        lmp: getNum(row, cols.lmp),
        lmpPortion: getNum(row, cols.lmpPortion),
        contractorPortion: getNum(row, cols.contractorPortion),
        vfInvoiceNo:             String(get(row, cols.vfInvoiceNo)).trim(),
        vfInvoiceSubmissionDate: formatDate(get(row, cols.vfInvoiceSubmissionDate)),
        cashReceivedDate:        formatDate(get(row, cols.cashReceivedDate)),
        contractor2:             getNum(row, cols.contractor2)
      });
    }

    return result;
  }

  return { parseSheet: parseSheet };

})();
