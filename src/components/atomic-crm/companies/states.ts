export const states = [
  { id: "BW", name: "Baden-Württemberg" },
  { id: "BY", name: "Bayern" },
  { id: "BE", name: "Berlin" },
  { id: "BB", name: "Brandenburg" },
  { id: "HB", name: "Bremen" },
  { id: "HH", name: "Hamburg" },
  { id: "HE", name: "Hessen" },
  { id: "MV", name: "Mecklenburg-Vorpommern" },
  { id: "NI", name: "Niedersachsen" },
  { id: "NW", name: "Nordrhein-Westfalen" },
  { id: "RP", name: "Rheinland-Pfalz" },
  { id: "SL", name: "Saarland" },
  { id: "SN", name: "Sachsen" },
  { id: "ST", name: "Sachsen-Anhalt" },
  { id: "SH", name: "Schleswig-Holstein" },
  { id: "TH", name: "Thüringen" },
];

export const getStateName = (abbr?: string | null): string =>
  (abbr && states.find((s) => s.id === abbr)?.name) || abbr || "";
