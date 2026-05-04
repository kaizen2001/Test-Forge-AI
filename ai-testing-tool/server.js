require("dotenv").config();
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const app = express();

const multer = require("multer");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/screenshots", express.static("screenshots"));

// Ensure screenshots dir exists
if (!fs.existsSync("screenshots")) {
    fs.mkdirSync("screenshots", { recursive: true });
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// ==============================
// HELPER: Normalize test cases
// ==============================
const normalizeTCs = (arr) =>
    arr.map((tc, i) => ({
        testCaseId:
            tc.testCaseId ||
            tc.testCaseID ||
            tc.id ||
            tc.test_case_id ||
            `TC_${String(i + 1).padStart(3, "0")}`,

        title:
            tc.title ||
            tc.testCaseDescription ||
            tc.scenario ||
            tc.name ||
            tc.description ||
            "No scenario provided",

        testSteps: Array.isArray(tc.testSteps)
            ? tc.testSteps
            : Array.isArray(tc.steps)
                ? tc.steps
                : typeof tc.testSteps === "string"
                    ? [tc.testSteps]
                    : typeof tc.steps === "string"
                        ? [tc.steps]
                        : [],

        expectedResult:
            tc.expectedResult ||
            tc.expected ||
            tc.expected_result ||
            tc.expectedBehavior ||
            "No expected result provided",

        priority: tc.priority || "Medium",
        category: tc.category || "Functional",

        // NEW: structured actions for execution
        structuredSteps: Array.isArray(tc.structuredSteps) ? tc.structuredSteps : [],

        // NEW: test data (credentials, inputs)
        testData: tc.testData || {},
    }));

// ==============================
// TEST CASE GENERATOR (Enhanced)
// ==============================
app.post("/generate-testcases", async (req, res) => {
    try {
        const { requirement, appUrl, testData } = req.body;

        // testData is optional — user can provide credentials, sample inputs etc.
        const testDataSection = testData && Object.keys(testData).length > 0
            ? `\nAVAILABLE TEST DATA (use these in your test cases):\n${JSON.stringify(testData, null, 2)}`
            : `\nNo test data provided. For login/input fields, generate REASONABLE sample values OR mark them as needing user input.`;

        const prompt = `
You are a senior QA engineer generating enterprise-grade, EXECUTABLE test cases.

INPUT:
"""
Requirement:
${requirement}

Application URL:
${appUrl}
${testDataSection}
"""

===============================
GENERATION RULES
===============================
Generate test cases covering:
- Positive, Negative, Edge, Boundary, UI, Error, Security, E2E scenarios

SCALING:
- Low complexity → 15-25 test cases
- Medium complexity → 25-40 test cases
- High complexity → 40-60 test cases

===============================
STRICT SCHEMA — EVERY TEST CASE
===============================
Each test case MUST include:
{
  "testCaseId": "TC_XXX",
  "title": "Clear, specific scenario title",
  "testSteps": ["Human-readable step 1", "step 2", "step 3"],
  "structuredSteps": [
    {
      "action": "navigate | click | fill | select | check | uncheck | hover | wait | assert_visible | assert_text | assert_url | press_key",
      "target": "Specific element description (e.g. 'Login button', 'Email input field', 'Submit button in checkout form')",
      "value": "Value to type/select (only for fill/select/press_key/assert_text actions, else empty string)"
    }
  ],
  "expectedResult": "Clear expected outcome",
  "priority": "High | Medium | Low",
  "category": "Positive | Negative | Edge | Boundary | UI | Error | Security | E2E"
}

===============================
CRITICAL RULES FOR structuredSteps
===============================
1. structuredSteps MUST mirror testSteps but in machine-executable form.
2. "action" MUST be ONE of: navigate, click, fill, select, check, uncheck, hover, wait, assert_visible, assert_text, assert_url, press_key
3. "target" MUST describe the element in PLAIN ENGLISH so an AI can later locate it on the page (e.g. "Username input field", "Sign In button", "Product card titled 'Backpack'")
4. "value" — for fill: the text to type; for select: option label; for assert_text: expected text; for press_key: key like "Enter"; for others: ""
5. First step is usually: { "action": "navigate", "target": "${appUrl}", "value": "" }
6. For login flows, use the provided test data credentials. If none provided, use placeholders like "{{username}}" and "{{password}}".
7. Each test case must have AT LEAST 3 structuredSteps.
8. testSteps and structuredSteps MUST have the same number of items and describe the same actions in order.

===============================
EXAMPLE
===============================
{
  "testCaseId": "TC_001",
  "title": "Successful login with valid credentials",
  "testSteps": [
    "Navigate to the application URL",
    "Enter valid username in the username field",
    "Enter valid password in the password field",
    "Click the Login button",
    "Verify user is redirected to the dashboard"
  ],
  "structuredSteps": [
    { "action": "navigate", "target": "${appUrl}", "value": "" },
    { "action": "fill", "target": "Username input field", "value": "validuser" },
    { "action": "fill", "target": "Password input field", "value": "validpass123" },
    { "action": "click", "target": "Login button", "value": "" },
    { "action": "assert_url", "target": "URL contains dashboard or home", "value": "dashboard" }
  ],
  "expectedResult": "User is logged in and dashboard is displayed",
  "priority": "High",
  "category": "Positive"
}

===============================
OUTPUT
===============================
Return ONLY a valid JSON array. No markdown. No explanation.
        `;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 8000,
            response_format: { type: "json_object" },
        });

        console.log("Finish reason:", response.choices[0].finish_reason);

        let raw = response.choices[0].message.content;
        raw = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

        let parsed;
        try {
            parsed = JSON.parse(raw);

            // Handle wrapper objects like { testCases: [...] }
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
        console.error(error);
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
            return res.json({
                result: "Please provide a valid error to analyze.",
            });
        }

        const prompt = `
You are a senior QA automation engineer specializing in Selenium/Playwright/WebDriver.

INPUT ERROR:
"${errorLog}"

Analyze and provide:

Root Cause:
Reason:
Fix:
Debug Steps:
Category:

Be specific and practical.
`;

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
// UNIVERSAL TEST EXECUTOR (works for ANY web app)
// ============================================================
const { chromium } = require("playwright");

/**
 * Capture all interactive elements on the current page
 * with stable, AI-friendly descriptors.
 */
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
            // Try multiple sources for a meaningful label
            const aria = el.getAttribute("aria-label");
            if (aria) return aria.trim();

            const placeholder = el.getAttribute("placeholder");
            if (placeholder) return placeholder.trim();

            const name = el.getAttribute("name");
            const id = el.getAttribute("id");

            // Find associated label
            if (id) {
                const lbl = document.querySelector(`label[for="${id}"]`);
                if (lbl) return lbl.textContent.trim();
            }

            // Parent label
            const parentLabel = el.closest("label");
            if (parentLabel) return parentLabel.textContent.trim();

            // Use button/link text
            const text = (el.innerText || el.textContent || "").trim();
            if (text) return text.substring(0, 100);

            // Fallback to value or type
            return el.value || el.type || el.tagName.toLowerCase();
        };

        const selectors = [
            "input:not([type=hidden])",
            "textarea",
            "select",
            "button",
            "a[href]",
            "[role=button]",
            "[role=link]",
            "[role=checkbox]",
            "[role=radio]",
            "[role=tab]",
            "[role=menuitem]",
            "[onclick]",
            "[contenteditable=true]",
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
                idx: idx++,
                tag,
                type,
                id,
                name,
                className,
                label: label.substring(0, 120),
                role,
                dataTestId,
                href: el.href || "",
            });
        });

        return {
            url: window.location.href,
            title: document.title,
            elements: elements.slice(0, 80), // cap at 80 to control token usage
        };
    });
}

/**
 * Use AI to pick the best element for a given target description.
 * Returns the index of the chosen element in the snapshot.
 */
async function findElementWithAI(snapshot, action, target, value) {
    const prompt = `You are a web automation engine. Pick the BEST element to perform the action.

ACTION: ${action}
TARGET DESCRIPTION: "${target}"
VALUE: "${value}"

CURRENT PAGE:
URL: ${snapshot.url}
Title: ${snapshot.title}

AVAILABLE ELEMENTS (JSON):
${JSON.stringify(snapshot.elements, null, 1)}

INSTRUCTIONS:
- Choose the element index ("idx") that best matches the target description.
- Match using label, placeholder, id, name, dataTestId, role, type.
- For "fill" actions, prefer input/textarea elements.
- For "click" actions, prefer button/link/role=button elements.
- For "select" actions, prefer <select> elements.
- If NO element matches confidently, return idx: -1.

Return ONLY JSON:
{ "idx": <number>, "reason": "<short reason>" }
`;

    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0,
    });

    try {
        const result = JSON.parse(response.choices[0].message.content);
        return result;
    } catch {
        return { idx: -1, reason: "AI response parse error" };
    }
}

/**
 * Build a robust Playwright locator for the chosen element.
 */
async function buildLocator(page, element) {
    // Priority order: data-testid > id > name > role+label > label text
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

    // Role + name
    if (element.role || element.tag === "button" || element.tag === "a") {
        const role = element.role || (element.tag === "a" ? "link" : "button");
        try {
            const loc = page.getByRole(role, { name: element.label, exact: false }).first();
            if (await loc.count() > 0) return loc;
        } catch (e) { /* fallthrough */ }
    }

    // Placeholder
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

    // Last resort: tag + type
    return page.locator(`${element.tag}${element.type ? `[type="${element.type}"]` : ""}`).first();
}

/**
 * Execute a single structured step.
 */
async function executeStep(page, step, appUrl) {
    const { action, target, value } = step;

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

        // For all element-based actions, use AI to find the element
        case "click":
        case "fill":
        case "select":
        case "check":
        case "uncheck":
        case "hover":
        case "assert_visible":
        case "assert_text": {
            // Wait for page stability
            try {
                await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
            } catch (e) { /* ignore */ }

            const snapshot = await snapshotPage(page);

            if (snapshot.elements.length === 0) {
                throw new Error("No interactive elements found on page");
            }

            const aiPick = await findElementWithAI(snapshot, action, target, value);

            if (aiPick.idx === -1 || aiPick.idx === undefined || aiPick.idx >= snapshot.elements.length) {
                throw new Error(`Could not locate element: "${target}" (${aiPick.reason || "no match"})`);
            }

            const chosen = snapshot.elements[aiPick.idx];
            const locator = await buildLocator(page, chosen);

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
                    const text = (await locator.textContent()) || "";
                    if (!text.toLowerCase().includes((value || "").toLowerCase())) {
                        throw new Error(`Assertion failed: expected text "${value}" not found in "${text}"`);
                    }
                    break;
                }
            }

            return { ok: true, picked: chosen.label };
        }

        default:
            throw new Error(`Unknown action: ${action}`);
    }
}

/**
 * Active runs registry.
 * Holds the running browser + cancellation flag for each runId.
 * Allows the /stop-execution endpoint to abort a run mid-flight.
 */
const activeRuns = new Map(); // runId -> { browser, cancelled }

/**
 * Main execution endpoint (cancellable).
 */
app.post("/execute-tests", async (req, res) => {
    const { testcases, appUrl, headless = false, runId } = req.body;

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

    // Register this run so /stop-execution can find and cancel it
    const runState = { browser, cancelled: false };
    activeRuns.set(runId, runState);

    try {
        for (const tc of testcases) {
            // Check cancellation BEFORE starting each test case
            if (runState.cancelled) {
                console.log(`[${runId}] Cancellation detected — skipping remaining test cases`);
                results.push({
                    testCaseId: tc.testCaseId,
                    title: tc.title,
                    status: "Skipped",
                    error: "Execution stopped by user",
                    screenshot: "",
                    stepLog: [],
                });
                continue;
            }

            // Fresh context per test case for isolation
            let context;
            let page;
            try {
                context = await browser.newContext({
                    viewport: { width: 1366, height: 768 },
                    ignoreHTTPSErrors: true,
                });
                page = await context.newPage();
            } catch (ctxErr) {
                // Browser was closed (likely by stop) — bail out cleanly
                console.log(`[${runId}] Browser unavailable: ${ctxErr.message}`);
                results.push({
                    testCaseId: tc.testCaseId,
                    title: tc.title,
                    status: "Skipped",
                    error: "Execution stopped by user",
                    screenshot: "",
                    stepLog: [],
                });
                continue;
            }

            let stepLog = [];

            try {
                let steps = tc.structuredSteps && tc.structuredSteps.length > 0
                    ? tc.structuredSteps
                    : [{ action: "navigate", target: appUrl, value: "" }];

                if (steps.length === 0 || steps[0].action !== "navigate") {
                    steps = [{ action: "navigate", target: appUrl, value: "" }, ...steps];
                }

                for (const step of steps) {
                    // Check cancellation between steps too
                    if (runState.cancelled) {
                        throw new Error("Execution stopped by user");
                    }

                    const stepDesc = `${step.action} → ${step.target}${step.value ? ` = "${step.value}"` : ""}`;
                    console.log(`[${tc.testCaseId}] ${stepDesc}`);

                    try {
                        const result = await executeStep(page, step, appUrl);
                        stepLog.push({ step: stepDesc, status: "ok", info: result.picked || "" });
                    } catch (stepErr) {
                        stepLog.push({ step: stepDesc, status: "fail", error: stepErr.message });
                        throw stepErr;
                    }

                    await page.waitForTimeout(400);
                }

                const fileName = `screenshots/${tc.testCaseId}.png`;
                await page.screenshot({ path: fileName, fullPage: true });

                results.push({
                    testCaseId: tc.testCaseId,
                    title: tc.title,
                    status: "Pass",
                    error: "",
                    screenshot: `/screenshots/${tc.testCaseId}.png`,
                    stepLog,
                });
            } catch (err) {
                const stoppedByUser = runState.cancelled || /stopped by user|Target.+closed|Browser has been closed/i.test(err.message || "");

                let screenshotPath = "";
                if (!stoppedByUser) {
                    const fileName = `screenshots/${tc.testCaseId}_error.png`;
                    try {
                        await page.screenshot({ path: fileName, fullPage: true });
                        screenshotPath = `/screenshots/${tc.testCaseId}_error.png`;
                    } catch (e) { /* ignore */ }
                }

                results.push({
                    testCaseId: tc.testCaseId,
                    title: tc.title,
                    status: stoppedByUser ? "Skipped" : "Fail",
                    error: stoppedByUser ? "Execution stopped by user" : err.message,
                    screenshot: screenshotPath,
                    stepLog,
                });
            } finally {
                try { await context.close(); } catch (e) { /* ignore */ }
            }
        }

        try { await browser.close(); } catch (e) { /* ignore */ }
        activeRuns.delete(runId);

        res.json({
            results,
            stopped: runState.cancelled,
        });
    } catch (err) {
        console.error(err);
        try { await browser.close(); } catch (e) { }
        activeRuns.delete(runId);
        res.status(500).json({ error: "Execution failed: " + err.message });
    }
});

/**
 * Stop a running execution.
 * Sets the cancellation flag and force-closes the browser so any in-flight
 * Playwright operation throws and the loop bails out.
 */
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
    } catch (e) {
        // Browser may already be closing
    }

    console.log(`[${runId}] Stop signal received — execution will halt`);
    res.json({ ok: true, message: "Stop signal sent" });
});

app.listen(5000, () => {
    console.log("Server running on http://localhost:5000");
});