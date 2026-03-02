import { Card, CardContent } from "@/components/ui";

interface StatsCardsProps {
  stats: {
    total: number;
    new: number;
    contacted: number;
    won: number;
  };
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = [
    {
      label: "Total leads",
      value: stats.total,
      color: "text-[var(--color-primary)]",
      bgColor: "bg-[var(--color-bg)]",
    },
    {
      label: "Nuevos",
      value: stats.new,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      label: "Contactados",
      value: stats.contacted,
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
    },
    {
      label: "Ganados",
      value: stats.won,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label} variant="bordered">
          <CardContent className="p-6">
            <p className="text-sm text-[var(--color-text-muted)] mb-1">
              {card.label}
            </p>
            <p className={`text-3xl font-semibold ${card.color}`}>
              {card.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
