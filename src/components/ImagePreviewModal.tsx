import { useState, useEffect } from 'react';
import { X, Download, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

interface FileItem {
    id: string;
    name: string;
    size: number;
    mime_type: string;
    s3_key: string;
}

interface ImagePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    file: FileItem;
    session: any;
    onNext?: () => void;
    onPrev?: () => void;
    hasNext?: boolean;
    hasPrev?: boolean;
}

export function ImagePreviewModal({ isOpen, onClose, file, session, onNext, onPrev, hasNext, hasPrev }: ImagePreviewModalProps) {
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && file) {
            fetchPreview();
        }
    }, [isOpen, file]);

    const fetchPreview = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/s3-sign`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'download',
                    key: file.s3_key,
                    // No fileName means we want inline display (default for images)
                }),
            });

            if (!response.ok) throw new Error('Preview failed');
            const { url } = await response.json();
            setImageUrl(url);
        } catch (error: any) {
            console.error(error);
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/s3-sign`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'download',
                    key: file.s3_key,
                    fileName: file.name
                }),
            });
            const { url } = await response.json();
            const link = document.createElement('a');
            link.href = url;
            link.download = file.name;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            alert('İndirme başarısız');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md transition-all">
            {/* Header controls */}
            <div className="absolute top-0 w-full p-4 flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent z-10">
                <div className="text-white truncate max-w-lg font-medium drop-shadow-md">
                    {file.name}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleDownload}
                        className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                        title="İndir"
                    >
                        <Download className="w-5 h-5" />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* Navigation Buttons */}
            {hasPrev && (
                <button
                    onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all z-10"
                >
                    <ChevronLeft className="w-8 h-8" />
                </button>
            )}

            {hasNext && (
                <button
                    onClick={(e) => { e.stopPropagation(); onNext?.(); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-all z-10"
                >
                    <ChevronRight className="w-8 h-8" />
                </button>
            )}


            {/* Content */}
            <div className="w-full h-full flex items-center justify-center p-4 md:p-12" onClick={onClose}>
                <div onClick={(e) => e.stopPropagation()} className="relative max-w-full max-h-full">
                    {loading ? (
                        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                    ) : error ? (
                        <div className="text-red-400">Görüntülenemiyor: {error}</div>
                    ) : (
                        <img
                            src={imageUrl || ''}
                            alt={file.name}
                            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
