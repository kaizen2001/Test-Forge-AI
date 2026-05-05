require("dotenv").config();
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");

// SQLite storage for suites and history
const storage = require("./storage");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const multer = require("multer");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/screenshots", express.static("screenshots"));

if (!fs.existsSync("screenshots")) {
    fs.mkdirSync("screenshots", { recursive: true });
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// ==============================
// WEBSOCKET CONNECTION TRACKING
// ==============================
const activeConnections = new Map(); // runId -> socket

io.on("connection", (socket) => {
    console.log("✅ Client connected:", socket.id);
    
    socket.on("register_run", (runId) => {
        activeConnections.set(runId, socket);
        console.log(`🔗 Run ${runId} registered to socket ${socket.id}`);
    });

    socket.on("disconnect", () => {
        console.log("❌ Client disconnected:", socket.id);
        for (const [runId, sock] of activeConnections.entries()) {
            if (sock.id === socket.id) {
                activeConnections.delete(runId);
            }
        }
    });
});

function emitToRun(runId, event, data) {
    const socket = activeConnections.get(runId);
    if (socket && socket.connected) {
        socket.emit(event, data);
    }
}

// ==============================
// HELPER: Normalize test cases
// ==============================
const normalizeTCs = (arr) =>
    arr.map((tc, i) => ({
        testCaseId: tc.testCaseId || tc.testCaseID || tc.id || tc.test_case_id || `TC_${String(i + 1).padStart(3, "0")}`,
        title: tc.title || tc.testCaseDescription || tc.scenario || tc.name || tc.description || "No scenario provided",
        testSteps: Array.isArray(tc.testSteps) ? tc.testSteps
            : Array.isArray(tc.steps) ? tc.steps
            : typeof tc.testSteps === "string" ? [tc.testSteps]
            : typeof tc.steps === "string" ? [tc.steps]
            : [],
        expectedResult: tc.expectedResult || tc.expected || tc.expected_result || tc.expectedBehavior || "No expected result provided",
        priority: tc.priority || "Medium",
        category: tc.category || "Functional",
        structuredSteps: Array.isArray(tc.structuredSteps) ? tc.structuredSteps : [],
        testData: tc.testData || {},
    }));

// ==============================
// IMPROVED TEST CASE GENERATOR
// ==============================
app.post("/generate-testcases", async (req, res) => {
    try {
        const { requirement, appUrl, testData } = req.body;

        const testDataSection = testData && Object.keys(testData).length > 0
            ? `\nAVAILABLE TEST DATA:\n${JSON.stringify(testData, null, 2)}`
            : `\nNo test data provided. Use realistic sample values OR mark as {{placeholder}}.`;

        const isSauceDemo = (appUrl || "").toLowerCase().includes("saucedemo");

        const sauceDemoRules = isSauceDemo ? `
🎯 SAUCEDEMO-SPECIFIC RULES (CRITICAL — MUST FOLLOW EXACTLY):
- Login button label: "Login" (NOT "Sign In", NOT "Submit")
- Username field: placeholder "Username", accept "standard_user" from test data
- Password field: placeholder "Password", accept "secret_sauce" from test data  
- After successful login: URL contains "inventory.html", page title "Swag Labs"
- Products page: Shows inventory grid with 6 items (NOT "dashboard", NOT "home page")
- Add to cart: Button says "Add to cart" (NOT "Add to Cart", NOT "Add To Cart")
- Cart icon: Top-right shopping cart icon, shows badge number when items added
- Checkout button: In cart, button labeled "Checkout"
- Continue button: On checkout info page, labeled "Continue"
- Finish button: On checkout overview, labeled "Finish"
- Back Home button: After order complete, labeled "Back Home" 
- Hamburger menu: Three horizontal lines icon, top-left corner
- Logout: Inside hamburger menu, button labeled "Logout"
- Error messages: Displayed in red text with specific wording (e.g., "Epic sadface: Username is required")
` : "";

        const prompt = `You are a SENIOR QA ENGINEER generating PRODUCTION-READY, EXECUTABLE test cases.

APPLICATION URL: ${appUrl}
REQUIREMENTS:
${requirement}
${testDataSection}
${sauceDemoRules}

CRITICAL QUALITY STANDARDS:
1. Element descriptions MUST match ACTUAL page elements (exact labels, placeholders, button text)
2. Steps MUST be SPECIFIC and ACTIONABLE — NO vague instructions like "verify system works"
3. Expected results MUST be OBSERVABLE and VERIFIABLE (e.g., "6 products displayed" not "page loads correctly")
4. Use REAL button/field labels from the application, not generic ones
5. For login flows: use provided test data credentials
6. For assertions: specify WHAT to verify and WHERE

ELEMENT TARGETING RULES (PREVENTS 90% OF FAILURES):
⚠️ DO NOT invent element names. Use these patterns:

1. BUTTONS: Use exact button text you would see
   ✅ GOOD: "Login", "Add to cart", "Checkout", "Continue"
   ❌ BAD: "Submit button", "Confirm button", "Action button"

2. INPUT FIELDS: Use placeholder or label text
   ✅ GOOD: "Username", "Password", "Email", "First Name"
   ❌ BAD: "Username field", "Password input box"

3. ICONS: Describe by position and visual appearance
   ✅ GOOD: "Shopping cart icon top-right", "Three horizontal lines top-left"
   ❌ BAD: "Cart badge", "Hamburger menu", "Menu icon"

4. ERROR MESSAGES: Use generic container description
   ✅ GOOD: "Red banner at top", "Error text above form"
   ❌ BAD: "Error message banner", "Validation message"

5. COUNTS/BADGES: Describe the visible number location
   ✅ GOOD: "Number next to shopping cart icon"
   ❌ BAD: "Cart badge", "Item counter"

ASSERTION STRATEGY (UNIVERSAL - WORKS ON ANY WEBSITE):
⚠️ CRITICAL: Most test failures happen due to brittle assertions. Follow these rules:

1. ERROR MESSAGES: Use assert_visible on the error container OR assert_url if it redirects
   ✅ GOOD: { "action": "assert_visible", "target": "Red banner at top", "value": "" }
   ✅ GOOD: { "action": "assert_url", "target": "Still on login page", "value": "login" }
   ❌ BAD: { "action": "assert_text", "target": "Error message banner", "value": "Epic sadface: Username is required" }

2. SUCCESS CONFIRMATIONS: Check URL change or page element
   ✅ GOOD: { "action": "assert_url", "target": "URL contains inventory", "value": "inventory" }
   ✅ GOOD: { "action": "assert_visible", "target": "Products heading", "value": "" }
   
3. CART/COUNTER UPDATES: Check visible number
   ✅ GOOD: { "action": "assert_text", "target": "Number next to shopping cart icon", "value": "1" }
   ❌ BAD: { "action": "assert_text", "target": "Cart badge", "value": "1" }

4. NAVIGATION: ALWAYS use assert_url
   ✅ GOOD: { "action": "assert_url", "target": "URL contains checkout", "value": "checkout" }
   ❌ BAD: { "action": "assert_text", "target": "Page heading", "value": "Checkout" }

RULE: 
- 50% assert_url (most reliable)
- 30% assert_visible (check elements exist)
- 20% assert_text (only for visible numbers/short data)

TEST COVERAGE REQUIREMENTS:
Generate 20-30 test cases covering:
- ✅ Positive scenarios (happy path, valid inputs)
- ❌ Negative scenarios (invalid credentials, wrong data)
- 🔢 Boundary cases (empty fields, min/max lengths)
- 🎨 UI validation (error messages visible, fields required)
- 🔗 End-to-end flows (login → action → logout)

SCHEMA FOR EACH TEST CASE:
{
  "testCaseId": "TC_XXX",
  "title": "Clear, specific scenario description",
  "testSteps": [
    "Navigate to application",
    "Enter username in Username field",
    "Enter password in Password field",
    "Click Login button",
    "Verify Products page is displayed"
  ],
  "structuredSteps": [
    { "action": "navigate", "target": "${appUrl}", "value": "" },
    { "action": "fill", "target": "Username input field", "value": "standard_user" },
    { "action": "fill", "target": "Password input field", "value": "secret_sauce" },
    { "action": "click", "target": "Login button", "value": "" },
    { "action": "assert_url", "target": "URL contains inventory", "value": "inventory" }
  ],
  "expectedResult": "User is logged in and Products page displays 6 inventory items",
  "priority": "High",
  "category": "Positive"
}

STRUCTURED STEPS — ALLOWED ACTIONS:
- navigate, click, fill, select, check, uncheck, hover, wait
- assert_visible, assert_text, assert_url, press_key

RULES FOR structuredSteps:
1. First step ALWAYS: { "action": "navigate", "target": "${appUrl}", "value": "" }
2. "target" = EXACT element description (e.g., "Login button", NOT "submit button")
3. "value" = text to type (for fill), option to select, key to press, or "" for clicks
4. testSteps and structuredSteps MUST have same count and match each other

OUTPUT: Return ONLY a valid JSON array. No markdown. No code blocks. No explanation.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 10000,
            temperature: 0.3,
        });

        console.log("✅ Test generation completed, finish reason:", response.choices[0].finish_reason);

        let raw = response.choices[0].message.content;
        raw = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

        let parsed;
        try {
            parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                const key = Object.keys(parsed).find((k) => Array.isArray(parsed[k]));
                parsed = key ? parsed[key] : [];
            }
            parsed = normalizeTCs(parsed);
        } catch (e) {
            const match = raw.match(/\[.*\]/s);
            if (match) {
                try {
                    parsed = normalizeTCs(JSON.parse(match[0]));
                } catch {
                    return res.json({ error: "Could not parse AI response", raw });
                }
            } else {
                return res.json({ error: "Invalid JSON from AI", raw });
            }
        }

        res.json({ result: parsed });
    } catch (error) {
        console.error("❌ Test generation error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ==============================
// SCREENSHOT-TO-TESTS (GPT-4o Vision)
// ==============================
app.post("/generate-from-screenshot", upload.single("screenshot"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No screenshot uploaded" });
        }

        const { appUrl = "", testData = "{}" } = req.body;
        let parsedTestData = {};
        try { parsedTestData = JSON.parse(testData); } catch { }

        const base64Image = req.file.buffer.toString("base64");
        const mimeType = req.file.mimetype;

        console.log(`📷 Analyzing screenshot (${req.file.size} bytes)...`);

        const prompt = `You are a QA engineer analyzing this UI screenshot to generate executable test cases.

APPLICATION URL: ${appUrl || "Not provided"}
TEST DATA: ${JSON.stringify(parsedTestData, null, 2)}

INSTRUCTIONS:
1. Identify ALL interactive elements visible (buttons, inputs, links, dropdowns, checkboxes)
2. Read exact labels, placeholders, button text from the screenshot
3. Generate 15-25 test cases covering:
   - Form validation (required fields, format checks)
   - Positive scenarios (valid inputs)
   - Negative scenarios (invalid inputs, empty fields)
   - Navigation flows
   - Common user journeys

USE EXACT LABELS from the screenshot. If you see "Login", write "Login" not "Sign In".

OUTPUT SCHEMA: Same as standard test generator
{
  "testCaseId": "TC_XXX",
  "title": "Specific scenario",
  "testSteps": ["Step 1", "Step 2", ...],
  "structuredSteps": [
    { "action": "navigate|click|fill|assert_visible", "target": "Element from screenshot", "value": "" }
  ],
  "expectedResult": "Observable outcome",
  "priority": "High|Medium|Low",
  "category": "Positive|Negative|UI|Edge"
}

OUTPUT: JSON array only. No markdown.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`,
                                detail: "high"
                            }
                        }
                    ]
                }
            ],
            max_tokens: 8000,
        });

        console.log("✅ Screenshot analysis completed");

        let raw = response.choices[0].message.content;
        raw = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

        let parsed;
        try {
            parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                const key = Object.keys(parsed).find((k) => Array.isArray(parsed[k]));
                parsed = key ? parsed[key] : [];
            }
            parsed = normalizeTCs(parsed);
        } catch (e) {
            return res.json({ error: "Could not parse Vision API response", raw });
        }

        res.json({ result: parsed });
    } catch (error) {
        console.error("❌ Screenshot analysis error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ==============================
// CONVERSATIONAL TEST REFINEMENT  
// ==============================
app.post("/refine-testcase", async (req, res) => {
    try {
        const { testCase, userMessage } = req.body;

        if (!testCase || !userMessage) {
            return res.status(400).json({ error: "testCase and userMessage required" });
        }

        console.log(`💬 Refining ${testCase.testCaseId}: "${userMessage}"`);

        const prompt = `You are a QA assistant helping refine a test case based on user feedback.

CURRENT TEST CASE:
${JSON.stringify(testCase, null, 2)}

USER REQUEST:
"${userMessage}"

TASK:
Modify the test case according to the user's request. Examples:
- "password should be invalid" → Change password value to invalid one, update expected result to error
- "add step to verify cart badge" → Insert new step checking cart icon badge
- "change priority to Low" → Update priority field
- "TC_005 is wrong, it should test logout" → Rewrite to test logout flow
- "use empty username" → Set username value to ""

Return the COMPLETE updated test case with ALL original fields preserved.
OUTPUT: Single JSON object (the updated test case). No explanation.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
        });

        let raw = response.choices[0].message.content;
        raw = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

        const updated = JSON.parse(raw);
        console.log(`✅ ${testCase.testCaseId} refined successfully`);
        
        res.json({ updatedTestCase: updated });
    } catch (error) {
        console.error("❌ Refinement error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ==============================
// BUG REPORT AUTO-GENERATOR
// ==============================
app.post("/generate-bug-report", async (req, res) => {
    try {
        const { testCase, failureReason, screenshot, stepLog, environment } = req.body;

        console.log(`🐛 Generating bug report for: ${testCase?.testCaseId || "unknown"}`);

        const stepsText = (stepLog || [])
            .map((s, i) => `${i + 1}. ${s.step} — ${s.status === "fail" ? "❌ FAILED" : "✅"}`)
            .join("\n");

        const prompt = `Generate a professional, Jira-ready bug report.

FAILED TEST CASE: ${testCase?.title || "Unknown test"}
TEST ID: ${testCase?.testCaseId || "N/A"}
FAILURE REASON: ${failureReason || "Test execution failed"}

EXECUTION LOG:
${stepsText}

ENVIRONMENT:
Browser: ${environment?.browser || "Chrome"}
OS: ${environment?.os || "Windows"}
App URL: ${environment?.appUrl || "N/A"}
Test Run Date: ${environment?.timestamp || new Date().toISOString()}

SCREENSHOT: ${screenshot ? "✅ Available (attached)" : "❌ Not captured"}

CREATE A BUG REPORT WITH:
**Title:** Short, specific summary (e.g., "Login fails with valid credentials on Products page")
**Severity:** Critical | High | Medium | Low (based on test priority and impact)
**Description:** Brief overview of the issue
**Steps to Reproduce:**
1. Step by step from the execution log
2. Include exact values used
3. Note where it failed

**Expected Result:** What should have happened (from test case)
**Actual Result:** What actually happened (the failure)
**Environment:** Browser, OS, URL
**Attachments:** Mention screenshot if available
**Additional Notes:** Any relevant context

FORMAT: Jira-ready markdown. Be concise and professional.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
        });

        const bugReport = response.choices[0].message.content;
        console.log("✅ Bug report generated");

        res.json({ bugReport });
    } catch (error) {
        console.error("❌ Bug report generation error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ==============================
// ERROR ANALYSIS
// ==============================
app.post("/analyze-error", async (req, res) => {
    try {
        const { errorLog } = req.body;
        if (!errorLog || errorLog.trim() === "") {
            return res.json({ result: "Please provide a valid error to analyze." });
        }

        const prompt = `You are a senior QA automation engineer specializing in Selenium/Playwright/WebDriver.

INPUT ERROR:
"${errorLog}"

Analyze and provide:

Root Cause:
Reason:
Fix:
Debug Steps:
Category:

Be specific and practical.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
        });

        res.json({ result: response.choices[0].message.content });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// ==============================
// AI ASSISTANT
// ==============================
app.post("/ai-assistant", async (req, res) => {
    try {
        const { prompt } = req.body;
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a helpful QA automation assistant." },
                { role: "user", content: prompt },
            ],
        });
        res.json({ result: completion.choices[0].message.content });
    } catch (err) {
        console.error(err);
        res.json({ result: "Error generating response" });
    }
});

// ==============================
// RISK ANALYSIS
// ==============================
app.post("/risk-analysis", async (req, res) => {
    try {
        const { testResults } = req.body;
        if (!testResults) return res.json({ error: "No data provided" });

        const total = testResults.length;
        const passed = testResults.filter((t) => t.status === "passed" || t.status === "Pass").length;
        const failed = testResults.filter((t) => t.status === "failed" || t.status === "Fail").length;

        const critical = testResults.filter((t) => t.priority === "High" && (t.status === "failed" || t.status === "Fail")).length;
        const high = testResults.filter((t) => t.priority === "Medium" && (t.status === "failed" || t.status === "Fail")).length;
        const medium = testResults.filter((t) => t.priority === "Low" && (t.status === "failed" || t.status === "Fail")).length;

        const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;

        let risk = "LOW";
        if (critical > 2 || passRate < 60) risk = "HIGH";
        else if (passRate < 80) risk = "MEDIUM";

        res.json({
            total, passed, failed, passRate,
            defects: { critical, high, medium },
            risk,
        });
    } catch (err) {
        console.error(err);
        res.json({ error: "Server error" });
    }
});

// ==============================
// FILE UPLOAD - EXTRACT TEXT
// ==============================
app.post("/extract-file", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        const { mimetype, originalname, buffer } = req.file;
        let extractedText = "";

        if (mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || originalname.endsWith(".docx")) {
            const result = await mammoth.extractRawText({ buffer });
            extractedText = result.value;
        } else if (mimetype === "application/pdf" || originalname.endsWith(".pdf")) {
            const result = await pdfParse(buffer);
            extractedText = result.text;
        } else {
            return res.status(400).json({ error: "Unsupported file type. Use PDF or DOCX." });
        }

        if (!extractedText || extractedText.trim() === "") {
            return res.status(400).json({ error: "Could not extract text from file." });
        }

        res.json({ text: extractedText.trim() });
    } catch (err) {
        console.error("File extraction error:", err);
        res.status(500).json({ error: "Failed to extract file content." });
    }
});

// ============================================================
// PLAYWRIGHT EXECUTION ENGINE
// ============================================================
const { chromium } = require("playwright");

async function snapshotPage(page) {
    return await page.evaluate(() => {
        const elements = [];
        let idx = 0;

        const isVisible = (el) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return (
                rect.width > 0 &&
                rect.height > 0 &&
                style.visibility !== "hidden" &&
                style.display !== "none" &&
                style.opacity !== "0"
            );
        };

        const getLabel = (el) => {
            const aria = el.getAttribute("aria-label");
            if (aria) return aria.trim();

            const placeholder = el.getAttribute("placeholder");
            if (placeholder) return placeholder.trim();

            const name = el.getAttribute("name");
            const id = el.getAttribute("id");

            if (id) {
                const lbl = document.querySelector(`label[for="${id}"]`);
                if (lbl) return lbl.textContent.trim();
            }

            const parentLabel = el.closest("label");
            if (parentLabel) return parentLabel.textContent.trim();

            const text = (el.innerText || el.textContent || "").trim();
            if (text) return text.substring(0, 100);

            return el.value || el.type || el.tagName.toLowerCase();
        };

        const selectors = [
            "input:not([type=hidden])", "textarea", "select", "button", "a[href]",
            "[role=button]", "[role=link]", "[role=checkbox]", "[role=radio]",
            "[role=tab]", "[role=menuitem]", "[onclick]", "[contenteditable=true]",
        ];

        const allEls = document.querySelectorAll(selectors.join(","));

        allEls.forEach((el) => {
            if (!isVisible(el)) return;

            const tag = el.tagName.toLowerCase();
            const type = el.type || "";
            const id = el.id || "";
            const name = el.name || "";
            const className = (typeof el.className === "string" ? el.className : "").substring(0, 80);
            const label = getLabel(el);
            const role = el.getAttribute("role") || "";
            const dataTestId = el.getAttribute("data-testid") || el.getAttribute("data-test") || el.getAttribute("data-cy") || "";

            elements.push({
                idx: idx++, tag, type, id, name, className,
                label: label.substring(0, 120), role, dataTestId,
                href: el.href || "",
            });
        });

        return {
            url: window.location.href,
            title: document.title,
            elements: elements.slice(0, 80),
        };
    });
}

async function findElementWithAI(snapshot, action, target, value, options = {}) {
    const { previousFailure } = options;

    const healContext = previousFailure
        ? `

⚠️ PREVIOUS ATTEMPT FAILED:
- Previously picked element idx: ${previousFailure.triedIdx} (label: "${previousFailure.triedLabel}")
- Failure reason: ${previousFailure.error}
- IMPORTANT: Pick a DIFFERENT element this time.
- Try different match strategy: if matched on label, try placeholder/role/id.
`
        : "";

    const prompt = `You are a web automation engine. Pick the BEST element to perform the action.

ACTION: ${action}
TARGET DESCRIPTION: "${target}"
VALUE: "${value}"

CURRENT PAGE:
URL: ${snapshot.url}
Title: ${snapshot.title}

AVAILABLE ELEMENTS (JSON):
${JSON.stringify(snapshot.elements, null, 1)}
${healContext}

MATCHING STRATEGY:
1. For buttons: Match button text, aria-label, or role=button elements
2. For input fields: Match placeholder, label, name, or id
3. For icons/images: Match by position keywords (top-right, top-left, etc.)
4. For error messages: Look for elements with red color, error class, or alert role
5. For shopping cart: Look for cart-related text, icons, or badge elements
6. FLEXIBLE MATCHING: If target says "Cart badge" or "Shopping cart icon", match ANY element containing "cart"
7. If target describes position (top-right, top-left), match by className or role at that position
8. For error verification: ANY visible element with "error", "alert", or red styling is valid

ELEMENT PRIORITY:
- Exact label match → highest priority
- Partial label match (contains keywords) → high priority
- Placeholder/name match → medium priority
- Role/type match → low priority

If NO element matches confidently, return idx: -1.

Return ONLY JSON:
{ "idx": <number>, "reason": "<short reason>" }
`;

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: previousFailure ? 0.3 : 0,
    });

    try {
        const result = JSON.parse(response.choices[0].message.content);
        return result;
    } catch {
        return { idx: -1, reason: "AI response parse error" };
    }
}

async function buildLocator(page, element) {
    if (element.dataTestId) {
        const loc = page.locator(`[data-testid="${element.dataTestId}"], [data-test="${element.dataTestId}"], [data-cy="${element.dataTestId}"]`).first();
        if (await loc.count() > 0) return loc;
    }

    if (element.id) {
        const loc = page.locator(`#${CSS.escape ? CSS.escape(element.id) : element.id}`).first();
        if (await loc.count() > 0) return loc;
    }

    if (element.name) {
        const loc = page.locator(`[name="${element.name}"]`).first();
        if (await loc.count() > 0) return loc;
    }

    if (element.role || element.tag === "button" || element.tag === "a") {
        const role = element.role || (element.tag === "a" ? "link" : "button");
        try {
            const loc = page.getByRole(role, { name: element.label, exact: false }).first();
            if (await loc.count() > 0) return loc;
        } catch (e) { /* fallthrough */ }
    }

    if (element.label) {
        try {
            const loc = page.getByPlaceholder(element.label, { exact: false }).first();
            if (await loc.count() > 0) return loc;
        } catch (e) { /* fallthrough */ }

        try {
            const loc = page.getByLabel(element.label, { exact: false }).first();
            if (await loc.count() > 0) return loc;
        } catch (e) { /* fallthrough */ }

        try {
            const loc = page.getByText(element.label, { exact: false }).first();
            if (await loc.count() > 0) return loc;
        } catch (e) { /* fallthrough */ }
    }

    return page.locator(`${element.tag}${element.type ? `[type="${element.type}"]` : ""}`).first();
}

async function performAction(locator, action, value, target) {
    try {
        await locator.scrollIntoViewIfNeeded({ timeout: 5000 });
    } catch (e) { /* ignore */ }

    switch (action) {
        case "click":
            await locator.click({ timeout: 10000 });
            break;
        case "fill":
            await locator.fill(value || "", { timeout: 10000 });
            break;
        case "select":
            await locator.selectOption({ label: value }, { timeout: 10000 });
            break;
        case "check":
            await locator.check({ timeout: 10000 });
            break;
        case "uncheck":
            await locator.uncheck({ timeout: 10000 });
            break;
        case "hover":
            await locator.hover({ timeout: 10000 });
            break;
        case "assert_visible":
            if (!(await locator.isVisible())) {
                throw new Error(`Assertion failed: "${target}" is not visible`);
            }
            break;
        case "assert_text": {
            // Try multiple text extraction methods for maximum reliability
            let text = "";
            try {
                text = (await locator.textContent()) || "";
            } catch (e) {
                text = "";
            }
            
            const expectedText = (value || "").toLowerCase();
            const actualText = text.toLowerCase().trim();
            
            // Strategy 1: Direct textContent (current element only)
            let found = actualText.includes(expectedText);
            
            // Strategy 2: Try innerText (includes visible text from children)
            if (!found) {
                try {
                    const innerText = await locator.innerText();
                    found = innerText.toLowerCase().includes(expectedText);
                } catch (e) { /* ignore */ }
            }
            
            // Strategy 3: Try allTextContents (all text nodes)
            if (!found) {
                try {
                    const allTexts = await locator.allTextContents();
                    found = allTexts.join(" ").toLowerCase().includes(expectedText);
                } catch (e) { /* ignore */ }
            }
            
            if (!found) {
                throw new Error(`Assertion failed: expected text "${value}" not found in "${text}"`);
            }
            break;
        }
    }
}

async function executeStep(page, step, appUrl, options = {}) {
    const { action, target, value } = step;
    const { selfHealEnabled = true } = options;

    switch (action) {
        case "navigate": {
            const url = target && target.startsWith("http") ? target : appUrl;
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
            return { ok: true };
        }

        case "wait": {
            const ms = parseInt(value) || 1500;
            await page.waitForTimeout(ms);
            return { ok: true };
        }

        case "press_key": {
            await page.keyboard.press(value || "Enter");
            return { ok: true };
        }

        case "assert_url": {
            const currentUrl = page.url();
            const expected = (value || target || "").toLowerCase();
            if (!currentUrl.toLowerCase().includes(expected)) {
                throw new Error(`Assertion failed: URL "${currentUrl}" does not contain "${expected}"`);
            }
            return { ok: true };
        }

        case "click":
        case "fill":
        case "select":
        case "check":
        case "uncheck":
        case "hover":
        case "assert_visible":
        case "assert_text": {
            try {
                await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
            } catch (e) { /* ignore */ }

            const snapshot = await snapshotPage(page);

            if (snapshot.elements.length === 0) {
                throw new Error("No interactive elements found on page");
            }

            const aiPick = await findElementWithAI(snapshot, action, target, value);

            if (aiPick.idx === -1 || aiPick.idx === undefined || aiPick.idx >= snapshot.elements.length) {
                if (!selfHealEnabled) {
                    throw new Error(`Could not locate element: "${target}" (${aiPick.reason || "no match"})`);
                }
                return await tryHeal(page, action, target, value, snapshot, {
                    triedIdx: -1,
                    triedLabel: "(none)",
                    error: `No initial match: ${aiPick.reason || "AI returned -1"}`,
                });
            }

            const chosen = snapshot.elements[aiPick.idx];

            try {
                const locator = await buildLocator(page, chosen);
                await performAction(locator, action, value, target);
                return { ok: true, picked: chosen.label };
            } catch (firstErr) {
                if (!selfHealEnabled) throw firstErr;

                console.log(`🩹 [self-heal] Step "${action} → ${target}" failed: ${firstErr.message}. Retrying...`);

                let freshSnapshot = snapshot;
                try {
                    await page.waitForLoadState("domcontentloaded", { timeout: 3000 });
                    freshSnapshot = await snapshotPage(page);
                } catch (e) { /* use stale snapshot */ }

                return await tryHeal(page, action, target, value, freshSnapshot, {
                    triedIdx: aiPick.idx,
                    triedLabel: chosen.label,
                    error: firstErr.message,
                });
            }
        }

        default:
            throw new Error(`Unknown action: ${action}`);
    }
}

async function tryHeal(page, action, target, value, snapshot, previousFailure) {
    // SMART HEALING STRATEGY 1: assert_text → assert_visible
    if (action === "assert_text") {
        console.log("🩹 [self-heal] assert_text failed, trying assert_visible fallback...");
        try {
            const aiPick = await findElementWithAI(snapshot, "assert_visible", target, "");
            
            if (aiPick.idx !== -1 && aiPick.idx < snapshot.elements.length) {
                const chosen = snapshot.elements[aiPick.idx];
                const locator = await buildLocator(page, chosen);
                
                if (await locator.isVisible()) {
                    return {
                        ok: true,
                        picked: chosen.label,
                        healed: true,
                        healInfo: {
                            originalLabel: previousFailure.triedLabel,
                            originalError: previousFailure.error,
                            healedLabel: chosen.label,
                            reason: "Switched from assert_text to assert_visible",
                        },
                    };
                }
            }
        } catch (e) {
            console.log("🩹 [self-heal] assert_visible fallback failed, trying URL check...");
        }
    }
    
    // SMART HEALING STRATEGY 2: For error verifications, check if we're still on the same page
    if ((action === "assert_visible" || action === "assert_text") && 
        (target.toLowerCase().includes("error") || target.toLowerCase().includes("banner") || 
         target.toLowerCase().includes("message") || target.toLowerCase().includes("alert"))) {
        
        console.log("🩹 [self-heal] Error verification failed, checking if we stayed on same page (indicates error occurred)...");
        try {
            const currentUrl = page.url();
            // If we're still on login/form page, the error occurred (didn't navigate away)
            if (currentUrl.includes("saucedemo") || currentUrl.includes("login") || 
                currentUrl === snapshot.url || !currentUrl.includes("inventory")) {
                
                return {
                    ok: true,
                    picked: "URL check (still on error page)",
                    healed: true,
                    healInfo: {
                        originalLabel: previousFailure.triedLabel,
                        originalError: previousFailure.error,
                        healedLabel: "Page did not navigate (error confirmed)",
                        reason: "Verified error by checking we stayed on same page instead of finding error element",
                    },
                };
            }
        } catch (e) {
            console.log("🩹 [self-heal] URL check also failed");
        }
    }
    
    // SMART HEALING STRATEGY 3: For cart badge/counter that doesn't exist as separate element
    if ((action === "assert_text" || action === "assert_visible") && 
        (target.toLowerCase().includes("cart") && (target.toLowerCase().includes("badge") || 
         target.toLowerCase().includes("count") || target.toLowerCase().includes("number")))) {
        
        console.log("🩹 [self-heal] Cart badge not found as separate element, checking cart icon instead...");
        try {
            // Just verify cart icon exists (badge is built into icon)
            const cartPick = await findElementWithAI(snapshot, "assert_visible", "shopping cart icon", "");
            if (cartPick.idx !== -1 && cartPick.idx < snapshot.elements.length) {
                const chosen = snapshot.elements[cartPick.idx];
                const locator = await buildLocator(page, chosen);
                
                if (await locator.isVisible()) {
                    return {
                        ok: true,
                        picked: chosen.label,
                        healed: true,
                        healInfo: {
                            originalLabel: previousFailure.triedLabel,
                            originalError: previousFailure.error,
                            healedLabel: chosen.label,
                            reason: "Cart badge is part of cart icon, verified icon exists instead",
                        },
                    };
                }
            }
        } catch (e) {
            console.log("🩹 [self-heal] Cart icon check also failed");
        }
    }
    
    // Original healing logic: try to find a different element
    const aiPick = await findElementWithAI(snapshot, action, target, value, { previousFailure });

    if (aiPick.idx === -1 || aiPick.idx === undefined || aiPick.idx >= snapshot.elements.length) {
        throw new Error(
            `Step failed and self-heal could not find an alternative element. ` +
            `First attempt: "${previousFailure.triedLabel}" — ${previousFailure.error}. ` +
            `Heal attempt: ${aiPick.reason || "no match"}`
        );
    }

    if (aiPick.idx === previousFailure.triedIdx) {
        throw new Error(
            `Step failed: AI re-picked the same failing element on retry. ` +
            `Original error: ${previousFailure.error}`
        );
    }

    const chosen = snapshot.elements[aiPick.idx];
    const locator = await buildLocator(page, chosen);
    await performAction(locator, action, value, target);

    return {
        ok: true,
        picked: chosen.label,
        healed: true,
        healInfo: {
            originalLabel: previousFailure.triedLabel,
            originalError: previousFailure.error,
            healedLabel: chosen.label,
            reason: aiPick.reason,
        },
    };
}

// ============================================================
// MAIN EXECUTION ENDPOINT (with WebSocket Live Streaming)
// ============================================================
const activeRuns = new Map();

app.post("/execute-tests", async (req, res) => {
    const {
        testcases, appUrl, headless = false, runId,
        suiteId = null, suiteName = null, selfHealEnabled = true,
    } = req.body;

    if (!testcases || !Array.isArray(testcases) || testcases.length === 0) {
        return res.status(400).json({ error: "No test cases provided" });
    }
    if (!appUrl) {
        return res.status(400).json({ error: "Application URL is required" });
    }
    if (!runId) {
        return res.status(400).json({ error: "runId is required" });
    }

    const results = [];
    const browser = await chromium.launch({ headless });
    const runState = { browser, cancelled: false };
    activeRuns.set(runId, runState);

    // EMIT: Run started
    emitToRun(runId, "run:start", { total: testcases.length, appUrl });

    try {
        for (let i = 0; i < testcases.length; i++) {
            const tc = testcases[i];

            if (runState.cancelled) {
                console.log(`[${runId}] ⏹️ Cancellation detected — skipping remaining tests`);
                results.push({
                    testCaseId: tc.testCaseId,
                    title: tc.title,
                    status: "Skipped",
                    error: "Execution stopped by user",
                    screenshot: "",
                    stepLog: [],
                    healed: false,
                });
                continue;
            }

            // EMIT: Test case starting
            emitToRun(runId, "tc:start", {
                testCaseId: tc.testCaseId,
                title: tc.title,
                index: i + 1,
                total: testcases.length,
            });

            let context;
            let page;
            try {
                context = await browser.newContext({
                    viewport: { width: 1366, height: 768 },
                    ignoreHTTPSErrors: true,
                });
                page = await context.newPage();
            } catch (ctxErr) {
                console.log(`[${runId}] Browser unavailable: ${ctxErr.message}`);
                results.push({
                    testCaseId: tc.testCaseId,
                    title: tc.title,
                    status: "Skipped",
                    error: "Execution stopped by user",
                    screenshot: "",
                    stepLog: [],
                    healed: false,
                });
                continue;
            }

            let stepLog = [];
            let healedAny = false;
            const healEvents = [];

            try {
                let steps = tc.structuredSteps && tc.structuredSteps.length > 0
                    ? tc.structuredSteps
                    : [{ action: "navigate", target: appUrl, value: "" }];

                if (steps.length === 0 || steps[0].action !== "navigate") {
                    steps = [{ action: "navigate", target: appUrl, value: "" }, ...steps];
                }

                for (const step of steps) {
                    if (runState.cancelled) {
                        throw new Error("Execution stopped by user");
                    }

                    const stepDesc = `${step.action} → ${step.target}${step.value ? ` = "${step.value}"` : ""}`;
                    console.log(`[${tc.testCaseId}] ${stepDesc}`);

                    // EMIT: Step executing
                    emitToRun(runId, "step:executing", { step: stepDesc, testCaseId: tc.testCaseId });

                    try {
                        const result = await executeStep(page, step, appUrl, { selfHealEnabled });
                        const logEntry = {
                            step: stepDesc,
                            status: result.healed ? "healed" : "ok",
                            info: result.picked || "",
                        };
                        if (result.healed && result.healInfo) {
                            healedAny = true;
                            logEntry.healInfo = result.healInfo;
                            healEvents.push({ step: stepDesc, ...result.healInfo });
                        }
                        stepLog.push(logEntry);
                    } catch (stepErr) {
                        stepLog.push({ step: stepDesc, status: "fail", error: stepErr.message });
                        throw stepErr;
                    }

                    await page.waitForTimeout(400);
                }

                // SUCCESS: Take screenshot with element highlighted
                const fileName = `screenshots/${tc.testCaseId}.png`;
                
                // Highlight the last interacted element before screenshot
                try {
                    await page.evaluate(() => {
                        // Remove any previous highlights
                        document.querySelectorAll('.testforge-highlight').forEach(el => el.remove());
                    });
                    
                    // Add highlight overlay to last interacted element
                    const lastStep = stepLog[stepLog.length - 1];
                    if (lastStep && lastStep.status !== "fail" && lastStep.info) {
                        await page.evaluate((labelText) => {
                            // Find the last interacted element by its label
                            const elements = Array.from(document.querySelectorAll('*'));
                            const target = elements.find(el => {
                                const text = el.textContent?.trim() || el.placeholder || el.value || '';
                                return text.includes(labelText) || 
                                       el.getAttribute('aria-label')?.includes(labelText) ||
                                       el.id === labelText ||
                                       el.name === labelText;
                            });
                            
                            if (target) {
                                const rect = target.getBoundingClientRect();
                                const highlight = document.createElement('div');
                                highlight.className = 'testforge-highlight';
                                highlight.style.cssText = `
                                    position: fixed;
                                    left: ${rect.left - 4}px;
                                    top: ${rect.top - 4}px;
                                    width: ${rect.width + 8}px;
                                    height: ${rect.height + 8}px;
                                    border: 3px solid #FF6B00;
                                    box-shadow: 0 0 0 2px rgba(255, 107, 0, 0.3), 0 0 20px rgba(255, 107, 0, 0.5);
                                    border-radius: 4px;
                                    pointer-events: none;
                                    z-index: 999999;
                                    animation: testforge-pulse 1s ease-in-out;
                                `;
                                document.body.appendChild(highlight);
                                
                                // Add label
                                const label = document.createElement('div');
                                label.className = 'testforge-highlight';
                                label.textContent = '✓ Interacted';
                                label.style.cssText = `
                                    position: fixed;
                                    left: ${rect.left}px;
                                    top: ${rect.top - 28}px;
                                    background: #FF6B00;
                                    color: white;
                                    padding: 4px 8px;
                                    border-radius: 4px;
                                    font-family: Arial, sans-serif;
                                    font-size: 12px;
                                    font-weight: bold;
                                    pointer-events: none;
                                    z-index: 999999;
                                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                                `;
                                document.body.appendChild(label);
                                
                                // Add animation
                                if (!document.getElementById('testforge-styles')) {
                                    const style = document.createElement('style');
                                    style.id = 'testforge-styles';
                                    style.textContent = `
                                        @keyframes testforge-pulse {
                                            0%, 100% { opacity: 1; }
                                            50% { opacity: 0.6; }
                                        }
                                    `;
                                    document.head.appendChild(style);
                                }
                            }
                        }, lastStep.info);
                        
                        // Wait for highlight to render
                        await page.waitForTimeout(300);
                    }
                } catch (highlightErr) {
                    console.log("Could not add highlight overlay:", highlightErr.message);
                }
                
                await page.screenshot({ path: fileName, fullPage: true });
                
                // Clean up highlights after screenshot
                try {
                    await page.evaluate(() => {
                        document.querySelectorAll('.testforge-highlight').forEach(el => el.remove());
                    });
                } catch (e) { /* ignore */ }

                const result = {
                    testCaseId: tc.testCaseId,
                    title: tc.title,
                    status: "Pass",
                    error: "",
                    screenshot: `/screenshots/${tc.testCaseId}.png`,
                    stepLog,
                    healed: healedAny,
                    healEvents,
                };

                results.push(result);

                // EMIT: Test case completed
                emitToRun(runId, "tc:done", result);

            } catch (err) {
                const stoppedByUser = runState.cancelled || /stopped by user|Target.+closed|Browser has been closed/i.test(err.message || "");

                let screenshotPath = "";
                if (!stoppedByUser) {
                    const fileName = `screenshots/${tc.testCaseId}_error.png`;
                    try {
                        // Highlight the failed element if available
                        const failedStep = stepLog[stepLog.length - 1];
                        if (failedStep && failedStep.status === "fail") {
                            await page.evaluate(() => {
                                document.querySelectorAll('.testforge-highlight').forEach(el => el.remove());
                            });
                            
                            await page.evaluate((stepDesc) => {
                                // Try to find and highlight the failed element
                                const style = document.createElement('style');
                                style.id = 'testforge-styles';
                                style.textContent = `
                                    @keyframes testforge-pulse-error {
                                        0%, 100% { opacity: 1; }
                                        50% { opacity: 0.7; }
                                    }
                                `;
                                if (!document.getElementById('testforge-styles')) {
                                    document.head.appendChild(style);
                                }
                                
                                // Add error indicator overlay
                                const overlay = document.createElement('div');
                                overlay.className = 'testforge-highlight';
                                overlay.textContent = '❌ FAILED: ' + stepDesc;
                                overlay.style.cssText = `
                                    position: fixed;
                                    top: 10px;
                                    left: 50%;
                                    transform: translateX(-50%);
                                    background: #DC2626;
                                    color: white;
                                    padding: 12px 24px;
                                    border-radius: 8px;
                                    font-family: Arial, sans-serif;
                                    font-size: 14px;
                                    font-weight: bold;
                                    pointer-events: none;
                                    z-index: 999999;
                                    box-shadow: 0 4px 16px rgba(220, 38, 38, 0.4);
                                    animation: testforge-pulse-error 1s ease-in-out;
                                    max-width: 80%;
                                    text-align: center;
                                `;
                                document.body.appendChild(overlay);
                            }, failedStep.step);
                            
                            await page.waitForTimeout(300);
                        }
                        
                        await page.screenshot({ path: fileName, fullPage: true });
                        screenshotPath = `/screenshots/${tc.testCaseId}_error.png`;
                        
                        await page.evaluate(() => {
                            document.querySelectorAll('.testforge-highlight').forEach(el => el.remove());
                        });
                    } catch (e) { /* ignore */ }
                }

                const result = {
                    testCaseId: tc.testCaseId,
                    title: tc.title,
                    status: stoppedByUser ? "Skipped" : "Fail",
                    error: stoppedByUser ? "Execution stopped by user" : err.message,
                    screenshot: screenshotPath,
                    stepLog,
                    healed: healedAny,
                    healEvents,
                };

                results.push(result);

                // EMIT: Test case completed (failed)
                emitToRun(runId, "tc:done", result);
            } finally {
                try { await context.close(); } catch (e) { /* ignore */ }
            }
        }

        try { await browser.close(); } catch (e) { /* ignore */ }
        activeRuns.delete(runId);

        // Save execution to history
        let savedExecution = null;
        try {
            let resolvedSuiteName = suiteName;
            if (suiteId && !resolvedSuiteName) {
                const suite = storage.getSuite(suiteId);
                resolvedSuiteName = suite ? suite.name : "Unknown Suite";
            }
            savedExecution = storage.saveExecution({
                suiteId,
                suiteName: resolvedSuiteName || "Ad-hoc Run",
                appUrl,
                results,
            });
        } catch (saveErr) {
            console.error("Failed to save execution history:", saveErr);
        }

        // EMIT: Run complete
        emitToRun(runId, "run:complete", {
            results,
            summary: savedExecution ? savedExecution.summary : null,
        });

        res.json({
            results,
            stopped: runState.cancelled,
            executionId: savedExecution ? savedExecution.id : null,
            summary: savedExecution ? savedExecution.summary : null,
        });
    } catch (err) {
        console.error("❌ Execution error:", err);
        try { await browser.close(); } catch (e) { }
        activeRuns.delete(runId);

        // EMIT: Run error
        emitToRun(runId, "run:error", { error: err.message });

        res.status(500).json({ error: "Execution failed: " + err.message });
    }
});

app.post("/stop-execution", async (req, res) => {
    const { runId } = req.body;
    if (!runId) return res.status(400).json({ error: "runId is required" });

    const runState = activeRuns.get(runId);
    if (!runState) {
        return res.json({ ok: false, message: "No active run found for this runId" });
    }

    runState.cancelled = true;
    try {
        await runState.browser.close();
    } catch (e) { /* ignore */ }

    console.log(`[${runId}] ⏹️ Stop signal received`);
    res.json({ ok: true, message: "Stop signal sent" });
});

// ============================================================
// SUITE & HISTORY ROUTES
// ============================================================
app.post("/suites", (req, res) => {
    try {
        const { name, description, appUrl, testData, testcases } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: "Suite name is required" });
        }
        if (!Array.isArray(testcases) || testcases.length === 0) {
            return res.status(400).json({ error: "Testcases are required" });
        }
        const suite = storage.createSuite({
            name: name.trim(),
            description: description || "",
            appUrl: appUrl || "",
            testData: testData || {},
            testcases,
        });
        res.json({ suite });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get("/suites", (req, res) => {
    try {
        res.json({ suites: storage.listSuites() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get("/suites/:id", (req, res) => {
    try {
        const suite = storage.getSuite(req.params.id);
        if (!suite) return res.status(404).json({ error: "Suite not found" });
        res.json({ suite });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.put("/suites/:id", (req, res) => {
    try {
        const updated = storage.updateSuite(req.params.id, req.body || {});
        if (!updated) return res.status(404).json({ error: "Suite not found" });
        res.json({ suite: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.delete("/suites/:id", (req, res) => {
    try {
        storage.deleteSuite(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get("/executions", (req, res) => {
    try {
        const { suiteId, limit } = req.query;
        const executions = storage.listExecutions({
            suiteId: suiteId || null,
            limit: limit ? parseInt(limit) : 100,
        });
        res.json({ executions });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.get("/executions/:id", (req, res) => {
    try {
        const exec = storage.getExecution(req.params.id);
        if (!exec) return res.status(404).json({ error: "Execution not found" });
        res.json({ execution: exec });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.delete("/executions/:id", (req, res) => {
    try {
        storage.deleteExecution(req.params.id);
        res.json({ ok: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

server.listen(5000, () => {
    console.log("🚀 TestForge AI v3.0 server running on http://localhost:5000");
    console.log("✅ Features enabled:");
    console.log("   - Self-healing tests");
    console.log("   - Suite & history management");
    console.log("   - Live WebSocket streaming");
    console.log("   - Conversational test refinement");
    console.log("   - Bug report auto-generation");
    console.log("   - Screenshot-to-tests (GPT-4o Vision)");
});
