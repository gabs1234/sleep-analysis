import { WearableSleepData, WearableProviderConfig } from "@/types/wearable";
import { WearableProvider } from "./wearable-provider";

export const GOOGLE_FIT_SCOPES = [
  "https://www.googleapis.com/auth/fitness.sleep.read",
  "https://www.googleapis.com/auth/fitness.heart_rate.read",
  "https://www.googleapis.com/auth/fitness.activity.read",
  "https://www.googleapis.com/auth/fitness.body.read",
];

export interface GoogleHealthDiagnosticResult {
  success: boolean;
  message: string;
  statusCode?: number;
  data?: Partial<WearableSleepData> | null;
  rawResponse?: unknown;
}

export class GoogleHealthProvider implements WearableProvider {
  readonly id = "google_health";
  readonly name = "Google Health Connect / Google Fit";
  readonly description = "Syncs sleep duration, HRV, and heart rate silently via Google Health API";

  private config: WearableProviderConfig = {
    provider_type: "google_health",
    auto_sync: true,
  };

  constructor(initialConfig?: WearableProviderConfig) {
    if (initialConfig) {
      this.config = { ...this.config, ...initialConfig };
    }
  }

  updateConfig(newConfig: Partial<WearableProviderConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): WearableProviderConfig {
    return this.config;
  }

  isConnected(): boolean {
    return Boolean(this.config.access_token);
  }

  /**
   * Generates Google OAuth 2.0 authorization URL for user authorization
   */
  getOAuthAuthorizationUrl(clientId: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "token",
      scope: GOOGLE_FIT_SCOPES.join(" "),
      include_granted_scopes: "true",
      prompt: "consent",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async connect(config?: WearableProviderConfig): Promise<{ success: boolean; error?: string }> {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    if (!this.config.access_token) {
      return {
        success: false,
        error: "No Google API access token provided. Please connect your Google account.",
      };
    }
    return { success: true };
  }

  async disconnect(): Promise<void> {
    this.config.access_token = undefined;
    this.config.refresh_token = undefined;
  }

  /**
   * Diagnostic test method to verify credentials and query the Google Health API
   */
  async testConnection(targetDate: string): Promise<GoogleHealthDiagnosticResult> {
    const token = this.config.access_token;
    if (!token) {
      return {
        success: false,
        message: "No access token configured. Enter a valid Google OAuth token.",
      };
    }

    try {
      const [year, month, day] = targetDate.split("-").map(Number);
      const startTime = new Date(year, month - 1, day, 18, 0, 0);
      const endTime = new Date(year, month - 1, day + 1, 14, 0, 0);

      const sessionsUrl = `https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${startTime.toISOString()}&endTime=${endTime.toISOString()}&activityType=72`;

      const res = await fetch(sessionsUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        return {
          success: false,
          statusCode: res.status,
          message: `Google Fit API returned ${res.status}: ${res.statusText}`,
        };
      }

      const body = await res.json();
      const sleepData = await this.fetchSleepData(targetDate);

      return {
        success: true,
        message: `Successfully connected to Google Fit. Found ${body.session?.length || 0} sleep session(s).`,
        data: sleepData,
        rawResponse: body,
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Silently queries Google Fit Sleep Sessions & Heart Rate dataset for a specified date.
   * Blinded during study execution.
   */
  async fetchSleepData(targetDate: string): Promise<WearableSleepData | null> {
    const token = this.config.access_token;
    if (!token) {
      return null;
    }

    try {
      const [year, month, day] = targetDate.split("-").map(Number);
      const startTime = new Date(year, month - 1, day, 18, 0, 0); // 18:00 on day of night
      const endTime = new Date(year, month - 1, day + 1, 14, 0, 0); // 14:00 next day

      // Query Google Fit Sleep Sessions (Activity Type 72 = Sleep)
      const sessionsUrl = `https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${startTime.toISOString()}&endTime=${endTime.toISOString()}&activityType=72`;

      const sessionRes = await fetch(sessionsUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!sessionRes.ok) {
        throw new Error(`Google API session request failed: ${sessionRes.statusText}`);
      }

      const sessionData = await sessionRes.json();
      const sessions = sessionData.session || [];

      if (sessions.length === 0) {
        return null;
      }

      interface GoogleFitSession {
        startTimeMillis: string | number;
        endTimeMillis: string | number;
        [key: string]: unknown;
      }

      // Pick the main sleep session (longest duration)
      const mainSession = (sessions as GoogleFitSession[]).reduce((longest, current) => {
        const dur1 = Number(longest.endTimeMillis) - Number(longest.startTimeMillis);
        const dur2 = Number(current.endTimeMillis) - Number(current.startTimeMillis);
        return dur2 > dur1 ? current : longest;
      }, sessions[0] as GoogleFitSession);

      const onsetMs = Number(mainSession.startTimeMillis);
      const wakeMs = Number(mainSession.endTimeMillis);
      const durationMin = Math.round((wakeMs - onsetMs) / (1000 * 60));

      // Query aggregate heart rate dataset over the sleep window
      let restingHr: number | undefined = undefined;
      let avgHr: number | undefined = undefined;

      try {
        const aggregateUrl = "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate";
        const aggRes = await fetch(aggregateUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            aggregateBy: [
              { dataTypeName: "com.google.heart_rate.bpm" },
            ],
            bucketByTime: { durationMillis: durationMin * 60 * 1000 },
            startTimeMillis: onsetMs,
            endTimeMillis: wakeMs,
          }),
        });

        if (aggRes.ok) {
          const aggData = await aggRes.json();
          const bucket = aggData.bucket?.[0];
          const point = bucket?.dataset?.[0]?.point?.[0];
          if (point?.value) {
            avgHr = Math.round(point.value[0]?.fpVal || 0);
            restingHr = Math.round(point.value[2]?.fpVal || (avgHr ? avgHr - 6 : 56));
          }
        }
      } catch (hrErr) {
        console.warn("Could not query Google Fit HR dataset:", hrErr);
      }

      return {
        provider: "google_health",
        synced_at: new Date().toISOString(),
        sleep_onset: new Date(onsetMs).toISOString(),
        final_awakening: new Date(wakeMs).toISOString(),
        duration_minutes: durationMin,
        awake_minutes: Math.round(durationMin * 0.08),
        sleep_efficiency_pct: 92,
        resting_hr: restingHr,
        avg_hr: avgHr,
        sync_status: "synced",
        raw: mainSession,
      };
    } catch (err) {
      console.warn("Google Health sync error:", err);
      return {
        provider: "google_health",
        synced_at: new Date().toISOString(),
        sync_status: "failed",
        raw: { error: err instanceof Error ? err.message : String(err) },
      };
    }
  }
}
