document.addEventListener('DOMContentLoaded', () => {
    const statusIconEl = document.getElementById('statusIcon');
    const statusTextEl = document.getElementById('statusText');
    const siteUrlEl = document.getElementById('siteUrl');
    const siteScoreEl = document.getElementById('siteScore');
    const featureBlockEl = document.getElementById('featureBlock');
    const featureListEl = document.getElementById('featureList');
    const p2pToggleEl = document.getElementById('p2pToggle');
    const reanalyzeButtonEl = document.getElementById('reanalyzeButton');
    const learnMoreLinkPopupEl = document.getElementById('learnMoreLinkPopup');

    const P2P_ENABLED_KEY = 'privacyGuardP2PEnabled'; // Ensure this matches content.js/config.js
    const LAST_ANALYSIS_KEY_PREFIX = 'privacyGuardLastAnalysis_'; // Ensure this matches

    // Load P2P toggle state
    chrome.storage.local.get([P2P_ENABLED_KEY], (result) => {
        p2pToggleEl.checked = !!result[P2P_ENABLED_KEY];
    });

    p2pToggleEl.addEventListener('change', (event) => {
        const enabled = event.target.checked;
        chrome.storage.local.set({ [P2P_ENABLED_KEY]: enabled }, () => {
            console.log(`POPUP: P2P Sharing ${enabled ? 'Enabled' : 'Disabled'}`);
        });
    });

    learnMoreLinkPopupEl.addEventListener('click', (event) => {
        event.preventDefault();
        chrome.tabs.create({ url: chrome.runtime.getURL('learn-more.html') });
    });

    reanalyzeButtonEl.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0 && tabs[0].id && tabs[0].url && (tabs[0].url.startsWith('http:') || tabs[0].url.startsWith('https:'))) {
                console.log("POPUP: Re-analyze button clicked for tab:", tabs[0].id);
                // Immediately show "Re-analyzing..." in popup
                setPopupDisplay('N/A', 'Re-analyzing...', null, [], 'status-grey', false);

                chrome.tabs.sendMessage(tabs[0].id, { action: "reanalyzePage" }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.warn("POPUP: Reanalyze message failed.", chrome.runtime.lastError.message);
                        // Fallback to trying to read from storage again after a short delay
                        setTimeout(() => updatePopupForTab(tabs[0]), 500); 
                    } else {
                        console.log("POPUP: Reanalyze response received:", response);
                        if (response && response.status === "analysisRefreshed") {
                            updatePopupDisplayFromAnalysis(response);
                        } else {
                            // If response is not what we expect, try storage
                            setTimeout(() => updatePopupForTab(tabs[0]), 200);
                        }
                    }
                });
            } else {
                console.log("POPUP: Cannot re-analyze current tab.", tabs[0] ? tabs[0].url : "No tab");
            }
        });
    });
    
    // Get current tab and update UI
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
            const currentTab = tabs[0];
            siteUrlEl.textContent = currentTab.url ? truncateUrl(currentTab.url, 45) : 'N/A';
            siteUrlEl.title = currentTab.url || 'N/A';

            if (currentTab.url && (currentTab.url.startsWith('http:') || currentTab.url.startsWith('https:'))) {
                updatePopupForTab(currentTab);
            } else {
                updatePopupDisplayFromAnalysis({ mode: 'N/A', message: 'Cannot analyze this page.', score: null, features: {}, whitelisted: false });
            }
        } else {
            updatePopupDisplayFromAnalysis({ mode: 'N/A', message: 'No active tab.', score: null, features: {}, whitelisted: false });
        }
    });

    async function updatePopupForTab(tab) {
    console.log("POPUP_DEBUG: updatePopupForTab for URL:", tab.url, "Tab ID:", tab.id);
    const storageKey = `${LAST_ANALYSIS_KEY_PREFIX}${tab.id}`;
    
    chrome.storage.local.get([storageKey], (result) => {
        console.log("POPUP_DEBUG: Storage.local.get result for key", storageKey, ":", JSON.stringify(result));
        
        if (result && result[storageKey] && result[storageKey].url === tab.url) {
            console.log("POPUP_DEBUG: Found FRESH data in storage:", result[storageKey]);
            updatePopupDisplayFromAnalysis(result[storageKey]);
        } else {
            if (result && result[storageKey] && result[storageKey].url !== tab.url) {
                console.log("POPUP_DEBUG: Stale data in storage (wrong URL). Current URL:", tab.url, "Cached URL:", result[storageKey].url);
            } else {
                console.log("POPUP_DEBUG: No data or no matching URL in storage for key", storageKey);
            }
            
            console.log("POPUP_DEBUG: Sending getStatus message to content script for tab", tab.id);
            // Set to "Checking..." explicitly before sending message
            updatePopupDisplayFromAnalysis({ mode: 'N/A', message: 'Status: Checking with page...', score: null, features: {}, whitelisted: false, url: tab.url });

            chrome.tabs.sendMessage(tab.id, { action: "getStatus" }, response => {
                if (chrome.runtime.lastError) {
                    console.warn("POPUP_DEBUG: Error sending getStatus:", chrome.runtime.lastError.message, "for URL:", tab.url);
                    updatePopupDisplayFromAnalysis({ mode: 'N/A', message: 'Error: Could not get status from page.', score: null, features: {}, whitelisted: false, url: tab.url });
                } else {
                    console.log("POPUP_DEBUG: Received response from getStatus:", JSON.stringify(response));
                    if (response && response.mode && response.url === tab.url) {
                        updatePopupDisplayFromAnalysis(response);
                        // Optionally, re-cache this fresh response, though background should be primary cacher
                         chrome.storage.local.set({ [storageKey]: response }, () => console.log("POPUP_DEBUG: Re-cached fresh status from getStatus."));
                    } else {
                        console.warn("POPUP_DEBUG: Invalid or mismatched response from getStatus. Current URL:", tab.url, "Response:", response);
                        updatePopupDisplayFromAnalysis({ mode: 'N/A', message: 'Status: Page analysis unavailable.', score: null, features: {}, whitelisted: false, url: tab.url });
                    }
                }
            });
        }
    });
}
    function updatePopupDisplayFromAnalysis(analysisData) {
        const { mode, score, features, whitelisted, modelUsed, heuristicScoreCalculated, modelPredictionRaw, message } = analysisData;
        
        let statusMsg = message || getStatusMessage(mode, whitelisted, modelUsed);
        let iconColor = getColorForMode(mode);
        let scoreText = "";

        if (score !== null && score !== undefined) {
            scoreText = `Score: ${score}`;
            if (modelUsed) {
                scoreText += ` (H:${heuristicScoreCalculated}, ML:${(modelPredictionRaw * 100).toFixed(0)})`;
            }
        }

        setPopupDisplay(mode, statusMsg, scoreText, features, iconColor, whitelisted, modelUsed);
    }

    function setPopupDisplay(mode, statusMessage, scoreText, features, iconColorClass, whitelisted, modelUsed) {
        statusTextEl.textContent = statusMessage;
        statusIconEl.className = `status-icon ${iconColorClass}`;
        siteScoreEl.textContent = scoreText;

        featureListEl.innerHTML = ''; // Clear previous features
        let factorsFound = false;
        if (features && Object.keys(features).length > 0 && mode !== 'green' && mode !== 'N/A' && !whitelisted) {
            if (features.isHTTP) { addFactorItem("⚠️ Uses insecure HTTP connection."); factorsFound = true; }
            if (features.hasForms) { addFactorItem("📄 Contains password input fields."); factorsFound = true; }
            if (features.length > 75) { addFactorItem(`📏 URL is very long (${features.length} chars).`); factorsFound = true; }
            if (features.hasHomograph) { addFactorItem("🚨 Suspicious characters (homograph) in domain!", "red"); factorsFound = true; }
            
            if (features.p2pFlag === 'p2p_phishing') { addFactorItem("🌐 P2P Network: Reported High Risk (mock).", "purple"); factorsFound = true;}
            else if (features.p2pFlag === 'p2p_safe') { addFactorItem("🌐 P2P Network: Considered Safer (mock).", "blue"); factorsFound = true; }

            // if (modelUsed && (mode === 'yellow' || mode === 'red')) { // Already in status message
            //     addFactorItem("🧠 AI model contributed to assessment."); factorsFound = true;
            // }
        }

        featureBlockEl.style.display = factorsFound ? 'block' : 'none';
    }

    function addFactorItem(text, color = null) {
        const li = document.createElement('li');
        li.innerHTML = text; // Use innerHTML if text contains HTML (like <strong>)
        if (color) li.style.color = color;
        featureListEl.appendChild(li);
    }

    function getStatusMessage(mode, whitelisted, modelUsed) {
        if (whitelisted) return "Site is on your whitelist.";
        let message = "";
        switch (mode) {
            case 'green': message = "Site appears safe."; break;
            case 'yellow': message = "Caution advised."; break;
            case 'red': message = "Dangerous site detected!"; break;
            case 'N/A': message = "Page cannot be analyzed."; break;
            default: message = "Checking...";
        }
        if (modelUsed && (mode === 'yellow' || mode === 'red')) {
            message += " (AI Enhanced)";
        }
        return message;
    }

function getColorForMode(mode) {
    switch (mode) {
        case 'green': return 'status-green';
        case 'yellow': return 'status-yellow';
        case 'red': return 'status-red';
        default: return 'status-grey';
    }
}

function getCurrentTab() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            resolve(tabs[0]);
        });
    });
}

async function getStatus() {
    try {
        const tab = await getCurrentTab();
        
        // Check if we have a valid tab
        if (!tab || !tab.id) {
            console.error("No active tab found");
            updatePopupUI({ error: "No active tab" });
            return;
        }

        // Add retry logic
        let retries = 3;
        while (retries > 0) {
            try {
                const response = await new Promise((resolve, reject) => {
                    chrome.tabs.sendMessage(tab.id, { action: "getStatus" }, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(response);
                        }
                    });
                });
                
                updatePopupUI(response);
                return;
            } catch (error) {
                console.warn(`Attempt ${4 - retries} failed:`, error);
                retries--;
                if (retries === 0) {
                    throw error;
                }
                // Wait 100ms before retrying
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    } catch (error) {
        console.error("Failed to get status:", error);
        updatePopupUI({ 
            error: "Connection failed", 
            details: "Please refresh the page and try again." 
        });
    }
}

// Call getStatus when popup opens
document.addEventListener('DOMContentLoaded', getStatus);
chrome.storage.local.get([P2P_ENABLED_KEY], (result) => {
     p2pToggleEl.checked = !!result[P2P_ENABLED_KEY];
     console.log("POPUP: P2P Toggle loaded state:", p2pToggleEl.checked);
 });
function updatePopupUI(data) {
    const container = document.getElementById('status-container');
    
    if (data.error) {
        container.innerHTML = `
            <div class="error-message">
                <h3>${data.error}</h3>
                <p>${data.details || 'Please try refreshing the page.'}</p>
            </div>
        `;
        return;
    }
}
});