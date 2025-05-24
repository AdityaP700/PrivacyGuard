// js/content.js
console.log("--- PrivacyGuard content.js START ---");

function extractFeatures(url, dom) {
  console.log("--- extractFeatures called with URL:", url, "---");
  try {
    const hostname = new URL(url).hostname; // This can fail for invalid URLs
    return {
      isHTTP: url.startsWith('http:'),
      length: url.length,
      hasForms: dom.querySelector('form input[type="password"]') !== null,
      isEdu: hostname.endsWith('.edu')
    };
  } catch (e) {
    console.error("!!! ERROR in extractFeatures:", e, "URL was:", url, "!!!");
    return null; // Return null or a default object if extraction fails
  }
}

function analyzeURL(url, dom) {
  console.log("--- analyzeURL called with URL:", url, "---");
  const features = extractFeatures(url, dom);

  if (!features) {
    console.error("!!! Cannot analyze URL, feature extraction failed. !!!");
    return { score: -1, mode: 'error' }; // Indicate an error state
  }
  console.log("Extracted Features:", features);

  let score = 0;
  if (features.isHTTP) score += 40;
  if (features.length > 50) score += 20;
  if (features.hasForms) score += 30;

  console.log("Score before isEdu check:", score);

  if (features.isEdu) {
    score = Math.max(20, score - 20); // Ensure .edu doesn't go below 20 unless it's 0
    console.log("Score after isEdu check (applied):", score);
  }

  const mode = score > 70 ? 'red' : score >= 30 ? 'yellow' : 'green'; // Changed >30 to >=30 for yellow to include score 30
                                                                     // Corrected your original logic for Yellow to include 30.
                                                                     // Red: >70 (71+)
                                                                     // Yellow: 30-70
                                                                     // Green: <30 (0-29)


  console.log('%cPrivacyGuard: Analysis complete. All processing done locally. No URLs or page content sent externally.', 'color: green; font-weight: bold;');
  console.log(`URL: ${url}, Mode: ${mode}, Score: ${score}`);
  return { score, mode };
}

// We need to ensure the DOM is ready before trying to query it.
// Using document_idle in manifest helps, but DOMContentLoaded is safer.
function initialize() {
    console.log("--- DOMContentLoaded or document_idle triggered, running analysis ---");
    // Remove the test div if it exists from the previous test
    const oldTestDiv = document.getElementById('privacyguard-test-div');
    if (oldTestDiv) oldTestDiv.remove();

    if (window.location && document) {
        analyzeURL(window.location.href, document);
    } else {
        console.error("!!! window.location or document not available. !!!");
    }
}

if (document.readyState === 'loading') {  // Loading hasn't finished yet
    document.addEventListener('DOMContentLoaded', initialize);
} else {  // `DOMContentLoaded` has already fired or `run_at` is `document_idle`
    initialize();
}

console.log("--- PrivacyGuard content.js END ---");