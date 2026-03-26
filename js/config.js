// config.js — reads non-sensitive settings from localStorage
// NEVER hardcode tokens or file URLs here — this is a public repo

window.Config = {
  fileUrl:    localStorage.getItem('telecom_file_url') || null,
  version:    '1.0.0',
  cacheKey:   'telecom_data_cache',
  lastSyncKey:'telecom_last_sync',

  // Call after changing localStorage so all modules see the new value
  refresh() {
    this.fileUrl = localStorage.getItem('telecom_file_url') || null;
  }
};
