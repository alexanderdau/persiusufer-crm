import { useGetOne } from "ra-core";
import { AlertTriangle } from "lucide-react";

/**
 * Globaler Warn-Banner: erscheint, sobald eine KI-Auswertung (Gläubiger,
 * geringstes Gebot) am fehlenden Anthropic-Guthaben gescheitert ist. Die
 * Edge Functions setzen app_anthropic_status.credit_blocked_at bei
 * "credit balance too low" und löschen es beim nächsten Erfolg.
 */
export const AnthropicCreditBanner = () => {
  const { data } = useGetOne(
    "app_anthropic_status",
    { id: 1 },
    {
      staleTime: 60_000,
      refetchInterval: 120_000,
      refetchOnWindowFocus: true,
      retry: false,
      // Fehler still schlucken (z.B. wenn nicht eingeloggt) – kein Toast.
      onError: () => {},
    },
  );

  if (!data?.credit_blocked_at) return null;

  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        <strong>Anthropic-Guthaben aufgebraucht.</strong> Die KI-Auswertung von
        Dokumenten (Gläubiger, geringstes Gebot) ist pausiert — es müssen Tokens
        aufgebucht werden. Bitte unter{" "}
        <a
          href="https://console.anthropic.com/settings/billing"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          console.anthropic.com → Plans &amp; Billing
        </a>{" "}
        Guthaben aufladen.
      </span>
    </div>
  );
};
