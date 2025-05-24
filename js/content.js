// js/content.js
console.log("--- PrivacyGuard content.js START ---");

const WHITELIST_KEY = 'privacyGuardWhitelist';

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
      hostname: hostname // Store hostname for whitelisting
    };
  } catch (e) {
    console.error("!!! ERROR in extractFeatures:", e, "URL was:", url, "!!!");
    return null;
  }
}

async function analyzeURL(url, dom) { // Made analyzeURL async to await getWhitelist
  // console.log("--- analyzeURL called with URL:", url, "---");
  const features = extractFeatures(url, dom);

  if (!features) {
    console.error("!!! Cannot analyze URL, feature extraction failed. !!!");
    return { score: -1, mode: 'error', features: null };
  }

  // --- Whitelist Check ---
  const whitelist = await getWhitelist();
  if (whitelist.includes(features.hostname)) {
    console.log(`URL: ${url} (${features.hostname}) is in user whitelist.`);
    // Optional: could return a specific 'whitelisted' mode
    // For now, treat as green and give a very low score
    return { score: 0, mode: 'green', features, whitelisted: true };
  }
  // --- End Whitelist Check ---

  // console.log("Extracted Features:", features);

  let score = 0;
  if (features.isHTTP) score += 40;
  if (features.length > 50) score += 20;
  if (features.hasForms) score += 30;

  // console.log("Score before isEdu check:", score);

  if (features.isEdu) {
    score = Math.max(20, score - 20);
    // console.log("Score after isEdu check (applied):", score);
  }

  const mode = score > 70 ? 'red' : score >= 30 ? 'yellow' : 'green';

  console.log('%cPrivacyGuard: Analysis complete. All processing done locally. No URLs or page content sent externally.', 'color: green; font-weight: bold;');
  console.log(`URL: ${url}, Mode: ${mode}, Score: ${score}`);
  return { score, mode, features, whitelisted: false };
}


function showAlert(mode, score, currentUrl, features) { // Added features
  console.log(`--- showAlert called with Mode: ${mode}, Score: ${score}, URL: ${currentUrl} ---`);

  const existingAlert = document.getElementById('privacyguard-alert');
  if (existingAlert) {
    existingAlert.remove();
  }

  // Do not show alert if site was whitelisted and now treated as green implicitly
  // Or if it was green/error from the start.
  if (mode === 'green' || mode === 'error') {
     console.log(`Mode is ${mode}, no alert will be actively shown on page (or site is whitelisted).`);
     // Consider removing this console log if it becomes too noisy for whitelisted sites.
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

  const deleteBtn = alertDiv.querySelector('.delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      alertDiv.remove();
      console.log("Alert removed by user (delete button).");
    });
  }

  const markSafeBtn = alertDiv.querySelector('.mark-safe-btn');
  if (markSafeBtn) {
    markSafeBtn.addEventListener('click', async () => { // Made async
      if (features && features.hostname) {
        console.log(`User clicked 'Mark as Safe (Yellow)' for ${features.hostname}`);
        await addToWhitelist(features.hostname);
        alertDiv.remove(); // Remove alert after action
        // Optional: Force a re-check or UI update, or simply rely on next navigation
        // For a simple immediate effect, you could just hide the alert and maybe show a temporary "Saved!" message.
        // Or reload the page: window.location.reload(); (This will definitely show it as green on reload)
        console.log("Site whitelisted. Reload page to see effect or navigate again.");
        // For immediate demo effect without full reload, you could re-run parts of initialize or just hide.
        // For now, removing the alert is sufficient. Next page load will be green.
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
      const learnMoreUrl = chrome.runtime.getURL('learn-more.html');
      console.log(`User clicked 'Learn More'. Opening: ${learnMoreUrl}`);
      window.open(learnMoreUrl, '_blank');
      // Optional: Remove the alert after clicking learn more, or leave it.
      // alertDiv.remove();
    });
  }
}

async function initialize() { // Made initialize async
    console.log("--- DOMContentLoaded or document_idle triggered, running analysis ---");
    if (window.location && document) {
        // Ensure chrome.storage is available (it should be in content scripts with "storage" permission)
        if (chrome.storage && chrome.storage.local) {
            const analysisResult = await analyzeURL(window.location.href, document); // await the async analyzeURL
            if (analysisResult) {
                showAlert(analysisResult.mode, analysisResult.score, window.location.href, analysisResult.features);
            }
        } else {
            console.error("!!! chrome.storage.local is not available. Check permissions in manifest.json. !!!");
        }
    } else {
        console.error("!!! window.location or document not available. !!!");
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

console.log("--- PrivacyGuard content.js END ---");