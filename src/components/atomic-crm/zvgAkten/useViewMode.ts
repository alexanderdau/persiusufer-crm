import { useStore } from "ra-core";

export type ViewMode = "list" | "map";

/**
 * View-Umschalter (Liste/Karte) für die ZvgAkte-Liste.
 *
 * Nutzt den react-admin-Store statt lokalem useState, damit der Wert zwischen
 * ViewToggle und ViewSwitchedContent GETEILT und REAKTIV ist: ein Klick im
 * Toggle aktualisiert sofort den Inhalt (vorher landete jeder useViewMode-Aufruf
 * in einer eigenen useState-Instanz → Umschalten wirkte erst nach Reload).
 * Der Store persistiert den Wert zugleich (bisheriges localStorage-Verhalten).
 */
export const useViewMode = (): [ViewMode, (v: ViewMode) => void] =>
  useStore<ViewMode>("zvgakte_view", "list");
