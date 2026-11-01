'use client';

import { useCallback, useState } from 'react';
import { useT } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Ask = { title: string; text?: string; confirm: string; danger?: boolean };

// "Are you sure?" as a dialog: const [confirm, dialog] = useConfirm();
// if (await confirm({...})) ...; render {dialog} once in the page.
export function useConfirm() {
  const t = useT();
  const [ask, setAsk] = useState<(Ask & { resolve: (ok: boolean) => void }) | null>(null);

  const confirm = useCallback((a: Ask) => new Promise<boolean>((resolve) => setAsk({ ...a, resolve })), []);
  const close = (ok: boolean) => {
    ask?.resolve(ok);
    setAsk(null);
  };

  const dialog = (
    <Dialog open={!!ask} onOpenChange={(open) => !open && close(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{ask?.title}</DialogTitle>
          {ask?.text && <DialogDescription>{ask.text}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            {t('Cancel')}
          </Button>
          <Button variant={ask?.danger ? 'destructive' : 'default'} onClick={() => close(true)}>
            {ask?.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return [confirm, dialog] as const;
}
