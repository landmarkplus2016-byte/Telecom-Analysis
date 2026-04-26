// config.js — reads non-sensitive settings from localStorage
// NEVER hardcode tokens or file URLs here — this is a public repo

window.Config = {
  fileUrl:      localStorage.getItem('telecom_file_url')   || null,
  fileUrl2:     localStorage.getItem('telecom_file_url_2') || null,
  version:      '1.0.0',
  cacheKey:     'telecom_data_cache',
  lastSyncKey:  'telecom_last_sync',
  cacheKey2:    'telecom_data_cache_2',
  lastSyncKey2: 'telecom_last_sync_2',

  // Call after changing localStorage so all modules see the new values
  refresh() {
    this.fileUrl  = localStorage.getItem('telecom_file_url')   || null;
    this.fileUrl2 = localStorage.getItem('telecom_file_url_2') || null;
  }
};
