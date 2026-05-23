import type { CrmMessages } from "./englishCrmMessages";

export const germanCrmMessages = {
  resources: {
    companies: {
      name: "Firma |||| Firmen",
      forcedCaseName: "Firma",
      fields: {
        name: "Firmenname",
        website: "Website",
        linkedin_url: "LinkedIn-URL",
        phone_number: "Telefonnummer",
        created_at: "Erstellt am",
        nb_contacts: "Anzahl Kontakte",
        revenue: "Umsatz",
        sector: "Branche",
        size: "Größe",
        tax_identifier: "Steuer-ID",
        address: "Anschrift",
        city: "Stadt",
        zipcode: "PLZ",
        state_abbr: "Bundesland",
        country: "Land",
        description: "Beschreibung",
        context_links: "Kontext-Links",
        sales_id: "Betreuer",
      },
      empty: {
        description: "Ihre Firmenliste scheint leer zu sein.",
        title: "Keine Firmen gefunden",
      },
      field_categories: {
        contact: "Kontakt",
        additional_info: "Zusätzliche Informationen",
        address: "Anschrift",
        context: "Kontext",
      },
      action: {
        create: "Firma anlegen",
        edit: "Firma bearbeiten",
        new: "Neue Firma",
        show: "Firma anzeigen",
      },
      added_on: "Hinzugefügt am %{date}",
      followed_by: "Verantwortlich: %{name}",
      followed_by_you: "Sie sind verantwortlich",
      no_contacts: "Kein Kontakt",
      nb_contacts: "%{smart_count} Kontakt |||| %{smart_count} Kontakte",
      nb_deals: "%{smart_count} Geschäftsvorgang |||| %{smart_count} Geschäftsvorgänge",
      sizes: {
        one_employee: "1 Mitarbeiter",
        two_to_nine_employees: "2-9 Mitarbeiter",
        ten_to_forty_nine_employees: "10-49 Mitarbeiter",
        fifty_to_two_hundred_forty_nine_employees: "50-249 Mitarbeiter",
        two_hundred_fifty_or_more_employees: "250 oder mehr Mitarbeiter",
      },
      autocomplete: {
        create_error: "Beim Anlegen der Firma ist ein Fehler aufgetreten",
        create_item: "%{item} anlegen",
        create_label: "Tippen, um eine neue Firma anzulegen",
      },
      filters: {
        only_mine: "Nur von mir betreute Firmen",
      },
    },
    contacts: {
      name: "Kontakt |||| Kontakte",
      forcedCaseName: "Kontakt",
      field_categories: {
        background_info: "Hintergrund",
        identity: "Identität",
        misc: "Sonstiges",
        personal_info: "Persönliche Daten",
        position: "Position",
      },
      fields: {
        first_name: "Vorname",
        last_name: "Nachname",
        last_seen: "Letzter Kontakt",
        title: "Titel",
        company_id: "Firma",
        email_jsonb: "E-Mail-Adressen",
        email: "E-Mail",
        phone_jsonb: "Telefonnummern",
        phone_number: "Telefonnummer",
        linkedin_url: "LinkedIn-URL",
        background: "Hintergrund (Bio, wie kennengelernt, etc.)",
        has_newsletter: "Newsletter-Abo",
        sales_id: "Betreuer",
      },
      action: {
        add: "Kontakt hinzufügen",
        add_first: "Ersten Kontakt hinzufügen",
        create: "Kontakt anlegen",
        edit: "Kontakt bearbeiten",
        export_vcard: "Als vCard exportieren",
        new: "Neuer Kontakt",
        show: "Kontakt anzeigen",
      },
      background: {
        last_activity_on: "Letzte Aktivität am %{date}",
        added_on: "Hinzugefügt am %{date}",
        followed_by: "Verantwortlich: %{name}",
        followed_by_you: "Sie sind verantwortlich",
        status_none: "Keiner",
      },
      position_at: "%{title} bei",
      position_at_company: "%{title} bei %{company}",
      empty: {
        description: "Ihre Kontaktliste scheint leer zu sein.",
        title: "Keine Kontakte gefunden",
      },
      import: {
        title: "Kontakte importieren",
        button: "CSV importieren",
        complete:
          "Kontaktimport abgeschlossen. %{importCount} Kontakte importiert, %{errorCount} Fehler",
        progress:
          "%{importCount} / %{rowCount} Kontakte importiert, %{errorCount} Fehler.",
        error:
          "Datei konnte nicht importiert werden. Bitte stellen Sie sicher, dass es sich um eine gültige CSV-Datei handelt.",
        imported: "Importiert",
        remaining_time: "Geschätzte Restzeit:",
        running: "Der Import läuft, bitte schließen Sie diesen Tab nicht.",
        sample_download: "CSV-Beispieldatei herunterladen",
        sample_hint: "Hier ist eine CSV-Beispieldatei, die Sie als Vorlage nutzen können",
        stop: "Import abbrechen",
        csv_file: "CSV-Datei",
        contacts_label: "Kontakt |||| Kontakte",
      },
      inputs: {
        genders: {
          male: "Er/Ihm",
          female: "Sie/Ihr",
          nonbinary: "Divers",
        },
        personal_info_types: {
          work: "Geschäftlich",
          home: "Privat",
          other: "Sonstiges",
        },
      },
      list: {
        error_loading: "Fehler beim Laden der Kontakte",
      },
      bulk_tag: {
        action: "Tag",
        back: "Zurück zu den Tags",
        create_description:
          "Neuen Tag anlegen und auf die ausgewählten Kontakte anwenden.",
        description:
          "Wählen Sie einen bestehenden Tag oder legen Sie einen neuen für die ausgewählten Kontakte an.",
        empty: "Noch keine Tags. Legen Sie einen an, um die ausgewählten Kontakte zu taggen.",
        error: "Tag konnte nicht zu Kontakten hinzugefügt werden",
        noop: "Ausgewählte Kontakte haben diesen Tag bereits",
        success:
          "Tag zu %{smart_count} Kontakt hinzugefügt |||| Tag zu %{smart_count} Kontakten hinzugefügt",
        title: "Tag zu Kontakten hinzufügen",
      },
      merge: {
        action: "Mit anderem Kontakt zusammenführen",
        confirm: "Kontakte zusammenführen",
        current_contact: "Aktueller Kontakt (wird gelöscht)",
        description: "Diesen Kontakt mit einem anderen zusammenführen.",
        error: "Zusammenführen der Kontakte fehlgeschlagen",
        merging: "Wird zusammengeführt...",
        no_additional_data: "Keine weiteren Daten zum Zusammenführen",
        select_target: "Bitte einen Kontakt zum Zusammenführen auswählen",
        success: "Kontakte erfolgreich zusammengeführt",
        target_contact: "Zielkontakt (wird behalten)",
        title: "Kontakt zusammenführen",
        warning_description:
          "Alle Daten werden auf den zweiten Kontakt übertragen. Diese Aktion kann nicht rückgängig gemacht werden.",
        warning_title: "Warnung: Zerstörender Vorgang",
        what_will_be_merged: "Was zusammengeführt wird:",
      },
      filters: {
        before_last_month: "Vor letztem Monat",
        before_this_month: "Vor diesem Monat",
        before_this_week: "Vor dieser Woche",
        managed_by_me: "Von mir betreut",
        search: "Name, Firma suchen...",
        this_week: "Diese Woche",
        today: "Heute",
        tags: "Tags",
        tasks: "Aufgaben",
      },
      hot: {
        empty_change_status:
          'Ändern Sie den Status eines Kontakts, indem Sie eine Notiz zu diesem Kontakt hinzufügen und auf „Optionen anzeigen" klicken.',
        empty_hint: 'Kontakte mit Status „heiß" erscheinen hier.',
        title: "Heiße Kontakte",
      },
    },
    deals: {
      name: "Geschäftsvorgang |||| Geschäftsvorgänge",
      fields: {
        name: "Name",
        description: "Beschreibung",
        company_id: "Firma",
        contact_ids: "Kontakte",
        category: "Kategorie",
        amount: "Budget",
        expected_closing_date: "Erwartetes Abschlussdatum",
        stage: "Phase",
      },
      action: {
        back_to_deal: "Zurück zum Geschäftsvorgang",
        create: "Geschäftsvorgang anlegen",
        new: "Neuer Geschäftsvorgang",
      },
      field_categories: {
        misc: "Sonstiges",
      },
      archived: {
        action: "Archivieren",
        error: "Fehler: Geschäftsvorgang nicht archiviert",
        list_title: "Archivierte Geschäftsvorgänge",
        success: "Geschäftsvorgang archiviert",
        title: "Archivierter Geschäftsvorgang",
        view: "Archivierte Geschäftsvorgänge anzeigen",
      },
      inputs: {
        linked_to: "Verknüpft mit",
      },
      unarchived: {
        action: "Zurück ins Board",
        error: "Fehler: Geschäftsvorgang nicht entarchiviert",
        success: "Geschäftsvorgang entarchiviert",
      },
      updated: "Geschäftsvorgang aktualisiert",
      empty: {
        before_create: "bevor Sie einen Geschäftsvorgang anlegen.",
        description: "Ihre Liste der Geschäftsvorgänge scheint leer zu sein.",
        title: "Keine Geschäftsvorgänge gefunden",
      },
      invalid_date: "Ungültiges Datum",
    },
    notes: {
      name: "Notiz |||| Notizen",
      forcedCaseName: "Notiz",
      fields: {
        status: "Status",
        date: "Datum",
        attachments: "Anhänge",
        contact_id: "Kontakt",
        deal_id: "Geschäftsvorgang",
      },
      action: {
        add: "Notiz hinzufügen",
        add_first: "Erste Notiz hinzufügen",
        delete: "Notiz löschen",
        edit: "Notiz bearbeiten",
        update: "Notiz aktualisieren",
        add_this: "Diese Notiz hinzufügen",
      },
      sheet: {
        create: "Notiz anlegen",
        create_for: "Notiz für %{name} anlegen",
        edit: "Notiz bearbeiten",
        edit_for: "Notiz für %{name} bearbeiten",
      },
      deleted: "Notiz gelöscht",
      empty: "Noch keine Notizen",
      author_added: "%{name} hat eine Notiz hinzugefügt",
      you_added: "Sie haben eine Notiz hinzugefügt",
      me: "Ich",
      list: {
        error_loading: "Fehler beim Laden der Notizen",
      },
      note_for_contact: "Notiz für %{name}",
      stepper: {
        hint: "Gehen Sie zu einer Kontaktseite und fügen Sie eine Notiz hinzu",
      },
      added: "Notiz hinzugefügt",
      inputs: {
        add_note: "Notiz hinzufügen",
        options_hint: "(Dateien anhängen oder Details ändern)",
        show_options: "Optionen anzeigen",
      },
      actions: {
        attach_document: "Dokument anhängen",
      },
      validation: {
        note_or_attachment_required: "Eine Notiz oder ein Anhang ist erforderlich",
      },
    },
    zvg_akte: {
      name: "ZVG-Akte |||| ZVG-Akten",
    },
    sales: {
      name: "Benutzer |||| Benutzer",
      fields: {
        first_name: "Vorname",
        last_name: "Nachname",
        email: "E-Mail",
        administrator: "Admin",
        disabled: "Deaktiviert",
      },
      create: {
        error: "Beim Anlegen des Benutzers ist ein Fehler aufgetreten.",
        success:
          "Benutzer angelegt. Er erhält in Kürze eine E-Mail zum Festlegen des Passworts.",
        title: "Neuen Benutzer anlegen",
      },
      edit: {
        error: "Ein Fehler ist aufgetreten. Bitte erneut versuchen.",
        record_not_found: "Datensatz nicht gefunden",
        success: "Benutzer erfolgreich aktualisiert",
        title: "%{name} bearbeiten",
      },
      action: {
        new: "Neuer Benutzer",
      },
    },
    tasks: {
      name: "Aufgabe |||| Aufgaben",
      forcedCaseName: "Aufgabe",
      fields: {
        text: "Beschreibung",
        due_date: "Fällig am",
        type: "Typ",
        contact_id: "Kontakt",
        due_short: "fällig",
      },
      action: {
        add: "Aufgabe hinzufügen",
        create: "Aufgabe anlegen",
        edit: "Aufgabe bearbeiten",
      },
      actions: {
        postpone_next_week: "Auf nächste Woche verschieben",
        postpone_tomorrow: "Auf morgen verschieben",
        title: "Aufgaben-Aktionen",
      },
      added: "Aufgabe hinzugefügt",
      deleted: "Aufgabe erfolgreich gelöscht",
      dialog: {
        create: "Aufgabe anlegen",
        create_for: "Aufgabe für %{name} anlegen",
      },
      sheet: {
        edit: "Aufgabe bearbeiten",
        edit_for: "Aufgabe für %{name} bearbeiten",
      },
      empty: "Noch keine Aufgaben",
      empty_list_hint: "Aufgaben zu Ihren Kontakten erscheinen hier.",
      filters: {
        later: "Später",
        overdue: "Überfällig",
        this_week: "Diese Woche",
        today: "Heute",
        tomorrow: "Morgen",
        with_pending: "Mit offenen Aufgaben",
      },
      regarding_contact: "(Betr.: %{name})",
      updated: "Aufgabe aktualisiert",
    },
    tags: {
      name: "Tag |||| Tags",
      action: {
        add: "Tag hinzufügen",
        create: "Neuen Tag anlegen",
      },
      dialog: {
        color: "Farbe",
        create_title: "Neuen Tag anlegen",
        edit_title: "Tag bearbeiten",
        name_label: "Tag-Name",
        name_placeholder: "Tag-Namen eingeben",
      },
    },
  },
  crm: {
    action: {
      reset_password: "Passwort zurücksetzen",
    },
    auth: {
      first_name: "Vorname",
      last_name: "Nachname",
      confirm_password: "Passwort bestätigen",
      confirmation_required:
        "Bitte folgen Sie dem Link, den wir Ihnen per E-Mail gesendet haben, um Ihr Konto zu bestätigen.",
      recovery_email_sent:
        "Falls Sie ein registrierter Benutzer sind, erhalten Sie in Kürze eine E-Mail zur Passwort-Wiederherstellung.",
      sign_in_failed: "Anmeldung fehlgeschlagen.",
      sign_in_google_workspace: "Mit Google Workplace anmelden",
      signup: {
        create_account: "Konto erstellen",
        create_first_user:
          "Legen Sie das erste Benutzerkonto an, um die Einrichtung abzuschließen.",
        creating: "Wird erstellt...",
        initial_user_created: "Erster Benutzer erfolgreich angelegt",
      },
      welcome_title: "Willkommen bei Atomic CRM",
    },
    common: {
      activity: "Aktivität",
      added: "hinzugefügt",
      details: "Details",
      last_activity_with_date: "letzte Aktivität %{date}",
      load_more: "Mehr laden",
      misc: "Sonstiges",
      past: "Vergangen",
      read_more: "Mehr lesen",
      retry: "Wiederholen",
      show_less: "Weniger anzeigen",
      copied: "Kopiert!",
      copy: "Kopieren",
      loading: "Wird geladen...",
      me: "Ich",
      task_count: "%{smart_count} Aufgabe |||| %{smart_count} Aufgaben",
    },
    changelog: {
      title: "Änderungsprotokoll",
    },
    activity: {
      added_company: "%{name} hat die Firma hinzugefügt",
      you_added_company: "Sie haben die Firma hinzugefügt",
      added_contact: "%{name} hat hinzugefügt",
      you_added_contact: "Sie haben hinzugefügt",
      added_note: "%{name} hat eine Notiz hinzugefügt zu",
      you_added_note: "Sie haben eine Notiz hinzugefügt zu",
      added_note_about_deal: "%{name} hat eine Notiz zum Geschäftsvorgang hinzugefügt",
      you_added_note_about_deal: "Sie haben eine Notiz zum Geschäftsvorgang hinzugefügt",
      added_deal: "%{name} hat den Geschäftsvorgang hinzugefügt",
      you_added_deal: "Sie haben den Geschäftsvorgang hinzugefügt",
      at_company: "bei",
      to: "zu",
      load_more: "Weitere Aktivitäten laden",
    },
    dashboard: {
      deals_chart: "Erwarteter Umsatz aus Geschäftsvorgängen",
      deals_pipeline: "Pipeline der Geschäftsvorgänge",
      latest_activity: "Letzte Aktivität",
      latest_activity_error: "Fehler beim Laden der letzten Aktivität",
      latest_notes: "Meine letzten Notizen",
      latest_notes_added_ago: "hinzugefügt %{timeAgo}",
      stepper: {
        install: "Atomic CRM installieren",
        progress: "%{step}/3 erledigt",
        whats_next: "Was kommt als Nächstes?",
      },
      upcoming_tasks: "Anstehende Aufgaben",
    },
    header: {
      import_data: "Daten importieren",
    },
    image_editor: {
      change: "Ändern",
      drop_hint: "Datei zum Hochladen hierher ziehen oder klicken zum Auswählen.",
      editable_content: "Bearbeitbarer Inhalt",
      title: "Bild hochladen und Größe ändern",
      update_image: "Bild aktualisieren",
    },
    import: {
      action: {
        download_error_report: "Fehlerbericht herunterladen",
        import: "Importieren",
        import_another: "Weitere Datei importieren",
      },
      error: {
        unable: "Datei kann nicht importiert werden.",
      },
      idle: {
        description_1:
          "Sie können Vertrieb, Firmen, Kontakte, Firmen, Notizen und Aufgaben importieren.",
        description_2:
          "Die Daten müssen in einer JSON-Datei vorliegen, die folgendem Beispiel entspricht:",
      },
      status: {
        all_success: "Alle Datensätze wurden erfolgreich importiert.",
        complete: "Import abgeschlossen.",
        failed: "Fehlgeschlagen",
        imported: "Importiert",
        in_progress:
          "Import läuft, bitte verlassen Sie diese Seite nicht.",
        some_failed: "Einige Datensätze wurden nicht importiert.",
        table_caption: "Import-Status",
      },
      title: "Daten importieren",
    },
    settings: {
      about: "Über",
      companies: {
        sectors: "Branchen",
      },
      dark_mode_logo: "Logo (dunkler Modus)",
      deals: {
        categories: "Kategorien",
        currency: "Währung",
        pipeline_help:
          "Wählen Sie aus, welche Phasen als Pipeline-Geschäftsvorgänge zählen sollen.",
        pipeline_statuses: "Pipeline-Status",
        stages: "Phasen",
      },
      light_mode_logo: "Logo (heller Modus)",
      notes: {
        statuses: "Status",
      },
      reset_defaults: "Auf Standard zurücksetzen",
      save_error: "Konfiguration konnte nicht gespeichert werden",
      saved: "Konfiguration erfolgreich gespeichert",
      saving: "Wird gespeichert...",
      tasks: {
        types: "Typen",
      },
      preferences: "Einstellungen",
      title: "Einstellungen",
      app_title: "App-Titel",
      sections: {
        branding: "Branding",
      },
      validation: {
        duplicate: "Doppelt vorhanden bei %{display_name}: %{items}",
        in_use:
          "%{display_name} kann nicht entfernt werden, da noch von Geschäftsvorgängen verwendet: %{items}",
        validating: "Wird geprüft…",
        entities: {
          categories: "Kategorien",
          stages: "Phasen",
        },
      },
    },
    theme: {
      dark: "Dunkel",
      label: "Design",
      light: "Hell",
      system: "System",
    },
    language: "Sprache",
    navigation: {
      label: "CRM-Navigation",
    },
    profile: {
      inbound: {
        description:
          "Sie können E-Mails an die Eingangs-E-Mail-Adresse Ihres Servers senden, z. B. indem Sie diese in das Feld %{field} eintragen. Atomic CRM verarbeitet die E-Mails und fügt Notizen zu den entsprechenden Kontakten hinzu.",
        title: "Eingehende E-Mail",
      },
      mcp: {
        title: "MCP-Server",
        description:
          "Verwenden Sie diese URL, um Ihren KI-Assistenten über das Model Context Protocol (MCP) mit Ihren CRM-Daten zu verbinden.",
      },
      password: {
        change: "Passwort ändern",
      },
      password_reset_sent:
        "Eine E-Mail zum Zurücksetzen des Passworts wurde an Ihre E-Mail-Adresse gesendet",
      record_not_found: "Datensatz nicht gefunden",
      title: "Profil",
      updated: "Ihr Profil wurde aktualisiert",
      update_error: "Ein Fehler ist aufgetreten. Bitte erneut versuchen",
    },
    validation: {
      invalid_url: "Muss eine gültige URL sein",
      invalid_linkedin_url: "URL muss von linkedin.com stammen",
    },
  },
} satisfies CrmMessages;
