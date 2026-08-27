"use client";

import React, { useState } from "react";
import { useStudySession } from "@/context/study-context";
import {
  AVAILABLE_STUDIES,
  validateStudyConfig,
} from "@/lib/config/study-config";
import { GoogleHealthProvider, GoogleHealthDiagnosticResult } from "@/lib/wearable/google-health";
import { MockWearableProvider } from "@/lib/wearable/mock-wearable";
import { formatDateKey } from "@/lib/engine/protocol-engine";

export default function SettingsPage() {
  const {
    config,
    updateStudyConfig,
    wearableConfig,
    updateWearableConfig,
    resetStudy,
    simulateAddCompletedNight,
  } = useStudySession();

  const [googleClientId, setGoogleClientId] = useState(
    wearableConfig.client_id || ""
  );
  const [googleToken, setGoogleToken] = useState(
    wearableConfig.access_token || ""
  );
  const [customJson, setCustomJson] = useState("");
  const [customJsonError, setCustomJsonError] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [testingWearable, setTestingWearable] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<GoogleHealthDiagnosticResult | null>(null);

  const handleTestWearableSync = async () => {
    setTestingWearable(true);
    setDiagnosticResult(null);
    try {
      const todayKey = formatDateKey();
      if (wearableConfig.provider_type === "google_health") {
        const provider = new GoogleHealthProvider({
          ...wearableConfig,
          access_token: googleToken.trim() || undefined,
        });
        const result = await provider.testConnection(todayKey);
        setDiagnosticResult(result);
      } else {
        const provider = new MockWearableProvider();
        const data = await provider.fetchSleepData(todayKey);
        setDiagnosticResult({
          success: true,
          message: "Mock Wearable Simulator connected & generated test metrics successfully.",
          data,
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

  const handleSaveWearable = () => {
    updateWearableConfig({
      ...wearableConfig,
      client_id: googleClientId.trim() || undefined,
      access_token: googleToken.trim() || undefined,
    });
    setSaveNotice("Wearable settings updated");
    setTimeout(() => setSaveNotice(null), 3000);
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

  return (
    <div className="w-full max-w-md mx-auto px-4 py-8 space-y-8 animate-fade-in pb-16">
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
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-400 text-center animate-fade-in">
          {saveNotice}
        </div>
      )}

      {/* 1. Wearable Provider Setup */}
      <div className="p-5 rounded-2xl border border-zinc-900 bg-zinc-950 space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-zinc-100">
            Wearable / Smartwatch Data Sync
          </h2>
          <p className="text-xs text-zinc-400">
            Automated silent ingestion of sleep duration, HRV, and metrics.
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
              <div className="font-semibold">Google Health</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Google Fit / Health REST
              </div>
            </button>
          </div>

          {wearableConfig.provider_type === "google_health" && (
            <div className="space-y-3 pt-3 border-t border-zinc-900">
              <div className="space-y-1">
                <label className="block text-xs font-mono text-zinc-400">
                  GOOGLE OAUTH CLIENT ID
                </label>
                <input
                  type="text"
                  value={googleClientId}
                  onChange={(e) => setGoogleClientId(e.target.value)}
                  placeholder="e.g. 123456789.apps.googleusercontent.com"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-mono text-zinc-400">
                  OAUTH ACCESS TOKEN (OR BEARER)
                </label>
                <input
                  type="password"
                  value={googleToken}
                  onChange={(e) => setGoogleToken(e.target.value)}
                  placeholder="ya29..."
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveWearable}
                className="w-full py-2.5 rounded-lg bg-zinc-200 text-black font-semibold text-xs hover:bg-white transition-all"
              >
                Save Google Health Credentials
              </button>
            </div>
          )}

          {/* Test Wearable Sync Button & Diagnostic Results */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleTestWearableSync}
              disabled={testingWearable}
              className="w-full py-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-xs font-mono text-zinc-200 active:scale-[0.98] transition-all"
            >
              {testingWearable ? "Querying provider..." : "⚡ Test Wearable Connection & Query"}
            </button>

            {diagnosticResult && (
              <div
                className={`mt-3 p-3.5 rounded-xl border text-xs font-mono space-y-2 animate-fade-in ${
                  diagnosticResult.success
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                }`}
              >
                <div className="font-semibold flex items-center justify-between">
                  <span>{diagnosticResult.success ? "✓ Test Passed" : "✗ Test Failed"}</span>
                  {diagnosticResult.statusCode && (
                    <span className="text-[10px] opacity-70">HTTP {diagnosticResult.statusCode}</span>
                  )}
                </div>
                <div className="text-[11px] leading-relaxed opacity-90">
                  {diagnosticResult.message}
                </div>
                {diagnosticResult.data && (
                  <div className="pt-1.5 border-t border-zinc-800/40 text-[10px] space-y-1 text-zinc-300">
                    <div>Duration: {diagnosticResult.data.duration_minutes} min</div>
                    <div>Efficiency: {diagnosticResult.data.sleep_efficiency_pct}%</div>
                    {diagnosticResult.data.resting_hr && (
                      <div>Resting HR: {diagnosticResult.data.resting_hr} bpm</div>
                    )}
                    {diagnosticResult.data.hrv_rmssd && (
                      <div>HRV (RMSSD): {diagnosticResult.data.hrv_rmssd} ms</div>
                    )}
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

        {/* Custom JSON Import */}
        <div className="space-y-2 pt-2 border-t border-zinc-900">
          <label className="block text-xs font-mono text-zinc-400">
            LOAD CUSTOM PROTOCOL JSON
          </label>
          <textarea
            value={customJson}
            onChange={(e) => {
              setCustomJson(e.target.value);
              setCustomJsonError(null);
            }}
            placeholder='Paste {"study_id": "...", "phases": [...]}'
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-zinc-600"
          />
          {customJsonError && (
            <p className="text-xs font-mono text-rose-400">{customJsonError}</p>
          )}
          {customJson.trim() && (
            <button
              type="button"
              onClick={handleCustomJsonImport}
              className="w-full py-2 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 text-xs font-mono transition-all"
            >
              Validate & Apply Protocol
            </button>
          )}
        </div>
      </div>

      {/* 3. Developer & Testing Simulation Tools */}
      <div className="p-5 rounded-2xl border border-zinc-900 bg-zinc-950 space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-zinc-100">
            Simulation & Testing Tools
          </h2>
          <p className="text-xs text-zinc-400">
            Simulate study nights and verify automatic phase progression without waiting weeks.
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

      {/* 4. Danger Zone: Reset */}
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
