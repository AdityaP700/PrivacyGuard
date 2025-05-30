// js/content.js

console.log("--- PrivacyGuard content.js (GRAPH MODEL - REFINED) START ---");

const WHITELIST_KEY = "privacyGuardWhitelist";
const LAST_ANALYSIS_KEY_PREFIX = "privacyGuardLastAnalysis_";
let model = null; // Global graph model variable, will be set by initialModelLoadPromise
let initialModelLoadPromise = null; // Promise for the initial model load attempt
const MODEL_PATH = chrome.runtime.getURL("js/tfjs_model/model.json"); // Points to the graph model's JSON
// js/config.js or top of content.js
const GLOBALLY_TRUSTED_DOMAINS = [
    'google.com',             // 1
    'youtube.com',            // 2
    'facebook.com',           // 3
    'wikipedia.org',          // 4
    'instagram.com',          // 5
    'bing.com',               // 6
    'reddit.com',             // 7
    'x.com',                  // 8 (formerly twitter.com)
    'chatgpt.com',            // 9
    'yandex.ru',              // 10
    'whatsapp.com',           // 11
    'amazon.com',             // 12
    'yahoo.com',              // 13
    'yahoo.co.jp',            // 14
    'weather.com',            // 15
    'duckduckgo.com',         // 16
    'tiktok.com',             // 17
    'temu.com',               // 18
    'naver.com',              // 19
    'microsoftonline.com',    // 20
    'twitch.tv',              // 21
    'linkedin.com',           // 23
    'live.com',               // 24
    'fandom.com',             // 25
    'microsoft.com',          // 26
    'msn.com',                // 27
    'netflix.com',            // 28
    'office.com',             // 29
    'pinterest.com',          // 30
    'mail.ru',                // 31
    'openai.com',             // 32
    'aliexpress.com',         // 33
    'paypal.com',             // 34
    'vk.com',                 // 35
    'canva.com',              // 36
    'github.com',             // 37
    'spotify.com',            // 38
    'discord.com',            // 39
    'apple.com',              // 40
    'imdb.com',               // 41
    'globo.com',              // 42
    'roblox.com',             // 43
    'amazon.co.jp',           // 44
    'quora.com',              // 45
    'bilibili.com',           // 46
    'samsung.com',            // 47
    'ebay.com',               // 48
    'nytimes.com',            // 49
    'walmart.com'  ,
    'claude.com'  
             // 50
];

// --- SCALER PARAMETERS ---
const SCALER_MIN_ARRAY = [
  -0.00524476, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -0.00212879,
];
const SCALER_SCALE_ARRAY = [
  4.37062937e-4, 3.98406375e-3, 9.58772771e-4, 4.48430493e-4, 1.72413793e-2,
  1.69491525e-2, 2.27272727e-2, 8.06451613e-3, 1.26582278e-2, 1.13636364e-2,
  3.95256917e-3, 1.07526882e-2, 1.0, 1.0, 1.86567164e-3, 5.32197978e-4,
];
function showToast(message, duration = 3000) {
    let toast = document.createElement("div");
    toast.innerText = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        background-color: #323232;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 10000;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        opacity: 0;
        transition: opacity 0.3s ease-in-out;
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = "1";
    });
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// --- INPUT NODE NAME FOR THE GRAPH MODEL (Verify from saved_model_cli) ---
const INPUT_NODE_NAME = "inputs"; // Default, verify if 'functional_input_layer_final' or similar is shown by CLI
// In config.js (or top of content.js if not refactored yet)
// ... other constants
const P2P_ENABLED_KEY = "privacyGuardP2PEnabled";
const P2P_USER_CONFIRMED_SAFE_KEY = "privacyGuardP2PUserSafe"; // Stores array of hostnames
const P2P_USER_CONFIRMED_PHISHING_KEY = "privacyGuardP2PUserPhishing"; // Stores array of hostnames
async function attemptModelLoadOnce() {
  if (typeof tf === "undefined") {
    console.error("MODEL_LOADER: TensorFlow.js (tf) is not loaded!");
    return null;
  }

  console.log("MODEL_LOADER: Verifying MODEL_PATH:", MODEL_PATH);

  // --- FETCH TEST BLOCK: Checks if model.json is accessible ---
  try {
    const response = await fetch(MODEL_PATH);
    console.log(
      "MODEL_LOADER: Fetch test status:",
      response.status,
      response.statusText
    );
    if (!response.ok) {
      console.error(
        "MODEL_LOADER: Fetch test FAILED. model.json might not be accessible or path is wrong in manifest's web_accessible_resources."
      );
      const responseText = await response.text();
      console.error(
        "MODEL_LOADER: Fetch response text (if any):",
        responseText
      );
    } else {
      console.log(
        "MODEL_LOADER: Fetch test SUCCEEDED. model.json is accessible."
      );
      // Optional:
      // const modelJsonContent = await response.json();
      // console.log("MODEL_LOADER: Fetched model.json content:", modelJsonContent);
    }
  } catch (fetchErr) {
    console.error("MODEL_LOADER: Fetch test threw an error:", fetchErr);
  }

  // --- Attempt to load the model using TensorFlow.js ---
  try {
    console.log(
      "MODEL_LOADER: Attempting to load GRAPH MODEL from:",
      MODEL_PATH
    );

    const loadedModel = await tf.loadGraphModel(MODEL_PATH, { strict: false });
    console.log(
      "MODEL_LOADER: TF.js GRAPH MODEL loaded successfully!",
      loadedModel
    );

    let inputNodeNameForWarmup = INPUT_NODE_NAME;
    if (
      loadedModel &&
      loadedModel.inputs &&
      loadedModel.inputs[0] &&
      loadedModel.inputs[0].name
    ) {
      inputNodeNameForWarmup = loadedModel.inputs[0].name;
      console.log(
        "MODEL_LOADER: Deduced input node name for warmup:",
        inputNodeNameForWarmup
      );
    } else {
      console.warn(
        `MODEL_LOADER: Could not deduce input node name from loaded model for warmup, using default: ${INPUT_NODE_NAME}`
      );
    }

    tf.tidy(() => {
      const warmupInput = tf.zeros([1, 16]); // 16 features
      try {
        const warmupPrediction = loadedModel.execute({
          [inputNodeNameForWarmup]: warmupInput,
        });
        if (warmupPrediction) {
          if (Array.isArray(warmupPrediction))
            warmupPrediction.forEach((t) => t.dispose());
          else warmupPrediction.dispose();
        }
      } catch (warmupErr) {
        console.error(
          "MODEL_LOADER: Error during graph model warmup prediction:",
          warmupErr
        );
      }
      warmupInput.dispose();
    });

    console.log("MODEL_LOADER: Graph Model warmup attempted.");
    return loadedModel;
  } catch (e) {
    console.error(
      "MODEL_LOADER: !!! ERROR loading TF.js GRAPH model !!!",
      "\nError Message:",
      e.message,
      "\nError Stack:",
      e.stack
    );
    return null;
  }
}

// --- Whitelist Helper Functions ---
async function getWhitelist() {
  return new Promise((resolve) => {
    chrome.storage.local.get([WHITELIST_KEY], (result) => {
      resolve(result[WHITELIST_KEY] || []);
    });
  });
}

async function addToWhitelist(hostname) {
  const whitelist = await getWhitelist();
  if (!whitelist.includes(hostname)) {
    whitelist.push(hostname);
    return new Promise((resolve) => {
      chrome.storage.local.set({ [WHITELIST_KEY]: whitelist }, () => {
        console.log(`WHITELIST: ${hostname} added.`);
        resolve();
      });
    });
  } else {
    console.log(`WHITELIST: ${hostname} already present.`);
    return Promise.resolve();
  }
}

// --- Homograph Detection Function ---
function isPotentialHomograph(hostname) {
  if (!hostname) return false;
  if (hostname.startsWith("xn--")) {
    console.log("HOMOGRAPH_CHECK: Punycode domain detected:", hostname);
    return true;
  }
  const latinRegex = /[a-zA-Z]/;
  const cyrillicRegex = /[\u0400-\u04FF]/;
  if (latinRegex.test(hostname) && cyrillicRegex.test(hostname)) {
    console.log(
      "HOMOGRAPH_CHECK: Mixed Latin/Cyrillic scripts in hostname:",
      hostname
    );
    return true;
  }
  const confusables = {
    а: "a",
    е: "e",
    о: "o",
    р: "p",
    с: "c",
    х: "x",
    і: "i",
  };
  for (let char of hostname) {
    if (confusables[char]) {
      console.log(
        `HOMOGRAPH_CHECK: Confusable char '${char}' in hostname:`,
        hostname
      );
      return true;
    }
  }
  return false;
}

// --- Feature Extraction (Heuristics AND for ML Model) ---
function extractAllFeatures(url, dom) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname || "";
    const path = parsedUrl.pathname || "";
    const query = parsedUrl.search || "";

    const heuristicFeatures = {
      isHTTP: url.startsWith("http:"),
      length: url.length,
      hasForms: dom.querySelector('form input[type="password"]') !== null,
      isEdu: hostname.endsWith(".edu"),
      hostname: hostname,
      hasHomograph: isPotentialHomograph(hostname), // Added homograph feature
    };

    const rawMlFeatures = [
      url.length, // 1. length
      hostname.length, // 2. hostname_length
      path.length, // 3. path_length
      query.length, // 4. query_length
      (url.match(/\./g) || []).length, // 5. num_dots
      (url.match(/-/g) || []).length, // 6. num_hyphens
      (url.match(/@/g) || []).length, // 7. num_at
      (url.match(/\?/g) || []).length, // 8. num_question_marks
      (url.match(/=/g) || []).length, // 9. num_equals
      (url.match(/_/g) || []).length, // 10. num_underscore
      (url.match(/%/g) || []).length, // 11. num_percent
      (url.match(/\//g) || []).length, // 12. num_slash
      url.toLowerCase().startsWith("https") ? 1 : 0, // 13. has_https
      /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) ? 1 : 0, // 14. has_ip
      (url.match(/\d/g) || []).length, // 15. num_digits
      (url.match(/[a-zA-Z]/g) || []).length, // 16. num_letters
    ];

    if (rawMlFeatures.length !== 16) {
      console.error(
        `FEATURE_EXTRACTION: Extracted ${rawMlFeatures.length} ML features, expected 16.`
      );
      return { heuristicFeatures, scaledMlFeatures: null };
    }

    const scaledMlFeatures = rawMlFeatures.map((value, index) => {
      if (
        SCALER_MIN_ARRAY &&
        SCALER_SCALE_ARRAY &&
        index < SCALER_MIN_ARRAY.length
      ) {
        let scaled_value =
          (value - SCALER_MIN_ARRAY[index]) / SCALER_SCALE_ARRAY[index];
        return Math.max(0, Math.min(1, scaled_value)); // Clip 0-1
      }
      console.warn(
        `FEATURE_EXTRACTION: Scaler array error at index ${index}. Feature ${value} not scaled.`
      );
      return value;
    });

    return { heuristicFeatures, scaledMlFeatures };
  } catch (e) {
    console.error("!!! ERROR in extractAllFeatures:", e, "URL:", url);
    let hn = "";
    try {
      hn = new URL(url).hostname || "";
    } catch (_) {}
    return {
      heuristicFeatures: {
        hostname: hn,
        isHTTP: url.startsWith("http:"),
        hasHomograph: false,
        length : url.length,
        hasForms: false,
        isEdu: false,
      },
      scaledMlFeatures: null,
    };
  }
  }

let currentAnalysisResult = null;
function hasUUIDPattern(url) {
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    return uuidRegex.test(url);
}

// --- Core Analysis Function ---
async function analyzeURL(url, dom, isReanalysis = false) {
  if (!initialModelLoadPromise) {
    console.error(
      "ANALYZE_URL: initialModelLoadPromise not set! This shouldn't happen."
    );
    // Perform a fallback or basic heuristic if model loading wasn't even initiated
    // This path should ideally never be hit if the initial flow is correct.
    currentAnalysisResult = {
      score: 0,
      mode: "green",
      features: {
        hostname: new URL(url).hostname,
        isHTTP: url.startsWith("http:"),
        hasHomograph: false,
      },
      whitelisted: false,
      url: url,
      modelUsed: false,
      heuristicScore: 0,
      modelScoreRaw: 0,
    };
    return currentAnalysisResult;
  }

  // Wait for the initial model loading attempt to complete if it hasn't already.
  // The global `model` variable will be set (or null) by the time this await resolves.
  await initialModelLoadPromise;

  const extractedData = extractAllFeatures(url, dom);
  if (!extractedData || !extractedData.scaledMlFeatures) {
    console.error(
      "ANALYZE_URL: Feature extraction failed or returned null ML features."
    );
    currentAnalysisResult = {
      score: -1,
      mode: "error",
      features: extractedData ? extractedData.heuristicFeatures : null,
      whitelisted: false,
      url: url,
      modelUsed: false,
      heuristicScore: -1,
      modelScoreRaw: 0,
    };
    return currentAnalysisResult;
  }
  const { heuristicFeatures, scaledMlFeatures } = extractedData;

   for (const trusted of GLOBALLY_TRUSTED_DOMAINS) {
    if (heuristicFeatures.hostname === trusted || heuristicFeatures.hostname.endsWith('.' + trusted)) {
        if (isPotentialHomograph(heuristicFeatures.hostname)) {
            console.log(`ANALYZE_URL: ${heuristicFeatures.hostname} is on global trust list BUT homograph detected! Proceeding with full analysis.`);
            break;
        }
        console.log(`ANALYZE_URL: ${heuristicFeatures.hostname} is on global trust list and no homograph. Marking GREEN.`);
        currentAnalysisResult = {
            score: 0,
            mode: 'green',
            features: heuristicFeatures,
            whitelisted: true,
            url: url,
            modelUsed: false,
            heuristicScore: 0,
            modelScoreRaw: 0
        };
        if (chrome.runtime?.id) {
            chrome.runtime.sendMessage({ action: "cacheAnalysisResult", data: currentAnalysisResult });
        }
        return currentAnalysisResult;
    }
}
  let p2pInfluence = 0; // 0: no influence, positive: riskier, negative: safer
heuristicFeatures.p2pFlag = null; // For popup display

const p2pSettings = await new Promise(resolve => {
    chrome.storage.local.get([P2P_ENABLED_KEY, P2P_USER_CONFIRMED_SAFE_KEY, P2P_USER_CONFIRMED_PHISHING_KEY], result => resolve(result));
});

if (p2pSettings[P2P_ENABLED_KEY]) {
    const p2pSafeList = p2pSettings[P2P_USER_CONFIRMED_SAFE_KEY] || [];
    const p2pPhishingList = p2pSettings[P2P_USER_CONFIRMED_PHISHING_KEY] || [];

    if (p2pPhishingList.includes(heuristicFeatures.hostname)) {
        console.log("ANALYZE_URL: P2P Network reports as PHISHING:", heuristicFeatures.hostname);
        p2pInfluence = 70; // Strong penalty
        heuristicFeatures.p2pFlag = 'p2p_phishing';
    } else if (p2pSafeList.includes(heuristicFeatures.hostname)) {
        console.log("ANALYZE_URL: P2P Network reports as USER SAFE:", heuristicFeatures.hostname);
        p2pInfluence = -30; // Decent trust boost
        heuristicFeatures.p2pFlag = 'p2p_safe';
    }
}
  let heuristicScore = 0;
  if (heuristicFeatures.length > 50) {
    // But don't penalize if it's a chat/session URL pattern
    if (!url.includes('/chat/') && !url.includes('/session/')) {
        heuristicScore += 20;
    }
}
if ((url.match(/-/g) || []).length > 5 && !hasUUIDPattern(url)) {
    // Only penalize for lots of hyphens if it's not a UUID
    heuristicScore += someValue;
}
  if (heuristicFeatures.isHTTP) heuristicScore += 40;
  if (heuristicFeatures.length > 50) heuristicScore += 20;
  if (heuristicFeatures.hasForms) heuristicScore += 30;
  if (heuristicFeatures.isEdu)
    heuristicScore = Math.max(0, heuristicScore - 20);
  if (heuristicFeatures.hasHomograph) {
    // Apply homograph penalty
    console.log("ANALYZE_URL: Homograph detected, adding penalty.");
    heuristicScore += 60;
  }
  heuristicScore += p2pInfluence;
  heuristicScore = Math.max(0, Math.min(150, heuristicScore));
  let modelScoreRaw = 0;
  let modelPredictionSuccessful = false;

  if (model && scaledMlFeatures.length === 16) {
    // Check global 'model'
    try {
      const modelInputTensor = tf.tensor2d([scaledMlFeatures]);
      console.log(
        `ANALYZE_URL: Executing Graph Model with input node: ${INPUT_NODE_NAME}`
      );
      const predictionResult = await model.executeAsync({
        [INPUT_NODE_NAME]: modelInputTensor,
      });

      let outputTensor = predictionResult; // For single tensor output
      if (
        typeof predictionResult === "object" &&
        !(predictionResult instanceof tf.Tensor) &&
        Object.keys(predictionResult).length > 0
      ) {
        const outputKey = Object.keys(predictionResult)[0];
        console.log(
          `ANALYZE_URL: Graph model returned map, using output key: ${outputKey}`
        );
        outputTensor = predictionResult[outputKey];
      } else if (
        Array.isArray(predictionResult) &&
        predictionResult.length > 0 &&
        predictionResult[0] instanceof tf.Tensor
      ) {
        console.log(
          `ANALYZE_URL: Graph model returned array, using first tensor.`
        );
        outputTensor = predictionResult[0];
      }

      if (outputTensor && typeof outputTensor.data === "function") {
        const predictionData = await outputTensor.data();
        let originalModelOutput = predictionData[0];
        modelScoreRaw = originalModelOutput; // Apply the "flip"
        modelPredictionSuccessful = true;
        console.log(
          `ANALYZE_URL: Original Model Output: ${originalModelOutput.toFixed(
            4
          )}, Flipped modelScoreRaw (P(phishing)): ${modelScoreRaw.toFixed(4)}`
        );

        modelInputTensor.dispose();
        if (Array.isArray(predictionResult))
          predictionResult.forEach((t) => {
            if (t instanceof tf.Tensor) t.dispose();
          });
        else if (predictionResult instanceof tf.Tensor)
          predictionResult.dispose();
        else if (typeof predictionResult === "object")
          Object.values(predictionResult).forEach((t) => {
            if (t && t instanceof tf.Tensor) t.dispose();
          });
      } else {
        console.error(
          "ANALYZE_URL: Could not extract valid output tensor from graph model prediction.",
          outputTensor
        );
      }
    } catch (e) {
      console.error(
        "ANALYZE_URL: !!! ERROR during GRAPH model prediction:",
        e.message,
        e.stack
      );
    }
  } else {
    if (!model)
      console.warn("ANALYZE_URL: ML Model not loaded. Using heuristics only.");
    else if (!scaledMlFeatures || scaledMlFeatures.length !== 16)
      console.error("ANALYZE_URL: Incorrect features for ML.");
  }

  let finalScore;
if (modelPredictionSuccessful) {
    const mlScoreScaled = modelScoreRaw * 100;
    if (heuristicScore < 30 && mlScoreScaled > 80) { // Low heuristic, but high ML phishing score
        // Maybe ML is being overly aggressive on a legit but complex site
        console.log("ANALYZE_URL: Low heuristic but high ML score. Reducing ML weight.");
        finalScore = Math.min(50,(heuristicScore*0.8)+(mlScoreScaled*0.2));
    } else if(heuristicScore<10 && mlScoreScaled >70){
        finalScore = (heuristicScore * 0.6) + (mlScoreScaled * 0.4); // Default
    }else {
        finalScore = (heuristicScore * 0.3) + (mlScoreScaled * 0.7);
    }
    console.log(
        `ANALYZE_URL: Combined - H:${heuristicScore}, MLRaw:${modelScoreRaw.toFixed(
          4
        )}, MLScaled:${mlScoreScaled.toFixed(2)} -> Final:${finalScore.toFixed(
          2
        )}`
    );
} else {
    finalScore = heuristicScore;
    console.log(`ANALYZE_URL: Heuristic Only - Score: ${finalScore}`);
}

  finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));
  const mode = finalScore > 70 ? "red" : finalScore >= 30 ? "yellow" : "green";

  console.log(
    "%cANALYZE_URL: Analysis complete.",
    "color: green; font-weight: bold;"
  );
  console.log(
    `ANALYZE_URL: URL: ${url}, Score: ${finalScore}, Mode: ${mode}, MLUsed: ${modelPredictionSuccessful}`
  );

  currentAnalysisResult = {
    score: finalScore,
    mode,
    features: heuristicFeatures,
    whitelisted: false,
    url: url,
    modelUsed: modelPredictionSuccessful,
    heuristicScore,
    modelScoreRaw,
    heuristicScoreCalculated: heuristicScore,
    modelPredictionRaw : modelScoreRaw
};
  if (chrome.runtime?.id) {
    chrome.runtime.sendMessage({
      action: "cacheAnalysisResult",
      data: currentAnalysisResult,
    });
  }
  return currentAnalysisResult;
}

// --- showAlert function ---
function showAlert(analysisData) {
  if (!analysisData || !analysisData.features) {
    // Guard against null analysisData
    console.warn(
      "SHOW_ALERT: analysisData or features missing, cannot show alert."
    );
    return;
  }
  const {
    mode,
    score,
    url: currentUrl,
    features,
    whitelisted,
    modelUsed,
    heuristicScore,
    modelScoreRaw,
  } = analysisData;
  console.log(`SHOW_ALERT: Mode: ${mode}, Score: ${score}, URL: ${currentUrl}`);

  const existingAlert = document.getElementById("privacyguard-alert");
  if (existingAlert) existingAlert.remove();

  if (whitelisted || mode === "green" || mode === "error") {
    console.log(
      `SHOW_ALERT: Mode is ${mode} or site whitelisted. No prominent alert.`
    );
    return;
  }

  const alertDiv = document.createElement("div");
  alertDiv.id = "privacyguard-alert";

  // Load Bulma CSS if not already present
  if (
    !document.querySelector(
      'link[href="https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css"]'
    )
  ) {
    const bulmaLink = document.createElement("link");
    bulmaLink.setAttribute("rel", "stylesheet");
    bulmaLink.setAttribute(
      "href",
      "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css"
    );
    document.head.appendChild(bulmaLink);
    console.log("Bulma CSS link added to head.");
  }

  let alertColorClass = "";
  let alertMessage = "";
  let buttonsHtml = "";

  const learnMoreButton = `<button class="button is-link is-small learn-more-btn">Learn More</button>`;
  const blockButton = `<button class="button is-dark is-small block-btn">Block Site</button>`;
  const proceedButton = `<button class="button is-outlined is-small proceed-btn">Proceed Anyway</button>`;

  if (mode === "yellow") {
    alertColorClass = "is-warning";
    alertMessage =
      "<strong>Caution:</strong> This site may be insecure or has raised potential concerns.";
    if (features.hasHomograph)
      alertMessage +=
        ' <span style="font-size: 0.8em; color: #d63031;">(Homograph detected)</span>';
    if (modelUsed)
      alertMessage += ' <span style="font-size: 0.8em;">(AI Enhanced)</span>';

    const markSafeButton = `<button class="button is-light is-success is-small mark-safe-btn">Mark as Safe</button>`;
    buttonsHtml = `
        <div class="buttons mt-2">
            ${markSafeButton}
            ${proceedButton}
            ${blockButton}
            ${learnMoreButton}
        </div>
        `;
  } else if (mode === "red") {
    alertColorClass = "is-danger";
    alertMessage =
      "<strong>Danger:</strong> Potential Phishing Site or Significant Risk Detected!";
    if (features.hasHomograph)
      alertMessage +=
        ' <span style="font-size: 0.8em; color: #ffffff;">(Homograph attack detected)</span>';
    if (modelUsed)
      alertMessage += ' <span style="font-size: 0.8em;">(AI Enhanced)</span>';

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

  // Create score details for debugging/transparency
  let scoreDetails = `Score: ${score}`;
  if (modelUsed) {
    scoreDetails += ` (H:${heuristicScore}, ML:${(modelScoreRaw * 100).toFixed(
      1
    )})`;
  }

  alertDiv.innerHTML = `
        <div class="pg-notification">
        <button class="delete" style="position: absolute; top: 10px; right: 10px;"></button>
        ${alertMessage}
        <p style="font-size: 0.8em; margin-top: 5px;">${scoreDetails}</p>
        ${buttonsHtml}
        </div>
    `;

  document.body.appendChild(alertDiv);
  console.log(`Alert div for mode '${mode}' appended to body.`);

  // Add event listeners
  const deleteBtn = alertDiv.querySelector(".delete");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      alertDiv.remove();
      console.log("Alert removed by user (delete button).");
    });
  }

  const markSafeBtn = alertDiv.querySelector(".mark-safe-btn");
  if (markSafeBtn) {
    markSafeBtn.addEventListener("click", async () => {
      if (features && features.hostname) {
        console.log(`User clicked 'Mark as Safe' for ${features.hostname}`);
        await addToWhitelist(features.hostname);
        chrome.storage.local.get([P2P_ENABLED_KEY], async (settings) => {
          if (settings[P2P_ENABLED_KEY]) {
            const p2pSafeList = await new Promise((r) =>
              chrome.storage.local.get([P2P_USER_CONFIRMED_SAFE_KEY], (res) =>
                r(res[P2P_USER_CONFIRMED_SAFE_KEY] || [])
              )
            );
            if (!p2pSafeList.includes(features.hostname)) {
              p2pSafeList.push(features.hostname);
              chrome.storage.local.set(
                { [P2P_USER_CONFIRMED_SAFE_KEY]: p2pSafeList },
                () => {
                  console.log(
                    `P2P_CONTRIBUTE: ${features.hostname} added to P2P User Confirmed Safe list.`
                  );
                }
              );
            }
          }
        });
        alertDiv.remove();
    const reportPhishingBtn = alertDiv.querySelector('.report-phishing-btn');
if (reportPhishingBtn) {
    reportPhishingBtn.addEventListener('click', () => {
        chrome.storage.local.get([P2P_ENABLED_KEY], async (settings) => {
            if (settings[P2P_ENABLED_KEY]) {
                if (features && features.hostname) {
                    const p2pPhishingList = await new Promise(r => chrome.storage.local.get([P2P_USER_CONFIRMED_PHISHING_KEY], res => r(res[P2P_USER_CONFIRMED_PHISHING_KEY] || [])));
                    if (!p2pPhishingList.includes(features.hostname)) {
    p2pPhishingList.push(features.hostname);
    chrome.storage.local.set({ [P2P_USER_CONFIRMED_PHISHING_KEY]: p2pPhishingList }, () => {
        console.log(`P2P_CONTRIBUTE: ${features.hostname} reported to P2P Confirmed Phishing list.`);
        showToast("Site reported to P2P network (mock). Thank you!");
    });
} else {
    showToast("Site already reported to P2P network (mock).");
}

                }
           } else {
    showToast("P2P sharing is disabled. Enable it in the popup to report.");
}

        });
    });
}
        // Force re-analysis after whitelisting
        currentAnalysisResult = await analyzeURL(
          window.location.href,
          document,
          true
        );
        showAlert(currentAnalysisResult);

        // Update background script
        chrome.runtime.sendMessage(
          {
            action: "storeAnalysisResult",
            data: currentAnalysisResult,
            tabId: null,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.warn(
                "Error sending storeAnalysis message:",
                chrome.runtime.lastError.message
              );
            } else {
              console.log("Analysis result stored after marking safe");
            }
          }
        );
      } else {
        console.error("Could not whitelist: features or hostname missing.");
      }
    });
  }

  const proceedBtn = alertDiv.querySelector(".proceed-btn");
  if (proceedBtn) {
    proceedBtn.addEventListener("click", () => {
      console.log(`User clicked 'Proceed Anyway' for ${currentUrl}`);
      alertDiv.remove();
    });
  }

  const blockBtn = alertDiv.querySelector(".block-btn");
  if (blockBtn) {
    blockBtn.addEventListener("click", () => {
      console.log(
        `User clicked 'Block Site' for ${currentUrl}. Navigating to about:blank.`
      );
      window.location.href = "about:blank";
    });
  }

  const learnMoreBtn = alertDiv.querySelector(".learn-more-btn");
  if (learnMoreBtn) {
    learnMoreBtn.addEventListener("click", () => {
      const learnMoreUrlPath = chrome.runtime.getURL("learn-more.html");
      console.log(`User clicked 'Learn More'. Opening: ${learnMoreUrlPath}`);
      window.open(learnMoreUrlPath, "_blank");
    });
  }
}

// --- Main Orchestration Function ---
async function performAnalysisAndShowAlert(isReanalysis = false) {
  console.log(`PERFORM_ANALYSIS: Start (Re-analysis: ${isReanalysis})`);
  if (window.location && document) {
    if (chrome.storage && chrome.storage.local) {
      const analysisData = await analyzeURL(
        window.location.href,
        document,
        isReanalysis
      );
      showAlert(analysisData); // Uses global currentAnalysisResult which is set in analyzeURL
    } else {
      console.error("PERFORM_ANALYSIS: chrome.storage.local not available.");
    }
  } else {
    console.error(
      "PERFORM_ANALYSIS: window.location or document not available."
    );
  }
}

// --- Initial Script Execution Flow ---
initialModelLoadPromise = attemptModelLoadOnce()
  .then((loaded) => {
    model = loaded; // Set the global model variable AFTER load attempt
    if (model) {
      console.log("INIT_FLOW: Global 'model' set successfully.");
    } else {
      console.error("INIT_FLOW: Global 'model' IS NULL. Model loading failed.");
    }
    // Proceed with first analysis regardless of model load success (it will fallback)
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () =>
        performAnalysisAndShowAlert(false)
      );
    } else {
      performAnalysisAndShowAlert(false);
    }
    return model;
  })
  .catch((err) => {
    console.error(
      "INIT_FLOW: Critical error during initial model load promise chain:",
      err
    );
    model = null; // Ensure model is null on error
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () =>
        performAnalysisAndShowAlert(false)
      );
    } else {
      performAnalysisAndShowAlert(false);
    }
    return null;
  });

// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("CONTENT_SCRIPT_MESSAGE_LISTENER: Received message:", message);

  // Wrap in try-catch to handle potential errors
  try {
    if (message.action === "getStatus") {
      (async () => {
        try {
          // Ensure initial model load attempt is complete
          await initialModelLoadPromise;

          // Check if we need a new analysis
          if (
            !currentAnalysisResult ||
            currentAnalysisResult.url !== window.location.href
          ) {
            console.log(
              "GET_STATUS: No current/matching analysis, performing one now."
            );
            await performAnalysisAndShowAlert(false);
          }

          console.log("GET_STATUS: Sending response:", currentAnalysisResult);
          // Add a check to ensure we still have a connection
          if (chrome.runtime.lastError) {
            console.error(
              "GET_STATUS: Connection lost:",
              chrome.runtime.lastError
            );
            return;
          }
          sendResponse(currentAnalysisResult);
        } catch (error) {
          console.error("GET_STATUS: Error processing request:", error);
          sendResponse({ error: "Analysis failed", details: error.message });
        }
      })();
      return true;
    }
  } catch (error) {
    console.error("Message listener error:", error);
    sendResponse({ error: "Message handling failed" });
  }
});

console.log("--- PrivacyGuard content.js (GRAPH MODEL - REFINED) END ---");
