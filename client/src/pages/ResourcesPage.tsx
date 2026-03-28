import { useState } from "react";
import { useGlobalData } from "../context/CostDataContext";
import { Panel } from "../components/Panel";
import { ResourceTable } from "../components/ResourceTable";
import { ResourceDrawer } from "../components/ResourceDrawer";
import type { Resource } from "../types";

export function ResourcesPage() {
  const { data } = useGlobalData();
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);

  return (
    <div className="space-y-6 animate-fade-in fade-in-up flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Resource Inventory</h1>
          <p className="text-slate-400 mt-1">Found {data.resources?.length || 0} active GCP resources.</p>
        </div>
      </div>

      <Panel title="All Resources" subtitle="Click on any resource to view metadata and associated anomalies" className="flex-1 overflow-hidden flex flex-col">
        <ResourceTable resources={data.resources} onSelectResource={setSelectedResource} />
      </Panel>

      {selectedResource && (
        <ResourceDrawer
          resource={selectedResource}
          anomalies={data.anomalies}
          actions={data.actions}
          onClose={() => setSelectedResource(null)}
        />
      )}
    </div>
  );
}
