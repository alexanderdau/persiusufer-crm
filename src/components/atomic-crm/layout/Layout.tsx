import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Notification } from "@/components/admin/notification";
import { Error } from "@/components/admin/error";
import { Skeleton } from "@/components/ui/skeleton";

import { useConfigurationLoader } from "../root/useConfigurationLoader";
import Header from "./Header";
import { AnthropicCreditBanner } from "./AnthropicCreditBanner";

export const Layout = ({ children }: { children: ReactNode }) => {
  useConfigurationLoader();
  return (
    <>
      <Header />
      <AnthropicCreditBanner />
      <main className="w-full pt-4 px-3" id="main-content">
        <ErrorBoundary FallbackComponent={Error}>
          <Suspense fallback={<Skeleton className="h-12 w-12 rounded-full" />}>
            {children}
          </Suspense>
        </ErrorBoundary>
      </main>
      <Notification />
    </>
  );
};
