'use client';

import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { useBackendHealth } from '@/hooks/use-backend-health';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function BackendStatus() {
  const { status, message, data, recheck } = useBackendHealth();
  const isChecking = status === 'loading' || status === 'idle';

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Backend Status</CardTitle>
        <CardDescription>Live result of GET /api/health</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          {isChecking && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          {status === 'online' && <CheckCircle2 className="size-4 text-emerald-600" />}
          {status === 'offline' && <AlertCircle className="size-4 text-destructive" />}
          <span className={status === 'offline' ? 'text-destructive' : undefined}>
            {isChecking ? 'Checking...' : message}
          </span>
        </div>

        {data && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Environment</dt>
            <dd>
              <Badge variant="secondary">{data.environment}</Badge>
            </dd>

            <dt className="text-muted-foreground">Database</dt>
            <dd>
              <Badge variant={data.database === 'connected' ? 'secondary' : 'destructive'}>
                {data.database}
              </Badge>
            </dd>

            <dt className="text-muted-foreground">Uptime</dt>
            <dd>{data.uptimeSeconds}s</dd>
          </dl>
        )}

        <Button variant="outline" size="sm" onClick={() => void recheck()} disabled={isChecking}>
          <RefreshCw className="size-4" />
          Check again
        </Button>
      </CardContent>
    </Card>
  );
}
