// js/background.js
console.log("PrivacyGuard background script (service_worker) loaded.");

const LAST_ANALYSIS_KEY_PREFIX = 'privacyGuardLastAnalysis_';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Background received message:", message, "from sender:", sender);
    if (message.action === "cacheAnalysisResult") {
        if (sender.tab && sender.tab.id && message.data) {
            const tabId = sender.tab.id;
            const storageKey = `${LAST_ANALYSIS_KEY_PREFIX}${tabId}`;
            chrome.storage.local.set({ [storageKey]: message.data }, () => {
                if (chrome.runtime.lastError) {
                    console.error("Error setting analysis result in storage:", chrome.runtime.lastError);
                    sendResponse({ status: "error", message: chrome.runtime.lastError.message });
                } else {
                    console.log(`Analysis for tab ${tabId} cached:`, message.data);
                    sendResponse({ status: "success", tabId: tabId });
                }
            });
            return true; 
        } else {
            console.warn("Background: Missing tab ID or data for cacheAnalysisResult.");
            sendResponse({ status: "error", message: "Missing tab ID or data." });
        }
    }
    return false; 
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    const storageKey = `${LAST_ANALYSIS_KEY_PREFIX}${tabId}`;
    chrome.storage.local.remove(storageKey, () => {
        if (chrome.runtime.lastError) {
             console.warn(`Error removing cached analysis for closed tab ${tabId}:`, chrome.runtime.lastError.message);
        } else {
            console.log(`Cached analysis for closed tab ${tabId} removed.`);
        }
    });
});