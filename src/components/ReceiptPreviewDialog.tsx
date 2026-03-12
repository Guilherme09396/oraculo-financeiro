import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  url: string | null;
  onClose: () => void;
}

export default function ReceiptPreviewDialog({ url, onClose }: Props) {
  if (!url) return null;
  const isPdf = url.toLowerCase().includes('.pdf');

  return (
    <Dialog open={!!url} onOpenChange={open => !open && onClose()}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh]">
        <DialogHeader><DialogTitle>Comprovante</DialogTitle></DialogHeader>
        <div className="flex items-center justify-center overflow-auto max-h-[70vh]">
          {isPdf ? (
            <iframe src={url} className="w-full h-[65vh] rounded-lg border border-border" />
          ) : (
            <img src={url} alt="Comprovante" className="max-w-full max-h-[65vh] rounded-lg object-contain" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
