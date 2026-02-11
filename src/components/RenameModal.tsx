import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';

interface RenameModalProps {
    isOpen: boolean;
    onClose: () => void;
    onRename: (newName: string) => Promise<void>;
    currentName: string;
    type: 'file' | 'folder';
}

export function RenameModal({ isOpen, onClose, onRename, currentName, type }: RenameModalProps) {
    const [newName, setNewName] = useState(currentName);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setNewName(currentName);
        }
    }, [isOpen, currentName]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim() || newName === currentName) return;

        setLoading(true);
        try {
            await onRename(newName);
            onClose();
        } catch (error) {
            console.error('Rename error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div
                className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h2 className="text-lg font-semibold text-white">Yeniden Adlandır</h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-400 mb-2">
                            {type === 'folder' ? 'Klasör Adı' : 'Dosya Adı'}
                        </label>
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
                            placeholder="Yeni isim girin..."
                            autoFocus
                        />
                    </div>

                    <div className="flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors font-medium"
                        >
                            İptal
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !newName.trim() || newName === currentName}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            Kaydet
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
