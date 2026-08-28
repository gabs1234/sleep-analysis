"use client";

import React, { useState } from "react";
import { useStudySession } from "@/context/study-context";
import {
  AVAILABLE_STUDIES,
  validateStudyConfig,
} from "@/lib/config/study-config";
import { GoogleHealthProvider, GoogleHealthDiagnosticResult } from "@/lib/wearable/google-health";
import { MockWearableProvider } from "@/lib/wearable/mock-wearable";
import { formatDateKey, formatLocalTime } from "@/lib/engine/protocol-engine";
import { importStudyJSON } from "@/lib/storage/data-export";

export default function SettingsPage() {
  const {
    config,
    updateStudyConfig,
    importBackupData,
    wearableConfig,
    updateWearableConfig,
    resetStudy,
    simulateAddCompletedNight,
  } = useStudySession();

  const [googleClientId, setGoogleClientId] = useState(
    () => wearableConfig.client_id || ""
  );

  const handleClientIdChange = (value: string) => {
    setGoogleClientId(value);
    updateWearableConfig({
      ...wearableConfig,
      client_id: value.trim() || undefined,
    });
  };
  const [googleTokenInput, setGoogleTokenInput] = useState("");
  const [customJson, setCustomJson] = useState("");
  const [customJsonError, setCustomJsonError] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [testingWearable, setTestingWearable] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<GoogleHealthDiagnosticResult | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  const isGoogleConnected = Boolean(
    wearableConfig.provider_type === "google_health" && wearableConfig.access_token
  );

  const activeClientId = googleClientId || wearableConfig.client_id || "";

  const handleStartGoogleOAuth = () => {
    const idToUse = activeClientId.trim();
    if (!idToUse) {
      alert("Please enter your Google OAuth Client ID first.");
      return;
    }
    const provider = new GoogleHealthProvider({
      ...wearableConfig,
      client_id: idToUse,
    });
    updateWearableConfig({
      ...wearableConfig,
      client_id: idToUse,
    });
    const redirectUri = window.location.origin + window.location.pathname;
    const authUrl = provider.getOAuthAuthorizationUrl(idToUse, redirectUri);
    window.location.href = authUrl;
  };

  const handleDisconnectGoogle = () => {
    updateWearableConfig({
      ...wearableConfig,
      access_token: undefined,
      refresh_token: undefined,
    });
    setDiagnosticResult(null);
    setSaveNotice("Disconnected Google Health account");
    setTimeout(() => setSaveNotice(null), 3000);
  };

  const handleSaveManualToken = () => {
    if (!googleTokenInput.trim()) return;
    updateWearableConfig({
      ...wearableConfig,
      provider_type: "google_health",
      access_token: googleTokenInput.trim(),
      client_id: googleClientId.trim() || wearableConfig.client_id,
    });
    setGoogleTokenInput("");
    setSaveNotice("✓ Google Access Token saved successfully");
    setTimeout(() => setSaveNotice(null), 3000);
  };

  const handleTestWearableSync = async () => {
    setTestingWearable(true);
    setDiagnosticResult(null);
    try {
      const todayKey = formatDateKey();
      if (wearableConfig.provider_type === "google_health") {
        const provider = new GoogleHealthProvider(wearableConfig);
        const result = await provider.testConnection(todayKey);
        setDiagnosticResult(result);
      } else {
        const provider = new MockWearableProvider();
        const [data, nutrition] = await Promise.all([
          provider.fetchSleepData(todayKey),
          provider.fetchNutritionData(todayKey),
        ]);
        setDiagnosticResult({
          success: true,
          message: "Mock Simulator connected. Generated synthetic sleep metrics and MacroFactor food records.",
          data,
          nutritionRecords: nutrition,
          discoveredDataStreams: [
            "com.macrofactor.app (Nutrition)",
            "Fitbit Charge 6 (Sleep & HR)",
            "Google Health Connect (Vitals)",
          ],
        });
      }
    } finally {
      setTestingWearable(false);
    }
  };

  const handleStudySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = AVAILABLE_STUDIES.find((s) => s.study_id === e.target.value);
    if (selected) {
      if (
        confirm(
          `Switch to "${selected.study_name}"? This will initialize a new study state.`
        )
      ) {
        updateStudyConfig(selected);
        setSaveNotice("Switched study protocol");
        setTimeout(() => setSaveNotice(null), 3000);
      }
    }
  };

  const handleBackupRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const result = importStudyJSON(text);

        if (!result.success || !result.state) {
          alert(`Failed to restore backup: ${result.error}`);
          return;
        }

        if (
          confirm(
            `Restore backup with ${result.state.records.length} night records? This will update your tracking state on this device.`
          )
        ) {
          importBackupData(result.state, result.config);
          setSaveNotice(`✓ Restored backup with ${result.state.records.length} records!`);
          setTimeout(() => setSaveNotice(null), 3000);
        }
      } catch (err) {
        alert("Failed to read backup file: " + (err instanceof Error ? err.message : String(err)));
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const validation = validateStudyConfig(parsed);

        if (!validation.valid || !validation.config) {
          setCustomJsonError(validation.error || "Invalid study protocol format");
          return;
        }

        if (
          confirm(
            `Load and activate "${validation.config.study_name}" (${validation.config.phases.length} phases)?`
          )
        ) {
          updateStudyConfig(validation.config);
          setCustomJsonError(null);
          setCustomJson("");
          setSaveNotice(`✓ Uploaded & activated "${validation.config.study_name}"`);
          setTimeout(() => setSaveNotice(null), 3000);
        }
      } catch (err) {
        setCustomJsonError(err instanceof Error ? err.message : "Failed to parse JSON file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleCustomJsonImport = () => {
    try {
      const parsed = JSON.parse(customJson);
      const validation = validateStudyConfig(parsed);
      if (!validation.valid || !validation.config) {
        setCustomJsonError(validation.error || "Invalid study protocol format");
        return;
      }
      updateStudyConfig(validation.config);
      setCustomJsonError(null);
      setCustomJson("");
      setSaveNotice("Imported custom study protocol successfully");
      setTimeout(() => setSaveNotice(null), 3000);
    } catch (e) {
      setCustomJsonError(e instanceof Error ? e.message : "Invalid JSON syntax");
    }
  };

  const handleSimulateValidNight = async () => {
    await simulateAddCompletedNight({
      readiness: 2,
      sleep_quality: 2,
      protocol_adherence: "yes",
      unusual_night: false,
    });
    setSaveNotice("Simulated valid night added");
    setTimeout(() => setSaveNotice(null), 2500);
  };

  const handleSimulateAbnormalNight = async () => {
    await simulateAddCompletedNight({
      readiness: 1,
      sleep_quality: 1,
      unusual_night: true,
      unusual_reasons: ["travel", "alcohol"],
    });
    setSaveNotice("Simulated abnormal (excluded) night added");
    setTimeout(() => setSaveNotice(null), 2500);
  };

  const handleExecuteReset = () => {
    resetStudy();
    setShowResetConfirm(false);
    setSaveNotice("All study data reset");
    setTimeout(() => setSaveNotice(null), 3000);
  };

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const currentRedirectUri = typeof window !== "undefined" ? window.location.origin + "/settings" : "";

  return (
    <div className="w-full max-w-md mx-auto px-4 py-8 space-y-8 animate-fade-in pb-20">
      {/* Header */}
      <div className="space-y-1">
        <div className="text-xs font-mono text-zinc-400 uppercase tracking-wider">
          CONFIGURATION
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          Settings
        </h1>
      </div>

      {saveNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-400 text-center animate-fade-in">
          {saveNotice}
        </div>
      )}

      {/* 1. Wearable & Health Connect Data Sync */}
      <div className="p-5 rounded-2xl border border-zinc-900 bg-zinc-950 space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-zinc-100">
            Health Connect &amp; Wearable Sync
          </h2>
          <p className="text-xs text-zinc-400">
            Automated silent ingestion of sleep sessions, HRV, resting HR, and raw MacroFactor food logs.
          </p>
        </div>

        <div className="space-y-3 pt-1">
          <label className="block text-xs font-mono text-zinc-400">
            ACTIVE DATA PROVIDER
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                updateWearableConfig({
                  ...wearableConfig,
                  provider_type: "mock",
                })
              }
              className={`p-3 rounded-xl border text-xs font-medium text-left transition-all ${
                wearableConfig.provider_type === "mock"
                  ? "border-zinc-100 bg-zinc-900 text-white"
                  : "border-zinc-900 bg-zinc-950 text-zinc-400 hover:bg-zinc-900"
              }`}
            >
              <div className="font-semibold">Mock Simulator</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Local offline simulation
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                updateWearableConfig({
                  ...wearableConfig,
                  provider_type: "google_health",
                })
              }
              className={`p-3 rounded-xl border text-xs font-medium text-left transition-all ${
                wearableConfig.provider_type === "google_health"
                  ? "border-zinc-100 bg-zinc-900 text-white"
                  : "border-zinc-900 bg-zinc-950 text-zinc-400 hover:bg-zinc-900"
              }`}
            >
              <div className="font-semibold">Health Connect</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Google Health API (Fitbit/MacroFactor)
              </div>
            </button>
          </div>

          {wearableConfig.provider_type === "google_health" && (
            <div className="space-y-4 pt-3 border-t border-zinc-900">
              {/* Connected State Banner */}
              {isGoogleConnected ? (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs font-semibold text-emerald-300">
                        Health Connect Synced ✓
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400/80 bg-emerald-500/20 px-2 py-0.5 rounded">
                      ACTIVE
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Sleep duration, sleep stages, HRV, resting HR, and timestamped MacroFactor food logs sync automatically in the background.
                  </p>

                  <div className="pt-1 flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleDisconnectGoogle}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-mono text-zinc-300 transition-all"
                    >
                      Disconnect Account
                    </button>
                  </div>
                </div>
              ) : (
                /* Disconnected / Setup State */
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-mono text-zinc-400">
                        GOOGLE OAUTH CLIENT ID
                      </label>
                      <span className="text-[10px] font-mono text-emerald-400">
                        {activeClientId ? "✓ CONFIGURED" : "REQUIRED"}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={activeClientId}
                      onChange={(e) => handleClientIdChange(e.target.value)}
                      placeholder="e.g. 123456789-abc.apps.googleusercontent.com"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                    />
                  </div>

                  {/* 1-Click Sign in with Google Button */}
                  <button
                    type="button"
                    onClick={handleStartGoogleOAuth}
                    className="w-full py-3 rounded-xl bg-white text-black font-semibold text-xs hover:bg-zinc-100 flex items-center justify-center space-x-2 transition-all shadow-sm"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Authorize with Google Account</span>
                  </button>

                  {/* Manual Token Option */}
                  <div className="space-y-1.5 pt-2 border-t border-zinc-900/60">
                    <label className="block text-xs font-mono text-zinc-400">
                      OR PASTE ACCESS TOKEN DIRECTLY
                    </label>
                    <input
                      type="password"
                      value={googleTokenInput}
                      onChange={(e) => setGoogleTokenInput(e.target.value)}
                      placeholder="ya29..."
                      className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                    />
                    <button
                      type="button"
                      onClick={handleSaveManualToken}
                      className="w-full py-2 rounded-lg bg-zinc-800 text-zinc-200 font-medium text-xs hover:bg-zinc-700 transition-all mt-1"
                    >
                      Save Token Manually
                    </button>
                  </div>
                </div>
              )}

              {/* Setup Guide Collapsible */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowSetupGuide(!showSetupGuide)}
                  className="text-xs font-mono text-amber-400 hover:text-amber-300 flex items-center space-x-1"
                >
                  <span>{showSetupGuide ? "▼ Hide Google Cloud Setup Checklist" : "▶ Why is it not connecting? (Setup Checklist)"}</span>
                </button>

                {showSetupGuide && (
                  <div className="mt-3 p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-zinc-300 space-y-3 leading-relaxed">
                    <p className="font-semibold text-amber-300">
                      Google Fit / Health Connect setup in Google Cloud Console:
                    </p>
                    <ol className="list-decimal pl-4 space-y-2 text-[11px]">
                      <li>
                        <strong>Enable Fitness API</strong>: Go to <code>console.cloud.google.com</code> &gt; <em>APIs &amp; Services</em> &gt; <em>Library</em> &gt; Search <code>Fitness API</code> &gt; Click <strong>Enable</strong>.
                      </li>
                      <li>
                        <strong>Add Test User</strong>: In <em>OAuth consent screen</em>, ensure your Google email is added under <strong>Test Users</strong>.
                      </li>
                      <li>
                        <strong>Configure Web Client ID</strong>: In <em>Credentials</em> &gt; <em>OAuth 2.0 Client ID</em>:
                        <div className="mt-1 space-y-1 text-zinc-400 font-mono text-[10px] bg-black/40 p-2 rounded">
                          <div>Authorized JavaScript Origin:</div>
                          <div className="text-zinc-200 select-all">{currentOrigin}</div>
                          <div className="pt-1">Authorized Redirect URI:</div>
                          <div className="text-zinc-200 select-all">{currentRedirectUri}</div>
                        </div>
                      </li>
                    </ol>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Test Wearable & Nutrition Sync Button & Diagnostic Results */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleTestWearableSync}
              disabled={testingWearable}
              className="w-full py-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-xs font-mono text-zinc-200 active:scale-[0.98] transition-all"
            >
              {testingWearable ? "Polling Health Connect streams..." : "⚡ Poll & Inspect Health Connect Streams"}
            </button>

            {diagnosticResult && (
              <div
                className={`mt-3 p-3.5 rounded-xl border text-xs font-mono space-y-3 animate-fade-in ${
                  diagnosticResult.success
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                }`}
              >
                <div className="font-semibold flex items-center justify-between">
                  <span>{diagnosticResult.success ? "✓ Streams Discovered" : "✗ Connection Failed"}</span>
                  {diagnosticResult.statusCode && (
                    <span className="text-[10px] opacity-70">HTTP {diagnosticResult.statusCode}</span>
                  )}
                </div>
                <div className="text-[11px] leading-relaxed opacity-90">
                  {diagnosticResult.message}
                </div>

                {/* Discovered streams list */}
                {diagnosticResult.discoveredDataStreams && diagnosticResult.discoveredDataStreams.length > 0 && (
                  <div className="pt-2 border-t border-zinc-800/60 space-y-1 text-zinc-300">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                      Discovered Data Sources:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {diagnosticResult.discoveredDataStreams.map((s, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-black/40 border border-zinc-800 text-[10px]">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sleep Metrics Preview */}
                {diagnosticResult.data && (
                  <div className="pt-2 border-t border-zinc-800/60 text-[10px] space-y-1 text-zinc-300">
                    <div className="font-bold uppercase tracking-wider text-emerald-400">Sleep &amp; Physiological Response:</div>
                    <div>Duration: {diagnosticResult.data.duration_minutes} min (WASO: {diagnosticResult.data.waso_minutes || 0}m, Efficiency: {diagnosticResult.data.sleep_efficiency_pct}%)</div>
                    {diagnosticResult.data.resting_hr && (
                      <div>Resting HR: {diagnosticResult.data.resting_hr} bpm | Avg Sleep HR: {diagnosticResult.data.avg_hr} bpm | HRV: {diagnosticResult.data.hrv_rmssd} ms</div>
                    )}
                    {diagnosticResult.data.steps !== undefined && (
                      <div>Daily Steps: {diagnosticResult.data.steps}</div>
                    )}
                  </div>
                )}

                {/* Raw Nutrition Records Preview */}
                {diagnosticResult.nutritionRecords && diagnosticResult.nutritionRecords.length > 0 && (
                  <div className="pt-2 border-t border-zinc-800/60 text-[10px] space-y-1.5 text-zinc-300">
                    <div className="font-bold uppercase tracking-wider text-emerald-400">
                      Raw Food Stream ({diagnosticResult.nutritionRecords.length} items logged):
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                      {diagnosticResult.nutritionRecords.map((item) => (
                        <div key={item.id} className="p-1.5 rounded bg-black/40 border border-zinc-800 text-[10px] space-y-0.5">
                          <div className="flex items-center justify-between text-zinc-200 font-semibold">
                            <span>{item.name}</span>
                            <span className="text-emerald-400">{item.calories} kcal</span>
                          </div>
                          <div className="text-zinc-400 text-[9px] flex items-center space-x-2">
                            <span>{formatLocalTime(item.timestamp)}</span>
                            <span>•</span>
                            <span>P: {item.protein_g}g | C: {item.carbs_g}g | F: {item.fat_g}g</span>
                            {item.fiber_g ? <span>| Fiber: {item.fiber_g}g</span> : null}
                            {item.caffeine_mg ? <span className="text-amber-400">| Caff: {item.caffeine_mg}mg</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Study Protocol Selection */}
      <div className="p-5 rounded-2xl border border-zinc-900 bg-zinc-950 space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-zinc-100">
            Study Protocol Configuration
          </h2>
          <p className="text-xs text-zinc-400">
            The study protocol is data, not application logic.
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-mono text-zinc-400">
            PRESET PROTOCOLS
          </label>
          <select
            value={config.study_id}
            onChange={handleStudySelect}
            className="w-full px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-zinc-600"
          >
            {AVAILABLE_STUDIES.map((s) => (
              <option key={s.study_id} value={s.study_id}>
                {s.study_name} ({s.phases.length} phases)
              </option>
            ))}
          </select>
        </div>

        {/* Custom JSON Import / File Upload */}
        <div className="space-y-3 pt-3 border-t border-zinc-900">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-mono text-zinc-400">
              IMPORT PROTOCOL JSON
            </label>
            <span className="text-[10px] font-mono text-zinc-400">V1 &amp; CUSTOM COMPATIBLE</span>
          </div>

          <div>
            <input
              type="file"
              id="protocol-file-upload"
              accept=".json,application/json"
              onChange={handleFileUpload}
              className="hidden"
            />
            <label
              htmlFor="protocol-file-upload"
              className="w-full py-3 px-4 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs font-mono text-zinc-100 flex items-center justify-center space-x-2 cursor-pointer transition-all active:scale-[0.98]"
            >
              <span>📁 Upload .JSON Protocol File</span>
            </label>
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="text-[11px] font-mono text-zinc-400">
              Or paste JSON directly:
            </div>
            <textarea
              value={customJson}
              onChange={(e) => {
                setCustomJson(e.target.value);
                setCustomJsonError(null);
              }}
              placeholder='Paste {"study": {...}, "phases": {...}} or {"study_id": "...", "phases": [...]}'
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
            />
          </div>

          {customJsonError && (
            <p className="text-xs font-mono text-rose-400 bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
              {customJsonError}
            </p>
          )}

          {customJson.trim() && (
            <button
              type="button"
              onClick={handleCustomJsonImport}
              className="w-full py-2.5 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 text-xs font-mono transition-all"
            >
              Validate &amp; Apply Pasted Protocol
            </button>
          )}
        </div>
      </div>

      {/* 3. Data Backup & Cross-Device Restore */}
      <div className="p-5 rounded-2xl border border-zinc-900 bg-zinc-950 space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-zinc-100">
            Data Backup &amp; Device Migration
          </h2>
          <p className="text-xs text-zinc-400">
            All raw records (nutrition, GI symptoms, timestamps, wearable vitals) are stored locally on this device.
          </p>
        </div>

        <div className="space-y-2 pt-1">
          <input
            type="file"
            id="backup-file-upload"
            accept=".json,application/json"
            onChange={handleBackupRestore}
            className="hidden"
          />
          <label
            htmlFor="backup-file-upload"
            className="w-full py-2.5 px-3 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-xs font-mono text-zinc-200 flex items-center justify-center space-x-2 cursor-pointer transition-all active:scale-[0.98]"
          >
            <span>📥 Restore Study from Backup JSON</span>
          </label>
        </div>
      </div>

      {/* 4. Developer & Testing Simulation Tools */}
      <div className="p-5 rounded-2xl border border-zinc-900 bg-zinc-950 space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-zinc-100">
            Simulation &amp; Testing Tools
          </h2>
          <p className="text-xs text-zinc-400">
            Simulate study nights and verify automatic phase progression and data models without waiting weeks.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleSimulateValidNight}
            className="py-2.5 px-3 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-xs font-mono text-zinc-200 active:scale-[0.98] transition-all"
          >
            + Add Valid Night
          </button>
          <button
            type="button"
            onClick={handleSimulateAbnormalNight}
            className="py-2.5 px-3 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-xs font-mono text-zinc-200 active:scale-[0.98] transition-all"
          >
            + Add Abnormal Night
          </button>
        </div>
      </div>

      {/* 5. Danger Zone: Reset */}
      <div className="p-5 rounded-2xl border border-rose-950/40 bg-zinc-950 space-y-3">
        <h2 className="text-sm font-semibold text-rose-400">
          Reset Study State
        </h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Permanently erase current records and restart the study from Day 1.
        </p>

        {showResetConfirm ? (
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={handleExecuteReset}
              className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all"
            >
              Yes, permanently erase and reset
            </button>
            <button
              type="button"
              onClick={() => setShowResetConfirm(false)}
              className="w-full py-2 rounded-xl bg-zinc-900 text-zinc-400 text-xs font-mono"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className="w-full py-2.5 rounded-xl border border-rose-900/40 bg-rose-950/20 hover:bg-rose-950/40 text-xs font-mono text-rose-300 transition-all"
          >
            Reset study data
          </button>
        )}
      </div>
    </div>
  );
}
