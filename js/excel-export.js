/* =========================================================
   excel-export.js — Telecom Analysis
   Generates one styled Excel sheet with all selected VF
   invoices stacked vertically using ExcelJS (full styling).
   Exposes: window.ExcelExport.generate(selectedNos, allData, opts)
   opts: { filename, isNew(row), calcTax(row), contractorTaxLabel(name) }
   Requires: ExcelJS (window.ExcelJS) loaded before this script.
   ========================================================= */

window.ExcelExport = (function () {

  /* ── Color palette (ARGB, FF = fully opaque) ── */
  var C = {
    green:    'FF00B050',  greenBdr:  'FF007A35',  // title row
    red:      'FFC00000',  redBdr:    'FF900000',  // Contractor + Tax headers
    blue:     'FF2563EB',  blueBdr:   'FF1D4ED8',  // Contractor Portion taxed header
    oldHdr:   'FFDCFCE7', oldHdrBdr: 'FFBBF7D0',  // Old / Invoice # / Amount headers
    oldData:  'FFF0FDF4', oldDtBdr:  'FFDCFCE7',  // Old data cells
    newHdr:   'FFDBEAFE', newHdrBdr: 'FFBFDBFE',  // New / Invoice # / Amount headers
    newData:  'FFEFF6FF', newDtBdr:  'FFDBEAFE',  // New data cells
    total:    'FF808080', totalBdr:  'FF606060',   // Total row
    white:    'FFFFFFFF',
    black:    'FF000000',
    neutral:  'FFE2E8F0'
  };

  /* ── Style helpers ── */
  function fill(argb) {
    return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } };
  }

  function border(argb) {
    var b = { style: 'thin', color: { argb: argb } };
    return { top: b, bottom: b, left: b, right: b };
  }

  function s(cell, opts) {
    if (opts.fill)  cell.fill      = fill(opts.fill);
    if (opts.font)  cell.font      = opts.font;
    if (opts.align) cell.alignment = { horizontal: opts.align, vertical: 'middle', wrapText: false };
    if (opts.bdr)   cell.border    = border(opts.bdr);
  }

  function sRange(ws, row, c1, c2, opts) {
    for (var c = c1; c <= c2; c++) s(ws.getCell(row, c), opts);
  }

  /* ── Font presets ── */
  var FW  = { bold: true,  color: { argb: C.white }, size: 10 };  // white bold
  var FWL = { bold: true,  color: { argb: C.white }, size: 11 };  // white bold large
  var FB  = { bold: true,  color: { argb: C.black }, size: 10 };  // black bold
  var FBK = {              color: { argb: C.black }, size: 10 };  // black regular
  var FWT = { bold: true,  color: { argb: C.white }, size: 10 };  // white bold (total)

  /* ── Build one invoice block, returns next free row ── */
  function addBlock(ws, startRow, invoiceNo, allData, isNew, calcTax, ctLabel) {
    var R = startRow;

    /* Find meta from first matching row */
    var meta = null;
    for (var i = 0; i < allData.length; i++) {
      if (String(allData[i].vfInvoiceNo || '').trim() === invoiceNo) { meta = allData[i]; break; }
    }
    var vfDate = (meta && meta.vfInvoiceSubmissionDate) || '';
    var crDate = (meta && meta.cashReceivedDate)        || '';
    var title  = 'Invoice: ' + invoiceNo;
    if (vfDate) title += '     VF Submit: ' + vfDate;
    if (crDate) title += '     Cash Received: ' + crDate;

    /* ── Title row — green, white text ── */
    ws.getCell(R, 1).value = title;
    sRange(ws, R, 1, 6, { fill: C.green, bdr: C.greenBdr });
    s(ws.getCell(R, 1), { font: FWL, align: 'left' });
    ws.mergeCells(R, 1, R, 6);
    ws.getRow(R).height = 22;
    R++;
    R++; // blank row

    /* ── 3-level header ── */
    var H1 = R, H2 = R + 1, H3 = R + 2;

    /* Row H1: Contractor/Tax = red/white | Portion = blue/white */
    ws.getCell(H1, 1).value = 'Contractor';
    ws.getCell(H1, 2).value = 'Tax';
    ws.getCell(H1, 3).value = 'Contractor Portion taxed (EGP)';
    sRange(ws, H1, 1, 2, { fill: C.red,  font: FW, align: 'center', bdr: C.redBdr });
    sRange(ws, H1, 3, 6, { fill: C.blue, font: FW, align: 'center', bdr: C.blueBdr });
    s(ws.getCell(H1, 1), { align: 'left' });
    ws.mergeCells(H1, 3, H1, 6);
    ws.getRow(H1).height = 18;

    /* Row H2: Contractor/Tax = red | Old = #DCFCE7/black | New = #DBEAFE/black */
    ws.getCell(H2, 3).value = 'Old';
    ws.getCell(H2, 5).value = 'New';
    sRange(ws, H2, 1, 2, { fill: C.red,    bdr: C.redBdr });
    sRange(ws, H2, 3, 4, { fill: C.oldHdr, font: FB, align: 'center', bdr: C.oldHdrBdr });
    sRange(ws, H2, 5, 6, { fill: C.newHdr, font: FB, align: 'center', bdr: C.newHdrBdr });
    ws.mergeCells(H2, 3, H2, 4);
    ws.mergeCells(H2, 5, H2, 6);
    ws.getRow(H2).height = 16;

    /* Row H3: Contractor/Tax = red | Invoice#/Amount = #DCFCE7 (Old) + #DBEAFE (New), black text */
    ws.getCell(H3, 3).value = 'Invoice #';
    ws.getCell(H3, 4).value = 'Amount (EGP)';
    ws.getCell(H3, 5).value = 'Invoice #';
    ws.getCell(H3, 6).value = 'Amount (EGP)';
    sRange(ws, H3, 1, 2, { fill: C.red,    bdr: C.redBdr });
    sRange(ws, H3, 3, 4, { fill: C.oldHdr, font: FB, align: 'center', bdr: C.oldHdrBdr });
    sRange(ws, H3, 5, 6, { fill: C.newHdr, font: FB, align: 'center', bdr: C.newHdrBdr });
    ws.getRow(H3).height = 16;

    /* Contractor and Tax span all 3 header rows */
    ws.mergeCells(H1, 1, H3, 1);
    ws.mergeCells(H1, 2, H3, 2);
    R += 3;

    /* ── Group by contractor ── */
    var cmap = {};
    allData.forEach(function (row) {
      if (String(row.vfInvoiceNo || '').trim() !== invoiceNo) return;
      var key = row.contractor || '(Unknown)';
      if (!cmap[key]) cmap[key] = { name: key, amount: 0, c2Old: 0, c2New: 0, invOld: {}, invNew: {} };
      var t   = calcTax(row);
      var neo = isNew(row);
      var inv = String(row.ctrInvoiceNo || '').trim();
      cmap[key].amount += t.totalTaxed;
      if (neo) { cmap[key].c2New += t.contractorTaxed; if (inv) cmap[key].invNew[inv] = 1; }
      else      { cmap[key].c2Old += t.contractorTaxed; if (inv) cmap[key].invOld[inv] = 1; }
    });

    var dataRows = Object.keys(cmap)
      .map(function (k) { return cmap[k]; })
      .filter(function (r) { return r.name.trim().toLowerCase() !== 'in-house'; })
      .sort(function (a, b) { return b.amount - a.amount; });

    var totC2Old = 0, totC2New = 0;
    dataRows.forEach(function (r) { totC2Old += r.c2Old; totC2New += r.c2New; });

    /* ── Data rows — Old cols: #F0FDF4/black | New cols: #EFF6FF/black ── */
    dataRows.forEach(function (r) {
      ws.getCell(R, 1).value = r.name;
      ws.getCell(R, 2).value = ctLabel(r.name);
      ws.getCell(R, 3).value = Object.keys(r.invOld).sort().join(', ') || '—';
      ws.getCell(R, 4).value = r.c2Old || 0;
      ws.getCell(R, 5).value = Object.keys(r.invNew).sort().join(', ') || '—';
      ws.getCell(R, 6).value = r.c2New || 0;

      s(ws.getCell(R, 1), { font: FBK, align: 'left',   bdr: C.neutral });
      s(ws.getCell(R, 2), { font: FBK, align: 'center',  bdr: C.neutral });
      s(ws.getCell(R, 3), { fill: C.oldData, font: FBK, align: 'center', bdr: C.oldDtBdr });
      s(ws.getCell(R, 4), { fill: C.oldData, font: FBK, align: 'center', bdr: C.oldDtBdr });
      s(ws.getCell(R, 5), { fill: C.newData, font: FBK, align: 'center', bdr: C.newDtBdr });
      s(ws.getCell(R, 6), { fill: C.newData, font: FBK, align: 'center', bdr: C.newDtBdr });
      ws.getCell(R, 4).numFmt = '#,##0';
      ws.getCell(R, 6).numFmt = '#,##0';
      ws.getRow(R).height = 15;
      R++;
    });

    /* ── Total row — #808080/white bold ── */
    ws.getCell(R, 1).value = 'Total';
    ws.getCell(R, 4).value = totC2Old;
    ws.getCell(R, 6).value = totC2New;

    sRange(ws, R, 1, 6, { fill: C.total, bdr: C.totalBdr });
    s(ws.getCell(R, 1), { font: FWT, align: 'left' });
    s(ws.getCell(R, 4), { font: FWT, align: 'center' });
    s(ws.getCell(R, 6), { font: FWT, align: 'center' });
    ws.getCell(R, 4).numFmt = '#,##0';
    ws.getCell(R, 6).numFmt = '#,##0';
    ws.getRow(R).height = 16;
    R++;

    return R;
  }

  /* ── Public entry point ── */
  function generate(selectedNos, allData, opts) {
    var wb = new ExcelJS.Workbook();
    wb.creator = 'Telecom Analysis';
    var ws = wb.addWorksheet('Invoices');

    ws.columns = [
      { width: 28 }, // Contractor
      { width: 8  }, // Tax
      { width: 22 }, // Old Invoice #
      { width: 16 }, // Old Amount
      { width: 22 }, // New Invoice #
      { width: 16 }  // New Amount
    ];

    var R = 1;
    selectedNos.forEach(function (invoiceNo, idx) {
      if (idx > 0) R += 2; // blank separator between blocks
      R = addBlock(ws, R, invoiceNo, allData, opts.isNew, opts.calcTax, opts.contractorTaxLabel);
    });

    /* Download */
    wb.xlsx.writeBuffer().then(function (data) {
      var blob = new Blob([data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      var url = URL.createObjectURL(blob);
      var a   = document.createElement('a');
      a.href     = url;
      a.download = opts.filename || 'Invoices.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  }

  return { generate: generate };

})();
