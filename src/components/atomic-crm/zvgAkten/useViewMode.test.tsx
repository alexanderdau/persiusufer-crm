import { beforeEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { CoreAdminContext, testDataProvider } from "ra-core";
import { useViewMode } from "./useViewMode";

const Consumer = ({ id }: { id: string }) => {
  const [view, setView] = useViewMode();
  return (
    <div>
      <span>{`${id}:${view}`}</span>
      <button aria-label={`set-map-${id}`} onClick={() => setView("map")}>
        map {id}
      </button>
    </div>
  );
};

describe("useViewMode", () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("teilt den View-State reaktiv zwischen mehreren Consumern (Toggle wirkt ohne Reload)", async () => {
    const screen = await render(
      <CoreAdminContext dataProvider={testDataProvider()}>
        <Consumer id="toggle" />
        <Consumer id="content" />
      </CoreAdminContext>,
    );

    await expect.element(screen.getByText("toggle:list")).toBeInTheDocument();
    await expect.element(screen.getByText("content:list")).toBeInTheDocument();

    // Klick im "toggle"-Consumer …
    await screen.getByRole("button", { name: "set-map-toggle" }).click();

    // … muss SOFORT auch beim "content"-Consumer ankommen (kein Reload/Remount).
    await expect.element(screen.getByText("content:map")).toBeInTheDocument();
  });
});
