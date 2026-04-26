/* =========================================================
   poc.js — Telecom Analysis
   POC Invoices section: reads raw AppData2 rows from the
   "POC3 Tracking" sheet, expands each source row into an
   Installation row + Migration row, then shows KPI cards,
   a contractor-grouped table, and invoice filters.
   Mirrors the structure of financials.js exactly.
   Exposes: window.POCModule.render()
   ========================================================= */

window.POCModule = (function () {

  /* ── State ── */
  var state = {
    vfInvoiceNo:   '',
    vfSubmitYear:  '', vfSubmitMonth:  '', vfSubmitDay:  '',
    cashRcvYear:   '', cashRcvMonth:   '', cashRcvDay:   '',
    ctrInvoiceNo:  '',
    ctrSubmitYear: '', ctrSubmitMonth: '', ctrSubmitDay: ''
  };

  var _data = []; // processed rows (2 per source row)

  /* ── Helpers ── */
  function fmt(n) {
    return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function toNum(v) {
    if (v === null || v === undefined || v === '') return 0;
    var n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  }

  function gv(row, key) {
    if (!key) return '';
    var v = row[key];
    return (v === null || v === undefined) ? '' : v;
  }

  /* ── Column detection ─────────────────────────────────────
     Pattern-matches lowercase header key names from AppData2
     objects. Returns a map of logical name → actual key.
  ─────────────────────────────────────────────────────────── */
  function detectCols(sampleRow) {
    var keys = Object.keys(sampleRow);
    function find(pred) {
      return keys.find(function (k) {
        var l = k.toLowerCase().trim();
        return pred(l);
      }) || null;
    }
    return {
      jobCode:        find(function (l) { return l === 'job code'; }),
      siteId:         find(function (l) { return l === 'site id'; }),
      lineItem:       find(function (l) { return l === 'line item'; }),
      total:          find(function (l) { return l.includes('total amount'); }),
      instContractor: find(function (l) { return l === 'inst contractor'; }),
      lmpIns:         find(function (l) { return l.includes('lmp') && l.includes('ins') && !l.includes('mig'); }),
      conIns:         find(function (l) { return l.includes('contractor') && l.includes('portion') && l.includes('ins'); }),
      installDate:    find(function (l) { return l.includes('installation') && l.includes('date'); }),
      invoiceIns:     find(function (l) { return l.includes('invoice') && l.includes('ins') && !l.includes('contractor'); }),
      poIns:          find(function (l) { return l.startsWith('po') && !l.includes('portion') && l.includes('ins') && !l.includes('mig'); }),
      instConInvoice: find(function (l) { return l.includes('inst') && l.includes('contractor') && l.includes('invoice'); }),
      migrContractor: find(function (l) { return l.includes('migr') && l.includes('contractor') && !l.includes('invoice'); }),
      lmpMig:         find(function (l) { return l.includes('lmp') && l.includes('mig'); }),
      conMig:         find(function (l) { return l.includes('contractor') && l.includes('portion') && l.includes('mig'); }),
      migrDate:       find(function (l) { return l.includes('migration') && l.includes('date'); }),
      invoiceMig:     find(function (l) { return l.includes('invoice') && l.includes('mig') && !l.includes('contractor'); }),
      poMig:          find(function (l) { return l.startsWith('po') && !l.includes('portion') && l.includes('mig'); }),
      migrConInvoice: find(function (l) { return l.includes('migr') && l.includes('contractor') && l.includes('invoice'); }),
      // Date columns for filters — may not exist in all sheet versions
      vfSubmitDate:  find(function (l) { return l.includes('vf') && (l.includes('submit') || l.includes('submission')); }),
      cashReceived:  find(function (l) { return l.includes('cash') && l.includes('receiv'); }),
      ctrSubmitDate: find(function (l) {
        return l.includes('contractor') && l.includes('invoice') && (l.includes('subm') || l.includes('submit'));
      })
    };
  }

  /* ── Format Excel serial date (or string) → "DD/MM/YYYY" ── */
  function fmtDate(val) {
    if (val === null || val === undefined || val === '') return '';
    if (typeof val === 'number') {
      var d = new Date(Math.round((val - 25569) * 86400 * 1000));
      return d.toLocaleDateString('en-GB'); // DD/MM/YYYY
    }
    return String(val);
  }

  /* ── Date parsing / filtering ── */
  function parseDateParts(s) {
    if (!s) return null;
    var m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    var y = +m[3];
    if (y < 2000) return null;
    return { day: +m[1], month: +m[2], year: y };
  }

  function dateMatchesFilter(dateStr, y, mo, d) {
    if (!y && !mo && !d) return true;
    var p = parseDateParts(dateStr);
    if (!p) return false;
    if (y  && p.year  !== +y)  return false;
    if (mo && p.month !== +mo) return false;
    if (d  && p.day   !== +d)  return false;
    return true;
  }

  /* taskType derived from installation date: year ≥ 2026 → "New" */
  function taskTypeFromDate(dateStr) {
    var p = parseDateParts(dateStr);
    return (p && p.year >= 2026) ? 'New' : 'Old';
  }

  function isNewRow(r) { return r.taskType === 'New'; }

  /* ── Tax logic (same rules as existing Invoices tab) ── */
  function calcTax(r) {
    var c          = String(r.contractor || '').trim().toLowerCase();
    var totalTaxed = (r.newTotalPrice || 0) * 1.14;
    var contractorTaxed, lmpTaxed;

    if (c === 'in-house') {
      contractorTaxed = 0;
      lmpTaxed        = totalTaxed;
    } else {
      var cRate       = (c === 'upper telecom') ? 1.13 : 1.11;
      contractorTaxed = (r.contractor2 || 0) * cRate;
      lmpTaxed        = totalTaxed - contractorTaxed;
    }
    return { totalTaxed: totalTaxed, lmpTaxed: lmpTaxed, contractorTaxed: contractorTaxed };
  }

  function contractorTaxLabel(contractor) {
    var c = String(contractor || '').trim().toLowerCase();
    if (c === 'in-house')      return '14%';
    if (c === 'upper telecom') return '13%';
    return '11%';
  }

  /* ── Expand raw rows: 1 source row → Installation + Migration rows ── */
  function processRawData(rawRows) {
    if (!rawRows || !rawRows.length) return [];
    var cols   = detectCols(rawRows[0]);
    var result = [];

    rawRows.forEach(function (row) {
      var jobCode  = String(gv(row, cols.jobCode)  || '').trim();
      var siteId   = String(gv(row, cols.siteId)   || '').trim();
      var lineItem = String(gv(row, cols.lineItem)  || '').trim();
      if (!jobCode && !siteId) return; // skip identity-less rows

      var halfTotal   = toNum(gv(row, cols.total)) / 2;
      var installDate = fmtDate(gv(row, cols.installDate));
      var migrDate    = fmtDate(gv(row, cols.migrDate));
      var taskType    = taskTypeFromDate(installDate); // always from installDate

      // Shared date fields (same for both rows)
      var vfSubmitDate  = fmtDate(gv(row, cols.vfSubmitDate));
      var cashReceived  = fmtDate(gv(row, cols.cashReceived));
      var ctrSubmitDate = fmtDate(gv(row, cols.ctrSubmitDate));

      // Installation row
      result.push({
        rowType:                 'Installation',
        contractor:              String(gv(row, cols.instContractor) || '').trim(),
        jobCode:                 jobCode,
        siteId:                  siteId,
        lineItem:                lineItem,
        newTotalPrice:           halfTotal,
        lmp:                     toNum(gv(row, cols.lmpIns)),
        contractor2:             toNum(gv(row, cols.conIns)),
        installDate:             installDate,
        migrDate:                migrDate,
        vfInvoiceNo:             String(gv(row, cols.invoiceIns)     || '').trim(),
        poNumber:                String(gv(row, cols.poIns)          || '').trim(),
        ctrInvoiceNo:            String(gv(row, cols.instConInvoice) || '').trim(),
        taskType:                taskType,
        vfInvoiceSubmissionDate: vfSubmitDate,
        cashReceivedDate:        cashReceived,
        ctrInvoiceSubmitDate:    ctrSubmitDate
      });

      // Migration row — taskType still from installDate, not migrDate
      result.push({
        rowType:                 'Migration',
        contractor:              String(gv(row, cols.migrContractor) || '').trim(),
        jobCode:                 jobCode,
        siteId:                  siteId,
        lineItem:                lineItem,
        newTotalPrice:           halfTotal,
        lmp:                     toNum(gv(row, cols.lmpMig)),
        contractor2:             toNum(gv(row, cols.conMig)),
        installDate:             installDate,
        migrDate:                migrDate,
        vfInvoiceNo:             String(gv(row, cols.invoiceMig)     || '').trim(),
        poNumber:                String(gv(row, cols.poMig)          || '').trim(),
        ctrInvoiceNo:            String(gv(row, cols.migrConInvoice) || '').trim(),
        taskType:                taskType,
        vfInvoiceSubmissionDate: vfSubmitDate,
        cashReceivedDate:        cashReceived,
        ctrInvoiceSubmitDate:    ctrSubmitDate
      });
    });

    return result;
  }

  /* ── Date selector data helpers ── */
  function getYears(data, field) {
    var seen = {};
    data.forEach(function (r) { var p = parseDateParts(r[field]); if (p) seen[p.year] = 1; });
    return Object.keys(seen).map(Number).sort();
  }

  function getMonths(data, field, year) {
    var seen = {};
    data.forEach(function (r) {
      var p = parseDateParts(r[field]);
      if (p && (!year || p.year === +year)) seen[p.month] = 1;
    });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }

  function getDays(data, field, year, month) {
    var seen = {};
    data.forEach(function (r) {
      var p = parseDateParts(r[field]);
      if (p && (!year || p.year === +year) && (!month || p.month === +month)) seen[p.day] = 1;
    });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }

  function getInvoiceNumbers(data) {
    var seen = {};
    data.forEach(function (r) { var v = String(r.vfInvoiceNo || '').trim(); if (v) seen[v] = 1; });
    return Object.keys(seen).sort();
  }

  function getCtrInvoiceNumbers(data) {
    var seen = {};
    data.forEach(function (r) { var v = String(r.ctrInvoiceNo || '').trim(); if (v) seen[v] = 1; });
    return Object.keys(seen).sort();
  }

  /* Auto-fill dates when a VF Invoice # is selected exactly */
  function autoFillDates(invoiceNo) {
    var trimmed = String(invoiceNo || '').trim();
    if (!trimmed) return false;
    var match = null;
    for (var i = 0; i < _data.length; i++) {
      if (String(_data[i].vfInvoiceNo || '').trim() === trimmed) { match = _data[i]; break; }
    }
    if (!match) return false;

    var sp = parseDateParts(match.vfInvoiceSubmissionDate);
    if (sp) { state.vfSubmitYear = String(sp.year); state.vfSubmitMonth = String(sp.month); state.vfSubmitDay = String(sp.day); }
    else     { state.vfSubmitYear = state.vfSubmitMonth = state.vfSubmitDay = ''; }

    var cp = parseDateParts(match.cashReceivedDate);
    if (cp) { state.cashRcvYear = String(cp.year); state.cashRcvMonth = String(cp.month); state.cashRcvDay = String(cp.day); }
    else     { state.cashRcvYear = state.cashRcvMonth = state.cashRcvDay = ''; }

    return true;
  }

  /* Auto-fill all linked dates when a Contractor Invoice # is selected exactly */
  function autoFillCtrDates(invoiceNo) {
    var trimmed = String(invoiceNo || '').trim();
    if (!trimmed) return false;
    var match = null;
    for (var i = 0; i < _data.length; i++) {
      if (String(_data[i].ctrInvoiceNo || '').trim() === trimmed) { match = _data[i]; break; }
    }
    if (!match) return false;

    var sp = parseDateParts(match.ctrInvoiceSubmitDate);
    if (sp) { state.ctrSubmitYear = String(sp.year); state.ctrSubmitMonth = String(sp.month); state.ctrSubmitDay = String(sp.day); }
    else     { state.ctrSubmitYear = state.ctrSubmitMonth = state.ctrSubmitDay = ''; }

    state.vfInvoiceNo = String(match.vfInvoiceNo || '').trim();

    var vsp = parseDateParts(match.vfInvoiceSubmissionDate);
    if (vsp) { state.vfSubmitYear = String(vsp.year); state.vfSubmitMonth = String(vsp.month); state.vfSubmitDay = String(vsp.day); }
    else      { state.vfSubmitYear = state.vfSubmitMonth = state.vfSubmitDay = ''; }

    var cp = parseDateParts(match.cashReceivedDate);
    if (cp) { state.cashRcvYear = String(cp.year); state.cashRcvMonth = String(cp.month); state.cashRcvDay = String(cp.day); }
    else     { state.cashRcvYear = state.cashRcvMonth = state.cashRcvDay = ''; }

    return true;
  }

  /* ── Filter logic (exact match on invoice numbers) ── */
  function applyFilters() {
    return _data.filter(function (r) {
      if (state.vfInvoiceNo  && String(r.vfInvoiceNo  || '').trim() !== state.vfInvoiceNo.trim())  return false;
      if (!dateMatchesFilter(r.vfInvoiceSubmissionDate, state.vfSubmitYear,  state.vfSubmitMonth,  state.vfSubmitDay))  return false;
      if (!dateMatchesFilter(r.cashReceivedDate,        state.cashRcvYear,   state.cashRcvMonth,   state.cashRcvDay))   return false;
      if (state.ctrInvoiceNo && String(r.ctrInvoiceNo || '').trim() !== state.ctrInvoiceNo.trim()) return false;
      if (!dateMatchesFilter(r.ctrInvoiceSubmitDate,    state.ctrSubmitYear, state.ctrSubmitMonth, state.ctrSubmitDay)) return false;
      return true;
    });
  }

  /* ── KPI card ── */
  function kpiCard(label, value, cls, subtitle) {
    return '<div class="kpi-card ' + (cls || '') + '">' +
      '<div class="kpi-label">' + label + '</div>' +
      '<div class="kpi-value">' + value + '</div>' +
      (subtitle ? '<div class="kpi-subtitle">' + subtitle + '</div>' : '') +
      '</div>';
  }

  /* ── Select builders ── */
  var MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function buildYearOpts(id, years, selected) {
    var opts = '<option value="">Year</option>';
    years.forEach(function (y) {
      opts += '<option value="' + y + '"' + (selected == y ? ' selected' : '') + '>' + y + '</option>';
    });
    return '<select id="' + id + '" class="date-select">' + opts + '</select>';
  }

  function buildMonthOpts(id, months, year, selected) {
    var disabled = year ? '' : ' disabled';
    var opts = '<option value="">Month</option>';
    months.forEach(function (m) {
      opts += '<option value="' + m + '"' + (selected == m ? ' selected' : '') + '>' + MONTHS[m] + '</option>';
    });
    return '<select id="' + id + '" class="date-select"' + disabled + '>' + opts + '</select>';
  }

  function buildDayOpts(id, days, year, month, selected) {
    var disabled = (year && month) ? '' : ' disabled';
    var opts = '<option value="">Day</option>';
    days.forEach(function (d) {
      opts += '<option value="' + d + '"' + (selected == d ? ' selected' : '') + '>' + (d < 10 ? '0' : '') + d + '</option>';
    });
    return '<select id="' + id + '" class="date-select"' + disabled + '>' + opts + '</select>';
  }

  function refreshMonthSelect(id, field, year) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var months = getMonths(_data, field, year);
    var html = '<option value="">Month</option>';
    months.forEach(function (m) { html += '<option value="' + m + '">' + MONTHS[m] + '</option>'; });
    sel.innerHTML = html;
    sel.disabled  = !year;
  }

  function refreshDaySelect(id, field, year, month) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var days = getDays(_data, field, year, month);
    var html = '<option value="">Day</option>';
    days.forEach(function (d) { html += '<option value="' + d + '">' + (d < 10 ? '0' : '') + d + '</option>'; });
    sel.innerHTML = html;
    sel.disabled  = !(year && month);
  }

  /* Update date select elements in-place from current state — avoids
     calling render() which would rebuild the filter bar and lose focus. */
  function syncDateSelects() {
    var el;
    el = document.getElementById('poc-vs-year');  if (el) el.value = state.vfSubmitYear;
    refreshMonthSelect('poc-vs-month', 'vfInvoiceSubmissionDate', state.vfSubmitYear);
    el = document.getElementById('poc-vs-month'); if (el) el.value = state.vfSubmitMonth;
    refreshDaySelect('poc-vs-day', 'vfInvoiceSubmissionDate', state.vfSubmitYear, state.vfSubmitMonth);
    el = document.getElementById('poc-vs-day');   if (el) el.value = state.vfSubmitDay;

    el = document.getElementById('poc-cr-year');  if (el) el.value = state.cashRcvYear;
    refreshMonthSelect('poc-cr-month', 'cashReceivedDate', state.cashRcvYear);
    el = document.getElementById('poc-cr-month'); if (el) el.value = state.cashRcvMonth;
    refreshDaySelect('poc-cr-day', 'cashReceivedDate', state.cashRcvYear, state.cashRcvMonth);
    el = document.getElementById('poc-cr-day');   if (el) el.value = state.cashRcvDay;

    el = document.getElementById('poc-cs-year');  if (el) el.value = state.ctrSubmitYear;
    refreshMonthSelect('poc-cs-month', 'ctrInvoiceSubmitDate', state.ctrSubmitYear);
    el = document.getElementById('poc-cs-month'); if (el) el.value = state.ctrSubmitMonth;
    refreshDaySelect('poc-cs-day', 'ctrInvoiceSubmitDate', state.ctrSubmitYear, state.ctrSubmitMonth);
    el = document.getElementById('poc-cs-day');   if (el) el.value = state.ctrSubmitDay;
  }

  function updateFilterBadge() {
    var badge = document.getElementById('poc-filter-badge');
    if (!badge) return;
    var count = 0;
    if (state.vfInvoiceNo)                                                 count++;
    if (state.vfSubmitYear  || state.vfSubmitMonth  || state.vfSubmitDay)  count++;
    if (state.cashRcvYear   || state.cashRcvMonth   || state.cashRcvDay)   count++;
    if (state.ctrInvoiceNo)                                                count++;
    if (state.ctrSubmitYear || state.ctrSubmitMonth || state.ctrSubmitDay) count++;
    if (count) { badge.textContent = count; badge.style.display = 'inline-flex'; }
    else         badge.style.display = 'none';
  }

  /* ═══════════════════════════════════════
     Partial render — KPI cards + table
     Called on every filter change without
     rebuilding the filter controls.
  ═══════════════════════════════════════ */
  function renderResults() {
    var container = document.getElementById('poc-results');
    if (!container) return;

    var filtered = applyFilters();

    var countEl = document.getElementById('poc-record-count');
    if (countEl) countEl.textContent = 'Showing ' + filtered.length.toLocaleString() + ' of ' + _data.length.toLocaleString() + ' records';

    /* KPI totals */
    var totalAmount = 0, totalLMP = 0, totalC2 = 0;
    filtered.forEach(function (r) {
      var t = calcTax(r);
      totalAmount += t.totalTaxed;
      totalLMP    += t.lmpTaxed;
      totalC2     += t.contractorTaxed;
    });

    /* Group by contractor */
    var cmap = {};
    filtered.forEach(function (r) {
      var key = r.contractor || '(Unknown)';
      if (!cmap[key]) cmap[key] = {
        name: key, amount: 0, lmp: 0, c2: 0,
        amountOld: 0, lmpOld: 0, c2Old: 0,
        amountNew: 0, lmpNew: 0, c2New: 0,
        invOld: {}, invNew: {}
      };
      var t   = calcTax(r);
      var neo = isNewRow(r);
      var inv = String(r.ctrInvoiceNo || '').trim();
      cmap[key].amount += t.totalTaxed;
      cmap[key].lmp    += t.lmpTaxed;
      cmap[key].c2     += t.contractorTaxed;
      if (neo) {
        cmap[key].amountNew += t.totalTaxed; cmap[key].lmpNew += t.lmpTaxed; cmap[key].c2New += t.contractorTaxed;
        if (inv) cmap[key].invNew[inv] = 1;
      } else {
        cmap[key].amountOld += t.totalTaxed; cmap[key].lmpOld += t.lmpTaxed; cmap[key].c2Old += t.contractorTaxed;
        if (inv) cmap[key].invOld[inv] = 1;
      }
    });

    var rows = Object.keys(cmap).map(function (k) { return cmap[k]; })
      .filter(function (r) { return r.name.trim().toLowerCase() !== 'in-house'; })
      .sort(function (a, b) { return b.amount - a.amount; });

    var totAmtOld = 0, totAmtNew = 0, totLmpOld = 0, totLmpNew = 0, totC2Old = 0, totC2New = 0;
    rows.forEach(function (r) {
      totAmtOld += r.amountOld; totAmtNew += r.amountNew;
      totLmpOld += r.lmpOld;   totLmpNew += r.lmpNew;
      totC2Old  += r.c2Old;    totC2New  += r.c2New;
    });

    /* Refresh contractor datalist to match active VF invoice filter */
    var ctrDL = document.getElementById('poc-ctr-invoice-datalist');
    if (ctrDL) {
      var ctrSrc = state.vfInvoiceNo
        ? _data.filter(function (r) { return String(r.vfInvoiceNo || '').trim() === state.vfInvoiceNo.trim(); })
        : _data;
      ctrDL.innerHTML = getCtrInvoiceNumbers(ctrSrc).map(function (v) {
        return '<option value="' + escHtml(v) + '">';
      }).join('');
    }

    container.innerHTML =
      '<div class="kpi-grid kpi-grid-3">' +
        kpiCard('Total Amount <span class="kpi-tax-note">+14% tax</span>',
                fmt(totalAmount) + ' EGP', 'green',
                'Old: ' + fmt(totAmtOld) + ' &nbsp;|&nbsp; New: ' + fmt(totAmtNew)) +
        kpiCard('LMP Portion <span class="kpi-tax-note">total − contractor</span>',
                fmt(totalLMP) + ' EGP', 'blue',
                'Old: ' + fmt(totLmpOld) + ' &nbsp;|&nbsp; New: ' + fmt(totLmpNew)) +
        kpiCard('Contractor Portion <span class="kpi-tax-note">+11% / 13% tax</span>',
                fmt(totalC2) + ' EGP', 'red',
                'Old: ' + fmt(totC2Old) + ' &nbsp;|&nbsp; New: ' + fmt(totC2New)) +
      '</div>' +

      '<div class="table-container table-bordered">' +
        '<table class="data-table fin-table-responsive">' +
          '<thead>' +
            '<tr>' +
              '<th rowspan="3">Contractor</th>' +
              '<th rowspan="3" class="col-center">Tax</th>' +
              '<th colspan="4" class="col-center">Contractor Portion taxed (EGP)</th>' +
            '</tr>' +
            '<tr>' +
              '<th colspan="2" class="col-center fin-sub-head fin-sub-old">Old</th>' +
              '<th colspan="2" class="col-center fin-sub-head fin-sub-new">New</th>' +
            '</tr>' +
            '<tr>' +
              '<th class="col-center fin-sub-head fin-sub-old fin-sub-inv">Invoice #</th>' +
              '<th class="col-num fin-sub-head fin-sub-old">Amount</th>' +
              '<th class="col-center fin-sub-head fin-sub-new fin-sub-inv">Invoice #</th>' +
              '<th class="col-num fin-sub-head fin-sub-new">Amount</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            rows.map(function (r) {
              var taxBadge  = contractorTaxLabel(r.name);
              var isInHouse = String(r.name).trim().toLowerCase() === 'in-house';
              var invOldStr = Object.keys(r.invOld).sort().join(', ') || '—';
              var invNewStr = Object.keys(r.invNew).sort().join(', ') || '—';
              var dash      = '<span class="text-muted">—</span>';
              return '<tr>' +
                '<td data-label="Contractor">' + escHtml(r.name) + '</td>' +
                '<td class="col-center" data-label="Tax"><span class="badge badge-muted">' + taxBadge + '</span></td>' +
                '<td class="col-center fin-inv-no fin-col-old" data-label="Old Inv#">'  + (isInHouse ? dash : escHtml(invOldStr)) + '</td>' +
                '<td class="currency fin-col-old" data-label="Old Amount">'              + (isInHouse ? dash : fmt(r.c2Old))       + '</td>' +
                '<td class="col-center fin-inv-no fin-col-new" data-label="New Inv#">'  + (isInHouse ? dash : escHtml(invNewStr)) + '</td>' +
                '<td class="currency fin-col-new" data-label="New Amount">'              + (isInHouse ? dash : fmt(r.c2New))       + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
          '<tfoot>' +
            '<tr class="table-total-row">' +
              '<td><strong>Total</strong></td>' +
              '<td></td><td></td>' +
              '<td class="currency fin-col-old"><strong>' + fmt(totC2Old) + '</strong></td>' +
              '<td></td>' +
              '<td class="currency fin-col-new"><strong>' + fmt(totC2New) + '</strong></td>' +
            '</tr>' +
          '</tfoot>' +
        '</table>' +
      '</div>';
  }

  /* ── Build filter card HTML from current state ── */
  function buildFilterHTML() {
    var vsYears  = getYears(_data,  'vfInvoiceSubmissionDate');
    var vsMonths = getMonths(_data, 'vfInvoiceSubmissionDate', state.vfSubmitYear);
    var vsDays   = getDays(_data,   'vfInvoiceSubmissionDate', state.vfSubmitYear, state.vfSubmitMonth);

    var crYears  = getYears(_data,  'cashReceivedDate');
    var crMonths = getMonths(_data, 'cashReceivedDate', state.cashRcvYear);
    var crDays   = getDays(_data,   'cashReceivedDate', state.cashRcvYear, state.cashRcvMonth);

    var csYears  = getYears(_data,  'ctrInvoiceSubmitDate');
    var csMonths = getMonths(_data, 'ctrInvoiceSubmitDate', state.ctrSubmitYear);
    var csDays   = getDays(_data,   'ctrInvoiceSubmitDate', state.ctrSubmitYear, state.ctrSubmitMonth);

    var datalistOpts = getInvoiceNumbers(_data).map(function (v) {
      return '<option value="' + escHtml(v) + '">';
    }).join('');

    var ctrDataSource = state.vfInvoiceNo
      ? _data.filter(function (r) { return String(r.vfInvoiceNo || '').trim() === state.vfInvoiceNo.trim(); })
      : _data;
    var ctrDatalistOpts = getCtrInvoiceNumbers(ctrDataSource).map(function (v) {
      return '<option value="' + escHtml(v) + '">';
    }).join('');

    return (
      '<button id="poc-filter-toggle" class="dash-filter-toggle">' +
        '<span class="dash-filter-toggle-label">Filters' +
          '<span id="poc-filter-badge" class="dash-filter-count" style="display:none"></span>' +
        '</span>' +
        '<span class="dash-filter-chevron" id="poc-filter-chevron">&#9660;</span>' +
      '</button>' +

      '<div id="poc-filters-body" class="dash-filters-body">' +
        '<div class="fin-filters">' +

          '<div class="fin-filter-group">' +
            '<label class="field-label">VF Invoice #</label>' +
            '<datalist id="poc-invoice-datalist">' + datalistOpts + '</datalist>' +
            '<input type="text" id="poc-vf-invoice" class="search-input" list="poc-invoice-datalist"' +
            ' placeholder="Search or select invoice #…" value="' + escHtml(state.vfInvoiceNo) + '">' +
          '</div>' +

          '<div class="fin-filter-group">' +
            '<label class="field-label">VF Invoice Submission Date</label>' +
            '<div class="date-group">' +
              buildYearOpts('poc-vs-year',  vsYears,  state.vfSubmitYear) +
              buildMonthOpts('poc-vs-month', vsMonths, state.vfSubmitYear,  state.vfSubmitMonth) +
              buildDayOpts('poc-vs-day',   vsDays,   state.vfSubmitYear,  state.vfSubmitMonth, state.vfSubmitDay) +
            '</div>' +
          '</div>' +

          '<div class="fin-filter-group">' +
            '<label class="field-label">Cash Received Date</label>' +
            '<div class="date-group">' +
              buildYearOpts('poc-cr-year',  crYears,  state.cashRcvYear) +
              buildMonthOpts('poc-cr-month', crMonths, state.cashRcvYear,  state.cashRcvMonth) +
              buildDayOpts('poc-cr-day',   crDays,   state.cashRcvYear,  state.cashRcvMonth, state.cashRcvDay) +
            '</div>' +
          '</div>' +

          '<div class="fin-filter-group">' +
            '<label class="field-label">Contractor Invoice #</label>' +
            '<datalist id="poc-ctr-invoice-datalist">' + ctrDatalistOpts + '</datalist>' +
            '<input type="text" id="poc-ctr-invoice" class="search-input" list="poc-ctr-invoice-datalist"' +
            ' placeholder="Search or select contractor invoice #…" value="' + escHtml(state.ctrInvoiceNo) + '">' +
          '</div>' +

          '<div class="fin-filter-group">' +
            '<label class="field-label">Contractor Invoice Subm Date</label>' +
            '<div class="date-group">' +
              buildYearOpts('poc-cs-year',  csYears,  state.ctrSubmitYear) +
              buildMonthOpts('poc-cs-month', csMonths, state.ctrSubmitYear, state.ctrSubmitMonth) +
              buildDayOpts('poc-cs-day',   csDays,   state.ctrSubmitYear, state.ctrSubmitMonth, state.ctrSubmitDay) +
            '</div>' +
          '</div>' +

          '<div class="fin-filter-group" style="display:flex;align-items:flex-end">' +
            '<button id="poc-clear-btn" class="btn btn-outline" style="width:100%">Clear</button>' +
          '</div>' +

        '</div>' +
        '<p id="poc-record-count" class="results-count" style="margin-top:.75rem"></p>' +
      '</div>'
    );
  }

  /* ── Bind filter events ── */
  function bindFilterEvents() {

    var toggleBtn = document.getElementById('poc-filter-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', function () {
      var body    = document.getElementById('poc-filters-body');
      var chevron = document.getElementById('poc-filter-chevron');
      if (!body) return;
      var open = body.classList.toggle('open');
      if (chevron) chevron.classList.toggle('open', open);
    });

    /* VF Invoice # */
    var inv = document.getElementById('poc-vf-invoice');
    if (inv) inv.addEventListener('input', function (e) {
      state.vfInvoiceNo = e.target.value;
      if (autoFillDates(state.vfInvoiceNo)) syncDateSelects();
      updateFilterBadge();
      renderResults();
    });

    /* VF Invoice Submission Date */
    var vsYear  = document.getElementById('poc-vs-year');
    var vsMonth = document.getElementById('poc-vs-month');
    var vsDay   = document.getElementById('poc-vs-day');
    if (vsYear) vsYear.addEventListener('change', function (e) {
      state.vfSubmitYear = e.target.value; state.vfSubmitMonth = ''; state.vfSubmitDay = '';
      refreshMonthSelect('poc-vs-month', 'vfInvoiceSubmissionDate', state.vfSubmitYear);
      refreshDaySelect('poc-vs-day',    'vfInvoiceSubmissionDate', state.vfSubmitYear, '');
      updateFilterBadge(); renderResults();
    });
    if (vsMonth) vsMonth.addEventListener('change', function (e) {
      state.vfSubmitMonth = e.target.value; state.vfSubmitDay = '';
      refreshDaySelect('poc-vs-day', 'vfInvoiceSubmissionDate', state.vfSubmitYear, state.vfSubmitMonth);
      updateFilterBadge(); renderResults();
    });
    if (vsDay) vsDay.addEventListener('change', function (e) {
      state.vfSubmitDay = e.target.value; updateFilterBadge(); renderResults();
    });

    /* Cash Received Date */
    var crYear  = document.getElementById('poc-cr-year');
    var crMonth = document.getElementById('poc-cr-month');
    var crDay   = document.getElementById('poc-cr-day');
    if (crYear) crYear.addEventListener('change', function (e) {
      state.cashRcvYear = e.target.value; state.cashRcvMonth = ''; state.cashRcvDay = '';
      refreshMonthSelect('poc-cr-month', 'cashReceivedDate', state.cashRcvYear);
      refreshDaySelect('poc-cr-day',    'cashReceivedDate', state.cashRcvYear, '');
      updateFilterBadge(); renderResults();
    });
    if (crMonth) crMonth.addEventListener('change', function (e) {
      state.cashRcvMonth = e.target.value; state.cashRcvDay = '';
      refreshDaySelect('poc-cr-day', 'cashReceivedDate', state.cashRcvYear, state.cashRcvMonth);
      updateFilterBadge(); renderResults();
    });
    if (crDay) crDay.addEventListener('change', function (e) {
      state.cashRcvDay = e.target.value; updateFilterBadge(); renderResults();
    });

    /* Contractor Invoice # */
    var ctrInv = document.getElementById('poc-ctr-invoice');
    if (ctrInv) ctrInv.addEventListener('input', function (e) {
      state.ctrInvoiceNo = e.target.value;
      if (autoFillCtrDates(state.ctrInvoiceNo)) {
        var vfEl = document.getElementById('poc-vf-invoice');
        if (vfEl) vfEl.value = state.vfInvoiceNo;
        syncDateSelects();
      }
      updateFilterBadge();
      renderResults();
    });

    /* Contractor Invoice Subm Date */
    var csYear  = document.getElementById('poc-cs-year');
    var csMonth = document.getElementById('poc-cs-month');
    var csDay   = document.getElementById('poc-cs-day');
    if (csYear) csYear.addEventListener('change', function (e) {
      state.ctrSubmitYear = e.target.value; state.ctrSubmitMonth = ''; state.ctrSubmitDay = '';
      refreshMonthSelect('poc-cs-month', 'ctrInvoiceSubmitDate', state.ctrSubmitYear);
      refreshDaySelect('poc-cs-day',    'ctrInvoiceSubmitDate', state.ctrSubmitYear, '');
      updateFilterBadge(); renderResults();
    });
    if (csMonth) csMonth.addEventListener('change', function (e) {
      state.ctrSubmitMonth = e.target.value; state.ctrSubmitDay = '';
      refreshDaySelect('poc-cs-day', 'ctrInvoiceSubmitDate', state.ctrSubmitYear, state.ctrSubmitMonth);
      updateFilterBadge(); renderResults();
    });
    if (csDay) csDay.addEventListener('change', function (e) {
      state.ctrSubmitDay = e.target.value; updateFilterBadge(); renderResults();
    });

    /* Clear */
    var clearBtn = document.getElementById('poc-clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      state.vfInvoiceNo   = '';
      state.vfSubmitYear  = ''; state.vfSubmitMonth  = ''; state.vfSubmitDay  = '';
      state.cashRcvYear   = ''; state.cashRcvMonth   = ''; state.cashRcvDay   = '';
      state.ctrInvoiceNo  = '';
      state.ctrSubmitYear = ''; state.ctrSubmitMonth = ''; state.ctrSubmitDay = '';
      render();
    });
  }

  /* ═══════════════════════════════════════
     Full render — called on section switch
     or data reload. Builds filter card once,
     then calls renderResults().
  ═══════════════════════════════════════ */
  function render() {
    var el = document.getElementById('poc-content');
    if (!el) return;

    var rawData = window.AppData2 || [];
    if (!rawData.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">🗄️</div>' +
        '<p>No POC data yet &mdash; go to <strong>Admin</strong>, save the BH Sites URL, then tap <strong>Sync</strong></p></div>';
      return;
    }

    _data = processRawData(rawData);

    if (!_data.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">🗄️</div>' +
        '<p>No rows could be parsed from "POC3 Tracking". Check that the sheet has data rows below the header.</p></div>';
      return;
    }

    el.innerHTML =
      '<div class="section-header"><h2>🗄️ POC Invoices</h2></div>' +
      '<div class="card fin-filter-card">' + buildFilterHTML() + '</div>' +
      '<div id="poc-results"></div>';

    renderResults();
    bindFilterEvents();
  }

  return { render: render };

})();
