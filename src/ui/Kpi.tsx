import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function Kpi({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{note}</CardContent>
    </Card>
  );
}
