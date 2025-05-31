
console.log("--- PrivacyGuard content.js (GRAPH MODEL - REFINED) START ---");

const WHITELIST_KEY = "privacyGuardWhitelist";
const LAST_ANALYSIS_KEY_PREFIX = "privacyGuardLastAnalysis_";
let model = null; 
let initialModelLoadPromise = null; 
const MODEL_PATH = chrome.runtime.getURL("js/tfjs_model/model.json"); 

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
    const labels = hostname.split('.');
    for (const label of labels) {
        if (label.startsWith('xn--')) {
            console.log("HOMOGRAPH_CHECK: Punycode label '" + label + "' detected in hostname:", hostname);
            return true;
        }
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
        console.log("HOSTNAME:", hostname, "IS_HOMOGRAPH:", heuristicFeatures.hasHomograph);

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
        } catch (_) { }
        return {
            heuristicFeatures: {
                hostname: hn,
                isHTTP: url.startsWith("http:"),
                hasHomograph: false,
                length: url.length,
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


    await initialModelLoadPromise;

    const extractedData = extractAllFeatures(url, dom);
    if (!extractedData || !extractedData.scaledMlFeatures) {
    console.error("ANALYZE_URL: Feature extraction failed or returned null ML features.");
    currentAnalysisResult = {
        score: -1, 
        mode: "error", 
        features: extractedData ? extractedData.heuristicFeatures : { hostname: new URL(url).hostname, isHTTP: url.startsWith("http:"), hasHomograph: false, p2pFlag: null, length: url.length, hasForms: false, isEdu: false }, // Provide defaults
        whitelisted: false,
        url: url,
        modelUsed: false,
        heuristicScoreCalculated: -1, // Or 0
        modelPredictionRaw: 0
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
    let p2pInfluence = 0; 
    heuristicFeatures.p2pFlag = null; 

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
        console.log("ANALYZE_URL: Homograph detected, adding penalty.");
        heuristicScore += 60;
    }
    console.log("HEURISTIC SCORE after homograph penalty:", heuristicScore);

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
        if (heuristicScore < 30 && mlScoreScaled > 80) {
            console.log("ANALYZE_URL: Low heuristic but high ML score. Reducing ML weight.");
            finalScore = Math.min(50, (heuristicScore * 0.8) + (mlScoreScaled * 0.2));
        } else if (heuristicScore < 10 && mlScoreScaled > 70) {
            finalScore = (heuristicScore * 0.6) + (mlScoreScaled * 0.4); // Default
        } else {
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
        modelPredictionRaw: modelScoreRaw
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
        console.warn("SHOW_ALERT: analysisData or features missing, cannot show alert.");
        return;
    }
    const {
        mode, score, url: currentUrl, features, whitelisted,
        modelUsed, 
        heuristicScoreCalculated, 
        modelPredictionRaw     
    } = analysisData;

    // Use consistent names from currentAnalysisResult for score breakdown
    const displayHeuristicScore = analysisData.heuristicScoreCalculated !== undefined ? analysisData.heuristicScoreCalculated : (analysisData.heuristicScore || 0);
    const displayModelScoreRaw = analysisData.modelPredictionRaw !== undefined ? analysisData.modelPredictionRaw : (analysisData.modelScoreRaw || 0);


    console.log(`SHOW_ALERT: Mode: ${mode}, Score: ${score}, URL: ${currentUrl}`);

    const existingAlertContainerID = 'privacyguard-onpage-alert-container'; 
    const existingAlertContainer = document.getElementById(existingAlertContainerID);
    if (existingAlertContainer) existingAlertContainer.remove();

    if (whitelisted || mode === 'green' || mode === 'error') {
        console.log(`SHOW_ALERT: Mode is ${mode} or site whitelisted. No prominent on-page alert.`);
        return;
    }

    const alertContainer = document.createElement('div');
    alertContainer.id = existingAlertContainerID;
    alertContainer.style.fontFamily = 'Arial, Helvetica, sans-serif';
    alertContainer.style.fontSize = '14px';
    alertContainer.style.lineHeight = '1.5';

let alertMessage = "";
    let scoreDetails = `Score: ${score}`;
    if (modelUsed) {
        scoreDetails += ` (H:${heuristicScoreCalculated}, ML:${(modelPredictionRaw * 100).toFixed(0)})`;
    }
  
    const btnBaseStyle = `padding: 8px 12px; font-size: 13px; border-radius: 4px; border: 1px solid transparent; cursor:pointer; margin-right: 6px; transition: opacity 0.2s;`;
    const btnHoverEffect = ` onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'" `;


    if (mode === 'red') {
        console.log("SHOW_ALERT: Displaying MINIMAL RED interstitial.");
        alertContainer.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background-color: rgba(176, 0, 32, 0.92); /* Darker red overlay */
            color: white; z-index: 2147483647; display: flex;
            justify-content: center; align-items: center; text-align: center; padding: 20px;
            font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5;
        `;

        let reason = "This page exhibits strong characteristics of a phishing attempt.";
        if (features.hasHomograph) reason = "Deceptive URL (Homograph Attack) detected!";
        else if (modelUsed && displayModelScoreRaw > 0.9) reason = "Our AI model has identified this site as highly suspicious.";

        const goBackBtnRedStyle = `${btnBaseStyle} background-color: #0d6efd; color: white; border-color:#0d6efd;`;
        const proceedBtnRedStyle = `${btnBaseStyle} background-color: #6c757d; color: white; border-color:#6c757d;`;
        const reportPhishingButtonRed = `<button id="pg-red-report" style="${btnBaseStyle} background-color: #dc3545; color:white; margin-top:10px;" ${btnHoverEffect}>Report Phishing (P2P)</button>`;


        alertContainer.innerHTML = `
            <div style="background-color: #ffffff; color: #212529; padding: 30px 40px; border-radius: 8px; box-shadow: 0 8px 25px rgba(0,0,0,0.35); max-width: 580px; border-top: 5px solid #dc3545;">
                <h1 style="font-size: 26px; color: #dc3545; margin-bottom: 15px; font-weight: bold;">🚨 DANGER! Suspicious Page Detected</h1>
                <p style="font-size: 17px; margin-bottom: 10px;">PrivacyGuard has identified a **SIGNIFICANT RISK**.</p>
                <p style="font-size: 15px; margin-bottom: 20px;"><strong>Primary Concern:</strong> ${reason}</p>
                <p style="font-size: 13px; color: #495057; margin-bottom: 25px;">${scoreDetails}</p>
                <p style="font-size: 15px; margin-bottom: 30px;">It is **strongly advised** to close this page or go back.</p>
                <div style="display: flex; justify-content: space-around; gap: 15px;">
                    <button id="pg-red-goback" style="${goBackBtnRedStyle}" ${btnHoverEffect}>Go Back (Recommended)</button>
                    <button id="pg-red-proceed" style="${proceedBtnRedStyle}" ${btnHoverEffect}>Proceed Anyway (Risky)</button>
                </div>
                ${'' /* Removed Report Phishing button for now, can be added back if logic is ready */}
                 <div style="margin-top: 25px;">
                    <a id="pg-red-learnmore" href="#" style="color: #0d6efd; font-size: 13px; text-decoration: underline;">Learn more about this type of warning</a>
                </div>
            </div>
        `;
        document.body.appendChild(alertContainer);

        document.getElementById('pg-red-goback').addEventListener('click', () => { window.history.back(); alertContainer.remove(); });
        document.getElementById('pg-red-proceed').addEventListener('click', () => alertContainer.remove());
        document.getElementById('pg-red-learnmore').addEventListener('click', (e) => { e.preventDefault(); window.open(chrome.runtime.getURL('learn-more.html'), '_blank'); });

    } else if (mode === 'yellow') {
        console.log("SHOW_ALERT: Displaying MINIMAL YELLOW corner notification.");
        alertContainer.id = 'privacyguard-yellow-alert'; 
        alertContainer.style.cssText = `
            position: fixed; top: 20px; right: 20px; width: 370px;
            background-color: #fff3cd; color: #664d03; 
            padding: 1rem; padding-top: 2.5rem; /* More top padding for delete button */
            border-radius: 0.375rem; border: 1px solid #ffecb5;
            z-index: 2147483646; box-shadow: 0 0.25rem 0.75rem rgba(0,0,0,0.1);
            font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.5;
            position: relative; /* For absolute positioning of delete button */
        `;

        alertMessage = "<strong>Caution:</strong> Potential concerns detected.";
        if (features.hasHomograph) alertMessage += ' <span style="font-weight:bold; color: #856404;">(Homograph)</span>';
        if (modelUsed) alertMessage += ' <span style="font-style:italic; font-size:0.9em;">(AI Enhanced)</span>';
        
        // Define button styles for Yellow alert
        const btnMarkSafeStyle = `${btnBaseStyle} background-color: #198754; color:white; border-color:#198754;`;
        const btnProceedStyle  = `${btnBaseStyle} background-color: #e9ecef; border-color: #ced4da; color:#495057;`;
        const btnBlockStyle    = `${btnBaseStyle} background-color: #212529; color:white; border-color:#212529;`;
        const btnLearnMoreStyle= `${btnBaseStyle} background-color: #0d6efd; color:white; border-color:#0d6efd;`;
        const deleteBtnHTML    = `<button class="pg-delete-btn" style="position: absolute; top: 8px; right: 8px; background: transparent; border: none; font-size: 1.5rem; line-height: 1; cursor: pointer; color: #6c757d; padding:0 0.25rem; opacity:0.7;" ${btnHoverEffect}>×</button>`;

        const markSafeButtonHTML = `<button class="pg-mark-safe-btn" style="${btnMarkSafeStyle}" ${btnHoverEffect}>Mark Safe</button>`;
        const proceedButtonHTML = `<button class="pg-proceed-btn" style="${btnProceedStyle}" ${btnHoverEffect}>Proceed</button>`;
        const blockButtonHTML = `<button class="pg-block-btn" style="${btnBlockStyle}" ${btnHoverEffect}>Block</button>`;
        const learnMoreBtnHTMLCode = `<button class="pg-learn-more-btn" style="${btnLearnMoreStyle}" ${btnHoverEffect}>Info</button>`;
        
        alertContainer.innerHTML = `
            ${deleteBtnHTML}
            <div style="margin-bottom: 0.5rem;"><span style="font-weight:500;">${alertMessage}</span></div>
            <p style="font-size: 0.8rem; margin-top: 0.25rem; margin-bottom: 0.75rem;">${scoreDetails}</p>
            <div style="text-align:left;">${markSafeButtonHTML}${proceedButtonHTML}${blockButtonHTML}${learnMoreBtnHTMLCode}</div>
        `;
        document.body.appendChild(alertContainer);

        // Add event listeners using the pg- prefixed classes
        alertContainer.querySelector('.pg-delete-btn')?.addEventListener('click', () => alertContainer.remove());
        alertContainer.querySelector('.pg-mark-safe-btn')?.addEventListener('click', async () => {
            if (features && features.hostname) {
                console.log(`YELLOW_ALERT: User clicked 'Mark as Safe' for ${features.hostname}`);
                await addToWhitelist(features.hostname);
                // P2P Safe List Contribution
                chrome.storage.local.get([P2P_ENABLED_KEY], async (settings) => {
                    if (settings[P2P_ENABLED_KEY]) {
                        const p2pSafeList = await new Promise(r => chrome.storage.local.get([P2P_USER_CONFIRMED_SAFE_KEY], res => r(res[P2P_USER_CONFIRMED_SAFE_KEY] || [])));
                        if (!p2pSafeList.includes(features.hostname)) {
                            p2pSafeList.push(features.hostname);
                            chrome.storage.local.set({[P2P_USER_CONFIRMED_SAFE_KEY]: p2pSafeList}, () => {
                                console.log(`P2P_CONTRIBUTE: ${features.hostname} added to P2P User Confirmed Safe list.`);
                            });
                        }
                    }
                });
                alertContainer.remove();
                const reanalysisData = await analyzeURL(window.location.href, document, true); 
                showAlert(reanalysisData); 
                if (chrome.runtime?.id) { chrome.runtime.sendMessage({ action: "storeAnalysisResult", data: reanalysisData, tabId: null });}
            }
        });
        alertContainer.querySelector('.pg-proceed-btn')?.addEventListener('click', () => alertContainer.remove());
        alertContainer.querySelector('.pg-block-btn')?.addEventListener('click', () => { window.location.href = 'about:blank'; });
        alertContainer.querySelector('.pg-learn-more-btn')?.addEventListener('click', () => window.open(chrome.runtime.getURL('learn-more.html'), '_blank'));
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
            showAlert(analysisData); 
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
        model = loaded; 
        if (model) {
            console.log("INIT_FLOW: Global 'model' set successfully.");
        } else {
            console.error("INIT_FLOW: Global 'model' IS NULL. Model loading failed.");
        }
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
    try {
        if (message.action === "getStatus") {
            (async () => {
                try {
                    await initialModelLoadPromise; 
                    
                    if (!currentAnalysisResult || currentAnalysisResult.url !== window.location.href) {
                        console.log("GET_STATUS: No current/matching analysis for this specific URL. Performing a new one.");
                        // This performAnalysisAndShowAlert will set currentAnalysisResult
                        await performAnalysisAndShowAlert(false); 
                    }
                    
                    if (currentAnalysisResult && currentAnalysisResult.url === window.location.href) {
                        console.log("GET_STATUS: Sending current valid analysis:", currentAnalysisResult);
                        sendResponse(currentAnalysisResult);
                    } else {
                        // This case should be rare if performAnalysisAndShowAlert ran above,
                       
                        console.warn("GET_STATUS: Analysis result not available or mismatched after attempt. Sending 'pending'.");
                        sendResponse({ mode: 'N/A', message: 'Analysis pending or failed for this tab.', score: null, features: {}, whitelisted: false, url: window.location.href });
                    }
                } catch (error) { 
                    console.error("GET_STATUS: Error processing request:", error);
                    sendResponse({ error: "Analysis failed", details: error.message });
                }
            })();
            return true; 
        } else if (message.action === "reanalyzePage") {
            (async () => {
                try {
                    await initialModelLoadPromise; 
                    await performAnalysisAndShowAlert(true); 
                } catch (error) { 
                    console.error("REANALYZE_PAGE: Error processing request:", error);
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
