import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Download, File as FileIcon, Loader2, AlertCircle } from 'lucide-react';

export default function PublicDownload() {
    const { token } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [fileData, setFileData] = useState<any>(null);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

    useEffect(() => {
        if (token) fetchSharedFile();
    }, [token]);

    const fetchSharedFile = async () => {
        try {
            // 1. Validate Token & Get File ID
            const { data: linkData, error: linkError } = await supabase
                .from('shared_links')
                .select('file_id, expires_at')
                .eq('token', token)
                .single();

            if (linkError || !linkData) throw new Error('Link geçersiz veya süresi dolmuş.');

            if (new Date(linkData.expires_at) < new Date()) {
                throw new Error('Bu linkin süresi dolmuş.');
            }

            // 2. Fetch File Metadata (Publicly accessible? No, RLS blocks it.)
            // We need a secure way. Since we are client-side "anon", we can't select from 'files'.
            // Solution: We'll use an Edge Function to get the file info AND signed URL securely.
            // OR simpler for this demo: We temporarily allow public read on 'files' IF they have a valid token? No rls is row-based.

            // let's use the edge function `s3-sign` with a new action 'public_download'

            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/s3-sign`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // No Auth header needed if function handles anon, but usually we need valid anon key
                    'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    action: 'public_download',
                    token: token
                }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Dosya bulunamadı');
            }

            const data = await response.json();
            setFileData(data.file);
            setDownloadUrl(data.url);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        if (downloadUrl) {
            window.location.href = downloadUrl;
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-white">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                        <AlertCircle className="w-8 h-8" />
                    </div>
                    <h1 className="text-xl font-bold text-white mb-2">Erişim Hatası</h1>
                    <p className="text-red-300">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_120%,rgba(59,130,246,0.1),rgba(0,0,0,0))]" />

            <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl relative z-10">
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-blue-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-500">
                        <FileIcon className="w-10 h-10" />
                    </div>
                    <h2 className="text-sm text-blue-400 font-medium tracking-wide uppercase mb-2">Dosya Sizinle Paylaşıldı</h2>
                    <h1 className="text-2xl font-bold text-white break-words">{fileData?.name}</h1>
                    <p className="text-gray-400 mt-2">{(fileData?.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>

                <button
                    onClick={handleDownload}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-900/20 flex items-center justify-center gap-3 group"
                >
                    <Download className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
                    Dosyayı İndir
                </button>

                <div className="mt-8 text-center">
                    <p className="text-xs text-gray-500">
                        Güvenli dosya paylaşımı • CloudDrive
                    </p>
                </div>
            </div>
        </div>
    );
}
