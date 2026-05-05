import React, { useState, useEffect, useCallback, useRef } from "react";
import BoltIcon from "@mui/icons-material/Bolt";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import BugReportIcon from "@mui/icons-material/BugReport";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import DashboardIcon from "@mui/icons-material/Dashboard";
import ChatIcon from "@mui/icons-material/Chat";
import AssessmentIcon from "@mui/icons-material/Assessment";
import CloseIcon from "@mui/icons-material/Close";
import MuiTooltip from "@mui/material/Tooltip";
import axios from "axios";
import LinearProgress from "@mui/material/LinearProgress";
import IconButton from "@mui/material/IconButton";
import Collapse from "@mui/material/Collapse";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import RestoreIcon from "@mui/icons-material/Restore";
import FolderIcon from "@mui/icons-material/Folder";
import HistoryIcon from "@mui/icons-material/History";
import HealingIcon from "@mui/icons-material/Healing";
import DeleteIcon from "@mui/icons-material/Delete";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import VisibilityIcon from "@mui/icons-material/Visibility";
import SendIcon from "@mui/icons-material/Send";
import ImageIcon from "@mui/icons-material/Image";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import io from "socket.io-client";

import {
  TextField,
  Button,
  Card,
  CardContent,
  Typography,
  Box,
  Select,
  MenuItem,
  Chip,
  FormControlLabel,
  Switch,
  Divider,
  Paper,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";

const API = "http://localhost:5000";

function App() {
  // -------- Test Generator state --------
  const [requirement, setRequirement] = useState("");
  const [testcases, setTestcases] = useState([]);
  const [originalTestcases, setOriginalTestcases] = useState([]);
  const [editedIds, setEditedIds] = useState(new Set());
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [loading, setLoading] = useState(false);

  const [errorLog, setErrorLog] = useState("");
  const [analysis, setAnalysis] = useState("");

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState("");

  const [activeTab, setActiveTab] = useState("test");
  const [riskData, setRiskData] = useState(null);

  const [uploadedFileName, setUploadedFileName] = useState("");
  const [fileUploading, setFileUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [appUrl, setAppUrl] = useState("");

  const [testDataJson, setTestDataJson] = useState(
    '{\n  "username": "",\n  "password": "",\n  "email": ""\n}'
  );

  // -------- Execution state --------
  const [executionResults, setExecutionResults] = useState([]);
  const [executing, setExecuting] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [headlessMode, setHeadlessMode] = useState(false);
  const [currentRunId, setCurrentRunId] = useState(null);
  const [stopping, setStopping] = useState(false);
  const [selfHealEnabled, setSelfHealEnabled] = useState(true);

  // -------- Collapse state --------
  const [showTestcases, setShowTestcases] = useState(true);
  const [showResults, setShowResults] = useState(true);

  // -------- Suite & history state --------
  const [currentSuiteId, setCurrentSuiteId] = useState(null);
  const [currentSuiteName, setCurrentSuiteName] = useState(null);
  const [suites, setSuites] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [suiteName, setSuiteName] = useState("");
  const [suiteDescription, setSuiteDescription] = useState("");
  const [historyDetailOpen, setHistoryDetailOpen] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState(null);
  const [historyFilterSuite, setHistoryFilterSuite] = useState("");

  // -------- Editing state --------
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState("");

  // -------- Heal info dialog state --------
  const [healInfoDialog, setHealInfoDialog] = useState(null);

  // ======== NEW: Screenshot-to-Tests state ========
  const [inputMode, setInputMode] = useState("text"); // "text" or "screenshot"
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState(null);

  // ======== NEW: Conversational Refinement state ========
  const [refinementOpen, setRefinementOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [refining, setRefining] = useState(false);

  // ======== NEW: Bug Report state ========
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [selectedFailure, setSelectedFailure] = useState(null);
  const [generatedBugReport, setGeneratedBugReport] = useState("");
  const [generatingBugReport, setGeneratingBugReport] = useState(false);

  // ======== NEW: Live Execution Streaming state ========
  const [socket, setSocket] = useState(null);
  const [liveProgress, setLiveProgress] = useState(null);
  const [currentTest, setCurrentTest] = useState(null);
  const [currentStep, setCurrentStep] = useState("");

  // ===========================================================
  // WEBSOCKET CONNECTION
  // ===========================================================
  useEffect(() => {
    const socketInstance = io(API, {
      transports: ["websocket", "polling"],
      reconnection: true,
    });

    socketInstance.on("connect", () => {
      console.log("✅ WebSocket connected:", socketInstance.id);
    });

    socketInstance.on("disconnect", () => {
      console.log("❌ WebSocket disconnected");
    });

    // Listen to execution events
    socketInstance.on("run:start", (data) => {
      console.log("📡 Run started:", data);
      setLiveProgress({ completed: 0, total: data.total });
      setCurrentTest(null);
      setCurrentStep("");
    });

    socketInstance.on("tc:start", (data) => {
      console.log("📡 Test started:", data);
      setCurrentTest(data);
      setCurrentStep("Starting test case...");
    });

    socketInstance.on("step:executing", (data) => {
      console.log("📡 Step executing:", data);
      setCurrentStep(data.step);
    });

    socketInstance.on("tc:done", (data) => {
      console.log("📡 Test completed:", data);
      setLiveProgress((prev) => prev ? { ...prev, completed: prev.completed + 1 } : null);
      
      // Update results in real-time
      setExecutionResults((prev) => {
        const existing = prev.find((r) => r.testCaseId === data.testCaseId);
        if (existing) {
          return prev.map((r) => r.testCaseId === data.testCaseId ? data : r);
        } else {
          return [...prev, data];
        }
      });
    });

    socketInstance.on("run:complete", (data) => {
      console.log("📡 Run completed:", data);
      setLiveProgress(null);
      setCurrentTest(null);
      setCurrentStep("");
    });

    socketInstance.on("run:error", (data) => {
      console.error("📡 Run error:", data);
      setLiveProgress(null);
      setCurrentTest(null);
      setCurrentStep("");
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  // ===========================================================
  // SUITE / HISTORY API HELPERS
  // ===========================================================
  const refreshSuites = useCallback(async () => {
    try {
      const res = await fetch(`${API}/suites`);
      const data = await res.json();
      setSuites(data.suites || []);
    } catch (err) {
      console.error("Failed to load suites:", err);
    }
  }, []);

  const refreshExecutions = useCallback(async (suiteId = null) => {
    try {
      const url = suiteId ? `${API}/executions?suiteId=${suiteId}` : `${API}/executions`;
      const res = await fetch(url);
      const data = await res.json();
      setExecutions(data.executions || []);
    } catch (err) {
      console.error("Failed to load executions:", err);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "suites") {
      refreshSuites();
      refreshExecutions(historyFilterSuite || null);
    }
  }, [activeTab, historyFilterSuite, refreshSuites, refreshExecutions]);

  // ===========================================================
  // GENERATE TEST CASES (Text or Screenshot)
  // ===========================================================
  const generateTestCases = async () => {
    setLoading(true);
    try {
      let parsedTestData = {};
      try { parsedTestData = JSON.parse(testDataJson); } catch { }

      let res;
      
      if (inputMode === "screenshot" && screenshotFile) {
        // Screenshot mode
        const formData = new FormData();
        formData.append("screenshot", screenshotFile);
        formData.append("appUrl", appUrl);
        formData.append("testData", JSON.stringify(parsedTestData));

        res = await axios.post(`${API}/generate-from-screenshot`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        // Text mode
        res = await fetch(`${API}/generate-testcases`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requirement, appUrl, testData: parsedTestData }),
        });
      }

      const data = inputMode === "screenshot" ? res.data : await res.json();
      let result = data.result;

      let tcs = [];
      if (Array.isArray(result)) tcs = result;
      else if (result?.testCases && Array.isArray(result.testCases)) tcs = result.testCases;
      else {
        alert("Invalid response from backend");
        setTestcases([]);
        setLoading(false);
        return;
      }

      setTestcases(tcs);
      setOriginalTestcases(JSON.parse(JSON.stringify(tcs)));
      setEditedIds(new Set());
      setCurrentSuiteId(null);
      setCurrentSuiteName(null);
      setShowTestcases(true);
    } catch (err) {
      console.error(err);
      alert("Error generating test cases");
    }
    setLoading(false);
  };

  // ===========================================================
  // SCREENSHOT UPLOAD HANDLING
  // ===========================================================
  const handleScreenshotChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file");
      return;
    }

    setScreenshotFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setScreenshotPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const removeScreenshot = () => {
    setScreenshotFile(null);
    setScreenshotPreview(null);
  };

  // ===========================================================
  // FILE UPLOAD (Requirements doc)
  // ===========================================================
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowed.includes(file.type) && !file.name.endsWith(".pdf") && !file.name.endsWith(".docx")) {
      alert("Only PDF and DOCX files are supported.");
      return;
    }
    setFileUploading(true);
    setUploadedFileName(file.name);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await axios.post(`${API}/extract-file`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => setUploadProgress(Math.round((e.loaded * 100) / e.total)),
      });
      if (res.data.error) {
        alert("Error reading file: " + res.data.error);
        setUploadedFileName("");
      } else {
        setRequirement(res.data.text);
      }
    } catch (err) {
      console.error(err);
      alert("Upload failed");
      setUploadedFileName("");
    }
    setFileUploading(false);
  };

  const removeUploadedFile = () => {
    setUploadedFileName("");
    setRequirement("");
  };

  // ===========================================================
  // CONVERSATIONAL REFINEMENT
  // ===========================================================
  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    
    const userMsg = chatInput.trim();
    setChatMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setChatInput("");
    setRefining(true);

    try {
      // Extract test case ID from message (e.g., "TC_005")
      const tcMatch = userMsg.match(/TC_\d+/i);
      if (!tcMatch) {
        setChatMessages((prev) => [...prev, {
          role: "assistant",
          text: "Please mention a test case ID (e.g., TC_005) so I know which test to refine."
        }]);
        setRefining(false);
        return;
      }

      const tcId = tcMatch[0].toUpperCase();
      const testCase = testcases.find((tc) => tc.testCaseId === tcId);
      
      if (!testCase) {
        setChatMessages((prev) => [...prev, {
          role: "assistant",
          text: `Test case ${tcId} not found. Available test cases: ${testcases.map(t => t.testCaseId).join(", ")}`
        }]);
        setRefining(false);
        return;
      }

      const res = await fetch(`${API}/refine-testcase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCase, userMessage: userMsg }),
      });

      const data = await res.json();
      
      if (data.updatedTestCase) {
        // Update test case in state
        setTestcases((prev) =>
          prev.map((tc) => tc.testCaseId === tcId ? data.updatedTestCase : tc)
        );
        setEditedIds((prev) => new Set(prev).add(tcId));
        
        setChatMessages((prev) => [...prev, {
          role: "assistant",
          text: `✅ Updated ${tcId}! Check the test cases table to see the changes.`
        }]);
      } else {
        setChatMessages((prev) => [...prev, {
          role: "assistant",
          text: "Sorry, I couldn't update the test case. Please try rephrasing your request."
        }]);
      }
    } catch (err) {
      console.error(err);
      setChatMessages((prev) => [...prev, {
        role: "assistant",
        text: "Error: " + err.message
      }]);
    }

    setRefining(false);
  };

  // ===========================================================
  // BUG REPORT GENERATION
  // ===========================================================
  const openBugReportModal = (result) => {
    setSelectedFailure(result);
    setBugReportOpen(true);
    generateBugReport(result);
  };

  const generateBugReport = async (result) => {
    setGeneratingBugReport(true);
    try {
      const testCase = testcases.find((tc) => tc.testCaseId === result.testCaseId);
      
      const res = await fetch(`${API}/generate-bug-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testCase,
          failureReason: result.error,
          screenshot: result.screenshot,
          stepLog: result.stepLog || [],
          environment: {
            browser: "Chrome",
            os: navigator.platform,
            appUrl,
            timestamp: new Date().toISOString(),
          },
        }),
      });

      const data = await res.json();
      setGeneratedBugReport(data.bugReport || "Error generating report");
    } catch (err) {
      console.error(err);
      setGeneratedBugReport("Error: " + err.message);
    }
    setGeneratingBugReport(false);
  };

  const copyBugReport = () => {
    navigator.clipboard.writeText(generatedBugReport);
    alert("Bug report copied to clipboard!");
  };

  // ===========================================================
  // CLEAR / COPY / EXPORT
  // ===========================================================
  const clearAll = () => {
    setRequirement("");
    setTestcases([]);
    setOriginalTestcases([]);
    setEditedIds(new Set());
    setErrorLog("");
    setAnalysis("");
    setAiPrompt("");
    setAiResponse("");
    setExecutionResults([]);
    setCurrentSuiteId(null);
    setCurrentSuiteName(null);
    setScreenshotFile(null);
    setScreenshotPreview(null);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(testcases, null, 2));
    alert("Copied!");
  };

  const exportToCSV = () => {
    if (!testcases.length) return;
    const headers = ["Test ID", "Scenario", "Steps", "Expected", "Priority", "Category"];
    const rows = testcases.map((tc) => [
      tc.testCaseId, tc.title, (tc.testSteps || []).join("\n"),
      tc.expectedResult, tc.priority, tc.category || "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "testcases.csv"; a.click();
  };

  // ===========================================================
  // ERROR ANALYSIS / AI / RISK
  // ===========================================================
  const analyzeError = async () => {
    const res = await fetch(`${API}/analyze-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ errorLog }),
    });
    const data = await res.json();
    setAnalysis(data.result || "");
  };

  const askAI = async () => {
    const res = await fetch(`${API}/ai-assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: aiPrompt }),
    });
    const data = await res.json();
    setAiResponse(data.result || "");
  };

  const fetchRiskData = async () => {
    let testResults = [];
    if (executionResults.length > 0) {
      testResults = executionResults.map((r) => {
        const tc = testcases.find((t) => t.testCaseId === r.testCaseId);
        return {
          status: r.status === "Pass" ? "passed" : "failed",
          priority: tc?.priority || "Medium",
        };
      });
    } else {
      testResults = [
        { status: "passed", priority: "High" },
        { status: "failed", priority: "High" },
        { status: "failed", priority: "Medium" },
        { status: "passed", priority: "Low" },
      ];
    }
    const res = await fetch(`${API}/risk-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testResults }),
    });
    const data = await res.json();
    setRiskData(data);
  };

  // ===========================================================
  // EXECUTE / STOP
  // ===========================================================
  const executeTestCases = async () => {
    if (!appUrl) { alert("Please provide an Application URL first"); return; }

    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setCurrentRunId(runId);
    setExecuting(true);
    setStopping(false);
    setExecutionResults([]);

    // Register this run with WebSocket
    if (socket) {
      socket.emit("register_run", runId);
    }

    try {
      const res = await fetch(`${API}/execute-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testcases,
          appUrl,
          headless: headlessMode,
          runId,
          suiteId: currentSuiteId,
          suiteName: currentSuiteName,
          selfHealEnabled,
        }),
      });
      const data = await res.json();
      setExecutionResults(data.results || []);
      setShowResults(true);
      setShowTestcases(false);
    } catch (err) {
      console.error(err);
      alert("Execution failed");
    }

    setExecuting(false);
    setStopping(false);
    setCurrentRunId(null);
  };

  const stopExecution = async () => {
    if (!currentRunId) return;
    if (!window.confirm("Stop the running execution? Already-completed test results will be preserved.")) return;
    setStopping(true);
    try {
      await fetch(`${API}/stop-execution`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: currentRunId }),
      });
    } catch (err) { console.error("Failed to send stop signal:", err); }
  };

  // ===========================================================
  // INLINE EDITING
  // ===========================================================
  const startEdit = (tcId, field, stepIdx, currentValue) => {
    setEditingCell({ tcId, field, stepIdx });
    setEditValue(currentValue ?? "");
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const saveEdit = () => {
    if (!editingCell) return;
    const { tcId, field, stepIdx } = editingCell;

    setTestcases((prev) =>
      prev.map((tc) => {
        if (tc.testCaseId !== tcId) return tc;
        const updated = { ...tc };

        if (field === "testSteps" && typeof stepIdx === "number") {
          if (editValue.includes("\n")) {
            updated.testSteps = editValue.split("\n").filter((s) => s.trim());
          } else {
            const newSteps = [...(updated.testSteps || [])];
            newSteps[stepIdx] = editValue;
            updated.testSteps = newSteps;
          }
        } else if (field === "testStepsAll") {
          updated.testSteps = editValue.split("\n").filter((s) => s.trim());
        } else {
          updated[field] = editValue;
        }
        return updated;
      })
    );

    setEditedIds((prev) => new Set(prev).add(tcId));
    setEditingCell(null);
    setEditValue("");
  };

  const resetTestCase = (tcId) => {
    const original = originalTestcases.find((tc) => tc.testCaseId === tcId);
    if (!original) return;
    setTestcases((prev) => prev.map((tc) => (tc.testCaseId === tcId ? JSON.parse(JSON.stringify(original)) : tc)));
    setEditedIds((prev) => {
      const next = new Set(prev);
      next.delete(tcId);
      return next;
    });
  };

  // ===========================================================
  // SUITE OPERATIONS
  // ===========================================================
  const openSaveDialog = () => {
    if (!testcases.length) return;
    setSuiteName(currentSuiteName || "");
    setSuiteDescription("");
    setSaveDialogOpen(true);
  };

  const saveAsSuite = async () => {
    if (!suiteName.trim()) { alert("Suite name is required"); return; }
    try {
      let parsedTestData = {};
      try { parsedTestData = JSON.parse(testDataJson); } catch { }

      const isUpdate = currentSuiteId && currentSuiteName === suiteName.trim();
      const url = isUpdate ? `${API}/suites/${currentSuiteId}` : `${API}/suites`;
      const method = isUpdate ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: suiteName.trim(),
          description: suiteDescription,
          appUrl,
          testData: parsedTestData,
          testcases,
        }),
      });
      const data = await res.json();
      if (data.suite) {
        setCurrentSuiteId(data.suite.id);
        setCurrentSuiteName(data.suite.name);
        setSaveDialogOpen(false);
        alert(isUpdate ? "Suite updated!" : "Suite saved!");
      } else {
        alert(data.error || "Save failed");
      }
    } catch (err) {
      console.error(err);
      alert("Save failed");
    }
  };

  const loadSuite = async (suiteId) => {
    try {
      const res = await fetch(`${API}/suites/${suiteId}`);
      const data = await res.json();
      if (!data.suite) return;
      const s = data.suite;
      setRequirement("");
      setAppUrl(s.appUrl || "");
      setTestDataJson(JSON.stringify(s.testData || {}, null, 2));
      setTestcases(s.testcases || []);
      setOriginalTestcases(JSON.parse(JSON.stringify(s.testcases || [])));
      setEditedIds(new Set());
      setCurrentSuiteId(s.id);
      setCurrentSuiteName(s.name);
      setExecutionResults([]);
      setShowTestcases(true);
      setActiveTab("test");
    } catch (err) {
      console.error(err);
      alert("Failed to load suite");
    }
  };

  const deleteSuite = async (suiteId, suiteN) => {
    if (!window.confirm(`Delete suite "${suiteN}"? This cannot be undone.`)) return;
    try {
      await fetch(`${API}/suites/${suiteId}`, { method: "DELETE" });
      if (currentSuiteId === suiteId) {
        setCurrentSuiteId(null);
        setCurrentSuiteName(null);
      }
      refreshSuites();
    } catch (err) { console.error(err); }
  };

  const viewExecution = async (execId) => {
    try {
      const res = await fetch(`${API}/executions/${execId}`);
      const data = await res.json();
      if (data.execution) {
        setSelectedExecution(data.execution);
        setHistoryDetailOpen(true);
      }
    } catch (err) { console.error(err); }
  };

  const deleteExecution = async (execId) => {
    if (!window.confirm("Delete this execution from history?")) return;
    try {
      await fetch(`${API}/executions/${execId}`, { method: "DELETE" });
      refreshExecutions(historyFilterSuite || null);
    } catch (err) { console.error(err); }
  };

  // ===========================================================
  // STYLES
  // ===========================================================
  const filtered =
    priorityFilter === "All"
      ? testcases
      : testcases.filter((tc) => (tc.priority || "").toLowerCase() === priorityFilter.toLowerCase());

  const COLORS = ["#4caf50", "#f44336"];
  const primaryBtn = {
    borderRadius: "25px", background: "linear-gradient(45deg, #42a5f5, #478ed1)",
    textTransform: "none", fontWeight: "bold", boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
    "&:hover": { transform: "translateY(-2px)", boxShadow: "0 8px 20px rgba(0,0,0,0.4)" },
  };
  const secondaryBtn = {
    borderRadius: "25px", background: "linear-gradient(45deg, #5c6bc0, #7986cb)",
    textTransform: "none", color: "white",
    "&:hover": { transform: "translateY(-2px)" },
  };
  const successBtn = {
    borderRadius: "25px", background: "linear-gradient(45deg, #43a047, #66bb6a)",
    textTransform: "none", color: "white", fontWeight: "bold",
    "&:hover": { transform: "translateY(-2px)" },
  };
  const thStyle = { padding: "12px", border: "1px solid rgba(255,255,255,0.3)", textAlign: "left", color: "white" };
  const tdStyle = { padding: "10px", border: "1px solid rgba(255,255,255,0.2)", color: "white", verticalAlign: "top" };
  const editableTdStyle = { ...tdStyle, cursor: "pointer", transition: "background 0.15s ease" };
  const glassCard = {
    borderRadius: 4, backdropFilter: "blur(20px)", background: "rgba(255,255,255,0.15)",
    boxShadow: "0 8px 30px rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.2)", color: "white",
  };
  const inputSx = {
    "& .MuiOutlinedInput-root": { background: "rgba(255,255,255,0.15)", borderRadius: "12px", color: "white" },
    "& .MuiInputLabel-root": { color: "rgba(255,255,255,0.9)", fontWeight: 500 },
    "& .MuiInputLabel-root.Mui-focused": { color: "#42a5f5" },
    "& .MuiInputBase-input::placeholder": { color: "rgba(255,255,255,0.7)" },
  };

  const formatDate = (ms) => {
    const d = new Date(ms);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  const SectionHeader = ({ title, count, isOpen, onToggle, extra }) => (
    <Box
      onClick={onToggle}
      sx={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "rgba(255,255,255,0.12)", borderRadius: "12px", padding: "8px 14px",
        mb: isOpen ? 1.5 : 0, cursor: "pointer", transition: "background 0.2s ease",
        "&:hover": { background: "rgba(255,255,255,0.2)" },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Typography variant="h6" color="white" sx={{ fontSize: "1rem", fontWeight: 600 }}>{title}</Typography>
        {count !== undefined && (
          <Chip label={count} size="small" sx={{ background: "rgba(255,255,255,0.25)", color: "white", fontWeight: 600 }} />
        )}
        {extra}
      </Box>
      <MuiTooltip title={isOpen ? "Collapse" : "Expand"}>
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          sx={{
            color: "white", background: "rgba(255,255,255,0.15)",
            transition: "transform 0.3s ease",
            transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
            "&:hover": { background: "rgba(255,255,255,0.3)" },
          }}
        >
          <ExpandMoreIcon />
        </IconButton>
      </MuiTooltip>
    </Box>
  );

  const EditableCell = ({ tcId, field, value, multiline = false, stepIdx }) => {
    const isEditing = editingCell &&
      editingCell.tcId === tcId &&
      editingCell.field === field &&
      editingCell.stepIdx === stepIdx;

    if (isEditing) {
      return (
        <TextField
          autoFocus
          fullWidth
          multiline={multiline}
          minRows={multiline ? 3 : 1}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !multiline) { e.preventDefault(); saveEdit(); }
            if (e.key === "Escape") cancelEdit();
            if (e.key === "Enter" && multiline && (e.ctrlKey || e.metaKey)) saveEdit();
          }}
          size="small"
          sx={{
            "& .MuiOutlinedInput-root": {
              background: "rgba(255,255,255,0.95)",
              color: "#222",
              fontSize: "13px",
            },
          }}
        />
      );
    }

    return (
      <Box
        onClick={() => startEdit(tcId, field, stepIdx, value)}
        sx={{
          minHeight: 24, padding: "4px 6px", borderRadius: "6px",
          "&:hover": { background: "rgba(255,255,255,0.15)", outline: "1px dashed rgba(255,255,255,0.4)" },
        }}
      >
        {value || <span style={{ color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>Click to edit…</span>}
      </Box>
    );
  };

  return (
    <Box sx={{ display: "flex", height: "100vh", background: "linear-gradient(135deg, #1e3c72, #2a5298)" }}>
      {/* SIDEBAR */}
      <Box
        sx={{
          width: 240, p: 2, color: "white",
          background: "rgba(255,255,255,0.1)", backdropFilter: "blur(15px)",
          borderRight: "1px solid rgba(255,255,255,0.2)",
          "& .MuiButton-root": {
            color: "white", justifyContent: "flex-start", borderRadius: "10px",
            marginBottom: "8px", transition: "all 0.3s ease",
            "&:hover": { background: "rgba(255,255,255,0.2)", transform: "translateX(5px)" },
          },
          "& .active": {
            background: "rgba(255,255,255,0.25)", borderRadius: "10px",
            boxShadow: "0 0 10px rgba(255,255,255,0.3)",
          },
        }}
      >
        <Typography variant="h6" mb={2}>🚀 TestForge AI</Typography>
        <Button startIcon={<DashboardIcon />} fullWidth className={activeTab === "test" ? "active" : ""} onClick={() => setActiveTab("test")}>Test Generator</Button>
        <Button startIcon={<FolderIcon />} fullWidth className={activeTab === "suites" ? "active" : ""} onClick={() => setActiveTab("suites")}>Suites & History</Button>
        <Button startIcon={<BugReportIcon />} fullWidth className={activeTab === "analysis" ? "active" : ""} onClick={() => setActiveTab("analysis")}>Error Analysis</Button>
        <Button startIcon={<ChatIcon />} fullWidth className={activeTab === "ai" ? "active" : ""} onClick={() => setActiveTab("ai")}>AI Assistant</Button>
        <Button startIcon={<AssessmentIcon />} fullWidth className={activeTab === "risk" ? "active" : ""} onClick={() => { setActiveTab("risk"); fetchRiskData(); }}>Risk Dashboard</Button>
      </Box>

      {/* MAIN */}
      <Box sx={{ flex: 1, p: 3, overflow: "auto", position: "relative" }}>
        {/* LIVE PROGRESS OVERLAY */}
        {liveProgress && (
          <Paper
            sx={{
              position: "fixed",
              top: 80,
              right: 20,
              zIndex: 1000,
              p: 2,
              width: 350,
              background: "rgba(255,255,255,0.95)",
              backdropFilter: "blur(10px)",
              borderRadius: "12px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            }}
          >
            <Typography variant="h6" sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              ⚡ Live Execution Progress
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={1}>
              Completed: {liveProgress.completed} / {liveProgress.total}
            </Typography>
            <LinearProgress
              variant="determinate"
              value={(liveProgress.completed / liveProgress.total) * 100}
              sx={{ mb: 2, height: 8, borderRadius: 5 }}
            />
            {currentTest && (
              <>
                <Typography variant="body2" fontWeight={600} color="primary">
                  Current: {currentTest.testCaseId}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {currentTest.title}
                </Typography>
              </>
            )}
            {currentStep && (
              <Typography variant="caption" display="block" mt={1} sx={{ fontStyle: "italic", color: "text.secondary" }}>
                Step: {currentStep}
              </Typography>
            )}
          </Paper>
        )}

        {/* ============ TEST GENERATOR ============ */}
        {activeTab === "test" && (
          <Box sx={{ display: "flex", gap: 2 }}>
            {/* MAIN CONTENT */}
            <Box sx={{ flex: refinementOpen ? 0.7 : 1, transition: "all 0.3s ease" }}>
              <Card sx={glassCard}>
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
                    <Typography variant="h6" color="white">Test Case Generator</Typography>
                    {currentSuiteName && (
                      <Chip
                        icon={<FolderIcon sx={{ color: "white !important" }} />}
                        label={`Suite: ${currentSuiteName}`}
                        sx={{ background: "rgba(66,165,245,0.4)", color: "white", fontWeight: 600 }}
                      />
                    )}
                    {testcases.length > 0 && (
                      <Button
                        startIcon={<ChatIcon />}
                        onClick={() => setRefinementOpen(!refinementOpen)}
                        sx={{
                          background: refinementOpen ? "rgba(156,39,176,0.4)" : "rgba(255,255,255,0.2)",
                          color: "white",
                          borderRadius: "20px",
                          textTransform: "none",
                          "&:hover": { background: "rgba(156,39,176,0.6)" },
                        }}
                      >
                        {refinementOpen ? "Close Chat" : "Refine with AI"}
                      </Button>
                    )}
                  </Box>

                  <Box mt={2}>
                    <TextField
                      fullWidth label="Application URL" placeholder="https://example.com"
                      value={appUrl} onChange={(e) => setAppUrl(e.target.value)} sx={inputSx}
                    />
                  </Box>

                  {/* INPUT MODE TOGGLE */}
                  <Box mt={2} sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Typography color="white" fontSize={14}>Input Mode:</Typography>
                    <ToggleButtonGroup
                      value={inputMode}
                      exclusive
                      onChange={(e, newMode) => newMode && setInputMode(newMode)}
                      size="small"
                    >
                      <ToggleButton value="text" sx={{ color: "white", "&.Mui-selected": { background: "rgba(66,165,245,0.5)", color: "white" } }}>
                        <TextFieldsIcon sx={{ mr: 0.5 }} fontSize="small" />
                        Text Requirement
                      </ToggleButton>
                      <ToggleButton value="screenshot" sx={{ color: "white", "&.Mui-selected": { background: "rgba(156,39,176,0.5)", color: "white" } }}>
                        <CameraAltIcon sx={{ mr: 0.5 }} fontSize="small" />
                        Screenshot
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </Box>

                  {/* TEXT MODE */}
                  {inputMode === "text" && (
                    <>
                      <TextField
                        fullWidth multiline rows={3}
                        value={requirement} onChange={(e) => setRequirement(e.target.value)}
                        placeholder="Paste requirement / user story / acceptance criteria here..."
                        sx={{ mt: 2, ...inputSx }}
                      />

                      {/* File upload */}
                      <Box mt={2} sx={{ display: "flex", my: 2, alignItems: "center", gap: 2, padding: "12px 16px", borderRadius: "12px", background: "rgba(255,255,255,0.1)", border: "1px dashed rgba(255,255,255,0.4)" }}>
                        <Typography color="rgba(255,255,255,0.8)" fontSize={14}>📎 Upload requirement file:</Typography>
                        <Button variant="outlined" component="label" disabled={fileUploading}
                          sx={{ borderRadius: "20px", color: "white", borderColor: "rgba(255,255,255,0.5)", textTransform: "none", fontSize: "13px", "&:hover": { borderColor: "white", background: "rgba(255,255,255,0.1)" } }}>
                          {fileUploading ? "Reading file..." : "Choose File"}
                          <input type="file" hidden accept=".pdf,.docx" onChange={handleFileUpload} />
                        </Button>
                        {uploadedFileName && (
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1, background: "rgba(255,255,255,0.15)", padding: "4px 10px", borderRadius: "10px" }}>
                            <Typography color="white" fontSize={13} sx={{ maxWidth: "150px", overflow: "hidden", textOverflow: "ellipsis" }}>
                              ✅ {uploadedFileName}
                            </Typography>
                            <MuiTooltip title="Remove file"><CloseIcon onClick={removeUploadedFile} sx={{ fontSize: 16, cursor: "pointer", "&:hover": { color: "#ff5252" } }} /></MuiTooltip>
                          </Box>
                        )}
                      </Box>

                      {fileUploading && (
                        <Box mt={1}>
                          <LinearProgress variant="determinate" value={uploadProgress} sx={{ height: 8, borderRadius: 5, background: "rgba(255,255,255,0.2)", "& .MuiLinearProgress-bar": { background: "linear-gradient(90deg, #42a5f5, #66bb6a)" } }} />
                          <Typography fontSize={12} color="white" mt={0.5}>Uploading... {uploadProgress}%</Typography>
                        </Box>
                      )}
                    </>
                  )}

                  {/* SCREENSHOT MODE */}
                  {inputMode === "screenshot" && (
                    <Box mt={2}>
                      {!screenshotPreview ? (
                        <Box
                          sx={{
                            border: "2px dashed rgba(255,255,255,0.4)",
                            borderRadius: "12px",
                            p: 4,
                            textAlign: "center",
                            background: "rgba(255,255,255,0.05)",
                            cursor: "pointer",
                            transition: "all 0.3s ease",
                            "&:hover": { background: "rgba(255,255,255,0.1)", borderColor: "rgba(255,255,255,0.6)" },
                          }}
                          component="label"
                        >
                          <ImageIcon sx={{ fontSize: 48, color: "rgba(255,255,255,0.6)", mb: 1 }} />
                          <Typography color="white" variant="h6">Upload UI Screenshot</Typography>
                          <Typography color="rgba(255,255,255,0.7)" fontSize={13} mt={1}>
                            AI will analyze the screenshot and generate test cases
                          </Typography>
                          <input type="file" hidden accept="image/*" onChange={handleScreenshotChange} />
                        </Box>
                      ) : (
                        <Box sx={{ position: "relative", border: "2px solid rgba(66,165,245,0.6)", borderRadius: "12px", p: 1, background: "rgba(255,255,255,0.05)" }}>
                          <img src={screenshotPreview} alt="Preview" style={{ width: "100%", borderRadius: "8px", display: "block" }} />
                          <IconButton
                            onClick={removeScreenshot}
                            sx={{
                              position: "absolute",
                              top: 10,
                              right: 10,
                              background: "rgba(255,255,255,0.9)",
                              "&:hover": { background: "white" },
                            }}
                            size="small"
                          >
                            <CloseIcon />
                          </IconButton>
                        </Box>
                      )}
                    </Box>
                  )}

                  {/* TEST DATA (collapsed accordion - same for both modes) */}
                  <Box mt={2} sx={{ background: "rgba(255,255,255,0.08)", borderRadius: "12px", overflow: "hidden" }}>
                    <Box
                      onClick={() => document.getElementById("test-data-content").classList.toggle("hidden")}
                      sx={{ p: 1.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", "&:hover": { background: "rgba(255,255,255,0.05)" } }}
                    >
                      <Typography color="white">🔑 Test Data (credentials, sample inputs) — JSON format</Typography>
                      <ExpandMoreIcon sx={{ color: "white" }} />
                    </Box>
                    <Box id="test-data-content" className="hidden" sx={{ p: 2, pt: 0, display: "none", "&:not(.hidden)": { display: "block" } }}>
                      <Typography fontSize={12} color="rgba(255,255,255,0.7)" mb={1}>
                        Provide credentials and sample data for AI to generate executable tests.
                      </Typography>
                      <TextField fullWidth multiline rows={4} value={testDataJson} onChange={(e) => setTestDataJson(e.target.value)} sx={inputSx} />
                    </Box>
                  </Box>

                  <Box mt={2} display="flex" gap={2} flexWrap="wrap" alignItems="center">
                    <Button
                      variant="contained"
                      startIcon={inputMode === "screenshot" ? <CameraAltIcon /> : <BoltIcon />}
                      onClick={generateTestCases}
                      sx={primaryBtn}
                      disabled={loading || (inputMode === "screenshot" && !screenshotFile)}
                    >
                      {loading ? "Generating..." : inputMode === "screenshot" ? "Generate from Screenshot" : "Generate"}
                    </Button>
                    <Button variant="contained" startIcon={<CleaningServicesIcon />} onClick={clearAll} sx={secondaryBtn}>Clear</Button>

                    {testcases.length > 0 && (
                      <>
                        <Button variant="contained" startIcon={<ContentCopyIcon />} onClick={copyToClipboard} sx={secondaryBtn}>Copy</Button>
                        <Button variant="contained" startIcon={<AssessmentIcon />} onClick={exportToCSV} sx={successBtn}>Export CSV</Button>
                        <Button variant="contained" startIcon={<SaveIcon />} onClick={openSaveDialog}
                          sx={{ borderRadius: "25px", background: "linear-gradient(45deg, #00897b, #26a69a)", textTransform: "none", color: "white", fontWeight: "bold", "&:hover": { transform: "translateY(-2px)" } }}>
                          {currentSuiteId ? "Save / Update Suite" : "Save as Suite"}
                        </Button>
                        <Button variant="contained" onClick={executeTestCases} disabled={executing}
                          sx={{ background: "#ff9800", "&:hover": { background: "#fb8c00" }, borderRadius: "20px", textTransform: "none" }}>
                          {executing ? "Running..." : "Run Test Cases"}
                        </Button>
                      </>
                    )}

                    {executing && (
                      <Button variant="contained" startIcon={<StopCircleIcon />} onClick={stopExecution} disabled={stopping}
                        sx={{
                          background: "linear-gradient(45deg, #e53935, #ff5252)",
                          "&:hover": { background: "linear-gradient(45deg, #c62828, #e53935)", transform: "translateY(-2px)" },
                          borderRadius: "20px", textTransform: "none", fontWeight: "bold", color: "white",
                        }}>
                        {stopping ? "Stopping..." : "Stop Execution"}
                      </Button>
                    )}

                    {testcases.length > 0 && (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 2, color: "white", flexWrap: "wrap" }}>
                        <FormControlLabel
                          control={<Switch checked={selfHealEnabled} onChange={(e) => setSelfHealEnabled(e.target.checked)} />}
                          label={<span style={{ fontSize: 13, color: "white" }}>🩹 Self-heal</span>}
                        />
                        <FormControlLabel
                          control={<Switch checked={headlessMode} onChange={(e) => setHeadlessMode(e.target.checked)} />}
                          label={<span style={{ fontSize: 13, color: "white" }}>Headless</span>}
                        />
                      </Box>
                    )}
                  </Box>

                  {/* SCREENSHOT LIGHTBOX */}
                  <Dialog
                    open={Boolean(selectedImage)} onClose={() => setSelectedImage(null)} maxWidth={false}
                    PaperProps={{ sx: { background: "transparent", boxShadow: "none", overflow: "visible", margin: 2 } }}
                    BackdropProps={{ sx: { backgroundColor: "rgba(0,0,0,0.85)" } }}
                  >
                    <Box onClick={() => setSelectedImage(null)} sx={{ cursor: "pointer", position: "relative", display: "flex", justifyContent: "center", alignItems: "center" }}>
                      <IconButton onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }}
                        sx={{ position: "absolute", top: -10, right: -10, background: "rgba(255,255,255,0.9)", color: "#333", "&:hover": { background: "white" }, zIndex: 2 }} size="small">
                        <CloseIcon />
                      </IconButton>
                      {selectedImage && (
                        <img src={selectedImage} alt="Screenshot" style={{ maxWidth: "92vw", maxHeight: "88vh", borderRadius: "10px", boxShadow: "0 10px 40px rgba(0,0,0,0.5)", display: "block" }} />
                      )}
                    </Box>
                  </Dialog>

                  {/* GENERATED TEST CASES TABLE */}
                  {!loading && testcases.length > 0 && (
                    <Box mt={3}>
                      <SectionHeader
                        title="📋 Generated Test Cases"
                        count={filtered.length}
                        isOpen={showTestcases}
                        onToggle={() => setShowTestcases((p) => !p)}
                        extra={editedIds.size > 0 && (
                          <Chip icon={<EditIcon sx={{ color: "white !important" }} />} label={`${editedIds.size} edited`} size="small" sx={{ background: "rgba(255,193,7,0.4)", color: "white" }} />
                        )}
                      />

                      <Collapse in={showTestcases} timeout={300} unmountOnExit>
                        <Box>
                          <Box mt={1} mb={1} sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                            <Typography color="white" fontSize={14}>Filter by Priority:</Typography>
                            <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} size="small"
                              sx={{ background: "rgba(255,255,255,0.2)", color: "white", borderRadius: "8px" }}>
                              <MenuItem value="All">All</MenuItem>
                              <MenuItem value="High">High</MenuItem>
                              <MenuItem value="Medium">Medium</MenuItem>
                              <MenuItem value="Low">Low</MenuItem>
                            </Select>
                            <Typography color="rgba(255,255,255,0.7)" fontSize={12} fontStyle="italic">
                              💡 Click any cell to edit. Press Enter to save, Esc to cancel.
                            </Typography>
                          </Box>

                          <table style={{ width: "100%", marginTop: "10px", borderCollapse: "collapse", background: "rgba(255,255,255,0.1)", backdropFilter: "blur(10px)", borderRadius: "10px" }}>
                            <thead>
                              <tr style={{ background: "rgba(255,255,255,0.25)", color: "white" }}>
                                <th style={thStyle}>ID</th>
                                <th style={thStyle}>Scenario</th>
                                <th style={thStyle}>Steps</th>
                                <th style={thStyle}>Expected</th>
                                <th style={thStyle}>Priority</th>
                                <th style={thStyle}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filtered.map((tc, i) => {
                                const isEdited = editedIds.has(tc.testCaseId);
                                return (
                                  <tr key={tc.testCaseId || i} style={{ borderBottom: "1px solid rgba(255,255,255,0.2)", background: isEdited ? "rgba(255,193,7,0.08)" : "transparent" }}>
                                    <td style={tdStyle}>
                                      {tc.testCaseId}
                                      {isEdited && <MuiTooltip title="Edited"><EditIcon sx={{ fontSize: 14, ml: 0.5, color: "#ffc107", verticalAlign: "middle" }} /></MuiTooltip>}
                                    </td>
                                    <td style={editableTdStyle}>
                                      <EditableCell tcId={tc.testCaseId} field="title" value={tc.title} multiline />
                                    </td>
                                    <td style={editableTdStyle}>
                                      <EditableCell
                                        tcId={tc.testCaseId}
                                        field="testStepsAll"
                                        value={Array.isArray(tc.testSteps) ? tc.testSteps.join("\n") : (tc.testSteps || "")}
                                        multiline
                                      />
                                    </td>
                                    <td style={editableTdStyle}>
                                      <EditableCell tcId={tc.testCaseId} field="expectedResult" value={tc.expectedResult} multiline />
                                    </td>
                                    <td style={editableTdStyle}>
                                      <EditableCell tcId={tc.testCaseId} field="priority" value={tc.priority} />
                                    </td>
                                    <td style={tdStyle}>
                                      {isEdited && (
                                        <MuiTooltip title="Reset to original">
                                          <IconButton size="small" onClick={() => resetTestCase(tc.testCaseId)} sx={{ color: "#ffc107" }}>
                                            <RestoreIcon fontSize="small" />
                                          </IconButton>
                                        </MuiTooltip>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </Box>
                      </Collapse>
                    </Box>
                  )}

                  {executing && !liveProgress && (
                    <Box mt={3}>
                      <Typography color="white" mb={1}>⚙️ Executing test cases on the live application...</Typography>
                      <LinearProgress sx={{ borderRadius: 5, height: 6 }} />
                    </Box>
                  )}

                  {/* EXECUTION RESULTS TABLE */}
                  {executionResults.length > 0 && (
                    <Box mt={3}>
                      <SectionHeader
                        title="🧪 Execution Results"
                        isOpen={showResults}
                        onToggle={() => setShowResults((p) => !p)}
                        extra={
                          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                            <Chip label={`Pass: ${executionResults.filter((r) => r.status === "Pass").length}`} size="small" sx={{ background: "rgba(76,175,80,0.4)", color: "white", fontWeight: 600 }} />
                            <Chip label={`Fail: ${executionResults.filter((r) => r.status === "Fail").length}`} size="small" sx={{ background: "rgba(244,67,54,0.4)", color: "white", fontWeight: 600 }} />
                            {executionResults.filter((r) => r.status === "Skipped").length > 0 && (
                              <Chip label={`Skipped: ${executionResults.filter((r) => r.status === "Skipped").length}`} size="small" sx={{ background: "rgba(158,158,158,0.5)", color: "white", fontWeight: 600 }} />
                            )}
                            {executionResults.filter((r) => r.healed).length > 0 && (
                              <Chip
                                icon={<HealingIcon sx={{ color: "white !important", fontSize: 16 }} />}
                                label={`Healed: ${executionResults.filter((r) => r.healed).length}`}
                                size="small"
                                sx={{ background: "rgba(156,39,176,0.5)", color: "white", fontWeight: 600 }}
                              />
                            )}
                          </Box>
                        }
                      />

                      <Collapse in={showResults} timeout={300} unmountOnExit>
                        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px" }}>
                          <thead>
                            <tr style={{ background: "rgba(255,255,255,0.25)" }}>
                              <th style={thStyle}>Test Case ID</th>
                              <th style={thStyle}>Title</th>
                              <th style={thStyle}>Status</th>
                              <th style={thStyle}>Screenshot</th>
                              <th style={thStyle}>Failure Reason</th>
                              <th style={thStyle}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {executionResults.map((r, i) => {
                              const rowBg = r.status === "Fail" ? "rgba(255,0,0,0.15)"
                                : r.status === "Skipped" ? "rgba(158,158,158,0.15)"
                                : r.healed ? "rgba(156,39,176,0.12)" : "transparent";
                              const statusColor = r.status === "Pass" ? "#4caf50"
                                : r.status === "Fail" ? "#f44336" : "#bdbdbd";
                              return (
                                <tr key={i} style={{ background: rowBg, borderBottom: "1px solid rgba(255,255,255,0.2)" }}>
                                  <td style={tdStyle}>{r.testCaseId}</td>
                                  <td style={tdStyle}>{r.title || ""}</td>
                                  <td style={{ ...tdStyle, fontWeight: "bold", color: statusColor }}>
                                    {r.status}
                                    {r.healed && (
                                      <MuiTooltip title="View healing details">
                                        <IconButton size="small" onClick={() => setHealInfoDialog(r)} sx={{ ml: 0.5, color: "#ce93d8" }}>
                                          <HealingIcon fontSize="small" />
                                        </IconButton>
                                      </MuiTooltip>
                                    )}
                                  </td>
                                  <td style={tdStyle}>
                                    {r.screenshot && (
                                      <img src={`${API}${r.screenshot}`} alt="screenshot"
                                        style={{ width: "120px", borderRadius: "8px", cursor: "pointer", border: "1px solid rgba(255,255,255,0.3)", transition: "0.2s" }}
                                        onClick={() => setSelectedImage(`${API}${r.screenshot}`)}
                                        onMouseOver={(e) => (e.target.style.transform = "scale(1.05)")}
                                        onMouseOut={(e) => (e.target.style.transform = "scale(1)")}
                                      />
                                    )}
                                  </td>
                                  <td style={tdStyle}>
                                    {r.status === "Fail" ? <span style={{ color: "#ff8a80", fontSize: 13 }}>{r.error}</span>
                                      : r.status === "Skipped" ? <span style={{ color: "#bdbdbd", fontSize: 13, fontStyle: "italic" }}>{r.error}</span>
                                      : <span style={{ color: "#81c784" }}>No issues{r.healed && " (healed)"}</span>}
                                  </td>
                                  <td style={tdStyle}>
                                    {r.status === "Fail" && (
                                      <MuiTooltip title="Generate Bug Report">
                                        <IconButton size="small" onClick={() => openBugReportModal(r)} sx={{ color: "#ff5252" }}>
                                          <BugReportIcon fontSize="small" />
                                        </IconButton>
                                      </MuiTooltip>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </Collapse>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Box>

            {/* CONVERSATIONAL REFINEMENT SIDEBAR */}
            {refinementOpen && (
              <Paper
                sx={{
                  width: 400,
                  height: "calc(100vh - 100px)",
                  display: "flex",
                  flexDirection: "column",
                  background: "rgba(255,255,255,0.95)",
                  backdropFilter: "blur(10px)",
                  borderRadius: "12px",
                  overflow: "hidden",
                }}
              >
                <Box sx={{ p: 2, borderBottom: "1px solid #ddd", background: "linear-gradient(135deg, #9c27b0, #ba68c8)", color: "white" }}>
                  <Typography variant="h6" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <ChatIcon /> Refine Test Cases
                  </Typography>
                  <Typography variant="caption">
                    Tell me which test to edit (e.g., "TC_005 should use invalid password")
                  </Typography>
                </Box>

                <Box sx={{ flex: 1, overflowY: "auto", p: 2 }}>
                  {chatMessages.length === 0 && (
                    <Typography color="text.secondary" fontSize={13} textAlign="center" mt={4}>
                      No messages yet. Start a conversation!
                    </Typography>
                  )}
                  {chatMessages.map((msg, i) => (
                    <Box
                      key={i}
                      sx={{
                        mb: 1.5,
                        p: 1.5,
                        borderRadius: "12px",
                        background: msg.role === "user" ? "linear-gradient(135deg, #42a5f5, #478ed1)" : "rgba(0,0,0,0.05)",
                        color: msg.role === "user" ? "white" : "black",
                        alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                        maxWidth: "85%",
                      }}
                    >
                      <Typography fontSize={13}>{msg.text}</Typography>
                    </Box>
                  ))}
                  {refining && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "#9c27b0" }}>
                      <CircularProgress size={16} />
                      <Typography fontSize={13}>AI is thinking...</Typography>
                    </Box>
                  )}
                </Box>

                <Box sx={{ p: 2, borderTop: "1px solid #ddd", display: "flex", gap: 1 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="e.g., TC_003 password should be wrong123"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && sendChatMessage()}
                    disabled={refining}
                  />
                  <IconButton onClick={sendChatMessage} disabled={refining || !chatInput.trim()} color="primary">
                    <SendIcon />
                  </IconButton>
                </Box>
              </Paper>
            )}
          </Box>
        )}

        {/* ============ SUITES & HISTORY ============ */}
        {activeTab === "suites" && (
          <Card sx={glassCard}>
            <CardContent>
              <Typography variant="h6" color="white" mb={2}>📁 Suites & Execution History</Typography>

              <Typography variant="subtitle1" color="white" mt={1} mb={1} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <FolderIcon /> Saved Suites
                <Chip label={suites.length} size="small" sx={{ background: "rgba(255,255,255,0.25)", color: "white" }} />
              </Typography>

              {suites.length === 0 && (
                <Typography color="rgba(255,255,255,0.6)" fontSize={14} fontStyle="italic" mt={1}>
                  No suites saved yet. Generate test cases and click "Save as Suite" to add one.
                </Typography>
              )}

              {suites.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "8px" }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.25)" }}>
                      <th style={thStyle}>Name</th>
                      <th style={thStyle}>Description</th>
                      <th style={thStyle}>App URL</th>
                      <th style={thStyle}>Tests</th>
                      <th style={thStyle}>Updated</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suites.map((s) => (
                      <tr key={s.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.2)" }}>
                        <td style={tdStyle}><strong>{s.name}</strong></td>
                        <td style={tdStyle}>{s.description || <span style={{ color: "rgba(255,255,255,0.4)" }}>—</span>}</td>
                        <td style={{ ...tdStyle, fontSize: 12, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.appUrl || "—"}</td>
                        <td style={tdStyle}>{s.testCount}</td>
                        <td style={{ ...tdStyle, fontSize: 12 }}>{formatDate(s.updatedAt)}</td>
                        <td style={tdStyle}>
                          <MuiTooltip title="Load suite">
                            <IconButton size="small" onClick={() => loadSuite(s.id)} sx={{ color: "#66bb6a" }}>
                              <PlayArrowIcon fontSize="small" />
                            </IconButton>
                          </MuiTooltip>
                          <MuiTooltip title="View history">
                            <IconButton size="small" onClick={() => { setHistoryFilterSuite(s.id); }} sx={{ color: "#42a5f5" }}>
                              <HistoryIcon fontSize="small" />
                            </IconButton>
                          </MuiTooltip>
                          <MuiTooltip title="Delete suite">
                            <IconButton size="small" onClick={() => deleteSuite(s.id, s.name)} sx={{ color: "#ef5350" }}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </MuiTooltip>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <Typography variant="subtitle1" color="white" mt={4} mb={1} sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <HistoryIcon /> Execution History
                <Chip label={executions.length} size="small" sx={{ background: "rgba(255,255,255,0.25)", color: "white" }} />
                {historyFilterSuite && (
                  <Chip
                    label={`Filtered: ${suites.find((s) => s.id === historyFilterSuite)?.name || "suite"}`}
                    size="small"
                    onDelete={() => setHistoryFilterSuite("")}
                    sx={{ background: "rgba(66,165,245,0.3)", color: "white" }}
                  />
                )}
              </Typography>

              {executions.length === 0 && (
                <Typography color="rgba(255,255,255,0.6)" fontSize={14} fontStyle="italic" mt={1}>
                  No executions recorded yet. Run a test suite to log history here.
                </Typography>
              )}

              {executions.length > 0 && (
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "8px" }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.25)" }}>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Suite</th>
                      <th style={thStyle}>Total</th>
                      <th style={thStyle}>Pass</th>
                      <th style={thStyle}>Fail</th>
                      <th style={thStyle}>Healed</th>
                      <th style={thStyle}>Pass Rate</th>
                      <th style={thStyle}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executions.map((e) => {
                      const sm = e.summary || {};
                      const passRate = sm.passRate ?? 0;
                      const passColor = passRate >= 80 ? "#4caf50" : passRate >= 60 ? "#ff9800" : "#f44336";
                      return (
                        <tr key={e.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.2)" }}>
                          <td style={{ ...tdStyle, fontSize: 12 }}>{formatDate(e.executedAt)}</td>
                          <td style={tdStyle}>{e.suiteName}</td>
                          <td style={tdStyle}>{sm.total || 0}</td>
                          <td style={{ ...tdStyle, color: "#4caf50", fontWeight: 600 }}>{sm.pass || 0}</td>
                          <td style={{ ...tdStyle, color: "#f44336", fontWeight: 600 }}>{sm.fail || 0}</td>
                          <td style={{ ...tdStyle, color: "#ce93d8", fontWeight: 600 }}>{sm.healed || 0}</td>
                          <td style={{ ...tdStyle, color: passColor, fontWeight: 600 }}>{passRate}%</td>
                          <td style={tdStyle}>
                            <MuiTooltip title="View results">
                              <IconButton size="small" onClick={() => viewExecution(e.id)} sx={{ color: "#42a5f5" }}>
                                <VisibilityIcon fontSize="small" />
                              </IconButton>
                            </MuiTooltip>
                            <MuiTooltip title="Delete">
                              <IconButton size="small" onClick={() => deleteExecution(e.id)} sx={{ color: "#ef5350" }}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </MuiTooltip>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        )}

        {/* ============ ERROR ANALYSIS ============ */}
        {activeTab === "analysis" && (
          <Card sx={glassCard}>
            <CardContent>
              <Typography color="white">Error Analysis</Typography>
              <TextField fullWidth multiline rows={4} value={errorLog} onChange={(e) => setErrorLog(e.target.value)}
                placeholder="Paste error here (e.g. Selenium exception)" sx={{ mt: 2, ...inputSx }} />
              <Button variant="contained" startIcon={<BugReportIcon />} onClick={analyzeError} sx={{ ...primaryBtn, mt: 2 }}>Analyze</Button>
              <pre style={{ color: "white", whiteSpace: "pre-wrap", marginTop: 16 }}>{analysis}</pre>
            </CardContent>
          </Card>
        )}

        {/* ============ AI ASSISTANT ============ */}
        {activeTab === "ai" && (
          <Card sx={glassCard}>
            <CardContent>
              <Typography color="white">AI Assistant</Typography>
              <TextField fullWidth multiline rows={4} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Ask anything about testing, bugs, automation, or QA strategy..." sx={{ mt: 2, ...inputSx }} />
              <Button variant="contained" startIcon={<SmartToyIcon />} onClick={askAI} sx={{ ...primaryBtn, mt: 2 }}>Ask</Button>
              <pre style={{ color: "white", whiteSpace: "pre-wrap", marginTop: 16 }}>{aiResponse}</pre>
            </CardContent>
          </Card>
        )}

        {/* ============ RISK ============ */}
        {activeTab === "risk" && riskData && (
          <Card sx={glassCard}>
            <CardContent>
              <Typography color="white" variant="h6">Risk Dashboard</Typography>
              <Box sx={{ display: "flex", gap: 2, mt: 2, flexWrap: "wrap" }}>
                <Chip label={`Total: ${riskData.total}`} sx={{ background: "rgba(255,255,255,0.2)", color: "white" }} />
                <Chip label={`Pass Rate: ${riskData.passRate}%`} sx={{ background: "rgba(76,175,80,0.3)", color: "white" }} />
                <Chip label={`Risk: ${riskData.risk}`} sx={{ background: riskData.risk === "HIGH" ? "rgba(244,67,54,0.4)" : riskData.risk === "MEDIUM" ? "rgba(255,152,0,0.4)" : "rgba(76,175,80,0.4)", color: "white" }} />
              </Box>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={[{ name: "Passed", value: riskData.passed }, { name: "Failed", value: riskData.failed }]} dataKey="value" label>
                    <Cell fill={COLORS[0]} /><Cell fill={COLORS[1]} />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={[
                  { name: "Critical", value: riskData.defects.critical },
                  { name: "High", value: riskData.defects.high },
                  { name: "Medium", value: riskData.defects.medium },
                ]}>
                  <XAxis dataKey="name" stroke="white" />
                  <YAxis stroke="white" />
                  <Tooltip />
                  <Bar dataKey="value" fill="#f44336" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </Box>

      {/* ============ SAVE SUITE DIALOG ============ */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{currentSuiteId ? "Update Suite" : "Save as New Suite"}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus margin="dense" label="Suite Name" fullWidth required
            value={suiteName} onChange={(e) => setSuiteName(e.target.value)}
            placeholder="e.g. Login & Checkout — Production"
          />
          <TextField
            margin="dense" label="Description (optional)" fullWidth multiline rows={2}
            value={suiteDescription} onChange={(e) => setSuiteDescription(e.target.value)}
          />
          <Typography variant="caption" color="text.secondary" mt={1} display="block">
            {testcases.length} test case{testcases.length !== 1 ? "s" : ""} will be saved.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button onClick={saveAsSuite} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {/* ============ HISTORY DETAIL DIALOG ============ */}
      <Dialog open={historyDetailOpen} onClose={() => setHistoryDetailOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle>
          Execution Detail
          {selectedExecution && (
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              {selectedExecution.suiteName} • {formatDate(selectedExecution.executedAt)}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers>
          {selectedExecution && (
            <>
              <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
                <Chip label={`Total: ${selectedExecution.summary?.total || 0}`} />
                <Chip label={`Pass: ${selectedExecution.summary?.pass || 0}`} sx={{ background: "#c8e6c9" }} />
                <Chip label={`Fail: ${selectedExecution.summary?.fail || 0}`} sx={{ background: "#ffcdd2" }} />
                <Chip label={`Healed: ${selectedExecution.summary?.healed || 0}`} sx={{ background: "#e1bee7" }} />
                <Chip label={`Pass Rate: ${selectedExecution.summary?.passRate || 0}%`} sx={{ background: "#bbdefb" }} />
              </Box>

              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f5f5f5" }}>
                    <th style={{ padding: 8, border: "1px solid #ddd", textAlign: "left" }}>ID</th>
                    <th style={{ padding: 8, border: "1px solid #ddd", textAlign: "left" }}>Title</th>
                    <th style={{ padding: 8, border: "1px solid #ddd", textAlign: "left" }}>Status</th>
                    <th style={{ padding: 8, border: "1px solid #ddd", textAlign: "left" }}>Screenshot</th>
                    <th style={{ padding: 8, border: "1px solid #ddd", textAlign: "left" }}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedExecution.results || []).map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: 8, border: "1px solid #ddd" }}>{r.testCaseId}</td>
                      <td style={{ padding: 8, border: "1px solid #ddd" }}>{r.title}</td>
                      <td style={{ padding: 8, border: "1px solid #ddd", color: r.status === "Pass" ? "#2e7d32" : r.status === "Fail" ? "#c62828" : "#757575", fontWeight: 600 }}>
                        {r.status}{r.healed && " 🩹"}
                      </td>
                      <td style={{ padding: 8, border: "1px solid #ddd" }}>
                        {r.screenshot && <img src={`${API}${r.screenshot}`} alt="" style={{ width: 100, borderRadius: 4, cursor: "pointer" }} onClick={() => setSelectedImage(`${API}${r.screenshot}`)} />}
                      </td>
                      <td style={{ padding: 8, border: "1px solid #ddd", fontSize: 12 }}>
                        {r.error || (r.healed ? "Healed during execution" : "—")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryDetailOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ============ HEAL INFO DIALOG ============ */}
      <Dialog open={Boolean(healInfoDialog)} onClose={() => setHealInfoDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <HealingIcon sx={{ color: "#9c27b0" }} /> Self-Healing Details
        </DialogTitle>
        <DialogContent dividers>
          {healInfoDialog && (
            <>
              <Typography variant="body2" color="text.secondary" mb={2}>
                AI auto-recovered {healInfoDialog.healEvents?.length || 0} step(s) during this test case.
              </Typography>
              {(healInfoDialog.healEvents || []).map((h, i) => (
                <Box key={i} sx={{ mb: 2, p: 1.5, border: "1px solid #e0e0e0", borderRadius: 1, background: "#fafafa" }}>
                  <Typography variant="subtitle2" mb={1}>Step: <code>{h.step}</code></Typography>
                  <Typography variant="body2"><strong>Originally tried:</strong> {h.originalLabel}</Typography>
                  <Typography variant="body2" color="error.main" sx={{ fontSize: 12, mt: 0.5 }}>
                    <strong>Failed because:</strong> {h.originalError}
                  </Typography>
                  <Typography variant="body2" color="success.main" sx={{ mt: 1 }}>
                    <strong>✅ Healed by picking:</strong> {h.healedLabel}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{h.reason}</Typography>
                </Box>
              ))}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHealInfoDialog(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ============ BUG REPORT DIALOG ============ */}
      <Dialog open={bugReportOpen} onClose={() => setBugReportOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <BugReportIcon sx={{ color: "#f44336" }} /> Bug Report
        </DialogTitle>
        <DialogContent dividers>
          {generatingBugReport ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, p: 4, justifyContent: "center" }}>
              <CircularProgress />
              <Typography>Generating bug report...</Typography>
            </Box>
          ) : (
            <TextField
              fullWidth
              multiline
              rows={20}
              value={generatedBugReport}
              onChange={(e) => setGeneratedBugReport(e.target.value)}
              sx={{ fontFamily: "monospace", fontSize: 13 }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBugReportOpen(false)}>Close</Button>
          <Button onClick={copyBugReport} variant="contained" startIcon={<ContentCopyIcon />} disabled={generatingBugReport}>
            Copy Report
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default App;
