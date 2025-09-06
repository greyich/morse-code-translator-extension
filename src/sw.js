// MV3 Service Worker
// Runs on install/update and can perform onboarding actions.

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    // Open landing page on first install
    // Note: host is informational (`https://morse-code-translator.tilda.ws/`).
    chrome.tabs.create({
      url: 'https://morse-code-translator.tilda.ws/'
    });
  } else if (details.reason === chrome.runtime.OnInstalledReason.UPDATE) {
    // Extension updated
  } else if (details.reason === chrome.runtime.OnInstalledReason.CHROME_UPDATE) {
    // Browser updated
  } else if (details.reason === chrome.runtime.OnInstalledReason.SHARED_MODULE_UPDATE) {
    // Shared module updated
  }
});


