import { useState, useEffect } from 'react';
import { Share2, X, Copy, Check, Clock, Globe } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    fileId: string;
    fileName: string;
    session: any;
}

export function ShareModal({ isOpen, onClose, fileId, fileName, session }: ShareModalProps) {
    const [loading, setLoading] = useState(true);
    const [shareLink, setShareLink] = useState<string | null>(null);
    const [expiration, setExpiration] = useState('7'); // days
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (isOpen && fileId) {
            checkExistingLink();
        }
    }, [isOpen, fileId]);

    const checkExistingLink = async () => {
        setLoading(true);
        try {
            // Check for valid existing link
            const { data } = await supabase
                .from('shared_links')
                .select('token')
                .eq('file_id', fileId)
                .gte('expires_at', new Date().toISOString())
                .maybeSingle();

            if (data) {
                setShareLink(`${window.location.origin}/s/${data.token}`);
            } else {
                setShareLink(null);
            }
        } catch (error) {
            console.error('Error checking links:', error);
        } finally {
            setLoading(false);
        }
    };

    const createLink = async () => {
        setLoading(true);
        try {
            // Calculate expiration
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + parseInt(expiration));

            const token = crypto.randomUUID().split('-').slice(0, 3).join(''); // Shorter token

            const { error } = await supabase.from('shared_links').insert({
                file_id: fileId,
                created_by: session.user.id,
                token: token,
                expires_at: expiresAt.toISOString()
            });

            if (error) throw error;
            setShareLink(`${window.location.origin}/s/${token}`);

        } catch (error: any) {
            alert('Link oluşturulamadı: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        if (shareLink) {
            navigator.clipboard.writeText(shareLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="w-full max-w-md bg-[#1e293b] border border-white/10 rounded-2xl shadow-2xl scale-100 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-6 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-500/20 rounded-lg text-purple-400">
                            <Share2 className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-white">Dosyayı Paylaş</h2>
                            <p className="text-sm text-gray-400 truncate max-w-[200px]">{fileName}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {shareLink ? (
                        <div className="space-y-4">
                            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-3">
                                <Globe className="w-5 h-5 text-green-400 mt-0.5" />
                                <div>
                                    <h3 className="text-green-100 font-medium">Paylaşım Linki Hazır</h3>
                                    <p className="text-sm text-green-400/70">Bu linke sahip olan herkes dosyayı indirebilir.</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={shareLink}
                                    readOnly
                                    className="flex-1 bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-300 focus:outline-none"
                                />
                                <button
                                    onClick={copyToClipboard}
                                    className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors"
                                >
                                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    Link Geçerlilik Süresi
                                </label>
                                <div className="grid grid-cols-3 gap-3">
                                    {['1', '7', '30'].map((day) => (
                                        <button
                                            key={day}
                                            onClick={() => setExpiration(day)}
                                            className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all ${expiration === day
                                                ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20'
                                                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                                                }`}
                                        >
                                            {day} Gün
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={createLink}
                                disabled={loading}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-all shadow-lg shadow-blue-900/20"
                            >
                                {loading ? 'Oluşturuluyor...' : 'Link Oluştur'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
