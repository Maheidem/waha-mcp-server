import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ApiClient, MediaSettings } from "../services/api-client.js";
import { parseApiError, mcpError } from "../utils/errors.js";

const CONTACT_ID_PATTERN = /^(\d{6,20}|[^\s/]+@(c\.us|g\.us|lid))$/;
const contactIdSchema = z.string().min(1).max(200).regex(
  CONTACT_ID_PATTERN,
  "contactId must be phone digits or a WhatsApp JID",
);

function textResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

export function registerAutomationTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "whatsapp_media_settings_get",
    {
      title: "Get Conversation Media Automation",
      description: `Get media capture, analysis, reply, recap, and archive settings for one conversation.

All features default off. The response includes warnings for the core global gates
reported by the public backend. The recap-inclusion and review-question global gates
are not currently reported, so warnings alone cannot prove those two features active.

Args:
  - contactId: Phone digits for a person, or "*@g.us" for a group`,
      inputSchema: {
        contactId: contactIdSchema.describe('Phone digits for a person, or "*@g.us" for a group'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ contactId }) => {
      try {
        return textResult(await api.getMediaSettings(contactId));
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    },
  );

  server.registerTool(
    "whatsapp_media_settings_update",
    {
      title: "Update Conversation Media Automation",
      description: `Partially update media automation for one person or group.

Only supplied fields change. Conversation settings are AND-combined with global backend
kill switches. Warnings and whatsapp_automation_health cover the core gates, but the public
health contract omits recap-inclusion and review-question gates. Sensitive processing and
automatic archival should be enabled deliberately.

Args use camelCase and map to the backend policy fields:
  - captureEnabled: Persist incoming media in staging
  - analyzeImages / analyzeDocuments: Run AI enrichment
  - whatsappReplyEnabled: Send analysis replies into WhatsApp
  - includeMediaInRecap: Include enrichment in contextual recaps
  - archiveMode: off, review, or auto
  - fixedNextcloudFolderId: Catalogued folder id, or null to clear
  - archiveConfirmationEnabled: Send archive confirmations
  - allowSensitiveProcessing: Permit processing of sensitive media
  - askOnReview: Ask the owner when archive routing is uncertain`,
      inputSchema: {
        contactId: contactIdSchema.describe('Phone digits for a person, or "*@g.us" for a group'),
        captureEnabled: z.boolean().optional(),
        analyzeImages: z.boolean().optional(),
        analyzeDocuments: z.boolean().optional(),
        whatsappReplyEnabled: z.boolean().optional(),
        includeMediaInRecap: z.boolean().optional(),
        archiveMode: z.enum(["off", "review", "auto"]).optional(),
        fixedNextcloudFolderId: z.number().int().positive().nullable().optional(),
        archiveConfirmationEnabled: z.boolean().optional(),
        allowSensitiveProcessing: z.boolean().optional(),
        askOnReview: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({
      contactId,
      captureEnabled,
      analyzeImages,
      analyzeDocuments,
      whatsappReplyEnabled,
      includeMediaInRecap,
      archiveMode,
      fixedNextcloudFolderId,
      archiveConfirmationEnabled,
      allowSensitiveProcessing,
      askOnReview,
    }) => {
      try {
        const settings: Partial<MediaSettings> = {};
        if (captureEnabled !== undefined) settings.capture_enabled = captureEnabled;
        if (analyzeImages !== undefined) settings.analyze_images = analyzeImages;
        if (analyzeDocuments !== undefined) settings.analyze_documents = analyzeDocuments;
        if (whatsappReplyEnabled !== undefined) settings.whatsapp_reply_enabled = whatsappReplyEnabled;
        if (includeMediaInRecap !== undefined) settings.include_media_in_recap = includeMediaInRecap;
        if (archiveMode !== undefined) settings.archive_mode = archiveMode;
        if (fixedNextcloudFolderId !== undefined) {
          settings.fixed_nextcloud_folder_id = fixedNextcloudFolderId;
        }
        if (archiveConfirmationEnabled !== undefined) {
          settings.archive_confirmation_enabled = archiveConfirmationEnabled;
        }
        if (allowSensitiveProcessing !== undefined) {
          settings.allow_sensitive_processing = allowSensitiveProcessing;
        }
        if (askOnReview !== undefined) settings.ask_on_review = askOnReview;

        if (Object.keys(settings).length === 0) {
          return mcpError("Provide at least one media setting to update.");
        }

        return textResult(await api.updateMediaSettings(contactId, settings));
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    },
  );

  server.registerTool(
    "whatsapp_media_settings_disable",
    {
      title: "Disable Conversation Media Automation",
      description: `Turn every media automation feature off for one person or group.

This disables capture, analysis, WhatsApp analysis replies, recap inclusion, sensitive
processing, review questions, confirmations, and archival. It does not delete previously
captured media or pipeline history.`,
      inputSchema: {
        contactId: contactIdSchema.describe('Phone digits for a person, or "*@g.us" for a group'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ contactId }) => {
      try {
        return textResult(await api.disableMediaSettings(contactId));
      } catch (error) {
        return mcpError(parseApiError(error));
      }
    },
  );

  server.registerTool(
    "whatsapp_automation_health",
    {
      title: "WhatsApp Automation Health",
      description: `Check the unified backend, voice-note listener, media pipeline, and worker.

Returns every probe independently so a failed optional subsystem does not hide the health
of the others. status is healthy only when all four probes respond and the core backend and
worker report healthy state. This does not report the recap-inclusion or review-question
global feature flags.`,
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      const names = ["backend", "listener", "media", "worker"] as const;
      const settled = await Promise.allSettled([
        api.getHealth(),
        api.getListenerHealth(),
        api.getMediaHealth(),
        api.getWorkerHealth(),
      ]);

      const probes = Object.fromEntries(settled.map((result, index) => [
        names[index],
        result.status === "fulfilled"
          ? { available: true, data: result.value }
          : { available: false, error: parseApiError(result.reason) },
      ])) as Record<string, { available: boolean; data?: Record<string, unknown>; error?: string }>;

      const backendOk = probes.backend.available
        && probes.backend.data?.status === "ok"
        && probes.backend.data?.database === true
        && probes.backend.data?.waha_live === true;
      const listenerOk = probes.listener.available && probes.listener.data?.connected === true;
      const workerOk = probes.worker.available && probes.worker.data?.healthy === true;
      const allAvailable = Object.values(probes).every((probe) => probe.available);

      return textResult({
        status: backendOk && listenerOk && workerOk && allAvailable ? "healthy" : "degraded",
        probes,
      });
    },
  );
}
