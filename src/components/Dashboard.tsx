import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Folder, File, Upload, Trash2, LogOut, Search, Plus, MoreVertical, Download } from 'lucide-react';

interface FileItem {
  id: string;
  name: string;
  size: number;
  mime_type: string;
  s3_key: string;
  created_at: string;
}

export default function Dashboard() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFiles(data || []);
    } catch (error) {
      console.error('Error fetching files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      // 1. Get Presigned URL from Edge Function
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

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload signature failed');
      }

      const { url, key } = await response.json();

      // 2. Upload to S3 using Presigned URL
      const uploadResponse = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) throw new Error('S3 Upload failed');

      // 3. Save metadata to Supabase
      const { error: dbError } = await supabase.from('files').insert({
        user_id: session.user.id,
        name: file.name,
        size: file.size,
        mime_type: file.type,
        s3_key: key,
      });

      if (dbError) throw dbError;

      fetchFiles();
    } catch (error: any) {
      console.error('Upload error:', error);
      alert('Upload failed: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, key: string) => {
    if (!confirm('Bu dosyayı silmek istediğinize emin misiniz?')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      // 1. Delete from S3 via Edge Function
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/s3-sign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'delete',
          key: key,
        }),
      });
      
      if (!response.ok) {
         const errorData = await response.json();
         throw new Error(errorData.error || 'Delete failed');
      }

      // 2. Delete from Supabase (RLS policy will strictly enforce this too, but we do it manually to be sure)
      const { error } = await supabase.from('files').delete().eq('id', id);
      if (error) throw error;

      setFiles(files.filter(f => f.id !== id));
    } catch (error: any) {
      console.error('Delete error:', error);
      alert('Delete failed: ' + error.message);
    }
  };

  const handleDownload = async (key: string) => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('No session');

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/s3-sign`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'download',
                key: key,
            }),
        });

        if (!response.ok) throw new Error('Download link generation failed');
        
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
    <div className="flex h-screen bg-[#0f172a] text-white">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 border-r border-white/10 p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-10 text-blue-500">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <Folder className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-white">CloudDrive</h1>
        </div>

        <button className="flex items-center gap-3 px-4 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium transition-all mb-8 shadow-lg shadow-blue-900/20 group">
            <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span className="flex-1 text-left">Yeni Dosya</span>
            <input type="file" className="absolute opacity-0 w-full left-0 cursor-pointer" onChange={handleFileUpload} disabled={uploading} />
            {uploading && <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full"></div>}
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
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-20 border-b border-white/5 flex items-center justify-between px-8">
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
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mr-3"></div>
                    Yükleniyor...
                </div>
            ) : files.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500 border-2 border-dashed border-white/10 rounded-3xl m-4">
                    <div className="p-4 bg-white/5 rounded-full mb-4">
                        <Upload className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-lg font-medium text-gray-300">Henüz dosya yüklenmedi</p>
                    <p className="text-sm">Yüklemek için "Yeni Dosya" butonunu kullanın</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())).map((file) => (
                        <div key={file.id} className="group bg-white/5 border border-white/5 hover:border-blue-500/30 rounded-2xl p-4 transition-all hover:bg-white/[0.07] flex flex-col">
                            <div className="flex items-start justify-between mb-4">
                                <div className={`p-3 rounded-xl ${file.mime_type.includes('image') ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                    <File className="w-6 h-6" />
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleDownload(file.s3_key)} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white" title="İndir">
                                        <Download className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(file.id, file.s3_key)} className="p-2 hover:bg-red-500/10 rounded-lg text-gray-400 hover:text-red-400" title="Sil">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="mt-auto">
                                <h3 className="font-medium text-white truncate mb-1" title={file.name}>{file.name}</h3>
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
