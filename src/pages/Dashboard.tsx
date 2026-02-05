import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Folder, Upload, Trash2, LogOut, Search, Plus, Download, Loader2, ChevronRight, Home, FolderPlus, Share2 } from 'lucide-react';
import { FileThumbnail } from '../components/FileThumbnail';
import { CreateFolderModal } from '../components/CreateFolderModal';
import { ShareModal } from '../components/ShareModal';

interface FileItem {
    id: string;
    name: string;
    size: number;
    mime_type: string;
    s3_key: string;
    created_at: string;
    parent_id: string | null;
}

const FOLDER_MIME_TYPE = 'application/x-directory';

export default function Dashboard() {
    const [files, setFiles] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const [session, setSession] = useState<any>(null);
    const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);

    // Share Modal State
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [selectedFileForShare, setSelectedFileForShare] = useState<FileItem | null>(null);

    // Folder State
    const [currentFolder, setCurrentFolder] = useState<FileItem | null>(null);
    const [folderChain, setFolderChain] = useState<FileItem[]>([]);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
        });
    }, []);

    useEffect(() => {
        if (session) {
            fetchFiles(currentFolder?.id || null);
        }
    }, [session, currentFolder]);

    const fetchFiles = async (folderId: string | null) => {
        if (!session) return;
        setLoading(true);
        try {
            let query = supabase
                .from('files')
                .select('*')
                .eq('user_id', session.user.id);

            if (folderId) {
                query = query.eq('parent_id', folderId);
            } else {
                query = query.is('parent_id', null);
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) throw error;

            // Sort: Folders first, then files
            const sorted = (data || []).sort((a, b) => {
                const aIsFolder = a.mime_type === FOLDER_MIME_TYPE;
                const bIsFolder = b.mime_type === FOLDER_MIME_TYPE;
                if (aIsFolder && !bIsFolder) return -1;
                if (!aIsFolder && bIsFolder) return 1;
                return 0;
            });

            setFiles(sorted);
        } catch (error) {
            console.error('Error fetching files:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateFolder = async (name: string) => {
        if (!session) return;

        try {
            const { error } = await supabase.from('files').insert({
                user_id: session.user.id,
                name: name,
                size: 0,
                mime_type: FOLDER_MIME_TYPE,
                s3_key: `folders/${crypto.randomUUID()}`,
                parent_id: currentFolder?.id || null
            });

            if (error) throw error;
            await fetchFiles(currentFolder?.id || null);
        } catch (error: any) {
            throw new Error(error.message);
        }
    };

    const enterFolder = (folder: FileItem) => {
        setFolderChain([...folderChain, folder]);
        setCurrentFolder(folder);
        setSearchQuery(''); // Clear search on navigation
    };

    const navigateToBreadcrumb = (index: number) => {
        if (index === -1) {
            setFolderChain([]);
            setCurrentFolder(null);
        } else {
            const newChain = folderChain.slice(0, index + 1);
            setFolderChain(newChain);
            setCurrentFolder(newChain[newChain.length - 1]);
        }
    };

    const moveFile = async (fileId: string, targetFolderId: string | null) => {
        if (!session) return;
        try {
            const { error } = await supabase
                .from('files')
                .update({ parent_id: targetFolderId })
                .eq('id', fileId);

            if (error) throw error;
            fetchFiles(currentFolder?.id || null);
        } catch (error: any) {
            alert('Dosya taşınamadı: ' + error.message);
        }
    };

    const uploadFile = async (file: File) => {
        if (!session) return;
        setUploading(true);

        try {
            // 1. Get Presigned URL
            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/s3-sign`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'upload',
                    fileName: file.name,
                    fileType: file.type,
                }),
            });

            if (!response.ok) throw new Error('Upload signature failed');
            const { url, key } = await response.json();

            // 2. Upload to S3
            const uploadResponse = await fetch(url, {
                method: 'PUT',
                body: file,
                headers: { 'Content-Type': file.type },
            });

            if (!uploadResponse.ok) throw new Error('S3 Upload failed');

            // 3. Save to DB
            const { error: dbError } = await supabase.from('files').insert({
                user_id: session.user.id,
                name: file.name,
                size: file.size,
                mime_type: file.type,
                s3_key: key,
                parent_id: currentFolder?.id || null
            });

            if (dbError) throw dbError;

            // Refresh list
            fetchFiles(currentFolder?.id || null);

        } catch (error: any) {
            alert('Upload failed: ' + error.message);
        } finally {
            setUploading(false);
        }
    };

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            uploadFile(e.dataTransfer.files[0]);
        }
    }, [session, currentFolder]);

    // File/Folder Move Drag Handlers
    const onFileDragStart = (e: React.DragEvent, fileId: string) => {
        e.dataTransfer.setData("fileId", fileId);
    };

    const onFolderDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.currentTarget.classList.add('bg-blue-500/30');
    };

    const onFolderDragLeave = (e: React.DragEvent) => {
        e.currentTarget.classList.remove('bg-blue-500/30');
    };

    const onFolderDrop = (e: React.DragEvent, targetFolderId: string) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent global drop
        e.currentTarget.classList.remove('bg-blue-500/30');
        const fileId = e.dataTransfer.getData("fileId");
        if (fileId) {
            moveFile(fileId, targetFolderId);
        }
    };

    const handleDelete = async (id: string, key: string, isFolder: boolean) => {
        if (!confirm(isFolder ? 'Bu klasörü ve içindekileri silmek istediğinize emin misiniz?' : 'Bu dosyayı silmek istediğinize emin misiniz?')) return;
        if (!session) return;

        try {
            if (!isFolder) {
                // Delete actual S3 object
                const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/s3-sign`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ action: 'delete', key: key }),
                });

                if (!response.ok) throw new Error('Delete failed');
            }

            const { error } = await supabase.from('files').delete().eq('id', id);
            if (error) throw error;

            setFiles(files.filter(f => f.id !== id));
        } catch (error: any) {
            alert('Silme başarısız: ' + error.message);
        }
    };

    const handleDownload = async (key: string) => {
        if (!session) return;
        try {
            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/s3-sign`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action: 'download', key: key }),
            });

            if (!response.ok) throw new Error('Download failed');
            const { url } = await response.json();
            window.open(url, '_blank');
        } catch (error: any) {
            alert('Download error: ' + error.message);
        }
    }

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Filtered files for display
    const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="flex h-screen bg-[#0f172a] text-white" onDragEnter={handleDrag}>
            <CreateFolderModal
                isOpen={isCreateFolderOpen}
                onClose={() => setIsCreateFolderOpen(false)}
                onCreate={handleCreateFolder}
            />

            {/* Share Modal */}
            {session && selectedFileForShare && (
                <ShareModal
                    isOpen={shareModalOpen}
                    onClose={() => setShareModalOpen(false)}
                    fileId={selectedFileForShare.id}
                    fileName={selectedFileForShare.name}
                    session={session}
                />
            )}

            {/* Sidebar */}
            <div className="w-64 bg-slate-900 border-r border-white/10 p-6 flex flex-col z-20">
                <div className="flex items-center gap-3 mb-10 text-blue-500">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                        <Folder className="w-6 h-6" />
                    </div>
                    <h1 className="text-xl font-bold text-white">CloudDrive</h1>
                </div>

                <div className="space-y-3 mb-8">
                    <button className="flex items-center gap-3 px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium transition-all w-full shadow-lg shadow-blue-900/20 group relative overflow-hidden">
                        <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        <span className="flex-1 text-left">{uploading ? 'Yükleniyor...' : 'Yeni Dosya'}</span>
                        <input
                            type="file"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0])}
                            disabled={uploading}
                        />
                        {uploading && <div className="absolute inset-0 bg-blue-700/50 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 animate-spin" />
                        </div>}
                    </button>

                    <button onClick={() => setIsCreateFolderOpen(true)} className="flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-medium transition-all w-full text-gray-300 hover:text-white">
                        <FolderPlus className="w-5 h-5" />
                        <span className="flex-1 text-left">Yeni Klasör</span>
                    </button>
                </div>

                <nav className="flex-1 space-y-1">
                    <button onClick={() => navigateToBreadcrumb(-1)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${currentFolder === null ? 'bg-white/5 text-blue-400' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                        <Folder className="w-5 h-5" />
                        Dosyalarım
                    </button>
                </nav>

                <div className="mt-auto border-t border-white/10 pt-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="text-sm text-gray-400">Depolama</div>
                        <div className="text-sm text-white">{(files.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(1)} MB</div>
                    </div>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 w-[20%]" />
                    </div>
                    <button
                        onClick={() => supabase.auth.signOut()}
                        className="flex items-center gap-3 px-4 py-3 mt-6 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl w-full transition-all"
                    >
                        <LogOut className="w-5 h-5" />
                        Çıkış Yap
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col relative overflow-hidden">
                {dragActive && (
                    <div
                        className="absolute inset-0 z-50 bg-blue-500/20 backdrop-blur-sm border-4 border-blue-500 border-dashed m-4 rounded-3xl flex items-center justify-center"
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                    >
                        <div className="bg-slate-900 p-8 rounded-2xl flex flex-col items-center animate-bounce">
                            <Upload className="w-16 h-16 text-blue-500 mb-4" />
                            <h3 className="text-2xl font-bold">Dosyayı Buraya Bırakın</h3>
                            <p className="text-gray-400 mt-2">{currentFolder ? `'${currentFolder.name}' klasörüne yükle` : 'Ana dizine yükle'}</p>
                        </div>
                    </div>
                )}

                {/* Header */}
                <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-10">
                    <div className="flex items-center gap-2 overflow-hidden">
                        {/* Breadcrumbs */}
                        <button
                            onClick={() => navigateToBreadcrumb(-1)}
                            className={`p-2 rounded-lg hover:bg-white/5 transition-colors ${!currentFolder ? 'text-white font-medium' : 'text-gray-400'}`}
                        >
                            <Home className="w-5 h-5" />
                        </button>

                        {folderChain.map((folder, index) => (
                            <div key={folder.id} className="flex items-center gap-1 min-w-0">
                                <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
                                <button
                                    onClick={() => navigateToBreadcrumb(index)}
                                    className={`px-2 py-1 rounded-lg hover:bg-white/5 truncate max-w-[150px] transition-colors ${index === folderChain.length - 1 ? 'text-white font-medium' : 'text-gray-400'}`}
                                >
                                    {folder.name}
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="relative w-96 group ml-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-blue-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Dosya ara..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
                        />
                    </div>
                </header>

                {/* File List */}
                <main className="flex-1 overflow-y-auto p-8">
                    {loading ? (
                        <div className="flex items-center justify-center h-full text-gray-500">
                            <Loader2 className="w-8 h-8 animate-spin mr-3 text-blue-500" />
                            Yükleniyor...
                        </div>
                    ) : filteredFiles.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500 border-2 border-dashed border-white/10 rounded-3xl m-4 transition-colors hover:border-white/20 hover:bg-white/5">
                            <div className="p-4 bg-white/5 rounded-full mb-4">
                                <FolderPlus className="w-8 h-8 text-gray-400" />
                            </div>
                            <p className="text-lg font-medium text-gray-300">Klasör boş</p>
                            <p className="text-sm mb-6">Dosya yükleyin veya yeni klasör oluşturun</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                            {filteredFiles.map((file) => {
                                const isFolder = file.mime_type === FOLDER_MIME_TYPE;
                                return (
                                    <div
                                        key={file.id}
                                        draggable={!isFolder}
                                        onDragStart={(e) => !isFolder && onFileDragStart(e, file.id)}
                                        onDragOver={(e) => isFolder && onFolderDragOver(e)}
                                        onDragLeave={(e) => isFolder && onFolderDragLeave(e)}
                                        onDrop={(e) => isFolder && onFolderDrop(e, file.id)}
                                        onClick={() => isFolder ? enterFolder(file) : null}
                                        className={`group rounded-2xl p-3 transition-all flex flex-col hover:-translate-y-1 hover:shadow-xl hover:shadow-black/50 relative overflow-hidden ${isFolder
                                            ? 'bg-blue-600/10 border border-blue-500/20 hover:bg-blue-600/20 hover:border-blue-500/40 cursor-pointer'
                                            : 'bg-white/5 border border-white/5 hover:border-blue-500/30 hover:bg-white/[0.07] cursor-default'
                                            }`}
                                    >

                                        {/* Actions Overlay */}
                                        <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                            {!isFolder && (
                                                <>
                                                    <button onClick={(e) => { e.stopPropagation(); setSelectedFileForShare(file); setShareModalOpen(true) }} className="p-1.5 bg-black/50 hover:bg-purple-600 rounded-lg backdrop-blur-sm text-white transition-colors" title="Paylaş">
                                                        <Share2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); handleDownload(file.s3_key) }} className="p-1.5 bg-black/50 hover:bg-blue-600 rounded-lg backdrop-blur-sm text-white transition-colors" title="İndir">
                                                        <Download className="w-3.5 h-3.5" />
                                                    </button>
                                                </>
                                            )}
                                            <button onClick={(e) => { e.stopPropagation(); handleDelete(file.id, file.s3_key, isFolder) }} className="p-1.5 bg-black/50 hover:bg-red-600 rounded-lg backdrop-blur-sm text-white transition-colors" title="Sil">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>

                                        <div className={`aspect-square rounded-xl mb-3 overflow-hidden relative flex items-center justify-center ${isFolder ? 'bg-blue-500/20' : 'bg-black/20'}`}>
                                            {isFolder ? (
                                                <div className="relative">
                                                    <Folder className="w-20 h-20 text-blue-400 drop-shadow-lg" fill="currentColor" />
                                                    <div className="absolute inset-0 bg-blue-400/20 blur-xl rounded-full" />
                                                </div>
                                            ) : (
                                                session && <FileThumbnail file={file} session={session} />
                                            )}
                                        </div>

                                        <div>
                                            <h3 className={`font-medium truncate text-sm mb-1 ${isFolder ? 'text-blue-100' : 'text-white'}`} title={file.name}>{file.name}</h3>
                                            <div className="flex items-center justify-between text-xs text-gray-500">
                                                <span>{formatSize(file.size)}</span>
                                                <span>{new Date(file.created_at).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
