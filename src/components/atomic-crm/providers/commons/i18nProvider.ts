import { mergeTranslations } from "ra-core";
import polyglotI18nProvider from "ra-i18n-polyglot";
import englishMessages from "ra-language-english";
import frenchMessages from "ra-language-french";
import germanMessages from "ra-language-german";
import { raSupabaseEnglishMessages } from "ra-supabase-language-english";
import { raSupabaseFrenchMessages } from "ra-supabase-language-french";
import { englishCrmMessages } from "./englishCrmMessages";
import { frenchCrmMessages } from "./frenchCrmMessages";
import { germanCrmMessages } from "./germanCrmMessages";

const raSupabaseEnglishMessagesOverride = {
  "ra-supabase": {
    auth: {
      password_reset: "Check your emails for a Reset Password message.",
    },
  },
};

const raSupabaseFrenchMessagesOverride = {
  "ra-supabase": {
    auth: {
      password_reset:
        "Consultez vos emails pour trouver le message de reinitialisation du mot de passe.",
    },
  },
};

// Deutsch hat kein ra-supabase-language-german Paket, daher übernehmen wir
// die englischen Supabase-Auth-Keys als Basis und überschreiben die User-facing Strings.
const raSupabaseGermanMessagesOverride = {
  "ra-supabase": {
    auth: {
      email_address: "E-Mail-Adresse",
      password: "Passwort",
      sign_in: "Anmelden",
      sign_in_with: "Anmelden mit %{provider}",
      forgot_password: "Passwort vergessen?",
      reset_password: "Passwort zurücksetzen",
      send_reset_password_email: "Link zum Zurücksetzen senden",
      missing_tokens:
        "Konnte Token zum Zurücksetzen nicht aus URL extrahieren. Bitte fordern Sie einen neuen Link an.",
      password_reset:
        "Wir haben Ihnen eine E-Mail mit einem Link zum Zurücksetzen Ihres Passworts geschickt.",
      update_password: "Passwort aktualisieren",
      password_updated: "Passwort erfolgreich aktualisiert. Sie können sich nun anmelden.",
      sign_up: "Konto erstellen",
      already_have_an_account: "Sie haben bereits ein Konto? Anmelden",
      dont_have_an_account: "Noch kein Konto? Konto erstellen",
      set_password: "Passwort festlegen",
      go_to_login_page: "Zur Anmelde-Seite",
    },
  },
};

const englishCatalog = mergeTranslations(
  englishMessages,
  raSupabaseEnglishMessages,
  raSupabaseEnglishMessagesOverride,
  englishCrmMessages,
);

const frenchCatalog = mergeTranslations(
  englishCatalog,
  frenchMessages,
  raSupabaseFrenchMessages,
  raSupabaseFrenchMessagesOverride,
  frenchCrmMessages,
);

// Deutscher Katalog: englischer Katalog als Fallback, deutsche Übersetzungen drüber.
const germanCatalog = mergeTranslations(
  englishCatalog,
  germanMessages,
  raSupabaseGermanMessagesOverride,
  germanCrmMessages,
);

export const getInitialLocale = (): "en" | "fr" | "de" => {
  if (typeof navigator === "undefined") {
    return "de";
  }

  const browserLocale = navigator.languages?.[0] ?? navigator.language;
  if (browserLocale?.toLowerCase().startsWith("de")) {
    return "de";
  }
  if (browserLocale?.toLowerCase().startsWith("fr")) {
    return "fr";
  }

  // Default: Deutsch (Persiusufer-Setup)
  return "de";
};

export const i18nProvider = polyglotI18nProvider(
  (locale) => {
    if (locale === "fr") {
      return frenchCatalog;
    }
    if (locale === "de") {
      return germanCatalog;
    }
    return englishCatalog;
  },
  getInitialLocale(),
  [
    { locale: "de", name: "Deutsch" },
    { locale: "en", name: "English" },
    { locale: "fr", name: "Français" },
  ],
  { allowMissing: true },
);

export const testI18nProvider = polyglotI18nProvider(
  () => englishCatalog,
  "en",
  [{ locale: "en", name: "English" }],
  { allowMissing: true },
);
