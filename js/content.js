// js/content.js
console.log("--- PrivacyGuard content.js START ---"); // Keep this for easy identification

const WHITELIST_KEY = 'privacyGuardWhitelist';
const LAST_ANALYSIS_KEY_PREFIX = 'privacyGuardLastAnalysis_'; // For popup communication

// Helper function to get the whitelist from storage
async function getWhitelist() {
  return new Promise((resolve) => {
    chrome.storage.local.get([WHITELIST_KEY], (result) => {
      resolve(result[WHITELIST_KEY] || []);
    });
  });
}

// Helper function to add a hostname to the whitelist
async function addToWhitelist(hostname) {
  const whitelist = await getWhitelist();
  if (!whitelist.includes(hostname)) {
    whitelist.push(hostname);
    return new Promise((resolve) => {
      chrome.storage.local.set({ [WHITELIST_KEY]: whitelist }, () => {
        console.log(`${hostname} added to whitelist.`);
        resolve();
      });
    });
  } else {
    console.log(`${hostname} already in whitelist.`);
    return Promise.resolve();
  }
}

function extractFeatures(url, dom) {
  // console.log("--- extractFeatures called with URL:", url, "---");
  try {
    const hostname = new URL(url).hostname;
    return {
      isHTTP: url.startsWith('http:'),
      length: url.length,
      hasForms: dom.querySelector('form input[type="password"]') !== null,
      isEdu: hostname.endsWith('.edu'),
      hostname: hostname
    };
  } catch (e) {
    console.error("!!! ERROR in extractFeatures:", e, "URL was:", url, "!!!");
    return null;
  }
}
let currentAnalysisResult = null; // To store the latest analysis for message passing


async function analyzeURL(url, dom, isReanalysis = false) {
  console.log(`--- analyzeURL called (Re-analysis: ${isReanalysis}) with URL: ${url} ---`);
  const features = extractFeatures(url, dom);

  if (!features) {
    console.error("!!! Cannot analyze URL, feature extraction failed. !!!");
    currentAnalysisResult = { score: -1, mode: 'error', features: null, whitelisted: false, url: url };
    return currentAnalysisResult;
  }

  const whitelist = await getWhitelist();
  if (whitelist.includes(features.hostname)) {
    console.log(`URL: ${url} (${features.hostname}) is in user whitelist.`);
    currentAnalysisResult = { score: 0, mode: 'green', features, whitelisted: true, url: url };
    // Store for popup
    if (chrome.runtime?.id) { // Check if extension context is valid
        chrome.tabs.getCurrent(tab => { // This API is tricky in content scripts, usually undefined
                                        // A better way is to get tabId via message from popup or background
                                        // For now, we'll rely on popup sending a message if it needs an update.
            // Or, more simply, the popup will request it. Let's not proactively store from here based on tabId yet.
        });
    }
    return currentAnalysisResult;
  }

  let score = 0;
  if (features.isHTTP) score += 40;
  if (features.length > 50) score += 20;
  if (features.hasForms) score += 30;

  if (features.isEdu) {
    score = Math.max(20, score - 20);
  }

  const mode = score > 70 ? 'red' : score >= 30 ? 'yellow' : 'green';

  console.log('%cPrivacyGuard: Analysis complete. All processing done locally. No URLs or page content sent externally.', 'color: green; font-weight: bold;');
  console.log(`URL: ${url}, Mode: ${mode}, Score: ${score}`);
  currentAnalysisResult = { score, mode, features, whitelisted: false, url: url };

  // Store for popup (needs tab ID - best obtained via message from popup or background)
  // For now, we'll just cache it locally in currentAnalysisResult and let popup request it.
  // Or, the content script can listen for a "storeMyStatus" message from the popup that includes the tabId.

  // Let's try storing it directly if we can get a tabId.
  // This part is experimental for content script direct storage.
  try {
    if(chrome.runtime?.id) { // Check to ensure we are in an extension context
        // The idea of getting current tab ID directly from content script is not straightforward.
        // It's better if popup sends its tab.id when requesting data or for storage.
        // For now, we'll primarily rely on popup requesting status.
    }
  } catch (e) { console.warn("Error trying to store analysis for popup from content script:", e); }


  return currentAnalysisResult;
}

// showAlert function remains mostly the same, ensure it uses results from currentAnalysisResult if needed
// or receives it directly from initialize
function showAlert(analysisData) {
    const { mode, score, url: currentUrl, features } = analysisData; // Destructure
    console.log(`--- showAlert called with Mode: ${mode}, Score: ${score}, URL: ${currentUrl} ---`);

    const existingAlert = document.getElementById('privacyguard-alert');
    if (existingAlert) {
        existingAlert.remove();
    }

    if (analysisData.whitelisted || mode === 'green' || mode === 'error') {
        console.log(`Mode is ${mode} or site whitelisted, no prominent alert shown.`);
        return;
    }

    const alertDiv = document.createElement('div');
    alertDiv.id = 'privacyguard-alert';

    if (!document.querySelector('link[href="https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css"]')) {
        const bulmaLink = document.createElement('link');
        bulmaLink.setAttribute('rel', 'stylesheet');
        bulmaLink.setAttribute('href', 'https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css');
        document.head.appendChild(bulmaLink);
        console.log("Bulma CSS link added to head.");
    }

    let alertColorClass = '';
    let alertMessage = '';
    let buttonsHtml = '';

    const learnMoreButton = `<button class="button is-link is-small learn-more-btn">Learn More</button>`;
    const blockButton = `<button class="button is-dark is-small block-btn">Block Site</button>`;
    const proceedButton = `<button class="button is-outlined is-small proceed-btn">Proceed Anyway</button>`;


    if (mode === 'yellow') {
        alertColorClass = 'is-warning';
        alertMessage = '<strong>Caution:</strong> This site may be insecure or has raised potential concerns.';
        const markSafeButton = `<button class="button is-light is-success is-small mark-safe-btn">Mark as Safe (Yellow)</button>`;
        buttonsHtml = `
        <div class="buttons mt-2">
            ${markSafeButton}
            ${proceedButton}
            ${blockButton}
            ${learnMoreButton}
        </div>
        `;
    } else if (mode === 'red') {
        alertColorClass = 'is-danger';
        alertMessage = '<strong>Danger:</strong> Potential Phishing Site or Significant Risk Detected!';
        buttonsHtml = `
        <div class="buttons mt-2">
            ${proceedButton}
            ${blockButton}
            ${learnMoreButton}
        </div>
        `;
    } else {
        console.log("Unknown mode for alert, not showing:", mode);
        return;
    }

    alertDiv.innerHTML = `
        <div class="notification ${alertColorClass}" style="position: fixed; top: 20px; right: 20px; padding: 1.25rem 2.5rem 1.25rem 1.5rem; z-index: 99999; box-shadow: 0 0.5em 1em -0.125em rgba(10,10,10,.1), 0 0 0 1px rgba(10,10,10,.02); width: 350px;">
        <button class="delete" style="position: absolute; top: 10px; right: 10px;"></button>
        ${alertMessage}
        <p style="font-size: 0.8em; margin-top: 5px;">Score: ${score}</p>
        ${buttonsHtml}
        </div>
    `;

    document.body.appendChild(alertDiv);
    console.log(`Alert div for mode '${mode}' appended to body.`);

    // Add event listeners to the new buttons
    const deleteBtn = alertDiv.querySelector('.delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
        alertDiv.remove();
        console.log("Alert removed by user (delete button).");
        });
    }

    const markSafeBtn = alertDiv.querySelector('.mark-safe-btn');
    if (markSafeBtn) {
        markSafeBtn.addEventListener('click', async () => {
        if (features && features.hostname) {
            console.log(`User clicked 'Mark as Safe (Yellow)' for ${features.hostname}`);
            await addToWhitelist(features.hostname);
            alertDiv.remove();
            // Force re-analysis and UI update for the current page after whitelisting
            currentAnalysisResult = await analyzeURL(window.location.href, document, true);
            showAlert(currentAnalysisResult); // Show new alert status (should be none for green)
            // Update storage for popup to pick up the change
            chrome.runtime.sendMessage({
                action: "storeAnalysisResult",
                data: currentAnalysisResult,
                tabId: null // Content script doesn't know its tab ID without help
            }, response => {
                if (chrome.runtime.lastError) console.warn("Error sending storeAnalysis message from content (markSafe):", chrome.runtime.lastError.message);
                else console.log("Content script (markSafe): storeAnalysis message sent, response:", response);
            });

        } else {
            console.error("Could not whitelist: features or hostname missing.");
        }
        });
    }

    const proceedBtn = alertDiv.querySelector('.proceed-btn');
    if (proceedBtn) {
        proceedBtn.addEventListener('click', () => {
        console.log(`User clicked 'Proceed Anyway' for ${currentUrl}`);
        alertDiv.remove();
        });
    }

    const blockBtn = alertDiv.querySelector('.block-btn');
    if (blockBtn) {
        blockBtn.addEventListener('click', () => {
        console.log(`User clicked 'Block Site' for ${currentUrl}. Navigating to about:blank.`);
        window.location.href = 'about:blank';
        });
    }

    const learnMoreBtn = alertDiv.querySelector('.learn-more-btn');
    if (learnMoreBtn) {
        learnMoreBtn.addEventListener('click', () => {
        const learnMoreUrlPath = chrome.runtime.getURL('learn-more.html');
        console.log(`User clicked 'Learn More'. Opening: ${learnMoreUrlPath}`);
        window.open(learnMoreUrlPath, '_blank');
        });
    }
}


async function performAnalysisAndShowAlert(isReanalysis = false) {
    if (window.location && document) {
        if (chrome.storage && chrome.storage.local) {
            const analysisData = await analyzeURL(window.location.href, document, isReanalysis);
            currentAnalysisResult = analysisData; // Cache it
            showAlert(analysisData); // Pass the whole object

            // After analysis, content script can inform the background script to store it with tab ID
            // This requires the background script to query for the active tab's ID.
            // Or popup can request and then tell background to store.
            // Let's simplify: background will handle storage when popup sends data.
            // Or content script sends it directly to background if it knows its tab ID (hard)
            // Let's try sending a message to background to store it.
            // The background will need to figure out the tabId of the sender.
            if (chrome.runtime?.id) {
                 chrome.runtime.sendMessage({ action: "cacheAnalysisResult", data: currentAnalysisResult }, response => {
                    if(chrome.runtime.lastError) 
                        console.warn("Could not send message to background from content.js to cache", chrome.runtime.lastError.message);
                     else 
                        console.log("Content script (markSafe): CACHE message sent, response:", response);                    
                });
            }


        } else {
            console.error("!!! chrome.storage.local is not available. Check permissions in manifest.json. !!!");
        }
    } else {
        console.error("!!! window.location or document not available. !!!");
    }
}

// Initial analysis on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => performAnalysisAndShowAlert());
} else {
    performAnalysisAndShowAlert();
}

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Content.js received message:", message, "from sender:", sender);
    if (message.action === "getStatus") {
        if (currentAnalysisResult) {
            sendResponse(currentAnalysisResult);
        } else {
            // If no analysis result yet, perform one (e.g., if popup opens before DOMContentLoaded)
            // This might be too slow for a direct response, but let's try.
            (async () => {
              if(!currentAnalysisResult || Object.keys(currentAnalysisResult).length ===0){
                console.log("getStatus: No current analysis, performing one now.");
                await performAnalysisAndShowAlert();
            }
          console.log("getStatus: Sending response",currentAnalysisResult);
          sendResponse(currentAnalysisResult);
        })();
            return true; // Indicates an async response
        }
    } else if (message.action === "reanalyzePage") {
        (async () => {
            console.log("Re-analyzing page due to popup request...");
            await performAnalysisAndShowAlert(true); // Pass true for isReanalysis
            //showAlert(currentAnalysisResult); // Ensure alert is updated
            console.log("reanalyzePage: Sending response",currentAnalysisResult);
            sendResponse({status: "analysisRefreshed", ...currentAnalysisResult});
        })();
        return true; // Indicates an async response
    }
});

console.log("--- PrivacyGuard content.js END ---");