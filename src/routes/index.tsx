import { createFileRoute } from "@tanstack/react-router";
import Dashboard from "@/components/dashboard/Dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel de Gestão de Projetos" },
      {
        name: "description",
        content:
          "Painel executivo de gestão de projetos: KPIs, prazos, saving, Pareto e alertas em tempo real.",
      },
      { property: "og:title", content: "Painel de Gestão de Projetos" },
      {
        property: "og:description",
        content:
          "Painel executivo de gestão de projetos: KPIs, prazos, saving, Pareto e alertas em tempo real.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return <Dashboard />;
}
