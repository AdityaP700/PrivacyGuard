# 🔐 PrivacyGuard – Smarter, Safer Browsing

**PrivacyGuard** is an intelligent browser extension built to shield users from phishing attacks and malicious websites — before they strike. It takes a multi-layered approach to web safety, blending smart heuristics, on-device machine learning, homograph detection, and even a concept of peer-powered threat sharing. It’s fast, private, and built with your safety in mind.

🎥 **\[Demo Video — Add your link here]**
🔗 **\[Live Extension/Submission — Add if applicable]**

---

## 🧠 What Makes PrivacyGuard Special?

### ✅ Multi-Layered Threat Detection

* **Heuristic Analysis**
  Detects suspicious traits like HTTP usage, long or obfuscated URLs, presence of login forms, and other classic red flags.

* **On-Device Machine Learning**
  A lightweight TensorFlow\.js model runs entirely in your browser, using 16 lexical URL features to evaluate risk — keeping your data private while staying vigilant.

* **Advanced Homograph Detection**
  Flags domains using deceptive Unicode characters (like Punycode or mixed scripts) designed to mimic trusted websites.

### 🚦 Intelligent Risk Ratings (Red / Yellow / Green)

* **Red (High Risk):**
  Shows a full-page warning with options to go back or continue (if you dare). Triggered for strong phishing signs or confirmed malicious content.

* **Yellow (Caution):**
  Pops up a subtle alert for sites that seem off — not malicious, but worth a second look. You decide whether to trust or block them.

* **Green (Safe):**
  No interruptions. You can always check the security status in the extension popup.

### ✋ Your Choices Matter

* **Whitelisting Trusted Sites**
  You can mark Yellow-alerted websites as safe. The extension remembers your preferences, so you won’t be nagged again.

* **Conceptual P2P Threat Sharing**
  Users can opt in to share sites they trust or flag as dangerous. It’s a mock system using local browser storage to simulate how a decentralized, community-powered safety net could work.

### 🧭 Clear, Helpful Popup

* See the site's risk level, key contributing factors (e.g., HTTP, homograph, ML flags), and overall score.
* Toggle P2P sharing or re-analyze a page with one click.

### 🔒 Privacy Comes First

* All analysis happens *locally* in your browser — no data is sent to servers.
* P2P sharing only stores hostnames, never full URLs or personal identifiers.
* Your browsing activity stays private.

### ✨ Clean & Minimal UI

* On-page alerts are styled not to interfere with website layouts.
* The popup is lightweight and informative — no clutter.

---

## 🛠️ Built With

* **Languages & Frameworks:** JavaScript (ES6+), HTML, CSS

* **Extension Platform:** Chrome (Manifest V2, built with V3 compatibility in mind)

* **Machine Learning:**

  * **Training:** Python + TensorFlow/Keras

    * Trained on a balanced dataset (\~100k samples) from IEEE DataPort, PhishTank, and Tranco.
    * Uses 16 lexical URL features (e.g., length, symbols, HTTPS presence).
  * **Inference:** Converted to TensorFlow\.js (Graph Model) and runs locally in `content.js`

* **Frontend Styling:** Bulma (for popup), custom scoped CSS for in-page alerts

* **Storage:** `chrome.storage.local` used for whitelists, settings, and mock P2P data

* **Detection Algorithms:**

  * URL feature extraction
  * Homograph/punycode checks
  * Combined score from heuristics and ML model
  * Influence from local “network” data in the P2P mock

---

## 🧪 Try It Out — Quick Setup

1. Clone or download the repo
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer Mode**
4. Click **Load unpacked**, then select the extension folder
5. You’ll see the PrivacyGuard icon in your toolbar — pin it for quick access
6. *(Optional)* To test with local sites like `college.html`:

   * Serve them with Python: `python -m http.server 8000`
   * Visit `http://localhost:8000/your_file.html`

---

## 🎬 Demo Walkthrough

1. **Safe Site (Green):**
   Visit `https://www.google.com` — popup shows it's safe.

2. **Caution Site (Yellow):**
   Try an HTTP site (like your local `college.html`). A corner alert appears with "Caution advised." See detailed reasons in the popup.

3. **Whitelisting:**
   Click "Mark as Safe" on a Yellow site. It won’t show alerts for that domain again. If P2P sharing is on, this info is mock-shared.

4. **Homograph Attack (Red):**
   Visit a site like `http://www.xn--pypal-4ve.com/` (fake PayPal with Cyrillic ‘a’). A full-page warning blocks access.

5. **Phishing Page (Red):**
   Load your `phishing.html` test file. The ML model and heuristics combine to trigger a high-risk warning.

6. **P2P Simulation:**
   Add a domain like `www.example.com` to the phishing list in your console:
   `chrome.storage.local.set({privacyGuardP2PUserPhishing: ['www.example.com']});`
   Now when you visit it, the risk score goes up.

7. **Explainable Alerts:**
   For any suspicious site, open the popup to view a breakdown of factors that contributed to the risk assessment.

---

## 🔭 What's Next?

* **Improved ML Model**
  Train on more diverse datasets and refine detection accuracy.

* **Real P2P Networking**
  Investigate decentralized tech like WebRTC for actual data sharing (after the hackathon).

* **Smarter Checks**
  Detect mismatched logos, check for newly registered domains, and more.

* **Optional Reporting Feature**
  Let users submit unknown phishing sites (with consent).

* **UI/UX Enhancements**
  Expand popup settings, whitelist manager, and improve visuals.

* **Performance Boosts**
  Optimize model inference and detection speed across devices.

---

## ⚠️ Known Limitations

* On-page alerts use basic CSS to avoid breaking layouts. Shadow DOM encapsulation is a potential improvement.
* The P2P feature is currently a simulation using local storage.
* False positives can happen — addressed via manual whitelisting and tuned scoring.

---

> This project was built as part of a hackathon and is a functional prototype. While it’s already powerful, it also lays the groundwork for a privacy-conscious, community-aware browser security assistant.

**Thanks for checking out PrivacyGuard!**
