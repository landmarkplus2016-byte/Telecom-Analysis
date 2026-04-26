/* =========================================================
   dropbox.js — Telecom Analysis
   Fetches the .xlsm file from the configured Dropbox URL
   and returns a SheetJS workbook. Caches raw data on success.
   Exposes: window.DropboxModule.fetchFile() → Promise<workbook>
   ========================================================= */

window.DropboxModule = (function () {

  async function fetchFile() {
    var url = window.Config && window.Config.fileUrl;

    if (!url) {
      throw new Error('App not configured yet. Please contact your administrator.');
    }

    // Ensure the Dropbox URL forces a download
    if (url.indexOf('dropbox.com') !== -1) {
      url = url.replace('?dl=0', '?dl=1').replace('www.dropbox.com', 'dl.dropboxusercontent.com');
      if (url.indexOf('dl=') === -1) url += (url.indexOf('?') === -1 ? '?' : '&') + 'dl=1';
    }

    var response = await fetch(url);
    if (!response.ok) {
      throw new Error('Download failed (' + response.status + ' ' + response.statusText + ')');
    }

    var arrayBuffer = await response.arrayBuffer();
    var data        = new Uint8Array(arrayBuffer);
    var workbook    = XLSX.read(data, { type: 'array', cellDates: false });

    // Parse into AppData
    var parsed = window.Parser.parseSheet(workbook);

    if (!parsed.length) {
      throw new Error('No data rows found. Check the sheet name is "Invoicing Track" and the header is on row 4.');
    }

    // Save to global + localStorage cache
    window.AppData = parsed;

    try {
      localStorage.setItem(window.Config.cacheKey, JSON.stringify(parsed));
    } catch (e) {
      // Quota exceeded — cache silently skipped
    }

    localStorage.setItem(window.Config.lastSyncKey, new Date().toISOString());

    return workbook;
  }

  async function fetchFile2() {
    var url = window.Config && window.Config.fileUrl2;

    if (!url) {
      throw new Error('BH Sites file not configured yet. Please enter a URL in the Admin panel.');
    }

    if (url.indexOf('dropbox.com') !== -1) {
      url = url.replace('?dl=0', '?dl=1').replace('www.dropbox.com', 'dl.dropboxusercontent.com');
      if (url.indexOf('dl=') === -1) url += (url.indexOf('?') === -1 ? '?' : '&') + 'dl=1';
    }

    var response = await fetch(url);
    if (!response.ok) {
      throw new Error('Download failed (' + response.status + ' ' + response.statusText + ')');
    }

    var arrayBuffer = await response.arrayBuffer();
    var data        = new Uint8Array(arrayBuffer);
    var workbook    = XLSX.read(data, { type: 'array', cellDates: false });

    var parsed = window.Parser2.parseSheet(workbook);

    window.AppData2 = parsed;

    try {
      localStorage.setItem(window.Config.cacheKey2, JSON.stringify(parsed));
    } catch (e) {
      // Quota exceeded — cache silently skipped
    }

    localStorage.setItem(window.Config.lastSyncKey2, new Date().toISOString());

    return workbook;
  }

  return { fetchFile: fetchFile, fetchFile2: fetchFile2 };

})();
