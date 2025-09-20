import { FC, ReactNode } from 'react';
import { X } from 'lucide-react';

type ModalProps = {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
};

export const Modal: FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;

    return (
        // This is the semi-transparent background overlay
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
            
            {/* This is the actual modal container */}
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                
                {/* Modal Header */}
                <div className="flex justify-between items-center p-4 border-b">
                    <h3 className="text-lg font-semibold">{title}</h3>
                    <button 
                        onClick={onClose} 
                        className="text-slate-500 hover:text-slate-800"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Modal Body/Content */}
                <div className="p-4">
                    {children}
                </div>
            </div>
        </div>
    );
};

