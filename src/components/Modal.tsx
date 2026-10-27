import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FC, ReactNode } from 'react';
import { X } from 'lucide-react';

type ModalProps = {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
};

export const Modal: FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="w-full max-w-md overflow-hidden rounded-lg border-0 bg-white p-0 shadow-xl" showCloseButton={false}>
                <DialogHeader className="flex-row items-center justify-between p-4">
                    <DialogTitle>{title}</DialogTitle>
                    <Button variant="ghost" size="icon" aria-label="Close dialog" onClick={onClose}>
                        <X size={20} />
                    </Button>
                </DialogHeader>
                <DialogBody className="p-4">{children}</DialogBody>
            </DialogContent>
        </Dialog>
    );
};
