import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Folder, File, Upload, Trash2, LogOut, Search, Plus, MoreVertical, Download, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface FileItem {
  id: string;
  name: string;
  size: number;
  mime_type: string;
  s3_key: string;
  created_at: string;
}

// Sub-component for rendering thumbnails
const FileThumbnail = ({ file, session }: { file: FileItem, session: any }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only fetch for images
    if (!file.mime_type.startsWith('image/')) return;

    let mounted = true;
    const fetchPreview = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/s3-sign`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'download', // We use download link as preview
            key: file.s3_key,
          }),
        });

        if (response.ok) {
          const { url } = await response.json();
          if (mounted) setImageUrl(url);
        }
      } catch (e) {
        console.error('Preview error', e);
      }
    };

    // Intersection Observer or Lazy loading could be better, but this is simple for now
    fetchPreview();

    return () => { mounted = false; };
  }, [file.s3_key, file.mime_type, session.access_token]);

  if (imageUrl) {
    return <img src={imageUrl} alt={file.name} className="w-full h-full object-cover rounded-xl" />;
  }

  return (
    <div className={`w-full h-full flex items-center justify-center p-3 rounded-xl ${file.mime_type.includes('image') ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
      {file.mime_type.includes('image') ? <ImageIcon className="w-8 h-8" /> : <File className="w-8 h-8" />}
    </div>
  );
};

export default function Dashboard() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchFiles(session.user.id);
    });
  }, []);

  const fetchFiles = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFiles(data || []);
    } catch (error) {
      console.error('Error fetching files:', error);
    } finally {
      setLoading(false);
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
      });

      if (dbError) throw dbError;

      // Refresh list
      fetchFiles(session.user.id);

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
  }, [session]);

  const handleDelete = async (id: string, key: string) => {
    if (!confirm('Bu dosyayı silmek istediğinize emin misiniz?')) return;
    if (!session) return;

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/s3-sign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'delete', key: key }),
      });

      if (!response.ok) throw new Error('Delete failed');

      const { error } = await supabase.from('files').delete().eq('id', id);
      if (error) throw error;

      setFiles(files.filter(f => f.id !== id));
    } catch (error: any) {
      alert('Delete failed: ' + error.message);
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

  return (
    <div className="flex h-screen bg-[#0f172a] text-white" onDragEnter={handleDrag}>
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 border-r border-white/10 p-6 flex flex-col z-20">
        <div className="flex items-center gap-3 mb-10 text-blue-500">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Folder className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-white">CloudDrive</h1>
        </div>

        <button className="flex items-center gap-3 px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium transition-all mb-8 shadow-lg shadow-blue-900/20 group relative overflow-hidden">
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

        <nav className="flex-1 space-y-1">
          <a href="#" className="flex items-center gap-3 px-4 py-3 bg-white/5 text-blue-400 rounded-xl font-medium">
            <Folder className="w-5 h-5" />
            Dosyalarım
          </a>
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
            </div>
          </div>
        )}

        {/* Header */}
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-8 bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-10">
          <h2 className="text-xl font-semibold">Dosyalarım</h2>
          <div className="relative w-96 group">
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
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500 border-2 border-dashed border-white/10 rounded-3xl m-4 transition-colors hover:border-white/20 hover:bg-white/5">
              <div className="p-4 bg-white/5 rounded-full mb-4">
                <Upload className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-lg font-medium text-gray-300">Henüz dosya yüklenmedi</p>
              <p className="text-sm mb-6">Yüklemek için "Yeni Dosya" butonunu kullanın veya sürükleyip bırakın</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())).map((file) => (
                <div key={file.id} className="group bg-white/5 border border-white/5 hover:border-blue-500/30 rounded-2xl p-3 transition-all hover:bg-white/[0.07] flex flex-col hover:-translate-y-1 hover:shadow-xl hover:shadow-black/50 relative overflow-hidden">

                  {/* Actions Overlay */}
                  <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button onClick={() => handleDownload(file.s3_key)} className="p-1.5 bg-black/50 hover:bg-blue-600 rounded-lg backdrop-blur-sm text-white transition-colors" title="İndir">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(file.id, file.s3_key)} className="p-1.5 bg-black/50 hover:bg-red-600 rounded-lg backdrop-blur-sm text-white transition-colors" title="Sil">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="aspect-square rounded-xl bg-black/20 mb-3 overflow-hidden relative">
                    {session && <FileThumbnail file={file} session={session} />}
                  </div>

                  <div>
                    <h3 className="font-medium text-white truncate text-sm mb-1" title={file.name}>{file.name}</h3>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{formatSize(file.size)}</span>
                      <span>{new Date(file.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
