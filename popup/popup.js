// popup/popup.js
const statusIconEl = document.getElementById('statusIcon');
const statusTextEl = document.getElementById('statusText');
const siteUrlEl = document.getElementById('siteUrl');
const siteScoreEl = document.getElementById('siteScore');
const featureBlockEl = document.getElementById('featureBlock');
const featureListEl = document.getElementById('featureList');
const p2pToggleEl = document.getElementById('p2pToggle');
const reanalyzeButtonEl = document.getElementById('reanalyzeButton');
const learnMoreLinkPopupEl = document.getElementById('learnMoreLinkPopup');

const P2P_ENABLED_KEY = 'privacyGuardP2PEnabled';
const LAST_ANALYSIS_KEY_PREFIX = 'privacyGuardLastAnalysis_';

document.addEventListener('DOMContentLoaded', async () => {
    chrome.storage.local.get([P2P_ENABLED_KEY], (result) => {
        p2pToggleEl.checked = !!result[P2P_ENABLED_KEY];
    });

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs && tabs.length > 0) {
            const currentTab = tabs[0];
            siteUrlEl.textContent = currentTab.url || 'N/A';
            siteUrlEl.title = currentTab.url || 'N/A'; // Tooltip for long URLs

            if (currentTab.url && (currentTab.url.startsWith('http:') || currentTab.url.startsWith('https:'))) {
                updatePopupForTab(currentTab);
            } else {
                setPopupStatus('N/A', 'Cannot analyze this page (e.g., chrome://, about:blank)', null, [], 'grey');
            }
        } else {
            setPopupStatus('N/A', 'No active tab found.', null, [], 'grey');
        }
    });
});

// --- Event Listeners ---
p2pToggleEl.addEventListener('change', (event) => {
    const enabled = event.target.checked;
    chrome.storage.local.set({ [P2P_ENABLED_KEY]: enabled }, () => {
        console.log(`P2P Sharing ${enabled ? 'Enabled' : 'Disabled'}`);
        // Future: Send message to background/content scripts if needed
    });
});

learnMoreLinkPopupEl.addEventListener('click', (event) => {
    event.preventDefault();
    const learnMoreUrl = chrome.runtime.getURL('learn-more.html');
    chrome.tabs.create({ url: learnMoreUrl }); // Use chrome.tabs.create for popups
});

reanalyzeButtonEl.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0 && tabs[0].id) {
           
            console.log("Re-analyze button clicked for tab:", tabs[0].id);
            chrome.tabs.sendMessage(tabs[0].id, { action: "reanalyzePage" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn("Could not send reanalyze message, content script might not be ready or on this page.", chrome.runtime.lastError.message);
                    // Fallback: try to update from storage anyway
                    updatePopupForTab(tabs[0]);
                } else {
                    console.log("Reanalyze message sent, response:", response);
                    if (response && response.status === "analysisRefreshed") {
                       // Update popup with new data
                       setPopupStatus(
                            response.mode,
                            getStatusMessage(response.mode, response.whitelisted),
                            response.score,
                            response.features,
                            getColorForMode(response.mode),
                            response.whitelisted
                        );
                    } else {
                        // If no direct response or content script didn't handle it, try storage
                        updatePopupForTab(tabs[0]);
                    }
                }
            });
        }
    });
});


// --- Helper Functions ---
async function updatePopupForTab(tab) {
    // Method 1: Get status from storage (cached by content.js)
    const storageKey = `${LAST_ANALYSIS_KEY_PREFIX}${tab.id}`; // Use tab ID for uniqueness
    chrome.storage.local.get([storageKey], (result) => {
        if (result && result[storageKey]) {
            const { mode, score, features, whitelisted } = result[storageKey];
            setPopupStatus(mode, getStatusMessage(mode, whitelisted), score, features, getColorForMode(mode),whitelisted);
        } else {
            // No cached data, or content script hasn't run yet for this tab
            setPopupStatus('N/A', 'Awaiting analysis...', null, [], 'grey');
            // Optionally, send a message to content.js to request current status if not found
             chrome.tabs.sendMessage(tab.id, { action: "getStatus" }, response => {
                if (chrome.runtime.lastError) {
                    console.warn("Error sending getStatus to content script:", chrome.runtime.lastError.message);
                } else if (response && response.mode) {
                     setPopupStatus(
                        response.mode,
                        getStatusMessage(response.mode, response.whitelisted),
                        response.score,
                        response.features,
                        getColorForMode(response.mode),
                        response.whitelisted
                    );
                }
            });
        }
    });
}

function setPopupStatus(mode, statusMessage, score, features, iconColorClass,whitelisted) {
    statusTextEl.textContent = statusMessage;
    statusIconEl.className = `status-icon ${iconColorClass}`; // Reset and apply new class
    siteScoreEl.textContent = (score !== null && score !== undefined) ? `Score: ${score}` : '';

    if (features && Object.keys(features).length > 0 && mode !== 'green' && mode !== 'N/A' && !whitelisted) {
        featureListEl.innerHTML = ''; // Clear previous features
        if (features.isHTTP) {
            const li = document.createElement('li');
            li.textContent = 'Uses insecure HTTP connection.';
            featureListEl.appendChild(li);
        }
        if (features.hasForms) {
            const li = document.createElement('li');
            li.textContent = 'Contains password input fields.';
            featureListEl.appendChild(li);
        }
        if (features.length > 75) { // Example: show if URL is very long
            const li = document.createElement('li');
            li.textContent = `URL is very long (${features.length} chars).`;
            featureListEl.appendChild(li);
        }
        if(featureListEl.childElementCount>0){
            featureBlockEl.style.display ='block'; // Corrected from featureBlockE1
          }  // Add more features as needed
    } else {
        featureBlockEl.style.display = 'none';
    }
}

function getStatusMessage(mode, whitelisted) {
    if (whitelisted) return "Site is on your whitelist.";
    switch (mode) {
        case 'green': return "Site appears safe.";
        case 'yellow': return "Caution advised.";
        case 'red': return "Dangerous site detected!";
        default: return "Checking...";
    }
}

function getColorForMode(mode) {
    switch (mode) {
        case 'green': return 'status-green';
        case 'yellow': return 'status-yellow';
        case 'red': return 'status-red';
        default: return 'status-grey';
    }
}