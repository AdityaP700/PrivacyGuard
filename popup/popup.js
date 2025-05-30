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

function setPopupStatus(mode, statusMessage, score, features, iconColorClass, whitelisted) {
    statusTextEl.textContent = statusMessage;
    statusIconEl.className = `status-icon ${iconColorClass}`; // Reset and apply new class
    siteScoreEl.textContent = (score !== null && score !== undefined) ? `Score: ${score}` : '';

    if (features && Object.keys(features).length > 0 && mode !== 'green' && mode !== 'N/A' && !whitelisted) {
        featureListEl.innerHTML = '';
        let factorsFound = false;

        // Add homograph check
        if (features.hasHomograph) {
            const li = document.createElement('li');
            li.innerHTML = '🚨 <strong>Warning:</strong> Suspicious characters detected in domain name!';
            li.style.color = 'red';
            li.style.fontWeight = 'bold';
            featureListEl.appendChild(li);
            factorsFound = true;
        }

        if (features.isHTTP) {
            const li = document.createElement('li');
            li.innerHTML = 'Uses insecure <strong>HTTP</strong> connection.';
            featureListEl.appendChild(li);
            factorsFound = true;
        }
        if (features.hasForms) {
            const li = document.createElement('li');
            li.innerHTML = 'Contains password input fields.';
            featureListEl.appendChild(li);
            factorsFound = true;
        }
        if (features.length > 75) { // Example: show if URL is very long
            const li = document.createElement('li');
            li.innerHTML = `URL is very long (${features.length} chars).`;
            featureListEl.appendChild(li);
            factorsFound = true;
        }
        if (features.hasHomograph) {
            const li = document.createElement('li');
            li.innerHTML = '🚨 **Warning: Suspicious characters (potential homograph attack) detected in domain!**';
            li.style.color = 'red'; // Make it stand out
            featureListEl.appendChild(li);
            factorsFound = true;
        }
        if (analysisDataFromContentJs.modelUsed) { // Assuming you pass the full analysisData or modelUsed flag
           const li = document.createElement('li');
            li.textContent = `🧠 AI model contributed to this assessment.`;
           featureListEl.appendChild(li);
           factorsFound = true;
        }
        if(factorsFound){
            featureBlockEl.style.display ='block'; // Corrected from featureBlockE1
          } else{
            featureBlockEl.style.display = 'none';
          } // Add more features as needed
    } else {
        featureBlockEl.style.display = 'none';
    }
      // ... after other feature checks ...
if (features && features.p2pFlag) {
    const li = document.createElement('li');
    if (features.p2pFlag === 'p2p_phishing') {
        li.innerHTML = '🌐 P2P Network: Reported as <strong>High Risk</strong> by community (mock).';
        li.style.color = 'purple'; // Or some distinct color
    } else if (features.p2pFlag === 'p2p_safe') {
        li.innerHTML = '🌐 P2P Network: Considered <strong>Safer</strong> by community (mock).';
        li.style.color = 'blue'; // Or some distinct color
    }
    if (li.innerHTML) { // Check if message was set
         featureListEl.appendChild(li);
         factorsFound = true;
    }
}
}

function getStatusMessage(mode, whitelisted,modelUsed) {
    if (whitelisted) return "Site is on your whitelist.";
    let message ="";
    switch (mode) {
        case 'green': message ="Site appears safe.";break;
        case 'yellow': message="Caution advised.";break;
        case 'red': message ="Dangerous site detected!";break;
        default: message = "Checking...";
    }
    if(modelUsed && (mode =='yellow'|| mode == 'red')){
        message += "(AI Enhanced)";
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