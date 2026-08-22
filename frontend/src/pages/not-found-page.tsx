import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 px-6 py-14 text-center">
          <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
            <Compass className="size-6" aria-hidden />
          </div>
          <div className="space-y-1">
            <p className="font-medium">Page not found</p>
            <p className="text-muted-foreground text-sm">That route does not exist.</p>
          </div>
          <Button asChild>
            <Link to="/wallet">Go to wallet</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
