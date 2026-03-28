import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CostDataContext } from "./context/CostDataContext";
import { useCostData } from "./hooks/useCostData";
import { useWebSocket } from "./hooks/useWebSocket";
import { SidebarLayout } from "./components/SidebarLayout";

import { DashboardPage } from "./pages/DashboardPage";
import { ResourcesPage } from "./pages/ResourcesPage";
import { AnomaliesPage } from "./pages/AnomaliesPage";
import { ActionsPage } from "./pages/ActionsPage";
import { CostAnalyticsPage } from "./pages/CostAnalyticsPage";
import { RecommendationsPage } from "./pages/RecommendationsPage";
import { BudgetsPage } from "./pages/BudgetsPage";
import { CompliancePage } from "./pages/CompliancePage";
import { SimulatorPage } from "./pages/SimulatorPage";

function AppProvider() {
  const data = useCostData(30000);
  const ws = useWebSocket();

  return (
    <CostDataContext.Provider value={{ data, ws }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<SidebarLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="resources" element={<ResourcesPage />} />
            <Route path="anomalies" element={<AnomaliesPage />} />
            <Route path="actions" element={<ActionsPage />} />
            <Route path="costs" element={<CostAnalyticsPage />} />
            <Route path="recommendations" element={<RecommendationsPage />} />
            <Route path="budgets" element={<BudgetsPage />} />
            <Route path="compliance" element={<CompliancePage />} />
            <Route path="simulator" element={<SimulatorPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </CostDataContext.Provider>
  );
}

export default AppProvider;
