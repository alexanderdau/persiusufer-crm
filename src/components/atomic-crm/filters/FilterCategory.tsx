import { Translate, useStore } from "ra-core";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

export const FilterCategory = ({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children?: ReactNode;
}) => {
  // Pro Gruppe gemerkter Auf-/Zuklapp-Zustand (default: aufgeklappt).
  const [collapsed, setCollapsed] = useStore<boolean>(
    `filter_collapsed.${label}`,
    false,
  );

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
        className="flex flex-row items-center gap-2 font-bold text-sm w-full text-left hover:text-foreground/80 transition-colors"
      >
        {icon}
        <span className="flex-1">
          <Translate i18nKey={label} />
        </span>
        <ChevronDown
          className={`size-4 shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`}
        />
      </button>
      {!collapsed ? (
        <div className="flex md:flex-col flex-wrap items-start pl-4">
          {children}
        </div>
      ) : null}
    </div>
  );
};
